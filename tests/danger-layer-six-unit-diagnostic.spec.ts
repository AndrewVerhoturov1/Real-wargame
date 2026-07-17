import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

interface MovementDiagnostics {
  pendingQueueDepth: number;
  maxPendingQueueDepth: number;
  workerInFlight: boolean;
  workerJobsStarted: number;
  workerJobsCompleted: number;
  workerJobsCoalesced: number;
  workerResultsStaleDropped: number;
  lastWorkerError: string | null;
}

interface MovementSnapshot {
  scenario: string | null;
  simulationTimeSeconds: number;
  observerPosition: { x: number; y: number };
  hostilePosition: { x: number; y: number };
  subjectiveThreatPosition: { x: number; y: number } | null;
  tacticalKnowledgeRevision: number;
  observerMoving: boolean;
  hostileMoving: boolean;
  movingUnitCount: number;
  awarenessMovement: MovementDiagnostics | null;
}

interface DiagnosticSample {
  elapsedMs: number;
  simulationTimeSeconds: number;
  observerDistance: number;
  hostileDistance: number;
  subjectiveDistance: number | null;
  observerMoving: boolean;
  hostileMoving: boolean;
  movingUnitCount: number;
  tacticalKnowledgeRevision: number;
  worker: MovementDiagnostics | null;
}

const OUTPUT_PATH = process.env.SIX_UNIT_DIAGNOSTIC_OUTPUT
  ?? path.join('artifacts', 'performance', 'danger-layer-six-unit-diagnostic.json');

test('captures six-unit movement progress without changing acceptance thresholds', async ({ page }) => {
  await openHarness(page);
  await setSimulationPaused(page, true);
  const before = await page.evaluate(() => {
    const api = window.__realWargameDangerMovementPerformance;
    if (!api) throw new Error('Danger movement performance API is unavailable.');
    return api.startScenario('both') as MovementSnapshot;
  });
  expect(before.movingUnitCount).toBeGreaterThanOrEqual(6);
  await waitForWorkerSettled(page);
  const settledBefore = await snapshot(page);
  await setSimulationPaused(page, false);

  const samples: DiagnosticSample[] = [];
  const startedAt = Date.now();
  while (Date.now() - startedAt < 25_000) {
    await page.waitForTimeout(1_000);
    const current = await snapshot(page);
    samples.push(buildSample(settledBefore, current, Date.now() - startedAt));
  }

  await setSimulationPaused(page, true);
  const after = await page.evaluate(() => {
    const api = window.__realWargameDangerMovementPerformance;
    if (!api) throw new Error('Danger movement performance API is unavailable.');
    return api.stopScenario() as MovementSnapshot;
  });
  const final = buildSample(settledBefore, after, Date.now() - startedAt);
  const report = {
    version: 'danger-layer-six-unit-diagnostic-v1',
    build: {
      branch: process.env.DANGER_PERF_EXPECTED_BRANCH ?? null,
      commitSha: process.env.DANGER_PERF_EXPECTED_SHA ?? null,
    },
    before: settledBefore,
    after,
    final,
    thresholds: {
      observerDistance: 4,
      hostileDistance: 4,
      subjectiveDistance: 2,
    },
    thresholdReached: final.observerDistance >= 4
      && final.hostileDistance >= 4
      && (final.subjectiveDistance ?? -1) >= 2,
    samples,
  };
  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
});

function buildSample(before: MovementSnapshot, current: MovementSnapshot, elapsedMs: number): DiagnosticSample {
  return {
    elapsedMs,
    simulationTimeSeconds: current.simulationTimeSeconds,
    observerDistance: distance(current.observerPosition, before.observerPosition),
    hostileDistance: distance(current.hostilePosition, before.hostilePosition),
    subjectiveDistance: current.subjectiveThreatPosition && before.subjectiveThreatPosition
      ? distance(current.subjectiveThreatPosition, before.subjectiveThreatPosition)
      : null,
    observerMoving: current.observerMoving,
    hostileMoving: current.hostileMoving,
    movingUnitCount: current.movingUnitCount,
    tacticalKnowledgeRevision: current.tacticalKnowledgeRevision,
    worker: current.awarenessMovement,
  };
}

function distance(left: { x: number; y: number }, right: { x: number; y: number }): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

async function openHarness(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?visualQa=danger-layer-movement-performance');
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__realWargameDangerMovementPerformance));
}

async function snapshot(page: Page): Promise<MovementSnapshot> {
  return page.evaluate(() => {
    const api = window.__realWargameDangerMovementPerformance;
    if (!api) throw new Error('Danger movement performance API is unavailable.');
    return api.getSnapshot() as MovementSnapshot;
  });
}

async function setSimulationPaused(page: Page, paused: boolean): Promise<void> {
  await page.evaluate((desired) => {
    const button = document.querySelector<HTMLButtonElement>('#pause-toggle');
    if (!button) throw new Error('Pause toggle is unavailable.');
    if ((button.getAttribute('aria-pressed') === 'true') !== desired) button.click();
  }, paused);
  await expect(page.locator('#pause-toggle')).toHaveAttribute('aria-pressed', String(paused));
}

async function waitForWorkerSettled(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const current = window.__realWargameDangerMovementPerformance?.getSnapshot() as MovementSnapshot | undefined;
    const movement = current?.awarenessMovement;
    return Boolean(
      current
      && movement
      && !movement.workerInFlight
      && movement.pendingQueueDepth === 0
      && movement.workerJobsCompleted > 0
      && !movement.lastWorkerError,
    );
  }, undefined, { timeout: 30_000 });
}

declare global {
  interface Window {
    __realWargameDangerMovementPerformance?: {
      startScenario(scenario: string): unknown;
      stopScenario(): unknown;
      getSnapshot(): unknown;
    };
  }
}
