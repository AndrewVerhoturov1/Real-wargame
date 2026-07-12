import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.join('artifacts', 'screenshots');
const VIEWPORT = { width: 1440, height: 900 };
const BOARD_ORIGIN = { x: 72, y: 72 };
const CELL_SIZE = 24;

test.beforeAll(() => mkdirSync(SCREENSHOT_DIR, { recursive: true }));

test('shows player command, AI plan and waypoint route as one controllable overlay', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto('/');

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  const soldier = await worldPoint(canvas, 27.574, 17.589);
  await page.mouse.click(soldier.x, soldier.y);
  await expect(page.locator('[data-role="unit-name"]')).toContainText('Солдат');

  const target = await worldPoint(canvas, 22, 14);
  await page.mouse.click(target.x, target.y, { button: 'right' });

  await expect(page.locator('[data-role="player-command"]')).toContainText('Приказ:');
  await expect(page.locator('[data-role="player-command"]')).toContainText(/выполняется|заблокирован/);
  await expect(page.locator('[data-role="unit-plan"]')).toContainText('План:');
  await expect(page.locator('[data-role="unit-route"]')).toContainText('Маршрут:');
  await expect(page.locator('[data-role="unit-route"]')).toContainText(/точка \d+\/\d+/);

  await page.locator('.workspace-display-menu > summary').click();
  const toggle = page.locator('[data-action="command-plan-route-overlay"]');
  await expect(toggle).toHaveText('Приказ · план · маршрут: вкл');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.workspace-display-menu > summary').click();

  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, '31-command-plan-route-overlay.png'),
    fullPage: true,
  });

  await page.locator('.workspace-display-menu > summary').click();
  await toggle.click();
  await expect(page.locator('body')).toHaveClass(/command-plan-route-overlay-off/);
  await expect(toggle).toHaveText('Приказ · план · маршрут: выкл');
});

async function worldPoint(
  canvas: import('@playwright/test').Locator,
  gridX: number,
  gridY: number,
): Promise<{ x: number; y: number }> {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounds unavailable.');
  return {
    x: box.x + BOARD_ORIGIN.x + gridX * CELL_SIZE,
    y: box.y + BOARD_ORIGIN.y + gridY * CELL_SIZE,
  };
}
