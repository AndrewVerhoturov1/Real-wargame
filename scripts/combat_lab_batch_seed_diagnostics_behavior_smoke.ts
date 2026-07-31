import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildCombatLabBuiltInExperiment,
  digestCombatLabExperiment,
  getCombatLabScenarioDefinition,
  runCombatLabBatchWithRunner,
  type CombatLabBatchRequestV1,
  type CombatLabExperimentRunResultV1,
} from '../src/core/testing/combat-lab';

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const definition = getCombatLabScenarioDefinition('rifle-distance-baseline');
  const experiment = buildCombatLabBuiltInExperiment(definition.scenarioId, definition.defaultSeed);
  assert.equal(experiment.batchDefaults.seedStrategy.kind, 'sequential');
  if (experiment.batchDefaults.seedStrategy.kind === 'sequential') {
    assert.equal(experiment.batchDefaults.seedStrategy.firstSeed, experiment.defaults.seed);
  }

  const request: CombatLabBatchRequestV1 = {
    schemaVersion: 1,
    batchRunId: 'seed-diagnostics-smoke',
    experiment,
    config: {
      ...experiment.batchDefaults,
      runCount: 4,
      seedStrategy: { kind: 'sequential', firstSeed: experiment.defaults.seed },
      representativeRunCount: 4,
      metricIds: ['hits'],
    },
  };
  const seenSeeds: number[] = [];
  const result = runCombatLabBatchWithRunner(request, ({ seed }): CombatLabExperimentRunResultV1 => {
    seenSeeds.push(seed);
    const index = seenSeeds.length - 1;
    return {
      schemaVersion: 1,
      experimentId: experiment.experimentId,
      experimentRevision: experiment.revision,
      sourceDigest: digestCombatLabExperiment(experiment),
      seed,
      completed: true,
      success: index !== 2,
      stopReason: index === 2 ? 'combat_lab_batch_maximum_time' : 'combat_lab_program_complete',
      simulatedSeconds: index + 1,
      metrics: { hits: index },
      eventDigest: `event-${seed}`,
      finalStateDigest: index < 2 ? `digest-${seed}` : 'shared-digest',
      stepFailureCode: null,
    };
  });

  assert.deepEqual(seenSeeds, [definition.defaultSeed, definition.defaultSeed + 1, definition.defaultSeed + 2, definition.defaultSeed + 3]);
  assert.equal(result.diagnostics.completedRuns, 4);
  assert.equal(result.diagnostics.uniqueSeedCount, 4);
  assert.equal(result.diagnostics.uniqueFinalStateDigestCount, 3, 'Одинаковый digest при разных seed является диагностикой, а не ошибкой.');
  assert.equal(result.diagnostics.timeLimitStopCount, 1);
  assert.equal(result.metrics.hits.count, 4);
  assert.equal(result.metrics.hits.sampleCount, 4);
  assert.equal(result.metrics.hits.minimum, 0);
  assert.equal(result.metrics.hits.maximum, 3);
  assert.equal(result.metrics.hits.median, 1.5);
  assert.equal(result.metrics.hits.mean, 1.5);
  assert.ok(result.metrics.hits.standardDeviation > 0);
  assert.ok(result.representatives.every((representative) => Number.isInteger(representative.seed) && representative.stopReason.length > 0));

  const [setup, progress, diagnostics, panel, results] = await Promise.all([
    readFile('src/combat-lab/ui/CombatLabBatchSetupView.ts', 'utf8'),
    readFile('src/combat-lab/ui/CombatLabBatchProgressView.ts', 'utf8'),
    readFile('src/combat-lab/ui/CombatLabBatchDiagnosticsView.ts', 'utf8'),
    readFile('src/combat-lab/ui/CombatLabBatchPanel.ts', 'utf8'),
    readFile('src/combat-lab/ui/CombatLabBatchResultsView.ts', 'utf8'),
  ]);
  assert.match(setup, /Повторить один и тот же случай/);
  assert.match(setup, /Последовательн/);
  assert.match(setup, /уникальн.*seed|seed.*уникальн/i);
  assert.match(progress, /Выполнено/);
  assert.match(diagnostics, /uniqueSeedCount/);
  assert.match(diagnostics, /uniqueFinalStateDigestCount/);
  assert.match(panel, /CombatLabBatchSetupView/);
  assert.match(panel, /CombatLabBatchProgressView/);
  assert.match(results, /CombatLabBatchDiagnosticsView/);

  console.log('Combat Lab batch seed diagnostics behavior smoke passed.');
}
