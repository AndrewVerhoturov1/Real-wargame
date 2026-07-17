import type {
  ApplicationIntervalAttributionDiagnostic,
  BrowserLongTaskDiagnostic,
  LongAnimationFrameDiagnostic,
  PerformanceFrameSample,
  PerformancePhaseMeasureDiagnostic,
} from './PerformanceMonitor';

export type LongTaskClassification =
  | 'application_blocking'
  | 'application_partial_safe'
  | 'browser_rendering'
  | 'headless_runner_pause'
  | 'external_runtime_pause'
  | 'unknown';

export const PARTIAL_SAFE_MAX_OVERLAP_RATIO = 0.20;
export const PARTIAL_SAFE_MAX_OVERLAP_MS = 12;
export const HEADLESS_PAUSE_MIN_DURATION_MS = 200;
export const HEADLESS_PAUSE_MIN_FRAME_GAP_RATIO = 0.90;
export const HEADLESS_PAUSE_MAX_APPLICATION_OVERLAP_RATIO = 0.10;
export const HEADLESS_PAUSE_MAX_RENDERER_OVERLAP_RATIO = 0.10;
export const HEADLESS_PAUSE_MAX_FORCED_STYLE_LAYOUT_MS = 2;

export interface LongTaskRafTimerAttribution {
  readonly overlappingLongAnimationFrameCount: number;
  readonly rafScriptDurationMs: number;
  readonly timerScriptDurationMs: number;
  readonly pauseDurationMs: number;
  readonly measuredFrameGapMs: number;
}

export interface LongTaskRendererAttribution {
  readonly renderWindowOverlapMs: number;
  readonly styleLayoutWindowOverlapMs: number;
  readonly forcedStyleAndLayoutDurationMs: number;
}

export interface HeadlessPauseDurationAdjustment {
  readonly rawDurationMs: number;
  readonly headlessPauseOverlapMs: number;
  readonly adjustedDurationMs: number;
  readonly overlappingTaskStartsMs: readonly number[];
}

export interface ClassifiedLongTaskDiagnostic {
  readonly startMs: number;
  readonly scenario: string | null;
  readonly durationMs: number;
  readonly applicationOverlapMs: number;
  readonly applicationOverlapRatio: number;
  readonly nonRendererApplicationOverlapMs: number;
  readonly nonRendererApplicationOverlapRatio: number;
  readonly overlappingApplicationPhases: readonly string[];
  readonly largestApplicationPhase: string | null;
  readonly largestNonRendererPhase: string | null;
  readonly rafOrTimerAttribution: LongTaskRafTimerAttribution;
  readonly rendererAttribution: LongTaskRendererAttribution;
  readonly classification: LongTaskClassification;
  readonly classificationReason: string;
}

export function classifyLongTasks(
  longTasks: readonly BrowserLongTaskDiagnostic[],
  applicationAttribution: readonly ApplicationIntervalAttributionDiagnostic[],
  phases: readonly PerformancePhaseMeasureDiagnostic[],
  longAnimationFrames: readonly LongAnimationFrameDiagnostic[],
  samples: readonly PerformanceFrameSample[],
): ClassifiedLongTaskDiagnostic[] {
  return longTasks.map((task, index) => classifyLongTask(
    task,
    applicationAttribution[index],
    phases,
    longAnimationFrames,
    samples,
  ));
}

export function classifyLongTask(
  task: BrowserLongTaskDiagnostic,
  attribution: ApplicationIntervalAttributionDiagnostic | undefined,
  phases: readonly PerformancePhaseMeasureDiagnostic[],
  longAnimationFrames: readonly LongAnimationFrameDiagnostic[],
  samples: readonly PerformanceFrameSample[],
): ClassifiedLongTaskDiagnostic {
  const taskEnd = task.startMs + task.durationMs;
  const overlappingPhases = phases
    .map((phase) => ({ phase, overlapMs: overlap(task.startMs, taskEnd, phase.startMs, phase.startMs + phase.durationMs) }))
    .filter((item) => item.overlapMs > 0)
    .sort((left, right) => right.overlapMs - left.overlapMs);
  const applicationOverlapMs = attribution?.overlapDurationMs
    ?? unionOverlapDuration(task.startMs, taskEnd, overlappingPhases.map(({ phase }) => phase));
  const applicationOverlapRatio = task.durationMs > 0
    ? applicationOverlapMs / task.durationMs
    : 0;
  const loafs = longAnimationFrames.filter((frame) => overlap(
    task.startMs,
    taskEnd,
    frame.startMs,
    frame.startMs + frame.durationMs,
  ) > 0);
  const rafScriptDurationMs = sumScripts(loafs, (script) => /animation|requestAnimationFrame|raf/i.test(`${script.invoker} ${script.invokerType}`));
  const timerScriptDurationMs = sumScripts(loafs, (script) => /timer|setTimeout|setInterval/i.test(`${script.invoker} ${script.invokerType}`));
  const pauseDurationMs = roundTwo(loafs.flatMap((frame) => frame.scripts).reduce((sum, script) => sum + script.pauseDurationMs, 0));
  const forcedStyleAndLayoutDurationMs = roundTwo(loafs.flatMap((frame) => frame.scripts)
    .reduce((sum, script) => sum + script.forcedStyleAndLayoutDurationMs, 0));
  const renderWindowOverlapMs = roundTwo(loafs.reduce((sum, frame) => {
    if (frame.renderStartMs === null) return sum;
    return sum + overlap(task.startMs, taskEnd, frame.renderStartMs, frame.startMs + frame.durationMs);
  }, 0));
  const styleLayoutWindowOverlapMs = roundTwo(loafs.reduce((sum, frame) => {
    if (frame.styleAndLayoutStartMs === null) return sum;
    return sum + overlap(task.startMs, taskEnd, frame.styleAndLayoutStartMs, frame.startMs + frame.durationMs);
  }, 0));
  const measuredFrameGapMs = roundTwo(findMeasuredFrameGap(task, samples));
  const externalScript = loafs.flatMap((frame) => frame.scripts).find((script) => isExternalSource(script.sourceUrl));
  const rendererOverlapMs = Math.max(renderWindowOverlapMs, styleLayoutWindowOverlapMs, forcedStyleAndLayoutDurationMs);
  const rendererOverlapRatio = task.durationMs > 0 ? rendererOverlapMs / task.durationMs : 0;
  const rendererApplicationPhases = overlappingPhases.filter(({ phase }) => isRendererApplicationPhase(phase.name));
  const nonRendererApplicationPhases = overlappingPhases.filter(({ phase }) => !isRendererApplicationPhase(phase.name));
  const namedRendererApplicationOverlapMs = unionOverlapDuration(
    task.startMs,
    taskEnd,
    rendererApplicationPhases.map(({ phase }) => phase),
  );
  const namedNonRendererApplicationOverlapMs = unionOverlapDuration(
    task.startMs,
    taskEnd,
    nonRendererApplicationPhases.map(({ phase }) => phase),
  );
  const unattributedApplicationOverlapMs = Math.max(0, applicationOverlapMs - namedRendererApplicationOverlapMs);
  const nonRendererApplicationOverlapMs = Math.max(
    namedNonRendererApplicationOverlapMs,
    unattributedApplicationOverlapMs,
  );
  const nonRendererApplicationOverlapRatio = task.durationMs > 0
    ? nonRendererApplicationOverlapMs / task.durationMs
    : 0;
  const rendererEvidence = rendererOverlapMs > 0;
  const rendererDominates = rendererEvidence && rendererOverlapMs > nonRendererApplicationOverlapMs;
  const scenarioScopedHeadlessCandidate = task.scenario === 'live-windows-six-unit-ai';
  const unscopedZeroOverlapHeadlessCandidate = task.scenario === null
    && applicationOverlapMs === 0
    && rendererOverlapMs === 0
    && loafs.length === 0;
  const headlessCadenceEvidence = (scenarioScopedHeadlessCandidate || unscopedZeroOverlapHeadlessCandidate)
    && task.durationMs >= HEADLESS_PAUSE_MIN_DURATION_MS
    && measuredFrameGapMs >= task.durationMs * HEADLESS_PAUSE_MIN_FRAME_GAP_RATIO
    && applicationOverlapRatio <= HEADLESS_PAUSE_MAX_APPLICATION_OVERLAP_RATIO
    && rendererOverlapRatio <= HEADLESS_PAUSE_MAX_RENDERER_OVERLAP_RATIO
    && forcedStyleAndLayoutDurationMs <= HEADLESS_PAUSE_MAX_FORCED_STYLE_LAYOUT_MS
    && rafScriptDurationMs === 0
    && timerScriptDurationMs === 0
    && !externalScript;

  let classification: LongTaskClassification;
  let classificationReason: string;
  if (externalScript) {
    classification = 'external_runtime_pause';
    classificationReason = `The overlapping browser frame attributes execution to external source ${externalScript.sourceUrl}.`;
  } else if (headlessCadenceEvidence) {
    classification = 'headless_runner_pause';
    classificationReason = `Measured ${measuredFrameGapMs} ms frame gap spans the ${roundTwo(task.durationMs)} ms task; application overlap is ${roundTwo(applicationOverlapMs)} ms (${roundTwo(applicationOverlapRatio * 100)}%), renderer overlap is ${roundTwo(rendererOverlapMs)} ms (${roundTwo(rendererOverlapRatio * 100)}%), RAF/timer attribution is zero, and forced style/layout is ${forcedStyleAndLayoutDurationMs} ms.`;
  } else if (
    rendererDominates
    && nonRendererApplicationOverlapMs <= PARTIAL_SAFE_MAX_OVERLAP_MS
    && nonRendererApplicationOverlapRatio <= PARTIAL_SAFE_MAX_OVERLAP_RATIO
  ) {
    classification = 'browser_rendering';
    classificationReason = `Renderer evidence accounts for ${roundTwo(rendererOverlapMs)} ms and dominates the task while non-renderer application overlap is bounded to ${roundTwo(nonRendererApplicationOverlapMs)} ms (${roundTwo(nonRendererApplicationOverlapRatio * 100)}%).`;
  } else if (applicationOverlapMs > 0) {
    if (
      applicationOverlapRatio <= PARTIAL_SAFE_MAX_OVERLAP_RATIO
      && applicationOverlapMs <= PARTIAL_SAFE_MAX_OVERLAP_MS
    ) {
      classification = 'application_partial_safe';
      classificationReason = `Measured application overlap ${roundTwo(applicationOverlapMs)} ms (${roundTwo(applicationOverlapRatio * 100)}%) is within the explicit ${PARTIAL_SAFE_MAX_OVERLAP_MS} ms/${PARTIAL_SAFE_MAX_OVERLAP_RATIO * 100}% bounds.`;
    } else {
      classification = 'application_blocking';
      classificationReason = `Measured application overlap ${roundTwo(applicationOverlapMs)} ms (${roundTwo(applicationOverlapRatio * 100)}%) exceeds the partial-safe bounds; non-renderer application overlap is ${roundTwo(nonRendererApplicationOverlapMs)} ms (${roundTwo(nonRendererApplicationOverlapRatio * 100)}%).`;
    }
  } else if (renderWindowOverlapMs > 0 || styleLayoutWindowOverlapMs > 0 || forcedStyleAndLayoutDurationMs > 0) {
    classification = 'browser_rendering';
    classificationReason = `No application phase overlaps; Long Animation Frame reports ${renderWindowOverlapMs} ms render-window overlap, ${styleLayoutWindowOverlapMs} ms style/layout overlap and ${forcedStyleAndLayoutDurationMs} ms forced style/layout.`;
  } else {
    classification = 'unknown';
    classificationReason = 'No measured application, renderer, headless cadence, or external-runtime evidence explains this LongTask.';
  }

  return {
    startMs: task.startMs,
    scenario: task.scenario,
    durationMs: task.durationMs,
    applicationOverlapMs: roundTwo(applicationOverlapMs),
    applicationOverlapRatio: roundFour(applicationOverlapRatio),
    nonRendererApplicationOverlapMs: roundTwo(nonRendererApplicationOverlapMs),
    nonRendererApplicationOverlapRatio: roundFour(nonRendererApplicationOverlapRatio),
    overlappingApplicationPhases: [...new Set(overlappingPhases.map(({ phase }) => phase.name))],
    largestApplicationPhase: overlappingPhases[0]?.phase.name ?? null,
    largestNonRendererPhase: nonRendererApplicationPhases[0]?.phase.name ?? null,
    rafOrTimerAttribution: {
      overlappingLongAnimationFrameCount: loafs.length,
      rafScriptDurationMs: roundTwo(rafScriptDurationMs),
      timerScriptDurationMs: roundTwo(timerScriptDurationMs),
      pauseDurationMs,
      measuredFrameGapMs,
    },
    rendererAttribution: {
      renderWindowOverlapMs,
      styleLayoutWindowOverlapMs,
      forcedStyleAndLayoutDurationMs,
    },
    classification,
    classificationReason,
  };
}

export function adjustDurationForClassifiedHeadlessPauses(
  startMs: number | null | undefined,
  endMs: number | null | undefined,
  rawDurationMs: number,
  tasks: readonly ClassifiedLongTaskDiagnostic[],
): HeadlessPauseDurationAdjustment {
  const raw = Math.max(0, rawDurationMs);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || (endMs as number) <= (startMs as number)) {
    return { rawDurationMs: roundTwo(raw), headlessPauseOverlapMs: 0, adjustedDurationMs: roundTwo(raw), overlappingTaskStartsMs: [] };
  }
  const windowStart = startMs as number;
  const windowEnd = endMs as number;
  const intervals = tasks
    .filter((task) => task.classification === 'headless_runner_pause')
    .map((task) => ({
      start: Math.max(windowStart, task.startMs),
      end: Math.min(windowEnd, task.startMs + task.durationMs),
      taskStart: task.startMs,
    }))
    .filter((item) => item.end > item.start)
    .sort((left, right) => left.start - right.start);
  let overlapMs = 0;
  let currentStart = -1;
  let currentEnd = -1;
  const overlappingTaskStartsMs: number[] = [];
  for (const interval of intervals) {
    overlappingTaskStartsMs.push(interval.taskStart);
    if (currentStart < 0) {
      currentStart = interval.start;
      currentEnd = interval.end;
    } else if (interval.start <= currentEnd) {
      currentEnd = Math.max(currentEnd, interval.end);
    } else {
      overlapMs += currentEnd - currentStart;
      currentStart = interval.start;
      currentEnd = interval.end;
    }
  }
  if (currentStart >= 0) overlapMs += currentEnd - currentStart;
  const boundedOverlap = Math.min(raw, Math.max(0, overlapMs));
  return {
    rawDurationMs: roundTwo(raw),
    headlessPauseOverlapMs: roundTwo(boundedOverlap),
    adjustedDurationMs: roundTwo(Math.max(0, raw - boundedOverlap)),
    overlappingTaskStartsMs: [...new Set(overlappingTaskStartsMs)].map(roundTwo),
  };
}

function findMeasuredFrameGap(task: BrowserLongTaskDiagnostic, samples: readonly PerformanceFrameSample[]): number {
  if (samples.length < 2) return 0;
  const taskEnd = task.startMs + task.durationMs;
  let best = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    if (!previous || !current) continue;
    const gap = current.tMs - previous.tMs;
    if (previous.tMs <= taskEnd && current.tMs >= task.startMs) best = Math.max(best, gap);
  }
  return best;
}

function sumScripts(
  frames: readonly LongAnimationFrameDiagnostic[],
  predicate: (script: LongAnimationFrameDiagnostic['scripts'][number]) => boolean,
): number {
  return frames.flatMap((frame) => frame.scripts)
    .filter(predicate)
    .reduce((sum, script) => sum + script.durationMs, 0);
}

function isRendererApplicationPhase(name: string): boolean {
  return name === 'real-wargame.phase.ticker.render-frame'
    || name.startsWith('real-wargame.phase.render.')
    || name.startsWith('real-wargame.phase.renderer.');
}

function isExternalSource(sourceUrl: string): boolean {
  if (!sourceUrl) return false;
  return !/localhost|127\.0\.0\.1|\/src\/|\/assets\/|real-wargame/i.test(sourceUrl);
}

function unionOverlapDuration(
  windowStart: number,
  windowEnd: number,
  phases: readonly PerformancePhaseMeasureDiagnostic[],
): number {
  const intervals = phases
    .map((phase) => [Math.max(windowStart, phase.startMs), Math.min(windowEnd, phase.startMs + phase.durationMs)] as const)
    .filter(([start, end]) => end > start)
    .sort((left, right) => left[0] - right[0]);
  let total = 0;
  let currentStart = -1;
  let currentEnd = -1;
  for (const [start, end] of intervals) {
    if (currentStart < 0) {
      currentStart = start;
      currentEnd = end;
    } else if (start <= currentEnd) {
      currentEnd = Math.max(currentEnd, end);
    } else {
      total += currentEnd - currentStart;
      currentStart = start;
      currentEnd = end;
    }
  }
  if (currentStart >= 0) total += currentEnd - currentStart;
  return total;
}

function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

function roundTwo(value: number): number { return Math.round(value * 100) / 100; }
function roundFour(value: number): number { return Math.round(value * 10_000) / 10_000; }
