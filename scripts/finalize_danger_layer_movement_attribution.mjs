import fs from 'node:fs';
import process from 'node:process';

const [movementPath, attributionPath] = process.argv.slice(2);
if (!movementPath || !attributionPath) {
  console.error('Usage: node scripts/finalize_danger_layer_movement_attribution.mjs <movement.json> <long-task-attribution.json>');
  process.exit(2);
}

const movement = JSON.parse(fs.readFileSync(movementPath, 'utf8'));
const capture = JSON.parse(fs.readFileSync(attributionPath, 'utf8'));
const report = capture.report ?? {};
const final = movement.finalMovementDiagnostics ?? report.computation?.awarenessMovement ?? {};
const samples = Array.isArray(report.samples) ? report.samples : [];
const longTasks = Array.isArray(report.longTasks) ? report.longTasks : [];
const loafs = Array.isArray(report.longAnimationFrames) ? report.longAnimationFrames : [];
const measures = Array.isArray(report.performancePhaseMeasures) ? report.performancePhaseMeasures : [];
const supportedEntryTypes = report.browser?.performanceObserverSupportedEntryTypes ?? [];
const LONG_TASK_THRESHOLD_MS = 100;
const WINDOW_MS = 8_000;
const SCENE_P95_LIMIT_MS = 10;
const SCENE_MAX_LIMIT_MS = 50;
const APPLY_LIMIT_MS = 5;
const LOCAL_LIMIT_MS = 10;
const WORKER_RESPONSE_LIMIT_MS = 5;
const APPLICATION_LIMIT_MS = 50;

if (movement.build?.commitSha !== capture.build?.commitSha) {
  throw new Error(`Movement/capture SHA mismatch: ${movement.build?.commitSha} vs ${capture.build?.commitSha}`);
}
if (movement.build?.branch !== capture.build?.branch) {
  throw new Error(`Movement/capture branch mismatch: ${movement.build?.branch} vs ${capture.build?.branch}`);
}

const end = samples.at(-1)?.tMs ?? 0;
const start = Math.max(0, end - WINDOW_MS);
const sceneSamples = samples.filter((sample) => sample.layerMode === 'danger' && sample.tMs >= start && sample.tMs <= end);
const sceneIntervals = sceneSamples.map((sample) => ({
  name: 'simulation-and-scene-frame',
  startMs: Math.max(0, sample.tMs - sample.sceneUpdateMs),
  durationMs: sample.sceneUpdateMs,
}));
const windowTasks = longTasks.filter((task) => overlaps(task.startMs, task.durationMs, start, end - start));
const windowLoafs = loafs.filter((frame) => overlaps(frame.startMs, frame.durationMs, start, end - start));
const windowMeasures = measures.filter((measure) => overlaps(measure.startMs, measure.durationMs, start, end - start));
const workerResponseScripts = windowLoafs.flatMap((frame) => scripts(frame).filter(isWorkerResponseScript).map(duration));
const dangerScripts = windowLoafs.flatMap((frame) => scripts(frame).filter(isDangerScript).map(duration));
const namedApplicationScripts = windowLoafs.flatMap((frame) => scripts(frame).filter(isNamedApplicationScript).map(duration));
const renderingInfrastructureScripts = windowLoafs.flatMap((frame) => scripts(frame).filter(isRenderingInfrastructureScript).map(duration));
const conservativeWorkerResponseMax = Math.max(
  max(workerResponseScripts),
  Number(final.maxMainThreadApplyMs ?? 0) + Number(final.maxLocalUpdateMs ?? 0),
);

const productionPhases = {
  simulationAndSceneUpdate: {
    ...stats(sceneSamples.map((sample) => sample.sceneUpdateMs)),
    source: 'performance-report frame samples from the production ticker window',
  },
  workerResponseMainThreadHandling: {
    ...stats(workerResponseScripts.length > 0 ? workerResponseScripts : [conservativeWorkerResponseMax]),
    max: roundTwo(conservativeWorkerResponseMax),
    source: workerResponseScripts.length > 0
      ? 'Long Animation Frame named worker-response scripts plus conservative raster/local aggregate'
      : 'conservative upper bound: production raster apply max + renderer-local update max',
  },
  typedArrayApplyAndBaseTextureUpdate: {
    count: Number(final.mainThreadRasterSwaps ?? 0),
    last: Number(final.lastMainThreadApplyMs ?? 0),
    max: Number(final.maxMainThreadApplyMs ?? 0),
    p95: Number(final.maxMainThreadApplyMs ?? 0),
    source: 'production AwarenessMovementDiagnostics applyRaster timing',
  },
  rendererLocalSafePositionAndRouteEvaluation: {
    count: Number(final.safePositionLocalScans ?? 0),
    last: Number(final.lastLocalUpdateMs ?? 0),
    max: Number(final.maxLocalUpdateMs ?? 0),
    p95: Number(final.maxLocalUpdateMs ?? 0),
    source: 'production AwarenessMovementDiagnostics updateLocalDerived timing',
  },
  wallFixtureSetupAndNavigationGrid: {
    ...stats([Number(capture.playwright?.scenarioSetupEvaluateMs ?? 0)]),
    source: 'synchronous page.evaluate duration around production wall scenario setup and navigation-grid fixture work',
  },
  scenarioStop: {
    ...stats([Number(capture.playwright?.scenarioStopEvaluateMs ?? 0)]),
    source: 'synchronous page.evaluate duration around production stopScenario',
  },
  performanceReportSerializationAndDownloadTrigger: {
    ...stats([Number(capture.playwright?.reportExportEvaluateMs ?? 0)]),
    source: 'synchronous page.evaluate duration covering report build, JSON.stringify, Blob creation and download click',
  },
  playwrightWallCrossingWait: {
    ...stats([Number(capture.playwright?.wallCrossingWaitMs ?? 0)]),
    source: 'Playwright wall-crossing wait elapsed time; orchestration diagnostic, not main-thread production work',
  },
  namedApplicationScriptsInLongAnimationFrames: {
    ...stats(namedApplicationScripts),
    source: 'Long Animation Frame scripts with explicit named production functions',
  },
  renderingInfrastructureScriptsInLongAnimationFrames: {
    ...stats(renderingInfrastructureScripts),
    source: 'Long Animation Frame scripts attributed to Pixi ticker/render/requestAnimationFrame infrastructure',
  },
  dangerScriptsInLongAnimationFrames: {
    ...stats(dangerScripts),
    source: 'Long Animation Frame scripts explicitly attributed to danger/awareness production functions',
  },
};

const classified = windowTasks.map((task) => classifyTask(task));
const globalLongTasks = classified.filter((task) => task.durationMs > LONG_TASK_THRESHOLD_MS);
const dangerAttributedLongTasks = globalLongTasks.filter((task) => task.classification === 'danger-attributed');
const applicationAttributedLongTasks = globalLongTasks.filter((task) => task.classification === 'application-attributed');
const diagnosticOnlyLongTasks = globalLongTasks.filter((task) => task.classification === 'browser-rendering-or-runner');
const unattributedLongTasks = globalLongTasks.filter((task) => task.classification === 'unattributed');
const productionPhaseMaxMs = Object.fromEntries(
  Object.entries(productionPhases).map(([name, phase]) => [name, phase.max]),
);
const scene = stats(sceneSamples.map((sample) => sample.sceneUpdateMs));
const failures = [];
if (scene.p95 > SCENE_P95_LIMIT_MS) failures.push(`sceneUpdate p95 ${scene.p95} > ${SCENE_P95_LIMIT_MS}`);
if (scene.max > SCENE_MAX_LIMIT_MS) failures.push(`sceneUpdate max ${scene.max} > ${SCENE_MAX_LIMIT_MS}`);
if (Number(final.maxMainThreadApplyMs ?? Infinity) > APPLY_LIMIT_MS) failures.push(`raster apply max ${final.maxMainThreadApplyMs} > ${APPLY_LIMIT_MS}`);
if (Number(final.maxLocalUpdateMs ?? Infinity) > LOCAL_LIMIT_MS) failures.push(`renderer-local update max ${final.maxLocalUpdateMs} > ${LOCAL_LIMIT_MS}`);
if (conservativeWorkerResponseMax > WORKER_RESPONSE_LIMIT_MS) failures.push(`worker-response conservative max ${roundTwo(conservativeWorkerResponseMax)} > ${WORKER_RESPONSE_LIMIT_MS}`);
if (Number(final.maxPendingQueueDepth ?? Infinity) > 1) failures.push(`pending queue depth ${final.maxPendingQueueDepth} > 1`);
if (final.pendingQueueDepth !== 0 || final.workerInFlight !== false) failures.push('final worker scheduler is not settled');
if (final.lastRequestedWorldKey !== final.lastAppliedWorldKey) failures.push('requested/applied world keys differ');
if (final.lastRequestedCanonicalThreatKey !== final.lastAppliedCanonicalThreatKey) failures.push('requested/applied canonical keys differ');
if (final.lastAppliedJobId !== final.lastCompletedJobId) failures.push('last applied job is not last completed job');
if (final.lastWorkerError) failures.push(`worker error: ${final.lastWorkerError}`);
if (dangerAttributedLongTasks.length > 0) failures.push(`${dangerAttributedLongTasks.length} danger-attributed long tasks remain`);
if (applicationAttributedLongTasks.length > 0) failures.push(`${applicationAttributedLongTasks.length} application-attributed long tasks remain`);
if (unattributedLongTasks.length > 0) failures.push(`${unattributedLongTasks.length} long tasks remain unattributed`);

movement.version = 'danger-layer-movement-evidence-v3';
movement.sceneUpdateMs = scene;
movement.longTaskAttribution = {
  captureVersion: capture.version,
  captureBuild: capture.build,
  supportedEntryTypes,
  globalLongTasks,
  dangerAttributedLongTasks,
  applicationAttributedLongTasks,
  diagnosticOnlyLongTasks,
  unattributedLongTasks,
  productionPhases,
  productionPhaseMaxMs,
  longAnimationFrames: windowLoafs,
  rawPerformancePhaseMeasures: windowMeasures,
  blockingContractPassed: failures.length === 0,
  blockingFailures: failures,
  interpretation: 'Global browser long tasks remain in the artifact. A task is diagnostic-only only when explicit danger/named production work stays below blocking limits and at least 80% of its wall time remains outside instrumented production phases, including Pixi/software-rendering or hosted-runner time.',
};
fs.writeFileSync(movementPath, `${JSON.stringify(movement, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  movementPath,
  attributionPath,
  globalLongTasks: globalLongTasks.length,
  dangerAttributedLongTasks: dangerAttributedLongTasks.length,
  applicationAttributedLongTasks: applicationAttributedLongTasks.length,
  diagnosticOnlyLongTasks: diagnosticOnlyLongTasks.length,
  unattributedLongTasks: unattributedLongTasks.length,
  productionPhaseMaxMs,
  blockingContractPassed: failures.length === 0,
  blockingFailures: failures,
}, null, 2));

function classifyTask(task) {
  const overlappingLoafs = windowLoafs.filter((frame) => overlaps(task.startMs, task.durationMs, frame.startMs, frame.durationMs));
  const overlappingMeasures = windowMeasures.filter((measure) => overlaps(task.startMs, task.durationMs, measure.startMs, measure.durationMs));
  const overlappingScenes = sceneIntervals.filter((phase) => overlaps(task.startMs, task.durationMs, phase.startMs, phase.durationMs));
  const scriptEntries = overlappingLoafs.flatMap(scripts);
  const dangerScriptDuration = sum(scriptEntries.filter(isDangerScript).map(duration));
  const namedApplicationDuration = sum(scriptEntries.filter(isNamedApplicationScript).map(duration));
  const renderingInfrastructureDuration = sum(scriptEntries.filter(isRenderingInfrastructureScript).map(duration));
  const workerResponseDuration = max(scriptEntries.filter(isWorkerResponseScript).map(duration));
  const sceneOverlap = sum(overlappingScenes.map((phase) => intervalOverlap(task.startMs, task.durationMs, phase.startMs, phase.durationMs)));
  const measureOverlap = sum(overlappingMeasures.map((measure) => intervalOverlap(task.startMs, task.durationMs, measure.startMs, measure.durationMs)));
  const productionOverlap = Math.min(task.durationMs, sceneOverlap + measureOverlap + namedApplicationDuration);
  const unaccounted = Math.max(0, task.durationMs - productionOverlap);
  const phases = [
    ...overlappingScenes.map((phase) => phase.name),
    ...overlappingMeasures.map((measure) => measure.name),
    ...scriptEntries.filter(isDangerScript).map((script) => `danger-script:${identity(script)}`),
    ...scriptEntries.filter(isNamedApplicationScript).map((script) => `application-script:${identity(script)}`),
    ...scriptEntries.filter(isRenderingInfrastructureScript).map((script) => `render-infrastructure:${identity(script)}`),
  ];
  let classification;
  let reason;
  if (workerResponseDuration > WORKER_RESPONSE_LIMIT_MS || dangerScriptDuration > APPLICATION_LIMIT_MS) {
    classification = 'danger-attributed';
    reason = `danger/worker script exceeded contract (${roundTwo(dangerScriptDuration)} ms danger, ${roundTwo(workerResponseDuration)} ms worker response)`;
  } else if (namedApplicationDuration > APPLICATION_LIMIT_MS || productionOverlap > APPLICATION_LIMIT_MS) {
    classification = 'application-attributed';
    reason = `named/measured application work exceeded ${APPLICATION_LIMIT_MS} ms (${roundTwo(namedApplicationDuration)} ms named, ${roundTwo(productionOverlap)} ms overlap)`;
  } else if (unaccounted >= task.durationMs * 0.8) {
    classification = 'browser-rendering-or-runner';
    reason = `${roundTwo(unaccounted)} of ${task.durationMs} ms is outside bounded production work; Pixi/ticker/render infrastructure script time=${roundTwo(renderingInfrastructureDuration)} ms`;
  } else {
    classification = 'unattributed';
    reason = `only ${roundTwo(unaccounted)} of ${task.durationMs} ms (${roundTwo(unaccounted / Math.max(1, task.durationMs) * 100)}%) remains outside instrumented production work`;
  }
  return {
    startMs: task.startMs,
    durationMs: task.durationMs,
    scenario: task.scenario ?? null,
    attribution: task.attribution ?? [],
    overlappingProductionPhases: [...new Set(phases)],
    productionOverlapDurationMs: roundTwo(productionOverlap),
    applicationScriptDurationMs: roundTwo(namedApplicationDuration),
    renderingInfrastructureScriptDurationMs: roundTwo(renderingInfrastructureDuration),
    dangerScriptDurationMs: roundTwo(dangerScriptDuration),
    workerResponseScriptDurationMs: roundTwo(workerResponseDuration),
    unaccountedDurationMs: roundTwo(unaccounted),
    classification,
    reason,
  };
}

function scripts(frame) {
  return Array.isArray(frame.scripts) ? frame.scripts : [];
}

function duration(script) {
  return Number(script.durationMs ?? 0);
}

function identity(script) {
  return `${script.sourceFunctionName ?? ''} ${script.invoker ?? ''} ${script.invokerType ?? ''}`.trim();
}

function isDangerScript(script) {
  return /(?:Danger|Awareness|PixiAwareness|SoldierAwareness|AwarenessWorldWorker|handleWorkerResponse|applyRaster|updateLocalDerived|updateMarkers|drawSafePositionMarkers)/i.test(
    `${script.sourceUrl ?? ''} ${identity(script)}`,
  );
}

function isWorkerResponseScript(script) {
  return isDangerScript(script) && /(?:handleWorkerResponse|onmessage|message)/i.test(identity(script));
}

function isNamedApplicationScript(script) {
  return /(?:tickSimulation|renderFrame|buildReport|downloadPerformanceReport|startScenario|stopScenario|buildNavigationGrid|markMapCellsDirty|markMapObjectsDirty)/i.test(identity(script));
}

function isRenderingInfrastructureScript(script) {
  return !isDangerScript(script) && !isNamedApplicationScript(script) && (
    /(?:pixi|\/assets\/)/i.test(script.sourceUrl ?? '')
    || /(?:Ticker|render|requestAnimationFrame|Application)/i.test(identity(script))
  );
}

function overlaps(leftStart, leftDuration, rightStart, rightDuration) {
  return leftStart < rightStart + rightDuration && rightStart < leftStart + leftDuration;
}

function intervalOverlap(leftStart, leftDuration, rightStart, rightDuration) {
  const startValue = Math.max(leftStart, rightStart);
  const endValue = Math.min(leftStart + leftDuration, rightStart + rightDuration);
  return Math.max(0, endValue - startValue);
}

function stats(values) {
  const finite = values.map(Number).filter(Number.isFinite);
  if (finite.length === 0) return { count: 0, last: 0, max: 0, p95: 0 };
  const sorted = [...finite].sort((left, right) => left - right);
  return {
    count: finite.length,
    last: roundTwo(finite.at(-1) ?? 0),
    max: roundTwo(sorted.at(-1) ?? 0),
    p95: roundTwo(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0),
  };
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function max(values) {
  return values.length === 0 ? 0 : Math.max(...values.map(Number));
}

function roundTwo(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}
