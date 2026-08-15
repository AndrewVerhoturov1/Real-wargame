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
  geometry?: Record<string, unknown>;
  consoleErrors: string[];
  pageErrors: string[];
  requestFailures: string[];
  ignoredServiceFailures: string[];
}

test('accepted Polygon shell matches deployed product layout', async ({ page, request }) => {
  mkdirSync(artifactDir, { recursive: true });
  const evidence: Evidence = {
    targetUrl,
    canonicalFeatureBranch,
    expectedProductSha,
    observedProductSha: 'unavailable',
    productShaMatch: 'unproven',
    stage: 'started',
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
    const entry = `${failedRequest.method()} ${failedRequest.url()} :: ${failedRequest.failure()?.errorText ?? 'unknown'}`;
    if (failedRequest.url().includes('vercel.live') || failedRequest.url().includes('_next-live')) {
      evidence.ignoredServiceFailures.push(entry);
    } else {
      evidence.requestFailures.push(entry);
    }
  });

  try {
    expect(targetUrl).toMatch(/^https:\/\//);
    expect(expectedProductSha).toMatch(/^[0-9a-f]{40}$/);

    const identityResponse = await request.get(new URL('/deployment-source.json', targetUrl).toString());
    expect(identityResponse.status()).toBe(200);
    const identity = await identityResponse.json() as { ref?: string; sourceSha?: string; verificationStatus?: string };
    evidence.observedProductSha = identity.sourceSha ?? 'unavailable';
    evidence.productShaMatch = identity.sourceSha === expectedProductSha;
    expect(identity.ref).toBe(canonicalFeatureBranch);
    expect(identity.sourceSha).toBe(expectedProductSha);
    expect(identity.verificationStatus).toBe('passed');
    evidence.stage = 'product-identity-read';

    const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if (response) expect(response.status()).toBeLessThan(400);
    await expect(page.locator('.polygon-shell')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.polygon-shell-topbar')).toBeVisible();
    await expect(page.locator('.polygon-shell-left')).toBeVisible();
    await expect(page.locator('.polygon-shell-right')).toBeVisible();
    evidence.stage = 'deployment-loaded';

    expect(await page.locator('.polygon-shell-primary-tabs').count()).toBe(0);
    expect(await page.locator('.polygon-shell-auxiliary-tabs').count()).toBe(0);
    expect(await page.locator('.polygon-shell-timeline').count()).toBe(0);
    expect(await page.locator('.polygon-shell-empty-state').count()).toBe(0);
    expect(await page.locator('.polygon-shell-hidden-hosts').evaluate((element) => getComputedStyle(element).display)).toBe('none');

    const topbar = await page.locator('.polygon-shell-topbar').boundingBox();
    const left = await page.locator('.polygon-shell-left').boundingBox();
    const right = await page.locator('.polygon-shell-right').boundingBox();
    expect(topbar).not.toBeNull();
    expect(left).not.toBeNull();
    expect(right).not.toBeNull();
    expect(Math.round(topbar!.height)).toBe(58);
    expect(Math.round(left!.width)).toBeGreaterThanOrEqual(370);
    expect(Math.round(left!.width)).toBeLessThanOrEqual(374);
    expect(Math.round(right!.width)).toBeGreaterThanOrEqual(334);
    expect(Math.round(right!.width)).toBeLessThanOrEqual(338);
    evidence.geometry = { topbar, left, right, viewport: { width: 1600, height: 900 } };

    await expect(page.getByText('ПОЛИГОН', { exact: true })).toBeVisible();
    for (const label of ['Программа', 'Лаборатория', 'Редактор карты', 'Редактор юнита', 'Серия', 'Метрики', 'Журнал']) {
      await expect(page.locator('.polygon-shell-left-tabs').getByRole('tab', { name: label, exact: true })).toBeVisible();
    }
    for (const label of ['Юнит', 'Инфо', 'Внимание', 'Память']) {
      await expect(page.locator('.polygon-shell-right-tabs').getByRole('tab', { name: label, exact: true })).toBeVisible();
    }

    await page.screenshot({ path: `${artifactDir}/01-shell-1600x900.png`, fullPage: false });
    evidence.stage = 'desktop-captured';

    const programTab = page.locator('[data-combat-lab-tab="program"]');
    const memoryTab = page.locator('[data-polygon-right-tab="memory"]');
    await programTab.click();
    await memoryTab.click();
    await expect(programTab).toHaveClass(/active/);
    await expect(memoryTab).toHaveClass(/active/);
    await page.screenshot({ path: `${artifactDir}/02-tabs-selected-1600x900.png`, fullPage: false });
    evidence.stage = 'tabs-verified';

    await page.locator('[aria-controls="polygon-shell-left-panel"]').click();
    await page.locator('[aria-controls="polygon-shell-right-panel"]').click();
    await expect(page.locator('.polygon-shell')).toHaveClass(/polygon-shell-left-collapsed/);
    await expect(page.locator('.polygon-shell')).toHaveClass(/polygon-shell-right-collapsed/);
    await page.screenshot({ path: `${artifactDir}/03-panels-collapsed-1600x900.png`, fullPage: false });
    evidence.stage = 'collapse-verified';

    await page.locator('[aria-controls="polygon-shell-left-panel"]').click();
    await page.locator('[aria-controls="polygon-shell-right-panel"]').click();
    await page.setViewportSize({ width: 1080, height: 800 });
    await expect(page.locator('.polygon-shell-left')).toBeVisible();
    await expect(page.locator('.polygon-shell-right')).toBeVisible();
    const narrowLeft = await page.locator('.polygon-shell-left').boundingBox();
    const narrowRight = await page.locator('.polygon-shell-right').boundingBox();
    evidence.geometry = { ...evidence.geometry, narrowLeft, narrowRight, narrowViewport: { width: 1080, height: 800 } };
    await page.screenshot({ path: `${artifactDir}/04-shell-1080x800.png`, fullPage: false });
    evidence.stage = 'narrow-desktop-captured';

    expect(evidence.pageErrors).toEqual([]);
    expect(evidence.requestFailures).toEqual([]);
    evidence.stage = 'completed';
  } finally {
    writeFileSync(`${artifactDir}/evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  }
});
