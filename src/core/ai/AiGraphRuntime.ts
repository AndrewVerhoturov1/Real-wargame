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

interface StateValidation {
  readonly valid: boolean;
  readonly branch?: AiNode;
  readonly sequence?: AiNode;
  readonly activeNode?: AiNode;
  readonly reason?: string;
  readonly reasonRu?: string;
}

export function runAiGraphRuntime(input: AiGraphRuntimeInput): AiGraphRuntimeResult {
  const nodes = new Map(input.graph.nodes.map((node) => [node.id, node]));

  if (input.executionState) {
    const validation = validateState(input, nodes);
    if (!validation.valid || !validation.branch || !validation.sequence || !validation.activeNode) {
      const reason = validation.reason ?? 'Saved AI execution state is invalid.';
      const reasonRu = validation.reasonRu ?? 'Сохранённое состояние выполнения ИИ недействительно.';
      return standalone(input, 'failure', input.executionState.branchNodeId, validation.branch, reason, reasonRu, [{
        nodeId: input.executionState.activeNodeId,
        nodeType: validation.activeNode ? String(validation.activeNode.type) : 'unknown',
        status: 'fail',
        reason,
        reasonRu,
      }]);
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
        previousState = undefined;
        continue;
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

function planningGraph(graph: AiGraph): AiGraph {
  return { ...graph, nodes: graph.nodes.map((node) => node.type === 'SequenceWithMemory' ? { ...node, type: 'ActionBranch', children: [] } : node) };
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
    if (!root && (node.type === 'Wait' || node.type === 'SequenceWithMemory')) return true;
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
  if (activeNode.type !== 'Wait') return { valid: false, branch, sequence, activeNode, reason: 'Runtime v1 can only resume Wait nodes.', reasonRu: 'Runtime v1 пока может продолжать только ноды «Ждать».' };
  return { valid: true, branch, sequence, activeNode };
}

function cancelled(input: AiGraphRuntimeInput, branch: AiNode, activeNode: AiNode): AiGraphRuntimeResult {
  const reason = input.cancel?.reason ?? 'AI action cancelled.';
  const reasonRu = input.cancel?.reasonRu ?? 'Действие ИИ отменено.';
  return standalone(input, 'cancelled', branch.id, branch, reason, reasonRu, [traceItem(activeNode, 'cancelled', reason, reasonRu)], [lifecycleEvent('cancel', activeNode, input.nowMs, reason, reasonRu)], { cancellationReason: reason, cancellationReasonRu: reasonRu });
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
  duration: { executionState?: AiGraphExecutionState; activeNode?: AiNode; elapsedMs?: number } = {},
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
    executionState: duration.executionState,
    activeNodeId: duration.activeNode?.id,
    activeNodeName: duration.activeNode ? nodeName(duration.activeNode) : undefined,
    activeNodeNameRu: duration.activeNode ? nodeNameRu(duration.activeNode) : undefined,
    elapsedMs: duration.elapsedMs,
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
  extra: Pick<AiGraphRuntimeResult, 'cancellationReason' | 'cancellationReasonRu'> = {},
): AiGraphRuntimeResult {
  return {
    ok: status === 'success' || status === 'running' || status === 'waiting',
    status,
    unitId: input.unitId,
    graphId: input.graph.id,
    selectedBranchNodeId: branchId,
    selectedBranchName: branch ? nodeName(branch) : branchId,
    selectedBranchNameRu: branch ? nodeNameRu(branch) : undefined,
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

function wrapInstant(value: AiGraphRunnerResult, status: 'success' | 'failure'): AiGraphRuntimeResult {
  return { ...value, status, trace: runtimeTrace(value.trace), lifecycle: [] };
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

function toMilliseconds(seconds: number): number {
  return Math.round(Math.max(0, seconds) * 1000);
}

function cloneBlackboard(value: AiGraphRunnerBlackboard): AiGraphRunnerBlackboard {
  const copy: AiGraphRunnerBlackboard = {};
  for (const [key, item] of Object.entries(value)) copy[key] = typeof item === 'object' && item !== null ? { x: item.x, y: item.y } : item;
  return copy;
}
