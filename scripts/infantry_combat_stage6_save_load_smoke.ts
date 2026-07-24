import assert from 'node:assert/strict';
import { createDefaultCombatCatalogRegistry } from '../src/core/infantry-combat/catalogs';
import {
  applyWoundCandidate,
  createInfantryCombatUnitRuntime,
  createProjectileRuntimeState,
  normalizeInfantryCombatUnitRuntime,
  normalizeProjectileRuntimeState,
  reconcileInfantryCombatRuntimeAfterLoad,
  serializeInfantryCombatUnitRuntime,
  serializeProjectileRuntimeState,
  trySpawnProjectile,
  type ProjectileImpactV1,
  type ProjectileStateV1,
} from '../src/core/infantry-combat/runtime';
import { createInitialState } from '../src/core/simulation/SimulationState';

const migratedUnitSource = createInfantryCombatUnitRuntime() as unknown as Record<string, unknown>;
delete migratedUnitSource.wounds;
const migratedUnit = normalizeInfantryCombatUnitRuntime(migratedUnitSource);
assert.deepEqual(migratedUnit.wounds.slots, []);
assert.equal(migratedUnit.wounds.capabilities.canUseWeapon, true);

const ammo = createDefaultCombatCatalogRegistry().resolveAmmo({ definitionId: 'ammo_762x54r_ball', revision: 1 });
const legacyProjectile = {
  schemaVersion: 1,
  projectileId: 'legacy-projectile',
  shotId: 'legacy-shot',
  shooterId: 'legacy-shooter',
  ammoSnapshot: structuredClone(ammo),
  position: { xMetres: 2, yMetres: 2, zMetres: 2 },
  velocityMetresPerSecond: { x: 100, y: 0, z: 0 },
  ageSeconds: 0.2,
  maximumLifetimeSeconds: 5,
  bodyPenetrationBudget: 2,
  impactSequence: 1,
};
const migratedProjectileRuntime = normalizeProjectileRuntimeState({
  schemaVersion: 2,
  fixedStepSeconds: 1 / 30,
  accumulatorSeconds: 0.01,
  capacity: 4096,
  activeProjectiles: [legacyProjectile],
  committedShots: [],
  impacts: [],
  terminations: [],
  appliedImpactIds: [],
  diagnostics: {},
});
const migratedProjectile = serializeProjectileRuntimeState(migratedProjectileRuntime).activeProjectiles[0]!;
assert.equal(migratedProjectile.schemaVersion, 2);
assert.equal(migratedProjectile.bodyPenetrationCount, 0);
assert.equal(migratedProjectile.lastHitUnitId, null);
assert.equal(migratedProjectile.impactSequence, 1);

const unitRuntime = createInfantryCombatUnitRuntime();
applyWoundCandidate(unitRuntime.wounds, {
  schemaVersion: 1,
  impactId: 'round-trip-impact',
  shotId: 'round-trip-shot',
  projectileId: 'round-trip-projectile',
  sourceUnitId: 'source',
  affectedUnitId: 'target',
  zone: 'torso',
  severity: 'severe',
  impactEnergyJoules: 2200,
  traumaScore: 0.7,
  bleedingRatePerSecond: 0.0039,
  functionalPenalty: 0.6,
  appliedSeconds: 2,
});
const serializedUnit = serializeInfantryCombatUnitRuntime(unitRuntime);
assert.deepEqual(normalizeInfantryCombatUnitRuntime(JSON.parse(JSON.stringify(serializedUnit))), serializedUnit);

const projectileRuntime = createProjectileRuntimeState(8);
const active: ProjectileStateV1 = {
  schemaVersion: 2,
  projectileId: 'active-projectile',
  shotId: 'active-shot',
  shooterId: 'active-shooter',
  ammoSnapshot: structuredClone(ammo),
  position: { xMetres: 5, yMetres: 5, zMetres: 1 },
  velocityMetresPerSecond: { x: 400, y: 0, z: 0 },
  ageSeconds: 0.5,
  maximumLifetimeSeconds: 5,
  bodyPenetrationBudget: 1.25,
  bodyPenetrationCount: 1,
  impactSequence: 1,
  lastHitUnitId: 'first-target',
};
assert.equal(trySpawnProjectile(projectileRuntime, active).status, 'spawned');
const serializedProjectiles = serializeProjectileRuntimeState(projectileRuntime);
assert.deepEqual(
  serializeProjectileRuntimeState(normalizeProjectileRuntimeState(JSON.parse(JSON.stringify(serializedProjectiles)))),
  serializedProjectiles,
);

const state = createInitialState({
  width: 20,
  height: 20,
  cellSize: 20,
  metersPerCell: 2,
  defaultTerrain: 'field',
  defaultHeight: 0,
  objects: [],
}, [
  { id: 'reconcile-shooter', side: 'blue', x: 2, y: 4, type: 'infantry_squad' },
  { id: 'reconcile-target', side: 'red', x: 6, y: 4, type: 'infantry_squad' },
]);
const historical: ProjectileImpactV1 = {
  schemaVersion: 2,
  impactId: 'historical-v1-impact',
  projectileId: 'historical-projectile',
  shotId: 'historical-shot',
  shooterId: 'reconcile-shooter',
  hitType: 'unit',
  impactSeconds: 1,
  projectileAgeSeconds: 0.1,
  point: { xMetres: 12, yMetres: 8, zMetres: 1 },
  hitObjectId: null,
  hitUnitId: 'reconcile-target',
  hitZone: 'arms',
  materialId: null,
  normal: null,
  velocityBeforeImpact: { x: 700, y: 0, z: 0 },
  impactSequence: 1,
  bodyPhysics: null,
};
state.infantryCombatProjectiles.impacts.push(historical);
state.infantryCombatProjectiles.appliedImpactIds.push(historical.impactId);
reconcileInfantryCombatRuntimeAfterLoad(state);
assert.equal(state.units[1]!.infantryCombatRuntime.wounds.revision, 0, 'historical impact without body physics must not create a wound');
const missingApplication: ProjectileImpactV1 = {
  ...historical,
  impactId: 'missing-v2-application',
  shotId: 'missing-v2-shot',
  bodyPhysics: {
    schemaVersion: 1,
    hitUnitId: 'reconcile-target',
    hitZone: 'arms',
    hitShapeId: 'standing:arms:left',
    entryPoint: { xMetres: 12, yMetres: 8, zMetres: 1 },
    exitPoint: null,
    entryNormal: { x: -1, y: 0, z: 0 },
    pathLengthMetres: 0.18,
    projectileMassKilograms: 0.0096,
    woundEffectMultiplier: 1,
    speedBeforeMetresPerSecond: 700,
    speedAfterMetresPerSecond: 0,
    impactEnergyJoules: 2352,
    incidenceCosine: 1,
    penetrationBudgetBefore: 0.2,
    penetrationResistance: 0.45,
    penetrationBudgetAfter: 0,
    penetrationCountBefore: 0,
    penetrationCountAfter: 1,
    status: 'stopped',
  },
};
state.infantryCombatProjectiles.impacts.push(missingApplication);
state.infantryCombatProjectiles.appliedImpactIds.push(missingApplication.impactId);
reconcileInfantryCombatRuntimeAfterLoad(state);
const first = serializeInfantryCombatUnitRuntime(state.units[1]!.infantryCombatRuntime);
assert.equal(first.wounds.revision, 1);
reconcileInfantryCombatRuntimeAfterLoad(state);
assert.deepEqual(serializeInfantryCombatUnitRuntime(state.units[1]!.infantryCombatRuntime), first);

console.log('Infantry combat Stage 6 save/load smoke passed: Stage 5 migration, projectile V3 state, wounds round-trip, no retroactive V1 wound and idempotent missing-V2 reconciliation.');
