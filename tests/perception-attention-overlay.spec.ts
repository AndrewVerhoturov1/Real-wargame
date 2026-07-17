import { expect, test, type Locator, type Page } from '@playwright/test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.join('artifacts', 'screenshots');
const VIEWPORT = { width: 1440, height: 900 };
const BOARD_ORIGIN = { x: 72, y: 72 };
const CELL_SIZE = 24;
const GRAPH_STORAGE_KEY = 'real-wargame.ai-node-editor.graph.v6';
let aiEngineProcess: ChildProcessWithoutNullStreams | null = null;

interface ViewMemoryOverlayDiagnostics {
  representation: 'raster-sprite';
  visible: boolean;
  textureUploadCount: number;
  markerUpdateCount: number;
  markerCount: number;
  displayObjectCount: number;
  fieldRevision: number;
  fieldRebuildCount: number;
  fieldCacheHitCount: number;
  rasterWidth: number;
  rasterHeight: number;
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

test('shows stable march, engage and search heatmaps without cursor or camera rebuilds', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  const browserErrors = collectBrowserErrors(page);

  await openViewMemoryMode(page, modeGraph('march'), 'Марш');
  await expect(page.locator('.attention-contact-card').first()).toBeVisible();
  await expect(page.locator('.attention-runtime-panel')).not.toContainText('Ход сканирования');
  await expect(page.locator('.attention-runtime-panel')).not.toContainText('проверочные лучи');
  await pauseSimulation(page);
  await saveScreenshot(page, 'view-memory-heatmap-march.png');
  const march = await readViewMemoryDiagnostics(page);
  expect(march?.representation).toBe('raster-sprite');
  expect(march?.displayObjectCount ?? 99).toBeLessThanOrEqual(2);
  expect(march?.rasterWidth ?? 0).toBeGreaterThan(0);
  expect(march?.rasterHeight ?? 0).toBeGreaterThan(0);

  await openViewMemoryMode(page, modeGraph('engage'), 'Стрельба');
  await pauseSimulation(page);
  await saveScreenshot(page, 'view-memory-heatmap-engage.png');
  const engage = await readViewMemoryDiagnostics(page);
  expect(engage?.fieldRevision ?? 0).toBeGreaterThan(0);

  const canvas = page.locator('canvas');
  const beforePointer = await readViewMemoryDiagnostics(page);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounds unavailable.');
  for (let index = 0; index < 24; index += 1) {
    await page.mouse.move(
      box.x + 120 + (index % 8) * 55,
      box.y + 110 + Math.floor(index / 8) * 70,
    );
  }
  await page.waitForTimeout(250);
  const afterPointer = await readViewMemoryDiagnostics(page);
  expect(afterPointer?.fieldRebuildCount).toBe(beforePointer?.fieldRebuildCount);
  expect(afterPointer?.textureUploadCount).toBe(beforePointer?.textureUploadCount);

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -500);
  await page.waitForTimeout(250);
  const afterCamera = await readViewMemoryDiagnostics(page);
  expect(afterCamera?.fieldRebuildCount).toBe(afterPointer?.fieldRebuildCount);
  expect(afterCamera?.textureUploadCount).toBe(afterPointer?.textureUploadCount);

  await openViewMemoryMode(page, searchGraph(45, 120), 'Поиск цели');
  const panel = page.locator('.attention-runtime-panel');
  await expect(panel).toContainText('Текущий обзор');
  await expect(panel).toContainText('Метки памяти');
  await expect(panel).toContainText('Области неопределённости');
  await page.waitForTimeout(900);
  await pauseSimulation(page);
  await saveScreenshot(page, 'view-memory-heatmap-search.png');
  const search = await readViewMemoryDiagnostics(page);
  expect(search?.markerCount ?? 0).toBeGreaterThan(0);
  expect(search?.textureUploadCount ?? 0).toBeGreaterThan(0);

  expect(browserErrors).toEqual([]);
});

test('prepares black unseen and coloured current-view visual evidence', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  const browserErrors = collectBrowserErrors(page);

  await openViewMemoryMode(page, modeGraph('observe'), 'Наблюдение');
  await pauseSimulation(page);
  const diagnostics = await readViewMemoryDiagnostics(page);
  expect(diagnostics?.representation).toBe('raster-sprite');
  expect(diagnostics?.displayObjectCount ?? 99).toBeLessThanOrEqual(2);
  expect(diagnostics?.textureUploadCount ?? 0).toBeGreaterThan(0);
  await saveScreenshot(page, 'rear-attention-black-unseen-colour-bands.png');

  expect(browserErrors).toEqual([]);
});

test('shows editable view and memory profiles in the real game editor', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  const browserErrors = collectBrowserErrors(page);
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await page.locator('[data-mode="editor"]').click();
  await page.locator('.game-editor-tabs').getByRole('button', { name: 'Боец', exact: true }).click();
  const controls = page.locator('[data-attention-profile-controls]');
  await expect(controls).toBeVisible();
  await expect(controls).toContainText('Обзор и память');
  await expect(controls).toContainText('Максимальная дальность');
  await expect(controls).toContainText('Боковое и заднее внимание');
  await expect(controls).toContainText('Случайность обнаружения');
  await expect(controls).not.toContainText('Скорость осмотра');
  await controls.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(250);
  await saveScreenshot(page, 'view-memory-profile-editor.png');
  expect(browserErrors).toEqual([]);
});

test('keeps human controls for stable search sectors in the real node editor', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  const browserErrors = collectBrowserErrors(page);
  const graph = searchGraph(90, 120);
  await page.addInitScript(({ key, serialized }) => {
    window.localStorage.clear();
    window.localStorage.setItem(key, serialized);
  }, { key: GRAPH_STORAGE_KEY, serialized: JSON.stringify(graph) });
  await page.goto('/ai-node-editor.html');
  const shell = page.locator('.ai-editor-shell');
  await expect(shell).toBeVisible();
  if (await shell.evaluate((element) => element.classList.contains('inspector-closed'))) {
    await page.locator('#toggle-inspector').click();
  }
  await expect(page.locator('.graph-node[data-node-id="attention"]')).toBeVisible();
  await page.locator('.graph-node[data-node-id="attention"]').click();
  const controls = page.locator('[data-attention-node-controls]');
  await expect(controls).toBeVisible();
  await expect(controls).toContainText('Настройка сектора поиска');
  await expect(controls.getByText('Центр сектора, °')).toBeVisible();
  await expect(controls.getByText('Ширина сектора, °')).toBeVisible();
  await controls.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await saveScreenshot(page, 'view-memory-node-controls.png');
  expect(browserErrors).toEqual([]);
});

async function openViewMemoryMode(page: Page, graph: Record<string, unknown>, expectedModeRu: string): Promise<void> {
  await page.goto('/');
  await page.evaluate(({ key, serialized }) => {
    window.localStorage.setItem(key, serialized);
  }, { key: GRAPH_STORAGE_KEY, serialized: JSON.stringify(graph) });
  await page.reload();
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await selectFixtureSoldier(page, canvas);
  await page.locator('[data-attention-tab]').click();
  const panel = page.locator('.attention-runtime-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Обзор и память');
  await expect.poll(async () => panel.textContent(), { timeout: 8_000 }).toContain(expectedModeRu);
  await page.waitForFunction(() => {
    const diagnostics = (window as Window & { __realWargameViewMemoryDebug?: ViewMemoryOverlayDiagnostics }).__realWargameViewMemoryDebug;
    return Boolean(
      diagnostics
      && diagnostics.visible
      && diagnostics.representation === 'raster-sprite'
      && diagnostics.fieldRebuildCount > 0
      && diagnostics.textureUploadCount > 0,
    );
  });
  await page.waitForTimeout(450);
}

async function pauseSimulation(page: Page): Promise<void> {
  const pause = page.locator('#pause-toggle');
  if ((await pause.textContent())?.includes('вкл')) return;
  await page.keyboard.press('p');
  await expect(pause).toContainText('Пауза: вкл');
  await page.waitForTimeout(300);
}

async function selectFixtureSoldier(page: Page, canvas: Locator): Promise<void> {
  const soldier = await worldPoint(canvas, 27.574, 17.589);
  await page.mouse.click(soldier.x, soldier.y);
  await expect(page.locator('[data-role="unit-name"]')).toContainText('Солдат');
}

async function worldPoint(canvas: Locator, gridX: number, gridY: number): Promise<{ x: number; y: number }> {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounds unavailable.');
  return {
    x: box.x + BOARD_ORIGIN.x + gridX * CELL_SIZE,
    y: box.y + BOARD_ORIGIN.y + gridY * CELL_SIZE,
  };
}

async function readViewMemoryDiagnostics(page: Page): Promise<ViewMemoryOverlayDiagnostics | undefined> {
  return page.evaluate(() => (
    window as Window & { __realWargameViewMemoryDebug?: ViewMemoryOverlayDiagnostics }
  ).__realWargameViewMemoryDebug);
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

function modeGraph(mode: 'march' | 'observe' | 'search' | 'engage'): Record<string, unknown> {
  return {
    version: 1,
    id: `visual_attention_${mode}`,
    name: `Visual attention ${mode}`,
    nameRu: `Проверка внимания: ${mode}`,
    rootNodeId: 'root',
    blackboardDefaults: {},
    nodes: [
      { id: 'root', type: 'Root', children: ['attention'], parameters: {} },
      {
        id: 'attention',
        type: 'SetAttentionMode',
        displayName: 'Set Attention Mode',
        displayNameRu: 'Выбрать режим внимания',
        children: [],
        parameters: { mode, reasonRu: `Визуальная проверка режима ${mode}.`, cooldownSeconds: 0, cooldownTiming: 'after' },
      },
    ],
  };
}

function searchGraph(centerDegrees: number, arcDegrees: number): Record<string, unknown> {
  return {
    version: 1,
    id: 'visual_attention_search',
    name: 'Visual attention search',
    nameRu: 'Проверка сектора поиска',
    rootNodeId: 'root',
    blackboardDefaults: {},
    nodes: [
      { id: 'root', type: 'Root', children: ['attention'], parameters: {} },
      {
        id: 'attention',
        type: 'SetSearchSector',
        displayName: 'Set Search Sector',
        displayNameRu: 'Задать сектор поиска',
        children: [],
        parameters: { centerDegrees, arcDegrees, reasonRu: 'Осмотреть указанный сектор.', cooldownSeconds: 0, cooldownTiming: 'after' },
      },
    ],
  };
}
