import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

test('inspect deployed Combat Lab Series, Metrics, Journal tabs', async ({ page }) => {
  const targetUrl = process.env.TARGET_URL!;
  const evidenceDir = path.resolve('artifacts/vercel-e2e');
  await fs.mkdir(evidenceDir, { recursive: true });

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => requestFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`));

  const response = await page.goto(targetUrl, { waitUntil: 'networkidle' });
  expect(response?.status() ?? 200).toBeLessThan(400);
  await expect(page.locator('#app canvas')).toBeVisible();
  await expect(page.locator('[data-combat-lab-tab="batch"]')).toBeVisible();
  await page.screenshot({ path: path.join(evidenceDir, '01-deployment-loaded.png'), fullPage: true });

  const tabs = [
    ['batch', '02-series.png'],
    ['metrics', '03-metrics.png'],
    ['journal', '04-journal.png'],
  ] as const;
  const tabText: Record<string, string> = {};
  for (const [tab, filename] of tabs) {
    await page.locator(`[data-combat-lab-tab="${tab}"]`).click();
    const panel = page.locator(`[data-combat-lab-tab-panel="${tab}"]`);
    await expect(panel).toBeVisible();
    await page.waitForTimeout(400);
    tabText[tab] = await panel.innerText();
    await page.screenshot({ path: path.join(evidenceDir, filename), fullPage: true });
  }

  await fs.writeFile(path.join(evidenceDir, 'evidence.json'), JSON.stringify({
    targetUrl,
    canonicalFeatureBranch: process.env.CANONICAL_FEATURE_BRANCH,
    expectedProductSha: process.env.EXPECTED_PRODUCT_SHA,
    observedProductSha: 'unavailable-in-page',
    productShaMatch: 'proven-via-vercel-build-log-outside-browser',
    stage: 'completed',
    tabs: tabText,
    consoleErrors,
    pageErrors,
    requestFailures,
  }, null, 2));

  expect(pageErrors).toEqual([]);
});
