import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const bridge = await readFile(new URL('../src/core/ai/AiGameBridge.ts', import.meta.url), 'utf8');
const overlay = await readFile(new URL('../src/ai-node-editor/runtime-debug-overlay.ts', import.meta.url), 'utf8');
for (const token of ['activeSubgraphId', 'activeSubgraphNameRu', 'activeSubgraphPath', 'memoryScopeKeyCounts']) {
  assert.match(bridge, new RegExp(token), `AiGameBridge must publish ${token}.`);
  assert.match(overlay, new RegExp(token), `Runtime overlay must read ${token}.`);
}
for (const label of ['Активный подграф', 'Путь выполнения', 'Постоянная память бойца', 'Память runtime session', 'Память активного состояния', 'Локальная память подграфа', 'Локальное состояние ноды']) {
  assert.ok(overlay.includes(label), `Runtime overlay must display «${label}».`);
}
console.log('Graph v2 runtime debug smoke passed: active subgraph path and five memory scopes are published and rendered.');
