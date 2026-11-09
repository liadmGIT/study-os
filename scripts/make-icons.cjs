// Draws the app icon (a serif "ל" on paper, with the notebook's red margin) and writes the PNG sizes
// the PWA needs into web/public/icons. Needs Playwright and `npm install` (for the font).
//   node scripts/make-icons.cjs
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const dir = path.join(__dirname, '../web/public/icons');
const fontFile = path.join(__dirname, '../node_modules/@fontsource/frank-ruhl-libre/files/frank-ruhl-libre-hebrew-700-normal.woff2');
const font = fs.readFileSync(fontFile).toString('base64');

const PAPER = '#f5f1e8';
const INK = '#1f1c17';
const RED = '#b42318';

/** size: canvas px; inset: safe-zone padding (maskable); round: corner radius ratio; mono: white glyph only. */
function html(size, { inset = 0, round = 0.22, mono = false } = {}) {
  const s = size - inset * 2;
  const bg = mono ? 'transparent' : PAPER;
  const glyph = mono ? '#fff' : INK;
  const rule = (x) =>
    mono ? '' : `<div style="position:absolute;top:0;bottom:0;right:${x}px;width:${Math.max(1, s * 0.012)}px;background:${RED};opacity:.75"></div>`;
  return `<!doctype html><html><head><style>
    @font-face{font-family:F;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:700}
    html,body{margin:0;background:${mono ? 'transparent' : inset ? PAPER : 'transparent'}}
  </style></head><body>
  <div style="position:relative;width:${s}px;height:${s}px;margin:${inset}px;background:${bg};border-radius:${inset ? 0 : s * round}px;overflow:hidden">
    ${rule(s * 0.14)}${rule(s * 0.14 + s * 0.035)}
    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:F;font-weight:700;font-size:${s * 0.78}px;line-height:1;color:${glyph};padding-top:${s * 0.04}px;padding-right:${s * 0.06}px">ל</div>
  </div></body></html>`;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const render = async (file, size, opts = {}) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(html(size, opts));
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(dir, file), omitBackground: true });
  };
  await render('icon-192.png', 192);
  await render('icon-512.png', 512);
  await render('favicon-32.png', 32, { round: 0.18 });
  await render('apple-touch-icon.png', 180, { round: 0 });
  await render('icon-maskable-512.png', 512, { inset: 56 }); // keeps the letter inside Android's safe circle
  await render('badge-96.png', 96, { mono: true });
  await browser.close();
  console.log('icons written to', dir);
})();
