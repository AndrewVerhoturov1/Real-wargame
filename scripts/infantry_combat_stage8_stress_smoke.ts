import assert from 'node:assert/strict';
import { createDefaultCombatCatalogRegistry } from '../src/core/infantry-combat/catalogs';
import {
  PRODUCTION_PROJECTILE_CAPACITY,
  PROJECTILE_STATE_SCHEMA_VERSION,
  createProjectileRuntimeState,
  equipPrimaryWeaponFromLoadout,
  serializeProjectileRuntimeState,
  tickProjectileRuntime,
  trySpawnProjectile,
  type ProjectileStateV1,
} from '../src/core/infantry-combat/runtime';
import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';

verifyFullCapacityBound();
verifyOrderIndependence();

console.log('Infantry combat Stage 8 stress smoke passed: 4096-projectile capacity, no resize, stable scratch buffers and deterministic order-independent stepping.');

function verifyFullCapacityBound(): void {
  const state = createStressState(200);
  const ammo = equipAndGetAmmo(state);
  state.infantryCombatProjectiles = createProjectileRuntimeState(PRODUCTION_PROJECTILE_CAPACITY);
  for (let index = 0; index < PRODUCTION_PROJECTILE_CAPACITY; index += 1) {
    assert.equal(trySpawnProjectile(
      state.infantryCombatProjectiles,
      projectile(index, ammo, PRODUCTION_PROJECTILE_CAPACITY),
    ).status, 'spawned');
  }
  assert.equal(state.infantryCombatProjectiles.pool.activeCount, PRODUCTION_PROJECTILE_CAPACITY);
  const beforeRejected = serializeProjectileRuntimeState(state.infantryCombatProjectiles);
  assert.equal(trySpawnProjectile(
    state.infantryCombatProjectiles,
    projectile(PRODUCTION_PROJECTILE_CAPACITY, ammo, PRODUCTION_PROJECTILE_CAPACITY + 1),
  ).status, 'capacity_exceeded');
  assert.equal(state.infantryCombatProjectiles.pool.activeCount, PRODUCTION_PROJECTILE_CAPACITY);
  assert.equal(state.infantryCombatProjectiles.pool.capacity, PRODUCTION_PROJECTILE_CAPACITY);
  assert.equal(state.infantryCombatProjectiles.diagnostics.poolResizeCount, 0);
  assert.deepEqual(
    serializeProjectileRuntimeState(state.infantryCombatProjectiles).activeProjectiles,
    beforeRejected.activeProjectiles,
  );

  tickProjectileRuntime(state, { intervalStartSeconds: 0, deltaSeconds: 1 / 30 });
  const scratchAfterWarmup = state.infantryCombatProjectiles.diagnostics.scratchAllocationCount;
  tickProjectileRuntime(state, { intervalStartSeconds: 1 / 30, deltaSeconds: 1 / 30 });
  const diagnostics = state.infantryCombatProjectiles.diagnostics;
  assert.equal(diagnostics.scratchAllocationCount, scratchAfterWarmup);
  assert.equal(diagnostics.poolResizeCount, 0);
  assert.equal(diagnostics.fullScanFallbackCount, 0);
  assert.equal(diagnostics.eventOverflowCount, 0);
  assert.equal(diagnostics.suppressionEventOverflowCount, 0);
  assert.equal(diagnostics.suppressionEventBufferCapacity, PRODUCTION_PROJECTILE_CAPACITY * 8);
  assert.ok(diagnostics.suppressionEventBufferHighWaterMark <= diagnostics.suppressionEventBufferCapacity);
  assert.equal(state.infantryCombatProjectiles.pool.activeCount, PRODUCTION_PROJECTILE_CAPACITY);
}

function verifyOrderIndependence(): void {
  const forward = createStressState(64);
  const reverse = createStressState(64);
  const ammoForward = equipAndGetAmmo(forward);
  const ammoReverse = equipAndGetAmmo(reverse);
  const count = 256;
  forward.infantryCombatProjectiles = createProjectileRuntimeState(count);
  reverse.infantryCombatProjectiles = createProjectileRuntimeState(count);
  const projectiles = Array.from({ length: count }, (_, index) => projectile(index, ammoForward, count));
  for (const item of projectiles) assert.equal(trySpawnProjectile(forward.infantryCombatProjectiles, item).status, 'spawned');
  for (const item of [...projectiles].reverse()) {
    assert.equal(trySpawnProjectile(reverse.infantryCombatProjectiles, { ...item, ammoSnapshot: structuredClone(ammoReverse) }).status, 'spawned');
  }
  tickProjectileRuntime(forward, { intervalStartSeconds: 0, deltaSeconds: 1 / 15 });
  tickProjectileRuntime(reverse, { intervalStartSeconds: 0, deltaSeconds: 1 / 15 });
  const left = serializeProjectileRuntimeState(forward.infantryCombatProjectiles);
  const right = serializeProjectileRuntimeState(reverse.infantryCombatProjectiles);
  assert.deepEqual(left.activeProjectiles, right.activeProjectiles);
  assert.deepEqual(left.impacts, right.impacts);
  assert.deepEqual(left.terminations, right.terminations);
  assert.equal(left.diagnostics.fullScanFallbackCount, right.diagnostics.fullScanFallbackCount);
  assert.equal(left.diagnostics.suppressionEventOverflowCount, right.diagnostics.suppressionEventOverflowCount);
}

function createStressState(unitCount: number): SimulationState {
  return createInitialState({
    width: 320,
    height: 200,
    cellSize: 20,
    metersPerCell: 1,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: [],
  }, Array.from({ length: unitCount }, (_, index) => ({
    id: `unit-${index.toString().padStart(4, '0')}`,
    side: index % 2 === 0 ? 'blue' as const : 'red' as const,
    x: 10 + (index % 20) * 12,
    y: 10 + Math.floor(index / 20) * 12,
    type: 'infantry_squad' as const,
    facingDegrees: 0,
  })));
}

function equipAndGetAmmo(state: SimulationState) {
  const shooter = state.units[0]!;
  assert.equal(equipPrimaryWeaponFromLoadout(
    shooter,
    createDefaultCombatCatalogRegistry(),
    { definitionId: 'loadout_submachine_gunner', revision: 1 },
  ).status, 'equipped');
  return structuredClone(shooter.infantryCombatRuntime.primaryWeapon!.resolved.ammo);
}

function projectile(
  index: number,
  ammo: ReturnType<typeof equipAndGetAmmo>,
  count: number,
): ProjectileStateV1 {
  const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
  return {
    schemaVersion: PROJECTILE_STATE_SCHEMA_VERSION,
    projectileId: `stress-projectile-${index.toString().padStart(5, '0')}`,
    shotId: `stress-shot-${index.toString().padStart(5, '0')}`,
    shooterId: 'unit-0000',
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
