import assert from 'node:assert/strict';
import { createDefaultCombatCatalogRegistry } from '../src/core/infantry-combat/catalogs';
import {
  MAX_AMMO_RESERVE_ENTRIES,
  MAX_APPLIED_AMMO_TRANSFER_ACTION_IDS,
  MAX_APPLIED_RELOAD_STAGE_IDS,
  MAX_WEAPON_DEPLOYMENT_RESULTS,
  appendBoundedLedger,
  equipPrimaryWeaponFromLoadout,
  requestDeployWeapon,
  requestUndeployWeapon,
  tickWeaponActions,
} from '../src/core/infantry-combat/runtime';
import { createInitialState } from '../src/core/simulation/SimulationState';

const PAIR_COUNT = 64;
const CYCLES = 12;
const state = createInitialState({
  width: 400,
  height: 200,
  cellSize: 20,
  metersPerCell: 1,
  defaultTerrain: 'field',
  defaultHeight: 0,
  objects: [],
}, Array.from({ length: PAIR_COUNT * 2 }, (_, index) => {
  const pair = Math.floor(index / 2);
  const helper = index % 2 === 1;
  return {
    id: `${helper ? 'helper' : 'gunner'}-${pair.toString().padStart(3, '0')}`,
    side: 'blue' as const,
    x: 5 + (pair % 16) * 20 + (helper ? 1 : 0),
    y: 5 + Math.floor(pair / 16) * 20,
    type: 'infantry_squad' as const,
    facingDegrees: 0,
  };
}));

const registry = createDefaultCombatCatalogRegistry();
for (let pair = 0; pair < PAIR_COUNT; pair += 1) {
  const gunner = state.units[pair * 2]!;
  const helper = state.units[pair * 2 + 1]!;
  assert.equal(equipPrimaryWeaponFromLoadout(gunner, registry, { definitionId: 'loadout_machine_gunner', revision: 1 }).status, 'equipped');
  assert.equal(equipPrimaryWeaponFromLoadout(helper, registry, { definitionId: 'loadout_assistant_machine_gunner', revision: 1 }).status, 'equipped');
}

let clock = 0;
for (let cycle = 0; cycle < CYCLES; cycle += 1) {
  for (let pair = 0; pair < PAIR_COUNT; pair += 1) {
    const gunner = state.units[pair * 2]!;
    const helper = state.units[pair * 2 + 1]!;
    assert.equal(requestDeployWeapon(state, gunner, {
      owner: { source: 'test', id: `stress-deploy-${cycle}-${pair}` },
      ownerToken: `stress-deploy-${cycle}-${pair}`,
      helperUnitId: helper.id,
      requestedSeconds: clock,
    }).status, 'started');
  }
  tickWeaponActions(state, { intervalStartSeconds: clock, deltaSeconds: 1.2 });
  clock += 1.2;
  for (let pair = 0; pair < PAIR_COUNT; pair += 1) {
    const gunner = state.units[pair * 2]!;
    const helper = state.units[pair * 2 + 1]!;
    assert.equal(gunner.infantryCombatRuntime.primaryWeapon!.deployment.mode, 'deployed');
    assert.equal(requestUndeployWeapon(state, gunner, {
      owner: { source: 'test', id: `stress-undeploy-${cycle}-${pair}` },
      ownerToken: `stress-undeploy-${cycle}-${pair}`,
      helperUnitId: helper.id,
      requestedSeconds: clock,
    }).status, 'started');
  }
  tickWeaponActions(state, { intervalStartSeconds: clock, deltaSeconds: 0.8 });
  clock += 0.8;
}

for (let pair = 0; pair < PAIR_COUNT; pair += 1) {
  const gunner = state.units[pair * 2]!;
  const helper = state.units[pair * 2 + 1]!;
  const deployment = gunner.infantryCombatRuntime.primaryWeapon!.deployment;
  assert.equal(deployment.mode, 'portable');
  assert.ok(deployment.actionResults.length <= MAX_WEAPON_DEPLOYMENT_RESULTS);
  assert.ok(gunner.infantryCombatRuntime.ammoInventory.reserves.length <= MAX_AMMO_RESERVE_ENTRIES);
  assert.equal(helper.behaviorRuntime.physicalActionCoordinator.activeLeases.length, 0);
}

const inventory = state.units[0]!.infantryCombatRuntime.ammoInventory;
for (let index = 0; index < 300; index += 1) {
  appendBoundedLedger(inventory.appliedReloadLoadIds, `reload-${index.toString().padStart(3, '0')}`, MAX_APPLIED_RELOAD_STAGE_IDS);
  appendBoundedLedger(inventory.appliedTransferIds, `transfer-${index.toString().padStart(3, '0')}`, MAX_APPLIED_AMMO_TRANSFER_ACTION_IDS);
}
assert.equal(inventory.appliedReloadLoadIds.length, MAX_APPLIED_RELOAD_STAGE_IDS);
assert.equal(inventory.appliedTransferIds.length, MAX_APPLIED_AMMO_TRANSFER_ACTION_IDS);
assert.deepEqual(inventory.appliedReloadLoadIds, [...inventory.appliedReloadLoadIds].sort());
assert.deepEqual(inventory.appliedTransferIds, [...inventory.appliedTransferIds].sort());
assert.equal(state.infantryCombatProjectiles.diagnostics.fullScanFallbackCount, 0);

console.log(`Stage 9 stress smoke passed: ${PAIR_COUNT} machine-gun teams, ${CYCLES} deploy/undeploy cycles, bounded ledgers.`);
