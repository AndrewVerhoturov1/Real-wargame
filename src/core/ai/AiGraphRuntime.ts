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

export type AiGraphExecutionStatus = 'success' | 'failure' | 'running' | 'waiting' | 'cancelled';
export type AiGraphLifecyclePhase = 'start' | 'update' | 'complete' | 'cancel';
export type AiGraphRuntimeTraceStatus = AiGraphTraceItem['status'] | 'running' | 'waiting' | 'complete' | 'cancelled';

export interface AiGraphMoveExecutionData {
  readonly kind: 'move_to_blackboard_position';
  readonly targetKey: string;
  readonly target: GridPosition;
  readonly acceptanceRadiusCells: number;
  readonly timeoutMs: number;
  readonly actionToken: string;
}

export type AiGraphExecutionData = AiGraphMoveExecutionData;

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
          effects: cleanupEffectsForState(input.executionState, reason, reasonRu),
          details: moveDetailsFromState(input.executionState, input.blackboard),
        },
      );
    }
    if (input.cancel) return cancelled(input, validation.branch, validation.activeNode);
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
    if (!child) return sequenceFailure(input, branch, accumulator, lifecycle, childId, 'unknown', `Sequence ${sequence.id} references missing child ${childId}.`, `Последовательность ${sequence.id} ссылается на отсутствующую ноду ${childId}.`);
    if (child.type === 'SequenceWithMemory') return sequenceFailure(input, branch, accumulator, lifecycle, child.id, String(child.type), 'Nested stateful sequences are not supported in runtime v1.', 'Вложенные последовательности с памятью пока не поддерживаются в runtime v1.');

    if (child.type === 'Wait') {
      const waitResult = executeWait(input, branch, sequence, child, index, accumulator, lifecycle, previousState);
      if (waitResult) return waitResult;
      previousState = undefined;
      continue;
    }

    if (child.type === 'MoveToBlackboardPosition') {
      const moveResult = executeMove(input, branch, sequence, child, index, accumulator, lifecycle, previousState);
      if (moveResult) return moveResult;
      previousState = undefined;
      continue;
    }

    if (containsStatefulDescendant(nodes, child.id)) {
      return sequenceFailure(input, branch, accumulator, lifecycle, child.id, String(child.type), 'A stateful node must be a direct child of SequenceWithMemory in runtime v1.', 'В runtime v1 состоянийная нода должна быть прямым ребёнком «Последовательности с памятью».');
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
    if (!instant.ok) return result(input, branch, accumulator, lifecycle, 'failure', `Sequence ${sequence.id} failed at ${nodeName(child)}.`, `Последовательность ${sequence.id} провалилась на ноде «${nodeNameRu(child)}».`);
  }

  return result(input, branch, accumulator, lifecycle, 'success', `Stateful sequence ${sequence.id} completed.`, `Последовательность с памятью ${sequence.id} завершена.`);
}

function executeWait(
  input: AiGraphRuntimeInput,
  branch: AiNode,
  sequence: AiNode,
  child: AiNode,
  index: number,
  accumulator: RuntimeAccumulator,
  lifecycle: AiGraphLifecycleEvent[],
  previousState?: AiGraphExecutionState,
): AiGraphRuntimeResult | null {
  const durationMs = toMilliseconds(readNumber(child.parameters?.durationSeconds, 2));
  const timeoutMs = toMilliseconds(readNumber(child.parameters?.timeoutSeconds, 0));
  const resumableState = previousState
    && previousState.sequenceNodeId === sequence.id
    && previousState.childIndex === index
    && previousState.activeNodeId === child.id
    ? previousState
    : undefined;
  const startedAtMs = resumableState?.activeNodeStartedAtMs ?? input.nowMs;
  const elapsedMs = Math.max(0, input.nowMs - startedAtMs);

  if (elapsedMs >= durationMs) {
    const reason = `Wait ${child.id} completed after ${elapsedMs} ms.`;
    const reasonRu = `Ожидание ${child.id} завершено через ${elapsedMs} мс.`;
    lifecycle.push(lifecycleEvent('complete', child, input.nowMs, reason, reasonRu));
    accumulator.trace.push(traceItem(child, 'complete', reason, reasonRu));
    return null;
  }

  if (timeoutMs > 0 && elapsedMs >= timeoutMs) {
    const reason = `Wait ${child.id} timed out after ${elapsedMs} ms.`;
    const reasonRu = `Ожидание ${child.id} прервано по тайм-ауту через ${elapsedMs} мс.`;
    lifecycle.push(lifecycleEvent('complete', child, input.nowMs, reason, reasonRu));
    accumulator.trace.push(traceItem(child, 'fail', reason, reasonRu));
    return result(input, branch, accumulator, lifecycle, 'failure', reason, reasonRu);
  }

  const phase: AiGraphLifecyclePhase = resumableState ? 'update' : 'start';
  const reason = resumableState ? `Wait ${child.id} is still active at ${elapsedMs} ms.` : `Wait ${child.id} started for ${durationMs} ms.`;
  const reasonRu = resumableState ? `Ожидание ${child.id} продолжается: ${elapsedMs} мс.` : `Ожидание ${child.id} начато на ${durationMs} мс.`;
  lifecycle.push(lifecycleEvent(phase, child, input.nowMs, reason, reasonRu));
  accumulator.trace.push(traceItem(child, 'waiting', reason, reasonRu));
  return result(
    input,
    branch,
    accumulator,
    lifecycle,
    'waiting',
    `AI sequence ${sequence.id} is waiting at ${nodeName(child)}.`,
    `Последовательность ИИ ${sequence.id} ожидает на ноде «${nodeNameRu(child)}».`,
    {
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
        status: 'waiting',
      },
      activeNode: child,
      elapsedMs,
    },
  );
}

function executeMove(
  input: AiGraphRuntimeInput,
  branch: AiNode,
  sequence: AiNode,
  child: AiNode,
  index: number,
  accumulator: RuntimeAccumulator,
  lifecycle: AiGraphLifecycleEvent[],
  previousState?: AiGraphExecutionState,
): AiGraphRuntimeResult | null {
  const resumableState = previousState
    && previousState.sequenceNodeId === sequence.id
    && previousState.childIndex === index
    && previousState.activeNodeId === child.id
    && previousState.activeData?.kind === 'move_to_blackboard_position'
    ? previousState
    : undefined;
  const selfPosition = readPosition(accumulator.blackboard.self_position);
  if (!selfPosition) {
    const reason = 'MoveToBlackboardPosition requires a valid self_position.';
    const reasonRu = 'Для длительного движения нужна корректная позиция бойца self_position.';
    accumulator.trace.push(traceItem(child, 'fail', reason, reasonRu));
    return result(input, branch, accumulator, lifecycle, 'failure', reason, reasonRu);
  }

  if (!resumableState) {
    const targetKey = readString(child.parameters?.targetKey, 'best_cover_position');
    const target = readPosition(accumulator.blackboard[targetKey]);
    if (!target) {
      const reason = `Move target ${targetKey} is missing or invalid.`;
      const reasonRu = `Цель движения «${targetKey}» отсутствует или имеет неверный формат.`;
      accumulator.trace.push(traceItem(child, 'fail', reason, reasonRu));
      return result(input, branch, accumulator, lifecycle, 'failure', reason, reasonRu);
    }

    const acceptanceRadiusCells = readNumber(child.parameters?.acceptanceRadiusCells, 0.2);
    const timeoutMs = toMilliseconds(readNumber(child.parameters?.timeoutSeconds, 15));
    const remaining = distance(selfPosition, target);
    if (remaining <= acceptanceRadiusCells) {
      const reason = `Move target ${targetKey} is already reached.`;
      const reasonRu = `Цель движения «${targetKey}» уже достигнута.`;
      lifecycle.push(lifecycleEvent('complete', child, input.nowMs, reason, reasonRu));
      accumulator.trace.push(traceItem(child, 'complete', reason, reasonRu));
      return null;
    }

    const actionToken = makeActionToken(input.unitId, child.id, input.nowMs);
    const reason = `Move ${child.id} started toward ${targetKey}.`;
    const reasonRu = `Движение «${nodeNameRu(child)}» начато к цели «${targetKey}».`;
    accumulator.effects.push(beginMoveEffect(actionToken, target, targetKey, reason, reasonRu));
    lifecycle.push(lifecycleEvent('start', child, input.nowMs, reason, reasonRu));
    accumulator.trace.push(traceItem(child, 'running', reason, reasonRu));
    return result(
      input,
      branch,
      accumulator,
      lifecycle,
      'running',
      `AI sequence ${sequence.id} is moving at ${nodeName(child)}.`,
      `Последовательность ИИ ${sequence.id} выполняет ноду «${nodeNameRu(child)}».`,
      {
        executionState: {
          version: 1,
          graphId: input.graph.id,
          unitId: input.unitId,
          branchNodeId: branch.id,
          sequenceNodeId: sequence.id,
          childIndex: index,
          activeNodeId: child.id,
          activeNodeStartedAtMs: input.nowMs,
          lastUpdatedAtMs: input.nowMs,
          status: 'running',
          activeData: {
            kind: 'move_to_blackboard_position',
            targetKey,
            target: { ...target },
            acceptanceRadiusCells,
            timeoutMs,
            actionToken,
          },
        },
        activeNode: child,
        elapsedMs: 0,
        targetKey,
        targetPosition: target,
        distanceRemainingCells: remaining,
        actionToken,
      },
    );
  }

  const move = resumableState.activeData as AiGraphMoveExecutionData;
  const elapsedMs = Math.max(0, input.nowMs - resumableState.activeNodeStartedAtMs);
  const remaining = distance(selfPosition, move.target);
  const details: RuntimeDetails = {
    activeNode: child,
    elapsedMs,
    targetKey: move.targetKey,
    targetPosition: move.target,
    distanceRemainingCells: remaining,
    actionToken: move.actionToken,
  };

  if (remaining <= move.acceptanceRadiusCells) {
    const reason = `Move ${child.id} completed with ${remaining.toFixed(3)} cells remaining.`;
    const reasonRu = `Движение «${nodeNameRu(child)}» завершено: до цели осталось ${remaining.toFixed(2)} клетки.`;
    accumulator.effects.push(clearMoveEffect(move.actionToken, reason, reasonRu));
    lifecycle.push(lifecycleEvent('complete', child, input.nowMs, reason, reasonRu));
    accumulator.trace.push(traceItem(child, 'complete', reason, reasonRu));
    return null;
  }

  const activeSource = readNullableString(accumulator.blackboard.active_move_source);
  const activeToken = readNullableString(accumulator.blackboard.active_move_owner_token);
  if (activeToken !== move.actionToken) {
    if (activeSource === 'player') {
      const reason = 'The player replaced the active AI move order.';
      const reasonRu = 'Приказ игрока заменил активное движение ИИ.';
      accumulator.effects.push(clearMoveEffect(move.actionToken, reason, reasonRu));
      lifecycle.push(lifecycleEvent('cancel', child, input.nowMs, reason, reasonRu));
      accumulator.trace.push(traceItem(child, 'cancelled', reason, reasonRu));
      return result(input, branch, accumulator, lifecycle, 'cancelled', reason, reasonRu, {
        ...details,
        cancellationReason: reason,
        cancellationReasonRu: reasonRu,
      });
    }

    if (activeToken === null) {
      const reason = 'The owned AI move order disappeared before arrival.';
      const reasonRu = 'Собственный приказ движения ИИ исчез до достижения цели.';
      accumulator.effects.push(clearMoveEffect(move.actionToken, reason, reasonRu));
      lifecycle.push(lifecycleEvent('complete', child, input.nowMs, reason, reasonRu));
      accumulator.trace.push(traceItem(child, 'fail', reason, reasonRu));
      return result(input, branch, accumulator, lifecycle, 'failure', reason, reasonRu, details);
    }

    const reason = 'Another AI movement replaced the active move order.';
    const reasonRu = 'Другое действие ИИ заменило активный приказ движения.';
    accumulator.effects.push(clearMoveEffect(move.actionToken, reason, reasonRu));
    lifecycle.push(lifecycleEvent('cancel', child, input.nowMs, reason, reasonRu));
    accumulator.trace.push(traceItem(child, 'cancelled', reason, reasonRu));
    return result(input, branch, accumulator, lifecycle, 'cancelled', reason, reasonRu, {
      ...details,
      cancellationReason: reason,
      cancellationReasonRu: reasonRu,
    });
  }

  if (move.timeoutMs > 0 && elapsedMs >= move.timeoutMs) {
    const reason = `Move ${child.id} timed out after ${elapsedMs} ms.`;
    const reasonRu = `Движение «${nodeNameRu(child)}» прервано по тайм-ауту через ${elapsedMs} мс.`;
    accumulator.effects.push(clearMoveEffect(move.actionToken, reason, reasonRu));
    lifecycle.push(lifecycleEvent('complete', child, input.nowMs, reason, reasonRu));
    accumulator.trace.push(traceItem(child, 'fail', reason, reasonRu));
    return result(input, branch, accumulator, lifecycle, 'failure', reason, reasonRu, details);
  }

  const reason = `Move ${child.id} is active with ${remaining.toFixed(3)} cells remaining.`;
  const reasonRu = `Движение «${nodeNameRu(child)}» продолжается: осталось ${remaining.toFixed(2)} клетки.`;
  lifecycle.push(lifecycleEvent('update', child, input.nowMs, reason, reasonRu));
  accumulator.trace.push(traceItem(child, 'running', reason, reasonRu));
  return result(
    input,
    branch,
    accumulator,
    lifecycle,
    'running',
    `AI sequence ${sequence.id} is moving at ${nodeName(child)}.`,
    `Последовательность ИИ ${sequence.id} выполняет ноду «${nodeNameRu(child)}».`,
    {
      ...details,
      executionState: {
        ...resumableState,
        lastUpdatedAtMs: input.nowMs,
      },
    },
  );
}

function planningGraph(graph: AiGraph): AiGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => ['SequenceWithMemory', 'Wait', 'MoveToBlackboardPosition'].includes(String(node.type))
      ? { ...node, type: 'ActionBranch', children: [] }
      : node),
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
    if (!root && ['Wait', 'SequenceWithMemory', 'MoveToBlackboardPosition'].includes(String(node.type))) return true;
    return (node.children ?? []).some((child) => visit(child, false));
  };
  return visit(startId, true);
}

function validateState(input: AiGraphRuntimeInput, nodes: Map<AiNodeId, AiNode>): StateValidation {
  const state = input.executionState;
  if (!state) return { valid: false, reason: 'Execution state is missing.', reasonRu: 'Состояние выполнения отсутствует.' };
  const branch = nodes.get(state.branchNodeId);
  const sequence = nodes.get(state.sequenceNodeId);
  const activeNode = nodes.get(state.activeNodeId);
  if (state.version !== 1 || state.graphId !== input.graph.id || state.unitId !== input.unitId) return { valid: false, branch, sequence, activeNode, reason: 'Saved AI execution state belongs to another graph or soldier.', reasonRu: 'Состояние выполнения ИИ относится к другому графу или бойцу.' };
  if (!branch || !sequence || !activeNode) return { valid: false, branch, sequence, activeNode, reason: 'Saved AI execution state references a removed node.', reasonRu: 'Состояние выполнения ИИ ссылается на удалённую ноду.' };
  if (sequence.type !== 'SequenceWithMemory') return { valid: false, branch, sequence, activeNode, reason: 'Saved sequence is no longer stateful.', reasonRu: 'Сохранённая последовательность больше не является состоянийной.' };
  if (!Number.isInteger(state.childIndex) || state.childIndex < 0 || sequence.children?.[state.childIndex] !== state.activeNodeId) return { valid: false, branch, sequence, activeNode, reason: 'Saved AI execution step no longer matches the graph.', reasonRu: 'Сохранённый шаг состояния ИИ больше не соответствует графу.' };
  if (activeNode.type === 'Wait') return { valid: true, branch, sequence, activeNode };
  if (activeNode.type === 'MoveToBlackboardPosition' && isValidMoveData(state.activeData)) return { valid: true, branch, sequence, activeNode };
  return { valid: false, branch, sequence, activeNode, reason: 'Saved active node cannot be resumed by this runtime.', reasonRu: 'Сохранённую активную ноду нельзя продолжить в текущей версии runtime.' };
}

function cancelled(input: AiGraphRuntimeInput, branch: AiNode, activeNode: AiNode): AiGraphRuntimeResult {
  const reason = input.cancel?.reason ?? 'AI action cancelled.';
  const reasonRu = input.cancel?.reasonRu ?? 'Действие ИИ отменено.';
  const effects = cleanupEffectsForState(input.executionState, reason, reasonRu);
  return standalone(
    input,
    'cancelled',
    branch.id,
    branch,
    reason,
    reasonRu,
    [traceItem(activeNode, 'cancelled', reason, reasonRu)],
    [lifecycleEvent('cancel', activeNode, input.nowMs, reason, reasonRu)],
    {
      effects,
      details: {
        ...moveDetailsFromState(input.executionState, input.blackboard),
        cancellationReason: reason,
        cancellationReasonRu: reasonRu,
      },
    },
  );
}

function cleanupEffectsForState(state: AiGraphExecutionState | undefined, reason: string, reasonRu: string): AiGraphEffect[] {
  if (state?.activeData?.kind !== 'move_to_blackboard_position') return [];
  return [clearMoveEffect(state.activeData.actionToken, reason, reasonRu)];
}

function moveDetailsFromState(state: AiGraphExecutionState | undefined, blackboard: AiGraphRunnerBlackboard): RuntimeDetails {
  if (state?.activeData?.kind !== 'move_to_blackboard_position') return {};
  const selfPosition = readPosition(blackboard.self_position);
  return {
    targetKey: state.activeData.targetKey,
    targetPosition: state.activeData.target,
    distanceRemainingCells: selfPosition ? distance(selfPosition, state.activeData.target) : undefined,
    actionToken: state.activeData.actionToken,
    elapsedMs: Math.max(0, state.lastUpdatedAtMs - state.activeNodeStartedAtMs),
  };
}

function sequenceFailure(input: AiGraphRuntimeInput, branch: AiNode, accumulator: RuntimeAccumulator, lifecycle: AiGraphLifecycleEvent[], nodeId: AiNodeId, nodeType: string, reason: string, reasonRu: string): AiGraphRuntimeResult {
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

function beginMoveEffect(ownerToken: string, targetPosition: GridPosition, targetKey: string, reason: string, reasonRu: string): AiGraphEffect {
  return {
    type: 'begin_move',
    ownerToken,
    targetPosition: { ...targetPosition },
    targetKey,
    reason,
    reasonRu,
  } as unknown as AiGraphEffect;
}

function clearMoveEffect(ownerToken: string, reason: string, reasonRu: string): AiGraphEffect {
  return {
    type: 'clear_move',
    ownerToken,
    reason,
    reasonRu,
  } as unknown as AiGraphEffect;
}

function lifecycleEvent(phase: AiGraphLifecyclePhase, node: AiNode, atMs: number, reason: string, reasonRu: string): AiGraphLifecycleEvent {
  return { phase, nodeId: node.id, nodeType: String(node.type), atMs, reason, reasonRu };
}

function traceItem(node: AiNode, status: AiGraphRuntimeTraceStatus, reason: string, reasonRu: string): AiGraphRuntimeTraceItem {
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

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
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

function isValidMoveData(value: AiGraphExecutionData | undefined): value is AiGraphMoveExecutionData {
  return value?.kind === 'move_to_blackboard_position'
    && typeof value.targetKey === 'string'
    && value.targetKey.length > 0
    && isGridPosition(value.target)
    && typeof value.acceptanceRadiusCells === 'number'
    && Number.isFinite(value.acceptanceRadiusCells)
    && value.acceptanceRadiusCells >= 0
    && typeof value.timeoutMs === 'number'
    && Number.isFinite(value.timeoutMs)
    && value.timeoutMs >= 0
    && typeof value.actionToken === 'string'
    && value.actionToken.length > 0;
}

function makeActionToken(unitId: string, nodeId: string, startedAtMs: number): string {
  return `${unitId}:${nodeId}:${Math.round(startedAtMs)}`;
}

function toMilliseconds(seconds: number): number {
  return Math.round(Math.max(0, seconds) * 1000);
}

function cloneBlackboard(value: AiGraphRunnerBlackboard): AiGraphRunnerBlackboard {
  const copy: AiGraphRunnerBlackboard = {};
  for (const [key, item] of Object.entries(value)) copy[key] = typeof item === 'object' && item !== null ? { x: item.x, y: item.y } : item;
  return copy;
}
