import assert from 'node:assert/strict';
import { requestPostureTransition } from '../src/core/actions/PostureTransition';
import { createDefaultCombatCatalogRegistry } from '../src/core/infantry-combat/catalogs';
import {
  applyProjectileImpactWound,
  applyWoundCandidate,
  calculateUnitCombatCapabilities,
  calculateWoundSeverity,
  createFullyCapableUnitCombatCapabilities,
  createUnitWoundRuntime,
  equipPrimaryWeaponFromLoadout,
  requestSingleFireTask,
  type ProjectileImpactV1,
  type WoundCandidateV1,
  type WoundSeverity,
} from '../src/core/infantry-combat/runtime';
import { createInitialState } from '../src/core/simulation/SimulationState';

assert.deepEqual(calculateUnitCombatCapabilities([]), createFullyCapableUnitCombatCapabilities());
for (const [zone, severity, check] of [
  ['head', 'severe', (value: ReturnType<typeof calculateUnitCombatCapabilities>) => value.conscious === false],
  ['head', 'critical', (value: ReturnType<typeof calculateUnitCombatCapabilities>) => value.alive === false],
  ['arms', 'critical', (value: ReturnType<typeof calculateUnitCombatCapabilities>) => value.canUseWeapon === false],
  ['legs', 'critical', (value: ReturnType<typeof calculateUnitCombatCapabilities>) => value.canStand === false],
] as const) {
  assert.equal(check(calculateUnitCombatCapabilities([slot(zone, severity)])), true);
}
const combinedA = calculateUnitCombatCapabilities([slot('torso', 'severe'), slot('legs', 'severe')]);
const combinedB = calculateUnitCombatCapabilities([slot('legs', 'severe'), slot('torso', 'severe')]);
assert.deepEqual(combinedB, combinedA);
assert.equal(combinedA.movementSpeedMultiplier, 0.3);

const severityInput = bodyPhysics('arms', 'penetrated');
const severityA = calculateWoundSeverity(severityInput, 'severity-impact', 'severity-target');
const severityB = calculateWoundSeverity(severityInput, 'severity-impact', 'severity-target');
assert.deepEqual(severityB, severityA);
assert.ok(['light', 'severe', 'critical'].includes(severityA.severity));

const runtime = createUnitWoundRuntime();
assert.equal(applyWoundCandidate(runtime, candidate('wound-1', 'arms', 'severe')).status, 'applied');
assert.equal(applyWoundCandidate(runtime, candidate('wound-1', 'arms', 'severe')).status, 'duplicate');
assert.equal(runtime.revision, 1);
assert.equal(applyWoundCandidate(runtime, candidate('wound-2', 'arms', 'critical')).status, 'applied');
assert.equal(runtime.slots[0]?.hitCount, 2);
assert.equal(runtime.slots[0]?.severity, 'critical');
for (const zone of ['head', 'torso', 'legs'] as const) applyWoundCandidate(runtime, candidate(`wound-${zone}`, zone, 'light'));
assert.deepEqual(runtime.slots.map((entry) => entry.zone), ['head', 'torso', 'arms', 'legs']);
assert.equal(runtime.slots.length, 4);

const state = createInitialState({
  width: 30,
  height: 20,
  cellSize: 20,
  metersPerCell: 2,
  defaultTerrain: 'field',
  defaultHeight: 0,
  objects: [],
}, [
  { id: 'wound-shooter', side: 'blue', x: 2, y: 5, type: 'infantry_squad' },
  { id: 'wound-target', side: 'red', x: 8, y: 5, type: 'infantry_squad' },
]);
const target = state.units[1]!;
assert.equal(equipPrimaryWeaponFromLoadout(
  target,
  createDefaultCombatCatalogRegistry(),
  { definitionId: 'loadout_rifleman', revision: 1 },
).status, 'equipped');
const requested = requestSingleFireTask(target, {
  owner: { source: 'test', id: 'wound-owner' },
  ownerToken: 'wound-token',
  target: { xMetres: 5, yMetres: 5, zMetres: 1 },
  minimumSolutionQuality: 0,
  maximumFriendlyFireRisk: 1,
  requestedSeconds: 0,
});
assert.equal(requested.status, 'started');
const impact = projectileImpact('integration-impact', target.id, 'arms', 'stopped');
const applied = applyProjectileImpactWound(state, impact);
assert.equal(applied.status, 'applied');
assert.equal(target.infantryCombatRuntime.wounds.capabilities.canUseWeapon, false);
assert.equal(target.infantryCombatRuntime.activeFireTask, null);
const afterLoss = requestSingleFireTask(target, {
  owner: { source: 'test', id: 'wound-owner-2' },
  ownerToken: 'wound-token-2',
  target: { xMetres: 5, yMetres: 5, zMetres: 1 },
  minimumSolutionQuality: 0,
  maximumFriendlyFireRisk: 1,
  requestedSeconds: 1,
});
assert.equal(afterLoss.status, 'weapon_capability_lost');
assert.equal(applyProjectileImpactWound(state, impact).status, 'duplicate');

applyWoundCandidate(target.infantryCombatRuntime.wounds, candidate('legs-critical', 'legs', 'critical'));
const posture = requestPostureTransition(target, {
  targetPosture: 'standing',
  owner: { source: 'test', id: 'posture' },
  ownerToken: 'posture-token',
  startedSeconds: 2,
  reasonCode: 'test',
  reasonRu: 'test',
});
assert.equal(posture.accepted, false);
assert.equal(posture.reasonCode, 'posture_transition_cannot_stand');

console.log('Infantry combat Stage 6 wounds smoke passed: deterministic severity, bounded aggregation, capabilities, weapon loss and standing denial.');

function candidate(impactId: string, zone: 'head' | 'torso' | 'arms' | 'legs', severity: WoundSeverity): WoundCandidateV1 {
  return {
    schemaVersion: 1,
    impactId,
    shotId: `${impactId}:shot`,
    projectileId: `${impactId}:projectile`,
    sourceUnitId: 'source',
    affectedUnitId: 'target',
    zone,
    severity,
    impactEnergyJoules: 2500,
    traumaScore: severity === 'critical' ? 1 : severity === 'severe' ? 0.6 : 0.2,
    bleedingRatePerSecond: severity === 'critical' ? 0.008 : severity === 'severe' ? 0.003 : 0,
    functionalPenalty: severity === 'critical' ? 1 : severity === 'severe' ? 0.6 : 0.2,
    appliedSeconds: 1,
  };
}
function slot(zone: 'head' | 'torso' | 'arms' | 'legs', severity: WoundSeverity) {
  return {
    schemaVersion: 1 as const,
    zone,
    severity,
    hitCount: 1,
    bleedingRatePerSecond: 0,
    maximumTraumaScore: 1,
    lastImpactEnergyJoules: 2500,
    firstImpactId: `${zone}:first`,
    lastImpactId: `${zone}:last`,
    firstAppliedSeconds: 1,
    lastAppliedSeconds: 1,
  };
}
function bodyPhysics(zone: 'head' | 'torso' | 'arms' | 'legs', status: 'penetrated' | 'stopped' | 'penetration_limit') {
  return {
    schemaVersion: 1 as const,
    hitUnitId: 'target',
    hitZone: zone,
    hitShapeId: `standing:${zone}:test`,
    entryPoint: { xMetres: 0, yMetres: 0, zMetres: 1 },
    exitPoint: status === 'penetrated' ? { xMetres: 0.2, yMetres: 0, zMetres: 1 } : null,
    entryNormal: { x: -1, y: 0, z: 0 },
    pathLengthMetres: 0.2,
    projectileMassKilograms: 0.0096,
    woundEffectMultiplier: 1,
    speedBeforeMetresPerSecond: 750,
    speedAfterMetresPerSecond: status === 'penetrated' ? 500 : 0,
    impactEnergyJoules: 2700,
    incidenceCosine: 1,
    penetrationBudgetBefore: 2,
    penetrationResistance: 0.5,
    penetrationBudgetAfter: status === 'penetrated' ? 1.5 : 0,
    penetrationCountBefore: 0,
    penetrationCountAfter: 1,
    status,
  };
}
function projectileImpact(impactId: string, targetId: string, zone: 'head' | 'torso' | 'arms' | 'legs', status: 'penetrated' | 'stopped' | 'penetration_limit'): ProjectileImpactV1 {
  return {
    schemaVersion: 2,
    impactId,
    projectileId: `${impactId}:projectile`,
    shotId: `${impactId}:shot`,
    shooterId: 'wound-shooter',
    hitType: 'unit',
    impactSeconds: 1,
    projectileAgeSeconds: 0.1,
    point: { xMetres: 10, yMetres: 10, zMetres: 1 },
    hitObjectId: null,
    hitUnitId: targetId,
    hitZone: zone,
    materialId: null,
    normal: null,
    velocityBeforeImpact: { x: 750, y: 0, z: 0 },
    impactSequence: 1,
    bodyPhysics: { ...bodyPhysics(zone, status), hitUnitId: targetId },
  };
}
