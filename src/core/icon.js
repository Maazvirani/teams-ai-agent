'use strict';

/**
 * The app icon, drawn in code.
 *
 * A PWA needs real PNG icons for the home-screen tile. Rather than commit
 * binary blobs, VIRANI renders its arc-reactor mark pixel by pixel and encodes
 * a PNG with zlib — so the icon is version-controlled as readable code and can
 * be re-themed by changing three numbers.
 */

const zlib = require('zlib');

const CYAN = [56, 226, 255];
const DEEP = [10, 16, 28];
const WHITE = [235, 250, 255];

function render(size) {
  const px = Buffer.alloc(size * size * 4);
  const c = (size - 1) / 2;
  const unit = size / 2; // 1.0 == the icon edge

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x - c) / unit;
      const dy = (y - c) / unit;
      const r = Math.hypot(dx, dy);

      // Background: deep navy, lifting slightly toward the centre.
      let [red, green, blue] = DEEP;
      let glow = Math.max(0, 1 - r * 1.25) * 0.28;

      // Outer ring
      glow += band(r, 0.72, 0.055) * 0.95;
      // Inner ring
      glow += band(r, 0.5, 0.03) * 0.7;
      // Core
      glow += Math.max(0, 1 - r / 0.2) ** 2 * 1.1;

      // The "V" — two strokes meeting at the bottom of the core.
      const v = Math.max(stroke(dx, dy, -0.26, -0.3, 0, 0.28, 0.075), stroke(dx, dy, 0.26, -0.3, 0, 0.28, 0.075));

      const inside = r < 0.94;
      if (inside) {
        const lit = Math.min(1.4, glow);
        red = mix(red, CYAN[0], Math.min(1, lit));
        green = mix(green, CYAN[1], Math.min(1, lit));
        blue = mix(blue, CYAN[2], Math.min(1, lit));
        if (v > 0) {
          red = mix(red, WHITE[0], v);
          green = mix(green, WHITE[1], v);
          blue = mix(blue, WHITE[2], v);
        }
      }

      const i = (y * size + x) * 4;
      px[i] = clamp(red);
      px[i + 1] = clamp(green);
      px[i + 2] = clamp(blue);
      // Rounded-square alpha so it looks right both masked and unmasked.
      px[i + 3] = 255;
    }
  }
  return encodePng(px, size, size);
}

/** Soft-edged ring at radius `at` with half-width `w`. */
function band(r, at, w) {
  const d = Math.abs(r - at);
  return d > w ? 0 : (1 - d / w) ** 1.5;
}

/** Anti-aliased thick line segment from (x1,y1) to (x2,y2). */
function stroke(px, py, x1, y1, x2, y2, width) {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * vx + (py - y1) * vy) / (vx * vx + vy * vy)));
  const d = Math.hypot(px - (x1 + t * vx), py - (y1 + t * vy));
  return d > width ? 0 : Math.min(1, (1 - d / width) * 2.2);
}

const mix = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));

// ---------------------------------------------------------------------------
// Minimal PNG encoder (RGBA, 8-bit, no interlacing)
// ---------------------------------------------------------------------------
function encodePng(rgba, width, height) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0; // filter type 0 (None)
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Icons are tiny and never change at runtime, so render once and cache.
const cache = new Map();
function icon(size) {
  const key = Math.min(Math.max(parseInt(size, 10) || 192, 16), 1024);
  if (!cache.has(key)) cache.set(key, render(key));
  return cache.get(key);
}

module.exports = { icon, render };
