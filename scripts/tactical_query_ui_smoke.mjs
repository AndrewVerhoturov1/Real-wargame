import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const bridge = await readFile(new URL('../src/core/ai/AiGameBridge.ts', import.meta.url), 'utf8');
const overlay = await readFile(new URL('../src/ai-node-editor/runtime-debug-overlay.ts', import.meta.url), 'utf8');
const contracts = await readFile(new URL('../src/core/ai/contracts/AiNodeContractRegistry.ts', import.meta.url), 'utf8');

for (const token of ['tacticalQueries', 'generateCoverCandidates', 'winnerCandidateId', 'exclusionReasons', 'scoreBreakdown']) {
  assert.match(bridge + overlay, new RegExp(token), `Tactical query diagnostics must expose ${token}.`);
}
for (const label of [
  'Создать кандидаты укрытий',
  'Фильтр тактических позиций',
  'Оценить позиции',
  'Выбрать лучшую позицию',
]) {
  assert.ok(contracts.includes(label), `Graph v2 contract must display «${label}».`);
}
for (const label of ['Тактический запрос', 'Кандидаты', 'Победитель', 'Причина исключения', 'Досрочная остановка']) {
  assert.ok(overlay.includes(label), `Runtime diagnostics must display «${label}».`);
}
const forbiddenCoverHelperLines = bridge
  .split('\n')
  .map((line, index) => ({ line: index + 1, text: line.trim() }))
  .filter((entry) => /findBestCoverForThreat\s*\(/.test(entry.text));
assert.deepEqual(
  forbiddenCoverHelperLines,
  [],
  `The live AI bridge must not call the opaque cover winner helper. Found: ${JSON.stringify(forbiddenCoverHelperLines)}`,
);

console.log('Tactical query UI smoke passed: Russian contracts and candidate diagnostics are published without hidden cover selection.');
