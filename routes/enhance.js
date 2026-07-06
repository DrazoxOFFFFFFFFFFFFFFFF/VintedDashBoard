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
      pixels[idx * 4] = 0; pixels[idx * 4 + 1] = 0; pixels[idx * 4 + 2] = 0; pixels[idx * 4 + 3] = 0;
    } else {
      pixels[idx * 4] = flat[i]; pixels[idx * 4 + 1] = flat[i + 1]; pixels[idx * 4 + 2] = flat[i + 2]; pixels[idx * 4 + 3] = 255;
    }
  }
  return sharp(pixels, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

function hexToRgb(hex) {
  return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) };
}

async function createStudioBg(width, height, color) {
  const c = hexToRgb(color);
  const darker = { r: Math.max(0, c.r - 25), g: Math.max(0, c.g - 25), b: Math.max(0, c.b - 25) };
  const hl = { r: Math.min(255, c.r + 30), g: Math.min(255, c.g + 30), b: Math.min(255, c.b + 30) };
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="spot" cx="45%" cy="35%" r="65%">
        <stop offset="0%" style="stop-color:rgb(${hl.r},${hl.g},${hl.b})"/>
        <stop offset="50%" style="stop-color:rgb(${c.r},${c.g},${c.b})"/>
        <stop offset="100%" style="stop-color:rgb(${darker.r},${darker.g},${darker.b})"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#spot)"/>
  </svg>`;
  return Buffer.from(svg);
}

async function createShadow(width, height) {
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="blur"><feGaussianBlur stdDeviation="${Math.round(width * 0.025)}"/></filter>
      <radialGradient id="sg" cx="50%" cy="80%" r="45%">
        <stop offset="0%" style="stop-color:rgba(0,0,0,0.18)"/>
        <stop offset="80%" style="stop-color:rgba(0,0,0,0.04)"/>
        <stop offset="100%" style="stop-color:rgba(0,0,0,0)"/>
      </radialGradient>
    </defs>
    <rect x="${Math.round(width * 0.1)}" y="${Math.round(height * 0.75)}" width="${Math.round(width * 0.8)}" height="${Math.round(height * 0.2)}" rx="50%" fill="url(#sg)" filter="url(#blur)"/>
  </svg>`;
  return Buffer.from(svg);
}

router.post('/', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Image requise' });

    const brightness = parseFloat(req.body.brightness) || 5;
    const contrast = parseFloat(req.body.contrast) || 8;
    const saturation = parseFloat(req.body.saturation) || 5;
    const sharpen = parseFloat(req.body.sharpen) || 3;
    const bgColor = req.body.bgColor || '#ffffff';
    const removeBg = req.body.removeBg !== 'false';

    let buffer = req.file.buffer;
    const isTransparent = bgColor === 'transparent';

    if (removeBg) {
      const apiResult = await removeBgApi(buffer);
      buffer = apiResult || await removeBgColor(buffer);
    }

    /* Resize with padding to max 1600 */
    let img = sharp(buffer).rotate();
    const meta = await img.metadata();
    let w = meta.width, h = meta.height;

    const maxDim = 1600;
    if (w > maxDim || h > maxDim) {
      if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
      else { w = Math.round(w * maxDim / h); h = maxDim; }
      img = img.resize(w, h);
    }

    /* Add padding (20% margin around item) */
    const pad = Math.round(Math.max(w, h) * 0.2);
    const cw = w + pad * 2;
    const ch = h + pad * 2;

    const subject = await img.png().toBuffer();

    if (!isTransparent) {
      const bgBuf = await createStudioBg(cw, ch, bgColor);
      const shadowBuf = await createShadow(cw, ch);

      /* Place subject centered on background with shadow */
      const composited = sharp(bgBuf)
        .composite([
          { input: shadowBuf, top: 0, left: 0 },
          { input: subject, top: pad, left: pad }
        ]);

      img = composited
        .linear(1 + (contrast / 100), -(128 * (contrast / 100)))
        .modulate({ brightness: 1 + (brightness / 100), saturation: 1 + (saturation / 100) });
    } else {
      const canvas = sharp({ create: { width: cw, height: ch, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: subject, top: pad, left: pad }]);
      img = canvas;
    }

    if (sharpen > 0) img = img.sharpen(parseFloat(sharpen));

    const output = await img.jpeg({ quality: 95, mozjpeg: true }).toBuffer();

    const id = crypto.randomBytes(8).toString('hex');
    fs.writeFileSync(path.join(tmpDir, id + '.jpg'), output);

    res.json({ url: '/tmp/' + id + '.jpg' });
  } catch (err) {
    console.error('Enhance error:', err);
    res.status(500).json({ error: 'Erreur: ' + err.message });
  }
});

module.exports = router;
