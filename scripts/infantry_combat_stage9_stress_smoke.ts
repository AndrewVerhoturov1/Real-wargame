import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createDefaultCombatCatalogRegistry, type AmmoDefinitionV1 } from '../src/core/infantry-combat/catalogs';
import {
  MAX_AMMO_RESERVE_ENTRIES,
  MAX_APPLIED_AMMO_TRANSFER_ACTION_IDS,
  MAX_APPLIED_RELOAD_STAGE_IDS,
  MAX_WEAPON_DEPLOYMENT_RESULTS,
  PRODUCTION_PROJECTILE_CAPACITY,
  PROJECTILE_STATE_SCHEMA_VERSION,
  appendBoundedLedger,
  createProjectileRuntimeState,
  equipPrimaryWeaponFromLoadout,
  getReserveRounds,
  requestAmmoTransfer,
  requestDeployWeapon,
  requestReloadWeapon,
  serializeProjectileRuntimeState,
  tickProjectileRuntime,
  tickWeaponActions,
  trySpawnProjectile,
  type ProjectileStateV1,
} from '../src/core/infantry-combat/runtime';
import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';
import type { UnitModel } from '../src/core/units/UnitModel';

const TEAM_COUNT = 100;
const DEPLOY_TEAM_COUNT = 34;
const RELOAD_TEAM_END = 67;

const forward = runMixedStress(false);
const reversed = runMixedStress(true);
assert.deepEqual(reversed, forward);

console.log(
  `Stage 9 stress smoke passed: ${TEAM_COUNT} machine-gun teams, ${PRODUCTION_PROJECTILE_CAPACITY} active projectiles, mixed deploy/reload/transfer and deterministic reversed-unit repeat.`,
);

function runMixedStress(reverseUnits: boolean): unknown {
  const { state, teams, ammoDefinitionId } = createStressFixture(reverseUnits);
  const transferExpectations: Array<{
    readonly gunner: UnitModel;
    readonly helper: UnitModel;
    readonly gunnerBefore: number;
    readonly helperBefore: number;
  }> = [];

  for (let index = 0; index < teams.length; index += 1) {
    const { gunner, helper } = teams[index]!;
    if (index < DEPLOY_TEAM_COUNT) {
      assert.equal(requestDeployWeapon(state, gunner, {
        owner: { source: 'test', id: `stress-deploy-${index}` },
        ownerToken: `stress-deploy-${index}`,
        helperUnitId: helper.id,
        requestedSeconds: 0,
      }).status, 'started');
      continue;
    }
    if (index < RELOAD_TEAM_END) {
      gunner.infantryCombatRuntime.primaryWeapon!.roundsInWeapon = 0;
      assert.equal(requestReloadWeapon(state, gunner, {
        owner: { source: 'test', id: `stress-reload-${index}` },
        ownerToken: `stress-reload-${index}`,
        helperUnitId: helper.id,
        requestedSeconds: 0,
      }).status, 'started');
      continue;
    }
    transferExpectations.push({
      gunner,
      helper,
      gunnerBefore: getReserveRounds(gunner.infantryCombatRuntime.ammoInventory, ammoDefinitionId),
      helperBefore: getReserveRounds(helper.infantryCombatRuntime.ammoInventory, ammoDefinitionId),
    });
    assert.equal(requestAmmoTransfer(state, {
      sourceUnitId: helper.id,
      targetUnitId: gunner.id,
      ammoDefinitionId,
      requestedRounds: 30,
      ownerToken: `stress-transfer-${index}`,
      requestedSeconds: 0,
    }).status, 'started');
  }

  tickProjectileRuntime(state, { intervalStartSeconds: 0, deltaSeconds: 1 / 30 });
  const scratchAfterWarmup = state.infantryCombatProjectiles.diagnostics.scratchAllocationCount;
  tickProjectileRuntime(state, { intervalStartSeconds: 1 / 30, deltaSeconds: 1 / 30 });
  assert.equal(state.infantryCombatProjectiles.diagnostics.scratchAllocationCount, scratchAfterWarmup);
  assert.equal(state.infantryCombatProjectiles.pool.activeCount, PRODUCTION_PROJECTILE_CAPACITY);

  tickWeaponActions(state, { intervalStartSeconds: 0, deltaSeconds: 3 });

  for (let index = 0; index < teams.length; index += 1) {
    const { gunner, helper } = teams[index]!;
    const weapon = gunner.infantryCombatRuntime.primaryWeapon!;
    if (index < DEPLOY_TEAM_COUNT) {
      assert.equal(weapon.deployment.mode, 'deployed');
      assert.ok(weapon.deployment.actionResults.length <= MAX_WEAPON_DEPLOYMENT_RESULTS);
    } else if (index < RELOAD_TEAM_END) {
      assert.equal(gunner.infantryCombatRuntime.ammoInventory.activeReload, null);
      assert.equal(weapon.roundsInWeapon, weapon.resolved.weapon.capacityRounds);
      assert.equal(gunner.infantryCombatRuntime.ammoInventory.appliedReloadLoadIds.length, 1);
    }
    assert.ok(gunner.infantryCombatRuntime.ammoInventory.reserves.length <= MAX_AMMO_RESERVE_ENTRIES);
    assert.equal(gunner.behaviorRuntime.physicalActionCoordinator.activeLeases.length, 0);
    assert.equal(helper.behaviorRuntime.physicalActionCoordinator.activeLeases.length, 0);
  }

  for (const expectation of transferExpectations) {
    assert.equal(expectation.helper.infantryCombatRuntime.ammoInventory.activeTransfer, null);
    assert.equal(expectation.gunner.infantryCombatRuntime.ammoInventory.activeTransfer, null);
    assert.equal(
      getReserveRounds(expectation.helper.infantryCombatRuntime.ammoInventory, ammoDefinitionId),
      expectation.helperBefore - 30,
    );
    assert.equal(
      getReserveRounds(expectation.gunner.infantryCombatRuntime.ammoInventory, ammoDefinitionId),
      expectation.gunnerBefore + 30,
    );
    assert.equal(expectation.helper.infantryCombatRuntime.ammoInventory.appliedTransferIds.length, 1);
    assert.equal(expectation.gunner.infantryCombatRuntime.ammoInventory.appliedTransferIds.length, 1);
  }

  const boundedInventory = teams[0]!.gunner.infantryCombatRuntime.ammoInventory;
  for (let index = 0; index < 300; index += 1) {
    appendBoundedLedger(
      boundedInventory.appliedReloadLoadIds,
      `reload-${index.toString().padStart(3, '0')}`,
      MAX_APPLIED_RELOAD_STAGE_IDS,
    );
    appendBoundedLedger(
      boundedInventory.appliedTransferIds,
      `transfer-${index.toString().padStart(3, '0')}`,
      MAX_APPLIED_AMMO_TRANSFER_ACTION_IDS,
    );
  }
  assert.equal(boundedInventory.appliedReloadLoadIds.length, MAX_APPLIED_RELOAD_STAGE_IDS);
  assert.equal(boundedInventory.appliedTransferIds.length, MAX_APPLIED_AMMO_TRANSFER_ACTION_IDS);
  assert.deepEqual(boundedInventory.appliedReloadLoadIds, [...boundedInventory.appliedReloadLoadIds].sort());
  assert.deepEqual(boundedInventory.appliedTransferIds, [...boundedInventory.appliedTransferIds].sort());

  const diagnostics = state.infantryCombatProjectiles.diagnostics;
  assert.equal(diagnostics.poolResizeCount, 0);
  assert.equal(diagnostics.fullScanFallbackCount, 0);
  assert.equal(diagnostics.eventOverflowCount, 0);
  assert.equal(diagnostics.suppressionEventOverflowCount, 0);

  const projectileSnapshot = serializeProjectileRuntimeState(state.infantryCombatProjectiles);
  return {
    unitDigest: digest([...state.units]
      .sort((left, right) => compareText(left.id, right.id))
      .map((unit) => ({
        id: unit.id,
        roundsInWeapon: unit.infantryCombatRuntime.primaryWeapon?.roundsInWeapon ?? null,
        deploymentMode: unit.infantryCombatRuntime.primaryWeapon?.deployment.mode ?? null,
        reserves: unit.infantryCombatRuntime.ammoInventory.reserves.map((entry) => ({ ...entry })),
        appliedReloadLoadIds: [...unit.infantryCombatRuntime.ammoInventory.appliedReloadLoadIds],
        appliedTransferIds: [...unit.infantryCombatRuntime.ammoInventory.appliedTransferIds],
        activeLeaseCount: unit.behaviorRuntime.physicalActionCoordinator.activeLeases.length,
      }))),
    projectileDigest: digest({
      activeProjectiles: projectileSnapshot.activeProjectiles,
      impacts: projectileSnapshot.impacts,
      terminations: projectileSnapshot.terminations,
    }),
    activeProjectileCount: state.infantryCombatProjectiles.pool.activeCount,
    poolResizeCount: diagnostics.poolResizeCount,
    fullScanFallbackCount: diagnostics.fullScanFallbackCount,
    eventOverflowCount: diagnostics.eventOverflowCount,
    suppressionEventOverflowCount: diagnostics.suppressionEventOverflowCount,
  };
}

function createStressFixture(reverseUnits: boolean): {
  readonly state: SimulationState;
  readonly teams: readonly { readonly gunner: UnitModel; readonly helper: UnitModel }[];
  readonly ammoDefinitionId: string;
} {
  const state = createInitialState({
    width: 400,
    height: 200,
    cellSize: 20,
    metersPerCell: 1,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: [],
  }, Array.from({ length: TEAM_COUNT * 2 }, (_, index) => {
    const teamIndex = Math.floor(index / 2);
    const isHelper = index % 2 === 1;
    return {
      id: `${isHelper ? 'helper' : 'gunner'}-${teamIndex.toString().padStart(3, '0')}`,
      side: 'blue' as const,
      x: 5 + (teamIndex % 20) * 18 + (isHelper ? 1 : 0),
      y: 5 + Math.floor(teamIndex / 20) * 30,
      type: 'infantry_squad' as const,
      facingDegrees: 0,
    };
  }));
  const registry = createDefaultCombatCatalogRegistry();
  const teams = Array.from({ length: TEAM_COUNT }, (_, index) => {
    const gunner = state.units[index * 2]!;
    const helper = state.units[index * 2 + 1]!;
    assert.equal(equipPrimaryWeaponFromLoadout(
      gunner,
      registry,
      { definitionId: 'loadout_machine_gunner', revision: 1 },
    ).status, 'equipped');
    assert.equal(equipPrimaryWeaponFromLoadout(
      helper,
      registry,
      { definitionId: 'loadout_assistant_machine_gunner', revision: 1 },
    ).status, 'equipped');
    return { gunner, helper };
  });
  if (reverseUnits) state.units.reverse();

  const ammo = structuredClone(teams[0]!.gunner.infantryCombatRuntime.primaryWeapon!.resolved.ammo);
  state.infantryCombatProjectiles = createProjectileRuntimeState(PRODUCTION_PROJECTILE_CAPACITY);
  for (let index = 0; index < PRODUCTION_PROJECTILE_CAPACITY; index += 1) {
    assert.equal(trySpawnProjectile(
      state.infantryCombatProjectiles,
      projectile(index, ammo, PRODUCTION_PROJECTILE_CAPACITY),
    ).status, 'spawned');
  }
  return {
    state,
    teams,
    ammoDefinitionId: teams[0]!.gunner.infantryCombatRuntime.primaryWeapon!.resolved.ammoDefinitionRef.definitionId,
  };
}

function projectile(index: number, ammo: AmmoDefinitionV1, count: number): ProjectileStateV1 {
  const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
  return {
    schemaVersion: PROJECTILE_STATE_SCHEMA_VERSION,
    projectileId: `stage9-stress-projectile-${index.toString().padStart(5, '0')}`,
    shotId: `stage9-stress-shot-${index.toString().padStart(5, '0')}`,
    shooterId: 'gunner-000',
    ammoSnapshot: structuredClone(ammo),
    position: {
      xMetres: 20 + (index % columns) * 0.25,
      yMetres: 20 + Math.floor(index / columns) * 0.25,
      zMetres: 5,
    },
    velocityMetresPerSecond: { x: 0.1, y: 0, z: 0 },
    ageSeconds: 0,
    maximumLifetimeSeconds: ammo.maximumLifetimeSeconds,
    bodyPenetrationBudget: ammo.bodyPenetrationBudget,
    bodyPenetrationCount: 0,
    impactSequence: 0,
    lastHitUnitId: null,
    suppressionContinuousFireScore: (index % 8) / 8,
  };
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
