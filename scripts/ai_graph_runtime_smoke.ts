import assert from 'node:assert/strict';
import type { AiGraph } from '../src/core/ai/AiGraph';
import {
  runAiGraphRuntime,
  type AiGraphExecutionState,
  type AiGraphRuntimeResult,
} from '../src/core/ai/AiGraphRuntime';

const legacyGraph: AiGraph = {
  version: 1,
  id: 'legacy_graph',
  name: 'Legacy graph',
  nameRu: 'Старый граф',
  rootNodeId: 'root',
  blackboardDefaults: {},
  nodes: [
    { id: 'root', type: 'Root', children: ['action'] },
    {
      id: 'action',
      type: 'SetAction',
      displayName: 'Continue order',
      displayNameRu: 'Продолжить приказ',
      children: [],
      parameters: { action: 'continue_order' },
    },
  ],
};

const statefulGraph: AiGraph = {
  version: 1,
  id: 'stateful_graph',
  name: 'Stateful graph',
  nameRu: 'Состоянийный граф',
  rootNodeId: 'root',
  blackboardDefaults: {},
  nodes: [
    { id: 'root', type: 'Root', children: ['utility'] },
    { id: 'utility', type: 'UtilitySelector', children: ['take_cover'] },
    {
      id: 'take_cover',
      type: 'ActionBranch',
      displayName: 'Take cover',
      displayNameRu: 'Занять укрытие',
      children: ['sequence'],
    },
    {
      id: 'sequence',
      type: 'SequenceWithMemory',
      displayName: 'Cover sequence',
      displayNameRu: 'Последовательность занятия укрытия',
      children: ['crouch', 'wait', 'move'],
    },
    {
      id: 'crouch',
      type: 'SetPosture',
      displayName: 'Crouch',
      displayNameRu: 'Пригнуться',
      children: [],
      parameters: { posture: 'crouch' },
    },
    {
      id: 'wait',
      type: 'Wait',
      displayName: 'Check surroundings',
      displayNameRu: 'Осмотреться',
      children: [],
      parameters: { durationSeconds: 2, timeoutSeconds: 0 },
    },
    {
      id: 'move',
      type: 'SetAction',
      displayName: 'Move to cover',
      displayNameRu: 'Двигаться к укрытию',
      children: [],
      parameters: { action: 'move_to', targetKey: 'best_cover_position' },
    },
  ],
};

const baseInput = {
  unitId: 'soldier_1',
  blackboard: { best_cover_position: { x: 7, y: 4 } },
  cooldowns: {},
};

function effectTypes(result: AiGraphRuntimeResult): string[] {
  return result.effects.map((effect) => effect.type);
}

function lifecyclePhases(result: AiGraphRuntimeResult): string[] {
  return result.lifecycle.map((event) => event.phase);
}

function runLegacyCompatibility(): void {
  const result = runAiGraphRuntime({ ...baseInput, graph: legacyGraph, nowMs: 0 });
  assert.equal(result.status, 'success');
  assert.equal(result.ok, true);
  assert.equal(result.executionState, undefined);
  assert.deepEqual(effectTypes(result), ['set_action']);
}

function startWait(): AiGraphExecutionState {
  const result = runAiGraphRuntime({ ...baseInput, graph: statefulGraph, nowMs: 0 });
  assert.equal(result.status, 'waiting');
  assert.equal(result.ok, true);
  assert.equal(result.activeNodeId, 'wait');
  assert.equal(result.activeNodeName, 'Check surroundings');
  assert.equal(result.activeNodeNameRu, 'Осмотреться');
  assert.equal(result.elapsedMs, 0);
  assert.deepEqual(effectTypes(result), ['set_posture']);
  assert.deepEqual(lifecyclePhases(result), ['start']);
  assert.ok(result.executionState);
  assert.equal(result.executionState.childIndex, 1);
  assert.equal(result.executionState.activeNodeStartedAtMs, 0);
  return result.executionState;
}

function resumeWithoutRestart(state: AiGraphExecutionState): void {
  const result = runAiGraphRuntime({ ...baseInput, graph: statefulGraph, nowMs: 1000, executionState: state });
  assert.equal(result.status, 'waiting');
  assert.equal(result.activeNodeId, 'wait');
  assert.equal(result.elapsedMs, 1000);
  assert.deepEqual(effectTypes(result), []);
  assert.deepEqual(lifecyclePhases(result), ['update']);
  assert.ok(result.executionState);
  assert.equal(result.executionState.activeNodeStartedAtMs, 0);
  assert.equal(result.executionState.childIndex, 1);
}

function finishSequence(state: AiGraphExecutionState): void {
  const result = runAiGraphRuntime({ ...baseInput, graph: statefulGraph, nowMs: 2000, executionState: state });
  assert.equal(result.status, 'success');
  assert.equal(result.executionState, undefined);
  assert.deepEqual(effectTypes(result), ['set_action']);
  assert.deepEqual(lifecyclePhases(result), ['complete']);
  assert.equal(result.trace.some((item) => item.nodeId === 'wait' && item.status === 'complete'), true);
}

function cancelSequence(state: AiGraphExecutionState): void {
  const result = runAiGraphRuntime({
    ...baseInput,
    graph: statefulGraph,
    nowMs: 500,
    executionState: state,
    cancel: {
      reason: 'Commander issued a new order.',
      reasonRu: 'Командир отдал новый приказ.',
    },
  });
  assert.equal(result.status, 'cancelled');
  assert.equal(result.ok, false);
  assert.equal(result.executionState, undefined);
  assert.deepEqual(effectTypes(result), []);
  assert.deepEqual(lifecyclePhases(result), ['cancel']);
  assert.equal(result.cancellationReasonRu, 'Командир отдал новый приказ.');
  assert.equal(result.trace.some((item) => item.nodeId === 'wait' && item.status === 'cancelled'), true);
}

function rejectStaleState(state: AiGraphExecutionState): void {
  const changedGraph: AiGraph = {
    ...statefulGraph,
    nodes: statefulGraph.nodes.filter((node) => node.id !== 'wait'),
  };
  const result = runAiGraphRuntime({ ...baseInput, graph: changedGraph, nowMs: 700, executionState: state });
  assert.equal(result.status, 'failure');
  assert.equal(result.ok, false);
  assert.equal(result.executionState, undefined);
  assert.match(result.explanationRu ?? '', /состояни/i);
}

function failTimedOutWait(): void {
  const timeoutGraph: AiGraph = {
    ...statefulGraph,
    id: 'timeout_graph',
    nodes: statefulGraph.nodes.map((node) => node.id === 'wait'
      ? { ...node, parameters: { durationSeconds: 5, timeoutSeconds: 2 } }
      : node),
  };
  const started = runAiGraphRuntime({ ...baseInput, graph: timeoutGraph, nowMs: 0 });
  assert.equal(started.status, 'waiting');
  assert.ok(started.executionState);
  const timedOut = runAiGraphRuntime({ ...baseInput, graph: timeoutGraph, nowMs: 2000, executionState: started.executionState });
  assert.equal(timedOut.status, 'failure');
  assert.equal(timedOut.executionState, undefined);
  assert.match(timedOut.explanationRu ?? '', /тайм-аут/i);
}

runLegacyCompatibility();
const state = startWait();
resumeWithoutRestart(state);
finishSequence(state);
cancelSequence(state);
rejectStaleState(state);
failTimedOutWait();

console.log('AI graph runtime smoke passed: legacy, wait, resume, completion, cancellation, stale state, timeout.');
