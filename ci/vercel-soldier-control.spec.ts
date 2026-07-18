import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const TARGET_URL = process.env.TARGET_URL ?? 'https://real-wargame-cover-rollback-backup-4yrocl6uw.vercel.app/';
const OUTPUT_DIR = path.join('artifacts', 'vercel-control');
const VIEWPORT = { width: 1440, height: 900 };
const BOARD_ORIGIN = { x: 72, y: 72 };
const CELL_SIZE = 24;

interface AwarenessDebug {
  representation?: string;
  visible?: boolean;
  mode?: string;
  displayObjectCount?: number;
  rasterWidth?: number;
  rasterHeight?: number;
  rebuildCount?: number;
  coverContourBuildCount?: number;
  lastCoverCacheKey?: string;
}

interface TestEvidence {
  targetUrl: string;
  selectionMethod: 'fixture' | 'editor-created';
  initialPosition: string;
  movedPosition: string;
  orderAfterCommand: string;
  overlay: Record<string, AwarenessDebug | null>;
  consoleErrors: string[];
  pageErrors: string[];
  requestFailures: string[];
}

mkdirSync(OUTPUT_DIR, { recursive: true });

test.use({
  viewport: VIEWPORT,
  trace: 'on',
  screenshot: 'only-on-failure',
  video: 'retain-on-failure',
});

test.setTimeout(150_000);

async function worldPoint(canvas: Locator, gridX: number, gridY: number): Promise<{ x: number; y: number }> {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounds unavailable.');
  return {
    x: box.x + BOARD_ORIGIN.x + gridX * CELL_SIZE,
    y: box.y + BOARD_ORIGIN.y + gridY * CELL_SIZE,
  };
}

async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(OUTPUT_DIR, name), fullPage: false });
}

async function selectedUnitName(page: Page): Promise<string> {
  return (await page.locator('[data-role="unit-name"]').textContent())?.trim() ?? '';
}

async function readAwareness(page: Page): Promise<AwarenessDebug | null> {
  return page.evaluate(() => {
    const value = (window as Window & { __realWargameAwarenessDebug?: AwarenessDebug }).__realWargameAwarenessDebug;
    return value ? { ...value } : null;
  });
}

async function waitForOverlay(page: Page, mode: 'danger' | 'cover' | 'combined'): Promise<AwarenessDebug> {
  await expect.poll(async () => {
    const value = await readAwareness(page);
    return `${value?.mode ?? 'none'}:${value?.visible ? 'visible' : 'hidden'}`;
  }, { timeout: 20_000, intervals: [200, 300, 500, 1000] }).toBe(`${mode}:visible`);

  if (mode !== 'danger') {
    await expect.poll(async () => (await readAwareness(page))?.lastCoverCacheKey ?? '', {
      timeout: 20_000,
      intervals: [250, 500, 1000],
    }).not.toBe('');
  }

  const diagnostics = await readAwareness(page);
  if (!diagnostics) throw new Error(`Missing awareness diagnostics in ${mode} mode.`);
  expect(diagnostics.representation).toBe('raster-sprite-with-region-contours');
  expect(diagnostics.displayObjectCount ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(3);
  expect(diagnostics.rasterWidth).toBe(320);
  expect(diagnostics.rasterHeight).toBe(200);
  return diagnostics;
}

async function selectOrCreateSoldier(page: Page, canvas: Locator): Promise<'fixture' | 'editor-created'> {
  const fixture = await worldPoint(canvas, 27.574, 17.589);
  await page.mouse.click(fixture.x, fixture.y);
  await page.waitForTimeout(700);
  if (!(await selectedUnitName(page)).includes('не выбран')) return 'fixture';

  await page.locator('[data-mode="editor"]').click();
  await expect(page.locator('body')).toHaveClass(/workspace-editor/);
  await page.locator('.game-editor-tabs').getByRole('button', { name: 'Боец', exact: true }).click();
  const placeButton = page.locator('.game-editor-global-tools').getByRole('button', { name: 'Поставить бойца' });
  await expect(placeButton).toBeVisible();
  await placeButton.click();

  const spawn = await worldPoint(canvas, 12, 12);
  await page.mouse.click(spawn.x, spawn.y);
  await expect(page.locator('.game-editor-selected-summary').filter({ hasText: /editor_unit/ }).first()).toContainText(/editor_unit/);
  await capture(page, '02-editor-created-soldier.png');

  await page.locator('[data-mode="simulation"]').click();
  await expect(page.locator('body')).toHaveClass(/workspace-simulation/);
  await page.waitForTimeout(500);
  if ((await selectedUnitName(page)).includes('не выбран')) await page.mouse.click(spawn.x, spawn.y);
  await expect(page.locator('[data-role="unit-name"]')).not.toContainText('не выбран');
  return 'editor-created';
}

test('deployed game allows soldier selection, movement and persistent tactical overlays', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    requestFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`);
  });

  const response = await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 90_000 });
  expect(response?.status(), 'Deployment should return a successful HTTP status.').toBeLessThan(400);
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.tactical-workspace-bar')).toBeVisible();
  await expect(page.locator('.simulation-sidebar')).toBeVisible();
  await capture(page, '01-deployment-loaded.png');

  const selectionMethod = await selectOrCreateSoldier(page, canvas);
  const unitName = await selectedUnitName(page);
  expect(unitName).not.toContain('не выбран');
  await capture(page, '03-soldier-selected.png');

  const position = page.locator('[data-live="position"]');
  await expect(position).not.toHaveText('—');
  const initialPosition = (await position.textContent())?.trim() ?? '';

  const target = await worldPoint(canvas, selectionMethod === 'fixture' ? 30.5 : 15, selectionMethod === 'fixture' ? 17.5 : 12);
  const order = page.locator('[data-role="order"]');
  const orderBefore = (await order.textContent())?.trim() ?? '';
  await page.mouse.click(target.x, target.y, { button: 'right' });
  await expect.poll(async () => (await order.textContent())?.trim() ?? '', { timeout: 10_000 }).not.toBe(orderBefore);
  const orderAfterCommand = (await order.textContent())?.trim() ?? '';

  const speedFour = page.locator('[data-speed="4"]');
  if (await speedFour.count()) await speedFour.click();
  const pauseButton = page.locator('[data-action="pause"]');
  if ((await pauseButton.textContent())?.includes('Продолжить')) await pauseButton.click();

  await expect.poll(async () => (await position.textContent())?.trim() ?? '', {
    timeout: 15_000,
    intervals: [250, 500, 750, 1000],
  }).not.toBe(initialPosition);
  const movedPosition = (await position.textContent())?.trim() ?? '';
  await capture(page, '04-soldier-moved.png');

  if ((await pauseButton.textContent())?.includes('Пауза')) await pauseButton.click();

  await page.locator('[data-tab="danger"]').click();
  await expect(page.locator('[data-role="sidebar-title"]')).toContainText('Опасность');
  const sidebarBody = page.locator('[data-role="sidebar-body"]');
  await expect(sidebarBody.locator('[data-overlay-mode]')).toHaveCount(3);
  await expect(page.locator('.simulation-unit-bar [data-overlay-mode]')).toHaveCount(0);

  const overlay: Record<string, AwarenessDebug | null> = {};
  for (const mode of ['danger', 'cover', 'combined'] as const) {
    await sidebarBody.locator(`[data-overlay-mode="${mode}"]`).click();
    overlay[mode] = await waitForOverlay(page, mode);
    await capture(page, `05-overlay-${mode}.png`);
  }

  const idleCombinedBefore = await readAwareness(page);
  await page.waitForTimeout(3000);
  const idleCombinedAfter = await readAwareness(page);
  expect(idleCombinedAfter?.mode).toBe('combined');
  expect(idleCombinedAfter?.visible).toBe(true);
  expect(idleCombinedAfter?.lastCoverCacheKey).toBeTruthy();
  expect(idleCombinedBefore?.lastCoverCacheKey).toBeTruthy();
  await capture(page, '06-combined-after-idle.png');

  const evidence: TestEvidence = {
    targetUrl: TARGET_URL,
    selectionMethod,
    initialPosition,
    movedPosition,
    orderAfterCommand,
    overlay,
    consoleErrors,
    pageErrors,
    requestFailures,
  };
  writeFileSync(path.join(OUTPUT_DIR, 'evidence.json'), JSON.stringify(evidence, null, 2));

  expect(pageErrors, `Uncaught page errors: ${pageErrors.join('\n')}`).toEqual([]);
});
