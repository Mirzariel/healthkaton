/* Export native DOM previews as separate transparent PNGs for presentations. */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.QA_PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const out = path.resolve(process.argv[2] || 'artifacts/ui-qa');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.QA_BROWSER ? { executablePath: process.env.QA_BROWSER } : {}) });
  for (const device of ['tablet', 'handphone']) {
    const width = device === 'tablet' ? 1120 : 375;
    const height = device === 'tablet' ? 700 : 812;
    const bezel = device === 'tablet' ? 14 : 9;
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 3 });
    await page.goto(process.env.QA_BASE_URL || 'http://localhost:3003', { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(({ width, height, bezel, device }) => {
      const preview = document.querySelector(`[data-preview-viewport="${width}x${height}"] [data-preview-content]`).firstElementChild.cloneNode(true);
      // The tablet runs the console; browser-window dots are not tablet hardware.
      if (device === 'tablet') preview.firstElementChild.remove();
      document.documentElement.style.background = 'transparent';
      Object.assign(document.body.style, { background: 'transparent', margin: '0', display: 'block', minHeight: '0' });
      const exportRoot = document.createElement('div');
      exportRoot.id = 'device-export';
      Object.assign(exportRoot.style, { width: `${width + bezel * 2 + 48}px`, padding: '24px', background: 'transparent' });
      const frame = document.createElement('div');
      Object.assign(frame.style, { width: `${width + bezel * 2}px`, padding: `${bezel}px`, borderRadius: device === 'tablet' ? '44px' : '48px', background: 'var(--ink)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.22), 0 6px 18px rgba(0,0,0,.18)' });
      const screen = document.createElement('div');
      Object.assign(screen.style, { width: `${width}px`, height: `${height}px`, borderRadius: device === 'tablet' ? '30px' : '39px', overflow: 'hidden', background: 'var(--paper)' });
      screen.append(preview); frame.append(screen); exportRoot.append(frame); document.body.replaceChildren(exportRoot);
    }, { width, height, bezel, device });
    await page.locator('#device-export').screenshot({ path: path.join(out, `SEHATI-${device}-transparent.png`), omitBackground: true });
    console.log(path.join(out, `SEHATI-${device}-transparent.png`));
    await page.close();
  }
  await browser.close();
})().catch(e => { console.error(e); process.exitCode = 1; });
