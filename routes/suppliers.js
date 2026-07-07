const express = require('express');
const { getDb, get, run, query } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/* Polyfill fetch for older Node */
const _fetch = typeof fetch !== 'undefined' ? fetch : (...args) => import('node-fetch').then(m => m.default(...args));

async function tryFetch(url, timeout = 10000) {
  try {
    const resp = await _fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'fr,en;q=0.5' },
      signal: AbortSignal.timeout(timeout)
    });
    return resp;
  } catch (e) {
    return null;
  }
}

async function scrapePageMeta(url) {
  try {
    const resp = await tryFetch(url);
    if (!resp) return null;
    const html = await resp.text();

    const patterns = [
      { key: 'title', regex: /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i },
      { key: 'title', regex: /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']*)["']/i },
      { key: 'image', regex: /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i },
      { key: 'image', regex: /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']*)["']/i },
      { key: 'price', regex: /<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([^"']*)["']/i },
      { key: 'price', regex: /<span[^>]*class=["'][^"']*price[^"']*["'][^>]*>([^<]+)/i },
      { key: 'stock', regex: /<span[^>]*class=["'][^"']*stock[^"']*["'][^>]*>([^<]+)/i },
    ];

    const result = { title: '', image: '', price: 0, stock_info: '' };

    for (const p of patterns) {
      const m = html.match(p.regex);
      if (m && m[1]) {
        const val = m[1].trim();
        if (p.key === 'title' && !result.title) result.title = val.replace(/[-–|].*$/, '').trim();
        if (p.key === 'image' && !result.image) result.image = val;
        if (p.key === 'price' && !result.price) {
          const n = parseFloat(val.replace(/[^0-9.,]/g, '').replace(',', '.'));
          if (!isNaN(n)) result.price = n;
        }
        if (p.key === 'stock' && !result.stock_info) result.stock_info = val;
      }
    }

    /* Fallback: <title> tag */
    if (!result.title) {
      const t = html.match(/<title>([^<]*)<\/title>/i);
      if (t) result.title = t[1].replace(/[-–|].*$/, '').trim();
    }

    return result;
  } catch (e) {
    return null;
  }
}

/* Scrape product info from URL (LoveGoBuy, 1688, Taobao, Weidian) */
router.post('/scrape', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL requise' });

    /* 1) Try the URL directly first (most reliable) */
    const directMeta = await scrapePageMeta(url);
    if (directMeta && directMeta.title) {
      return res.json(directMeta);
    }

    /* 2) Try LoveGoBuy API */
    try {
      const u = new URL(url);
      const goodsId = u.searchParams.get('id') || u.searchParams.get('goodsId') || u.searchParams.get('offerId') || u.searchParams.get('itemID')
        || (u.pathname.match(/\/offer\/(\d+)\.html/)?.[1]);
      const shopType = u.searchParams.get('shop_type') || 'taobao';
      if (goodsId) {
        const apiUrl = `https://www.lovegobuy.com/index.php?s=/api/goods/detail&goodsId=${goodsId}&shop_type=${shopType}`;
        const resp = await tryFetch(apiUrl);
        if (resp) {
          const data = await resp.json();
          if (data?.status === 200 && data?.data?.detail) {
            const d = data.data.detail;
            const title = (d.goods_name || '').trim();
            const image = d.goods_image || (d.goods_images?.[0]?.preview_url) || '';
            const stock = d.stock_total != null ? (parseInt(d.stock_total) > 0 ? 'En stock' : 'Rupture') : '';
            let priceEur = 0;
            if (d.goods_price_min_show) {
              const usd = parseFloat(d.goods_price_min_show.replace(/[^0-9.]/g, ''));
              if (usd > 0) {
                try {
                  const fx = await tryFetch('https://api.frankfurter.app/latest?from=USD&to=EUR', 5000);
                  if (fx) {
                    const fxData = await fx.json();
                    priceEur = Math.round(usd * (fxData.rates?.EUR || 0.92) * 100) / 100;
                  } else { priceEur = Math.round(usd * 0.92 * 100) / 100; }
                } catch (e) { priceEur = Math.round(usd * 0.92 * 100) / 100; }
              }
            }
            return res.json({ title, price: priceEur, image, stock_info: stock });
          }
        }
      }
    } catch (e) {}

    /* 3) Construct platform URLs and try scraping those */
    try {
      const u = new URL(url);
      let platformUrls = [];
      if (u.hostname.includes('1688.com')) {
        const id = u.pathname.match(/\/offer\/(\d+)\.html/)?.[1] || u.searchParams.get('offerId');
        if (id) platformUrls.push(`https://detail.1688.com/offer/${id}.html`);
      }
      if (u.hostname.includes('taobao.com') || u.hostname.includes('tmall.com')) {
        const id = u.searchParams.get('id');
        if (id) platformUrls.push(`https://item.taobao.com/item.htm?id=${id}`);
      }
      if (u.hostname.includes('weidian.com')) {
        const id = u.searchParams.get('itemID');
        if (id) platformUrls.push(`https://weidian.com/item.html?itemID=${id}`);
      }
      for (const pu of platformUrls) {
        const meta = await scrapePageMeta(pu);
        if (meta && meta.title) return res.json(meta);
      }
    } catch (e) {}

    return res.json({ title: '', price: 0, image: '', stock_info: '' });
  } catch (err) {
    console.error('[SCRAPE ERROR]', err?.message);
    res.json({ title: '', price: 0, image: '', stock_info: '' });
  }
});

/* GET /api/suppliers — list visible suppliers (clients see visible only, admin sees all) */
router.get('/', async (req, res) => {
  try {
    await getDb();
    const user = await get('SELECT is_admin FROM users WHERE id = ?', [req.userId]);
    const isAdmin = user && user.is_admin;
    const sql = isAdmin
      ? 'SELECT s.*, u.email as added_by_email FROM suppliers s LEFT JOIN users u ON s.added_by = u.id ORDER BY s.created_at DESC'
      : 'SELECT s.*, u.email as added_by_email FROM suppliers s LEFT JOIN users u ON s.added_by = u.id WHERE s.visible = 1 ORDER BY s.created_at DESC';
    const suppliers = await query(sql);
    res.json(suppliers);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }) }
});

/* POST /api/suppliers — add supplier (admin only) */
router.post('/', async (req, res) => {
  try {
    await getDb();
    const user = await get('SELECT is_admin FROM users WHERE id = ?', [req.userId]);
    if (!user || !user.is_admin) return res.status(403).json({ error: 'Admin uniquement' });

    const { name, url, price, image_url, stock_info, category, visible } = req.body;
    if (!name) return res.status(400).json({ error: 'Nom requis' });

    const id = require('crypto').randomUUID();
    await run(
      'INSERT INTO suppliers (id, added_by, name, url, price, image_url, stock_info, category, visible) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, req.userId, name, url || '', price || 0, image_url || '', stock_info || '', category || 'general', visible !== undefined ? (visible ? 1 : 0) : 1]
    );
    res.json({ message: 'Fournisseur ajouté', id });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }) }
});

/* PUT /api/suppliers/:id */
router.put('/:id', async (req, res) => {
  try {
    await getDb();
    const user = await get('SELECT is_admin FROM users WHERE id = ?', [req.userId]);
    if (!user || !user.is_admin) return res.status(403).json({ error: 'Admin uniquement' });

    const sup = await get('SELECT id FROM suppliers WHERE id = ?', [req.params.id]);
    if (!sup) return res.status(404).json({ error: 'Fournisseur introuvable' });

    const { name, url, price, image_url, stock_info, category, visible } = req.body;
    if (name !== undefined) await run('UPDATE suppliers SET name = ? WHERE id = ?', [name, req.params.id]);
    if (url !== undefined) await run('UPDATE suppliers SET url = ? WHERE id = ?', [url, req.params.id]);
    if (price !== undefined) await run('UPDATE suppliers SET price = ? WHERE id = ?', [price, req.params.id]);
    if (image_url !== undefined) await run('UPDATE suppliers SET image_url = ? WHERE id = ?', [image_url, req.params.id]);
    if (stock_info !== undefined) await run('UPDATE suppliers SET stock_info = ? WHERE id = ?', [stock_info, req.params.id]);
    if (category !== undefined) await run('UPDATE suppliers SET category = ? WHERE id = ?', [category, req.params.id]);
    if (visible !== undefined) await run('UPDATE suppliers SET visible = ? WHERE id = ?', [visible ? 1 : 0, req.params.id]);

    res.json({ message: 'Fournisseur mis à jour' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }) }
});

/* DELETE /api/suppliers/:id */
router.delete('/:id', async (req, res) => {
  try {
    await getDb();
    const user = await get('SELECT is_admin FROM users WHERE id = ?', [req.userId]);
    if (!user || !user.is_admin) return res.status(403).json({ error: 'Admin uniquement' });

    const sup = await get('SELECT id FROM suppliers WHERE id = ?', [req.params.id]);
    if (!sup) return res.status(404).json({ error: 'Fournisseur introuvable' });

    await run('DELETE FROM suppliers WHERE id = ?', [req.params.id]);
    res.json({ message: 'Fournisseur supprimé' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }) }
});

module.exports = router;
