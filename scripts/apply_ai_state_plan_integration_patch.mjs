import { readFile, writeFile } from 'node:fs/promises';

async function replaceText(path, search, replacement) {
  const source = await readFile(path, 'utf8');
  const next = typeof search === 'string' ? source.replace(search, replacement) : source.replace(search, replacement);
  if (next === source) throw new Error(`Patch target not found in ${path}: ${String(search).slice(0, 120)}`);
  await writeFile(path, next);
}

async function patchRuntimeSession() {
  const path = 'src/core/ai/runtime/AiRuntimeSession.ts';
  await replaceText(path,
    "} from '../contracts/AiMemoryScopes';\n\nexport type AiRuntimeSessionStatus",
    "} from '../contracts/AiMemoryScopes';\nimport { cloneAiStateRuntime, createAiStateRuntime, normalizeAiStateRuntime, type AiStateRuntimeSnapshotV1 } from '../state/AiStateRuntime';\nimport { cloneAiPlan, type AiPlan } from '../state/AiPlan';\nimport { normalizeAiPlan } from '../state/AiPlanRuntime';\n\nexport type AiRuntimeSessionStatus");
  await replaceText(path,
    "  readonly memoryScopes: AiMemoryScopesSnapshotV1;\n  readonly lastTerminal?: AiRuntimeTerminalRecord;",
    "  readonly memoryScopes: AiMemoryScopesSnapshotV1;\n  readonly stateRuntime: AiStateRuntimeSnapshotV1;\n  readonly activePlan?: AiPlan;\n  readonly planHistory: readonly AiPlan[];\n  readonly planSequence: number;\n  readonly lastTerminal?: AiRuntimeTerminalRecord;");
  await replaceText(path,
    "  readonly memoryScopes?: AiMemoryScopesSnapshotV1;\n  readonly lastTerminal?: AiRuntimeTerminalRecord;",
    "  readonly memoryScopes?: AiMemoryScopesSnapshotV1;\n  readonly stateRuntime?: AiStateRuntimeSnapshotV1;\n  readonly activePlan?: AiPlan;\n  readonly planHistory?: readonly AiPlan[];\n  readonly planSequence?: number;\n  readonly lastTerminal?: AiRuntimeTerminalRecord;");
  await replaceText(path,
    "    memoryScopes: input.memoryScopes\n      ? cloneAiMemoryScopes(input.memoryScopes)\n      : createAiMemoryScopes({ runtimeSessionMemory: input.blackboardMemory ?? {} }),\n    lastTerminal: cloneTerminal(input.lastTerminal),",
    "    memoryScopes: input.memoryScopes\n      ? cloneAiMemoryScopes(input.memoryScopes)\n      : createAiMemoryScopes({ runtimeSessionMemory: input.blackboardMemory ?? {} }),\n    stateRuntime: input.stateRuntime ? cloneAiStateRuntime(input.stateRuntime) : createAiStateRuntime({ enteredAtMs: input.simulationTimeMs }),\n    activePlan: input.activePlan ? cloneAiPlan(input.activePlan) : undefined,\n    planHistory: (input.planHistory ?? []).slice(-12).map(cloneAiPlan),\n    planSequence: Math.max(0, Math.floor(finiteNonNegative(input.planSequence, 0))),\n    lastTerminal: cloneTerminal(input.lastTerminal),");
  await replaceText(path,
    "      memoryScopes: normalizeAiMemoryScopes(value.memoryScopes, normalizeBlackboard(value.blackboardMemory)),\n      lastTerminal: cloneTerminal(lastTerminal),",
    "      memoryScopes: normalizeAiMemoryScopes(value.memoryScopes, normalizeBlackboard(value.blackboardMemory)),\n      stateRuntime: normalizeAiStateRuntime(value.stateRuntime),\n      activePlan: normalizeAiPlan(value.activePlan),\n      planHistory: normalizePlanHistory(value.planHistory),\n      planSequence: Math.max(0, Math.floor(finiteNonNegative(value.planSequence, 0))),\n      lastTerminal: cloneTerminal(lastTerminal),");
  await replaceText(path,
    "    memoryScopes: input.memoryScopes,\n    lastTerminal: input.lastTerminal,",
    "    memoryScopes: input.memoryScopes,\n    stateRuntime: input.stateRuntime,\n    activePlan: input.activePlan,\n    planHistory: input.planHistory,\n    planSequence: input.planSequence,\n    lastTerminal: input.lastTerminal,");
  await replaceText(path,
    "    memoryScopes: executionState\n      ? cloneAiMemoryScopes(current.memoryScopes)\n      : { ...cloneAiMemoryScopes(current.memoryScopes), activeStateMemory: {}, nodeLocalState: {} },\n    lastTerminal: terminalStatus",
    "    memoryScopes: executionState\n      ? cloneAiMemoryScopes(current.memoryScopes)\n      : { ...cloneAiMemoryScopes(current.memoryScopes), activeStateMemory: {}, nodeLocalState: {} },\n    stateRuntime: cloneAiStateRuntime(current.stateRuntime),\n    activePlan: current.activePlan ? cloneAiPlan(current.activePlan) : undefined,\n    planHistory: current.planHistory.map(cloneAiPlan),\n    planSequence: current.planSequence,\n    lastTerminal: terminalStatus");
  await replaceText(path,
    "    memoryScopes: cloneAiMemoryScopes(value.memoryScopes),\n    lastTerminal: cloneTerminal(value.lastTerminal),",
    "    memoryScopes: cloneAiMemoryScopes(value.memoryScopes),\n    stateRuntime: cloneAiStateRuntime(value.stateRuntime),\n    activePlan: value.activePlan ? cloneAiPlan(value.activePlan) : undefined,\n    planHistory: value.planHistory.map(cloneAiPlan),\n    planSequence: value.planSequence,\n    lastTerminal: cloneTerminal(value.lastTerminal),");
  await replaceText(path,
    "function resetResult(\n",
    "function normalizePlanHistory(value: unknown): AiPlan[] {\n  if (!Array.isArray(value)) return [];\n  return value.map(normalizeAiPlan).filter((item): item is AiPlan => Boolean(item)).slice(-12);\n}\n\nfunction resetResult(\n");
}

async function patchSnapshotAndMoveBridge() {
  await replaceText('src/core/ai/runtime/AiRuntimeSnapshot.ts',
    "} from './AiRuntimeSession';\n",
    "} from './AiRuntimeSession';\nimport { readAiExecutionOwnerToken } from '../state/AiStatePlanPipeline';\n");
  await replaceText('src/core/ai/runtime/AiRuntimeSnapshot.ts',
    /function readActiveMoveOwnerToken\(session: AiRuntimeSessionSnapshotV1\): string \| undefined \{[\s\S]*?\n\}/,
    "function readActiveMoveOwnerToken(session: AiRuntimeSessionSnapshotV1): string | undefined {\n  return readAiExecutionOwnerToken(session.executionState);\n}");
  await replaceText('src/core/ai/AiStatefulMoveGameBridge.ts',
    /function readActiveMoveSnapshot\(state: AiGraphExecutionState \| undefined\): ActiveMoveSnapshot \| null \{[\s\S]*?\n\}/,
    "function readActiveMoveSnapshot(state: AiGraphExecutionState | undefined): ActiveMoveSnapshot | null {\n  const data = state?.activeData;\n  if (data?.kind === 'subgraph') return readActiveMoveSnapshot(data.nestedExecutionState);\n  const activeNodeId = state?.activeNodeId;\n  if (!activeNodeId || data?.kind !== 'move_to_blackboard_position') return null;\n  if (!data.targetKey || !data.actionToken || !isGridPosition(data.target)) return null;\n  return {\n    activeNodeId,\n    targetKey: data.targetKey,\n    target: { ...data.target },\n    acceptanceRadiusCells: finiteNonNegative(data.acceptanceRadiusCells, 0.2),\n    ownerToken: data.actionToken,\n  };\n}");
}

async function patchPlanConditions() {
  await replaceText('src/core/ai/state/AiPlan.ts',
    "      condition('route_blocked', 'active_move_path_status', 'eq', 'blocked', 'The route to cover is blocked.', 'Маршрут к укрытию заблокирован.'),",
    "      condition('route_blocked', 'active_move_route_status', 'eq', 'blocked', 'The route to cover is blocked.', 'Маршрут к укрытию заблокирован.'),");
  await replaceText('src/core/ai/state/AiPlan.ts',
    "      condition('cover_changed', 'best_cover_position_revision', 'neq', 0, 'A safer cover position was found.', 'Найдено более безопасное укрытие.'),\n      condition('suppression_changed', 'suppression_band', 'neq', input.createdForState, 'Suppression changed significantly.', 'Подавление заметно изменилось.'),",
    "      condition('cover_changed', 'best_cover_position_revision', 'neq', 0, 'A safer cover position was found.', 'Найдено более безопасное укрытие.'),");
}

async function patchGameBridge() {
  const path = 'src/core/ai/AiGameBridge.ts';
  await replaceText(path,
    "import { updateUnitPlanFromRuntime } from './UnitPlan';\n",
    "import { updateUnitPlanFromRuntime } from './UnitPlan';\nimport { updateAiStateRuntime } from './state/AiStateRuntime';\nimport { cancelAiPlan, applyAiPlanStepExecution, evaluateAiPlanAbort, evaluateAiPlanReplan, startCurrentAiPlanStep } from './state/AiPlanRuntime';\nimport { buildAiPlanConditionValues, buildAiPlanStepGraph, deriveAiStateTriggers, isAiPlanAllowedInState, selectAiPlanForState } from './state/AiStatePlanPipeline';\nimport { DEFAULT_AI_STATE_MACHINE } from './state/AiStateMachine';\nimport type { AiPlan } from './state/AiPlan';\n");

  const replacement = `export function tickAiGameBridge(
  state: SimulationState,
  nowMs = Date.now(),
  options: TickOptions = { force: false, applyEffects: true },
): AiGraphRuntimeResult | null {
  const unit = state.selectedUnitId
    ? state.units.find((candidate) => candidate.id === state.selectedUnitId)
    : undefined;

  if (!unit) return null;
  if (!options.force && (state.editor.enabled || isPaused(state))) return null;

  const observerPoll = options.applyEffects
    ? pollAiBlackboardObservers(state, unit)
    : { events: 0, checks: 0 };
  const scaledInterval = AI_GRAPH_TICK_INTERVAL_MS / getAiTestTimeScale(state);
  const cadenceReady = nowMs - unit.behaviorRuntime.aiGraphLastTickMs >= scaledInterval;
  if (!options.force && !cadenceReady && observerPoll.events === 0) return null;

  const graph = readRuntimeGraph();
  let session = ensureRuntimeSession(unit, graph.id);
  if (options.applyEffects) {
    publishSimulationAiEvents(unit, session.simulationTimeMs);
    session = unit.behaviorRuntime.aiRuntimeSession ?? session;
  }
  const observerWakeOnly = !options.force && !cadenceReady && observerPoll.events > 0;
  const simulationNowMs = options.applyEffects && !observerWakeOnly
    ? session.simulationTimeMs + AI_GRAPH_TICK_INTERVAL_MS
    : session.simulationTimeMs;
  const blackboard = buildBlackboardForUnit(state, unit, session.blackboardMemory);
  const stateUpdate = updateAiStateRuntime(session.stateRuntime, {
    nowMs: simulationNowMs,
    triggers: deriveAiStateTriggers(session.stateRuntime.activeStateId, blackboard, session.eventQueue.events),
    values: blackboard,
    suppression: readNumber(blackboard.suppression, unit.behaviorRuntime.suppression),
  });
  session = { ...session, stateRuntime: stateUpdate.runtime };

  let activePlan = session.activePlan;
  let cancellationResult: AiGraphRuntimeResult | null = null;
  let cancellation: { reason: string; reasonRu: string; replanning: boolean } | null = null;
  if (activePlan) {
    const conditionValues = buildAiPlanConditionValues(blackboard, activePlan);
    if (options.cancel) {
      cancellation = {
        reason: options.cancel.reason,
        reasonRu: options.cancel.reasonRu ?? options.cancel.reason,
        replanning: false,
      };
    } else if (stateUpdate.transition && !isAiPlanAllowedInState(activePlan, stateUpdate.runtime.activeStateId)) {
      cancellation = {
        reason: 'The state transition invalidated the active plan.',
        reasonRu: \`Переход в состояние «\${DEFAULT_AI_STATE_MACHINE.states[stateUpdate.runtime.activeStateId].labelRu}» отменил прежний план.\`,
        replanning: false,
      };
    } else {
      const abort = evaluateAiPlanAbort(activePlan, conditionValues);
      const replan = activePlan.currentStepIndex === 0 ? evaluateAiPlanReplan(activePlan, conditionValues) : { matched: false };
      if (abort.matched) cancellation = { reason: abort.reason ?? 'Plan abort condition matched.', reasonRu: abort.reasonRu ?? 'Сработало условие отмены плана.', replanning: false };
      else if (replan.matched) cancellation = { reason: replan.reason ?? 'Plan requires replanning.', reasonRu: replan.reasonRu ?? 'План требует перестроения.', replanning: true };
    }
  }

  if (activePlan && cancellation) {
    if (session.executionState) {
      const activeStepGraph = buildAiPlanStepGraph(activePlan);
      cancellationResult = runAiGraphRuntime({
        graph: activeStepGraph ? { ...activeStepGraph, id: graph.id } : graph,
        unitId: unit.id,
        blackboard,
        cooldowns: session.cooldowns,
        nowMs: simulationNowMs,
        tacticalHost: createTacticalHost(state, unit),
        executionState: session.executionState,
        cancel: { reason: cancellation.reason, reasonRu: cancellation.reasonRu },
        events: session.eventQueue.events,
      });
      session = applyRuntimeResultToSession(session, cancellationResult, simulationNowMs);
    }
    const cancelled = cancelAiPlan(activePlan, cancellation.reason, cancellation.reasonRu, cancellation.replanning ? 'replanning' : 'cancelled');
    session = {
      ...session,
      stateRuntime: stateUpdate.runtime,
      activePlan: undefined,
      planHistory: appendPlanHistory(session.planHistory, cancelled.plan),
    };
    activePlan = undefined;
  }

  if (!activePlan && !options.cancel) {
    const selection = selectAiPlanForState({
      unitId: unit.id,
      stateId: session.stateRuntime.activeStateId,
      nowMs: simulationNowMs,
      sequence: session.planSequence + 1,
      blackboard,
      replacesPlanId: session.planHistory.at(-1)?.status === 'replanning' ? session.planHistory.at(-1)?.id : undefined,
    });
    if (selection.plan) {
      activePlan = selection.plan;
      session = { ...session, activePlan, planSequence: session.planSequence + 1 };
    }
  }

  let result: AiGraphRuntimeResult;
  if (options.cancel && !activePlan) {
    result = cancellationResult ?? runAiGraphRuntime({
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
  } else if (activePlan) {
    const started = startCurrentAiPlanStep(activePlan);
    activePlan = started.plan;
    const planStepGraph = buildAiPlanStepGraph(activePlan);
    if (!planStepGraph) throw new Error('Active AI plan has no executable current step.');
    const planResult = runAiGraphRuntime({
      graph: { ...planStepGraph, id: graph.id },
      unitId: unit.id,
      blackboard,
      cooldowns: session.cooldowns,
      nowMs: simulationNowMs,
      tacticalHost: createTacticalHost(state, unit),
      executionState: session.executionState,
      events: session.eventQueue.events,
    });
    const planUpdate = applyAiPlanStepExecution(
      activePlan,
      planResult.status,
      planResult.explanation,
      planResult.explanationRu,
    );
    let nextActivePlan: AiPlan | undefined = planUpdate.plan;
    let nextPlanHistory = session.planHistory;
    let nextPlanSequence = session.planSequence;
    if (planUpdate.plan.status === 'replanning') {
      nextPlanHistory = appendPlanHistory(nextPlanHistory, planUpdate.plan);
      const replacement = selectAiPlanForState({
        unitId: unit.id,
        stateId: session.stateRuntime.activeStateId,
        nowMs: simulationNowMs,
        sequence: nextPlanSequence + 1,
        blackboard,
        replacesPlanId: planUpdate.plan.id,
      });
      nextActivePlan = replacement.plan;
      if (replacement.plan) nextPlanSequence += 1;
    } else if (planUpdate.terminal) {
      nextPlanHistory = appendPlanHistory(nextPlanHistory, planUpdate.plan);
      nextActivePlan = undefined;
    }
    session = {
      ...applyRuntimeResultToSession(session, planResult, simulationNowMs),
      stateRuntime: stateUpdate.runtime,
      activePlan: nextActivePlan,
      planHistory: nextPlanHistory,
      planSequence: nextPlanSequence,
    };
    result = cancellationResult ? mergeRuntimeResults(cancellationResult, planResult) : planResult;
  } else {
    const runtimeCancel = isReactiveExecutionState(session.executionState) ? undefined : options.cancel;
    result = runAiGraphRuntime({
      graph,
      unitId: unit.id,
      blackboard,
      cooldowns: session.cooldowns,
      nowMs: simulationNowMs,
      tacticalHost: createTacticalHost(state, unit),
      executionState: session.executionState,
      cancel: runtimeCancel,
      events: session.eventQueue.events,
    });
    session = {
      ...applyRuntimeResultToSession(session, result, simulationNowMs),
      stateRuntime: stateUpdate.runtime,
      activePlan: undefined,
    };
  }

  publishRuntimeDebugTrace(state, unit, graph, result, nowMs, simulationNowMs, !options.applyEffects, session.status);
  if (!options.applyEffects) return result;

  unit.behaviorRuntime.aiRuntimeSession = session;
  unit.behaviorRuntime.aiGraphLastTickMs = nowMs;
  unit.behaviorRuntime.aiNodeCooldowns = { ...session.cooldowns };
  applyGraphEffects(state, unit, result.effects, result.blackboard, nowMs, session.blackboardMemory);
  unit.plan = updateUnitPlanFromRuntime(unit.plan, graph, result);
  unit.behaviorRuntime.aiGraphReason = session.activePlan?.goalRu ?? result.explanationRu ?? result.explanation;
  unit.behaviorRuntime.reason = session.activePlan?.goalRu ?? result.explanationRu ?? result.explanation;
  unit.behaviorRuntime.lastEvent = stateUpdate.transition
    ? \`ai_state_\${stateUpdate.transition.from}_to_\${stateUpdate.transition.to}\`
    : \`ai_graph_runtime_\${result.status}\`;
  publishStatePlanDebug(unit, session);
  publishSimulationAiEvents(unit, session.simulationTimeMs);
  return result;
}

export function pollAiBlackboardObservers`;

  await replaceText(path,
    /export function tickAiGameBridge\([\s\S]*?\n}\n\nexport function pollAiBlackboardObservers/,
    replacement);

  await replaceText(path,
    "function runtimeMemoryScopeDebug(\n",
    `function appendPlanHistory(history: readonly AiPlan[], plan: AiPlan): readonly AiPlan[] {
  return [...history, plan].slice(-12);
}

function mergeRuntimeResults(cancelled: AiGraphRuntimeResult, current: AiGraphRuntimeResult): AiGraphRuntimeResult {
  return {
    ...current,
    effects: [...cancelled.effects, ...current.effects],
    trace: [...cancelled.trace, ...current.trace],
    lifecycle: [...cancelled.lifecycle, ...current.lifecycle],
    cancellationReason: cancelled.cancellationReason,
    cancellationReasonRu: cancelled.cancellationReasonRu,
  };
}

function publishStatePlanDebug(unit: UnitModel, session: AiRuntimeSessionSnapshotV1): void {
  try {
    const raw = window.localStorage.getItem(DEBUG_STORAGE_KEY);
    if (!raw) return;
    const payload = JSON.parse(raw) as Record<string, unknown>;
    const stateDefinition = DEFAULT_AI_STATE_MACHINE.states[session.stateRuntime.activeStateId];
    const parentId = stateDefinition.parentStateId;
    const activePlan = session.activePlan;
    const currentStep = activePlan?.steps[activePlan.currentStepIndex];
    const previousPlan = session.planHistory.at(-1);
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
      allowedUtilityBranches: stateDefinition.allowedUtilityBranches ?? [],
      activePlan: activePlan ? {
        id: activePlan.id,
        kind: activePlan.kind,
        goalRu: activePlan.goalRu,
        status: activePlan.status,
        currentStepId: currentStep?.id,
        currentStepLabelRu: currentStep?.labelRu,
        currentStepIndex: activePlan.currentStepIndex,
        stepCount: activePlan.steps.length,
        reasonsRu: activePlan.reasonsRu,
        abortConditionsRu: activePlan.abortConditions.map((item) => item.labelRu),
        replanConditionsRu: activePlan.replanConditions.map((item) => item.labelRu),
        activeSubgraphId: currentStep?.subgraphId,
        replacesPlanId: activePlan.replacesPlanId,
      } : undefined,
      previousPlan: previousPlan ? {
        id: previousPlan.id,
        goalRu: previousPlan.goalRu,
        status: previousPlan.status,
        cancellationReasonRu: previousPlan.cancellationReasonRu,
      } : undefined,
      planSequence: session.planSequence,
    };
    window.localStorage.setItem(DEBUG_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // State/plan diagnostics are optional and must never interrupt gameplay.
  }
}

function runtimeMemoryScopeDebug(
`);
}

async function patchPackage() {
  const path = 'package.json';
  const raw = await readFile(path, 'utf8');
  const pkg = JSON.parse(raw);
  pkg.scripts['state-machine:smoke'] = 'node scripts/ai_state_machine_smoke.mjs';
  pkg.scripts['plan-runtime:smoke'] = 'node scripts/ai_plan_runtime_smoke.mjs';
  pkg.scripts['state-plan-scenario:smoke'] = 'node scripts/ai_state_plan_scenario_smoke.mjs';
  await writeFile(path, `${JSON.stringify(pkg, null, 2)}\n`);
}

await patchRuntimeSession();
await patchSnapshotAndMoveBridge();
await patchPlanConditions();
await patchGameBridge();
await patchPackage();
console.log('AI state/plan integration patch applied.');
