import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const targetUrl = requireEnv('TARGET_URL');
const expectedProductSha = requireEnv('EXPECTED_PRODUCT_SHA');
const artifactRoot = path.resolve(process.cwd(), 'artifacts/polygon-editors-visual-audit');

fs.mkdirSync(artifactRoot, { recursive: true });

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function openEditors(page: import('@playwright/test').Page) {
  const identity = await (await page.request.get(new URL('/deployment-source.json', targetUrl).toString())).json() as { sourceSha?: string };
  expect(identity.sourceSha).toBe(expectedProductSha);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.polygon-shell')).toBeVisible();
  await page.addStyleTag({ content: '*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;scroll-behavior:auto!important}' });
  await page.locator('.polygon-shell-top-button--editors').click();
  const portal = page.locator('.polygon-shell-editors-portal');
  await expect(portal).toBeVisible();
  return portal;
}

test('align soldier archetype to the prototype Linear infantryman state', async ({ page }) => {
  const portal = await openEditors(page);
  const outer = portal.locator('.combat-lab-game-editor-item[data-game-editor-id="soldierArchetypes"]');
  await outer.click();
  await expect(outer).toHaveClass(/is-active/);
  const target = portal.getByText('Линейный пехотинец', { exact: true }).first();
  await expect(target).toBeVisible();
  await target.click();
  await expect(portal.getByRole('heading', { name: 'Линейный пехотинец', exact: true }).first()).toBeVisible();
  await portal.screenshot({ path: path.join(artifactRoot, 'product-03-soldier-archetypes-aligned.png'), animations: 'disabled' });
});

test('align weapons editor to the prototype PPSh-41 weapon state', async ({ page }) => {
  const portal = await openEditors(page);
  const outer = portal.locator('.combat-lab-game-editor-item[data-game-editor-id="weapons"]');
  await outer.click();
  await expect(outer).toHaveClass(/is-active/);

  const weaponTab = portal.getByText('Оружие', { exact: true }).first();
  await expect(weaponTab).toBeVisible();
  await weaponTab.click();

  const target = portal.getByText('Пистолет-пулемёт Шпагина ППШ-41', { exact: true }).first();
  await expect(target).toBeVisible();
  await target.click();
  await portal.screenshot({ path: path.join(artifactRoot, 'product-07-weapons-aligned.png'), animations: 'disabled' });
});
