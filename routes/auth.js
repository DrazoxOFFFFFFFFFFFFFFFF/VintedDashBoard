const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { getDb, get, run, query } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

let etherealTransporter = null;

async function createTransport() {
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT),
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
    console.log(' SMTP configuré : ' + process.env.SMTP_USER);
    return transport;
  }
  if (etherealTransporter) return etherealTransporter;
  try {
    const testAccount = await nodemailer.createTestAccount();
    etherealTransporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email', port: 587, secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass }
    });
    console.log(' Ethereal SMTP : ' + testAccount.user);
    console.log(' Voir les emails : https://ethereal.email/login');
    return etherealTransporter;
  } catch {
    return nodemailer.createTransport({ jsonTransport: true });
  }
}

router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });
    if (password.length < 6) return res.status(400).json({ error: 'Mot de passe : minimum 6 caractères' });

    await getDb();
    const existing = get('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) return res.status(409).json({ error: 'Cet email est déjà utilisé' });

    const hashed = await bcrypt.hash(password, 10);
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const appUrl = process.env.APP_URL || 'http://localhost:3000';

    run('INSERT INTO users (email, password, verification_code) VALUES (?, ?, ?)', [email, hashed, code]);

    try {
      const transport = await createTransport();
      const info = await transport.sendMail({
        from: process.env.FROM_EMAIL || 'noreply@vinteddashboard.com',
        to: email,
        subject: 'VintedDashboard - Code de vérification',
        html: `<div style="font-family:Arial;max-width:480px;margin:0 auto;padding:24px;background:#0b0b14;border-radius:14px;color:#eee"><h2 style="color:#00d4ff">VintedDashboard</h2><p style="color:#888">Bienvenue ! Voici ton code de vérification :</p><div style="font-size:2rem;font-weight:800;text-align:center;padding:20px;background:#10101e;border-radius:10px;margin:16px 0;color:#00d4ff;letter-spacing:8px">${code}</div><p style="color:#505070;font-size:0.85rem">Code : <strong>${code}</strong></p></div>`
      });
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        console.log(' Email envoyé (Ethereal) : ' + previewUrl);
        console.log(' Code : ' + code);
      } else {
        console.log(' Email envoyé à ' + email + ' | Code : ' + code);
      }
    } catch (err) {
      console.log(' Email non envoyé, code affiché dans l\'interface');
    }

    res.json({ message: 'Compte créé. Vérifie ton email pour le code.', devCode: code });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/verify', async (req, res) => {
  try {
    await getDb();
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'Email et code requis' });

    const user = get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    if (user.verified) return res.json({ message: 'Déjà vérifié' });

    if (user.verification_code !== code) {
      return res.status(400).json({ error: 'Code invalide' });
    }

    run('UPDATE users SET verified = 1, verification_code = NULL WHERE id = ?', [user.id]);
    res.json({ message: 'Email vérifié ! Tu peux maintenant te connecter.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/login', async (req, res) => {
  try {
    await getDb();
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

    const user = get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

    if (!user.verified) return res.status(403).json({ error: 'Vérifie ton email avant de te connecter' });

    const match = bcrypt.compareSync(password, user.password);
    if (!match) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: { id: user.id, email: user.email, goal: user.goal, currency: user.currency, is_admin: user.is_admin }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/me', auth, async (req, res) => {
  try {
    await getDb();
    const user = get('SELECT id, email, goal, currency, created_at FROM users WHERE id = ?', [req.userId]);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/resend-code', async (req, res) => {
  try {
    await getDb();
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requis' });
    const user = get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    if (user.verified) return res.json({ message: 'Déjà vérifié' });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    run('UPDATE users SET verification_code = ? WHERE id = ?', [code, user.id]);

    try {
      const transport = await createTransport();
      const info = await transport.sendMail({
        from: process.env.FROM_EMAIL || 'noreply@vinteddashboard.com',
        to: email,
        subject: 'VintedDashboard - Nouveau code de vérification',
        html: `<div style="font-family:Arial;max-width:480px;margin:0 auto;padding:24px;background:#0b0b14;border-radius:14px;color:#eee"><h2 style="color:#00d4ff">VintedDashboard</h2><p style="color:#888">Nouveau code :</p><div style="font-size:2rem;font-weight:800;text-align:center;padding:20px;background:#10101e;border-radius:10px;margin:16px 0;color:#00d4ff;letter-spacing:8px">${code}</div></div>`
      });
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) console.log(' Email renvoyé : ' + previewUrl);
    } catch (err) {
      console.log(' Email non envoyé, code : ' + code);
    }

    res.json({ message: 'Nouveau code envoyé', devCode: code });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
