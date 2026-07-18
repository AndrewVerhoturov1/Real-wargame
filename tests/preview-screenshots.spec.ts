import { expect, test, type Locator, type Page } from '@playwright/test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.join('artifacts', 'screenshots');
const VIEWPORT = { width: 1440, height: 900 };
const BOARD_ORIGIN = { x: 72, y: 72 };
const CELL_SIZE = 24;
let aiEngineProcess: ChildProcessWithoutNullStreams | null = null;

interface AwarenessDiagnostics {
  representation: string;
  mode: string;
  displayObjectCount: number;
  rasterWidth: number;
  rasterHeight: number;
  rebuildCount: number;
  coverContourBuildCount: number;
  maxBuildMs: number;
  lastCoverCacheKey: string;
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

async function readAwarenessDiagnostics(page: Page): Promise<AwarenessDiagnostics | undefined> {
  return page.evaluate(() => (
    window as Window & { __realWargameAwarenessDebug?: AwarenessDiagnostics }
  ).__realWargameAwarenessDebug);
}

async function waitForAiEngine(): Promise<void> {
  const startedAt = Date.now();
  let lastError = '';
  while (Date.now() - startedAt < 12_000) {
    try {
      const response = await fetch('http://127.0.0.1:8787/engine/health');
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(`AI engine did not start: ${lastError}`);
}

test.beforeAll(async () => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  aiEngineProcess = spawn('node', ['scripts/local_ai_engine.mjs'], { stdio: ['ignore', 'pipe', 'pipe'] });
  await waitForAiEngine();
});

test.afterAll(() => {
  aiEngineProcess?.kill('SIGTERM');
  aiEngineProcess = null;
});

test('keeps information details open, uses a movement-stable raster overlay and clears stale tooltips', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto('/');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(page.locator('.map-scale-fixed-label')).toContainText('1 клетка = 2 м');
  await expect(page.locator('.tactical-workspace-bar')).toBeVisible();
  await expect(page.locator('.simulation-sidebar')).toBeVisible();
  await expect(page.locator('.simulation-unit-bar')).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/workspace-simulation/);
  await selectFixtureSoldier(page, canvas);
  await expect(page.locator('.unit-label').filter({ hasText: 'Солдат' })).toBeVisible();
  await expect(page.locator('.workspace-live-details')).toHaveCount(4);
  await expect(page.locator('.simulation-unit-bar [data-overlay-mode]')).toHaveCount(0);
  await page.waitForTimeout(700);

  const sidebarBox = await page.locator('.simulation-sidebar').boundingBox();
  expect((sidebarBox?.y ?? 0) + (sidebarBox?.height ?? 0)).toBeGreaterThan(880);
  await saveScreenshot(page, '01-simulation-info.png');

  await page.locator('.workspace-display-menu > summary').click();
  await page.locator('#height-toggle').click();
  await expect(page.locator('.map-height-label').first()).toHaveText(/[+-]\d+\.\d/);
  await page.locator('#height-toggle').click();
  await page.locator('.workspace-display-menu > summary').click();

  await page.locator('[data-action="collapse"]').click();
  await expect(page.locator('body')).toHaveClass(/sidebar-collapsed/);
  await page.waitForTimeout(300);
  await saveScreenshot(page, '02-simulation-sidebar-collapsed.png');

  await page.locator('[data-action="collapse"]').click();
  await page.locator('[data-tab="danger"]').click();
  await expect(page.locator('[data-role="sidebar-title"]')).toContainText('Опасность');
  await expect(page.locator('[data-role="quick-cover-list"]')).toBeVisible();
  await expect(page.locator('[data-role="quality-cover-list"]')).toBeVisible();
  await expect(page.locator('.simulation-sidebar [data-overlay-mode]')).toHaveCount(3);
  await expect(page.locator('.simulation-unit-bar [data-overlay-mode]')).toHaveCount(0);
  await page.waitForFunction(() => {
    const diagnostics = (window as Window & { __realWargameAwarenessDebug?: AwarenessDiagnostics }).__realWargameAwarenessDebug;
    return diagnostics?.representation === 'raster-sprite-with-region-contours';
  });
  const dangerDiagnostics = await readAwarenessDiagnostics(page);
  expect(dangerDiagnostics?.representation).toBe('raster-sprite-with-region-contours');
  expect(dangerDiagnostics?.mode).toBe('danger');
  expect(dangerDiagnostics?.displayObjectCount).toBeLessThanOrEqual(3);
  expect(dangerDiagnostics?.rasterWidth).toBe(320);
  expect(dangerDiagnostics?.rasterHeight).toBe(200);
  expect(dangerDiagnostics?.maxBuildMs ?? Number.POSITIVE_INFINITY).toBeLessThan(250);
  await saveScreenshot(page, '03-simulation-danger-layer.png');

  const coverMode = page.locator('.simulation-sidebar [data-overlay-mode="cover"]');
  await coverMode.click();
  await expect(coverMode).toHaveClass(/active/);
  await expect.poll(async () => (await readAwarenessDiagnostics(page))?.mode).toBe('cover');
  await expect.poll(async () => {
    const key = (await readAwarenessDiagnostics(page))?.lastCoverCacheKey ?? '';
    return key !== '' && !key.includes('pending');
  }).toBe(true);
  const coverDiagnostics = await readAwarenessDiagnostics(page);
  expect(coverDiagnostics?.displayObjectCount).toBeLessThanOrEqual(3);
  expect(coverDiagnostics?.lastCoverCacheKey).not.toBe('');
  expect(coverDiagnostics?.coverContourBuildCount ?? 0).toBeGreaterThan(0);
  const stableCoverKey = coverDiagnostics?.lastCoverCacheKey;
  const stableContourCount = coverDiagnostics?.coverContourBuildCount ?? 0;
  await page.waitForTimeout(900);
  const idleCoverDiagnostics = await readAwarenessDiagnostics(page);
  expect(idleCoverDiagnostics?.mode).toBe('cover');
  expect(idleCoverDiagnostics?.lastCoverCacheKey).toBe(stableCoverKey);
  expect(idleCoverDiagnostics?.coverContourBuildCount ?? 0).toBeGreaterThanOrEqual(stableContourCount);
  await saveScreenshot(page, '04-simulation-cover-selected.png');

  const combinedMode = page.locator('.simulation-sidebar [data-overlay-mode="combined"]');
  await combinedMode.click();
  await expect(combinedMode).toHaveClass(/active/);
  await expect.poll(async () => (await readAwarenessDiagnostics(page))?.mode).toBe('combined');
  const combinedDiagnostics = await readAwarenessDiagnostics(page);
  expect(combinedDiagnostics?.displayObjectCount).toBeLessThanOrEqual(3);
  expect(combinedDiagnostics?.coverContourBuildCount ?? 0).toBeGreaterThan(0);

  await page.keyboard.press('v');
  await expect(page.locator('.simulation-sidebar [data-overlay-mode="danger"]')).toHaveClass(/active/);
  await page.keyboard.press('v');
  await expect(page.locator('.simulation-sidebar [data-overlay-mode="cover"]')).toHaveClass(/active/);

  await page.locator('[data-tab="stealth"]').click();
  await expect(page.locator('[data-role="sidebar-title"]')).toContainText('Скрытность');
  await expect(page.locator('.workspace-legend')).toBeVisible();
  await page.waitForTimeout(650);
  await saveScreenshot(page, '05-simulation-stealth-layer.png');

  await page.locator('[data-tab="memory"]').click();
  await expect(page.locator('[data-role="sidebar-title"]')).toContainText('Обзор и память');
  await expect(page.getByRole('heading', { name: 'Известные предметы и укрытия' })).toBeVisible();
  await page.waitForTimeout(650);
  await saveScreenshot(page, '06-simulation-memory-layer.png');
});

test('editing workspace has contextual placement tools in its own header', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto('/');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await page.locator('[data-mode="editor"]').click();
  await expect(page.locator('body')).toHaveClass(/workspace-editor/);
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('.simulation-unit-bar')).toBeHidden();
  await expect(page.locator('.game-editor-workbench')).toBeVisible();

  const editorBodyBox = await page.locator('.game-editor-body').boundingBox();
  expect(editorBodyBox?.height ?? 0).toBeGreaterThan(400);
  await expect(page.locator('.game-editor-global-tools').getByRole('button', { name: 'Поставить предмет' })).toBeVisible();
  await expect(page.locator('.game-editor-body [data-editor-tool="spawn_object"]')).toBeHidden();
  await expect(page.locator('[data-action="editor-place"]')).toHaveCount(0);

  await page.locator('.workspace-file-menu > summary').click();
  await expect(page.getByRole('button', { name: 'Сохранить сцену' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Загрузить сцену' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Отчёт производительности' })).toBeVisible();
  await expect(page.locator('.game-editor-body').getByText('Сохранение / загрузка')).toHaveCount(0);
  await page.locator('.workspace-file-menu > summary').click();

  await saveScreenshot(page, '07-editor-object-palette.png');

  await page.locator('.game-editor-tabs').getByRole('button', { name: 'Угроза', exact: true }).click();
  await expect(page.locator('.game-editor-global-tools').getByRole('button', { name: 'Поставить угрозу' })).toBeVisible();
  const threat = await worldPoint(canvas, 34.044, 16.823);
  await page.mouse.click(threat.x, threat.y);
  await expect(page.locator('.game-editor-selected-summary')).toContainText('editor_zone_1');
  await page.waitForTimeout(500);
  await saveScreenshot(page, '08-editor-threat-tools.png');

  await page.locator('.game-editor-tabs').getByRole('button', { name: 'Рельеф', exact: true }).click();
  await expect(page.locator('.game-editor-global-tools').getByRole('button', { name: 'Рисовать высоту' })).toBeVisible();
  await expect(page.locator('.game-editor-global-tools').getByRole('button', { name: 'Рисовать лес' })).toBeVisible();
  await expect(page.locator('.game-editor-body [data-editor-tool="paint_height"]')).toBeHidden();
  await page.waitForTimeout(350);
  await saveScreenshot(page, '09-editor-terrain-tools.png');
});

test('newly placed fighter remains selectable and accepts a movement command in simulation', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto('/');
  const canvas = page.locator('canvas');
  await page.locator('[data-mode="editor"]').click();
  await page.locator('.game-editor-tabs').getByRole('button', { name: 'Боец', exact: true }).click();
  const placeButton = page.locator('.game-editor-global-tools').getByRole('button', { name: 'Поставить бойца' });
  await expect(placeButton).toBeVisible();
  await placeButton.click();

  const spawnPoint = await worldPoint(canvas, 12, 12);
  await page.mouse.click(spawnPoint.x, spawnPoint.y);
  await expect(page.locator('.game-editor-selected-summary')).toContainText('editor_unit_1');

  await page.locator('[data-mode="simulation"]').click();
  await expect(page.locator('[data-role="unit-name"]')).toContainText('Боец');
  const target = await worldPoint(canvas, 15, 12);
  await page.mouse.click(target.x, target.y, { button: 'right' });
  await expect(page.locator('[data-role="order"]')).not.toContainText('Приказ: нет');
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await page.waitForTimeout(600);
  await saveScreenshot(page, '11-editor-spawned-fighter-playable.png');
});

test('AI Node Editor remains unchanged and independent', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto('/ai-node-editor.html');
  await expect(page.getByRole('heading', { name: /Soldier AI Node Editor|Редактор ИИ/ })).toBeVisible();
  await expect(page.locator('.graph-canvas')).toBeVisible();
  await expect(page.locator('.graph-node[data-node-id="root"]')).toBeVisible();
  await expect(page.locator('.graph-node')).toHaveCount(1);
  await page.waitForTimeout(500);
  await saveScreenshot(page, '10-node-editor-unchanged.png');
});
