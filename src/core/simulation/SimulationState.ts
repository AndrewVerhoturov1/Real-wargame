import type { GridPosition } from '../geometry';
import { clampGridPositionToMap, normalizeMap, type TacticalMap, type TacticalMapData } from '../map/MapModel';
import { createMoveOrder } from '../orders/MoveOrder';
import { normalizeUnits, type UnitData, type UnitModel } from '../units/UnitModel';

export interface SimulationState {
  map: TacticalMap;
  units: UnitModel[];
  selectedUnitId: string | null;
  mouseGridPosition: GridPosition | null;
}

export function createInitialState(mapData: TacticalMapData, unitsData: UnitData[]): SimulationState {
  return {
    map: normalizeMap(mapData),
    units: normalizeUnits(unitsData),
    selectedUnitId: null,
    mouseGridPosition: null,
  };
}

export function getSelectedUnit(state: SimulationState): UnitModel | undefined {
  if (state.selectedUnitId === null) {
    return undefined;
  }

  return state.units.find((unit) => unit.id === state.selectedUnitId);
}

export function selectUnit(state: SimulationState, unitId: string | null): void {
  state.selectedUnitId = unitId;
}

export function setMouseGridPosition(state: SimulationState, position: GridPosition | null): void {
  state.mouseGridPosition = position;
}

export function issueMoveOrderToSelectedUnit(
  state: SimulationState,
  rawTarget: GridPosition,
): void {
  const selectedUnit = getSelectedUnit(state);

  if (!selectedUnit) {
    return;
  }

  const target = clampGridPositionToMap(state.map, rawTarget);
  selectedUnit.order = createMoveOrder(target);
  setUnitDirection(selectedUnit, target);
}

function setUnitDirection(unit: UnitModel, target: GridPosition): void {
  const dx = target.x - unit.position.x;
  const dy = target.y - unit.position.y;

  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return;
  }

  unit.facingRadians = Math.atan2(dy, dx);
}
