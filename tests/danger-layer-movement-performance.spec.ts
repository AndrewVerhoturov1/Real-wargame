import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

interface MovementDiagnostics {
  worldRasterBuilds: number;
  ownMovementLocalUpdates: number;
  safePositionLocalScans: number;
  directionalBasisBuilds: number;
  workerJobsStarted: number;
  workerJobsCompleted: number;
  workerJobsCoalesced: number;
  workerResultsStaleDropped: number;
  mainThreadRasterSwaps: number;
  finalRefreshRequests: number;
  finalRefreshApplied: number;
  pendingQueueDepth: number;
  maxPendingQueueDepth: number;
  workerInFlight: boolean;
  lastWorkerLatencyMs: number;
  maxWorkerLatencyMs: number;
  lastWorkerComputeMs: number;
  maxWorkerComputeMs: number;
  lastMainThreadApplyMs: number;
  maxMainThreadApplyMs: number;
  lastLocalUpdateMs: number;
  maxLocalUpdateMs: number;
  lastRequestedRasterKey: string;
  lastAppliedRasterKey: string;
  lastWorkerError: string | null;
}

interface MovementSnapshot {
  scenario: string | null;
  simulationTimeSeconds: number;
  observerPosition: { x: number; y: number };
  hostilePosition: { x: number; y: number };
  subjectiveThreatPosition: { x: number; y: number } | null;
  subjectiveThreatVisibleNow: boolean | null;
  tacticalKnowledgeRevision: number;
  observerMoving: boolean;
  hostileMoving: boolean;
  movingUnitCount: number;
  bestSafePosition: { x: number; y: number } | null;
  protectedAgainstThreatId: string | null;
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
  samples: Array<{ tMs: number; sceneUpdateMs: number; layerMode: string }>;
  longTasks: Array<{ durationMs: number }>;
  computation?: {
    awarenessMovement?: MovementDiagnostics;
  };
}

interface ScenarioEvidence {
  readonly scenario: string;
  readonly before: MovementSnapshot;
  readonly after: MovementSnapshot;
  readonly counters: Record<string, number | string | boolean | null>;
}

const EXPECTED_BRANCH = process.env.DANGER_PERF_EXPECTED_BRANCH
  ?? 'agent/danger-layer-moving-units-performance';
const EXPECTED_SHA = process.env.DANGER_PERF_EXPECTED_SHA ?? '';
const EVIDENCE_PATH = process.env.DANGER_MOVEMENT_PERF_OUTPUT
  ?? path.join('artifacts', 'performance', 'danger-layer-movement-performance.json');
const REPORT_WINDOW_MS = 8_000;
const scenarioEvidence: ScenarioEvidence[] = [];

test.describe.configure({ mode: 'serial' });

test('selected unit movement performs local updates without world rebuilds', async ({ page }) => {
  await openHarness(page);
  await startScenarioPaused(page, 'selected-only');
  await waitForWorkerSettled(page);
  const before = await snapshot(page, false);
  const beforeMovement = requireMovement(before);
  expect(before.observerMoving).toBe(true);

  await resumeSimulation(page);
  await page.waitForFunction((start) => {
    const current = window.__realWargameDangerMovementPerformance?.getSnapshot(false);
    return Boolean(current && Math.hypot(
      current.observerPosition.x - start.x,
      current.observerPosition.y - start.y,
    ) >= 5);
  }, before.observerPosition, { timeout: 15_000 });
  const after = await snapshot(page, false);
  const afterMovement = requireMovement(after);

  expect(afterMovement.worldRasterBuilds).toBe(beforeMovement.worldRasterBuilds);
  expect(afterMovement.directionalBasisBuilds).toBe(beforeMovement.directionalBasisBuilds);
  expect(afterMovement.ownMovementLocalUpdates).toBeGreaterThan(beforeMovement.ownMovementLocalUpdates);
  expect(afterMovement.safePositionLocalScans).toBeGreaterThan(beforeMovement.safePositionLocalScans);
  expect(afterMovement.maxPendingQueueDepth).toBeLessThanOrEqual(1);
  expect(afterMovement.maxLocalUpdateMs).toBeLessThanOrEqual(10);
  expect(afterMovement.lastWorkerError).toBeNull();

  scenarioEvidence.push({
    scenario: 'selected-only',
    before,
    after,
    counters: {
      worldRasterBuildDelta: afterMovement.worldRasterBuilds - beforeMovement.worldRasterBuilds,
      directionalBasisBuildDelta: afterMovement.directionalBasisBuilds - beforeMovement.directionalBasisBuilds,
      ownMovementLocalUpdateDelta: afterMovement.ownMovementLocalUpdates - beforeMovement.ownMovementLocalUpdates,
      safePositionLocalScanDelta: afterMovement.safePositionLocalScans - beforeMovement.safePositionLocalScans,
      maxLocalUpdateMs: afterMovement.maxLocalUpdateMs,
    },
  });
  await stopScenario(page);
});

test('visible hostile movement updates subjective danger through a bounded worker queue', async ({ page }) => {
  await openHarness(page);
  await startScenarioPaused(page, 'hostile-only');
  await waitForWorkerSettled(page);
  const before = await snapshot(page, false);
  const beforeMovement = requireMovement(before);
  const initialSubjective = requireSubjective(before);
  expect(before.hostileMoving).toBe(true);

  await resumeSimulation(page);
  await page.waitForFunction((initial) => {
    const current = window.__realWargameDangerMovementPerformance?.getSnapshot(false);
    const threat = current?.subjectiveThreatPosition;
    return Boolean(threat && Math.hypot(threat.x - initial.x, threat.y - initial.y) >= 2);
  }, initialSubjective, { timeout: 20_000 });
  const moving = await snapshot(page, false);
  const movingDiagnostics = requireMovement(moving);

  expect(movingDiagnostics.workerJobsStarted).toBeGreaterThan(beforeMovement.workerJobsStarted);
  expect(movingDiagnostics.worldRasterBuilds).toBeGreaterThan(beforeMovement.worldRasterBuilds);
  expect(movingDiagnostics.maxPendingQueueDepth).toBeLessThanOrEqual(1);
  expect(movingDiagnostics.pendingQueueDepth).toBeLessThanOrEqual(1);
  expect(movingDiagnostics.maxMainThreadApplyMs).toBeLessThanOrEqual(5);
  expect(movingDiagnostics.lastWorkerError).toBeNull();

  await stopScenario(page);
  await page.waitForTimeout(250);
  await waitForWorkerSettled(page);
  const after = await snapshot(page, false);
  const afterMovement = requireMovement(after);
  expect(afterMovement.lastAppliedRasterKey).toBe(afterMovement.lastRequestedRasterKey);
  expect(afterMovement.finalRefreshApplied).toBeGreaterThan(beforeMovement.finalRefreshApplied);

  scenarioEvidence.push({
    scenario: 'hostile-only',
    before,
    after,
    counters: {
      workerJobsStartedDelta: afterMovement.workerJobsStarted - beforeMovement.workerJobsStarted,
      workerJobsCompletedDelta: afterMovement.workerJobsCompleted - beforeMovement.workerJobsCompleted,
      worldRasterBuildDelta: afterMovement.worldRasterBuilds - beforeMovement.worldRasterBuilds,
      workerJobsCoalescedDelta: afterMovement.workerJobsCoalesced - beforeMovement.workerJobsCoalesced,
      staleDroppedDelta: afterMovement.workerResultsStaleDropped - beforeMovement.workerResultsStaleDropped,
      maxPendingQueueDepth: afterMovement.maxPendingQueueDepth,
      maxMainThreadApplyMs: afterMovement.maxMainThreadApplyMs,
      maxWorkerComputeMs: afterMovement.maxWorkerComputeMs,
      maxWorkerLatencyMs: afterMovement.maxWorkerLatencyMs,
      finalKeyApplied: afterMovement.lastAppliedRasterKey === afterMovement.lastRequestedRasterKey,
    },
  });
});

test('six moving units remain bounded and apply the final snapshot', async ({ page }) => {
  await openHarness(page);
  await startScenarioPaused(page, 'both');
  await waitForWorkerSettled(page);
  const before = await snapshot(page, false);
  const beforeMovement = requireMovement(before);
  expect(before.movingUnitCount).toBeGreaterThanOrEqual(6);

  await resumeSimulation(page);
  await page.waitForFunction((initial) => {
    const current = window.__realWargameDangerMovementPerformance?.getSnapshot(false);
    if (!current) return false;
    const friendlyDistance = Math.hypot(
      current.observerPosition.x - initial.observerPosition.x,
      current.observerPosition.y - initial.observerPosition.y,
    );
    const hostileDistance = Math.hypot(
      current.hostilePosition.x - initial.hostilePosition.x,
      current.hostilePosition.y - initial.hostilePosition.y,
    );
    return friendlyDistance >= 4 && hostileDistance >= 4;
  }, before, { timeout: 20_000 });

  await stopScenario(page);
  await page.waitForTimeout(250);
  await waitForWorkerSettled(page);
  const after = await snapshot(page, false);
  const movement = requireMovement(after);
  expect(movement.workerJobsStarted).toBeGreaterThan(beforeMovement.workerJobsStarted);
  expect(movement.ownMovementLocalUpdates).toBeGreaterThan(beforeMovement.ownMovementLocalUpdates);
  expect(movement.maxPendingQueueDepth).toBeLessThanOrEqual(1);
  expect(movement.pendingQueueDepth).toBe(0);
  expect(movement.workerInFlight).toBe(false);
  expect(movement.lastAppliedRasterKey).toBe(movement.lastRequestedRasterKey);
  expect(movement.lastWorkerError).toBeNull();

  scenarioEvidence.push({
    scenario: 'both-six-units',
    before,
    after,
    counters: {
      movingUnitCount: before.movingUnitCount,
      workerJobsStartedDelta: movement.workerJobsStarted - beforeMovement.workerJobsStarted,
      worldRasterBuildDelta: movement.worldRasterBuilds - beforeMovement.worldRasterBuilds,
      ownMovementLocalUpdateDelta: movement.ownMovementLocalUpdates - beforeMovement.ownMovementLocalUpdates,
      maxPendingQueueDepth: movement.maxPendingQueueDepth,
      finalKeyApplied: movement.lastAppliedRasterKey === movement.lastRequestedRasterKey,
    },
  });
});

test('hidden hostile objective movement does not reveal a new subjective position', async ({ page }) => {
  await openHarness(page);
  await startScenarioPaused(page, 'hidden-hostile');
  await waitForWorkerSettled(page);
  const before = await snapshot(page, false);
  const initialObjective = before.hostilePosition;
  const initialSubjective = requireSubjective(before);
  const beforeMovement = requireMovement(before);
  expect(before.hostileMoving).toBe(true);

  await resumeSimulation(page);
  await page.waitForFunction((initial) => {
    const current = window.__realWargameDangerMovementPerformance?.getSnapshot(false);
    return Boolean(current && Math.hypot(
      current.hostilePosition.x - initial.x,
      current.hostilePosition.y - initial.y,
    ) >= 3);
  }, initialObjective, { timeout: 12_000 });
  const after = await snapshot(page, false);
  const afterSubjective = requireSubjective(after);
  const afterMovement = requireMovement(after);
  const subjectiveDistance = Math.hypot(
    afterSubjective.x - initialSubjective.x,
    afterSubjective.y - initialSubjective.y,
  );

  expect(subjectiveDistance).toBeLessThan(0.2);
  expect(afterMovement.worldRasterBuilds).toBe(beforeMovement.worldRasterBuilds);
  expect(afterMovement.directionalBasisBuilds).toBe(beforeMovement.directionalBasisBuilds);
  expect(afterMovement.maxPendingQueueDepth).toBeLessThanOrEqual(1);
  expect(afterMovement.lastWorkerError).toBeNull();

  scenarioEvidence.push({
    scenario: 'hidden-hostile',
    before,
    after,
    counters: {
      objectiveDistanceCells: Math.hypot(
        after.hostilePosition.x - before.hostilePosition.x,
        after.hostilePosition.y - before.hostilePosition.y,
      ),
      subjectiveDistanceCells: subjectiveDistance,
      worldRasterBuildDelta: afterMovement.worldRasterBuilds - beforeMovement.worldRasterBuilds,
      directionalBasisBuildDelta: afterMovement.directionalBasisBuilds - beforeMovement.directionalBasisBuilds,
    },
  });
  await stopScenario(page);
});

test('wall-side crossing cannot apply stale worker output over the final threat side', async ({ page }) => {
  await openHarness(page);
  await startScenarioPaused(page, 'wall-crossing');
  await waitForWorkerSettled(page);
  const before = await snapshot(page, true);
  expect(before.bestSafePosition).not.toBeNull();
  expect(before.hostileMoving).toBe(true);

  await resumeSimulation(page);
  await page.waitForFunction(() => {
    const current = window.__realWargameDangerMovementPerformance?.getSnapshot(false);
    return Boolean(current && current.hostilePosition.x < current.observerPosition.x - 2);
  }, undefined, { timeout: 25_000 });
  await stopScenario(page);
  await page.waitForTimeout(250);
  await waitForWorkerSettled(page);
  const after = await snapshot(page, true);
  const movement = requireMovement(after);

  expect(after.bestSafePosition).not.toBeNull();
  expect(after.bestSafePosition).not.toEqual(before.bestSafePosition);
  expect(after.protectedAgainstThreatId).not.toBeNull();
  expect(movement.maxPendingQueueDepth).toBeLessThanOrEqual(1);
  expect(movement.lastAppliedRasterKey).toBe(movement.lastRequestedRasterKey);
  expect(movement.lastWorkerError).toBeNull();

  const report = await downloadReport(page);
  assertBuildIdentity(report);
  const sceneStats = summarizeSceneUpdates(report);
  expect(sceneStats.p95).toBeLessThanOrEqual(10);
  expect(sceneStats.max).toBeLessThanOrEqual(50);
  const reportMovement = report.computation?.awarenessMovement;
  expect(reportMovement).toBeTruthy();
  expect(reportMovement?.maxPendingQueueDepth).toBeLessThanOrEqual(1);
  expect(reportMovement?.maxMainThreadApplyMs).toBeLessThanOrEqual(5);
  expect(reportMovement?.lastAppliedRasterKey).toBe(reportMovement?.lastRequestedRasterKey);

  scenarioEvidence.push({
    scenario: 'wall-crossing',
    before,
    after,
    counters: {
      winnerChanged: JSON.stringify(after.bestSafePosition) !== JSON.stringify(before.bestSafePosition),
      protectedAgainstThreatId: after.protectedAgainstThreatId,
      staleDropped: movement.workerResultsStaleDropped,
      maxPendingQueueDepth: movement.maxPendingQueueDepth,
      finalKeyApplied: movement.lastAppliedRasterKey === movement.lastRequestedRasterKey,
    },
  });

  const evidence = {
    version: 'danger-layer-movement-evidence-v1',
    generatedAt: new Date().toISOString(),
    build: report.build ?? null,
    sceneUpdateMs: sceneStats,
    finalMovementDiagnostics: reportMovement ?? null,
    scenarios: scenarioEvidence,
  };
  mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(evidence, null, 2));
});

async function openHarness(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?visualQa=danger-layer-movement-performance');
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__realWargameDangerMovementPerformance));
}

async function startScenarioPaused(page: Page, scenario: string): Promise<MovementSnapshot> {
  const started = await page.evaluate((name) => {
    const api = window.__realWargameDangerMovementPerformance;
    if (!api) throw new Error('Danger movement performance API is unavailable.');
    return api.startScenario(name as never) as MovementSnapshot;
  }, scenario);
  await setSimulationPaused(page, true);
  return started;
}

async function resumeSimulation(page: Page): Promise<void> {
  await setSimulationPaused(page, false);
}

async function setSimulationPaused(page: Page, paused: boolean): Promise<void> {
  await page.evaluate((desired) => {
    const button = document.querySelector<HTMLButtonElement>('#pause-toggle');
    if (!button) throw new Error('Pause toggle is unavailable.');
    button.click();
    if ((button.getAttribute('aria-pressed') === 'true') !== desired) button.click();
  }, paused);
  await expect(page.locator('#pause-toggle')).toHaveAttribute('aria-pressed', String(paused));
}

async function stopScenario(page: Page): Promise<MovementSnapshot> {
  return page.evaluate(() => {
    const api = window.__realWargameDangerMovementPerformance;
    if (!api) throw new Error('Danger movement performance API is unavailable.');
    return api.stopScenario() as MovementSnapshot;
  });
}

async function snapshot(page: Page, includeExactAwareness: boolean): Promise<MovementSnapshot> {
  return page.evaluate((includeExact) => {
    const api = window.__realWargameDangerMovementPerformance;
    if (!api) throw new Error('Danger movement performance API is unavailable.');
    return api.getSnapshot(includeExact) as MovementSnapshot;
  }, includeExactAwareness);
}

async function waitForWorkerSettled(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const movement = window.__realWargameDangerMovementPerformance
      ?.getSnapshot(false).awarenessMovement as MovementDiagnostics | null | undefined;
    return Boolean(
      movement
      && !movement.workerInFlight
      && movement.pendingQueueDepth === 0
      && movement.lastRequestedRasterKey
      && movement.lastAppliedRasterKey === movement.lastRequestedRasterKey,
    );
  }, undefined, { timeout: 30_000 });
}

async function downloadReport(page: Page): Promise<PerformanceReport> {
  const downloadPromise = page.waitForEvent('download');
  await page.evaluate(() => {
    const button = document.querySelector<HTMLElement>('[data-workspace-file-action="performance"]');
    if (!button) throw new Error('Performance report control is missing.');
    button.click();
  });
  const download = await downloadPromise;
  const downloadedPath = await download.path();
  if (!downloadedPath) throw new Error('Performance report download path is unavailable.');
  const { readFileSync } = await import('node:fs');
  return JSON.parse(readFileSync(downloadedPath, 'utf8')) as PerformanceReport;
}

function assertBuildIdentity(report: PerformanceReport): void {
  expect(report.version).toBe('performance-report-v4');
  expect(report.build?.performanceContractVersion).toBe('performance-report-v4');
  expect(report.build?.branch).toBe(EXPECTED_BRANCH);
  if (EXPECTED_SHA) expect(report.build?.commitSha).toBe(EXPECTED_SHA);
  expect(report.build?.buildId).toBeTruthy();
}

function summarizeSceneUpdates(report: PerformanceReport): { p95: number; max: number } {
  const end = report.samples.at(-1)?.tMs ?? 0;
  const values = report.samples
    .filter((sample) => sample.layerMode === 'danger' && sample.tMs >= end - REPORT_WINDOW_MS)
    .map((sample) => sample.sceneUpdateMs)
    .sort((left, right) => left - right);
  if (values.length === 0) return { p95: 0, max: 0 };
  return {
    p95: values[Math.min(values.length - 1, Math.ceil(values.length * 0.95) - 1)] ?? 0,
    max: values[values.length - 1] ?? 0,
  };
}

function requireMovement(snapshotValue: MovementSnapshot): MovementDiagnostics {
  if (!snapshotValue.awarenessMovement) {
    throw new Error('Awareness movement diagnostics are unavailable.');
  }
  return snapshotValue.awarenessMovement;
}

function requireSubjective(snapshotValue: MovementSnapshot): { x: number; y: number } {
  if (!snapshotValue.subjectiveThreatPosition) {
    throw new Error('Subjective threat position is unavailable.');
  }
  return snapshotValue.subjectiveThreatPosition;
}
