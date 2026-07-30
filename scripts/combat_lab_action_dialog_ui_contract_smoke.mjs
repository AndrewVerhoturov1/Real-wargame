import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const card = readFileSync('src/combat-lab/scenario-editor/CombatLabStepCard.ts', 'utf8');
const panel = readFileSync('src/combat-lab/scenario-editor/CombatLabScenarioEditorPanel.ts', 'utf8');
const dialog = readFileSync('src/combat-lab/scenario-editor/CombatLabActionDialog.ts', 'utf8');
const trackList = readFileSync('src/combat-lab/scenario-editor/CombatLabTrackList.ts', 'utf8');

assert.match(card, /Изменить/);
assert.doesNotMatch(card, /CombatLabStepInspector|<details|detailsBlock/);
assert.match(panel, /CombatLabActionDialog\.open/);
assert.doesNotMatch(panel, /inspectorHost|new CombatLabStepInspector/);
assert.match(dialog, /document\.createElement\('dialog'\)/);
assert.match(dialog, /showModal\(\)/);
assert.match(dialog, /returnFocusTo\?\.focus/);
assert.match(dialog, /listCombatLabActionDescriptors/);
assert.match(dialog, /finalFacingMarkerId/);
assert.match(trackList, /listCombatLabActionDescriptors/);
assert.doesNotMatch(trackList, /const ACTIONS|actionKinds =/);

console.log('combat_lab_action_dialog_ui_contract_smoke: PASS');
