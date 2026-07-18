import type { GridPosition } from '../geometry';
import {
  MOVEMENT_PROFILE_MEMORY_KEYS,
  MOVEMENT_PROFILE_SOURCES,
  type MovementProfileRegistryEntry,
  type MovementProfileSource,
} from '../movement/MovementProfiles';
import { buildUnitTacticalRouteContext, resolveUnitNavigationProfile } from '../navigation/NavigationRuntime';
import type { MoveOrder } from '../orders/MoveOrder';
import { planMoveOrder } from '../orders/MoveOrderPlanning';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';
import type { AiBlackboardValue } from './AiBlackboard';
import { publishSimulationAiEvents } from './events/SimulationAiEvents';
import {
  cloneSimulationStateForDiagnostic,
  tickAiGameBridgeForTrustedUnit,
  type AiGameBridgeHandle,
  type AiRuntimeGraphSnapshot,
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
import { reconcileMovementProfileRuntime } from './MovementProfileRuntimeResolver';

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
  aiRouteSettingsCache?: RouteSettingsCache;
};

export interface TickOptions {
  readonly force: boolean;
  readonly applyEffects: boolean;
  readonly cancel?: AiGraphCancellationRequest;
  readonly graphSnapshot?: AiRuntimeGraphSnapshot;
  readonly cycleStartMs?: number;
  readonly cycleEndMs?: number;
  readonly diagnosticPreview?: boolean;
  readonly deferOrdinaryDecision?: boolean;
  readonly movementProfileRegistryEntries?: readonly MovementProfileRegistryEntry[];
}

interface ActiveMoveSnapshot {
  readonly activeNodeId: string;
  readonly targetKey: string;
  readonly target: GridPosition;
  readonly acceptanceRadiusCells: number;
  readonly ownerToken: string;
  readonly targetAvailable: boolean;
}

interface BeginMoveMovementProfileFields {
  readonly movementProfileId?: unknown;
  readonly movementProfileSource?: unknown;
  readonly movementProfileOwnerToken?: unknown;
}

interface BeginMoveMovementProfileSnapshot {
  readonly profileId?: string;
  readonly source?: MovementProfileSource;
  readonly ownerToken?: string;
}

export function installAiStatefulMoveGameBridge(state: SimulationState): AiGameBridgeHandle {
  return {
    destroy: () => undefined,
    tickNow: () => tickStatefulMoveBridge(state, getSimulationNowMs(state), { force: true, applyEffects: false }),
    evaluateNow: () => tickStatefulMoveBridge(state, getSimulationNowMs(state), { force: true, applyEffects: false }),
    previewCancelNow: (reason, reasonRu) => tickStatefulMoveBridge(state, getSimulationNowMs(state), {
      force: true,
      applyEffects: false,
      cancel: { reason, reasonRu },
    }),
  };
}

export function buildReactiveRouteTickOptions(routeResult: AiRouteStatusResult, base: TickOptions = { force: false, applyEffects: true }): TickOptions {
  return {
    ...base,
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

/**
 * Selected-unit compatibility facade for explicit UI/debug actions only.
 * Gameplay execution is owned by AiSimulationScheduler.
 */
export function tickStatefulMoveBridge(
  state: SimulationState,
  nowMs = getSimulationNowMs(state),
  options: TickOptions = { force: true, applyEffects: false },
): AiGraphRuntimeResult | null {
  const unit = getSelectedUnit(state);
  return unit ? tickStatefulMoveBridgeForUnit(state, unit, nowMs, options) : null;
}

export function tickStatefulMoveBridgeForUnit(
  state: SimulationState,
  unit: UnitModel,
  nowMs = getSimulationNowMs(state),
  options: TickOptions = { force: false, applyEffects: true },
): AiGraphRuntimeResult | null {
  if (!state.units.includes(unit)) return null;
  if (!options.applyEffects) {
    const diagnosticState = cloneSimulationStateForDiagnostic(state);
    const diagnosticUnit = diagnosticState.units.find((candidate) => candidate.id === unit.id);
    if (!diagnosticUnit) return null;
    return tickStatefulMoveBridgeForTrustedUnit(diagnosticState, diagnosticUnit, nowMs, {
      ...options,
      applyEffects: true,
      diagnosticPreview: true,
    });
  }
  return tickStatefulMoveBridgeForTrustedUnit(state, unit, nowMs, options);
}

/** Trusted scheduler path. The unit is already known to belong to state.units. */
export function tickStatefulMoveBridgeForTrustedUnit(
  state: SimulationState,
  unit: UnitModel,
  nowMs = getSimulationNowMs(state),
  options: TickOptions = { force: false, applyEffects: true },
): AiGraphRuntimeResult | null {
  reconcileMovementProfileRuntime(unit, options.movementProfileRegistryEntries);
  syncMoveOrderMemoryForUnit(unit);
  const orderBeforeRuntimeTick = unit.order;

  let routeResult: AiRouteStatusResult | null = null;
  let runtimeOptions = options;
  if (options.applyEffects && !options.cancel) {
    routeResult = updateRouteStatusForTrustedUnit(state, unit, nowMs, options.graphSnapshot);
    if (routeResult) publishSimulationAiEvents(unit, nowMs);
    if (routeResult?.shouldForceRuntimeTick) runtimeOptions = buildReactiveRouteTickOptions(routeResult, options);
  }

  const result = tickAiGameBridgeForTrustedUnit(state, unit, nowMs, runtimeOptions);
  const movementReconciledByBegin = result && runtimeOptions.applyEffects
    ? applyOwnedMoveEffectsForUnit(state, unit, result, options.movementProfileRegistryEntries)
    : false;

  const moveEffectState = describeMoveEffectState(result);
  const orderChanged = unit.order !== orderBeforeRuntimeTick;
  const requiresPostReconcile = moveEffectState.hasClear
    || (moveEffectState.hasMovementProfileMemoryWrite && !movementReconciledByBegin)
    || (!result && orderChanged);
  if (requiresPostReconcile) {
    reconcileMovementProfileRuntime(unit, options.movementProfileRegistryEntries);
  }
  if (orderChanged || moveEffectState.hasBegin || moveEffectState.hasClear) {
    syncMoveOrderMemoryForUnit(unit);
  }

  if (options.applyEffects) {
    if (result || orderChanged || options.cancel) {
      const afterEffects = updateRouteStatusForTrustedUnit(state, unit, nowMs, options.graphSnapshot);
      if (afterEffects) routeResult = afterEffects;
    }
    publishSimulationAiEvents(unit, nowMs);
  }

  if (state.selectedUnitId === unit.id) {
    if (result) publishMoveDebugDetailsForUnit(unit, result, routeResult);
    else if (routeResult) publishRouteDebugDetailsForUnit(unit, routeResult);
  }
  return result;
}

export function syncSelectedMoveOrderMemory(state: SimulationState): void {
  const unit = getSelectedUnit(state);
  if (unit) syncMoveOrderMemoryForUnit(unit);
}

export function syncMoveOrderMemoryForUnit(unit: UnitModel): void {
  const runtime = unit.behaviorRuntime as AiMoveRuntime;
  const memory = getRuntimeMemory(runtime);
  const order = unit.order;
  setMemoryIfChanged(memory, 'active_move_source', order
    ? order.source ?? (order.ownerToken ? 'ai' : 'player')
    : null);
  setMemoryIfChanged(memory, 'active_move_owner_token', order?.ownerToken ?? null);
  setGridPositionMemoryIfChanged(memory, 'active_move_target', order?.target ?? null);
  if (order) publishPathOrderMemory(memory, order);
}

export function updateSelectedRouteStatus(
  state: SimulationState,
  nowMs = getSimulationNowMs(state),
): AiRouteStatusResult | null {
  const unit = getSelectedUnit(state);
  return unit ? updateRouteStatusForUnit(state, unit, nowMs) : null;
}

export function updateRouteStatusForUnit(
  state: SimulationState,
  unit: UnitModel,
  nowMs = getSimulationNowMs(state),
): AiRouteStatusResult | null {
  if (!state.units.includes(unit)) return null;
  return updateRouteStatusForTrustedUnit(state, unit, nowMs);
}

export function updateRouteStatusForTrustedUnit(
  state: SimulationState,
  unit: UnitModel,
  nowMs = getSimulationNowMs(state),
  graphSnapshot?: AiRuntimeGraphSnapshot,
): AiRouteStatusResult | null {
  const runtime = unit.behaviorRuntime as AiMoveRuntime;
  const memory = getRuntimeMemory(runtime);
  const activeMove = readActiveMoveSnapshot(getExecutionState(runtime), memory);
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
    targetAvailable: activeMove.targetAvailable,
    paused: state.editor.enabled,
    settings: readRouteSettings(runtime, activeMove, graphSnapshot?.graph),
    previousState: runtime.aiRouteStatusState ?? undefined,
  });

  runtime.aiRouteStatusState = routeResult.state;
  publishRouteMemory(memory, routeResult);
  return routeResult;
}

export function applyOwnedMoveEffects(
  state: SimulationState,
  result: AiGraphRuntimeResult,
  registryEntries?: readonly MovementProfileRegistryEntry[],
): void {
  const unit = state.units.find((candidate) => candidate.id === result.unitId);
  if (!unit) return;
  applyOwnedMoveEffectsForUnit(state, unit, result, registryEntries);
}

export function applyOwnedMoveEffectsForUnit(
  state: SimulationState,
  unit: UnitModel,
  result: AiGraphRuntimeResult,
  registryEntries?: readonly MovementProfileRegistryEntry[],
): boolean {
  const runtime = unit.behaviorRuntime as AiMoveRuntime;
  const memory = getRuntimeMemory(runtime);
  let movementReconciled = false;

  for (const [index, rawEffect] of result.effects.entries()) {
    const effect = readAiGraphRuntimeMoveEffect(rawEffect);
    if (!effect) continue;

    if (effect.type === 'begin_move') {
      runtime.aiRouteStatusState = null;
      const resolvedNavigation = resolveUnitNavigationProfile(unit, null);
      const movementSnapshot = readBeginMoveMovementProfileSnapshot(rawEffect);
      const planned = planMoveOrder(state.map, unit.position, effect.targetPosition, {
        source: 'ai',
        ownerToken: effect.ownerToken,
        allowGoalAdjustment: false,
        movementMode: unit.navigationMovementMode ?? 'normal',
        navigationProfile: resolvedNavigation.profile,
        navigationProfileSource: resolvedNavigation.source,
        movementProfileId: movementSnapshot.profileId,
        movementProfileSource: movementSnapshot.source,
        movementProfileOwnerToken: movementSnapshot.ownerToken,
        calculatedAtSimulationStep: state.simulationStep,
        tacticalContext: buildUnitTacticalRouteContext(unit, {
          freshness: 'immediate',
          metersPerCell: state.map.metersPerCell,
        }),
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
      reconcileMovementProfileRuntime(unit, registryEntries);
      movementReconciled = true;
      unit.behaviorRuntime.currentAction = 'move';
      unit.behaviorRuntime.reason = planned.path.reasonRu;
      unit.behaviorRuntime.lastEvent = 'ai_graph_owned_move_started';
      publishPathOrderMemory(memory, planned.order);
      continue;
    }

    if (unit.order?.ownerToken === effect.ownerToken) {
      unit.order = null;
      runtime.aiRouteStatusState = null;
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
  return movementReconciled;
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

function readActiveMoveSnapshot(
  state: AiGraphExecutionState | undefined,
  blackboardScope: Readonly<Record<string, AiBlackboardValue>>,
): ActiveMoveSnapshot | null {
  const data = state?.activeData;
  if (data?.kind === 'subgraph') return readActiveMoveSnapshot(data.nestedExecutionState, data.localBlackboard);
  const activeNodeId = state?.activeNodeId;
  if (!activeNodeId || data?.kind !== 'move_to_blackboard_position') return null;
  if (!data.targetKey || !data.actionToken || !isGridPosition(data.target)) return null;
  return {
    activeNodeId,
    targetKey: data.targetKey,
    target: { ...data.target },
    acceptanceRadiusCells: finiteNonNegative(data.acceptanceRadiusCells, 0.2),
    ownerToken: data.actionToken,
    targetAvailable: isGridPosition(blackboardScope[data.targetKey]),
  };
}

function readRouteSettings(runtime: AiMoveRuntime, activeMove: ActiveMoveSnapshot, graph?: { readonly nodes: readonly { readonly id: string; readonly parameters?: Record<string, unknown> }[] }): AiRouteStatusSettings {
  const cached = runtime.aiRouteSettingsCache;
  if (cached && cached.ownerToken === activeMove.ownerToken && cached.activeNodeId === activeMove.activeNodeId) {
    return cached.settings;
  }

  const settings = loadRouteSettings(activeMove.activeNodeId, graph);
  runtime.aiRouteSettingsCache = {
    ownerToken: activeMove.ownerToken,
    activeNodeId: activeMove.activeNodeId,
    settings,
  };
  return settings;
}

function loadRouteSettings(activeNodeId: string, graph?: { readonly nodes: readonly { readonly id: string; readonly parameters?: Record<string, unknown> }[] }): AiRouteStatusSettings {
  if (graph) {
    const node = graph.nodes.find((candidate) => candidate.id === activeNodeId);
    const parameters = node?.parameters;
    return {
      stuckTimeoutMs: finiteNonNegative(parameters?.stuckTimeoutSeconds, 2.5) * 1000,
      minimumProgressCells: finiteNonNegative(parameters?.minimumProgressCells, 0.05),
      abortOnTargetLost: typeof parameters?.abortOnTargetLost === 'boolean' ? parameters.abortOnTargetLost : true,
    };
  }
  if (typeof window === 'undefined') return DEFAULT_ROUTE_SETTINGS;
  try {
    const raw = window.localStorage.getItem(GRAPH_STORAGE_KEY);
    if (!raw) return DEFAULT_ROUTE_SETTINGS;
    const storedGraph = JSON.parse(raw) as { nodes?: Array<{ id?: unknown; parameters?: Record<string, unknown> }> };
    const node = storedGraph.nodes?.find((candidate) => candidate.id === activeNodeId);
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

function readBeginMoveMovementProfileSnapshot(rawEffect: unknown): BeginMoveMovementProfileSnapshot {
  if (!isRecord(rawEffect)) return {};
  const fields = rawEffect as BeginMoveMovementProfileFields;
  const profileId = cleanOptionalText(fields.movementProfileId);
  const source = MOVEMENT_PROFILE_SOURCES.includes(fields.movementProfileSource as MovementProfileSource)
    ? fields.movementProfileSource as MovementProfileSource
    : undefined;
  if (!profileId || !source) return {};
  return {
    profileId,
    source,
    ownerToken: cleanOptionalText(fields.movementProfileOwnerToken),
  };
}

function publishRouteMemory(memory: Record<string, AiBlackboardValue>, result: AiRouteStatusResult): void {
  memory.active_move_route_status = result.status;
  memory.active_move_no_progress_ms = result.noProgressMs;
  memory.active_move_last_distance = result.distanceRemainingCells;
  memory.active_move_abort_code = result.abortCode ?? null;
  memory.active_move_abort_reason = result.abortReasonRu ?? result.abortReason ?? null;
}

function publishPathOrderMemory(memory: Record<string, AiBlackboardValue>, order: MoveOrder): void {
  setMemoryIfChanged(memory, 'active_move_path_status', order.routeStatus ?? 'direct');
  setMemoryIfChanged(memory, 'active_move_path_waypoint_count', order.waypoints?.length ?? 0);
  setMemoryIfChanged(memory, 'active_move_path_waypoint_index', order.waypointIndex ?? 0);
  setGridPositionMemoryIfChanged(
    memory,
    'active_move_path_requested_target',
    order.requestedTarget ?? order.target,
  );
  setGridPositionMemoryIfChanged(memory, 'active_move_path_resolved_target', order.target);
  setMemoryIfChanged(memory, 'active_move_path_reason', order.pathReasonRu ?? order.pathReason ?? null);
}

interface MoveEffectState {
  readonly hasBegin: boolean;
  readonly hasClear: boolean;
  readonly hasMovementProfileMemoryWrite: boolean;
}

function describeMoveEffectState(result: AiGraphRuntimeResult | null): MoveEffectState {
  let hasBegin = false;
  let hasClear = false;
  let hasMovementProfileMemoryWrite = false;
  for (const effect of result?.effects ?? []) {
    const moveEffect = readAiGraphRuntimeMoveEffect(effect);
    if (moveEffect?.type === 'begin_move') hasBegin = true;
    else if (moveEffect?.type === 'clear_move') hasClear = true;
    if (effect.type === 'write_memory' && isMovementProfileAuthorityMemoryKey(effect.key)) {
      hasMovementProfileMemoryWrite = true;
    }
  }
  return { hasBegin, hasClear, hasMovementProfileMemoryWrite };
}

function isMovementProfileAuthorityMemoryKey(key: string): boolean {
  return key === MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideProfileId
    || key === MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideOwnerToken
    || key === MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideReason;
}

function setMemoryIfChanged(
  memory: Record<string, AiBlackboardValue>,
  key: string,
  value: AiBlackboardValue,
): void {
  if (memory[key] !== value) memory[key] = value;
}

function setGridPositionMemoryIfChanged(
  memory: Record<string, AiBlackboardValue>,
  key: string,
  value: GridPosition | null,
): void {
  const current = memory[key];
  if (value === null) {
    if (current !== null) memory[key] = null;
    return;
  }
  if (isGridPosition(current) && current.x === value.x && current.y === value.y) return;
  memory[key] = { ...value };
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

function publishMoveDebugDetailsForUnit(
  unit: UnitModel,
  result: AiGraphRuntimeResult,
  routeResult: AiRouteStatusResult | null,
): void {
  const memory = getRuntimeMemory(unit.behaviorRuntime as AiMoveRuntime);
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

function publishRouteDebugDetailsForUnit(
  unit: UnitModel,
  result: AiRouteStatusResult,
): void {
  const memory = getRuntimeMemory(unit.behaviorRuntime as AiMoveRuntime);
  updateDebugPayload((payload) => {
    if (payload.unitId !== unit.id) return;
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
  payload.requestedMovementProfileId = memory[MOVEMENT_PROFILE_MEMORY_KEYS.requestedProfileId];
  payload.activeMovementProfileId = memory[MOVEMENT_PROFILE_MEMORY_KEYS.activeProfileId];
  payload.activeMovementProfileSource = memory[MOVEMENT_PROFILE_MEMORY_KEYS.activeProfileSource];
  payload.activeMovementGait = memory[MOVEMENT_PROFILE_MEMORY_KEYS.activeGait];
  payload.movementForcedFallback = memory[MOVEMENT_PROFILE_MEMORY_KEYS.forcedFallback];
  payload.movementForcedReason = memory[MOVEMENT_PROFILE_MEMORY_KEYS.forcedReason];
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

function getSimulationNowMs(state: SimulationState): number {
  return Math.max(0, Math.round(state.simulationTimeSeconds * 1000));
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

function cleanOptionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
