const express = require('express');
const { getDb, get, query, run } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

function adminOnly(req, res, next) {
  const user = get('SELECT is_admin FROM users WHERE id = ?', [req.userId]);
  if (!user || !user.is_admin) return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
  next();
}

router.use(auth);
router.use(adminOnly);

router.get('/users', (req, res) => {
  const users = query('SELECT id, email, verified, goal, currency, is_admin, created_at FROM users ORDER BY id');
  res.json(users);
});

router.put('/users/:id', (req, res) => {
  const { goal, is_admin } = req.body;
  const user = get('SELECT id FROM users WHERE id = ?', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

  if (goal !== undefined) run('UPDATE users SET goal = ? WHERE id = ?', [goal, req.params.id]);
  if (is_admin !== undefined) run('UPDATE users SET is_admin = ? WHERE id = ?', [is_admin ? 1 : 0, req.params.id]);

  res.json({ message: 'Utilisateur mis à jour' });
});

router.delete('/users/:id', (req, res) => {
  if (parseInt(req.params.id) === req.userId) return res.status(400).json({ error: 'Tu ne peux pas supprimer ton propre compte' });
  const user = get('SELECT id FROM users WHERE id = ?', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

  run('DELETE FROM users WHERE id = ?', [req.params.id]);
  run('DELETE FROM items WHERE user_id = ?', [req.params.id]);
  run('DELETE FROM transactions WHERE user_id = ?', [req.params.id]);

  res.json({ message: 'Utilisateur supprimé' });
});

router.get('/stats', (req, res) => {
  const totalUsers = get('SELECT COUNT(*) as count FROM users');
  const verifiedUsers = get('SELECT COUNT(*) as count FROM users WHERE verified = 1');
  const totalItems = get('SELECT COUNT(*) as count FROM items');
  const totalTransactions = get('SELECT COUNT(*) as count FROM transactions');
  res.json({ totalUsers: totalUsers.count, verifiedUsers: verifiedUsers.count, totalItems: totalItems.count, totalTransactions: totalTransactions.count });
});

module.exports = router;
