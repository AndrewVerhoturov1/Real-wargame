import assert from 'node:assert/strict';
import { createDefaultCombatCatalogRegistry } from '../src/core/infantry-combat/catalogs';
import {
  PROJECTILE_STATE_SCHEMA_VERSION,
  advanceSuppressionRuntimeTo,
  equipPrimaryWeaponFromLoadout,
  tickProjectileRuntime,
  trySpawnProjectile,
  type ProjectileStateV1,
} from '../src/core/infantry-combat/runtime';
import { createInitialState } from '../src/core/simulation/SimulationState';

verifyNearMissSuppression();
verifyNearImpactSuppression();
verifyDirectHitSuppression();
verifyNoSuppressionWithoutPhysicalEvent();

console.log('Infantry combat Stage 8 physical suppression smoke passed: near miss, near impact and direct hit originate from physical projectile events only.');

function verifyNearMissSuppression(): void {
  const state = createState('near-miss', [
    unit('shooter', 'blue', 5, 10),
    unit('near', 'red', 20, 12),
    unit('far', 'red', 20, 20),
  ]);
  spawn(state, 'near-miss-shot', 'shooter', { xMetres: 5, yMetres: 10, zMetres: 1.2 }, { x: 100, y: 0, z: 0 }, 0.6);
  tickProjectileRuntime(state, { intervalStartSeconds: 0, deltaSeconds: 0.2 });
  advanceSuppressionRuntimeTo(state.units[1]!.infantryCombatRuntime.suppression, 0.2);
  advanceSuppressionRuntimeTo(state.units[2]!.infantryCombatRuntime.suppression, 0.2);
  assert.ok(state.units[1]!.infantryCombatRuntime.suppression.suppressionLevel > 0);
  assert.equal(state.units[1]!.infantryCombatRuntime.suppression.lastEventKind, 'near_miss');
  assert.equal(state.units[2]!.infantryCombatRuntime.suppression.suppressionLevel, 0);
  assert.ok(state.infantryCombatProjectiles.diagnostics.emittedNearMissCount >= 1);
}

function verifyNearImpactSuppression(): void {
  const state = createState('near-impact', [
    unit('shooter', 'blue', 5, 5),
    unit('near-impact-target', 'red', 20, 12),
  ]);
  spawn(state, 'near-impact-shot', 'shooter', { xMetres: 20, yMetres: 10, zMetres: 0.7 }, { x: 0, y: 0, z: -20 }, 0.8);
  tickProjectileRuntime(state, { intervalStartSeconds: 0, deltaSeconds: 0.2 });
  advanceSuppressionRuntimeTo(state.units[1]!.infantryCombatRuntime.suppression, 0.2);
  const suppression = state.units[1]!.infantryCombatRuntime.suppression;
  assert.ok(suppression.suppressionLevel > 0);
  assert.ok(state.infantryCombatProjectiles.diagnostics.emittedNearImpactCount >= 1);
  assert.ok(suppression.recentImpactDistanceMetres !== null);
}

function verifyDirectHitSuppression(): void {
  const state = createState('direct-hit', [
    unit('shooter', 'blue', 5, 10),
    unit('direct-target', 'red', 20, 10),
  ]);
  spawn(state, 'direct-hit-shot', 'shooter', { xMetres: 5, yMetres: 10, zMetres: 1.1 }, { x: 100, y: 0, z: 0 }, 1);
  tickProjectileRuntime(state, { intervalStartSeconds: 0, deltaSeconds: 0.2 });
  advanceSuppressionRuntimeTo(state.units[1]!.infantryCombatRuntime.suppression, 0.2);
  const suppression = state.units[1]!.infantryCombatRuntime.suppression;
  assert.ok(suppression.suppressionLevel > 0);
  assert.equal(suppression.lastEventKind, 'direct_hit');
  assert.ok(suppression.shock > 0);
  assert.ok(state.infantryCombatProjectiles.diagnostics.emittedDirectHitCount >= 1);
  assert.ok(state.units[1]!.infantryCombatRuntime.wounds.slots.length >= 1);
}

function verifyNoSuppressionWithoutPhysicalEvent(): void {
  const state = createState('no-event', [unit('idle', 'red', 10, 10)]);
  advanceSuppressionRuntimeTo(state.units[0]!.infantryCombatRuntime.suppression, 3);
  assert.equal(state.units[0]!.infantryCombatRuntime.suppression.suppressionLevel, 0);
  assert.equal(state.units[0]!.infantryCombatRuntime.suppression.shock, 0);
  assert.equal(state.units[0]!.infantryCombatRuntime.suppression.appliedEventIds.length, 0);
}

function spawn(
  state: ReturnType<typeof createState>,
  shotId: string,
  shooterId: string,
  position: ProjectileStateV1['position'],
  velocityMetresPerSecond: ProjectileStateV1['velocityMetresPerSecond'],
  continuousFireScore: number,
): void {
  const shooter = state.units.find((candidate) => candidate.id === shooterId)!;
  const equip = equipPrimaryWeaponFromLoadout(
    shooter,
    createDefaultCombatCatalogRegistry(),
    { definitionId: 'loadout_submachine_gunner', revision: 1 },
  );
  assert.equal(equip.status, 'equipped');
  const ammo = structuredClone(shooter.infantryCombatRuntime.primaryWeapon!.resolved.ammo);
  const projectile: ProjectileStateV1 = {
    schemaVersion: PROJECTILE_STATE_SCHEMA_VERSION,
    projectileId: `${shotId}:projectile`,
    shotId,
    shooterId,
    ammoSnapshot: ammo,
    position,
    velocityMetresPerSecond,
    ageSeconds: 0,
    maximumLifetimeSeconds: ammo.maximumLifetimeSeconds,
    bodyPenetrationBudget: ammo.bodyPenetrationBudget,
    bodyPenetrationCount: 0,
    impactSequence: 0,
    lastHitUnitId: null,
    suppressionContinuousFireScore: continuousFireScore,
  };
  assert.equal(trySpawnProjectile(state.infantryCombatProjectiles, projectile).status, 'spawned');
}

function createState(id: string, units: ReturnType<typeof unit>[]) {
  return createInitialState({
    width: 100,
    height: 40,
    cellSize: 20,
    metersPerCell: 1,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: [],
  }, units.map((entry) => ({ ...entry, id: `${id}:${entry.id}` })));
}

function unit(id: string, side: 'blue' | 'red', x: number, y: number) {
  return { id, side, x, y, type: 'infantry_squad' as const, facingDegrees: 0 };
}
