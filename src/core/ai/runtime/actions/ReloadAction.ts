import type { AiGraphEffect } from '../../AiGraphRunner';
import type { AiNodeLifecycle } from '../AiNodeLifecycle';

export interface ReloadActionState {
  readonly kind: 'reload';
  readonly startedAtMs: number;
  readonly durationMs: number;
  readonly observedAmmo: number;
}

export interface AiGraphRuntimeBeginReloadEffect {
  readonly type: 'begin_reload';
  readonly initialAmmo: number;
  /** Deprecated compatibility snapshot; always equals initialAmmo. */
  readonly targetAmmo: number;
  readonly reason: string;
  readonly reasonRu?: string;
}

/** Read-only compatibility shape for obsolete effects from older runtimes. */
export interface AiGraphRuntimeCompleteReloadEffect {
  readonly type: 'complete_reload';
  readonly targetAmmo: number;
  readonly reason: string;
  readonly reasonRu?: string;
}

/** Read-only compatibility shape for obsolete effects from older runtimes. */
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
    const observedAmmo = readAmmo(context.blackboard.ammo, 0);
    const failIfNoWeapon = readBoolean(context.node.parameters?.failIfNoWeapon, true);
    const weaponReady = readBoolean(context.blackboard.weaponReady, true);
    if (failIfNoWeapon && !weaponReady && observedAmmo <= 0) {
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
      observedAmmo,
    };
    if (state.durationMs <= 0) {
      return {
        status: 'success',
        state,
        effects: [beginReloadEffect(state)],
        reason: 'Physical reload action requested.',
        reasonRu: 'Запрошено физическое действие перезарядки.',
        progress: 1,
      };
    }
    return {
      status: 'running',
      state,
      effects: [beginReloadEffect(state)],
      reason: `Physical reload action requested; legacy node waits ${state.durationMs} ms.`,
      reasonRu: `Запрошена физическая перезарядка; старая нода ожидает ${formatSeconds(state.durationMs)} сек.`,
      progress: 0,
    };
  },
  update: (context, state) => {
    const elapsedMs = Math.max(0, context.nowMs - state.startedAtMs);
    if (elapsedMs >= state.durationMs) {
      return {
        status: 'success',
        state,
        reason: `Legacy reload node finished after ${elapsedMs} ms; physical runtime owns completion.`,
        reasonRu: `Старая нода завершилась через ${formatSeconds(elapsedMs)} сек.; патронами владеет физический runtime.`,
        progress: 1,
      };
    }
    return {
      status: 'running',
      state,
      reason: `Physical reload request is active at ${elapsedMs} ms.`,
      reasonRu: `Запрос физической перезарядки активен: ${formatSeconds(elapsedMs)} сек.`,
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
    if (!state || outcome === 'success') return [];
    return [cancelPhysicalReloadEffect(outcome)];
  },
  validateState: isReloadActionState,
};

export function readAiGraphRuntimeReloadEffect(effect: AiGraphEffect): AiGraphRuntimeReloadEffect | null {
  const candidate = effect as unknown as Partial<AiGraphRuntimeReloadEffect>;
  if (candidate.type === 'begin_reload' && isFiniteNonNegative(candidate.initialAmmo)) {
    return {
      type: 'begin_reload',
      initialAmmo: candidate.initialAmmo,
      targetAmmo: candidate.initialAmmo,
      reason: typeof candidate.reason === 'string' ? candidate.reason : 'Physical reload requested.',
      reasonRu: typeof candidate.reasonRu === 'string' ? candidate.reasonRu : undefined,
    };
  }
  if (candidate.type === 'complete_reload') {
    return {
      type: 'complete_reload',
      targetAmmo: isFiniteNonNegative(candidate.targetAmmo) ? candidate.targetAmmo : 0,
      reason: typeof candidate.reason === 'string' ? candidate.reason : 'Obsolete reload completion effect ignored.',
      reasonRu: typeof candidate.reasonRu === 'string' ? candidate.reasonRu : undefined,
    };
  }
  if (candidate.type === 'cancel_reload' && isFiniteNonNegative(candidate.initialAmmo)) {
    return {
      type: 'cancel_reload',
      initialAmmo: candidate.initialAmmo,
      reason: typeof candidate.reason === 'string' ? candidate.reason : 'Obsolete reload cancellation effect.',
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
    && isFiniteNonNegative(value.observedAmmo);
}

function beginReloadEffect(state: ReloadActionState): AiGraphEffect {
  return {
    type: 'begin_reload',
    initialAmmo: state.observedAmmo,
    targetAmmo: state.observedAmmo,
    reason: 'Physical reload requested.',
    reasonRu: 'Запрошена физическая перезарядка.',
  } as unknown as AiGraphEffect;
}

function cancelPhysicalReloadEffect(outcome: 'failure' | 'cancelled'): AiGraphEffect {
  return {
    type: 'set_action',
    action: 'reload_cancelled',
    reason: outcome === 'cancelled' ? 'Physical reload cancellation requested.' : 'Physical reload failure cancellation requested.',
    reasonRu: outcome === 'cancelled'
      ? 'Запрошена отмена физической перезарядки.'
      : 'Запрошена системная отмена физической перезарядки после ошибки старой ноды.',
  };
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
