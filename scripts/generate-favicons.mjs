// One-off generator for favicon assets, run with:
//   node scripts/generate-favicons.mjs
// Source: public/assets/mark-dark.png. That file is actually a combined
// "WO" monogram (a white W overlapping a blue ring "O") — too wide/detailed
// to read at 16x16, and the W's rightmost stroke clips into the ring's
// bounding box. So this crops to the ring only and strips the near-white
// pixels (the intruding bit of the W) by alpha, leaving a clean blue ring.

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const srcPath = path.join(root, 'public', 'assets', 'mark-dark.png');
const outDir = path.join(root, 'public');

// Tight square crop around the ring mark within the 1000x1000 source canvas.
const CROP = { left: 400, top: 180, width: 530, height: 530 };
const WHITE_THRESHOLD = 200; // R,G,B all above this -> treat as the W, drop it

async function ringOnlyBuffer() {
  const { data, info } = await sharp(srcPath)
    .extract(CROP)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i] > WHITE_THRESHOLD && data[i + 1] > WHITE_THRESHOLD && data[i + 2] > WHITE_THRESHOLD) {
      data[i + 3] = 0;
    }
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const ringPng = await ringOnlyBuffer();
  const base = sharp(ringPng);

  for (const size of [16, 32, 48, 96]) {
    await base
      .clone()
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(path.join(outDir, `favicon-${size}x${size}.png`));
    console.log('wrote', `favicon-${size}x${size}.png`);
  }

  // Apple touch icon: opaque background per Apple's guidance (transparent
  // icons render unpredictably on iOS), with a little padding. flatten()
  // composites the ring's alpha onto solid black *before* resize/extend,
  // so the padding added by both matches seamlessly.
  await base
    .clone()
    .flatten({ background: '#000000' })
    .resize(140, 140, { fit: 'contain', background: '#000000' })
    .extend({ top: 20, bottom: 20, left: 20, right: 20, background: '#000000' })
    .png()
    .toFile(path.join(outDir, 'apple-touch-icon.png'));
  console.log('wrote apple-touch-icon.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
