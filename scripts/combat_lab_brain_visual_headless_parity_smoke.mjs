import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadTypescriptModule, makeExperiment, makeSceneUnit } from './combat_lab_participant_test_support.mjs';

const [catalog, scheduler, bridge, validation, runner, checkpoint, sceneRuntime] = await Promise.all([
  readFile('src/core/ai/AiGraphCatalog.ts', 'utf8'),
  readFile('src/core/ai/AiSimulationScheduler.ts', 'utf8'),
  readFile('src/core/ai/AiGameBridge.ts', 'utf8'),
  readFile('src/core/testing/combat-lab/experiment/CombatLabExperimentValidation.ts', 'utf8'),
  readFile('src/core/testing/combat-lab/experiment/CombatLabExperimentRunner.ts', 'utf8'),
  readFile('src/combat-lab/runtime/CombatLabCheckpoint.ts', 'utf8'),
  readFile('src/core/testing/combat-lab/experiment/CombatLabParticipantSceneRuntime.ts', 'utf8'),
]);

assert.match(catalog, /export interface AiGraphCatalogV1/);
assert.match(catalog, /resolveAiGraphCatalogEntry/);
assert.match(catalog, /resolveRuntimeGraphSnapshotForUnit/);
assert.match(scheduler, /resolveRuntimeGraphCatalogSnapshot/);
assert.match(scheduler, /resolveRuntimeGraphSnapshotForUnit/);
assert.match(scheduler, /graphResolutionCount:\s*1/);
assert.match(bridge, /resolveRuntimeGraphSnapshotForUnit\(state, unit\)/);
assert.match(bridge, /graphSnapshot:\s*exact/);
assert.match(validation, /combat_lab_participant_graph_missing/);
assert.match(runner, /installExperimentBrainRuntime/);
assert.match(runner, /installAiGraphCatalog/);
assert.match(checkpoint, /installSceneBrainData/);
assert.match(sceneRuntime, /aiGraphDefinition/);
assert.match(sceneRuntime, /installUnitAiBrainBinding/);

function unexpectedRuntimeSerializer(name) {
  return () => {
    throw new Error(`Experiment digest unexpectedly called runtime serializer: ${name}`);
  };
}

const digest = loadTypescriptModule(
  'src/core/testing/combat-lab/experiment/CombatLabExperimentDigest.ts',
  {
    '../../actions/PhysicalActionCoordinatorSerialization': {
      serializePhysicalActionCoordinatorState: unexpectedRuntimeSerializer('serializePhysicalActionCoordinatorState'),
    },
    '../../actions/PostureTransition': {
      serializeUnitPhysicalAction: unexpectedRuntimeSerializer('serializeUnitPhysicalAction'),
    },
    '../../infantry-combat/runtime': {
      serializeInfantryCombatUnitRuntime: unexpectedRuntimeSerializer('serializeInfantryCombatUnitRuntime'),
      serializeReferenceProjectileRuntimeState: unexpectedRuntimeSerializer('serializeReferenceProjectileRuntimeState'),
    },
    '../../movement/MovementRuntime': {
      serializeMovementRuntime: unexpectedRuntimeSerializer('serializeMovementRuntime'),
    },
  },
);
const baseUnit = makeSceneUnit('unit-a');
const base = makeExperiment({
  roles: [{ roleId: 'role-a', unitId: 'unit-a', titleRu: 'Боец', parameters: { schemaVersion: 1, accuracy: null } }],
  units: [{ ...baseUnit, aiControl: 'manual', aiBrain: { schemaVersion: 1, kind: 'manual' } }],
});
const graph = {
  version: 2,
  id: 'graph-a',
  name: 'Graph A',
  nameRu: 'Граф A',
  rootNodeId: 'root',
  nodes: [{ id: 'root', type: 'sequence', title: 'Root', children: [] }],
};
const graphBound = {
  ...base,
  sceneSnapshot: {
    ...base.sceneSnapshot,
    aiGraphCatalog: { schemaVersion: 1, graphs: [graph] },
    units: base.sceneSnapshot.units.map((unit) => ({
      ...unit,
      aiControl: 'graph',
      aiBrain: { schemaVersion: 1, kind: 'graph', graphId: 'graph-a' },
    })),
  },
};
assert.notEqual(
  digest.digestCombatLabExperiment(base),
  digest.digestCombatLabExperiment(graphBound),
  'Brain binding and graph catalog must participate in the deterministic experiment digest.',
);

console.log('Combat Lab brain visual/headless parity smoke passed.');
