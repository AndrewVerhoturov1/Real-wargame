import assert from 'node:assert/strict';
import { createDefaultCombatCatalogRegistry } from '../src/core/infantry-combat/catalogs';
import {
  cancelWeaponDeploymentAction,
  equipPrimaryWeaponFromLoadout,
  requestDeployWeapon,
  requestUndeployWeapon,
  tickWeaponActions,
} from '../src/core/infantry-combat/runtime';
import { createInitialState } from '../src/core/simulation/SimulationState';

const state = createState();
const gunner = state.units[0]!;
const helper = state.units[1]!;
const registry = createDefaultCombatCatalogRegistry();
assert.equal(equipPrimaryWeaponFromLoadout(gunner, registry, { definitionId: 'loadout_machine_gunner', revision: 1 }).status, 'equipped');
assert.equal(equipPrimaryWeaponFromLoadout(helper, registry, { definitionId: 'loadout_assistant_machine_gunner', revision: 1 }).status, 'equipped');

const rifle = state.units[2]!;
assert.equal(equipPrimaryWeaponFromLoadout(rifle, registry, { definitionId: 'loadout_rifleman', revision: 1 }).status, 'equipped');
assert.equal(requestDeployWeapon(state, rifle, request('rifle-deploy', null)).status, 'unsupported_weapon');

const started = requestDeployWeapon(state, gunner, request('deploy', helper.id));
assert.equal(started.status, 'started');
assert.deepEqual(started.gunnerLease?.channels, ['locomotion', 'posture', 'weapon']);
assert.deepEqual(started.helperLease?.channels, ['locomotion', 'weapon']);
assert.equal(gunner.infantryCombatRuntime.primaryWeapon!.deployment.mode, 'deploying');

tickWeaponActions(state, { intervalStartSeconds: 0, deltaSeconds: 1.6 * 0.72 });
assert.equal(gunner.infantryCombatRuntime.primaryWeapon!.deployment.mode, 'deployed');
assert.ok(gunner.infantryCombatRuntime.primaryWeapon!.deployment.anchor);
assert.equal(gunner.infantryCombatRuntime.primaryWeapon!.deployment.traverseCenterRadians, gunner.facingRadians);

const undeploy = requestUndeployWeapon(state, gunner, request('undeploy', null));
assert.equal(undeploy.status, 'started');
tickWeaponActions(state, { intervalStartSeconds: 2, deltaSeconds: 1.1 });
assert.equal(gunner.infantryCombatRuntime.primaryWeapon!.deployment.mode, 'portable');
assert.equal(gunner.infantryCombatRuntime.primaryWeapon!.deployment.anchor, null);

const cancelled = requestDeployWeapon(state, gunner, request('cancelled-deploy', null));
assert.equal(cancelled.status, 'started');
tickWeaponActions(state, { intervalStartSeconds: 4, deltaSeconds: 0.4 });
assert.equal(cancelWeaponDeploymentAction(gunner, 'cancelled-deploy-token', 4.4).status, 'cancelled');
assert.equal(gunner.infantryCombatRuntime.primaryWeapon!.deployment.mode, 'portable');

console.log('Stage 9 deployment smoke passed.');

function request(id: string, helperUnitId: string | null) {
  return {
    owner: { source: 'test' as const, id },
    ownerToken: `${id}-token`,
    helperUnitId,
    requestedSeconds: 0,
  };
}

function createState() {
  return createInitialState({ width: 40, height: 20, cellSize: 20, metersPerCell: 1, defaultTerrain: 'field', defaultHeight: 0, objects: [] }, [
    { id: 'gunner', side: 'blue', x: 5, y: 5, type: 'infantry_squad', facingDegrees: 0 },
    { id: 'helper', side: 'blue', x: 6, y: 5, type: 'infantry_squad', facingDegrees: 0 },
    { id: 'rifle', side: 'blue', x: 9, y: 5, type: 'infantry_squad', facingDegrees: 0 },
  ]);
}
