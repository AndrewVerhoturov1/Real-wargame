import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.join('artifacts', 'screenshots');
const VIEWPORT = { width: 1440, height: 900 };
const BOARD_ORIGIN = { x: 72, y: 72 };
const CELL_SIZE = 24;

interface AwarenessDiagnostics {
  representation: string;
  displayObjectCount: number;
  rasterWidth: number;
  rasterHeight: number;
  rebuildCount: number;
  maxBuildMs: number;
}

async function saveScreenshot(page: Page, name: string): Promise<void> {
  const session = await page.context().newCDPSession(page);
  try {
    const result = await session.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
      fromSurface: true,
    });
    writeFileSync(path.join(SCREENSHOT_DIR, name), Buffer.from(result.data, 'base64'));
  } finally {
    await session.detach();
  }
}

async function worldPoint(canvas: Locator, gridX: number, gridY: number): Promise<{ x: number; y: number }> {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounds unavailable.');
  return {
    x: box.x + BOARD_ORIGIN.x + gridX * CELL_SIZE,
    y: box.y + BOARD_ORIGIN.y + gridY * CELL_SIZE,
  };
}

test.beforeAll(() => mkdirSync(SCREENSHOT_DIR, { recursive: true }));

test('enriches the existing danger and stealth rasters instead of adding a player-facing terrain layer', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto('/');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();

  const soldier = await worldPoint(canvas, 27.574, 17.589);
  await page.mouse.click(soldier.x, soldier.y);
  await expect(page.locator('[data-role="unit-name"]')).toContainText('Солдат');

  await page.locator('.workspace-display-menu > summary').click();
  const routeMode = page.locator('[data-action="route-cost-mode"]');
  await expect(routeMode).toBeVisible();
  await expect(routeMode.locator('option')).toHaveCount(2);
  await expect(routeMode.locator('option[value="directionalTerrain"]')).toHaveCount(0);
  await page.locator('.workspace-display-menu > summary').click();

  await page.locator('[data-tab="danger"]').click();
  await expect(page.locator('[data-role="sidebar-title"]')).toContainText('Опасность');
  await page.waitForFunction(() => {
    const diagnostics = (window as Window & { __realWargameAwarenessDebug?: AwarenessDiagnostics }).__realWargameAwarenessDebug;
    return diagnostics?.representation === 'raster-sprite' && diagnostics.rebuildCount > 0;
  });
  const dangerDiagnostics = await page.evaluate(() => (
    window as Window & { __realWargameAwarenessDebug?: AwarenessDiagnostics }
  ).__realWargameAwarenessDebug);
  expect(dangerDiagnostics?.displayObjectCount ?? 99).toBeLessThanOrEqual(3);
  expect(dangerDiagnostics?.maxBuildMs ?? Number.POSITIVE_INFINITY).toBeLessThan(250);
  await page.waitForTimeout(500);
  await saveScreenshot(page, 'directional-terrain-enriched-danger.png');

  await page.locator('[data-tab="stealth"]').click();
  await expect(page.locator('[data-role="sidebar-title"]')).toContainText('Скрытность');
  await page.waitForTimeout(600);
  const stealthDiagnostics = await page.evaluate(() => (
    window as Window & { __realWargameAwarenessDebug?: AwarenessDiagnostics }
  ).__realWargameAwarenessDebug);
  expect(stealthDiagnostics?.representation).toBe('raster-sprite');
  expect(stealthDiagnostics?.displayObjectCount ?? 99).toBeLessThanOrEqual(3);
  await saveScreenshot(page, 'directional-terrain-enriched-stealth.png');
});

test('opens the no-code directional terrain profile editor', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto('/ai-node-editor.html');
  await expect(page.getByRole('heading', { name: /Soldier AI Node Editor|Редактор ИИ/ })).toBeVisible();

  const tab = page.locator('[data-navigation-tab="directionalTerrain"]');
  await expect(tab).toBeVisible();
  await tab.click();
  await expect(page.getByRole('heading', { name: 'Направленный рельеф' })).toBeVisible();
  await expect(page.getByText('8 секторов угрозы')).toBeVisible();
  await expect(page.locator('[data-directional-field="forwardSlopePenalty"]')).toHaveCount(2);
  await expect(page.locator('[data-directional-field="criticalSectorMultiplier"]')).toHaveCount(2);

  const numeric = page.locator('input[type="number"][data-directional-field="forwardSlopePenalty"]');
  await numeric.fill('1.25');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(numeric).toHaveValue('1.25');

  await saveScreenshot(page, 'directional-terrain-profile-editor.png');
});
