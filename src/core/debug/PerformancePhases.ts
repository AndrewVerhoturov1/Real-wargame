export const PERFORMANCE_PHASE_PREFIX = 'real-wargame.phase.';
const MIN_RECORDED_PHASE_DURATION_MS = 8;
const MAX_DURATION_SAMPLES_PER_PHASE = 4096;

interface MutablePhaseAccumulator {
  count: number;
  totalMs: number;
  maxMs: number;
  samples: number[];
  writeIndex: number;
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

/**
 * Records every synchronous phase in a bounded in-memory accumulator and emits
 * PerformanceMeasure entries only for potentially blocking calls. The runtime
 * aggregate fixes the old report gap where fast samples disappeared entirely,
 * while the 8 ms entry threshold keeps LoAF overlap instrumentation bounded.
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

export function resetPerformancePhaseRuntimeDiagnosticsForTests(): void {
  accumulators.clear();
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
