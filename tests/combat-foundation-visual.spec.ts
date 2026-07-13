import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.join('artifacts', 'screenshots');
const VIEWPORT = { width: 1440, height: 900 };
const BOARD_ORIGIN = { x: 72, y: 72 };
const CELL_SIZE = 24;
const BLUE_SPAWN = { x: 10, y: 8 };
const RED_SPAWN = { x: 14, y: 8 };

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

async function clickUnit(page: Page, canvas: Locator, position: { x: number; y: number }): Promise<void> {
  const point = await worldPoint(canvas, position.x, position.y);
  await page.mouse.click(point.x, point.y);
}

async function placeUnit(page: Page, canvas: Locator, side: 'blue' | 'red', position: { x: number; y: number }, expectedId: string): Promise<void> {
  await page.locator('[data-action="editor-unit-side"]').selectOption(side);
  await expect(page.locator('[data-action="editor-unit-side"]')).toHaveValue(side);
  const placeButton = page.locator('.game-editor-global-tools').getByRole('button', { name: 'Поставить бойца' });
  await expect(placeButton).toBeVisible();
  await placeButton.click();
  const point = await worldPoint(canvas, position.x, position.y);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('.game-editor-selected-summary')).toContainText(expectedId);
}

async function waitForFireActionToFinish(page: Page): Promise<void> {
  const action = page.locator('[data-role="action"]');
  await expect.poll(async () => action.textContent(), { timeout: 20_000 })
    .not.toContain('стрельба:');
}

test.beforeAll(() => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

test('visually verifies two hostile sides, personal contact and stateful rifle fire', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });

  await page.setViewportSize(VIEWPORT);
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto('/');

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(page.locator('.tactical-workspace-bar')).toBeVisible();

  await page.locator('[data-mode="editor"]').click();
  await expect(page.locator('body')).toHaveClass(/workspace-editor/);
  await page.locator('.game-editor-tabs').getByRole('button', { name: 'Боец', exact: true }).click();
  await placeUnit(page, canvas, 'blue', BLUE_SPAWN, 'editor_unit_1');
  await placeUnit(page, canvas, 'red', RED_SPAWN, 'editor_unit_2');
  await page.waitForTimeout(350);
  await saveScreenshot(page, '20-combat-editor-two-sides.png');

  await page.locator('[data-mode="simulation"]').click();
  await expect(page.locator('body')).toHaveClass(/workspace-simulation/);
  await clickUnit(page, canvas, BLUE_SPAWN);
  await expect(page.locator('[data-role="unit-meta"]')).toContainText('Свои');
  await expect(page.locator('[data-stat="ammo"]')).toHaveText(/\d+\+\d+/);

  const turnButton = page.locator('[data-action="turn-unit"]');
  await turnButton.click();
  await expect(turnButton).toHaveText('Куда?');
  const redPoint = await worldPoint(canvas, RED_SPAWN.x, RED_SPAWN.y);
  await page.mouse.click(redPoint.x, redPoint.y, { button: 'right' });
  await expect(turnButton).toHaveText('Повернуть');

  const pauseButton = page.locator('[data-action="pause"]');
  if ((await pauseButton.textContent())?.trim() === 'Продолжить') {
    await pauseButton.click();
  }
  await expect(pauseButton).toHaveText('Пауза');

  const fastSpeed = page.locator('[data-speed="10"]');
  await fastSpeed.click();
  await expect(fastSpeed).toHaveClass(/active/);
  await page.waitForTimeout(500);
  await saveScreenshot(page, '21-combat-simulation-running.png');

  const fireButton = page.locator('[data-action="fire-contact"]');
  await expect(fireButton).toBeEnabled({ timeout: 30_000 });
  await expect(fireButton).toHaveAttribute('title', /Личный контакт:/);

  const normalSpeed = page.locator('[data-speed="1"]');
  await normalSpeed.click();
  await expect(normalSpeed).toHaveClass(/active/);
  await page.waitForTimeout(350);
  await saveScreenshot(page, '22-combat-contact-ready.png');

  const ammoBefore = await page.locator('[data-stat="ammo"]').textContent();
  await fireButton.click();
  await expect(page.locator('[data-role="action"]')).toContainText(/стрельба: (поворот|подготовка оружия|наведение|проверка линии огня)/, { timeout: 8_000 });
  await page.waitForTimeout(250);
  await saveScreenshot(page, '23-combat-stateful-aiming.png');

  await expect.poll(async () => page.locator('[data-stat="ammo"]').textContent(), { timeout: 20_000 })
    .not.toBe(ammoBefore);
  await waitForFireActionToFinish(page);
  await page.waitForTimeout(350);
  await saveScreenshot(page, '24-combat-shot-complete.png');

  await clickUnit(page, canvas, RED_SPAWN);
  await expect(page.locator('[data-role="unit-meta"]')).toContainText('Противник');
  await expect(page.locator('[data-role="unit-meta"]')).toContainText(/боеспособен|ранен|тяжело ранен|выведен из строя|погиб/);
  await page.waitForTimeout(350);
  await saveScreenshot(page, '25-combat-target-outcome.png');

  expect(pageErrors, `Browser errors: ${pageErrors.join(' | ')}`).toEqual([]);
});
