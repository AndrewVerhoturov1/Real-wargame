import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

interface MovementDiagnostics {
  worldRasterBuilds: number;
  ownMovementLocalUpdates: number;
  safePositionLocalScans: number;
  directionalBasisBuilds: number;
  workerThreatRelativeGeometryBuilds: number;
  workerDirectionalFieldBuilds: number;
  workerDirectionalBasisBuilds: number;
  workerAwarenessGeometryBuilds: number;
  workerAwarenessRescores: number;
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
  lastRequestedWorldKey: string;
  lastAppliedWorldKey: string;
  lastRequestedCanonicalThreatKey: string;
  lastAppliedCanonicalThreatKey: string;
  lastCompletedJobId: number;
  lastAppliedJobId: number;
  lastCompletedJobFinalExact: boolean;
  lastFinalRefreshLatencyMs: number;
  maxFinalRefreshLatencyMs: number;
  lastAppliedFieldIdentity: string;
  lastAppliedRasterDigest: string;
  lastWorkerError: string | null;
}

interface SafePositionSnapshot {
  position: { x: number; y: number };
  score: number;
  danger: number;
  expectedProtection: number;
  expectedProtectionAgainstThreat: number;
  protectedAgainstThreatId: string | null;
}

interface MovementSnapshot {
  scenario: string | null;
  simulationTimeSeconds: number;
  observerPosition: { x: number; y: number };
  hostilePosition: { x: number; y: number };
  subjectiveThreatPosition: { x: number; y: number } | null;
  subjectiveThreatVisibleNow: boolean | null;
  subjectiveThreatDirectionDegrees: number | null;
  subjectiveThreatRangeCells: number | null;
  tacticalKnowledgeRevision: number;
  observerMoving: boolean;
  hostileMoving: boolean;
  movingUnitCount: number;
  wallX: number | null;
  bestSafePosition: SafePositionSnapshot | null;
  protectedAgainstThreatId: string | null;
  markerUpdateCount: number;
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
  samples: Array<{ tMs: number; sceneUpdateMs: number; layerMode: string }>;
  longTasks: Array<{ startMs: number; durationMs: number }>;
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

const WORKER_GEOMETRY_COUNTERS = [
  'workerThreatRelativeGeometryBuilds',
  'workerDirectionalFieldBuilds',
  'workerDirectionalBasisBuilds',
  'workerAwarenessGeometryBuilds',
] as const;

test.describe.configure({ mode: 'serial' });

test('selected unit movement changes observer-relative memory but performs local-only updates', async ({ page }) => {
  await openHarness(page);
  await startScenarioPaused(page, 'selected-only');
  await waitForWorkerSettled(page);
  const before = await snapshot(page);
  const beforeMovement = requireMovement(before);
  expect(before.observerMoving).toBe(true);
  expect(before.subjectiveThreatDirectionDegrees).not.toBeNull();
  expect(before.subjectiveThreatRangeCells).not.toBeNull();

  await resumeSimulation(page);
  await page.waitForFunction((start) => {
    const current = window.__realWargameDangerMovementPerformance?.getSnapshot();
    return Boolean(current && Math.hypot(
      current.observerPosition.x - start.x,
      current.observerPosition.y - start.y,
    ) >= 5);
  }, before.observerPosition, { timeout: 15_000 });
  const after = await snapshot(page);
  const afterMovement = requireMovement(after);

  const observerRelativeMemoryChanged = angularDifference(
    after.subjectiveThreatDirectionDegrees ?? 0,
    before.subjectiveThreatDirectionDegrees ?? 0,
  ) > 0.5 || Math.abs(
    (after.subjectiveThreatRangeCells ?? 0) - (before.subjectiveThreatRangeCells ?? 0),
  ) > 0.1;
  expect(observerRelativeMemoryChanged).toBe(true);
  expect(after.lastRequestedCanonicalThreatKey).toBe(before.lastRequestedCanonicalThreatKey);
  expect(after.lastAppliedCanonicalThreatKey).toBe(before.lastAppliedCanonicalThreatKey);
  expect(after.lastRequestedWorldKey).toBe(before.lastRequestedWorldKey);
  expect(after.lastAppliedWorldKey).toBe(before.lastAppliedWorldKey);
  expect(after.lastAppliedRasterDigest).toBe(before.lastAppliedRasterDigest);
  expect(delta(afterMovement, beforeMovement, 'workerJobsStarted')).toBe(0);
  expect(delta(afterMovement, beforeMovement, 'worldRasterBuilds')).toBe(0);
  expect(delta(afterMovement, beforeMovement, 'mainThreadRasterSwaps')).toBe(0);
  for (const counter of WORKER_GEOMETRY_COUNTERS) {
    expect(delta(afterMovement, beforeMovement, counter), `${counter} must remain zero`).toBe(0);
  }
  expect(delta(afterMovement, beforeMovement, 'workerAwarenessRescores')).toBe(0);
  expect(delta(afterMovement, beforeMovement, 'directionalBasisBuilds')).toBe(0);
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
      observerRelativeMemoryChanged,
      workerJobsStartedDelta: delta(afterMovement, beforeMovement, 'workerJobsStarted'),
      workerThreatRelativeGeometryBuildDelta: delta(afterMovement, beforeMovement, 'workerThreatRelativeGeometryBuilds'),
      workerDirectionalFieldBuildDelta: delta(afterMovement, beforeMovement, 'workerDirectionalFieldBuilds'),
      workerDirectionalBasisBuildDelta: delta(afterMovement, beforeMovement, 'workerDirectionalBasisBuilds'),
      workerAwarenessGeometryBuildDelta: delta(afterMovement, beforeMovement, 'workerAwarenessGeometryBuilds'),
      workerAwarenessRescoreDelta: delta(afterMovement, beforeMovement, 'workerAwarenessRescores'),
      worldRasterBuildDelta: delta(afterMovement, beforeMovement, 'worldRasterBuilds'),
      mainThreadRasterSwapDelta: delta(afterMovement, beforeMovement, 'mainThreadRasterSwaps'),
      ownMovementLocalUpdateDelta: delta(afterMovement, beforeMovement, 'ownMovementLocalUpdates'),
      safePositionLocalScanDelta: delta(afterMovement, beforeMovement, 'safePositionLocalScans'),
      markerUpdateDelta: after.markerUpdateCount - before.markerUpdateCount,
      rasterDigestUnchanged: after.lastAppliedRasterDigest === before.lastAppliedRasterDigest,
      maxLocalUpdateMs: afterMovement.maxLocalUpdateMs,
    },
  });
  await stopScenario(page);
});

test('visible hostile movement changes canonical geometry through a bounded worker queue', async ({ page }) => {
  await openHarness(page);
  await startScenarioPaused(page, 'hostile-only');
  await waitForWorkerSettled(page);
  const before = await snapshot(page);
  const beforeMovement = requireMovement(before);
  const initialSubjective = requireSubjective(before);
  expect(before.hostileMoving).toBe(true);

  await resumeSimulation(page);
  await page.waitForFunction((initial) => {
    const current = window.__realWargameDangerMovementPerformance?.getSnapshot();
    const threat = current?.subjectiveThreatPosition;
    return Boolean(threat && Math.hypot(threat.x - initial.x, threat.y - initial.y) >= 2);
  }, initialSubjective, { timeout: 20_000 });
  const moving = await snapshot(page);
  const movingDiagnostics = requireMovement(moving);
  expect(movingDiagnostics.workerJobsStarted).toBeGreaterThan(beforeMovement.workerJobsStarted);
  expect(moving.lastRequestedCanonicalThreatKey).not.toBe(before.lastRequestedCanonicalThreatKey);
  expect(movingDiagnostics.maxPendingQueueDepth).toBeLessThanOrEqual(1);
  expect(movingDiagnostics.pendingQueueDepth).toBeLessThanOrEqual(1);
  expect(movingDiagnostics.maxMainThreadApplyMs).toBeLessThanOrEqual(5);
  expect(movingDiagnostics.lastWorkerError).toBeNull();

  await stopScenario(page);
  await page.waitForTimeout(250);
  await waitForWorkerSettled(page, beforeMovement.finalRefreshApplied + 1);
  const after = await snapshot(page);
  const afterMovement = requireMovement(after);
  expect(afterMovement.worldRasterBuilds).toBeGreaterThan(beforeMovement.worldRasterBuilds);
  expect(afterMovement.workerThreatRelativeGeometryBuilds).toBeGreaterThan(beforeMovement.workerThreatRelativeGeometryBuilds);
  expect(afterMovement.workerDirectionalFieldBuilds).toBeGreaterThan(beforeMovement.workerDirectionalFieldBuilds);
  expect(afterMovement.workerAwarenessGeometryBuilds).toBeGreaterThanOrEqual(beforeMovement.workerAwarenessGeometryBuilds);
  expect(afterMovement.workerAwarenessRescores).toBeGreaterThan(beforeMovement.workerAwarenessRescores);
  expect(afterMovement.workerDirectionalBasisBuilds).toBe(beforeMovement.workerDirectionalBasisBuilds);
  assertFinalApplied(after, afterMovement);
  expect(after.lastAppliedRasterDigest).not.toBe(before.lastAppliedRasterDigest);

  scenarioEvidence.push({
    scenario: 'hostile-only',
    before,
    after,
    counters: {
      workerJobsStartedDelta: delta(afterMovement, beforeMovement, 'workerJobsStarted'),
      workerJobsCompletedDelta: delta(afterMovement, beforeMovement, 'workerJobsCompleted'),
      worldRasterBuildDelta: delta(afterMovement, beforeMovement, 'worldRasterBuilds'),
      workerThreatRelativeGeometryBuildDelta: delta(afterMovement, beforeMovement, 'workerThreatRelativeGeometryBuilds'),
      workerDirectionalFieldBuildDelta: delta(afterMovement, beforeMovement, 'workerDirectionalFieldBuilds'),
      workerDirectionalBasisBuildDelta: delta(afterMovement, beforeMovement, 'workerDirectionalBasisBuilds'),
      workerAwarenessGeometryBuildDelta: delta(afterMovement, beforeMovement, 'workerAwarenessGeometryBuilds'),
      workerAwarenessRescoreDelta: delta(afterMovement, beforeMovement, 'workerAwarenessRescores'),
      workerJobsCoalescedDelta: delta(afterMovement, beforeMovement, 'workerJobsCoalesced'),
      staleDroppedDelta: delta(afterMovement, beforeMovement, 'workerResultsStaleDropped'),
      maxPendingQueueDepth: afterMovement.maxPendingQueueDepth,
      maxMainThreadApplyMs: afterMovement.maxMainThreadApplyMs,
      maxWorkerComputeMs: afterMovement.maxWorkerComputeMs,
      maxWorkerLatencyMs: afterMovement.maxWorkerLatencyMs,
      lastFinalRefreshLatencyMs: afterMovement.lastFinalRefreshLatencyMs,
      finalWorldKeyApplied: after.lastAppliedWorldKey === after.lastRequestedWorldKey,
      finalCanonicalKeyApplied: after.lastAppliedCanonicalThreatKey === after.lastRequestedCanonicalThreatKey,
      finalJobApplied: afterMovement.lastAppliedJobId === afterMovement.lastCompletedJobId,
    },
  });
});

test('six moving units remain bounded and apply the final canonical snapshot', async ({ page }) => {
  await openHarness(page);
  await startScenarioPaused(page, 'both');
  await waitForWorkerSettled(page);
  const before = await snapshot(page);
  const beforeMovement = requireMovement(before);
  expect(before.movingUnitCount).toBeGreaterThanOrEqual(6);

  await resumeSimulation(page);
  await page.waitForFunction((initial) => {
    const current = window.__realWargameDangerMovementPerformance?.getSnapshot();
    if (!current || !initial.subjectiveThreatPosition || !current.subjectiveThreatPosition) return false;
    const friendlyDistance = Math.hypot(
      current.observerPosition.x - initial.observerPosition.x,
      current.observerPosition.y - initial.observerPosition.y,
    );
    const hostileDistance = Math.hypot(
      current.hostilePosition.x - initial.hostilePosition.x,
      current.hostilePosition.y - initial.hostilePosition.y,
    );
    const subjectiveDistance = Math.hypot(
      current.subjectiveThreatPosition.x - initial.subjectiveThreatPosition.x,
      current.subjectiveThreatPosition.y - initial.subjectiveThreatPosition.y,
    );
    return friendlyDistance >= 4 && hostileDistance >= 4 && subjectiveDistance >= 2;
  }, before, { timeout: 25_000 });

  await stopScenario(page);
  await page.waitForTimeout(250);
  await waitForWorkerSettled(page, beforeMovement.finalRefreshApplied + 1);
  const after = await snapshot(page);
  const movement = requireMovement(after);
  expect(movement.workerJobsStarted).toBeGreaterThan(beforeMovement.workerJobsStarted);
  expect(movement.ownMovementLocalUpdates).toBeGreaterThan(beforeMovement.ownMovementLocalUpdates);
  expect(movement.maxPendingQueueDepth).toBeLessThanOrEqual(1);
  expect(movement.pendingQueueDepth).toBe(0);
  expect(movement.workerInFlight).toBe(false);
  assertFinalApplied(after, movement);
  expect(movement.lastWorkerError).toBeNull();

  scenarioEvidence.push({
    scenario: 'both-six-units',
    before,
    after,
    counters: {
      movingUnitCount: before.movingUnitCount,
      workerJobsStartedDelta: delta(movement, beforeMovement, 'workerJobsStarted'),
      worldRasterBuildDelta: delta(movement, beforeMovement, 'worldRasterBuilds'),
      ownMovementLocalUpdateDelta: delta(movement, beforeMovement, 'ownMovementLocalUpdates'),
      maxPendingQueueDepth: movement.maxPendingQueueDepth,
      finalWorldKeyApplied: after.lastAppliedWorldKey === after.lastRequestedWorldKey,
      finalCanonicalKeyApplied: after.lastAppliedCanonicalThreatKey === after.lastRequestedCanonicalThreatKey,
    },
  });
});

test('hidden hostile objective movement cannot change the canonical worker field', async ({ page }) => {
  await openHarness(page);
  await startScenarioPaused(page, 'hidden-hostile');
  await waitForWorkerSettled(page);
  const before = await snapshot(page);
  const initialObjective = before.hostilePosition;
  const initialSubjective = requireSubjective(before);
  const beforeMovement = requireMovement(before);
  expect(before.hostileMoving).toBe(true);

  await resumeSimulation(page);
  await page.waitForFunction((initial) => {
    const current = window.__realWargameDangerMovementPerformance?.getSnapshot();
    return Boolean(current && Math.hypot(
      current.hostilePosition.x - initial.x,
      current.hostilePosition.y - initial.y,
    ) >= 3);
  }, initialObjective, { timeout: 12_000 });
  const after = await snapshot(page);
  const afterSubjective = requireSubjective(after);
  const afterMovement = requireMovement(after);
  const subjectiveDistance = Math.hypot(
    afterSubjective.x - initialSubjective.x,
    afterSubjective.y - initialSubjective.y,
  );

  expect(subjectiveDistance).toBeLessThan(0.2);
  expect(after.lastRequestedCanonicalThreatKey).toBe(before.lastRequestedCanonicalThreatKey);
  expect(after.lastAppliedCanonicalThreatKey).toBe(before.lastAppliedCanonicalThreatKey);
  expect(after.lastRequestedWorldKey).toBe(before.lastRequestedWorldKey);
  expect(after.lastAppliedWorldKey).toBe(before.lastAppliedWorldKey);
  expect(after.lastAppliedRasterDigest).toBe(before.lastAppliedRasterDigest);
  expect(delta(afterMovement, beforeMovement, 'workerJobsStarted')).toBe(0);
  expect(delta(afterMovement, beforeMovement, 'worldRasterBuilds')).toBe(0);
  expect(delta(afterMovement, beforeMovement, 'mainThreadRasterSwaps')).toBe(0);
  for (const counter of WORKER_GEOMETRY_COUNTERS) {
    expect(delta(afterMovement, beforeMovement, counter), `${counter} must remain zero`).toBe(0);
  }
  expect(delta(afterMovement, beforeMovement, 'workerAwarenessRescores')).toBe(0);
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
      workerJobsStartedDelta: delta(afterMovement, beforeMovement, 'workerJobsStarted'),
      worldRasterBuildDelta: delta(afterMovement, beforeMovement, 'worldRasterBuilds'),
      workerThreatRelativeGeometryBuildDelta: delta(afterMovement, beforeMovement, 'workerThreatRelativeGeometryBuilds'),
      workerDirectionalFieldBuildDelta: delta(afterMovement, beforeMovement, 'workerDirectionalFieldBuilds'),
      workerDirectionalBasisBuildDelta: delta(afterMovement, beforeMovement, 'workerDirectionalBasisBuilds'),
      workerAwarenessGeometryBuildDelta: delta(afterMovement, beforeMovement, 'workerAwarenessGeometryBuilds'),
      rasterDigestUnchanged: after.lastAppliedRasterDigest === before.lastAppliedRasterDigest,
    },
  });
  await stopScenario(page);
});

test('wall crossing proves the applied async winner flips to the protected side', async ({ page }) => {
  await openHarness(page);
  await startScenarioPaused(page, 'wall-crossing');
  await waitForWorkerSettled(page);
  const before = await snapshot(page);
  const beforeMovement = requireMovement(before);
  const wallX = requireWallX(before);
  const beforeThreat = requireSubjective(before);
  const beforeWinner = requireWinner(before);
  expect(before.hostileMoving).toBe(true);
  expect(before.subjectiveThreatVisibleNow).toBe(true);
  expect(beforeThreat.x).toBeGreaterThan(wallX + 2);
  expect(beforeWinner.position.x).toBeLessThan(wallX);
  expect(before.protectedAgainstThreatId).not.toBeNull();
  assertFinalApplied(before, beforeMovement);

  await resumeSimulation(page);
  await page.waitForFunction((wall) => {
    const current = window.__realWargameDangerMovementPerformance?.getSnapshot();
    return Boolean(
      current
      && current.hostilePosition.x < wall - 2
      && current.subjectiveThreatPosition
      && current.subjectiveThreatPosition.x < wall - 2,
    );
  }, wallX, { timeout: 25_000 });
  await stopScenario(page);
  await page.waitForTimeout(250);
  await waitForWorkerSettled(page, beforeMovement.finalRefreshApplied + 1);
  const after = await snapshot(page);
  const movement = requireMovement(after);
  const afterThreat = requireSubjective(after);
  const afterWinner = requireWinner(after);

  expect(after.subjectiveThreatVisibleNow).toBe(true);
  expect(afterThreat.x).toBeLessThan(wallX - 2);
  expect(afterWinner.position.x).toBeGreaterThan(wallX);
  expect(after.bestSafePosition).not.toEqual(before.bestSafePosition);
  expect(after.protectedAgainstThreatId).toBe(before.protectedAgainstThreatId);
  expect(after.protectedAgainstThreatId).not.toBeNull();
  expect(after.lastAppliedRasterDigest).not.toBe(before.lastAppliedRasterDigest);
  expect(after.lastAppliedFieldIdentity).not.toBe(before.lastAppliedFieldIdentity);
  expect(movement.maxPendingQueueDepth).toBeLessThanOrEqual(1);
  assertFinalApplied(after, movement);
  expect(movement.lastWorkerError).toBeNull();

  const report = await downloadReport(page);
  assertBuildIdentity(report);
  const sceneStats = summarizeSceneUpdates(report);
  expect(sceneStats.p95).toBeLessThanOrEqual(10);
  expect(sceneStats.max).toBeLessThanOrEqual(50);
  const recentLongTasks = longTasksInReportWindow(report);
  expect(recentLongTasks.filter((task) => task.durationMs > 100)).toEqual([]);
  const reportMovement = report.computation?.awarenessMovement;
  expect(reportMovement).toBeTruthy();
  expect(reportMovement?.maxPendingQueueDepth).toBeLessThanOrEqual(1);
  expect(reportMovement?.maxMainThreadApplyMs).toBeLessThanOrEqual(5);
  expect(reportMovement?.maxLocalUpdateMs).toBeLessThanOrEqual(10);
  expect(reportMovement?.lastAppliedWorldKey).toBe(reportMovement?.lastRequestedWorldKey);
  expect(reportMovement?.lastAppliedCanonicalThreatKey).toBe(reportMovement?.lastRequestedCanonicalThreatKey);

  scenarioEvidence.push({
    scenario: 'wall-crossing',
    before,
    after,
    counters: {
      wallX,
      initialThreatSide: 'east',
      initialWinnerSide: 'west-protected',
      finalThreatSide: 'west',
      finalWinnerSide: 'east-protected',
      winnerChanged: JSON.stringify(after.bestSafePosition) !== JSON.stringify(before.bestSafePosition),
      protectedAgainstThreatId: after.protectedAgainstThreatId,
      staleDropped: movement.workerResultsStaleDropped,
      maxPendingQueueDepth: movement.maxPendingQueueDepth,
      finalWorldKeyApplied: after.lastAppliedWorldKey === after.lastRequestedWorldKey,
      finalCanonicalKeyApplied: after.lastAppliedCanonicalThreatKey === after.lastRequestedCanonicalThreatKey,
      finalFieldIdentity: after.lastAppliedFieldIdentity,
      finalRasterDigest: after.lastAppliedRasterDigest,
    },
  });

  const evidence = {
    version: 'danger-layer-movement-evidence-v2',
    generatedAt: new Date().toISOString(),
    build: report.build ?? null,
    sceneUpdateMs: sceneStats,
    dangerWindowLongTasks: recentLongTasks,
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
  await setSimulationPaused(page, true);
  return page.evaluate((name) => {
    const api = window.__realWargameDangerMovementPerformance;
    if (!api) throw new Error('Danger movement performance API is unavailable.');
    return api.startScenario(name as never) as MovementSnapshot;
  }, scenario);
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

function assertFinalApplied(snapshotValue: MovementSnapshot, movement: MovementDiagnostics): void {
  expect(snapshotValue.lastAppliedWorldKey).toBe(snapshotValue.lastRequestedWorldKey);
  expect(snapshotValue.lastAppliedCanonicalThreatKey).toBe(snapshotValue.lastRequestedCanonicalThreatKey);
  expect(snapshotValue.lastAppliedFieldIdentity).toBeTruthy();
  expect(snapshotValue.lastAppliedRasterDigest).toBeTruthy();
  expect(snapshotValue.lastAppliedJobId).toBe(movement.lastAppliedJobId);
  expect(movement.lastAppliedWorldKey).toBe(movement.lastRequestedWorldKey);
  expect(movement.lastAppliedCanonicalThreatKey).toBe(movement.lastRequestedCanonicalThreatKey);
  expect(movement.lastAppliedJobId).toBe(movement.lastCompletedJobId);
  expect(movement.lastCompletedJobFinalExact).toBe(true);
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

function longTasksInReportWindow(report: PerformanceReport): Array<{ startMs: number; durationMs: number }> {
  const end = report.samples.at(-1)?.tMs ?? 0;
  return report.longTasks.filter((task) => task.startMs >= end - REPORT_WINDOW_MS);
}

function requireMovement(snapshotValue: MovementSnapshot): MovementDiagnostics {
  if (!snapshotValue.awarenessMovement) throw new Error('Awareness movement diagnostics are unavailable.');
  return snapshotValue.awarenessMovement;
}

function requireSubjective(snapshotValue: MovementSnapshot): { x: number; y: number } {
  if (!snapshotValue.subjectiveThreatPosition) throw new Error('Subjective threat position is unavailable.');
  return snapshotValue.subjectiveThreatPosition;
}

function requireWinner(snapshotValue: MovementSnapshot): SafePositionSnapshot {
  if (!snapshotValue.bestSafePosition) throw new Error('Renderer-local safe winner is unavailable.');
  return snapshotValue.bestSafePosition;
}

function requireWallX(snapshotValue: MovementSnapshot): number {
  if (snapshotValue.wallX === null) throw new Error('Wall geometry is unavailable.');
  return snapshotValue.wallX;
}

function delta(
  after: MovementDiagnostics,
  before: MovementDiagnostics,
  key: keyof MovementDiagnostics,
): number {
  const afterValue = after[key];
  const beforeValue = before[key];
  if (typeof afterValue !== 'number' || typeof beforeValue !== 'number') {
    throw new Error(`Counter ${String(key)} is not numeric.`);
  }
  return afterValue - beforeValue;
}

function angularDifference(left: number, right: number): number {
  const normalizedLeft = ((left % 360) + 360) % 360;
  const normalizedRight = ((right % 360) + 360) % 360;
  const difference = Math.abs(normalizedLeft - normalizedRight);
  return Math.min(difference, 360 - difference);
}
