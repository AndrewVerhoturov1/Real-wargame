import assert from 'node:assert/strict';
import type { AiGraphExecutionState, AiGraphRuntimeResult } from '../src/core/ai/AiGraphRuntime';
import { pushAiEvent } from '../src/core/ai/events/AiEventQueue';
import { registerAiBlackboardObserver } from '../src/core/ai/events/AiBlackboardObserver';
import {
  applyRuntimeResultToSession,
  createAiRuntimeSession,
  migrateLegacyAiRuntimeSession,
  normalizeAiRuntimeSession,
} from '../src/core/ai/runtime/AiRuntimeSession';

const executionState: AiGraphExecutionState = {
  version: 1,
  graphId: 'graph_a',
  unitId: 'soldier_a',
  branchNodeId: 'branch',
  sequenceNodeId: 'sequence',
  childIndex: 0,
  activeNodeId: 'move',
  activeNodeStartedAtMs: 600,
  lastUpdatedAtMs: 1200,
  status: 'running',
  activeData: {
    kind: 'move_to_blackboard_position',
    targetKey: 'best_cover_position',
    target: { x: 7, y: 4 },
    acceptanceRadiusCells: 0.2,
    timeoutMs: 15000,
    actionToken: 'soldier_a:move:600',
  },
};

const first = createAiRuntimeSession({
  graphId: 'graph_a',
  unitId: 'soldier_a',
  simulationTimeMs: 1200,
  executionState,
  blackboardMemory: { remembered_enemy_position: { x: 3, y: 2 } },
  cooldowns: { move: 2000 },
});
const second = createAiRuntimeSession({
  graphId: 'graph_a',
  unitId: 'soldier_a',
  simulationTimeMs: 1200,
  executionState,
  blackboardMemory: { remembered_enemy_position: { x: 3, y: 2 } },
  cooldowns: { move: 2000 },
});

first.blackboardMemory.remembered_enemy_position = { x: 99, y: 99 };
first.cooldowns.move = 9999;
if (first.executionState?.activeData?.kind === 'move_to_blackboard_position') {
  (first.executionState.activeData.target as { x: number; y: number }).x = 88;
}
assert.deepEqual(second.blackboardMemory.remembered_enemy_position, { x: 3, y: 2 });
assert.equal(second.cooldowns.move, 2000);
assert.deepEqual(second.executionState?.activeData?.kind === 'move_to_blackboard_position'
  ? second.executionState.activeData.target
  : null, { x: 7, y: 4 });

const invalid = normalizeAiRuntimeSession(
  { version: 99, graphId: 'graph_a', unitId: 'soldier_a' },
  { graphId: 'graph_a', unitId: 'soldier_a' },
);
assert.equal(invalid.session.status, 'idle');
assert.match(invalid.resetReasonRu ?? '', /верс/i);

const migrated = migrateLegacyAiRuntimeSession({
  graphId: 'graph_a',
  unitId: 'soldier_a',
  aiGraphSimulationTimeMs: 1200,
  aiGraphExecutionState: executionState,
  aiGraphMemory: { best_cover_position: { x: 7, y: 4 } },
  aiNodeCooldowns: { move: 2000 },
});
assert.equal(migrated.status, 'active');
assert.equal(migrated.simulationTimeMs, 1200);
assert.equal(migrated.executionState?.activeNodeId, 'move');
assert.deepEqual(migrated.blackboardMemory.best_cover_position, { x: 7, y: 4 });

const observerRegistration = registerAiBlackboardObserver(first.observerRegistry, {
  observerId: 'danger-watch',
  key: 'danger',
  kind: 'key_changed',
}, { danger: 10 });
const firstWithObserver = { ...first, observerRegistry: observerRegistration.registry };
const queued = pushAiEvent(firstWithObserver.eventQueue, {
  id: 'order-1',
  type: 'order_received',
  timestampMs: 1300,
  priority: 100,
  payload: { orderId: 'order-1' },
});
const sessionWithEvent = { ...firstWithObserver, eventQueue: queued.queue };
const activeResult = runtimeResult('running', executionState);
const updated = applyRuntimeResultToSession(sessionWithEvent, activeResult, 1800);
assert.equal(updated.status, 'active');
assert.equal(updated.simulationTimeMs, 1800);
assert.equal(updated.executionState?.lastUpdatedAtMs, 1200);
assert.equal(updated.eventQueue.events[0]?.type, 'order_received');
assert.equal(updated.eventQueue.nextSequence, 1);
assert.equal(updated.observerRegistry.observers['danger-watch']?.definition.key, 'danger');

const terminalResult = runtimeResult('cancelled');
const terminal = applyRuntimeResultToSession(updated, terminalResult, 1800);
assert.equal(terminal.status, 'terminal');
assert.equal(terminal.executionState, undefined);
assert.equal(terminal.lastTerminal?.status, 'cancelled');
assert.match(terminal.lastTerminal?.reasonRu ?? '', /отмен/i);
assert.equal(terminal.eventQueue.events.length, 1);

const oldSessionWithoutQueue = normalizeAiRuntimeSession({
  version: 1,
  graphId: 'graph_a',
  unitId: 'soldier_a',
  simulationTimeMs: 0,
  status: 'idle',
  blackboardMemory: {},
  cooldowns: {},
}, { graphId: 'graph_a', unitId: 'soldier_a' });
assert.equal(oldSessionWithoutQueue.session.eventQueue.events.length, 0);
assert.equal(oldSessionWithoutQueue.session.eventQueue.maxSize, 64);
assert.equal(Object.keys(oldSessionWithoutQueue.session.observerRegistry.observers).length, 0);

console.log('AI runtime session smoke passed: isolation, invalid-version reset, legacy migration and active/terminal transitions.');

function runtimeResult(
  status: AiGraphRuntimeResult['status'],
  nextExecutionState?: AiGraphExecutionState,
): AiGraphRuntimeResult {
  return {
    ok: status === 'success' || status === 'running' || status === 'waiting',
    status,
    unitId: 'soldier_a',
    graphId: 'graph_a',
    selectedBranchNodeId: 'branch',
    selectedBranchName: 'Branch',
    selectedBranchNameRu: 'Ветка',
    scores: [],
    effects: [],
    blackboard: {},
    cooldowns: { move: 2400 },
    trace: [],
    explanation: status === 'cancelled' ? 'Runtime cancelled.' : 'Runtime active.',
    explanationRu: status === 'cancelled' ? 'Runtime отменён.' : 'Runtime активен.',
    lifecycle: [],
    executionState: nextExecutionState,
  };
}
