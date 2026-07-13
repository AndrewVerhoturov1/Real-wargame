import type { AiNode } from '../AiGraph';
import type { AiGraphEffect, AiGraphRunnerBlackboard } from '../AiGraphRunner';
import type { AiEvent } from '../events/AiEvent';

export type AiActionExecutionStatus = 'running' | 'waiting' | 'success' | 'failure' | 'cancelled';
export type AiActionOutcome = 'success' | 'failure' | 'cancelled';

export interface AiActionCancellation {
  readonly reason: string;
  readonly reasonRu?: string;
}

export interface AiActionRuntimeContext {
  readonly node: AiNode;
  readonly unitId: string;
  readonly nowMs: number;
  readonly startedAtMs: number;
  readonly blackboard: AiGraphRunnerBlackboard;
  readonly events?: readonly AiEvent[];
}

export interface AiActionTickResult<TState> {
  readonly status: AiActionExecutionStatus;
  readonly state?: TState;
  readonly effects?: readonly AiGraphEffect[];
  readonly reason: string;
  readonly reasonRu?: string;
  readonly progress?: number;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface AiNodeLifecycle<TState> {
  start(context: AiActionRuntimeContext): AiActionTickResult<TState>;
  update(context: AiActionRuntimeContext, state: TState): AiActionTickResult<TState>;
  cancel(
    context: AiActionRuntimeContext,
    state: TState,
    cancellation: AiActionCancellation,
  ): AiActionTickResult<TState>;
  cleanup(
    context: AiActionRuntimeContext,
    state: TState | undefined,
    outcome: AiActionOutcome,
  ): readonly AiGraphEffect[];
  validateState?(value: unknown): value is TState;
}

export interface RunAiActionLifecycleInput<TState> {
  readonly lifecycle: AiNodeLifecycle<TState>;
  readonly context: AiActionRuntimeContext;
  readonly phase: 'start' | 'update' | 'cancel';
  readonly state?: TState;
  readonly cancellation?: AiActionCancellation;
}

export interface RunAiActionLifecycleResult<TState> extends AiActionTickResult<TState> {
  readonly cleanupCompleted: boolean;
}

export function runAiActionLifecycle<TState>(
  input: RunAiActionLifecycleInput<TState>,
): RunAiActionLifecycleResult<TState> {
  let step: AiActionTickResult<TState>;
  let state = input.state;

  try {
    if (input.phase === 'start') {
      step = input.lifecycle.start(input.context);
    } else if (input.phase === 'cancel') {
      if (state === undefined) {
        step = failureResult<TState>(
          'Cannot cancel an AI action without saved state.',
          'Нельзя отменить действие ИИ без сохранённого состояния.',
        );
      } else {
        step = input.lifecycle.cancel(
          input.context,
          state,
          input.cancellation ?? { reason: 'AI action cancelled.', reasonRu: 'Действие ИИ отменено.' },
        );
      }
    } else if (state === undefined) {
      step = failureResult<TState>(
        'Cannot update an AI action without saved state.',
        'Нельзя продолжить действие ИИ без сохранённого состояния.',
      );
    } else {
      step = input.lifecycle.update(input.context, state);
    }
  } catch (error) {
    step = failureResult<TState>(
      `AI action lifecycle failed: ${errorMessage(error)}`,
      `Ошибка жизненного цикла действия ИИ: ${errorMessage(error)}`,
    );
  }

  state = step.state ?? state;
  const outcome = terminalOutcome(step.status);
  if (!outcome) {
    return {
      ...step,
      state,
      effects: [...(step.effects ?? [])],
      cleanupCompleted: false,
    };
  }

  let cleanupEffects: readonly AiGraphEffect[] = [];
  try {
    cleanupEffects = input.lifecycle.cleanup(input.context, state, outcome);
  } catch (error) {
    return {
      status: 'failure',
      state: undefined,
      reason: `AI action cleanup failed: ${errorMessage(error)}`,
      reasonRu: `Ошибка очистки действия ИИ: ${errorMessage(error)}`,
      effects: [...(step.effects ?? [])],
      cleanupCompleted: true,
    };
  }

  return {
    ...step,
    state: undefined,
    effects: [...(step.effects ?? []), ...cleanupEffects],
    cleanupCompleted: true,
  };
}

function failureResult<TState>(reason: string, reasonRu: string): AiActionTickResult<TState> {
  return { status: 'failure', reason, reasonRu };
}

function terminalOutcome(status: AiActionExecutionStatus): AiActionOutcome | null {
  if (status === 'success' || status === 'failure' || status === 'cancelled') return status;
  return null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
