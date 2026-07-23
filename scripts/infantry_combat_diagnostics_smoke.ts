import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createDefaultCombatCatalogRegistry } from '../src/core/infantry-combat/catalogs';
import {
  MAX_STAGE3_ACTIVE_PROJECTILES,
  MAX_STAGE3_APPLIED_IMPACT_IDS,
  MAX_STAGE3_IMPACT_ENTRIES,
  MAX_STAGE3_TERMINATION_ENTRIES,
  STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
  createReferenceProjectileRuntimeState,
  getInfantryCombatDiagnostics,
  normalizeReferenceProjectileRuntimeState,
  serializeReferenceProjectileRuntimeState,
  tickReferenceProjectiles,
  type ProjectileStateV1,
} from '../src/core/infantry-combat/runtime';
import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';

verifyDiagnosticsAreCompactAndReadOnly();
verifyUnitBroadPhaseIsBoundedToSegment();
verifyObjectOrderDoesNotChangeFirstHit();
verifyUnitOrderDoesNotChangeFirstHit();
verifyBoundedSnapshotBuffers();
verifyRuntimeSourceContract();

console.log('Infantry combat diagnostics smoke passed: compact read-only facts, stable ordering, existing spatial broad phase, bounded buffers and forbidden-source contract.');

function verifyDiagnosticsAreCompactAndReadOnly(): void {
  const state = makeState([], []);
  state.infantryCombatProjectiles.activeProjectiles = [projectile('diagnostics')];
  const before = serializeReferenceProjectileRuntimeState(state.infantryCombatProjectiles);
  const diagnostics = getInfantryCombatDiagnostics(state);
  assert.equal(diagnostics.schemaVersion, 1);
  assert.equal(diagnostics.limits.maximumActiveProjectiles, MAX_STAGE3_ACTIVE_PROJECTILES);
  assert.equal(diagnostics.projectiles.activeCount, 1);
  assert.deepEqual(diagnostics.projectiles.activeProjectileIds, ['diagnostics:projectile']);
  assert.deepEqual(serializeReferenceProjectileRuntimeState(state.infantryCombatProjectiles), before);
}

function verifyUnitBroadPhaseIsBoundedToSegment(): void {
  const offLine = Array.from({ length: 96 }, (_, index) => ({
    id: `off-line-${index + 1}`,
    side: 'red' as const,
    x: 5 + index % 20,
    y: 20 + Math.floor(index / 20),
  }));
  const state = makeState([
    { id: 'broadphase-shooter', side: 'blue', x: 2, y: 2 },
    { id: 'broadphase-target', side: 'red', x: 5, y: 2 },
    ...offLine,
  ], []);
  state.infantryCombatProjectiles.activeProjectiles = [projectile('broadphase', {
    shooterId: 'broadphase-shooter',
    position: { xMetres: 5.8, yMetres: 5, zMetres: 1.2 },
    velocityMetresPerSecond: { x: 300, y: 0, z: 0 },
  })];
  tickReferenceProjectiles(state, { intervalStartSeconds: 0, deltaSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS });
  assert.equal(state.infantryCombatProjectiles.impacts[0]?.hitUnitId, 'broadphase-target');
  assert.ok(state.infantryCombatProjectiles.diagnostics.unitCheckCount < 10, 'off-line units must stay outside narrow phase');
}

function verifyObjectOrderDoesNotChangeFirstHit(): void {
  const objects = [
    { id: 'object-b', kind: 'structure', x: 4, y: 2, widthCells: 0.4, heightCells: 1, losHeightMeters: 3 },
    { id: 'object-a', kind: 'structure', x: 4, y: 2, widthCells: 0.4, heightCells: 1, losHeightMeters: 3 },
  ];
  const first = makeState([], objects);
  const second = makeState([], [...objects].reverse());
  first.infantryCombatProjectiles.activeProjectiles = [fastProjectile('object-order')];
  second.infantryCombatProjectiles.activeProjectiles = [fastProjectile('object-order')];
  tickReferenceProjectiles(first, { intervalStartSeconds: 0, deltaSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS });
  tickReferenceProjectiles(second, { intervalStartSeconds: 0, deltaSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS });
  assert.equal(first.infantryCombatProjectiles.impacts[0]?.hitObjectId, 'object-a');
  assert.deepEqual(
    serializeReferenceProjectileRuntimeState(second.infantryCombatProjectiles),
    serializeReferenceProjectileRuntimeState(first.infantryCombatProjectiles),
  );
}

function verifyUnitOrderDoesNotChangeFirstHit(): void {
  const units = [
    { id: 'unit-order-shooter', side: 'blue' as const, x: 2, y: 2 },
    { id: 'unit-target-b', side: 'red' as const, x: 5, y: 2 },
    { id: 'unit-target-a', side: 'red' as const, x: 5, y: 2 },
  ];
  const first = makeState(units, []);
  const second = makeState(units, []);
  second.units.reverse();
  first.infantryCombatProjectiles.activeProjectiles = [projectile('unit-order', {
    shooterId: 'unit-order-shooter',
    position: { xMetres: 5.8, yMetres: 5, zMetres: 1.2 },
    velocityMetresPerSecond: { x: 300, y: 0, z: 0 },
  })];
  second.infantryCombatProjectiles.activeProjectiles = structuredClone(first.infantryCombatProjectiles.activeProjectiles);
  tickReferenceProjectiles(first, { intervalStartSeconds: 0, deltaSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS });
  tickReferenceProjectiles(second, { intervalStartSeconds: 0, deltaSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS });
  assert.equal(first.infantryCombatProjectiles.impacts[0]?.hitUnitId, 'unit-target-a');
  assert.deepEqual(
    serializeReferenceProjectileRuntimeState(second.infantryCombatProjectiles),
    serializeReferenceProjectileRuntimeState(first.infantryCombatProjectiles),
  );
}

function verifyBoundedSnapshotBuffers(): void {
  const state = makeState([], [{ id: 'cap-wall', kind: 'structure', x: 4, y: 2, widthCells: 0.4, heightCells: 1, losHeightMeters: 3 }]);
  state.infantryCombatProjectiles.activeProjectiles = [fastProjectile('cap-source')];
  tickReferenceProjectiles(state, { intervalStartSeconds: 0, deltaSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS });
  const sourceImpact = state.infantryCombatProjectiles.impacts[0]!;
  const sourceTermination = state.infantryCombatProjectiles.terminations[0]!;
  const raw = createReferenceProjectileRuntimeState();
  raw.activeProjectiles = Array.from({ length: MAX_STAGE3_ACTIVE_PROJECTILES + 8 }, (_, index) => projectile(`cap-active-${index}`));
  raw.impacts = Array.from({ length: MAX_STAGE3_IMPACT_ENTRIES + 8 }, (_, index) => ({
    ...structuredClone(sourceImpact),
    impactId: `cap-impact-${index}`,
    shotId: `cap-shot-${index}`,
    projectileId: `cap-projectile-${index}`,
    simulationSeconds: index,
  }));
  raw.terminations = Array.from({ length: MAX_STAGE3_TERMINATION_ENTRIES + 8 }, (_, index) => ({
    ...structuredClone(sourceTermination),
    terminationId: `cap-termination-${index}`,
    shotId: `cap-shot-${index}`,
    projectileId: `cap-projectile-${index}`,
    simulationSeconds: index,
  }));
  raw.appliedImpactIds = Array.from({ length: MAX_STAGE3_APPLIED_IMPACT_IDS + 8 }, (_, index) => `cap-impact-${index}`);
  const normalized = normalizeReferenceProjectileRuntimeState(raw);
  assert.equal(normalized.activeProjectiles.length, MAX_STAGE3_ACTIVE_PROJECTILES);
  assert.equal(normalized.impacts.length, MAX_STAGE3_IMPACT_ENTRIES);
  assert.equal(normalized.terminations.length, MAX_STAGE3_TERMINATION_ENTRIES);
  assert.equal(normalized.appliedImpactIds.length, MAX_STAGE3_APPLIED_IMPACT_IDS);
}

function verifyRuntimeSourceContract(): void {
  const runtimeDir = path.join(process.cwd(), 'src/core/infantry-combat/runtime');
  const source = readdirSync(runtimeDir)
    .filter((name) => name.endsWith('.ts'))
    .sort()
    .map((name) => readFileSync(path.join(runtimeDir, name), 'utf8'))
    .join('\n');
  const forbiddenFragments = [
    ['Math', '.random'].join(''),
    ['Date', '.now'].join(''),
    ['set', 'Interval('].join(''),
    ['request', 'AnimationFrame('].join(''),
    ['document', '.'].join(''),
    ['window', '.'].join(''),
    ['pixi', '.js'].join(''),
  ];
  for (const forbidden of forbiddenFragments) {
    assert.equal(source.includes(forbidden), false, `runtime must not contain ${forbidden}`);
  }
  const stepper = readFileSync(path.join(runtimeDir, 'ReferenceProjectileStepper.ts'), 'utf8');
  assert.equal(stepper.includes('queryUnitsNearBallisticSegment'), true, 'projectile narrow phase must reuse the existing unit spatial index');
}

function makeState(
  units: Array<{ id: string; side: 'blue' | 'red'; x: number; y: number }>,
  objects: Array<Record<string, unknown>>,
): SimulationState {
  const state = createInitialState({
    width: 40,
    height: 40,
    cellSize: 20,
    metersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: objects as never,
  }, units.map((unit) => ({ ...unit, type: 'infantry_squad' })));
  state.infantryCombatProjectiles = createReferenceProjectileRuntimeState();
  return state;
}

function fastProjectile(shotId: string): ProjectileStateV1 {
  return projectile(shotId, {
    position: { xMetres: 5.8, yMetres: 5, zMetres: 1.35 },
    velocityMetresPerSecond: { x: 865, y: 0, z: 0 },
  });
}

function projectile(shotId: string, overrides: Partial<ProjectileStateV1> = {}): ProjectileStateV1 {
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
