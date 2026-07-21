import { tickPhysicalActionWithTimeBudget } from '../actions/PhysicalActionClock';
import { reconcileMovementPostureRequest } from '../actions/PostureTransition';
import {
  isWeaponReloadRunning,
  synchronizeWeaponReloadRuntimeAfterRestore,
} from '../actions/WeaponReload';
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
    const physicalActionTick = tickPhysicalActionWithTimeBudget(
      unit,
      scaledDeltaSeconds,
      isUnitCombatCapable(unit),
    );
    if (physicalActionTick.wasRunning) {
      physicalActionDeltaSecondsByUnitId.set(unit.id, physicalActionTick.remainingSeconds);
    }
  }

  tickSimulationLegacy(state, deltaSeconds, { physicalActionDeltaSecondsByUnitId });
  for (const unit of state.units) {
    if (isWeaponReloadRunning(unit)) synchronizeWeaponReloadRuntimeAfterRestore(unit);
  }
  reconcileCompletedTacticalPositionArrivals(state);
  for (const unit of state.units) reconcileTacticalPositionOccupation(state, unit);
}

/**
 * The legacy simulation still owns combat phases, waypoint integration and
 * final facing. This wrapper owns the single serializable physical-action
 * clock. On a completion tick, combat and movement receive only the unused
 * time remainder after posture transition or weapon reload.
 */
