import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [controller, view, productionEditor, legacy, css] = await Promise.all([
  readFile('src/combat-lab/editor/CombatLabParticipantDialogController.ts', 'utf8'),
  readFile('src/combat-lab/editor/CombatLabParticipantDialogView.ts', 'utf8'),
  readFile('src/ui/ProductionUnitEditor.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/CombatLabParticipantDialog.ts', 'utf8'),
  readFile('src/combat-lab/editor/combat-lab-participant-dialog.css', 'utf8'),
]);

for (const section of [
  'Основное', 'Размещение', 'Вооружение и боезапас', 'Навыки и восприятие',
  'Здоровье и помощь', 'Тактика', 'Мозг', 'Технические сведения',
]) assert.match(productionEditor, new RegExp(section));

assert.match(controller, /localDraft/);
assert.match(controller, /participantMutations\.update/);
assert.match(controller, /beginPlacement/);
assert.match(controller, /beginFacing/);
assert.match(controller, /loadoutRef:\s*null/);
assert.match(controller, /aiBrain/);
assert.match(view, /createProductionUnitEditorSection/);
assert.match(productionEditor, /readOnly\s*=\s*true/);
assert.match(productionEditor, /Без оружия/);
assert.match(productionEditor, /Ручное управление/);
assert.match(productionEditor, /Graph v2/);
assert.match(productionEditor, /createTechnicalDetails/);
assert.match(productionEditor, /details\.open\s*=\s*false/);
assert.match(view, /restoreFocus/);
assert.match(view, /scrollTop/);
assert.match(view, /event\.key !== 'Escape'/);
assert.match(legacy, /CombatLabParticipantDialogController/);
assert.ok(legacy.split('\n').length < 90, 'Legacy dialog module must remain a thin adapter.');
assert.match(css, /max-height:\s*calc\(100vh/);
assert.match(css, /max-width:\s*1440px/);

console.log('Combat Lab participant dialog behavior smoke passed.');
