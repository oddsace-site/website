// Makes the website's share image (site/og-image.png on main, 1200x630) from tools/og-image.html, in the site's own
// fonts (tools/fonts) and its dark-mode header logo (tools/og-logo-dark.png).
// Usage: node tools/make-site-images.js <out dir>   (needs Playwright with Chromium, like make-report.js)
// Then copy <out dir>/og-image.png to site/og-image.png on main; that push is one Netlify publish.
// The icons on main are the website's square logo (the `logo` field in the page's JSON) at fixed sizes:
// site/favicon.ico (16, 32 and 48px in one file), site/logo.png (192px) and site/apple-touch-icon.png (180px on white).
// If the logo or the hero headline changes, remake all of them together.
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2] || '.';
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(__dirname, 'og-image.html'));
  await page.evaluate(() => document.fonts.ready);
  const failed = await page.evaluate(() => [...document.fonts].filter(f => f.status === 'error').map(f => f.family + ' ' + f.weight));
  if (failed.length) throw new Error('fonts failed to load: ' + failed.join(', '));
  await page.waitForTimeout(300);
  const file = path.join(out, 'og-image.png');
  await page.screenshot({ path: file });
  await browser.close();
  console.log('wrote ' + file);
})().catch(e => { console.error(e); process.exit(1); });
