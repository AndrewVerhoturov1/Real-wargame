import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.join('artifacts', 'screenshots', 'navigation-profiles-route-cost');
const VIEWPORT = { width: 1440, height: 900 };
const BOARD_ORIGIN = { x: 72, y: 72 };
const CELL_SIZE = 24;
const PROFILE_IDS = ['normal', 'fast', 'stealth', 'retreat'] as const;

interface RouteCostDiagnostics {
  representation: 'two-raster-sprites';
  visible: boolean;
  mode: 'baseTerrain' | 'finalCost';
  staticCostBuildCount: number;
  dynamicCostBuildCount: number;
  textureUploadCount: number;
  hoverReadCount: number;
  fullMapScanCount: number;
  profileRevision: number;
  knowledgeRevision: number;
  staticTextureBuildCount: number;
  dynamicTextureBuildCount: number;
  displayObjectCount: number;
  activeProfileId: string | null;
  selectedUnitId: string | null;
}

test.beforeAll(() => mkdirSync(SCREENSHOT_DIR, { recursive: true }));

test('visualizes normal, fast, stealth and retreat route costs without pointer rebuilds', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto('/');

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  const soldier = await worldPoint(canvas, 27.574, 17.589);
  await page.mouse.click(soldier.x, soldier.y);
  await expect(page.locator('[data-role="unit-name"]')).toContainText('Солдат');

  await page.locator('.workspace-display-menu > summary').click();
  const routeLinesToggle = page.locator('[data-action="command-plan-route-overlay"]');
  if (await routeLinesToggle.getAttribute('aria-pressed') === 'false') await routeLinesToggle.click();

  const costToggle = page.locator('[data-action="route-cost-overlay"]');
  const modeSelect = page.locator('[data-action="route-cost-mode"]');
  const profileSelect = page.locator('[data-action="route-profile-override"]');
  await expect(costToggle).toHaveText(/Стоимость маршрута/);
  await expect(modeSelect).toBeVisible();
  await expect(profileSelect).toBeVisible();
  await modeSelect.selectOption('finalCost');
  if (await costToggle.getAttribute('aria-pressed') !== 'true') await costToggle.click();
  await page.locator('.workspace-display-menu > summary').click();

  await page.waitForFunction(() => Boolean(
    (window as Window & { __realWargameRouteCostDebug?: RouteCostDiagnostics }).__realWargameRouteCostDebug,
  ));

  const target = await worldPoint(canvas, 22, 14);
  const hover = await worldPoint(canvas, 24, 15);
  for (const profileId of PROFILE_IDS) {
    await page.locator('.workspace-display-menu > summary').click();
    await profileSelect.selectOption(profileId);
    await page.locator('.workspace-display-menu > summary').click();
    await page.mouse.click(target.x, target.y, { button: 'right' });

    await expect(page.locator('[data-role="player-command"]')).toContainText('Приказ:');
    await expect(page.locator('[data-role="unit-plan"]')).toContainText('План:');
    await expect(page.locator('[data-role="unit-route"]')).toContainText('Маршрут:');
    await expect(page.locator('[data-role="navigation-profile"]')).toContainText(profileId);
    await expect(page.locator('[data-role="route-cost"]')).toContainText(/Цена:|Цена маршрута:/);
    await expect(page.locator('[data-role="route-reason"]')).toContainText('Причина маршрута:');

    await page.mouse.move(hover.x, hover.y);
    await expect.poll(async () => (await readDiagnostics(page))?.activeProfileId).toBe(profileId);
    await saveScreenshot(page, `${profileId}-final-cost-command-plan-route.png`);
  }

  const beforeHover = await readDiagnostics(page);
  expect(beforeHover).toBeDefined();
  const firstHover = await worldPoint(canvas, 23, 13);
  const secondHover = await worldPoint(canvas, 25, 16);
  await page.mouse.move(firstHover.x, firstHover.y);
  await page.mouse.move(secondHover.x, secondHover.y, { steps: 60 });
  await page.waitForTimeout(200);
  const afterHover = await readDiagnostics(page);
  expect((afterHover?.hoverReadCount ?? 0) - (beforeHover?.hoverReadCount ?? 0)).toBeGreaterThan(0);
  expect(afterHover?.staticCostBuildCount).toBe(beforeHover?.staticCostBuildCount);
  expect(afterHover?.dynamicCostBuildCount).toBe(beforeHover?.dynamicCostBuildCount);
  expect(afterHover?.displayObjectCount ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(4);
  await saveScreenshot(page, 'hover-cost-breakdown.png');

  await page.locator('.workspace-display-menu > summary').click();
  await modeSelect.selectOption('baseTerrain');
  await page.locator('.workspace-display-menu > summary').click();
  await expect.poll(async () => (await readDiagnostics(page))?.mode).toBe('baseTerrain');
  await saveScreenshot(page, 'base-terrain-command-plan-route.png');

  const beforeHidden = await readDiagnostics(page);
  await page.locator('.workspace-display-menu > summary').click();
  await costToggle.click();
  await page.locator('.workspace-display-menu > summary').click();
  await expect.poll(async () => (await readDiagnostics(page))?.visible).toBe(false);
  await saveScreenshot(page, 'overlay-disabled.png');

  await page.locator('.workspace-display-menu > summary').click();
  await costToggle.click();
  await modeSelect.selectOption('finalCost');
  await page.locator('.workspace-display-menu > summary').click();
  await expect.poll(async () => (await readDiagnostics(page))?.visible).toBe(true);
  const afterRestored = await readDiagnostics(page);
  expect(afterRestored?.staticCostBuildCount).toBe(beforeHidden?.staticCostBuildCount);
  expect(afterRestored?.dynamicCostBuildCount).toBe(beforeHidden?.dynamicCostBuildCount);

  const center = await canvasCenter(canvas);
  await page.mouse.move(center.x, center.y);
  await page.mouse.wheel(0, -500);
  await page.keyboard.down('d');
  await page.waitForTimeout(180);
  await page.keyboard.up('d');
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(140);
  await page.keyboard.up('ArrowUp');
  const afterCamera = await readDiagnostics(page);
  expect(afterCamera?.staticCostBuildCount).toBe(afterRestored?.staticCostBuildCount);
  expect(afterCamera?.dynamicCostBuildCount).toBe(afterRestored?.dynamicCostBuildCount);
  await saveScreenshot(page, 'zoom-pan-overlay-stable.png');
});

async function readDiagnostics(page: Page): Promise<RouteCostDiagnostics | undefined> {
  return page.evaluate(() => (
    window as Window & { __realWargameRouteCostDebug?: RouteCostDiagnostics }
  ).__realWargameRouteCostDebug);
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

async function canvasCenter(canvas: Locator): Promise<{ x: number; y: number }> {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounds unavailable.');
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}
