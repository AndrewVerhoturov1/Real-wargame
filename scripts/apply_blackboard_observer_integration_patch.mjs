import { readFile, writeFile } from 'node:fs/promises';

await patch('src/core/ai/runtime/AiRuntimeSession.ts', (source) => {
  source = insertOnce(
    source,
    "import type { AiGraphRunnerBlackboard } from '../AiGraphRunner';\n",
    "import type { AiGraphRunnerBlackboard } from '../AiGraphRunner';\nimport {\n  cloneAiBlackboardObserverRegistry,\n  createAiBlackboardObserverRegistry,\n  normalizeAiBlackboardObserverRegistry,\n  type AiBlackboardObserverRegistrySnapshotV1,\n} from '../events/AiBlackboardObserver';\n",
    'import observer registry',
  );
  source = replaceOnce(
    source,
    "  readonly eventQueue: AiEventQueueSnapshotV1;\n  readonly lastTerminal?: AiRuntimeTerminalRecord;",
    "  readonly eventQueue: AiEventQueueSnapshotV1;\n  readonly observerRegistry: AiBlackboardObserverRegistrySnapshotV1;\n  readonly lastTerminal?: AiRuntimeTerminalRecord;",
    'add observer registry to session',
  );
  source = replaceOnce(
    source,
    "  readonly eventQueue?: AiEventQueueSnapshotV1;\n  readonly lastTerminal?: AiRuntimeTerminalRecord;",
    "  readonly eventQueue?: AiEventQueueSnapshotV1;\n  readonly observerRegistry?: AiBlackboardObserverRegistrySnapshotV1;\n  readonly lastTerminal?: AiRuntimeTerminalRecord;",
    'add observer registry to session input',
  );
  source = replaceOnce(
    source,
    "    eventQueue: input.eventQueue\n      ? cloneAiEventQueueSnapshot(input.eventQueue)\n      : createAiEventQueue(),\n    lastTerminal:",
    "    eventQueue: input.eventQueue\n      ? cloneAiEventQueueSnapshot(input.eventQueue)\n      : createAiEventQueue(),\n    observerRegistry: input.observerRegistry\n      ? cloneAiBlackboardObserverRegistry(input.observerRegistry)\n      : createAiBlackboardObserverRegistry(),\n    lastTerminal:",
    'create observer registry',
  );
  source = replaceOnce(
    source,
    "      eventQueue: normalizeAiEventQueueSnapshot(value.eventQueue),\n      lastTerminal:",
    "      eventQueue: normalizeAiEventQueueSnapshot(value.eventQueue),\n      observerRegistry: normalizeAiBlackboardObserverRegistry(value.observerRegistry),\n      lastTerminal:",
    'normalize observer registry',
  );
  source = replaceOnce(
    source,
    "    eventQueue: input.eventQueue,\n    lastTerminal:",
    "    eventQueue: input.eventQueue,\n    observerRegistry: input.observerRegistry,\n    lastTerminal:",
    'migrate observer registry',
  );
  source = replaceOnce(
    source,
    "    eventQueue: cloneAiEventQueueSnapshot(current.eventQueue),\n    lastTerminal:",
    "    eventQueue: cloneAiEventQueueSnapshot(current.eventQueue),\n    observerRegistry: cloneAiBlackboardObserverRegistry(current.observerRegistry),\n    lastTerminal:",
    'preserve observer registry across runtime results',
  );
  source = replaceOnce(
    source,
    "  options: { readonly keepMemory?: boolean; readonly keepCooldowns?: boolean; readonly keepEvents?: boolean } = {},",
    "  options: { readonly keepMemory?: boolean; readonly keepCooldowns?: boolean; readonly keepEvents?: boolean; readonly keepObservers?: boolean } = {},",
    'add keepObservers reset option',
  );
  source = replaceOnce(
    source,
    "    eventQueue: options.keepEvents ? current.eventQueue : createAiEventQueue(current.eventQueue.maxSize),\n  });",
    "    eventQueue: options.keepEvents ? current.eventQueue : createAiEventQueue(current.eventQueue.maxSize),\n    observerRegistry: options.keepObservers\n      ? current.observerRegistry\n      : createAiBlackboardObserverRegistry(),\n  });",
    'reset observer registry explicitly',
  );
  source = replaceOnce(
    source,
    "    eventQueue: cloneAiEventQueueSnapshot(value.eventQueue),\n    lastTerminal:",
    "    eventQueue: cloneAiEventQueueSnapshot(value.eventQueue),\n    observerRegistry: cloneAiBlackboardObserverRegistry(value.observerRegistry),\n    lastTerminal:",
    'clone observer registry',
  );
  return source;
});

await patch('src/core/ai/AiGameBridge.ts', (source) => {
  source = insertOnce(
    source,
    "import type { AiBlackboardValue } from './AiBlackboard';\n",
    "import type { AiBlackboardValue } from './AiBlackboard';\nimport {\n  evaluateAiBlackboardObservers,\n  listObservedBlackboardKeys,\n} from './events/AiBlackboardObserver';\nimport { pushAiEvent } from './events/AiEventQueue';\n",
    'import observer polling helpers',
  );
  source = replaceOnce(
    source,
    "  if (!unit) return null;\n  if (!options.force && (state.editor.enabled || isPaused(state))) return null;\n\n  const scaledInterval = AI_GRAPH_TICK_INTERVAL_MS / getAiTestTimeScale(state);\n  if (!options.force && nowMs - unit.behaviorRuntime.aiGraphLastTickMs < scaledInterval) return null;\n\n  const graph = readRuntimeGraph();",
    "  if (!unit) return null;\n  if (!options.force && (state.editor.enabled || isPaused(state))) return null;\n\n  const observerPoll = options.applyEffects\n    ? pollAiBlackboardObservers(state, unit)\n    : { events: 0, checks: 0 };\n  const scaledInterval = AI_GRAPH_TICK_INTERVAL_MS / getAiTestTimeScale(state);\n  const cadenceReady = nowMs - unit.behaviorRuntime.aiGraphLastTickMs >= scaledInterval;\n  if (!options.force && !cadenceReady && observerPoll.events === 0) return null;\n\n  const graph = readRuntimeGraph();",
    'poll observers before cadence gate',
  );
  source = replaceOnce(
    source,
    "  const simulationNowMs = options.applyEffects\n    ? session.simulationTimeMs + AI_GRAPH_TICK_INTERVAL_MS\n    : session.simulationTimeMs;",
    "  const observerWakeOnly = !options.force && !cadenceReady && observerPoll.events > 0;\n  const simulationNowMs = options.applyEffects && !observerWakeOnly\n    ? session.simulationTimeMs + AI_GRAPH_TICK_INTERVAL_MS\n    : session.simulationTimeMs;",
    'do not advance action time on observer-only wake',
  );
  source = replaceOnce(
    source,
    "export function buildBlackboardForUnit(\n",
    "export function pollAiBlackboardObservers(\n  state: SimulationState,\n  unit: UnitModel,\n): { readonly events: number; readonly checks: number } {\n  const session = unit.behaviorRuntime.aiRuntimeSession;\n  if (!session) return { events: 0, checks: 0 };\n  const keys = listObservedBlackboardKeys(session.observerRegistry);\n  if (keys.length === 0) return { events: 0, checks: 0 };\n  const compactBlackboard = buildObservedBlackboardForUnit(state, unit, keys, session.blackboardMemory);\n  const evaluated = evaluateAiBlackboardObservers(\n    session.observerRegistry,\n    compactBlackboard,\n    session.simulationTimeMs,\n  );\n  let queue = session.eventQueue;\n  for (const event of evaluated.events) queue = pushAiEvent(queue, event, session.simulationTimeMs).queue;\n  unit.behaviorRuntime.aiRuntimeSession = {\n    ...session,\n    eventQueue: queue,\n    observerRegistry: evaluated.registry,\n  };\n  return { events: evaluated.events.length, checks: evaluated.checks };\n}\n\nexport function buildObservedBlackboardForUnit(\n  state: SimulationState,\n  unit: UnitModel,\n  keys: readonly string[],\n  runtimeMemory: AiGraphRunnerBlackboard = readCurrentRuntimeMemory(unit),\n): AiGraphRunnerBlackboard {\n  const result: AiGraphRunnerBlackboard = {};\n  const command = unit.playerCommand;\n  for (const key of keys) {\n    const value = readCompactObservedValue(state, unit, command, runtimeMemory, key);\n    if (value !== undefined) result[key] = cloneObservedValue(value);\n  }\n  return result;\n}\n\nexport function buildBlackboardForUnit(\n",
    'add compact observer polling API',
  );
  source = replaceOnce(
    source,
    "function readCurrentRuntimeMemory(unit: UnitModel): AiGraphRunnerBlackboard {",
    "function readCompactObservedValue(\n  _state: SimulationState,\n  unit: UnitModel,\n  command: UnitModel['playerCommand'],\n  memory: AiGraphRunnerBlackboard,\n  key: string,\n): AiBlackboardValue | undefined {\n  switch (key) {\n    case 'danger': return clampPercent(unit.behaviorRuntime.danger);\n    case 'stress': return clampPercent(Math.round(unit.behaviorRuntime.stress));\n    case 'suppression': return clampPercent(unit.behaviorRuntime.suppression);\n    case 'fatigue': return clampPercent(Math.round(unit.soldier.condition.fatigue));\n    case 'morale': return clampPercent(Math.round(unit.soldier.condition.morale));\n    case 'health': return clampPercent(Math.round(unit.soldier.condition.health));\n    case 'ammo': return Math.max(0, Math.round(unit.behaviorRuntime.ammo));\n    case 'weaponReady': return unit.behaviorRuntime.weaponReady && unit.behaviorRuntime.ammo > 0;\n    case 'underFire': return unit.behaviorRuntime.danger > 0 || unit.behaviorRuntime.suppression > 0;\n    case 'hasOrder': return Boolean(unit.order);\n    case 'current_action': return unit.behaviorRuntime.currentAction;\n    case 'self_position': return { ...unit.position };\n    case 'order_target_position': return unit.order ? { ...unit.order.target } : null;\n    case 'player_command_active': return isPlayerCommandOutstanding(command);\n    case 'player_command_type': return command?.type ?? 'none';\n    case 'player_command_status': return command?.status ?? 'none';\n    case 'player_command_target_position': return command ? { ...command.target } : null;\n    case 'player_command_revision': return command?.revision ?? 0;\n    case 'active_move_source': return unit.order ? unit.order.source ?? (unit.order.ownerToken ? 'ai' : 'player') : null;\n    case 'active_move_owner_token': return unit.order?.ownerToken ?? null;\n    case 'active_move_target': return unit.order ? { ...unit.order.target } : null;\n    default: return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : undefined;\n  }\n}\n\nfunction cloneObservedValue(value: AiBlackboardValue): AiBlackboardValue {\n  return typeof value === 'object' && value !== null ? { ...value } : value;\n}\n\nfunction readCurrentRuntimeMemory(unit: UnitModel): AiGraphRunnerBlackboard {",
    'add compact observed value reader',
  );
  return source;
});

await patch('scripts/ai_runtime_session_smoke.ts', (source) => {
  source = insertOnce(
    source,
    "import { pushAiEvent } from '../src/core/ai/events/AiEventQueue';\n",
    "import { pushAiEvent } from '../src/core/ai/events/AiEventQueue';\nimport { registerAiBlackboardObserver } from '../src/core/ai/events/AiBlackboardObserver';\n",
    'import observer registration',
  );
  source = replaceOnce(
    source,
    "const queued = pushAiEvent(first.eventQueue, {",
    "const observerRegistration = registerAiBlackboardObserver(first.observerRegistry, {\n  observerId: 'danger-watch',\n  key: 'danger',\n  kind: 'key_changed',\n}, { danger: 10 });\nconst firstWithObserver = { ...first, observerRegistry: observerRegistration.registry };\nconst queued = pushAiEvent(firstWithObserver.eventQueue, {",
    'register observer in session smoke',
  );
  source = replaceOnce(
    source,
    "const sessionWithEvent = { ...first, eventQueue: queued.queue };",
    "const sessionWithEvent = { ...firstWithObserver, eventQueue: queued.queue };",
    'preserve observer session input',
  );
  source = replaceOnce(
    source,
    "assert.equal(updated.eventQueue.nextSequence, 1);\n",
    "assert.equal(updated.eventQueue.nextSequence, 1);\nassert.equal(updated.observerRegistry.observers['danger-watch']?.definition.key, 'danger');\n",
    'assert observer preserved',
  );
  source = replaceOnce(
    source,
    "assert.equal(oldSessionWithoutQueue.session.eventQueue.maxSize, 64);\n",
    "assert.equal(oldSessionWithoutQueue.session.eventQueue.maxSize, 64);\nassert.equal(Object.keys(oldSessionWithoutQueue.session.observerRegistry.observers).length, 0);\n",
    'assert observer legacy migration',
  );
  return source;
});

console.log('Blackboard observer session and bridge integration patch applied.');

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
