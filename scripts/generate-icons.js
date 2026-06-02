/**
 * Generates simple PWA icons (gold "F" on dark background).
 * Run: node scripts/generate-icons.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c = 0xffffffff;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    return t;
  })());
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function createPng(size) {
  const bg = [0x1c, 0x1c, 0x1e];
  const gold = [0xff, 0xd1, 0x66];
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1) + 1;
    raw[rowStart - 1] = 0;
    for (let x = 0; x < size; x++) {
      const i = rowStart + x * 4;
      let inside = false;
      const nx = (x - cx) / r;
      const ny = (y - cy) / r;
      if (ny >= -0.85 && ny <= 0.85) {
        if (ny <= -0.1 && nx >= -0.75 && nx <= 0.75) inside = true;
        if (ny > -0.1 && ny < 0.15 && nx >= -0.75 && nx <= 0.2) inside = true;
        if (ny >= 0.15 && ny <= 0.45 && nx >= -0.75 && nx <= 0.55) inside = true;
      }
      const color = inside ? gold : bg;
      raw[i] = color[0];
      raw[i + 1] = color[1];
      raw[i + 2] = color[2];
      raw[i + 3] = 255;
    }
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const outDir = path.join(__dirname, '..', 'public');
fs.writeFileSync(path.join(outDir, 'icon-192.png'), createPng(192));
fs.writeFileSync(path.join(outDir, 'icon-512.png'), createPng(512));
console.log('Wrote public/icon-192.png and public/icon-512.png');
