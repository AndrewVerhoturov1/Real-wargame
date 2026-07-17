import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  adjustDurationForClassifiedHeadlessPauses,
  type ClassifiedLongTaskDiagnostic,
} from '../src/core/debug/LongTaskClassification';

interface Stats {
  readonly count: number;
  readonly avgMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
}

interface SchedulerDiagnostics {
  readonly decisionCycles: Stats;
  readonly decisionUnitPasses: Stats;
  readonly slowestCycles: ReadonlyArray<Record<string, unknown>>;
  readonly slowestUnitPasses: ReadonlyArray<Record<string, unknown>>;
  readonly recentUnitPasses: ReadonlyArray<{ readonly unitId: string; readonly simulationStep: number; readonly graphTicked: boolean }>;
}

interface PhaseMeasure {
  readonly name: string;
  readonly startMs: number;
  readonly durationMs: number;
}

interface PerformanceReport {
  readonly version: string;
  readonly runtimeSeconds: number;
  readonly build?: {
    readonly branch?: string;
    readonly commitSha?: string;
    readonly buildId?: string;
    readonly performanceContractVersion?: string;
  };
  readonly scene?: {
    readonly mapWidthCells?: number;
    readonly mapHeightCells?: number;
    readonly unitCount?: number;
  };
  readonly computation?: {
    readonly aiScheduler?: SchedulerDiagnostics;
    readonly directionalTactical?: Record<string, unknown>;
    readonly visibilityGeometry?: Record<string, unknown>;
    readonly perceptionPointProbes?: Record<string, unknown>;
    readonly soldierDangerField?: Record<string, unknown>;
    readonly threatRelativeCover?: Record<string, unknown>;
    readonly routeCostWorker?: { readonly workerErrors?: number };
    readonly simulationSlowestPasses?: ReadonlyArray<{
      readonly simulationStep: number;
      readonly simulationTimeSeconds: number;
      readonly performanceStartMs?: number;
      readonly performanceEndMs?: number;
      readonly totalDurationMs: number;
      readonly [key: string]: unknown;
    }>;
  };
  readonly samples: ReadonlyArray<{
    readonly tMs: number;
    readonly frameMs: number | null;
    readonly simulationUpdateMs: number;
    readonly applicationUpdateMs: number;
    readonly sceneUpdateMs: number;
    readonly layerMode: string;
  }>;
  readonly performancePhaseMeasures?: readonly PhaseMeasure[];
  readonly contextualPerformancePhaseEvents?: ReadonlyArray<{
    readonly name: string;
    readonly startMs: number;
    readonly durationMs: number;
    readonly context: Record<string, unknown> | null;
  }>;
  readonly longTaskClassification?: readonly ClassifiedLongTaskDiagnostic[];
  readonly applicationAttribution?: {
    readonly longTasks: ReadonlyArray<{
      readonly startMs: number;
      readonly durationMs: number;
      readonly applicationAttributed: boolean;
      readonly applicationDominated: boolean;
      readonly applicationOverlapRatio: number;
      readonly overlappingPhases: readonly string[];
      readonly overlapDurationMs: number;
    }>;
    readonly applicationAttributedLongTaskCount: number;
    readonly unattributedLongTaskCount: number;
  };
}

interface LiveHarnessSnapshot {
  readonly simulationTimeSeconds: number;
  readonly performanceNowMs: number;
  readonly unitCount: number;
  readonly graphUnitCount: number;
  readonly movingUnitCount: number;
  readonly selectedUnitId: string | null;
  readonly layerMode: string;
  readonly tacticalKnowledgeRevisions: Readonly<Record<string, number>>;
  readonly activeOrderIds: readonly string[];
}

interface LiveHarnessApi {
  start(): LiveHarnessSnapshot;
  stop(): LiveHarnessSnapshot;
  retargetAll(seed: number): LiveHarnessSnapshot;
  refreshContacts(): LiveHarnessSnapshot;
  setLayer(mode: 'info' | 'danger' | 'stealth' | 'memory'): LiveHarnessSnapshot;
  selectUnit(index: number): LiveHarnessSnapshot;
  getSnapshot(): LiveHarnessSnapshot;
}

declare global {
  interface Window {
    __realWargameLiveWindowsPerformance?: LiveHarnessApi;
  }
}

const OUTPUT_PATH = process.env.LIVE_WINDOWS_PERF_OUTPUT
  ?? path.join('artifacts', 'performance', 'live-windows-followup', 'after-browser.json');
const EXPECTED_BRANCH = process.env.LIVE_WINDOWS_PERF_EXPECTED_BRANCH ?? '';
const EXPECTED_SHA = process.env.LIVE_WINDOWS_PERF_EXPECTED_SHA ?? '';
const BASE_SHA = process.env.LIVE_WINDOWS_PERF_BASE_SHA ?? '';
const WORKFLOW_RUN_ID = process.env.LIVE_WINDOWS_PERF_WORKFLOW_RUN_ID ?? '';
const MEASUREMENT_MS = Math.max(90_000, Number(process.env.LIVE_WINDOWS_PERF_DURATION_MS ?? 90_000));
const WARMUP_MS = 10_000;
const INTERACTION_STEP_MS = 5_000;
const ENFORCE = process.env.LIVE_WINDOWS_PERF_ENFORCE !== '0';

const LAYERS = ['danger', 'memory', 'stealth', 'danger'] as const;

test.setTimeout(MEASUREMENT_MS + WARMUP_MS + 240_000);

test('runs six-unit graph AI with moving contacts and active tactical workspace for at least 90 seconds', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?visualQa=live-windows-performance');
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__realWargameLiveWindowsPerformance));

  const started = await page.evaluate(() => window.__realWargameLiveWindowsPerformance!.start());
  expect(started.unitCount).toBeGreaterThanOrEqual(6);
  expect(started.graphUnitCount).toBeGreaterThanOrEqual(6);
  expect(started.movingUnitCount).toBeGreaterThanOrEqual(4);

  await page.waitForTimeout(WARMUP_MS);
  const warmupReport = await downloadPerformanceReport(page);
  const measurementStartMs = warmupReport.runtimeSeconds * 1000;
  const warmupSnapshot = await page.evaluate(() => window.__realWargameLiveWindowsPerformance!.getSnapshot());

  const interactionSnapshots: LiveHarnessSnapshot[] = [];
  const steps = Math.ceil(MEASUREMENT_MS / INTERACTION_STEP_MS);
  for (let step = 0; step < steps; step += 1) {
    const interactionSnapshot = await page.evaluate(({ currentStep, layer }) => {
      const api = window.__realWargameLiveWindowsPerformance;
      if (!api) throw new Error('Live Windows performance harness is unavailable.');
      api.selectUnit(currentStep);
      api.setLayer(layer);
      api.refreshContacts();
      if (currentStep % 3 === 0) api.retargetAll(currentStep + 1);
      return api.getSnapshot();
    }, { currentStep: step, layer: LAYERS[step % LAYERS.length] });

    interactionSnapshots.push(interactionSnapshot);
    const canvas = page.locator('canvas');
    await canvas.hover();
    await page.mouse.wheel(step % 2 === 0 ? 0 : 180, step % 2 === 0 ? -220 : 160);
    await page.keyboard.press(step % 2 === 0 ? 'ArrowRight' : 'ArrowLeft');
    await page.waitForTimeout(INTERACTION_STEP_MS);
  }

  const stopped = await page.evaluate(() => window.__realWargameLiveWindowsPerformance!.stop());
  const finalReport = await downloadPerformanceReport(page);
  const evidence = buildEvidence(started, warmupReport, finalReport, warmupSnapshot, stopped, interactionSnapshots, measurementStartMs);
  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeEvidenceFiles(evidence);
  console.log(JSON.stringify(evidence, null, 2));

  expect(evidence.measurementSeconds).toBeGreaterThanOrEqual(90);
  expect(evidence.finalSnapshot.graphUnitCount).toBeGreaterThanOrEqual(6);
  expect(evidence.scheduler.decisionCycles.count).toBeGreaterThan(50);
  if (ENFORCE) assertAcceptance(evidence);
});

function buildEvidence(
  startedSnapshot: LiveHarnessSnapshot,
  warmup: PerformanceReport,
  final: PerformanceReport,
  warmupSnapshot: LiveHarnessSnapshot,
  finalSnapshot: LiveHarnessSnapshot,
  interactionSnapshots: readonly LiveHarnessSnapshot[],
  measurementStartMs: number,
) {
  assertBuildIdentity(final);
  const scheduler = final.computation?.aiScheduler;
  if (!scheduler) throw new Error('Performance report is missing aiScheduler diagnostics.');
  const monitorStartedAtMs = warmupSnapshot.performanceNowMs - warmup.runtimeSeconds * 1000;
  const scenarioStartMs = Math.max(0, startedSnapshot.performanceNowMs - monitorStartedAtMs);
  const scenarioSamples = final.samples.filter((sample) => sample.tMs >= scenarioStartMs);
  const measurementSamples = final.samples.filter((sample) => sample.tMs >= measurementStartMs);
  const phaseMeasures = (final.performancePhaseMeasures ?? []).filter((measure) => measure.startMs >= measurementStartMs);
  const contextualEvents = (final.contextualPerformancePhaseEvents ?? [])
    .filter((event) => event.startMs >= measurementStartMs);
  const longTasks = (final.applicationAttribution?.longTasks ?? [])
    .filter((task) => task.startMs >= scenarioStartMs);
  const applicationDominatedLongTasks = longTasks.filter((task) => task.applicationDominated);
  const partiallyAttributedLongTasks = longTasks
    .filter((task) => task.applicationAttributed && !task.applicationDominated);
  const unattributedLongTasks = longTasks.filter((task) => !task.applicationAttributed);
  const classifiedLongTasks = (final.longTaskClassification ?? []).filter((task) => task.scenario === 'live-windows-six-unit-ai' || task.startMs >= scenarioStartMs);
  const simulationSlowestPasses = (final.computation?.simulationSlowestPasses ?? []).map((record) => {
    const adjustment = adjustDurationForClassifiedHeadlessPauses(
      record.performanceStartMs,
      record.performanceEndMs,
      record.totalDurationMs,
      classifiedLongTasks,
    );
    return {
      ...record,
      rawTotalDurationMs: adjustment.rawDurationMs,
      headlessPauseOverlapMs: adjustment.headlessPauseOverlapMs,
      acceptedApplicationDurationMs: adjustment.adjustedDurationMs,
      headlessPauseTaskStartsMs: adjustment.overlappingTaskStartsMs,
    };
  });
  const simulationDurationEvidence = matchSimulationSamplesToSlowestPasses(scenarioSamples, simulationSlowestPasses);
  const simulationPauseAdjustments = simulationDurationEvidence.filter((sample) => sample.headlessPauseOverlapMs > 0);
  const unexplainedRawSimulationSpikes = simulationDurationEvidence.filter((sample) => (
    sample.rawDurationMs > 25 && sample.adjustedDurationMs > 25
  ));
  const applicationBlockingLongTasks = classifiedLongTasks.filter((task) => task.classification === 'application_blocking');
  const unknownLongTasks = classifiedLongTasks.filter((task) => task.classification === 'unknown');
  const graphUnitPassIds = [...new Set(scheduler.recentUnitPasses.filter((pass) => pass.graphTicked).map((pass) => pass.unitId))].sort();
  const maximumMovingUnitCount = Math.max(warmupSnapshot.movingUnitCount, finalSnapshot.movingUnitCount, ...interactionSnapshots.map((snapshot) => snapshot.movingUnitCount));
  const workspaceMeasures = phaseMeasures
    .filter((measure) => measure.name.endsWith('ui.tactical-workspace.update'))
    .map((measure) => measure.durationMs);

  return {
    version: 2,
    enforceEnabled: ENFORCE,
    reportVersion: final.version,
    build: final.build ?? null,
    scene: final.scene ?? null,
    measurementSeconds: Math.round((final.runtimeSeconds * 1000 - measurementStartMs) / 100) / 10,
    scenarioStartMs: roundTwo(scenarioStartMs),
    warmupSnapshot,
    finalSnapshot,
    browser: {
      frameMs: stats(measurementSamples.flatMap((sample) => sample.frameMs === null ? [] : [sample.frameMs])),
      simulationRawUpdateMs: stats(simulationDurationEvidence.map((sample) => sample.rawDurationMs)),
      simulationUpdateMs: stats(simulationDurationEvidence.map((sample) => sample.adjustedDurationMs)),
      simulationHeadlessPauseOverlapMs: stats(simulationDurationEvidence.map((sample) => sample.headlessPauseOverlapMs)),
      simulationPauseAdjustments,
      unexplainedRawSimulationSpikes,
      applicationUpdateMs: stats(measurementSamples.map((sample) => sample.applicationUpdateMs)),
      sceneUpdateMs: stats(measurementSamples.map((sample) => sample.sceneUpdateMs)),
      sampleCount: measurementSamples.length,
    },
    scheduler: {
      decisionCycles: scheduler.decisionCycles,
      decisionUnitPasses: scheduler.decisionUnitPasses,
      slowestCycles: scheduler.slowestCycles,
      slowestUnitPasses: scheduler.slowestUnitPasses,
      graphUnitPassIds,
    },
    workspace: {
      measuredSlowUpdateCount: workspaceMeasures.length,
      measuredSlowUpdateMs: stats(workspaceMeasures),
    },
    applicationAttribution: {
      totalLongTasks: longTasks.length,
      applicationDominatedLongTasks,
      partiallyAttributedLongTasks,
      unattributedLongTasks,
      classifiedLongTasks,
      applicationBlockingLongTasks,
      unknownLongTasks,
    },
    fieldBuildDeltas: {
      directionalTactical: diagnosticDelta(warmup, final, 'directionalTactical', 'buildCount'),
      visibilityGeometry: diagnosticDelta(warmup, final, 'visibilityGeometry', 'geometryBuildCount'),
      perceptionPointProbePreparations: diagnosticDelta(warmup, final, 'perceptionPointProbes', 'preparationCount'),
      perceptionPointProbeCacheHits: diagnosticDelta(warmup, final, 'perceptionPointProbes', 'cacheHitCount'),
      perceptionPointProbeDeferred: diagnosticDelta(warmup, final, 'perceptionPointProbes', 'deferredCount'),
      soldierDangerGeometry: diagnosticDelta(warmup, final, 'soldierDangerField', 'geometryBuildCount'),
      soldierDangerFields: diagnosticDelta(warmup, final, 'soldierDangerField', 'fieldBuildCount'),
      threatRelativeCover: diagnosticDelta(warmup, final, 'threatRelativeCover', 'geometryBuildCount'),
    },
    simulationSlowestPasses,
    workerErrors: Number(final.computation?.routeCostWorker?.workerErrors ?? 0),
    maximumMovingUnitCount,
    contextualSlowFieldEvents: contextualEvents
      .filter((event) => event.name.startsWith('field.'))
      .sort((left, right) => right.durationMs - left.durationMs)
      .slice(0, 100),
  };
}

function assertAcceptance(evidence: ReturnType<typeof buildEvidence>): void {
  const blockingFailures = collectBlockingFailures(evidence);
  expect(blockingFailures, blockingFailures.join('\n')).toEqual([]);
}

function collectBlockingFailures(evidence: ReturnType<typeof buildEvidence>): string[] {
  const failures: string[] = [];
  const check = (condition: boolean, message: string): void => { if (!condition) failures.push(message); };
  check(evidence.enforceEnabled, 'enforceEnabled must be true');
  check(evidence.scheduler.decisionCycles.p95Ms <= 8, `scheduler decision-cycle p95 ${evidence.scheduler.decisionCycles.p95Ms} > 8 ms`);
  check(evidence.scheduler.decisionCycles.maxMs <= 16, `scheduler decision-cycle max ${evidence.scheduler.decisionCycles.maxMs} > 16 ms`);
  check(evidence.scheduler.decisionUnitPasses.p95Ms <= 2, `per-unit decision pass p95 ${evidence.scheduler.decisionUnitPasses.p95Ms} > 2 ms`);
  check(evidence.scheduler.decisionUnitPasses.maxMs <= 10, `per-unit decision pass max ${evidence.scheduler.decisionUnitPasses.maxMs} > 10 ms`);
  check(evidence.browser.simulationRawUpdateMs.p95Ms <= 12, `raw SimulationTick p95 ${evidence.browser.simulationRawUpdateMs.p95Ms} > 12 ms`);
  check(evidence.browser.simulationUpdateMs.p95Ms <= 12, `pause-adjusted SimulationTick p95 ${evidence.browser.simulationUpdateMs.p95Ms} > 12 ms`);
  check(evidence.browser.simulationUpdateMs.maxMs <= 25, `pause-adjusted SimulationTick max ${evidence.browser.simulationUpdateMs.maxMs} > 25 ms`);
  check(evidence.browser.unexplainedRawSimulationSpikes.length === 0, `${evidence.browser.unexplainedRawSimulationSpikes.length} raw SimulationTick spikes above 25 ms lack classified headless-pause overlap evidence`);
  check(evidence.workspace.measuredSlowUpdateMs.p95Ms <= 8, `workspace p95 ${evidence.workspace.measuredSlowUpdateMs.p95Ms} > 8 ms`);
  check(evidence.workspace.measuredSlowUpdateMs.maxMs <= 16, `workspace max ${evidence.workspace.measuredSlowUpdateMs.maxMs} > 16 ms`);
  check(evidence.applicationAttribution.applicationBlockingLongTasks.length === 0, `${evidence.applicationAttribution.applicationBlockingLongTasks.length} application_blocking LongTasks remain`);
  check(evidence.applicationAttribution.unknownLongTasks.length === 0, `${evidence.applicationAttribution.unknownLongTasks.length} unknown LongTasks remain`);
  check(evidence.workerErrors === 0, `${evidence.workerErrors} route-cost worker errors`);
  check(evidence.finalSnapshot.graphUnitCount >= 6, 'fewer than six graph-controlled units');
  check(evidence.scheduler.graphUnitPassIds.length >= 6, `only ${evidence.scheduler.graphUnitPassIds.length} graph units received scheduler passes`);
  check(evidence.maximumMovingUnitCount >= 4, `only ${evidence.maximumMovingUnitCount} units were moving`);
  check(evidence.measurementSeconds >= 90, `measurement window ${evidence.measurementSeconds} s < 90 s`);
  return failures;
}

function writeEvidenceFiles(evidence: ReturnType<typeof buildEvidence>): void {
  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  const directory = path.dirname(OUTPUT_PATH);
  const blockingFailures = collectBlockingFailures(evidence);
  const acceptance = {
    baseSha: BASE_SHA,
    headSha: EXPECTED_SHA || evidence.build?.commitSha || '',
    enforceEnabled: ENFORCE,
    allThresholdsPassed: blockingFailures.length === 0,
    blockingFailures,
    workflowRunIds: WORKFLOW_RUN_ID ? [Number(WORKFLOW_RUN_ID)] : [],
  };
  writeFileSync(path.join(directory, 'acceptance-result.json'), `${JSON.stringify(acceptance, null, 2)}\n`, 'utf8');
  writeFileSync(path.join(directory, 'simulation-slowest-passes.json'), `${JSON.stringify(evidence.simulationSlowestPasses, null, 2)}\n`, 'utf8');
  writeFileSync(path.join(directory, 'long-task-classification.json'), `${JSON.stringify(evidence.applicationAttribution.classifiedLongTasks, null, 2)}\n`, 'utf8');
}

function matchSimulationSamplesToSlowestPasses(
  samples: PerformanceReport['samples'],
  slowestPasses: ReadonlyArray<Record<string, unknown> & {
    readonly simulationStep: number;
    readonly rawTotalDurationMs: number;
    readonly headlessPauseOverlapMs: number;
    readonly acceptedApplicationDurationMs: number;
    readonly headlessPauseTaskStartsMs: readonly number[];
  }>,
) {
  const candidates = slowestPasses
    .filter((record) => record.rawTotalDurationMs > 25)
    .sort((left, right) => right.rawTotalDurationMs - left.rawTotalDurationMs);
  const used = new Set<number>();
  return samples.map((sample, sampleIndex) => {
    const rawDurationMs = sample.simulationUpdateMs;
    if (rawDurationMs <= 25) {
      return {
        sampleIndex,
        tMs: sample.tMs,
        rawDurationMs,
        headlessPauseOverlapMs: 0,
        adjustedDurationMs: rawDurationMs,
        simulationStep: null,
        headlessPauseTaskStartsMs: [] as readonly number[],
      };
    }
    let bestIndex = -1;
    let bestDifference = Number.POSITIVE_INFINITY;
    for (let index = 0; index < candidates.length; index += 1) {
      if (used.has(index)) continue;
      const difference = Math.abs(candidates[index].rawTotalDurationMs - rawDurationMs);
      if (difference < bestDifference) {
        bestDifference = difference;
        bestIndex = index;
      }
    }
    const match = bestIndex >= 0 && bestDifference <= 1 ? candidates[bestIndex] : null;
    if (match) used.add(bestIndex);
    return {
      sampleIndex,
      tMs: sample.tMs,
      rawDurationMs,
      headlessPauseOverlapMs: match?.headlessPauseOverlapMs ?? 0,
      adjustedDurationMs: match?.acceptedApplicationDurationMs ?? rawDurationMs,
      simulationStep: match?.simulationStep ?? null,
      headlessPauseTaskStartsMs: match?.headlessPauseTaskStartsMs ?? [],
    };
  });
}

async function downloadPerformanceReport(page: Page): Promise<PerformanceReport> {
  const downloadPromise = page.waitForEvent('download');
  await page.evaluate(() => {
    const button = document.querySelector<HTMLElement>('[data-workspace-file-action="performance"]');
    if (!button) throw new Error('Performance report control is missing.');
    button.click();
  });
  const download = await downloadPromise;
  const downloadedPath = await download.path();
  if (!downloadedPath) throw new Error('Performance report download path is unavailable.');
  return JSON.parse(readFileSync(downloadedPath, 'utf8')) as PerformanceReport;
}

function diagnosticDelta(
  warmup: PerformanceReport,
  final: PerformanceReport,
  section: 'directionalTactical' | 'visibilityGeometry' | 'perceptionPointProbes' | 'soldierDangerField' | 'threatRelativeCover',
  field: string,
): number {
  const before = Number(warmup.computation?.[section]?.[field] ?? 0);
  const after = Number(final.computation?.[section]?.[field] ?? 0);
  return after - before;
}

function stats(values: readonly number[]): Stats {
  if (values.length === 0) {
    return { count: 0, avgMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 };
  }
  const sorted = [...values].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    count: sorted.length,
    avgMs: roundTwo(total / sorted.length),
    p50Ms: roundTwo(percentile(sorted, 0.50)),
    p95Ms: roundTwo(percentile(sorted, 0.95)),
    p99Ms: roundTwo(percentile(sorted, 0.99)),
    maxMs: roundTwo(sorted[sorted.length - 1] ?? 0),
  };
}

function percentile(values: readonly number[], fraction: number): number {
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * fraction) - 1));
  return values[index] ?? 0;
}

function assertBuildIdentity(report: PerformanceReport): void {
  expect(report.version).toBe('performance-report-v5');
  expect(report.build?.performanceContractVersion).toBe('performance-report-v5');
  if (EXPECTED_BRANCH) expect(report.build?.branch).toBe(EXPECTED_BRANCH);
  if (EXPECTED_SHA) expect(report.build?.commitSha).toBe(EXPECTED_SHA);
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}
