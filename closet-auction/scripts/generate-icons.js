// Generates placeholder app icons and splash from a brand color.
// Pure Node — no native deps. Re-run any time you change the brand color.
//
// Output:
//   assets/icon.png             1024x1024 brand color, white wordmark "CA"
//   assets/adaptive-icon.png    1024x1024 same (foreground for Android)
//   assets/splash.png           2048x2048 brand color (centered logo)
//   assets/notification-icon.png 96x96 white silhouette on transparent
//   assets/favicon.png          48x48
//
// Run: node scripts/generate-icons.js
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ASSETS = path.join(__dirname, '..', 'assets');
fs.mkdirSync(ASSETS, { recursive: true });

// Brand color (matches theme.ts accent).
const BRAND = { r: 0xff, g: 0x6b, b: 0x8a };
const BRAND_DARK = { r: 0x7c, g: 0x5c, b: 0xff };
const WHITE = { r: 0xff, g: 0xff, b: 0xff, a: 0xff };
const TRANSPARENT = { r: 0, g: 0, b: 0, a: 0 };

function crc32(buf) {
  let table = crc32._t;
  if (!table) {
    table = crc32._t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = (crc >>> 8) ^ table[(crc ^ b) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function makePng(width, height, pxFn) {
  // RGBA 8-bit
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let off = 0;
  for (let y = 0; y < height; y++) {
    raw[off++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const p = pxFn(x, y, width, height);
      raw[off++] = p.r;
      raw[off++] = p.g;
      raw[off++] = p.b;
      raw[off++] = p.a == null ? 255 : p.a;
    }
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;       // bit depth
  ihdr[9] = 6;       // color type: RGBA
  ihdr[10] = 0;      // compression
  ihdr[11] = 0;      // filter
  ihdr[12] = 0;      // interlace

  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function blend(a, b, t) {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
    a: 255,
  };
}

// "C" + "A" letters drawn as a simple bitmap inside a rounded square.
// Coords are in 0..1 normalized to the canvas. We just check if (x,y) is inside the letter bounds.
function inLetterCA(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const stroke = Math.max(8, Math.round(w * 0.045));

  // Letter C: arc on the left half.
  const cR = w * 0.18;
  const cCx = cx - w * 0.16;
  const cCy = cy;
  const dC = Math.hypot(x - cCx, y - cCy);
  if (Math.abs(dC - cR) < stroke / 2) {
    // Open mouth on the right.
    const ang = Math.atan2(y - cCy, x - cCx);
    if (Math.abs(ang) > 0.45) return true;
  }

  // Letter A: triangle outline + crossbar on the right half.
  const aCx = cx + w * 0.16;
  const aTop = cy - w * 0.18;
  const aBL = { x: aCx - w * 0.13, y: cy + w * 0.18 };
  const aBR = { x: aCx + w * 0.13, y: cy + w * 0.18 };
  // Left leg
  if (lineHit(x, y, aCx, aTop, aBL.x, aBL.y, stroke)) return true;
  // Right leg
  if (lineHit(x, y, aCx, aTop, aBR.x, aBR.y, stroke)) return true;
  // Crossbar
  if (lineHit(x, y, aCx - w * 0.07, cy + w * 0.03, aCx + w * 0.07, cy + w * 0.03, stroke)) return true;

  return false;
}

function lineHit(px, py, x1, y1, x2, y2, w) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy) <= w / 2;
}

function inRoundedSquare(x, y, w, h, radius) {
  if (x >= radius && x <= w - radius) return y >= 0 && y <= h;
  if (y >= radius && y <= h - radius) return x >= 0 && x <= w;
  // corners
  const corners = [
    { cx: radius, cy: radius },
    { cx: w - radius, cy: radius },
    { cx: radius, cy: h - radius },
    { cx: w - radius, cy: h - radius },
  ];
  for (const c of corners) {
    if (Math.hypot(x - c.cx, y - c.cy) <= radius) return true;
  }
  return false;
}

function writeIcon(filename, size, opts = {}) {
  const radius = opts.rounded ? Math.round(size * 0.22) : 0;
  const png = makePng(size, size, (x, y, w, h) => {
    if (radius > 0 && !inRoundedSquare(x, y, w, h, radius)) {
      return TRANSPARENT;
    }
    // Diagonal gradient for some life.
    const t = (x + y) / (w + h);
    const bg = blend(BRAND, BRAND_DARK, t);
    if (inLetterCA(x, y, w, h)) return WHITE;
    return bg;
  });
  fs.writeFileSync(path.join(ASSETS, filename), png);
  console.log(`wrote ${filename} (${(png.length / 1024).toFixed(1)} KB)`);
}

function writeSplash(filename, size) {
  // Simple solid brand color with the logo centered at ~30% width.
  const logoSize = Math.round(size * 0.3);
  const x0 = Math.round((size - logoSize) / 2);
  const png = makePng(size, size, (x, y) => {
    const lx = x - x0;
    const ly = y - x0;
    if (lx >= 0 && lx < logoSize && ly >= 0 && ly < logoSize) {
      if (inLetterCA(lx, ly, logoSize, logoSize)) return WHITE;
    }
    return BRAND;
  });
  fs.writeFileSync(path.join(ASSETS, filename), png);
  console.log(`wrote ${filename} (${(png.length / 1024).toFixed(1)} KB)`);
}

function writeNotificationIcon(filename, size) {
  // White silhouette on transparent — Android notification spec.
  const png = makePng(size, size, (x, y, w, h) => {
    if (inLetterCA(x, y, w, h)) return WHITE;
    return TRANSPARENT;
  });
  fs.writeFileSync(path.join(ASSETS, filename), png);
  console.log(`wrote ${filename} (${(png.length / 1024).toFixed(1)} KB)`);
}

writeIcon('icon.png', 1024, { rounded: false });
writeIcon('adaptive-icon.png', 1024, { rounded: false });
writeIcon('favicon.png', 48, { rounded: true });
writeSplash('splash.png', 2048);
writeNotificationIcon('notification-icon.png', 96);

console.log('\nDone. Replace these with your real branding before App Store submission.');
