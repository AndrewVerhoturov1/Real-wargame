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
};

interface RuntimeAccumulator {
  blackboard: AiGraphRunnerBlackboard;
  cooldowns: Record<string, number>;
  effects: AiGraphEffect[];
  trace: AiGraphRuntimeTraceItem[];
  scores: AiGraphRunnerResult['scores'];
}

interface StateValidationResult {
  readonly valid: boolean;
  readonly branch?: AiNode;
  readonly sequence?: AiNode;
  readonly activeNode?: AiNode;
  readonly reason?: string;
  readonly reasonRu?: string;
}

export function runAiGraphRuntime(input: AiGraphRuntimeInput): AiGraphRuntimeResult {
  const nodesById = new Map(input.graph.nodes.map((node) => [node.id, node]));

  if (input.executionState) {
    const validation = validateExecutionState(input, nodesById);
    if (!validation.valid || !validation.branch || !validation.sequence || !validation.activeNode) {
      return makeStandaloneResult(
        input,
        'failure',
        input.executionState.branchNodeId,
        validation.branch,
        validation.reason ?? 'Saved AI execution state is invalid.',
        validation.reasonRu ?? 'Сохранённое состояние выполнения ИИ недействительно.',
        [{
          nodeId: input.executionState.activeNodeId,
          nodeType: validation.activeNode ? String(validation.activeNode.type) : 'unknown',
          status: 'fail',
          reason: validation.reason ?? 'Saved AI execution state is invalid.',
          reasonRu: validation.reasonRu ?? 'Сохранённое состояние выполнения ИИ недействительно.',
        }],
      );
    }

    if (input.cancel) {
      return makeCancellationResult(input, validation.branch, validation.activeNode);
    }

    return executeSequence(input, validation.branch, validation.sequence, input.executionState.childIndex, input.executionState, undefined);
  }

  const selection = runAiGraph({
    graph: makePlanningGraph(input.graph),
    unitId: input.unitId,
    blackboard: input.blackboard,
    cooldowns: input.cooldowns,
    nowMs: input.nowMs,
    tacticalHost: input.tacticalHost,
  });

  if (!selection.ok) {
    return wrapInstantResult(selection, 'failure');
  }

  const branch = nodesById.get(selection.selectedBranchNodeId);
  if (!branch) {
    return makeStandaloneResult(
      input,
      'failure',
      selection.selectedBranchNodeId,
      undefined,
      'Selected AI branch is missing from the source graph.',
      'Выбранная ветка ИИ отсутствует в исходном графе.',
      selection.trace,
    );
  }

  const sequence = findFirstSequenceWithMemory(nodesById, branch.id);
  if (!sequence) {
    return wrapInstantResult(selection, 'success');
  }

  return executeSequence(input, branch, sequence, 0, undefined, selection);
}

function executeSequence(
  input: AiGraphRuntimeInput,
  branch: AiNode,
  sequence: AiNode,
  startIndex: number,
  previousState: AiGraphExecutionState | undefined,
  selection: AiGraphRunnerResult | undefined,
): AiGraphRuntimeResult {
  const nodesById = new Map(input.graph.nodes.map((node) => [node.id, node]));
  const accumulator: RuntimeAccumulator = {
    blackboard: cloneBlackboard(selection?.blackboard ?? input.blackboard),
    cooldowns: { ...(selection?.cooldowns ?? input.cooldowns ?? {}) },
    effects: [...(selection?.effects ?? [])],
    trace: [...asRuntimeTrace(selection?.trace ?? [])],
    scores: selection?.scores ?? [],
  };
  const lifecycle: AiGraphLifecycleEvent[] = [];
  const children = sequence.children ?? [];

  for (let childIndex = startIndex; childIndex < children.length; childIndex += 1) {
    const childId = children[childIndex];
    const child = nodesById.get(childId);
    if (!child) {
      return makeSequenceFailure(
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
      return makeSequenceFailure(
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

    if (child.type === 'Wait') {
      const durationMs = secondsToMs(readNumber(child.parameters?.durationSeconds, 2));
      const timeoutMs = secondsToMs(readNumber(child.parameters?.timeoutSeconds, 0));
      const resumesSameNode = previousState?.sequenceNodeId === sequence.id
        && previousState.childIndex === childIndex
        && previousState.activeNodeId === child.id;
      const startedAtMs = resumesSameNode ? previousState.activeNodeStartedAtMs : input.nowMs;
      const elapsedMs = Math.max(0, input.nowMs - startedAtMs);

      if (elapsedMs >= durationMs) {
        const reason = `Wait ${child.id} completed after ${elapsedMs} ms.`;
        const reasonRu = `Ожидание ${child.id} завершено через ${elapsedMs} мс.`;
        lifecycle.push(makeLifecycleEvent('complete', child, input.nowMs, reason, reasonRu));
        accumulator.trace.push(makeTrace(child, 'complete', reason, reasonRu));
        previousState = undefined;
        continue;
      }

      if (timeoutMs > 0 && elapsedMs >= timeoutMs) {
        const reason = `Wait ${child.id} timed out after ${elapsedMs} ms.`;
        const reasonRu = `Ожидание ${child.id} прервано по тайм-ауту через ${elapsedMs} мс.`;
        lifecycle.push(makeLifecycleEvent('complete', child, input.nowMs, reason, reasonRu));
        accumulator.trace.push(makeTrace(child, 'fail', reason, reasonRu));
        return makeRuntimeResult(input, branch, accumulator, lifecycle, {
          status: 'failure',
          explanation: reason,
          explanationRu: reasonRu,
        });
      }

      const phase: AiGraphLifecyclePhase = resumesSameNode ? 'update' : 'start';
      const reason = resumesSameNode
        ? `Wait ${child.id} is still active at ${elapsedMs} ms.`
        : `Wait ${child.id} started for ${durationMs} ms.`;
      const reasonRu = resumesSameNode
        ? `Ожидание ${child.id} продолжается: ${elapsedMs} мс.`
        : `Ожидание ${child.id} начато на ${durationMs} мс.`;
      lifecycle.push(makeLifecycleEvent(phase, child, input.nowMs, reason, reasonRu));
      accumulator.trace.push(makeTrace(child, 'waiting', reason, reasonRu));
      return makeRuntimeResult(input, branch, accumulator, lifecycle, {
        status: 'waiting',
        explanation: `AI sequence ${sequence.id} is waiting at ${nodeName(child)}.`,
        explanationRu: `Последовательность ИИ ${sequence.id} ожидает на ноде «${nodeNameRu(child)}».`,
        executionState: {
          version: 1,
          graphId: input.graph.id,
          unitId: input.unitId,
          branchNodeId: branch.id,
          sequenceNodeId: sequence.id,
          childIndex,
          activeNodeId: child.id,
          activeNodeStartedAtMs: startedAtMs,
          lastUpdatedAtMs: input.nowMs,
          status: 'waiting',
        },
        activeNode: child,
        elapsedMs,
      });
    }

    if (containsStatefulNode(nodesById, child.id)) {
      return makeSequenceFailure(
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
      graph: makeSubgraph(input.graph, child.id, nodesById),
      unitId: input.unitId,
      blackboard: accumulator.blackboard,
      cooldowns: accumulator.cooldowns,
      nowMs: input.nowMs,
      tacticalHost: input.tacticalHost,
    });
    accumulator.blackboard = cloneBlackboard(instant.blackboard);
    accumulator.cooldowns = { ...instant.cooldowns };
    accumulator.effects.push(...instant.effects);
    accumulator.trace.push(...asRuntimeTrace(instant.trace));
    accumulator.scores = [...accumulator.scores, ...instant.scores];

    if (!instant.ok) {
      return makeRuntimeResult(input, branch, accumulator, lifecycle, {
        status: 'failure',
        explanation: `Sequence ${sequence.id} failed at ${nodeName(child)}.`,
        explanationRu: `Последовательность ${sequence.id} провалилась на ноде «${nodeNameRu(child)}».`,
      });
    }
  }

  return makeRuntimeResult(input, branch, accumulator, lifecycle, {
    status: 'success',
    explanation: `Stateful sequence ${sequence.id} completed.`,
    explanationRu: `Последовательность с памятью ${sequence.id} завершена.`,
  });
}

function makePlanningGraph(graph: AiGraph): AiGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => node.type === 'SequenceWithMemory'
      ? { ...node, type: 'ActionBranch', children: [] }
      : node),
  };
}

function makeSubgraph(graph: AiGraph, rootNodeId: AiNodeId, nodesById: Map<AiNodeId, AiNode>): AiGraph {
  const reachable = collectReachableNodes(nodesById, rootNodeId);
  return {
    version: graph.version,
    id: `${graph.id}:runtime:${rootNodeId}`,
    name: `${graph.name} runtime ${rootNodeId}`,
    nameRu: graph.nameRu ? `${graph.nameRu}: выполнение ${rootNodeId}` : undefined,
    rootNodeId,
    blackboardDefaults: graph.blackboardDefaults,
    nodes: reachable,
  };
}

function collectReachableNodes(nodesById: Map<AiNodeId, AiNode>, rootNodeId: AiNodeId): AiNode[] {
  const result: AiNode[] = [];
  const visited = new Set<AiNodeId>();
  const visit = (nodeId: AiNodeId): void => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = nodesById.get(nodeId);
    if (!node) return;
    result.push(node);
    for (const childId of node.children ?? []) visit(childId);
  };
  visit(rootNodeId);
  return result;
}

function findFirstSequenceWithMemory(nodesById: Map<AiNodeId, AiNode>, startNodeId: AiNodeId): AiNode | undefined {
  const visited = new Set<AiNodeId>();
  const visit = (nodeId: AiNodeId): AiNode | undefined => {
    if (visited.has(nodeId)) return undefined;
    visited.add(nodeId);
    const node = nodesById.get(nodeId);
    if (!node) return undefined;
    if (node.type === 'SequenceWithMemory') return node;
    for (const childId of node.children ?? []) {
      const found = visit(childId);
      if (found) return found;
    }
    return undefined;
  };
  return visit(startNodeId);
}

function containsStatefulNode(nodesById: Map<AiNodeId, AiNode>, startNodeId: AiNodeId): boolean {
  const visited = new Set<AiNodeId>();
  const visit = (nodeId: AiNodeId, isRoot: boolean): boolean => {
    if (visited.has(nodeId)) return false;
    visited.add(nodeId);
    const node = nodesById.get(nodeId);
    if (!node) return false;
    if (!isRoot && (node.type === 'Wait' || node.type === 'SequenceWithMemory')) return true;
    return (node.children ?? []).some((childId) => visit(childId, false));
  };
  return visit(startNodeId, true);
}

function validateExecutionState(input: AiGraphRuntimeInput, nodesById: Map<AiNodeId, AiNode>): StateValidationResult {
  const state = input.executionState;
  if (!state) return { valid: false, reason: 'Execution state is missing.', reasonRu: 'Состояние выполнения отсутствует.' };
  const branch = nodesById.get(state.branchNodeId);
  const sequence = nodesById.get(state.sequenceNodeId);
  const activeNode = nodesById.get(state.activeNodeId);

  if (state.version !== 1 || state.graphId !== input.graph.id || state.unitId !== input.unitId) {
    return { valid: false, branch, sequence, activeNode, reason: 'Saved AI execution state belongs to another graph or soldier.', reasonRu: 'Состояние выполнения ИИ относится к другому графу или бойцу.' };
  }
  if (!branch || !sequence || !activeNode) {
    return { valid: false, branch, sequence, activeNode, reason: 'Saved AI execution state references a removed node.', reasonRu: 'Состояние выполнения ИИ ссылается на удалённую ноду.' };
  }
  if (sequence.type !== 'SequenceWithMemory') {
    return { valid: false, branch, sequence, activeNode, reason: 'Saved sequence is no longer stateful.', reasonRu: 'Сохранённая последовательность больше не является состоянийной.' };
  }
  if (!Number.isInteger(state.childIndex) || state.childIndex < 0 || sequence.children?.[state.childIndex] !== state.activeNodeId) {
    return { valid: false, branch, sequence, activeNode, reason: 'Saved AI execution step no longer matches the graph.', reasonRu: 'Сохранённый шаг состояния ИИ больше не соответствует графу.' };
  }
  if (activeNode.type !== 'Wait') {
    return { valid: false, branch, sequence, activeNode, reason: 'Runtime v1 can only resume Wait nodes.', reasonRu: 'Runtime v1 пока может продолжать только ноды «Ждать».' };
  }
  return { valid: true, branch, sequence, activeNode };
}

function makeCancellationResult(input: AiGraphRuntimeInput, branch: AiNode, activeNode: AiNode): AiGraphRuntimeResult {
  const reason = input.cancel?.reason ?? 'AI action cancelled.';
  const reasonRu = input.cancel?.reasonRu ?? 'Действие ИИ отменено.';
  const lifecycle = [makeLifecycleEvent('cancel', activeNode, input.nowMs, reason, reasonRu)];
  const trace = [makeTrace(activeNode, 'cancelled', reason, reasonRu)];
  return makeStandaloneResult(input, 'cancelled', branch.id, branch, reason, reasonRu, trace, lifecycle, {
    cancellationReason: reason,
    cancellationReasonRu: reasonRu,
  });
}

function makeSequenceFailure(
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
  return makeRuntimeResult(input, branch, accumulator, lifecycle, { status: 'failure', explanation: reason, explanationRu: reasonRu });
}

function makeRuntimeResult(
  input: AiGraphRuntimeInput,
  branch: AiNode,
  accumulator: RuntimeAccumulator,
  lifecycle: AiGraphLifecycleEvent[],
  options: {
    status: AiGraphExecutionStatus;
    explanation: string;
    explanationRu: string;
    executionState?: AiGraphExecutionState;
    activeNode?: AiNode;
    elapsedMs?: number;
  },
): AiGraphRuntimeResult {
  return {
    ok: options.status === 'success' || options.status === 'running' || options.status === 'waiting',
    status: options.status,
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
    explanation: options.explanation,
    explanationRu: options.explanationRu,
    lifecycle,
    executionState: options.executionState,
    activeNodeId: options.activeNode?.id,
    activeNodeName: options.activeNode ? nodeName(options.activeNode) : undefined,
    activeNodeNameRu: options.activeNode ? nodeNameRu(options.activeNode) : undefined,
    elapsedMs: options.elapsedMs,
  };
}

function makeStandaloneResult(
  input: AiGraphRuntimeInput,
  status: AiGraphExecutionStatus,
  selectedBranchNodeId: AiNodeId,
  selectedNode: AiNode | undefined,
  explanation: string,
  explanationRu: string,
  trace: readonly AiGraphRuntimeTraceItem[],
  lifecycle: readonly AiGraphLifecycleEvent[] = [],
  extra: Pick<AiGraphRuntimeResult, 'cancellationReason' | 'cancellationReasonRu'> = {},
): AiGraphRuntimeResult {
  return {
    ok: status === 'success' || status === 'running' || status === 'waiting',
    status,
    unitId: input.unitId,
    graphId: input.graph.id,
    selectedBranchNodeId,
    selectedBranchName: selectedNode ? nodeName(selectedNode) : selectedBranchNodeId,
    selectedBranchNameRu: selectedNode ? nodeNameRu(selectedNode) : undefined,
    scores: [],
    effects: [],
    blackboard: cloneBlackboard(input.blackboard),
    cooldowns: { ...(input.cooldowns ?? {}) },
    trace,
    explanation,
    explanationRu,
    lifecycle,
    ...extra,
  };
}

function wrapInstantResult(result: AiGraphRunnerResult, status: 'success' | 'failure'): AiGraphRuntimeResult {
  return {
    ...result,
    status,
    trace: asRuntimeTrace(result.trace),
    lifecycle: [],
  };
}

function makeLifecycleEvent(
  phase: AiGraphLifecyclePhase,
  node: AiNode,
  atMs: number,
  reason: string,
  reasonRu: string,
): AiGraphLifecycleEvent {
  return { phase, nodeId: node.id, nodeType: String(node.type), atMs, reason, reasonRu };
}

function makeTrace(
  node: AiNode,
  status: AiGraphRuntimeTraceStatus,
  reason: string,
  reasonRu: string,
): AiGraphRuntimeTraceItem {
  return { nodeId: node.id, nodeType: String(node.type), status, reason, reasonRu };
}

function asRuntimeTrace(trace: readonly AiGraphTraceItem[]): AiGraphRuntimeTraceItem[] {
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

function secondsToMs(seconds: number): number {
  return Math.round(Math.max(0, seconds) * 1000);
}

function cloneBlackboard(value: AiGraphRunnerBlackboard): AiGraphRunnerBlackboard {
  const result: AiGraphRunnerBlackboard = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = typeof item === 'object' && item !== null ? { x: item.x, y: item.y } : item;
  }
  return result;
}
