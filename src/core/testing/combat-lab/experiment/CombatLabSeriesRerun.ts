import type { CombatLabExperimentV1 } from './CombatLabExperimentContracts';
import { digestCombatLabExperiment } from './CombatLabExperimentDigest';
import { runCombatLabExperiment } from './CombatLabExperimentRunner';
import type { CombatLabExperimentRunResultV1 } from './CombatLabBatchContracts';
import type { CombatLabFrozenArtifactRefV1, CombatLabRunRecordV1 } from './CombatLabSeriesRecords';

export interface CombatLabResolvedFrozenExperimentV1 {
  readonly frozenInputRef: CombatLabFrozenArtifactRefV1;
  readonly experiment: CombatLabExperimentV1;
}

export type CombatLabFrozenExperimentResolverV1 = (
  frozenInputRef: CombatLabFrozenArtifactRefV1,
) => CombatLabResolvedFrozenExperimentV1;

export type CombatLabRerunMismatchCodeV1 =
  | 'experiment_id'
  | 'experiment_revision'
  | 'source_digest'
  | 'seed'
  | 'event_digest'
  | 'final_state_digest';

export interface CombatLabFrozenRerunResultV1 {
  readonly schemaVersion: 1;
  readonly seriesId: string;
  readonly runId: string;
  readonly runIndex: number;
  readonly runtimeVersionId: string;
  readonly seed: number;
  readonly maximumSimulationSeconds: number;
  readonly verified: boolean;
  readonly mismatchCodes: readonly CombatLabRerunMismatchCodeV1[];
  readonly expectedEventDigest: string;
  readonly actualEventDigest: string;
  readonly expectedFinalStateDigest: string;
  readonly actualFinalStateDigest: string;
  readonly result: CombatLabExperimentRunResultV1;
}

export interface RerunCombatLabRunFromFrozenInputOptionsV1 {
  readonly runRecord: CombatLabRunRecordV1;
  readonly currentRuntimeVersionId: string;
  readonly resolveFrozenInput: CombatLabFrozenExperimentResolverV1;
}

/**
 * Recalculates one archived run from its exact frozen input and seed.
 * This is deterministic rerun verification, not recorded historical replay.
 */
export function rerunCombatLabRunFromFrozenInput(
  options: RerunCombatLabRunFromFrozenInputOptionsV1,
): CombatLabFrozenRerunResultV1 {
  const run = options.runRecord;
  const currentRuntimeVersionId = nonEmpty(options.currentRuntimeVersionId, 'Current runtimeVersionId');
  if (currentRuntimeVersionId !== run.runtimeVersionId) {
    throw new Error(
      `Cannot rerun ${run.runId}: runtime version ${currentRuntimeVersionId} does not match archived ${run.runtimeVersionId}.`,
    );
  }

  const resolved = options.resolveFrozenInput(run.frozenInputRef);
  assertSameFrozenArtifact(run.frozenInputRef, resolved.frozenInputRef, run.runId);
  assertFrozenExperimentIdentity(run, resolved.experiment);

  const result = runCombatLabExperiment({
    schemaVersion: 1,
    experiment: resolved.experiment,
    seed: run.seed,
    maximumSimulationSeconds: run.maximumSimulationSeconds,
  });

  const mismatchCodes: CombatLabRerunMismatchCodeV1[] = [];
  if (result.experimentId !== run.experimentRef.experimentId) mismatchCodes.push('experiment_id');
  if (result.experimentRevision !== run.experimentRef.experimentRevision) mismatchCodes.push('experiment_revision');
  if (result.sourceDigest !== run.experimentRef.sourceDigest) mismatchCodes.push('source_digest');
  if (result.seed !== run.seed) mismatchCodes.push('seed');
  if (result.eventDigest !== run.eventDigest) mismatchCodes.push('event_digest');
  if (result.finalStateDigest !== run.finalStateDigest) mismatchCodes.push('final_state_digest');

  return Object.freeze({
    schemaVersion: 1,
    seriesId: run.seriesId,
    runId: run.runId,
    runIndex: run.runIndex,
    runtimeVersionId: run.runtimeVersionId,
    seed: run.seed,
    maximumSimulationSeconds: run.maximumSimulationSeconds,
    verified: mismatchCodes.length === 0,
    mismatchCodes: Object.freeze(mismatchCodes),
    expectedEventDigest: run.eventDigest,
    actualEventDigest: result.eventDigest,
    expectedFinalStateDigest: run.finalStateDigest,
    actualFinalStateDigest: result.finalStateDigest,
    result,
  });
}

function assertFrozenExperimentIdentity(run: CombatLabRunRecordV1, experiment: CombatLabExperimentV1): void {
  if (experiment.experimentId !== run.experimentRef.experimentId) {
    throw new Error(`Frozen experiment for ${run.runId} has different experimentId.`);
  }
  if (experiment.revision !== run.experimentRef.experimentRevision) {
    throw new Error(`Frozen experiment for ${run.runId} has different experiment revision.`);
  }
  const sourceDigest = digestCombatLabExperiment(experiment);
  if (sourceDigest !== run.experimentRef.sourceDigest) {
    throw new Error(`Frozen experiment for ${run.runId} does not match archived sourceDigest.`);
  }
}

function assertSameFrozenArtifact(
  expected: CombatLabFrozenArtifactRefV1,
  actual: CombatLabFrozenArtifactRefV1,
  runId: string,
): void {
  if (expected.artifactId !== actual.artifactId
    || expected.schemaId !== actual.schemaId
    || expected.schemaVersion !== actual.schemaVersion
    || expected.contentDigest !== actual.contentDigest) {
    throw new Error(`Frozen input resolver returned a different artifact for ${runId}.`);
  }
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}
