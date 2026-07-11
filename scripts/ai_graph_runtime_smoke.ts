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

const moveGraph: AiGraph = {
  version: 1,
  id: 'stateful_move_graph',
  name: 'Stateful move graph',
  nameRu: 'Граф длительного движения',
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
      displayName: 'Move sequence',
      displayNameRu: 'Последовательность движения',
      children: ['crouch', 'move', 'prone'],
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
      id: 'move',
      type: 'MoveToBlackboardPosition',
      displayName: 'Move to cover',
      displayNameRu: 'Двигаться к укрытию',
      children: [],
      parameters: {
        targetKey: 'best_cover_position',
        acceptanceRadiusCells: 0.2,
        timeoutSeconds: 15,
      },
    },
    {
      id: 'prone',
      type: 'SetPosture',
      displayName: 'Go prone',
      displayNameRu: 'Лечь',
      children: [],
      parameters: { posture: 'prone' },
    },
  ],
};

const baseInput = {
  unitId: 'soldier_1',
  blackboard: { best_cover_position: { x: 7, y: 4 } },
  cooldowns: {},
};

const moveBaseInput = {
  unitId: 'soldier_1',
  blackboard: {
    best_cover_position: { x: 7, y: 4 },
    self_position: { x: 1, y: 1 },
    active_move_source: null,
    active_move_owner_token: null,
    active_move_target: null,
  },
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

function startMove(): { state: AiGraphExecutionState; actionToken: string } {
  const result = runAiGraphRuntime({ ...moveBaseInput, graph: moveGraph, nowMs: 0 });
  assert.equal(result.status, 'running');
  assert.equal(result.ok, true);
  assert.equal(result.activeNodeId, 'move');
  assert.equal(result.activeNodeNameRu, 'Двигаться к укрытию');
  assert.equal((result as AiGraphRuntimeResult & { targetKey?: string }).targetKey, 'best_cover_position');
  assert.deepEqual((result as AiGraphRuntimeResult & { targetPosition?: unknown }).targetPosition, { x: 7, y: 4 });
  assert.equal(Math.round((result as AiGraphRuntimeResult & { distanceRemainingCells?: number }).distanceRemainingCells ?? -1), 7);
  assert.deepEqual(effectTypes(result), ['set_posture', 'begin_move']);
  assert.deepEqual(lifecyclePhases(result), ['start']);
  assert.ok(result.executionState);
  const activeData = (result.executionState as AiGraphExecutionState & {
    activeData?: { kind?: string; actionToken?: string; targetKey?: string; target?: unknown };
  }).activeData;
  assert.equal(activeData?.kind, 'move_to_blackboard_position');
  assert.equal(activeData?.targetKey, 'best_cover_position');
  assert.deepEqual(activeData?.target, { x: 7, y: 4 });
  assert.ok(activeData?.actionToken);
  return { state: result.executionState, actionToken: String(activeData?.actionToken) };
}

function resumeMoveWithoutDuplicateCommand(state: AiGraphExecutionState, actionToken: string): void {
  const result = runAiGraphRuntime({
    ...moveBaseInput,
    graph: moveGraph,
    nowMs: 600,
    executionState: state,
    blackboard: {
      ...moveBaseInput.blackboard,
      self_position: { x: 2, y: 1.5 },
      active_move_source: 'ai',
      active_move_owner_token: actionToken,
      active_move_target: { x: 7, y: 4 },
    },
  });
  assert.equal(result.status, 'running');
  assert.equal(result.activeNodeId, 'move');
  assert.equal(result.elapsedMs, 600);
  assert.deepEqual(effectTypes(result), []);
  assert.deepEqual(lifecyclePhases(result), ['update']);
}

function completeMoveAndContinue(state: AiGraphExecutionState, actionToken: string): void {
  const result = runAiGraphRuntime({
    ...moveBaseInput,
    graph: moveGraph,
    nowMs: 1200,
    executionState: state,
    blackboard: {
      ...moveBaseInput.blackboard,
      self_position: { x: 6.9, y: 4 },
      active_move_source: 'ai',
      active_move_owner_token: actionToken,
      active_move_target: { x: 7, y: 4 },
    },
  });
  assert.equal(result.status, 'success');
  assert.equal(result.executionState, undefined);
  assert.deepEqual(effectTypes(result), ['clear_move', 'set_posture']);
  assert.deepEqual(lifecyclePhases(result), ['complete']);
  assert.equal(result.trace.some((item) => item.nodeId === 'move' && item.status === 'complete'), true);
}

function cancelMoveSafely(state: AiGraphExecutionState): void {
  const result = runAiGraphRuntime({
    ...moveBaseInput,
    graph: moveGraph,
    nowMs: 300,
    executionState: state,
    cancel: { reason: 'New commander order.', reasonRu: 'Получен новый приказ командира.' },
  });
  assert.equal(result.status, 'cancelled');
  assert.deepEqual(effectTypes(result), ['clear_move']);
  assert.deepEqual(lifecyclePhases(result), ['cancel']);
}

function cancelWhenPlayerReplacedOrder(state: AiGraphExecutionState): void {
  const result = runAiGraphRuntime({
    ...moveBaseInput,
    graph: moveGraph,
    nowMs: 600,
    executionState: state,
    blackboard: {
      ...moveBaseInput.blackboard,
      active_move_source: 'player',
      active_move_owner_token: null,
      active_move_target: { x: 12, y: 8 },
    },
  });
  assert.equal(result.status, 'cancelled');
  assert.match(result.explanationRu ?? '', /приказ игрока/i);
  assert.deepEqual(effectTypes(result), ['clear_move']);
}

function failMoveWithoutTarget(): void {
  const result = runAiGraphRuntime({
    ...moveBaseInput,
    graph: moveGraph,
    nowMs: 0,
    blackboard: { ...moveBaseInput.blackboard, best_cover_position: null },
  });
  assert.equal(result.status, 'failure');
  assert.deepEqual(effectTypes(result), ['set_posture']);
  assert.match(result.explanationRu ?? '', /цель/i);
}

function failTimedOutMove(): void {
  const timeoutGraph: AiGraph = {
    ...moveGraph,
    id: 'stateful_move_timeout_graph',
    nodes: moveGraph.nodes.map((node) => node.id === 'move'
      ? { ...node, parameters: { ...node.parameters, timeoutSeconds: 1 } }
      : node),
  };
  const started = runAiGraphRuntime({ ...moveBaseInput, graph: timeoutGraph, nowMs: 0 });
  assert.equal(started.status, 'running');
  assert.ok(started.executionState);
  const activeData = (started.executionState as AiGraphExecutionState & { activeData?: { actionToken?: string } }).activeData;
  const timedOut = runAiGraphRuntime({
    ...moveBaseInput,
    graph: timeoutGraph,
    nowMs: 1000,
    executionState: started.executionState,
    blackboard: {
      ...moveBaseInput.blackboard,
      active_move_source: 'ai',
      active_move_owner_token: activeData?.actionToken ?? null,
    },
  });
  assert.equal(timedOut.status, 'failure');
  assert.deepEqual(effectTypes(timedOut), ['clear_move']);
  assert.match(timedOut.explanationRu ?? '', /тайм-аут/i);
}

runLegacyCompatibility();
const waitState = startWait();
resumeWithoutRestart(waitState);
finishSequence(waitState);
cancelSequence(waitState);
rejectStaleState(waitState);
failTimedOutWait();
const move = startMove();
resumeMoveWithoutDuplicateCommand(move.state, move.actionToken);
completeMoveAndContinue(move.state, move.actionToken);
cancelMoveSafely(move.state);
cancelWhenPlayerReplacedOrder(move.state);
failMoveWithoutTarget();
failTimedOutMove();

console.log('AI graph runtime smoke passed: legacy, wait, movement start/update/completion/cancellation/replacement/timeout.');
