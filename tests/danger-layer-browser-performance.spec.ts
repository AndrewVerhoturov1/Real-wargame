import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

interface PerformanceSample {
  tMs: number;
  frameMs: number | null;
  sceneUpdateMs: number;
  layerMode: string;
}

interface PerformanceReport {
  version: string;
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

interface BrowserPerformanceSummary {
  label: string;
  reportVersion: string;
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
}

interface Stats {
  min: number;
  avg: number;
  p95: number;
  max: number;
}

const OUTPUT_PATH = process.env.DANGER_PERF_OUTPUT
  ?? path.join('artifacts', 'performance', 'danger-layer-browser-performance.json');
const LABEL = process.env.DANGER_PERF_LABEL ?? 'candidate';
const UPDATE_COUNT = 30;
const UPDATE_INTERVAL_MS = 300;
const REPORT_WINDOW_MS = 12_000;

test('records paused dynamic danger-layer rescoring without screenshots', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?visualQa=combat-tactical-integration');
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__realWargameCombatTacticalVisualQa));

  await page.evaluate(() => {
    window.__realWargameCombatTacticalVisualQa?.setScenario('slice1-near-miss-evidence-suppression');
  });
  await page.waitForFunction(() => {
    const diagnostics = (window as Window & {
      __realWargameAwarenessDebug?: AwarenessDiagnostics;
    }).__realWargameAwarenessDebug;
    return Boolean(diagnostics && diagnostics.rebuildCount > 0);
  });
  await expect(page.locator('#pause-toggle')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(500);
  await startBrowserTiming(page);

  const dynamicUpdateMs: number[] = [];
  for (let step = 0; step < UPDATE_COUNT; step += 1) {
    const elapsed = await page.evaluate((currentStep) => {
      const api = window.__realWargameCombatTacticalVisualQa;
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

  const awareness = await page.evaluate(() => (
    window as Window & { __realWargameAwarenessDebug?: AwarenessDiagnostics }
  ).__realWargameAwarenessDebug ?? null);
  const summary = summarize(report, awareness, browserTiming, dynamicUpdateMs);
  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(summary, null, 2));

  expect(summary.sampleCount).toBeGreaterThan(20);
  expect(summary.measurementSeconds).toBeGreaterThan(7);
  expect(dynamicUpdateMs).toHaveLength(UPDATE_COUNT);
  // The regressed baseline can block nearly every RAF opportunity. Twenty intervals are
  // enough to quantify it while still allowing the candidate measurement to run.
  expect(browserTiming.frameMs.length).toBeGreaterThan(20);
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

function summarize(
  report: PerformanceReport,
  awareness: AwarenessDiagnostics | null,
  browserTiming: BrowserTimingResult,
  dynamicUpdates: number[],
): BrowserPerformanceSummary {
  const lastSample = report.samples.at(-1);
  const windowEnd = lastSample?.tMs ?? 0;
  const windowStart = Math.max(0, windowEnd - REPORT_WINDOW_MS);
  const samples = report.samples.filter((sample) => (
    sample.tMs >= windowStart && sample.layerMode === 'danger'
  ));
  const sceneValues = samples.map((sample) => sample.sceneUpdateMs);
  const frames = browserTiming.frameMs;

  return {
    label: LABEL,
    reportVersion: report.version,
    measurementSeconds: round(browserTiming.durationMs / 1000),
    sampleCount: samples.length,
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
