import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

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
    readonly soldierDangerField?: Record<string, unknown>;
    readonly threatRelativeCover?: Record<string, unknown>;
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
  readonly applicationAttribution?: {
    readonly longTasks: ReadonlyArray<{
      readonly startMs: number;
      readonly durationMs: number;
      readonly applicationAttributed: boolean;
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

  const steps = Math.ceil(MEASUREMENT_MS / INTERACTION_STEP_MS);
  for (let step = 0; step < steps; step += 1) {
    await page.evaluate(({ currentStep, layer }) => {
      const api = window.__realWargameLiveWindowsPerformance;
      if (!api) throw new Error('Live Windows performance harness is unavailable.');
      api.selectUnit(currentStep);
      api.setLayer(layer);
      api.refreshContacts();
      if (currentStep % 3 === 0) api.retargetAll(currentStep + 1);
    }, { currentStep: step, layer: LAYERS[step % LAYERS.length] });

    const canvas = page.locator('canvas');
    await canvas.hover();
    await page.mouse.wheel(step % 2 === 0 ? 0 : 180, step % 2 === 0 ? -220 : 160);
    await page.keyboard.press(step % 2 === 0 ? 'ArrowRight' : 'ArrowLeft');
    await page.waitForTimeout(INTERACTION_STEP_MS);
  }

  const stopped = await page.evaluate(() => window.__realWargameLiveWindowsPerformance!.stop());
  const finalReport = await downloadPerformanceReport(page);
  const evidence = buildEvidence(warmupReport, finalReport, warmupSnapshot, stopped, measurementStartMs);
  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(evidence, null, 2));

  expect(evidence.measurementSeconds).toBeGreaterThanOrEqual(90);
  expect(evidence.finalSnapshot.graphUnitCount).toBeGreaterThanOrEqual(6);
  expect(evidence.scheduler.decisionCycles.count).toBeGreaterThan(50);
  if (ENFORCE) assertAcceptance(evidence);
});

function buildEvidence(
  warmup: PerformanceReport,
  final: PerformanceReport,
  warmupSnapshot: LiveHarnessSnapshot,
  finalSnapshot: LiveHarnessSnapshot,
  measurementStartMs: number,
) {
  assertBuildIdentity(final);
  const scheduler = final.computation?.aiScheduler;
  if (!scheduler) throw new Error('Performance report is missing aiScheduler diagnostics.');
  const measurementSamples = final.samples.filter((sample) => sample.tMs >= measurementStartMs);
  const phaseMeasures = (final.performancePhaseMeasures ?? []).filter((measure) => measure.startMs >= measurementStartMs);
  const contextualEvents = (final.contextualPerformancePhaseEvents ?? [])
    .filter((event) => event.startMs >= measurementStartMs);
  const longTasks = (final.applicationAttribution?.longTasks ?? [])
    .filter((task) => task.startMs >= measurementStartMs);
  const applicationLongTasks = longTasks.filter((task) => task.applicationAttributed);
  const unattributedLongTasks = longTasks.filter((task) => !task.applicationAttributed);
  const workspaceMeasures = phaseMeasures
    .filter((measure) => measure.name.endsWith('ui.tactical-workspace.update'))
    .map((measure) => measure.durationMs);

  return {
    version: 1,
    reportVersion: final.version,
    build: final.build ?? null,
    scene: final.scene ?? null,
    measurementSeconds: Math.round((final.runtimeSeconds * 1000 - measurementStartMs) / 100) / 10,
    warmupSnapshot,
    finalSnapshot,
    browser: {
      frameMs: stats(measurementSamples.flatMap((sample) => sample.frameMs === null ? [] : [sample.frameMs])),
      simulationUpdateMs: stats(measurementSamples.map((sample) => sample.simulationUpdateMs)),
      applicationUpdateMs: stats(measurementSamples.map((sample) => sample.applicationUpdateMs)),
      sceneUpdateMs: stats(measurementSamples.map((sample) => sample.sceneUpdateMs)),
      sampleCount: measurementSamples.length,
    },
    scheduler: {
      decisionCycles: scheduler.decisionCycles,
      decisionUnitPasses: scheduler.decisionUnitPasses,
      slowestCycles: scheduler.slowestCycles,
      slowestUnitPasses: scheduler.slowestUnitPasses,
    },
    workspace: {
      measuredSlowUpdateCount: workspaceMeasures.length,
      measuredSlowUpdateMs: stats(workspaceMeasures),
    },
    applicationAttribution: {
      totalLongTasks: longTasks.length,
      applicationAttributedLongTasks: applicationLongTasks,
      unattributedLongTasks,
    },
    fieldBuildDeltas: {
      directionalTactical: diagnosticDelta(warmup, final, 'directionalTactical', 'buildCount'),
      visibilityGeometry: diagnosticDelta(warmup, final, 'visibilityGeometry', 'geometryBuildCount'),
      soldierDangerGeometry: diagnosticDelta(warmup, final, 'soldierDangerField', 'geometryBuildCount'),
      soldierDangerFields: diagnosticDelta(warmup, final, 'soldierDangerField', 'fieldBuildCount'),
      threatRelativeCover: diagnosticDelta(warmup, final, 'threatRelativeCover', 'geometryBuildCount'),
    },
    contextualSlowFieldEvents: contextualEvents
      .filter((event) => event.name.startsWith('field.'))
      .sort((left, right) => right.durationMs - left.durationMs)
      .slice(0, 100),
  };
}

function assertAcceptance(evidence: ReturnType<typeof buildEvidence>): void {
  expect(evidence.scheduler.decisionCycles.p95Ms, 'scheduler decision-cycle p95').toBeLessThanOrEqual(8);
  expect(evidence.scheduler.decisionCycles.maxMs, 'scheduler decision-cycle max').toBeLessThanOrEqual(16);
  expect(evidence.browser.simulationUpdateMs.p95Ms, 'SimulationTick p95').toBeLessThanOrEqual(12);
  expect(evidence.browser.simulationUpdateMs.maxMs, 'SimulationTick max').toBeLessThanOrEqual(25);
  expect(evidence.workspace.measuredSlowUpdateMs.p95Ms, 'workspace slow-measure p95').toBeLessThanOrEqual(8);
  expect(evidence.workspace.measuredSlowUpdateMs.maxMs, 'workspace update max').toBeLessThanOrEqual(16);
  expect(evidence.applicationAttribution.applicationAttributedLongTasks).toHaveLength(0);
  expect(evidence.applicationAttribution.unattributedLongTasks).toHaveLength(0);
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
  section: 'directionalTactical' | 'visibilityGeometry' | 'soldierDangerField' | 'threatRelativeCover',
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
