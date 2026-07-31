import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [controller, view, legacy, css] = await Promise.all([
  readFile('src/combat-lab/editor/CombatLabParticipantDialogController.ts', 'utf8'),
  readFile('src/combat-lab/editor/CombatLabParticipantDialogView.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/CombatLabParticipantDialog.ts', 'utf8'),
  readFile('src/combat-lab/editor/combat-lab-participant-dialog.css', 'utf8'),
]);

for (const section of [
  'Основное', 'Размещение', 'Вооружение и боезапас', 'Навыки и восприятие',
  'Здоровье и помощь', 'Тактика', 'Мозг', 'Технические данные',
]) assert.match(view, new RegExp(section));

assert.match(controller, /localDraft/);
assert.match(controller, /participantMutations\.update/);
assert.match(controller, /beginPlacement/);
assert.match(controller, /beginFacing/);
assert.match(controller, /loadoutRef:\s*null/);
assert.match(controller, /aiBrain/);
assert.match(view, /readOnly\s*=\s*true/);
assert.match(view, /Без оружия/);
assert.match(view, /Ручное управление/);
assert.match(view, /Graph v2/);
assert.match(view, /restoreFocus/);
assert.match(view, /scrollTop/);
assert.match(legacy, /CombatLabParticipantDialogController/);
assert.ok(legacy.split('\n').length < 90, 'Legacy dialog module must remain a thin adapter.');
assert.match(css, /max-height:\s*calc\(100vh/);
assert.match(css, /min\(.*1440px|1440px/);

console.log('Combat Lab participant dialog behavior smoke passed.');