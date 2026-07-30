import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [extension, workspaceCss, batchPanel, runtimeStatus, stepInspector, stepCard, actionDialog, batchResults] = await Promise.all([
  readFile('src/combat-lab/CombatLabExtension.ts', 'utf8'),
  readFile('src/combat-lab/combat-lab-workspace.css', 'utf8'),
  readFile('src/combat-lab/ui/CombatLabBatchPanel.ts', 'utf8'),
  readFile('src/combat-lab/ui/CombatLabScenarioRuntimeStatus.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/CombatLabStepInspector.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/CombatLabStepCard.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/CombatLabActionDialog.ts', 'utf8'),
  readFile('src/combat-lab/ui/CombatLabBatchResultsView.ts', 'utf8'),
]);

assert.match(extension, /parametersPanelHost/);
assert.match(extension, /Параметры выбранного бойца/);
assert.match(extension, /Ручные действия/);
assert.match(extension, /combat-lab-workspace-divider/);
assert.match(extension, /batchPanelHost[\s\S]*batchResultsHost/);
assert.match(extension, /Подробная диагностика/);
assert.match(extension, /eventJournal\.slice\(-80\)/, 'Journal must preserve the existing bounded source.');
assert.match(batchPanel, /Начальное число случайности/);
assert.match(batchPanel, /Параллельные обработчики/);
assert.match(batchPanel, /Предельное время/);
assert.match(runtimeStatus, /Начальное число случайности/);
assert.match(stepInspector, /Точка остановки перед шагом/);
assert.match(stepInspector, /Игровое действие завершено/);
assert.match(`${stepInspector}\n${actionDialog}`, /Предельное время/);
assert.match(stepCard, /Изменить/);
assert.doesNotMatch(stepCard, /Предельное время/);
assert.match(batchResults, /Начальное число случайности/);
assert.doesNotMatch(`${extension}\n${batchPanel}`, /Static Stage 10 compatibility markers|Legacy source-contract markers|LegacyStage10HostContract/);
assert.doesNotMatch(extension, /installWorkspaceLabelLocalizer|createTreeWalker|NodeFilter\.SHOW_TEXT|replaceAll\(/);
assert.match(workspaceCss, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
assert.match(workspaceCss, /white-space:\s*nowrap/);
assert.match(workspaceCss, /overflow-x:\s*hidden/);
assert.match(workspaceCss, /overflow-wrap:\s*anywhere/);
assert.match(workspaceCss, /combat-lab-workspace-toolbar/);
console.log('Combat Lab workspace layout contract smoke passed.');
