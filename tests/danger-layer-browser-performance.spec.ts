import { expect, test } from '@playwright/test';
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

interface BrowserPerformanceSummary {
  label: string;
  reportVersion: string;
  measurementSeconds: number;
  sampleCount: number;
  effectiveFps: number;
  frameMs: Stats;
  sceneUpdateMs: Stats;
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
const WINDOW_MS = 12_000;

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

  for (let step = 0; step < UPDATE_COUNT; step += 1) {
    await page.evaluate((currentStep) => {
      const api = window.__realWargameCombatTacticalVisualQa;
      if (!api) throw new Error('Combat tactical visual QA API is unavailable.');
      api.stepDangerPerformanceDynamicUpdate(currentStep);
    }, step);
    await page.waitForTimeout(UPDATE_INTERVAL_MS);
  }
  await page.waitForTimeout(500);

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
  const summary = summarize(report, awareness);
  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(summary, null, 2));

  expect(summary.sampleCount).toBeGreaterThan(20);
  expect(summary.measurementSeconds).toBeGreaterThan(7);
});

function summarize(
  report: PerformanceReport,
  awareness: AwarenessDiagnostics | null,
): BrowserPerformanceSummary {
  const lastSample = report.samples.at(-1);
  const windowEnd = lastSample?.tMs ?? 0;
  const windowStart = Math.max(0, windowEnd - WINDOW_MS);
  const samples = report.samples.filter((sample) => (
    sample.tMs >= windowStart && sample.layerMode === 'danger'
  ));
  const frameValues = samples
    .map((sample) => sample.frameMs)
    .filter((value): value is number => typeof value === 'number');
  const sceneValues = samples.map((sample) => sample.sceneUpdateMs);
  const durationMs = samples.length > 1
    ? samples[samples.length - 1].tMs - samples[0].tMs
    : 0;
  const longTasks = report.longTasks.filter((task) => task.startMs >= windowStart);

  return {
    label: LABEL,
    reportVersion: report.version,
    measurementSeconds: round(durationMs / 1000),
    sampleCount: samples.length,
    effectiveFps: durationMs > 0 ? round((samples.length - 1) * 1000 / durationMs) : 0,
    frameMs: stats(frameValues),
    sceneUpdateMs: stats(sceneValues),
    framesOver50Ms: frameValues.filter((value) => value > 50).length,
    framesOver100Ms: frameValues.filter((value) => value > 100).length,
    longTasksOver100Ms: longTasks.filter((task) => task.durationMs > 100).length,
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
