const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Image uniquement'));
    cb(null, true);
  }
});

const tmpDir = path.join(__dirname, '..', 'tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

setInterval(() => {
  try {
    const files = fs.readdirSync(tmpDir);
    const now = Date.now();
    for (const f of files) {
      const fp = path.join(tmpDir, f);
      const stat = fs.statSync(fp);
      if (now - stat.mtimeMs > 3600000) fs.unlinkSync(fp);
    }
  } catch (e) { /* ignore */ }
}, 60000);

router.post('/', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Image requise' });

    const { brightness = 10, contrast = 15, saturation = 10, sharpen = 3, bgColor = '#ffffff', removeBg = false } = req.body;

    let img = sharp(req.file.buffer).rotate().resize(1200, 1200, { fit: 'inside', withoutEnlargement: true });

    const metadata = await img.metadata();

    const isTransparent = bgColor === 'transparent';
    const parsedBg = isTransparent ? null : { r: parseInt(bgColor.slice(1, 3), 16), g: parseInt(bgColor.slice(3, 5), 16), b: parseInt(bgColor.slice(5, 7), 16) };

    if (removeBg) {
      const flat = await img.clone().flatten({ background: { r: 255, g: 255, b: 255 } }).raw().toBuffer();
      const channels = metadata.channels || 3;
      const pixels = [];
      for (let i = 0; i < flat.length; i += channels) {
        const r = flat[i], g = flat[i + 1], b = flat[i + 2];
        const isLight = (r > 230 && g > 230 && b > 230) || (r > 220 && g > 220 && b > 220 && Math.abs(r - g) < 15 && Math.abs(g - b) < 15);
        pixels.push(isLight ? 0 : 255);
      }
      const mask = Buffer.from(pixels);
      img = img.composite([{
        input: { create: { width: metadata.width, height: metadata.height, channels: 1, background: { r: 0, g: 0, b: 0 } } },
        blend: 'dest-in',
        raw: { width: metadata.width, height: metadata.height, channels: 1 }
      }]);
    }

    img = img
      .linear(1 + (contrast / 100), -(128 * (contrast / 100)))
      .modulate({ brightness: 1 + (brightness / 100), saturation: 1 + (saturation / 100) });

    if (!isTransparent) img = img.flatten({ background: parsedBg });

    if (sharpen > 0) img = img.sharpen(parseFloat(sharpen));

    const output = await (isTransparent ? img.png() : img.jpeg({ quality: 92, mozjpeg: true })).toBuffer();

    const id = crypto.randomBytes(8).toString('hex');
    const outPath = path.join(tmpDir, id + '.jpg');
    fs.writeFileSync(outPath, output);

    res.json({ url: '/tmp/' + id + '.jpg' });
  } catch (err) {
    console.error('Enhance error:', err);
    res.status(500).json({ error: 'Erreur traitement image' });
  }
});

module.exports = router;
