import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';

export interface AiSimulationExecutionContext {
  readonly state: SimulationState;
  readonly unit: UnitModel;
}

const contextStack: AiSimulationExecutionContext[] = [];

/**
 * Synchronous execution context for the trusted per-unit scheduler path.
 * It binds Graph v2 to exact object identities, not a global unit-id lookup.
 */
export function withAiSimulationExecutionContext<Result>(
  state: SimulationState,
  unit: UnitModel,
  callback: () => Result,
): Result {
  const context = Object.freeze({ state, unit });
  contextStack.push(context);
  try {
    return callback();
  } finally {
    const removed = contextStack.pop();
    if (removed !== context) contextStack.length = 0;
  }
}

export function readAiSimulationExecutionContext(unitId: string): AiSimulationExecutionContext | null {
  const context = contextStack[contextStack.length - 1];
  return context?.unit.id === unitId ? context : null;
}

export function getAiSimulationExecutionContextDepth(): number {
  return contextStack.length;
}
