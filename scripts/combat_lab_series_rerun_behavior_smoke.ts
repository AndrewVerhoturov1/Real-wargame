import assert from 'node:assert/strict';
import {
  buildCombatLabBuiltInExperiment,
  digestCombatLabExperiment,
  getCombatLabScenarioDefinition,
  runCombatLabExperiment,
  type CombatLabRunRecordV1,
} from '../src/core/testing/combat-lab';
import { rerunCombatLabRunFromFrozenInput } from '../src/core/testing/combat-lab/experiment/CombatLabSeriesRerun';

const definition = getCombatLabScenarioDefinition('rifle-distance-baseline');
const experiment = buildCombatLabBuiltInExperiment(definition.scenarioId, definition.defaultSeed);
const maximumSimulationSeconds = Math.min(30, experiment.batchDefaults.maximumSimulationSeconds);
const baseline = runCombatLabExperiment({
  schemaVersion: 1,
  experiment,
  seed: experiment.defaults.seed,
  maximumSimulationSeconds,
});
const sourceDigest = digestCombatLabExperiment(experiment);
const frozenInputRef = {
  artifactId: `${experiment.experimentId}@${experiment.revision}`,
  schemaId: 'combat-lab-experiment',
  schemaVersion: 1,
  contentDigest: sourceDigest,
} as const;
const runRecord: CombatLabRunRecordV1 = {
  schemaVersion: 1,
  runId: 'run-rerun-1',
  seriesId: 'series-rerun-1',
  runIndex: 0,
  experimentRef: {
    experimentId: experiment.experimentId,
    experimentRevision: experiment.revision,
    sourceDigest,
  },
  frozenInputRef,
  runtimeVersionId: 'test-runtime-v1',
  seed: experiment.defaults.seed,
  maximumSimulationSeconds,
  status: baseline.completed ? 'completed' : baseline.stopReasonCode === 'combat_lab_time_limit' ? 'stopped' : 'failed',
  success: baseline.success,
  stopReason: baseline.stopReasonCode ?? '',
  simulatedSeconds: baseline.simulatedSeconds,
  measurementValues: [],
  telemetryRef: null,
  journalRef: null,
  eventDigest: baseline.eventDigest,
  finalStateDigest: baseline.finalStateDigest,
};

const verified = rerunCombatLabRunFromFrozenInput({
  runRecord,
  currentRuntimeVersionId: 'test-runtime-v1',
  resolveFrozenInput: () => ({ frozenInputRef, experiment }),
});
assert.equal(verified.verified, true);
assert.deepEqual(verified.mismatchCodes, []);
assert.equal(verified.actualEventDigest, runRecord.eventDigest);
assert.equal(verified.actualFinalStateDigest, runRecord.finalStateDigest);
assert.equal(verified.result.seed, runRecord.seed);
assert.equal(verified.maximumSimulationSeconds, maximumSimulationSeconds);

const tamperedDigest = rerunCombatLabRunFromFrozenInput({
  runRecord: { ...runRecord, eventDigest: 'tampered-event-digest' },
  currentRuntimeVersionId: 'test-runtime-v1',
  resolveFrozenInput: () => ({ frozenInputRef, experiment }),
});
assert.equal(tamperedDigest.verified, false);
assert.deepEqual(tamperedDigest.mismatchCodes, ['event_digest']);

assert.throws(
  () => rerunCombatLabRunFromFrozenInput({
    runRecord,
    currentRuntimeVersionId: 'different-runtime',
    resolveFrozenInput: () => ({ frozenInputRef, experiment }),
  }),
  /runtime version different-runtime does not match archived test-runtime-v1/,
);
assert.throws(
  () => rerunCombatLabRunFromFrozenInput({
    runRecord,
    currentRuntimeVersionId: 'test-runtime-v1',
    resolveFrozenInput: () => ({
      frozenInputRef: { ...frozenInputRef, artifactId: 'wrong-artifact' },
      experiment,
    }),
  }),
  /returned a different artifact/,
);
assert.throws(
  () => rerunCombatLabRunFromFrozenInput({
    runRecord,
    currentRuntimeVersionId: 'test-runtime-v1',
    resolveFrozenInput: () => ({
      frozenInputRef,
      experiment: { ...experiment, revision: experiment.revision + 1 },
    }),
  }),
  /different experiment revision/,
);

console.log('Combat Lab frozen deterministic rerun behavior smoke passed.');
