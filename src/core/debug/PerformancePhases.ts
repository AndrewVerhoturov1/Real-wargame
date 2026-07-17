export const PERFORMANCE_PHASE_PREFIX = 'real-wargame.phase.';
const MIN_RECORDED_PHASE_DURATION_MS = 8;
const MAX_DURATION_SAMPLES_PER_PHASE = 4096;
const MAX_CONTEXTUAL_EVENTS = 2048;

interface MutablePhaseAccumulator {
  count: number;
  totalMs: number;
  maxMs: number;
  samples: number[];
  writeIndex: number;
}

export interface PerformancePhaseContext {
  readonly sessionId?: string;
  readonly eventId?: string;
  readonly operationId?: string;
  readonly requestId?: string;
  readonly orderId?: string;
  readonly routeRequestId?: string;
  readonly workerRequestId?: string;
  readonly unitId?: string;
  readonly revision?: number;
  readonly profileId?: string;
  readonly simulationStep?: number;
  readonly activeNodeId?: string | null;
  readonly activeSubgraphId?: string | null;
}

export interface PerformancePhaseEventDiagnostic {
  readonly name: string;
  readonly startTimeMs: number;
  readonly durationMs: number;
  readonly context: PerformancePhaseContext | null;
}

export interface PerformancePhaseRuntimeDiagnostic {
  readonly name: string;
  readonly count: number;
  readonly totalMs: number;
  readonly avgMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
  readonly sampleCount: number;
  readonly samplesTruncated: boolean;
}

const accumulators = new Map<string, MutablePhaseAccumulator>();
const contextualEvents: PerformancePhaseEventDiagnostic[] = [];
let activeContext: PerformancePhaseContext | null = null;

/**
 * Attaches synchronous ownership metadata to nested measured phases. Explicit
 * operation/request IDs remain stable across nested calls; asynchronous work
 * must carry the context in its request payload and re-enter it on completion.
 */
export function withPerformancePhaseContext<T>(
  context: PerformancePhaseContext,
  callback: () => T,
): T {
  const previous = activeContext;
  activeContext = previous ? { ...previous, ...context } : { ...context };
  try {
    return callback();
  } finally {
    activeContext = previous;
  }
}

/**
 * Records every synchronous phase in a bounded accumulator and emits browser
 * PerformanceMeasure entries only for potentially blocking calls.
 */
export function measurePerformancePhase<T>(name: string, callback: () => T): T {
  const startedAt = performance.now();
  try {
    return callback();
  } finally {
    const duration = performance.now() - startedAt;
    recordPhaseDuration(name, duration);
    if (duration >= MIN_RECORDED_PHASE_DURATION_MS) {
      performance.measure(`${PERFORMANCE_PHASE_PREFIX}${name}`, {
        start: startedAt,
        duration,
      });
      recordContextualEvent(name, startedAt, duration, activeContext);
    }
  }
}

export function getPerformancePhaseRuntimeDiagnostics(): PerformancePhaseRuntimeDiagnostic[] {
  return [...accumulators.entries()]
    .map(([name, accumulator]) => {
      const samples = orderedSamples(accumulator);
      return {
        name,
        count: accumulator.count,
        totalMs: roundTwo(accumulator.totalMs),
        avgMs: roundTwo(accumulator.totalMs / Math.max(1, accumulator.count)),
        p50Ms: roundTwo(percentile(samples, 0.50)),
        p95Ms: roundTwo(percentile(samples, 0.95)),
        p99Ms: roundTwo(percentile(samples, 0.99)),
        maxMs: roundTwo(accumulator.maxMs),
        sampleCount: samples.length,
        samplesTruncated: accumulator.count > samples.length,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function getPerformancePhaseContextualEvents(): PerformancePhaseEventDiagnostic[] {
  return contextualEvents.map((event) => ({
    ...event,
    context: event.context ? { ...event.context } : null,
  }));
}

export function getCurrentPerformancePhaseContext(): PerformancePhaseContext | null {
  return activeContext ? { ...activeContext } : null;
}

export function resetPerformancePhaseRuntimeDiagnosticsForTests(): void {
  accumulators.clear();
  contextualEvents.length = 0;
  activeContext = null;
}

function recordPhaseDuration(name: string, duration: number): void {
  let accumulator = accumulators.get(name);
  if (!accumulator) {
    accumulator = { count: 0, totalMs: 0, maxMs: 0, samples: [], writeIndex: 0 };
    accumulators.set(name, accumulator);
  }
  accumulator.count += 1;
  accumulator.totalMs += duration;
  accumulator.maxMs = Math.max(accumulator.maxMs, duration);
  if (accumulator.samples.length < MAX_DURATION_SAMPLES_PER_PHASE) {
    accumulator.samples.push(duration);
    return;
  }
  accumulator.samples[accumulator.writeIndex] = duration;
  accumulator.writeIndex = (accumulator.writeIndex + 1) % MAX_DURATION_SAMPLES_PER_PHASE;
}

function recordContextualEvent(
  name: string,
  startTimeMs: number,
  durationMs: number,
  context: PerformancePhaseContext | null,
): void {
  contextualEvents.push({
    name,
    startTimeMs: roundTwo(startTimeMs),
    durationMs: roundTwo(durationMs),
    context: context ? { ...context } : null,
  });
  if (contextualEvents.length > MAX_CONTEXTUAL_EVENTS) {
    contextualEvents.splice(0, contextualEvents.length - MAX_CONTEXTUAL_EVENTS);
  }
}

function orderedSamples(accumulator: MutablePhaseAccumulator): number[] {
  if (accumulator.samples.length < MAX_DURATION_SAMPLES_PER_PHASE || accumulator.writeIndex === 0) {
    return [...accumulator.samples];
  }
  return [
    ...accumulator.samples.slice(accumulator.writeIndex),
    ...accumulator.samples.slice(0, accumulator.writeIndex),
  ];
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index] ?? 0;
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}
