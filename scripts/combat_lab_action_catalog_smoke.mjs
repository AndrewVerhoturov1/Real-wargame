import assert from 'node:assert/strict';
import { loadTypescriptModule, makeExperiment } from './combat_lab_participant_test_support.mjs';

const catalog = loadTypescriptModule('src/combat-lab/scenario-editor/CombatLabActionCatalog.ts');
const roles = [
  { roleId: 'alpha', unitId: 'unit-alpha', titleRu: 'Альфа', parameters: { schemaVersion: 1, accuracy: null } },
  { roleId: 'bravo', unitId: 'unit-bravo', titleRu: 'Браво', parameters: { schemaVersion: 1, accuracy: null } },
];
const experiment = makeExperiment({ roles });
experiment.markers = [
  { markerId: 'destination', kind: 'point', titleRu: 'Позиция', xMetres: 10, yMetres: 20, zMetres: 0 },
  { markerId: 'facing', kind: 'point', titleRu: 'Направление', xMetres: 20, yMetres: 20, zMetres: 0 },
];

const ids = catalog.listCombatLabActionDescriptors().map((item) => item.id);
for (const required of [
  'move', 'recon', 'assault', 'face', 'stand', 'crouch', 'prone',
  'fire-single', 'fire-short', 'fire-long', 'fire-suppress',
  'reload', 'deploy', 'undeploy', 'transfer', 'first-aid',
  'wait-time', 'wait-condition', 'cancel-movement', 'cancel-fire',
  'cancel-reload', 'cancel-deployment', 'cancel-transfer', 'cancel-first-aid',
]) assert.ok(ids.includes(required), `missing catalog action: ${required}`);
assert.equal(new Set(ids).size, ids.length, 'catalog ids must be unique');

const assault = catalog.createCombatLabActionFromCatalog(experiment, 'alpha', 'assault', {
  markerId: 'destination', finalFacingMarkerId: 'facing',
});
assert.deepEqual(assault, {
  kind: 'move', actorRoleId: 'alpha', markerId: 'destination', tacticalOrderPresetId: 'assault', finalFacingMarkerId: 'facing',
});
const cancelAid = catalog.createCombatLabActionFromCatalog(experiment, 'alpha', 'cancel-first-aid');
assert.deepEqual(cancelAid, { kind: 'cancel_action', actorRoleId: 'alpha', target: 'first_aid' });
assert.equal(catalog.findCombatLabActionDescriptorForAction(cancelAid).id, 'cancel-first-aid');
assert.equal(catalog.createCombatLabActionFromCatalog(experiment, 'alpha', 'wait-condition').durationSeconds, null);

console.log('combat_lab_action_catalog_smoke: PASS');
