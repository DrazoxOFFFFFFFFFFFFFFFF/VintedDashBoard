const express = require('express');
const { getDb, get, run, query } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

const LOVE_API = 'https://www.lovegobuy.com/index.php?s=/api/goods/detail';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function extractFromUrl(url) {
  try {
    const u = new URL(url);
    /* LoveGoBuy URL */
    if (u.hostname.includes('lovegobuy')) {
      return {
        goodsId: u.searchParams.get('id') || u.searchParams.get('goodsId'),
        shopType: u.searchParams.get('shop_type') || 'taobao'
      };
    }
    /* 1688 */
    if (u.hostname.includes('1688.com')) {
      const m = u.pathname.match(/\/offer\/(\d+)\.html/);
      return { goodsId: m ? m[1] : u.searchParams.get('offerId'), shopType: 'ali_1688' };
    }
    /* Taobao / Tmall */
    if (u.hostname.includes('taobao.com') || u.hostname.includes('tmall.com')) {
      return { goodsId: u.searchParams.get('id'), shopType: 'taobao' };
    }
    /* Weidian */
    if (u.hostname.includes('weidian.com')) {
      return { goodsId: u.searchParams.get('itemID'), shopType: 'weidian' };
    }
  } catch (e) {}
  return { goodsId: null, shopType: 'taobao' };
}

async function scrapePageMeta(url) {
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      },
      signal: AbortSignal.timeout(10000)
    });
    const html = await resp.text();
    const title = (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || '';
    const ogImage = (html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i) || [])[1] || '';
    const ogTitle = (html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i) || [])[1] || '';
    return {
      title: (ogTitle || title).trim().replace(/[-–|].*$/, '').trim(),
      image: ogImage
    };
  } catch (e) {
    return null;
  }
}

/* Scrape product info from URL (LoveGoBuy, 1688, Taobao, Weidian) */
router.post('/scrape', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL requise' });

    const { goodsId, shopType } = extractFromUrl(url);
    if (!goodsId) {
      return res.json({ title: '', price: 0, image: '', stock_info: '' });
    }

    /* 1) Try LoveGoBuy goods/detail API */
    const resp = await fetch(`${LOVE_API}&goodsId=${goodsId}&shop_type=${shopType}`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(10000)
    });
    const data = await resp.json();

    if (data && data.status === 200 && data.data && data.data.detail) {
      const d = data.data.detail;
      const title = (d.goods_name || '').trim();
      const image = d.goods_image || (d.goods_images && d.goods_images[0]?.preview_url) || '';
      const stock = d.stock_total != null ? (parseInt(d.stock_total) > 0 ? 'En stock' : 'Rupture') : '';

      let priceEur = 0;
      if (d.goods_price_min_show) {
        const usd = parseFloat(d.goods_price_min_show.replace(/[^0-9.]/g, ''));
        if (usd > 0) {
          try {
            const fx = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR', { signal: AbortSignal.timeout(5000) });
            const fxData = await fx.json();
            const rate = fxData.rates?.EUR || 0.92;
            priceEur = Math.round(usd * rate * 100) / 100;
          } catch (e) {
            priceEur = Math.round(usd * 0.92 * 100) / 100;
          }
        }
      }
      return res.json({ title, price: priceEur, image, stock_info: stock });
    }

    /* 2) Fallback: scrape meta tags from original platform */
    let platformUrl = '';
    if (shopType === 'ali_1688' || shopType === '1688') {
      platformUrl = `https://detail.1688.com/offer/${goodsId}.html`;
    } else if (shopType === 'taobao') {
      platformUrl = `https://item.taobao.com/item.htm?id=${goodsId}`;
    } else if (shopType === 'weidian') {
      platformUrl = `https://weidian.com/item.html?itemID=${goodsId}`;
    }
    if (platformUrl) {
      const meta = await scrapePageMeta(platformUrl);
      if (meta && meta.title) {
        return res.json({ title: meta.title, price: 0, image: meta.image || '', stock_info: '' });
      }
    }

    return res.json({ title: '', price: 0, image: '', stock_info: '' });
  } catch (err) {
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
