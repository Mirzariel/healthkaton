/* The marketing preview must render before hydration, including without JavaScript. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.QA_PLAYWRIGHT_MODULE || 'playwright');
const out = path.resolve(process.argv[2] || 'artifacts/ui-qa/preview');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.QA_BROWSER ? { executablePath: process.env.QA_BROWSER } : {}) });
  const results = [];
  try {
    for (const javaScriptEnabled of [false, true]) {
      const context = await browser.newContext({ javaScriptEnabled });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        if (width === 320) await page.goto(process.env.QA_BASE_URL || 'http://localhost:3002', { waitUntil: 'networkidle' });
        await page.waitForTimeout(300);
        // Locator evaluation is browser instrumentation, even in the no-script context.
        const previews = await page.locator('[data-preview-viewport]').evaluateAll(els => els.map(el => {
          const content = el.querySelector('[data-preview-content]') || el.firstElementChild;
          const r = el.getBoundingClientRect();
          return { logical: el.dataset.previewViewport, width: r.width, height: r.height,
            visible: r.width > 0 && getComputedStyle(content).visibility !== 'hidden',
            text: content.textContent.includes('bronkoskopi'),
          };
        }));
        const metrics = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth }));
        const row = { javaScriptEnabled, width, previews, errors: [...errors], ...metrics };
        results.push(row);
        if ([320, 1440].includes(width)) await page.locator('#produk').screenshot({ path: path.join(out, `preview-${javaScriptEnabled ? 'js' : 'no-js'}-${width}.png`) });
      }
      await context.close();
    }
    fs.writeFileSync(path.join(out, 'preview.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
    if (process.env.QA_ASSERT === '1') for (const row of results) {
      assert.equal(row.page, row.viewport);
      assert.deepEqual(row.errors, []);
      for (const preview of row.previews) if (preview.width > 0) {
        assert.equal(preview.visible, true);
        assert.equal(preview.text, true);
        const [w, h] = preview.logical.split('x').map(Number);
        assert.ok(Math.abs(preview.width / preview.height - w / h) < 0.002);
      }
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
