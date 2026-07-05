const express = require('express');
const { getDb, get, query, run } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

async function adminOnly(req, res, next) {
  const user = await get('SELECT is_admin FROM users WHERE id = ?', [req.userId]);
  if (!user || !user.is_admin) return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
  next();
}

router.use(auth);
router.use(adminOnly);

router.get('/users', async (req, res) => {
  try {
    const users = await query('SELECT id, email, verified, goal, currency, is_admin, created_at FROM users ORDER BY id');
    res.json(users);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }) }
});

router.put('/users/:id', async (req, res) => {
  try {
    const { goal, is_admin } = req.body;
    const user = await get('SELECT id FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    if (goal !== undefined) await run('UPDATE users SET goal = ? WHERE id = ?', [goal, req.params.id]);
    if (is_admin !== undefined) await run('UPDATE users SET is_admin = ? WHERE id = ?', [is_admin ? 1 : 0, req.params.id]);

    res.json({ message: 'Utilisateur mis à jour' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }) }
});

router.delete('/users/:id', async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.userId) return res.status(400).json({ error: 'Tu ne peux pas supprimer ton propre compte' });
    const user = await get('SELECT id FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    await run('DELETE FROM users WHERE id = ?', [req.params.id]);
    await run('DELETE FROM items WHERE user_id = ?', [req.params.id]);
    await run('DELETE FROM transactions WHERE user_id = ?', [req.params.id]);

    res.json({ message: 'Utilisateur supprimé' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }) }
});

router.get('/stats', async (req, res) => {
  try {
    const totalUsers = await get('SELECT COUNT(*) as count FROM users');
    const verifiedUsers = await get('SELECT COUNT(*) as count FROM users WHERE verified = 1');
    const totalItems = await get('SELECT COUNT(*) as count FROM items');
    const totalTransactions = await get('SELECT COUNT(*) as count FROM transactions');
    res.json({ totalUsers: totalUsers.count, verifiedUsers: verifiedUsers.count, totalItems: totalItems.count, totalTransactions: totalTransactions.count });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }) }
});

module.exports = router;
