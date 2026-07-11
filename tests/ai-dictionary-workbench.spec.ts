import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.join('artifacts', 'screenshots');

test.beforeAll(() => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

test('creates custom memory and a configured node without JSON editing', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/ai-node-editor.html');
  await expect(page.getByRole('button', { name: 'Инструменты ИИ' })).toBeVisible();

  await page.getByRole('button', { name: 'Инструменты ИИ' }).click();
  await expect(page.getByRole('heading', { name: 'Инструменты ИИ' })).toBeVisible();
  const form = page.locator('[data-custom-memory-form]');
  await form.locator('input[name="labelRu"]').fill('Настрой на атаку');
  await form.locator('input[name="label"]').fill('Attack intent');
  await form.locator('select[name="valueType"]').selectOption('number');
  await form.locator('input[name="defaultValue"]').fill('25');
  await form.getByRole('button', { name: 'Создать память' }).click();

  const memoryCard = page.locator('.ai-custom-memory-card').filter({ hasText: 'Настрой на атаку' });
  await expect(memoryCard).toContainText('user_memory_1');
  await expect(memoryCard).toContainText('25');

  await Promise.all([
    page.waitForEvent('load'),
    memoryCard.getByRole('button', { name: 'Создать порог' }).click(),
  ]);
  await expect(page.locator('.graph-node')).toHaveCount(2);
  const threshold = page.locator('.graph-node').filter({ hasText: 'Числовой порог' });
  await threshold.click();
  const sourceSelect = page.locator('.human-node-panel select[data-param-key="sourceKey"]');
  await expect(sourceSelect.locator('option[value="user_memory_1"]')).toHaveCount(1);
  await expect(sourceSelect).toHaveValue('user_memory_1');

  await page.getByRole('button', { name: 'Инструменты ИИ' }).click();
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '23-ai-custom-memory.png') });
});

test('reports planned graph mechanics with a clickable human warning', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/ai-node-editor.html');
  await page.evaluate(() => {
    const key = 'real-wargame.ai-node-editor.graph.v6';
    const graph = JSON.parse(localStorage.getItem(key) ?? '{}');
    const root = graph.nodes.find((node: { id: string }) => node.id === graph.rootNodeId);
    graph.nodes.push({
      id: 'path_check_test',
      type: 'TacticalCheck',
      displayName: 'Tactical Check',
      displayNameRu: 'Тактическая проверка',
      children: [],
      parameters: { checkKind: 'path_exists', expected: true, cooldownSeconds: 0, cooldownTiming: 'after' },
    });
    root.children = [...(root.children ?? []), 'path_check_test'];
    localStorage.setItem(key, JSON.stringify(graph));
  });
  await page.reload();

  await page.getByRole('button', { name: 'Инструменты ИИ' }).click();
  await page.getByRole('button', { name: 'Проверка графа' }).click();
  await expect(page.locator('.ai-graph-diagnostic').filter({ hasText: 'всегда возвращает «Да»' })).toBeVisible();
  await expect(page.locator('.ai-diagnostic-summary')).toContainText('Предупреждения: 1');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '24-ai-graph-diagnostics.png') });
});

test('stores and displays recent AI decisions in human-readable form', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/ai-node-editor.html');
  await page.evaluate(() => {
    localStorage.setItem('real-wargame.ai-node-editor.debug.v1', JSON.stringify({
      version: 1,
      kind: 'ai-graph-runtime-debug',
      graphId: 'test_graph',
      unitId: 'unit-1',
      unitLabel: 'Стрелок 1',
      selectedBranchNodeId: 'cover_branch',
      selectedBranchName: 'Take Cover',
      selectedBranchNameRu: 'Искать укрытие',
      explanation: 'Danger selected the cover branch.',
      explanationRu: 'Опасность заставила выбрать укрытие.',
      nowMs: 123456,
      scores: [
        { branchNodeId: 'cover_branch', branchName: 'Take Cover', branchNameRu: 'Искать укрытие', score: 77, vetoed: false },
        { branchNodeId: 'wait_branch', branchName: 'Wait', branchNameRu: 'Ждать', score: 12, vetoed: false },
      ],
      blackboard: { danger: 68, underFire: true, routeDanger: 81, ammo: 24 },
    }));
  });
  await page.waitForTimeout(900);

  await page.getByRole('button', { name: 'Инструменты ИИ' }).click();
  await page.getByRole('button', { name: 'История решений' }).click();
  const entry = page.locator('.ai-history-entry').first();
  await expect(entry).toContainText('Стрелок 1');
  await expect(entry).toContainText('Искать укрытие');
  await expect(entry).toContainText('77');
  await entry.locator('summary').click();
  await expect(entry).toContainText('Опасность прямо сейчас');
  await expect(entry).toContainText('68');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '25-ai-decision-history.png') });
});
