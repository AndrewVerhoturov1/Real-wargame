import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [panel, css] = await Promise.all([
  readFile('src/combat-lab/ui/CombatLabBatchPanel.ts', 'utf8'),
  readFile('src/combat-lab/ui/combat-lab-batch-results.css', 'utf8'),
]);
for (const text of ['Прогоны', 'Явный список Seed', 'Максимум времени', 'Workers', 'Запустить серию', 'Отменить']) assert.match(panel, new RegExp(text));
assert.match(panel, /runCount.*10_000/s);
assert.match(panel, /parseCombatLabExplicitSeeds/);
assert.match(panel, /Строка \$\{lineIndex \+ 1\}, значение \$\{tokenIndex \+ 1\}/);
assert.match(panel, /digestCombatLabExperiment\(current\) !== result\.sourceDigest/);
assert.match(panel, /Частичный результат не принят как итоговый/);
assert.match(panel, /now - this\.lastProgressUpdateMs < 100/);
assert.match(css, /overflow-x:\s*hidden/);
assert.match(css, /grid-template-columns:\s*repeat\(auto-fit/);
assert.doesNotMatch(panel, /tickSimulation|CombatLabScenarioExecutor|SimulationState/);
console.log('Combat Lab batch results UI contract smoke passed.');
