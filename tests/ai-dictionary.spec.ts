import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.join('artifacts', 'screenshots');

test.beforeAll(() => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

test('opens the Russian-first interactive AI dictionary in the tactical game', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.locator('.tactical-workspace-bar')).toBeVisible();

  await page.getByRole('button', { name: 'Словарь ИИ' }).click();
  await expect(page.getByRole('heading', { name: 'Словарь ИИ солдата' })).toBeVisible();
  await expect(page.locator('[data-ai-dictionary-search]')).toBeVisible();
  await expect(page.locator('[data-ai-dictionary-readiness]')).toBeVisible();
  await expect(page.locator('[data-ai-dictionary-kind]')).toBeVisible();

  await page.locator('[data-ai-dictionary-search]').fill('под огнём');
  await expect(page.locator('[data-ai-dictionary-concept="underFire"]')).toBeVisible();
  await page.locator('[data-ai-dictionary-concept="underFire"]').click();
  await expect(page.locator('.ai-dictionary-why')).toContainText('опасность');
  await expect(page.locator('[data-ai-dictionary-add-node]')).toBeVisible();
  await expect(page.locator('[data-ai-dictionary-show-map]')).toBeEnabled();

  await page.locator('[data-ai-dictionary-search]').fill('');
  await page.locator('[data-ai-dictionary-readiness]').selectOption('planned');
  await expect(page.locator('[data-ai-dictionary-concept="path_exists"]')).toContainText('Есть путь');

  await page.locator('[data-language]').click();
  await expect(page.getByRole('heading', { name: 'Soldier AI Dictionary' })).toBeVisible();
  await page.locator('[data-language]').click();
  await expect(page.getByRole('heading', { name: 'Словарь ИИ солдата' })).toBeVisible();

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '21-ai-dictionary-game.png') });
});

test('uses the same dictionary in the node editor and inserts a configured node', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/ai-node-editor.html');
  await expect(page.locator('.ai-editor-topbar')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Словарь ИИ' })).toBeVisible();

  await page.getByRole('button', { name: 'Словарь ИИ' }).click();
  await page.locator('[data-ai-dictionary-search]').fill('опасность маршрута');
  const routeDanger = page.locator('[data-ai-dictionary-concept="routeDanger"]');
  await expect(routeDanger).toBeVisible();
  await routeDanger.click();
  await expect(page.locator('.ai-dictionary-detail')).toContainText('Личная тактическая карта бойца');

  await Promise.all([
    page.waitForEvent('load'),
    page.getByRole('button', { name: 'Создать числовой порог' }).click(),
  ]);
  await expect(page.locator('.graph-node')).toHaveCount(2);
  const addedNode = page.locator('.graph-node').filter({ hasText: 'Числовой порог' });
  await expect(addedNode).toBeVisible();
  await addedNode.click();

  const sourceSelect = page.locator('.human-node-panel select[data-param-key="sourceKey"]');
  await expect(sourceSelect).toBeVisible();
  await expect(sourceSelect.locator('option[value="routeDanger"]')).toHaveCount(1);
  await expect(sourceSelect).toHaveValue('routeDanger');

  await page.getByRole('button', { name: 'Словарь ИИ' }).click();
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '22-ai-dictionary-editor.png') });
});
