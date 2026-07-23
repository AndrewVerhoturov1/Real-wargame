import assert from 'node:assert/strict';
import { getCombatRuntime } from '../src/core/combat/CombatDamage';
import { createDefaultCombatCatalogRegistry } from '../src/core/infantry-combat/catalogs';
import {
  MAX_STAGE3_CATCH_UP_STEPS,
  STAGE3_GRAVITY_METRES_PER_SECOND_SQUARED,
  STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
  createReferenceProjectileRuntimeState,
  serializeReferenceProjectileRuntimeState,
  tickReferenceProjectiles,
  type ProjectileStateV1,
} from '../src/core/infantry-combat/runtime';
import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';

verifyGravityAndFixedStep();
verifyEquivalentDeltaChunking();
verifyCatchUpCapKeepsRemainder();
verifyFirstObjectImpactAndExactlyOnce();
verifyUnitImpactDoesNotApplyDamage();
verifyTerrainImpact();
verifyLifetimeTermination();
verifyOutOfBoundsTermination();
verifyAppliedImpactIdPreventsDuplicate();

console.log('Infantry combat projectile smoke passed: fixed 1/30 step, gravity, swept first collision, exactly-once impacts, bounded catch-up and terminal reasons.');

function verifyGravityAndFixedStep(): void {
  const state = makeState(500, []);
  state.infantryCombatProjectiles.activeProjectiles = [projectile('gravity', {
    position: { xMetres: 5, yMetres: 5, zMetres: 10 },
    velocityMetresPerSecond: { x: 30, y: 0, z: 0 },
  })];
  const result = tickReferenceProjectiles(state, {
    intervalStartSeconds: 0,
    deltaSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
  });
  assert.equal(result.executedSubsteps, 1);
  const moved = state.infantryCombatProjectiles.activeProjectiles[0]!;
  const dt = STAGE3_PROJECTILE_FIXED_STEP_SECONDS;
  assert.ok(Math.abs(moved.position.xMetres - (5 + 30 * dt)) < 1e-9);
  assert.ok(Math.abs(moved.position.zMetres - (10 - 0.5 * STAGE3_GRAVITY_METRES_PER_SECOND_SQUARED * dt * dt)) < 1e-9);
  assert.ok(Math.abs(moved.velocityMetresPerSecond.z + STAGE3_GRAVITY_METRES_PER_SECOND_SQUARED * dt) < 1e-9);
  assert.ok(Math.abs(moved.ageSeconds - dt) < 1e-9);
}

function verifyEquivalentDeltaChunking(): void {
  const coarse = makeState(500, []);
  const fine = makeState(500, []);
  coarse.infantryCombatProjectiles.activeProjectiles = [projectile('chunking')];
  fine.infantryCombatProjectiles.activeProjectiles = [projectile('chunking')];
  tickReferenceProjectiles(coarse, { intervalStartSeconds: 0, deltaSeconds: 0.1 });
  tickReferenceProjectiles(fine, { intervalStartSeconds: 0, deltaSeconds: 0.03 });
  tickReferenceProjectiles(fine, { intervalStartSeconds: 0.03, deltaSeconds: 0.07 });
  assert.deepEqual(
    serializeReferenceProjectileRuntimeState(fine.infantryCombatProjectiles),
    serializeReferenceProjectileRuntimeState(coarse.infantryCombatProjectiles),
  );
}

function verifyCatchUpCapKeepsRemainder(): void {
  const state = makeState(500, []);
  state.infantryCombatProjectiles.activeProjectiles = [projectile('catch-up')];
  const result = tickReferenceProjectiles(state, { intervalStartSeconds: 0, deltaSeconds: 1 });
  assert.equal(result.executedSubsteps, MAX_STAGE3_CATCH_UP_STEPS);
  assert.ok(Math.abs(state.infantryCombatProjectiles.accumulatorSeconds - (1 - MAX_STAGE3_CATCH_UP_STEPS * STAGE3_PROJECTILE_FIXED_STEP_SECONDS)) < 1e-9);
}

function verifyFirstObjectImpactAndExactlyOnce(): void {
  const state = makeState(30, [], [{
    id: 'first-wall',
    kind: 'structure',
    x: 4,
    y: 2,
    widthCells: 0.4,
    heightCells: 1,
    losHeightMeters: 3,
  }, {
    id: 'second-wall',
    kind: 'structure',
    x: 6,
    y: 2,
    widthCells: 0.4,
    heightCells: 1,
    losHeightMeters: 3,
  }]);
  state.infantryCombatProjectiles.activeProjectiles = [projectile('object-impact', {
    position: { xMetres: 5.8, yMetres: 5, zMetres: 1.35 },
    velocityMetresPerSecond: { x: 865, y: 0, z: 0 },
  })];
  tickReferenceProjectiles(state, { intervalStartSeconds: 0, deltaSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS });
  assert.equal(state.infantryCombatProjectiles.activeProjectiles.length, 0);
  assert.equal(state.infantryCombatProjectiles.impacts.length, 1);
  assert.equal(state.infantryCombatProjectiles.impacts[0]?.impactId, 'object-impact:impact:1');
  assert.equal(state.infantryCombatProjectiles.impacts[0]?.hitObjectId, 'first-wall');
  assert.equal(state.infantryCombatProjectiles.impacts[0]?.hitType, 'object');
  assert.ok((state.infantryCombatProjectiles.impacts[0]?.projectileAgeSeconds ?? 0) > 0);
  assert.equal(state.infantryCombatProjectiles.impacts[0]?.impactSeconds, state.infantryCombatProjectiles.terminations[0]?.simulationSeconds);
  assert.equal(state.infantryCombatProjectiles.terminations[0]?.reason, 'impact');
  assert.deepEqual(state.infantryCombatProjectiles.appliedImpactIds, ['object-impact:impact:1']);
  const after = serializeReferenceProjectileRuntimeState(state.infantryCombatProjectiles);
  tickReferenceProjectiles(state, { intervalStartSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS, deltaSeconds: 0.2 });
  assert.deepEqual(serializeReferenceProjectileRuntimeState(state.infantryCombatProjectiles), after);
}

function verifyUnitImpactDoesNotApplyDamage(): void {
  const state = makeState(30, [
    { id: 'shooter-unit', side: 'blue', x: 2, y: 2 },
    { id: 'target-unit', side: 'red', x: 5, y: 2 },
  ]);
  const before = structuredClone(getCombatRuntime(state.units[1]!));
  state.infantryCombatProjectiles.activeProjectiles = [projectile('unit-impact', {
    shooterId: 'shooter-unit',
    position: { xMetres: 5.8, yMetres: 5, zMetres: 1.2 },
    velocityMetresPerSecond: { x: 300, y: 0, z: 0 },
  })];
  tickReferenceProjectiles(state, { intervalStartSeconds: 0, deltaSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS });
  assert.equal(state.infantryCombatProjectiles.impacts[0]?.hitType, 'unit');
  assert.equal(state.infantryCombatProjectiles.impacts[0]?.hitUnitId, 'target-unit');
  assert.deepEqual(getCombatRuntime(state.units[1]!), before);
}

function verifyTerrainImpact(): void {
  const state = makeState(30, []);
  state.infantryCombatProjectiles.activeProjectiles = [projectile('terrain-impact', {
    position: { xMetres: 5, yMetres: 5, zMetres: 0.15 },
    velocityMetresPerSecond: { x: 2, y: 0, z: -10 },
  })];
  tickReferenceProjectiles(state, { intervalStartSeconds: 0, deltaSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS });
  assert.equal(state.infantryCombatProjectiles.impacts[0]?.hitType, 'terrain');
  assert.equal(state.infantryCombatProjectiles.terminations[0]?.reason, 'impact');
}

function verifyLifetimeTermination(): void {
  const state = makeState(500, []);
  state.infantryCombatProjectiles.activeProjectiles = [projectile('lifetime', {
    position: { xMetres: 5, yMetres: 5, zMetres: 20 },
    velocityMetresPerSecond: { x: 1, y: 0, z: 0 },
    maximumLifetimeSeconds: 0.05,
  })];
  tickReferenceProjectiles(state, { intervalStartSeconds: 0, deltaSeconds: 0.1 });
  assert.equal(state.infantryCombatProjectiles.activeProjectiles.length, 0);
  assert.equal(state.infantryCombatProjectiles.impacts.length, 0);
  assert.equal(state.infantryCombatProjectiles.terminations[0]?.reason, 'lifetime');
  assert.ok(Math.abs(state.infantryCombatProjectiles.terminations[0]!.simulationSeconds - 0.05) < 1e-9);
}

function verifyOutOfBoundsTermination(): void {
  const state = makeState(10, []);
  state.infantryCombatProjectiles.activeProjectiles = [projectile('out-of-bounds', {
    position: { xMetres: 19, yMetres: 5, zMetres: 10 },
    velocityMetresPerSecond: { x: 100, y: 0, z: 0 },
  })];
  tickReferenceProjectiles(state, { intervalStartSeconds: 0, deltaSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS });
  assert.equal(state.infantryCombatProjectiles.activeProjectiles.length, 0);
  assert.equal(state.infantryCombatProjectiles.impacts.length, 0);
  assert.equal(state.infantryCombatProjectiles.terminations[0]?.reason, 'out_of_bounds');
  assert.ok(Math.abs(state.infantryCombatProjectiles.terminations[0]!.point.xMetres - 20) < 1e-9);
}

function verifyAppliedImpactIdPreventsDuplicate(): void {
  const state = makeState(30, [], [{
    id: 'duplicate-wall',
    kind: 'structure',
    x: 4,
    y: 2,
    widthCells: 0.4,
    heightCells: 1,
    losHeightMeters: 3,
  }]);
  state.infantryCombatProjectiles.activeProjectiles = [projectile('duplicate', {
    position: { xMetres: 5.8, yMetres: 5, zMetres: 1.35 },
    velocityMetresPerSecond: { x: 865, y: 0, z: 0 },
  })];
  state.infantryCombatProjectiles.appliedImpactIds = ['duplicate:impact:1'];
  tickReferenceProjectiles(state, { intervalStartSeconds: 0, deltaSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS });
  assert.equal(state.infantryCombatProjectiles.impacts.length, 0);
  assert.deepEqual(state.infantryCombatProjectiles.appliedImpactIds, ['duplicate:impact:1']);
  assert.equal(state.infantryCombatProjectiles.terminations.length, 1);
}

function makeState(
  width: number,
  units: Array<{ id: string; side: 'blue' | 'red'; x: number; y: number }>,
  objects: Array<Record<string, unknown>> = [],
): SimulationState {
  const state = createInitialState({
    width,
    height: 10,
    cellSize: 20,
    metersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: objects as never,
  }, units.map((unit) => ({ ...unit, type: 'infantry_squad' })));
  state.infantryCombatProjectiles = createReferenceProjectileRuntimeState();
  return state;
}

function projectile(
  shotId: string,
  overrides: Partial<ProjectileStateV1> = {},
): ProjectileStateV1 {
  return {
    schemaVersion: 1,
    projectileId: `${shotId}:projectile`,
    shotId,
    shooterId: 'test-shooter',
    ammoSnapshot: createDefaultCombatCatalogRegistry().resolveAmmo({ definitionId: 'ammo_762x54r_ball', revision: 1 }),
    position: { xMetres: 5.8, yMetres: 5, zMetres: 10 },
    velocityMetresPerSecond: { x: 30, y: 0, z: 0 },
    ageSeconds: 0,
    maximumLifetimeSeconds: 6,
    bodyPenetrationBudget: 1.15,
    impactSequence: 0,
    ...overrides,
  };
}
