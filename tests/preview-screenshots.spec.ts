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
// The current preview scene has one soldier from the exported user map near grid 27.07,17.09.
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

async function zoomInSeveralSteps(page: Page, steps: number): Promise<void> {
  for (let index = 0; index < steps; index += 1) {
    await page.mouse.wheel(0, -600);
    await page.waitForTimeout(40);
  }
}

test('capture Real-Wargame preview screenshots', async ({ page }) => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  await page.setViewportSize(VIEWPORT);
  await page.goto('/');

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(page.locator('.top-command-bar')).toBeVisible();
  await expect(page.locator('.game-bottom-panel')).toBeVisible();
  await expect(page.locator('.game-right-panel')).toBeVisible();

  // Let Pixi finish the first render/ticker pass.
  await page.waitForTimeout(800);
  await saveScreenshot(page, '01-initial.png');

  const soldier = boardPoint(27.07, 17.09);
  await page.mouse.click(soldier.x, soldier.y);
  await page.waitForTimeout(300);
  await saveScreenshot(page, '02-selected-unit.png');

  const moveTarget = boardPoint(22, 17);
  await page.mouse.click(moveTarget.x, moveTarget.y, { button: 'right' });
  await page.waitForTimeout(300);
  await saveScreenshot(page, '03-move-order.png');

  await page.locator('.floating-editor-button').click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('.editor-section')).toBeVisible();
  await page.waitForTimeout(400);
  await saveScreenshot(page, '04-editor-mode.png');

  await page.locator('.floating-editor-button').click();
  await page.waitForTimeout(400);
  const hillCenter = boardPoint(27, 17);
  await page.mouse.move(hillCenter.x, hillCenter.y);
  await zoomInSeveralSteps(page, 12);
  await page.waitForTimeout(500);
  await saveScreenshot(page, '05-zoomed-map.png');
});
