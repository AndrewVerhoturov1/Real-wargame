import assert from 'node:assert/strict';
import { createSoldierParameters, type SoldierParameters } from '../src/core/behavior/BehaviorModel';
import {
  getCombatAimMultiplier,
  getCombatMovementMultiplier,
  replaceCombatRuntime,
} from '../src/core/combat/CombatDamage';
import { advanceVisualContact } from '../src/core/perception/PerceptionContact';
import {
  createDefaultGameplayTuningRegistry,
  replaceGameplayTuningRegistry,
} from '../src/core/tuning/GameplayTuningProfiles';
import {
  getActiveConditionProfileSnapshot,
  setActiveConditionProfileId,
} from '../src/core/tuning/GameplayTuningRuntime';
import type { UnitModel } from '../src/core/units/UnitModel';

const registry = createDefaultGameplayTuningRegistry();
const standardPerception = registry.requirePerceptionProfile('standard');
const activePerception = registry.replacePerceptionProfile({
  ...standardPerception,
  id: 'active-perception-test',
  nameRu: 'Активное восприятие для проверки',
  builtIn: false,
  revision: 1,
  contact: {
    ...standardPerception.contact,
    confidenceEvidenceDivisor: 2,
  },
});
const standardCondition = registry.requireConditionProfile('standard');
const activeCondition = registry.replaceConditionProfile({
  ...standardCondition,
  id: 'active-condition-test',
  nameRu: 'Активное состояние для проверки',
  builtIn: false,
  revision: 1,
  wound: {
    ...standardCondition.wound,
    woundedMovementMultiplier: 0.33,
    woundedAimMultiplier: 0.44,
  },
});
replaceGameplayTuningRegistry(registry);
assert.equal(registry.setActivePerceptionProfileId(activePerception.id), true);
assert.equal(setActiveConditionProfileId(activeCondition.id), true);
assert.equal(getActiveConditionProfileSnapshot().id, activeCondition.id);

const activeFallbackContact = advanceVisualContact(null, {
  id: 'active-fallback-contact',
  stimulusId: 'active-fallback-target',
  labelRu: 'Цель',
  position: { x: 1, y: 1 },
  evidencePerSecond: 40,
  detectionVariance: 1,
  deltaSeconds: 1,
  nowSeconds: 1,
});
assert.equal(activeFallbackContact.confidence, 20);

const {
  conditionProfile: _legacyConditionProfile,
  ...legacySoldierWithoutConditionProfile
} = createSoldierParameters('regular');
const legacySoldier: SoldierParameters = legacySoldierWithoutConditionProfile;
const legacyUnit = createUnit(legacySoldier);
replaceCombatRuntime(legacyUnit, { capability: 'wounded' });
assert.equal(getCombatMovementMultiplier(legacyUnit), 0.33);
assert.equal(getCombatAimMultiplier(legacyUnit), 0.44);

const snapshotSoldier: SoldierParameters = {
  ...createSoldierParameters('regular'),
  perceptionProfile: activePerception,
  conditionProfile: activeCondition,
};
const snapshotUnit = createUnit(snapshotSoldier);
replaceCombatRuntime(snapshotUnit, { capability: 'wounded' });

assert.equal(registry.setActivePerceptionProfileId('standard'), true);
assert.equal(setActiveConditionProfileId('standard'), true);

const standardFallbackContact = advanceVisualContact(null, {
  id: 'standard-fallback-contact',
  stimulusId: 'standard-fallback-target',
  labelRu: 'Цель',
  position: { x: 1, y: 1 },
  evidencePerSecond: 40,
  detectionVariance: 1,
  deltaSeconds: 1,
  nowSeconds: 2,
});
assert.ok(Math.abs(standardFallbackContact.confidence - (40 / 1.5)) < 1e-9);
assert.equal(getCombatMovementMultiplier(legacyUnit), 0.78);
assert.equal(getCombatAimMultiplier(legacyUnit), 0.82);

const snapshotContact = advanceVisualContact(null, {
  id: 'snapshot-contact',
  stimulusId: 'snapshot-target',
  labelRu: 'Цель',
  position: { x: 2, y: 2 },
  evidencePerSecond: 40,
  detectionVariance: 1,
  deltaSeconds: 1,
  nowSeconds: 2,
  perceptionProfile: snapshotSoldier.perceptionProfile,
});
assert.equal(snapshotContact.confidence, 20, 'frozen soldier snapshot must ignore later active-profile changes');
assert.equal(getCombatMovementMultiplier(snapshotUnit), 0.33);
assert.equal(getCombatAimMultiplier(snapshotUnit), 0.44);

replaceGameplayTuningRegistry(createDefaultGameplayTuningRegistry());
setActiveConditionProfileId('standard');
console.log('Gameplay tuning active-profile behavior smoke passed.');

function createUnit(soldier: SoldierParameters): UnitModel {
  return {
    id: 'active-profile-test-unit',
    soldier,
    behaviorRuntime: { weaponReady: true, currentAction: 'idle' },
    infantryCombatRuntime: {
      wounds: {
        capabilities: {
          alive: true,
          conscious: true,
          canStand: true,
          canMove: true,
          canUseHands: true,
          canUseWeapon: true,
          movementSpeedMultiplier: 1,
          stabilityMultiplier: 1,
          accuracyMultiplier: 1,
        },
      },
      physiology: { blood: { state: 'stable' } },
    },
    order: null,
    playerCommand: null,
  } as unknown as UnitModel;
}
