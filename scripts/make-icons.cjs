// Renders web/public/icons/icon.svg into the PNG sizes the PWA needs. Needs Playwright.
//   node scripts/make-icons.cjs
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const dir = path.join(__dirname, '../web/public/icons');
const svg = fs.readFileSync(path.join(dir, 'icon.svg'), 'utf8');
const b64 = Buffer.from(svg).toString('base64');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const render = async (file, size, { pad = 0, bg = 'transparent', mono = false, radius = true } = {}) => {
    await page.setViewportSize({ width: size, height: size });
    const inner = size - pad * 2;
    const filter = mono ? 'filter: brightness(0) invert(1);' : '';
    const img = `<img src="data:image/svg+xml;base64,${b64}" style="width:${inner}px;height:${inner}px;margin:${pad}px;display:block;${filter}${radius ? '' : 'border-radius:0'}">`;
    await page.setContent(`<html><body style="margin:0;background:${bg}">${img}</body></html>`);
    await page.screenshot({ path: path.join(dir, file), omitBackground: bg === 'transparent' });
  };
  await render('icon-192.png', 192);
  await render('icon-512.png', 512);
  await render('apple-touch-icon.png', 180, { bg: '#1f2a44' });
  await render('icon-maskable-512.png', 512, { pad: 64, bg: '#1f2a44' });
  await render('badge-96.png', 96, { mono: true });
  await browser.close();
  console.log('icons written to', dir);
})();
