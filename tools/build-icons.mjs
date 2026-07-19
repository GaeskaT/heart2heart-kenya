/* ============================================================================
   Generates the PWA icon set with zero image dependencies.

   Renders a white heart (the classic implicit curve
   (x²+y²−1)³ − x²y³ = 0) on a teal gradient, and writes real PNGs using a
   minimal encoder over Node's built-in zlib. Run: node tools/build-icons.mjs
   ============================================================================ */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "icons");
mkdirSync(outDir, { recursive: true });

/* ---- minimal PNG encoder (RGBA, 8-bit) ---- */
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function png(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   // 8-bit RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;                                        // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

/* ---- render one icon ---- */
const lerp = (a, b, t) => Math.round(a + (b - a) * t);
const TEAL_TOP = [18, 133, 127], TEAL_BOT = [10, 75, 71], WHITE = [255, 255, 255];

function render(N, { heartFrac = 0.58, round = 0 } = {}) {
  const buf = Buffer.alloc(N * N * 4);
  const s = (heartFrac * N) / 2.26;           // pixels per heart-unit (heart is ~2.26 wide)
  const r2 = round ? (round * N) : 0;          // corner radius in px (0 = full-bleed / maskable)
  for (let py = 0; py < N; py++) {
    for (let px = 0; px < N; px++) {
      const i = (py * N + px) * 4;
      // rounded-corner transparency (regular icon only)
      let alpha = 255;
      if (r2) {
        const dx = Math.max(r2 - px, 0, px - (N - 1 - r2));
        const dy = Math.max(r2 - py, 0, py - (N - 1 - r2));
        if (dx > 0 && dy > 0 && Math.hypot(dx, dy) > r2) alpha = 0;
      }
      // teal gradient background
      const t = py / (N - 1);
      let r = lerp(TEAL_TOP[0], TEAL_BOT[0], t), g = lerp(TEAL_TOP[1], TEAL_BOT[1], t), b = lerp(TEAL_TOP[2], TEAL_BOT[2], t);
      // heart (implicit curve), centred; a little anti-aliasing via a soft edge
      const hx = (px - N / 2) / s;
      const hy = (N / 2 - py) / s + 0.145;      // shift so the bbox sits centred
      const f = Math.pow(hx * hx + hy * hy - 1, 3) - hx * hx * Math.pow(hy, 3);
      if (f < 0) { r = WHITE[0]; g = WHITE[1]; b = WHITE[2]; }
      else if (f < 0.06) {                       // soft edge
        const m = 1 - f / 0.06;
        r = lerp(r, 255, m); g = lerp(g, 255, m); b = lerp(b, 255, m);
      }
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = alpha;
    }
  }
  return png(N, N, buf);
}

/* ---- write the set ---- */
const files = [
  ["icon-192.png", 192, { heartFrac: 0.58, round: 0.18 }],
  ["icon-512.png", 512, { heartFrac: 0.58, round: 0.18 }],
  ["icon-maskable-192.png", 192, { heartFrac: 0.52, round: 0 }],   // full-bleed for OS masking
  ["icon-maskable-512.png", 512, { heartFrac: 0.52, round: 0 }],
  ["icon-180.png", 180, { heartFrac: 0.58, round: 0 }],            // apple-touch (iOS rounds it)
];
for (const [name, size, opts] of files) {
  writeFileSync(join(outDir, name), render(size, opts));
  console.log("✓", name, `(${size}×${size})`);
}
console.log("Done → icons/");
