import { distance, type GridPosition } from '../geometry';
import type { AiGraph, AiNode, AiNodeId } from './AiGraph';
import {
  runAiGraph,
  type AiGraphEffect,
  type AiGraphRunnerBlackboard,
  type AiGraphRunnerInput,
  type AiGraphRunnerResult,
  type AiGraphTraceItem,
} from './AiGraphRunner';
import {
  runAiCompositeGraphRuntime,
  shouldUseCompositeGraphRuntime,
} from './runtime/AiCompositeGraphRuntime';
import type { AiCompositeFrame } from './runtime/AiCompositeRuntime';
import type { AiEvent } from './events/AiEvent';
import type { AiBlackboardObserverDefinition } from './events/AiBlackboardObserver';
import type { AiReactiveAbortTrace } from './events/AiReactiveRuntime';
import { DEFAULT_AI_ACTION_REGISTRY } from './runtime/AiDefaultActionRegistry';
import {
  runAiActionLifecycle,
  type AiActionRuntimeContext,
  type AiActionTickResult,
  type AiNodeLifecycle,
} from './runtime/AiNodeLifecycle';
import {
  isMoveToBlackboardPositionActionState,
  type MoveToBlackboardPositionActionState,
} from './runtime/actions/MoveToBlackboardPositionAction';
import {
  isReloadActionState,
  type ReloadActionState,
} from './runtime/actions/ReloadAction';
import {
  createLegacyWaitActionState,
  type WaitActionState,
} from './runtime/actions/WaitAction';

export type AiGraphExecutionStatus = 'success' | 'failure' | 'running' | 'waiting' | 'cancelled';
export type AiGraphLifecyclePhase = 'start' | 'update' | 'complete' | 'cancel';
export type AiGraphRuntimeTraceStatus = AiGraphTraceItem['status'] | 'running' | 'waiting' | 'complete' | 'cancelled';

export type AiGraphMoveExecutionData = MoveToBlackboardPositionActionState;
export type AiGraphExecutionData = AiGraphMoveExecutionData | ReloadActionState;

export interface AiGraphExecutionState {
  readonly version: 1;
  readonly graphId: string;
  readonly unitId: string;
  readonly branchNodeId: AiNodeId;
  readonly sequenceNodeId: AiNodeId;
  readonly childIndex: number;
  readonly activeNodeId: AiNodeId;
  readonly activeNodeStartedAtMs: number;
  readonly lastUpdatedAtMs: number;
  readonly status: 'running' | 'waiting';
  readonly activeData?: AiGraphExecutionData;
  readonly frames?: readonly AiCompositeFrame[];
}

export interface AiGraphLifecycleEvent {
  readonly phase: AiGraphLifecyclePhase;
  readonly nodeId: AiNodeId;
  readonly nodeType: string;
  readonly atMs: number;
  readonly reason: string;
  readonly reasonRu?: string;
}

export interface AiGraphCancellationRequest {
  readonly reason: string;
  readonly reasonRu?: string;
}

export interface AiGraphRuntimeTraceItem extends Omit<AiGraphTraceItem, 'status'> {
  readonly status: AiGraphRuntimeTraceStatus;
}

export interface AiGraphRuntimeInput extends AiGraphRunnerInput {
  readonly executionState?: AiGraphExecutionState;
  readonly cancel?: AiGraphCancellationRequest;
  readonly events?: readonly AiEvent[];
}

export type AiGraphRuntimeResult = Omit<AiGraphRunnerResult, 'trace'> & {
  readonly status: AiGraphExecutionStatus;
  readonly trace: readonly AiGraphRuntimeTraceItem[];
  readonly executionState?: AiGraphExecutionState;
  readonly activeNodeId?: AiNodeId;
  readonly activeNodeName?: string;
  readonly activeNodeNameRu?: string;
  readonly elapsedMs?: number;
  readonly lifecycle: readonly AiGraphLifecycleEvent[];
  readonly cancellationReason?: string;
  readonly cancellationReasonRu?: string;
  readonly targetKey?: string;
  readonly targetPosition?: GridPosition;
  readonly distanceRemainingCells?: number;
  readonly actionToken?: string;
  readonly consumedEventIds?: readonly string[];
  readonly reactiveAbort?: AiReactiveAbortTrace;
  readonly reactiveObserverDefinitions?: readonly AiBlackboardObserverDefinition[];
};

export interface AiGraphRuntimeBeginMoveEffect {
  readonly type: 'begin_move';
  readonly ownerToken: string;
  readonly targetPosition: GridPosition;
  readonly targetKey: string;
  readonly reason: string;
  readonly reasonRu?: string;
}

export interface AiGraphRuntimeClearMoveEffect {
  readonly type: 'clear_move';
  readonly ownerToken: string;
  readonly reason: string;
  readonly reasonRu?: string;
}

export type AiGraphRuntimeMoveEffect = AiGraphRuntimeBeginMoveEffect | AiGraphRuntimeClearMoveEffect;

interface RuntimeAccumulator {
  blackboard: AiGraphRunnerBlackboard;
  cooldowns: Record<string, number>;
  effects: AiGraphEffect[];
  trace: AiGraphRuntimeTraceItem[];
  scores: AiGraphRunnerResult['scores'];
}

interface StateValidation {
  readonly valid: boolean;
  readonly branch?: AiNode;
  readonly sequence?: AiNode;
  readonly activeNode?: AiNode;
  readonly reason?: string;
  readonly reasonRu?: string;
}

interface RuntimeDetails {
  readonly executionState?: AiGraphExecutionState;
  readonly activeNode?: AiNode;
  readonly elapsedMs?: number;
  readonly cancellationReason?: string;
  readonly cancellationReasonRu?: string;
  readonly targetKey?: string;
  readonly targetPosition?: GridPosition;
  readonly distanceRemainingCells?: number;
  readonly actionToken?: string;
}

export function readAiGraphRuntimeMoveEffect(effect: AiGraphEffect): AiGraphRuntimeMoveEffect | null {
  const candidate = effect as unknown as Partial<AiGraphRuntimeMoveEffect>;
  if (candidate.type === 'begin_move'
    && typeof candidate.ownerToken === 'string'
    && isGridPosition(candidate.targetPosition)
    && typeof candidate.targetKey === 'string') {
    return {
      type: 'begin_move',
      ownerToken: candidate.ownerToken,
      targetPosition: { ...candidate.targetPosition },
      targetKey: candidate.targetKey,
      reason: typeof candidate.reason === 'string' ? candidate.reason : 'AI movement started.',
      reasonRu: typeof candidate.reasonRu === 'string' ? candidate.reasonRu : undefined,
    };
  }
  if (candidate.type === 'clear_move' && typeof candidate.ownerToken === 'string') {
    return {
      type: 'clear_move',
      ownerToken: candidate.ownerToken,
      reason: typeof candidate.reason === 'string' ? candidate.reason : 'AI movement cleared.',
      reasonRu: typeof candidate.reasonRu === 'string' ? candidate.reasonRu : undefined,
    };
  }
  return null;
}

export function runAiGraphRuntime(input: AiGraphRuntimeInput): AiGraphRuntimeResult {
  if (shouldUseCompositeGraphRuntime(input.graph, input.executionState)) {
    return runAiCompositeGraphRuntime(input);
  }
  const nodes = new Map(input.graph.nodes.map((node) => [node.id, node]));

  if (input.executionState) {
    const validation = validateState(input, nodes);
    if (!validation.valid || !validation.branch || !validation.sequence || !validation.activeNode) {
      const reason = validation.reason ?? 'Saved AI execution state is invalid.';
      const reasonRu = validation.reasonRu ?? 'Сохранённое состояние выполнения ИИ недействительно.';
      return standalone(
        input,
        'failure',
        input.executionState.branchNodeId,
        validation.branch,
        reason,
        reasonRu,
        [{
          nodeId: input.executionState.activeNodeId,
          nodeType: validation.activeNode ? String(validation.activeNode.type) : 'unknown',
          status: 'fail',
          reason,
          reasonRu,
        }],
        [],
        {
          effects: cleanupInvalidState(input, validation.activeNode, reason, reasonRu),
          details: actionDetailsFromState(input.executionState, input.blackboard),
        },
      );
    }
    if (input.cancel) return cancelActiveAction(input, validation.branch, validation.activeNode);
    return executeSequence(input, validation.branch, validation.sequence, input.executionState.childIndex, input.executionState);
  }

  const selection = runAiGraph({
    graph: planningGraph(input.graph),
    unitId: input.unitId,
    blackboard: input.blackboard,
    cooldowns: input.cooldowns,
    nowMs: input.nowMs,
    tacticalHost: input.tacticalHost,
  });
  if (!selection.ok) return wrapInstant(selection, 'failure');

  const branch = nodes.get(selection.selectedBranchNodeId);
  if (!branch) {
    return standalone(
      input,
      'failure',
      selection.selectedBranchNodeId,
      undefined,
      'Selected AI branch is missing from the source graph.',
      'Выбранная ветка ИИ отсутствует в исходном графе.',
      runtimeTrace(selection.trace),
    );
  }

  const sequence = findSequence(nodes, branch.id);
  return sequence ? executeSequence(input, branch, sequence, 0, undefined, selection) : wrapInstant(selection, 'success');
}

function executeSequence(
  input: AiGraphRuntimeInput,
  branch: AiNode,
  sequence: AiNode,
  startIndex: number,
  previousState?: AiGraphExecutionState,
  selection?: AiGraphRunnerResult,
): AiGraphRuntimeResult {
  const nodes = new Map(input.graph.nodes.map((node) => [node.id, node]));
  const accumulator: RuntimeAccumulator = {
    blackboard: cloneBlackboard(selection?.blackboard ?? input.blackboard),
    cooldowns: { ...(selection?.cooldowns ?? input.cooldowns ?? {}) },
    effects: [...(selection?.effects ?? [])],
    trace: runtimeTrace(selection?.trace ?? []),
    scores: selection?.scores ?? [],
  };
  const lifecycle: AiGraphLifecycleEvent[] = [];
  const children = sequence.children ?? [];

  for (let index = startIndex; index < children.length; index += 1) {
    const childId = children[index];
    const child = nodes.get(childId);
    if (!child) {
      return sequenceFailure(
        input,
        branch,
        accumulator,
        lifecycle,
        childId,
        'unknown',
        `Sequence ${sequence.id} references missing child ${childId}.`,
        `Последовательность ${sequence.id} ссылается на отсутствующую ноду ${childId}.`,
      );
    }
    if (child.type === 'SequenceWithMemory') {
      return sequenceFailure(
        input,
        branch,
        accumulator,
        lifecycle,
        child.id,
        String(child.type),
        'Nested stateful sequences are not supported in runtime v1.',
        'Вложенные последовательности с памятью пока не поддерживаются в runtime v1.',
      );
    }

    const actionLifecycle = DEFAULT_AI_ACTION_REGISTRY.get(String(child.type));
    if (actionLifecycle) {
      const actionResult = executeRegisteredAction(
        input,
        branch,
        sequence,
        child,
        index,
        accumulator,
        lifecycle,
        actionLifecycle,
        previousState,
      );
      if (actionResult) return actionResult;
      previousState = undefined;
      continue;
    }

    if (containsStatefulDescendant(nodes, child.id)) {
      return sequenceFailure(
        input,
        branch,
        accumulator,
        lifecycle,
        child.id,
        String(child.type),
        'A stateful node must be a direct child of SequenceWithMemory in runtime v1.',
        'В runtime v1 состоянийная нода должна быть прямым ребёнком «Последовательности с памятью».',
      );
    }

    const instant = runAiGraph({
      graph: subgraph(input.graph, child.id, nodes),
      unitId: input.unitId,
      blackboard: accumulator.blackboard,
      cooldowns: accumulator.cooldowns,
      nowMs: input.nowMs,
      tacticalHost: input.tacticalHost,
    });
    accumulator.blackboard = cloneBlackboard(instant.blackboard);
    accumulator.cooldowns = { ...instant.cooldowns };
    accumulator.effects.push(...instant.effects);
    accumulator.trace.push(...runtimeTrace(instant.trace));
    accumulator.scores = [...accumulator.scores, ...instant.scores];
    if (!instant.ok) {
      return result(
        input,
        branch,
        accumulator,
        lifecycle,
        'failure',
        `Sequence ${sequence.id} failed at ${nodeName(child)}.`,
        `Последовательность ${sequence.id} провалилась на ноде «${nodeNameRu(child)}».`,
      );
    }
  }

  return result(
    input,
    branch,
    accumulator,
    lifecycle,
    'success',
    `Stateful sequence ${sequence.id} completed.`,
    `Последовательность с памятью ${sequence.id} завершена.`,
  );
}

function executeRegisteredAction(
  input: AiGraphRuntimeInput,
  branch: AiNode,
  sequence: AiNode,
  child: AiNode,
  index: number,
  accumulator: RuntimeAccumulator,
  lifecycle: AiGraphLifecycleEvent[],
  actionLifecycle: AiNodeLifecycle<unknown>,
  previousState?: AiGraphExecutionState,
): AiGraphRuntimeResult | null {
  const resumableState = previousState
    && previousState.sequenceNodeId === sequence.id
    && previousState.childIndex === index
    && previousState.activeNodeId === child.id
    ? previousState
    : undefined;
  const startedAtMs = resumableState?.activeNodeStartedAtMs ?? input.nowMs;
  const actionState = resumableState
    ? resolveActionState(child, resumableState)
    : undefined;
  if (resumableState && actionState === undefined) {
    const reason = `Saved state for action ${child.id} is invalid.`;
    const reasonRu = `Сохранённое состояние действия «${nodeNameRu(child)}» недействительно.`;
    accumulator.trace.push(traceItem(child, 'fail', reason, reasonRu));
    return result(input, branch, accumulator, lifecycle, 'failure', reason, reasonRu);
  }

  const context: AiActionRuntimeContext = {
    node: child,
    unitId: input.unitId,
    nowMs: input.nowMs,
    startedAtMs,
    blackboard: accumulator.blackboard,
  };
  const tick = runAiActionLifecycle({
    lifecycle: actionLifecycle,
    context,
    phase: resumableState ? 'update' : 'start',
    state: actionState,
  });
  accumulator.effects.push(...(tick.effects ?? []));
  const phase: AiGraphLifecyclePhase = resumableState ? 'update' : 'start';
  const elapsedMs = Math.max(0, input.nowMs - startedAtMs);
  const details = runtimeDetailsFromTick(tick, child, elapsedMs);

  if (tick.status === 'running' || tick.status === 'waiting') {
    lifecycle.push(lifecycleEvent(phase, child, input.nowMs, tick.reason, tick.reasonRu));
    accumulator.trace.push(traceItem(child, tick.status, tick.reason, tick.reasonRu));
    return result(
      input,
      branch,
      accumulator,
      lifecycle,
      tick.status,
      tick.status === 'waiting'
        ? `AI sequence ${sequence.id} is waiting at ${nodeName(child)}.`
        : `AI sequence ${sequence.id} is running at ${nodeName(child)}.`,
      tick.status === 'waiting'
        ? `Последовательность ИИ ${sequence.id} ожидает на ноде «${nodeNameRu(child)}».`
        : `Последовательность ИИ ${sequence.id} выполняет ноду «${nodeNameRu(child)}».`,
      {
        ...details,
        executionState: {
          version: 1,
          graphId: input.graph.id,
          unitId: input.unitId,
          branchNodeId: branch.id,
          sequenceNodeId: sequence.id,
          childIndex: index,
          activeNodeId: child.id,
          activeNodeStartedAtMs: startedAtMs,
          lastUpdatedAtMs: input.nowMs,
          status: tick.status,
          activeData: toExecutionData(tick.state),
        },
      },
    );
  }

  if (tick.status === 'success') {
    lifecycle.push(lifecycleEvent('complete', child, input.nowMs, tick.reason, tick.reasonRu));
    accumulator.trace.push(traceItem(child, 'complete', tick.reason, tick.reasonRu));
    return null;
  }

  if (tick.status === 'cancelled') {
    lifecycle.push(lifecycleEvent('cancel', child, input.nowMs, tick.reason, tick.reasonRu));
    accumulator.trace.push(traceItem(child, 'cancelled', tick.reason, tick.reasonRu));
    return result(input, branch, accumulator, lifecycle, 'cancelled', tick.reason, tick.reasonRu ?? tick.reason, {
      ...details,
      cancellationReason: tick.reason,
      cancellationReasonRu: tick.reasonRu,
    });
  }

  lifecycle.push(lifecycleEvent('complete', child, input.nowMs, tick.reason, tick.reasonRu));
  accumulator.trace.push(traceItem(child, 'fail', tick.reason, tick.reasonRu));
  return result(input, branch, accumulator, lifecycle, 'failure', tick.reason, tick.reasonRu ?? tick.reason, details);
}

function cancelActiveAction(
  input: AiGraphRuntimeInput,
  branch: AiNode,
  activeNode: AiNode,
): AiGraphRuntimeResult {
  const state = input.executionState;
  const lifecycle = DEFAULT_AI_ACTION_REGISTRY.get(String(activeNode.type));
  const reason = input.cancel?.reason ?? 'AI action cancelled.';
  const reasonRu = input.cancel?.reasonRu ?? 'Действие ИИ отменено.';
  if (!state || !lifecycle) {
    return standalone(
      input,
      'cancelled',
      branch.id,
      branch,
      reason,
      reasonRu,
      [traceItem(activeNode, 'cancelled', reason, reasonRu)],
      [lifecycleEvent('cancel', activeNode, input.nowMs, reason, reasonRu)],
      { details: { cancellationReason: reason, cancellationReasonRu: reasonRu } },
    );
  }

  const actionState = resolveActionState(activeNode, state);
  if (actionState === undefined) {
    return standalone(
      input,
      'failure',
      branch.id,
      branch,
      'Saved action state is invalid during cancellation.',
      'Сохранённое состояние действия недействительно при отмене.',
      [traceItem(activeNode, 'fail', reason, reasonRu)],
    );
  }
  const context: AiActionRuntimeContext = {
    node: activeNode,
    unitId: input.unitId,
    nowMs: input.nowMs,
    startedAtMs: state.activeNodeStartedAtMs,
    blackboard: input.blackboard,
  };
  const tick = runAiActionLifecycle({
    lifecycle,
    context,
    phase: 'cancel',
    state: actionState,
    cancellation: { reason, reasonRu },
  });
  const terminalStatus: AiGraphExecutionStatus = tick.status === 'failure' ? 'failure' : 'cancelled';
  const traceStatus: AiGraphRuntimeTraceStatus = tick.status === 'failure' ? 'fail' : 'cancelled';
  const lifecyclePhase: AiGraphLifecyclePhase = tick.status === 'failure' ? 'complete' : 'cancel';
  return standalone(
    input,
    terminalStatus,
    branch.id,
    branch,
    tick.reason,
    tick.reasonRu ?? reasonRu,
    [traceItem(activeNode, traceStatus, tick.reason, tick.reasonRu)],
    [lifecycleEvent(lifecyclePhase, activeNode, input.nowMs, tick.reason, tick.reasonRu)],
    {
      effects: tick.effects,
      details: {
        ...runtimeDetailsFromTick(tick, activeNode, Math.max(0, input.nowMs - state.activeNodeStartedAtMs)),
        cancellationReason: terminalStatus === 'cancelled' ? tick.reason : undefined,
        cancellationReasonRu: terminalStatus === 'cancelled' ? tick.reasonRu : undefined,
      },
    },
  );
}

function cleanupInvalidState(
  input: AiGraphRuntimeInput,
  activeNode: AiNode | undefined,
  reason: string,
  reasonRu: string,
): readonly AiGraphEffect[] {
  const state = input.executionState;
  if (!state || !activeNode) return fallbackCleanupEffects(state, reason, reasonRu);
  const lifecycle = DEFAULT_AI_ACTION_REGISTRY.get(String(activeNode.type));
  const actionState = resolveActionState(activeNode, state);
  if (!lifecycle || actionState === undefined) return fallbackCleanupEffects(state, reason, reasonRu);
  try {
    const context: AiActionRuntimeContext = {
      node: activeNode,
      unitId: input.unitId,
      nowMs: input.nowMs,
      startedAtMs: state.activeNodeStartedAtMs,
      blackboard: input.blackboard,
    };
    return lifecycle.cleanup(context, actionState, 'failure');
  } catch {
    return fallbackCleanupEffects(state, reason, reasonRu);
  }
}

function resolveActionState(node: AiNode, state: AiGraphExecutionState): unknown | undefined {
  if (node.type === 'Wait') return createLegacyWaitActionState(node.parameters);
  if (node.type === 'MoveToBlackboardPosition' && isMoveToBlackboardPositionActionState(state.activeData)) {
    return state.activeData;
  }
  if (node.type === 'Reload' && isReloadActionState(state.activeData)) return state.activeData;
  return state.activeData;
}

function toExecutionData(value: unknown): AiGraphExecutionData | undefined {
  if (isMoveToBlackboardPositionActionState(value)) return cloneMoveData(value);
  if (isReloadActionState(value)) return { ...value };
  return undefined;
}

function runtimeDetailsFromTick(
  tick: AiActionTickResult<unknown>,
  activeNode: AiNode,
  elapsedMs: number,
): RuntimeDetails {
  const details = tick.details ?? {};
  return {
    activeNode,
    elapsedMs,
    targetKey: typeof details.targetKey === 'string' ? details.targetKey : undefined,
    targetPosition: isGridPosition(details.targetPosition) ? { ...details.targetPosition } : undefined,
    distanceRemainingCells: isFiniteNumber(details.distanceRemainingCells)
      ? details.distanceRemainingCells
      : undefined,
    actionToken: typeof details.actionToken === 'string' ? details.actionToken : undefined,
  };
}

function actionDetailsFromState(
  state: AiGraphExecutionState | undefined,
  blackboard: AiGraphRunnerBlackboard,
): RuntimeDetails {
  if (!state || !isMoveToBlackboardPositionActionState(state.activeData)) return {};
  const selfPosition = readPosition(blackboard.self_position);
  return {
    targetKey: state.activeData.targetKey,
    targetPosition: { ...state.activeData.target },
    distanceRemainingCells: selfPosition ? distance(selfPosition, state.activeData.target) : undefined,
    actionToken: state.activeData.actionToken,
    elapsedMs: Math.max(0, state.lastUpdatedAtMs - state.activeNodeStartedAtMs),
  };
}

function fallbackCleanupEffects(
  state: AiGraphExecutionState | undefined,
  reason: string,
  reasonRu: string,
): AiGraphEffect[] {
  if (!isMoveToBlackboardPositionActionState(state?.activeData)) return [];
  return [clearMoveEffect(state.activeData.actionToken, reason, reasonRu)];
}

function planningGraph(graph: AiGraph): AiGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => (
      node.type === 'SequenceWithMemory' || DEFAULT_AI_ACTION_REGISTRY.has(String(node.type))
        ? { ...node, type: 'ActionBranch', children: [] }
        : node
    )),
  };
}

function subgraph(graph: AiGraph, rootNodeId: AiNodeId, nodes: Map<AiNodeId, AiNode>): AiGraph {
  return {
    version: graph.version,
    id: `${graph.id}:runtime:${rootNodeId}`,
    name: `${graph.name} runtime ${rootNodeId}`,
    nameRu: graph.nameRu ? `${graph.nameRu}: выполнение ${rootNodeId}` : undefined,
    rootNodeId,
    blackboardDefaults: graph.blackboardDefaults,
    nodes: reachableNodes(nodes, rootNodeId),
  };
}

function reachableNodes(nodes: Map<AiNodeId, AiNode>, rootNodeId: AiNodeId): AiNode[] {
  const result: AiNode[] = [];
  const visited = new Set<AiNodeId>();
  const visit = (id: AiNodeId): void => {
    if (visited.has(id)) return;
    visited.add(id);
    const node = nodes.get(id);
    if (!node) return;
    result.push(node);
    for (const child of node.children ?? []) visit(child);
  };
  visit(rootNodeId);
  return result;
}

function findSequence(nodes: Map<AiNodeId, AiNode>, startId: AiNodeId): AiNode | undefined {
  const visited = new Set<AiNodeId>();
  const visit = (id: AiNodeId): AiNode | undefined => {
    if (visited.has(id)) return undefined;
    visited.add(id);
    const node = nodes.get(id);
    if (!node) return undefined;
    if (node.type === 'SequenceWithMemory') return node;
    for (const child of node.children ?? []) {
      const found = visit(child);
      if (found) return found;
    }
    return undefined;
  };
  return visit(startId);
}

function containsStatefulDescendant(nodes: Map<AiNodeId, AiNode>, startId: AiNodeId): boolean {
  const visited = new Set<AiNodeId>();
  const visit = (id: AiNodeId, root: boolean): boolean => {
    if (visited.has(id)) return false;
    visited.add(id);
    const node = nodes.get(id);
    if (!node) return false;
    if (!root && (node.type === 'SequenceWithMemory' || DEFAULT_AI_ACTION_REGISTRY.has(String(node.type)))) {
      return true;
    }
    return (node.children ?? []).some((child) => visit(child, false));
  };
  return visit(startId, true);
}

function validateState(input: AiGraphRuntimeInput, nodes: Map<AiNodeId, AiNode>): StateValidation {
  const state = input.executionState;
  if (!state) {
    return { valid: false, reason: 'Execution state is missing.', reasonRu: 'Состояние выполнения отсутствует.' };
  }
  const branch = nodes.get(state.branchNodeId);
  const sequence = nodes.get(state.sequenceNodeId);
  const activeNode = nodes.get(state.activeNodeId);
  if (state.version !== 1 || state.graphId !== input.graph.id || state.unitId !== input.unitId) {
    return {
      valid: false,
      branch,
      sequence,
      activeNode,
      reason: 'Saved AI execution state belongs to another graph or soldier.',
      reasonRu: 'Состояние выполнения ИИ относится к другому графу или бойцу.',
    };
  }
  if (!branch || !sequence || !activeNode) {
    return {
      valid: false,
      branch,
      sequence,
      activeNode,
      reason: 'Saved AI execution state references a removed node.',
      reasonRu: 'Состояние выполнения ИИ ссылается на удалённую ноду.',
    };
  }
  if (sequence.type !== 'SequenceWithMemory') {
    return {
      valid: false,
      branch,
      sequence,
      activeNode,
      reason: 'Saved sequence is no longer stateful.',
      reasonRu: 'Сохранённая последовательность больше не является состоянийной.',
    };
  }
  if (!Number.isInteger(state.childIndex)
    || state.childIndex < 0
    || sequence.children?.[state.childIndex] !== state.activeNodeId) {
    return {
      valid: false,
      branch,
      sequence,
      activeNode,
      reason: 'Saved AI execution step no longer matches the graph.',
      reasonRu: 'Сохранённый шаг состояния ИИ больше не соответствует графу.',
    };
  }
  const lifecycle = DEFAULT_AI_ACTION_REGISTRY.get(String(activeNode.type));
  if (!lifecycle) {
    return {
      valid: false,
      branch,
      sequence,
      activeNode,
      reason: 'Saved active node is not registered as a stateful action.',
      reasonRu: 'Сохранённая активная нода не зарегистрирована как длительное действие.',
    };
  }
  if (activeNode.type === 'Wait') return { valid: true, branch, sequence, activeNode };
  const actionState = resolveActionState(activeNode, state);
  if (!lifecycle.validateState || lifecycle.validateState(actionState)) {
    return { valid: true, branch, sequence, activeNode };
  }
  return {
    valid: false,
    branch,
    sequence,
    activeNode,
    reason: 'Saved active node cannot be resumed by this runtime.',
    reasonRu: 'Сохранённую активную ноду нельзя продолжить в текущей версии runtime.',
  };
}

function sequenceFailure(
  input: AiGraphRuntimeInput,
  branch: AiNode,
  accumulator: RuntimeAccumulator,
  lifecycle: AiGraphLifecycleEvent[],
  nodeId: AiNodeId,
  nodeType: string,
  reason: string,
  reasonRu: string,
): AiGraphRuntimeResult {
  accumulator.trace.push({ nodeId, nodeType, status: 'fail', reason, reasonRu });
  return result(input, branch, accumulator, lifecycle, 'failure', reason, reasonRu);
}

function result(
  input: AiGraphRuntimeInput,
  branch: AiNode,
  accumulator: RuntimeAccumulator,
  lifecycle: readonly AiGraphLifecycleEvent[],
  status: AiGraphExecutionStatus,
  explanation: string,
  explanationRu: string,
  details: RuntimeDetails = {},
): AiGraphRuntimeResult {
  return {
    ok: status === 'success' || status === 'running' || status === 'waiting',
    status,
    unitId: input.unitId,
    graphId: input.graph.id,
    selectedBranchNodeId: branch.id,
    selectedBranchName: nodeName(branch),
    selectedBranchNameRu: nodeNameRu(branch),
    scores: accumulator.scores,
    effects: accumulator.effects,
    blackboard: accumulator.blackboard,
    cooldowns: accumulator.cooldowns,
    trace: accumulator.trace,
    explanation,
    explanationRu,
    lifecycle,
    executionState: details.executionState,
    activeNodeId: details.activeNode?.id,
    activeNodeName: details.activeNode ? nodeName(details.activeNode) : undefined,
    activeNodeNameRu: details.activeNode ? nodeNameRu(details.activeNode) : undefined,
    elapsedMs: details.elapsedMs,
    cancellationReason: details.cancellationReason,
    cancellationReasonRu: details.cancellationReasonRu,
    targetKey: details.targetKey,
    targetPosition: details.targetPosition ? { ...details.targetPosition } : undefined,
    distanceRemainingCells: details.distanceRemainingCells,
    actionToken: details.actionToken,
  };
}

function standalone(
  input: AiGraphRuntimeInput,
  status: AiGraphExecutionStatus,
  branchId: AiNodeId,
  branch: AiNode | undefined,
  explanation: string,
  explanationRu: string,
  trace: readonly AiGraphRuntimeTraceItem[],
  lifecycle: readonly AiGraphLifecycleEvent[] = [],
  extra: { readonly effects?: readonly AiGraphEffect[]; readonly details?: RuntimeDetails } = {},
): AiGraphRuntimeResult {
  const details = extra.details ?? {};
  return {
    ok: status === 'success' || status === 'running' || status === 'waiting',
    status,
    unitId: input.unitId,
    graphId: input.graph.id,
    selectedBranchNodeId: branchId,
    selectedBranchName: branch ? nodeName(branch) : branchId,
    selectedBranchNameRu: branch ? nodeNameRu(branch) : undefined,
    scores: [],
    effects: extra.effects ?? [],
    blackboard: cloneBlackboard(input.blackboard),
    cooldowns: { ...(input.cooldowns ?? {}) },
    trace,
    explanation,
    explanationRu,
    lifecycle,
    executionState: details.executionState,
    activeNodeId: details.activeNode?.id,
    activeNodeName: details.activeNode ? nodeName(details.activeNode) : undefined,
    activeNodeNameRu: details.activeNode ? nodeNameRu(details.activeNode) : undefined,
    elapsedMs: details.elapsedMs,
    cancellationReason: details.cancellationReason,
    cancellationReasonRu: details.cancellationReasonRu,
    targetKey: details.targetKey,
    targetPosition: details.targetPosition ? { ...details.targetPosition } : undefined,
    distanceRemainingCells: details.distanceRemainingCells,
    actionToken: details.actionToken,
  };
}

function wrapInstant(value: AiGraphRunnerResult, status: 'success' | 'failure'): AiGraphRuntimeResult {
  return { ...value, status, trace: runtimeTrace(value.trace), lifecycle: [] };
}

function clearMoveEffect(ownerToken: string, reason: string, reasonRu: string): AiGraphEffect {
  return {
    type: 'clear_move',
    ownerToken,
    reason,
    reasonRu,
  } as unknown as AiGraphEffect;
}

function lifecycleEvent(
  phase: AiGraphLifecyclePhase,
  node: AiNode,
  atMs: number,
  reason: string,
  reasonRu?: string,
): AiGraphLifecycleEvent {
  return { phase, nodeId: node.id, nodeType: String(node.type), atMs, reason, reasonRu };
}

function traceItem(
  node: AiNode,
  status: AiGraphRuntimeTraceStatus,
  reason: string,
  reasonRu?: string,
): AiGraphRuntimeTraceItem {
  return { nodeId: node.id, nodeType: String(node.type), status, reason, reasonRu };
}

function runtimeTrace(trace: readonly AiGraphTraceItem[]): AiGraphRuntimeTraceItem[] {
  return trace.map((item) => ({ ...item }));
}

function nodeName(node: AiNode): string {
  return node.displayName ?? String(node.type);
}

function nodeNameRu(node: AiNode): string {
  return node.displayNameRu ?? node.displayName ?? String(node.type);
}

function readPosition(value: unknown): GridPosition | null {
  return isGridPosition(value) ? { x: value.x, y: value.y } : null;
}

function isGridPosition(value: unknown): value is GridPosition {
  return typeof value === 'object'
    && value !== null
    && 'x' in value
    && 'y' in value
    && typeof value.x === 'number'
    && Number.isFinite(value.x)
    && typeof value.y === 'number'
    && Number.isFinite(value.y);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function cloneMoveData(value: MoveToBlackboardPositionActionState): AiGraphMoveExecutionData {
  return {
    ...value,
    target: { ...value.target },
  };
}

function cloneBlackboard(value: AiGraphRunnerBlackboard): AiGraphRunnerBlackboard {
  const copy: AiGraphRunnerBlackboard = {};
  for (const [key, item] of Object.entries(value)) {
    copy[key] = typeof item === 'object' && item !== null ? { x: item.x, y: item.y } : item;
  }
  return copy;
}
