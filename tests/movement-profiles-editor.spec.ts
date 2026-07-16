import { expect, test } from '@playwright/test';

test('movement profile editor supports the normal visual workflow', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('real-wargame.movement-profiles.v1'));
  await page.goto('/ai-node-editor.html');

  await page.getByRole('button', { name: 'Профили движения', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Профили движения' })).toBeVisible();
  for (const builtIn of ['Обычный шаг', 'Скрытное движение', 'Движение пригнувшись', 'Бег', 'Спринт', 'Ползком']) {
    await expect(page.getByRole('button', { name: new RegExp(builtIn) })).toBeVisible();
  }
  await page.screenshot({ path: 'test-results/movement-profiles/01-built-ins.png', fullPage: true });

  page.once('dialog', (dialog) => dialog.accept('Тихий рывок'));
  await page.getByRole('button', { name: 'Создать профиль' }).click();
  await expect(page.getByRole('heading', { name: 'Тихий рывок' })).toBeVisible();

  const speedNumber = page.getByLabel('Множитель скорости: точное значение');
  await speedNumber.fill('1.25');
  await page.getByRole('button', { name: 'Сохранить изменения' }).click();
  await expect(page.getByText('Изменения сохранены.')).toBeVisible();
  await page.screenshot({ path: 'test-results/movement-profiles/02-custom-saved.png', fullPage: true });

  await page.getByRole('button', { name: 'Профили маршрута', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Профили маршрута' })).toBeVisible();
  await page.getByRole('button', { name: 'Профили внимания', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Профили внимания' })).toBeVisible();
  await page.getByRole('button', { name: 'Профили движения', exact: true }).click();
  await expect(page.getByRole('button', { name: /Тихий рывок/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/movement-profiles/03-tab-state.png', fullPage: true });
});
