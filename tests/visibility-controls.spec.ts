import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.join('artifacts', 'screenshots');
const VIEWPORT = { width: 1440, height: 900 };
const BOARD_ORIGIN = { x: 72, y: 72 };
const CELL_SIZE = 24;

interface ViewMemoryDiagnostics {
  representation: 'raster-sprite';
  visible: boolean;
  textureUploadCount: number;
  fieldRevision: number;
  fieldRebuildCount: number;
  fieldCacheHitCount: number;
  cachedFieldCount: number;
  rasterWidth: number;
  rasterHeight: number;
}

test.beforeAll(() => mkdirSync(SCREENSHOT_DIR, { recursive: true }));

test('shows dark unseen terrain, compact legend and clear one-field cache diagnostics', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  const browserErrors = collectBrowserErrors(page);
  await openSelectedSoldier(page);

  await page.locator('[data-attention-tab]').click();
  const panel = page.locator('.attention-runtime-panel');
  const legend = panel.locator('.attention-compact-legend');
  await expect(panel).toBeVisible();
  await expect(legend).toBeVisible();
  await expect(legend).toContainText('Хорошо видно');
  await expect(legend).toContainText('Средне');
  await expect(legend).toContainText('Слабо');
  await expect(legend).toContainText('Не видно');
  await expect(legend).toContainText('Текущий контакт');
  await expect(legend).toContainText('Последнее место');
  await expect(legend).toContainText('Подозрение');
  await expect(legend).toContainText('Звук');
  await expect(panel).toContainText('Полей в кеше');
  await expect(panel).toContainText('Повторных использований с запуска');

  await waitForVisibilityField(page);
  const diagnostics = await readViewMemoryDiagnostics(page);
  expect(diagnostics?.representation).toBe('raster-sprite');
  expect(diagnostics?.cachedFieldCount).toBe(1);
  expect(diagnostics?.rasterWidth ?? 0).toBeGreaterThan(0);
  expect(diagnostics?.rasterHeight ?? 0).toBeGreaterThan(0);
  await saveScreenshot(page, 'visibility-controls-dark-unseen-and-legend.png');
  expect(browserErrors).toEqual([]);
});

test('manually changes attention mode and performs a one-shot turn command', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  const browserErrors = collectBrowserErrors(page);
  const canvas = await openSelectedSoldier(page);
  await page.locator('[data-attention-tab]').click();
  await waitForVisibilityField(page);

  const mode = page.locator('[data-action="unit-attention-mode"]');
  await mode.selectOption('search');
  await expect.poll(async () => page.locator('.attention-runtime-panel').textContent()).toContain('Поиск цели');
  await saveScreenshot(page, 'visibility-controls-manual-search-mode.png');
  await mode.selectOption('observe');
  await expect.poll(async () => page.locator('.attention-runtime-panel').textContent()).toContain('Наблюдение');

  const before = await readViewMemoryDiagnostics(page);
  const turn = page.locator('[data-action="turn-unit"]');
  await turn.click();
  await expect(turn).toHaveClass(/active/);
  await expect(turn).toContainText('Куда?');
  await expect.poll(async () => canvas.evaluate((element) => getComputedStyle(element).cursor)).toBe('crosshair');

  const target = await worldPoint(canvas, 35.5, 12.5);
  await page.mouse.click(target.x, target.y, { button: 'right' });
  await expect(turn).not.toHaveClass(/active/);
  await expect(turn).toContainText('Повернуть');
  await expect.poll(async () => canvas.evaluate((element) => getComputedStyle(element).cursor)).not.toBe('crosshair');
  await expect.poll(async () => (await readViewMemoryDiagnostics(page))?.fieldRevision ?? 0).toBeGreaterThan(before?.fieldRevision ?? 0);
  await saveScreenshot(page, 'visibility-controls-one-shot-turn.png');
  expect(browserErrors).toEqual([]);
});

test('shows a final-facing arrow while right-dragging a movement destination', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  const browserErrors = collectBrowserErrors(page);
  const canvas = await openSelectedSoldier(page);
  await page.keyboard.press('p');
  await expect(page.locator('#pause-toggle')).toContainText('Пауза: вкл');

  const destination = await worldPoint(canvas, 32.5, 18.5);
  const facingPoint = await worldPoint(canvas, 32.5, 13.5);
  await page.mouse.move(destination.x, destination.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(facingPoint.x, facingPoint.y, { steps: 8 });
  await page.waitForTimeout(120);
  await saveScreenshot(page, 'visibility-controls-route-facing-draft.png');
  await page.mouse.up({ button: 'right' });
  await expect(page.locator('[data-role="order"]')).not.toContainText('Приказ: —');
  await page.waitForTimeout(150);
  await saveScreenshot(page, 'visibility-controls-route-facing-command.png');
  expect(browserErrors).toEqual([]);
});

async function openSelectedSoldier(page: Page): Promise<Locator> {
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto('/');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  const soldier = await worldPoint(canvas, 27.574, 17.589);
  await page.mouse.click(soldier.x, soldier.y);
  await expect(page.locator('[data-role="unit-name"]')).toContainText('Солдат');
  return canvas;
}

async function waitForVisibilityField(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const diagnostics = (window as Window & { __realWargameViewMemoryDebug?: ViewMemoryDiagnostics }).__realWargameViewMemoryDebug;
    return Boolean(diagnostics?.visible && diagnostics.fieldRevision > 0 && diagnostics.textureUploadCount > 0);
  });
}

async function readViewMemoryDiagnostics(page: Page): Promise<ViewMemoryDiagnostics | undefined> {
  return page.evaluate(() => (
    window as Window & { __realWargameViewMemoryDebug?: ViewMemoryDiagnostics }
  ).__realWargameViewMemoryDebug);
}

async function worldPoint(canvas: Locator, gridX: number, gridY: number): Promise<{ x: number; y: number }> {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounds unavailable.');
  return {
    x: box.x + BOARD_ORIGIN.x + gridX * CELL_SIZE,
    y: box.y + BOARD_ORIGIN.y + gridY * CELL_SIZE,
  };
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

function collectBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().startsWith('Failed to load resource')) return;
    errors.push(`console: ${message.text()}`);
  });
  page.on('response', (response) => {
    if (response.status() < 400) return;
    const url = new URL(response.url());
    if (url.pathname === '/favicon.ico') return;
    errors.push(`http ${response.status()}: ${url.pathname}`);
  });
  return errors;
}
