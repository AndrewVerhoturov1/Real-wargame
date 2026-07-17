import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

interface NumericStats {
  readonly count: number;
  readonly avg?: number;
  readonly avgMs?: number;
  readonly p50?: number;
  readonly p50Ms?: number;
  readonly p95?: number;
  readonly p95Ms?: number;
  readonly p99?: number;
  readonly p99Ms?: number;
  readonly max?: number;
  readonly maxMs?: number;
}

interface BrowserPerformanceReportV6 {
  readonly version: 'performance-report-v6';
  readonly schemaVersion: 6;
  readonly summary: {
    readonly identity: {
      readonly branch: string;
      readonly commitSha: string;
      readonly buildId: string;
      readonly reportVersion: string;
      readonly contractVersion: string;
      readonly sessionId: string;
      readonly captureId: string;
    };
    readonly runtimeSeconds: number;
    readonly verdict: string;
    readonly scenePopulation: {
      readonly initial: { readonly unitCount: number };
      readonly measurementStart: { readonly unitCount: number };
      readonly minimum: { readonly unitCount: number };
      readonly maximum: { readonly unitCount: number };
      readonly final: { readonly unitCount: number; readonly unitsBySide: Record<string, number> };
    };
    readonly worstWindows: ReadonlyArray<Record<string, unknown>>;
    readonly diagnoses: ReadonlyArray<{ readonly code: string; readonly severity: string; readonly evidence: Record<string, unknown> }>;
    readonly reportHealth: {
      readonly exportCompleted: boolean;
      readonly samplesRecorded: number;
      readonly samplesDropped: number;
      readonly eventsRecorded: number;
      readonly eventsDropped: number;
      readonly truncatedSections: readonly string[];
      readonly telemetryCostMs: {
        readonly collection: NumericStats;
        readonly checkpointWrite: NumericStats;
        readonly export: NumericStats;
      };
      readonly estimatedReportBytes: number;
      readonly recoveredFromCheckpoint: boolean;
      readonly possibleMissingTailMs: number;
    };
    readonly semanticHealth: Record<string, unknown> & { readonly violations: readonly unknown[] };
  };
  readonly report: {
    readonly queues: Record<string, {
      readonly created: number;
      readonly completed: number;
      readonly failed: number;
      readonly currentDepth: number;
      readonly maximumDepth: number;
      readonly waitMs: NumericStats;
      readonly slowestWaits: readonly unknown[];
    }>;
    readonly navigation: {
      readonly pathfinding: Record<string, number | Record<string, unknown>>;
      readonly slowestSearches: readonly unknown[];
      readonly unitOutliers: readonly unknown[];
    };
    readonly workerDiagnostics: Record<string, { readonly failed: number; readonly timedOut: number }>;
    readonly semanticHealth: Record<string, unknown>;
    readonly legacyDiagnostics: {
      readonly computation?: {
        readonly aiScheduler?: {
          readonly decisionCycles: NumericStats;
          readonly decisionUnitPasses: NumericStats;
          readonly recentUnitPasses: ReadonlyArray<{ readonly unitId: string; readonly graphTicked: boolean }>;
        };
        readonly routeCostWorker?: { readonly workerErrors?: number };
      };
      readonly longTaskClassification?: ReadonlyArray<{ readonly classification?: string; readonly scenario?: string }>;
    };
  };
  readonly trace: {
    readonly frames: ReadonlyArray<{
      readonly tMs: number;
      readonly frameMs: number | null;
      readonly simulationUpdateMs: number;
      readonly applicationUpdateMs: number;
    }>;
    readonly sceneTimeline: ReadonlyArray<{ readonly tMs: number; readonly unitCount: number; readonly unitsWaitingForRoute: number }>;
    readonly events: ReadonlyArray<{ readonly type: string; readonly tMs: number; readonly operationId?: string; readonly data: Record<string, unknown> }>;
    readonly slowOperations: ReadonlyArray<Record<string, unknown>>;
    readonly userMarkers: ReadonlyArray<{ readonly type: string; readonly data: Record<string, unknown> }>;
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
  addUnits(targetCount: number): LiveHarnessSnapshot;
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
  ?? path.join('artifacts', 'performance', 'performance-report-v6-browser', 'after-browser.json');
const EXPECTED_BRANCH = process.env.LIVE_WINDOWS_PERF_EXPECTED_BRANCH ?? '';
const EXPECTED_SHA = process.env.LIVE_WINDOWS_PERF_EXPECTED_SHA ?? '';
const BASE_SHA = process.env.LIVE_WINDOWS_PERF_BASE_SHA ?? '';
const WORKFLOW_RUN_ID = process.env.LIVE_WINDOWS_PERF_WORKFLOW_RUN_ID ?? '';
const BASELINE_MS = Math.max(90_000, Number(process.env.LIVE_WINDOWS_PERF_DURATION_MS ?? 90_000));
const INTERACTION_STEP_MS = 5_000;
const MASS_SCENARIO_MS = 12_000;
const ENFORCE = process.env.LIVE_WINDOWS_PERF_ENFORCE !== '0';
const MARKER = 'Добавил 94 бойца через editor API и продолжил симуляцию';
const LAYERS = ['danger', 'memory', 'stealth', 'danger'] as const;

test.setTimeout(BASELINE_MS + MASS_SCENARIO_MS + 300_000);

test('exports honest v6 evidence for six-unit baseline, 6→100 route burst and checkpoint recovery', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?visualQa=live-windows-performance');
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__realWargameLiveWindowsPerformance));

  const initial = await page.evaluate(() => window.__realWargameLiveWindowsPerformance!.getSnapshot());
  expect(initial.unitCount).toBe(6);
  expect(initial.graphUnitCount).toBe(6);

  const started = await page.evaluate(() => window.__realWargameLiveWindowsPerformance!.start());
  expect(started.movingUnitCount).toBeGreaterThanOrEqual(4);
  const baselineSteps = Math.ceil(BASELINE_MS / INTERACTION_STEP_MS);
  for (let step = 0; step < baselineSteps; step += 1) {
    await page.evaluate(({ currentStep, layer }) => {
      const api = window.__realWargameLiveWindowsPerformance;
      if (!api) throw new Error('Live performance harness is unavailable.');
      api.selectUnit(currentStep);
      api.setLayer(layer);
      api.refreshContacts();
      if (currentStep % 3 === 0) api.retargetAll(currentStep + 1);
    }, { currentStep: step, layer: LAYERS[step % LAYERS.length] });
    await page.waitForTimeout(INTERACTION_STEP_MS);
  }
  const baselineStopped = await page.evaluate(() => window.__realWargameLiveWindowsPerformance!.stop());
  const baselineReport = await downloadNormalReport(page);
  assertIdentity(baselineReport);

  const afterEditor = await page.evaluate(() => window.__realWargameLiveWindowsPerformance!.addUnits(100));
  expect(afterEditor.unitCount).toBe(100);
  expect(afterEditor.graphUnitCount).toBe(100);
  await page.waitForTimeout(1000);
  await addMarkerThroughUi(page, MARKER);
  const massStarted = await page.evaluate(() => window.__realWargameLiveWindowsPerformance!.start());
  expect(massStarted.unitCount).toBe(100);
  expect(massStarted.movingUnitCount).toBeGreaterThanOrEqual(4);
  await page.waitForTimeout(MASS_SCENARIO_MS);
  const massStopped = await page.evaluate(() => window.__realWargameLiveWindowsPerformance!.stop());
  const massReport = await downloadNormalReport(page);
  assertIdentity(massReport);
  assertMassReport(massReport);

  await page.waitForTimeout(5500);
  await page.reload();
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(() => Boolean(document.querySelector('[data-performance-recovery="export"]')));
  const recoveredReport = await downloadRecoveredReport(page);
  assertRecoveredReport(recoveredReport, massReport.summary.identity.captureId);

  const evidence = buildEvidence(initial, started, baselineStopped, afterEditor, massStarted, massStopped, baselineReport, massReport, recoveredReport);
  const blockingFailures = collectBlockingFailures(evidence);
  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  writeFileSync(path.join(path.dirname(OUTPUT_PATH), 'performance-report-v6.json'), `${JSON.stringify(massReport, null, 2)}\n`, 'utf8');
  writeFileSync(path.join(path.dirname(OUTPUT_PATH), 'performance-report-v6-recovered.json'), `${JSON.stringify(recoveredReport, null, 2)}\n`, 'utf8');
  writeFileSync(path.join(path.dirname(OUTPUT_PATH), 'acceptance-result.json'), `${JSON.stringify({
    baseSha: BASE_SHA,
    headSha: EXPECTED_SHA || massReport.summary.identity.commitSha,
    enforceEnabled: ENFORCE,
    allThresholdsPassed: blockingFailures.length === 0,
    blockingFailures,
    workflowRunIds: WORKFLOW_RUN_ID ? [Number(WORKFLOW_RUN_ID)] : [],
  }, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(evidence, null, 2));
  if (ENFORCE) expect(blockingFailures, blockingFailures.join('\n')).toEqual([]);
});

function buildEvidence(
  initial: LiveHarnessSnapshot,
  started: LiveHarnessSnapshot,
  baselineStopped: LiveHarnessSnapshot,
  afterEditor: LiveHarnessSnapshot,
  massStarted: LiveHarnessSnapshot,
  massStopped: LiveHarnessSnapshot,
  baseline: BrowserPerformanceReportV6,
  mass: BrowserPerformanceReportV6,
  recovered: BrowserPerformanceReportV6,
) {
  const scheduler = baseline.report.legacyDiagnostics.computation?.aiScheduler;
  if (!scheduler) throw new Error('V6 report is missing legacy AI scheduler diagnostics.');
  const graphUnitPassIds = [...new Set(scheduler.recentUnitPasses.filter((pass) => pass.graphTicked).map((pass) => pass.unitId))].sort();
  const routeQueue = mass.report.queues.routePlanning;
  const marker = mass.trace.userMarkers.find((event) => event.data.label === MARKER) ?? null;
  const editorEvent = mass.trace.events.find((event) => event.type === 'editor.units-created') ?? null;
  const slowestSearch = mass.report.navigation.slowestSearches[0] ?? null;
  const worstWindow = mass.summary.worstWindows.find((window) => Number(window.durationMs) === 5000) ?? mass.summary.worstWindows[0] ?? null;
  return {
    version: 6,
    enforceEnabled: ENFORCE,
    build: mass.summary.identity,
    baseline: {
      runtimeSeconds: baseline.summary.runtimeSeconds,
      initial,
      started,
      stopped: baselineStopped,
      scheduler: {
        decisionCycles: scheduler.decisionCycles,
        decisionUnitPasses: scheduler.decisionUnitPasses,
        graphUnitPassIds,
      },
      frameMs: stats(baseline.trace.frames.flatMap((frame) => frame.frameMs === null ? [] : [frame.frameMs])),
      simulationUpdateMs: stats(baseline.trace.frames.map((frame) => frame.simulationUpdateMs)),
      applicationUpdateMs: stats(baseline.trace.frames.map((frame) => frame.applicationUpdateMs)),
      telemetryCollection: baseline.summary.reportHealth.telemetryCostMs.collection,
      workerErrors: Number(baseline.report.legacyDiagnostics.computation?.routeCostWorker?.workerErrors ?? 0),
      semanticHealth: baseline.summary.semanticHealth,
    },
    dynamicPopulation: {
      initial: mass.summary.scenePopulation.initial.unitCount,
      minimum: mass.summary.scenePopulation.minimum.unitCount,
      maximum: mass.summary.scenePopulation.maximum.unitCount,
      final: mass.summary.scenePopulation.final.unitCount,
      unitsBySide: mass.summary.scenePopulation.final.unitsBySide,
      timelineObservedCounts: [...new Set(mass.trace.sceneTimeline.map((entry) => entry.unitCount))],
      afterEditor,
      massStarted,
      massStopped,
      editorEvent,
    },
    routeBurst: {
      maximumQueueDepth: routeQueue.maximumDepth,
      requestsCreated: routeQueue.created,
      requestsCompleted: routeQueue.completed,
      requestsFailed: routeQueue.failed,
      waitMs: routeQueue.waitMs,
      slowestSearch,
      worstWindow,
      diagnosis: mass.summary.diagnoses.find((item) => item.code === 'ROUTE_QUEUE_OVERLOAD') ?? null,
    },
    userMarker: marker,
    reportHealth: mass.summary.reportHealth,
    semanticHealth: mass.summary.semanticHealth,
    checkpoint: {
      recoveredFromCheckpoint: recovered.summary.reportHealth.recoveredFromCheckpoint,
      exportCompleted: recovered.summary.reportHealth.exportCompleted,
      possibleMissingTailMs: recovered.summary.reportHealth.possibleMissingTailMs,
      verdict: recovered.summary.verdict,
      captureId: recovered.summary.identity.captureId,
    },
  };
}

function collectBlockingFailures(evidence: ReturnType<typeof buildEvidence>): string[] {
  const failures: string[] = [];
  const check = (condition: boolean, message: string): void => { if (!condition) failures.push(message); };
  const cycles = evidence.baseline.scheduler.decisionCycles;
  const unitPasses = evidence.baseline.scheduler.decisionUnitPasses;
  check(evidence.enforceEnabled, 'enforceEnabled must be true');
  check(evidence.baseline.runtimeSeconds >= 90, `baseline runtime ${evidence.baseline.runtimeSeconds}s < 90s`);
  check(p95(cycles) <= 8, `scheduler decision-cycle p95 ${p95(cycles)} > 8ms`);
  check(max(cycles) <= 16, `scheduler decision-cycle max ${max(cycles)} > 16ms`);
  check(p95(unitPasses) <= 2, `per-unit decision pass p95 ${p95(unitPasses)} > 2ms`);
  check(max(unitPasses) <= 10, `per-unit decision pass max ${max(unitPasses)} > 10ms`);
  check(evidence.baseline.scheduler.graphUnitPassIds.length >= 6, `only ${evidence.baseline.scheduler.graphUnitPassIds.length} graph units received scheduler passes`);
  check(evidence.baseline.workerErrors === 0, `${evidence.baseline.workerErrors} route worker errors`);
  check(p95(evidence.baseline.telemetryCollection) <= 0.10, `telemetry collection p95 ${p95(evidence.baseline.telemetryCollection)} > 0.10ms`);
  check(max(evidence.baseline.telemetryCollection) <= 1, `telemetry collection max ${max(evidence.baseline.telemetryCollection)} > 1ms`);
  check(evidence.dynamicPopulation.initial === 6, `initial population ${evidence.dynamicPopulation.initial} != 6`);
  check(evidence.dynamicPopulation.maximum === 100, `maximum population ${evidence.dynamicPopulation.maximum} != 100`);
  check(evidence.dynamicPopulation.final === 100, `final population ${evidence.dynamicPopulation.final} != 100`);
  check(evidence.dynamicPopulation.timelineObservedCounts.includes(6), 'scene timeline does not include 6 units');
  check(evidence.dynamicPopulation.timelineObservedCounts.includes(100), 'scene timeline does not include 100 units');
  check(Boolean(evidence.dynamicPopulation.editorEvent), 'editor.units-created event is missing');
  check(evidence.routeBurst.maximumQueueDepth >= 100, `route queue maximum depth ${evidence.routeBurst.maximumQueueDepth} < 100`);
  check(evidence.routeBurst.requestsCreated >= 100, `route requests ${evidence.routeBurst.requestsCreated} < 100`);
  check(Boolean(evidence.routeBurst.slowestSearch), 'slowest route search is missing');
  check(Boolean(evidence.routeBurst.worstWindow), 'worst 5-second window is missing');
  check(Boolean(evidence.routeBurst.diagnosis), 'ROUTE_QUEUE_OVERLOAD diagnosis is missing');
  check(Boolean(evidence.userMarker), 'user marker is missing');
  check(evidence.reportHealth.samplesRecorded > 0, 'report recorded no frame samples');
  check(evidence.reportHealth.estimatedReportBytes > 0, 'estimated report bytes are missing');
  check(evidence.semanticHealth.violations.length === 0, `${evidence.semanticHealth.violations.length} semantic violations observed`);
  check(evidence.checkpoint.recoveredFromCheckpoint, 'recovered report is not marked recoveredFromCheckpoint');
  check(!evidence.checkpoint.exportCompleted, 'recovered report incorrectly claims normal export completion');
  check(evidence.checkpoint.verdict === 'incomplete', `recovered verdict ${evidence.checkpoint.verdict} != incomplete`);
  return failures;
}

function assertMassReport(report: BrowserPerformanceReportV6): void {
  expect(report.version).toBe('performance-report-v6');
  expect(report.schemaVersion).toBe(6);
  expect(report.summary.scenePopulation.initial.unitCount).toBe(6);
  expect(report.summary.scenePopulation.maximum.unitCount).toBe(100);
  expect(report.summary.scenePopulation.final.unitCount).toBe(100);
  expect(report.trace.sceneTimeline.some((entry) => entry.unitCount === 100)).toBe(true);
  expect(report.trace.events.some((event) => event.type === 'editor.units-created')).toBe(true);
  expect(report.trace.userMarkers.some((event) => event.data.label === MARKER)).toBe(true);
  expect(report.report.queues.routePlanning.maximumDepth).toBeGreaterThanOrEqual(100);
  expect(report.summary.worstWindows).toHaveLength(3);
}

function assertRecoveredReport(report: BrowserPerformanceReportV6, expectedCaptureId: string): void {
  expect(report.version).toBe('performance-report-v6');
  expect(report.summary.identity.captureId).toBe(expectedCaptureId);
  expect(report.summary.reportHealth.recoveredFromCheckpoint).toBe(true);
  expect(report.summary.reportHealth.exportCompleted).toBe(false);
  expect(report.summary.reportHealth.possibleMissingTailMs).toBeGreaterThanOrEqual(0);
  expect(report.summary.verdict).toBe('incomplete');
}

function assertIdentity(report: BrowserPerformanceReportV6): void {
  expect(report.version).toBe('performance-report-v6');
  expect(report.schemaVersion).toBe(6);
  expect(report.summary.identity.reportVersion).toBe('performance-report-v6');
  if (EXPECTED_BRANCH) expect(report.summary.identity.branch).toBe(EXPECTED_BRANCH);
  if (EXPECTED_SHA) expect(report.summary.identity.commitSha).toBe(EXPECTED_SHA);
}

async function addMarkerThroughUi(page: Page, label: string): Promise<void> {
  page.once('dialog', async (dialog) => dialog.accept(label));
  await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('[data-performance-marker="add"]');
    if (!button) throw new Error('Performance marker control is missing.');
    button.click();
  });
  await page.waitForTimeout(250);
}

async function downloadNormalReport(page: Page): Promise<BrowserPerformanceReportV6> {
  return downloadReport(page, '[data-performance-export="v6"]');
}

async function downloadRecoveredReport(page: Page): Promise<BrowserPerformanceReportV6> {
  return downloadReport(page, '[data-performance-recovery="export"]');
}

async function downloadReport(page: Page, selector: string): Promise<BrowserPerformanceReportV6> {
  const downloadPromise = page.waitForEvent('download');
  await page.evaluate((targetSelector) => {
    const button = document.querySelector<HTMLButtonElement>(targetSelector);
    if (!button) throw new Error(`Performance report control is missing: ${targetSelector}`);
    button.click();
  }, selector);
  const download = await downloadPromise;
  const downloadedPath = await download.path();
  if (!downloadedPath) throw new Error('Performance report download path is unavailable.');
  return JSON.parse(readFileSync(downloadedPath, 'utf8')) as BrowserPerformanceReportV6;
}

function stats(values: readonly number[]): NumericStats {
  if (values.length === 0) return { count: 0, avg: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  const sorted = [...values].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    count: sorted.length,
    avg: roundTwo(total / sorted.length),
    p50: roundTwo(percentile(sorted, 0.50)),
    p95: roundTwo(percentile(sorted, 0.95)),
    p99: roundTwo(percentile(sorted, 0.99)),
    max: roundTwo(sorted[sorted.length - 1] ?? 0),
  };
}

function percentile(values: readonly number[], fraction: number): number {
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * fraction) - 1));
  return values[index] ?? 0;
}

function p95(value: NumericStats): number { return Number(value.p95 ?? value.p95Ms ?? 0); }
function max(value: NumericStats): number { return Number(value.max ?? value.maxMs ?? 0); }
function roundTwo(value: number): number { return Math.round(value * 100) / 100; }
