import assert from 'node:assert/strict';
import {
  applyWoundCandidate,
  initializeUnitMedicalInventory,
  requestApplyFirstAidAction,
  serializeInfantryCombatUnitRuntime,
  tickInfantryCombatSimulation,
  type WoundCandidateV1,
} from '../src/core/infantry-combat/runtime';
import { createInitialState } from '../src/core/simulation/SimulationState';

const UNIT_COUNT = 200;
const BLEEDING_UNIT_COUNT = 50;
const FIRST_AID_ACTION_COUNT = 64;
const DURATION_SECONDS = 60;
const STEP_SECONDS = 0.25;

const ordered = execute(false);
const reversed = execute(true);
assert.deepEqual(reversed, ordered, 'unit storage order must not change Stage 7 physiology and medical results');
assert.equal(ordered.units, UNIT_COUNT);
assert.equal(ordered.initialBleedingUnits, BLEEDING_UNIT_COUNT);
assert.equal(ordered.acceptedFirstAidActions, FIRST_AID_ACTION_COUNT);
assert.equal(ordered.spentCharges, BLEEDING_UNIT_COUNT);
assert.equal(ordered.unspentDuplicateCharges, FIRST_AID_ACTION_COUNT - BLEEDING_UNIT_COUNT);
assert.equal(ordered.activeFirstAidActions, 0);
assert.equal(ordered.remainingActiveBleedingUnits, 0);
assert.equal(ordered.maximumWoundSlots, 1);
assert.equal(ordered.maximumAppliedFirstAidIds, 1);
assert.equal(ordered.bloodUpdateCount, UNIT_COUNT * DURATION_SECONDS);
assert.equal(ordered.fatigueUpdateCount, UNIT_COUNT * DURATION_SECONDS / STEP_SECONDS);
assert.equal(ordered.projectileSubsteps, 0);
assert.equal(ordered.projectileCount, 0);

console.log(`Infantry combat Stage 7 stress passed: ${UNIT_COUNT} units, ${BLEEDING_UNIT_COUNT} bleeding units, ${FIRST_AID_ACTION_COUNT} concurrent aid actions and ${DURATION_SECONDS}s deterministic 1 Hz/4 Hz physiology.`);

function execute(reverseUnits: boolean) {
  const unitData: Array<Record<string, unknown>> = [];
  const patientPositions: Array<{ x: number; y: number }> = [];
  for (let patient = 0; patient < BLEEDING_UNIT_COUNT; patient += 1) {
    patientPositions.push({
      x: 2 + (patient % 10) * 5,
      y: 2 + Math.floor(patient / 10) * 5,
    });
  }
  for (let medic = 0; medic < FIRST_AID_ACTION_COUNT; medic += 1) {
    const target = patientPositions[medic % BLEEDING_UNIT_COUNT]!;
    unitData.push({
      id: `stress-medic-${String(medic).padStart(3, '0')}`,
      side: 'blue',
      x: target.x + (medic < BLEEDING_UNIT_COUNT ? 0.5 : 0.75),
      y: target.y,
      type: 'infantry_squad',
    });
  }
  for (let patient = 0; patient < BLEEDING_UNIT_COUNT; patient += 1) {
    const position = patientPositions[patient]!;
    unitData.push({
      id: `stress-patient-${String(patient).padStart(3, '0')}`,
      side: 'blue',
      x: position.x,
      y: position.y,
      type: 'infantry_squad',
    });
  }
  for (let reserve = unitData.length; reserve < UNIT_COUNT; reserve += 1) {
    unitData.push({
      id: `stress-reserve-${String(reserve).padStart(3, '0')}`,
      side: 'blue',
      x: 60 + (reserve % 20),
      y: 2 + Math.floor(reserve / 20),
      type: 'infantry_squad',
    });
  }
  if (reverseUnits) unitData.reverse();

  const state = createInitialState({
    width: 100,
    height: 40,
    cellSize: 20,
    metersPerCell: 1,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: [],
  }, unitData as never);
  const unitsById = new Map(state.units.map((unit) => [unit.id, unit]));
  for (let patient = 0; patient < BLEEDING_UNIT_COUNT; patient += 1) {
    const unit = unitsById.get(`stress-patient-${String(patient).padStart(3, '0')}`)!;
    applyWoundCandidate(unit.infantryCombatRuntime.wounds, wound(patient, unit.id));
  }

  let acceptedFirstAidActions = 0;
  for (let medic = 0; medic < FIRST_AID_ACTION_COUNT; medic += 1) {
    const actor = unitsById.get(`stress-medic-${String(medic).padStart(3, '0')}`)!;
    const patient = medic % BLEEDING_UNIT_COUNT;
    const target = unitsById.get(`stress-patient-${String(patient).padStart(3, '0')}`)!;
    initializeUnitMedicalInventory(actor, { definitionId: 'loadout_rifleman', revision: 1 }, 1);
    const request = requestApplyFirstAidAction(state, actor, {
      owner: { source: 'test', id: `stress-${medic}` },
      ownerToken: `stress-owner-${medic}`,
      targetUnitId: target.id,
      zone: null,
      requestedSeconds: 0,
    });
    if (request.accepted) acceptedFirstAidActions += 1;
  }

  let projectileSubsteps = 0;
  for (let step = 0; step < DURATION_SECONDS / STEP_SECONDS; step += 1) {
    const result = tickInfantryCombatSimulation(state, {
      intervalStartSeconds: step * STEP_SECONDS,
      deltaSeconds: STEP_SECONDS,
    });
    projectileSubsteps += result.projectileSubsteps;
  }

  const medics = [...unitsById.values()].filter((unit) => unit.id.startsWith('stress-medic-'));
  const patients = [...unitsById.values()].filter((unit) => unit.id.startsWith('stress-patient-'));
  const unitSnapshots = state.units
    .map((unit) => ({ unitId: unit.id, runtime: serializeInfantryCombatUnitRuntime(unit.infantryCombatRuntime) }))
    .sort((left, right) => left.unitId.localeCompare(right.unitId));
  return {
    units: state.units.length,
    initialBleedingUnits: BLEEDING_UNIT_COUNT,
    acceptedFirstAidActions,
    spentCharges: medics.filter((unit) => unit.infantryCombatRuntime.medical.firstAidCharges === 0).length,
    unspentDuplicateCharges: medics.filter((unit) => unit.infantryCombatRuntime.medical.firstAidCharges === 1).length,
    activeFirstAidActions: medics.filter((unit) => unit.infantryCombatRuntime.medical.activeFirstAidAction !== null).length,
    remainingActiveBleedingUnits: patients.filter((unit) => unit.infantryCombatRuntime.wounds.slots.some((slot) => slot.bleedingState === 'severe' || slot.bleedingState === 'critical')).length,
    maximumWoundSlots: Math.max(...state.units.map((unit) => unit.infantryCombatRuntime.wounds.slots.length)),
    maximumAppliedFirstAidIds: Math.max(...medics.map((unit) => unit.infantryCombatRuntime.medical.appliedFirstAidActionIds.length)),
    bloodUpdateCount: state.units.reduce((sum, unit) => sum + unit.infantryCombatRuntime.physiology.blood.updateCount, 0),
    fatigueUpdateCount: state.units.reduce((sum, unit) => sum + unit.infantryCombatRuntime.physiology.fatigue.updateCount, 0),
    projectileSubsteps,
    projectileCount: state.infantryCombatProjectiles.activeProjectiles.length,
    unitSnapshots,
  };
}

function wound(index: number, affectedUnitId: string): WoundCandidateV1 {
  const impactId = `stress-wound-${index}`;
  return {
    schemaVersion: 1,
    impactId,
    shotId: `${impactId}:shot`,
    projectileId: `${impactId}:projectile`,
    sourceUnitId: 'stress-source',
    affectedUnitId,
    zone: 'torso',
    severity: 'severe',
    impactEnergyJoules: 2200,
    traumaScore: 0.6,
    bleedingRatePerSecond: 0.0039,
    functionalPenalty: 0.6,
    appliedSeconds: 0,
  };
}
