import { distance, type GridPosition } from '../../../geometry';
import {
  MOVEMENT_PROFILE_SELECTION_MODES,
  MOVEMENT_PROFILE_SOURCES,
  resolveMovementProfileSelection,
  type MovementProfileSelectionMode,
  type MovementProfileSource,
} from '../../../movement/MovementProfileContract';
import type { AiGraphEffect } from '../../AiGraphRunner';
import type { AiNodeLifecycle } from '../AiNodeLifecycle';

export interface MoveToBlackboardPositionActionState {
  readonly kind: 'move_to_blackboard_position';
  readonly targetKey: string;
  readonly target: GridPosition;
  readonly acceptanceRadiusCells: number;
  readonly timeoutMs: number;
  readonly actionToken: string;
  /** Added after the initial state format; omitted legacy snapshots mean automatic. */
  readonly movementProfileSelection?: MovementProfileSelectionMode;
  readonly movementProfileId?: string;
  readonly movementProfileSource?: MovementProfileSource;
}

export const moveToBlackboardPositionLifecycle: AiNodeLifecycle<MoveToBlackboardPositionActionState> = {
  start: (context) => {
    const selfPosition = readPosition(context.blackboard.self_position);
    if (!selfPosition) {
      return {
        status: 'failure',
        reason: 'MoveToBlackboardPosition requires a valid self_position.',
        reasonRu: 'Для длительного движения нужна корректная позиция бойца self_position.',
      };
    }

    const targetKey = readString(context.node.parameters?.targetKey, 'best_cover_position');
    const target = readPosition(context.blackboard[targetKey]);
    if (!target) {
      return {
        status: 'failure',
        reason: `Move target ${targetKey} is missing or invalid.`,
        reasonRu: `Цель движения «${targetKey}» отсутствует или имеет неверный формат.`,
      };
    }

    const movementSelection = resolveMovementProfileSelection({
      mode: context.node.parameters?.movementProfileSource,
      specificProfileId: context.node.parameters?.movementProfileId,
      requestedProfileId: context.blackboard.requested_movement_profile_id,
      activeProfileId: context.blackboard.active_movement_profile_id,
      activeProfileSource: context.blackboard.active_movement_profile_source,
    });
    const state: MoveToBlackboardPositionActionState = {
      kind: 'move_to_blackboard_position',
      targetKey,
      target: { ...target },
      acceptanceRadiusCells: readNumber(context.node.parameters?.acceptanceRadiusCells, 0.2),
      timeoutMs: toMilliseconds(readNumber(context.node.parameters?.timeoutSeconds, 15)),
      actionToken: makeActionToken(context.unitId, context.node.id, context.nowMs),
      movementProfileSelection: movementSelection.mode,
      movementProfileId: movementSelection.profileId,
      movementProfileSource: movementSelection.source,
    };
    const remaining = distance(selfPosition, state.target);
    if (remaining <= state.acceptanceRadiusCells) {
      return {
        status: 'success',
        reason: `Move target ${targetKey} is already reached.`,
        reasonRu: `Цель движения «${targetKey}» уже достигнута.`,
        details: moveDetails(state, remaining),
      };
    }

    return {
      status: 'running',
      state,
      effects: [beginMoveEffect(state)],
      reason: `Move ${context.node.id} started toward ${targetKey}.`,
      reasonRu: `Движение «${nodeNameRu(context.node)}» начато к цели «${targetKey}».`,
      details: moveDetails(state, remaining),
    };
  },
  update: (context, state) => {
    const selfPosition = readPosition(context.blackboard.self_position);
    if (!selfPosition) {
      return {
        status: 'failure',
        state,
        reason: 'MoveToBlackboardPosition requires a valid self_position.',
        reasonRu: 'Для длительного движения нужна корректная позиция бойца self_position.',
      };
    }

    const elapsedMs = Math.max(0, context.nowMs - context.startedAtMs);
    const remaining = distance(selfPosition, state.target);
    if (remaining <= state.acceptanceRadiusCells) {
      return {
        status: 'success',
        state,
        reason: `Move ${context.node.id} completed with ${remaining.toFixed(3)} cells remaining.`,
        reasonRu: `Движение «${nodeNameRu(context.node)}» завершено: до цели осталось ${remaining.toFixed(2)} клетки.`,
        progress: 1,
        details: moveDetails(state, remaining),
      };
    }

    const activeSource = readNullableString(context.blackboard.active_move_source);
    const activeToken = readNullableString(context.blackboard.active_move_owner_token);
    if (activeToken !== state.actionToken) {
      if (activeSource === 'player') {
        return {
          status: 'cancelled',
          state,
          reason: 'The player replaced the active AI move order.',
          reasonRu: 'Приказ игрока заменил активное движение ИИ.',
          details: moveDetails(state, remaining),
        };
      }
      if (activeToken === null) {
        return {
          status: 'failure',
          state,
          reason: 'The owned AI move order disappeared before arrival.',
          reasonRu: 'Собственный приказ движения ИИ исчез до достижения цели.',
          details: moveDetails(state, remaining),
        };
      }
      return {
        status: 'cancelled',
        state,
        reason: 'Another AI movement replaced the active move order.',
        reasonRu: 'Другое действие ИИ заменило активный приказ движения.',
        details: moveDetails(state, remaining),
      };
    }

    if (state.timeoutMs > 0 && elapsedMs >= state.timeoutMs) {
      return {
        status: 'failure',
        state,
        reason: `Move ${context.node.id} timed out after ${elapsedMs} ms.`,
        reasonRu: `Движение «${nodeNameRu(context.node)}» прервано по тайм-ауту через ${elapsedMs} мс.`,
        details: moveDetails(state, remaining),
      };
    }

    return {
      status: 'running',
      state,
      reason: `Move ${context.node.id} is active with ${remaining.toFixed(3)} cells remaining.`,
      reasonRu: `Движение «${nodeNameRu(context.node)}» продолжается: осталось ${remaining.toFixed(2)} клетки.`,
      details: moveDetails(state, remaining),
    };
  },
  cancel: (_context, state, cancellation) => ({
    status: 'cancelled',
    state,
    reason: cancellation.reason,
    reasonRu: cancellation.reasonRu,
    details: moveDetails(state),
  }),
  cleanup: (_context, state, outcome) => {
    if (!state) return [];
    const reason = outcome === 'success'
      ? 'AI movement completed.'
      : outcome === 'cancelled'
        ? 'AI movement cancelled.'
        : 'AI movement failed.';
    const reasonRu = outcome === 'success'
      ? 'Движение ИИ завершено.'
      : outcome === 'cancelled'
        ? 'Движение ИИ отменено.'
        : 'Движение ИИ провалилось.';
    return [clearMoveEffect(state.actionToken, reason, reasonRu)];
  },
  validateState: isMoveToBlackboardPositionActionState,
};

export function isMoveToBlackboardPositionActionState(value: unknown): value is MoveToBlackboardPositionActionState {
  return isRecord(value)
    && value.kind === 'move_to_blackboard_position'
    && typeof value.targetKey === 'string'
    && value.targetKey.length > 0
    && isGridPosition(value.target)
    && isFiniteNonNegative(value.acceptanceRadiusCells)
    && isFiniteNonNegative(value.timeoutMs)
    && typeof value.actionToken === 'string'
    && value.actionToken.length > 0
    && (
      value.movementProfileSelection === undefined
      || MOVEMENT_PROFILE_SELECTION_MODES.includes(value.movementProfileSelection as MovementProfileSelectionMode)
    )
    && (value.movementProfileId === undefined || typeof value.movementProfileId === 'string')
    && (
      value.movementProfileSource === undefined
      || MOVEMENT_PROFILE_SOURCES.includes(value.movementProfileSource as MovementProfileSource)
    );
}

function beginMoveEffect(state: MoveToBlackboardPositionActionState): AiGraphEffect {
  return {
    type: 'begin_move',
    ownerToken: state.actionToken,
    targetPosition: { ...state.target },
    targetKey: state.targetKey,
    movementProfileId: state.movementProfileId,
    movementProfileSource: state.movementProfileSource,
    movementProfileOwnerToken: state.movementProfileId ? state.actionToken : undefined,
    reason: `AI movement started toward ${state.targetKey}.`,
    reasonRu: `Движение ИИ начато к цели «${state.targetKey}».`,
  } as unknown as AiGraphEffect;
}

function clearMoveEffect(ownerToken: string, reason: string, reasonRu: string): AiGraphEffect {
  return {
    type: 'clear_move',
    ownerToken,
    reason,
    reasonRu,
  } as unknown as AiGraphEffect;
}

function moveDetails(state: MoveToBlackboardPositionActionState, remaining?: number): Readonly<Record<string, unknown>> {
  return {
    targetKey: state.targetKey,
    targetPosition: { ...state.target },
    actionToken: state.actionToken,
    distanceRemainingCells: remaining,
    movementProfileSelection: state.movementProfileSelection ?? 'automatic',
    movementProfileId: state.movementProfileId,
    movementProfileSource: state.movementProfileSource,
  };
}

function readPosition(value: unknown): GridPosition | null {
  return isGridPosition(value) ? { x: value.x, y: value.y } : null;
}

function isGridPosition(value: unknown): value is GridPosition {
  return isRecord(value)
    && typeof value.x === 'number'
    && Number.isFinite(value.x)
    && typeof value.y === 'number'
    && Number.isFinite(value.y);
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function nodeNameRu(node: { readonly id: string; readonly type: unknown; readonly displayName?: string; readonly displayNameRu?: string }): string {
  return node.displayNameRu ?? node.displayName ?? String(node.type ?? node.id);
}

function makeActionToken(unitId: string, nodeId: string, startedAtMs: number): string {
  return `${unitId}:${nodeId}:${Math.round(startedAtMs)}`;
}

function toMilliseconds(seconds: number): number {
  return Math.round(Math.max(0, seconds) * 1000);
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
