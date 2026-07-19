import type { SimulationState } from '../simulation/SimulationState';
import { markPlayerCommandArrivalPostureApplied } from '../orders/PlayerCommand';
import { applyCompletedTacticalPositionOccupation } from './TacticalPositionOccupation';

export function reconcileCompletedTacticalPositionArrivals(state: SimulationState): void {
  for (const unit of state.units) {
    const command = unit.playerCommand;
    if (
      !command?.arrivalPosture
      || command.arrivalPostureApplied
      || command.status !== 'completed'
      || unit.order
    ) continue;

    if (!applyCompletedTacticalPositionOccupation(unit)) continue;
    unit.behaviorRuntime.lastEvent = 'tactical_position_posture_applied';
    unit.behaviorRuntime.reason = `Тактическая позиция занята: ${postureLabel(command.arrivalPosture)}; боец развернулся к выбранной угрозе.`;
    unit.playerCommand = markPlayerCommandArrivalPostureApplied(command);
  }
}

function postureLabel(posture: 'standing' | 'crouched' | 'prone'): string {
  if (posture === 'standing') return 'стоя';
  if (posture === 'crouched') return 'сидя';
  return 'лёжа';
}
