import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.join('artifacts', 'screenshots');
const VIEWPORT = { width: 1440, height: 900 };
const BOARD_ORIGIN = { x: 72, y: 72 };
const CELL_SIZE = 24;

interface FrontZoneDiagnostics {
  visible: boolean;
  friendlyBoundaryX: number;
  enemyBoundaryX: number;
  selectedUnitTerritory: 'friendly' | 'neutral' | 'enemy' | null;
  selectedUnitSafety: number | null;
}

test.beforeAll(() => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

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

async function setRangeValue(locator: Locator, value: number): Promise<void> {
  await locator.evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    input.value = String(nextValue);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

async function readDiagnostics(page: Page): Promise<FrontZoneDiagnostics | undefined> {
  return page.evaluate(() => (
    window as Window & { __realWargameFrontZones?: FrontZoneDiagnostics }
  ).__realWargameFrontZones);
}

test('front zones are editable, toggleable and expose territory safety to the selected soldier', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto('/');

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await page.waitForFunction(() => Boolean(
    (window as Window & { __realWargameFrontZones?: FrontZoneDiagnostics }).__realWargameFrontZones,
  ));

  const overlay = page.locator('[data-front-zone-overlay]');
  await expect(overlay).toBeVisible();
  await expect(page.locator('[data-front-zone-band="friendly"]')).toBeVisible();
  await expect(page.locator('[data-front-zone-band="neutral"]')).toBeVisible();
  await expect(page.locator('[data-front-zone-band="enemy"]')).toBeVisible();

  await page.locator('[data-mode="editor"]').click();
  await page.locator('.game-editor-tabs').getByRole('button', { name: 'Сцена', exact: true }).click();
  const friendlySlider = page.locator('[data-front-zone-boundary="friendly"]');
  const enemySlider = page.locator('[data-front-zone-boundary="enemy"]');
  await expect(friendlySlider).toBeVisible();
  await expect(enemySlider).toBeVisible();

  await setRangeValue(friendlySlider, 18);
  await setRangeValue(enemySlider, 44);
  await expect.poll(async () => {
    const diagnostics = await readDiagnostics(page);
    return `${diagnostics?.friendlyBoundaryX}:${diagnostics?.enemyBoundaryX}`;
  }).toBe('18:44');

  const canvasBox = await canvas.boundingBox();
  const friendlyLineBox = await page.locator('[data-front-zone-line="friendly"]').boundingBox();
  const enemyLineBox = await page.locator('[data-front-zone-line="enemy"]').boundingBox();
  if (!canvasBox || !friendlyLineBox || !enemyLineBox) throw new Error('Front boundary geometry unavailable.');
  const expectedFriendlyX = canvasBox.x + BOARD_ORIGIN.x + 18 * CELL_SIZE - friendlyLineBox.width / 2;
  const expectedEnemyX = canvasBox.x + BOARD_ORIGIN.x + 44 * CELL_SIZE - enemyLineBox.width / 2;
  expect(Math.abs(friendlyLineBox.x - expectedFriendlyX)).toBeLessThan(3);
  expect(Math.abs(enemyLineBox.x - expectedEnemyX)).toBeLessThan(3);

  await page.locator('[data-mode="simulation"]').click();
  const soldier = await worldPoint(canvas, 27.574, 17.589);
  await page.mouse.click(soldier.x, soldier.y);
  await expect(page.locator('[data-role="unit-name"]')).toContainText('Солдат');
  await expect.poll(async () => {
    const diagnostics = await readDiagnostics(page);
    return `${diagnostics?.selectedUnitTerritory}:${diagnostics?.selectedUnitSafety}`;
  }).toBe('neutral:50');

  await page.locator('.workspace-display-menu summary').click();
  const visibilityButton = page.locator('[data-front-zone-visibility]');
  await expect(visibilityButton).toContainText('Линия фронта: вкл');
  await visibilityButton.click();
  await expect(overlay).toBeHidden();
  await expect(visibilityButton).toContainText('Линия фронта: выкл');
  await visibilityButton.click();
  await expect(overlay).toBeVisible();

  await page.locator('[data-mode="editor"]').click();
  await expect(friendlySlider).toBeVisible();
  await saveScreenshot(page, '14-simple-front-zones-editor.png');
});
