import { COMBAT_LAB_METRIC_IDS } from './CombatLabContracts';
import {
  COMBAT_LAB_BATCH_MAX_CHUNK_SIZE,
  CombatLabBatchCancelledError,
  type CombatLabBatchPartialResultV1,
  type CombatLabBatchProgressV1,
  type CombatLabBatchRequestV1,
  type CombatLabBatchResultV1,
  type CombatLabBatchRunRecordV1,
  type CombatLabExperimentRunRequestV1,
  type CombatLabExperimentRunResultV1,
} from './CombatLabBatchContracts';
import { mergeCombatLabMetricValues, summarizeCombatLabDistribution } from './CombatLabBatchStatistics';
import { runCombatLabExperiment } from './CombatLabExperimentRunner';
import {
  createCombatLabRepresentativeCandidates,
  mergeCombatLabRepresentativeCandidates,
  selectCombatLabRepresentativeRuns,
  updateCombatLabRepresentativeCandidates,
  type CombatLabRepresentativeCandidatesV1,
} from './CombatLabRepresentativeRuns';
import { digestCombatLabExperiment } from './experiment/CombatLabExperimentDigest';
import { COMBAT_LAB_EXPERIMENT_LIMITS_V1 } from './experiment/CombatLabExperimentContracts';

const MAX_UINT32 = 0xffff_ffff;
const METRIC_ID_SET = new Set<string>(COMBAT_LAB_METRIC_IDS);

export interface CombatLabBatchRunOptionsV1 {
  readonly onProgress?: (progress: CombatLabBatchProgressV1) => void;
  readonly shouldAbort?: () => boolean;
  readonly chunkSize?: number;
}

export type CombatLabExperimentRunnerV1 = (
  request: CombatLabExperimentRunRequestV1,
) => CombatLabExperimentRunResultV1;

export function runCombatLabBatch(
  request: CombatLabBatchRequestV1,
  options: CombatLabBatchRunOptionsV1 = {},
): CombatLabBatchResultV1 {
  return runCombatLabBatchWithRunner(request, runCombatLabExperiment, options);
}

export function runCombatLabBatchWithRunner(
  request: CombatLabBatchRequestV1,
  runner: CombatLabExperimentRunnerV1,
  options: CombatLabBatchRunOptionsV1 = {},
): CombatLabBatchResultV1 {
  validateCombatLabBatchRequest(request);
  const runIndices = Array.from({ length: request.config.runCount }, (_, runIndex) => runIndex);
  const partial = runCombatLabBatchPartitionWithRunner(request, runIndices, runner, options);
  return mergeCombatLabBatchPartials(request, [partial]);
}

export function runCombatLabBatchPartition(
  request: CombatLabBatchRequestV1,
  runIndices: readonly number[],
  options: CombatLabBatchRunOptionsV1 = {},
): CombatLabBatchPartialResultV1 {
  return runCombatLabBatchPartitionWithRunner(request, runIndices, runCombatLabExperiment, options);
}

export function runCombatLabBatchPartitionWithRunner(
  request: CombatLabBatchRequestV1,
  sourceRunIndices: readonly number[],
  runner: CombatLabExperimentRunnerV1,
  options: CombatLabBatchRunOptionsV1 = {},
): CombatLabBatchPartialResultV1 {
  validateCombatLabBatchRequest(request);
  const chunkSize = options.chunkSize ?? COMBAT_LAB_BATCH_MAX_CHUNK_SIZE;
  validateChunkSize(chunkSize);
  const runIndices = validateRunIndices(sourceRunIndices, request.config.runCount);
  const sourceDigest = digestCombatLabExperiment(request.experiment);
  const metricValues = new Map<string, number[]>();
  for (const metricId of selectedMetricIds(request)) metricValues.set(metricId, []);
  const failureReasons = new Map<string, number>();
  let representativeCandidates = createCombatLabRepresentativeCandidates();
  let completedRuns = 0;
  let successCount = 0;

  for (const runIndex of runIndices) {
    if (options.shouldAbort?.()) throw new CombatLabBatchCancelledError(completedRuns, runIndices.length);
    const seed = combatLabSeedForRunIndex(request, runIndex);
    const result = runner({
      schemaVersion: 1,
      experiment: request.experiment,
      seed,
      maximumSimulationSeconds: request.config.maximumSimulationSeconds,
    });
    if (result.experimentId !== request.experiment.experimentId
      || result.experimentRevision !== request.experiment.revision
      || result.sourceDigest !== sourceDigest
      || result.seed !== seed) {
      throw new Error(`Combat Lab run ${runIndex} returned an incompatible identity.`);
    }
    const record = toRunRecord(runIndex, result);
    completedRuns += 1;
    if (record.success) successCount += 1;
    else failureReasons.set(record.stopReason, (failureReasons.get(record.stopReason) ?? 0) + 1);
    for (const [metricId, values] of metricValues) {
      const value = metricId === 'simulatedSeconds' ? record.simulatedSeconds : record.metrics[metricId] ?? 0;
      if (!Number.isFinite(value)) throw new Error(`Combat Lab metric ${metricId} returned a non-finite value.`);
      values.push(value);
    }
    representativeCandidates = updateCombatLabRepresentativeCandidates(representativeCandidates, record);
    if (completedRuns % chunkSize === 0 || completedRuns === runIndices.length) {
      options.onProgress?.(Object.freeze({
        batchRunId: request.batchRunId,
        experimentRevision: request.experiment.revision,
        sourceDigest,
        completedRuns,
        totalRuns: runIndices.length,
      }));
    }
  }

  return freezePartial({
    schemaVersion: 1,
    batchRunId: request.batchRunId,
    experimentId: request.experiment.experimentId,
    experimentRevision: request.experiment.revision,
    sourceDigest,
    completedRuns,
    successCount,
    failureCount: completedRuns - successCount,
    metricValues: Object.fromEntries(
      [...metricValues.entries()].map(([metricId, values]) => [metricId, Object.freeze([...values])]),
    ),
    failureReasons: Object.fromEntries([...failureReasons.entries()].sort(([left], [right]) => compareText(left, right))),
    representativeCandidates: representativeCandidateArray(representativeCandidates),
    firstFailures: representativeCandidates.firstFailures,
  });
}

export function combineCombatLabBatchPartials(
  request: CombatLabBatchRequestV1,
  partials: readonly CombatLabBatchPartialResultV1[],
): CombatLabBatchPartialResultV1 {
  validateCombatLabBatchRequest(request);
  const sourceDigest = digestCombatLabExperiment(request.experiment);
  let completedRuns = 0;
  let successCount = 0;
  const failureReasons = new Map<string, number>();
  const representativeSources: CombatLabRepresentativeCandidatesV1[] = [];

  for (const partial of partials) {
    assertPartialIdentity(request, sourceDigest, partial);
    completedRuns += partial.completedRuns;
    successCount += partial.successCount;
    for (const [reason, count] of Object.entries(partial.failureReasons)) {
      failureReasons.set(reason, (failureReasons.get(reason) ?? 0) + count);
    }
    let candidates = createCombatLabRepresentativeCandidates();
    for (const candidate of [...partial.representativeCandidates, ...Object.values(partial.firstFailures)].sort((left, right) => left.runIndex - right.runIndex)) {
      candidates = updateCombatLabRepresentativeCandidates(candidates, candidate);
    }
    representativeSources.push(candidates);
  }
  const mergedCandidates = mergeCombatLabRepresentativeCandidates(representativeSources);
  return freezePartial({
    schemaVersion: 1,
    batchRunId: request.batchRunId,
    experimentId: request.experiment.experimentId,
    experimentRevision: request.experiment.revision,
    sourceDigest,
    completedRuns,
    successCount,
    failureCount: completedRuns - successCount,
    metricValues: mergeCombatLabMetricValues(partials.map((partial) => partial.metricValues)),
    failureReasons: Object.fromEntries([...failureReasons.entries()].sort(([left], [right]) => compareText(left, right))),
    representativeCandidates: representativeCandidateArray(mergedCandidates),
    firstFailures: mergedCandidates.firstFailures,
  });
}

export function mergeCombatLabBatchPartials(
  request: CombatLabBatchRequestV1,
  partials: readonly CombatLabBatchPartialResultV1[],
): CombatLabBatchResultV1 {
  const combined = combineCombatLabBatchPartials(request, partials);
  if (combined.completedRuns !== request.config.runCount) {
    throw new Error(`Combat Lab batch is incomplete: ${combined.completedRuns} of ${request.config.runCount} runs.`);
  }
  const metrics = Object.freeze(Object.fromEntries(
    Object.entries(combined.metricValues)
      .sort(([left], [right]) => compareText(left, right))
      .map(([metricId, values]) => [metricId, summarizeCombatLabDistribution(values)]),
  ));
  let candidates = createCombatLabRepresentativeCandidates();
  for (const candidate of [...combined.representativeCandidates, ...Object.values(combined.firstFailures)].sort((left, right) => left.runIndex - right.runIndex)) {
    candidates = updateCombatLabRepresentativeCandidates(candidates, candidate);
  }
  const representatives = selectCombatLabRepresentativeRuns(
    candidates,
    combined.failureReasons,
    request.config.representativeRunCount,
  );
  return Object.freeze({
    schemaVersion: 1,
    batchRunId: request.batchRunId,
    experimentId: request.experiment.experimentId,
    experimentRevision: request.experiment.revision,
    sourceDigest: combined.sourceDigest,
    runCount: combined.completedRuns,
    successCount: combined.successCount,
    failureCount: combined.failureCount,
    successRate: canonicalNumber(combined.successCount / combined.completedRuns),
    metrics,
    failureReasons: combined.failureReasons,
    representatives,
  });
}

export function combatLabSeedForRunIndex(request: CombatLabBatchRequestV1, runIndex: number): number {
  if (!Number.isInteger(runIndex) || runIndex < 0 || runIndex >= request.config.runCount) {
    throw new Error(`Combat Lab runIndex must be in 0..${request.config.runCount - 1}.`);
  }
  const strategy = request.config.seedStrategy;
  if (strategy.kind === 'fixed') return strategy.seed;
  if (strategy.kind === 'explicit') return strategy.seeds[runIndex]!;
  const normalized = (strategy.firstSeed + runIndex) >>> 0;
  return normalized === 0 ? 1 : normalized;
}

export function validateCombatLabBatchRequest(request: CombatLabBatchRequestV1): void {
  if (request.schemaVersion !== 1) throw new Error(`Unsupported Combat Lab batch schema: ${request.schemaVersion}.`);
  if (!request.batchRunId.trim()) throw new Error('Combat Lab batchRunId must be a non-empty string.');
  const { config } = request;
  const limits = COMBAT_LAB_EXPERIMENT_LIMITS_V1;
  if (!Number.isInteger(config.runCount) || config.runCount < limits.minimumRunCount || config.runCount > limits.maximumRunCount) {
    throw new Error(`Combat Lab runCount must be in ${limits.minimumRunCount}..${limits.maximumRunCount}.`);
  }
  if (!Number.isInteger(config.workerCount) || config.workerCount < limits.minimumWorkerCount || config.workerCount > limits.maximumWorkerCount) {
    throw new Error(`Combat Lab workerCount must be in ${limits.minimumWorkerCount}..${limits.maximumWorkerCount}.`);
  }
  if (!Number.isInteger(config.representativeRunCount)
    || config.representativeRunCount < limits.minimumRepresentativeRuns
    || config.representativeRunCount > limits.maximumRepresentativeRuns) {
    throw new Error(`Combat Lab representativeRunCount must be in ${limits.minimumRepresentativeRuns}..${limits.maximumRepresentativeRuns}.`);
  }
  if (!Number.isFinite(config.maximumSimulationSeconds)
    || config.maximumSimulationSeconds < limits.minimumSimulationSeconds
    || config.maximumSimulationSeconds > limits.maximumSimulationSeconds) {
    throw new Error(`Combat Lab maximumSimulationSeconds must be in ${limits.minimumSimulationSeconds}..${limits.maximumSimulationSeconds}.`);
  }
  if (config.metricIds.some((metricId) => !METRIC_ID_SET.has(metricId))) {
    throw new Error('Combat Lab batch contains an unsupported metric ID.');
  }
  const strategy = config.seedStrategy;
  if (strategy.kind === 'fixed') validateSeed(strategy.seed, 'fixed seed');
  else if (strategy.kind === 'sequential') validateSeed(strategy.firstSeed, 'first sequential seed');
  else {
    if (strategy.seeds.length !== config.runCount) throw new Error('Explicit seed list length must equal runCount.');
    for (const seed of strategy.seeds) validateSeed(seed, 'explicit seed');
  }
}

function selectedMetricIds(request: CombatLabBatchRequestV1): readonly string[] {
  return Object.freeze([...new Set<string>(['simulatedSeconds', ...request.config.metricIds])].sort());
}

function validateRunIndices(source: readonly number[], runCount: number): readonly number[] {
  const sorted = [...source].sort((left, right) => left - right);
  for (let index = 0; index < sorted.length; index += 1) {
    const runIndex = sorted[index]!;
    if (!Number.isInteger(runIndex) || runIndex < 0 || runIndex >= runCount) {
      throw new Error(`Combat Lab partition runIndex ${runIndex} is outside 0..${runCount - 1}.`);
    }
    if (index > 0 && runIndex === sorted[index - 1]) throw new Error(`Combat Lab partition contains duplicate runIndex ${runIndex}.`);
  }
  return Object.freeze(sorted);
}

function validateChunkSize(chunkSize: number): void {
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > COMBAT_LAB_BATCH_MAX_CHUNK_SIZE) {
    throw new Error(`Combat Lab chunkSize must be in 1..${COMBAT_LAB_BATCH_MAX_CHUNK_SIZE}.`);
  }
}

function validateSeed(seed: number, label: string): void {
  if (!Number.isInteger(seed) || seed < 1 || seed > MAX_UINT32) {
    throw new Error(`Combat Lab ${label} must be an integer in 1..4294967295.`);
  }
}

function toRunRecord(runIndex: number, result: CombatLabExperimentRunResultV1): CombatLabBatchRunRecordV1 {
  return Object.freeze({
    runIndex,
    seed: result.seed,
    success: result.success,
    stopReason: result.stopReason,
    simulatedSeconds: result.simulatedSeconds,
    metrics: Object.freeze({ ...result.metrics }),
    eventDigest: result.eventDigest,
    finalStateDigest: result.finalStateDigest,
  });
}

function representativeCandidateArray(
  candidates: CombatLabRepresentativeCandidatesV1,
): readonly CombatLabBatchRunRecordV1[] {
  const unique = new Map<number, CombatLabBatchRunRecordV1>();
  for (const candidate of [
    candidates.fastestSuccess,
    candidates.slowestSuccess,
    candidates.highestAmmoUse,
    candidates.lowestAmmoUse,
    ...candidates.fallbacks,
  ]) {
    if (candidate) unique.set(candidate.runIndex, candidate);
  }
  return Object.freeze([...unique.values()].sort((left, right) => left.runIndex - right.runIndex));
}

function assertPartialIdentity(
  request: CombatLabBatchRequestV1,
  sourceDigest: string,
  partial: CombatLabBatchPartialResultV1,
): void {
  if (partial.schemaVersion !== 1
    || partial.batchRunId !== request.batchRunId
    || partial.experimentId !== request.experiment.experimentId
    || partial.experimentRevision !== request.experiment.revision
    || partial.sourceDigest !== sourceDigest) {
    throw new Error('Combat Lab partial result identity does not match the active batch.');
  }
  if (partial.successCount + partial.failureCount !== partial.completedRuns) {
    throw new Error('Combat Lab partial result counts are inconsistent.');
  }
}

function freezePartial(partial: CombatLabBatchPartialResultV1): CombatLabBatchPartialResultV1 {
  return Object.freeze({
    ...partial,
    metricValues: Object.freeze(partial.metricValues),
    failureReasons: Object.freeze(partial.failureReasons),
    representativeCandidates: Object.freeze([...partial.representativeCandidates]),
    firstFailures: Object.freeze(partial.firstFailures),
  });
}

function canonicalNumber(value: number): number {
  return Math.round(value * 1_000_000_000) / 1_000_000_000;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
