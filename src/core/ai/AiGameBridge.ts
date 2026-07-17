import { clampPercent, type UnitPosture } from '../behavior/BehaviorModel';
import { findBestDirectFireContact } from '../combat/CombatDecision';
import { requestFireAction } from '../combat/FireAction';
import { clearWeaponRuntime } from '../combat/WeaponModel';
import { generateCoverTacticalCandidates } from '../cover/CoverTacticalCandidates';
import { distance, type GridPosition } from '../geometry';
import { clampGridPositionToMap, type TacticalMap } from '../map/MapModel';
import { createMoveOrder } from '../orders/MoveOrder';
import { isPlayerCommandOutstanding } from '../orders/PlayerCommand';
import { clearAttentionOverride, setAttentionMode, setFocusTarget, setSearchSector } from '../perception/AttentionController';
import { degreesToRadians, radiansToDegrees } from '../perception/AttentionModel';
import { getBestPerceptionContact } from '../perception/PerceptionSystem';
import { evaluateThreatsAtPosition } from '../pressure/ThreatEvaluation';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';
import type { AiBlackboardValue } from './AiBlackboard';
import {
  evaluateAiBlackboardObservers,
  listObservedBlackboardKeys,
} from './events/AiBlackboardObserver';
import { pushAiEvent } from './events/AiEventQueue';
import type { AiGraph, AiNode } from './AiGraph';
import {
  type AiGraphEffect,
  type AiGraphRunnerBlackboard,
  type AiGraphTacticalHost,
} from './AiGraphRunner';
import {
  runAiGraphRuntime,
  type AiGraphCancellationRequest,
  type AiGraphExecutionState,
  type AiGraphRuntimeResult,
} from './AiGraphRuntime';
import {
  applyRuntimeResultToSession,
  migrateLegacyAiRuntimeSession,
  normalizeAiRuntimeSession,
  type AiRuntimeSessionSnapshotV1,
} from './runtime/AiRuntimeSession';
import { readAiGraphRuntimeReloadEffect } from './runtime/actions/ReloadAction';
import { publishSimulationAiEvents } from './events/SimulationAiEvents';
import { updateUnitPlanFromRuntime } from './UnitPlan';
import { setAiStateFromGraph } from './state/AiStateRuntime';
import { readAiExecutionOwnerToken } from './state/AiStatePlanPipeline';
import { DEFAULT_AI_STATE_MACHINE } from './state/AiStateMachine';
import bundledGraph from '../../data/ai/soldier_default_survival_graph.json';

const GRAPH_STORAGE_KEY = 'real-wargame.ai-node-editor.graph.v6';
const DEBUG_STORAGE_KEY = 'real-wargame.ai-node-editor.debug.v1';
export const AI_GRAPH_TICK_INTERVAL_MS = 600;
export const AI_OBSERVER_POLL_INTERVAL_MS = 60;

type LegacyAiUnitGraphRuntime = UnitModel['behaviorRuntime'] & {
  aiGraphMemory?: AiGraphRunnerBlackboard;
  aiGraphSimulationTimeMs?: number;
  aiGraphExecutionState?: AiGraphExecutionState;
};

export interface AiGameBridgeHandle {
  destroy(): void;
  tickNow(): AiGraphRuntimeResult | null;
  evaluateNow(): AiGraphRuntimeResult | null;
  previewCancelNow(reason: string, reasonRu?: string): AiGraphRuntimeResult | null;
}

export interface AiRuntimeGraphSnapshot {
  readonly graph: AiGraph;
  readonly sourceRevision: string;
}

export interface AiGameBridgeTickOptions {
  readonly force: boolean;
  readonly applyEffects: boolean;
  readonly cancel?: AiGraphCancellationRequest;
  readonly graphSnapshot?: AiRuntimeGraphSnapshot;
  readonly cycleStartMs?: number;
  readonly cycleEndMs?: number;
  readonly diagnosticPreview?: boolean;
}

export function installAiGameBridge(state: SimulationState): AiGameBridgeHandle {
  return {
    destroy: () => undefined,
    tickNow: () => tickAiGameBridge(state, getSimulationNowMs(state), { force: true, applyEffects: false }),
    evaluateNow: () => tickAiGameBridge(state, getSimulationNowMs(state), { force: true, applyEffects: false }),
    previewCancelNow: (reason, reasonRu) => tickAiGameBridge(state, getSimulationNowMs(state), {
      force: true,
      applyEffects: false,
      cancel: { reason, reasonRu },
    }),
  };
}


export function cloneSimulationStateForDiagnostic(state: SimulationState): SimulationState {
  return JSON.parse(JSON.stringify(state)) as SimulationState;
}

/** Selected-unit read-only facade retained for tests and diagnostics. */
export function tickAiGameBridge(
  state: SimulationState,
  nowMs = getSimulationNowMs(state),
  options: AiGameBridgeTickOptions = { force: true, applyEffects: false },
): AiGraphRuntimeResult | null {
  const unit = state.selectedUnitId
    ? state.units.find((candidate) => candidate.id === state.selectedUnitId)
    : undefined;
  return unit ? tickAiGameBridgeForUnit(state, unit, nowMs, options) : null;
}

/**
 * Validated external per-unit facade. Scheduler code must call the trusted
 * variant so its stable O(n) traversal does not perform nested membership scans.
 */
export function tickAiGameBridgeForUnit(
  state: SimulationState,
  unit: UnitModel,
  nowMs = getSimulationNowMs(state),
  options: AiGameBridgeTickOptions = { force: false, applyEffects: true },
): AiGraphRuntimeResult | null {
  if (!state.units.includes(unit)) return null;
  if (!options.applyEffects) {
    const diagnosticState = cloneSimulationStateForDiagnostic(state);
    const diagnosticUnit = diagnosticState.units.find((candidate) => candidate.id === unit.id);
    if (!diagnosticUnit) return null;
    return tickAiGameBridgeForTrustedUnit(diagnosticState, diagnosticUnit, nowMs, {
      ...options,
      applyEffects: true,
      diagnosticPreview: true,
    });
  }
  return tickAiGameBridgeForTrustedUnit(state, unit, nowMs, options);
}

/** Trusted scheduler path. The unit is already known to belong to state.units. */
export function tickAiGameBridgeForTrustedUnit(
  state: SimulationState,
  unit: UnitModel,
  nowMs = getSimulationNowMs(state),
  options: AiGameBridgeTickOptions = { force: false, applyEffects: true },
): AiGraphRuntimeResult | null {
  const graphSnapshot = options.graphSnapshot ?? resolveRuntimeGraphSnapshot();
  const graph = graphSnapshot.graph;
  const cycleStartMs = Math.max(0, options.cycleStartMs ?? nowMs);
  const cycleEndMs = Math.max(cycleStartMs, options.cycleEndMs ?? (nowMs + 1));

  let session = ensureRuntimeSession(unit, graph.id);
  session = clearLegacyAutomaticStatePlan(unit, session);
  unit.behaviorRuntime.aiRuntimeSession = session;
  publishSimulationAiEvents(unit, cycleEndMs);
  session = unit.behaviorRuntime.aiRuntimeSession ?? session;

  const results: AiGraphRuntimeResult[] = [];
  const decisionTimes: number[] = [];
  let nextOrdinaryAtMs = Math.max(0, unit.behaviorRuntime.aiNextDecisionAtMs);

  const runDecisionAt = (decisionAtMs: number): void => {
    const previousPlan = readActiveRunPlan(graph, session.executionState);
    const blackboard = buildGraphControlBlackboard(state, unit, session, graph);
    const result = runAiGraphRuntime({
      graph,
      unitId: unit.id,
      blackboard,
      cooldowns: session.cooldowns,
      nowMs: decisionAtMs,
      tacticalHost: createTacticalHost(state, unit),
      executionState: session.executionState,
      cancel: options.cancel,
      events: session.eventQueue.events,
    });
    session = applyRuntimeResultToSession(session, result, decisionAtMs);
    session = applyGraphStateEffects(session, result.effects, decisionAtMs);
    session = updateGraphPlanMemory(session, graph, result, previousPlan);
    unit.behaviorRuntime.aiRuntimeSession = session;
    unit.behaviorRuntime.aiGraphLastTickMs = decisionAtMs;
    unit.behaviorRuntime.aiDecisionTickCount += 1;
    unit.behaviorRuntime.aiNodeCooldowns = { ...session.cooldowns };
    applyGraphEffects(state, unit, result.effects, result.blackboard, decisionAtMs, session.blackboardMemory);
    unit.plan = updateUnitPlanFromRuntime(unit.plan, graph, result);
    unit.behaviorRuntime.aiGraphReason = result.explanationRu ?? result.explanation;
    unit.behaviorRuntime.reason = result.explanationRu ?? result.explanation;
    const stateEffect = [...result.effects].reverse().find((effect) => effect.type === 'set_ai_state');
    unit.behaviorRuntime.lastEvent = stateEffect
      ? `ai_state_graph_to_${stateEffect.stateId}`
      : `ai_graph_runtime_${result.status}`;
    publishSimulationAiEvents(unit, decisionAtMs);
    session = unit.behaviorRuntime.aiRuntimeSession ?? session;
    results.push(result);
    decisionTimes.push(decisionAtMs);
  };

  if (options.force) {
    runDecisionAt(nowMs);
  } else {
    let ordinaryDueAtMs = unit.behaviorRuntime.aiDecisionTickCount === 0
      ? cycleStartMs
      : nextOrdinaryAtMs;
    let observerDueAtMs = unit.behaviorRuntime.aiObserverPollCount === 0
      ? cycleStartMs
      : Math.max(0, unit.behaviorRuntime.aiObserverNextPollMs);
    let observerGuard = 0;
    let decisionGuard = 0;

    while (true) {
      const ordinaryInCycle = decisionGuard < 64 && ordinaryDueAtMs <= cycleEndMs
        ? ordinaryDueAtMs
        : Number.POSITIVE_INFINITY;
      const observerInCycle = observerGuard < 256 && observerDueAtMs <= cycleEndMs
        ? observerDueAtMs
        : Number.POSITIVE_INFINITY;
      const atMs = Math.min(ordinaryInCycle, observerInCycle);
      if (!Number.isFinite(atMs)) break;

      let reactiveWake = false;
      if (observerInCycle === atMs) {
        const observerPoll = pollAiBlackboardObserversAt(state, unit, atMs);
        session = unit.behaviorRuntime.aiRuntimeSession ?? session;
        observerDueAtMs = unit.behaviorRuntime.aiObserverNextPollMs;
        observerGuard += 1;
        if (observerPoll.events > 0) {
          reactiveWake = true;
          unit.behaviorRuntime.aiReactiveWakeCount += 1;
          unit.behaviorRuntime.aiLastReactiveWakeAtMs = atMs;
        }
      }

      const ordinaryDue = ordinaryInCycle === atMs;
      if (ordinaryDue) {
        ordinaryDueAtMs += AI_GRAPH_TICK_INTERVAL_MS;
        nextOrdinaryAtMs = ordinaryDueAtMs;
      }
      if (ordinaryDue || reactiveWake) {
        runDecisionAt(atMs);
        decisionGuard += 1;
      }
    }
    unit.behaviorRuntime.aiNextDecisionAtMs = nextOrdinaryAtMs;
  }

  unit.behaviorRuntime.aiRuntimeSession = session;
  if (results.length === 0) return null;

  const lastResult = results[results.length - 1];
  const combinedResult: AiGraphRuntimeResult = results.length === 1
    ? lastResult
    : { ...lastResult, effects: results.flatMap((result) => result.effects) };

  if (state.selectedUnitId === unit.id) {
    publishRuntimeDebugTrace(
      state,
      unit,
      graph,
      combinedResult,
      decisionTimes[decisionTimes.length - 1],
      cycleEndMs,
      Boolean(options.diagnosticPreview),
      session.status,
    );
    publishStatePlanDebug(session, graph, combinedResult);
  }
  return combinedResult;
}

interface GraphOwnedPlanDescriptor {
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

interface AiObserverPollResult {
  readonly events: number;
  readonly checks: number;
}

function pollAiBlackboardObserversAt(
  state: SimulationState,
  unit: UnitModel,
  pollAtMs: number,
): AiObserverPollResult {
  const session = unit.behaviorRuntime.aiRuntimeSession;
  if (!session) return { events: 0, checks: 0 };

  const keys = listObservedBlackboardKeys(session.observerRegistry);
  let nextSession = session;
  let events = 0;
  let checks = 0;
  if (keys.length > 0) {
    const compactBlackboard = buildObservedBlackboardForUnit(state, unit, keys, session.blackboardMemory);
    const evaluated = evaluateAiBlackboardObservers(
      session.observerRegistry,
      compactBlackboard,
      pollAtMs,
    );
    let queue: AiRuntimeSessionSnapshotV1['eventQueue'] = session.eventQueue;
    for (const event of evaluated.events) queue = pushAiEvent(queue, event, pollAtMs).queue;
    events = evaluated.events.length;
    checks = evaluated.checks;
    nextSession = {
      ...session,
      eventQueue: queue,
      observerRegistry: evaluated.registry,
    };
  }

  unit.behaviorRuntime.aiRuntimeSession = nextSession;
  unit.behaviorRuntime.aiObserverNextPollMs = pollAtMs + AI_OBSERVER_POLL_INTERVAL_MS;
  unit.behaviorRuntime.aiObserverPollCount += 1;
  return { events, checks };
}

export function pollAiBlackboardObservers(
  state: SimulationState,
  unit: UnitModel,
  cycleEndMs?: number,
  cycleStartMs?: number,
): { readonly events: number; readonly checks: number; readonly polls: number; readonly firstEventAtMs: number | null } {
  if (!unit.behaviorRuntime.aiRuntimeSession) {
    return { events: 0, checks: 0, polls: 0, firstEventAtMs: null };
  }

  const simulationNowMs = getSimulationNowMs(state);
  const effectiveCycleStartMs = Math.max(0, cycleStartMs ?? simulationNowMs);
  let nextPollAtMs = unit.behaviorRuntime.aiObserverPollCount === 0
    ? effectiveCycleStartMs
    : Math.max(0, unit.behaviorRuntime.aiObserverNextPollMs);
  const effectiveCycleEndMs = cycleEndMs ?? Math.max(simulationNowMs, nextPollAtMs);
  let events = 0;
  let checks = 0;
  let polls = 0;
  let firstEventAtMs: number | null = null;

  while (nextPollAtMs <= effectiveCycleEndMs && polls < 256) {
    const evaluated = pollAiBlackboardObserversAt(state, unit, nextPollAtMs);
    if (evaluated.events > 0 && firstEventAtMs === null) firstEventAtMs = nextPollAtMs;
    events += evaluated.events;
    checks += evaluated.checks;
    polls += 1;
    nextPollAtMs = unit.behaviorRuntime.aiObserverNextPollMs;
  }

  return { events, checks, polls, firstEventAtMs };
}

export function buildObservedBlackboardForUnit(
  state: SimulationState,
  unit: UnitModel,
  keys: readonly string[],
  runtimeMemory: AiGraphRunnerBlackboard = readCurrentRuntimeMemory(unit),
): AiGraphRunnerBlackboard {
  const result: AiGraphRunnerBlackboard = {};
  const command = unit.playerCommand;
  for (const key of keys) {
    const value = readCompactObservedValue(state, unit, command, runtimeMemory, key);
    if (value !== undefined) result[key] = cloneObservedValue(value);
  }
  return result;
}

export function buildBlackboardForUnit(
  state: SimulationState,
  unit: UnitModel,
  runtimeMemory: AiGraphRunnerBlackboard = readCurrentRuntimeMemory(unit),
): AiGraphRunnerBlackboard {
  const threats = evaluateThreatsAtPosition(state.map, unit, state.pressureZones);
  const bestContact = getBestPerceptionContact(unit);
  const threatPosition = bestContact?.lastKnownPosition ?? threats.targetPosition;
  const selectedCover = readPosition(runtimeMemory.best_cover_position);
  const distanceToCover = selectedCover
    ? distance(unit.position, selectedCover) * state.map.metersPerCell
    : 9999;
  const strongest = threats.strongest;
  const threatDistance = threatPosition
    ? distance(unit.position, threatPosition) * state.map.metersPerCell
    : 9999;
  const underFire = threats.danger > 0 || threats.suppression > 0;
  const currentExpectedProtection = Math.max(
    strongest?.expectedProtection ?? 0,
    threats.strongestKnown?.expectedProtection ?? 0,
  );
  const currentThreatConfidence = Math.max(
    bestContact?.confidence ?? 0,
    ...unit.tacticalKnowledge.threats.map((threat) => threat.confidence),
  );
  const command = unit.playerCommand;
  const contactVisible = Boolean(bestContact?.visibleNow);
  const contactKnown = Boolean(bestContact || threats.enemyKnown);

  return {
    ...(isRecord(bundledGraph.blackboardDefaults) ? normalizeBlackboard(bundledGraph.blackboardDefaults) : {}),
    ...runtimeMemory,
    danger: clampPercent(threats.danger),
    stress: clampPercent(Math.round(unit.behaviorRuntime.stress)),
    suppression: clampPercent(threats.suppression),
    fatigue: clampPercent(Math.round(unit.soldier.condition.fatigue)),
    morale: clampPercent(Math.round(unit.soldier.condition.morale)),
    health: clampPercent(Math.round(unit.soldier.condition.health)),
    ammo: Math.max(0, Math.round(unit.behaviorRuntime.ammo)),
    distanceToCover: Number.isFinite(distanceToCover) ? Math.round(distanceToCover) : 9999,
    enemyVisible: contactVisible,
    enemyKnown: contactKnown,
    underFire,
    hasOrder: Boolean(unit.order),
    isInCover: (strongest?.coverProtection ?? 0) > 0,
    weaponReady: unit.behaviorRuntime.weaponReady && unit.behaviorRuntime.ammo > 0,
    directionToThreat: threatPosition
      ? normalizeDegrees(radiansToDegrees(Math.atan2(threatPosition.y - unit.position.y, threatPosition.x - unit.position.x)))
      : -1,
    threatDistance: Math.round(threatDistance),
    threatAngle: strongest?.zone.arcDegrees ?? 0,
    coverProtection: strongest?.coverProtection ?? 0,
    bestCoverQuality: Math.max(0, Math.round(readNumber(runtimeMemory.bestCoverQuality, 0))),
    currentPositionDanger: clampPercent(threats.danger),
    currentExpectedProtection: clampPercent(currentExpectedProtection),
    routeDanger: clampPercent(threats.danger),
    threatConfidence: Math.round(currentThreatConfidence),
    attention_mode: unit.attentionRuntime.mode,
    attention_focus_direction: normalizeDegrees(radiansToDegrees(unit.attentionRuntime.focusDirectionRadians)),
    best_contact_stage: bestContact?.stage ?? 'none',
    best_contact_confidence: Math.round(bestContact?.confidence ?? 0),
    best_contact_uncertainty: Math.round((bestContact?.uncertaintyCells ?? 0) * state.map.metersPerCell),
    contact_visible_now: contactVisible,
    suspected_enemy_position: bestContact ? { ...bestContact.lastKnownPosition } : null,
    current_action: unit.behaviorRuntime.currentAction,
    self_position: unit.position,
    order_target_position: unit.order?.target ?? null,
    player_command_active: isPlayerCommandOutstanding(command),
    player_command_type: command?.type ?? 'none',
    player_command_status: command?.status ?? 'none',
    player_command_target_position: command ? { ...command.target } : null,
    player_command_revision: command?.revision ?? 0,
    retreat_position: makeRetreatPoint(state.map, unit.position, threatPosition),
    current_target: contactVisible && bestContact ? { ...bestContact.lastKnownPosition } : null,
    remembered_enemy_position: contactKnown && threatPosition ? { ...threatPosition } : null,
    visible_enemy_id: contactVisible ? bestContact?.stimulusId ?? null : null,
    known_enemy_position: contactKnown && threatPosition ? { ...threatPosition } : null,
  };
}

export function ensureRuntimeSession(unit: UnitModel, graphId: string): AiRuntimeSessionSnapshotV1 {
  const runtime = unit.behaviorRuntime as LegacyAiUnitGraphRuntime;
  if (runtime.aiRuntimeSession) {
    const previousSession = runtime.aiRuntimeSession;
    const ownedMoveToken = readAiExecutionOwnerToken(previousSession.executionState);
    const normalized = normalizeAiRuntimeSession(previousSession, { graphId, unitId: unit.id });
    runtime.aiRuntimeSession = normalized.session;
    if (normalized.resetReasonRu) {
      if (ownedMoveToken && unit.order?.source === 'ai' && unit.order.ownerToken === ownedMoveToken) {
        unit.order = null;
      }
      unit.behaviorRuntime.aiRouteStatusState = null;
      runtime.aiGraphReason = normalized.resetReasonRu;
      runtime.reason = normalized.resetReasonRu;
      runtime.lastEvent = 'ai_runtime_session_reset';
    }
    return normalized.session;
  }

  const migrated = migrateLegacyAiRuntimeSession({
    graphId,
    unitId: unit.id,
    aiGraphSimulationTimeMs: runtime.aiGraphSimulationTimeMs,
    aiGraphExecutionState: runtime.aiGraphExecutionState,
    aiGraphMemory: runtime.aiGraphMemory,
    aiNodeCooldowns: runtime.aiNodeCooldowns,
  });
  runtime.aiRuntimeSession = migrated;
  return migrated;
}

function readCompactObservedValue(
  _state: SimulationState,
  unit: UnitModel,
  command: UnitModel['playerCommand'],
  memory: AiGraphRunnerBlackboard,
  key: string,
): AiBlackboardValue | undefined {
  switch (key) {
    case 'danger': return clampPercent(unit.behaviorRuntime.danger);
    case 'stress': return clampPercent(Math.round(unit.behaviorRuntime.stress));
    case 'suppression': return clampPercent(unit.behaviorRuntime.suppression);
    case 'fatigue': return clampPercent(Math.round(unit.soldier.condition.fatigue));
    case 'morale': return clampPercent(Math.round(unit.soldier.condition.morale));
    case 'health': return clampPercent(Math.round(unit.soldier.condition.health));
    case 'ammo': return Math.max(0, Math.round(unit.behaviorRuntime.ammo));
    case 'weaponReady': return unit.behaviorRuntime.weaponReady && unit.behaviorRuntime.ammo > 0;
    case 'underFire': return unit.behaviorRuntime.danger > 0 || unit.behaviorRuntime.suppression > 0;
    case 'hasOrder': return Boolean(unit.order);
    case 'current_action': return unit.behaviorRuntime.currentAction;
    case 'self_position': return { ...unit.position };
    case 'order_target_position': return unit.order ? { ...unit.order.target } : null;
    case 'player_command_active': return isPlayerCommandOutstanding(command);
    case 'player_command_type': return command?.type ?? 'none';
    case 'player_command_status': return command?.status ?? 'none';
    case 'player_command_target_position': return command ? { ...command.target } : null;
    case 'player_command_revision': return command?.revision ?? 0;
    case 'active_move_source': return unit.order ? unit.order.source ?? (unit.order.ownerToken ? 'ai' : 'player') : null;
    case 'active_move_owner_token': return unit.order?.ownerToken ?? null;
    case 'active_move_target': return unit.order ? { ...unit.order.target } : null;
    default: return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : undefined;
  }
}

function cloneObservedValue(value: AiBlackboardValue): AiBlackboardValue {
  return typeof value === 'object' && value !== null ? { ...value } : value;
}

function readCurrentRuntimeMemory(unit: UnitModel): AiGraphRunnerBlackboard {
  const runtime = unit.behaviorRuntime as LegacyAiUnitGraphRuntime;
  return runtime.aiRuntimeSession?.blackboardMemory ?? runtime.aiGraphMemory ?? {};
}

function createTacticalHost(state: SimulationState, unit: UnitModel): AiGraphTacticalHost {
  return {
    resolveDistanceMeters: (fromKey, toKey, blackboard) => resolveDistanceMeters(state, unit, blackboard, fromKey, toKey),
    generateCoverCandidates: (request) => {
      const threats = evaluateThreatsAtPosition(state.map, unit, state.pressureZones);
      return generateCoverTacticalCandidates({ map: state.map, unit, threatPosition: threats.targetPosition, orderTarget: unit.order?.target ?? null, searchRadiusMeters: request.searchRadiusMeters, maxCandidates: request.maxCandidates, maxCalculationMs: request.maxCalculationMs });
    },
    tacticalCheck: (checkKind, blackboard) => evaluateTacticalCheck(state, unit, blackboard, checkKind),
  };
}

function applyGraphEffects(
  state: SimulationState,
  unit: UnitModel,
  effects: readonly AiGraphEffect[],
  blackboard: AiGraphRunnerBlackboard,
  nowMs: number,
  runtimeMemory: AiGraphRunnerBlackboard,
): void {
  for (const effect of effects) {
    const reloadEffect = readAiGraphRuntimeReloadEffect(effect);
    if (reloadEffect) {
      if (reloadEffect.type === 'begin_reload') {
        unit.behaviorRuntime.weaponReady = false;
        unit.behaviorRuntime.currentAction = 'reload';
        unit.behaviorRuntime.reason = reloadEffect.reasonRu ?? reloadEffect.reason;
        unit.behaviorRuntime.lastEvent = 'ai_graph_reload_started';
      } else if (reloadEffect.type === 'complete_reload') {
        unit.behaviorRuntime.ammo = reloadEffect.targetAmmo;
        unit.behaviorRuntime.weaponReady = reloadEffect.targetAmmo > 0;
        clearWeaponRuntime(unit);
        unit.behaviorRuntime.currentAction = 'reload_complete';
        unit.behaviorRuntime.reason = reloadEffect.reasonRu ?? reloadEffect.reason;
        unit.behaviorRuntime.lastEvent = 'ai_graph_reload_completed';
      } else {
        unit.behaviorRuntime.weaponReady = unit.behaviorRuntime.ammo > 0;
        unit.behaviorRuntime.currentAction = 'observe';
        unit.behaviorRuntime.reason = reloadEffect.reasonRu ?? reloadEffect.reason;
        unit.behaviorRuntime.lastEvent = 'ai_graph_reload_cancelled';
      }
      continue;
    }

    if (effect.type === 'set_ai_state') continue;

    if (effect.type === 'write_memory') {
      runtimeMemory[effect.key] = effect.value;
      continue;
    }

    if (effect.type === 'set_posture') {
      applyPosture(unit, effect.posture);
      unit.behaviorRuntime.reason = effect.reasonRu ?? effect.reason;
      continue;
    }

    if (effect.type === 'set_action') {
      applyAction(state, unit, effect, blackboard, nowMs);
      continue;
    }

    if (effect.type === 'set_attention_mode') {
      setAttentionMode(unit, effect.mode, 'ai');
      unit.behaviorRuntime.reason = effect.reasonRu ?? effect.reason;
      unit.behaviorRuntime.lastEvent = 'ai_graph_set_attention_mode';
      continue;
    }

    if (effect.type === 'set_search_sector') {
      setSearchSector(unit, degreesToRadians(effect.centerDegrees), degreesToRadians(effect.arcDegrees), 'ai');
      unit.behaviorRuntime.reason = effect.reasonRu ?? effect.reason;
      unit.behaviorRuntime.lastEvent = 'ai_graph_set_search_sector';
      continue;
    }

    if (effect.type === 'clear_attention_override') {
      clearAttentionOverride(unit);
      unit.behaviorRuntime.reason = effect.reasonRu ?? effect.reason;
      unit.behaviorRuntime.lastEvent = 'ai_graph_clear_attention_override';
      continue;
    }

    if (effect.type === 'set_movement_mode') {
      unit.behaviorRuntime.currentAction = `movement_mode:${effect.mode}`;
      unit.behaviorRuntime.reason = effect.reasonRu ?? effect.reason;
      unit.behaviorRuntime.lastEvent = 'ai_graph_set_movement_mode';
      continue;
    }

    if (effect.type === 'say_message') {
      unit.behaviorRuntime.aiSpeech = effect.message;
      unit.behaviorRuntime.aiSpeechRu = effect.messageRu ?? effect.message;
      unit.behaviorRuntime.aiSpeechUntilMs = nowMs + effect.durationSeconds * 1000;
      unit.behaviorRuntime.currentAction = 'say_message';
      unit.behaviorRuntime.reason = effect.messageRu ?? effect.message;
      unit.behaviorRuntime.lastEvent = 'ai_graph_say_message';
      continue;
    }

    unit.behaviorRuntime.reason = effect.reasonRu ?? effect.reason;
    unit.behaviorRuntime.lastEvent = 'ai_graph_write_reason';
  }
}

function applyAction(
  state: SimulationState,
  unit: UnitModel,
  effect: Extract<AiGraphEffect, { type: 'set_action' }>,
  blackboard: AiGraphRunnerBlackboard,
  _nowMs: number,
): void {
  if (effect.action === 'move_to') {
    const target = readPosition(blackboard[effect.targetKey ?? 'best_cover_position']);
    if (target) unit.order = createMoveOrder(clampGridPositionToMap(state.map, target));
  } else if (effect.action === 'retreat') {
    const target = readPosition(blackboard.retreat_position);
    if (target) unit.order = createMoveOrder(clampGridPositionToMap(state.map, target));
  } else if (effect.action === 'wait') {
    unit.order = null;
  } else if (effect.action === 'reload') {
    unit.behaviorRuntime.ammo = 30;
    unit.behaviorRuntime.weaponReady = true;
    clearWeaponRuntime(unit);
  } else if (effect.action === 'fire') {
    const contact = findBestDirectFireContact(state, unit);
    if (contact) requestFireAction(state, unit, contact.id);
    else {
      unit.behaviorRuntime.reason = 'Нет личного контакта для стрельбы.';
      unit.behaviorRuntime.lastEvent = 'combat_fire_request_missing_contact';
    }
    return;
  } else if (effect.action === 'suppress') {
    unit.behaviorRuntime.reason = 'Подавляющий огонь будет добавлен после одиночной винтовочной стрельбы.';
    unit.behaviorRuntime.lastEvent = 'combat_suppression_not_available_v1';
    return;
  }

  unit.behaviorRuntime.currentAction = effect.action;
  unit.behaviorRuntime.reason = effect.reasonRu ?? effect.reason;
  unit.behaviorRuntime.lastEvent = `ai_graph_${effect.action}`;
}

function applyPosture(unit: UnitModel, value: string): void {
  const nextPosture: UnitPosture = value === 'stand' ? 'standing' : value === 'crouch' ? 'crouched' : 'prone';
  if (unit.behaviorRuntime.posture !== nextPosture) {
    unit.behaviorRuntime.previousPosture = unit.behaviorRuntime.posture;
    unit.behaviorRuntime.posture = nextPosture;
    unit.behaviorRuntime.postureChangedBecause = `AI graph posture: ${value}`;
  }

  unit.behaviorRuntime.currentAction = `posture:${nextPosture}`;
  unit.behaviorRuntime.lastEvent = 'ai_graph_set_posture';
}

function publishRuntimeDebugTrace(
  state: SimulationState,
  unit: UnitModel,
  graph: AiGraph,
  result: AiGraphRuntimeResult,
  nowMs: number,
  simulationNowMs: number,
  previewOnly: boolean,
  runtimeSessionStatus: AiRuntimeSessionSnapshotV1['status'],
): void {
  try {
    const tacticalQueries = readTacticalQueryDebugSnapshot(unit.id, graph.id, result.tacticalQueries);
    const payload = {
      version: 1,
      kind: 'ai-graph-runtime-debug',
      graphId: graph.id,
      graphName: graph.name,
      graphNameRu: graph.nameRu,
      graphNodeCount: graph.nodes.length,
      unitId: unit.id,
      unitLabel: unit.labels.ru ?? unit.labels.en,
      selectedBranchNodeId: result.selectedBranchNodeId,
      selectedBranchName: result.selectedBranchName,
      selectedBranchNameRu: result.selectedBranchNameRu,
      ok: result.ok,
      status: result.status,
      runtimeSessionStatus,
      activeNodeId: result.activeNodeId,
      activeNodeName: result.activeNodeName,
      activeNodeNameRu: result.activeNodeNameRu,
      activeSubgraphId: result.activeSubgraphId,
      activeSubgraphName: result.activeSubgraphName,
      activeSubgraphNameRu: result.activeSubgraphNameRu,
      activeSubgraphPath: result.activeSubgraphPath,
      elapsedMs: result.elapsedMs,
      lifecycle: result.lifecycle,
      cancellationReason: result.cancellationReason,
      cancellationReasonRu: result.cancellationReasonRu,
      paused: Boolean((state as SimulationState & { paused?: boolean }).paused),
      previewOnly,
      nowMs,
      simulationNowMs,
      explanation: result.explanation,
      explanationRu: result.explanationRu,
      trace: result.trace,
      scores: result.scores,
      tacticalQueries,
      effects: result.effects,
      consumedEventIds: result.consumedEventIds,
      reactiveAbort: result.reactiveAbort,
      observerChecks: unit.behaviorRuntime.aiRuntimeSession?.observerRegistry.observerChecks ?? 0,
      observerEvents: unit.behaviorRuntime.aiRuntimeSession?.observerRegistry.observerEvents ?? 0,
      blackboard: result.blackboard,
      ...runtimeMemoryScopeDebug(unit.behaviorRuntime.aiRuntimeSession, result),
    };
    window.localStorage.setItem(DEBUG_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Debug overlay is optional. If localStorage is blocked or full, gameplay must continue.
  }
}

function readTacticalQueryDebugSnapshot(unitId: string, graphId: string, current: AiGraphRuntimeResult['tacticalQueries']): AiGraphRuntimeResult['tacticalQueries'] {
  if (Object.keys(current).length > 0) return current;
  try { const raw = window.localStorage.getItem(DEBUG_STORAGE_KEY); if (!raw) return {}; const previous = JSON.parse(raw) as { unitId?: unknown; graphId?: unknown; tacticalQueries?: unknown }; if (previous.unitId !== unitId || previous.graphId !== graphId || !previous.tacticalQueries || typeof previous.tacticalQueries !== 'object') return {}; return previous.tacticalQueries as AiGraphRuntimeResult['tacticalQueries']; } catch { return {}; }
}

function publishStatePlanDebug(
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

function runtimeMemoryScopeDebug(
  session: AiRuntimeSessionSnapshotV1 | null | undefined,
  result: AiGraphRuntimeResult,
): {
  readonly memoryScopeKeys: Record<string, readonly string[]>;
  readonly memoryScopeKeyCounts: Record<string, number>;
} {
  const scopes = session?.memoryScopes;
  const activeData = result.executionState?.activeData;
  const subgraphLocal = activeData && activeData.kind === 'subgraph'
    ? { [activeData.subgraphId]: Object.keys(activeData.localBlackboard).sort() }
    : Object.fromEntries(Object.entries(scopes?.subgraphLocalMemory ?? {}).map(([ownerId, values]) => [ownerId, Object.keys(values).sort()]));
  const nodeLocal = Object.fromEntries(Object.entries(scopes?.nodeLocalState ?? {}).map(([ownerId, values]) => [ownerId, Object.keys(values).sort()]));
  const memoryScopeKeys = {
    persistentSoldierMemory: Object.keys(scopes?.persistentSoldierMemory ?? {}).sort(),
    runtimeSessionMemory: Object.keys(scopes?.runtimeSessionMemory ?? {}).sort(),
    activeStateMemory: result.executionState
      ? ['activeNodeId', 'activeNodeStartedAtMs', 'lastUpdatedAtMs', 'status']
      : Object.keys(scopes?.activeStateMemory ?? {}).sort(),
    subgraphLocalMemory: Object.entries(subgraphLocal).flatMap(([ownerId, keys]) => keys.map((key) => `${ownerId}.${key}`)),
    nodeLocalState: Object.entries(nodeLocal).flatMap(([ownerId, keys]) => keys.map((key) => `${ownerId}.${key}`)),
  } satisfies Record<string, readonly string[]>;
  return {
    memoryScopeKeys,
    memoryScopeKeyCounts: Object.fromEntries(Object.entries(memoryScopeKeys).map(([scope, keys]) => [scope, keys.length])),
  };
}

function evaluateTacticalCheck(
  _state: SimulationState,
  unit: UnitModel,
  blackboard: AiGraphRunnerBlackboard,
  checkKind: string,
): boolean {
  if (checkKind === 'cover_exists') {
    return Boolean(readPosition(blackboard.best_cover_position));
  }
  if (checkKind === 'ammo_available') return readNumber(blackboard.ammo, 0) > 0;
  if (checkKind === 'can_execute_order') return Boolean(unit.order);
  if (checkKind === 'line_of_sight' || checkKind === 'line_of_fire') return readBoolean(blackboard.enemyVisible, false);
  if (checkKind === 'path_exists') return true;
  return false;
}

function resolveDistanceMeters(
  state: SimulationState,
  unit: UnitModel,
  blackboard: AiGraphRunnerBlackboard,
  fromKey: string,
  toKey: string,
): number {
  const from = resolvePoint(state, unit, blackboard, fromKey);
  const to = resolvePoint(state, unit, blackboard, toKey);
  if (!from || !to) return 9999;
  return distance(from, to) * state.map.metersPerCell;
}

function resolvePoint(
  state: SimulationState,
  unit: UnitModel,
  blackboard: AiGraphRunnerBlackboard,
  key: string,
): GridPosition | null {
  const threats = evaluateThreatsAtPosition(state.map, unit, state.pressureZones);
  if (key === 'self') return unit.position;
  if (key === 'cover') return readPosition(blackboard.best_cover_position);
  if (key === 'orderPoint' || key === 'orderTarget') return unit.order?.target ?? null;
  if (key === 'playerCommandTarget') return unit.playerCommand?.target ?? null;
  if (key === 'currentTarget') return readPosition(blackboard.current_target);
  if (key === 'enemy') return readPosition(blackboard.remembered_enemy_position) ?? readPosition(blackboard.current_target);
  if (key === 'retreatPoint') return makeRetreatPoint(state.map, unit.position, threats.targetPosition);
  return readPosition(blackboard[key]);
}

function makeRetreatPoint(map: TacticalMap, position: GridPosition, threatPosition: GridPosition | null): GridPosition {
  if (!threatPosition) return clampGridPositionToMap(map, { x: position.x - 2, y: position.y });

  const dx = position.x - threatPosition.x;
  const dy = position.y - threatPosition.y;
  const length = Math.hypot(dx, dy) || 1;
  return clampGridPositionToMap(map, {
    x: position.x + (dx / length) * 2,
    y: position.y + (dy / length) * 2,
  });
}

let cachedRuntimeGraphSnapshot: AiRuntimeGraphSnapshot | null = null;

export function resolveRuntimeGraphSnapshot(): AiRuntimeGraphSnapshot {
  const raw = readLocalStorageGraph();
  const sourceRevision = raw ?? '__bundled_graph__';
  if (cachedRuntimeGraphSnapshot?.sourceRevision === sourceRevision) return cachedRuntimeGraphSnapshot;
  const parsed = raw ? safeJsonParse(raw) : null;
  const graph = deepFreeze(normalizeRuntimeGraph(parsed ?? bundledGraph));
  cachedRuntimeGraphSnapshot = Object.freeze({ graph, sourceRevision });
  return cachedRuntimeGraphSnapshot;
}

export function resetRuntimeGraphSnapshotCacheForTests(): void {
  cachedRuntimeGraphSnapshot = null;
}

function readLocalStorageGraph(): string | null {
  try {
    return window.localStorage.getItem(GRAPH_STORAGE_KEY);
  } catch {
    return null;
  }
}

function normalizeRuntimeGraph(value: unknown): AiGraph {
  if (!isRecord(value) || !Array.isArray(value.nodes)) return normalizeRuntimeGraph(bundledGraph);

  const nodes: AiNode[] = value.nodes
    .filter(isRecord)
    .map((node, index): AiNode => ({
      id: readString(node.id, `node_${index + 1}`),
      type: readString(node.type, 'Root'),
      displayName: typeof node.displayName === 'string' ? node.displayName : undefined,
      displayNameRu: typeof node.displayNameRu === 'string' ? node.displayNameRu : undefined,
      description: typeof node.description === 'string' ? node.description : undefined,
      descriptionRu: typeof node.descriptionRu === 'string' ? node.descriptionRu : undefined,
      children: Array.isArray(node.children) ? node.children.filter((child): child is string => typeof child === 'string') : [],
      parameters: isRecord(node.parameters) ? normalizeBlackboard(node.parameters) : {},
      inputBindings: isRecord(node.inputBindings) ? node.inputBindings as AiNode['inputBindings'] : undefined,
      outputBindings: isRecord(node.outputBindings) ? node.outputBindings as AiNode['outputBindings'] : undefined,
      legacyMetadata: isRecord(node.legacyMetadata) ? node.legacyMetadata : undefined,
    }));

  return {
    version: 2,
    id: readString(value.id, 'soldier_runtime_graph'),
    name: readString(value.name, 'Soldier Runtime Graph'),
    nameRu: typeof value.nameRu === 'string' ? value.nameRu : undefined,
    description: typeof value.description === 'string' ? value.description : undefined,
    descriptionRu: typeof value.descriptionRu === 'string' ? value.descriptionRu : undefined,
    rootNodeId: readString(value.rootNodeId, nodes[0]?.id ?? 'root'),
    blackboardDefaults: isRecord(value.blackboardDefaults) ? normalizeBlackboard(value.blackboardDefaults) : {},
    blackboardSchema: (Array.isArray(value.blackboardSchema) ? value.blackboardSchema.filter(isRecord) : []) as unknown as NonNullable<AiGraph['blackboardSchema']>,
    nodes,
    subgraphRefs: Array.isArray(value.subgraphRefs) ? value.subgraphRefs.filter((item): item is string => typeof item === 'string') : [],
    legacyMetadata: isRecord(value.legacyMetadata) ? value.legacyMetadata : undefined,
  };
}

function normalizeBlackboard(value: Record<string, unknown>): AiGraphRunnerBlackboard {
  const result: AiGraphRunnerBlackboard = {};
  for (const [key, item] of Object.entries(value)) {
    if (isGraphValue(item)) result[key] = item;
  }
  return result;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function readPosition(value: AiBlackboardValue | undefined): GridPosition | null {
  if (!isRecord(value) || typeof value.x !== 'number' || typeof value.y !== 'number') return null;
  return { x: value.x, y: value.y };
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function readNumber(value: AiBlackboardValue | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readBoolean(value: AiBlackboardValue | undefined, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function isGraphValue(value: unknown): value is AiBlackboardValue {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value) || readPosition(value as AiBlackboardValue) !== null;
}

function getSimulationNowMs(state: SimulationState): number {
  return Math.max(0, Math.round(state.simulationTimeSeconds * 1000));
}

function normalizeDegrees(value: number): number {
  const normalized = Math.round(value) % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
