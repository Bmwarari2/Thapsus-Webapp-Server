/**
 * utils/influencerOgImage.js
 *
 * Generates the per-influencer link-preview image (1200×630 PNG) with the
 * influencer's name rendered onto a branded card. Served at /i/<CODE>/og.png
 * and referenced from the og:image / twitter:image tags so a WhatsApp /
 * iMessage / Telegram unfurl shows a personalised graphic, not the generic
 * site photo.
 *
 * We hand-write an SVG and rasterise it with @resvg/resvg-js using a bundled
 * Liberation Sans font (assets/fonts) — `loadSystemFonts: false` so rendering
 * is identical on a laptop and on a slim production container with no fonts
 * installed. Results are cached in-memory by name (names rarely change).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
// Load the font bytes once at module init.
const FONT_BUFFERS = [
  readFileSync(path.join(FONT_DIR, 'LiberationSans-Bold.ttf')),
  readFileSync(path.join(FONT_DIR, 'LiberationSans-Regular.ttf')),
];

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Pick a name font-size that keeps long names on one line, and hard-truncate
// anything unreasonable so the card never overflows.
function fitName(name) {
  const n = String(name || '').trim().replace(/\s+/g, ' ');
  const text = n.length > 26 ? `${n.slice(0, 25).trimEnd()}…` : n;
  let size = 100;
  if (text.length > 10) size = 84;
  if (text.length > 16) size = 68;
  if (text.length > 21) size = 56;
  return { text, size };
}

/** Build the SVG card for an influencer name. Exported for testing. */
export function buildInfluencerOgSvg(name) {
  const { text, size } = fitName(name);
  const safe = escapeXml(text);
  return `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b1220"/>
      <stop offset="1" stop-color="#1e3a5f"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.05" r="0.75">
      <stop offset="0" stop-color="#f97316" stop-opacity="0.38"/>
      <stop offset="1" stop-color="#f97316" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect x="0" y="0" width="1200" height="630" fill="none" stroke="#f97316" stroke-opacity="0.18" stroke-width="2"/>
  <text x="600" y="150" text-anchor="middle" font-family="Liberation Sans" font-weight="700" font-size="30" letter-spacing="10" fill="#fb923c">YOU'VE BEEN INVITED</text>
  <text x="600" y="298" text-anchor="middle" font-family="Liberation Sans" font-weight="700" font-size="${size}" fill="#ffffff">${safe}</text>
  <text x="600" y="376" text-anchor="middle" font-family="Liberation Sans" font-weight="400" font-size="40" fill="#cbd5e1">invited you to Thapsus Cargo</text>
  <rect x="540" y="428" width="120" height="4" rx="2" fill="#f97316"/>
  <text x="600" y="512" text-anchor="middle" font-family="Liberation Sans" font-weight="700" font-size="34" letter-spacing="2" fill="#e2e8f0">SHIP FROM THE UK TO KENYA</text>
  <text x="600" y="580" text-anchor="middle" font-family="Liberation Sans" font-weight="700" font-size="26" letter-spacing="8" fill="#7c8aa0">THAPSUS CARGO</text>
</svg>`;
}

// Cache rendered PNGs by name so repeat crawler hits are free.
const cache = new Map();

/** Render (and cache) the 1200×630 PNG for an influencer name. */
export function renderInfluencerOgPng(name) {
  const key = String(name || '');
  const hit = cache.get(key);
  if (hit) return hit;

  const svg = buildInfluencerOgSvg(name);
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
    background: '#0b1220',
    font: {
      fontBuffers: FONT_BUFFERS,
      loadSystemFonts: false,
      defaultFontFamily: 'Liberation Sans',
    },
  });
  const png = resvg.render().asPng();

  if (cache.size > 500) cache.clear(); // crude bound; names are few
  cache.set(key, png);
  return png;
}

export default renderInfluencerOgPng;
