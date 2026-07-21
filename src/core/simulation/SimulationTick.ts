import { reconcileMovementPostureRequest } from '../actions/PostureTransition';
import { reconcileCompletedTacticalPositionArrivals } from '../tactical/TacticalPositionArrival';
import { reconcileTacticalPositionOccupation } from '../tactical/TacticalPositionOccupation';
import { requestStaticTacticalPositionBasis } from '../tactical/static/StaticTacticalPositionService';
import type { SimulationState } from './SimulationState';
import { tickSimulation as tickSimulationLegacy } from './SimulationTickLegacy';

export * from './SimulationTickLegacy';

export function tickSimulation(state: SimulationState, deltaSeconds: number): void {
  // Static tactical analysis is keyed only by map/material/settings revisions.
  // This remains a cheap identity check during ordinary movement.
  requestStaticTacticalPositionBasis(state);

  for (const unit of state.units) {
    reconcileTacticalPositionOccupation(state, unit);
    reconcileMovementPostureRequest(state, unit);
  }

  tickSimulationLegacy(state, deltaSeconds);
  reconcileCompletedTacticalPositionArrivals(state);
  for (const unit of state.units) reconcileTacticalPositionOccupation(state, unit);
}

/**
 * The wrapper starts posture requests that already exist at the beginning of a
 * step. The legacy pipeline advances the action after Graph v2 has emitted any
 * commands that occur inside that same simulation interval.
 */
