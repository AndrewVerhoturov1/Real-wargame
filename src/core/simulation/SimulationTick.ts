import { reconcileMovementPostureRequest } from '../actions/PostureTransition';
import { tickPostureTransitionWithTimeBudget } from '../actions/PostureTransitionClock';
import { isUnitCombatCapable } from '../combat/CombatDamage';
import { reconcileCompletedTacticalPositionArrivals } from '../tactical/TacticalPositionArrival';
import { reconcileTacticalPositionOccupation } from '../tactical/TacticalPositionOccupation';
import { getAiTestTimeScale } from '../testing/AiTestLabRuntime';
import type { SimulationState } from './SimulationState';
import { tickSimulation as tickSimulationLegacy } from './SimulationTickLegacy';

export * from './SimulationTickLegacy';

export function tickSimulation(state: SimulationState, deltaSeconds: number): void {
  const scaledDeltaSeconds = deltaSeconds * getAiTestTimeScale(state);
  const physicalActionDeltaSecondsByUnitId = new Map<string, number>();

  for (const unit of state.units) {
    reconcileTacticalPositionOccupation(state, unit);
    reconcileMovementPostureRequest(state, unit);
    const postureTick = tickPostureTransitionWithTimeBudget(
      unit,
      scaledDeltaSeconds,
      isUnitCombatCapable(unit),
    );
    if (postureTick.wasRunning) {
      physicalActionDeltaSecondsByUnitId.set(unit.id, postureTick.remainingSeconds);
    }
  }

  tickSimulationLegacy(state, deltaSeconds, { physicalActionDeltaSecondsByUnitId });
  reconcileCompletedTacticalPositionArrivals(state);
  for (const unit of state.units) reconcileTacticalPositionOccupation(state, unit);
}

/**
 * The legacy simulation still owns combat phases, waypoint integration and
 * final facing. This wrapper owns the serializable posture-action clock. On the
 * completion tick, combat and movement receive only the unused time remainder.
 */
