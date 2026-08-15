import assert from 'node:assert/strict';
import {
  createCombatLabSeriesArchive,
  parseCombatLabSeriesArchive,
  serializeCombatLabSeriesArchive,
  type CombatLabRunRecordV1,
  type CombatLabSeriesRecordV1,
} from '../src/core/testing/combat-lab/experiment/CombatLabSeriesRecords';

const experimentRef = {
  experimentId: 'exp-1',
  experimentRevision: 3,
  sourceDigest: 'digest-exp-1-r3',
} as const;
const frozenInputRef = {
  artifactId: 'input-exp-1-r3',
  schemaId: 'polygon-experiment-envelope',
  schemaVersion: 1,
  contentDigest: 'input-digest',
} as const;
const measurement = {
  measurementDefinitionId: 'measurement-hits',
  revision: 2,
  fingerprint: 'measurement-hits-r2-fp',
  titleRu: 'Попадания',
  streamId: 'fire.impact',
} as const;
const maximumSimulationSeconds = 60;

const series: CombatLabSeriesRecordV1 = {
  schemaVersion: 1,
  seriesId: 'series-1',
  experimentRef,
  frozenInputRef,
  runtimeVersionId: 'simulation-runtime-v1',
  measurementSetSnapshot: [measurement],
  requestedRunCount: 2,
  seedPolicy: 'random_per_run',
  maximumSimulationSeconds,
  status: 'completed',
  runIds: ['run-0', 'run-1'],
  createdAtIso: '2026-08-16T00:00:00.000Z',
  completedAtIso: '2026-08-16T00:01:00.000Z',
};
const runs: CombatLabRunRecordV1[] = [run('run-0', 0, 111, 3), run('run-1', 1, 222, 5)];

const archive = createCombatLabSeriesArchive(series, runs);
assert.equal(archive.runs.length, 2);
assert.ok(archive.archiveDigest.length > 0);
assert.equal(archive.runs[0]?.seed, 111);
assert.equal(archive.runs[0]?.maximumSimulationSeconds, maximumSimulationSeconds);
assert.equal(archive.runs[1]?.measurementValues[0]?.value, 5);

const serialized = serializeCombatLabSeriesArchive(archive);
const restored = parseCombatLabSeriesArchive(serialized);
assert.deepEqual(restored, archive);

assert.throws(
  () => createCombatLabSeriesArchive(series, [{ ...runs[0]!, runtimeVersionId: 'different-runtime' }, runs[1]!]),
  /runtimeVersionId differs from Series/,
);
assert.throws(
  () => createCombatLabSeriesArchive(series, [{ ...runs[0]!, maximumSimulationSeconds: 30 }, runs[1]!]),
  /maximumSimulationSeconds differs from Series/,
);
assert.throws(
  () => createCombatLabSeriesArchive(series, [{
    ...runs[0]!,
    measurementValues: [{ ...runs[0]!.measurementValues[0]!, measurementDefinitionFingerprint: 'wrong-fingerprint' }],
  }, runs[1]!]),
  /measurement value does not match frozen Series measurement/,
);
assert.throws(
  () => createCombatLabSeriesArchive(series, [runs[0]!, { ...runs[1]!, runId: 'run-0' }]),
  /RunId must be unique/,
);
assert.throws(
  () => createCombatLabSeriesArchive({ ...series, runIds: ['run-0'] }, [runs[0]!]),
  /Completed Series series-1 must contain exactly 2 RunIds/,
);

const tampered = JSON.parse(serialized) as Record<string, unknown>;
tampered.archiveDigest = 'tampered';
assert.throws(() => parseCombatLabSeriesArchive(JSON.stringify(tampered)), /archive digest mismatch/);

console.log('Combat Lab durable Series/Run record behavior smoke passed.');

function run(runId: string, runIndex: number, seed: number, hits: number): CombatLabRunRecordV1 {
  return {
    schemaVersion: 1,
    runId,
    seriesId: 'series-1',
    runIndex,
    experimentRef,
    frozenInputRef,
    runtimeVersionId: 'simulation-runtime-v1',
    seed,
    maximumSimulationSeconds,
    status: 'completed',
    success: true,
    stopReason: 'completed',
    simulatedSeconds: 12.5 + runIndex,
    measurementValues: [{
      measurementDefinitionId: measurement.measurementDefinitionId,
      measurementDefinitionRevision: measurement.revision,
      measurementDefinitionFingerprint: measurement.fingerprint,
      value: hits,
      sampleCount: hits,
    }],
    telemetryRef: {
      artifactId: `telemetry-${runId}`,
      schemaId: 'combat-lab-telemetry-dataset',
      schemaVersion: 1,
      contentDigest: `telemetry-digest-${runId}`,
    },
    journalRef: null,
    eventDigest: `event-digest-${runId}`,
    finalStateDigest: `final-digest-${runId}`,
  };
}
