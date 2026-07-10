import { expect, test, type Locator, type Page } from '@playwright/test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.join('artifacts', 'screenshots');
const VIEWPORT = { width: 1440, height: 900 };
const BOARD_ORIGIN = { x: 72, y: 72 };
const CELL_SIZE = 24;
let aiEngineProcess: ChildProcessWithoutNullStreams | null = null;

async function saveScreenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, name), fullPage: false });
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

async function measureAnimationP95(page: Page, sampleCount = 120): Promise<number> {
  return page.evaluate((count) => new Promise<number>((resolve) => {
    const samples: number[] = [];
    let previous = performance.now();
    const measure = (now: number) => {
      samples.push(now - previous);
      previous = now;
      if (samples.length >= count) {
        samples.sort((left, right) => left - right);
        resolve(samples[Math.floor(samples.length * 0.95)] ?? 0);
        return;
      }
      requestAnimationFrame(measure);
    };
    requestAnimationFrame(measure);
  }), sampleCount);
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

test('keeps information details open, uses a raster awareness overlay and clears stale tooltips', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto('/');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(page.locator('.tactical-workspace-bar')).toBeVisible();
  await expect(page.locator('.simulation-sidebar')).toBeVisible();
  await expect(page.locator('.simulation-unit-bar')).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/workspace-simulation/);
  await selectFixtureSoldier(page, canvas);
  await expect(page.locator('.unit-label').filter({ hasText: 'Солдат' })).toBeVisible();
  await page.waitForTimeout(700);

  const sidebarBox = await page.locator('.simulation-sidebar').boundingBox();
  expect((sidebarBox?.y ?? 0) + (sidebarBox?.height ?? 0)).toBeGreaterThan(880);

  const skillsDetails = page.locator('.workspace-details').filter({ hasText: 'Навыки' });
  await skillsDetails.locator('summary').click();
  await expect(skillsDetails).toHaveAttribute('open', '');
  const destination = await worldPoint(canvas, 22, 14);
  await page.mouse.click(destination.x, destination.y, { button: 'right' });
  await page.waitForTimeout(1500);
  await expect(skillsDetails).toHaveAttribute('open', '');
  await page.getByRole('button', { name: 'Сбросить бойца' }).click();

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
  await expect(page.locator('[data-role="cover-list"]')).toBeVisible();
  await page.waitForFunction(() => {
    const diagnostics = (window as Window & { __realWargameAwarenessDebug?: { representation?: string } }).__realWargameAwarenessDebug;
    return diagnostics?.representation === 'raster-sprite';
  });
  const diagnostics = await page.evaluate(() => (
    window as Window & {
      __realWargameAwarenessDebug?: {
        representation: string;
        displayObjectCount: number;
        rasterWidth: number;
        rasterHeight: number;
      };
    }
  ).__realWargameAwarenessDebug);
  expect(diagnostics?.representation).toBe('raster-sprite');
  expect(diagnostics?.displayObjectCount).toBeLessThanOrEqual(3);
  expect(diagnostics?.rasterWidth).toBe(64);
  expect(diagnostics?.rasterHeight).toBe(40);
  const animationP95 = await measureAnimationP95(page);
  expect(animationP95).toBeLessThan(35);

  const nearbyRock = await worldPoint(canvas, 28.091, 16.566);
  await page.mouse.move(nearbyRock.x, nearbyRock.y);
  const tooltip = page.locator('.cover-map-tooltip');
  await expect(tooltip).toBeVisible();
  await page.locator('[data-tab="info"]').evaluate((element) => {
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    (element as HTMLButtonElement).click();
  });
  await expect(tooltip).toBeHidden();

  await page.locator('[data-tab="danger"]').click();
  await page.waitForTimeout(900);
  await saveScreenshot(page, '03-simulation-danger-layer.png');

  const firstCover = page.locator('.cover-list-card').first();
  await expect(firstCover).toBeVisible();
  await firstCover.click();
  await expect(page.getByRole('button', { name: 'Приказать двигаться сюда' })).toBeVisible();
  await page.waitForTimeout(350);
  await saveScreenshot(page, '04-simulation-cover-selected.png');

  await page.locator('[data-tab="stealth"]').click();
  await expect(page.locator('[data-role="sidebar-title"]')).toContainText('Скрытность');
  await page.waitForTimeout(650);
  await saveScreenshot(page, '05-simulation-stealth-layer.png');

  await page.locator('[data-tab="memory"]').click();
  await expect(page.locator('[data-role="sidebar-title"]')).toContainText('Память');
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
  await page.waitForTimeout(500);

  const editorBodyBox = await page.locator('.game-editor-body').boundingBox();
  expect(editorBodyBox?.height ?? 0).toBeGreaterThan(400);
  await expect(page.locator('.game-editor-global-tools').getByRole('button', { name: 'Поставить предмет' })).toBeVisible();
  await expect(page.locator('.game-editor-body [data-editor-tool="spawn_object"]')).toHaveCount(0);
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
  await expect(page.locator('.game-editor-body [data-editor-tool="paint_height"]')).toHaveCount(0);
  await page.waitForTimeout(350);
  await saveScreenshot(page, '09-editor-terrain-tools.png');
});

test('newly placed fighter remains selectable and can move in simulation', async ({ page }) => {
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
  const position = page.locator('[data-live="position"]');
  await expect(position).not.toHaveText('—');
  const initialPosition = await position.textContent();

  const target = await worldPoint(canvas, 15, 12);
  await page.mouse.click(target.x, target.y, { button: 'right' });
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await expect.poll(async () => position.textContent(), { timeout: 5000 }).not.toBe(initialPosition);
  await saveScreenshot(page, '11-editor-spawned-fighter-playable.png');

  await page.getByRole('button', { name: 'Сбросить бойца' }).click();
  await expect(position).toHaveText(initialPosition ?? '');
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
