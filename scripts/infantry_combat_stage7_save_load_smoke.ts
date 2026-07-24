import assert from 'node:assert/strict';
import {
  normalizePhysicalActionCoordinatorState,
  serializePhysicalActionCoordinatorState,
} from '../src/core/actions/PhysicalActionCoordinator';
import {
  advanceBloodRuntimeTo,
  applyWoundCandidate,
  initializeUnitMedicalInventory,
  normalizeInfantryCombatUnitRuntime,
  reconcileInfantryCombatRuntimeAfterLoad,
  refreshUnitBleedingRateAt,
  requestApplyFirstAidAction,
  serializeInfantryCombatUnitRuntime,
  tickFirstAidActionsAtBoundary,
  type WoundCandidateV1,
} from '../src/core/infantry-combat/runtime';
import { createInitialState } from '../src/core/simulation/SimulationState';

const migrated = normalizeInfantryCombatUnitRuntime({
  schemaVersion: 1,
  nextFireTaskSequence: 1,
  primaryWeapon: null,
  activeFireTask: null,
  lastFireResult: null,
  lastShotCommit: null,
  wounds: {
    schemaVersion: 1,
    slots: [{
      schemaVersion: 1,
      zone: 'torso',
      severity: 'severe',
      hitCount: 1,
      bleedingRatePerSecond: 0.0039,
      maximumTraumaScore: 0.6,
      lastImpactEnergyJoules: 2200,
      firstImpactId: 'legacy-impact',
      lastImpactId: 'legacy-impact',
      firstAppliedSeconds: 1,
      lastAppliedSeconds: 1,
    }],
    appliedImpactIds: ['legacy-impact'],
    capabilities: {},
    lastApplication: null,
    revision: 1,
  },
});
assert.equal(migrated.schemaVersion, 2);
assert.equal(migrated.wounds.slots[0]?.severity, 'severe');
assert.equal(migrated.wounds.slots[0]?.bleedingState, 'severe');
assert.equal(migrated.physiology.blood.bloodLoss, 0);
assert.equal(migrated.physiology.blood.pendingBloodLoss, 0);
assert.equal(migrated.medical.firstAidCharges, 0);

const original = createState();
const medic = original.units[0]!;
const patient = original.units[1]!;
initializeUnitMedicalInventory(medic, { definitionId: 'loadout_rifleman', revision: 1 }, 2);
applyWoundCandidate(patient.infantryCombatRuntime.wounds, wound('save-load-wound'));
refreshUnitBleedingRateAt(patient, 0);
advanceBloodRuntimeTo(patient.infantryCombatRuntime.physiology.blood, 0.6);
assert.equal(patient.infantryCombatRuntime.physiology.blood.bloodLoss, 0);
assert.ok(patient.infantryCombatRuntime.physiology.blood.pendingBloodLoss > 0);

const request = requestApplyFirstAidAction(original, medic, {
  owner: { source: 'test', id: 'save-load' },
  ownerToken: 'save-load-owner',
  targetUnitId: patient.id,
  zone: null,
  requestedSeconds: 0,
});
assert.equal(request.accepted, true);
for (let tick = 1; tick <= 10; tick += 1) tickFirstAidActionsAtBoundary(original, tick * 0.25);
assert.equal(medic.infantryCombatRuntime.medical.activeFirstAidAction?.completedWorkTicks, 10);

const savedCombat = original.units.map((unit) => serializeInfantryCombatUnitRuntime(unit.infantryCombatRuntime));
const savedCoordinators = original.units.map((unit) => (
  serializePhysicalActionCoordinatorState(unit.behaviorRuntime.physicalActionCoordinator)
));
const restored = createState();
restored.simulationTimeSeconds = 2.5;
for (let index = 0; index < restored.units.length; index += 1) {
  restored.units[index]!.infantryCombatRuntime = normalizeInfantryCombatUnitRuntime(
    JSON.parse(JSON.stringify(savedCombat[index])),
  );
  restored.units[index]!.behaviorRuntime.physicalActionCoordinator = normalizePhysicalActionCoordinatorState(
    JSON.parse(JSON.stringify(savedCoordinators[index])),
  );
}
reconcileInfantryCombatRuntimeAfterLoad(restored);

const restoredMedic = restored.units[0]!;
const restoredPatient = restored.units[1]!;
assert.equal(restoredMedic.infantryCombatRuntime.medical.activeFirstAidAction?.completedWorkTicks, 10);
assert.equal(restoredMedic.behaviorRuntime.physicalActionCoordinator.activeLeases.length, 1);
assert.ok(restoredPatient.infantryCombatRuntime.physiology.blood.pendingBloodLoss > 0);
const firstReconciled = restored.units.map((unit) => ({
  combat: serializeInfantryCombatUnitRuntime(unit.infantryCombatRuntime),
  coordinator: serializePhysicalActionCoordinatorState(unit.behaviorRuntime.physicalActionCoordinator),
}));
reconcileInfantryCombatRuntimeAfterLoad(restored);
assert.deepEqual(restored.units.map((unit) => ({
  combat: serializeInfantryCombatUnitRuntime(unit.infantryCombatRuntime),
  coordinator: serializePhysicalActionCoordinatorState(unit.behaviorRuntime.physicalActionCoordinator),
})), firstReconciled, 'reconciliation must be idempotent');

for (let tick = 11; tick <= 24; tick += 1) tickFirstAidActionsAtBoundary(restored, tick * 0.25);
assert.equal(restoredMedic.infantryCombatRuntime.medical.firstAidCharges, 1);
assert.equal(restoredMedic.infantryCombatRuntime.medical.appliedFirstAidActionIds.length, 1);
assert.equal(restoredPatient.infantryCombatRuntime.wounds.slots[0]?.severity, 'severe');
assert.equal(restoredPatient.infantryCombatRuntime.wounds.slots[0]?.bleedingState, 'stopped');
const committedLoss = restoredPatient.infantryCombatRuntime.physiology.blood.bloodLoss;
assert.ok(committedLoss > 0, 'blood already exposed before the save must remain lost');

const completed = serializeInfantryCombatUnitRuntime(restoredMedic.infantryCombatRuntime);
const replayed = normalizeInfantryCombatUnitRuntime(JSON.parse(JSON.stringify(completed)));
assert.deepEqual(serializeInfantryCombatUnitRuntime(replayed), completed);

console.log('Infantry combat Stage 7 save/load smoke passed: V1 migration, pending blood, partial first aid, exact lease restoration, idempotent reconciliation and no blood healing.');

function createState() {
  return createInitialState({
    width: 20,
    height: 20,
    cellSize: 20,
    metersPerCell: 1,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: [],
  }, [
    { id: 'save-medic', side: 'blue', x: 2, y: 2, type: 'infantry_squad' },
    { id: 'save-patient', side: 'blue', x: 2.5, y: 2, type: 'infantry_squad' },
  ]);
}

function wound(impactId: string): WoundCandidateV1 {
  return {
    schemaVersion: 1,
    impactId,
    shotId: `${impactId}:shot`,
    projectileId: `${impactId}:projectile`,
    sourceUnitId: 'source',
    affectedUnitId: 'save-patient',
    zone: 'torso',
    severity: 'severe',
    impactEnergyJoules: 2200,
    traumaScore: 0.6,
    bleedingRatePerSecond: 0.0039,
    functionalPenalty: 0.6,
    appliedSeconds: 0,
  };
}
