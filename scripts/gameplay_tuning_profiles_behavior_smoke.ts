import assert from 'node:assert/strict';
import { advanceVisualContact, decayUnobservedContact } from '../src/core/perception/PerceptionContact';
import {
  createDefaultGameplayTuningRegistry,
  getActivePerceptionProfileSnapshot,
  replaceGameplayTuningRegistry,
  resolveConditionProfileSnapshot,
  resolveSoldierArchetypeSnapshot,
} from '../src/core/tuning/GameplayTuningProfiles';

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

const condition = resolveConditionProfileSnapshot('standard');
assert.equal(condition.id, 'standard');
assert.ok(Object.isFrozen(condition.wound));
assert.ok(Object.isFrozen(condition.suppression));

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

replaceGameplayTuningRegistry(createDefaultGameplayTuningRegistry());
console.log('Gameplay tuning profile behavior smoke passed.');
