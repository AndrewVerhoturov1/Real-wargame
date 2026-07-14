from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, value: str) -> None:
    Path(path).write_text(value, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def replace_regex(text: str, pattern: str, replacement: str, label: str) -> str:
    value, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return value


# Explicit Graph v2 state and plan nodes.
path = "src/core/ai/contracts/AiNodeContractRegistry.ts"
text = read(path)
marker = "contract({type:'SetPosture',category:'action',label:'Posture',labelRu:'Поза'"
insertion = """contract({type:'AiStateCheck',category:'condition',label:'State Is',labelRu:'Состояние равно',description:'Checks the state explicitly set by the graph.',descriptionRu:'Проверяет состояние, явно установленное графом.',outputs:[port('result','boolean','Result','Результат')],parameters:[enumParameter('stateId','State','Состояние','Idle',[option('Idle','Idle','Ожидание'),option('FollowingOrder','Following order','Выполнение приказа'),option('Contact','Contact','Контакт'),option('Suppressed','Suppressed','Подавлен')])]}),
contract({type:'ActivePlanCheck',category:'condition',label:'Active Plan Is',labelRu:'Активный план равен',description:'Checks which graph plan node is currently running.',descriptionRu:'Проверяет, какой план-нода сейчас выполняется графом.',outputs:[port('result','boolean','Result','Результат')],parameters:[enumParameter('planKind','Plan','План','any',[option('any','Any active plan','Любой активный план'),option('FollowMoveOrder','Follow move order','Выполнить приказ движения'),option('TakeCover','Take cover','Занять укрытие'),option('none','No active plan','Нет активного плана')])]}),
contract({type:'SetAiState',category:'action',label:'Set Soldier State',labelRu:'Установить состояние бойца',description:'Sets a state only when this graph node runs.',descriptionRu:'Устанавливает состояние бойца только при выполнении этой ноды графа.',parameters:[enumParameter('stateId','State','Состояние','Idle',[option('Idle','Idle','Ожидание'),option('FollowingOrder','Following order','Выполнение приказа'),option('Contact','Contact','Контакт'),option('Suppressed','Suppressed','Подавлен')]),parameter('reason','string','Reason','Причина','State selected by graph.'),parameter('reasonRu','string','Reason RU','Причина по-русски','Состояние выбрано графом.')]}),
contract({type:'RunPlan',category:'subgraph',label:'Run Plan',labelRu:'Выполнить план',description:'Runs a named plan as an ordinary graph-owned subgraph.',descriptionRu:'Выполняет именованный план как обычный подграф, принадлежащий графу.',childPolicy:'none',lifecycle:'stateful',inputs:[port('destination','position','Order destination','Цель приказа'),port('cover_position','position','Cover position','Позиция укрытия')],outputs:[port('position','position','Result position','Результирующая позиция'),port('route','route','Result route','Результирующий маршрут'),port('success','boolean','Success','Успех')],parameters:[enumParameter('planKind','Plan','План','TakeCover',[option('FollowMoveOrder','Follow move order','Выполнить приказ движения'),option('TakeCover','Take cover','Занять укрытие')]),parameter('targetKey','string','Target memory key','Ключ цели',''),enumParameter('cancelPolicy','Cancel policy','Политика отмены','cancel_child',[option('cancel_child','Cancel active child','Прервать активный дочерний граф')])]}),
"""
text = replace_once(text, marker, insertion + marker, "insert Graph v2 control nodes")
write(path, text)


# Graph runner understands state conditions and emits a state command.
path = "src/core/ai/AiGraphRunner.ts"
text = read(path)
text = replace_once(
    text,
    """  | {
      readonly type: 'write_memory';
      readonly key: string;
      readonly value: AiBlackboardValue;
    };
""",
    """  | {
      readonly type: 'write_memory';
      readonly key: string;
      readonly value: AiBlackboardValue;
    }
  | {
      readonly type: 'set_ai_state';
      readonly stateId: 'Idle' | 'FollowingOrder' | 'Contact' | 'Suppressed';
      readonly sourceNodeId: string;
      readonly sourceNodeName: string;
      readonly sourceNodeNameRu?: string;
      readonly reason: string;
      readonly reasonRu?: string;
    };
""",
    "extend graph effects",
)
text = replace_once(
    text,
    """    case 'ForbidAction':
      return true;
    case 'FlagCheck':
""",
    """    case 'ForbidAction':
    case 'RunPlan':
      return true;
    case 'AiStateCheck':
      return readString(context.blackboard.ai_state_id, 'Idle') === normalizeAiStateId(parameters.stateId);
    case 'ActivePlanCheck': {
      const expected = readString(parameters.planKind, 'any');
      const actual = readString(context.blackboard.ai_active_plan_kind, 'none');
      return expected === 'any' ? actual !== 'none' : actual === expected;
    }
    case 'FlagCheck':
""",
    "add graph control conditions",
)
text = replace_once(
    text,
    """    case 'SetPosture':
      context.effects.push({
""",
    """    case 'SetAiState': {
      const stateId = normalizeAiStateId(parameters.stateId);
      context.effects.push({
        type: 'set_ai_state',
        stateId,
        sourceNodeId: node.id,
        sourceNodeName: nodeName(node),
        sourceNodeNameRu: nodeNameRu(node),
        reason: readString(parameters.reason, `State ${stateId} selected by graph.`),
        reasonRu: readOptionalString(parameters.reasonRu) ?? `Состояние «${stateId}» выбрано графом.`,
      });
      return true;
    }
    case 'SetPosture':
      context.effects.push({
""",
    "add graph state command",
)
text += """

function normalizeAiStateId(value: unknown): 'Idle' | 'FollowingOrder' | 'Contact' | 'Suppressed' {
  return value === 'FollowingOrder' || value === 'Contact' || value === 'Suppressed' ? value : 'Idle';
}
"""
write(path, text)


# A state transition can now only be requested by an executing graph node.
path = "src/core/ai/state/AiStateRuntime.ts"
text = read(path)
marker = "export function normalizeAiStateRuntime("
helper = """export function setAiStateFromGraph(
  current: AiStateRuntimeSnapshotV1,
  targetStateId: AiStateId,
  nowMs: number,
  sourceNodeId: string,
  reason: string,
  reasonRu: string,
  machine: AiStateMachineDefinition = DEFAULT_AI_STATE_MACHINE,
): UpdateAiStateRuntimeResult {
  const atMs = finiteNonNegative(nowMs, current.enteredAtMs);
  if (current.activeStateId === targetStateId) return { runtime: cloneAiStateRuntime(current) };
  const previousPath = current.activePath;
  const nextPath = getAiStatePath(machine, targetStateId);
  const sharedPrefixLength = commonPrefixLength(previousPath, nextPath);
  const transition: AiStateTransitionRecord = {
    transitionId: `graph:${sourceNodeId}`,
    from: current.activeStateId,
    to: targetStateId,
    trigger: 'manual',
    reason,
    reasonRu,
    atMs,
    exitedStateIds: previousPath.slice(sharedPrefixLength).reverse(),
    enteredStateIds: nextPath.slice(sharedPrefixLength),
  };
  return {
    transition,
    runtime: {
      version: 1,
      activeStateId: targetStateId,
      activePath: nextPath,
      previousStateId: current.activeStateId,
      enteredAtMs: atMs,
      suppressionBelowSinceMs: undefined,
      lastTransition: transition,
      trace: [...current.trace, transition].slice(-TRACE_LIMIT),
    },
  };
}

"""
text = replace_once(text, marker, helper + marker, "add graph-owned state transition")
write(path, text)


# RunPlan is only a friendly Graph v2 alias around existing editable subgraphs.
path = "src/core/ai/runtime/AiCompositeGraphRuntime.ts"
text = read(path)
text = replace_once(
    text,
    """    if (node.type === 'Reload' || node.type === 'WaitForEvent' || node.type === 'Subgraph' || node.type === 'ReactiveSequence' || node.type === 'Timeout' || node.type === 'Retry') return true;
""",
    """    if (node.type === 'Reload' || node.type === 'WaitForEvent' || isSubgraphRuntimeNode(node) || node.type === 'ReactiveSequence' || node.type === 'Timeout' || node.type === 'Retry') return true;
""",
    "recognize RunPlan runtime",
)
text = replace_once(text, "  if (node.type === 'Subgraph') return startSubgraph(environment, node, frames);", "  if (isSubgraphRuntimeNode(node)) return startSubgraph(environment, node, frames);", "enter RunPlan")
text = replace_once(text, "  if (node.type === 'Subgraph' && isAiSubgraphExecutionState(executionState.activeData)) {", "  if (isSubgraphRuntimeNode(node) && isAiSubgraphExecutionState(executionState.activeData)) {", "resume RunPlan")
text = replace_once(text, "  if (node.type === 'Subgraph' && isAiSubgraphExecutionState(executionState.activeData)) {", "  if (isSubgraphRuntimeNode(node) && isAiSubgraphExecutionState(executionState.activeData)) {", "cancel RunPlan")
text = replace_once(text, "  if (activeNode.type === 'Subgraph') {", "  if (isSubgraphRuntimeNode(activeNode)) {", "validate RunPlan")
text = replace_once(text, "  if (activeNode.type === 'Subgraph' && isAiSubgraphExecutionState(state.activeData)) {", "  if (isSubgraphRuntimeNode(activeNode) && isAiSubgraphExecutionState(state.activeData)) {", "cleanup RunPlan")
text = replace_once(
    text,
    """function startSubgraph(
  environment: RuntimeEnvironment,
  node: AiNode,
  frames: readonly AiCompositeFrame[],
): ExecutionOutcome {
  const subgraphId = typeof node.parameters?.subgraphId === 'string' ? node.parameters.subgraphId : '';
  const definition = DEFAULT_AI_SUBGRAPH_REGISTRY.get(subgraphId);
  if (!definition) return failure(`Unknown AI subgraph ${subgraphId}.`, `Неизвестный подграф ИИ «${subgraphId}».`);
  const localBlackboard = createSubgraphLocalBlackboard(definition, node, environment.accumulator.blackboard);
  return executeSubgraph(environment, node, frames, definition, {
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
  return executeSubgraph(environment, node, frames, definition, {
    ...cloneAiSubgraphExecutionState(state),
    localBlackboard: refreshSubgraphRuntimeValues(environment.accumulator.blackboard, state.localBlackboard),
  });
}
""",
    """function isSubgraphRuntimeNode(node: AiNode): boolean {
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
""",
    "implement RunPlan as subgraph alias",
)
text = replace_once(
    text,
    """    if ((node.type === 'SequenceWithMemory' || node.type === 'Sequence' || node.type === 'ReactiveSequence' || node.type === 'Selector' || node.type === 'UtilitySelector' || node.type === 'Timeout' || node.type === 'Retry' || node.type === 'Subgraph')
      && hasStatefulDescendant(nodes, node.id, false)) return node;
""",
    """    if ((node.type === 'SequenceWithMemory' || node.type === 'Sequence' || node.type === 'ReactiveSequence' || node.type === 'Selector' || node.type === 'UtilitySelector' || node.type === 'Timeout' || node.type === 'Retry' || isSubgraphRuntimeNode(node))
      && hasStatefulDescendant(nodes, node.id, false)) return node;
""",
    "find RunPlan entry",
)
text = replace_once(
    text,
    """    if ((!root || !excludeRoot) && (DEFAULT_AI_ACTION_REGISTRY.has(String(node.type)) || node.type === 'Timeout' || node.type === 'Retry' || node.type === 'Subgraph')) return true;
""",
    """    if ((!root || !excludeRoot) && (DEFAULT_AI_ACTION_REGISTRY.has(String(node.type)) || node.type === 'Timeout' || node.type === 'Retry' || isSubgraphRuntimeNode(node))) return true;
""",
    "find RunPlan descendants",
)
text = replace_once(
    text,
    """        || node.type === 'Subgraph'
        || DEFAULT_AI_ACTION_REGISTRY.has(String(node.type))
""",
    """        || isSubgraphRuntimeNode(node)
        || DEFAULT_AI_ACTION_REGISTRY.has(String(node.type))
""",
    "hide RunPlan during planning",
)
write(path, text)


# Remove the hidden state machine/planner wrapper from the game bridge.
path = "src/core/ai/AiGameBridge.ts"
text = read(path)
text = replace_once(text, "import { isReactiveExecutionState } from './events/AiReactiveRuntime';\n", "", "remove reactive hidden-plan import")
text = replace_once(
    text,
    """import { updateAiStateRuntime } from './state/AiStateRuntime';
import { cancelAiPlan, applyAiPlanStepExecution, evaluateAiPlanAbort, evaluateAiPlanReplan, startCurrentAiPlanStep } from './state/AiPlanRuntime';
import { buildAiPlanConditionValues, buildAiPlanStepGraph, deriveAiStateTriggers, isAiPlanAllowedInState, readAiExecutionOwnerToken, selectAiPlanForState } from './state/AiStatePlanPipeline';
import { DEFAULT_AI_STATE_MACHINE } from './state/AiStateMachine';
import type { AiPlan } from './state/AiPlan';
""",
    """import { setAiStateFromGraph } from './state/AiStateRuntime';
import { readAiExecutionOwnerToken } from './state/AiStatePlanPipeline';
import { DEFAULT_AI_STATE_MACHINE } from './state/AiStateMachine';
""",
    "replace state-plan bridge imports",
)
new_tick_body = """  const graph = readRuntimeGraph();
  let session = ensureRuntimeSession(unit, graph.id);
  session = clearLegacyAutomaticStatePlan(unit, session);
  if (options.applyEffects) {
    publishSimulationAiEvents(unit, session.simulationTimeMs);
    session = unit.behaviorRuntime.aiRuntimeSession ?? session;
  }
  const observerWakeOnly = !options.force && !cadenceReady && observerPoll.events > 0;
  const simulationNowMs = options.applyEffects && !observerWakeOnly
    ? session.simulationTimeMs + AI_GRAPH_TICK_INTERVAL_MS
    : session.simulationTimeMs;
  const previousPlan = readActiveRunPlan(graph, session.executionState);
  const blackboard = buildGraphControlBlackboard(state, unit, session, graph);
  const result = runAiGraphRuntime({
    graph,
    unitId: unit.id,
    blackboard,
    cooldowns: session.cooldowns,
    nowMs: simulationNowMs,
    tacticalHost: createTacticalHost(state, unit),
    executionState: session.executionState,
    cancel: options.cancel,
    events: session.eventQueue.events,
  });
  session = applyRuntimeResultToSession(session, result, simulationNowMs);
  session = applyGraphStateEffects(session, result.effects, simulationNowMs);
  session = updateGraphPlanMemory(session, graph, result, previousPlan);

  publishRuntimeDebugTrace(state, unit, graph, result, nowMs, simulationNowMs, !options.applyEffects, session.status);
  publishStatePlanDebug(session, graph, result);
  if (!options.applyEffects) return result;

  unit.behaviorRuntime.aiRuntimeSession = session;
  unit.behaviorRuntime.aiGraphLastTickMs = nowMs;
  unit.behaviorRuntime.aiNodeCooldowns = { ...session.cooldowns };
  applyGraphEffects(state, unit, result.effects, result.blackboard, nowMs, session.blackboardMemory);
  unit.plan = updateUnitPlanFromRuntime(unit.plan, graph, result);
  unit.behaviorRuntime.aiGraphReason = result.explanationRu ?? result.explanation;
  unit.behaviorRuntime.reason = result.explanationRu ?? result.explanation;
  const stateEffect = [...result.effects].reverse().find((effect) => effect.type === 'set_ai_state');
  unit.behaviorRuntime.lastEvent = stateEffect
    ? `ai_state_graph_to_${stateEffect.stateId}`
    : `ai_graph_runtime_${result.status}`;
  publishSimulationAiEvents(unit, session.simulationTimeMs);
  return result;
}"""
text = replace_regex(
    text,
    r"  const graph = readRuntimeGraph\(\);.*?  return result;\n}\n\nexport function pollAiBlackboardObservers",
    new_tick_body + "\n\nexport function pollAiBlackboardObservers",
    "replace hidden bridge pipeline",
)
helper_marker = "export function pollAiBlackboardObservers("
helpers = """interface GraphOwnedPlanDescriptor {
  readonly kind: 'FollowMoveOrder' | 'TakeCover';
  readonly nodeId: string;
  readonly nodeName: string;
  readonly nodeNameRu: string;
  readonly subgraphId: string;
}

function clearLegacyAutomaticStatePlan(
  unit: UnitModel,
  session: AiRuntimeSessionSnapshotV1,
): AiRuntimeSessionSnapshotV1 {
  if (!session.activePlan) return session;
  const ownerToken = readAiExecutionOwnerToken(session.executionState);
  if (ownerToken && unit.order?.source === 'ai' && unit.order.ownerToken === ownerToken) unit.order = null;
  unit.behaviorRuntime.aiRouteStatusState = null;
  const cancelledLegacyPlan = {
    ...session.activePlan,
    status: 'cancelled' as const,
    cancellationReason: 'Legacy automatic plan disabled because Graph v2 owns all decisions.',
    cancellationReasonRu: 'Старый автоматический план отключён: теперь все решения принадлежат Graph v2.',
  };
  return {
    ...session,
    status: 'idle',
    executionState: undefined,
    activePlan: undefined,
    planHistory: [...session.planHistory, cancelledLegacyPlan].slice(-12),
    blackboardMemory: {
      ...session.blackboardMemory,
      ai_active_plan_kind: 'none',
      ai_active_plan_status: 'none',
      ai_legacy_plan_cleared: true,
    },
  };
}

function buildGraphControlBlackboard(
  state: SimulationState,
  unit: UnitModel,
  session: AiRuntimeSessionSnapshotV1,
  graph: AiGraph,
): AiGraphRunnerBlackboard {
  const activePlan = readActiveRunPlan(graph, session.executionState);
  return {
    ...buildBlackboardForUnit(state, unit, session.blackboardMemory),
    ai_state_id: session.stateRuntime.activeStateId,
    ai_previous_state_id: session.stateRuntime.previousStateId ?? 'none',
    ai_active_plan_kind: activePlan?.kind ?? 'none',
    ai_active_plan_status: activePlan ? 'active' : 'none',
    ai_active_plan_source_node_id: activePlan?.nodeId ?? null,
  };
}

function applyGraphStateEffects(
  session: AiRuntimeSessionSnapshotV1,
  effects: readonly AiGraphEffect[],
  nowMs: number,
): AiRuntimeSessionSnapshotV1 {
  let next = session;
  for (const effect of effects) {
    if (effect.type !== 'set_ai_state') continue;
    const update = setAiStateFromGraph(
      next.stateRuntime,
      effect.stateId,
      nowMs,
      effect.sourceNodeId,
      effect.reason,
      effect.reasonRu ?? effect.reason,
    );
    const controlMemory: AiGraphRunnerBlackboard = {
      ai_state_id: update.runtime.activeStateId,
      ai_state_source_node_id: effect.sourceNodeId,
      ai_state_source_node_name: effect.sourceNodeName,
      ai_state_source_node_name_ru: effect.sourceNodeNameRu ?? effect.sourceNodeName,
    };
    next = {
      ...next,
      stateRuntime: update.runtime,
      blackboardMemory: { ...next.blackboardMemory, ...controlMemory },
      memoryScopes: {
        ...next.memoryScopes,
        runtimeSessionMemory: { ...next.memoryScopes.runtimeSessionMemory, ...controlMemory },
      },
    };
  }
  return next;
}

function updateGraphPlanMemory(
  session: AiRuntimeSessionSnapshotV1,
  graph: AiGraph,
  result: AiGraphRuntimeResult,
  previousPlan: GraphOwnedPlanDescriptor | undefined,
): AiRuntimeSessionSnapshotV1 {
  const activePlan = readActiveRunPlan(graph, result.executionState);
  const controlMemory: AiGraphRunnerBlackboard = {};
  if (activePlan) {
    controlMemory.ai_active_plan_kind = activePlan.kind;
    controlMemory.ai_active_plan_status = 'active';
    controlMemory.ai_active_plan_source_node_id = activePlan.nodeId;
    controlMemory.ai_active_plan_source_node_name = activePlan.nodeName;
    controlMemory.ai_active_plan_source_node_name_ru = activePlan.nodeNameRu;
    const previousNodeId = readString(session.blackboardMemory.ai_active_plan_source_node_id, '');
    controlMemory.ai_plan_sequence = readNumber(session.blackboardMemory.ai_plan_sequence, 0) + (previousNodeId === activePlan.nodeId ? 0 : 1);
  } else {
    controlMemory.ai_active_plan_kind = 'none';
    controlMemory.ai_active_plan_status = 'none';
    controlMemory.ai_active_plan_source_node_id = null;
    controlMemory.ai_active_plan_source_node_name = null;
    controlMemory.ai_active_plan_source_node_name_ru = null;
    if (previousPlan) {
      controlMemory.ai_last_plan_kind = previousPlan.kind;
      controlMemory.ai_last_plan_status = result.status;
      controlMemory.ai_last_plan_source_node_id = previousPlan.nodeId;
      controlMemory.ai_last_plan_reason_ru = result.explanationRu ?? result.explanation;
    }
  }
  return {
    ...session,
    blackboardMemory: { ...session.blackboardMemory, ...controlMemory },
    memoryScopes: {
      ...session.memoryScopes,
      runtimeSessionMemory: { ...session.memoryScopes.runtimeSessionMemory, ...controlMemory },
    },
  };
}

function readActiveRunPlan(
  graph: AiGraph,
  executionState: AiGraphExecutionState | undefined,
): GraphOwnedPlanDescriptor | undefined {
  if (!executionState) return undefined;
  const node = graph.nodes.find((candidate) => candidate.id === executionState.activeNodeId);
  if (!node || node.type !== 'RunPlan') return undefined;
  const kind = node.parameters?.planKind === 'FollowMoveOrder' ? 'FollowMoveOrder' : 'TakeCover';
  return {
    kind,
    nodeId: node.id,
    nodeName: node.displayName ?? (kind === 'FollowMoveOrder' ? 'Follow move order' : 'Take cover'),
    nodeNameRu: node.displayNameRu ?? (kind === 'FollowMoveOrder' ? 'Выполнить приказ движения' : 'Занять укрытие'),
    subgraphId: kind === 'FollowMoveOrder' ? 'move_and_observe' : 'take_cover',
  };
}

"""
text = replace_once(text, helper_marker, helpers + helper_marker, "add graph control bridge helpers")
text = replace_once(
    text,
    """    if (effect.type === 'write_memory') {
      runtimeMemory[effect.key] = effect.value;
      continue;
    }
""",
    """    if (effect.type === 'set_ai_state') continue;

    if (effect.type === 'write_memory') {
      runtimeMemory[effect.key] = effect.value;
      continue;
    }
""",
    "separate state command from world effects",
)
text = replace_regex(
    text,
    r"function publishStatePlanDebug\(session: AiRuntimeSessionSnapshotV1\): void \{.*?\n}\n\nfunction runtimeMemoryScopeDebug",
    """function publishStatePlanDebug(
  session: AiRuntimeSessionSnapshotV1,
  graph: AiGraph,
  result: AiGraphRuntimeResult,
): void {
  try {
    const raw = window.localStorage.getItem(DEBUG_STORAGE_KEY);
    if (!raw) return;
    const payload = JSON.parse(raw) as Record<string, unknown>;
    const stateDefinition = DEFAULT_AI_STATE_MACHINE.states[session.stateRuntime.activeStateId];
    const parentId = stateDefinition.parentStateId;
    const activePlan = readActiveRunPlan(graph, session.executionState);
    const previousPlanKind = readString(session.blackboardMemory.ai_last_plan_kind, '');
    const previousPlanStatus = readString(session.blackboardMemory.ai_last_plan_status, '');
    payload.statePlan = {
      stateId: session.stateRuntime.activeStateId,
      stateLabelRu: stateDefinition.labelRu,
      parentStateId: parentId,
      parentStateLabelRu: parentId ? DEFAULT_AI_STATE_MACHINE.states[parentId].labelRu : undefined,
      previousStateId: session.stateRuntime.previousStateId,
      previousStateLabelRu: session.stateRuntime.previousStateId
        ? DEFAULT_AI_STATE_MACHINE.states[session.stateRuntime.previousStateId].labelRu
        : undefined,
      transitionReasonRu: session.stateRuntime.lastTransition?.reasonRu,
      transitionTrigger: session.stateRuntime.lastTransition?.trigger,
      transitionAtMs: session.stateRuntime.lastTransition?.atMs,
      stateSourceNodeId: session.blackboardMemory.ai_state_source_node_id,
      stateSourceNodeNameRu: session.blackboardMemory.ai_state_source_node_name_ru,
      allowedUtilityBranches: [],
      activePlan: activePlan ? {
        id: `graph:${activePlan.nodeId}`,
        kind: activePlan.kind,
        goalRu: activePlan.nodeNameRu,
        status: 'active',
        currentStepId: result.activeNodeId,
        currentStepLabelRu: result.activeSubgraphNameRu ?? activePlan.nodeNameRu,
        currentStepIndex: 0,
        stepCount: 1,
        reasonsRu: [`Запущено нодой Graph v2 «${activePlan.nodeNameRu}».`],
        abortConditionsRu: [],
        replanConditionsRu: [],
        activeSubgraphId: result.activeSubgraphId ?? activePlan.subgraphId,
        sourceNodeId: activePlan.nodeId,
      } : undefined,
      previousPlan: previousPlanKind ? {
        id: `graph:${readString(session.blackboardMemory.ai_last_plan_source_node_id, 'unknown')}`,
        goalRu: previousPlanKind === 'FollowMoveOrder' ? 'Выполнить приказ движения' : 'Занять укрытие',
        status: previousPlanStatus || 'success',
        cancellationReasonRu: session.blackboardMemory.ai_last_plan_reason_ru,
      } : undefined,
      planSequence: readNumber(session.blackboardMemory.ai_plan_sequence, 0),
      graphOwnsBehavior: true,
    };
    window.localStorage.setItem(DEBUG_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // State/plan diagnostics are optional and must never interrupt gameplay.
  }
}

function runtimeMemoryScopeDebug""",
    "replace state-plan diagnostics",
)
text = replace_regex(
    text,
    r"function appendPlanHistory\(.*?\n}\n\nfunction mergeRuntimeResults\(.*?\n}\n\n",
    "",
    "remove hidden planner helpers",
)
text = replace_once(
    text,
    """      parameters: isRecord(node.parameters) ? normalizeBlackboard(node.parameters) : {},
    }));

  return {
    version: 1,
""",
    """      parameters: isRecord(node.parameters) ? normalizeBlackboard(node.parameters) : {},
      inputBindings: isRecord(node.inputBindings) ? node.inputBindings as AiNode['inputBindings'] : undefined,
      outputBindings: isRecord(node.outputBindings) ? node.outputBindings as AiNode['outputBindings'] : undefined,
      legacyMetadata: isRecord(node.legacyMetadata) ? node.legacyMetadata : undefined,
    }));

  return {
    version: 2,
""",
    "preserve Graph v2 bindings",
)
text = replace_once(
    text,
    """    blackboardDefaults: isRecord(value.blackboardDefaults) ? normalizeBlackboard(value.blackboardDefaults) : {},
    nodes,
  };
""",
    """    blackboardDefaults: isRecord(value.blackboardDefaults) ? normalizeBlackboard(value.blackboardDefaults) : {},
    blackboardSchema: (Array.isArray(value.blackboardSchema) ? value.blackboardSchema.filter(isRecord) : []) as NonNullable<AiGraph['blackboardSchema']>,
    nodes,
    subgraphRefs: Array.isArray(value.subgraphRefs) ? value.subgraphRefs.filter((item): item is string => typeof item === 'string') : [],
    legacyMetadata: isRecord(value.legacyMetadata) ? value.legacyMetadata : undefined,
  };
""",
    "normalize runtime graph as Graph v2",
)
write(path, text)


# Regression test: empty graph is inert; explicit nodes own state and plans.
Path("scripts/ai_graph_ownership_smoke.ts").write_text(r'''import assert from 'node:assert/strict';
import mapData from '../src/data/maps/test_map.json';
import unitsData from '../src/data/units/test_units.json';
import { tickAiGameBridge } from '../src/core/ai/AiGameBridge';
import type { AiGraph } from '../src/core/ai/AiGraph';
import { runAiGraphRuntime } from '../src/core/ai/AiGraphRuntime';
import { createAiRuntimeSession } from '../src/core/ai/runtime/AiRuntimeSession';
import { createAiStateRuntime } from '../src/core/ai/state/AiStateRuntime';
import type { TacticalMapData } from '../src/core/map/MapModel';
import { createInitialState } from '../src/core/simulation/SimulationState';
import type { UnitData } from '../src/core/units/UnitModel';

const GRAPH_STORAGE_KEY = 'real-wargame.ai-node-editor.graph.v6';
const storage = new MemoryStorage();
(globalThis as typeof globalThis & { window: unknown }).window = {
  localStorage: storage,
  setInterval,
  clearInterval,
};

const emptyGraph: AiGraph = {
  version: 2,
  id: 'empty_graph_ownership_test',
  name: 'Empty graph ownership test',
  nameRu: 'Проверка пустого графа',
  rootNodeId: 'root',
  blackboardDefaults: {},
  blackboardSchema: [],
  subgraphRefs: [],
  nodes: [{ id: 'root', type: 'Root', children: [] }],
};

verifyEmptyGraphIsInert('Contact');
verifyEmptyGraphIsInert('Suppressed');
verifyGraphExplicitlySetsState();
verifyGraphExplicitlyRunsPlan();

console.log('AI graph ownership smoke passed: empty graph is inert; state changes and plans start only from explicit Graph v2 nodes.');

function verifyEmptyGraphIsInert(stateId: 'Contact' | 'Suppressed'): void {
  const { state, unit } = makeState(emptyGraph, stateId);
  const result = tickAiGameBridge(state, 1000, { force: true, applyEffects: true });
  assert.ok(result);
  assert.equal(result.effects.some((effect) => effect.type === 'begin_move'), false);
  assert.equal(unit.order, null);
  assert.equal(unit.behaviorRuntime.aiRuntimeSession?.activePlan, undefined);
  assert.equal(unit.behaviorRuntime.aiRuntimeSession?.executionState, undefined);
  assert.equal(unit.behaviorRuntime.aiRuntimeSession?.stateRuntime.activeStateId, stateId);
}

function verifyGraphExplicitlySetsState(): void {
  const graph: AiGraph = {
    ...emptyGraph,
    id: 'explicit_state_graph',
    nodes: [
      { id: 'root', type: 'Root', children: ['set_contact'] },
      {
        id: 'set_contact',
        type: 'SetAiState',
        children: [],
        parameters: { stateId: 'Contact', reason: 'Graph saw a threat.', reasonRu: 'Граф обнаружил угрозу.' },
      },
    ],
  };
  const { state, unit } = makeState(graph, 'Idle');
  const result = tickAiGameBridge(state, 1000, { force: true, applyEffects: true });
  assert.ok(result);
  assert.equal(unit.behaviorRuntime.aiRuntimeSession?.stateRuntime.activeStateId, 'Contact');
  assert.equal(unit.behaviorRuntime.aiRuntimeSession?.stateRuntime.lastTransition?.trigger, 'manual');
  assert.equal(unit.order, null);
}

function verifyGraphExplicitlyRunsPlan(): void {
  const graph: AiGraph = {
    ...emptyGraph,
    id: 'explicit_plan_graph',
    subgraphRefs: ['take_cover'],
    nodes: [
      { id: 'root', type: 'Root', children: ['sequence'] },
      { id: 'sequence', type: 'SequenceWithMemory', children: ['run_cover'] },
      {
        id: 'run_cover',
        type: 'RunPlan',
        displayName: 'Take cover plan',
        displayNameRu: 'План занятия укрытия',
        children: [],
        parameters: { planKind: 'TakeCover', targetKey: 'best_cover_position', cancelPolicy: 'cancel_child' },
      },
    ],
  };
  const target = { x: 6, y: 3 };
  const result = runAiGraphRuntime({
    graph,
    unitId: 'explicit_plan_unit',
    blackboard: {
      self_position: { x: 1, y: 3 },
      best_cover_position: target,
      active_move_source: null,
      active_move_owner_token: null,
      active_move_target: null,
    },
    cooldowns: {},
    nowMs: 1000,
  });
  assert.equal(result.status, 'running');
  assert.equal(result.activeNodeId, 'run_cover');
  assert.equal(result.activeSubgraphId, 'take_cover');
  assert.equal(result.effects.some((effect) => effect.type === 'begin_move'), true);
}

function makeState(graph: AiGraph, stateId: 'Idle' | 'Contact' | 'Suppressed') {
  storage.clear();
  storage.setItem(GRAPH_STORAGE_KEY, JSON.stringify(graph));
  const state = createInitialState(mapData as TacticalMapData, unitsData as UnitData[], []);
  const unit = state.units[0];
  if (!unit) throw new Error('Test unit is missing.');
  state.selectedUnitId = unit.id;
  state.editor.enabled = false;
  unit.behaviorRuntime.aiRuntimeSession = createAiRuntimeSession({
    graphId: graph.id,
    unitId: unit.id,
    stateRuntime: createAiStateRuntime({ activeStateId: stateId, enteredAtMs: 0 }),
  });
  return { state, unit };
}

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
  clear(): void { this.values.clear(); }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  get length(): number { return this.values.size; }
}
''', encoding="utf-8")

Path("scripts/ai_graph_ownership_smoke.mjs").write_text(r'''import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, '.tmp-ai-graph-ownership-smoke');
const entryFile = path.join(outDir, 'ai-graph-ownership-smoke.mjs');
await rm(outDir, { recursive: true, force: true });
try {
  await build({
    root: repoRoot,
    logLevel: 'warn',
    build: {
      ssr: path.join(repoRoot, 'scripts', 'ai_graph_ownership_smoke.ts'),
      outDir,
      emptyOutDir: true,
      minify: false,
      sourcemap: false,
      rollupOptions: { output: { entryFileNames: 'ai-graph-ownership-smoke.mjs', format: 'es' } },
    },
  });
  await import(`${pathToFileURL(entryFile).href}?run=${Date.now()}`);
} finally {
  await rm(outDir, { recursive: true, force: true });
}
''', encoding="utf-8")

path = "package.json"
text = read(path)
text = replace_once(
    text,
    '    "move-bridge:smoke": "node scripts/ai_stateful_move_bridge_smoke.mjs && node scripts/ai_plan_move_scope_smoke.mjs",\n',
    '    "move-bridge:smoke": "node scripts/ai_stateful_move_bridge_smoke.mjs && node scripts/ai_plan_move_scope_smoke.mjs && node scripts/ai_graph_ownership_smoke.mjs",\n',
    "attach ownership regression to permanent CI",
)
write(path, text)

print("Graph v2 behavior ownership refactor applied.")
