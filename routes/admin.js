const express = require('express');
const bcrypt = require('bcryptjs');
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

/* ── Users ── */

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

/* Reset password */
router.put('/users/:id/reset-password', async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Mot de passe : minimum 6 caractères' });
    const user = await get('SELECT id FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    const hashed = await bcrypt.hash(newPassword, 10);
    await run('UPDATE users SET password = ? WHERE id = ?', [hashed, req.params.id]);
    res.json({ message: 'Mot de passe réinitialisé' });
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

/* ── All Items (with user email) ── */

router.get('/items', async (req, res) => {
  try {
    const items = await query(`
      SELECT i.*, u.email as user_email 
      FROM items i LEFT JOIN users u ON i.user_id = u.id 
      ORDER BY i.dateAdded DESC
    `);
    res.json(items);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }) }
});

router.delete('/items/:id', async (req, res) => {
  try {
    const item = await get('SELECT id FROM items WHERE id = ?', [req.params.id]);
    if (!item) return res.status(404).json({ error: 'Article introuvable' });
    await run('DELETE FROM items WHERE id = ?', [req.params.id]);
    await run('DELETE FROM transactions WHERE itemId = ?', [req.params.id]);
    res.json({ message: 'Article supprimé' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }) }
});

/* ── All Transactions (with user email) ── */

router.get('/transactions', async (req, res) => {
  try {
    const txns = await query(`
      SELECT t.*, u.email as user_email 
      FROM transactions t LEFT JOIN users u ON t.user_id = u.id 
      ORDER BY t.date DESC
    `);
    res.json(txns);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }) }
});

router.delete('/transactions/:id', async (req, res) => {
  try {
    const txn = await get('SELECT id FROM transactions WHERE id = ?', [req.params.id]);
    if (!txn) return res.status(404).json({ error: 'Transaction introuvable' });
    await run('DELETE FROM transactions WHERE id = ?', [req.params.id]);
    res.json({ message: 'Transaction supprimée' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }) }
});

/* ── Stats ── */

router.get('/stats', async (req, res) => {
  try {
    const totalUsers = await get('SELECT COUNT(*) as count FROM users');
    const verifiedUsers = await get('SELECT COUNT(*) as count FROM users WHERE verified = 1');
    const totalItems = await get('SELECT COUNT(*) as count FROM items');
    const totalTransactions = await get('SELECT COUNT(*) as count FROM transactions');
    const itemsSold = await get('SELECT COUNT(*) as count FROM items WHERE status = \'vendu\'');
    const totalRevenue = await get("SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE type = 'revenu'");
    const totalExpenses = await get("SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE type = 'depense'");
    res.json({
      totalUsers: totalUsers.count,
      verifiedUsers: verifiedUsers.count,
      totalItems: totalItems.count,
      totalTransactions: totalTransactions.count,
      itemsSold: itemsSold.count,
      totalRevenue: totalRevenue.total,
      totalExpenses: totalExpenses.total
    });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }) }
});

/* ── Activity data for chart ── */

router.get('/activity', async (req, res) => {
  try {
    const days = 30;
    const labels = [];
    const userCounts = [];
    const itemCounts = [];
    const txnCounts = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      labels.push(dateStr.slice(5));

      const usersDay = await get("SELECT COUNT(*) as count FROM users WHERE created_at LIKE ?", [dateStr + '%']);
      const itemsDay = await get("SELECT COUNT(*) as count FROM items WHERE dateAdded = ?", [dateStr]);
      const txnsDay = await get("SELECT COUNT(*) as count FROM transactions WHERE date = ?", [dateStr]);

      userCounts.push(usersDay.count);
      itemCounts.push(itemsDay.count);
      txnCounts.push(txnsDay.count);
    }

    res.json({ labels, userCounts, itemCounts, txnCounts });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }) }
});

/* ── Export CSV ── */

router.get('/export/:type', async (req, res) => {
  try {
    const { type } = req.params;
    let rows, filename, columns;

    if (type === 'users') {
      rows = await query('SELECT id, email, verified, is_admin, goal, currency, created_at FROM users ORDER BY id');
      columns = ['id', 'email', 'verified', 'is_admin', 'goal', 'currency', 'created_at'];
      filename = 'utilisateurs.csv';
    } else if (type === 'items') {
      rows = await query('SELECT i.id, u.email as user_email, i.name, i.purchasePrice, i.sellingPrice, i.status, i.dateAdded, i.dateSold FROM items i LEFT JOIN users u ON i.user_id = u.id ORDER BY i.dateAdded DESC');
      columns = ['id', 'user_email', 'name', 'purchasePrice', 'sellingPrice', 'status', 'dateAdded', 'dateSold'];
      filename = 'articles.csv';
    } else if (type === 'transactions') {
      rows = await query('SELECT t.id, u.email as user_email, t.type, t.amount, t.description, t.category, t.date FROM transactions t LEFT JOIN users u ON t.user_id = u.id ORDER BY t.date DESC');
      columns = ['id', 'user_email', 'type', 'amount', 'description', 'category', 'date'];
      filename = 'transactions.csv';
    } else {
      return res.status(400).json({ error: 'Type invalide (users, items, transactions)' });
    }

    let csv = '\uFEFF' + columns.join(';') + '\n';
    for (const row of rows) {
      csv += columns.map(c => {
        const val = row[c];
        if (val === null || val === undefined) return '';
        const str = String(val).replace(/"/g, '""');
        return str.includes(';') || str.includes('"') || str.includes('\n') ? '"' + str + '"' : str;
      }).join(';') + '\n';
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
    res.send(csv);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }) }
});

module.exports = router;
