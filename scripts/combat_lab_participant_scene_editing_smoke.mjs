import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = ['CombatLabParticipantSceneEditing.ts', 'CombatLabParticipantSceneRuntime.ts', 'CombatLabParticipantRemoval.ts', 'CombatLabParticipantInitialRuntime.ts']
  .map((name) => readFileSync(`src/core/testing/combat-lab/experiment/${name}`, 'utf8')).join('\n');
for (const name of [
  'updateCombatLabParticipantInitialState',
  'createCombatLabParticipant',
  'duplicateCombatLabParticipant',
  'removeCombatLabParticipant',
  'collectCombatLabParticipantProgramReferences',
]) assert.match(source, new RegExp(`export function ${name}`));
assert.match(source, /equipPrimaryWeaponFromLoadout/);
assert.match(source, /loadout\.status !== 'published'/);
assert.match(source, /createUnitWoundRuntime/);
assert.match(source, /createUnitPhysiologyRuntime/);
assert.match(source, /blood\.bloodLoss = health\.bloodLoss/);
assert.match(source, /aiControl: 'manual'/);
assert.match(source, /revision: experiment\.revision \+ 1/);
assert.doesNotMatch(source, /document\.|window\./);
console.log('combat_lab_participant_scene_editing_smoke: PASS');
