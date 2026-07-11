import type { AiBlackboardValue } from './AiBlackboard';
import {
  tickAiGameBridge,
  type AiGameBridgeHandle,
} from './AiGameBridge';
import {
  readAiGraphRuntimeMoveEffect,
  type AiGraphCancellationRequest,
  type AiGraphRuntimeResult,
} from './AiGraphRuntime';
import { clampGridPositionToMap } from '../map/MapModel';
import { createMoveOrder } from '../orders/MoveOrder';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';

const AI_GRAPH_POLL_INTERVAL_MS = 60;
const DEBUG_STORAGE_KEY = 'real-wargame.ai-node-editor.debug.v1';

type AiMoveRuntime = UnitModel['behaviorRuntime'] & {
  aiGraphMemory?: Record<string, AiBlackboardValue>;
};

interface TickOptions {
  readonly force: boolean;
  readonly applyEffects: boolean;
  readonly cancel?: AiGraphCancellationRequest;
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

export function tickStatefulMoveBridge(
  state: SimulationState,
  nowMs = Date.now(),
  options: TickOptions = { force: false, applyEffects: true },
): AiGraphRuntimeResult | null {
  syncSelectedMoveOrderMemory(state);
  const result = tickAiGameBridge(state, nowMs, options);
  if (result && options.applyEffects) applyOwnedMoveEffects(state, result);
  syncSelectedMoveOrderMemory(state);
  if (result) publishMoveDebugDetails(result);
  return result;
}

export function syncSelectedMoveOrderMemory(state: SimulationState): void {
  const unit = state.selectedUnitId
    ? state.units.find((candidate) => candidate.id === state.selectedUnitId)
    : undefined;
  if (!unit) return;

  const runtime = unit.behaviorRuntime as AiMoveRuntime;
  const memory = runtime.aiGraphMemory ?? {};
  runtime.aiGraphMemory = memory;
  const order = unit.order;
  memory.active_move_source = order
    ? order.source ?? (order.ownerToken ? 'ai' : 'player')
    : null;
  memory.active_move_owner_token = order?.ownerToken ?? null;
  memory.active_move_target = order ? { ...order.target } : null;
}

export function applyOwnedMoveEffects(state: SimulationState, result: AiGraphRuntimeResult): void {
  const unit = state.units.find((candidate) => candidate.id === result.unitId);
  if (!unit) return;

  for (const rawEffect of result.effects) {
    const effect = readAiGraphRuntimeMoveEffect(rawEffect);
    if (!effect) continue;

    if (effect.type === 'begin_move') {
      unit.order = createMoveOrder(
        clampGridPositionToMap(state.map, effect.targetPosition),
        { source: 'ai', ownerToken: effect.ownerToken },
      );
      unit.behaviorRuntime.currentAction = 'move';
      unit.behaviorRuntime.reason = effect.reasonRu ?? effect.reason;
      unit.behaviorRuntime.lastEvent = 'ai_graph_owned_move_started';
      continue;
    }

    if (unit.order?.ownerToken === effect.ownerToken) {
      unit.order = null;
      unit.behaviorRuntime.currentAction = 'observe';
      unit.behaviorRuntime.reason = effect.reasonRu ?? effect.reason;
      unit.behaviorRuntime.lastEvent = 'ai_graph_owned_move_cleared';
      continue;
    }

    if (unit.order) {
      unit.behaviorRuntime.currentAction = 'move';
      unit.behaviorRuntime.reason = 'Новый приказ сохранён; устаревшая очистка движения ИИ пропущена.';
      unit.behaviorRuntime.lastEvent = 'ai_graph_owned_move_cleanup_skipped';
    }
  }
}

function publishMoveDebugDetails(result: AiGraphRuntimeResult): void {
  try {
    const raw = window.localStorage.getItem(DEBUG_STORAGE_KEY);
    if (!raw) return;
    const payload = JSON.parse(raw) as Record<string, unknown>;
    if (payload.kind !== 'ai-graph-runtime-debug' || payload.unitId !== result.unitId) return;
    payload.targetKey = result.targetKey;
    payload.targetPosition = result.targetPosition;
    payload.distanceRemainingCells = result.distanceRemainingCells;
    payload.actionToken = result.actionToken;
    window.localStorage.setItem(DEBUG_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Movement diagnostics are optional and must never interrupt simulation.
  }
}
