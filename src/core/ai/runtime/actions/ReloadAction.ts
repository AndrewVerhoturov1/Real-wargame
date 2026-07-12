import type { AiGraphEffect } from '../../AiGraphRunner';
import type { AiNodeLifecycle } from '../AiNodeLifecycle';

export interface ReloadActionState {
  readonly kind: 'reload';
  readonly startedAtMs: number;
  readonly durationMs: number;
  readonly initialAmmo: number;
  readonly targetAmmo: number;
}

export interface AiGraphRuntimeBeginReloadEffect {
  readonly type: 'begin_reload';
  readonly initialAmmo: number;
  readonly targetAmmo: number;
  readonly reason: string;
  readonly reasonRu?: string;
}

export interface AiGraphRuntimeCompleteReloadEffect {
  readonly type: 'complete_reload';
  readonly targetAmmo: number;
  readonly reason: string;
  readonly reasonRu?: string;
}

export interface AiGraphRuntimeCancelReloadEffect {
  readonly type: 'cancel_reload';
  readonly initialAmmo: number;
  readonly reason: string;
  readonly reasonRu?: string;
}

export type AiGraphRuntimeReloadEffect =
  | AiGraphRuntimeBeginReloadEffect
  | AiGraphRuntimeCompleteReloadEffect
  | AiGraphRuntimeCancelReloadEffect;

export const reloadActionLifecycle: AiNodeLifecycle<ReloadActionState> = {
  start: (context) => {
    const initialAmmo = readAmmo(context.blackboard.ammo, 0);
    const targetAmmo = readAmmo(context.node.parameters?.targetAmmo, 30);
    const failIfNoWeapon = readBoolean(context.node.parameters?.failIfNoWeapon, true);
    const weaponReady = readBoolean(context.blackboard.weaponReady, true);
    if (failIfNoWeapon && !weaponReady && initialAmmo <= 0) {
      return {
        status: 'failure',
        reason: 'Reload cannot start because no usable weapon is available.',
        reasonRu: 'Перезарядка не начата: нет доступного оружия.',
      };
    }

    const state: ReloadActionState = {
      kind: 'reload',
      startedAtMs: context.nowMs,
      durationMs: toMilliseconds(readNumber(context.node.parameters?.durationSeconds, 3)),
      initialAmmo,
      targetAmmo,
    };
    if (state.durationMs <= 0) {
      return {
        status: 'success',
        state,
        reason: 'Reload completed immediately.',
        reasonRu: 'Перезарядка завершена сразу.',
        progress: 1,
      };
    }
    return {
      status: 'running',
      state,
      effects: [beginReloadEffect(state)],
      reason: `Reload started for ${state.durationMs} ms.`,
      reasonRu: `Перезарядка начата на ${formatSeconds(state.durationMs)} сек.`,
      progress: 0,
    };
  },
  update: (context, state) => {
    const elapsedMs = Math.max(0, context.nowMs - state.startedAtMs);
    if (elapsedMs >= state.durationMs) {
      return {
        status: 'success',
        state,
        reason: `Reload completed after ${elapsedMs} ms.`,
        reasonRu: `Перезарядка завершена через ${formatSeconds(elapsedMs)} сек.`,
        progress: 1,
      };
    }
    return {
      status: 'running',
      state,
      reason: `Reload is active at ${elapsedMs} ms.`,
      reasonRu: `Перезарядка выполняется: ${formatSeconds(elapsedMs)} сек.`,
      progress: state.durationMs > 0 ? Math.min(1, elapsedMs / state.durationMs) : 1,
    };
  },
  cancel: (_context, state, cancellation) => ({
    status: 'cancelled',
    state,
    reason: cancellation.reason,
    reasonRu: cancellation.reasonRu ?? 'Перезарядка отменена.',
  }),
  cleanup: (_context, state, outcome) => {
    if (!state) return [];
    if (outcome === 'success') return [completeReloadEffect(state)];
    return [cancelReloadEffect(state, outcome)];
  },
  validateState: isReloadActionState,
};

export function readAiGraphRuntimeReloadEffect(effect: AiGraphEffect): AiGraphRuntimeReloadEffect | null {
  const candidate = effect as unknown as Partial<AiGraphRuntimeReloadEffect>;
  if (candidate.type === 'begin_reload'
    && isFiniteNonNegative(candidate.initialAmmo)
    && isFiniteNonNegative(candidate.targetAmmo)) {
    return {
      type: 'begin_reload',
      initialAmmo: candidate.initialAmmo,
      targetAmmo: candidate.targetAmmo,
      reason: typeof candidate.reason === 'string' ? candidate.reason : 'Reload started.',
      reasonRu: typeof candidate.reasonRu === 'string' ? candidate.reasonRu : undefined,
    };
  }
  if (candidate.type === 'complete_reload' && isFiniteNonNegative(candidate.targetAmmo)) {
    return {
      type: 'complete_reload',
      targetAmmo: candidate.targetAmmo,
      reason: typeof candidate.reason === 'string' ? candidate.reason : 'Reload completed.',
      reasonRu: typeof candidate.reasonRu === 'string' ? candidate.reasonRu : undefined,
    };
  }
  if (candidate.type === 'cancel_reload' && isFiniteNonNegative(candidate.initialAmmo)) {
    return {
      type: 'cancel_reload',
      initialAmmo: candidate.initialAmmo,
      reason: typeof candidate.reason === 'string' ? candidate.reason : 'Reload cancelled.',
      reasonRu: typeof candidate.reasonRu === 'string' ? candidate.reasonRu : undefined,
    };
  }
  return null;
}

export function isReloadActionState(value: unknown): value is ReloadActionState {
  return isRecord(value)
    && value.kind === 'reload'
    && isFiniteNonNegative(value.startedAtMs)
    && isFiniteNonNegative(value.durationMs)
    && isFiniteNonNegative(value.initialAmmo)
    && isFiniteNonNegative(value.targetAmmo);
}

function beginReloadEffect(state: ReloadActionState): AiGraphEffect {
  return {
    type: 'begin_reload',
    initialAmmo: state.initialAmmo,
    targetAmmo: state.targetAmmo,
    reason: 'Reload started.',
    reasonRu: 'Перезарядка начата.',
  } as unknown as AiGraphEffect;
}

function completeReloadEffect(state: ReloadActionState): AiGraphEffect {
  return {
    type: 'complete_reload',
    targetAmmo: state.targetAmmo,
    reason: 'Reload completed.',
    reasonRu: 'Перезарядка завершена.',
  } as unknown as AiGraphEffect;
}

function cancelReloadEffect(state: ReloadActionState, outcome: 'failure' | 'cancelled'): AiGraphEffect {
  return {
    type: 'cancel_reload',
    initialAmmo: state.initialAmmo,
    reason: outcome === 'cancelled' ? 'Reload cancelled.' : 'Reload failed.',
    reasonRu: outcome === 'cancelled' ? 'Перезарядка отменена.' : 'Перезарядка провалилась.',
  } as unknown as AiGraphEffect;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function readAmmo(value: unknown, fallback: number): number {
  return Math.max(0, Math.round(readNumber(value, fallback)));
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function toMilliseconds(seconds: number): number {
  return Math.round(Math.max(0, seconds) * 1000);
}

function formatSeconds(milliseconds: number): string {
  return (milliseconds / 1000).toFixed(1).replace(/\.0$/, '');
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
