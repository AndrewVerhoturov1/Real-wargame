import assert from 'node:assert/strict';
import { createDefaultCombatCatalogRegistry } from '../src/core/infantry-combat/catalogs';
import {
  MAX_BODY_PENETRATIONS_PER_PROJECTILE,
  calculateBodyImpactPhysics,
  createProjectileRuntimeState,
  getProjectileRuntimeDiagnostics,
  serializeProjectileRuntimeState,
  tickProjectileRuntime,
  trySpawnProjectile,
  type ProjectileStateV1,
} from '../src/core/infantry-combat/runtime';
import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';

const base = calculateBodyImpactPhysics({
  hitUnitId: 'target',
  hitZone: 'arms',
  hitShapeId: 'standing:arms:left',
  entryPoint: { xMetres: 0, yMetres: 0, zMetres: 1 },
  exitPoint: { xMetres: 0.18, yMetres: 0, zMetres: 1 },
  entryNormal: { x: -1, y: 0, z: 0 },
  pathLengthMetres: 0.18,
  projectileMassKilograms: 0.0096,
  woundEffectMultiplier: 1,
  velocityBeforeImpact: { x: 800, y: 0, z: 0 },
  penetrationBudgetBefore: 4,
  penetrationCountBefore: 0,
});
assert.equal(base.status, 'penetrated');
assert.ok(base.penetrationBudgetAfter >= 0);
assert.ok(base.speedAfterMetresPerSecond <= base.speedBeforeMetresPerSecond);
const stopped = calculateBodyImpactPhysics({ ...baseInput('torso'), penetrationBudgetBefore: 0.2 });
assert.equal(stopped.status, 'stopped');
const oblique = calculateBodyImpactPhysics({ ...baseInput('arms'), entryNormal: { x: 0, y: 1, z: 0 } });
assert.ok(oblique.penetrationResistance > base.penetrationResistance);
const thick = calculateBodyImpactPhysics({ ...baseInput('arms'), pathLengthMetres: 0.36 });
assert.ok(thick.penetrationResistance >= base.penetrationResistance);
const limit = calculateBodyImpactPhysics({ ...baseInput('arms'), penetrationCountBefore: MAX_BODY_PENETRATIONS_PER_PROJECTILE });
assert.equal(limit.status, 'penetration_limit');
const invalid = calculateBodyImpactPhysics({ ...baseInput('arms'), projectileMassKilograms: Number.NaN, pathLengthMetres: Number.NaN, exitPoint: null });
assert.equal(invalid.status, 'stopped');
assert.ok(Number.isFinite(invalid.impactEnergyJoules));

const two = alignedState('stage6-two', 10);
tickProjectileRuntime(two, { intervalStartSeconds: 0, deltaSeconds: 1 / 30 });
assert.equal(two.infantryCombatProjectiles.impacts.length, 2);
assert.deepEqual(two.infantryCombatProjectiles.impacts.map((impact) => impact.hitUnitId), ['stage6-two-a', 'stage6-two-b']);
assert.deepEqual(two.infantryCombatProjectiles.impacts.map((impact) => impact.impactSequence), [1, 2]);
assert.ok(two.infantryCombatProjectiles.impacts.every((impact) => impact.bodyPhysics?.status === 'penetrated'));
assert.equal(two.infantryCombatProjectiles.terminations.length, 0);
assert.equal(two.infantryCombatProjectiles.pool.activeCount, 1);

const low = alignedState('stage6-low', 0.2);
tickProjectileRuntime(low, { intervalStartSeconds: 0, deltaSeconds: 1 / 30 });
assert.equal(low.infantryCombatProjectiles.impacts.length, 1);
assert.equal(low.infantryCombatProjectiles.impacts[0]?.bodyPhysics?.status, 'stopped');
assert.equal(low.infantryCombatProjectiles.terminations.length, 1);
assert.equal(low.infantryCombatProjectiles.pool.activeCount, 0);

const capped = alignedState('stage6-limit', 10, MAX_BODY_PENETRATIONS_PER_PROJECTILE);
tickProjectileRuntime(capped, { intervalStartSeconds: 0, deltaSeconds: 1 / 30 });
assert.equal(capped.infantryCombatProjectiles.impacts[0]?.bodyPhysics?.status, 'penetration_limit');
assert.equal(capped.infantryCombatProjectiles.terminations[0]?.reason, 'body_penetration_limit');
assert.equal(capped.infantryCombatProjectiles.terminations.length, 1);

const snapshot = serializeProjectileRuntimeState(two.infantryCombatProjectiles);
assert.equal(snapshot.schemaVersion, 3);
assert.equal(snapshot.activeProjectiles[0]?.bodyPenetrationCount, 2);
assert.equal(snapshot.activeProjectiles[0]?.impactSequence, 2);
const diagnostics = getProjectileRuntimeDiagnostics(two.infantryCombatProjectiles);
assert.equal(diagnostics.bodyImpactCount, 2);
assert.equal(diagnostics.penetratedBodyImpactCount, 2);
assert.equal(diagnostics.fullScanFallbackCount, 0);
assert.equal(diagnostics.poolResizeCount, 0);
assert.equal(diagnostics.eventOverflowCount, 0);

console.log('Infantry combat Stage 6 penetration smoke passed: pure formula, bounded multi-impact substep, continuation, stop, penetration limit, exact sequence and diagnostics.');

function baseInput(zone: 'head' | 'torso' | 'arms' | 'legs') {
  return {
    hitUnitId: 'target',
    hitZone: zone,
    hitShapeId: `standing:${zone}:test`,
    entryPoint: { xMetres: 0, yMetres: 0, zMetres: 1 },
    exitPoint: { xMetres: zone === 'torso' ? 0.38 : 0.18, yMetres: 0, zMetres: 1 },
    entryNormal: { x: -1, y: 0, z: 0 },
    pathLengthMetres: zone === 'torso' ? 0.38 : 0.18,
    projectileMassKilograms: 0.0096,
    woundEffectMultiplier: 1,
    velocityBeforeImpact: { x: 800, y: 0, z: 0 },
    penetrationBudgetBefore: 4,
    penetrationCountBefore: 0,
  } as const;
}

function alignedState(id: string, budget: number, penetrationCount = 0): SimulationState {
  const state = createInitialState({
    width: 40,
    height: 20,
    cellSize: 20,
    metersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: [],
  }, [
    { id: `${id}-shooter`, side: 'blue', x: 1, y: 5, type: 'infantry_squad' },
    { id: `${id}-a`, side: 'red', x: 5, y: 5, type: 'infantry_squad' },
    { id: `${id}-b`, side: 'red', x: 9, y: 5, type: 'infantry_squad' },
  ]);
  state.infantryCombatProjectiles = createProjectileRuntimeState(8);
  const ammo = structuredClone(createDefaultCombatCatalogRegistry().resolveAmmo({ definitionId: 'ammo_762x54r_ball', revision: 1 }));
  ammo.bodyPenetrationBudget = budget;
  const projectile: ProjectileStateV1 = {
    schemaVersion: 2,
    projectileId: `${id}:projectile`,
    shotId: `${id}:shot`,
    shooterId: `${id}-shooter`,
    ammoSnapshot: ammo,
    position: { xMetres: 5, yMetres: 11, zMetres: 1.1 },
    velocityMetresPerSecond: { x: 800, y: 0, z: 0 },
    ageSeconds: 0,
    maximumLifetimeSeconds: 5,
    bodyPenetrationBudget: budget,
    bodyPenetrationCount: penetrationCount,
    impactSequence: 0,
    lastHitUnitId: null,
  };
  assert.equal(trySpawnProjectile(state.infantryCombatProjectiles, projectile).status, 'spawned');
  return state;
}
