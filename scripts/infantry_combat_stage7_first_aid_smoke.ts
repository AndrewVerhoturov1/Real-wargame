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

const state = createState('basic', true);
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

applyWoundCandidate(patient.infantryCombatRuntime.wounds, candidate('patient:severe', patient.id, 'torso', 'severe'));
applyWoundCandidate(enemy.infantryCombatRuntime.wounds, candidate('enemy:severe', enemy.id, 'torso', 'severe'));
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
const foreign = requestApplyFirstAidAction(state, medic, {
  owner: { source: 'test', id: 'foreign' },
  ownerToken: 'foreign-token',
  targetUnitId: patient.id,
  zone: null,
  requestedSeconds: 0,
});
assert.equal(foreign.status, 'blocked');

for (let tick = 1; tick <= 24; tick += 1) tickFirstAidActionsAtBoundary(state, tick * 0.25);
assert.equal(medic.infantryCombatRuntime.medical.activeFirstAidAction, null);
assert.equal(medic.infantryCombatRuntime.medical.firstAidCharges, 2);
assert.equal(medic.infantryCombatRuntime.medical.appliedFirstAidActionIds.length, 1);
assert.equal(patient.infantryCombatRuntime.wounds.slots[0]?.severity, 'severe');
assert.equal(patient.infantryCombatRuntime.wounds.slots[0]?.bleedingState, 'stopped');
assert.equal(patient.infantryCombatRuntime.wounds.slots[0]?.bleedingRatePerSecond, 0);
assert.equal(patient.infantryCombatRuntime.physiology.blood.bloodLoss, 0);
for (let tick = 25; tick <= 30; tick += 1) tickFirstAidActionsAtBoundary(state, tick * 0.25);
assert.equal(medic.infantryCombatRuntime.medical.firstAidCharges, 2, 'completed action must not spend twice');

const criticalState = createState('critical', false);
const criticalMedic = criticalState.units[0]!;
const criticalPatient = criticalState.units[1]!;
initializeUnitMedicalInventory(criticalMedic, loadoutRef, 2);
applyWoundCandidate(criticalPatient.infantryCombatRuntime.wounds, candidate(
  'critical:head-severe', criticalPatient.id, 'head', 'severe',
));
applyWoundCandidate(criticalPatient.infantryCombatRuntime.wounds, candidate(
  'critical:torso-critical', criticalPatient.id, 'torso', 'critical',
));
criticalPatient.infantryCombatRuntime.physiology.blood.bloodLoss = 0.3;
const criticalRequest = requestApplyFirstAidAction(criticalState, criticalMedic, {
  owner: { source: 'test', id: 'critical-first' },
  ownerToken: 'critical-first',
  targetUnitId: criticalPatient.id,
  zone: null,
  requestedSeconds: 0,
});
assert.equal(criticalRequest.action?.resolvedZone, 'torso', 'critical bleeding must win automatic zone selection');
for (let tick = 1; tick <= 24; tick += 1) tickFirstAidActionsAtBoundary(criticalState, tick * 0.25);
const criticalSlot = criticalPatient.infantryCombatRuntime.wounds.slots.find((slot) => slot.zone === 'torso')!;
assert.equal(criticalSlot.severity, 'critical');
assert.equal(criticalSlot.bleedingState, 'severe');
assert.equal(criticalMedic.infantryCombatRuntime.medical.firstAidCharges, 1);
assert.equal(criticalPatient.infantryCombatRuntime.physiology.blood.bloodLoss, 0.3);
const secondStage = requestApplyFirstAidAction(criticalState, criticalMedic, {
  owner: { source: 'test', id: 'critical-second' },
  ownerToken: 'critical-second',
  targetUnitId: criticalPatient.id,
  zone: 'torso',
  requestedSeconds: 6,
});
assert.equal(secondStage.accepted, true);
for (let tick = 25; tick <= 48; tick += 1) tickFirstAidActionsAtBoundary(criticalState, tick * 0.25);
const treatedCriticalSlot = criticalPatient.infantryCombatRuntime.wounds.slots.find((slot) => slot.zone === 'torso')!;
assert.equal(treatedCriticalSlot.severity, 'critical');
assert.equal(treatedCriticalSlot.bleedingState, 'stopped');
assert.equal(treatedCriticalSlot.firstAidApplicationCount, 2);
assert.equal(criticalMedic.infantryCombatRuntime.medical.firstAidCharges, 0);
assert.equal(criticalPatient.infantryCombatRuntime.physiology.blood.bloodLoss, 0.3);
process.exit(0);

const cancelState = createState('cancel', false);
const cancelMedic = cancelState.units[0]!;
const cancelPatient = cancelState.units[1]!;
initializeUnitMedicalInventory(cancelMedic, loadoutRef, 1);
applyWoundCandidate(cancelPatient.infantryCombatRuntime.wounds, candidate(
  'cancel:severe', cancelPatient.id, 'torso', 'severe',
));
const cancelRequest = requestApplyFirstAidAction(cancelState, cancelMedic, {
  owner: { source: 'test', id: 'cancel' },
  ownerToken: 'cancel-token',
  targetUnitId: cancelPatient.id,
  zone: null,
  requestedSeconds: 0,
});
assert.equal(cancelRequest.accepted, true);
tickFirstAidActionsAtBoundary(cancelState, 0.25);
cancelPatient.position.x += 10;
tickFirstAidActionsAtBoundary(cancelState, 0.5);
assert.equal(cancelMedic.infantryCombatRuntime.medical.activeFirstAidAction, null);
assert.equal(cancelMedic.infantryCombatRuntime.medical.firstAidCharges, 1);
assert.equal(cancelMedic.infantryCombatRuntime.medical.appliedFirstAidActionIds.length, 0);
assert.equal(cancelPatient.infantryCombatRuntime.wounds.slots[0]?.bleedingState, 'severe');

console.log('Infantry combat Stage 7 first aid smoke passed: inventory refit, ownership, priority, two-stage critical treatment, cancellation and structural/blood invariants.');

function createState(prefix: string, includeEnemy: boolean) {
  const units = [
    { id: `${prefix}-medic`, side: 'blue', x: 2, y: 2, type: 'infantry_squad' },
    { id: `${prefix}-patient`, side: 'blue', x: 2.5, y: 2, type: 'infantry_squad' },
  ];
  if (includeEnemy) units.push({ id: `${prefix}-enemy`, side: 'red', x: 2.5, y: 2.5, type: 'infantry_squad' });
  return createInitialState({
    width: 30,
    height: 20,
    cellSize: 20,
    metersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: [],
  }, units as never);
}

function candidate(
  impactId: string,
  affectedUnitId: string,
  zone: 'head' | 'torso' | 'arms' | 'legs',
  severity: WoundSeverity,
): WoundCandidateV1 {
  return {
    schemaVersion: 1,
    impactId,
    shotId: `${impactId}:shot`,
    projectileId: `${impactId}:projectile`,
    sourceUnitId: 'source',
    affectedUnitId,
    zone,
    severity,
    impactEnergyJoules: 2500,
    traumaScore: severity === 'critical' ? 1 : severity === 'severe' ? 0.6 : 0.2,
    bleedingRatePerSecond: severity === 'critical' ? 0.0104 : severity === 'severe' ? 0.0039 : 0,
    functionalPenalty: severity === 'critical' ? 1 : severity === 'severe' ? 0.6 : 0.2,
    appliedSeconds: 0,
  };
}
