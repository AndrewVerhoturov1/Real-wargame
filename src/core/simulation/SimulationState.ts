import type { GridPosition } from '../geometry';
import {
  clampGridPositionToMap,
  normalizeMap,
  type MapObject,
  type MapObjectKind,
  type TacticalMap,
  type TacticalMapData,
} from '../map/MapModel';
import { createMoveOrder } from '../orders/MoveOrder';
import {
  getPressureReportAtPosition,
  normalizePressureZones,
  type PressureZone,
  type PressureZoneData,
} from '../pressure/PressureZone';
import { findUnitAtGridPosition, normalizeUnits, type UnitData, type UnitModel, type UnitType } from '../units/UnitModel';

export interface SelectionBox {
  start: GridPosition;
  current: GridPosition;
}

export type EditorTool = 'select' | 'move' | 'spawn_object' | 'spawn_unit' | 'delete';

export interface EditorLayers {
  objects: boolean;
  units: boolean;
  pressureZones: boolean;
}

export interface EditorState {
  enabled: boolean;
  panelOpen: boolean;
  tool: EditorTool;
  objectKind: MapObjectKind;
  unitType: UnitType;
  objectWidthCells: number;
  objectHeightCells: number;
  objectRotationDegrees: number;
  selectedObjectId: string | null;
  layers: EditorLayers;
  nextObjectIndex: number;
  nextUnitIndex: number;
  lastMessage: string;
}

export interface SimulationState {
  map: TacticalMap;
  units: UnitModel[];
  pressureZones: PressureZone[];
  selectedUnitId: string | null;
  selectedUnitIds: string[];
  mouseGridPosition: GridPosition | null;
  selectionBox: SelectionBox | null;
  editor: EditorState;
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
    editor: {
      enabled: false,
      panelOpen: false,
      tool: 'select',
      objectKind: 'tree',
      unitType: 'infantry_squad',
      objectWidthCells: 1,
      objectHeightCells: 1,
      objectRotationDegrees: 0,
      selectedObjectId: null,
      layers: {
        objects: true,
        units: true,
        pressureZones: true,
      },
      nextObjectIndex: 1,
      nextUnitIndex: 1,
      lastMessage: 'Редактор выключен.',
    },
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

export function getSelectedMapObject(state: SimulationState): MapObject | undefined {
  if (state.editor.selectedObjectId === null) {
    return undefined;
  }

  return state.map.objects.find((object) => object.id === state.editor.selectedObjectId);
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

export function handleEditorClick(state: SimulationState, rawGrid: GridPosition): void {
  const grid = clampGridPositionToMap(state.map, rawGrid);

  if (!state.editor.enabled) {
    return;
  }

  if (state.editor.tool === 'select' && state.editor.layers.objects && tryObjectHandleClick(state, grid)) {
    return;
  }

  switch (state.editor.tool) {
    case 'spawn_object':
      spawnEditorObject(state, grid);
      return;
    case 'spawn_unit':
      spawnEditorUnit(state, grid);
      return;
    case 'delete':
      deleteEditorTargetAt(state, grid);
      return;
    case 'move':
      moveSelectedEditorTarget(state, grid);
      return;
    case 'select':
    default:
      selectEditorTargetAt(state, grid);
      return;
  }
}

export function updateSelectedEditorObject(state: SimulationState, changes: Partial<Pick<MapObject, 'widthCells' | 'heightCells' | 'rotationRadians'>>): void {
  const object = getSelectedMapObject(state);

  if (!object) {
    state.editor.lastMessage = 'Предмет не выбран.';
    return;
  }

  Object.assign(object, changes);
  state.editor.lastMessage = `Предмет изменён: ${object.id}`;
}

export function nudgeSelectedEditorObject(state: SimulationState, dx: number, dy: number): void {
  const object = getSelectedMapObject(state);

  if (!object) {
    state.editor.lastMessage = 'Предмет не выбран.';
    return;
  }

  const center = clampGridPositionToMap(state.map, {
    x: object.x + 0.5 + dx,
    y: object.y + 0.5 + dy,
  });
  object.x = center.x - 0.5;
  object.y = center.y - 0.5;
  state.editor.lastMessage = `Предмет сдвинут: ${object.id}`;
}

export function resizeSelectedEditorObject(state: SimulationState, widthDelta: number, heightDelta: number): void {
  const object = getSelectedMapObject(state);

  if (!object) {
    state.editor.lastMessage = 'Предмет не выбран.';
    return;
  }

  object.widthCells = clampNumber(object.widthCells + widthDelta, 0.1, 20);
  object.heightCells = clampNumber(object.heightCells + heightDelta, 0.1, 20);
  state.editor.objectWidthCells = object.widthCells;
  state.editor.objectHeightCells = object.heightCells;
  state.editor.lastMessage = `Размер изменён: ${object.id}`;
}

export function rotateSelectedEditorObject(state: SimulationState, degreesDelta: number): void {
  const object = getSelectedMapObject(state);

  if (!object) {
    state.editor.lastMessage = 'Предмет не выбран.';
    return;
  }

  object.rotationRadians += degreesToRadians(degreesDelta);
  state.editor.objectRotationDegrees = Math.round(radiansToDegrees(object.rotationRadians));
  state.editor.lastMessage = `Поворот изменён: ${object.id}`;
}

export function deleteSelectedEditorTargets(state: SimulationState): void {
  if (state.editor.selectedObjectId) {
    const objectId = state.editor.selectedObjectId;
    state.map.objects = state.map.objects.filter((object) => object.id !== objectId);
    state.editor.selectedObjectId = null;
    state.editor.lastMessage = `Предмет удалён: ${objectId}`;
    return;
  }

  if (state.selectedUnitId) {
    const unitId = state.selectedUnitId;
    state.units = state.units.filter((unit) => unit.id !== unitId);
    selectUnit(state, null);
    state.editor.lastMessage = `Юнит удалён: ${unitId}`;
    return;
  }

  state.editor.lastMessage = 'Нечего удалять.';
}

export function clearEditorScene(state: SimulationState): void {
  state.map.objects = [];
  state.units = [];
  state.editor.selectedObjectId = null;
  selectUnit(state, null);
  state.editor.lastMessage = 'Все предметы и юниты очищены.';
}

function spawnEditorObject(state: SimulationState, grid: GridPosition): void {
  if (!state.editor.layers.objects) {
    state.editor.lastMessage = 'Слой предметов скрыт. Включи слой, чтобы создавать предметы.';
    return;
  }

  const index = state.editor.nextObjectIndex;
  const id = `editor_object_${index}`;

  state.map.objects.push({
    id,
    kind: state.editor.objectKind,
    x: grid.x - 0.5,
    y: grid.y - 0.5,
    rotationRadians: degreesToRadians(state.editor.objectRotationDegrees),
    widthCells: state.editor.objectWidthCells,
    heightCells: state.editor.objectHeightCells,
    labels: {
      en: id,
      ru: `Предмет ${index}`,
    },
  });

  state.editor.nextObjectIndex = index + 1;
  state.editor.selectedObjectId = id;
  selectUnit(state, null);
  state.editor.lastMessage = `Создан предмет: ${id}`;
}

function spawnEditorUnit(state: SimulationState, grid: GridPosition): void {
  if (!state.editor.layers.units) {
    state.editor.lastMessage = 'Слой юнитов скрыт. Включи слой, чтобы создавать юнитов.';
    return;
  }

  const index = state.editor.nextUnitIndex;
  const id = `editor_unit_${index}`;
  const [unit] = normalizeUnits([
    {
      id,
      label: id,
      labelRu: `Юнит ${index}`,
      type: state.editor.unitType,
      side: 'player',
      x: Math.max(0, Math.floor(grid.x)),
      y: Math.max(0, Math.floor(grid.y)),
      behaviorProfile: 'regular',
    },
  ]);

  unit.position = grid;
  state.units.push(unit);
  state.editor.nextUnitIndex = index + 1;
  state.editor.selectedObjectId = null;
  selectUnit(state, id);
  state.editor.lastMessage = `Создан юнит: ${id}`;
}

function selectEditorTargetAt(state: SimulationState, grid: GridPosition): void {
  if (state.editor.layers.objects) {
    const object = findMapObjectAtGridPosition(state, grid);

    if (object) {
      state.editor.selectedObjectId = object.id;
      state.editor.objectWidthCells = object.widthCells;
      state.editor.objectHeightCells = object.heightCells;
      state.editor.objectRotationDegrees = Math.round(radiansToDegrees(object.rotationRadians));
      selectUnit(state, null);
      state.editor.lastMessage = `Выбран предмет: ${object.id}`;
      return;
    }
  }

  if (state.editor.layers.units) {
    const unit = findUnitAtGridPosition(state.units, grid);
    state.editor.selectedObjectId = null;
    selectUnit(state, unit?.id ?? null);
    state.editor.lastMessage = unit ? `Выбран юнит: ${unit.id}` : 'Ничего не выбрано.';
    return;
  }

  state.editor.selectedObjectId = null;
  selectUnit(state, null);
  state.editor.lastMessage = 'Ничего не выбрано: слои предметов и юнитов скрыты.';
}

function deleteEditorTargetAt(state: SimulationState, grid: GridPosition): void {
  if (state.editor.layers.objects) {
    const object = findMapObjectAtGridPosition(state, grid);

    if (object) {
      state.map.objects = state.map.objects.filter((item) => item.id !== object.id);
      state.editor.selectedObjectId = null;
      state.editor.lastMessage = `Предмет удалён: ${object.id}`;
      return;
    }
  }

  if (state.editor.layers.units) {
    const unit = findUnitAtGridPosition(state.units, grid);

    if (unit) {
      state.units = state.units.filter((item) => item.id !== unit.id);
      selectUnit(state, null);
      state.editor.lastMessage = `Юнит удалён: ${unit.id}`;
      return;
    }
  }

  state.editor.lastMessage = 'В точке нечего удалить.';
}

function moveSelectedEditorTarget(state: SimulationState, grid: GridPosition): void {
  const object = getSelectedMapObject(state);

  if (object) {
    object.x = grid.x - 0.5;
    object.y = grid.y - 0.5;
    state.editor.lastMessage = `Предмет перемещён: ${object.id}`;
    return;
  }

  const unit = getSelectedUnit(state);

  if (unit) {
    unit.position = grid;
    unit.order = null;
    state.editor.lastMessage = `Юнит перемещён: ${unit.id}`;
    return;
  }

  state.editor.lastMessage = 'Нечего перемещать: выбери предмет или юнит.';
}

function tryObjectHandleClick(state: SimulationState, grid: GridPosition): boolean {
  const object = getSelectedMapObject(state);

  if (!object) {
    return false;
  }

  const center = { x: object.x + 0.5, y: object.y + 0.5 };
  const dx = grid.x - center.x;
  const dy = grid.y - center.y;
  const cos = Math.cos(-object.rotationRadians);
  const sin = Math.sin(-object.rotationRadians);
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;
  const halfWidth = object.widthCells / 2;
  const halfHeight = object.heightCells / 2;
  const hitRadius = 0.35;

  if (Math.hypot(localX, localY + halfHeight + 0.7) <= hitRadius) {
    rotateSelectedEditorObject(state, 15);
    return true;
  }

  const onRight = Math.abs(localX - halfWidth) <= hitRadius && Math.abs(localY) <= halfHeight + hitRadius;
  const onLeft = Math.abs(localX + halfWidth) <= hitRadius && Math.abs(localY) <= halfHeight + hitRadius;
  const onBottom = Math.abs(localY - halfHeight) <= hitRadius && Math.abs(localX) <= halfWidth + hitRadius;
  const onTop = Math.abs(localY + halfHeight) <= hitRadius && Math.abs(localX) <= halfWidth + hitRadius;

  if (onRight || onLeft || onBottom || onTop) {
    resizeSelectedEditorObject(state, onRight || onLeft ? 0.5 : 0, onTop || onBottom ? 0.5 : 0);
    return true;
  }

  return false;
}

function findMapObjectAtGridPosition(state: SimulationState, grid: GridPosition): MapObject | undefined {
  for (let index = state.map.objects.length - 1; index >= 0; index -= 1) {
    const object = state.map.objects[index];
    const center = { x: object.x + 0.5, y: object.y + 0.5 };
    const dx = grid.x - center.x;
    const dy = grid.y - center.y;
    const cos = Math.cos(-object.rotationRadians);
    const sin = Math.sin(-object.rotationRadians);
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;

    if (Math.abs(localX) <= object.widthCells / 2 && Math.abs(localY) <= object.heightCells / 2) {
      return object;
    }
  }

  return undefined;
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

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}
