import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const VIEWPORT = { width: 1440, height: 900 };
const OUTPUT_DIR = path.join('artifacts', 'visual-qa', 'danger-route-cost-parity-v1');

type DangerParityPhase = 'single-rifle' | 'two-rifles' | 'rifle-and-machine-gun' | 'overlay-hidden-route';

interface DangerParitySnapshot {
  phase: DangerParityPhase;
  overlayMode: string;
  threatCount: number;
  exposedCell: { x: number; y: number; danger: number; expectedProtectionAgainstThreat: number };
  protectedCell: { x: number; y: number; danger: number; expectedProtectionAgainstThreat: number };
  awarenessDangerFieldKey: string;
  routeDangerFieldKey: string;
  routeDangerAvailable: boolean;
  routeCells: Array<{ x: number; y: number }>;
  orderWaypointCount: number;
}

interface CombatSnapshot {
  unitThreatCount: number;
  dangerFieldKey?: string;
  parity?: DangerParitySnapshot;
}

interface ExtendedCombatVisualApi {
  setScenario(scenario: string): CombatSnapshot;
  setDangerParityPhase(phase: DangerParityPhase): CombatSnapshot;
}

test.describe('danger route cost parity visual QA — explicit approval required', () => {
  test.skip('builds the full class aggregation and overlay-independent routing fixture', async ({ page }) => {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    await openHarness(page);

    const single = await setScenario(page);
    const singleParity = requireParity(single, 'single-rifle');
    expect(single.unitThreatCount).toBe(1);
    expect(singleParity.protectedCell.expectedProtectionAgainstThreat).toBeGreaterThan(0);
    expect(singleParity.protectedCell.danger).toBeLessThan(singleParity.exposedCell.danger);
    assertRouteUsesCanonicalDanger(singleParity);
    await page.screenshot({
      path: path.join(OUTPUT_DIR, '01-single-rifle-open-vs-protected.png'),
      fullPage: false,
    });

    const twoRifles = await setPhase(page, 'two-rifles');
    const twoRiflesParity = requireParity(twoRifles, 'two-rifles');
    expect(twoRifles.unitThreatCount).toBe(2);
    expect(twoRiflesParity.exposedCell.danger).toBe(singleParity.exposedCell.danger);
    expect(twoRiflesParity.protectedCell.danger).toBe(singleParity.protectedCell.danger);
    assertRouteUsesCanonicalDanger(twoRiflesParity);
    await page.screenshot({
      path: path.join(OUTPUT_DIR, '02-weaker-second-rifle-no-amplification.png'),
      fullPage: false,
    });

    const mixedClasses = await setPhase(page, 'rifle-and-machine-gun');
    const mixedParity = requireParity(mixedClasses, 'rifle-and-machine-gun');
    expect(mixedClasses.unitThreatCount).toBe(3);
    expect(mixedParity.exposedCell.danger).toBeGreaterThan(twoRiflesParity.exposedCell.danger);
    expect(mixedParity.protectedCell.danger).toBeGreaterThanOrEqual(twoRiflesParity.protectedCell.danger);
    assertRouteUsesCanonicalDanger(mixedParity);
    await page.screenshot({
      path: path.join(OUTPUT_DIR, '03-machine-gun-class-increases-danger.png'),
      fullPage: false,
    });

    const hiddenOverlay = await setPhase(page, 'overlay-hidden-route');
    const hiddenParity = requireParity(hiddenOverlay, 'overlay-hidden-route');
    expect(hiddenParity.overlayMode).toBe('info');
    expect(hiddenParity.routeCells.length).toBeGreaterThan(1);
    expect(hiddenParity.orderWaypointCount).toBeGreaterThan(0);
    assertRouteUsesCanonicalDanger(hiddenParity);
    await page.screenshot({
      path: path.join(OUTPUT_DIR, '04-overlay-hidden-route-still-danger-aware.png'),
      fullPage: false,
    });
  });
});

async function openHarness(page: Page): Promise<void> {
  await page.setViewportSize(VIEWPORT);
  await page.goto('/?visualQa=combat-tactical-integration');
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__realWargameCombatTacticalVisualQa));
  await expect(page.locator('#pause-toggle')).toHaveAttribute('aria-pressed', 'true');
}

async function setScenario(page: Page): Promise<CombatSnapshot> {
  const snapshot = await page.evaluate(() => {
    const api = window.__realWargameCombatTacticalVisualQa as unknown as ExtendedCombatVisualApi | undefined;
    if (!api) throw new Error('Combat tactical visual QA API is unavailable.');
    return api.setScenario('danger-route-cost-parity');
  });
  await waitForParityRender(page, 'single-rifle');
  return snapshot;
}

async function setPhase(page: Page, phase: DangerParityPhase): Promise<CombatSnapshot> {
  const snapshot = await page.evaluate((nextPhase) => {
    const api = window.__realWargameCombatTacticalVisualQa as unknown as ExtendedCombatVisualApi | undefined;
    if (!api) throw new Error('Combat tactical visual QA API is unavailable.');
    return api.setDangerParityPhase(nextPhase);
  }, phase);
  await waitForParityRender(page, phase);
  return snapshot;
}

async function waitForParityRender(page: Page, phase: DangerParityPhase): Promise<void> {
  await page.waitForFunction((expectedPhase) => {
    const api = window.__realWargameCombatTacticalVisualQa as unknown as ExtendedCombatVisualApi | undefined;
    const snapshot = api && 'getSnapshot' in api
      ? (api as ExtendedCombatVisualApi & { getSnapshot(): CombatSnapshot | null }).getSnapshot()
      : null;
    return snapshot?.parity?.phase === expectedPhase
      && Boolean(snapshot.parity.awarenessDangerFieldKey)
      && snapshot.parity.awarenessDangerFieldKey === snapshot.parity.routeDangerFieldKey;
  }, phase);
}

function requireParity(snapshot: CombatSnapshot, phase: DangerParityPhase): DangerParitySnapshot {
  expect(snapshot.parity, `${phase} parity diagnostics must be present`).toBeTruthy();
  expect(snapshot.parity?.phase).toBe(phase);
  return snapshot.parity as DangerParitySnapshot;
}

function assertRouteUsesCanonicalDanger(snapshot: DangerParitySnapshot): void {
  expect(snapshot.routeDangerAvailable).toBe(true);
  expect(snapshot.routeDangerFieldKey).toBeTruthy();
  expect(snapshot.routeDangerFieldKey).toBe(snapshot.awarenessDangerFieldKey);
  expect(snapshot.routeCells.length).toBeGreaterThan(1);
  expect(snapshot.orderWaypointCount).toBeGreaterThan(0);
}
