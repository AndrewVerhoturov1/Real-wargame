import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const artifactDir = 'artifacts/vercel-e2e';
const targetUrl = process.env.TARGET_URL ?? '';
const expectedProductSha = process.env.EXPECTED_PRODUCT_SHA ?? '';
const canonicalFeatureBranch = process.env.CANONICAL_FEATURE_BRANCH ?? '';

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

function near(actual: number, expected: number, tolerance = 3): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

test('exact Polygon shell uses prototype geometry and placeholder map', async ({ page, request }) => {
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
    expect(targetUrl).toMatch(/^https:\/\//);
    expect(expectedProductSha).toMatch(/^[0-9a-f]{40}$/);

    const identityResponse = await request.get(new URL('/deployment-source.json', targetUrl).toString());
    expect(identityResponse.status()).toBe(200);
    const identity = await identityResponse.json() as {
      ref?: string;
      sourceSha?: string;
      verificationStatus?: string;
      skippedChecks?: unknown[];
    };
    evidence.observedProductSha = identity.sourceSha ?? 'unavailable';
    evidence.productShaMatch = identity.sourceSha === expectedProductSha;
    expect(identity.ref).toBe(canonicalFeatureBranch);
    expect(identity.sourceSha).toBe(expectedProductSha);
    expect(identity.verificationStatus).toBe('passed');
    expect(identity.skippedChecks ?? []).toEqual([]);
    evidence.stage = 'product-identity-read';

    const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if (response) expect(response.status()).toBeLessThan(400);
    await expect(page.locator('.polygon-shell')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.polygon-shell-map-placeholder')).toBeVisible();
    await expect(page.locator('.polygon-shell-map-board')).toBeVisible();
    await expect(page.locator('.polygon-shell-left')).toBeVisible();
    await expect(page.locator('.polygon-shell-right')).toBeVisible();
    await page.waitForTimeout(750);
    evidence.stage = 'deployment-loaded';

    expect(await page.locator('.polygon-shell-primary-tabs').count()).toBe(0);
    expect(await page.locator('.polygon-shell-auxiliary-tabs').count()).toBe(0);
    expect(await page.locator('.polygon-shell-timeline').count()).toBe(0);
    expect(await page.locator('.polygon-shell-empty-state:visible').count()).toBe(0);
    expect(await page.locator('#hud:visible').count()).toBe(0);
    expect(await page.locator('.simulation-sidebar:visible').count()).toBe(0);
    expect(await page.locator('.simulation-unit-bar:visible').count()).toBe(0);
    expect(await page.locator('#app canvas').evaluate((el) => getComputedStyle(el).visibility)).toBe('hidden');
    expect(await page.locator('.polygon-shell-map-placeholder').evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');

    const topbar = await page.locator('.polygon-shell-topbar').boundingBox();
    const history = await page.locator('.polygon-shell-history-strip').boundingBox();
    const left = await page.locator('.polygon-shell-left').boundingBox();
    const right = await page.locator('.polygon-shell-right').boundingBox();
    const board = await page.locator('.polygon-shell-map-board').boundingBox();
    expect(topbar && history && left && right && board).toBeTruthy();
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
    evidence.geometry.desktop = { topbar, history, left, right, board };

    await expect(page.locator('[data-combat-lab-tab="program"]')).toHaveClass(/active/);
    await expect(page.locator('[data-polygon-right-tab="unit"]')).toHaveClass(/active/);
    await page.screenshot({ path: `${artifactDir}/01-exact-shell-1600x900.png`, fullPage: false });
    evidence.stage = 'desktop-captured';

    const journal = page.locator('[data-combat-lab-tab="journal"]');
    const memory = page.locator('[data-polygon-right-tab="memory"]');
    await journal.click();
    await memory.click();
    await expect(journal).toHaveClass(/active/);
    await expect(memory).toHaveClass(/active/);
    expect(await memory.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(52, 67, 33)');
    await page.screenshot({ path: `${artifactDir}/02-tabs-selected-1600x900.png`, fullPage: false });
    evidence.stage = 'tabs-verified';

    await page.locator('[aria-controls="polygon-shell-left-panel"]').click();
    await page.locator('[aria-controls="polygon-shell-right-panel"]').click();
    await expect(page.locator('.polygon-shell')).toHaveClass(/polygon-shell-left-collapsed/);
    await expect(page.locator('.polygon-shell')).toHaveClass(/polygon-shell-right-collapsed/);
    await expect(page.locator('.polygon-shell-run-toolbar')).toBeVisible();
    await page.screenshot({ path: `${artifactDir}/03-panels-collapsed-1600x900.png`, fullPage: false });
    evidence.stage = 'collapse-verified';

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
    evidence.geometry.narrow = { left: narrowLeft, right: narrowRight, board: narrowBoard };
    await page.screenshot({ path: `${artifactDir}/04-exact-shell-1080x800.png`, fullPage: false });
    evidence.stage = 'narrow-captured';

    expect(evidence.pageErrors).toEqual([]);
    expect(evidence.requestFailures).toEqual([]);
    evidence.stage = 'completed';
  } finally {
    writeFileSync(`${artifactDir}/evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  }
});
