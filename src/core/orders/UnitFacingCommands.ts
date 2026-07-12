import type { GridPosition } from '../geometry';
import { normalizeRadians } from '../perception/AttentionModel';
import { updateAttentionController } from '../perception/AttentionController';
import type { SimulationState } from '../simulation/SimulationState';

export function facingRadiansFromPoints(origin: GridPosition, target: GridPosition): number | null {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  if (Math.hypot(dx, dy) < 0.001) return null;
  return normalizeRadians(Math.atan2(dy, dx));
}

export function faceSelectedUnitsToward(state: SimulationState, target: GridPosition): boolean {
  const selectedIds = new Set(state.selectedUnitIds);
  let changed = false;
  for (const unit of state.units) {
    if (!selectedIds.has(unit.id)) continue;
    const facing = facingRadiansFromPoints(unit.position, target);
    if (facing === null) continue;
    unit.facingRadians = facing;
    if (unit.attentionRuntime.mode === 'search') unit.attentionRuntime.searchCenterRadians = facing;
    updateAttentionController(unit, 0);
    unit.behaviorRuntime.lastEvent = 'manual_facing_changed';
    unit.behaviorRuntime.reason = 'Игрок задал направление взгляда.';
    changed = true;
  }
  return changed;
}
