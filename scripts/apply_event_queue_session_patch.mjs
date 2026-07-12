import { readFile, writeFile } from 'node:fs/promises';

await patch('src/core/ai/runtime/AiRuntimeSession.ts', (source) => {
  source = insertOnce(
    source,
    "import type { AiGraphRunnerBlackboard } from '../AiGraphRunner';\n",
    "import type { AiGraphRunnerBlackboard } from '../AiGraphRunner';\nimport {\n  cloneAiEventQueueSnapshot,\n  createAiEventQueue,\n  normalizeAiEventQueueSnapshot,\n  type AiEventQueueSnapshotV1,\n} from '../events/AiEventQueue';\n",
    'import event queue helpers',
  );
  source = replaceOnce(
    source,
    "  readonly cooldowns: Record<string, number>;\n  readonly lastTerminal?: AiRuntimeTerminalRecord;",
    "  readonly cooldowns: Record<string, number>;\n  readonly eventQueue: AiEventQueueSnapshotV1;\n  readonly lastTerminal?: AiRuntimeTerminalRecord;",
    'add queue to session snapshot',
  );
  source = replaceOnce(
    source,
    "  readonly cooldowns?: Record<string, number>;\n  readonly lastTerminal?: AiRuntimeTerminalRecord;",
    "  readonly cooldowns?: Record<string, number>;\n  readonly eventQueue?: AiEventQueueSnapshotV1;\n  readonly lastTerminal?: AiRuntimeTerminalRecord;",
    'add queue to session creation input',
  );
  source = replaceOnce(
    source,
    "    cooldowns: cloneCooldowns(input.cooldowns ?? {}),\n    lastTerminal:",
    "    cooldowns: cloneCooldowns(input.cooldowns ?? {}),\n    eventQueue: input.eventQueue\n      ? cloneAiEventQueueSnapshot(input.eventQueue)\n      : createAiEventQueue(),\n    lastTerminal:",
    'create session queue',
  );
  source = replaceOnce(
    source,
    "      cooldowns: normalizeCooldowns(value.cooldowns),\n      lastTerminal:",
    "      cooldowns: normalizeCooldowns(value.cooldowns),\n      eventQueue: normalizeAiEventQueueSnapshot(value.eventQueue),\n      lastTerminal:",
    'normalize session queue',
  );
  source = replaceOnce(
    source,
    "    cooldowns: input.aiNodeCooldowns ?? input.cooldowns,\n    lastTerminal:",
    "    cooldowns: input.aiNodeCooldowns ?? input.cooldowns,\n    eventQueue: input.eventQueue,\n    lastTerminal:",
    'migrate legacy queue when provided',
  );
  source = replaceOnce(
    source,
    "    cooldowns: cloneCooldowns(result.cooldowns),\n    lastTerminal:",
    "    cooldowns: cloneCooldowns(result.cooldowns),\n    eventQueue: cloneAiEventQueueSnapshot(current.eventQueue),\n    lastTerminal:",
    'preserve queue across runtime result',
  );
  source = replaceOnce(
    source,
    "  options: { readonly keepMemory?: boolean; readonly keepCooldowns?: boolean } = {},",
    "  options: { readonly keepMemory?: boolean; readonly keepCooldowns?: boolean; readonly keepEvents?: boolean } = {},",
    'add keepEvents reset option',
  );
  source = replaceOnce(
    source,
    "    cooldowns: options.keepCooldowns ? current.cooldowns : {},\n  });",
    "    cooldowns: options.keepCooldowns ? current.cooldowns : {},\n    eventQueue: options.keepEvents ? current.eventQueue : createAiEventQueue(current.eventQueue.maxSize),\n  });",
    'reset or preserve queue explicitly',
  );
  source = replaceOnce(
    source,
    "    cooldowns: cloneCooldowns(value.cooldowns),\n    lastTerminal:",
    "    cooldowns: cloneCooldowns(value.cooldowns),\n    eventQueue: cloneAiEventQueueSnapshot(value.eventQueue),\n    lastTerminal:",
    'clone session queue',
  );
  return source;
});

await patch('scripts/ai_runtime_session_smoke.ts', (source) => {
  source = insertOnce(
    source,
    "import type { AiGraphExecutionState, AiGraphRuntimeResult } from '../src/core/ai/AiGraphRuntime';\n",
    "import type { AiGraphExecutionState, AiGraphRuntimeResult } from '../src/core/ai/AiGraphRuntime';\nimport { pushAiEvent } from '../src/core/ai/events/AiEventQueue';\n",
    'import queue push for session smoke',
  );
  source = replaceOnce(
    source,
    "const activeResult = runtimeResult('running', executionState);\nconst updated = applyRuntimeResultToSession(first, activeResult, 1800);",
    "const queued = pushAiEvent(first.eventQueue, {\n  id: 'order-1',\n  type: 'order_received',\n  timestampMs: 1300,\n  priority: 100,\n  payload: { orderId: 'order-1' },\n});\nconst sessionWithEvent = { ...first, eventQueue: queued.queue };\nconst activeResult = runtimeResult('running', executionState);\nconst updated = applyRuntimeResultToSession(sessionWithEvent, activeResult, 1800);",
    'preserve queue through runtime update',
  );
  source = replaceOnce(
    source,
    "assert.equal(updated.executionState?.lastUpdatedAtMs, 1200);\n",
    "assert.equal(updated.executionState?.lastUpdatedAtMs, 1200);\nassert.equal(updated.eventQueue.events[0]?.type, 'order_received');\nassert.equal(updated.eventQueue.nextSequence, 1);\n",
    'assert queue preserved',
  );
  source = replaceOnce(
    source,
    "assert.match(terminal.lastTerminal?.reasonRu ?? '', /отмен/i);\n",
    "assert.match(terminal.lastTerminal?.reasonRu ?? '', /отмен/i);\nassert.equal(terminal.eventQueue.events.length, 1);\n\nconst oldSessionWithoutQueue = normalizeAiRuntimeSession({\n  version: 1,\n  graphId: 'graph_a',\n  unitId: 'soldier_a',\n  simulationTimeMs: 0,\n  status: 'idle',\n  blackboardMemory: {},\n  cooldowns: {},\n}, { graphId: 'graph_a', unitId: 'soldier_a' });\nassert.equal(oldSessionWithoutQueue.session.eventQueue.events.length, 0);\nassert.equal(oldSessionWithoutQueue.session.eventQueue.maxSize, 64);\n",
    'assert legacy queue migration',
  );
  return source;
});

console.log('Event queue session patch applied.');

async function patch(path, transform) {
  const before = await readFile(path, 'utf8');
  const after = transform(before);
  if (after === before) throw new Error(`${path}: patch made no changes`);
  await writeFile(path, after);
}

function insertOnce(source, marker, replacement, label) {
  if (source.includes(replacement)) return source;
  return replaceOnce(source, marker, replacement, label);
}

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`${label}: expected source fragment not found`);
  if (source.indexOf(search, first + search.length) >= 0) throw new Error(`${label}: source fragment is not unique`);
  return `${source.slice(0, first)}${replacement}${source.slice(first + search.length)}`;
}
