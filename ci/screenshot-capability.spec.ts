import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const outputDir = 'artifacts/screenshot-capability';

async function captureRoute(
  page: import('@playwright/test').Page,
  route: string,
  name: string,
  width: number,
  height: number,
): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`[console] ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`[pageerror] ${error.message}`));

  await page.setViewportSize({ width, height });
  const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
  expect(response?.ok(), `${route} should return a successful response`).toBeTruthy();
  await expect(page.locator('body')).toBeVisible();
  await page.waitForTimeout(3000);
  await page.screenshot({
    path: `${outputDir}/${name}-${width}x${height}.png`,
    fullPage: true,
  });
  return errors;
}

test('capture real game, AI Editor and Combat Lab screens', async ({ page }) => {
  await mkdir(outputDir, { recursive: true });
  const diagnostics: Record<string, string[]> = {};

  diagnostics['game-1440'] = await captureRoute(page, '/', '01-game', 1440, 900);
  diagnostics['ai-editor-1440'] = await captureRoute(
    page,
    '/ai-node-editor.html',
    '02-ai-editor',
    1440,
    900,
  );
  diagnostics['combat-lab-1440'] = await captureRoute(
    page,
    '/combat-lab.html',
    '03-combat-lab',
    1440,
    900,
  );

  const settingsTab = page.getByRole('button', { name: /Настройка игры/i }).first();
  if (await settingsTab.isVisible().catch(() => false)) {
    await settingsTab.click();
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: `${outputDir}/04-combat-lab-game-settings-1440x900.png`,
      fullPage: true,
    });
  }

  diagnostics['ai-editor-1100'] = await captureRoute(
    page,
    '/ai-node-editor.html',
    '05-ai-editor',
    1100,
    760,
  );
  diagnostics['combat-lab-1100'] = await captureRoute(
    page,
    '/combat-lab.html',
    '06-combat-lab',
    1100,
    760,
  );

  const compactSettingsTab = page.getByRole('button', { name: /Настройка игры/i }).first();
  if (await compactSettingsTab.isVisible().catch(() => false)) {
    await compactSettingsTab.click();
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: `${outputDir}/07-combat-lab-game-settings-1100x760.png`,
      fullPage: true,
    });
  }

  await writeFile(
    `${outputDir}/browser-diagnostics.json`,
    `${JSON.stringify(diagnostics, null, 2)}\n`,
    'utf8',
  );
});
