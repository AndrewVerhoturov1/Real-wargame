import { distance, moveToward } from '../geometry';
import type { SimulationState } from './SimulationState';

const ORDER_COMPLETION_EPSILON_CELLS = 0.02;

export function tickSimulation(state: SimulationState, deltaSeconds: number): void {
  for (const unit of state.units) {
    if (!unit.order) {
      continue;
    }

    const remainingDistance = distance(unit.position, unit.order.target);
    const stepDistance = unit.speedCellsPerSecond * deltaSeconds;

    unit.position = moveToward(unit.position, unit.order.target, stepDistance);

    if (remainingDistance <= stepDistance + ORDER_COMPLETION_EPSILON_CELLS) {
      unit.position = { ...unit.order.target };
      unit.order = null;
    }
  }
}
