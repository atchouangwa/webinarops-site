// One-off: convert the large dashboard/background PNGs to WebP for a much
// smaller payload (these are photographic/gradient-heavy screenshots,
// where lossless PNG is a poor fit). Run with:
//   node scripts/compress-images.mjs

import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const assetsDir = path.join(root, 'public', 'assets');

const TARGETS = ['dash-acquisition.png', 'dash-portfolio.png', 'dash-today.png', 'bg-pulse-rings.png', 'bg-signal-wave.png'];

async function main() {
  for (const file of TARGETS) {
    const src = path.join(assetsDir, file);
    const dest = src.replace(/\.png$/, '.webp');
    const before = (await stat(src)).size;
    await sharp(src).webp({ quality: 82 }).toFile(dest);
    const after = (await stat(dest)).size;
    console.log(`${file} -> ${path.basename(dest)}: ${(before / 1024).toFixed(0)}KB -> ${(after / 1024).toFixed(0)}KB (${(100 - (after / before) * 100).toFixed(0)}% smaller)`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
