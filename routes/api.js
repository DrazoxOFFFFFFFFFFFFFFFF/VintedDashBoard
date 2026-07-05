const express = require('express');
const { getDb, get, run, query } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

router.use(auth);

router.get('/items', async (req, res) => {
  try {
    await getDb();
    const items = query('SELECT * FROM items WHERE user_id = ? ORDER BY dateAdded DESC', [req.userId]);
    res.json(items);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }) }
});

router.post('/items', async (req, res) => {
  try {
    await getDb();
    const { id, name, purchasePrice, sellingPrice, status, dateAdded, dateSold } = req.body;
    if (!name) return res.status(400).json({ error: 'Nom requis' });
    run(
      'INSERT INTO items (id, user_id, name, purchasePrice, sellingPrice, status, dateAdded, dateSold) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id || require('uuid').v4(), req.userId, name, purchasePrice || 0, sellingPrice || 0,
        status || 'en_vente', dateAdded || new Date().toISOString().split('T')[0], dateSold || null]
    );
    res.json({ message: 'Article ajouté' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }) }
});

router.put('/items/:id', async (req, res) => {
  try {
    await getDb();
    const { name, purchasePrice, sellingPrice, status, dateSold } = req.body;
    const item = get('SELECT * FROM items WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    if (!item) return res.status(404).json({ error: 'Article introuvable' });

    run(
      'UPDATE items SET name=?, purchasePrice=?, sellingPrice=?, status=?, dateSold=? WHERE id=? AND user_id=?',
      [name || item.name, purchasePrice ?? item.purchasePrice, sellingPrice ?? item.sellingPrice,
        status || item.status, dateSold ?? item.dateSold, req.params.id, req.userId]
    );
    res.json({ message: 'Article modifié' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }) }
});

router.delete('/items/:id', async (req, res) => {
  try {
    await getDb();
    const item = get('SELECT * FROM items WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    if (!item) return res.status(404).json({ error: 'Article introuvable' });

    run('DELETE FROM items WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    run('DELETE FROM transactions WHERE itemId = ? AND user_id = ?', [req.params.id, req.userId]);
    res.json({ message: 'Article supprimé' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }) }
});

router.get('/transactions', async (req, res) => {
  try {
    await getDb();
    const txns = query('SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC', [req.userId]);
    res.json(txns);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }) }
});

router.post('/transactions', async (req, res) => {
  try {
    await getDb();
    const { id, type, amount, description, category, date, itemId } = req.body;
    if (!type || !amount) return res.status(400).json({ error: 'Type et montant requis' });

    run(
      'INSERT INTO transactions (id, user_id, type, amount, description, category, date, itemId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id || require('uuid').v4(), req.userId, type, amount, description || '', category || 'autre',
        date || new Date().toISOString().split('T')[0], itemId || null]
    );
    res.json({ message: 'Transaction ajoutée' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }) }
});

router.delete('/transactions/:id', async (req, res) => {
  try {
    await getDb();
    const txn = get('SELECT * FROM transactions WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    if (!txn) return res.status(404).json({ error: 'Transaction introuvable' });

    run('DELETE FROM transactions WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    res.json({ message: 'Transaction supprimée' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }) }
});

router.get('/settings', async (req, res) => {
  try {
    await getDb();
    const user = get('SELECT goal, currency FROM users WHERE id = ?', [req.userId]);
    res.json(user || { goal: 2000, currency: '€' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }) }
});

router.put('/settings', async (req, res) => {
  try {
    await getDb();
    const { goal, currency } = req.body;
    run('UPDATE users SET goal = ?, currency = ? WHERE id = ?', [goal ?? 2000, currency || '€', req.userId]);
    res.json({ message: 'Objectif mis à jour' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }) }
});

module.exports = router;
