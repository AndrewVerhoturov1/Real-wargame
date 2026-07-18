import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const OUTPUT_DIR = path.join('artifacts', 'visual-qa', 'movement-environment-integration-v1');

// Approval-gated by docs/workflow/VISUAL_QA_APPROVAL_POLICY.md.
// This scenario is prepared but deliberately skipped until the user gives fresh approval.
test.skip('verifies the combined environment and movement-profile authoring flow', async ({ context }) => {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const editor = await context.newPage();
  await editor.setViewportSize({ width: 1440, height: 900 });
  await editor.addInitScript(() => window.localStorage.clear());
  await editor.goto('/ai-node-editor.html');

  const tabs = editor.locator('.navigation-profile-main-tabs > button');
  await expect(tabs).toHaveText([
    'Граф поведения',
    'Профили маршрута',
    'Профили местности',
    'Профили движения',
    'Профили внимания',
    'Данные бойца',
  ]);

  await editor.getByRole('button', { name: 'Профили местности', exact: true }).click();
  await expect(editor.getByRole('heading', { name: 'Профили местности' })).toBeVisible();
  await editor.screenshot({ path: path.join(OUTPUT_DIR, '01-environment-tab.png'), fullPage: true });

  await editor.getByRole('button', { name: 'Профили движения', exact: true }).click();
  await expect(editor.getByRole('heading', { name: 'Профили движения' })).toBeVisible();
  const speed = editor.getByLabel('Множитель скорости: точное значение');
  await speed.fill('1.11');
  await editor.getByRole('button', { name: 'Профили местности', exact: true }).click();
  await expect(editor.getByRole('heading', { name: 'Есть несохранённые изменения' })).toBeVisible();
  await editor.screenshot({ path: path.join(OUTPUT_DIR, '02-dirty-draft-dialog.png'), fullPage: true });
  await editor.getByRole('button', { name: 'Остаться', exact: true }).click();

  pageDialog(editor, 'Интеграционный патруль');
  await editor.getByRole('button', { name: 'Создать профиль' }).click();
  await expect(editor.getByRole('heading', { name: 'Интеграционный патруль' })).toBeVisible();
  await editor.getByLabel('Множитель скорости: точное значение').fill('0.73');
  await editor.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(editor.getByText('Изменения сохранены.')).toBeVisible();
  await editor.screenshot({ path: path.join(OUTPUT_DIR, '03-custom-movement-profile.png'), fullPage: true });

  await editor.getByRole('button', { name: 'Граф поведения', exact: true }).click();
  await openPalette(editor);
  await editor.locator('button[data-palette-type="SetMovementProfile"]').click();
  const selector = editor.locator('select[data-selector="movement_profile_registry"]');
  await expect(selector).toBeVisible();
  await expect(selector.locator('option', { hasText: 'Интеграционный патруль' })).toHaveCount(1);
  await editor.screenshot({ path: path.join(OUTPUT_DIR, '04-node-selector-custom-profile.png'), fullPage: true });

  const map = await context.newPage();
  await map.setViewportSize({ width: 1440, height: 900 });
  await map.goto('/?visualQa=shared-visibility-vegetation');
  await expect(map.locator('canvas')).toBeVisible();
  const before = await map.locator('canvas').screenshot();

  await editor.bringToFront();
  await editor.getByRole('button', { name: 'Профили местности', exact: true }).click();
  await editor.locator('[data-environment-material="sparse_forest"]').click();
  const speedMultiplier = editor.locator('input[type="number"][data-environment-path="movement.speedMultiplier"]');
  const noiseMultiplier = editor.locator('input[type="number"][data-environment-path="movement.noiseMultiplier"]');
  await speedMultiplier.fill('0.42');
  await speedMultiplier.dispatchEvent('input');
  await noiseMultiplier.fill('1.81');
  await noiseMultiplier.dispatchEvent('input');
  const opacity = editor.locator('input[type="number"][data-environment-path="presentation.opacity"]');
  await opacity.fill('0.93');
  await opacity.dispatchEvent('input');

  await map.bringToFront();
  await map.waitForTimeout(500);
  const after = await map.locator('canvas').screenshot();
  expect(after.equals(before), 'live environment edit must update the open map without reload').toBe(false);
  await map.screenshot({ path: path.join(OUTPUT_DIR, '05-live-environment-influence.png'), fullPage: false });
});

function pageDialog(page: Page, value: string): void {
  page.once('dialog', (dialog) => dialog.accept(value));
}

async function openPalette(page: Page): Promise<void> {
  const target = page.locator('button[data-palette-type="SetMovementProfile"]');
  if (await target.count() > 0 && await target.first().isVisible()) return;
  await page.locator('#toggle-palette, #open-palette-rail').first().click();
  await expect(target).toBeVisible();
}
