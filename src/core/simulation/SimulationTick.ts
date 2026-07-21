import type { SimulationState } from './SimulationState';
import { reconcileCompletedTacticalPositionArrivals } from '../tactical/TacticalPositionArrival';
import { reconcileTacticalPositionOccupation } from '../tactical/TacticalPositionOccupation';
import { requestStaticTacticalPositionBasis } from '../tactical/static/StaticTacticalPositionService';
import { tickSimulation as tickSimulationLegacy } from './SimulationTickLegacy';

export * from './SimulationTickLegacy';

export function tickSimulation(state: SimulationState, deltaSeconds: number): void {
  // Static tactical analysis is keyed only by map/material/settings revisions.
  // This request is therefore a cheap identity check during ordinary movement,
  // while creation/loading or geometry changes enqueue one shared worker build.
  requestStaticTacticalPositionBasis(state);
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
