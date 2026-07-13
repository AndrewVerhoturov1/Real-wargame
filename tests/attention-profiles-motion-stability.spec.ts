import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.join('artifacts', 'screenshots');
const BOARD_ORIGIN = { x: 72, y: 72 };
const CELL_SIZE = 24;

interface OverlayDiagnostics {
  threatGeometryRebuildCount: number;
  threatMarkerUpdateCount: number;
  threatGeometryObjectCount: number;
}

test.beforeAll(() => mkdirSync(SCREENSHOT_DIR, { recursive: true }));

test('keeps machine-gun geometry and label stable while current confirmation changes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = collectBrowserErrors(page);
  await openSelectedSoldier(page);
  await page.locator('[data-attention-tab]').click();
  const panel = page.locator('.attention-runtime-panel');
  await expect(panel).toContainText('Пулемёт', { timeout: 30_000 });
  const before = await readOverlayDiagnostics(page);

  for (let sample = 0; sample < 30; sample += 1) {
    await expect(panel).toContainText('Пулемёт');
    await page.waitForTimeout(100);
  }

  const after = await readOverlayDiagnostics(page);
  expect(after?.threatGeometryObjectCount ?? 0).toBeGreaterThan(0);
  expect((after?.threatGeometryRebuildCount ?? 0) - (before?.threatGeometryRebuildCount ?? 0)).toBeLessThanOrEqual(1);
  expect(after?.threatMarkerUpdateCount ?? 0).toBeGreaterThanOrEqual(before?.threatMarkerUpdateCount ?? 0);
  await saveScreenshot(page, 'attention-fix-stable-machine-gun-and-label.png');
  expect(errors).toEqual([]);
});

test('offers named attention profiles and shows a soldier moving in its route direction', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = collectBrowserErrors(page);
  const canvas = await openSelectedSoldier(page);
  const profile = page.locator('[data-action="unit-attention-profile"]');
  await expect(profile).toBeVisible();
  await expect(profile.locator('option')).toContainText(['Индивидуальный', 'Обычный', 'Наблюдатель', 'Поиск', 'Бой']);
  await profile.selectOption('observer');
  await expect(profile).toHaveValue('observer');

  const destination = await worldPoint(canvas, 27.5, 10.5);
  await page.mouse.click(destination.x, destination.y, { button: 'right' });
  await page.waitForTimeout(900);
  await expect(page.locator('[data-role="order"]')).not.toContainText('Приказ: —');
  await saveScreenshot(page, 'attention-fix-moving-unit-faces-route.png');
  expect(errors).toEqual([]);
});

test('opens a reusable attention-profile editor in the AI editor', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = collectBrowserErrors(page);
  await page.goto('/ai-node-editor.html');
  const tab = page.locator('[data-navigation-tab="attentionProfiles"]');
  await expect(tab).toBeVisible();
  await tab.click();
  await expect(page.locator('.navigation-profile-workbench')).toBeVisible();
  await expect(page.locator('.navigation-profile-workbench')).toContainText('Профили внимания');
  await expect(page.locator('.navigation-profile-workbench')).toContainText('Создать');
  await expect(page.locator('.navigation-profile-workbench')).toContainText('Копировать');
  await expect(page.locator('[data-attention-mode]')).toBeVisible();
  await page.locator('[data-attention-mode]').selectOption('search');
  await expect(page.locator('.navigation-profile-workbench')).toContainText('Сектор поиска');
  await saveScreenshot(page, 'attention-fix-profile-editor.png');
  expect(errors).toEqual([]);
});

test('keeps the selected-unit bar inside its plaque at desktop and narrow widths', async ({ page }) => {
  const errors = collectBrowserErrors(page);
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1180, height: 760 }]) {
    await page.setViewportSize(viewport);
    await openSelectedSoldier(page);
    const bar = page.locator('.simulation-unit-bar');
    await expect(bar).toBeVisible();
    const result = await bar.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const children = [...element.children].filter((child): child is HTMLElement => child instanceof HTMLElement && getComputedStyle(child).display !== 'none');
      const offenders = children.flatMap((child) => {
        const childRect = child.getBoundingClientRect();
        const deltas = {
          left: rect.left - childRect.left,
          right: childRect.right - rect.right,
          top: rect.top - childRect.top,
          bottom: childRect.bottom - rect.bottom,
        };
        const outside = deltas.left > 1 || deltas.right > 1 || deltas.top > 1 || deltas.bottom > 1;
        if (!outside) return [];
        const style = getComputedStyle(child);
        return [{ className: child.className, deltas, rect: { x: childRect.x, y: childRect.y, width: childRect.width, height: childRect.height }, display: style.display, gridArea: style.gridArea, alignSelf: style.alignSelf }];
      });
      return {
        viewport: { width: innerWidth, height: innerHeight },
        barRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        offenders,
        horizontalOverflow: element.scrollWidth - element.clientWidth,
        verticalOverflow: element.scrollHeight - element.clientHeight,
      };
    });
    await saveScreenshot(page, `attention-fix-compact-unit-bar-${viewport.width}.png`);
    expect(result.offenders, JSON.stringify(result, null, 2)).toEqual([]);
    expect(result.horizontalOverflow, JSON.stringify(result, null, 2)).toBeLessThanOrEqual(1);
    expect(result.verticalOverflow, JSON.stringify(result, null, 2)).toBeLessThanOrEqual(1);
  }
  expect(errors).toEqual([]);
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

async function readOverlayDiagnostics(page: Page): Promise<OverlayDiagnostics | undefined> {
  return page.evaluate(() => (window as Window & { __realWargameOverlayDebug?: OverlayDiagnostics }).__realWargameOverlayDebug);
}

async function worldPoint(canvas: Locator, gridX: number, gridY: number): Promise<{ x: number; y: number }> {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounds unavailable.');
  return { x: box.x + BOARD_ORIGIN.x + gridX * CELL_SIZE, y: box.y + BOARD_ORIGIN.y + gridY * CELL_SIZE };
}

async function saveScreenshot(page: Page, name: string): Promise<void> {
  const session = await page.context().newCDPSession(page);
  try {
    const result = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
    writeFileSync(path.join(SCREENSHOT_DIR, name), Buffer.from(result.data, 'base64'));
  } finally { await session.detach(); }
}

function collectBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(`console: ${message.text()}`); });
  page.on('response', (response) => { if (response.status() >= 400 && new URL(response.url()).pathname !== '/favicon.ico') errors.push(`http ${response.status()}: ${new URL(response.url()).pathname}`); });
  return errors;
}
