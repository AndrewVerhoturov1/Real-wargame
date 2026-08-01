import assert from 'node:assert/strict';
import { createDefaultCombatCatalogRegistry } from '../src/core/infantry-combat/catalogs/CombatCatalogRegistry';
import {
  applyInitialHealth,
  applyPosture,
  applyPublishedLoadout,
  captureCombatLabParticipantStableRuntime,
} from '../src/core/testing/combat-lab/experiment/CombatLabParticipantInitialRuntime';
import { normalizeUnits, type UnitData } from '../src/core/units/UnitModel';

const unitData: UnitData = {
  id: 'combat-lab-initial-posture-unit',
  label: 'Combat Lab initial posture unit',
  labelRu: 'Боец проверки начальной позы',
  type: 'infantry_squad',
  side: 'player',
  aiControl: 'manual',
  x: 1,
  y: 1,
  initialState: { posture: 'standing' },
};

const unit = normalizeUnits([unitData])[0];
const registry = createDefaultCombatCatalogRegistry();
const loadout = registry.listLoadoutTemplates().find((candidate) => candidate.status === 'published');
assert.ok(loadout, 'default catalog must contain a published loadout');

applyPublishedLoadout(unit, {
  definitionId: loadout.loadoutTemplateId,
  revision: loadout.revision,
}, registry);
applyInitialHealth(unit, {
  mode: 'wound_set',
  bloodLoss: 0.18,
  wounds: [{ zone: 'torso', severity: 'severe', hitCount: 1 }],
}, 12, 'combat-lab-initial-posture-unit');

const weapon = unit.infantryCombatRuntime.primaryWeapon;
assert.ok(weapon, 'published loadout must equip a primary weapon');
weapon.roundsInWeapon = Math.max(0, weapon.roundsInWeapon - 1);
unit.infantryCombatRuntime.physiology.fatigue.fatigue = 0.37;
unit.infantryCombatRuntime.suppression.suppressionLevel = 0.42;
unit.infantryCombatRuntime.suppression.shock = 0.16;

const stableBefore = captureCombatLabParticipantStableRuntime(unit);
assert.equal(unit.behaviorRuntime.physicalAction, null);

applyPosture(unit, 'prone');

assert.equal(unit.initialState.posture, 'prone');
assert.equal(unit.behaviorRuntime.previousPosture, 'prone');
assert.equal(unit.behaviorRuntime.posture, 'prone');
assert.equal(unit.behaviorRuntime.physicalAction, null, 'initial edit must not create a timed posture transition');
assert.deepEqual(
  captureCombatLabParticipantStableRuntime(unit),
  stableBefore,
  'initial posture edit must preserve weapon, ammo, aid, wounds, blood, fatigue and suppression',
);

console.log('Combat Lab initial posture smoke passed: immediate posture is canonical and stable combat state is preserved.');
