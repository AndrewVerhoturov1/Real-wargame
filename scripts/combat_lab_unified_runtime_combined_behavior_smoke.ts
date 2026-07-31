import assert from 'node:assert/strict';
import {
  buildCombatLabBuiltInExperiment,
  combatLabSeedForRunIndex,
  digestCombatLabExperiment,
  listCombatLabScenarioDefinitions,
  parseCombatLabExperiment,
  readCombatLabParticipantInitialDraft,
  runCombatLabBatchWithRunner,
  serializeCombatLabExperiment,
  updateCombatLabParticipantInitialState,
  type CombatLabBatchRequestV1,
  type CombatLabExperimentRunResultV1,
  type CombatLabExperimentV1,
  type CombatLabSeedStrategyV1,
} from '../src/core/testing/combat-lab';
import { AI_TEST_TIME_SCALES } from '../src/core/testing/AiTestLabRuntime';

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const definition = listCombatLabScenarioDefinitions()[0];
  assert.ok(definition, 'Combat Lab must expose at least one built-in scenario.');

  const base = buildCombatLabBuiltInExperiment(definition.scenarioId, definition.defaultSeed);
  assert.equal(base.sceneSnapshot.map.metersPerCell, 2, 'Built-in experiment must use the 2×2 metre grid.');
  assert.ok(AI_TEST_TIME_SCALES.includes(0.1), 'The visual runtime must retain the ×0.1 speed.');

  const prepared: CombatLabExperimentV1 = {
    ...base,
    revision: base.revision + 1,
    stopCondition: {
      ...base.stopCondition,
      maximumSimulationSeconds: 120,
    },
    batchDefaults: {
      ...base.batchDefaults,
      runCount: 3,
      maximumSimulationSeconds: 120,
      workerCount: 1,
      representativeRunCount: 3,
      seedStrategy: { kind: 'sequential', firstSeed: base.defaults.seed },
    },
  };
  const role = prepared.roles[0];
  assert.ok(role, 'Built-in experiment must contain a participant.');
  const initial = readCombatLabParticipantInitialDraft(prepared, role.roleId);
  const graph = {
    version: 2 as const,
    id: 'combined-regression-graph',
    name: 'Combined regression graph',
    nameRu: 'Объединённый проверочный граф',
    rootNodeId: 'root',
    nodes: [{ id: 'root', type: 'sequence' as const, title: 'Root', children: [] }],
  };
  const changed = updateCombatLabParticipantInitialState(prepared, role.roleId, {
    x: initial.x + 0.25,
    y: initial.y + 0.25,
    facingDegrees: 135,
    aiBrain: { schemaVersion: 1, kind: 'graph', graphId: graph.id },
    aiGraphDefinition: graph,
  });

  assert.equal(changed.sceneSnapshot.map.metersPerCell, 2, 'Participant editing must preserve the 2×2 metre grid.');
  assert.equal(changed.stopCondition.maximumSimulationSeconds, 120, 'Participant editing must preserve the 120 second limit.');
  assert.equal(changed.batchDefaults.maximumSimulationSeconds, 120, 'Participant editing must preserve the batch time limit.');
  assert.deepEqual(changed.batchDefaults.seedStrategy, {
    kind: 'sequential',
    firstSeed: base.defaults.seed,
  }, 'Participant editing must preserve the selected seed strategy.');

  const changedDraft = readCombatLabParticipantInitialDraft(changed, role.roleId);
  assert.equal(changedDraft.x, initial.x + 0.25);
  assert.equal(changedDraft.y, initial.y + 0.25);
  assert.equal(changedDraft.facingDegrees, 135);
  assert.equal(changedDraft.aiBrain.kind, 'graph');
  assert.equal(changedDraft.aiBrain.graphId, graph.id);
  assert.notEqual(digestCombatLabExperiment(changed), digestCombatLabExperiment(prepared));

  const parsed = parseCombatLabExperiment(serializeCombatLabExperiment(changed));
  assert.ok(parsed.experiment, parsed.issues.map((issue) => `${issue.code}: ${issue.messageRu}`).join('\n'));
  const restored = parsed.experiment!;
  const restoredDraft = readCombatLabParticipantInitialDraft(restored, role.roleId);
  assert.equal(restored.sceneSnapshot.map.metersPerCell, 2);
  assert.equal(restored.stopCondition.maximumSimulationSeconds, 120);
  assert.equal(restored.batchDefaults.maximumSimulationSeconds, 120);
  assert.deepEqual(restored.batchDefaults.seedStrategy, changed.batchDefaults.seedStrategy);
  assert.equal(restoredDraft.aiBrain.kind, 'graph');
  assert.equal(restoredDraft.aiBrain.graphId, graph.id);
  assert.equal(restoredDraft.facingDegrees, 135);

  assert.deepEqual(seedsFor({ kind: 'fixed', seed: 41 }, 3, restored), [41, 41, 41]);
  assert.deepEqual(seedsFor({ kind: 'sequential', firstSeed: 41 }, 3, restored), [41, 42, 43]);
  assert.deepEqual(seedsFor({ kind: 'explicit', seeds: [3, 5, 8] }, 3, restored), [3, 5, 8]);

  const batchRequest = requestFor({ kind: 'sequential', firstSeed: 71 }, 3, restored);
  const seenSeeds: number[] = [];
  const batchResult = runCombatLabBatchWithRunner(batchRequest, (run): CombatLabExperimentRunResultV1 => {
    seenSeeds.push(run.seed);
    const index = seenSeeds.length - 1;
    return {
      schemaVersion: 1,
      experimentId: restored.experimentId,
      experimentRevision: restored.revision,
      sourceDigest: digestCombatLabExperiment(restored),
      seed: run.seed,
      completed: true,
      success: index !== 1,
      stopReason: index === 1 ? 'combat_lab_batch_maximum_time' : 'combat_lab_program_complete',
      simulatedSeconds: index + 1,
      metrics: { hits: index },
      eventDigest: `event-${run.seed}`,
      finalStateDigest: index === 2 ? 'shared-final-state' : `final-${run.seed}`,
      stepFailureCode: null,
    };
  });
  assert.deepEqual(seenSeeds, [71, 72, 73]);
  assert.equal(batchResult.diagnostics.completedRuns, 3);
  assert.equal(batchResult.diagnostics.uniqueSeedCount, 3);
  assert.equal(batchResult.diagnostics.uniqueFinalStateDigestCount, 3);
  assert.equal(batchResult.diagnostics.timeLimitStopCount, 1);
  assert.equal(batchResult.metrics.hits.sampleCount, 3);
  assert.ok(batchResult.metrics.hits.standardDeviation > 0);

  console.log('Combat Lab unified editor/runtime combined behavior smoke passed.');
}

function seedsFor(
  seedStrategy: CombatLabSeedStrategyV1,
  runCount: number,
  experiment: CombatLabExperimentV1,
): readonly number[] {
  const request = requestFor(seedStrategy, runCount, experiment);
  return Array.from({ length: runCount }, (_, runIndex) => combatLabSeedForRunIndex(request, runIndex));
}

function requestFor(
  seedStrategy: CombatLabSeedStrategyV1,
  runCount: number,
  experiment: CombatLabExperimentV1,
): CombatLabBatchRequestV1 {
  return {
    schemaVersion: 1,
    batchRunId: `combined-${seedStrategy.kind}`,
    experiment,
    config: {
      ...experiment.batchDefaults,
      runCount,
      seedStrategy,
      maximumSimulationSeconds: 120,
      workerCount: 1,
      representativeRunCount: Math.min(runCount, 3),
      metricIds: ['hits'],
    },
  };
}
