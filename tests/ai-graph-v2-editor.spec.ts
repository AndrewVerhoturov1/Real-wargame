import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.join('artifacts', 'screenshots', 'ai-graph-v2-editor');
const VIEWPORT = { width: 1440, height: 900 };

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

async function openPalette(page: Page): Promise<void> {
  const subgraphButton = page.locator('button[data-palette-type="Subgraph"]');
  if (await subgraphButton.count() > 0 && await subgraphButton.first().isVisible()) return;
  const toggle = page.locator('#toggle-palette, #open-palette-rail').first();
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(subgraphButton).toBeVisible();
}

test.beforeAll(() => mkdirSync(SCREENSHOT_DIR, { recursive: true }));

test('shows Graph v2 migration, Russian subgraph controls, errors, and breadcrumb navigation', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto('/ai-node-editor.html');

  await expect(page.getByRole('heading', { name: /Soldier AI Node Editor|Редактор ИИ/ })).toBeVisible();
  await expect(page.locator('.graph-v1-warning')).toContainText('старый формат Graph v1');

  await page.locator('#migrate-graph').click();
  await expect(page.locator('.graph-version-badge')).toContainText('Graph v2');
  await expect(page.locator('.graph-v1-warning')).toHaveCount(0);

  await openPalette(page);
  await page.locator('button[data-palette-type="Subgraph"]').click();

  const humanPanel = page.locator('.stateful-node-human-panel');
  await expect(humanPanel).toBeVisible();
  await expect(humanPanel.getByRole('heading', { name: 'Переиспользуемый подграф' })).toBeVisible();
  await expect(humanPanel.getByText('Шаблон поведения')).toBeVisible();
  await expect(humanPanel.getByText('Входы подграфа')).toBeVisible();
  await expect(humanPanel.getByText('Выходы подграфа')).toBeVisible();
  await expect(humanPanel.getByText('Политика отмены')).toBeVisible();

  const subgraphSelect = page.locator('#stateful-subgraph-id');
  await expect(subgraphSelect).toBeVisible();
  await subgraphSelect.selectOption('move_and_observe');
  await expect(page.locator('#stateful-subgraph-id')).toHaveValue('move_and_observe');
  const storedGraph = await page.evaluate(() => JSON.parse(window.localStorage.getItem('real-wargame.ai-node-editor.graph.v6') ?? '{}'));
  const storedSubgraph = storedGraph.nodes?.find((node: { type?: string }) => node.type === 'Subgraph');
  expect(storedSubgraph?.parameters?.subgraphId).toBe('move_and_observe');
  await expect(page.locator('.stateful-node-human-panel')).toContainText('Точка назначения');
  await expect(page.locator('.stateful-node-human-panel')).toContainText('Достигнутая позиция');

  const panelBox = await page.locator('.stateful-node-human-panel').boundingBox();
  expect(panelBox).not.toBeNull();
  expect((panelBox?.x ?? 0) + (panelBox?.width ?? 0)).toBeLessThanOrEqual(VIEWPORT.width + 1);
  expect((panelBox?.y ?? 0) + (panelBox?.height ?? 0)).toBeLessThanOrEqual(VIEWPORT.height + 1);

  await saveScreenshot(page, 'graph-v2-subgraph-russian-panel.png');

  await page.locator('#validate-graph').click();
  const requiredInputIssue = page.locator('.graph-validation-issue').filter({ hasText: 'REQUIRED_INPUT_MISSING' }).first();
  await expect(requiredInputIssue).toBeVisible();
  await expect(requiredInputIssue).toContainText('обязатель');
  await requiredInputIssue.click();
  await expect(page.locator('.graph-node.selected')).toHaveAttribute('data-node-id', /subgraph/);
  await saveScreenshot(page, 'graph-v2-migration-and-errors.png');

  await page.locator('.graph-node.selected').dblclick();
  const breadcrumb = page.locator('.graph-breadcrumb');
  await expect(breadcrumb).toContainText('Главный граф');
  await expect(breadcrumb).toContainText('Двигаться и наблюдать');
  await expect(breadcrumb).not.toContainText('Двигаться и наблюдать → Двигаться и наблюдать');
  await expect(page.getByRole('button', { name: '← К родительскому графу' })).toBeVisible();
  await saveScreenshot(page, 'graph-v2-subgraph-breadcrumb.png');

  await page.getByRole('button', { name: '← К родительскому графу' }).click();
  await expect(page.locator('.stateful-node-human-panel')).toContainText('Переиспользуемый подграф');
});
