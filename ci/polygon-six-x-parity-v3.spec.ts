import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const targetUrl = process.env.TARGET_URL!;
const expectedSha = process.env.EXPECTED_PRODUCT_SHA!;
const featureBranch = process.env.CANONICAL_FEATURE_BRANCH!;
const outDir = 'artifacts/vercel-e2e';

test('capture agreed Polygon six-X visual scope', async ({ page }) => {
  await mkdir(outDir, { recursive: true });
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];
  const stages: Array<Record<string, unknown>> = [];

  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => {
    requestFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`);
  });

  let observedSha = 'unavailable';
  let failure: string | null = null;
  try {
    const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    expect(response?.status() ?? 200).toBeLessThan(400);
    await expect(page.locator('.polygon-shell')).toBeVisible();
    await expect(page.locator('#app canvas')).toBeVisible();
    await page.waitForTimeout(1200);

    const source = await page.evaluate(async () => {
      const response = await fetch('/deployment-source.json', { cache: 'no-store' });
      return response.ok ? await response.json() as { sourceSha?: string; ref?: string; verificationStatus?: string } : null;
    });
    observedSha = source?.sourceSha ?? 'unavailable';
    expect(observedSha).toBe(expectedSha);
    expect(source?.ref).toBe(featureBranch);
    expect(source?.verificationStatus).toBe('passed');

    const overview = await page.evaluate(() => {
      const box = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      };
      const visibleUnitLabels = [...document.querySelectorAll<HTMLElement>('.unit-label')]
        .map(label => {
          const rect = label.getBoundingClientRect();
          const style = getComputedStyle(label);
          return {
            text: (label.textContent ?? '').trim(),
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            visible: style.display !== 'none'
              && style.visibility !== 'hidden'
              && rect.right >= 0
              && rect.bottom >= 0
              && rect.left <= innerWidth
              && rect.top <= innerHeight,
            selected: label.classList.contains('unit-label-selected'),
          };
        })
        .filter(label => label.visible);
      return {
        viewport: { width: innerWidth, height: innerHeight },
        app: box('#app'),
        canvas: box('#app canvas'),
        shellViewport: box('.polygon-shell-viewport'),
        leftPanel: box('#polygon-shell-left-panel'),
        rightPanel: box('#polygon-shell-right-panel'),
        selectedTitle: (document.querySelector('.polygon-shell-right .polygon-shell-panel-title')?.textContent ?? '').trim(),
        visibleUnitLabels,
        camera: (window as unknown as { __realWargameCameraDebug?: unknown }).__realWargameCameraDebug ?? null,
      };
    });
    expect(overview.selectedTitle).not.toBe('Юнит не выбран');
    expect(overview.visibleUnitLabels.length).toBeGreaterThan(0);
    expect(overview.visibleUnitLabels.some(label => label.selected)).toBe(true);
    stages.push({ stage: 'overview-and-selected-live-unit', overview });
    await capture(page, '01-overview.png');
    await capture(page, '02-selected-unit.png');

    await clickWorkspaceTab(page, 'scene');
    stages.push({ stage: 'map-editor' });
    await capture(page, '03-map-editor.png');

    await clickWorkspaceTab(page, 'parameters');
    stages.push({ stage: 'unit-editor' });
    await capture(page, '04-unit-editor.png');

    await page.locator('.polygon-shell-top-button--editors').click();
    await expect(page.locator('.polygon-shell-editors-portal')).toBeVisible();
    await expect(page.locator('.combat-lab-game-editor-workspace')).toBeVisible();
    await page.waitForTimeout(400);
    stages.push({ stage: 'shared-editors' });
    await capture(page, '05-global-editors.png');

    await page.locator('.polygon-shell-editors-return').click();
    await expect(page.locator('.polygon-shell-editors-portal')).toBeHidden();
    await page.locator('[data-polygon-right-tab="info"]').click();
    const appBox = await page.locator('#app').boundingBox();
    if (appBox) {
      await page.mouse.move(appBox.x + appBox.width * 0.55, appBox.y + appBox.height * 0.5);
    }
    await page.waitForTimeout(700);
    await expect(page.locator('[data-polygon-right-panel="info"]')).toBeVisible();
    const infoState = await page.evaluate(() => ({
      bodyText: (document.querySelector('[data-polygon-right-panel="info"]')?.textContent ?? '').trim(),
      cards: document.querySelectorAll('[data-polygon-right-panel="info"] .polygon-linza-card').length,
      metrics: document.querySelectorAll('[data-polygon-right-panel="info"] .polygon-linza-metric').length,
    }));
    expect(infoState.bodyText.length).toBeGreaterThan(0);
    stages.push({ stage: 'right-info', infoState });
    await capture(page, '06-right-info.png');
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
    await capture(page, '99-failure.png').catch(() => {});
    throw error;
  } finally {
    await writeFile(`${outDir}/evidence.json`, JSON.stringify({
      targetUrl,
      canonicalFeatureBranch: featureBranch,
      expectedProductSha: expectedSha,
      observedProductSha: observedSha,
      productShaMatch: observedSha === expectedSha,
      viewport: { width: 1600, height: 900 },
      stages,
      consoleErrors,
      pageErrors,
      requestFailures,
      failure,
    }, null, 2));
  }
});

async function clickWorkspaceTab(page: Page, tab: string): Promise<void> {
  const control = page.locator(`[data-combat-lab-tab="${tab}"]`).first();
  await expect(control).toBeVisible();
  await control.click();
  await page.waitForTimeout(650);
}

async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${outDir}/${name}`, fullPage: false });
}
