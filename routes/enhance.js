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
  limits: { fileSize: 15 * 1024 * 1024 },
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

async function removeBgApi(buffer) {
  const key = process.env.REMOVE_BG_API_KEY;
  if (!key) return null;

  const formData = new FormData();
  const blob = new Blob([buffer], { type: 'image/png' });
  formData.append('image_file', blob, 'image.png');
  formData.append('size', 'auto');

  const res = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: { 'X-Api-Key': key },
    body: formData
  });

  if (!res.ok) {
    console.log('Remove.bg error:', res.status, await res.text());
    return null;
  }

  return Buffer.from(await res.arrayBuffer());
}

async function removeBgColor(buffer) {
  const img = sharp(buffer).rotate();
  const meta = await img.metadata();

  const flat = await img.clone().flatten({ background: { r: 255, g: 255, b: 255 } }).raw().toBuffer();
  const ch = meta.channels || 3;
  const w = meta.width, h = meta.height;

  const pixels = Buffer.alloc(w * h * 4);
  for (let i = 0; i < flat.length; i += ch) {
    const idx = Math.floor(i / ch);
    const r = flat[i], g = flat[i + 1], b = flat[i + 2];
    const isLight = (r > 225 && g > 225 && b > 225) || (r > 210 && g > 210 && b > 210 && Math.abs(r - g) < 20 && Math.abs(g - b) < 20);
    if (isLight) {
      pixels[idx * 4] = 0;
      pixels[idx * 4 + 1] = 0;
      pixels[idx * 4 + 2] = 0;
      pixels[idx * 4 + 3] = 0;
    } else {
      pixels[idx * 4] = flat[i];
      pixels[idx * 4 + 1] = flat[i + 1];
      pixels[idx * 4 + 2] = flat[i + 2];
      pixels[idx * 4 + 3] = 255;
    }
  }

  return sharp(pixels, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

async function createGradientBg(width, height, color) {
  const c = { r: parseInt(color.slice(1, 3), 16), g: parseInt(color.slice(3, 5), 16), b: parseInt(color.slice(5, 7), 16) };
  const darker = { r: Math.max(0, c.r - 15), g: Math.max(0, c.g - 15), b: Math.max(0, c.b - 15) };
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs><radialGradient id="g" cx="50%" cy="40%" r="70%">
      <stop offset="0%" style="stop-color:rgb(${c.r},${c.g},${c.b});stop-opacity:1"/>
      <stop offset="100%" style="stop-color:rgb(${darker.r},${darker.g},${darker.b});stop-opacity:1"/>
    </radialGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
  </svg>`;
  return Buffer.from(svg);
}

router.post('/', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Image requise' });

    const brightness = parseFloat(req.body.brightness) || 5;
    const contrast = parseFloat(req.body.contrast) || 10;
    const saturation = parseFloat(req.body.saturation) || 5;
    const sharpen = parseFloat(req.body.sharpen) || 2;
    const bgColor = req.body.bgColor || '#ffffff';
    const removeBg = req.body.removeBg !== 'false';

    let buffer = req.file.buffer;
    const isTransparent = bgColor === 'transparent';

    if (removeBg) {
      console.log('Remove.bg: trying API...');
      const apiResult = await removeBgApi(buffer);
      if (apiResult) {
        buffer = apiResult;
        console.log('Remove.bg: API success');
      } else {
        console.log('Remove.bg: fallback to color removal');
        buffer = await removeBgColor(buffer);
      }
    } else if (!isTransparent) {
      const meta = await sharp(buffer).metadata();
      if (meta.channels === 4) {
        const flat = await sharp(buffer).flatten({ background: { r: 255, g: 255, b: 255 } }).png().toBuffer();
        buffer = flat;
      }
    }

    let img = sharp(buffer).rotate().resize(1400, 1400, { fit: 'inside', withoutEnlargement: true });

    const meta = await img.metadata();
    const w = meta.width, h = meta.height;

    if (!isTransparent) {
      const bgBuf = await createGradientBg(w, h, bgColor);
      const subject = await img.png().toBuffer();
      const canvas = sharp({ create: { width: w, height: h, channels: 3, background: { r: 0, g: 0, b: 0 } } });
      const composited = sharp(bgBuf).composite([
        { input: subject, top: 0, left: 0 }
      ]);
      img = composited;
    }

    img = img
      .linear(1 + (contrast / 100), -(128 * (contrast / 100)))
      .modulate({ brightness: 1 + (brightness / 100), saturation: 1 + (saturation / 100) });

    if (sharpen > 0) img = img.sharpen(parseFloat(sharpen));

    const output = await img.jpeg({ quality: 95, mozjpeg: true }).toBuffer();

    const id = crypto.randomBytes(8).toString('hex');
    const outPath = path.join(tmpDir, id + '.jpg');
    fs.writeFileSync(outPath, output);

    res.json({ url: '/tmp/' + id + '.jpg' });
  } catch (err) {
    console.error('Enhance error:', err);
    res.status(500).json({ error: 'Erreur traitement image: ' + err.message });
  }
});

module.exports = router;
