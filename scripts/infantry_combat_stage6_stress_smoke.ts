import assert from 'node:assert/strict';
import { createDefaultCombatCatalogRegistry } from '../src/core/infantry-combat/catalogs';
import {
  MAX_BODY_PENETRATIONS_PER_PROJECTILE,
  MAX_STAGE6_IMPACT_BUFFER_ENTRIES,
  createProjectileRuntimeState,
  getProjectileRuntimeDiagnostics,
  serializeInfantryCombatUnitRuntime,
  serializeProjectileRuntimeState,
  tickProjectileRuntime,
  trySpawnProjectile,
  type ProjectileStateV1,
} from '../src/core/infantry-combat/runtime';
import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';

const LANE_COUNT = 100;
const PROJECTILES_PER_LANE = 12;
const ACTIVE_PROJECTILES = LANE_COUNT * PROJECTILES_PER_LANE;
const FIRST_UNIT_X = 5;
const SECOND_UNIT_X = 9;
const PROJECTILE_START_X_METRES = 5;
const PROJECTILE_SPEED_METRES_PER_SECOND = 800;

const ordered = execute(false);
const reversed = execute(true);
assert.deepEqual(reversed, ordered, 'unit storage order must not change the Stage 6 stress result');
assert.equal(ordered.spawnedProjectiles, ACTIVE_PROJECTILES);
assert.equal(ordered.impacts, 2_000);
assert.equal(ordered.terminations, 400);
assert.equal(ordered.activeProjectiles, 800);
assert.equal(ordered.totalWoundHits, ordered.impacts);
assert.equal(ordered.totalWoundSlots, 500);
assert.equal(ordered.diagnostics.fullScanFallbackCount, 0);
assert.equal(ordered.diagnostics.poolResizeCount, 0);
assert.equal(ordered.diagnostics.eventOverflowCount, 0);
assert.equal(ordered.diagnostics.woundDuplicateCount, 0);
assert.equal(ordered.diagnostics.impactBufferCapacity, MAX_STAGE6_IMPACT_BUFFER_ENTRIES);
assert.ok(ordered.diagnostics.maximumImpactsInSingleSubstep <= MAX_BODY_PENETRATIONS_PER_PROJECTILE);

console.log(`Infantry combat Stage 6 body stress passed: 200 units, ${ACTIVE_PROJECTILES} active projectiles, ${ordered.impacts} ordered body impacts, no full scan/resize/overflow/duplicate wounds.`);

function execute(reverseUnits: boolean) {
  const units: Array<Record<string, unknown>> = [];
  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    const y = lane + 1;
    units.push({ id: `stress-${lane}:a`, side: 'red', x: FIRST_UNIT_X, y, type: 'infantry_squad', facingDegrees: 0 });
    units.push({ id: `stress-${lane}:b`, side: 'red', x: SECOND_UNIT_X, y, type: 'infantry_squad', facingDegrees: 0 });
  }
  if (reverseUnits) units.reverse();
  const state = createInitialState({
    width: 40,
    height: LANE_COUNT + 4,
    cellSize: 20,
    metersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: [],
  }, units as never);
  state.infantryCombatProjectiles = createProjectileRuntimeState();

  const baseAmmo = createDefaultCombatCatalogRegistry().resolveAmmo({ definitionId: 'ammo_762x54r_ball', revision: 1 });
  let spawnedProjectiles = 0;
  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    const centerYMetres = (lane + 1.5) * state.map.metersPerCell;
    for (let index = 0; index < PROJECTILES_PER_LANE; index += 1) {
      const kind = index % 3;
      const ammo = structuredClone(baseAmmo);
      ammo.bodyPenetrationBudget = kind === 0 ? 0.2 : 10;
      const yOffset = kind === 1 ? 0.31 : kind === 2 ? 0.13 : 0;
      const zMetres = kind === 2 ? 0.45 : 1.1;
      const shotId = `stress:${lane}:${index}`;
      const projectile: ProjectileStateV1 = {
        schemaVersion: 2,
        projectileId: `${shotId}:projectile`,
        shotId,
        shooterId: `stress-shooter:${lane}`,
        ammoSnapshot: ammo,
        position: { xMetres: PROJECTILE_START_X_METRES, yMetres: centerYMetres + yOffset, zMetres },
        velocityMetresPerSecond: { x: PROJECTILE_SPEED_METRES_PER_SECOND, y: 0, z: 0 },
        ageSeconds: 0,
        maximumLifetimeSeconds: 5,
        bodyPenetrationBudget: ammo.bodyPenetrationBudget,
        bodyPenetrationCount: 0,
        impactSequence: 0,
        lastHitUnitId: null,
      };
      assert.equal(trySpawnProjectile(state.infantryCombatProjectiles, projectile).status, 'spawned');
      spawnedProjectiles += 1;
    }
  }

  tickProjectileRuntime(state, { intervalStartSeconds: 0, deltaSeconds: 1 / 30 });
  const snapshot = serializeProjectileRuntimeState(state.infantryCombatProjectiles);
  const unitSnapshots = state.units
    .map((unit) => ({ unitId: unit.id, runtime: serializeInfantryCombatUnitRuntime(unit.infantryCombatRuntime) }))
    .sort((left, right) => left.unitId.localeCompare(right.unitId));
  const totalWoundHits = unitSnapshots.reduce(
    (sum, entry) => sum + entry.runtime.wounds.slots.reduce((slotSum, slot) => slotSum + slot.hitCount, 0),
    0,
  );
  const totalWoundSlots = unitSnapshots.reduce((sum, entry) => sum + entry.runtime.wounds.slots.length, 0);
  return {
    spawnedProjectiles,
    impacts: snapshot.impacts.length,
    terminations: snapshot.terminations.length,
    activeProjectiles: snapshot.activeProjectiles.length,
    totalWoundHits,
    totalWoundSlots,
    projectiles: snapshot.activeProjectiles,
    impactsSnapshot: snapshot.impacts,
    terminationSnapshot: snapshot.terminations,
    unitSnapshots,
    diagnostics: getProjectileRuntimeDiagnostics(state.infantryCombatProjectiles),
  };
}
