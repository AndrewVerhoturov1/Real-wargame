import { expect, test, type Page } from '@playwright/test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.join('artifacts', 'screenshots');
const VIEWPORT = { width: 1440, height: 900 };
let aiEngineProcess: ChildProcessWithoutNullStreams | null = null;

const BOARD_ORIGIN = { x: 72, y: 72 };
const CELL_SIZE = 24;
const AI_LAB_TOP_OFFSET = 128;

function boardPoint(cellX: number, cellY: number): { x: number; y: number } {
  return { x: BOARD_ORIGIN.x + (cellX + 0.5) * CELL_SIZE, y: BOARD_ORIGIN.y + (cellY + 0.5) * CELL_SIZE };
}

function labWorldPoint(gridX: number, gridY: number): { x: number; y: number } {
  return {
    x: BOARD_ORIGIN.x + gridX * CELL_SIZE,
    y: AI_LAB_TOP_OFFSET + BOARD_ORIGIN.y + gridY * CELL_SIZE,
  };
}

async function saveScreenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, name), fullPage: false });
}

async function openNodePalette(page: Page): Promise<void> {
  const palette = page.locator('.palette-panel');
  if (await palette.isVisible()) return;
  const addNode = page.getByRole('button', { name: /\+ Add node|\+ Добавить ноду/ });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await addNode.click({ force: true });
    await page.waitForTimeout(150);
    if (await palette.isVisible()) return;
  }
  await expect(palette).toBeVisible();
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

test('capture Real-Wargame preview screenshots', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto('/');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(page.locator('.top-command-bar')).toBeVisible();
  await expect(page.locator('.mode-toggle-button')).toBeVisible();
  await expect(page.locator('.real-relief-toggle')).toBeVisible();
  await expect(page.locator('.game-bottom-panel')).toBeVisible();
  await expect(page.locator('.game-right-panel')).toBeVisible();
  await expect(page.locator('#vision-toggle')).toBeHidden();
  await page.waitForTimeout(800);
  await saveScreenshot(page, '01-initial.png');
  await page.getByRole('button', { name: /Реальный рельеф/ }).click();
  await page.waitForTimeout(350);
  await saveScreenshot(page, '02-real-relief-overlay.png');
  const soldier = boardPoint(27.07, 17.09);
  await page.mouse.click(soldier.x, soldier.y);
  await page.waitForTimeout(300);
  await saveScreenshot(page, '03-selected-unit.png');
  await page.getByRole('button', { name: 'Слои' }).click();
  await page.waitForTimeout(300);
  await saveScreenshot(page, '04-layers-tab-knowledge-overlay.png');
  const losTarget = boardPoint(35, 16);
  await page.keyboard.down('Alt');
  await page.mouse.move(losTarget.x, losTarget.y);
  await page.waitForTimeout(350);
  await saveScreenshot(page, '05-alt-line-of-sight.png');
  await page.keyboard.up('Alt');
  const moveTarget = boardPoint(22, 17);
  await page.mouse.click(moveTarget.x, moveTarget.y, { button: 'right' });
  await page.waitForTimeout(300);
  await saveScreenshot(page, '06-move-order.png');
  await page.locator('.mode-toggle-button').click({ force: true });
  await page.waitForTimeout(700);
  await expect(page.locator('#hud')).toBeVisible();
  await saveScreenshot(page, '07-editor-mode.png');
});

test('capture AI Node Editor clean canvas and universal node interactions', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto('/ai-node-editor.html');

  await expect(page.getByRole('heading', { name: /Soldier AI Node Editor|Редактор ИИ/ })).toBeVisible();
  await expect(page.locator('.graph-canvas')).toBeVisible();
  await expect(page.locator('.graph-node')).toHaveCount(1);
  await expect(page.locator('.graph-node[data-node-id="root"]')).toBeVisible();
  await page.waitForTimeout(500);
  await saveScreenshot(page, '08-ai-editor-clean-canvas.png');

  await openNodePalette(page);
  await expect(page.locator('.palette-panel')).toBeVisible();
  await expect(page.getByRole('button', { name: /Numeric Threshold|Числовой порог/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Flag Check|Проверка флага/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Distance Threshold|Порог расстояния/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Has Order|Есть приказ/ })).toHaveCount(0);
  await page.waitForTimeout(250);
  await saveScreenshot(page, '09-ai-editor-clean-palette.png');

  await page.getByRole('button', { name: /Numeric Threshold|Числовой порог/ }).click();
  await page.waitForTimeout(500);
  await expect(page.locator('.graph-node.selected')).toBeVisible();
  await expect(page.locator('.human-node-panel.blackboard-value-above')).toBeVisible();
  await expect(page.locator('.human-source-select')).toHaveValue('danger');
  await expect(page.locator('.human-threshold-slider')).toBeVisible();
  await saveScreenshot(page, '10-numeric-threshold-added.png');

  await page.getByRole('button', { name: /Параметр ниже порога|Value below threshold/ }).click();
  await page.locator('.human-threshold-slider').evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = '30';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('.human-preview-slider').evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = '25';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('.human-node-panel.blackboard-value-above .danger-result.pass')).toBeVisible();
  await expect(page.locator('.human-formula-value')).toContainText('25 < 30');
  await saveScreenshot(page, '11-numeric-threshold-below.png');

  await page.getByRole('button', { name: /Save parameters|Сохранить параметры|Save condition|Сохранить условие/ }).click();
  await page.waitForTimeout(300);

  await openNodePalette(page);
  await expect(page.getByRole('button', { name: /Distance Threshold|Порог расстояния/ })).toBeVisible();
  await page.getByRole('button', { name: /Distance Threshold|Порог расстояния/ }).click();
  await page.waitForTimeout(400);
  await expect(page.locator('.human-node-panel')).toBeVisible();
  await expect(page.locator('select[data-param-key="from"]')).toHaveValue('self');
  await expect(page.locator('select[data-param-key="to"]')).toHaveValue('cover');
  await saveScreenshot(page, '12-distance-threshold-selectors.png');

  const rootOut = page.locator('.graph-node[data-node-id="root"] .node-port.out');
  const selectedNode = page.locator('.graph-node.selected');
  const rootBox = await rootOut.boundingBox();
  const selectedBox = await selectedNode.boundingBox();
  if (!rootBox || !selectedBox) throw new Error('Could not find port or selected node bounds for drag-link screenshot.');
  await page.mouse.move(rootBox.x + rootBox.width / 2, rootBox.y + rootBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(selectedBox.x + selectedBox.width / 2, selectedBox.y + selectedBox.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(350);
  await saveScreenshot(page, '13-clean-canvas-drag-link.png');

  await page.getByRole('button', { name: /Auto 4/ }).click({ force: true });
  await page.waitForTimeout(1200);
  await saveScreenshot(page, '14-clean-canvas-auto-check-result.png');
});

test('capture integrated AI lab, threat handles and soldier awareness', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Полигон ИИ', exact: true }).click();
  await expect(page.locator('.ai-lab-dock')).toBeVisible();
  await expect(page.locator('.ai-lab-bottom-bar')).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/ai-lab-open/);
  await page.waitForTimeout(500);
  await saveScreenshot(page, '15-ai-lab-integrated-layout.png');

  await page.locator('.ai-lab-dock-tabs').getByRole('button', { name: 'Угроза', exact: true }).click();
  const threatSource = labWorldPoint(34.044, 16.823);
  await page.mouse.click(threatSource.x, threatSource.y);
  await expect(page.locator('.ai-lab-dock-body')).toContainText('Геометрия');
  await page.waitForTimeout(500);
  await saveScreenshot(page, '16-ai-lab-threat-handles.png');

  const rangeHandle = labWorldPoint(20.05, 17.31);
  const extendedRange = labWorldPoint(16.5, 18.2);
  await page.mouse.move(rangeHandle.x, rangeHandle.y);
  await page.mouse.down();
  await page.mouse.move(extendedRange.x, extendedRange.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  await saveScreenshot(page, '17-ai-lab-threat-reshaped.png');

  await page.locator('.ai-lab-dock-tabs').getByRole('button', { name: 'Боец', exact: true }).click();
  const soldier = labWorldPoint(27.574, 17.589);
  await page.mouse.click(soldier.x, soldier.y);
  await expect(page.locator('.ai-lab-dock-body')).toContainText('Постоянные характеристики');
  await expect(page.locator('.ai-lab-dock-body')).toContainText('Начальное состояние');
  await expect(page.locator('.ai-lab-dock-body')).toContainText('Текущее состояние — изменяется игрой');
  await page.waitForTimeout(500);
  await saveScreenshot(page, '18-ai-lab-soldier-state.png');

  await page.locator('.ai-lab-dock-tabs').getByRole('button', { name: 'Карта бойца', exact: true }).click();
  const dangerMode = page.locator('.ai-lab-awareness-modes').getByRole('button', { name: 'Угрозы', exact: true });
  await expect(dangerMode).toBeVisible();
  await dangerMode.evaluate((element) => (element as HTMLButtonElement).click());
  await page.waitForTimeout(900);
  await saveScreenshot(page, '19-ai-lab-awareness-danger.png');

  const safeMode = page.locator('.ai-lab-awareness-modes').getByRole('button', { name: 'Безопасные места', exact: true });
  await expect(safeMode).toBeVisible();
  await safeMode.evaluate((element) => (element as HTMLButtonElement).click());
  await page.waitForTimeout(900);
  await saveScreenshot(page, '20-ai-lab-awareness-safe.png');
});
