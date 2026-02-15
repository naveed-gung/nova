/**
 * PNG Icon Generator for Nova
 *
 * Generates properly-sized PNG icons for iOS and PWA manifests.
 * Uses only Node.js built-in modules (fs + zlib) — no external dependencies.
 *
 * Usage: node scripts/generate-icons.js
 */

import { writeFileSync, mkdirSync } from "fs";
import { deflateSync } from "zlib";

// ── CRC-32 ────────────────────────────────────────────────
const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++)
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// ── PNG helpers ───────────────────────────────────────────
function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([len, typeAndData, checksum]);
}

/**
 * Create a valid PNG buffer with an RGBA purple circle icon.
 * @param {number} size - Width and height in pixels.
 */
function createIconPNG(size) {
  const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Brand colours
  const PRIMARY = [155, 135, 245]; // #9b87f5
  const BG = [10, 10, 15]; // dark background

  // Raw pixel data with filter byte per scanline
  const rowBytes = 1 + size * 4; // filter byte + RGBA
  const raw = Buffer.alloc(size * rowBytes);

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.45; // circle radius
  const edgeSmooth = 1.5; // anti-alias width in px

  for (let y = 0; y < size; y++) {
    const rowOff = y * rowBytes;
    raw[rowOff] = 0; // filter: none

    for (let x = 0; x < size; x++) {
      const px = rowOff + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= outerR - edgeSmooth) {
        // Inside circle — solid primary
        raw[px] = PRIMARY[0];
        raw[px + 1] = PRIMARY[1];
        raw[px + 2] = PRIMARY[2];
        raw[px + 3] = 255;
      } else if (dist <= outerR + edgeSmooth) {
        // Anti-aliased edge
        const t = 1 - (dist - (outerR - edgeSmooth)) / (edgeSmooth * 2);
        raw[px] = PRIMARY[0];
        raw[px + 1] = PRIMARY[1];
        raw[px + 2] = PRIMARY[2];
        raw[px + 3] = Math.round(255 * Math.max(0, Math.min(1, t)));
      } else {
        // Outside — background
        raw[px] = BG[0];
        raw[px + 1] = BG[1];
        raw[px + 2] = BG[2];
        raw[px + 3] = 255;
      }
    }
  }

  // Draw a simple "N" letter in the centre (white)
  const letterScale = size * 0.35;
  const letterX = cx - letterScale / 2;
  const letterY = cy - letterScale / 2;
  const strokeW = Math.max(2, Math.round(size * 0.06));

  function setPixel(x, y) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= size || iy >= size) return;
    const off = iy * rowBytes + 1 + ix * 4;
    raw[off] = 255;
    raw[off + 1] = 255;
    raw[off + 2] = 255;
    raw[off + 3] = 255;
  }

  // Draw thick lines for "N": left vertical, diagonal, right vertical
  for (let t = 0; t <= 1; t += 0.5 / letterScale) {
    const ly = letterY + t * letterScale;
    // Left vertical
    for (let w = 0; w < strokeW; w++) setPixel(letterX + w, ly);
    // Right vertical
    for (let w = 0; w < strokeW; w++)
      setPixel(letterX + letterScale - strokeW + w, ly);
    // Diagonal
    const dx = letterX + t * letterScale;
    for (let w = 0; w < strokeW; w++) setPixel(dx + w, ly);
  }

  const compressed = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    SIG,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", compressed),
    makeChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── Generate icons ────────────────────────────────────────
const ICONS = [
  { name: "apple-touch-icon-180x180.png", size: 180 },
  { name: "icon-192x192.png", size: 192 },
  { name: "icon-512x512.png", size: 512 },
];

const outDir = "public/icons";
mkdirSync(outDir, { recursive: true });

for (const { name, size } of ICONS) {
  const png = createIconPNG(size);
  const path = `${outDir}/${name}`;
  writeFileSync(path, png);
  console.log(`  ✓ ${path} (${size}×${size}, ${png.length} bytes)`);
}

console.log("\nDone — PNG icons generated.");
