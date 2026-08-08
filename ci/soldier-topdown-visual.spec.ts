import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.TARGET_URL!;
const expectedSha = process.env.EXPECTED_PRODUCT_SHA!;
const featureBranch = process.env.CANONICAL_FEATURE_BRANCH!;
const outputDir = path.resolve('artifacts/vercel-e2e');

interface Evidence {
  targetUrl: string;
  canonicalFeatureBranch: string;
  expectedProductSha: string;
  observedProductSha: string;
  productShaMatch: boolean;
  stage: string;
  screenshots: string[];
  consoleErrors: string[];
  pageErrors: string[];
  requestFailures: string[];
  ignoredServiceFailures: string[];
}

mkdirSync(outputDir, { recursive: true });

function isVercelService(urlOrText: string): boolean {
  return urlOrText.includes('vercel.live') || urlOrText.includes('_next-live') || urlOrText.includes('/.well-known/vercel/');
}

async function shot(locator: Locator, name: string, evidence: Evidence) {
  await locator.screenshot({ path: path.join(outputDir, name) });
  evidence.screenshots.push(name);
}

async function setPhase(page: Page, value: number) {
  const slider = page.locator('#phase-slider');
  await slider.evaluate((element, next) => {
    const input = element as HTMLInputElement;
    input.value = String(next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await expect(page.locator('#phase-output')).toHaveText(`${value}%`);
  await page.waitForTimeout(80);
}

async function chooseSize(page: Page, value: number) {
  await page.locator(`.size-chip[data-size="${value}"]`).click();
  await expect(page.locator(`.size-chip[data-size="${value}"]`)).toHaveClass(/active/);
  await page.waitForTimeout(60);
}

async function choosePreset(page: Page, id: string, title: RegExp) {
  await page.locator(`.preset[data-scene="${id}"]`).click();
  await expect(page.locator('#stage-title')).toHaveText(title);
  await page.waitForTimeout(80);
}

test('deployed Soviet soldier prototype passes exact-SHA visual QA', async ({ page, request }) => {
  const evidence: Evidence = {
    targetUrl: `${baseUrl}/soldier-topdown-prototype.html`,
    canonicalFeatureBranch: featureBranch,
    expectedProductSha: expectedSha,
    observedProductSha: 'unavailable',
    productShaMatch: false,
    stage: 'started',
    screenshots: [],
    consoleErrors: [],
    pageErrors: [],
    requestFailures: [],
    ignoredServiceFailures: [],
  };

  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (isVercelService(text)) evidence.ignoredServiceFailures.push(`console: ${text}`);
    else evidence.consoleErrors.push(text);
  });
  page.on('pageerror', (error) => evidence.pageErrors.push(error.message));
  page.on('requestfailed', (failed) => {
    const text = `${failed.method()} ${failed.url()} :: ${failed.failure()?.errorText ?? 'unknown'}`;
    if (isVercelService(failed.url()) || (failed.method() === 'HEAD' && failed.url() === evidence.targetUrl)) evidence.ignoredServiceFailures.push(text);
    else evidence.requestFailures.push(text);
  });

  try {
    const response = await page.goto(evidence.targetUrl, { waitUntil: 'networkidle' });
    expect(response?.status() ?? 0).toBeLessThan(400);
    await expect(page.locator('#soldier-prototype-root')).toBeVisible();
    await expect(page.locator('#pose-gallery canvas')).toHaveCount(12);
    evidence.stage = 'deployment-loaded';

    const sourceResponse = await request.get(`${baseUrl}/deployment-source.json`);
    expect(sourceResponse.status()).toBe(200);
    const source = await sourceResponse.json();
    evidence.observedProductSha = source.sourceSha ?? 'unavailable';
    evidence.productShaMatch = evidence.observedProductSha === expectedSha;
    expect(evidence.productShaMatch).toBeTruthy();
    await expect(page.locator('#build-id')).toContainText(expectedSha.slice(0, 12));
    evidence.stage = 'product-identity-read';

    await page.screenshot({ path: path.join(outputDir, '00-full-gallery.png'), fullPage: true });
    evidence.screenshots.push('00-full-gallery.png');
    await shot(page.locator('#pose-gallery'), '01-all-poses-48px.png', evidence);
    await shot(page.locator('#direction-gallery'), '02-eight-directions-gallery.png', evidence);
    await shot(page.locator('#weapon-gallery'), '03-three-weapons.png', evidence);
    await shot(page.locator('#size-gallery'), '04-size-matrix-24-32-48-64.png', evidence);
    evidence.stage = 'gallery-captured';

    await page.locator('button[data-tab="range"]').click();
    await expect(page.locator('#range-panel')).toHaveClass(/active/);
    const stage = page.locator('#range-stage');
    await expect(page.locator('#range-canvas')).toBeVisible();
    if (await page.locator('#selected').isChecked()) await page.locator('#selected').uncheck();

    await chooseSize(page, 32);
    await choosePreset(page, 'manual', /Ручная настройка/);
    const poses = ['idle','ready','walk','run','crouch','crouchMove','crouchRun','prone','proneAim','crawl','standAim','crouchAim'];
    for (const pose of poses) {
      await page.locator('#pose-select').selectOption(pose);
      await setPhase(page, ['walk','run','crouchMove','crouchRun','crawl'].includes(pose) ? 18 : 0);
      await expect(page.locator('#stage-detail')).toContainText('32 px');
      await shot(stage, `05-pose-32-${pose}.png`, evidence);
    }
    evidence.stage = 'all-poses-32px-captured';

    await page.locator('#pose-select').selectOption('run');
    await page.locator('#weapon-select').selectOption('mosin');
    await setPhase(page, 18);
    await choosePreset(page, 'directions', /Восемь направлений/);
    await shot(stage, '06-run-eight-directions-32px.png', evidence);
    evidence.stage = 'eight-directions-captured';

    await choosePreset(page, 'weapons', /Оружие читается силуэтом/);
    await shot(stage, '07-weapons-range.png', evidence);
    evidence.stage = 'weapons-captured';

    await choosePreset(page, 'low', /Обычное и низкое движение/);
    for (const phase of [15, 40, 65]) {
      await setPhase(page, phase);
      await shot(stage, `08-low-movement-phase-${phase}.png`, evidence);
    }
    evidence.stage = 'low-movement-phases-captured';

    await choosePreset(page, 'ground', /Лёжа, прицеливание и ползание/);
    for (const phase of [10, 35, 60]) {
      await setPhase(page, phase);
      await shot(stage, `09-ground-phase-${phase}.png`, evidence);
    }
    evidence.stage = 'ground-phases-captured';

    await choosePreset(page, 'manual', /Ручная настройка/);
    await page.locator('#pose-select').selectOption('proneAim');
    await page.locator('#weapon-select').selectOption('dp27');
    await chooseSize(page, 64);
    await setPhase(page, 0);
    await shot(stage, '10-dp27-prone-aim-64px.png', evidence);
    evidence.stage = 'dp27-detail-captured';

    await chooseSize(page, 32);
    await choosePreset(page, 'split', /Корпус, внимание и оружие не обязаны совпадать/);
    await expect(page.locator('#body-output')).toHaveText('0°');
    await expect(page.locator('#attention-output')).toHaveText('35°');
    await expect(page.locator('#weapon-output')).toHaveText('70°');
    await shot(stage, '11-split-directions-diagnostics.png', evidence);
    evidence.stage = 'split-directions-captured';

    expect(evidence.consoleErrors).toEqual([]);
    expect(evidence.pageErrors).toEqual([]);
    expect(evidence.requestFailures).toEqual([]);
    evidence.stage = 'completed';
  } finally {
    writeFileSync(path.join(outputDir, 'evidence.json'), JSON.stringify(evidence, null, 2));
  }
});