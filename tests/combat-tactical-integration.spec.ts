import { expect, test } from '@playwright/test';

type Scenario = 'visual-contact' | 'near-miss' | 'wall-cover' | 'reverse-slope';

type Snapshot = {
  scenario: Scenario;
  suppression: number;
  stress: number;
  threatIds: string[];
  threatConfidence: number;
  bestSafePosition: { x: number; y: number } | null;
  routeWaypointCount: number;
  mapVisualRevision: number;
};

test.describe('combat tactical integration visual QA (prepared, run only after user approval)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?visualQa=combat-tactical-integration');
    await expect.poll(() => page.evaluate(() => Boolean(window.__realWargameCombatTacticalVisualQa))).toBe(true);
  });

  test('real visual contact appears in the existing danger, safe-position and route views', async ({ page }, testInfo) => {
    const snapshot = await setScenario(page, 'visual-contact');
    expect(snapshot.threatIds.some((id) => id.startsWith('unit:'))).toBe(true);
    expect(snapshot.threatConfidence).toBeGreaterThan(0);
    expect(snapshot.bestSafePosition).not.toBeNull();
    expect(snapshot.routeWaypointCount).toBeGreaterThan(0);
    await page.screenshot({ path: testInfo.outputPath('combat-stage1-01-visual-contact-danger-route.png'), fullPage: true });
  });

  test('near miss shows trajectory, suppression and an approximate unknown source', async ({ page }, testInfo) => {
    const snapshot = await setScenario(page, 'near-miss');
    expect(snapshot.suppression).toBeGreaterThan(5);
    expect(snapshot.stress).toBeGreaterThan(0);
    expect(snapshot.threatIds.some((id) => id.startsWith('unknown-fire:'))).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('combat-stage1-02-near-miss-approximate-threat.png'), fullPage: true });
  });

  test('wall reduces the shot effect while preserving directional information', async ({ page }, testInfo) => {
    const open = await setScenario(page, 'near-miss');
    const covered = await setScenario(page, 'wall-cover');
    expect(covered.suppression).toBeLessThan(open.suppression);
    expect(covered.threatIds.length).toBeGreaterThan(0);
    await page.screenshot({ path: testInfo.outputPath('combat-stage1-03-wall-cover-attenuation.png'), fullPage: true });
  });

  test('reverse slope changes the safe-position and routed movement context', async ({ page }, testInfo) => {
    const snapshot = await setScenario(page, 'reverse-slope');
    expect(snapshot.threatIds.length).toBeGreaterThan(0);
    expect(snapshot.bestSafePosition).not.toBeNull();
    expect(snapshot.routeWaypointCount).toBeGreaterThan(0);
    expect(snapshot.mapVisualRevision).toBeGreaterThan(0);
    await page.screenshot({ path: testInfo.outputPath('combat-stage1-04-reverse-slope-safe-route.png'), fullPage: true });
  });
});

async function setScenario(page: import('@playwright/test').Page, scenario: Scenario): Promise<Snapshot> {
  const snapshot = await page.evaluate((value) => {
    const api = window.__realWargameCombatTacticalVisualQa;
    if (!api) throw new Error('Combat tactical visual QA API is not installed.');
    return api.setScenario(value);
  }, scenario);
  await page.waitForEvent('console', { timeout: 250 }).catch(() => undefined);
  await page.waitForTimeout(120);
  return snapshot as Snapshot;
}
