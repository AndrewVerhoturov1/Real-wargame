import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

interface PerformanceSample {
  tMs: number;
  frameMs: number | null;
  sceneUpdateMs: number;
  layerMode: string;
}

interface BuildIdentity {
  branch: string;
  commitSha: string;
  buildId: string;
  generatedAt: string;
  performanceContractVersion: string;
}

interface SoldierDangerDiagnostics {
  geometryBuildCount: number;
  fieldBuildCount: number;
  geometryCacheHitCount: number;
  fieldCacheHitCount: number;
  fullMapScanCount: number;
  cachedGeometryCount: number;
  cachedThreatGeometryCount: number;
  cachedFieldCount: number;
  retainedThreatGeometryBytes: number;
  retainedFieldBytes: number;
  retainedTypedArrayBytes: number;
  lastGeometryKey: string;
  lastFieldKey: string;
}

interface PerformanceReport {
  version: string;
  build?: BuildIdentity;
  scene?: {
    mapWidthCells?: number;
    mapHeightCells?: number;
  };
  computation?: Record<string, unknown>;
  longTasks: Array<{ startMs: number; durationMs: number }>;
  samples: PerformanceSample[];
}

interface AwarenessDiagnostics {
  rebuildCount: number;
  lastBuildMs: number;
  maxBuildMs: number;
}

interface BrowserTimingResult {
  durationMs: number;
  frameMs: number[];
  longTaskMs: number[];
}

interface DangerFieldPerformanceEvidence {
  classifiedThreatCount: number;
  initial: SoldierDangerDiagnostics;
  afterRescore: SoldierDangerDiagnostics;
  afterGeometryMove: SoldierDangerDiagnostics;
  rescoreGeometryBuildDelta: number;
  rescoreFieldBuildDelta: number;
  rescoreFullMapScanDelta: number;
  geometryMoveBuildDelta: number;
  geometryMoveFieldBuildDelta: number;
  geometryMoveFullMapScanDelta: number;
  maximumRetainedTypedArrayBytes: number;
}

interface BrowserPerformanceSummary {
  label: string;
  reportVersion: string;
  build: BuildIdentity | null;
  measurementSeconds: number;
  sampleCount: number;
  browserEffectiveFps: number;
  browserRafMs: Stats;
  sceneUpdateMs: Stats;
  firstDynamicUpdateMs: number;
  dynamicUpdateMs: Stats;
  steadyDynamicUpdateMs: Stats;
  framesOver50Ms: number;
  framesOver100Ms: number;
  longTasksOver100Ms: number;
  awareness: AwarenessDiagnostics | null;
  computation: Record<string, unknown> | null;
  soldierDangerField: DangerFieldPerformanceEvidence | null;
}

interface Stats {
  min: number;
  avg: number;
  p95: number;
  max: number;
}

interface ExtendedCombatVisualApi {
  setScenario(scenario: string): { unitThreatCount?: number };
  setDangerParityPhase(phase: string): { unitThreatCount?: number };
  stepDangerPerformanceDynamicUpdate(step: number): void;
  stepDangerPerformanceGeometryUpdate(step: number): void;
}

const OUTPUT_PATH = process.env.DANGER_PERF_OUTPUT
  ?? path.join('artifacts', 'performance', 'danger-layer-browser-performance.json');
const LABEL = process.env.DANGER_PERF_LABEL ?? 'candidate';
const EXPECTED_BRANCH = process.env.DANGER_PERF_EXPECTED_BRANCH ?? '';
const EXPECTED_SHA = process.env.DANGER_PERF_EXPECTED_SHA ?? '';
const IS_CANDIDATE = LABEL !== 'before-base';
// Nearest-rank p95 needs at least 20 observations before a single runner hiccup
// stops being the percentile itself. Sixty mutations give both exact builds a
// representative CPU sample while preserving the independent max <= 50 ms gate.
const UPDATE_COUNT = 60;
const UPDATE_INTERVAL_MS = 300;
const REPORT_WINDOW_MS = 22_000;
const MINIMUM_SCENE_SAMPLE_COUNT = 25;

 test('records paused multi-threat danger rescoring without screenshots', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?visualQa=combat-tactical-integration');
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__realWargameCombatTacticalVisualQa));

  const classifiedThreatCount = await page.evaluate(() => {
    const api = window.__realWargameCombatTacticalVisualQa as unknown as ExtendedCombatVisualApi | undefined;
    if (!api) throw new Error('Combat tactical visual QA API is unavailable.');
    api.setScenario('danger-route-cost-parity');
    return api.setDangerParityPhase('rifle-and-machine-gun').unitThreatCount ?? 0;
  });
  await page.waitForFunction(() => {
    const diagnostics = (window as Window & {
      __realWargameAwarenessDebug?: AwarenessDiagnostics;
    }).__realWargameAwarenessDebug;
    return Boolean(diagnostics && diagnostics.rebuildCount > 0);
  });
  await expect(page.locator('#pause-toggle')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(500);

  const initialReport = await downloadPerformanceReport(page);
  const initialDanger = readSoldierDangerDiagnostics(initialReport);
  if (IS_CANDIDATE) {
    expect(classifiedThreatCount).toBeGreaterThanOrEqual(3);
    expect(initialDanger, 'candidate performance report must publish SoldierDangerField diagnostics').not.toBeNull();
    expect(initialDanger?.geometryBuildCount ?? 0).toBeGreaterThanOrEqual(3);
  }

  await startBrowserTiming(page);
  const dynamicUpdateMs: number[] = [];
  for (let step = 0; step < UPDATE_COUNT; step += 1) {
    const elapsed = await page.evaluate((currentStep) => {
      const api = window.__realWargameCombatTacticalVisualQa as unknown as ExtendedCombatVisualApi | undefined;
      if (!api) throw new Error('Combat tactical visual QA API is unavailable.');
      const startedAt = performance.now();
      api.stepDangerPerformanceDynamicUpdate(currentStep);
      return performance.now() - startedAt;
    }, step);
    dynamicUpdateMs.push(elapsed);
    await page.waitForTimeout(UPDATE_INTERVAL_MS);
  }
  await page.waitForTimeout(500);
  const browserTiming = await stopBrowserTiming(page);

  const afterRescoreReport = await downloadPerformanceReport(page);
  const afterRescoreDanger = readSoldierDangerDiagnostics(afterRescoreReport);
  if (IS_CANDIDATE) {
    expect(afterRescoreDanger).not.toBeNull();
    expect(afterRescoreDanger?.geometryBuildCount).toBe(initialDanger?.geometryBuildCount);
    expect(afterRescoreDanger?.fullMapScanCount).toBe(initialDanger?.fullMapScanCount);
    expect(afterRescoreDanger?.fieldBuildCount ?? 0).toBeGreaterThan(initialDanger?.fieldBuildCount ?? 0);
  }

  await page.evaluate(() => {
    const api = window.__realWargameCombatTacticalVisualQa as unknown as ExtendedCombatVisualApi | undefined;
    if (!api) throw new Error('Combat tactical visual QA API is unavailable.');
    api.stepDangerPerformanceGeometryUpdate(1);
  });
  await page.waitForTimeout(750);
  const finalReport = await downloadPerformanceReport(page);
  const afterGeometryMoveDanger = readSoldierDangerDiagnostics(finalReport);
  if (IS_CANDIDATE) {
    expect(afterGeometryMoveDanger).not.toBeNull();
    expect(afterGeometryMoveDanger?.geometryBuildCount).toBe((afterRescoreDanger?.geometryBuildCount ?? 0) + 1);
    expect(afterGeometryMoveDanger?.fullMapScanCount).toBe((afterRescoreDanger?.fullMapScanCount ?? 0) + 1);
    expect(afterGeometryMoveDanger?.fieldBuildCount ?? 0).toBeGreaterThan(afterRescoreDanger?.fieldBuildCount ?? 0);
  }

  const awareness = await page.evaluate(() => (
    window as Window & { __realWargameAwarenessDebug?: AwarenessDiagnostics }
  ).__realWargameAwarenessDebug ?? null);
  const dangerEvidence = IS_CANDIDATE
    ? buildDangerEvidence(
        classifiedThreatCount,
        initialDanger,
        afterRescoreDanger,
        afterGeometryMoveDanger,
        finalReport,
      )
    : null;
  const summary = summarize(finalReport, awareness, browserTiming, dynamicUpdateMs, dangerEvidence);
  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(summary, null, 2));

  // Both exact builds must contribute enough scene samples for nearest-rank p95
  // to represent sustained behavior rather than a single scheduler outlier.
  expect(summary.sampleCount).toBeGreaterThanOrEqual(MINIMUM_SCENE_SAMPLE_COUNT);
  expect(summary.measurementSeconds).toBeGreaterThan(18);
  expect(dynamicUpdateMs).toHaveLength(UPDATE_COUNT);
  expect(browserTiming.frameMs.length).toBeGreaterThan(40);
});

async function startBrowserTiming(page: Page): Promise<void> {
  await page.evaluate(() => {
    type TimingWindow = Window & {
      __dangerLayerBrowserTiming?: {
        startedAt: number;
        lastFrameAt: number | null;
        frameMs: number[];
        longTaskMs: number[];
        stopped: boolean;
        observer: PerformanceObserver | null;
      };
    };
    const timingWindow = window as TimingWindow;
    const state = {
      startedAt: performance.now(),
      lastFrameAt: null as number | null,
      frameMs: [] as number[],
      longTaskMs: [] as number[],
      stopped: false,
      observer: null as PerformanceObserver | null,
    };
    if (typeof PerformanceObserver !== 'undefined'
      && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      state.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) state.longTaskMs.push(entry.duration);
      });
      state.observer.observe({ entryTypes: ['longtask'] });
    }
    timingWindow.__dangerLayerBrowserTiming = state;
    const sample = (now: number): void => {
      if (state.stopped) return;
      if (state.lastFrameAt !== null) state.frameMs.push(now - state.lastFrameAt);
      state.lastFrameAt = now;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

async function stopBrowserTiming(page: Page): Promise<BrowserTimingResult> {
  return page.evaluate(async () => {
    type TimingWindow = Window & {
      __dangerLayerBrowserTiming?: {
        startedAt: number;
        lastFrameAt: number | null;
        frameMs: number[];
        longTaskMs: number[];
        stopped: boolean;
        observer: PerformanceObserver | null;
      };
    };
    const state = (window as TimingWindow).__dangerLayerBrowserTiming;
    if (!state) throw new Error('Browser timing state is unavailable.');
    state.stopped = true;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    state.observer?.disconnect();
    return {
      durationMs: performance.now() - state.startedAt,
      frameMs: state.frameMs,
      longTaskMs: state.longTaskMs,
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
  const report = JSON.parse(readFileSync(downloadedPath, 'utf8')) as PerformanceReport;
  assertBuildIdentity(report);
  return report;
}

function readSoldierDangerDiagnostics(report: PerformanceReport): SoldierDangerDiagnostics | null {
  const value = report.computation?.soldierDangerField;
  if (!value || typeof value !== 'object') return null;
  return value as SoldierDangerDiagnostics;
}

function buildDangerEvidence(
  classifiedThreatCount: number,
  initial: SoldierDangerDiagnostics | null,
  afterRescore: SoldierDangerDiagnostics | null,
  afterGeometryMove: SoldierDangerDiagnostics | null,
  report: PerformanceReport,
): DangerFieldPerformanceEvidence {
  expect(initial).not.toBeNull();
  expect(afterRescore).not.toBeNull();
  expect(afterGeometryMove).not.toBeNull();
  const initialValue = initial as SoldierDangerDiagnostics;
  const afterRescoreValue = afterRescore as SoldierDangerDiagnostics;
  const afterGeometryMoveValue = afterGeometryMove as SoldierDangerDiagnostics;
  const cellCount = Math.max(1, (report.scene?.mapWidthCells ?? 0) * (report.scene?.mapHeightCells ?? 0));
  return {
    classifiedThreatCount,
    initial: initialValue,
    afterRescore: afterRescoreValue,
    afterGeometryMove: afterGeometryMoveValue,
    rescoreGeometryBuildDelta: afterRescoreValue.geometryBuildCount - initialValue.geometryBuildCount,
    rescoreFieldBuildDelta: afterRescoreValue.fieldBuildCount - initialValue.fieldBuildCount,
    rescoreFullMapScanDelta: afterRescoreValue.fullMapScanCount - initialValue.fullMapScanCount,
    geometryMoveBuildDelta: afterGeometryMoveValue.geometryBuildCount - afterRescoreValue.geometryBuildCount,
    geometryMoveFieldBuildDelta: afterGeometryMoveValue.fieldBuildCount - afterRescoreValue.fieldBuildCount,
    geometryMoveFullMapScanDelta: afterGeometryMoveValue.fullMapScanCount - afterRescoreValue.fullMapScanCount,
    maximumRetainedTypedArrayBytes: cellCount * (24 * 9 + 12 * 7),
  };
}

function assertBuildIdentity(report: PerformanceReport): void {
  expect(report.version).toBe('performance-report-v4');
  expect(report.build?.performanceContractVersion).toBe('performance-report-v4');
  expect(report.build?.buildId).toBeTruthy();
  expect(report.build?.generatedAt).toBeTruthy();
  if (EXPECTED_BRANCH) expect(report.build?.branch).toBe(EXPECTED_BRANCH);
  if (EXPECTED_SHA) expect(report.build?.commitSha).toBe(EXPECTED_SHA);
}

function summarize(
  report: PerformanceReport,
  awareness: AwarenessDiagnostics | null,
  browserTiming: BrowserTimingResult,
  dynamicUpdates: number[],
  soldierDangerField: DangerFieldPerformanceEvidence | null,
): BrowserPerformanceSummary {
  const lastSample = report.samples.at(-1);
  const windowEnd = lastSample?.tMs ?? 0;
  const windowStart = Math.max(0, windowEnd - REPORT_WINDOW_MS);
  const samples = report.samples.filter((sample) => (
    sample.tMs >= windowStart && sample.layerMode === 'danger'
  ));
  const sceneValues = samples
    .map((sample) => sample.sceneUpdateMs)
    .filter((value) => value > 0.25)
    .slice(-UPDATE_COUNT);
  const frames = browserTiming.frameMs;

  return {
    label: LABEL,
    reportVersion: report.version,
    build: report.build ?? null,
    measurementSeconds: round(browserTiming.durationMs / 1000),
    sampleCount: sceneValues.length,
    browserEffectiveFps: browserTiming.durationMs > 0
      ? round(frames.length * 1000 / browserTiming.durationMs)
      : 0,
    browserRafMs: stats(frames),
    sceneUpdateMs: stats(sceneValues),
    firstDynamicUpdateMs: round(dynamicUpdates[0] ?? 0),
    dynamicUpdateMs: stats(dynamicUpdates),
    steadyDynamicUpdateMs: stats(dynamicUpdates.slice(1)),
    framesOver50Ms: frames.filter((value) => value > 50).length,
    framesOver100Ms: frames.filter((value) => value > 100).length,
    longTasksOver100Ms: browserTiming.longTaskMs.filter((value) => value > 100).length,
    awareness,
    computation: report.computation ?? null,
    soldierDangerField,
  };
}

function stats(values: number[]): Stats {
  if (values.length === 0) return { min: 0, avg: 0, p95: 0, max: 0 };
  const sorted = [...values].sort((left, right) => left - right);
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    min: round(sorted[0]),
    avg: round(total / values.length),
    p95: round(percentile(sorted, 0.95)),
    max: round(sorted[sorted.length - 1]),
  };
}

function percentile(sorted: number[], fraction: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index] ?? 0;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
