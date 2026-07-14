import { readFile, writeFile } from 'node:fs/promises';

async function patch(file, transforms) {
  let content = await readFile(file, 'utf8');
  for (const [search, replacement] of transforms) {
    if (!content.includes(search)) {
      throw new Error(`Missing compile-fix marker in ${file}: ${search.slice(0, 140)}`);
    }
    content = content.replace(search, replacement);
  }
  await writeFile(file, content, 'utf8');
}

await patch('src/ai-node-editor/node-contract-ui.ts', [[
  "({ number: 'число', boolean: 'да/нет', string: 'текст', position: 'позиция', unitId: 'боец', objectId: 'объект', slotId: 'место', event: 'событие', plan: 'план', route: 'маршрут' } as const)[kind]",
  "({ number: 'число', boolean: 'да/нет', string: 'текст', position: 'позиция', unitId: 'боец', objectId: 'объект', slotId: 'место', event: 'событие', plan: 'план', route: 'маршрут', tacticalQuery: 'тактический запрос' } as const)[kind]",
]]);

await patch('src/core/ai/AiGameBridge.ts', [[
  "function evaluateTacticalCheck(\n  state: SimulationState,",
  "function evaluateTacticalCheck(\n  _state: SimulationState,",
]]);

await patch('src/core/ai/runtime/AiCompositeGraphRuntime.ts', [
  [
    "  scores: AiGraphRunnerResult['scores'];\n}",
    "  scores: AiGraphRunnerResult['scores'];\n  tacticalQueries: AiGraphRunnerResult['tacticalQueries'];\n}",
  ],
  [
    "      scores: selection?.scores ?? [],\n    },",
    "      scores: selection?.scores ?? [],\n      tacticalQueries: selection?.tacticalQueries ?? {},\n    },",
  ],
  [
    "  environment.accumulator.scores = [...environment.accumulator.scores, ...nested.scores];\n",
    "  environment.accumulator.scores = [...environment.accumulator.scores, ...nested.scores];\n  environment.accumulator.tacticalQueries = { ...environment.accumulator.tacticalQueries, ...nested.tacticalQueries };\n",
  ],
  [
    "    scores: environment.accumulator.scores,\n    effects: environment.accumulator.effects,",
    "    scores: environment.accumulator.scores,\n    tacticalQueries: environment.accumulator.tacticalQueries,\n    effects: environment.accumulator.effects,",
  ],
  [
    "      accumulator: { blackboard: input.blackboard, cooldowns: { ...(input.cooldowns ?? {}) }, effects: [], trace: [], scores: [] },",
    "      accumulator: { blackboard: input.blackboard, cooldowns: { ...(input.cooldowns ?? {}) }, effects: [], trace: [], scores: [], tacticalQueries: {} },",
  ],
  [
    "  accumulator.scores = [...accumulator.scores, ...value.scores];\n}",
    "  accumulator.scores = [...accumulator.scores, ...value.scores];\n  accumulator.tacticalQueries = { ...accumulator.tacticalQueries, ...value.tacticalQueries };\n}",
  ],
  [
    "    scores: [],\n    effects: extra.effects ?? [],",
    "    scores: [],\n    tacticalQueries: {},\n    effects: extra.effects ?? [],",
  ],
]);

await patch('src/ai-node-editor/runtime-debug-overlay.ts', [
  [
    "escapeHtml(query.status)",
    "escapeHtml(tacticalQueryStatusLabel(query.status))",
  ],
  [
    "function tacticalScoreLabel(key: string): string { const labels: Record<string, string> = { protection: 'защита', concealment: 'маскировка', distance: 'расстояние', routeDanger: 'опасность маршрута', slope: 'склон', orderAlignment: 'соответствие приказу' }; return labels[key] ?? key; }\n",
    "function tacticalScoreLabel(key: string): string { const labels: Record<string, string> = { protection: 'защита', concealment: 'маскировка', distance: 'расстояние', routeDanger: 'опасность маршрута', slope: 'склон', orderAlignment: 'соответствие приказу' }; return labels[key] ?? key; }\nfunction tacticalQueryStatusLabel(status: string): string { const labels: Record<string, string> = { generated: 'кандидаты созданы', filtered: 'фильтры применены', scored: 'позиции оценены', selected: 'победитель выбран', stopped: 'запрос остановлен' }; return labels[status] ?? 'неизвестное состояние'; }\n",
  ],
]);

console.log('Applied Tactical Query System compile and Russian UI fixes.');
