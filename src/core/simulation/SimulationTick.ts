import {
  reconcileMovementPostureRequest,
  tickPostureTransition,
} from '../actions/PostureTransition';
import { isUnitCombatCapable } from '../combat/CombatDamage';
import { reconcileCompletedTacticalPositionArrivals } from '../tactical/TacticalPositionArrival';
import { reconcileTacticalPositionOccupation } from '../tactical/TacticalPositionOccupation';
import { getAiTestTimeScale } from '../testing/AiTestLabRuntime';
import type { SimulationState } from './SimulationState';
import { tickSimulation as tickSimulationLegacy } from './SimulationTickLegacy';

export * from './SimulationTickLegacy';

export function tickSimulation(state: SimulationState, deltaSeconds: number): void {
  const scaledDeltaSeconds = deltaSeconds * getAiTestTimeScale(state);

  for (const unit of state.units) {
    reconcileTacticalPositionOccupation(state, unit);
    reconcileMovementPostureRequest(state, unit);
    tickPostureTransition(unit, scaledDeltaSeconds, isUnitCombatCapable(unit));
  }

  tickSimulationLegacy(state, deltaSeconds);
  reconcileCompletedTacticalPositionArrivals(state);
  for (const unit of state.units) reconcileTacticalPositionOccupation(state, unit);
}

/**
 * The legacy movement implementation still owns waypoint integration and final
 * facing. This wrapper owns the serializable posture action clock and tactical
 * position reconciliation. While a transition is running, the route remains
 * intact and movement resumes after the action completes.
 */
