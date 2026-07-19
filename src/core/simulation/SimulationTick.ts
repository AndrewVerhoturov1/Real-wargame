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
 * The legacy movement implementation still owns applyFinalFacing, reads
 * order.finalFacingRadians, and performs
 * unit.facingRadians = order.finalFacingRadians before this wrapper applies and
 * retains tactical-position posture/facing after the ordinary Graph v2 tick.
 */
