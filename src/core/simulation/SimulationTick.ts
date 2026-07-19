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
 * The legacy movement implementation owns route progress and finalFacingRadians.
 * This wrapper then applies and retains the tactical-position posture/facing after
 * Graph v2 has completed its ordinary tick, until another route or command begins.
 */
