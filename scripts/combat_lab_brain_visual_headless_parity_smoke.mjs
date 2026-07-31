import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [catalog, scheduler, bridge, validation, digest, sceneRuntime] = await Promise.all([
  readFile('src/core/ai/AiGraphCatalog.ts', 'utf8'),
  readFile('src/core/ai/AiSimulationScheduler.ts', 'utf8'),
  readFile('src/core/ai/AiGameBridgeLegacy.ts', 'utf8'),
  readFile('src/core/testing/combat-lab/experiment/CombatLabExperimentValidation.ts', 'utf8'),
  readFile('src/core/testing/combat-lab/experiment/CombatLabExperimentDigest.ts', 'utf8'),
  readFile('src/core/testing/combat-lab/experiment/CombatLabParticipantSceneRuntime.ts', 'utf8'),
]);

assert.match(catalog, /export interface AiGraphCatalogV1/);
assert.match(catalog, /resolveAiGraphCatalogEntry/);
assert.match(catalog, /graphId/);
assert.match(scheduler, /resolveRuntimeGraphCatalogSnapshot/);
assert.match(scheduler, /resolveRuntimeGraphSnapshotForUnit/);
assert.match(bridge, /unit\.aiBrain/);
assert.doesNotMatch(
  bridge,
  /const graphSnapshot = options\.graphSnapshot \?\? resolveRuntimeGraphSnapshot\(\);/,
  'The runtime may not silently use the globally last-opened graph for every unit.',
);
assert.match(validation, /combat_lab_participant_graph_missing/);
assert.match(digest, /aiBrain/);
assert.match(digest, /aiGraphCatalog/);
assert.match(sceneRuntime, /unit\.aiBrain/);
assert.match(sceneRuntime, /aiGraphCatalog/);

console.log('Combat Lab brain visual/headless parity smoke passed.');