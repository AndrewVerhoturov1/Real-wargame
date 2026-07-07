import type { GridPosition } from '../geometry';
import { clampGridPositionToMap, gridToCellCenter, normalizeMap, type TacticalMap, type TacticalMapData } from '../map/MapModel';
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

  const target = clampGridPositionToMap(state.map, gridToCellCenter(state.map, rawTarget));
  selectedUnit.order = createMoveOrder(target);
}
