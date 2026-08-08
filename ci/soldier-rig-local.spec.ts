import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const productSha = process.env.PRODUCT_SHA ?? '18364bb8cbd723d5c5d2c4f23594aec816fe65f5';
const outputDir = path.resolve('artifacts/soldier-rig-local');

interface Evidence {
  targetUrl: string;
  productSha: string;
  buildIdentity: string;
  stage: string;
  screenshots: string[];
  consoleErrors: string[];
  pageErrors: string[];
  requestFailures: string[];
}

mkdirSync(outputDir, { recursive: true });

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
  await page.waitForTimeout(70);
}

async function chooseSize(page: Page, value: number) {
  await page.locator(`.size-chip[data-size="${value}"]`).click();
  await expect(page.locator(`.size-chip[data-size="${value}"]`)).toHaveClass(/active/);
  await page.waitForTimeout(60);
}

async function choosePreset(page: Page, id: string) {
  await page.locator(`.preset[data-scene="${id}"]`).click();
  await page.waitForTimeout(80);
}

test('exact transferred soldier rig is visually inspectable across poses and motion', async ({ page }) => {
  const evidence: Evidence = {
    targetUrl: `${baseUrl}/soldier-topdown-prototype.html`,
    productSha,
    buildIdentity: '',
    stage: 'started',
    screenshots: [],
    consoleErrors: [],
    pageErrors: [],
    requestFailures: [],
  };

  page.on('console', (message) => {
    if (message.type() === 'error') evidence.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => evidence.pageErrors.push(error.message));
  page.on('requestfailed', (request) => evidence.requestFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`));

  try {
    const response = await page.goto(evidence.targetUrl, { waitUntil: 'networkidle' });
    expect(response?.status() ?? 0).toBeLessThan(400);
    await expect(page.locator('#soldier-prototype-root')).toBeVisible();
    await expect(page.locator('#pose-gallery canvas')).toHaveCount(12);
    await expect(page.locator('#direction-gallery canvas')).toHaveCount(8);
    await expect(page.locator('#weapon-gallery canvas')).toHaveCount(3);
    await expect(page.locator('#size-gallery canvas')).toHaveCount(4);
    evidence.buildIdentity = (await page.locator('#build-id').textContent()) ?? '';
    evidence.stage = 'gallery-loaded';

    await page.screenshot({ path: path.join(outputDir, '00-full-gallery.png'), fullPage: true });
    evidence.screenshots.push('00-full-gallery.png');
    await shot(page.locator('#pose-gallery'), '01-all-poses-48px.png', evidence);
    await shot(page.locator('#direction-gallery'), '02-eight-directions.png', evidence);
    await shot(page.locator('#weapon-gallery'), '03-three-weapons.png', evidence);
    await shot(page.locator('#size-gallery'), '04-sizes-24-32-48-64.png', evidence);
    evidence.stage = 'gallery-captured';

    await page.locator('button[data-tab="range"]').click();
    await expect(page.locator('#range-panel')).toHaveClass(/active/);
    const stage = page.locator('#range-stage');
    await expect(page.locator('#range-canvas')).toBeVisible();
    if (await page.locator('#selected').isChecked()) await page.locator('#selected').uncheck();
    await chooseSize(page, 32);
    await choosePreset(page, 'manual');

    const poses = ['idle','ready','walk','run','crouch','crouchMove','crouchRun','prone','proneAim','crawl','standAim','crouchAim'];
    for (const pose of poses) {
      await page.locator('#pose-select').selectOption(pose);
      await setPhase(page, ['walk','run','crouchMove','crouchRun','crawl'].includes(pose) ? 18 : 0);
      await shot(stage, `05-pose-32-${pose}.png`, evidence);
    }
    evidence.stage = 'all-poses-captured';

    // Motion phases: enough samples to expose broken limbs, sliding joints or a fake static pose.
    for (const pose of ['walk','run','crouchMove','crouchRun','crawl']) {
      await page.locator('#pose-select').selectOption(pose);
      for (const phase of [0, 25, 50, 75]) {
        await setPhase(page, phase);
        await shot(stage, `06-motion-${pose}-${phase}.png`, evidence);
      }
    }
    evidence.stage = 'motion-phases-captured';

    await page.locator('#pose-select').selectOption('run');
    await page.locator('#weapon-select').selectOption('mosin');
    await setPhase(page, 18);
    await choosePreset(page, 'directions');
    await shot(stage, '07-run-eight-directions-32px.png', evidence);

    await choosePreset(page, 'weapons');
    await shot(stage, '08-weapons-range.png', evidence);

    await choosePreset(page, 'low');
    for (const phase of [15, 40, 65]) {
      await setPhase(page, phase);
      await shot(stage, `09-low-movement-${phase}.png`, evidence);
    }

    await choosePreset(page, 'ground');
    for (const phase of [10, 35, 60]) {
      await setPhase(page, phase);
      await shot(stage, `10-ground-${phase}.png`, evidence);
    }

    await choosePreset(page, 'manual');
    await page.locator('#pose-select').selectOption('proneAim');
    await page.locator('#weapon-select').selectOption('dp27');
    await chooseSize(page, 64);
    await setPhase(page, 0);
    await shot(stage, '11-dp27-prone-aim-64px.png', evidence);

    await page.locator('#pose-select').selectOption('ready');
    await page.locator('#weapon-select').selectOption('ppsh41');
    await chooseSize(page, 24);
    await setPhase(page, 0);
    await shot(stage, '12-ppsh-ready-24px.png', evidence);

    await chooseSize(page, 32);
    await choosePreset(page, 'split');
    await shot(stage, '13-split-body-attention-weapon.png', evidence);

    expect(evidence.consoleErrors).toEqual([]);
    expect(evidence.pageErrors).toEqual([]);
    expect(evidence.requestFailures).toEqual([]);
    evidence.stage = 'completed';
  } finally {
    writeFileSync(path.join(outputDir, 'evidence.json'), JSON.stringify(evidence, null, 2));
  }
});
