import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.join('artifacts', 'screenshots');
const VIEWPORT = { width: 1440, height: 900 };
const BOARD_ORIGIN = { x: 72, y: 72 };
const CELL_SIZE = 24;
const BLUE_SPAWN = { x: 10, y: 8 };
const RED_SPAWN = { x: 14, y: 8 };
const AWAY_POINT = { x: 6, y: 8 };

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

async function turnSelectedUnit(page: Page, canvas: Locator, target: { x: number; y: number }): Promise<void> {
  const turnButton = page.locator('[data-action="turn-unit"]');
  await turnButton.click();
  await expect(turnButton).toHaveText('Куда?');
  const point = await worldPoint(canvas, target.x, target.y);
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await expect(turnButton).toHaveText('Повернуть');
}

function sideSelect(page: Page): Locator {
  return page.locator('.game-editor-body .game-editor-field').filter({ hasText: 'Сторона' }).locator('select');
}

async function placeUnit(page: Page, canvas: Locator, side: 'blue' | 'red', position: { x: number; y: number }, expectedId: string): Promise<void> {
  await sideSelect(page).selectOption(side);
  await expect(sideSelect(page)).toHaveValue(side);
  const placeButton = page.locator('.game-editor-global-tools').getByRole('button', { name: 'Поставить бойца' });
  await expect(placeButton).toBeVisible();
  await placeButton.click();
  const point = await worldPoint(canvas, position.x, position.y);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('.game-editor-selected-summary')).toContainText(expectedId);
  if (side === 'red') await expect(page.locator('.game-editor-status')).toContainText('Противник');
}

test.beforeAll(() => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

test('prepares visual proof for existing detection, fire permission and rifle feedback', async ({ page }) => {
  const pageErrors: string[] = [];
  const httpErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().startsWith('Failed to load resource:')) return;
    pageErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() < 400) return;
    const url = new URL(response.url());
    if (response.status() === 404 && url.pathname === '/favicon.ico') return;
    httpErrors.push(`${response.status()} ${url.pathname}`);
  });

  await page.setViewportSize(VIEWPORT);
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto('/');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg');
  const faviconResponse = await page.request.get('/favicon.svg');
  expect(faviconResponse.status()).toBe(200);

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(page.locator('.tactical-workspace-bar')).toBeVisible();

  await page.locator('[data-mode="editor"]').click();
  await expect(page.locator('body')).toHaveClass(/workspace-editor/);
  await page.locator('.game-editor-tabs').getByRole('button', { name: 'Боец', exact: true }).click();
  await expect(sideSelect(page)).toBeVisible();
  await expect(page.locator('[data-action="editor-unit-side"]')).toHaveCount(0);
  await placeUnit(page, canvas, 'blue', BLUE_SPAWN, 'editor_unit_1');
  await placeUnit(page, canvas, 'red', RED_SPAWN, 'editor_unit_2');
  await page.waitForTimeout(350);
  await saveScreenshot(page, '20-combat-editor-two-sides.png');

  await page.locator('[data-mode="simulation"]').click();
  await expect(page.locator('body')).toHaveClass(/workspace-simulation/);
  const firePermission = page.locator('[data-action="toggle-fire-permission"]');
  await expect(firePermission).toBeVisible();
  await expect(firePermission).toHaveText('Стрельба: запрещена');
  await expect(firePermission).toHaveAttribute('aria-pressed', 'false');

  await clickUnit(page, canvas, BLUE_SPAWN);
  await expect(page.locator('[data-role="unit-meta"]')).toContainText('Свои');
  await turnSelectedUnit(page, canvas, AWAY_POINT);

  const pauseButton = page.locator('[data-action="pause"]');
  if ((await pauseButton.textContent())?.trim() === 'Продолжить') await pauseButton.click();
  await expect(pauseButton).toHaveText('Пауза');

  const fireButton = page.locator('[data-action="fire-contact"]');
  const ammoBeforeContact = await page.locator('[data-stat="ammo"]').textContent();
  await page.waitForTimeout(1200);
  await expect(fireButton).toBeDisabled();
  await expect(page.locator('[data-stat="ammo"]')).toHaveText(ammoBeforeContact ?? '');
  await saveScreenshot(page, '21-combat-rear-not-identified.png');

  await turnSelectedUnit(page, canvas, RED_SPAWN);
  const fastSpeed = page.locator('[data-speed="10"]');
  await fastSpeed.click();
  await expect(fastSpeed).toHaveClass(/active/);
  await expect(fireButton).toBeDisabled({ timeout: 30_000 });
  await expect(fireButton).toHaveAttribute('title', /Личный контакт:/, { timeout: 30_000 });

  const normalSpeed = page.locator('[data-speed="1"]');
  await normalSpeed.click();
  await expect(normalSpeed).toHaveClass(/active/);
  const ammoWhileForbidden = await page.locator('[data-stat="ammo"]').textContent();
  await page.waitForTimeout(700);
  await expect(page.locator('[data-stat="ammo"]')).toHaveText(ammoWhileForbidden ?? '');
  await saveScreenshot(page, '22-combat-contact-fire-forbidden.png');

  await firePermission.click();
  await expect(firePermission).toHaveText('Стрельба: разрешена');
  await expect(firePermission).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-role="action"]')).toContainText(/стрельба: (поворот|подготовка оружия|наведение|проверка линии огня)/, { timeout: 8_000 });
  await page.waitForTimeout(180);
  await saveScreenshot(page, '23-combat-fire-enabled-aiming.png');

  await expect.poll(async () => page.locator('[data-stat="ammo"]').textContent(), { timeout: 20_000 })
    .not.toBe(ammoWhileForbidden);
  await saveScreenshot(page, '24-combat-tracer-impact.png');
  await page.waitForTimeout(450);
  await saveScreenshot(page, '25-combat-shot-feedback-complete.png');

  await clickUnit(page, canvas, RED_SPAWN);
  await expect(page.locator('[data-role="unit-meta"]')).toContainText('Противник');
  await expect(page.locator('[data-role="unit-meta"]')).toContainText(/боеспособен|ранен|тяжело ранен|выведен из строя|погиб/);
  await page.waitForTimeout(250);
  await saveScreenshot(page, '26-combat-target-outcome.png');

  expect(pageErrors, `Browser errors: ${pageErrors.join(' | ')}`).toEqual([]);
  expect(httpErrors, `HTTP errors: ${httpErrors.join(' | ')}`).toEqual([]);
});
