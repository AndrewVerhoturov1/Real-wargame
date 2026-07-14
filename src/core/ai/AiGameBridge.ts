import { clampPercent, type UnitPosture } from '../behavior/BehaviorModel';
import { findBestDirectFireContact } from '../combat/CombatDecision';
import { requestFireAction } from '../combat/FireAction';
import { clearWeaponRuntime } from '../combat/WeaponModel';
import { findBestCoverForThreat } from '../cover/CoverEvaluation';
import { distance, type GridPosition } from '../geometry';
import { buildSoldierAwarenessReport } from '../knowledge/SoldierAwarenessGrid';
import { clampGridPositionToMap, type TacticalMap } from '../map/MapModel';
import { createMoveOrder } from '../orders/MoveOrder';
import { isPlayerCommandOutstanding } from '../orders/PlayerCommand';
import { clearAttentionOverride, setAttentionMode, setFocusTarget, setSearchSector } from '../perception/AttentionController';
import { degreesToRadians, radiansToDegrees } from '../perception/AttentionModel';
import { getBestPerceptionContact } from '../perception/PerceptionSystem';
import { evaluateThreatsAtPosition } from '../pressure/ThreatEvaluation';
import type { SimulationState } from '../simulation/SimulationState';
import { getAiTestTimeScale } from '../testing/AiTestLabRuntime';
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
const AI_GRAPH_TICK_INTERVAL_MS = 600;
const AI_GRAPH_POLL_INTERVAL_MS = 60;
const COVER_SEARCH_RADIUS_CELLS = 5;

type PausableSimulationState = SimulationState & { paused?: boolean };
type LegacyAiUnitGraphRuntime = UnitModel['behaviorRuntime'] & {
  aiGraphMemory?: AiGraphRunnerBlackboard;
  aiGraphSimulationTimeMs?: number;
  aiGraphExecutionState?: AiGraphExecutionState;
};

export interface AiGameBridgeHandle {
  destroy(): void;
  tickNow(): AiGraphRuntimeResult | null;
  evaluateNow(): AiGraphRuntimeResult | null;
  cancelNow(reason: string, reasonRu?: string): AiGraphRuntimeResult | null;
}

interface TickOptions {
  force: boolean;
  applyEffects: boolean;
  cancel?: AiGraphCancellationRequest;
}

export function installAiGameBridge(state: SimulationState): AiGameBridgeHandle {
  const handle = window.setInterval(() => {
    tickAiGameBridge(state);
  }, AI_GRAPH_POLL_INTERVAL_MS);

  return {
    destroy: () => window.clearInterval(handle),
    tickNow: () => tickAiGameBridge(state, Date.now(), { force: true, applyEffects: true }),
    evaluateNow: () => tickAiGameBridge(state, Date.now(), { force: true, applyEffects: false }),
    cancelNow: (reason, reasonRu) => tickAiGameBridge(state, Date.now(), {
      force: true,
      applyEffects: true,
      cancel: { reason, reasonRu },
    }),
  };
}

export function tickAiGameBridge(
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

export function pollAiBlackboardObservers(
  state: SimulationState,
  unit: UnitModel,
): { readonly events: number; readonly checks: number } {
  const session = unit.behaviorRuntime.aiRuntimeSession;
  if (!session) return { events: 0, checks: 0 };
  const keys = listObservedBlackboardKeys(session.observerRegistry);
  if (keys.length === 0) return { events: 0, checks: 0 };
  const compactBlackboard = buildObservedBlackboardForUnit(state, unit, keys, session.blackboardMemory);
  const evaluated = evaluateAiBlackboardObservers(
    session.observerRegistry,
    compactBlackboard,
    session.simulationTimeMs,
  );
  let queue = session.eventQueue;
  for (const event of evaluated.events) queue = pushAiEvent(queue, event, session.simulationTimeMs).queue;
  unit.behaviorRuntime.aiRuntimeSession = {
    ...session,
    eventQueue: queue,
    observerRegistry: evaluated.registry,
  };
  return { events: evaluated.events.length, checks: evaluated.checks };
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
  const bestCover = findBestCoverForThreat(
    state.map,
    unit.position,
    threatPosition,
    unit.behaviorRuntime.posture,
    COVER_SEARCH_RADIUS_CELLS,
  );
  const distanceToCover = bestCover.distanceCells * state.map.metersPerCell;
  const strongest = threats.strongest;
  const threatDistance = threatPosition
    ? distance(unit.position, threatPosition) * state.map.metersPerCell
    : 9999;
  const underFire = threats.danger > 0 || threats.suppression > 0;
  const awareness = buildSoldierAwarenessReport(state, unit);
  const bestSafe = awareness.bestSafePositions[0];
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
    bestCoverQuality: Math.max(0, Math.round(bestCover.score)),
    currentPositionDanger: awareness.currentPosition.danger,
    currentExpectedProtection: awareness.currentPosition.expectedProtection,
    bestSafePositionScore: Math.max(0, Math.round(bestSafe?.score ?? 0)),
    distanceToBestSafePosition: Math.round((bestSafe?.distanceCells ?? 9999) * state.map.metersPerCell),
    routeDanger: awareness.routeDanger,
    threatConfidence: Math.round(bestContact?.confidence ?? awareness.threatConfidence),
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
    best_cover_position: bestSafe?.position ?? bestCover.position,
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
    findBestObject: (objectKind, _criteria, searchRadiusMeters) => {
      if (objectKind !== 'cover') return null;
      const threats = evaluateThreatsAtPosition(state.map, unit, state.pressureZones);
      return findBestCoverForThreat(
        state.map,
        unit.position,
        threats.targetPosition,
        unit.behaviorRuntime.posture,
        searchRadiusMeters / state.map.metersPerCell,
      ).position;
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
      paused: isPaused(state),
      previewOnly,
      nowMs,
      simulationNowMs,
      explanation: result.explanation,
      explanationRu: result.explanationRu,
      trace: result.trace,
      scores: result.scores,
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
  state: SimulationState,
  unit: UnitModel,
  blackboard: AiGraphRunnerBlackboard,
  checkKind: string,
): boolean {
  if (checkKind === 'cover_exists') {
    const threats = evaluateThreatsAtPosition(state.map, unit, state.pressureZones);
    return Boolean(findBestCoverForThreat(state.map, unit.position, threats.targetPosition, unit.behaviorRuntime.posture).position);
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
  if (key === 'cover') return findBestCoverForThreat(state.map, unit.position, threats.targetPosition, unit.behaviorRuntime.posture).position;
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

function readRuntimeGraph(): AiGraph {
  const raw = readLocalStorageGraph();
  const parsed = raw ? safeJsonParse(raw) : null;
  return normalizeRuntimeGraph(parsed ?? bundledGraph);
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

function isPaused(state: SimulationState): boolean {
  return Boolean((state as PausableSimulationState).paused);
}

function normalizeDegrees(value: number): number {
  const normalized = Math.round(value) % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
