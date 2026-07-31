import './combat_lab_program_layout_behavior_smoke.mjs';
import './combat_lab_track_dialog_behavior_smoke.mjs';
import './combat_lab_map_mode_behavior_smoke.mjs';
import './combat_lab_marker_authoring_behavior_smoke.mjs';
import './combat_lab_step_dialog_behavior_smoke.mjs';

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [panel, tracks, card, inspector, dialog, baseCss, programCss] = await Promise.all([
  readFile('src/combat-lab/scenario-editor/CombatLabScenarioEditorPanel.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/CombatLabTrackList.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/CombatLabStepCard.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/CombatLabStepInspector.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/CombatLabStepDialog.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/combat-lab-scenario-editor.css', 'utf8'),
  readFile('src/combat-lab/scenario-editor/combat-lab-program-authoring.css', 'utf8'),
]);
const css = `${baseCss}\n${programCss}`;

assert.match(panel, /static create\(options: CombatLabScenarioEditorPanelOptions\)/);
assert.match(panel, /setRuntimeSnapshot\(snapshot: CombatLabScenarioRuntimeSnapshotV1 \| null\)/);
assert.match(panel, /setActive\(active: boolean\)/);
assert.match(panel, /selectStep\(trackId: string, stepId: string\)/);
assert.match(panel, /destroy\(\): void/);
assert.match(panel, /Редактор программы/);
assert.match(panel, /Ручное управление/);
assert.match(panel, /aria-pressed/);
assert.match(panel, /Ctrl\+Z/);
assert.match(panel, /Ctrl\+Y/);
assert.match(panel, /isTextEntry\(event\.target\)/);
assert.match(panel, /window\.removeEventListener\('keydown'/);
assert.match(panel, /CombatLabStepDialog\.open/);
assert.match(panel, /CombatLabTrackDialog\.open/);

assert.doesNotMatch(card, /document\.createElement\('details'\)|detailsBlock|CombatLabStepInspector/);
assert.match(card, /combat-lab-step-name-row/);
assert.match(card, /combat-lab-step-relation-row/);
assert.match(card, /combat-lab-step-condition-row/);
assert.match(card, /combat-lab-step-runtime-row/);
assert.match(card, /Изменить/);
assert.match(card, /runtime\?\.state/);
assert.match(card, /event\.altKey/);
assert.match(card, /ArrowUp/);
assert.match(card, /ArrowDown/);
assert.match(card, /pointerdown/);
assert.match(dialog, /document\.createElement\('dialog'\)/);
assert.match(dialog, /showModal\(\)/);
assert.match(dialog, /returnFocusTo\?\.focus/);
assert.match(dialog, /CombatLabActionEditor/);
assert.match(dialog, /CombatLabConditionEditor/);
assert.match(dialog, /CombatLabRepeatEditor/);
assert.match(tracks, /window\.addEventListener\('pointermove'/);
assert.match(tracks, /window\.removeEventListener\('pointermove'/);
assert.match(tracks, /duplicateStep/);
assert.match(tracks, /enabled: !step\.enabled/);
assert.match(tracks, /removeStep/);
assert.doesNotMatch(tracks, /react-beautiful-dnd|sortablejs|interactjs|@dnd-kit/);

for (const label of ['Условие начала', 'Условие завершения', 'Повтор', 'Предельное время', 'При ошибке', 'Дополнительно']) {
  assert.match(`${inspector}\n${dialog}`, new RegExp(label));
}
assert.match(inspector, /Игровое действие завершено/);
assert.match(inspector, /Проверяемое условие/);
assert.doesNotMatch(inspector + card, /Breakpoint|Timeout|Production action/);
assert.match(inspector, /accuracyControls\.mount/);
assert.match(inspector, /Параметры точности подключаются/);

assert.match(css, /overflow-x:\s*hidden/);
assert.match(css, /--combat-lab-program-width:\s*360px/);
assert.match(css, /min-width:\s*340px/);
assert.match(css, /max-width:\s*380px/);
for (const state of ['running', 'completed', 'failed', 'waiting', 'skipped', 'paused_at_breakpoint']) {
  assert.match(css, new RegExp(`data-state=['"]${state}['"]`));
}

console.log('Combat Lab scenario editor UI contract smoke passed.');
