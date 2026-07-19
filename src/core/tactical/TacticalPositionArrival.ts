import type { SimulationState } from '../simulation/SimulationState';
import { markPlayerCommandArrivalPostureApplied } from '../orders/PlayerCommand';

export function reconcileCompletedTacticalPositionArrivals(state: SimulationState): void {
  for (const unit of state.units) {
    const command = unit.playerCommand;
    if (
      !command?.arrivalPosture
      || command.arrivalPostureApplied
      || command.status !== 'completed'
      || unit.order
    ) continue;

    const previousPosture = unit.behaviorRuntime.posture;
    unit.behaviorRuntime.previousPosture = previousPosture;
    unit.behaviorRuntime.posture = command.arrivalPosture;
    unit.behaviorRuntime.postureChangedBecause = 'tactical_position_arrival';
    unit.behaviorRuntime.lastEvent = 'tactical_position_posture_applied';
    unit.behaviorRuntime.reason = `Тактическая позиция занята: ${postureLabel(command.arrivalPosture)}.`;
    unit.playerCommand = markPlayerCommandArrivalPostureApplied(command);
  }
}

function postureLabel(posture: 'standing' | 'crouched' | 'prone'): string {
  if (posture === 'standing') return 'стоя';
  if (posture === 'crouched') return 'сидя';
  return 'лёжа';
}
