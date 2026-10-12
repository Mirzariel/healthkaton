const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.QA_PLAYWRIGHT_MODULE || 'playwright');
const phase = process.argv[2] || 'before';
const out = path.resolve(process.argv[3] || 'artifacts/ui-qa', phase);
const base = process.env.QA_BASE_URL || 'http://localhost:3002';
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.QA_BROWSER ? { executablePath: process.env.QA_BROWSER } : {}) });
  const ctx = await browser.newContext({ viewport: { width: 320, height: 740 } });
  await ctx.route('**/api/**', route => route.request().method() === 'GET' || route.request().url().endsWith('/api/session') ? route.continue() : route.abort());
  await ctx.request.post(base + '/api/session', { data: { userId: 'U-ADM-1' } });
  const page = await ctx.newPage();
  const results = [];
  async function snap(name) {
    await page.screenshot({ path: path.join(out, name + '.png') });
    const metrics = await page.evaluate(() => ({ pageWidth: document.documentElement.scrollWidth, width: innerWidth,
      active: document.activeElement?.outerHTML.slice(0, 300),
      overflow: [...document.querySelectorAll('main,main div,main article,main p,main button,main select,main textarea')].filter(e => e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 2 && !e.closest('.scroll-x,[data-preview-viewport]') && !['auto','scroll'].includes(getComputedStyle(e).overflowX)).slice(0, 12).map(e => ({ tag: e.tagName, class: e.className, text: e.textContent.slice(0, 70), client: e.clientWidth, scroll: e.scrollWidth })),
    }));
    results.push({ name, ...metrics });
  }
  await page.goto(base + '/console', { waitUntil: 'networkidle' });
  const opener = page.getByRole('button', { name: 'Buka menu', exact: true });
  await opener.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  results.push({ name: 'drawer-open', focusInside: await page.evaluate(() => !!document.activeElement?.closest('dialog,[role=dialog]')) });
  for (let i = 0; i < 35; i++) await page.keyboard.press('Tab');
  results.push({ name: 'drawer-tab', focusInside: await page.evaluate(() => !!document.activeElement?.closest('dialog,[role=dialog]')) });
  await snap('console-drawer-320'); await page.keyboard.press('Escape');
  results.push({ name: 'drawer-escape', closed: await page.getByRole('dialog').count() === 0, focusRestored: await opener.evaluate(e => e === document.activeElement) });
  await page.goto(base + '/m', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Huruf sangat besar' }).click();
  await snap('participant-large-320');
  await page.getByRole('button', { name: 'Lapor', exact: true }).click();
  await snap('participant-report-320');
  await page.getByLabel('Ceritakan singkat').fill('Teks uji tampilan. Tidak dikirim.');
  await page.getByRole('button', { name: 'Riwayat', exact: true }).click();
  await page.waitForTimeout(800);
  const history = page.locator('main details summary');
  if (await history.count()) { await history.first().click(); await snap('participant-history-320'); }
  await page.getByRole('button', { name: 'Bantuan', exact: true }).click(); await snap('participant-help-320');
  await page.goto(base + '/faskes/mutu', { waitUntil: 'networkidle' });
  results.push({ name: 'facility-active-nav', rect: await page.locator('nav[aria-label="Menu portal faskes"] a[aria-current]').evaluate(e => ({ left: e.getBoundingClientRect().left, right: e.getBoundingClientRect().right, viewport: innerWidth })) });
  await snap('facility-quality-320');
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  results.push({ name: 'landing-menu-target', rect: await page.getByRole('button', { name: 'Buka menu' }).boundingBox() });
  await page.getByRole('button', { name: 'Buka menu' }).click(); await snap('landing-menu-320');
  await page.keyboard.press('Escape');
  results.push({ name: 'landing-escape', closed: await page.locator('#menu-beranda').count() === 0 });
  await page.goto(base + '/console/cases/KS-0001', { waitUntil: 'networkidle' });
  await page.getByText('Tugaskan ulang', { exact: true }).click(); await snap('case-assignment-320');
  await page.goto(base + '/console/ai/sandbox', { waitUntil: 'networkidle' });
  await page.getByLabel('Bandingkan A dan B').uncheck();
  await page.waitForTimeout(200);
  results.push({ name: 'sandbox-toggle', disabledB: await page.locator('fieldset').filter({ has: page.getByText('Varian B', { exact: true }) }).locator('select').first().isDisabled() });
  await snap('sandbox-form-320');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(base + '/console', { waitUntil: 'networkidle' });
  results.push({ name: 'reduced-motion', duration: await page.locator('main > div').first().evaluate(e => getComputedStyle(e).animationDuration) });
  fs.writeFileSync(path.join(out, 'interactions.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})().catch(e => { console.error(e); process.exitCode = 1; });
