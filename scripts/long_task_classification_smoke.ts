import assert from 'node:assert/strict';
import {
  adjustDurationForClassifiedHeadlessPauses,
  classifyLongTask,
  PARTIAL_SAFE_MAX_OVERLAP_MS,
  PARTIAL_SAFE_MAX_OVERLAP_RATIO,
} from '../src/core/debug/LongTaskClassification';
import type {
  ApplicationIntervalAttributionDiagnostic,
  BrowserLongTaskDiagnostic,
  LongAnimationFrameDiagnostic,
  PerformanceFrameSample,
  PerformancePhaseMeasureDiagnostic,
} from '../src/core/debug/PerformanceMonitor';

const phases: PerformancePhaseMeasureDiagnostic[] = [
  { name: 'real-wargame.phase.simulation.perception', startMs: 105, durationMs: 35 },
  { name: 'real-wargame.phase.ui.tactical-workspace.update', startMs: 305, durationMs: 8 },
];

const applicationBlocking = classifyLongTask(
  task(100, 60),
  attribution(100, 60, 35),
  phases,
  [],
  samples([90, 160]),
);
assert.equal(applicationBlocking.classification, 'application_blocking');
assert.equal(applicationBlocking.largestApplicationPhase, 'real-wargame.phase.simulation.perception');

const partialSafe = classifyLongTask(
  task(300, 80),
  attribution(300, 80, 8),
  phases,
  [],
  samples([290, 380]),
);
assert.equal(partialSafe.classification, 'application_partial_safe');
assert.ok(partialSafe.applicationOverlapMs <= PARTIAL_SAFE_MAX_OVERLAP_MS);
assert.ok(partialSafe.applicationOverlapRatio <= PARTIAL_SAFE_MAX_OVERLAP_RATIO);

const browserRendering = classifyLongTask(
  task(500, 80),
  attribution(500, 80, 0),
  [],
  [loaf(500, 80, { renderStartMs: 520, styleAndLayoutStartMs: 525, forcedStyleMs: 18 })],
  samples([490, 580]),
);
assert.equal(browserRendering.classification, 'browser_rendering');

const rendererBoundarySafe = classifyLongTask(
  task(1800, 60),
  attribution(1800, 60, 41.9),
  [
    { name: 'real-wargame.phase.simulation.movement-events', startMs: 1800, durationMs: 11.9 },
    { name: 'real-wargame.phase.ticker.render-frame', startMs: 1820, durationMs: 30 },
  ],
  [loaf(1800, 60, { renderStartMs: 1820, styleAndLayoutStartMs: 1848, forcedStyleMs: 0.1, scriptDurationMs: 30 })],
  samples([1790, 1860]),
);
assert.equal(rendererBoundarySafe.classification, 'browser_rendering');
assert.equal(rendererBoundarySafe.nonRendererApplicationOverlapMs, 11.9);
assert.ok(rendererBoundarySafe.nonRendererApplicationOverlapRatio < 0.20);
assert.equal(rendererBoundarySafe.largestNonRendererPhase, 'real-wargame.phase.simulation.movement-events');

const rendererOverMsBoundary = classifyLongTask(
  task(1900, 100),
  attribution(1900, 100, 62.1),
  [
    { name: 'real-wargame.phase.simulation.perception', startMs: 1900, durationMs: 12.1 },
    { name: 'real-wargame.phase.ticker.render-frame', startMs: 1930, durationMs: 50 },
  ],
  [loaf(1900, 100, { renderStartMs: 1930, styleAndLayoutStartMs: 1978, forcedStyleMs: 0.1, scriptDurationMs: 50 })],
  samples([1890, 2000]),
);
assert.equal(rendererOverMsBoundary.classification, 'application_blocking');

const rendererOverRatioBoundary = classifyLongTask(
  task(2050, 59.2),
  attribution(2050, 59.2, 35.9),
  [
    { name: 'real-wargame.phase.simulation.perception', startMs: 2050, durationMs: 11.9 },
    { name: 'real-wargame.phase.ticker.render-frame', startMs: 2070, durationMs: 24 },
  ],
  [loaf(2050, 59.2, { renderStartMs: 2070, styleAndLayoutStartMs: 2092, forcedStyleMs: 0.1, scriptDurationMs: 24 })],
  samples([2040, 2110]),
);
assert.ok(rendererOverRatioBoundary.nonRendererApplicationOverlapRatio > 0.20);
assert.equal(rendererOverRatioBoundary.classification, 'application_blocking');

const noRendererEvidence = classifyLongTask(
  task(2150, 80),
  attribution(2150, 80, 13),
  [{ name: 'real-wargame.phase.simulation.perception', startMs: 2150, durationMs: 13 }],
  [],
  samples([2140, 2230]),
);
assert.equal(noRendererEvidence.classification, 'application_blocking');

const rendererDominatedGameplayOverLimit = classifyLongTask(
  task(2250, 100),
  attribution(2250, 100, 63),
  [
    { name: 'real-wargame.phase.simulation.ai-scheduler', startMs: 2250, durationMs: 13 },
    { name: 'real-wargame.phase.ticker.render-frame', startMs: 2280, durationMs: 50 },
  ],
  [loaf(2250, 100, { renderStartMs: 2280, styleAndLayoutStartMs: 2328, forcedStyleMs: 0.1, scriptDurationMs: 50 })],
  samples([2240, 2350]),
);
assert.equal(rendererDominatedGameplayOverLimit.classification, 'application_blocking');

const rendererDominated = classifyLongTask(
  task(590, 400),
  attribution(590, 400, 64),
  [
    { name: 'real-wargame.phase.ticker.render-frame', startMs: 910, durationMs: 61 },
    { name: 'real-wargame.phase.simulation.movement-events', startMs: 970, durationMs: 3 },
  ],
  [loaf(590, 400, { renderStartMs: 910, styleAndLayoutStartMs: 973, forcedStyleMs: 0.1, scriptDurationMs: 63 })],
  samples([580, 990]),
);
assert.equal(rendererDominated.classification, 'browser_rendering');
assert.equal(rendererDominated.nonRendererApplicationOverlapMs, 3);
assert.equal(rendererDominated.largestNonRendererPhase, 'real-wargame.phase.simulation.movement-events');

const runnerPause = classifyLongTask(
  task(700, 500),
  attribution(700, 500, 38),
  [{ name: 'real-wargame.phase.simulation.perception', startMs: 1080, durationMs: 38 }],
  [loaf(700, 500, { renderStartMs: 1160, styleAndLayoutStartMs: 1190, forcedStyleMs: 1.3, scriptDurationMs: 45 })],
  samples([690, 1210]),
);
assert.equal(runnerPause.classification, 'headless_runner_pause');
assert.ok(runnerPause.rafOrTimerAttribution.measuredFrameGapMs >= 500);
assert.equal(runnerPause.applicationOverlapMs, 38);

const unscopedRunnerPause = classifyLongTask(
  { ...task(1220, 500), scenario: null },
  attribution(1220, 500, 0),
  [],
  [],
  samples([1210, 1720]),
);
assert.equal(unscopedRunnerPause.classification, 'headless_runner_pause');
assert.equal(unscopedRunnerPause.applicationOverlapMs, 0);

const runnerPauseAdjustment = adjustDurationForClassifiedHeadlessPauses(
  1186,
  1225,
  39,
  [runnerPause],
);
assert.equal(runnerPauseAdjustment.headlessPauseOverlapMs, 14);
assert.equal(runnerPauseAdjustment.adjustedDurationMs, 25);

const missingCadenceEvidence = classifyLongTask(
  task(1300, 500),
  attribution(1300, 500, 38),
  [{ name: 'real-wargame.phase.simulation.perception', startMs: 1305, durationMs: 38 }],
  [],
  samples([1290, 1400, 1500, 1600, 1800]),
);
assert.equal(missingCadenceEvidence.classification, 'application_blocking');

const externalRuntime = classifyLongTask(
  task(900, 70),
  attribution(900, 70, 0),
  [],
  [loaf(900, 70, { sourceUrl: 'chrome-extension://external/tool.js' })],
  samples([890, 970]),
);
assert.equal(externalRuntime.classification, 'external_runtime_pause');

const unknown = classifyLongTask(
  { ...task(1100, 70), scenario: null },
  attribution(1100, 70, 0),
  [],
  [],
  samples([1090, 1170]),
);
assert.equal(unknown.classification, 'unknown');

const categories = [applicationBlocking, partialSafe, browserRendering, runnerPause, externalRuntime, unknown]
  .map((item) => item.classification);
assert.deepEqual(categories, [
  'application_blocking',
  'application_partial_safe',
  'browser_rendering',
  'headless_runner_pause',
  'external_runtime_pause',
  'unknown',
]);
console.log(`LongTask finite classification smoke passed: ${categories.join(', ')}; partial-safe bounds ${PARTIAL_SAFE_MAX_OVERLAP_MS} ms/${PARTIAL_SAFE_MAX_OVERLAP_RATIO * 100}%.`);

function task(startMs: number, durationMs: number): BrowserLongTaskDiagnostic {
  return { startMs, durationMs, scenario: 'live-windows-six-unit-ai', attribution: [] };
}
function attribution(startMs: number, durationMs: number, overlapDurationMs: number): ApplicationIntervalAttributionDiagnostic {
  return {
    startMs,
    durationMs,
    scenario: 'live-windows-six-unit-ai',
    applicationAttributed: overlapDurationMs > 0,
    applicationDominated: overlapDurationMs / durationMs >= 0.5,
    applicationOverlapRatio: overlapDurationMs / durationMs,
    overlappingPhases: [],
    overlapDurationMs,
  };
}
function loaf(
  startMs: number,
  durationMs: number,
  options: { renderStartMs?: number; styleAndLayoutStartMs?: number; forcedStyleMs?: number; sourceUrl?: string; scriptDurationMs?: number },
): LongAnimationFrameDiagnostic {
  return {
    startMs,
    durationMs,
    blockingDurationMs: durationMs,
    renderStartMs: options.renderStartMs ?? null,
    styleAndLayoutStartMs: options.styleAndLayoutStartMs ?? null,
    firstUiEventTimestampMs: null,
    scenario: 'live-windows-six-unit-ai',
    scripts: options.sourceUrl || options.forcedStyleMs ? [{
      invoker: 'test',
      invokerType: 'event-listener',
      sourceUrl: options.sourceUrl ?? 'http://127.0.0.1/assets/app.js',
      sourceFunctionName: 'test',
      charPosition: 0,
      durationMs: options.scriptDurationMs ?? durationMs - 5,
      forcedStyleAndLayoutDurationMs: options.forcedStyleMs ?? 0,
      pauseDurationMs: 0,
      windowAttribution: 'self',
    }] : [],
  };
}
function samples(times: readonly number[]): PerformanceFrameSample[] {
  return times.map((tMs) => ({
    tMs, frameMs: 16, simulationUpdateMs: 0, applicationUpdateMs: 0, sceneUpdateMs: 0, renderMs: 0,
    zoom: 1, grid: true, editorEnabled: false, layerMode: 'danger', mouseCell: null, hoveredCoverId: null,
    objectCount: 0, unitCount: 6, zoneCount: 0, selectedObject: false, selectedZone: false,
  }));
}
