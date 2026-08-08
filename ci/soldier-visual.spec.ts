import { test, expect, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const targetUrl = process.env.TARGET_URL ?? '';
const expectedProductSha = process.env.EXPECTED_PRODUCT_SHA ?? '';
const canonicalFeatureBranch = process.env.CANONICAL_FEATURE_BRANCH ?? '';
const evidenceDir = path.resolve('artifacts/vercel-e2e');

const poses = [
  'idle','ready','walk','run','crouch','crouchMove','crouchRun','prone','proneAim','crawl','standAim','crouchAim',
] as const;
const movingPoses = ['walk','run','crouchMove','crouchRun','crawl'] as const;
const phases = [0,25,50,75] as const;

type Evidence = {
  targetUrl: string;
  canonicalFeatureBranch: string;
  expectedProductSha: string;
  observedProductSha: string;
  productShaMatch: boolean;
  stage: string;
  screenshots: string[];
  poseChecks: Array<{ pose: string; large: string; eightDirections32: string }>;
  animationChecks: Array<{ pose: string; phase: number; screenshot: string }>;
  consoleErrors: string[];
  pageErrors: string[];
  requestFailures: string[];
  ignoredServiceFailures: string[];
};

function saveEvidence(evidence: Evidence) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, 'evidence.json'), JSON.stringify(evidence, null, 2));
}

async function shot(page: Page, filename: string, locator?: Locator) {
  const out = path.join(evidenceDir, filename);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (locator) await locator.screenshot({ path: out, animations: 'disabled' });
  else await page.screenshot({ path: out, fullPage: true, animations: 'disabled' });
  return filename;
}

async function setSlider(page: Page, selector: string, value: number) {
  await page.locator(selector).evaluate((node, raw) => {
    const input = node as HTMLInputElement;
    input.value = String(raw);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

async function setDirection(page: Page, degrees: number) {
  await setSlider(page, '#body-direction', degrees);
  await setSlider(page, '#attention-direction', degrees);
  await setSlider(page, '#weapon-direction', degrees);
  await expect(page.locator('#body-output')).toHaveText(`${degrees}°`);
  await expect(page.locator('#attention-output')).toHaveText(`${degrees}°`);
  await expect(page.locator('#weapon-output')).toHaveText(`${degrees}°`);
}

async function setSize(page: Page, size: 24 | 32 | 48 | 64) {
  const button = page.locator(`.size-chip[data-size="${size}"]`);
  await button.click();
  await expect(button).toHaveClass(/active/);
}

async function setPhase(page: Page, value: number) {
  await setSlider(page, '#phase-slider', value);
  await expect(page.locator('#phase-output')).toHaveText(`${value}%`);
}

async function selectPreset(page: Page, id: string) {
  const button = page.locator(`.preset[data-scene="${id}"]`);
  await button.click();
  await expect(button).toHaveClass(/active/);
}

test('deployed soldier prototype visual acceptance', async ({ page }) => {
  if (!targetUrl || !expectedProductSha || !canonicalFeatureBranch) throw new Error('Visual QA environment is incomplete.');

  const evidence: Evidence = {
    targetUrl,
    canonicalFeatureBranch,
    expectedProductSha,
    observedProductSha: 'unavailable',
    productShaMatch: false,
    stage: 'started',
    screenshots: [],
    poseChecks: [],
    animationChecks: [],
    consoleErrors: [],
    pageErrors: [],
    requestFailures: [],
    ignoredServiceFailures: [],
  };
  saveEvidence(evidence);

  page.on('console', (message) => {
    if (message.type() === 'error') evidence.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => evidence.pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    const failure = `${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`;
    if (request.url().includes('vercel.live') || request.url().includes('_next-live')) evidence.ignoredServiceFailures.push(failure);
    else evidence.requestFailures.push(failure);
  });

  try {
    const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if (response) expect(response.status()).toBeLessThan(400);
    await expect(page.getByRole('heading', { name: 'Советская пехота · вид сверху' })).toBeVisible();
    await expect(page.locator('#pose-gallery canvas')).toHaveCount(12);
    await page.waitForTimeout(800);
    evidence.stage = 'deployment-loaded';

    const source = await page.evaluate(async () => {
      const response = await fetch('/deployment-source.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`deployment-source.json HTTP ${response.status}`);
      return response.json() as Promise<{ sourceSha?: string; ref?: string; verificationStatus?: string }>;
    });
    evidence.observedProductSha = source.sourceSha ?? 'unavailable';
    evidence.productShaMatch = evidence.observedProductSha === expectedProductSha;
    expect(source.ref).toBe(canonicalFeatureBranch);
    expect(source.verificationStatus).toBe('passed');
    expect(evidence.productShaMatch).toBe(true);
    await expect(page.locator('#build-id')).toContainText(expectedProductSha.slice(0, 12));
    evidence.stage = 'product-identity-read';

    evidence.screenshots.push(await shot(page, '01-gallery-full.png'));
    evidence.screenshots.push(await shot(page, '02-gallery-weapons.png', page.locator('#weapon-gallery')));
    evidence.screenshots.push(await shot(page, '03-gallery-sizes-24-32-48-64.png', page.locator('#size-gallery')));

    await page.locator('button[data-tab="range"]').click();
    await expect(page.locator('#range-panel')).toHaveClass(/active/);
    const stage = page.locator('.range-stage');
    await expect(stage).toBeVisible();

    for (const pose of poses) {
      await page.locator('#pose-select').selectOption(pose);
      await page.locator('#weapon-select').selectOption('mosin');
      await selectPreset(page, 'manual');
      await setPhase(page, ['walk','run','crouchMove','crouchRun','crawl'].includes(pose) ? 25 : 0);
      await setSize(page, 64);
      await setDirection(page, 0);
      const large = `pose-${pose}-64px-0deg.png`;
      evidence.screenshots.push(await shot(page, large, stage));

      await setSize(page, 32);
      await selectPreset(page, 'directions');
      const eightDirections32 = `pose-${pose}-32px-8dirs.png`;
      evidence.screenshots.push(await shot(page, eightDirections32, stage));
      evidence.poseChecks.push({ pose, large, eightDirections32 });
      saveEvidence(evidence);
    }
    evidence.stage = 'all-poses-and-directions-captured';

    for (const pose of movingPoses) {
      await page.locator('#pose-select').selectOption(pose);
      await page.locator('#weapon-select').selectOption(pose === 'crawl' ? 'ppsh41' : 'mosin');
      await selectPreset(page, 'manual');
      await setSize(page, 48);
      await setDirection(page, 45);
      for (const phase of phases) {
        await setPhase(page, phase);
        const filename = `animation-${pose}-48px-45deg-phase-${String(phase).padStart(2, '0')}.png`;
        evidence.screenshots.push(await shot(page, filename, stage));
        evidence.animationChecks.push({ pose, phase, screenshot: filename });
      }
    }
    evidence.stage = 'animation-phases-captured';

    await page.locator('#pose-select').selectOption('ready');
    await page.locator('#weapon-select').selectOption('dp27');
    await selectPreset(page, 'manual');
    await setPhase(page, 0);
    await setSize(page, 64);
    await setDirection(page, 0);
    evidence.screenshots.push(await shot(page, 'special-dp27-ready-64px.png', stage));

    await setSize(page, 32);
    await selectPreset(page, 'directions');
    evidence.screenshots.push(await shot(page, 'special-dp27-ready-32px-8dirs.png', stage));

    await page.locator('#pose-select').selectOption('proneAim');
    await page.locator('#weapon-select').selectOption('dp27');
    await selectPreset(page, 'manual');
    await setSize(page, 48);
    await setDirection(page, 315);
    evidence.screenshots.push(await shot(page, 'special-dp27-prone-aim-48px-315deg.png', stage));

    await selectPreset(page, 'ground');
    evidence.screenshots.push(await shot(page, 'special-ground-prone-crawl-comparison.png', stage));

    await selectPreset(page, 'split');
    await expect(page.locator('#diag-body')).toBeChecked();
    await expect(page.locator('#diag-attention')).toBeChecked();
    await expect(page.locator('#diag-weapon')).toBeChecked();
    evidence.screenshots.push(await shot(page, 'special-split-body-attention-weapon.png', stage));
    evidence.stage = 'special-cases-captured';

    expect(evidence.pageErrors).toEqual([]);
    expect(evidence.requestFailures).toEqual([]);
    evidence.stage = 'completed';
  } finally {
    saveEvidence(evidence);
  }
});
