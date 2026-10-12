// Renders the extension icons and Chrome Web Store promo tiles from SVG/HTML
// with Playwright's Chromium. Run: pnpm store:assets
//   src/public/icons/icon{16,32,48,128}.png
//   store/promo-small-440x280.png, store/promo-marquee-1400x560.png
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ICON_DIR = path.join(ROOT, 'src/public/icons');
const STORE_DIR = path.join(ROOT, 'store');
mkdirSync(STORE_DIR, { recursive: true });

const INK = '#0e0e10';
const ACCENT = '#1f4cff';
const BG = '#f5f3ed';

// Shield + check (Lucide shield-check geometry) on a rounded ink square.
function iconSvg(size) {
  const small = size <= 16;
  const stroke = small ? 2.6 : size <= 32 ? 2.2 : 1.9;
  const pad = small ? 1.5 : 3;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
    <rect x="0" y="0" width="24" height="24" rx="${small ? 4 : 5.5}" fill="${INK}"/>
    <g transform="translate(${pad} ${pad}) scale(${(24 - pad * 2) / 24})" fill="none" stroke="#fff" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>
      <path d="m9 12 2 2 4-4" stroke="${small ? '#fff' : '#8fa6ff'}"/>
    </g>
  </svg>`;
}

const fontData = file => `data:font/woff2;base64,${readFileSync(path.join(ROOT, 'node_modules/@fontsource-variable', file)).toString('base64')}`;
const GEIST = fontData('geist/files/geist-latin-wght-normal.woff2');
const GEIST_MONO = fontData('geist-mono/files/geist-mono-latin-wght-normal.woff2');

function promoHtml(width, height) {
  const big = width > 1000;
  return `<!doctype html><html><head><style>
    @font-face { font-family: Geist; src: url('${GEIST}'); font-weight: 100 900; }
    @font-face { font-family: GeistMono; src: url('${GEIST_MONO}'); font-weight: 100 900; }
    html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; }
    body { background: ${BG}; background-image: radial-gradient(#d8d6cf 1px, transparent 1px); background-size: 14px 14px;
      font-family: Geist, sans-serif; color: ${INK}; display: flex; align-items: center; justify-content: center; }
    .card { background: #fff; border: 1px solid ${INK}; padding: ${big ? '56px 72px' : '26px 30px'}; display: flex; align-items: center; gap: ${big ? 40 : 20}px; }
    .name { font-size: ${big ? 56 : 27}px; font-weight: 600; letter-spacing: -0.02em; }
    .tag { font-family: GeistMono, monospace; text-transform: uppercase; letter-spacing: 0.07em; font-size: ${big ? 17 : 10}px; color: #7a7b80; margin-top: ${big ? 14 : 8}px; line-height: 1.6; }
    .accent { color: ${ACCENT}; }
  </style></head><body><div class="card">
    ${iconSvg(big ? 140 : 72)}
    <div><div class="name">Just Concentrate</div>
    <div class="tag">Block distractions on your schedule<br><span class="accent">Free · local · zero data collection</span></div></div>
  </div></body></html>`;
}

const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage();

for (const size of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><head><style>html,body{margin:0;width:${size}px;height:${size}px;overflow:hidden;background:transparent}svg{display:block}</style></head><body>${iconSvg(size)}</body></html>`);
  await page.screenshot({ path: path.join(ICON_DIR, `icon${size}.png`), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

for (const [w, h, name] of [[440, 280, 'promo-small-440x280.png'], [1400, 560, 'promo-marquee-1400x560.png']]) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(promoHtml(w, h), { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(STORE_DIR, name) });
}

await browser.close();
console.log('Icons and promo tiles written.');
