import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [panel, tracks, card, inspector, css] = await Promise.all([
  readFile('src/combat-lab/scenario-editor/CombatLabScenarioEditorPanel.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/CombatLabTrackList.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/CombatLabStepCard.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/CombatLabStepInspector.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/combat-lab-scenario-editor.css', 'utf8'),
]);

assert.match(panel, /static create\(options: CombatLabScenarioEditorPanelOptions\)/);
assert.match(panel, /setRuntimeSnapshot\(snapshot: CombatLabScenarioRuntimeSnapshotV1 \| null\)/);
assert.match(panel, /selectStep\(trackId: string, stepId: string\)/);
assert.match(panel, /destroy\(\): void/);
assert.match(panel, /Редактор сценария/);
assert.match(panel, /Ручное управление/);
assert.match(panel, /Ctrl\+Z/);
assert.match(panel, /Ctrl\+Y/);
assert.match(panel, /isTextEntry\(event\.target\)/);
assert.match(panel, /window\.removeEventListener\('keydown'/);

assert.match(card, /details/);
assert.match(card, /combat-lab-step-summary/);
assert.match(card, /runtime\?\.state/);
assert.match(card, /Alt|event\.altKey/);
assert.match(card, /ArrowUp/);
assert.match(card, /ArrowDown/);
assert.match(card, /pointerdown/);
assert.match(tracks, /window\.addEventListener\('pointermove'/);
assert.match(tracks, /window\.removeEventListener\('pointermove'/);
assert.match(tracks, /duplicateStep/);
assert.match(tracks, /enabled: !step\.enabled/);
assert.match(tracks, /removeStep/);
assert.doesNotMatch(tracks, /react-beautiful-dnd|sortablejs|interactjs|@dnd-kit/);

for (const label of ['Условие начала', 'Условие завершения', 'Повтор', 'Предельное время', 'При ошибке', 'Точка остановки']) {
  assert.match(`${inspector}\n${card}`, new RegExp(label));
}
assert.match(inspector, /Игровое действие завершено/);
assert.match(inspector, /Проверяемое условие/);
assert.doesNotMatch(inspector + card, /Breakpoint|Timeout|Production action/);
assert.match(inspector, /accuracyControls\.mount/);
assert.match(inspector, /Параметры точности подключаются/);

assert.match(css, /overflow-x:\s*hidden/);
assert.match(css, /grid-template-columns:/);
for (const state of ['running', 'completed', 'failed', 'waiting', 'skipped', 'paused_at_breakpoint']) {
  assert.match(css, new RegExp(`data-state=['"]${state}['"]`));
}
assert.doesNotMatch(css, /width:\s*(?:5\d\d|[6-9]\d\d|\d{4,})px/, 'Scoped editor CSS must not force a width beyond the current dock.');

console.log('Combat Lab scenario editor UI contract smoke passed.');