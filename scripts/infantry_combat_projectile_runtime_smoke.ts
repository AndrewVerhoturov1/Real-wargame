import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createBallisticTraceContext, createBallisticTraceScratch, createEmptyBallisticRayResult, traceBallisticRay, traceBallisticRayPrepared } from '../src/core/combat/BallisticTrace';
import { createCombatUnitSpatialQueryScratch, queryUnitsNearBallisticSegment, queryUnitsNearBallisticSegmentInto } from '../src/core/combat/CombatUnitSpatialIndex';
import { createDefaultCombatCatalogRegistry } from '../src/core/infantry-combat/catalogs';
import {
  PROJECTILE_RUNTIME_SCHEMA_VERSION, REFERENCE_PROJECTILE_RUNTIME_SCHEMA_VERSION, STAGE3_PROJECTILE_FIXED_STEP_SECONDS,
  createProjectileRuntimeState, getProjectileAtSlot, getProjectileRuntimeDiagnostics, normalizeProjectileRuntimeState,
  reconcileInfantryCombatRuntimeAfterLoad, releaseProjectileSlot, serializeProjectileRuntimeState, tickProjectileRuntime,
  trySpawnProjectile, type ProjectileImpactV1, type ProjectileRuntimeSnapshotV2, type ProjectileStateV1,
  type ReferenceProjectileRuntimeStateV1,
} from '../src/core/infantry-combat/runtime';
import { markMapObjectsDirty } from '../src/core/map/MapRuntimeState';
import { createMapObjectSpatialQueryScratch, getMapObjectSpatialIndex } from '../src/core/spatial/MapObjectSpatialIndex';
import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';
import { createStage3ReferenceHarnessRuntime, tickStage3ReferenceHarness } from './infantry_combat_projectile_reference_harness';

const ammo = createDefaultCombatCatalogRegistry().resolveAmmo({ definitionId: 'ammo_762x54r_ball', revision: 1 });
pool(); migration(); traceParity(); stage4Parity(); deterministic(); saveLoad(); events(); spatial(); stress(); reconciliation(); sourceContract(); benchmarkContract();
console.log('Infantry combat projectile runtime smoke passed: pooled SoA, V1 migration to canonical V3, Stage 3/4 non-body parity, deterministic batching, exactly-once events, save/load and 2000-projectile stress.');

function pool() {
  const r = createProjectileRuntimeState(2);
  assert.equal(r.pool.positionX instanceof Float64Array, true); assert.equal(r.pool.active instanceof Uint8Array, true);
  const a = trySpawnProjectile(r, projectile('pool-a')); assert.equal(a.status, 'spawned'); assert.ok(a.handle);
  assert.equal(getProjectileAtSlot(r, a.handle.slot)?.projectileId, 'pool-a:projectile');
  assert.equal(trySpawnProjectile(r, projectile('pool-a')).status, 'duplicate_projectile_id');
  const stale = a.handle; assert.equal(releaseProjectileSlot(r, stale), true);
  const b = trySpawnProjectile(r, projectile('pool-b')); assert.equal(b.status, 'spawned'); assert.ok(b.handle);
  assert.equal(b.handle.slot, stale.slot); assert.notEqual(b.handle.generation, stale.generation); assert.equal(releaseProjectileSlot(r, stale), false);
  assert.equal(trySpawnProjectile(r, projectile('pool-c')).status, 'spawned');
  const before = physicalSnapshot(r); assert.equal(trySpawnProjectile(r, projectile('pool-d')).status, 'capacity_exceeded'); assert.deepEqual(physicalSnapshot(r), before);
  assert.equal(trySpawnProjectile(r, { ...projectile('bad'), ageSeconds: Number.NaN }).status, 'invalid_candidate');
  assert.equal(r.pool.highWaterMark, 2); assert.equal(r.pool.freeSlotCount, 0);
}

function migration() {
  const legacy: ReferenceProjectileRuntimeStateV1 = {
    schemaVersion: REFERENCE_PROJECTILE_RUNTIME_SCHEMA_VERSION, fixedStepSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS, accumulatorSeconds: 0.017,
    activeProjectiles: [projectile('legacy-b'), projectile('legacy-a', { ageSeconds: 0.5 })], committedShots: [], impacts: [], terminations: [], appliedImpactIds: [],
    diagnostics: { fixedSubstepsExecuted: 7, sweptTraceCount: 9, unitCheckCount: 3, objectCandidateCount: 4, capRejectionCount: 0, lastImpactId: null, lastTerminationId: null },
  };
  const s = serializeProjectileRuntimeState(normalizeProjectileRuntimeState(legacy));
  assert.equal(s.schemaVersion, PROJECTILE_RUNTIME_SCHEMA_VERSION); assert.equal(s.accumulatorSeconds, legacy.accumulatorSeconds);
  assert.deepEqual(s.activeProjectiles.map(projectileV1View), [...legacy.activeProjectiles].sort(compareProjectiles).map(projectileV1View));
  assert.ok(s.activeProjectiles.every((p) => p.schemaVersion === 2 && p.bodyPenetrationCount === 0 && p.lastHitUnitId === null));
  assert.equal(s.diagnostics.fixedSubstepsExecuted, 7); assert.equal(s.diagnostics.unitNarrowCheckCount, 3);
}

function traceParity() {
  const s = state([unit('shooter', 'blue', 2, 2), unit('z', 'red', 8, 2), unit('a', 'red', 6, 2)], [wall('wall', 10, 2)]);
  const old = queryUnitsNearBallisticSegment(s, { x: 2, y: 2 }, { x: 12, y: 2 }, 2), out: SimulationState['units'] = [], scratch = createCombatUnitSpatialQueryScratch();
  const count = queryUnitsNearBallisticSegmentInto(s, { x: 2, y: 2 }, { x: 12, y: 2 }, 2, out, scratch);
  assert.equal(queryUnitsNearBallisticSegmentInto(s, { x: 2, y: 2 }, { x: 12, y: 2 }, 2, out, scratch), count);
  assert.deepEqual(out.map((u) => u.id), old.map((u) => u.id)); assert.deepEqual(out.map((u) => u.id), [...out.map((u) => u.id)].sort());
  const objects: SimulationState['map']['objects'] = []; getMapObjectSpatialIndex(s.map).querySegmentInto({ x: 0, y: 2 }, { x: 15, y: 2 }, 0, objects, createMapObjectSpatialQueryScratch()); assert.deepEqual(objects.map((o) => o.id), ['wall']);
  const c = createBallisticTraceContext(s.map, old), input = { shotId: 'trace', shooterId: 'shooter', origin: { xMetres: 4, yMetres: 5, zMetres: 1.2 }, direction: { x: 1, y: 0, z: 0 }, maximumDistanceMetres: 30, muzzleVelocityMetresPerSecond: 100 };
  assert.deepEqual(traceBallisticRayPrepared(c, input, createBallisticTraceScratch(), createEmptyBallisticRayResult(), old), traceBallisticRay(c, input));
}

function stage4Parity() {
  const cases = [
    ['clear', state([], []), projectile('clear', { velocityMetresPerSecond: { x: 30, y: 0, z: 3 } })],
    ['terrain', state([], []), projectile('terrain', { position: { xMetres: 4, yMetres: 4, zMetres: 0.2 }, velocityMetresPerSecond: { x: 15, y: 0, z: -10 } })],
    ['object', state([], [wall('object-wall', 4, 2)]), projectile('object', { position: { xMetres: 4, yMetres: 5, zMetres: 1.2 }, velocityMetresPerSecond: { x: 100, y: 0, z: 0 } })],
    ['lifetime', state([], []), projectile('life', { ageSeconds: 0.99, maximumLifetimeSeconds: 1 })],
    ['bounds', state([], []), projectile('bounds', { position: { xMetres: 79.5, yMetres: 5, zMetres: 2 }, velocityMetresPerSecond: { x: 100, y: 0, z: 0 } })],
  ] as const;
  for (const [name, s, p] of cases) {
    const ref = createStage3ReferenceHarnessRuntime([p]), prod = createProjectileRuntimeState(8); s.infantryCombatProjectiles = prod; assert.equal(trySpawnProjectile(prod, p).status, 'spawned');
    tickStage3ReferenceHarness(s, ref, 0, STAGE3_PROJECTILE_FIXED_STEP_SECONDS); tickProjectileRuntime(s, { intervalStartSeconds: 0, deltaSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS });
    assert.deepEqual(physics(prod), referencePhysics(ref), `${name}: Stage 3/4 non-body physical result`);
  }
}

function deterministic() {
  const sa = state([], []), sb = state([], []), a = createProjectileRuntimeState(16), b = createProjectileRuntimeState(16); sa.infantryCombatProjectiles = a; sb.infantryCombatProjectiles = b;
  const values = Array.from({ length: 8 }, (_, i) => projectile(`order-${i}`, { position: { xMetres: 4 + i, yMetres: 8 + i * 0.1, zMetres: 4 }, velocityMetresPerSecond: { x: 20 + i, y: 0, z: i * 0.1 } }));
  values.forEach((p) => assert.equal(trySpawnProjectile(a, p).status, 'spawned')); [...values].reverse().forEach((p) => assert.equal(trySpawnProjectile(b, p).status, 'spawned'));
  tickProjectileRuntime(sa, { intervalStartSeconds: 0, deltaSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS }); tickProjectileRuntime(sb, { intervalStartSeconds: 0, deltaSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS }); assert.deepEqual(physics(a), physics(b));
}

function saveLoad() {
  const s = state([], []); s.infantryCombatProjectiles = createProjectileRuntimeState(16); trySpawnProjectile(s.infantryCombatProjectiles, projectile('save', { velocityMetresPerSecond: { x: 20, y: 0, z: 1 } }));
  tickProjectileRuntime(s, { intervalStartSeconds: 0, deltaSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS * 1.5 }); const restored = normalizeProjectileRuntimeState(serializeProjectileRuntimeState(s.infantryCombatProjectiles)), rs = state([], []); rs.infantryCombatProjectiles = restored;
  tickProjectileRuntime(s, { intervalStartSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS * 1.5, deltaSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS * 1.5 }); tickProjectileRuntime(rs, { intervalStartSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS * 1.5, deltaSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS * 1.5 }); assert.deepEqual(physics(restored), physics(s.infantryCombatProjectiles));
}

function events() {
  const s = state([], [wall('events-wall', 4, 2)]), r = createProjectileRuntimeState(8); s.infantryCombatProjectiles = r;
  ['z', 'a', 'm'].forEach((id) => trySpawnProjectile(r, projectile(`event-${id}`, { position: { xMetres: 4, yMetres: 5, zMetres: 1.2 }, velocityMetresPerSecond: { x: 300, y: 0, z: 0 } })));
  const result = tickProjectileRuntime(s, { intervalStartSeconds: 0, deltaSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS });
  assert.deepEqual(result.createdImpactIds, [...result.createdImpactIds].sort()); assert.deepEqual(result.createdTerminationIds, [...result.createdTerminationIds].sort());
  assert.equal(r.impacts.length, 3); assert.equal(r.terminations.length, 3); assert.equal(r.pool.activeCount, 0); assert.equal(r.diagnostics.eventOverflowCount, 0);
  const after = physicalSnapshot(r); tickProjectileRuntime(s, { intervalStartSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS, deltaSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS }); assert.deepEqual(physicalSnapshot(r), after);
}

function spatial() {
  const extras = Array.from({ length: 198 }, (_, i) => unit(`extra-${i}`, i % 2 ? 'blue' : 'red', 20 + i % 20, 20 + Math.floor(i / 20))), s = state([unit('shooter', 'blue', 2, 2), unit('target', 'red', 5, 2), ...extras], [wall('object', 5, 2)]), out: SimulationState['units'] = [];
  queryUnitsNearBallisticSegmentInto(s, { x: 2, y: 2 }, { x: 8, y: 2 }, 2, out, createCombatUnitSpatialQueryScratch()); assert.ok(out.length < s.units.length / 4);
  const target = s.units.find((u) => u.id === 'target')!; target.position.x = 35; target.position.y = 35; queryUnitsNearBallisticSegmentInto(s, { x: 2, y: 2 }, { x: 8, y: 2 }, 2, out, createCombatUnitSpatialQueryScratch()); assert.equal(out.some((u) => u.id === target.id), false);
  const before = getMapObjectSpatialIndex(s.map); s.map.objects[0]!.x = 30; markMapObjectsDirty(s.map); assert.notEqual(getMapObjectSpatialIndex(s.map), before);
}

function stress() {
  const idle = state(Array.from({ length: 200 }, (_, i) => unit(`idle-${i}`, i < 100 ? 'blue' : 'red', i % 20, Math.floor(i / 20))), []); idle.infantryCombatProjectiles = createProjectileRuntimeState(4096);
  for (let i = 0; i < 300; i += 1) tickProjectileRuntime(idle, { intervalStartSeconds: i * STAGE3_PROJECTILE_FIXED_STEP_SECONDS, deltaSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS }); const idleD = getProjectileRuntimeDiagnostics(idle.infantryCombatProjectiles); assert.equal(idleD.unitBroadPhaseQueryCount, 0); assert.equal(idleD.objectBroadPhaseQueryCount, 0);
  for (const count of [200, 1000, 2000]) { const s = state([], []), r = createProjectileRuntimeState(4096); s.infantryCombatProjectiles = r; for (let i = 0; i < count; i += 1) assert.equal(trySpawnProjectile(r, projectile(`stress-${count}-${i}`, { position: { xMetres: 4 + i % 100 * 0.2, yMetres: 20 + Math.floor(i / 100) * 0.2, zMetres: 30 }, velocityMetresPerSecond: { x: 10 + i % 7, y: 0, z: 0 }, maximumLifetimeSeconds: 20 })).status, 'spawned'); tickProjectileRuntime(s, { intervalStartSeconds: 0, deltaSeconds: STAGE3_PROJECTILE_FIXED_STEP_SECONDS }); const d = getProjectileRuntimeDiagnostics(r); assert.equal(d.highWaterMark, count); assert.equal(r.pool.activeCount, count); assert.equal(d.poolResizeCount + d.eventOverflowCount + d.fullScanFallbackCount, 0); }
}

function reconciliation() { const s = state([], []); s.infantryCombatProjectiles = createProjectileRuntimeState(16); trySpawnProjectile(s.infantryCombatProjectiles, projectile('orphan')); reconcileInfantryCombatRuntimeAfterLoad(s); const first = serializeProjectileRuntimeState(s.infantryCombatProjectiles); reconcileInfantryCombatRuntimeAfterLoad(s); const second = serializeProjectileRuntimeState(s.infantryCombatProjectiles); assert.deepEqual(second, first); assert.equal(second.activeProjectiles.length, 0); assert.equal(second.terminations[0]?.reason, 'reconciled_orphan'); }
function sourceContract() { const source = ['ProjectileStepper.ts', 'ProjectileStepperSupport.ts'].map((f) => readFileSync(path.join(process.cwd(), 'src/core/infantry-combat/runtime', f), 'utf8')).join('\n'); for (const x of ['structuredClone(projectile)', '[...activeProjectiles]', 'survivors = []', 'new Set()', 'activeProjectiles.sort(', 'JSON.stringify(', ['Date','now'].join('.'), ['performance','now'].join('.'), ['Math','random'].join('.'), ['random','UUID'].join('')]) assert.equal(source.includes(x), false, `production projectile stepper must not contain ${x}`); for (const x of ['queryUnitsNearBallisticSegmentInto', 'traceBallisticRayPrepared', 'getMapObjectSpatialIndex']) assert.equal(source.includes(x), true); }
function benchmarkContract() { const source = readFileSync(path.join(process.cwd(), 'scripts/infantry_combat_projectile_benchmark.ts'), 'utf8'); for (const x of ['const MEMORY_COMPARISON_PROJECTILES = DIRECT_COMPARISON_PROJECTILES;', 'const DIRECT_COMPARISON_CAPACITY = 256;', 'createProjectileRuntimeState(DIRECT_COMPARISON_CAPACITY)', 'memoryUsage.heapUsed + memoryUsage.arrayBuffers', 'PROJECTILE_BENCHMARK_MEMORY_PROBE', 'execFileSync']) assert.equal(source.includes(x), true); }
function state(units: Array<Record<string, unknown>>, objects: Array<Record<string, unknown>>) { return createInitialState({ width: 40, height: 40, cellSize: 20, metersPerCell: 2, defaultTerrain: 'field', defaultHeight: 0, objects: objects as never }, units.map((u) => ({ type: 'infantry_squad', ...u })) as never); }
function unit(id: string, side: 'blue' | 'red', x: number, y: number) { return { id, side, x, y }; }
function wall(id: string, x: number, y: number) { return { id, kind: 'structure', x, y, widthCells: 0.4, heightCells: 1, losHeightMeters: 3 }; }
function projectile(shotId: string, overrides: Partial<ProjectileStateV1> = {}): ProjectileStateV1 { return { schemaVersion: 1, projectileId: `${shotId}:projectile`, shotId, shooterId: 'test-shooter', ammoSnapshot: structuredClone(ammo), position: { xMetres: 2, yMetres: 2, zMetres: 10 }, velocityMetresPerSecond: { x: 30, y: 0, z: 0 }, ageSeconds: 0, maximumLifetimeSeconds: 6, bodyPenetrationBudget: 1, impactSequence: 0, ...overrides }; }
function physicalSnapshot(r: ReturnType<typeof createProjectileRuntimeState>): Omit<ProjectileRuntimeSnapshotV2, 'diagnostics'> { const { diagnostics: _, ...s } = serializeProjectileRuntimeState(r); return s; }
function physics(r: ReturnType<typeof createProjectileRuntimeState>) { const s = serializeProjectileRuntimeState(r); return { accumulatorSeconds: s.accumulatorSeconds, activeProjectiles: s.activeProjectiles.map(projectileV1View), impacts: s.impacts.map(impactV1View), terminations: s.terminations, appliedImpactIds: s.appliedImpactIds }; }
function referencePhysics(r: ReturnType<typeof createStage3ReferenceHarnessRuntime>) { return { accumulatorSeconds: r.accumulatorSeconds, activeProjectiles: r.activeProjectiles.map(projectileV1View), impacts: r.impacts.map(impactV1View), terminations: r.terminations, appliedImpactIds: r.appliedImpactIds }; }
function projectileV1View(p: ProjectileStateV1) { return { projectileId: p.projectileId, shotId: p.shotId, shooterId: p.shooterId, ammoSnapshot: p.ammoSnapshot, position: p.position, velocityMetresPerSecond: p.velocityMetresPerSecond, ageSeconds: p.ageSeconds, maximumLifetimeSeconds: p.maximumLifetimeSeconds, bodyPenetrationBudget: p.bodyPenetrationBudget, impactSequence: p.impactSequence }; }
function impactV1View(i: ProjectileImpactV1) { return { impactId: i.impactId, projectileId: i.projectileId, shotId: i.shotId, shooterId: i.shooterId, hitType: i.hitType, impactSeconds: i.impactSeconds, projectileAgeSeconds: i.projectileAgeSeconds, point: i.point, hitObjectId: i.hitObjectId, hitUnitId: i.hitUnitId, hitZone: i.hitZone, materialId: i.materialId, normal: i.normal, velocityBeforeImpact: i.velocityBeforeImpact }; }
function compareProjectiles(a: ProjectileStateV1, b: ProjectileStateV1) { return a.projectileId < b.projectileId ? -1 : a.projectileId > b.projectileId ? 1 : 0; }
