import assert from 'node:assert/strict';
import { createSoldierParameters } from '../src/core/behavior/BehaviorModel';
import {
  getCombatAimMultiplier,
  getCombatMovementMultiplier,
  replaceCombatRuntime,
} from '../src/core/combat/CombatDamage';
import { advanceVisualContact, decayUnobservedContact } from '../src/core/perception/PerceptionContact';
import {
  createDefaultGameplayTuningRegistry,
  getActivePerceptionProfileSnapshot,
  replaceGameplayTuningRegistry,
  resolveConditionProfileSnapshot,
  resolveSoldierArchetypeSnapshot,
} from '../src/core/tuning/GameplayTuningProfiles';
import {
  getActiveConditionProfileSnapshot,
  setActiveConditionProfileId,
} from '../src/core/tuning/GameplayTuningRuntime';
import type { UnitModel } from '../src/core/units/UnitModel';
import {
  GAMEPLAY_TUNING_STORAGE_KEY,
  loadGameplayTuningProfiles,
  saveGameplayTuningProfiles,
} from '../src/ui/GameplayTuningProfileStorage';

const registry = createDefaultGameplayTuningRegistry();
const startRevision = registry.semanticRevision;
const customPerception = {
  ...registry.requirePerceptionProfile('standard'),
  id: 'test-perception',
  nameRu: 'Проверка восприятия',
  builtIn: false,
  revision: 1,
  contact: {
    confidenceEvidenceDivisor: 2,
    minimumUncertaintyCells: 0.5,
    initialUncertaintyCells: 10,
    uncertaintyEvidenceDivisor: 20,
    evidenceDecayPerSecond: 4,
    confidenceDecayPerSecond: 3,
    uncertaintyGrowthMetersPerSecond: 2,
    soundEvidenceMultiplier: 0.5,
    reportedEvidenceMultiplier: 0.75,
  },
};
registry.replacePerceptionProfile(customPerception);
assert.equal(registry.semanticRevision, startRevision + 1);
registry.replacePerceptionProfile(customPerception);
assert.equal(registry.semanticRevision, startRevision + 1, 'identical replacement must not advance semantic revision');
registry.setActivePerceptionProfileId('test-perception');
replaceGameplayTuningRegistry(registry);

const active = getActivePerceptionProfileSnapshot();
assert.equal(active.id, 'test-perception');
assert.ok(Object.isFrozen(active));
assert.ok(Object.isFrozen(active.contact));

const observed = advanceVisualContact(null, {
  id: 'contact-1',
  stimulusId: 'target-1',
  sourceUnitId: 'red-1',
  labelRu: 'Цель',
  position: { x: 10, y: 20 },
  evidencePerSecond: 40,
  detectionVariance: 1,
  deltaSeconds: 1,
  nowSeconds: 1,
});
assert.equal(observed.evidence, 40);
assert.equal(observed.confidence, 20, 'active perception profile must own confidence conversion');
assert.equal(observed.uncertaintyCells, 8, 'active perception profile must own uncertainty conversion');

const decayed = decayUnobservedContact(observed, {
  deltaSeconds: 1,
  nowSeconds: 2,
  metersPerCell: 2,
});
assert.ok(decayed);
assert.equal(decayed!.evidence, 36);
assert.equal(decayed!.confidence, 17);
assert.equal(decayed!.uncertaintyCells, 9);

const archetype = resolveSoldierArchetypeSnapshot('regular');
assert.equal(archetype.id, 'regular');
assert.ok(Object.isFrozen(archetype.traits));
assert.ok(Object.isFrozen(archetype.condition));

registry.replaceSoldierArchetype({
  ...archetype,
  id: 'test-archetype',
  nameRu: 'Проверка архетипа',
  builtIn: false,
  revision: 1,
  traits: { ...archetype.traits, resilience: 91, weaponSkill: 88 },
  condition: { ...archetype.condition, morale: 77, speed: 63 },
});
saveGameplayTuningProfiles(registry, null);
const spawnedSoldier = createSoldierParameters('test-archetype');
assert.equal(spawnedSoldier.traits.resilience, 91);
assert.equal(spawnedSoldier.traits.weaponSkill, 88);
assert.equal(spawnedSoldier.condition.morale, 77);
assert.equal(spawnedSoldier.condition.speed, 63);
assert.notEqual(spawnedSoldier.traits, registry.requireSoldierArchetype('test-archetype').traits);

const condition = resolveConditionProfileSnapshot('standard');
assert.equal(condition.id, 'standard');
assert.ok(Object.isFrozen(condition.wound));
assert.ok(Object.isFrozen(condition.suppression));

registry.replaceConditionProfile({
  ...condition,
  id: 'runtime-condition',
  nameRu: 'Проверка runtime',
  builtIn: false,
  revision: 1,
  wound: {
    ...condition.wound,
    woundedMovementMultiplier: 0.33,
    severelyWoundedMovementMultiplier: 0.21,
    woundedAimMultiplier: 0.44,
    severelyWoundedAimMultiplier: 0.27,
  },
  suppression: {
    ...condition.suppression,
    gainMultiplier: 1.8,
    decayPerSecond: 7,
    stressMultiplier: 1.4,
    maximumSuppression: 73,
  },
});
saveGameplayTuningProfiles(registry, null);
assert.equal(setActiveConditionProfileId('runtime-condition'), true);
const activeCondition = getActiveConditionProfileSnapshot();
assert.equal(activeCondition.id, 'runtime-condition');
assert.equal(activeCondition.suppression.decayPerSecond, 7);

const unit = createCapabilityTestUnit();
replaceCombatRuntime(unit, { capability: 'wounded' });
assert.equal(getCombatMovementMultiplier(unit), 0.33);
assert.equal(getCombatAimMultiplier(unit), 0.44);
replaceCombatRuntime(unit, { capability: 'severely_wounded' });
assert.equal(getCombatMovementMultiplier(unit), 0.21);
assert.equal(getCombatAimMultiplier(unit), 0.27);

const normalized = createDefaultGameplayTuningRegistry();
normalized.replaceConditionProfile({
  ...normalized.requireConditionProfile('standard'),
  id: 'clamped',
  nameRu: 'Проверка границ',
  builtIn: false,
  revision: 1,
  wound: {
    ...normalized.requireConditionProfile('standard').wound,
    woundedMovementMultiplier: 99,
    severelyWoundedAimMultiplier: -3,
  },
  suppression: {
    ...normalized.requireConditionProfile('standard').suppression,
    gainMultiplier: 99,
    decayPerSecond: -5,
  },
});
const clamped = normalized.requireConditionProfile('clamped');
assert.equal(clamped.wound.woundedMovementMultiplier, 2);
assert.equal(clamped.wound.severelyWoundedAimMultiplier, 0);
assert.equal(clamped.suppression.gainMultiplier, 4);
assert.equal(clamped.suppression.decayPerSecond, 0);
assert.equal(normalized.requireConditionProfile('missing').id, 'standard');

const tamperedBundle = JSON.parse(JSON.stringify(createDefaultGameplayTuningRegistry().exportBundle()));
tamperedBundle.perceptionProfiles[0].contact.confidenceEvidenceDivisor = 9;
tamperedBundle.soldierArchetypes.find((profile: { id: string }) => profile.id === 'regular').traits.resilience = 1;
tamperedBundle.conditionProfiles[0].wound.woundedMovementMultiplier = 0.01;
const fakeStorage = createStorage(JSON.stringify(tamperedBundle));
const restored = loadGameplayTuningProfiles(fakeStorage);
assert.equal(restored.requirePerceptionProfile('standard').contact.confidenceEvidenceDivisor, 1.5);
assert.equal(restored.requireSoldierArchetype('regular').traits.resilience, 55);
assert.equal(restored.requireConditionProfile('standard').wound.woundedMovementMultiplier, 0.78);

replaceGameplayTuningRegistry(createDefaultGameplayTuningRegistry());
console.log('Gameplay tuning profile behavior smoke passed.');

function createCapabilityTestUnit(): UnitModel {
  return {
    id: 'test-unit',
    soldier: {
      traits: { resilience: 50 },
      condition: { health: 100 },
    },
    behaviorRuntime: {
      weaponReady: true,
      currentAction: 'idle',
    },
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
      physiology: {
        blood: { state: 'stable' },
      },
    },
    order: null,
    playerCommand: null,
  } as unknown as UnitModel;
}

function createStorage(serialized: string): Storage {
  const values = new Map<string, string>([[GAMEPLAY_TUNING_STORAGE_KEY, serialized]]);
  return {
    get length(): number { return values.size; },
    clear(): void { values.clear(); },
    getItem(key: string): string | null { return values.get(key) ?? null; },
    key(index: number): string | null { return [...values.keys()][index] ?? null; },
    removeItem(key: string): void { values.delete(key); },
    setItem(key: string, value: string): void { values.set(key, value); },
  };
}
