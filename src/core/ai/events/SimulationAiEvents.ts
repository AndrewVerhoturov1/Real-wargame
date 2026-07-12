import type { GridPosition } from '../../geometry';
import type { MoveOrderSource } from '../../orders/MoveOrder';
import type { PlayerCommandStatus } from '../../orders/PlayerCommand';
import type { UnitModel } from '../../units/UnitModel';
import type { AiRouteAbortCode } from '../AiRouteStatus';
import { pushAiEvent } from './AiEventQueue';
import type { AiEvent, AiEventDraft } from './AiEvent';

export const AI_SUPPRESSION_EVENT_THRESHOLD = 60;

export type SimulationAiEventType =
  | 'order_received'
  | 'order_cancelled'
  | 'move_completed'
  | 'route_blocked'
  | 'target_lost'
  | 'ammo_empty'
  | 'weapon_ready_changed'
  | 'suppression_threshold_crossed';

export const SIMULATION_AI_EVENT_LABELS_RU: Readonly<Record<SimulationAiEventType, string>> = {
  order_received: 'Получен приказ',
  order_cancelled: 'Приказ отменён',
  move_completed: 'Движение завершено',
  route_blocked: 'Маршрут заблокирован',
  target_lost: 'Цель потеряна',
  ammo_empty: 'Боеприпасы закончились',
  weapon_ready_changed: 'Готовность оружия изменилась',
  suppression_threshold_crossed: 'Изменился уровень подавления',
};

export interface SimulationAiCommandFacts {
  readonly id: string;
  readonly status: PlayerCommandStatus;
  readonly revision: number;
  readonly target: GridPosition;
  readonly reason: string;
  readonly reasonRu: string;
}

export interface SimulationAiMoveFacts {
  readonly source: MoveOrderSource | 'legacy';
  readonly ownerToken?: string;
  readonly playerCommandId?: string;
  readonly target: GridPosition;
  readonly routeRevision: number;
}

export interface SimulationAiFacts {
  readonly version: 1;
  readonly unitId: string;
  readonly command?: SimulationAiCommandFacts;
  readonly move?: SimulationAiMoveFacts;
  readonly ammo: number;
  readonly weaponReady: boolean;
  readonly suppression: number;
  readonly suppressionHigh: boolean;
  readonly routeOwnerToken?: string;
  readonly routeAbortCode?: AiRouteAbortCode;
  readonly routeAbortReason?: string;
  readonly routeAbortReasonRu?: string;
  readonly routeRevision: number;
  readonly lastEvent: string | null;
}

export interface PublishSimulationAiEventsResult {
  readonly facts: SimulationAiFacts;
  readonly generated: readonly AiEventDraft[];
  readonly published: readonly AiEvent[];
  readonly criticalOverflow: boolean;
}

export function captureSimulationAiFacts(unit: UnitModel): SimulationAiFacts {
  const command = unit.playerCommand;
  const move = unit.order;
  const route = unit.behaviorRuntime.aiRouteStatusState;
  return {
    version: 1,
    unitId: unit.id,
    command: command
      ? {
          id: command.id,
          status: command.status,
          revision: command.revision,
          target: { ...command.target },
          reason: command.reason,
          reasonRu: command.reasonRu,
        }
      : undefined,
    move: move
      ? {
          source: move.source ?? 'legacy',
          ownerToken: move.ownerToken,
          playerCommandId: move.playerCommandId,
          target: { ...move.target },
          routeRevision: Math.max(0, move.routeRevision ?? 0),
        }
      : undefined,
    ammo: Math.max(0, Math.round(unit.behaviorRuntime.ammo)),
    weaponReady: unit.behaviorRuntime.weaponReady,
    suppression: Math.max(0, unit.behaviorRuntime.suppression),
    suppressionHigh: unit.behaviorRuntime.suppression >= AI_SUPPRESSION_EVENT_THRESHOLD,
    routeOwnerToken: route?.ownerToken,
    routeAbortCode: route?.abortCode,
    routeAbortReason: route?.abortReason,
    routeAbortReasonRu: route?.abortReasonRu,
    routeRevision: route ? Math.max(0, route.lastCheckedAtMs) : 0,
    lastEvent: unit.behaviorRuntime.lastEvent,
  };
}

export function cloneSimulationAiFacts(value: SimulationAiFacts): SimulationAiFacts {
  return {
    ...value,
    command: value.command ? { ...value.command, target: { ...value.command.target } } : undefined,
    move: value.move ? { ...value.move, target: { ...value.move.target } } : undefined,
  };
}

export function collectSimulationAiEvents(
  previous: SimulationAiFacts | null | undefined,
  current: SimulationAiFacts,
  simulationTimeMs: number,
): AiEventDraft[] {
  if (!previous || previous.unitId !== current.unitId) return [];
  const events: AiEventDraft[] = [];
  const nowMs = Math.max(0, simulationTimeMs);

  if (current.command?.status === 'active' && previous.command?.id !== current.command.id) {
    events.push(makeEvent(current, 'order_received', nowMs, 100, {
      orderId: current.command.id,
      revision: current.command.revision,
      target: { ...current.command.target },
      reason: current.command.reason,
      reasonRu: current.command.reasonRu,
    }));
  }

  if (current.command?.status === 'cancelled'
    && previous.command?.id === current.command.id
    && previous.command.status !== 'cancelled') {
    events.push(makeEvent(current, 'order_cancelled', nowMs, 100, {
      orderId: current.command.id,
      revision: current.command.revision,
      target: { ...current.command.target },
      reason: current.command.reason,
      reasonRu: current.command.reasonRu,
    }));
  }

  const linkedCommandCompleted = previous.move?.playerCommandId
    && current.command?.id === previous.move.playerCommandId
    && current.command.status === 'completed';
  if (previous.move && !current.move && (current.lastEvent === 'move_done' || linkedCommandCompleted)) {
    events.push(makeEvent(current, 'move_completed', nowMs, 80, {
      ownerToken: previous.move.ownerToken,
      playerCommandId: previous.move.playerCommandId,
      source: previous.move.source,
      target: { ...previous.move.target },
    }, { expiresAtMs: nowMs + 10000 }));
  }

  if (current.routeAbortCode === 'route_blocked'
    && (previous.routeAbortCode !== current.routeAbortCode
      || previous.routeOwnerToken !== current.routeOwnerToken
      || previous.routeRevision !== current.routeRevision)) {
    events.push(makeEvent(current, 'route_blocked', nowMs, 90, {
      ownerToken: current.routeOwnerToken,
      reason: current.routeAbortReason,
      reasonRu: current.routeAbortReasonRu,
    }, { expiresAtMs: nowMs + 10000 }));
  }

  if (current.routeAbortCode === 'target_lost'
    && (previous.routeAbortCode !== current.routeAbortCode
      || previous.routeOwnerToken !== current.routeOwnerToken
      || previous.routeRevision !== current.routeRevision)) {
    events.push(makeEvent(current, 'target_lost', nowMs, 90, {
      ownerToken: current.routeOwnerToken,
      reason: current.routeAbortReason,
      reasonRu: current.routeAbortReasonRu,
    }, { expiresAtMs: nowMs + 10000 }));
  }

  if (previous.ammo > 0 && current.ammo <= 0) {
    events.push(makeEvent(current, 'ammo_empty', nowMs, 80, {
      previousAmmo: previous.ammo,
      ammo: current.ammo,
    }, { expiresAtMs: nowMs + 10000 }));
  }

  if (previous.weaponReady !== current.weaponReady) {
    events.push(makeEvent(current, 'weapon_ready_changed', nowMs, 40, {
      previousReady: previous.weaponReady,
      weaponReady: current.weaponReady,
    }, {
      expiresAtMs: nowMs + 5000,
      coalesceKey: 'weapon_ready',
    }));
  }

  if (previous.suppressionHigh !== current.suppressionHigh) {
    events.push(makeEvent(current, 'suppression_threshold_crossed', nowMs, 50, {
      previousSuppression: previous.suppression,
      suppression: current.suppression,
      direction: current.suppressionHigh ? 'above' : 'below',
      threshold: AI_SUPPRESSION_EVENT_THRESHOLD,
    }, {
      expiresAtMs: nowMs + 5000,
      coalesceKey: 'suppression_threshold',
    }));
  }

  return events;
}

export function initializeSimulationAiEventFacts(unit: UnitModel): void {
  unit.behaviorRuntime.aiSimulationEventFacts = captureSimulationAiFacts(unit);
}

export function publishSimulationAiEvents(
  unit: UnitModel,
  simulationTimeMs: number,
): PublishSimulationAiEventsResult {
  const runtime = unit.behaviorRuntime;
  const current = captureSimulationAiFacts(unit);
  const previous = runtime.aiSimulationEventFacts;
  if (!previous) {
    runtime.aiSimulationEventFacts = cloneSimulationAiFacts(current);
    return { facts: current, generated: [], published: [], criticalOverflow: false };
  }

  const generated = collectSimulationAiEvents(previous, current, simulationTimeMs);
  if (generated.length === 0) {
    runtime.aiSimulationEventFacts = cloneSimulationAiFacts(current);
    return { facts: current, generated, published: [], criticalOverflow: false };
  }

  const session = runtime.aiRuntimeSession;
  if (!session) {
    return { facts: current, generated, published: [], criticalOverflow: false };
  }

  let queue = session.eventQueue;
  const published: AiEvent[] = [];
  let criticalOverflow = false;
  for (const draft of generated) {
    const result = pushAiEvent(queue, draft, simulationTimeMs);
    queue = result.queue;
    if (result.accepted) published.push(result.event);
    if (result.criticalOverflow) criticalOverflow = true;
  }
  runtime.aiRuntimeSession = { ...session, eventQueue: queue };
  runtime.aiSimulationEventFacts = cloneSimulationAiFacts(current);
  if (criticalOverflow) {
    runtime.lastEvent = 'ai_event_queue_critical_overflow';
    runtime.reason = 'Критическое событие приказа не помещается в очередь ИИ.';
  }
  return { facts: current, generated, published, criticalOverflow };
}

function makeEvent(
  current: SimulationAiFacts,
  type: SimulationAiEventType,
  timestampMs: number,
  priority: number,
  payload: Record<string, unknown>,
  options: { readonly expiresAtMs?: number; readonly coalesceKey?: string } = {},
): AiEventDraft {
  const revision = current.command?.revision
    ?? current.routeRevision
    ?? current.move?.routeRevision
    ?? 0;
  return {
    id: `${current.unitId}:${type}:${Math.max(0, Math.round(timestampMs))}:${revision}`,
    type,
    sourceId: current.unitId,
    targetId: current.unitId,
    timestampMs,
    priority,
    expiresAtMs: options.expiresAtMs,
    coalesceKey: options.coalesceKey,
    payload: {
      labelRu: SIMULATION_AI_EVENT_LABELS_RU[type],
      ...payload,
    },
  };
}
