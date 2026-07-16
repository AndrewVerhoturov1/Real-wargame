import { expect, test } from '@playwright/test';

test('movement profile editor supports guarded visual authoring', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('real-wargame.movement-profiles.v1'));
  await page.goto('/ai-node-editor.html');

  await page.getByRole('button', { name: 'Профили движения', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Профили движения' })).toBeVisible();
  for (const builtIn of ['Обычный шаг', 'Скрытное движение', 'Движение пригнувшись', 'Бег', 'Спринт', 'Ползком']) {
    await expect(page.getByRole('button', { name: new RegExp(builtIn) })).toBeVisible();
  }
  const gaitSelector = page.locator('select[data-movement-select="preferredGait"]');
  await expect(gaitSelector.locator('option[value="crouch_walk"]')).toHaveText('Пригнувшись');
  await expect(gaitSelector.locator('option[value="crouch"]')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/movement-profiles/01-built-ins.png', fullPage: true });

  const speedNumber = page.getByLabel('Множитель скорости: точное значение');
  await speedNumber.fill('1.11');
  await page.getByRole('button', { name: /^Бег/ }).click();
  await expect(page.getByRole('heading', { name: 'Есть несохранённые изменения' })).toBeVisible();
  await page.getByRole('button', { name: 'Остаться', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Обычный шаг' })).toBeVisible();

  await page.getByRole('button', { name: /^Бег/ }).click();
  await page.getByRole('button', { name: 'Отменить изменения', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Бег', exact: true })).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept('Тихий рывок'));
  await page.getByRole('button', { name: 'Создать профиль' }).click();
  await expect(page.getByRole('heading', { name: 'Тихий рывок' })).toBeVisible();

  await page.getByLabel('Множитель скорости: точное значение').fill('1.25');
  await page.getByRole('button', { name: 'Профили маршрута', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Есть несохранённые изменения' })).toBeVisible();
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Профили маршрута' })).toBeVisible();

  await page.getByRole('button', { name: 'Профили движения', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Тихий рывок' })).toBeVisible();
  await expect(page.getByLabel('Множитель скорости: точное значение')).toHaveValue('1.25');
  await expect(page.getByText('Изменения сохранены.')).toBeVisible();
  await page.screenshot({ path: 'test-results/movement-profiles/02-custom-saved.png', fullPage: true });

  await page.getByRole('button', { name: 'Профили внимания', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Профили внимания' })).toBeVisible();
  await page.getByRole('button', { name: 'Профили маршрута', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Профили маршрута' })).toBeVisible();
  await page.getByRole('button', { name: 'Профили движения', exact: true }).click();
  await expect(page.getByRole('button', { name: /Тихий рывок/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/movement-profiles/03-tab-state.png', fullPage: true });
});
