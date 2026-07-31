import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [panel, setup, progress, diagnostics, results, css] = await Promise.all([
  readFile('src/combat-lab/ui/CombatLabBatchPanel.ts', 'utf8'),
  readFile('src/combat-lab/ui/CombatLabBatchSetupView.ts', 'utf8'),
  readFile('src/combat-lab/ui/CombatLabBatchProgressView.ts', 'utf8'),
  readFile('src/combat-lab/ui/CombatLabBatchDiagnosticsView.ts', 'utf8'),
  readFile('src/combat-lab/ui/CombatLabBatchResultsView.ts', 'utf8'),
  readFile('src/combat-lab/ui/combat-lab-batch-results.css', 'utf8'),
]);
for (const text of [
  'Число прогонов',
  'Явные seed — ровно по числу прогонов',
  'Максимум симуляционных секунд',
  'Рабочие потоки',
  'Запустить серию',
  'Отменить',
  'Повторить один и тот же случай',
]) assert.match(setup, new RegExp(text));
assert.match(panel, /CombatLabBatchSetupView/);
assert.match(panel, /CombatLabBatchProgressView/);
assert.match(results, /CombatLabBatchDiagnosticsView/);
assert.match(setup, /COMBAT_LAB_EXPERIMENT_LIMITS_V1\.maximumRunCount/);
assert.match(panel, /parseCombatLabExplicitSeeds/);
assert.match(panel, /Строка \$\{lineIndex \+ 1\}, значение \$\{tokenIndex \+ 1\}/);
assert.match(panel, /digestCombatLabExperiment\(current\) !== result\.sourceDigest/);
assert.match(progress, /Частичный результат не принят как итоговый/);
assert.match(panel, /now - this\.lastProgressUpdateMs < 100/);
assert.match(diagnostics, /uniqueSeedCount/);
assert.match(diagnostics, /uniqueFinalStateDigestCount/);
assert.match(diagnostics, /standardDeviation/);
assert.match(css, /overflow-x:\s*hidden/);
assert.match(css, /grid-template-columns:\s*repeat\(auto-fit/);
assert.doesNotMatch(panel + setup + progress + diagnostics, /tickSimulation|CombatLabScenarioExecutor|SimulationState/);
console.log('Combat Lab batch results UI contract smoke passed.');
