import { expect, test, type Page } from '@playwright/test';

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

const EXPECTED_BRANCH = process.env.DANGER_PERF_EXPECTED_BRANCH
  ?? 'agent/danger-layer-moving-units-performance';
const EXPECTED_SHA = process.env.DANGER_PERF_EXPECTED_SHA ?? '';
const REPORT_WINDOW_MS = 8_000;

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
  const after = await snapshot(page, false);
  const afterMovement = requireMovement(after);

  expect(afterMovement.workerJobsStarted).toBeGreaterThan(beforeMovement.workerJobsStarted);
  expect(afterMovement.worldRasterBuilds).toBeGreaterThan(beforeMovement.worldRasterBuilds);
  expect(afterMovement.maxPendingQueueDepth).toBeLessThanOrEqual(1);
  expect(afterMovement.pendingQueueDepth).toBeLessThanOrEqual(1);
  expect(afterMovement.maxMainThreadApplyMs).toBeLessThanOrEqual(5);
  expect(afterMovement.lastWorkerError).toBeNull();

  await stopScenario(page);
  await page.waitForTimeout(250);
  await waitForWorkerSettled(page);
  const finalSnapshot = await snapshot(page, false);
  const finalMovement = requireMovement(finalSnapshot);
  expect(finalMovement.lastAppliedRasterKey).toBe(finalMovement.lastRequestedRasterKey);
  expect(finalMovement.finalRefreshApplied).toBeGreaterThan(beforeMovement.finalRefreshApplied);
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

  expect(Math.hypot(
    afterSubjective.x - initialSubjective.x,
    afterSubjective.y - initialSubjective.y,
  )).toBeLessThan(0.2);
  expect(afterMovement.worldRasterBuilds).toBe(beforeMovement.worldRasterBuilds);
  expect(afterMovement.directionalBasisBuilds).toBe(beforeMovement.directionalBasisBuilds);
  expect(afterMovement.maxPendingQueueDepth).toBeLessThanOrEqual(1);
  expect(afterMovement.lastWorkerError).toBeNull();

  await stopScenario(page);
});

test('wall-side crossing cannot apply stale worker output over the final threat side', async ({ page }) => {
  await openHarness(page);
  await startScenarioPaused(page, 'wall-crossing');
  await waitForWorkerSettled(page);
  const initial = await snapshot(page, true);
  expect(initial.bestSafePosition).not.toBeNull();
  expect(initial.hostileMoving).toBe(true);

  await resumeSimulation(page);
  await page.waitForFunction(() => {
    const current = window.__realWargameDangerMovementPerformance?.getSnapshot(false);
    return Boolean(current && current.hostilePosition.x < current.observerPosition.x - 2);
  }, undefined, { timeout: 25_000 });
  await stopScenario(page);
  await page.waitForTimeout(250);
  await waitForWorkerSettled(page);
  const final = await snapshot(page, true);
  const movement = requireMovement(final);

  expect(final.bestSafePosition).not.toBeNull();
  expect(final.bestSafePosition).not.toEqual(initial.bestSafePosition);
  expect(final.protectedAgainstThreatId).not.toBeNull();
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
  await togglePause(page, true);
  return started;
}

async function resumeSimulation(page: Page): Promise<void> {
  await togglePause(page, false);
}

async function togglePause(page: Page, paused: boolean): Promise<void> {
  const currentPaused = await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('#pause-toggle');
    if (!button) throw new Error('Pause toggle is unavailable.');
    return button.getAttribute('aria-pressed') === 'true';
  });
  if (currentPaused !== paused) {
    await page.locator('#pause-toggle').click();
  } else {
    const runtimePaused = await page.evaluate(() => {
      const button = document.querySelector<HTMLButtonElement>('#pause-toggle');
      if (!button) throw new Error('Pause toggle is unavailable.');
      button.click();
      return button.getAttribute('aria-pressed') === 'true';
    });
    if (runtimePaused !== paused) await page.locator('#pause-toggle').click();
  }
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
  const path = await download.path();
  if (!path) throw new Error('Performance report download path is unavailable.');
  const { readFileSync } = await import('node:fs');
  return JSON.parse(readFileSync(path, 'utf8')) as PerformanceReport;
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
