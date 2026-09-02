// One-off generator for static Open Graph images. Run with:
//   node scripts/generate-og-images.mjs
// Outputs 1200x630 PNGs to public/og/*.png, which are referenced directly
// by <meta property="og:image"> in src/layouts/Layout.astro. Static (not
// generated per-request) so there's no runtime font/rendering dependency
// on the deploy target.

import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'public', 'og');

const W = 1200;
const H = 630;

function escapeXml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const pages = [
  {
    file: 'home.png',
    eyebrow: 'WEBINAR-FIRST GROWTH FOR INFO BUSINESSES',
    title: ['Before You Build Another Funnel,', 'Extract Everything From The Webinar.'],
    sub: 'WebinarOps operates the complete webinar revenue system for education businesses.',
  },
  {
    file: 'process.png',
    eyebrow: 'THE PROCESS',
    title: ['Forecast, build, operate,', 'extract. Expand last.'],
    sub: 'The eight-stage process WebinarOps runs to operate a webinar revenue system.',
  },
  {
    file: 'forecast.png',
    eyebrow: 'WEBINAR FORECAST',
    title: ['Model the economics', 'before you scale the spend.'],
    sub: 'Six guided steps, roughly nine minutes. Estimates, not guarantees.',
  },
];

async function loadLogoDataUri() {
  const buf = await readFile(path.join(root, 'public', 'assets', 'logo-primary-dark.png'));
  return `data:image/png;base64,${buf.toString('base64')}`;
}

function buildSvg({ eyebrow, title, sub, logoDataUri }) {
  const titleLines = title
    .map((line, i) => `<tspan x="88" dy="${i === 0 ? 0 : 74}">${escapeXml(line)}</tspan>`)
    .join('');

  // Logo is 1800x500 in source; render at a fixed display height, preserving aspect ratio.
  const logoH = 46;
  const logoW = Math.round((1800 / 500) * logoH);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="82%" cy="18%" r="65%">
      <stop offset="0%" stop-color="#2F6BFF" stop-opacity="0.28"/>
      <stop offset="55%" stop-color="#2F6BFF" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="hairline" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#2F6BFF" stop-opacity="0.15"/>
      <stop offset="70%" stop-color="#2F6BFF"/>
      <stop offset="100%" stop-color="#4AC7FF"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="#000000"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>

  <image x="88" y="72" width="${logoW}" height="${logoH}" href="${logoDataUri}"/>

  <g font-family="Liberation Sans, Arial, sans-serif">
    <text x="88" y="230" font-size="15" font-weight="700" letter-spacing="3" fill="#8D9AAF">${escapeXml(eyebrow)}</text>
    <text x="88" y="300" font-size="58" font-weight="700" letter-spacing="-1" fill="#ffffff">${titleLines}</text>
    <text x="88" y="470" font-size="21" font-weight="400" fill="#A8B3C4">${escapeXml(sub)}</text>
  </g>

  <rect x="88" y="530" width="220" height="3" fill="url(#hairline)"/>
  <text x="88" y="568" font-family="Liberation Sans, Arial, sans-serif" font-size="15" font-weight="700" letter-spacing="1" fill="#5D8BFF">WEBINAROPS.IO</text>
  <text x="1112" y="568" text-anchor="end" font-family="Liberation Sans, Arial, sans-serif" font-size="14" fill="#5A6474">Webinar First. Expansion Second.</text>
</svg>`;
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const logoDataUri = await loadLogoDataUri();

  for (const page of pages) {
    const svg = buildSvg({ ...page, logoDataUri });
    const outPath = path.join(outDir, page.file);
    await sharp(Buffer.from(svg)).png({ palette: false }).toFile(outPath);
    console.log('wrote', path.relative(root, outPath));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
