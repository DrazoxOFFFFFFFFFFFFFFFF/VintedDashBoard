const express = require('express');
const { getDb, get, run, query } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

/* Scrape URL for metadata */
router.post('/scrape', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL requise' });

    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(8000)
    });
    const html = await resp.text();

    const og = {};
    const meta = html.match(/<meta[^>]+>/gi) || [];
    for (const m of meta) {
      const p = m.match(/property=["']([^"']+)["']/);
      const n = m.match(/name=["']([^"']+)["']/);
      const c = m.match(/content=["']([^"']+)["']/);
      const key = (p || n)?.[1];
      if (key && c) og[key] = c[1];
    }

    const title = og['og:title'] || og['twitter:title'] || html.match(/<title>([^<]+)<\/title>/)?.[1] || '';
    const image = og['og:image'] || og['twitter:image'] || '';
    const description = og['og:description'] || og['twitter:description'] || og['description'] || '';
    const price = og['product:price:amount'] || og['og:price:amount'] || '';
    const availability = og['product:availability'] || og['og:availability'] || '';

    res.json({ title: title.trim(), image, description: description.trim(), price: parseFloat(price) || 0, availability });
  } catch (err) {
    res.json({ title: '', image: '', description: '', price: 0, availability: '' });
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

    const { name, url, price, image_url, stock_info, description, category, visible } = req.body;
    if (!name) return res.status(400).json({ error: 'Nom requis' });

    const id = require('crypto').randomUUID();
    await run(
      'INSERT INTO suppliers (id, added_by, name, url, price, image_url, stock_info, description, category, visible) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, req.userId, name, url || '', price || 0, image_url || '', stock_info || '', description || '', category || 'general', visible !== undefined ? (visible ? 1 : 0) : 1]
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

    const { name, url, price, image_url, stock_info, description, category, visible } = req.body;
    if (name !== undefined) await run('UPDATE suppliers SET name = ? WHERE id = ?', [name, req.params.id]);
    if (url !== undefined) await run('UPDATE suppliers SET url = ? WHERE id = ?', [url, req.params.id]);
    if (price !== undefined) await run('UPDATE suppliers SET price = ? WHERE id = ?', [price, req.params.id]);
    if (image_url !== undefined) await run('UPDATE suppliers SET image_url = ? WHERE id = ?', [image_url, req.params.id]);
    if (stock_info !== undefined) await run('UPDATE suppliers SET stock_info = ? WHERE id = ?', [stock_info, req.params.id]);
    if (description !== undefined) await run('UPDATE suppliers SET description = ? WHERE id = ?', [description, req.params.id]);
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
