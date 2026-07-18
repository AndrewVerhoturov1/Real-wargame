import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const TARGET_URL = process.env.TARGET_URL ?? 'https://real-wargame-cover-rollback-backup-4yrocl6uw.vercel.app/';
const OUTPUT_DIR = path.join('artifacts', 'vercel-control');
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

const evidence: Record<string, unknown> = {
  targetUrl: TARGET_URL,
  stages: [],
  consoleErrors: [],
  pageErrors: [],
  requestFailures: [],
  overlay: {},
};

mkdirSync(OUTPUT_DIR, { recursive: true });

function saveEvidence(): void {
  writeFileSync(path.join(OUTPUT_DIR, 'evidence.json'), JSON.stringify(evidence, null, 2));
}

function stage(name: string, details: Record<string, unknown> = {}): void {
  (evidence.stages as Array<Record<string, unknown>>).push({ name, at: new Date().toISOString(), ...details });
  saveEvidence();
}

async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(OUTPUT_DIR, name), fullPage: false });
}

async function worldPoint(canvas: Locator, gridX: number, gridY: number): Promise<{ x: number; y: number }> {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounds unavailable.');
  return {
    x: box.x + BOARD_ORIGIN.x + gridX * CELL_SIZE,
    y: box.y + BOARD_ORIGIN.y + gridY * CELL_SIZE,
  };
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
  }, { timeout: 30_000, intervals: [250, 500, 1000] }).toBe(`${mode}:visible`);

  if (mode !== 'danger') {
    await expect.poll(async () => (await readAwareness(page))?.lastCoverCacheKey ?? '', {
      timeout: 30_000,
      intervals: [250, 500, 1000],
    }).not.toBe('');
  }

  const value = await readAwareness(page);
  if (!value) throw new Error(`No awareness diagnostics in ${mode} mode.`);
  expect(value.representation).toBe('raster-sprite-with-region-contours');
  expect(value.displayObjectCount ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(3);
  expect(value.rasterWidth).toBe(320);
  expect(value.rasterHeight).toBe(200);
  return value;
}

test.use({ trace: 'on', video: 'retain-on-failure', screenshot: 'only-on-failure' });
test.setTimeout(180_000);

test('public deployment supports soldier control and persistent tactical overlays', async ({ page }) => {
  page.on('console', (message) => {
    if (message.type() === 'error') (evidence.consoleErrors as string[]).push(message.text());
    saveEvidence();
  });
  page.on('pageerror', (error) => {
    (evidence.pageErrors as string[]).push(error.message);
    saveEvidence();
  });
  page.on('requestfailed', (request) => {
    (evidence.requestFailures as string[]).push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown'}`);
    saveEvidence();
  });

  const response = await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 90_000 });
  evidence.httpStatus = response?.status() ?? null;
  expect(response?.status() ?? 999).toBeLessThan(400);

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.tactical-workspace-bar')).toBeVisible();
  stage('deployment-loaded', { title: await page.title() });
  await capture(page, '01-deployment-loaded.png');

  await page.locator('[data-mode="editor"]').click();
  await expect(page.locator('body')).toHaveClass(/workspace-editor/);
  await page.locator('.game-editor-tabs').getByRole('button', { name: 'Боец', exact: true }).click();
  const placeButton = page.locator('.game-editor-global-tools').getByRole('button', { name: 'Поставить бойца' });
  await expect(placeButton).toBeVisible();
  await placeButton.click();

  const spawn = await worldPoint(canvas, 12, 12);
  await page.mouse.click(spawn.x, spawn.y);
  const selectedEditorUnit = page.locator('.game-editor-selected-summary').filter({ hasText: 'editor_unit_' }).first();
  await expect(selectedEditorUnit).toBeVisible();
  stage('soldier-created', { summary: (await selectedEditorUnit.textContent())?.trim() ?? '' });
  await capture(page, '02-soldier-created.png');

  await page.locator('[data-mode="simulation"]').click();
  await expect(page.locator('body')).toHaveClass(/workspace-simulation/);
  const unitName = page.locator('[data-role="unit-name"]');
  if ((await unitName.textContent())?.includes('не выбран')) await page.mouse.click(spawn.x, spawn.y);
  await expect(unitName).not.toContainText('не выбран');

  const position = page.locator('[data-live="position"]');
  await expect(position).not.toHaveText('—');
  const initialPosition = (await position.textContent())?.trim() ?? '';
  evidence.initialPosition = initialPosition;
  evidence.unitName = (await unitName.textContent())?.trim() ?? '';
  stage('soldier-selected', { initialPosition, unitName: evidence.unitName });
  await capture(page, '03-soldier-selected.png');

  const target = await worldPoint(canvas, 15, 12);
  const order = page.locator('[data-role="order"]');
  const orderBefore = (await order.textContent())?.trim() ?? '';
  await page.mouse.click(target.x, target.y, { button: 'right' });
  await expect.poll(async () => (await order.textContent())?.trim() ?? '', { timeout: 15_000 }).not.toBe(orderBefore);
  const orderAfter = (await order.textContent())?.trim() ?? '';
  evidence.orderAfterCommand = orderAfter;
  stage('movement-order-accepted', { orderBefore, orderAfter });

  const speedFour = page.locator('[data-speed="4"]');
  if (await speedFour.count()) await speedFour.click();
  const pause = page.locator('[data-action="pause"]');
  if ((await pause.textContent())?.includes('Продолжить')) await pause.click();
  await expect.poll(async () => (await position.textContent())?.trim() ?? '', {
    timeout: 20_000,
    intervals: [250, 500, 750, 1000],
  }).not.toBe(initialPosition);
  const movedPosition = (await position.textContent())?.trim() ?? '';
  evidence.movedPosition = movedPosition;
  stage('soldier-moved', { initialPosition, movedPosition });
  await capture(page, '04-soldier-moved.png');
  if ((await pause.textContent())?.includes('Пауза')) await pause.click();

  await page.locator('[data-tab="danger"]').click();
  await expect(page.locator('[data-role="sidebar-title"]')).toContainText('Опасность');
  const sidebar = page.locator('[data-role="sidebar-body"]');
  await expect(sidebar.locator('[data-overlay-mode]')).toHaveCount(3);
  await expect(page.locator('.simulation-unit-bar [data-overlay-mode]')).toHaveCount(0);

  for (const mode of ['danger', 'cover', 'combined'] as const) {
    await sidebar.locator(`[data-overlay-mode="${mode}"]`).click();
    const diagnostics = await waitForOverlay(page, mode);
    (evidence.overlay as Record<string, AwarenessDebug>)[mode] = diagnostics;
    stage(`overlay-${mode}`, diagnostics as Record<string, unknown>);
    await capture(page, `05-overlay-${mode}.png`);
  }

  const beforeIdle = await readAwareness(page);
  await page.waitForTimeout(3000);
  const afterIdle = await readAwareness(page);
  evidence.combinedBeforeIdle = beforeIdle;
  evidence.combinedAfterIdle = afterIdle;
  expect(afterIdle?.mode).toBe('combined');
  expect(afterIdle?.visible).toBe(true);
  expect(afterIdle?.lastCoverCacheKey).toBeTruthy();
  stage('combined-persistent-after-idle', { beforeIdle, afterIdle });
  await capture(page, '06-combined-after-idle.png');

  expect(evidence.pageErrors, `Uncaught page errors: ${(evidence.pageErrors as string[]).join('\n')}`).toEqual([]);
  saveEvidence();
});
