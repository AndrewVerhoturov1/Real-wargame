import type { GridPosition } from '../geometry';
import { clampGridPositionToMap, normalizeMap, type TacticalMap, type TacticalMapData } from '../map/MapModel';
import { createMoveOrder } from '../orders/MoveOrder';
import {
  getPressureReportAtPosition,
  normalizePressureZones,
  type PressureZone,
  type PressureZoneData,
} from '../pressure/PressureZone';
import { normalizeUnits, type UnitData, type UnitModel } from '../units/UnitModel';

export interface SelectionBox {
  start: GridPosition;
  current: GridPosition;
}

export interface SimulationState {
  map: TacticalMap;
  units: UnitModel[];
  pressureZones: PressureZone[];
  selectedUnitId: string | null;
  selectedUnitIds: string[];
  mouseGridPosition: GridPosition | null;
  selectionBox: SelectionBox | null;
}

export function createInitialState(
  mapData: TacticalMapData,
  unitsData: UnitData[],
  pressureZoneData: PressureZoneData[] = [],
): SimulationState {
  return {
    map: normalizeMap(mapData),
    units: normalizeUnits(unitsData),
    pressureZones: normalizePressureZones(pressureZoneData),
    selectedUnitId: null,
    selectedUnitIds: [],
    mouseGridPosition: null,
    selectionBox: null,
  };
}

export function getSelectedUnit(state: SimulationState): UnitModel | undefined {
  if (state.selectedUnitId === null) {
    return undefined;
  }

  return state.units.find((unit) => unit.id === state.selectedUnitId);
}

export function getSelectedUnits(state: SimulationState): UnitModel[] {
  const selectedIds = new Set(state.selectedUnitIds);
  return state.units.filter((unit) => selectedIds.has(unit.id));
}

export function selectUnit(state: SimulationState, unitId: string | null): void {
  state.selectedUnitId = unitId;
  state.selectedUnitIds = unitId ? [unitId] : [];
}

export function selectUnits(state: SimulationState, unitIds: string[]): void {
  const uniqueIds = [...new Set(unitIds)];
  state.selectedUnitIds = uniqueIds;
  state.selectedUnitId = uniqueIds[0] ?? null;
}

export function selectUnitsInBox(state: SimulationState, box: SelectionBox): void {
  selectUnits(
    state,
    state.units
      .filter((unit) => isInsideBox(unit.position, box))
      .map((unit) => unit.id),
  );
}

export function setMouseGridPosition(state: SimulationState, position: GridPosition | null): void {
  state.mouseGridPosition = position;
}

export function startSelectionBox(state: SimulationState, start: GridPosition): void {
  state.selectionBox = { start, current: start };
}

export function updateSelectionBox(state: SimulationState, current: GridPosition): void {
  if (state.selectionBox) {
    state.selectionBox = { start: state.selectionBox.start, current };
  }
}

export function clearSelectionBox(state: SimulationState): void {
  state.selectionBox = null;
}

export function issueMoveOrderToSelectedUnit(
  state: SimulationState,
  rawTarget: GridPosition,
): void {
  const selectedUnits = getSelectedUnits(state);

  if (selectedUnits.length === 0) {
    return;
  }

  const target = clampGridPositionToMap(state.map, rawTarget);
  const center = getSelectionCenter(selectedUnits);

  for (const unit of selectedUnits) {
    const unitTarget = selectedUnits.length === 1
      ? target
      : clampGridPositionToMap(state.map, {
          x: target.x + unit.position.x - center.x,
          y: target.y + unit.position.y - center.y,
        });

    unit.order = createMoveOrder(unitTarget);
    unit.behaviorRuntime.lastEvent = 'move_order_received';
    unit.behaviorRuntime.reason = 'Move order received.';
    applyPressurePreview(state, unit, unitTarget);
    setUnitDirection(unit, unitTarget);
  }
}

function applyPressurePreview(state: SimulationState, unit: UnitModel, target: GridPosition): void {
  const report = getPressureReportAtPosition(target, state.pressureZones);
  unit.behaviorRuntime.state = 'moving';
  unit.behaviorRuntime.posture = 'standing';
  unit.behaviorRuntime.currentAction = 'move';

  if (!report) {
    unit.behaviorRuntime.danger = 0;
    unit.behaviorRuntime.reason = 'move_target_clear';
    return;
  }

  unit.behaviorRuntime.rawDanger = report.rawPressure;
  unit.behaviorRuntime.danger = Math.round(report.rawPressure);
  unit.behaviorRuntime.reason = `move_target_pressure:${report.zone.id}`;
}

function getSelectionCenter(units: UnitModel[]): GridPosition {
  const total = units.reduce(
    (sum, unit) => ({
      x: sum.x + unit.position.x,
      y: sum.y + unit.position.y,
    }),
    { x: 0, y: 0 },
  );

  return {
    x: total.x / units.length,
    y: total.y / units.length,
  };
}

function isInsideBox(position: GridPosition, box: SelectionBox): boolean {
  const minX = Math.min(box.start.x, box.current.x);
  const maxX = Math.max(box.start.x, box.current.x);
  const minY = Math.min(box.start.y, box.current.y);
  const maxY = Math.max(box.start.y, box.current.y);

  return position.x >= minX && position.x <= maxX && position.y >= minY && position.y <= maxY;
}

function setUnitDirection(unit: UnitModel, target: GridPosition): void {
  const dx = target.x - unit.position.x;
  const dy = target.y - unit.position.y;

  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return;
  }

  unit.facingRadians = Math.atan2(dy, dx);
}
