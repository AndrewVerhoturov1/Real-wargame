import assert from 'node:assert/strict';
import {
  buildCombatLabSeriesDistribution,
  filterCombatLabSeriesRuns,
  findCombatLabSeriesOutliers,
  getCombatLabSeriesRunById,
  summarizeCombatLabSeriesMeasurement,
} from '../src/core/testing/combat-lab/experiment/CombatLabSeriesAnalysis';
import {
  createCombatLabSeriesArchive,
  type CombatLabRunRecordV1,
  type CombatLabSeriesRecordV1,
} from '../src/core/testing/combat-lab/experiment/CombatLabSeriesRecords';

const values = [5, 5, 5, 5, 5, 5, 5, 5, 5, 0];
const maximumSimulationSeconds = 60;
const series = seriesRecord(values.length);
const runs = values.map((value, index) => runRecord(index, value));
const archive = createCombatLabSeriesArchive(series, runs);

const summary = summarizeCombatLabSeriesMeasurement(archive, 'measurement-hits');
assert.equal(summary.runCount, 10);
assert.equal(summary.mean, 4.5);
assert.equal(summary.median, 5);
assert.equal(summary.min, 0);
assert.equal(summary.max, 5);
assert.equal(summary.range, 5);

const distribution = buildCombatLabSeriesDistribution(archive, 'measurement-hits', 5);
assert.equal(distribution.buckets.reduce((sum, bucket) => sum + bucket.count, 0), 10);
assert.ok(distribution.buckets.some((bucket) => bucket.runIds.includes('run-9')));
assert.ok(distribution.buckets.some((bucket) => bucket.runIds.includes('run-0')));

const low = filterCombatLabSeriesRuns(archive, [{
  measurementDefinitionId: 'measurement-hits',
  operator: 'lt',
  value: 1,
}]);
assert.deepEqual(low.map((run) => run.runId), ['run-9']);

const normal = filterCombatLabSeriesRuns(archive, [{
  measurementDefinitionId: 'measurement-hits',
  operator: 'between',
  value: 4,
  maxValue: 6,
}]);
assert.equal(normal.length, 9);

const outliers = findCombatLabSeriesOutliers(archive, 'measurement-hits');
assert.equal(outliers.length, 1);
assert.equal(outliers[0]?.runId, 'run-9');
assert.equal(outliers[0]?.seed, 1010);
assert.equal(outliers[0]?.value, 0);
assert.match(outliers[0]?.reasonRu ?? '', /ниже типичного диапазона/);

assert.equal(getCombatLabSeriesRunById(archive, 'run-3')?.runIndex, 3);
assert.equal(getCombatLabSeriesRunById(archive, 'missing'), null);
assert.throws(() => summarizeCombatLabSeriesMeasurement(archive, 'missing-measurement'), /does not contain measurement/);
assert.throws(() => buildCombatLabSeriesDistribution(archive, 'measurement-hits', 0), /bucketCount/);

console.log('Combat Lab Series analysis behavior smoke passed.');

function seriesRecord(count: number): CombatLabSeriesRecordV1 {
  return {
    schemaVersion: 1,
    seriesId: 'series-analysis',
    experimentRef: { experimentId: 'exp', experimentRevision: 1, sourceDigest: 'exp-digest' },
    frozenInputRef: { artifactId: 'input-1', schemaId: 'polygon-experiment-envelope', schemaVersion: 1, contentDigest: 'input-digest' },
    runtimeVersionId: 'runtime-v1',
    measurementSetSnapshot: [{
      measurementDefinitionId: 'measurement-hits',
      revision: 1,
      fingerprint: 'hits-fingerprint',
      titleRu: 'Попадания',
      streamId: 'fire.impact',
    }],
    requestedRunCount: count,
    seedPolicy: 'random_per_run',
    maximumSimulationSeconds,
    status: 'completed',
    runIds: Array.from({ length: count }, (_, index) => `run-${index}`),
    createdAtIso: '2026-08-16T00:00:00.000Z',
    completedAtIso: '2026-08-16T00:01:00.000Z',
  };
}

function runRecord(index: number, value: number): CombatLabRunRecordV1 {
  return {
    schemaVersion: 1,
    runId: `run-${index}`,
    seriesId: 'series-analysis',
    runIndex: index,
    experimentRef: { experimentId: 'exp', experimentRevision: 1, sourceDigest: 'exp-digest' },
    frozenInputRef: { artifactId: 'input-1', schemaId: 'polygon-experiment-envelope', schemaVersion: 1, contentDigest: 'input-digest' },
    runtimeVersionId: 'runtime-v1',
    seed: 1001 + index,
    maximumSimulationSeconds,
    status: 'completed',
    success: true,
    stopReason: 'completed',
    simulatedSeconds: 10 + index,
    measurementValues: [{
      measurementDefinitionId: 'measurement-hits',
      measurementDefinitionRevision: 1,
      measurementDefinitionFingerprint: 'hits-fingerprint',
      value,
      sampleCount: value,
    }],
    telemetryRef: null,
    journalRef: null,
    eventDigest: `event-${index}`,
    finalStateDigest: `final-${index}`,
  };
}
