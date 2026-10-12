/* Read-only rendered audit. Supply QA_PLAYWRIGHT_MODULE if Playwright is bundled externally.
   node scripts/ui-qa.cjs before <artifact-directory>
   Never submits domain commands or resets data; only switches demo session cookies. */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.QA_PLAYWRIGHT_MODULE || 'playwright');
const widths = [320, 375, 390, 430, 768, 1024, 1440];
const routes = [
  '/', '/m', '/console', '/console/cases', '/console/cases/KS-0001',
  '/console/assistant', '/console/quality', '/console/cards', '/console/cards/FAC-RSHB',
  '/console/payments', '/console/payments/C-0001', '/console/pending', '/console/pending/TD-0001',
  '/console/precheck', '/console/precheck/C-0001', '/console/documents', '/console/documents/DOK-0001',
  '/console/import', '/console/standards', '/console/standards/STD-JANJI', '/console/audit',
  '/console/ai', '/console/ai/sessions', '/console/ai/sessions/SS-0001', '/console/ai/standards',
  '/console/ai/summary', '/console/ai/sandbox', '/console/ai/config', '/console/ai/evaluation',
  '/console/autopilot', '/faskes', '/faskes/klarifikasi', '/faskes/klarifikasi/KL-0008',
  '/faskes/temuan/F-0095', '/faskes/bukti', '/faskes/tindakan', '/faskes/bantahan', '/faskes/mutu',
];
const shots = new Set(['/', '/m', '/console', '/console/cases', '/console/cases/KS-0001', '/console/quality', '/console/payments', '/console/ai/config', '/console/ai/sandbox', '/faskes', '/faskes/klarifikasi/KL-0008']);
const phase = process.argv[2] || 'before';
const out = path.resolve(process.argv[3] || 'artifacts/ui-qa', phase);
const base = process.env.QA_BASE_URL || 'http://localhost:3002';
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.QA_BROWSER ? { executablePath: process.env.QA_BROWSER } : {}) });
  const context = await browser.newContext();
  await context.route('**/api/**', route => {
    const req = route.request();
    if (req.method() !== 'GET' && !req.url().endsWith('/api/session')) return route.abort('blockedbyclient');
    return route.continue();
  });
  await context.request.post(base + '/api/session', { data: { userId: 'U-ADM-1' } });
  const page = await context.newPage();
  let errors = [], failures = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('requestfailed', r => failures.push({ url: r.url(), error: r.failure()?.errorText }));
  const results = [];
  for (const route of (process.env.QA_ROUTES ? process.env.QA_ROUTES.split(',') : routes)) {
    let response;
    for (const width of widths) {
      errors = []; failures = [];
      await page.setViewportSize({ width, height: 900 });
      if (width === widths[0]) response = await page.goto(base + route, { waitUntil: 'networkidle', timeout: 60000 });
      await page.evaluate(() => document.fonts.ready);
      // Finish finite entrance motion before measuring and capturing.
      await page.waitForTimeout(350);
      if (route === '/') {
        await page.evaluate(async () => {
          for (const image of document.images) {
            image.scrollIntoView();
            await new Promise(r => setTimeout(r, 120));
            await image.decode().catch(() => {});
          }
          scrollTo(0, 0);
        });
      }
      const metrics = await page.evaluate(() => {
        const visible = e => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0;
        const overflow = [...document.querySelectorAll('body *')].filter(e => {
          if (!visible(e) || e.closest('nextjs-portal')) return false;
          const r = e.getBoundingClientRect();
          if (r.right <= innerWidth + 1 && r.left >= -1) return false;
          for (let p = e.parentElement; p; p = p.parentElement) {
            if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(p).overflowX)) return false;
          }
          return true;
        }).slice(0, 12).map(e => ({ tag: e.tagName, text: e.textContent?.trim().slice(0, 95), class: e.className, right: Math.round(e.getBoundingClientRect().right) }));
        const controls = [...document.querySelectorAll('button,input,select,textarea')].filter(e => visible(e) && !e.closest('nextjs-portal'));
        return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
          h1: [...document.querySelectorAll('h1')].map(e => e.textContent), overflow,
          smallControls: controls.filter(e => e.getBoundingClientRect().height < 32).slice(0, 10).map(e => ({ text: e.textContent?.trim().slice(0, 60), height: e.getBoundingClientRect().height })),
          brokenImages: [...document.images].filter(e => !e.complete || e.naturalWidth === 0).map(e => e.src),
      tables: [...document.querySelectorAll('table')].map(e => ({ width: Math.round(e.getBoundingClientRect().width), parentWidth: Math.round(e.parentElement.getBoundingClientRect().width), scrollable: !!e.closest('.scroll-x') })),
        };
      });
      const result = { route, width, status: response?.status(), finalUrl: page.url(), ...metrics, errors: [...new Set(errors)], failures };
      if (shots.has(route) && [320, 390, 768, 1440].includes(width)) {
        const file = (route === '/' ? 'landing' : route.slice(1).replaceAll('/', '-')) + '-' + width + '.png';
        await page.screenshot({ path: path.join(out, file), fullPage: true });
        result.screenshot = file;
      }
      results.push(result);
      fs.writeFileSync(path.join(out, 'matrix.json'), JSON.stringify(results, null, 2));
    }
    const rows = results.filter(r => r.route === route);
    console.log(JSON.stringify({ route, status: [...new Set(rows.map(r => r.status))], overflow: rows.filter(r => r.scrollWidth > r.width + 1).map(r => ({ width: r.width, scroll: r.scrollWidth, elements: r.overflow })), errors: [...new Set(rows.flatMap(r => r.errors))] }));
  }
  await browser.close();
})().catch(e => { console.error(e); process.exitCode = 1; });
