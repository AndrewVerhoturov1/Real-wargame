import { expect, test, type Page } from '@playwright/test';

interface GridLodDiagnostics {
  majorVisible: boolean;
  minorVisible: boolean;
  minorAlpha: number;
  majorSpacingCells: number;
  screenCellPixels: number;
  sourceGridVisible: boolean;
  majorOverlayVisible: boolean;
}

async function readGridDiagnostics(page: Page): Promise<GridLodDiagnostics | undefined> {
  return page.evaluate(() => (
    window as Window & { __realWargameGridDebug?: GridLodDiagnostics }
  ).__realWargameGridDebug);
}

test('2m grid uses 10m overview lines and reveals fine cells only after zoom', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await page.waitForFunction(() => Boolean(
    (window as Window & { __realWargameGridDebug?: GridLodDiagnostics }).__realWargameGridDebug,
  ));

  const initial = await readGridDiagnostics(page);
  expect(initial?.majorSpacingCells).toBe(5);
  expect(initial?.majorVisible).toBe(true);
  expect(initial?.minorVisible).toBe(false);
  expect(initial?.sourceGridVisible).toBe(false);
  expect(initial?.majorOverlayVisible).toBe(true);

  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounds unavailable.');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -1800);
  await expect.poll(async () => (await readGridDiagnostics(page))?.minorVisible, {
    timeout: 3000,
  }).toBe(true);

  const zoomed = await readGridDiagnostics(page);
  expect(zoomed?.sourceGridVisible).toBe(true);
  expect(zoomed?.majorOverlayVisible).toBe(false);
  expect(zoomed?.minorAlpha ?? 0).toBeGreaterThan(0.5);

  await page.locator('#grid-toggle').click();
  await expect.poll(async () => {
    const diagnostics = await readGridDiagnostics(page);
    return `${diagnostics?.sourceGridVisible}:${diagnostics?.majorOverlayVisible}`;
  }).toBe('false:false');
});
