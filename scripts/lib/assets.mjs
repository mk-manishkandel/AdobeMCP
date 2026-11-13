/**
 * Generates placeholder assets for demos and live tests, with no dependencies:
 * a "campus" photo (PNG) and a round logo (SVG). Replace them with real files
 * by passing paths to the demo script.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Encodes an RGB image; pixel(x, y) returns [r, g, b]. */
export function encodePng(width, height, pixel) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const lerp = (a, b, t) => Math.round(a + (b - a) * t);
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];

/* Simple campus scene: sky, building with window grid, lawn. */
function campusPixel(w, h) {
  const horizon = h * 0.72;
  const bLeft = w * 0.18;
  const bRight = w * 0.82;
  const bTop = h * 0.3;
  return (x, y) => {
    if (y >= horizon) return mix([86, 160, 72], [52, 110, 48], (y - horizon) / (h - horizon));
    const inBuilding = x >= bLeft && x <= bRight && y >= bTop;
    const inTower = x >= w * 0.44 && x <= w * 0.56 && y >= h * 0.16;
    if (inBuilding || inTower) {
      const wx = (x - bLeft) % 60;
      const wy = (y - bTop) % 70;
      const isWindow = inBuilding && wx > 18 && wx < 46 && wy > 18 && wy < 52 && y < horizon - 30;
      return isWindow ? [255, 236, 170] : mix([228, 222, 210], [196, 188, 172], (x - bLeft) / (bRight - bLeft));
    }
    return mix([120, 180, 235], [214, 236, 250], y / horizon);
  };
}

export function placeholderLogoSvg(label = 'BIC') {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">',
    '<circle cx="200" cy="200" r="190" fill="#FFFFFF"/>',
    '<circle cx="200" cy="200" r="168" fill="none" stroke="#0B3D91" stroke-width="14"/>',
    `<text x="200" y="236" font-family="Helvetica" font-weight="bold" font-size="120" fill="#0B3D91" text-anchor="middle">${label}</text>`,
    '</svg>',
  ].join('\n');
}

/** Writes photo.png (1600x1000) and logo.svg into dir; returns their paths. */
export function writePlaceholderAssets(dir) {
  mkdirSync(dir, { recursive: true });
  const photo = join(dir, 'campus-placeholder.png');
  const logo = join(dir, 'logo-placeholder.svg');
  writeFileSync(photo, encodePng(1600, 1000, campusPixel(1600, 1000)));
  writeFileSync(logo, placeholderLogoSvg());
  return { photo, logo };
}
