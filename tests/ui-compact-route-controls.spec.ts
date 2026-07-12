import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.join('artifacts', 'screenshots', 'ui-compact-route-controls');
const VIEWPORT = { width: 1440, height: 900 };
const BOARD_ORIGIN = { x: 72, y: 72 };
const CELL_SIZE = 24;

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

async function selectFixtureSoldier(page: Page, canvas: Locator): Promise<void> {
  const soldier = await worldPoint(canvas, 27.574, 17.589);
  await page.mouse.click(soldier.x, soldier.y);
  await expect(page.locator('[data-role="unit-name"]')).toContainText('Солдат');
}

test.beforeAll(() => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

test('game exposes compact profile and route-cost controls', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto('/');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await selectFixtureSoldier(page, canvas);

  const bottomBar = page.locator('.simulation-unit-bar');
  const profile = page.locator('[data-action="unit-navigation-profile"]');
  const quickToggle = page.locator('[data-action="route-cost-quick-toggle"]');
  const routeSummary = page.locator('[data-role="route-summary"]');
  await expect(profile).toBeVisible();
  await expect(quickToggle).toBeVisible();
  await expect(routeSummary).toBeVisible();
  await expect(profile).toHaveValue('normal');
  await profile.selectOption('stealth');
  await expect(profile).toHaveValue('stealth');

  const barBox = await bottomBar.boundingBox();
  expect(barBox?.height ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(130);
  const canvasBox = await canvas.boundingBox();
  expect((canvasBox?.height ?? 0)).toBeGreaterThan(650);

  await saveScreenshot(page, '01-game-compact-route-controls.png');

  await quickToggle.click();
  await expect(quickToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(quickToggle).toContainText('вкл');
  await page.waitForTimeout(700);
  await saveScreenshot(page, '02-game-cost-overlay-quick-toggle.png');
});

test('completed route has no stale blue target', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto('/');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await selectFixtureSoldier(page, canvas);

  const target = await worldPoint(canvas, 28.1, 17.6);
  await page.mouse.click(target.x, target.y, { button: 'right' });
  const routeSummary = page.locator('[data-role="route-summary"]');
  await expect(routeSummary).toContainText(/Маршрут:/);
  await expect.poll(async () => routeSummary.textContent(), { timeout: 12_000 }).toContain('завершён');
  await expect(page.locator('[data-role="route-details-plan"]')).toContainText('План:');
  await page.waitForTimeout(500);
  await saveScreenshot(page, '03-game-completed-route-no-blue-target.png');
});

test('AI editor uses one unified navigation bar without overlap', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto('/ai-node-editor.html');

  const navigation = page.locator('.navigation-profile-tabs');
  await expect(navigation).toBeVisible();
  await expect(page.locator('.app-shell-menu')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Auto 4|4–5/ })).toHaveCount(0);
  await expect(navigation.getByRole('button', { name: 'Граф поведения' })).toBeVisible();
  await expect(navigation.getByRole('button', { name: 'Профили движения' })).toBeVisible();
  await expect(navigation.getByRole('button', { name: 'Данные бойца' })).toBeVisible();
  await expect(navigation.getByRole('button', { name: 'Словарь ИИ' })).toBeVisible();
  await expect(navigation.getByRole('button', { name: 'Инструменты ИИ' })).toBeVisible();
  await expect(navigation.getByRole('button', { name: 'Обновить' })).toBeVisible();
  await expect(navigation.getByRole('button', { name: 'Открыть игру' })).toBeVisible();
  await expect(navigation.getByRole('button', { name: 'Выход' })).toBeVisible();

  const navigationBox = await navigation.boundingBox();
  const editorBox = await page.locator('#ai-node-editor-root').boundingBox();
  expect((editorBox?.y ?? 0)).toBeGreaterThanOrEqual((navigationBox?.y ?? 0) + (navigationBox?.height ?? 0) - 1);
  await saveScreenshot(page, '04-editor-unified-navigation.png');

  await navigation.getByRole('button', { name: 'Профили движения' }).click();
  const heading = page.locator('.navigation-profile-form-heading');
  await expect(heading).toBeVisible();
  await expect(heading.getByRole('heading', { level: 2 })).toBeVisible();
  await expect(page.locator('.navigation-profile-name-card')).toBeVisible();
  const headingBox = await heading.boundingBox();
  const formBox = await page.locator('.navigation-profile-form-panel').boundingBox();
  expect((headingBox?.y ?? 0)).toBeGreaterThanOrEqual((formBox?.y ?? 0));
  expect((headingBox?.y ?? 0) + (headingBox?.height ?? 0)).toBeLessThanOrEqual((formBox?.y ?? 0) + (formBox?.height ?? 0));
  await saveScreenshot(page, '05-editor-profile-layout.png');

  await navigation.getByRole('button', { name: 'Данные бойца' }).click();
  await expect(page.getByRole('heading', { name: 'Данные бойца' })).toBeVisible();
  await expect(navigation.getByRole('button', { name: 'Словарь ИИ' })).toBeVisible();
  await expect(navigation.getByRole('button', { name: 'Инструменты ИИ' })).toBeVisible();
  await saveScreenshot(page, '06-editor-data-and-global-tools.png');
});
