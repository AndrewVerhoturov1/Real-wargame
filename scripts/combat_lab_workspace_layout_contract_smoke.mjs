import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [extension, workspaceCss, batchPanel] = await Promise.all([
  readFile('src/combat-lab/CombatLabExtension.ts', 'utf8'),
  readFile('src/combat-lab/combat-lab-workspace.css', 'utf8'),
  readFile('src/combat-lab/ui/CombatLabBatchPanel.ts', 'utf8'),
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
assert.doesNotMatch(batchPanel, /field\('Workers'/);
assert.match(extension, /\['Seed', 'Начальное число случайности'\]/);
assert.match(workspaceCss, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
assert.match(workspaceCss, /white-space:\s*nowrap/);
assert.match(workspaceCss, /overflow-x:\s*hidden/);
assert.match(workspaceCss, /overflow-wrap:\s*anywhere/);
assert.match(workspaceCss, /combat-lab-workspace-toolbar/);
console.log('Combat Lab workspace layout contract smoke passed.');
