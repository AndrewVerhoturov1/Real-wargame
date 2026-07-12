import type { GridPosition } from '../geometry';
import type { MoveOrder } from '../orders/MoveOrder';
import { planMoveOrder } from '../orders/MoveOrderPlanning';
import type { SimulationState } from '../simulation/SimulationState';
import { getAiTestPaused } from '../testing/AiTestLabRuntime';
import type { UnitModel } from '../units/UnitModel';
import type { AiBlackboardValue } from './AiBlackboard';
import {
  tickAiGameBridge,
  type AiGameBridgeHandle,
} from './AiGameBridge';
import {
  readAiGraphRuntimeMoveEffect,
  type AiGraphCancellationRequest,
  type AiGraphExecutionState,
  type AiGraphRuntimeResult,
} from './AiGraphRuntime';
import {
  updateAiRouteStatus,
  type AiRouteStatusResult,
  type AiRouteStatusSettings,
  type AiRouteStatusState,
} from './AiRouteStatus';

const AI_GRAPH_POLL_INTERVAL_MS = 60;
const DEBUG_STORAGE_KEY = 'real-wargame.ai-node-editor.debug.v1';
const GRAPH_STORAGE_KEY = 'real-wargame.ai-node-editor.graph.v6';
const DEFAULT_ROUTE_SETTINGS: AiRouteStatusSettings = {
  stuckTimeoutMs: 2500,
  minimumProgressCells: 0.05,
  abortOnTargetLost: true,
};

interface RouteSettingsCache {
  readonly ownerToken: string;
  readonly activeNodeId: string;
  readonly settings: AiRouteStatusSettings;
}

type AiMoveRuntime = UnitModel['behaviorRuntime'] & {
  aiGraphMemory?: Record<string, AiBlackboardValue>;
  aiGraphExecutionState?: AiGraphExecutionState;
  aiRouteStatusState?: AiRouteStatusState;
  aiRouteSettingsCache?: RouteSettingsCache;
};

export interface TickOptions {
  readonly force: boolean;
  readonly applyEffects: boolean;
  readonly cancel?: AiGraphCancellationRequest;
}

interface ActiveMoveSnapshot {
  readonly activeNodeId: string;
  readonly targetKey: string;
  readonly target: GridPosition;
  readonly acceptanceRadiusCells: number;
  readonly ownerToken: string;
}

export function installAiStatefulMoveGameBridge(state: SimulationState): AiGameBridgeHandle {
  const interval = window.setInterval(() => {
    tickStatefulMoveBridge(state);
  }, AI_GRAPH_POLL_INTERVAL_MS);

  return {
    destroy: () => window.clearInterval(interval),
    tickNow: () => tickStatefulMoveBridge(state, Date.now(), { force: true, applyEffects: true }),
    evaluateNow: () => tickStatefulMoveBridge(state, Date.now(), { force: true, applyEffects: false }),
    cancelNow: (reason, reasonRu) => tickStatefulMoveBridge(state, Date.now(), {
      force: true,
      applyEffects: true,
      cancel: { reason, reasonRu },
    }),
  };
}

export function buildReactiveRouteTickOptions(routeResult: AiRouteStatusResult): TickOptions {
  return {
    force: true,
    applyEffects: true,
    cancel: routeResult.shouldCancelRuntime
      ? {
          reason: routeResult.abortReason ?? 'AI movement route cancelled.',
          reasonRu: routeResult.abortReasonRu ?? 'Маршрут движения ИИ отменён.',
        }
      : undefined,
  };
}

export function tickStatefulMoveBridge(
  state: SimulationState,
  nowMs = Date.now(),
  options: TickOptions = { force: false, applyEffects: true },
): AiGraphRuntimeResult | null {
  syncSelectedMoveOrderMemory(state);
  const selectedUnitId = state.selectedUnitId;

  let routeResult: AiRouteStatusResult | null = null;
  let runtimeOptions = options;
  if (options.applyEffects && !options.cancel) {
    routeResult = updateSelectedRouteStatus(state, nowMs);
    if (routeResult?.shouldForceRuntimeTick) runtimeOptions = buildReactiveRouteTickOptions(routeResult);
  }

  const result = tickAiGameBridge(state, nowMs, runtimeOptions);
  if (result && runtimeOptions.applyEffects) applyOwnedMoveEffects(state, result);
  syncSelectedMoveOrderMemory(state);

  if (options.applyEffects) {
    const afterEffects = updateSelectedRouteStatus(state, nowMs);
    if (afterEffects) routeResult = afterEffects;
  }

  if (result) publishMoveDebugDetails(state, result, routeResult);
  else if (routeResult && selectedUnitId) publishRouteDebugDetails(state, routeResult, selectedUnitId);
  return result;
}

export function syncSelectedMoveOrderMemory(state: SimulationState): void {
  const unit = getSelectedUnit(state);
  if (!unit) return;

  const runtime = unit.behaviorRuntime as AiMoveRuntime;
  const memory = getRuntimeMemory(runtime);
  const order = unit.order;
  memory.active_move_source = order
    ? order.source ?? (order.ownerToken ? 'ai' : 'player')
    : null;
  memory.active_move_owner_token = order?.ownerToken ?? null;
  memory.active_move_target = order ? { ...order.target } : null;
  if (order) publishPathOrderMemory(memory, order);
}

export function updateSelectedRouteStatus(
  state: SimulationState,
  nowMs = Date.now(),
): AiRouteStatusResult | null {
  const unit = getSelectedUnit(state);
  if (!unit) return null;

  const runtime = unit.behaviorRuntime as AiMoveRuntime;
  const memory = getRuntimeMemory(runtime);
  const activeMove = readActiveMoveSnapshot(getExecutionState(runtime));
  if (!activeMove) return null;

  const order = unit.order;
  const activeOrderSource = order
    ? order.source ?? (order.ownerToken ? 'ai' : 'player')
    : null;
  const routeResult = updateAiRouteStatus({
    nowMs,
    position: unit.position,
    target: activeMove.target,
    acceptanceRadiusCells: activeMove.acceptanceRadiusCells,
    ownerToken: activeMove.ownerToken,
    activeOrderSource,
    activeOrderToken: order?.ownerToken ?? null,
    targetAvailable: isGridPosition(memory[activeMove.targetKey]),
    paused: state.editor.enabled || getAiTestPaused(state),
    settings: readRouteSettings(runtime, activeMove),
    previousState: runtime.aiRouteStatusState,
  });

  runtime.aiRouteStatusState = routeResult.state;
  publishRouteMemory(memory, routeResult);
  return routeResult;
}

export function applyOwnedMoveEffects(state: SimulationState, result: AiGraphRuntimeResult): void {
  const unit = state.units.find((candidate) => candidate.id === result.unitId);
  if (!unit) return;
  const runtime = unit.behaviorRuntime as AiMoveRuntime;
  const memory = getRuntimeMemory(runtime);

  for (const [index, rawEffect] of result.effects.entries()) {
    const effect = readAiGraphRuntimeMoveEffect(rawEffect);
    if (!effect) continue;

    if (effect.type === 'begin_move') {
      const planned = planMoveOrder(state.map, unit.position, effect.targetPosition, {
        source: 'ai',
        ownerToken: effect.ownerToken,
        allowGoalAdjustment: false,
      });
      if (!planned.ok) {
        unit.order = null;
        unit.behaviorRuntime.currentAction = 'observe';
        unit.behaviorRuntime.reason = `Маршрут недоступен: ${planned.reasonRu}`;
        unit.behaviorRuntime.lastEvent = 'ai_graph_move_route_unavailable';
        publishPathFailureMemory(memory, planned.reasonRu, effect.targetPosition);
        continue;
      }

      unit.order = planned.order;
      unit.behaviorRuntime.currentAction = 'move';
      unit.behaviorRuntime.reason = planned.path.reasonRu;
      unit.behaviorRuntime.lastEvent = 'ai_graph_owned_move_started';
      publishPathOrderMemory(memory, planned.order);
      continue;
    }

    if (unit.order?.ownerToken === effect.ownerToken) {
      unit.order = null;
      if (!hasLaterNonMoveEffect(result, index)) {
        unit.behaviorRuntime.currentAction = 'observe';
        unit.behaviorRuntime.reason = effect.reasonRu ?? effect.reason;
        unit.behaviorRuntime.lastEvent = 'ai_graph_owned_move_cleared';
      }
      continue;
    }

    if (unit.order) {
      unit.behaviorRuntime.currentAction = 'move';
      unit.behaviorRuntime.reason = 'Новый приказ сохранён; устаревшая очистка движения ИИ пропущена.';
      unit.behaviorRuntime.lastEvent = 'ai_graph_owned_move_cleanup_skipped';
    }
  }
}

function getSelectedUnit(state: SimulationState): UnitModel | undefined {
  return state.selectedUnitId
    ? state.units.find((candidate) => candidate.id === state.selectedUnitId)
    : undefined;
}

function getRuntimeMemory(runtime: AiMoveRuntime): Record<string, AiBlackboardValue> {
  if (runtime.aiRuntimeSession) return runtime.aiRuntimeSession.blackboardMemory;
  const memory = runtime.aiGraphMemory ?? {};
  runtime.aiGraphMemory = memory;
  return memory;
}

function getExecutionState(runtime: AiMoveRuntime): AiGraphExecutionState | undefined {
  return runtime.aiRuntimeSession?.executionState ?? runtime.aiGraphExecutionState;
}

function readActiveMoveSnapshot(state: AiGraphExecutionState | undefined): ActiveMoveSnapshot | null {
  const activeNodeId = state?.activeNodeId;
  const data = state?.activeData;
  if (!activeNodeId || data?.kind !== 'move_to_blackboard_position') return null;
  if (!data.targetKey || !data.actionToken || !isGridPosition(data.target)) return null;
  return {
    activeNodeId,
    targetKey: data.targetKey,
    target: { ...data.target },
    acceptanceRadiusCells: finiteNonNegative(data.acceptanceRadiusCells, 0.2),
    ownerToken: data.actionToken,
  };
}

function readRouteSettings(runtime: AiMoveRuntime, activeMove: ActiveMoveSnapshot): AiRouteStatusSettings {
  const cached = runtime.aiRouteSettingsCache;
  if (cached && cached.ownerToken === activeMove.ownerToken && cached.activeNodeId === activeMove.activeNodeId) {
    return cached.settings;
  }

  const settings = loadRouteSettings(activeMove.activeNodeId);
  runtime.aiRouteSettingsCache = {
    ownerToken: activeMove.ownerToken,
    activeNodeId: activeMove.activeNodeId,
    settings,
  };
  return settings;
}

function loadRouteSettings(activeNodeId: string): AiRouteStatusSettings {
  if (typeof window === 'undefined') return DEFAULT_ROUTE_SETTINGS;
  try {
    const raw = window.localStorage.getItem(GRAPH_STORAGE_KEY);
    if (!raw) return DEFAULT_ROUTE_SETTINGS;
    const graph = JSON.parse(raw) as { nodes?: Array<{ id?: unknown; parameters?: Record<string, unknown> }> };
    const node = graph.nodes?.find((candidate) => candidate.id === activeNodeId);
    const parameters = node?.parameters;
    return {
      stuckTimeoutMs: finiteNonNegative(parameters?.stuckTimeoutSeconds, 2.5) * 1000,
      minimumProgressCells: finiteNonNegative(parameters?.minimumProgressCells, 0.05),
      abortOnTargetLost: typeof parameters?.abortOnTargetLost === 'boolean' ? parameters.abortOnTargetLost : true,
    };
  } catch {
    return DEFAULT_ROUTE_SETTINGS;
  }
}

function publishRouteMemory(memory: Record<string, AiBlackboardValue>, result: AiRouteStatusResult): void {
  memory.active_move_route_status = result.status;
  memory.active_move_no_progress_ms = result.noProgressMs;
  memory.active_move_last_distance = result.distanceRemainingCells;
  memory.active_move_abort_code = result.abortCode ?? null;
  memory.active_move_abort_reason = result.abortReasonRu ?? result.abortReason ?? null;
}

function publishPathOrderMemory(memory: Record<string, AiBlackboardValue>, order: MoveOrder): void {
  memory.active_move_path_status = order.routeStatus ?? 'direct';
  memory.active_move_path_waypoint_count = order.waypoints?.length ?? 0;
  memory.active_move_path_waypoint_index = order.waypointIndex ?? 0;
  memory.active_move_path_requested_target = order.requestedTarget ? { ...order.requestedTarget } : { ...order.target };
  memory.active_move_path_resolved_target = { ...order.target };
  memory.active_move_path_reason = order.pathReasonRu ?? order.pathReason ?? null;
}

function publishPathFailureMemory(
  memory: Record<string, AiBlackboardValue>,
  reasonRu: string,
  requestedTarget: GridPosition,
): void {
  memory.active_move_path_status = 'unreachable';
  memory.active_move_path_waypoint_count = 0;
  memory.active_move_path_waypoint_index = 0;
  memory.active_move_path_requested_target = { ...requestedTarget };
  memory.active_move_path_resolved_target = null;
  memory.active_move_path_reason = reasonRu;
}

function hasLaterNonMoveEffect(result: AiGraphRuntimeResult, currentIndex: number): boolean {
  for (let index = currentIndex + 1; index < result.effects.length; index += 1) {
    if (!readAiGraphRuntimeMoveEffect(result.effects[index])) return true;
  }
  return false;
}

function publishMoveDebugDetails(
  state: SimulationState,
  result: AiGraphRuntimeResult,
  routeResult: AiRouteStatusResult | null,
): void {
  const unit = state.units.find((candidate) => candidate.id === result.unitId);
  const memory = unit ? getRuntimeMemory(unit.behaviorRuntime as AiMoveRuntime) : undefined;
  updateDebugPayload((payload) => {
    if (payload.unitId !== result.unitId) return;
    payload.targetKey = result.targetKey;
    payload.targetPosition = result.targetPosition;
    payload.distanceRemainingCells = result.distanceRemainingCells;
    payload.actionToken = result.actionToken;
    writeRouteDebugFields(payload, routeResult);
    writePathDebugFields(payload, memory);
  });
}

function publishRouteDebugDetails(
  state: SimulationState,
  result: AiRouteStatusResult,
  unitId: string,
): void {
  const unit = state.units.find((candidate) => candidate.id === unitId);
  const memory = unit ? getRuntimeMemory(unit.behaviorRuntime as AiMoveRuntime) : undefined;
  updateDebugPayload((payload) => {
    if (payload.unitId !== unitId) return;
    writeRouteDebugFields(payload, result);
    writePathDebugFields(payload, memory);
  });
}

function writeRouteDebugFields(payload: Record<string, unknown>, result: AiRouteStatusResult | null): void {
  if (!result) return;
  payload.routeStatus = result.status;
  payload.routeNoProgressMs = result.noProgressMs;
  payload.routeAbortCode = result.abortCode;
  payload.routeAbortReasonRu = result.abortReasonRu;
}

function writePathDebugFields(
  payload: Record<string, unknown>,
  memory: Record<string, AiBlackboardValue> | undefined,
): void {
  if (!memory) return;
  payload.pathStatus = memory.active_move_path_status;
  payload.pathWaypointCount = memory.active_move_path_waypoint_count;
  payload.pathWaypointIndex = memory.active_move_path_waypoint_index;
  payload.pathRequestedTarget = memory.active_move_path_requested_target;
  payload.pathResolvedTarget = memory.active_move_path_resolved_target;
  payload.pathReasonRu = memory.active_move_path_reason;
}

function updateDebugPayload(update: (payload: Record<string, unknown>) => void): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(DEBUG_STORAGE_KEY);
    if (!raw) return;
    const payload = JSON.parse(raw) as Record<string, unknown>;
    if (payload.kind !== 'ai-graph-runtime-debug') return;
    update(payload);
    window.localStorage.setItem(DEBUG_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Route diagnostics are optional and must never interrupt simulation.
  }
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

function finiteNonNegative(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback;
}
