import assert from 'node:assert/strict';
import {
  applyWoundCandidate,
  initializeUnitMedicalInventory,
  requestApplyFirstAidAction,
  tickFirstAidActionsAtBoundary,
  type WoundCandidateV1,
  type WoundSeverity,
} from '../src/core/infantry-combat/runtime';
import { createInitialState } from '../src/core/simulation/SimulationState';

const state = createInitialState({
  width: 20,
  height: 20,
  cellSize: 20,
  metersPerCell: 2,
  defaultTerrain: 'field',
  defaultHeight: 0,
  objects: [],
}, [
  { id: 'medic', side: 'blue', x: 2, y: 2, type: 'infantry_squad' },
  { id: 'patient', side: 'blue', x: 2.5, y: 2, type: 'infantry_squad' },
  { id: 'enemy', side: 'red', x: 2.5, y: 2.5, type: 'infantry_squad' },
]);
const medic = state.units[0]!;
const patient = state.units[1]!;
const enemy = state.units[2]!;
const loadoutRef = { definitionId: 'loadout_rifleman', revision: 1 };

initializeUnitMedicalInventory(medic, loadoutRef, 2);
assert.equal(medic.infantryCombatRuntime.medical.firstAidCharges, 2);
medic.infantryCombatRuntime.medical.firstAidCharges = 1;
initializeUnitMedicalInventory(medic, loadoutRef, 2);
assert.equal(medic.infantryCombatRuntime.medical.firstAidCharges, 1, 'same exact loadout must not refill charges');
initializeUnitMedicalInventory(medic, { definitionId: 'loadout_rifleman', revision: 2 }, 3);
assert.equal(medic.infantryCombatRuntime.medical.firstAidCharges, 3, 'explicit different refit resets charges');

applyWoundCandidate(patient.infantryCombatRuntime.wounds, candidate('patient:severe', 'severe'));
applyWoundCandidate(enemy.infantryCombatRuntime.wounds, candidate('enemy:severe', 'severe'));
const enemyRequest = requestApplyFirstAidAction(state, medic, {
  owner: { source: 'test', id: 'enemy-attempt' },
  ownerToken: 'enemy-attempt',
  targetUnitId: enemy.id,
  zone: null,
  requestedSeconds: 0,
});
assert.equal(enemyRequest.accepted, false);
assert.equal(enemyRequest.reasonCode, 'infantry_first_aid_enemy_target');

const request = requestApplyFirstAidAction(state, medic, {
  owner: { source: 'test', id: 'aid' },
  ownerToken: 'aid-token',
  targetUnitId: patient.id,
  zone: null,
  requestedSeconds: 0,
});
assert.equal(request.accepted, true);
assert.equal(request.status, 'started');
assert.equal(request.action?.resolvedZone, 'torso');
const repeated = requestApplyFirstAidAction(state, medic, {
  owner: { source: 'test', id: 'aid' },
  ownerToken: 'aid-token',
  targetUnitId: patient.id,
  zone: null,
  requestedSeconds: 0,
});
assert.equal(repeated.status, 'already_running');

for (let tick = 1; tick <= 24; tick += 1) tickFirstAidActionsAtBoundary(state, tick * 0.25);
assert.equal(medic.infantryCombatRuntime.medical.activeFirstAidAction, null);
assert.equal(medic.infantryCombatRuntime.medical.firstAidCharges, 2);
assert.equal(medic.infantryCombatRuntime.medical.appliedFirstAidActionIds.length, 1);
assert.equal(patient.infantryCombatRuntime.wounds.slots[0]?.severity, 'severe');
assert.equal(patient.infantryCombatRuntime.wounds.slots[0]?.bleedingState, 'stopped');
assert.equal(patient.infantryCombatRuntime.wounds.slots[0]?.bleedingRatePerSecond, 0);
assert.equal(patient.infantryCombatRuntime.physiology.blood.bloodLoss, 0);

console.log('Infantry combat Stage 7 first aid smoke passed: inventory refit semantics, ownership, enemy denial, 24 work ticks and structural-safe treatment.');

function candidate(impactId: string, severity: WoundSeverity): WoundCandidateV1 {
  return {
    schemaVersion: 1,
    impactId,
    shotId: `${impactId}:shot`,
    projectileId: `${impactId}:projectile`,
    sourceUnitId: 'source',
    affectedUnitId: 'target',
    zone: 'torso',
    severity,
    impactEnergyJoules: 2500,
    traumaScore: severity === 'critical' ? 1 : severity === 'severe' ? 0.6 : 0.2,
    bleedingRatePerSecond: severity === 'critical' ? 0.0104 : severity === 'severe' ? 0.0039 : 0,
    functionalPenalty: severity === 'critical' ? 1 : severity === 'severe' ? 0.6 : 0.2,
    appliedSeconds: 0,
  };
}
