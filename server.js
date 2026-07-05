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
  const existing = get('SELECT id FROM users WHERE email = ?', [adminEmail]);
  if (!existing) {
    const hashed = await bcrypt.hash('admin123', 10);
    run('INSERT INTO users (email, password, verified, is_admin) VALUES (?, ?, 1, 1)', [adminEmail, hashed]);
    console.log('Compte admin créé : admin@vinteddashboard.com / admin123');
  } else {
    run('UPDATE users SET is_admin = 1, verified = 1 WHERE email = ?', [adminEmail]);
    console.log('Compte admin existant mis à jour');
  }

  app.listen(PORT, () => {
    console.log(`VintedDashboard en ligne sur http://localhost:${PORT}`);
  });
}

start();
