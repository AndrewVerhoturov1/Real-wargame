const MAX_DURATION_SAMPLES = 4096;
const MAX_RECENT_UNIT_PASSES = 240;
const MAX_SLOWEST_UNIT_PASSES = 60;
const MAX_RECENT_CYCLES = 180;
const MAX_SLOWEST_CYCLES = 40;

export interface AiSchedulerUnitPassDiagnostic {
  readonly simulationStep: number;
  readonly cycleStartMs: number;
  readonly cycleEndMs: number;
  readonly unitId: string;
  readonly durationMs: number;
  readonly decisionTickDelta: number;
  readonly observerPollDelta: number;
  readonly reactiveWakeDelta: number;
  readonly graphTicked: boolean;
  readonly resultStatus: string | null;
  readonly activeNodeBefore: string | null;
  readonly activeNodeAfter: string | null;
  readonly activeSubgraphAfter: string | null;
  readonly effectTypes: readonly string[];
  readonly currentAction: string;
  readonly lastEvent: string | null;
}

export interface AiSchedulerCycleDiagnostic {
  readonly simulationStep: number;
  readonly cycleStartMs: number;
  readonly cycleEndMs: number;
  readonly durationMs: number;
  readonly graphResolutionMs: number;
  readonly unitPassDurationMs: number;
  readonly overheadMs: number;
  readonly eligibleUnitCount: number;
  readonly processedUnitCount: number;
  readonly graphTickedUnitCount: number;
  readonly maxUnitId: string | null;
  readonly maxUnitDurationMs: number;
}

export interface AiSchedulerDurationStats {
  readonly count: number;
  readonly avgMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
  readonly sampleCount: number;
  readonly samplesTruncated: boolean;
}

export interface AiSchedulerPerformanceDiagnostics {
  readonly unitPasses: AiSchedulerDurationStats;
  readonly decisionUnitPasses: AiSchedulerDurationStats;
  readonly cycles: AiSchedulerDurationStats;
  readonly decisionCycles: AiSchedulerDurationStats;
  readonly slowUnitPassCount: number;
  readonly slowCycleCount: number;
  readonly recentUnitPasses: readonly AiSchedulerUnitPassDiagnostic[];
  readonly slowestUnitPasses: readonly AiSchedulerUnitPassDiagnostic[];
  readonly recentCycles: readonly AiSchedulerCycleDiagnostic[];
  readonly slowestCycles: readonly AiSchedulerCycleDiagnostic[];
}

interface DurationAccumulator {
  count: number;
  totalMs: number;
  maxMs: number;
  samples: number[];
  writeIndex: number;
}

const unitDurations: DurationAccumulator = makeAccumulator();
const decisionUnitDurations: DurationAccumulator = makeAccumulator();
const cycleDurations: DurationAccumulator = makeAccumulator();
const decisionCycleDurations: DurationAccumulator = makeAccumulator();
const recentUnitPasses: AiSchedulerUnitPassDiagnostic[] = [];
const slowestUnitPasses: AiSchedulerUnitPassDiagnostic[] = [];
const recentCycles: AiSchedulerCycleDiagnostic[] = [];
const slowestCycles: AiSchedulerCycleDiagnostic[] = [];
let slowUnitPassCount = 0;
let slowCycleCount = 0;

export function recordAiSchedulerUnitPass(value: AiSchedulerUnitPassDiagnostic): void {
  const snapshot = cloneUnitPass(value);
  recordDuration(unitDurations, snapshot.durationMs);
  if (snapshot.decisionTickDelta > 0) recordDuration(decisionUnitDurations, snapshot.durationMs);
  if (snapshot.durationMs >= 8) slowUnitPassCount += 1;
  pushBounded(recentUnitPasses, snapshot, MAX_RECENT_UNIT_PASSES);
  pushSlowest(slowestUnitPasses, snapshot, MAX_SLOWEST_UNIT_PASSES);
}

export function recordAiSchedulerCycle(value: AiSchedulerCycleDiagnostic): void {
  const snapshot = { ...value };
  recordDuration(cycleDurations, snapshot.durationMs);
  if (snapshot.graphTickedUnitCount > 0) recordDuration(decisionCycleDurations, snapshot.durationMs);
  if (snapshot.durationMs >= 8) slowCycleCount += 1;
  pushBounded(recentCycles, snapshot, MAX_RECENT_CYCLES);
  pushSlowest(slowestCycles, snapshot, MAX_SLOWEST_CYCLES);
}

export function getAiSchedulerPerformanceDiagnostics(): AiSchedulerPerformanceDiagnostics {
  return {
    unitPasses: buildStats(unitDurations),
    decisionUnitPasses: buildStats(decisionUnitDurations),
    cycles: buildStats(cycleDurations),
    decisionCycles: buildStats(decisionCycleDurations),
    slowUnitPassCount,
    slowCycleCount,
    recentUnitPasses: recentUnitPasses.map(cloneUnitPass),
    slowestUnitPasses: slowestUnitPasses.map(cloneUnitPass),
    recentCycles: recentCycles.map((value) => ({ ...value })),
    slowestCycles: slowestCycles.map((value) => ({ ...value })),
  };
}

export function resetAiSchedulerPerformanceDiagnosticsForTests(): void {
  resetAccumulator(unitDurations);
  resetAccumulator(decisionUnitDurations);
  resetAccumulator(cycleDurations);
  resetAccumulator(decisionCycleDurations);
  recentUnitPasses.length = 0;
  slowestUnitPasses.length = 0;
  recentCycles.length = 0;
  slowestCycles.length = 0;
  slowUnitPassCount = 0;
  slowCycleCount = 0;
}

function makeAccumulator(): DurationAccumulator {
  return { count: 0, totalMs: 0, maxMs: 0, samples: [], writeIndex: 0 };
}

function resetAccumulator(accumulator: DurationAccumulator): void {
  accumulator.count = 0;
  accumulator.totalMs = 0;
  accumulator.maxMs = 0;
  accumulator.samples.length = 0;
  accumulator.writeIndex = 0;
}

function recordDuration(accumulator: DurationAccumulator, durationMs: number): void {
  accumulator.count += 1;
  accumulator.totalMs += durationMs;
  accumulator.maxMs = Math.max(accumulator.maxMs, durationMs);
  if (accumulator.samples.length < MAX_DURATION_SAMPLES) {
    accumulator.samples.push(durationMs);
    return;
  }
  accumulator.samples[accumulator.writeIndex] = durationMs;
  accumulator.writeIndex = (accumulator.writeIndex + 1) % MAX_DURATION_SAMPLES;
}

function buildStats(accumulator: DurationAccumulator): AiSchedulerDurationStats {
  const samples = orderedSamples(accumulator);
  return {
    count: accumulator.count,
    avgMs: roundTwo(accumulator.totalMs / Math.max(1, accumulator.count)),
    p50Ms: roundTwo(percentile(samples, 0.50)),
    p95Ms: roundTwo(percentile(samples, 0.95)),
    p99Ms: roundTwo(percentile(samples, 0.99)),
    maxMs: roundTwo(accumulator.maxMs),
    sampleCount: samples.length,
    samplesTruncated: accumulator.count > samples.length,
  };
}

function orderedSamples(accumulator: DurationAccumulator): number[] {
  if (accumulator.samples.length < MAX_DURATION_SAMPLES || accumulator.writeIndex === 0) {
    return [...accumulator.samples];
  }
  return [
    ...accumulator.samples.slice(accumulator.writeIndex),
    ...accumulator.samples.slice(0, accumulator.writeIndex),
  ];
}

function pushBounded<T>(target: T[], value: T, limit: number): void {
  target.push(value);
  if (target.length > limit) target.splice(0, target.length - limit);
}

function pushSlowest<T extends { durationMs: number }>(target: T[], value: T, limit: number): void {
  target.push(value);
  target.sort((left, right) => right.durationMs - left.durationMs);
  if (target.length > limit) target.length = limit;
}

function cloneUnitPass(value: AiSchedulerUnitPassDiagnostic): AiSchedulerUnitPassDiagnostic {
  return { ...value, effectTypes: [...value.effectTypes] };
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
