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

interface AttentionOverlayDiagnostics {
  rebuildCount: number;
  markerCount: number;
  visibilityFanRayCount: number;
  lastKey: string;
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

test('shows clearly different march, engage and search attention overlays without cursor-driven rebuilds', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  const browserErrors = collectBrowserErrors(page);

  await openAttentionMode(page, modeGraph('march'), 'Марш');
  await expect(page.locator('.attention-contact-card').first()).toBeVisible();
  await pauseSimulation(page);
  await saveScreenshot(page, 'perception-attention-march.png');
  const marchKey = (await readAttentionDiagnostics(page))?.lastKey ?? '';
  expect(marchKey).toContain(':march:');

  await openAttentionMode(page, modeGraph('engage'), 'Стрельба');
  await pauseSimulation(page);
  await saveScreenshot(page, 'perception-attention-engage.png');
  const engageDiagnostics = await readAttentionDiagnostics(page);
  expect(engageDiagnostics?.lastKey).toContain(':engage:');
  expect(engageDiagnostics?.lastKey).not.toBe(marchKey);

  const canvas = page.locator('canvas');
  const beforePointer = await readAttentionDiagnostics(page);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounds unavailable.');
  for (let index = 0; index < 24; index += 1) {
    await page.mouse.move(
      box.x + 120 + (index % 8) * 55,
      box.y + 110 + Math.floor(index / 8) * 70,
    );
  }
  await page.waitForTimeout(250);
  const afterPointer = await readAttentionDiagnostics(page);
  expect(afterPointer?.rebuildCount).toBe(beforePointer?.rebuildCount);

  await openAttentionMode(page, searchGraph(45, 120), 'Поиск цели');
  await expect(page.locator('.attention-runtime-panel')).toContainText('Ход сканирования');
  await page.waitForTimeout(900);
  await pauseSimulation(page);
  await saveScreenshot(page, 'perception-attention-search.png');
  const searchDiagnostics = await readAttentionDiagnostics(page);
  expect(searchDiagnostics?.lastKey).toContain(':search:');
  expect(searchDiagnostics?.lastKey).not.toBe(engageDiagnostics?.lastKey);
  expect(searchDiagnostics?.markerCount ?? 0).toBeGreaterThan(0);

  expect(browserErrors).toEqual([]);
});

test('shows editable attention profiles in the real game editor', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  const browserErrors = collectBrowserErrors(page);
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await page.locator('[data-mode="editor"]').click();
  await page.locator('.game-editor-tabs').getByRole('button', { name: 'Боец', exact: true }).click();
  const controls = page.locator('[data-attention-profile-controls]');
  await expect(controls).toBeVisible();
  await expect(controls).toContainText('Обзор и внимание');
  await expect(controls).toContainText('Косвенное внимание');
  await expect(controls).toContainText('Стандартный сектор поиска');
  await saveScreenshot(page, 'perception-attention-profile-editor.png');
  expect(browserErrors).toEqual([]);
});

test('shows human controls for the new attention nodes in the real node editor', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  const browserErrors = collectBrowserErrors(page);
  const graph = searchGraph(90, 120);
  await page.addInitScript(({ key, serialized }) => {
    window.localStorage.clear();
    window.localStorage.setItem(key, serialized);
  }, { key: GRAPH_STORAGE_KEY, serialized: JSON.stringify(graph) });
  await page.goto('/ai-node-editor.html');
  await expect(page.locator('.graph-node[data-node-id="attention"]')).toBeVisible();
  await page.locator('.graph-node[data-node-id="attention"]').click();
  const controls = page.locator('[data-attention-node-controls]');
  await expect(controls).toBeVisible();
  await expect(controls).toContainText('Настройка сектора поиска');
  await expect(controls.getByText('Центр сектора, °')).toBeVisible();
  await expect(controls.getByText('Ширина сектора, °')).toBeVisible();
  await saveScreenshot(page, 'perception-attention-node-controls.png');
  expect(browserErrors).toEqual([]);
});

async function openAttentionMode(page: Page, graph: Record<string, unknown>, expectedModeRu: string): Promise<void> {
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
  await expect.poll(async () => panel.textContent(), { timeout: 8_000 }).toContain(expectedModeRu);
  await page.waitForFunction(() => {
    const diagnostics = (window as Window & { __realWargameAttentionOverlayDebug?: AttentionOverlayDiagnostics }).__realWargameAttentionOverlayDebug;
    return Boolean(diagnostics && diagnostics.rebuildCount > 0 && diagnostics.lastKey.includes('attention:v1'));
  });
  await page.waitForTimeout(450);
}

async function pauseSimulation(page: Page): Promise<void> {
  const pause = page.locator('#pause-toggle');
  if ((await pause.textContent())?.includes('вкл')) return;
  await pause.click();
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

async function readAttentionDiagnostics(page: Page): Promise<AttentionOverlayDiagnostics | undefined> {
  return page.evaluate(() => (
    window as Window & { __realWargameAttentionOverlayDebug?: AttentionOverlayDiagnostics }
  ).__realWargameAttentionOverlayDebug);
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
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
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
