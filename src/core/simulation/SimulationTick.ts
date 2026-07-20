import type { SimulationState } from './SimulationState';
import {
  reconcileTacticalTraversalAfterMovement,
  reconcileTacticalTraversalBeforeMovement,
} from '../navigation/TacticalTraversalRuntime';
import { reconcileCompletedTacticalPositionArrivals } from '../tactical/TacticalPositionArrival';
import { reconcileTacticalPositionOccupation } from '../tactical/TacticalPositionOccupation';
import { tickSimulation as tickSimulationLegacy } from './SimulationTickLegacy';

export * from './SimulationTickLegacy';

export function tickSimulation(state: SimulationState, deltaSeconds: number): void {
  reconcileTacticalTraversalBeforeMovement(state, deltaSeconds);
  tickSimulationLegacy(state, deltaSeconds);
  reconcileTacticalTraversalAfterMovement(state, deltaSeconds);
  reconcileCompletedTacticalPositionArrivals(state);
  for (const unit of state.units) reconcileTacticalPositionOccupation(unit);
}

/**
 * SimulationTickLegacy remains the only owner of coordinate changes. The wrapper
 * prepares a ready traversal segment before physical movement and reapplies its
 * body/attention policies after legacy route-facing code. Tactical-position
 * arrival remains authoritative after the order completes.
 */
