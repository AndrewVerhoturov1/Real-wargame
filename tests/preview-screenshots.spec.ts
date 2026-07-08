import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.join('artifacts', 'screenshots');

const VIEWPORT = {
  width: 1440,
  height: 900,
};

// These coordinates match the current Pixi tactical board layout:
// worldContainer origin: 72,72; map cell size: 24 px.
// The first test unit starts at grid cell 3,5 and is normalized to 3.5,5.5.
const BOARD_ORIGIN = { x: 72, y: 72 };
const CELL_SIZE = 24;

function boardPoint(cellX: number, cellY: number): { x: number; y: number } {
  return {
    x: BOARD_ORIGIN.x + (cellX + 0.5) * CELL_SIZE,
    y: BOARD_ORIGIN.y + (cellY + 0.5) * CELL_SIZE,
  };
}

async function saveScreenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, name),
    fullPage: false,
  });
}

test('capture Real-Wargame preview screenshots', async ({ page }) => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  await page.setViewportSize(VIEWPORT);
  await page.goto('/');

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(page.locator('#debug-panel')).toBeVisible();

  // Let Pixi finish the first render/ticker pass.
  await page.waitForTimeout(800);
  await saveScreenshot(page, '01-initial.png');

  const firstUnit = boardPoint(3, 5);
  await page.mouse.click(firstUnit.x, firstUnit.y);
  await page.waitForTimeout(300);
  await saveScreenshot(page, '02-selected-unit.png');

  const moveTarget = boardPoint(22, 20);
  await page.mouse.click(moveTarget.x, moveTarget.y, { button: 'right' });
  await page.waitForTimeout(300);
  await saveScreenshot(page, '03-move-order.png');

  await page.waitForTimeout(1500);
  await saveScreenshot(page, '04-after-movement.png');

  await page.mouse.move(640, 420);
  await page.mouse.wheel(0, -600);
  await page.waitForTimeout(500);
  await saveScreenshot(page, '05-zoomed-map.png');
});
