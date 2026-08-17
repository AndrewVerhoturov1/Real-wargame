import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const targetUrl = process.env.TARGET_URL!;
const expectedSha = process.env.EXPECTED_PRODUCT_SHA!;
const featureBranch = process.env.CANONICAL_FEATURE_BRANCH!;
const outDir = 'artifacts/vercel-e2e';

test('capture remaining deployed Polygon workspace states', async ({ page }) => {
  await mkdir(outDir, { recursive: true });
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('requestfailed', r => requestFailures.push(`${r.method()} ${r.url()} :: ${r.failure()?.errorText ?? 'unknown'}`));

  const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  expect(response?.status() ?? 200).toBeLessThan(400);
  await expect(page.locator('.polygon-shell')).toBeVisible();
  await expect(page.locator('#app canvas')).toBeVisible();
  await page.waitForTimeout(1000);

  const source = await page.evaluate(async () => {
    const r = await fetch('/deployment-source.json', { cache: 'no-store' });
    return r.ok ? await r.json() : null;
  }) as { sourceSha?: string } | null;
  expect(source?.sourceSha).toBe(expectedSha);

  const stages: Array<Record<string, unknown>> = [];
  for (const [tab, file, stage] of [
    ['laboratory', '12-laboratory.png', 'laboratory'],
    ['batch', '13-series.png', 'series'],
    ['metrics', '14-metrics.png', 'metrics'],
    ['journal', '15-journal.png', 'journal'],
  ] as const) {
    const control = page.locator(`[data-combat-lab-tab="${tab}"]`).first();
    const exists = await control.count() > 0;
    const visible = exists && await control.isVisible().catch(() => false);
    const enabled = visible && await control.isEnabled().catch(() => false);
    if (enabled) {
      await control.click();
      await page.waitForTimeout(700);
    }
    stages.push({ stage, exists, visible, enabled, clicked: enabled });
    await page.screenshot({ path: `${outDir}/${file}`, fullPage: false });
  }

  const rightTabs = await page.locator('[data-polygon-right-tab]').evaluateAll(nodes => nodes.map(node => ({
    id: (node as HTMLElement).dataset.polygonRightTab,
    text: (node.textContent ?? '').trim(),
  })));

  await writeFile(`${outDir}/evidence-extra.json`, JSON.stringify({
    targetUrl,
    featureBranch,
    expectedSha,
    observedSha: source?.sourceSha ?? 'unavailable',
    productShaMatch: source?.sourceSha === expectedSha,
    viewport: { width: 1600, height: 900 },
    stages,
    rightTabs,
    consoleErrors,
    pageErrors,
    requestFailures,
  }, null, 2));
});
