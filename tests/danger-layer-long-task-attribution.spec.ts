import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { normalizePerformanceReport } from './performance-report-compat';

interface MovementDiagnostics {
  pendingQueueDepth: number;
  maxPendingQueueDepth: number;
  workerInFlight: boolean;
  finalRefreshRequests: number;
  finalRefreshApplied: number;
  lastRequestedWorldKey: string;
  lastAppliedWorldKey: string;
  lastRequestedCanonicalThreatKey: string;
  lastAppliedCanonicalThreatKey: string;
  lastCompletedJobId: number;
  lastAppliedJobId: number;
  lastCompletedJobFinalExact: boolean;
  lastAppliedFieldIdentity: string;
  lastAppliedRasterDigest: string;
  maxMainThreadApplyMs: number;
  lastWorkerError: string | null;
}

interface MovementSnapshot {
  scenario: string | null;
  hostilePosition: { x: number; y: number };
  subjectiveThreatPosition: { x: number; y: number } | null;
  subjectiveThreatVisibleNow: boolean | null;
  wallX: number | null;
  lastRequestedWorldKey: string;
  lastAppliedWorldKey: string;
  lastRequestedCanonicalThreatKey: string;
  lastAppliedCanonicalThreatKey: string;
  lastAppliedFieldIdentity: string;
  lastAppliedRasterDigest: string;
  lastAppliedJobId: number;
  awarenessMovement: MovementDiagnostics | null;
}

interface PerformanceReport {
  version: string;
  build?: {
    branch?: string;
    commitSha?: string;
    buildId?: string;
    performanceContractVersion?: string;
  };
  browser?: Record<string, unknown>;
  samples: Array<{ tMs: number; sceneUpdateMs: number; layerMode: string }>;
  longTasks: Array<Record<string, unknown>>;
  longAnimationFrames?: Array<Record<string, unknown>>;
  performancePhaseMeasures?: Array<Record<string, unknown>>;
  computation?: { awarenessMovement?: MovementDiagnostics };
}

const EXPECTED_BRANCH = process.env.DANGER_PERF_EXPECTED_BRANCH
  ?? 'agent/danger-layer-moving-units-performance';
const EXPECTED_SHA = process.env.DANGER_PERF_EXPECTED_SHA ?? '';
const OUTPUT_PATH = process.env.DANGER_LONG_TASK_ATTRIBUTION_OUTPUT
  ?? path.join('artifacts', 'performance', 'danger-layer-long-task-attribution.json');

const WALL_SCENARIO = 'wall-crossing';
const ATTRIBUTION_SCENARIO = 'wall-crossing-attribution';

test('captures raw wall-crossing long-task and long-animation-frame attribution', async ({ page }) => {
  await page.addInitScript((scenario) => {
    (window as Window & { __realWargamePerformanceScenario?: string | null }).__realWargamePerformanceScenario = scenario;
  }, ATTRIBUTION_SCENARIO);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?visualQa=danger-layer-movement-performance');
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__realWargameDangerMovementPerformance));
  await setSimulationPaused(page, true);

  const setup = await page.evaluate(({ scenario, attributionScenario }) => {
    const api = window.__realWargameDangerMovementPerformance;
    if (!api) throw new Error('Danger movement performance API is unavailable.');
    (window as Window & { __realWargamePerformanceScenario?: string | null }).__realWargamePerformanceScenario = attributionScenario;
    const startedAt = performance.now();
    const snapshot = api.startScenario(scenario as never) as MovementSnapshot;
    const endedAt = performance.now();
    performance.measure('real-wargame.phase.wall-crossing-attribution.scenario-setup', {
      start: startedAt,
      end: endedAt,
    });
    return { durationMs: endedAt - startedAt, snapshot };
  }, { scenario: WALL_SCENARIO, attributionScenario: ATTRIBUTION_SCENARIO });

  await waitForWorkerSettled(page);
  const before = await snapshot(page);
  const beforeMovement = requireMovement(before);
  const wallX = requireWallX(before);
  const beforeThreat = requireSubjective(before);
  expect(beforeThreat.x).toBeGreaterThan(wallX + 2);
  expect(before.subjectiveThreatVisibleNow).toBe(true);
  assertFinalApplied(before, beforeMovement);

  const resumeStartedAt = Date.now();
  await setSimulationPaused(page, false);
  await page.waitForFunction((wall) => {
    const current = window.__realWargameDangerMovementPerformance?.getSnapshot();
    return Boolean(
      current
      && current.hostilePosition.x < wall - 2
      && current.subjectiveThreatPosition
      && current.subjectiveThreatPosition.x < wall - 2,
    );
  }, wallX, { timeout: 25_000 });
  const wallCrossingWaitMs = Date.now() - resumeStartedAt;

  const stop = await page.evaluate(() => {
    const api = window.__realWargameDangerMovementPerformance;
    if (!api) throw new Error('Danger movement performance API is unavailable.');
    const startedAt = performance.now();
    const snapshot = api.stopScenario() as MovementSnapshot;
    const endedAt = performance.now();
    performance.measure('real-wargame.phase.wall-crossing-attribution.scenario-stop', {
      start: startedAt,
      end: endedAt,
    });
    return { durationMs: endedAt - startedAt, snapshot };
  });
  await page.waitForTimeout(250);
  await waitForWorkerSettled(page, beforeMovement.finalRefreshApplied + 1);

  const after = await snapshot(page);
  const afterMovement = requireMovement(after);
  const afterThreat = requireSubjective(after);
  expect(after.subjectiveThreatVisibleNow).toBe(true);
  expect(afterThreat.x).toBeLessThan(wallX - 2);
  expect(after.lastAppliedFieldIdentity).not.toBe(before.lastAppliedFieldIdentity);
  assertFinalApplied(after, afterMovement);
  expect(afterMovement.maxPendingQueueDepth).toBeLessThanOrEqual(1);
  expect(afterMovement.maxMainThreadApplyMs).toBeLessThanOrEqual(5);
  expect(afterMovement.lastWorkerError).toBeNull();

  const downloaded = await downloadReport(page);
  const report = downloaded.report;
  expect(report.version).toBe('performance-report-v6');
  expect(report.build?.performanceContractVersion).toBe(report.version);
  expect(report.build?.branch).toBe(EXPECTED_BRANCH);
  if (EXPECTED_SHA) expect(report.build?.commitSha).toBe(EXPECTED_SHA);
  expect(report.build?.buildId).toBeTruthy();
  expect(report.longTasks.length).toBeGreaterThan(0);
  expect(report.browser?.performanceObserverSupportedEntryTypes).toBeTruthy();

  const output = {
    version: 'danger-layer-long-task-attribution-v1',
    generatedAt: new Date().toISOString(),
    build: report.build ?? null,
    playwright: {
      scenarioSetupEvaluateMs: roundTwo(setup.durationMs),
      wallCrossingWaitMs,
      scenarioStopEvaluateMs: roundTwo(stop.durationMs),
      reportExportEvaluateMs: roundTwo(downloaded.exportTriggerMs),
    },
    before,
    after,
    report,
  };
  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    output: OUTPUT_PATH,
    globalLongTasks: report.longTasks.length,
    longAnimationFrames: report.longAnimationFrames?.length ?? 0,
    performancePhaseMeasures: report.performancePhaseMeasures?.length ?? 0,
    playwright: output.playwright,
  }, null, 2));
});

async function setSimulationPaused(page: Page, paused: boolean): Promise<void> {
  await page.evaluate((desired) => {
    const button = document.querySelector<HTMLButtonElement>('#pause-toggle');
    if (!button) throw new Error('Pause toggle is unavailable.');
    if ((button.getAttribute('aria-pressed') === 'true') !== desired) button.click();
  }, paused);
  await expect(page.locator('#pause-toggle')).toHaveAttribute('aria-pressed', String(paused));
}

async function snapshot(page: Page): Promise<MovementSnapshot> {
  return page.evaluate(() => {
    const api = window.__realWargameDangerMovementPerformance;
    if (!api) throw new Error('Danger movement performance API is unavailable.');
    return api.getSnapshot() as MovementSnapshot;
  });
}

async function waitForWorkerSettled(page: Page, minimumFinalApplied = 1): Promise<void> {
  await page.waitForFunction((minimumApplied) => {
    const current = window.__realWargameDangerMovementPerformance?.getSnapshot();
    const movement = current?.awarenessMovement as MovementDiagnostics | null | undefined;
    return Boolean(
      current
      && movement
      && !movement.workerInFlight
      && movement.pendingQueueDepth === 0
      && movement.finalRefreshRequests > 0
      && movement.finalRefreshApplied >= minimumApplied
      && current.lastRequestedWorldKey
      && current.lastAppliedWorldKey === current.lastRequestedWorldKey
      && current.lastRequestedCanonicalThreatKey
      && current.lastAppliedCanonicalThreatKey === current.lastRequestedCanonicalThreatKey
      && current.lastAppliedFieldIdentity
      && current.lastAppliedRasterDigest
      && movement.lastCompletedJobFinalExact,
    );
  }, minimumFinalApplied, { timeout: 30_000 });
}

async function downloadReport(page: Page): Promise<{ report: PerformanceReport; exportTriggerMs: number }> {
  const downloadPromise = page.waitForEvent('download');
  const exportTriggerMs = await page.evaluate(() => {
    const button = document.querySelector<HTMLElement>('[data-workspace-file-action="performance"]');
    if (!button) throw new Error('Performance report control is missing.');
    const startedAt = performance.now();
    button.click();
    return performance.now() - startedAt;
  });
  const download = await downloadPromise;
  const downloadedPath = await download.path();
  if (!downloadedPath) throw new Error('Performance report download path is unavailable.');
  return {
    report: normalizePerformanceReport<PerformanceReport>(JSON.parse(readFileSync(downloadedPath, 'utf8'))),
    exportTriggerMs,
  };
}

function assertFinalApplied(value: MovementSnapshot, movement: MovementDiagnostics): void {
  expect(value.lastAppliedWorldKey).toBe(value.lastRequestedWorldKey);
  expect(value.lastAppliedCanonicalThreatKey).toBe(value.lastRequestedCanonicalThreatKey);
  expect(value.lastAppliedFieldIdentity).toBeTruthy();
  expect(value.lastAppliedRasterDigest).toBeTruthy();
  expect(value.lastAppliedJobId).toBe(movement.lastAppliedJobId);
  expect(movement.lastAppliedWorldKey).toBe(movement.lastRequestedWorldKey);
  expect(movement.lastAppliedCanonicalThreatKey).toBe(movement.lastRequestedCanonicalThreatKey);
  expect(movement.lastAppliedJobId).toBe(movement.lastCompletedJobId);
  expect(movement.lastCompletedJobFinalExact).toBe(true);
}

function requireMovement(value: MovementSnapshot): MovementDiagnostics {
  if (!value.awarenessMovement) throw new Error('Awareness movement diagnostics are unavailable.');
  return value.awarenessMovement;
}

function requireSubjective(value: MovementSnapshot): { x: number; y: number } {
  if (!value.subjectiveThreatPosition) throw new Error('Subjective threat position is unavailable.');
  return value.subjectiveThreatPosition;
}

function requireWallX(value: MovementSnapshot): number {
  if (value.wallX === null) throw new Error('Wall geometry is unavailable.');
  return value.wallX;
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}
