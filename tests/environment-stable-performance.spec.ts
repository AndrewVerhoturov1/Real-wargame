import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

type Counter = Record<string, number | string | null | undefined>;
interface PerformanceReport {
  computation?: {
    visibilityGeometry?: Counter;
    soldierDangerField?: Counter;
    directionalTactical?: Counter;
    threatRelativeCover?: Counter;
    awarenessMovement?: Counter;
  };
  performancePhaseMeasures?: Array<{ name: string; durationMs: number }>;
  renderer?: { vegetationChunkRaster?: Counter };
}

const STABLE_WINDOW_MS = 30_000;

test.describe('environment and danger stable-scene performance', () => {
  test.setTimeout(60_000);

  test('does not rebuild geometry or vegetation chunks while the paused scene is stable', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?visualQa=danger-layer-movement-performance');
    await expect(page.locator('canvas')).toBeVisible();
    await page.locator('[data-tab="danger"]').click();
    const pause = page.locator('#pause-toggle');
    if (await pause.getAttribute('aria-pressed') !== 'true') await pause.click();

    await page.waitForTimeout(2_000);
    const before = await downloadPerformanceReport(page);
    await page.waitForTimeout(STABLE_WINDOW_MS);
    const after = await downloadPerformanceReport(page);

    for (const field of ['visibilityGeometry', 'soldierDangerField', 'directionalTactical', 'threatRelativeCover'] as const) {
      expect(delta(before.computation?.[field], after.computation?.[field], buildCounter(field))).toBeLessThanOrEqual(1);
      expect(delta(before.computation?.[field], after.computation?.[field], scanCounter(field))).toBeLessThanOrEqual(1);
    }

    const beforeRaster = before.renderer?.vegetationChunkRaster;
    const afterRaster = after.renderer?.vegetationChunkRaster;
    expect(delta(beforeRaster, afterRaster, 'chunkBuildCount')).toBe(0);
    expect(delta(beforeRaster, afterRaster, 'textureUploadCount')).toBe(0);

    const phases = new Set((after.performancePhaseMeasures ?? []).map((entry) => entry.name));
    for (const phase of [
      'real-wargame.phase.pixi-ticker',
      'real-wargame.phase.danger-overlay-update',
      'real-wargame.phase.worker-message-apply',
    ]) expect(phases.has(phase), `missing performance phase ${phase}`).toBe(true);
  });
});

async function downloadPerformanceReport(page: Page): Promise<PerformanceReport> {
  const downloadPromise = page.waitForEvent('download');
  await page.locator('[data-workspace-file-action="performance"]').click();
  const download = await downloadPromise;
  const downloadedPath = await download.path();
  if (!downloadedPath) throw new Error('Performance report download path is unavailable.');
  return JSON.parse(readFileSync(downloadedPath, 'utf8')) as PerformanceReport;
}

function delta(before: Counter | undefined, after: Counter | undefined, key: string): number {
  return Number(after?.[key] ?? 0) - Number(before?.[key] ?? 0);
}
function buildCounter(field: string): string { return field === 'directionalTactical' ? 'buildCount' : 'geometryBuildCount'; }
function scanCounter(field: string): string { return field === 'visibilityGeometry' ? 'fullMapScanCount' : 'fullMapScanCount'; }
