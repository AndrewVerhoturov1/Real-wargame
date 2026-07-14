import type { GridPosition } from '../../geometry';
import type { AiGraph, AiNode, AiNodeId } from '../AiGraph';
import {
  runAiGraph,
  type AiGraphEffect,
  type AiGraphRunnerBlackboard,
  type AiGraphRunnerResult,
  type AiGraphTraceItem,
} from '../AiGraphRunner';
import type {
  AiGraphExecutionData,
  AiGraphExecutionState,
  AiGraphLifecycleEvent,
  AiGraphRuntimeInput,
  AiGraphRuntimeResult,
  AiGraphRuntimeTraceItem,
} from '../AiGraphRuntime';
import { DEFAULT_AI_ACTION_REGISTRY } from './AiDefaultActionRegistry';
import {
  deriveReactiveObserverDefinitions,
  evaluateAiReactiveAbort,
  type AiReactiveAbortTrace,
} from '../events/AiReactiveRuntime';
import {
  cloneCompositeFrames,
  normalizeCompositeFrames,
  withFrameChildIndex,
  type AiCompositeFrame,
} from './AiCompositeRuntime';
import {
  runAiActionLifecycle,
  type AiActionRuntimeContext,
  type AiActionTickResult,
  type AiNodeLifecycle,
} from './AiNodeLifecycle';
import {
  isMoveToBlackboardPositionActionState,
  type MoveToBlackboardPositionActionState,
} from './actions/MoveToBlackboardPositionAction';
import { isReloadActionState } from './actions/ReloadAction';
import { createLegacyWaitActionState } from './actions/WaitAction';
import { isWaitForEventActionState } from './actions/WaitForEventAction';
import { DEFAULT_AI_SUBGRAPH_REGISTRY } from '../contracts/AiSubgraphRegistry';
import {
  applySubgraphOutputs,
  cloneAiSubgraphExecutionState,
  createSubgraphLocalBlackboard,
  isAiSubgraphExecutionState,
  refreshSubgraphRuntimeValues,
  type AiSubgraphExecutionState,
} from './AiSubgraphRuntime';

interface RuntimeAccumulator {
  blackboard: AiGraphRunnerBlackboard;
  cooldowns: Record<string, number>;
  effects: AiGraphEffect[];
  trace: AiGraphRuntimeTraceItem[];
  scores: AiGraphRunnerResult['scores'];
}

interface RuntimeEnvironment {
  readonly input: AiGraphRuntimeInput;
  readonly nodes: Map<AiNodeId, AiNode>;
  readonly branch: AiNode;
  readonly accumulator: RuntimeAccumulator;
  readonly lifecycle: AiGraphLifecycleEvent[];
  readonly consumedEventIds: string[];
  reactiveAbort?: AiReactiveAbortTrace;
}

type ExecutionOutcome =
  | { readonly kind: 'success'; readonly reason: string; readonly reasonRu: string }
  | { readonly kind: 'failure'; readonly reason: string; readonly reasonRu: string }
  | { readonly kind: 'cancelled'; readonly reason: string; readonly reasonRu: string; readonly details?: ActionDetails }
  | { readonly kind: 'active'; readonly status: 'running' | 'waiting'; readonly node: AiNode; readonly startedAtMs: number; readonly state?: unknown; readonly frames: readonly AiCompositeFrame[]; readonly reason: string; readonly reasonRu: string; readonly details?: ActionDetails };

interface ActionDetails {
  readonly targetKey?: string;
  readonly targetPosition?: GridPosition;
  readonly distanceRemainingCells?: number;
  readonly actionToken?: string;
  readonly activeSubgraphId?: string;
  readonly activeSubgraphName?: string;
  readonly activeSubgraphNameRu?: string;
  readonly activeSubgraphPath?: string;
}

export function shouldUseCompositeGraphRuntime(
  graph: AiGraph,
  state?: AiGraphExecutionState,
): boolean {
  if (state?.frames !== undefined) return true;
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const parents = new Map<AiNodeId, AiNode[]>();
  for (const node of graph.nodes) {
    for (const childId of node.children ?? []) {
      const list = parents.get(childId) ?? [];
      list.push(node);
      parents.set(childId, list);
    }
  }

  for (const node of graph.nodes) {
    if (node.type === 'Reload' || node.type === 'WaitForEvent' || isSubgraphRuntimeNode(node) || node.type === 'ReactiveSequence' || node.type === 'Timeout' || node.type === 'Retry') return true;
    if (node.type === 'Selector' && hasStatefulDescendant(nodes, node.id, true)) return true;
    if (node.type === 'Sequence' && hasStatefulDescendant(nodes, node.id, true)) return true;
    if (node.type === 'SequenceWithMemory') {
      const hasNestedComposite = (node.children ?? []).some((childId) => {
        const child = nodes.get(childId);
        return child?.type === 'SequenceWithMemory'
          || child?.type === 'Selector'
          || child?.type === 'Sequence'
          || child?.type === 'ReactiveSequence'
          || child?.type === 'UtilitySelector'
          || child?.type === 'Timeout'
          || child?.type === 'Retry';
      });
      if (hasNestedComposite) return true;
    }
    if (DEFAULT_AI_ACTION_REGISTRY.has(String(node.type))) {
      const directParents = parents.get(node.id) ?? [];
      if (directParents.length === 0 || directParents.some((parent) => parent.type !== 'SequenceWithMemory')) {
        return true;
      }
    }
  }
  return false;
}

export function runAiCompositeGraphRuntime(input: AiGraphRuntimeInput): AiGraphRuntimeResult {
  const nodes = new Map(input.graph.nodes.map((node) => [node.id, node]));

  if (input.executionState) {
    const validation = validateCompositeState(input, nodes);
    if (!validation.valid || !validation.branch || !validation.activeNode || !validation.frames) {
      const reason = validation.reason ?? 'Saved composite runtime state is invalid.';
      const reasonRu = validation.reasonRu ?? 'Сохранённое состояние составного runtime недействительно.';
      return standaloneResult(input, input.executionState.branchNodeId, validation.branch, 'failure', reason, reasonRu, {
        effects: cleanupState(input, validation.activeNode),
        trace: [{
          nodeId: input.executionState.activeNodeId,
          nodeType: validation.activeNode ? String(validation.activeNode.type) : 'unknown',
          status: 'fail',
          reason,
          reasonRu,
        }],
        details: detailsFromState(input.executionState, input.blackboard),
      });
    }

    const environment = makeEnvironment(input, validation.branch, nodes);
    if (input.cancel) {
      const cancelled = cancelActiveAction(environment, validation.activeNode, input.executionState);
      return resultFromOutcome(environment, cancelled);
    }

    const expiredTimeout = findExpiredTimeoutFrame(validation.frames, input.nowMs);
    if (expiredTimeout) {
      const timedOut = cancelActiveAction(environment, validation.activeNode, input.executionState, {
        reason: `Timeout ${expiredTimeout.nodeId} expired.`,
        reasonRu: `Истекло максимальное время выполнения «${expiredTimeout.nodeId}».`,
      });
      if (timedOut.kind === 'failure') return resultFromOutcome(environment, timedOut);
      const failed = settle(environment, failure(
        `Timeout ${expiredTimeout.nodeId} expired.`,
        `Истекло максимальное время выполнения «${expiredTimeout.nodeId}».`,
      ), validation.frames);
      return resultFromOutcome(environment, failed);
    }

    const reactive = evaluateAiReactiveAbort({
      graph: input.graph,
      executionState: input.executionState,
      blackboard: input.blackboard,
      events: input.events ?? [],
      nowMs: input.nowMs,
      cooldowns: input.cooldowns,
      tacticalHost: input.tacticalHost,
    });
    environment.consumedEventIds.push(...reactive.consumedEventIds);
    if (reactive.shouldAbort && reactive.trace) {
      environment.reactiveAbort = reactive.trace;
      const cancelled = cancelActiveAction(
        environment,
        validation.activeNode,
        input.executionState,
        { reason: reactive.reason ?? reactive.trace.reason, reasonRu: reactive.reasonRu ?? reactive.trace.reasonRu },
      );
      if (cancelled.kind === 'failure') return resultFromOutcome(environment, cancelled);
      environment.reactiveAbort = { ...environment.reactiveAbort, cleanupOutcome: 'completed' };
      const switched = settle(
        environment,
        failure(reactive.reason ?? reactive.trace.reason, reactive.reasonRu ?? reactive.trace.reasonRu),
        validation.frames,
      );
      return resultFromOutcome(environment, switched);
    }

    const resumed = resumeActiveAction(environment, validation.activeNode, validation.frames, input.executionState);
    return resultFromOutcome(environment, resumed);
  }

  const selection = evaluateUtilityGraph(input, input.graph, input.graph.rootNodeId);
  if (!selection.ok) return wrapInstant(selection, 'failure');
  const branch = nodes.get(selection.selectedBranchNodeId);
  if (!branch) {
    return standaloneResult(
      input,
      selection.selectedBranchNodeId,
      undefined,
      'failure',
      'Selected AI branch is missing from the source graph.',
      'Выбранная ветка ИИ отсутствует в исходном графе.',
      { trace: runtimeTrace(selection.trace) },
    );
  }

  const environment = makeEnvironment(input, branch, nodes, selection);
  const entry = findStatefulEntry(nodes, branch.id);
  if (!entry) return resultFromOutcome(environment, success('Selected branch completed immediately.', 'Выбранная ветвь завершилась мгновенно.'));
  return resultFromOutcome(environment, enterNode(environment, entry.id, []));
}

function makeEnvironment(
  input: AiGraphRuntimeInput,
  branch: AiNode,
  nodes: Map<AiNodeId, AiNode>,
  selection?: AiGraphRunnerResult,
): RuntimeEnvironment {
  return {
    input,
    nodes,
    branch,
    accumulator: {
      blackboard: cloneBlackboard(selection?.blackboard ?? input.blackboard),
      cooldowns: { ...(selection?.cooldowns ?? input.cooldowns ?? {}) },
      effects: [...(selection?.effects ?? [])],
      trace: runtimeTrace(selection?.trace ?? []),
      scores: selection?.scores ?? [],
    },
    lifecycle: [],
    consumedEventIds: [],
  };
}

function enterNode(
  environment: RuntimeEnvironment,
  nodeId: AiNodeId,
  frames: readonly AiCompositeFrame[],
): ExecutionOutcome {
  const node = environment.nodes.get(nodeId);
  if (!node) return failure(`Runtime node ${nodeId} is missing.`, `Нода runtime ${nodeId} отсутствует.`);

  if (node.type === 'Timeout') return enterTimeout(environment, node, frames);
  if (node.type === 'Retry') return enterRetry(environment, node, frames);
  if (isSubgraphRuntimeNode(node)) return startSubgraph(environment, node, frames);

  const actionLifecycle = DEFAULT_AI_ACTION_REGISTRY.get(String(node.type));
  if (actionLifecycle) return startAction(environment, node, frames, actionLifecycle);

  if (node.type === 'UtilitySelector') return enterUtility(environment, node, frames);
  if (node.type === 'Selector') return enterSelector(environment, node, frames, 0);
  if (node.type === 'ReactiveSequence') return enterSequence(environment, node, frames, 0, 'reactive_sequence');
  if (node.type === 'SequenceWithMemory' || node.type === 'Sequence' || node.type === 'Root') {
    return enterSequence(environment, node, frames, 0, 'sequence');
  }
  if (node.type === 'ActionBranch') return enterSequence(environment, node, frames, 0, 'action_branch');

  if (hasStatefulDescendant(environment.nodes, node.id, false)) {
    const own = runInstantNode(environment, node, true);
    if (!own.ok) return failure(
      `Node ${node.id} failed before its stateful child.`,
      `Нода «${nodeNameRu(node)}» провалилась перед длительным дочерним действием.`,
    );
    return enterSequence(environment, node, frames, 0, 'action_branch');
  }

  const instant = runInstantNode(environment, node, false);
  return instant.ok
    ? settle(environment, success(`Node ${node.id} completed.`, `Нода «${nodeNameRu(node)}» завершена.`), frames)
    : settle(environment, failure(`Node ${node.id} failed.`, `Нода «${nodeNameRu(node)}» провалилась.`), frames);
}

function isSubgraphRuntimeNode(node: AiNode): boolean {
  return node.type === 'Subgraph' || node.type === 'RunPlan';
}

function resolveSubgraphId(node: AiNode): string {
  if (node.type !== 'RunPlan') return typeof node.parameters?.subgraphId === 'string' ? node.parameters.subgraphId : '';
  return node.parameters?.planKind === 'FollowMoveOrder' ? 'move_and_observe' : 'take_cover';
}

function prepareSubgraphNode(node: AiNode, subgraphId: string): AiNode {
  if (node.type !== 'RunPlan') return node;
  const followOrder = node.parameters?.planKind === 'FollowMoveOrder';
  const inputPort = followOrder ? 'destination' : 'cover_position';
  const configuredTargetKey = typeof node.parameters?.targetKey === 'string' ? node.parameters.targetKey.trim() : '';
  const targetKey = configuredTargetKey || (followOrder ? 'order_target_position' : 'best_cover_position');
  return {
    ...node,
    parameters: { ...(node.parameters ?? {}), subgraphId },
    inputBindings: {
      ...(node.inputBindings ?? {}),
      [inputPort]: node.inputBindings?.[inputPort] ?? { source: 'blackboard', key: targetKey },
    },
  };
}

function startSubgraph(
  environment: RuntimeEnvironment,
  node: AiNode,
  frames: readonly AiCompositeFrame[],
): ExecutionOutcome {
  const subgraphId = resolveSubgraphId(node);
  const definition = DEFAULT_AI_SUBGRAPH_REGISTRY.get(subgraphId);
  if (!definition) return failure(`Unknown AI subgraph ${subgraphId}.`, `Неизвестный подграф ИИ «${subgraphId}».`);
  const executableNode = prepareSubgraphNode(node, subgraphId);
  const localBlackboard = createSubgraphLocalBlackboard(definition, executableNode, environment.accumulator.blackboard);
  return executeSubgraph(environment, executableNode, frames, definition, {
    kind: 'subgraph',
    subgraphId,
    startedAtMs: environment.input.nowMs,
    localBlackboard,
  });
}

function resumeSubgraph(
  environment: RuntimeEnvironment,
  node: AiNode,
  frames: readonly AiCompositeFrame[],
  state: AiSubgraphExecutionState,
): ExecutionOutcome {
  const definition = DEFAULT_AI_SUBGRAPH_REGISTRY.get(state.subgraphId);
  if (!definition) return failure(`Unknown AI subgraph ${state.subgraphId}.`, `Неизвестный подграф ИИ «${state.subgraphId}».`);
  const executableNode = prepareSubgraphNode(node, state.subgraphId);
  return executeSubgraph(environment, executableNode, frames, definition, {
    ...cloneAiSubgraphExecutionState(state),
    localBlackboard: refreshSubgraphRuntimeValues(environment.accumulator.blackboard, state.localBlackboard),
  });
}

function cancelSubgraph(
  environment: RuntimeEnvironment,
  _node: AiNode,
  state: AiSubgraphExecutionState,
  requestedCancellation?: { readonly reason: string; readonly reasonRu?: string },
): ExecutionOutcome {
  const definition = DEFAULT_AI_SUBGRAPH_REGISTRY.get(state.subgraphId);
  if (!definition) return failure(`Unknown AI subgraph ${state.subgraphId}.`, `Неизвестный подграф ИИ «${state.subgraphId}».`);
  if (!state.nestedExecutionState) return cancelled(
    requestedCancellation?.reason ?? 'Subgraph cancelled.',
    requestedCancellation?.reasonRu ?? 'Подграф отменён.',
    subgraphDetails(definition.id, definition.label, definition.labelRu, environment.input.graph.id),
  );
  const nested = runAiCompositeGraphRuntime({
    graph: definition.graph,
    unitId: environment.input.unitId,
    blackboard: refreshSubgraphRuntimeValues(environment.accumulator.blackboard, state.localBlackboard),
    cooldowns: environment.accumulator.cooldowns,
    nowMs: environment.input.nowMs,
    events: environment.input.events,
    executionState: state.nestedExecutionState,
    cancel: requestedCancellation ?? environment.input.cancel ?? { reason: 'Parent subgraph cancelled.', reasonRu: 'Родительский подграф отменён.' },
    tacticalHost: environment.input.tacticalHost,
  });
  mergeSubgraphResult(environment, definition.id, nested);
  const details = { ...detailsFromNested(nested), ...subgraphDetails(definition.id, definition.label, definition.labelRu, environment.input.graph.id) };
  return nested.status === 'failure'
    ? failure(nested.explanation, nested.explanationRu ?? nested.explanation)
    : cancelled(nested.explanation, nested.explanationRu ?? nested.explanation, details);
}

function executeSubgraph(
  environment: RuntimeEnvironment,
  node: AiNode,
  frames: readonly AiCompositeFrame[],
  definition: ReturnType<typeof DEFAULT_AI_SUBGRAPH_REGISTRY.require>,
  state: AiSubgraphExecutionState,
): ExecutionOutcome {
  const nested = runAiCompositeGraphRuntime({
    graph: definition.graph,
    unitId: environment.input.unitId,
    blackboard: state.localBlackboard,
    cooldowns: environment.accumulator.cooldowns,
    nowMs: environment.input.nowMs,
    events: environment.input.events,
    executionState: state.nestedExecutionState,
    tacticalHost: environment.input.tacticalHost,
  });
  mergeSubgraphResult(environment, definition.id, nested);
  const details = { ...detailsFromNested(nested), ...subgraphDetails(definition.id, definition.label, definition.labelRu, environment.input.graph.id) };
  if (nested.status === 'running' || nested.status === 'waiting') {
    environment.lifecycle.push(lifecycleEvent(state.nestedExecutionState ? 'update' : 'start', node, environment.input.nowMs, nested.explanation, nested.explanationRu));
    environment.accumulator.trace.push({
      ...traceItem(node, nested.status, nested.explanation, nested.explanationRu),
      path: `${environment.input.graph.id} / ${definition.id}`,
    });
    return {
      kind: 'active',
      status: nested.status,
      node,
      startedAtMs: state.startedAtMs,
      state: {
        ...state,
        localBlackboard: cloneBlackboard(nested.blackboard),
        nestedExecutionState: nested.executionState,
      } satisfies AiSubgraphExecutionState,
      frames: cloneCompositeFrames(frames),
      reason: nested.explanation,
      reasonRu: nested.explanationRu ?? nested.explanation,
      details,
    };
  }
  if (nested.status === 'cancelled') {
    environment.lifecycle.push(lifecycleEvent('cancel', node, environment.input.nowMs, nested.explanation, nested.explanationRu));
    return cancelled(nested.explanation, nested.explanationRu ?? nested.explanation, details);
  }
  environment.lifecycle.push(lifecycleEvent('complete', node, environment.input.nowMs, nested.explanation, nested.explanationRu));
  if (nested.status === 'success') {
    environment.accumulator.blackboard = applySubgraphOutputs(definition, node, nested.blackboard, environment.accumulator.blackboard);
    environment.accumulator.trace.push({ ...traceItem(node, 'complete', nested.explanation, nested.explanationRu), path: `${environment.input.graph.id} / ${definition.id}` });
    return settle(environment, success(nested.explanation, nested.explanationRu ?? nested.explanation), frames);
  }
  environment.accumulator.trace.push({ ...traceItem(node, 'fail', nested.explanation, nested.explanationRu), path: `${environment.input.graph.id} / ${definition.id}` });
  return settle(environment, failure(nested.explanation, nested.explanationRu ?? nested.explanation), frames);
}

function mergeSubgraphResult(environment: RuntimeEnvironment, subgraphId: string, nested: AiGraphRuntimeResult): void {
  environment.accumulator.effects.push(...nested.effects);
  environment.accumulator.cooldowns = { ...nested.cooldowns };
  environment.accumulator.scores = [...environment.accumulator.scores, ...nested.scores];
  for (const eventId of nested.consumedEventIds ?? []) if (!environment.consumedEventIds.includes(eventId)) environment.consumedEventIds.push(eventId);
  environment.accumulator.trace.push(...nested.trace.map((item) => ({
    ...item,
    path: `${environment.input.graph.id} / ${subgraphId} / ${item.path ?? item.nodeId}`,
  })));
}

function detailsFromNested(nested: AiGraphRuntimeResult): ActionDetails {
  return {
    targetKey: nested.targetKey,
    targetPosition: nested.targetPosition ? { ...nested.targetPosition } : undefined,
    distanceRemainingCells: nested.distanceRemainingCells,
    actionToken: nested.actionToken,
  };
}

function subgraphDetails(id: string, name: string, nameRu: string, parentGraphId: string): ActionDetails {
  return {
    activeSubgraphId: id,
    activeSubgraphName: name,
    activeSubgraphNameRu: nameRu,
    activeSubgraphPath: `${parentGraphId} / ${id}`,
  };
}

function enterTimeout(
  environment: RuntimeEnvironment,
  node: AiNode,
  frames: readonly AiCompositeFrame[],
): ExecutionOutcome {
  const childId = node.children?.[0];
  if (!childId) return failure(`Timeout ${node.id} has no child.`, `У ограничения времени «${nodeNameRu(node)}» нет дочерней ноды.`);
  const seconds = typeof node.parameters?.timeoutSeconds === 'number' && Number.isFinite(node.parameters.timeoutSeconds)
    ? Math.max(0, node.parameters.timeoutSeconds)
    : 5;
  const frame: AiCompositeFrame = {
    kind: 'timeout',
    nodeId: node.id,
    childIndex: 0,
    startedAtMs: environment.input.nowMs,
    timeoutMs: Math.round(seconds * 1000),
  };
  return enterNode(environment, childId, [...frames, frame]);
}

function enterRetry(
  environment: RuntimeEnvironment,
  node: AiNode,
  frames: readonly AiCompositeFrame[],
): ExecutionOutcome {
  const childId = node.children?.[0];
  if (!childId) return failure(`Retry ${node.id} has no child.`, `У ноды повторения «${nodeNameRu(node)}» нет дочерней ноды.`);
  const maxAttempts = typeof node.parameters?.maxAttempts === 'number' && Number.isFinite(node.parameters.maxAttempts)
    ? Math.max(1, Math.floor(node.parameters.maxAttempts))
    : 3;
  const frame: AiCompositeFrame = { kind: 'retry', nodeId: node.id, childIndex: 0, attempt: 1, maxAttempts };
  return enterNode(environment, childId, [...frames, frame]);
}

function enterSequence(
  environment: RuntimeEnvironment,
  node: AiNode,
  frames: readonly AiCompositeFrame[],
  childIndex: number,
  kind: 'sequence' | 'reactive_sequence' | 'action_branch',
): ExecutionOutcome {
  const children = node.children ?? [];
  if (childIndex >= children.length) {
    return settle(environment, success(
      `Composite ${node.id} completed.`,
      `Составная нода «${nodeNameRu(node)}» завершена.`,
    ), frames);
  }
  const frame: AiCompositeFrame = kind === 'sequence'
    ? { kind: 'sequence', nodeId: node.id, childIndex }
    : kind === 'reactive_sequence'
      ? { kind: 'reactive_sequence', nodeId: node.id, childIndex }
      : { kind: 'action_branch', nodeId: node.id, childIndex };
  return enterNode(environment, children[childIndex], [...frames, frame]);
}

function enterSelector(
  environment: RuntimeEnvironment,
  node: AiNode,
  frames: readonly AiCompositeFrame[],
  childIndex: number,
): ExecutionOutcome {
  const children = node.children ?? [];
  if (childIndex >= children.length) {
    return settle(environment, failure(
      `Selector ${node.id} found no passing child.`,
      `Селектор «${nodeNameRu(node)}» не нашёл подходящего шага.`,
    ), frames);
  }
  const frame: AiCompositeFrame = { kind: 'selector', nodeId: node.id, childIndex };
  return enterNode(environment, children[childIndex], [...frames, frame]);
}

function enterUtility(
  environment: RuntimeEnvironment,
  node: AiNode,
  frames: readonly AiCompositeFrame[],
): ExecutionOutcome {
  const selection = evaluateUtilityGraph(environment.input, subgraph(environment.input.graph, node.id, environment.nodes), node.id, environment.accumulator);
  if (!selection.ok) {
    return settle(environment, failure(
      `UtilitySelector ${node.id} found no passing branch.`,
      `UtilitySelector «${nodeNameRu(node)}» не нашёл подходящую ветвь.`,
    ), frames);
  }
  const selected = environment.nodes.get(selection.selectedBranchNodeId);
  if (!selected) return settle(environment, failure('Selected utility branch is missing.', 'Выбранная Utility-ветвь отсутствует.'), frames);
  const frame: AiCompositeFrame = {
    kind: 'utility_execution',
    nodeId: node.id,
    selectedBranchNodeId: selected.id,
    selectedScoreRevision: environment.accumulator.scores.length,
  };
  const entry = findStatefulEntry(environment.nodes, selected.id);
  if (!entry) {
    return settle(environment, success(
      `Utility branch ${selected.id} completed immediately.`,
      `Utility-ветвь «${nodeNameRu(selected)}» завершилась мгновенно.`,
    ), frames);
  }
  return enterNode(environment, entry.id, [...frames, frame]);
}

function startAction(
  environment: RuntimeEnvironment,
  node: AiNode,
  frames: readonly AiCompositeFrame[],
  lifecycle: AiNodeLifecycle<unknown>,
): ExecutionOutcome {
  const context = actionContext(environment, node, environment.input.nowMs);
  const tick = runAiActionLifecycle({ lifecycle, context, phase: 'start' });
  environment.accumulator.effects.push(...(tick.effects ?? []));
  return handleActionTick(environment, node, frames, environment.input.nowMs, tick, false);
}

function resumeActiveAction(
  environment: RuntimeEnvironment,
  node: AiNode,
  frames: readonly AiCompositeFrame[],
  executionState: AiGraphExecutionState,
): ExecutionOutcome {
  if (isSubgraphRuntimeNode(node) && isAiSubgraphExecutionState(executionState.activeData)) {
    return resumeSubgraph(environment, node, frames, executionState.activeData);
  }
  const lifecycle = DEFAULT_AI_ACTION_REGISTRY.get(String(node.type));
  if (!lifecycle) return failure('Active action is not registered.', 'Активное действие не зарегистрировано.');
  const actionState = resolveActionState(node, executionState);
  if (actionState === undefined) return failure('Active action state is invalid.', 'Состояние активного действия недействительно.');
  const context = actionContext(environment, node, executionState.activeNodeStartedAtMs);
  const tick = runAiActionLifecycle({ lifecycle, context, phase: 'update', state: actionState });
  environment.accumulator.effects.push(...(tick.effects ?? []));
  return handleActionTick(environment, node, frames, executionState.activeNodeStartedAtMs, tick, true);
}

function cancelActiveAction(
  environment: RuntimeEnvironment,
  node: AiNode,
  executionState: AiGraphExecutionState,
  requestedCancellation?: { readonly reason: string; readonly reasonRu?: string },
): ExecutionOutcome {
  if (isSubgraphRuntimeNode(node) && isAiSubgraphExecutionState(executionState.activeData)) {
    return cancelSubgraph(environment, node, executionState.activeData, requestedCancellation);
  }
  const lifecycle = DEFAULT_AI_ACTION_REGISTRY.get(String(node.type));
  const actionState = resolveActionState(node, executionState);
  if (!lifecycle || actionState === undefined) return failure('Active action cannot be cancelled safely.', 'Активное действие нельзя безопасно отменить.');
  const cancellation = requestedCancellation
    ?? environment.input.cancel
    ?? { reason: 'AI action cancelled.', reasonRu: 'Действие ИИ отменено.' };
  const context = actionContext(environment, node, executionState.activeNodeStartedAtMs);
  const tick = runAiActionLifecycle({ lifecycle, context, phase: 'cancel', state: actionState, cancellation });
  environment.accumulator.effects.push(...(tick.effects ?? []));
  environment.lifecycle.push(lifecycleEvent(tick.status === 'failure' ? 'complete' : 'cancel', node, environment.input.nowMs, tick.reason, tick.reasonRu));
  environment.accumulator.trace.push(traceItem(node, tick.status === 'failure' ? 'fail' : 'cancelled', tick.reason, tick.reasonRu));
  return tick.status === 'failure'
    ? failure(tick.reason, tick.reasonRu ?? tick.reason)
    : cancelled(tick.reason, tick.reasonRu ?? cancellation.reasonRu ?? tick.reason, detailsFromTick(tick));
}

function handleActionTick(
  environment: RuntimeEnvironment,
  node: AiNode,
  frames: readonly AiCompositeFrame[],
  startedAtMs: number,
  tick: AiActionTickResult<unknown>,
  resumed: boolean,
): ExecutionOutcome {
  const phase = resumed ? 'update' : 'start';
  const consumedEventIds = readStringArray(tick.details?.consumedEventIds);
  for (const eventId of consumedEventIds) {
    if (!environment.consumedEventIds.includes(eventId)) environment.consumedEventIds.push(eventId);
  }
  if (tick.status === 'running' || tick.status === 'waiting') {
    environment.lifecycle.push(lifecycleEvent(phase, node, environment.input.nowMs, tick.reason, tick.reasonRu));
    environment.accumulator.trace.push(traceItem(node, tick.status, tick.reason, tick.reasonRu));
    return {
      kind: 'active',
      status: tick.status,
      node,
      startedAtMs,
      state: tick.state,
      frames: cloneCompositeFrames(frames),
      reason: tick.reason,
      reasonRu: tick.reasonRu ?? tick.reason,
      details: detailsFromTick(tick),
    };
  }
  if (tick.status === 'cancelled') {
    environment.lifecycle.push(lifecycleEvent('cancel', node, environment.input.nowMs, tick.reason, tick.reasonRu));
    environment.accumulator.trace.push(traceItem(node, 'cancelled', tick.reason, tick.reasonRu));
    return cancelled(tick.reason, tick.reasonRu ?? tick.reason, detailsFromTick(tick));
  }
  if (tick.status === 'success') {
    environment.lifecycle.push(lifecycleEvent('complete', node, environment.input.nowMs, tick.reason, tick.reasonRu));
    environment.accumulator.trace.push(traceItem(node, 'complete', tick.reason, tick.reasonRu));
    return settle(environment, success(tick.reason, tick.reasonRu ?? tick.reason), frames);
  }
  environment.lifecycle.push(lifecycleEvent('complete', node, environment.input.nowMs, tick.reason, tick.reasonRu));
  environment.accumulator.trace.push(traceItem(node, 'fail', tick.reason, tick.reasonRu));
  return settle(environment, failure(tick.reason, tick.reasonRu ?? tick.reason), frames);
}

function settle(
  environment: RuntimeEnvironment,
  initial: Exclude<ExecutionOutcome, { kind: 'active' | 'cancelled' }>,
  initialFrames: readonly AiCompositeFrame[],
): ExecutionOutcome {
  let outcome = initial;
  let frames = cloneCompositeFrames(initialFrames);
  while (frames.length > 0) {
    const frame = frames[frames.length - 1];
    const parentFrames = frames.slice(0, -1);
    const parent = environment.nodes.get(frame.nodeId);
    if (!parent) return failure(`Composite frame ${frame.nodeId} is stale.`, `Кадр составной ноды ${frame.nodeId} устарел.`);

    if (frame.kind === 'utility_execution' || frame.kind === 'timeout') {
      frames = parentFrames;
      continue;
    }

    if (frame.kind === 'retry') {
      if (outcome.kind === 'failure' && frame.attempt < frame.maxAttempts) {
        const childId = parent.children?.[0];
        if (!childId) {
          outcome = failure(`Retry ${parent.id} has no child.`, `У ноды повторения «${nodeNameRu(parent)}» нет дочерней ноды.`);
          frames = parentFrames;
          continue;
        }
        const nextFrame: AiCompositeFrame = { ...frame, attempt: frame.attempt + 1 };
        return enterNode(environment, childId, [...parentFrames, nextFrame]);
      }
      frames = parentFrames;
      continue;
    }

    if (frame.kind === 'selector') {
      if (outcome.kind === 'success') {
        frames = parentFrames;
        continue;
      }
      const nextIndex = frame.childIndex + 1;
      if (nextIndex < (parent.children?.length ?? 0)) {
        const nextChildId = parent.children?.[nextIndex] ?? '';
        if (environment.reactiveAbort && !environment.reactiveAbort.newBranchNodeId) {
          environment.reactiveAbort = { ...environment.reactiveAbort, newBranchNodeId: nextChildId };
        }
        return enterNode(environment, nextChildId, [
          ...parentFrames,
          withFrameChildIndex(frame, nextIndex),
        ]);
      }
      outcome = failure(
        `Selector ${parent.id} exhausted all children.`,
        `Селектор «${nodeNameRu(parent)}» перебрал все варианты.`,
      );
      frames = parentFrames;
      continue;
    }

    if (outcome.kind === 'failure') {
      frames = parentFrames;
      continue;
    }

    const nextIndex = frame.childIndex + 1;
    if (nextIndex < (parent.children?.length ?? 0)) {
      return enterNode(environment, parent.children?.[nextIndex] ?? '', [
        ...parentFrames,
        withFrameChildIndex(frame, nextIndex),
      ]);
    }
    frames = parentFrames;
  }
  return outcome;
}

function resultFromOutcome(environment: RuntimeEnvironment, outcome: ExecutionOutcome): AiGraphRuntimeResult {
  const base = {
    unitId: environment.input.unitId,
    graphId: environment.input.graph.id,
    selectedBranchNodeId: environment.branch.id,
    selectedBranchName: nodeName(environment.branch),
    selectedBranchNameRu: nodeNameRu(environment.branch),
    scores: environment.accumulator.scores,
    effects: environment.accumulator.effects,
    blackboard: environment.accumulator.blackboard,
    cooldowns: environment.accumulator.cooldowns,
    trace: environment.accumulator.trace,
    lifecycle: environment.lifecycle,
    consumedEventIds: [...environment.consumedEventIds],
    reactiveAbort: environment.reactiveAbort ? { ...environment.reactiveAbort } : undefined,
  };

  if (outcome.kind === 'active') {
    const legacy = legacyFrameFields(outcome.frames, outcome.node.id);
    const executionState: AiGraphExecutionState = {
      version: 1,
      graphId: environment.input.graph.id,
      unitId: environment.input.unitId,
      branchNodeId: environment.branch.id,
      sequenceNodeId: legacy.sequenceNodeId,
      childIndex: legacy.childIndex,
      activeNodeId: outcome.node.id,
      activeNodeStartedAtMs: outcome.startedAtMs,
      lastUpdatedAtMs: environment.input.nowMs,
      status: outcome.status,
      activeData: toExecutionData(outcome.state),
      frames: cloneCompositeFrames(outcome.frames),
    };
    return {
      ...base,
      ok: true,
      status: outcome.status,
      explanation: outcome.reason,
      explanationRu: outcome.reasonRu,
      executionState,
      reactiveObserverDefinitions: deriveReactiveObserverDefinitions(environment.input.graph, executionState),
      activeNodeId: outcome.node.id,
      activeNodeName: nodeName(outcome.node),
      activeNodeNameRu: nodeNameRu(outcome.node),
      elapsedMs: Math.max(0, environment.input.nowMs - outcome.startedAtMs),
      ...outcome.details,
    };
  }

  if (outcome.kind === 'cancelled') {
    return {
      ...base,
      ok: false,
      status: 'cancelled',
      explanation: outcome.reason,
      explanationRu: outcome.reasonRu,
      cancellationReason: outcome.reason,
      cancellationReasonRu: outcome.reasonRu,
      reactiveObserverDefinitions: [],
      ...outcome.details,
    };
  }

  return {
    ...base,
    ok: outcome.kind === 'success',
    status: outcome.kind,
    explanation: outcome.reason,
    explanationRu: outcome.reasonRu,
    reactiveObserverDefinitions: [],
  };
}

function validateCompositeState(
  input: AiGraphRuntimeInput,
  nodes: Map<AiNodeId, AiNode>,
): {
  readonly valid: boolean;
  readonly branch?: AiNode;
  readonly activeNode?: AiNode;
  readonly frames?: AiCompositeFrame[];
  readonly reason?: string;
  readonly reasonRu?: string;
} {
  const state = input.executionState;
  if (!state) return { valid: false, reason: 'Execution state is missing.', reasonRu: 'Состояние выполнения отсутствует.' };
  const branch = nodes.get(state.branchNodeId);
  const activeNode = nodes.get(state.activeNodeId);
  const frames = normalizeCompositeFrames(state.frames);
  if (state.version !== 1 || state.graphId !== input.graph.id || state.unitId !== input.unitId) {
    return { valid: false, branch, activeNode, reason: 'Composite state belongs to another graph or soldier.', reasonRu: 'Составное состояние относится к другому графу или бойцу.' };
  }
  if (!branch || !activeNode || !frames) {
    return { valid: false, branch, activeNode, reason: 'Composite state references missing nodes or invalid frames.', reasonRu: 'Составное состояние ссылается на отсутствующие ноды или неверные кадры.' };
  }
  for (const frame of frames) {
    const node = nodes.get(frame.nodeId);
    if (!node) return { valid: false, branch, activeNode, frames, reason: `Frame node ${frame.nodeId} is missing.`, reasonRu: `Нода кадра ${frame.nodeId} отсутствует.` };
    if (frame.kind !== 'utility_execution' && frame.childIndex >= (node.children?.length ?? 0)) {
      return { valid: false, branch, activeNode, frames, reason: `Frame child index is invalid for ${frame.nodeId}.`, reasonRu: `Номер шага кадра ${frame.nodeId} недействителен.` };
    }
  }
  if (isSubgraphRuntimeNode(activeNode)) {
    return isAiSubgraphExecutionState(state.activeData)
      ? { valid: true, branch, activeNode, frames }
      : { valid: false, branch, activeNode, frames, reason: 'Active subgraph state is invalid.', reasonRu: 'Состояние активного подграфа недействительно.' };
  }
  const lifecycle = DEFAULT_AI_ACTION_REGISTRY.get(String(activeNode.type));
  const actionState = resolveActionState(activeNode, state);
  if (!lifecycle || actionState === undefined || (lifecycle.validateState && !lifecycle.validateState(actionState))) {
    return { valid: false, branch, activeNode, frames, reason: 'Active action state is invalid.', reasonRu: 'Состояние активного действия недействительно.' };
  }
  return { valid: true, branch, activeNode, frames };
}

function cleanupState(input: AiGraphRuntimeInput, activeNode: AiNode | undefined): readonly AiGraphEffect[] {
  const state = input.executionState;
  if (!state || !activeNode) return [];
  if (isSubgraphRuntimeNode(activeNode) && isAiSubgraphExecutionState(state.activeData)) {
    const definition = DEFAULT_AI_SUBGRAPH_REGISTRY.get(state.activeData.subgraphId);
    if (!definition || !state.activeData.nestedExecutionState) return [];
    return runAiCompositeGraphRuntime({
      graph: definition.graph, unitId: input.unitId, blackboard: state.activeData.localBlackboard,
      cooldowns: input.cooldowns, nowMs: input.nowMs, events: input.events, tacticalHost: input.tacticalHost,
      executionState: state.activeData.nestedExecutionState, cancel: { reason: 'Invalid parent state cleanup.', reasonRu: 'Очистка повреждённого состояния родителя.' },
    }).effects;
  }
  const lifecycle = DEFAULT_AI_ACTION_REGISTRY.get(String(activeNode.type));
  const actionState = resolveActionState(activeNode, state);
  if (!lifecycle || actionState === undefined) return [];
  try {
    return lifecycle.cleanup(actionContext({
      input,
      nodes: new Map(input.graph.nodes.map((node) => [node.id, node])),
      branch: activeNode,
      accumulator: { blackboard: input.blackboard, cooldowns: { ...(input.cooldowns ?? {}) }, effects: [], trace: [], scores: [] },
      lifecycle: [],
      consumedEventIds: [],
    }, activeNode, state.activeNodeStartedAtMs), actionState, 'failure');
  } catch {
    return [];
  }
}

function runInstantNode(environment: RuntimeEnvironment, node: AiNode, ownOnly: boolean): AiGraphRunnerResult {
  const graph = ownOnly
    ? {
        version: environment.input.graph.version,
        id: `${environment.input.graph.id}:own:${node.id}`,
        name: `${environment.input.graph.name} own ${node.id}`,
        rootNodeId: node.id,
        blackboardDefaults: environment.input.graph.blackboardDefaults,
        nodes: [{ ...node, children: [] }],
      } satisfies AiGraph
    : subgraph(environment.input.graph, node.id, environment.nodes);
  const result = runAiGraph({
    graph,
    unitId: environment.input.unitId,
    blackboard: environment.accumulator.blackboard,
    cooldowns: environment.accumulator.cooldowns,
    nowMs: environment.input.nowMs,
    tacticalHost: environment.input.tacticalHost,
  });
  applyRunnerResult(environment.accumulator, result);
  return result;
}

function evaluateUtilityGraph(
  input: AiGraphRuntimeInput,
  graph: AiGraph,
  rootNodeId: AiNodeId,
  accumulator?: RuntimeAccumulator,
): AiGraphRunnerResult {
  const result = runAiGraph({
    graph: planningGraph({ ...graph, rootNodeId }),
    unitId: input.unitId,
    blackboard: accumulator?.blackboard ?? input.blackboard,
    cooldowns: accumulator?.cooldowns ?? input.cooldowns,
    nowMs: input.nowMs,
    tacticalHost: input.tacticalHost,
  });
  if (accumulator) applyRunnerResult(accumulator, result);
  return result;
}

function applyRunnerResult(accumulator: RuntimeAccumulator, value: AiGraphRunnerResult): void {
  accumulator.blackboard = cloneBlackboard(value.blackboard);
  accumulator.cooldowns = { ...value.cooldowns };
  accumulator.effects.push(...value.effects);
  accumulator.trace.push(...runtimeTrace(value.trace));
  accumulator.scores = [...accumulator.scores, ...value.scores];
}

function findStatefulEntry(nodes: Map<AiNodeId, AiNode>, startId: AiNodeId): AiNode | undefined {
  const visited = new Set<AiNodeId>();
  const visit = (id: AiNodeId): AiNode | undefined => {
    if (visited.has(id)) return undefined;
    visited.add(id);
    const node = nodes.get(id);
    if (!node) return undefined;
    if (DEFAULT_AI_ACTION_REGISTRY.has(String(node.type))) return node;
    if ((node.type === 'SequenceWithMemory' || node.type === 'Sequence' || node.type === 'ReactiveSequence' || node.type === 'Selector' || node.type === 'UtilitySelector' || node.type === 'Timeout' || node.type === 'Retry' || isSubgraphRuntimeNode(node))
      && hasStatefulDescendant(nodes, node.id, false)) return node;
    for (const childId of node.children ?? []) {
      const found = visit(childId);
      if (found) return found;
    }
    return undefined;
  };
  return visit(startId);
}

function hasStatefulDescendant(nodes: Map<AiNodeId, AiNode>, startId: AiNodeId, excludeRoot: boolean): boolean {
  const visited = new Set<AiNodeId>();
  const visit = (id: AiNodeId, root: boolean): boolean => {
    if (visited.has(id)) return false;
    visited.add(id);
    const node = nodes.get(id);
    if (!node) return false;
    if ((!root || !excludeRoot) && (DEFAULT_AI_ACTION_REGISTRY.has(String(node.type)) || node.type === 'Timeout' || node.type === 'Retry' || isSubgraphRuntimeNode(node))) return true;
    return (node.children ?? []).some((childId) => visit(childId, false));
  };
  return visit(startId, true);
}

function planningGraph(graph: AiGraph): AiGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => (
      node.type === 'SequenceWithMemory'
        || node.type === 'Sequence'
        || node.type === 'ReactiveSequence'
        || node.type === 'Selector'
        || node.type === 'Timeout'
        || node.type === 'Retry'
        || isSubgraphRuntimeNode(node)
        || DEFAULT_AI_ACTION_REGISTRY.has(String(node.type))
        ? { ...node, type: 'ActionBranch', children: [] }
        : node
    )),
  };
}

function subgraph(graph: AiGraph, rootNodeId: AiNodeId, nodes: Map<AiNodeId, AiNode>): AiGraph {
  return {
    version: graph.version,
    id: `${graph.id}:composite:${rootNodeId}`,
    name: `${graph.name} composite ${rootNodeId}`,
    nameRu: graph.nameRu ? `${graph.nameRu}: составное выполнение ${rootNodeId}` : undefined,
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
    for (const childId of node.children ?? []) visit(childId);
  };
  visit(rootNodeId);
  return result;
}

function actionContext(environment: RuntimeEnvironment, node: AiNode, startedAtMs: number): AiActionRuntimeContext {
  return {
    node,
    unitId: environment.input.unitId,
    nowMs: environment.input.nowMs,
    startedAtMs,
    blackboard: environment.accumulator.blackboard,
    events: environment.input.events ?? [],
  };
}

function resolveActionState(node: AiNode, state: AiGraphExecutionState): unknown | undefined {
  if (node.type === 'Wait') return createLegacyWaitActionState(node.parameters);
  if (node.type === 'MoveToBlackboardPosition' && isMoveToBlackboardPositionActionState(state.activeData)) return state.activeData;
  if (node.type === 'Reload' && isReloadActionState(state.activeData)) return state.activeData;
  if (node.type === 'WaitForEvent' && isWaitForEventActionState(state.activeData)) return state.activeData;
  if (node.type === 'Subgraph' && isAiSubgraphExecutionState(state.activeData)) return state.activeData;
  return state.activeData;
}

function toExecutionData(value: unknown): AiGraphExecutionData | undefined {
  if (isMoveToBlackboardPositionActionState(value)) return { ...value, target: { ...value.target } };
  if (isReloadActionState(value)) return { ...value };
  if (isWaitForEventActionState(value)) return { ...value };
  if (isAiSubgraphExecutionState(value)) return cloneAiSubgraphExecutionState(value);
  return undefined;
}

function legacyFrameFields(frames: readonly AiCompositeFrame[], activeNodeId: AiNodeId): { sequenceNodeId: AiNodeId; childIndex: number } {
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const frame = frames[index];
    if (frame.kind !== 'utility_execution') return { sequenceNodeId: frame.nodeId, childIndex: frame.childIndex };
  }
  return { sequenceNodeId: activeNodeId, childIndex: 0 };
}

function detailsFromTick(tick: AiActionTickResult<unknown>): ActionDetails {
  const details = tick.details ?? {};
  return {
    targetKey: typeof details.targetKey === 'string' ? details.targetKey : undefined,
    targetPosition: isGridPosition(details.targetPosition) ? { ...details.targetPosition } : undefined,
    distanceRemainingCells: isFiniteNumber(details.distanceRemainingCells) ? details.distanceRemainingCells : undefined,
    actionToken: typeof details.actionToken === 'string' ? details.actionToken : undefined,
  };
}

function detailsFromState(state: AiGraphExecutionState, blackboard: AiGraphRunnerBlackboard): ActionDetails {
  if (isAiSubgraphExecutionState(state.activeData)) {
    const definition = DEFAULT_AI_SUBGRAPH_REGISTRY.get(state.activeData.subgraphId);
    const nested = state.activeData.nestedExecutionState;
    const nestedDetails = nested ? detailsFromState(nested, state.activeData.localBlackboard) : {};
    return { ...nestedDetails, ...(definition ? subgraphDetails(definition.id, definition.label, definition.labelRu, state.graphId) : {}) };
  }
  if (!isMoveToBlackboardPositionActionState(state.activeData)) return {};
  const self = readPosition(blackboard.self_position);
  return {
    targetKey: state.activeData.targetKey,
    targetPosition: { ...state.activeData.target },
    distanceRemainingCells: self ? Math.hypot(state.activeData.target.x - self.x, state.activeData.target.y - self.y) : undefined,
    actionToken: state.activeData.actionToken,
  };
}

function standaloneResult(
  input: AiGraphRuntimeInput,
  branchId: AiNodeId,
  branch: AiNode | undefined,
  status: 'failure' | 'cancelled',
  reason: string,
  reasonRu: string,
  extra: {
    readonly effects?: readonly AiGraphEffect[];
    readonly trace?: readonly AiGraphRuntimeTraceItem[];
    readonly details?: ActionDetails;
  } = {},
): AiGraphRuntimeResult {
  return {
    ok: false,
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
    trace: extra.trace ?? [],
    explanation: reason,
    explanationRu: reasonRu,
    lifecycle: [],
    cancellationReason: status === 'cancelled' ? reason : undefined,
    cancellationReasonRu: status === 'cancelled' ? reasonRu : undefined,
    ...extra.details,
  };
}

function wrapInstant(value: AiGraphRunnerResult, status: 'success' | 'failure'): AiGraphRuntimeResult {
  return { ...value, status, trace: runtimeTrace(value.trace), lifecycle: [] };
}

function success(reason: string, reasonRu: string): Extract<ExecutionOutcome, { kind: 'success' }> {
  return { kind: 'success', reason, reasonRu };
}

function failure(reason: string, reasonRu: string): Extract<ExecutionOutcome, { kind: 'failure' }> {
  return { kind: 'failure', reason, reasonRu };
}

function cancelled(reason: string, reasonRu: string, details?: ActionDetails): Extract<ExecutionOutcome, { kind: 'cancelled' }> {
  return { kind: 'cancelled', reason, reasonRu, details };
}

function lifecycleEvent(
  phase: AiGraphLifecycleEvent['phase'],
  node: AiNode,
  atMs: number,
  reason: string,
  reasonRu?: string,
): AiGraphLifecycleEvent {
  return { phase, nodeId: node.id, nodeType: String(node.type), atMs, reason, reasonRu };
}

function traceItem(
  node: AiNode,
  status: AiGraphRuntimeTraceItem['status'],
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

function findExpiredTimeoutFrame(frames: readonly AiCompositeFrame[], nowMs: number): Extract<AiCompositeFrame, { kind: 'timeout' }> | undefined {
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const frame = frames[index];
    if (frame.kind === 'timeout' && frame.timeoutMs > 0 && nowMs - frame.startedAtMs >= frame.timeoutMs) return frame;
  }
  return undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
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

function cloneBlackboard(value: AiGraphRunnerBlackboard): AiGraphRunnerBlackboard {
  const copy: AiGraphRunnerBlackboard = {};
  for (const [key, item] of Object.entries(value)) copy[key] = typeof item === 'object' && item !== null ? { x: item.x, y: item.y } : item;
  return copy;
}
