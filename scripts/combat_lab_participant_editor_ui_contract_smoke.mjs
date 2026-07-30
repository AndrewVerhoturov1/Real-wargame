import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const editor = readFileSync('src/combat-lab/scenario-editor/CombatLabParticipantEditor.ts', 'utf8');
const dialog = readFileSync('src/combat-lab/scenario-editor/CombatLabParticipantDialog.ts', 'utf8');
const parameters = readFileSync('src/combat-lab/scenario-editor/CombatLabParticipantParametersPanel.ts', 'utf8');
const roleEditor = readFileSync('src/combat-lab/scenario-editor/CombatLabRoleEditor.ts', 'utf8');

for (const text of ['Бойцы сцены', 'Создать бойца', 'Создать копию выбранного', 'Изменить', 'Копировать', 'Удалить']) assert.match(editor, new RegExp(text));
for (const text of ['Основное', 'Положение', 'Вооружение и патроны', 'Здоровье и помощь', 'Идентификатор бойца']) assert.match(dialog, new RegExp(text));
assert.match(dialog, /document\.createElement\('dialog'\)/);
assert.match(dialog, /loadout\.status === 'published'/);
assert.match(parameters, /new CombatLabAccuracyControls/);
assert.match(parameters, /setStepAccuracyOverride/);
assert.match(roleEditor, /CombatLabParticipantEditor/);
assert.match(roleEditor, /setSelectedStepAccuracyOverride/);
console.log('combat_lab_participant_editor_ui_contract_smoke: PASS');
