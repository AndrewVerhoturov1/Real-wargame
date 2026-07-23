import type { SimulationState } from '../../simulation/SimulationState';
import {
  tickProjectileRuntime,
  type TickProjectileRuntimeInput,
  type TickProjectileRuntimeResult,
} from './ProjectileStepper';

export type TickReferenceProjectilesInput = TickProjectileRuntimeInput;
export type TickReferenceProjectilesResult = TickProjectileRuntimeResult;

/** Stage 3 compatibility entry point backed by the Stage 4 batch runtime.
 * The production stepper reuses queryUnitsNearBallisticSegmentInto from the existing unit index.
 */
export function tickReferenceProjectiles(
  state: SimulationState,
  input: TickReferenceProjectilesInput,
): TickReferenceProjectilesResult {
  return tickProjectileRuntime(state, input);
}
