import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const VIEWPORT = { width: 1440, height: 900 };
const BOARD_ORIGIN = { x: 72, y: 72 };
const CELL_SIZE = 24;
const OUTPUT_DIR = path.join('artifacts', 'visual-qa', 'danger-route-cost-parity-v1');

interface AwarenessDiagnostics {
  representation: string;
  displayObjectCount: number;
  lastAppliedFieldIdentity?: string;
  lastRequestedCanonicalThreatKey?: string;
}

async function worldPoint(canvas: Locator, gridX: number, gridY: number): Promise<{ x: number; y: number }> {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounds unavailable.');
  return {
    x: box.x + BOARD_ORIGIN.x + gridX * CELL_SIZE,
    y: box.y + BOARD_ORIGIN.y + gridY * CELL_SIZE,
  };
}

async function openDangerLayer(page: Page): Promise<Locator> {
  await page.setViewportSize(VIEWPORT);
  await page.goto('/');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  const soldier = await worldPoint(canvas, 27.574, 17.589);
  await page.mouse.click(soldier.x, soldier.y);
  await expect(page.locator('[data-role="unit-name"]')).toContainText('Солдат');
  await page.locator('[data-tab="danger"]').click();
  await expect(page.locator('[data-role="sidebar-title"]')).toContainText('Опасность');
  await page.waitForFunction(() => {
    const diagnostics = (window as Window & {
      __realWargameAwarenessDebug?: AwarenessDiagnostics;
    }).__realWargameAwarenessDebug;
    return diagnostics?.representation === 'raster-sprite'
      && Boolean(diagnostics.lastAppliedFieldIdentity);
  });
  return canvas;
}

test.describe('danger route cost parity visual QA — explicit approval required', () => {
  test.skip('renders the canonical danger field while routing remains independent of overlay visibility', async ({ page }) => {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const canvas = await openDangerLayer(page);
    const visibleDiagnostics = await page.evaluate(() => (
      window as Window & { __realWargameAwarenessDebug?: AwarenessDiagnostics }
    ).__realWargameAwarenessDebug);

    expect(visibleDiagnostics?.representation).toBe('raster-sprite');
    expect(visibleDiagnostics?.displayObjectCount ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(3);
    expect(visibleDiagnostics?.lastAppliedFieldIdentity).toBeTruthy();
    expect(visibleDiagnostics?.lastRequestedCanonicalThreatKey).toBeTruthy();

    await page.screenshot({
      path: path.join(OUTPUT_DIR, '01-danger-layer-canonical-field.png'),
      fullPage: false,
    });

    // Human frame check after approval:
    // 1. compare an exposed cell and a wall/reverse-slope protected cell inside the same fire sector;
    // 2. load the acceptance fixture with two rifle_fire sources and confirm the overlap does not intensify;
    // 3. add machine_gun_fire and confirm the independent class increases the overlap;
    // 4. close the danger tab, issue the same route, and confirm the route remains danger-aware.
    await page.locator('[data-tab="info"]').click();
    await expect(page.locator('[data-role="sidebar-title"]')).not.toContainText('Опасность');
    await expect(canvas).toBeVisible();

    await page.screenshot({
      path: path.join(OUTPUT_DIR, '02-overlay-hidden-route-still-operational.png'),
      fullPage: false,
    });
  });
});
