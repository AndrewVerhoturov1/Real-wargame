import type { GridPosition } from '../geometry';
import type { MoveOrder } from '../orders/MoveOrder';

export type UnitSide = 'player';
export type UnitType = 'infantry_squad' | 'rifle_team' | 'support_team';

export interface UnitData {
  id: string;
  label?: string;
  type: UnitType;
  side: UnitSide;
  x: number;
  y: number;
  speedCellsPerSecond?: number;
}

export interface UnitModel {
  id: string;
  label: string;
  type: UnitType;
  side: UnitSide;
  position: GridPosition;
  speedCellsPerSecond: number;
  order: MoveOrder | null;
}

export function normalizeUnits(data: UnitData[]): UnitModel[] {
  return data.map((unit) => ({
    id: unit.id,
    label: unit.label ?? unit.id,
    type: unit.type,
    side: unit.side,
    position: {
      x: unit.x + 0.5,
      y: unit.y + 0.5,
    },
    speedCellsPerSecond: unit.speedCellsPerSecond ?? 2.2,
    order: null,
  }));
}

export function findUnitAtGridPosition(
  units: UnitModel[],
  gridPosition: GridPosition,
  radiusCells = 0.45,
): UnitModel | undefined {
  for (let index = units.length - 1; index >= 0; index -= 1) {
    const unit = units[index];
    const distance = Math.hypot(
      unit.position.x - gridPosition.x,
      unit.position.y - gridPosition.y,
    );

    if (distance <= radiusCells) {
      return unit;
    }
  }

  return undefined;
}
