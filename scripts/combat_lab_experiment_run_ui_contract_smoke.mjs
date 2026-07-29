import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [toolbar, status, css] = await Promise.all([
  readFile('src/combat-lab/ui/CombatLabExperimentRunToolbar.ts', 'utf8'),
  readFile('src/combat-lab/ui/CombatLabScenarioRuntimeStatus.ts', 'utf8'),
  readFile('src/combat-lab/ui/combat-lab-experiment-run.css', 'utf8'),
]);

for (const label of ['Сбросить', '▶ Запустить', 'Пауза', 'Шаг', '■ Остановить', 'Скорость']) {
  assert.match(toolbar, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.match(toolbar, /getValidationIssues\(\)\.some\(\(issue\) => issue\.severity === 'error'\)/);
assert.match(toolbar, /onRequestBatch\(\)/);
assert.match(toolbar, /removeEventListener/);
assert.match(toolbar, /destroy\(\): void/);
assert.match(status, /experimentTitleRu/);
assert.match(status, /simulatedSeconds\.toFixed\(3\)/);
for (const text of ['Эксперимент', 'Seed', 'Время', 'Состояние', 'Активный шаг', 'Попытка', 'Причина ошибки', 'Условие успеха']) {
  assert.match(status, new RegExp(text));
}
assert.match(css, /flex-wrap:\s*wrap/);
assert.match(css, /overflow-x:\s*hidden/);
assert.doesNotMatch(toolbar + status, /tickSimulation|executeCombatLabCommand|setInterval|requestAnimationFrame/);

console.log('Combat Lab experiment run UI contract smoke passed.');
