import { expect, test } from '@playwright/test';

type Scenario =
  | 'visual-contact'
  | 'near-miss'
  | 'wall-cover'
  | 'reverse-slope'
  | 'slice1-contact-danger-zero-suppression'
  | 'slice1-near-miss-evidence-suppression'
  | 'slice1-wall-evidence-attenuation'
  | 'slice1-repeated-unknown-fire-merged'
  | 'slice1-detected-shooter-alias';

type Snapshot = {
  scenario: Scenario;
  suppression: number;
  stress: number;
  danger: number;
  tacticalSuppression: number;
  threatIds: string[];
  threatConfidence: number;
  evidenceCount: number;
  unknownThreatCount: number;
  unitThreatCount: number;
  maxThreatStrength: number;
  maxThreatSuppression: number;
  hiddenFactLeakCount: number;
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

  test('Slice 1 contact shows positive danger and exactly zero suppression', async ({ page }, testInfo) => {
    const snapshot = await setScenario(page, 'slice1-contact-danger-zero-suppression');
    expect(snapshot.danger).toBeGreaterThan(0);
    expect(snapshot.maxThreatStrength).toBeGreaterThan(0);
    expect(snapshot.tacticalSuppression).toBe(0);
    expect(snapshot.maxThreatSuppression).toBe(0);
    expect(snapshot.evidenceCount).toBe(0);
    await page.screenshot({ path: testInfo.outputPath('combat-stage1-slice1-01-contact-danger-zero-suppression.png'), fullPage: true });
  });

  test('Slice 1 near miss shows evidence suppression above the contact baseline with only an approximate source', async ({ page }, testInfo) => {
    const contact = await setScenario(page, 'slice1-contact-danger-zero-suppression');
    const snapshot = await setScenario(page, 'slice1-near-miss-evidence-suppression');
    expect(snapshot.tacticalSuppression).toBeGreaterThan(contact.tacticalSuppression);
    expect(snapshot.stress).toBeGreaterThan(contact.stress);
    expect(snapshot.unknownThreatCount).toBe(1);
    expect(snapshot.unitThreatCount).toBe(0);
    expect(snapshot.evidenceCount).toBeGreaterThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath('combat-stage1-slice1-02-near-miss-evidence-suppression.png'), fullPage: true });
  });

  test('Slice 1 wall attenuates evidence suppression while preserving directional evidence', async ({ page }, testInfo) => {
    const open = await setScenario(page, 'slice1-near-miss-evidence-suppression');
    const covered = await setScenario(page, 'slice1-wall-evidence-attenuation');
    expect(covered.tacticalSuppression).toBeLessThan(open.tacticalSuppression);
    expect(covered.unknownThreatCount).toBeGreaterThanOrEqual(1);
    expect(covered.evidenceCount).toBeGreaterThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath('combat-stage1-slice1-03-wall-evidence-attenuation.png'), fullPage: true });
  });

  test('Slice 1 repeated consistent unknown fire remains one bounded threat with at least three evidence items', async ({ page }, testInfo) => {
    const snapshot = await setScenario(page, 'slice1-repeated-unknown-fire-merged');
    expect(snapshot.unknownThreatCount).toBe(1);
    expect(snapshot.unitThreatCount).toBe(0);
    expect(snapshot.evidenceCount).toBeGreaterThanOrEqual(3);
    expect(snapshot.maxThreatStrength).toBeLessThanOrEqual(100);
    expect(snapshot.maxThreatSuppression).toBeLessThanOrEqual(100);
    await page.screenshot({ path: testInfo.outputPath('combat-stage1-slice1-04-repeated-unknown-fire-merged.png'), fullPage: true });
  });

  test('Slice 1 detected shooter aliases unknown evidence without hidden objective leakage', async ({ page }, testInfo) => {
    const snapshot = await setScenario(page, 'slice1-detected-shooter-alias');
    expect(snapshot.unitThreatCount).toBe(1);
    expect(snapshot.unknownThreatCount).toBe(0);
    expect(snapshot.evidenceCount).toBeGreaterThanOrEqual(1);
    expect(snapshot.tacticalSuppression).toBeGreaterThan(0);
    expect(snapshot.maxThreatSuppression).toBeLessThanOrEqual(100);
    expect(snapshot.hiddenFactLeakCount).toBe(0);
    await page.screenshot({ path: testInfo.outputPath('combat-stage1-slice1-05-detected-shooter-alias.png'), fullPage: true });
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
