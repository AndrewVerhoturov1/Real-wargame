import type { SimulationState } from '../../simulation/SimulationState';
import {
  tickProjectileRuntime,
  type TickProjectileRuntimeInput,
  type TickProjectileRuntimeResult,
} from './ProjectileStepperStage8';

export type TickReferenceProjectilesInput = TickProjectileRuntimeInput;
export type TickReferenceProjectilesResult = TickProjectileRuntimeResult;

/** Compatibility entry point backed by the Stage 8 batch runtime.
 * The production stepper reuses the existing combat-unit and map-object indices.
 */
export function tickReferenceProjectiles(
  state: SimulationState,
  input: TickReferenceProjectilesInput,
): TickReferenceProjectilesResult {
  return tickProjectileRuntime(state, input);
}
