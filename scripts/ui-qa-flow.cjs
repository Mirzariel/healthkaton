/* Real survey/dialog flow on an isolated production database, never the main demo. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.QA_PLAYWRIGHT_MODULE || 'playwright');
const base = 'http://localhost:3003';
let browser;
(async () => {
  const out = path.resolve(process.argv[2] || 'artifacts/ui-qa', 'flow');
  fs.mkdirSync(out, { recursive: true });
  browser = await chromium.launch({ headless: true, ...(process.env.QA_BROWSER ? { executablePath: process.env.QA_BROWSER } : {}) });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [], responses = [], results = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.url().includes('/api/')) responses.push({ url: r.url(), status: r.status(), method: r.request().method() }); });
  await ctx.request.post(base + '/api/session', { data: { userId: 'U-PSR-1' } });
  await page.goto(base + '/m', { waitUntil: 'networkidle' });
  assert.equal(await page.getByRole('button', { name: 'Huruf besar', exact: true }).getAttribute('aria-pressed'), 'true');
  results.push({ name: 'default-font', passed: true });
  await page.getByRole('button', { name: 'Huruf sangat besar' }).click();
  if (!process.argv.includes('--resume')) {
  const invitation = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Satu pertanyaan singkat', exact: true }) });
  const [started] = await Promise.all([
    page.waitForResponse(r => r.url().startsWith(base + '/api/survey/sessions') && ['GET', 'POST'].includes(r.request().method())),
    invitation.getByRole('button', { name: /Mulai|Lanjutkan/ }).click(),
  ]);
  assert.equal(started.status(), 200);
  const data = await started.json();
  results.push({ name: 'directed-start', session: data.data.session.id, status: started.status() });
  await page.getByRole('button', { name: 'Berhenti sekarang', exact: true }).click();
  await page.getByRole('dialog', { name: 'Berhenti sekarang?' }).waitFor();
  await page.waitForTimeout(300);
  for (const width of [320, 375, 390, 430, 768]) {
    await page.setViewportSize({ width, height: 740 });
    await page.waitForTimeout(200);
    const bounds = await page.getByRole('dialog', { name: 'Berhenti sekarang?' }).boundingBox();
    assert.ok(bounds.x >= -1 && bounds.x + bounds.width <= width + 1 && bounds.y >= -1 && bounds.y + bounds.height <= 741);
    await page.screenshot({ path: path.join(out, `participant-stop-${width}.png`) });
    results.push({ name: 'stop-dialog', width, bounds });
  }
  for (let i = 0; i < 15; i++) await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => !!document.activeElement.closest('[role=dialog]')));
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Berhenti sekarang', exact: true }).evaluate(e => e === document.activeElement), true);
  results.push({ name: 'sheet-focus-and-escape', passed: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const [answered] = await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/answer') && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Saya lupa / tidak yakin', exact: true }).click(),
  ]);
  assert.equal(answered.status(), 200);
  const outcome = await answered.json();
  assert.equal(outcome.data.session.status, 'completed');
  await page.getByRole('button', { name: 'Kembali ke beranda', exact: true }).last().waitFor();
  await page.screenshot({ path: path.join(out, 'participant-completed-390.png') });
  results.push({ name: 'directed-unknown-completion', status: outcome.data.session.status, facts: outcome.data.facts.map(f => ({ slot: f.slot, value: f.value })) });
  await page.getByRole('button', { name: 'Kembali ke beranda', exact: true }).last().click();
  } else {
    results.push({ name: 'resume-read-only-checks', note: 'Survey completed in the preceding isolated run; stop-dialog and completed screenshots already saved.' });
  }
  // Delayed history exercises the existing loading state without changing server data.
  await page.route('**/api/survey/history', async route => { await new Promise(r => setTimeout(r, 800)); await route.continue(); });
  await page.getByRole('button', { name: 'Riwayat', exact: true }).click();
  assert.equal(await page.getByRole('status', { name: 'Memuat', exact: true }).count(), 1);
  await page.locator('main details').first().waitFor();
  results.push({ name: 'history-loading-to-data', passed: true });
  await page.getByRole('button', { name: 'Bantuan', exact: true }).click();
  await page.getByLabel('Bantuan apa yang Anda perlukan?').fill('Uji tampilan galat koneksi pada salinan QA.');
  await page.route('**/api/survey/help', route => route.abort());
  await page.getByRole('button', { name: 'Kirim permintaan', exact: true }).click();
  await page.locator('main [role="alert"]').waitFor();
  assert.ok((await page.locator('main [role="alert"]').innerText()).includes('Tidak ada sambungan'));
  await page.screenshot({ path: path.join(out, 'participant-network-error-390.png') });
  results.push({ name: 'network-error-feedback', passed: true, note: 'Expected intercepted failure; no help request saved.' });
  await ctx.request.post(base + '/api/session', { data: { userId: 'U-REV-1' } });
  await page.goto(base + '/console/cases/KS-0001', { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(out, 'reviewer-case-390.png'), fullPage: true });
  await ctx.request.post(base + '/api/session', { data: { userId: 'U-VER-1' } });
  await page.goto(base + '/console/cases/KS-0001', { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(out, 'verifier-case-390.png'), fullPage: true });
  await ctx.request.post(base + '/api/session', { data: { userId: 'U-ADM-1' } });
  await page.goto(base + '/console/quality', { waitUntil: 'networkidle' });
  const table = page.getByRole('region', { name: 'Gap laporan per indikator', exact: true });
  await table.focus(); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(200);
  assert.ok(await table.evaluate(e => e.scrollLeft > 0));
  results.push({ name: 'table-keyboard-scroll', passed: true });
  await page.getByRole('button', { name: 'Buka menu', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  const info = page.getByRole('button', { name: /Penjelasan/ }).first();
  if (await info.count()) { const b = await info.boundingBox(); assert.ok(b.width >= 32 && b.height >= 32); results.push({ name: 'touch-info-target', bounds: b }); }
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(out, 'flow.json'), JSON.stringify({ base, isolatedDatabase: 'data/ui-qa-isolated.db', results, responses, errors }, null, 2));
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => browser?.close());
