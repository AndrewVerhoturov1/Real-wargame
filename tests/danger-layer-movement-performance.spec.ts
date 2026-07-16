import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

interface MovementDiagnostics {
  worldRasterBuilds: number;
  ownMovementLocalUpdates: number;
  safePositionLocalScans: number;
  safePositionCellsScanned: number;
  directionalBasisBuilds: number;
  workerThreatRelativeGeometryBuilds: number;
  workerDirectionalFieldBuilds: number;
  workerDirectionalBasisBuilds: number;
  workerAwarenessGeometryBuilds: number;
  workerAwarenessRescores: number;
  workerJobsStarted: number;
  workerJobsCompleted: number;
  workerJobsCancelled: number;
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

interface LongTaskAttributionEntry {
  name: string;
  containerType: string;
  containerName: string;
  containerId: string;
  containerSrc: string;
}

interface BrowserLongTask {
  startMs: number;
  durationMs: number;
  scenario?: string | null;
  attribution?: LongTaskAttributionEntry[];
}

interface LongAnimationFrameScript {
  invoker: string;
  invokerType: string;
  sourceUrl: string;
  sourceFunctionName: string;
  charPosition: number;
  durationMs: number;
  forcedStyleAndLayoutDurationMs: number;
  pauseDurationMs: number;
  windowAttribution: string;
}

interface LongAnimationFrame {
  startMs: number;
  durationMs: number;
  blockingDurationMs: number;
  renderStartMs: number | null;
  styleAndLayoutStartMs: number | null;
  firstUiEventTimestampMs: number | null;
  scenario?: string | null;
  scripts: LongAnimationFrameScript[];
}

interface PhaseMeasure {
  name: string;
  startMs: number;
  durationMs: number;
}

interface PerformanceReport {
  version: string;
  build?: {
    branch?: string;
    commitSha?: string;
    buildId?: string;
    performanceContractVersion?: string;
  };
  browser?: {
    performanceObserverSupportedEntryTypes?: string[];
  };
  samples: Array<{ tMs: number; sceneUpdateMs: number; layerMode: string }>;
  longTasks: BrowserLongTask[];
  longAnimationFrames?: LongAnimationFrame[];
  performancePhaseMeasures?: PhaseMeasure[];
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

interface Stats {
  count: number;
  last: number;
  max: number;
  p95: number;
}

interface ProductionPhaseEvidence extends Stats {
  source: string;
}

interface ClassifiedLongTask extends BrowserLongTask {
  overlappingProductionPhases: string[];
  productionOverlapDurationMs: number;
  applicationScriptDurationMs: number;
  dangerScriptDurationMs: number;
  workerResponseScriptDurationMs: number;
  unaccountedDurationMs: number;
  classification: 'danger-attributed' | 'application-attributed' | 'browser-rendering-or-runner' | 'unattributed';
  reason: string;
}

interface LongTaskAttributionEvidence {
  supportedEntryTypes: string[];
  globalLongTasks: ClassifiedLongTask[];
  dangerAttributedLongTasks: ClassifiedLongTask[];
  applicationAttributedLongTasks: ClassifiedLongTask[];
  diagnosticOnlyLongTasks: ClassifiedLongTask[];
  unattributedLongTasks: ClassifiedLongTask[];
  productionPhases: Record<string, ProductionPhaseEvidence>;
  productionPhaseMaxMs: Record<string, number>;
  blockingContractPassed: boolean;
  blockingFailures: string[];
  interpretation: string;
}

const EXPECTED_BRANCH = process.env.DANGER_PERF_EXPECTED_BRANCH
  ?? 'agent/danger-layer-moving-units-performance';
const EXPECTED_SHA = process.env.DANGER_PERF_EXPECTED_SHA ?? '';
const EVIDENCE_PATH = process.env.DANGER_MOVEMENT_PERF_OUTPUT
  ?? path.join('artifacts', 'performance', 'danger-layer-movement-performance.json');
const REPORT_WINDOW_MS = 8_000;
const LONG_TASK_THRESHOLD_MS = 100;
const SCENE_P95_LIMIT_MS = 10;
const SCENE_MAX_LIMIT_MS = 50;
const RASTER_APPLY_LIMIT_MS = 5;
const LOCAL_UPDATE_LIMIT_MS = 10;
const WORKER_RESPONSE_LIMIT_MS = 5;
const APPLICATION_SCRIPT_LIMIT_MS = 50;
const scenarioEvidence: ScenarioEvidence[] = [];

const WORKER_GEOMETRY_COUNTERS = [
  'workerThreatRelativeGeometryBuilds',
  'workerDirectionalFieldBuilds',
  'workerDirectionalBasisBuilds',
  'workerAwarenessGeometryBuilds',
] as const;

test.describe.configure({ mode: 'serial' });

test('selected unit movement preserves world-space threat memory and performs local-only updates', async ({ page }) => {
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

  const beforeThreatPosition = before.subjectiveThreatPosition;
  const afterThreatPosition = after.subjectiveThreatPosition;
  const worldSpaceMemoryStable = Boolean(
    beforeThreatPosition
    && afterThreatPosition
    && Math.hypot(
      afterThreatPosition.x - beforeThreatPosition.x,
      afterThreatPosition.y - beforeThreatPosition.y,
    ) <= 0.001,
  );
  expect(worldSpaceMemoryStable, JSON.stringify({ before, after })).toBe(true);
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
  expect(afterMovement.maxLocalUpdateMs).toBeLessThanOrEqual(LOCAL_UPDATE_LIMIT_MS);
  expect(afterMovement.lastWorkerError).toBeNull();

  scenarioEvidence.push({
    scenario: 'selected-only',
    before,
    after,
    counters: {
      worldSpaceMemoryStable,
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
  expect(movingDiagnostics.maxMainThreadApplyMs).toBeLessThanOrEqual(RASTER_APPLY_LIMIT_MS);
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
  expect(afterMovement.workerAwarenessRescores).toBeGreaterThanOrEqual(beforeMovement.workerAwarenessRescores);
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
      finalJobApplied: movement.lastAppliedJobId === movement.lastCompletedJobId,
      finalFieldIdentity: after.lastAppliedFieldIdentity,
      finalRasterDigest: after.lastAppliedRasterDigest,
    },
  });

  const downloaded = await downloadReport(page);
  const report = downloaded.report;
  assertBuildIdentity(report);
  const sceneStats = summarizeSceneUpdates(report);
  expect(sceneStats.p95).toBeLessThanOrEqual(SCENE_P95_LIMIT_MS);
  expect(sceneStats.max).toBeLessThanOrEqual(SCENE_MAX_LIMIT_MS);
  const reportMovement = report.computation?.awarenessMovement;
  expect(reportMovement).toBeTruthy();
  expect(reportMovement?.maxPendingQueueDepth).toBeLessThanOrEqual(1);
  expect(reportMovement?.maxMainThreadApplyMs).toBeLessThanOrEqual(RASTER_APPLY_LIMIT_MS);
  expect(reportMovement?.maxLocalUpdateMs).toBeLessThanOrEqual(LOCAL_UPDATE_LIMIT_MS);
  expect(reportMovement?.lastAppliedWorldKey).toBe(reportMovement?.lastRequestedWorldKey);
  expect(reportMovement?.lastAppliedCanonicalThreatKey).toBe(reportMovement?.lastRequestedCanonicalThreatKey);
  expect(reportMovement?.lastAppliedJobId).toBe(reportMovement?.lastCompletedJobId);
  expect(reportMovement?.lastWorkerError).toBeNull();

  const attribution = buildLongTaskAttribution(
    report,
    reportMovement ?? movement,
    after,
    downloaded.exportTriggerMs,
  );
  const evidence = {
    version: 'danger-layer-movement-evidence-v3',
    generatedAt: new Date().toISOString(),
    build: report.build ?? null,
    sceneUpdateMs: sceneStats,
    finalMovementDiagnostics: reportMovement ?? null,
    longTaskAttribution: attribution,
    scenarios: scenarioEvidence,
  };
  mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(evidence, null, 2));
});

async function openHarness(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as Window & { __realWargamePerformanceScenario?: string | null }).__realWargamePerformanceScenario = null;
  });
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
    (window as Window & { __realWargamePerformanceScenario?: string | null }).__realWargamePerformanceScenario = name;
    const startedAt = performance.now();
    try {
      return api.startScenario(name as never) as MovementSnapshot;
    } finally {
      performance.measure(`real-wargame.phase.${name}.scenario-setup`, {
        start: startedAt,
        end: performance.now(),
      });
    }
  }, scenario);
}

async function resumeSimulation(page: Page): Promise<void> {
  await setSimulationPaused(page, false);
}

async function setSimulationPaused(page: Page, paused: boolean): Promise<void> {
  await page.evaluate((desired) => {
    const button = document.querySelector<HTMLButtonElement>('#pause-toggle');
    if (!button) throw new Error('Pause toggle is unavailable.');
    const scenario = (window as Window & { __realWargamePerformanceScenario?: string | null }).__realWargamePerformanceScenario ?? 'none';
    const startedAt = performance.now();
    button.click();
    if ((button.getAttribute('aria-pressed') === 'true') !== desired) button.click();
    performance.measure(`real-wargame.phase.${scenario}.pause-toggle`, {
      start: startedAt,
      end: performance.now(),
    });
  }, paused);
  await expect(page.locator('#pause-toggle')).toHaveAttribute('aria-pressed', String(paused));
}

async function stopScenario(page: Page): Promise<MovementSnapshot> {
  return page.evaluate(() => {
    const api = window.__realWargameDangerMovementPerformance;
    if (!api) throw new Error('Danger movement performance API is unavailable.');
    const scenario = (window as Window & { __realWargamePerformanceScenario?: string | null }).__realWargamePerformanceScenario ?? 'none';
    const startedAt = performance.now();
    try {
      return api.stopScenario() as MovementSnapshot;
    } finally {
      performance.measure(`real-wargame.phase.${scenario}.scenario-stop`, {
        start: startedAt,
        end: performance.now(),
      });
    }
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

async function downloadReport(page: Page): Promise<{ report: PerformanceReport; exportTriggerMs: number }> {
  const downloadPromise = page.waitForEvent('download');
  const exportTriggerMs = await page.evaluate(() => {
    const button = document.querySelector<HTMLElement>('[data-workspace-file-action="performance"]');
    if (!button) throw new Error('Performance report control is missing.');
    const scenario = (window as Window & { __realWargamePerformanceScenario?: string | null }).__realWargamePerformanceScenario ?? 'none';
    const startedAt = performance.now();
    button.click();
    const duration = performance.now() - startedAt;
    performance.measure(`real-wargame.phase.${scenario}.report-export`, {
      start: startedAt,
      end: performance.now(),
    });
    return duration;
  });
  const download = await downloadPromise;
  const downloadedPath = await download.path();
  if (!downloadedPath) throw new Error('Performance report download path is unavailable.');
  return {
    report: JSON.parse(readFileSync(downloadedPath, 'utf8')) as PerformanceReport,
    exportTriggerMs,
  };
}

function buildLongTaskAttribution(
  report: PerformanceReport,
  movement: MovementDiagnostics,
  finalSnapshot: MovementSnapshot,
  exportTriggerMs: number,
): LongTaskAttributionEvidence {
  const end = report.samples.at(-1)?.tMs ?? 0;
  const start = Math.max(0, end - REPORT_WINDOW_MS);
  const longTasks = report.longTasks.filter((task) => overlaps(task.startMs, task.durationMs, start, end - start));
  const loafs = (report.longAnimationFrames ?? []).filter((frame) => overlaps(frame.startMs, frame.durationMs, start, end - start));
  const measures = (report.performancePhaseMeasures ?? []).filter((measure) => overlaps(measure.startMs, measure.durationMs, start, end - start));
  const sceneSamples = report.samples.filter((sample) => sample.layerMode === 'danger' && sample.tMs >= start && sample.tMs <= end);
  const sceneIntervals = sceneSamples.map((sample) => ({
    name: 'scene-update',
    startMs: sample.tMs - sample.sceneUpdateMs,
    durationMs: sample.sceneUpdateMs,
  }));
  const workerResponseScripts = loafs.flatMap((frame) => frame.scripts.filter(isWorkerResponseScript).map((script) => script.durationMs));
  const markerScripts = loafs.flatMap((frame) => frame.scripts.filter((script) => /updateMarkers|drawSafePositionMarkers/i.test(scriptIdentity(script))).map((script) => script.durationMs));
  const applicationScripts = loafs.flatMap((frame) => frame.scripts.filter(isApplicationScript).map((script) => script.durationMs));
  const dangerScripts = loafs.flatMap((frame) => frame.scripts.filter(isDangerScript).map((script) => script.durationMs));
  const conservativeWorkerResponseMax = Math.max(
    stats(workerResponseScripts).max,
    movement.maxMainThreadApplyMs + movement.maxLocalUpdateMs,
  );
  const scenarioSetup = stats(measures.filter((measure) => measure.name.endsWith('.scenario-setup')).map((measure) => measure.durationMs));
  const scenarioStop = stats(measures.filter((measure) => measure.name.endsWith('.scenario-stop')).map((measure) => measure.durationMs));
  const pauseToggle = stats(measures.filter((measure) => measure.name.endsWith('.pause-toggle')).map((measure) => measure.durationMs));
  const sceneUpdate = stats(sceneSamples.map((sample) => sample.sceneUpdateMs));
  const productionPhases: Record<string, ProductionPhaseEvidence> = {
    simulationAndSceneUpdate: { ...sceneUpdate, source: 'performance-report frame samples; SimulationTick runs immediately before the measured scene update in the production ticker' },
    workerResponseMainThreadHandling: {
      ...stats(workerResponseScripts.length > 0 ? workerResponseScripts : [conservativeWorkerResponseMax]),
      max: conservativeWorkerResponseMax,
      source: workerResponseScripts.length > 0
        ? 'Long Animation Frame script attribution plus conservative raster/local aggregate'
        : 'conservative raster-apply plus renderer-local aggregate; no matching LoAF script was emitted',
    },
    typedArrayApplyAndBaseTextureUpdate: {
      count: movement.mainThreadRasterSwaps,
      last: movement.lastMainThreadApplyMs,
      max: movement.maxMainThreadApplyMs,
      p95: movement.maxMainThreadApplyMs,
      source: 'production AwarenessMovementDiagnostics applyRaster timing',
    },
    rendererLocalSafePositionAndRouteEvaluation: {
      count: movement.safePositionLocalScans,
      last: movement.lastLocalUpdateMs,
      max: movement.maxLocalUpdateMs,
      p95: movement.maxLocalUpdateMs,
      source: 'production AwarenessMovementDiagnostics updateLocalDerived timing',
    },
    markerRedraw: {
      ...stats(markerScripts),
      count: Math.max(stats(markerScripts).count, finalSnapshot.markerUpdateCount),
      source: markerScripts.length > 0
        ? 'Long Animation Frame script attribution'
        : 'marker count is production diagnostics; duration remains included in sceneUpdate',
    },
    wallFixtureSetupAndNavigationGrid: { ...scenarioSetup, source: 'browser User Timing around production startScenario fixture setup' },
    scenarioStop: { ...scenarioStop, source: 'browser User Timing around production stopScenario' },
    pauseToggle: { ...pauseToggle, source: 'browser User Timing around pause control dispatch' },
    performanceReportSerializationAndDownloadTrigger: {
      count: 1,
      last: roundTwo(exportTriggerMs),
      max: roundTwo(exportTriggerMs),
      p95: roundTwo(exportTriggerMs),
      source: 'synchronous browser duration of report build, JSON.stringify, Blob creation and download click',
    },
    applicationScriptsInLongAnimationFrames: { ...stats(applicationScripts), source: 'Long Animation Frame script attribution for application source URLs' },
    dangerScriptsInLongAnimationFrames: { ...stats(dangerScripts), source: 'Long Animation Frame script attribution for awareness/danger source URLs or functions' },
  };

  const classified = longTasks.map((task): ClassifiedLongTask => {
    const overlappingLoafs = loafs.filter((frame) => overlaps(task.startMs, task.durationMs, frame.startMs, frame.durationMs));
    const overlappingMeasures = measures.filter((measure) => overlaps(task.startMs, task.durationMs, measure.startMs, measure.durationMs));
    const overlappingScenes = sceneIntervals.filter((phase) => overlaps(task.startMs, task.durationMs, phase.startMs, phase.durationMs));
    const scripts = overlappingLoafs.flatMap((frame) => frame.scripts);
    const appScriptDuration = sum(scripts.filter(isApplicationScript).map((script) => script.durationMs));
    const dangerScriptDuration = sum(scripts.filter(isDangerScript).map((script) => script.durationMs));
    const workerResponseDuration = max(scripts.filter(isWorkerResponseScript).map((script) => script.durationMs));
    const sceneOverlapDuration = sum(overlappingScenes.map((phase) => intervalOverlap(
      task.startMs,
      task.durationMs,
      phase.startMs,
      phase.durationMs,
    )));
    const measureOverlapDuration = sum(overlappingMeasures.map((measure) => intervalOverlap(
      task.startMs,
      task.durationMs,
      measure.startMs,
      measure.durationMs,
    )));
    const productionOverlapDuration = Math.min(
      task.durationMs,
      sceneOverlapDuration + appScriptDuration + measureOverlapDuration,
    );
    const unaccountedDuration = Math.max(0, task.durationMs - productionOverlapDuration);
    const phaseNames = [
      ...overlappingScenes.map((phase) => phase.name),
      ...overlappingMeasures.map((measure) => measure.name),
      ...scripts.filter(isDangerScript).map((script) => `script:${scriptIdentity(script)}`),
    ];
    let classification: ClassifiedLongTask['classification'];
    let reason: string;
    if (workerResponseDuration > WORKER_RESPONSE_LIMIT_MS || dangerScriptDuration > APPLICATION_SCRIPT_LIMIT_MS) {
      classification = 'danger-attributed';
      reason = `danger/worker script duration exceeded contract (${roundTwo(dangerScriptDuration)} ms danger, ${roundTwo(workerResponseDuration)} ms worker response)`;
    } else if (appScriptDuration > APPLICATION_SCRIPT_LIMIT_MS) {
      classification = 'application-attributed';
      reason = `application script attribution exceeded ${APPLICATION_SCRIPT_LIMIT_MS} ms (${roundTwo(appScriptDuration)} ms)`;
    } else if (overlappingLoafs.length > 0 && unaccountedDuration >= task.durationMs * 0.8) {
      classification = 'browser-rendering-or-runner';
      reason = `LoAF attribution leaves ${roundTwo(unaccountedDuration)} of ${task.durationMs} ms outside instrumented application script/phase work`;
    } else {
      classification = 'unattributed';
      reason = overlappingLoafs.length === 0
        ? 'no overlapping Long Animation Frame attribution was available'
        : 'attribution was insufficient to prove browser/rendering noise or bounded application work';
    }
    return {
      ...task,
      overlappingProductionPhases: [...new Set(phaseNames)],
      productionOverlapDurationMs: roundTwo(productionOverlapDuration),
      applicationScriptDurationMs: roundTwo(appScriptDuration),
      dangerScriptDurationMs: roundTwo(dangerScriptDuration),
      workerResponseScriptDurationMs: roundTwo(workerResponseDuration),
      unaccountedDurationMs: roundTwo(unaccountedDuration),
      classification,
      reason,
    };
  });

  const globalLongTasks = classified.filter((task) => task.durationMs > LONG_TASK_THRESHOLD_MS);
  const dangerAttributedLongTasks = globalLongTasks.filter((task) => task.classification === 'danger-attributed');
  const applicationAttributedLongTasks = globalLongTasks.filter((task) => task.classification === 'application-attributed');
  const diagnosticOnlyLongTasks = globalLongTasks.filter((task) => task.classification === 'browser-rendering-or-runner');
  const unattributedLongTasks = globalLongTasks.filter((task) => task.classification === 'unattributed');
  const productionPhaseMaxMs = Object.fromEntries(
    Object.entries(productionPhases).map(([name, phase]) => [name, phase.max]),
  );
  const blockingFailures: string[] = [];
  if (sceneUpdate.p95 > SCENE_P95_LIMIT_MS) blockingFailures.push(`sceneUpdate p95 ${sceneUpdate.p95} > ${SCENE_P95_LIMIT_MS}`);
  if (sceneUpdate.max > SCENE_MAX_LIMIT_MS) blockingFailures.push(`sceneUpdate max ${sceneUpdate.max} > ${SCENE_MAX_LIMIT_MS}`);
  if (movement.maxMainThreadApplyMs > RASTER_APPLY_LIMIT_MS) blockingFailures.push(`raster apply max ${movement.maxMainThreadApplyMs} > ${RASTER_APPLY_LIMIT_MS}`);
  if (movement.maxLocalUpdateMs > LOCAL_UPDATE_LIMIT_MS) blockingFailures.push(`renderer-local update max ${movement.maxLocalUpdateMs} > ${LOCAL_UPDATE_LIMIT_MS}`);
  if (conservativeWorkerResponseMax > WORKER_RESPONSE_LIMIT_MS) blockingFailures.push(`worker-response main-thread handling max ${conservativeWorkerResponseMax} > ${WORKER_RESPONSE_LIMIT_MS}`);
  if (movement.maxPendingQueueDepth > 1) blockingFailures.push(`pending queue depth ${movement.maxPendingQueueDepth} > 1`);
  if (movement.lastRequestedWorldKey !== movement.lastAppliedWorldKey) blockingFailures.push('requested/applied world keys differ');
  if (movement.lastRequestedCanonicalThreatKey !== movement.lastAppliedCanonicalThreatKey) blockingFailures.push('requested/applied canonical keys differ');
  if (movement.lastAppliedJobId !== movement.lastCompletedJobId) blockingFailures.push('last applied job is not the last completed job');
  if (movement.lastWorkerError) blockingFailures.push(`worker error: ${movement.lastWorkerError}`);
  if (dangerAttributedLongTasks.length > 0) blockingFailures.push(`${dangerAttributedLongTasks.length} danger-attributed long tasks remain`);
  if (applicationAttributedLongTasks.length > 0) blockingFailures.push(`${applicationAttributedLongTasks.length} application-attributed long tasks remain`);
  if (unattributedLongTasks.length > 0) blockingFailures.push(`${unattributedLongTasks.length} long tasks remain unattributed`);

  return {
    supportedEntryTypes: report.browser?.performanceObserverSupportedEntryTypes ?? [],
    globalLongTasks,
    dangerAttributedLongTasks,
    applicationAttributedLongTasks,
    diagnosticOnlyLongTasks,
    unattributedLongTasks,
    productionPhases,
    productionPhaseMaxMs,
    blockingContractPassed: blockingFailures.length === 0,
    blockingFailures,
    interpretation: 'Global browser long tasks remain visible. Only tasks with bounded application scripts and at least 80% unaccounted LoAF time are diagnostic-only; danger/application attribution or missing attribution remains blocking.',
  };
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

function summarizeSceneUpdates(report: PerformanceReport): Stats {
  const end = report.samples.at(-1)?.tMs ?? 0;
  return stats(report.samples
    .filter((sample) => sample.layerMode === 'danger' && sample.tMs >= end - REPORT_WINDOW_MS)
    .map((sample) => sample.sceneUpdateMs));
}

function stats(values: number[]): Stats {
  if (values.length === 0) return { count: 0, last: 0, max: 0, p95: 0 };
  const sorted = [...values].sort((left, right) => left - right);
  return {
    count: values.length,
    last: roundTwo(values[values.length - 1] ?? 0),
    max: roundTwo(sorted[sorted.length - 1] ?? 0),
    p95: roundTwo(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0),
  };
}

function isApplicationScript(script: LongAnimationFrameScript): boolean {
  return /(?:\/src\/|\/assets\/|real-wargame|pixi|vite)/i.test(script.sourceUrl)
    || /(?:Pixi|Simulation|Danger|Awareness|Renderer|Harness|Worker)/i.test(scriptIdentity(script));
}

function isDangerScript(script: LongAnimationFrameScript): boolean {
  return /(?:Danger|Awareness|PixiAwareness|SoldierAwareness|AwarenessWorldWorker)/i.test(
    `${script.sourceUrl} ${scriptIdentity(script)}`,
  );
}

function isWorkerResponseScript(script: LongAnimationFrameScript): boolean {
  return isDangerScript(script) && /(?:handleWorkerResponse|onmessage|message)/i.test(scriptIdentity(script));
}

function scriptIdentity(script: LongAnimationFrameScript): string {
  return `${script.sourceFunctionName} ${script.invoker} ${script.invokerType}`.trim();
}

function overlaps(leftStart: number, leftDuration: number, rightStart: number, rightDuration: number): boolean {
  return leftStart < rightStart + rightDuration && rightStart < leftStart + leftDuration;
}

function intervalOverlap(leftStart: number, leftDuration: number, rightStart: number, rightDuration: number): number {
  const start = Math.max(leftStart, rightStart);
  const end = Math.min(leftStart + leftDuration, rightStart + rightDuration);
  return Math.max(0, end - start);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function max(values: number[]): number {
  return values.length === 0 ? 0 : Math.max(...values);
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

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}
