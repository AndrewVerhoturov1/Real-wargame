import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const artifactDir = 'artifacts/vercel-e2e';
const targetUrl = process.env.TARGET_URL ?? '';
const expectedProductSha = process.env.EXPECTED_PRODUCT_SHA ?? '';
const canonicalFeatureBranch = process.env.CANONICAL_FEATURE_BRANCH ?? '';
const near = (actual: number, expected: number, tolerance = 3) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);

interface Evidence {
  targetUrl: string;
  canonicalFeatureBranch: string;
  expectedProductSha: string;
  observedProductSha: string;
  productShaMatch: boolean | 'unproven';
  stage: string;
  geometry: Record<string, unknown>;
  consoleErrors: string[];
  pageErrors: string[];
  requestFailures: string[];
  ignoredServiceFailures: string[];
}

test('final exact Polygon shell visual contract', async ({ page, request }) => {
  mkdirSync(artifactDir, { recursive: true });
  const evidence: Evidence = {
    targetUrl,
    canonicalFeatureBranch,
    expectedProductSha,
    observedProductSha: 'unavailable',
    productShaMatch: 'unproven',
    stage: 'started',
    geometry: {},
    consoleErrors: [],
    pageErrors: [],
    requestFailures: [],
    ignoredServiceFailures: [],
  };

  page.on('console', (message) => {
    if (message.type() === 'error') evidence.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => evidence.pageErrors.push(error.message));
  page.on('requestfailed', (failedRequest) => {
    const url = failedRequest.url();
    const entry = `${failedRequest.method()} ${url} :: ${failedRequest.failure()?.errorText ?? 'unknown'}`;
    const service = url.includes('vercel.live') || url.includes('_next-live') || url.includes('/.well-known/vercel/');
    const probe = failedRequest.method() === 'HEAD' && url === targetUrl;
    if (service || probe) evidence.ignoredServiceFailures.push(entry);
    else evidence.requestFailures.push(entry);
  });

  try {
    const identityResponse = await request.get(new URL('/deployment-source.json', targetUrl).toString());
    expect(identityResponse.status()).toBe(200);
    const identity = await identityResponse.json() as { ref?: string; sourceSha?: string; verificationStatus?: string; skippedChecks?: unknown[] };
    evidence.observedProductSha = identity.sourceSha ?? 'unavailable';
    evidence.productShaMatch = identity.sourceSha === expectedProductSha;
    expect(identity.ref).toBe(canonicalFeatureBranch);
    expect(identity.sourceSha).toBe(expectedProductSha);
    expect(identity.verificationStatus).toBe('passed');
    expect(identity.skippedChecks ?? []).toEqual([]);
    evidence.stage = 'identity-verified';

    const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if (response) expect(response.status()).toBeLessThan(400);
    await expect(page.locator('.polygon-shell')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.polygon-shell-map-placeholder')).toBeVisible();
    await expect(page.locator('.polygon-shell-map-board')).toBeVisible();
    await page.waitForTimeout(750);

    expect(await page.locator('#app canvas').evaluate((element) => getComputedStyle(element).visibility)).toBe('hidden');
    expect(await page.locator('#hud:visible').count()).toBe(0);
    expect(await page.locator('.simulation-sidebar:visible').count()).toBe(0);
    expect(await page.locator('.simulation-unit-bar:visible').count()).toBe(0);
    expect(await page.locator('.polygon-shell-map-placeholder').evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(197, 196, 186)');
    expect(await page.locator('.polygon-shell-map-board').evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(183, 180, 166)');

    const topbar = await page.locator('.polygon-shell-topbar').boundingBox();
    const history = await page.locator('.polygon-shell-history-strip').boundingBox();
    const left = await page.locator('.polygon-shell-left').boundingBox();
    const right = await page.locator('.polygon-shell-right').boundingBox();
    const board = await page.locator('.polygon-shell-map-board').boundingBox();
    const leftNav = await page.locator('.polygon-shell-left-tabs').boundingBox();
    expect(topbar && history && left && right && board && leftNav).toBeTruthy();
    near(topbar!.height, 58, 1);
    near(history!.y, 58, 1);
    near(history!.height, 30, 1);
    near(left!.x, 14, 2);
    near(left!.y, 102, 2);
    near(left!.width, 372, 2);
    near(right!.x, 1250, 2);
    near(right!.y, 102, 2);
    near(right!.width, 336, 2);
    near(board!.x, 451, 3);
    near(board!.y, 127, 3);
    near(board!.width, 734, 3);
    near(board!.height, 734, 3);
    expect(leftNav!.height).toBeGreaterThanOrEqual(80);
    expect(leftNav!.height).toBeLessThanOrEqual(84);

    const leftTabs = await page.locator('.polygon-shell-left-tabs .polygon-shell-tab').evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { text: element.textContent ?? '', x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }));
    expect(leftTabs).toHaveLength(7);
    for (const index of [0, 1, 2]) near(leftTabs[index]!.y, leftTabs[0]!.y, 1);
    for (const index of [3, 4, 5, 6]) near(leftTabs[index]!.y, leftTabs[3]!.y, 1);
    expect(leftTabs[3]!.y - leftTabs[0]!.y).toBeGreaterThanOrEqual(33);
    expect(leftTabs[3]!.y - leftTabs[0]!.y).toBeLessThanOrEqual(35);
    await expect(page.locator('[data-combat-lab-tab="program"]')).toHaveClass(/active/);
    await expect(page.locator('[data-polygon-right-tab="unit"]')).toHaveClass(/active/);

    const start = page.locator('.combat-lab-run-toolbar > button.primary');
    const reset = page.locator('.combat-lab-run-toolbar > button[aria-label="Сбросить прогон"]');
    const speed = page.locator('.combat-lab-experiment-speed-field');
    const pause = page.locator('.combat-lab-run-toolbar > button[aria-label="Пауза"]');
    const duration = page.locator('.combat-lab-experiment-settings-summary__duration');
    const seed = page.locator('.combat-lab-experiment-settings-summary__seed');
    for (const control of [start, reset, speed, pause, duration, seed]) await expect(control).toBeVisible();
    const runBoxes = await Promise.all([start, reset, speed, pause, duration, seed].map((locator) => locator.boundingBox()));
    expect(runBoxes.every(Boolean)).toBe(true);
    for (let index = 1; index < runBoxes.length; index += 1) {
      expect(runBoxes[index]!.x).toBeGreaterThan(runBoxes[index - 1]!.x);
    }
    expect((await duration.textContent()) ?? '').toMatch(/^⏱\s+\d/);
    expect((await seed.textContent()) ?? '').toMatch(/^#\s+\d/);

    evidence.geometry.desktop = { topbar, history, left, right, board, leftNav, leftTabs, runBoxes };
    await page.screenshot({ path: `${artifactDir}/01-final-shell-1600x900.png`, fullPage: false });
    evidence.stage = 'desktop-captured';

    const journal = page.locator('[data-combat-lab-tab="journal"]');
    const memory = page.locator('[data-polygon-right-tab="memory"]');
    await journal.click();
    await memory.click();
    await expect(journal).toHaveClass(/active/);
    await expect(memory).toHaveClass(/active/);
    expect(await memory.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(52, 67, 33)');
    await page.screenshot({ path: `${artifactDir}/02-final-tabs-selected-1600x900.png`, fullPage: false });
    evidence.stage = 'tabs-selected';

    await page.locator('[aria-controls="polygon-shell-left-panel"]').click();
    await page.locator('[aria-controls="polygon-shell-right-panel"]').click();
    await expect(page.locator('.polygon-shell-run-toolbar')).toBeVisible();
    await page.screenshot({ path: `${artifactDir}/03-final-panels-collapsed-1600x900.png`, fullPage: false });
    evidence.stage = 'collapse-captured';

    await page.locator('[aria-controls="polygon-shell-left-panel"]').click();
    await page.locator('[aria-controls="polygon-shell-right-panel"]').click();
    await page.setViewportSize({ width: 1080, height: 800 });
    await page.waitForTimeout(500);
    const narrowLeft = await page.locator('.polygon-shell-left').boundingBox();
    const narrowRight = await page.locator('.polygon-shell-right').boundingBox();
    const narrowBoard = await page.locator('.polygon-shell-map-board').boundingBox();
    expect(narrowLeft && narrowRight && narrowBoard).toBeTruthy();
    near(narrowLeft!.x, 14, 2);
    near(narrowLeft!.y, 102, 2);
    near(narrowLeft!.width, 372, 2);
    near(narrowRight!.x, 730, 2);
    near(narrowRight!.y, 102, 2);
    near(narrowRight!.width, 336, 2);
    near(narrowBoard!.x, 431, 3);
    near(narrowBoard!.y, 317, 3);
    near(narrowBoard!.width, 254, 3);
    near(narrowBoard!.height, 254, 3);
    await expect(duration).toBeVisible();
    await expect(seed).toBeVisible();
    evidence.geometry.narrow = { left: narrowLeft, right: narrowRight, board: narrowBoard };
    await page.screenshot({ path: `${artifactDir}/04-final-shell-1080x800.png`, fullPage: false });
    evidence.stage = 'narrow-captured';

    expect(evidence.consoleErrors).toEqual([]);
    expect(evidence.pageErrors).toEqual([]);
    expect(evidence.requestFailures).toEqual([]);
    evidence.stage = 'completed';
  } finally {
    writeFileSync(`${artifactDir}/evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  }
});
