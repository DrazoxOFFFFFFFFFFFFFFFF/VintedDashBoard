require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { getDb, get, run } = require('./db');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');
const enhanceRoutes = require('./routes/enhance');
const supplierRoutes = require('./routes/suppliers');

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  console.log('JWT_SECRET auto-généré');
}
if (!process.env.APP_URL) {
  process.env.APP_URL = 'http://localhost:' + (process.env.PORT || 3000);
}

const app = express();

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', async (req, res) => {
  try {
    const adminUser = await get('SELECT id, email, is_admin FROM users WHERE email = ?', ['admin@vinteddashboard.com']);
    res.json({ status: 'ok', admin_exists: !!adminUser, admin: adminUser || null });
  } catch (err) {
    res.json({ status: 'db_not_ready', error: err.message });
  }
});

app.use('/tmp', express.static(path.join(__dirname, 'tmp')));
app.use('/api/enhance', enhanceRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);

app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

const PORT = process.env.PORT || 3000;

async function start() {
  await getDb();

  const adminEmail = 'admin@vinteddashboard.com';
  const existing = await get('SELECT id FROM users WHERE email = ?', [adminEmail]);
  if (!existing) {
    const hashed = await bcrypt.hash('admin123', 10);
    await run('INSERT INTO users (email, password, verified, is_admin) VALUES (?, ?, 1, 1)', [adminEmail, hashed]);
    console.log('Compte admin créé : admin@vinteddashboard.com / admin123');
  } else {
    await run('UPDATE users SET is_admin = 1, verified = 1 WHERE email = ?', [adminEmail]);
    console.log('Compte admin existant mis à jour');
  }

  app.listen(PORT, () => {
    console.log(`VintedDashboard en ligne sur http://localhost:${PORT}`);
  });
}

start();
