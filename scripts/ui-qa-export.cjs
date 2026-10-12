/* Capture the product section from the production app, without editing any image. */
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(process.env.QA_PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const out = path.resolve(process.argv[2] || 'artifacts/ui-qa');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.QA_BROWSER ? { executablePath: process.env.QA_BROWSER } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  await page.goto(process.env.QA_BASE_URL || 'http://localhost:3003', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.locator('#produk').scrollIntoViewIfNeeded();
  // A fixed page header is unrelated to this presentation capture.
  await page.addStyleTag({ content: 'body > div > header { visibility: hidden; }' });
  await page.waitForTimeout(400);
  const file = path.join(out, 'SEHATI-product-showcase-2x.png');
  await page.locator('#produk').screenshot({ path: file });
  console.log(file);
  console.log(await page.locator('[data-preview-viewport]').evaluateAll(els => els.map(e => ({ logical: e.dataset.previewViewport, width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height, aspect: e.getBoundingClientRect().width / e.getBoundingClientRect().height }))));
  await browser.close();
})().catch(e => { console.error(e); process.exitCode = 1; });
