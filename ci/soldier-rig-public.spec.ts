import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.TARGET_URL!;
const expectedSha = process.env.EXPECTED_PRODUCT_SHA!;
const out = path.resolve('artifacts/soldier-rig-public');
mkdirSync(out, { recursive: true });

async function shot(locator: Locator, name: string, files: string[]) {
  await locator.screenshot({ path: path.join(out, name) });
  files.push(name);
}

async function phase(page: Page, value: number) {
  await page.locator('#phase-slider').evaluate((el, v) => {
    const input = el as HTMLInputElement;
    input.value = String(v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await expect(page.locator('#phase-output')).toHaveText(`${value}%`);
}

async function size(page: Page, value: number) {
  await page.locator(`.size-chip[data-size="${value}"]`).click();
  await expect(page.locator(`.size-chip[data-size="${value}"]`)).toHaveClass(/active/);
}

async function preset(page: Page, id: string) {
  await page.locator(`.preset[data-scene="${id}"]`).click();
  await page.waitForTimeout(80);
}

test('public deployed soldier rig renders every acceptance state', async ({ page, request }) => {
  const files: string[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('vercel.live')) consoleErrors.push(m.text()); });
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('requestfailed', r => {
    if (!r.url().includes('vercel.live') && !r.url().includes('/.well-known/vercel/')) requestFailures.push(`${r.method()} ${r.url()} ${r.failure()?.errorText ?? ''}`);
  });

  const sourceResponse = await request.get(`${baseUrl}/deployment-source.json`);
  expect(sourceResponse.status()).toBe(200);
  const source = await sourceResponse.json();
  expect(source.sourceSha).toBe(expectedSha);
  expect(source.verificationStatus).toBe('passed');
  expect(source.skippedChecks ?? []).toEqual([]);

  const response = await page.goto(`${baseUrl}/soldier-topdown-prototype.html`, { waitUntil: 'networkidle' });
  expect(response?.status()).toBe(200);
  await expect(page.locator('#soldier-prototype-root')).toBeVisible();
  await expect(page.locator('#pose-gallery canvas')).toHaveCount(12);
  await expect(page.locator('#build-id')).toContainText(expectedSha.slice(0, 12));

  await page.screenshot({ path: path.join(out, '00-full-page.png'), fullPage: true }); files.push('00-full-page.png');
  await shot(page.locator('#pose-gallery'), '01-all-12-poses.png', files);
  await shot(page.locator('#direction-gallery'), '02-eight-directions.png', files);
  await shot(page.locator('#weapon-gallery'), '03-mosin-ppsh-dp27.png', files);
  await shot(page.locator('#size-gallery'), '04-size-24-32-48-64.png', files);

  await page.locator('button[data-tab="range"]').click();
  const stage = page.locator('#range-stage');
  if (await page.locator('#selected').isChecked()) await page.locator('#selected').uncheck();
  await size(page, 32);
  await preset(page, 'manual');
  for (const pose of ['idle','ready','walk','run','crouch','crouchMove','crouchRun','prone','proneAim','crawl','standAim','crouchAim']) {
    await page.locator('#pose-select').selectOption(pose);
    await phase(page, ['walk','run','crouchMove','crouchRun','crawl'].includes(pose) ? 18 : 0);
    await shot(stage, `05-pose-${pose}.png`, files);
  }

  await page.locator('#pose-select').selectOption('run');
  await phase(page, 18);
  await preset(page, 'directions');
  await shot(stage, '06-run-eight-directions.png', files);

  await preset(page, 'weapons');
  await shot(stage, '07-weapons-range.png', files);

  await preset(page, 'low');
  for (const p of [15, 40, 65]) { await phase(page, p); await shot(stage, `08-low-phase-${p}.png`, files); }

  await preset(page, 'ground');
  for (const p of [10, 35, 60]) { await phase(page, p); await shot(stage, `09-ground-phase-${p}.png`, files); }

  await preset(page, 'manual');
  await page.locator('#pose-select').selectOption('proneAim');
  await page.locator('#weapon-select').selectOption('dp27');
  await size(page, 64);
  await phase(page, 0);
  await shot(stage, '10-dp27-prone-aim-64.png', files);

  await size(page, 32);
  await preset(page, 'split');
  await expect(page.locator('#body-output')).toHaveText('0°');
  await expect(page.locator('#attention-output')).toHaveText('35°');
  await expect(page.locator('#weapon-output')).toHaveText('70°');
  await shot(stage, '11-split-directions.png', files);

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(requestFailures).toEqual([]);
  writeFileSync(path.join(out, 'evidence.json'), JSON.stringify({ baseUrl, expectedSha, screenshots: files, consoleErrors, pageErrors, requestFailures }, null, 2));
});
