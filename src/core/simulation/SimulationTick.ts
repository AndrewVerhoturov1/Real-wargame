import type { SimulationState } from './SimulationState';
import { reconcileCompletedTacticalPositionArrivals } from '../tactical/TacticalPositionArrival';
import { reconcileTacticalPositionOccupation } from '../tactical/TacticalPositionOccupation';
import { tickSimulation as tickSimulationLegacy } from './SimulationTickLegacy';

export * from './SimulationTickLegacy';

export function tickSimulation(state: SimulationState, deltaSeconds: number): void {
  tickSimulationLegacy(state, deltaSeconds);
  reconcileCompletedTacticalPositionArrivals(state);
  for (const unit of state.units) reconcileTacticalPositionOccupation(unit);
}

/**
 * The legacy movement implementation still owns waypoint movement and applies
 * order.finalFacingRadians at completion. This wrapper only finalizes the
 * serializable PlayerCommand occupation state and maintains its approach posture;
 * occupied posture conflicts are filtered inside the exact Graph v2 runtime.
 */
