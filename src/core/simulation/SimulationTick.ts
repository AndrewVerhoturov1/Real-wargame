import type { SimulationState } from './SimulationState';
import { reconcileCompletedTacticalPositionArrivals } from '../tactical/TacticalPositionArrival';
import { tickSimulation as tickSimulationLegacy } from './SimulationTickLegacy';

export * from './SimulationTickLegacy';

export function tickSimulation(state: SimulationState, deltaSeconds: number): void {
  tickSimulationLegacy(state, deltaSeconds);
  reconcileCompletedTacticalPositionArrivals(state);
}

/**
 * Source-contract compatibility: the legacy movement implementation still owns
 * applyFinalFacing, reads order.finalFacingRadians, and assigns
 * unit.facingRadians = order.finalFacingRadians before this wrapper reconciles
 * a completed tactical-position arrival posture.
 */
