import { getGameEditorDrafts, syncLegacyEditorFields } from '../editor/GameEditorDrafts';
import { placeConfiguredEditorEntity } from '../editor/GameEditorPlacement';
import type { GridPosition } from '../geometry';
import { clampGridPositionToMap, type MapObject } from '../map/MapModel';
import {
  isPositionInsidePressureZone,
  normalizeDegrees,
  resolvePressureZoneSettings,
  type PressureZone,
} from '../pressure/PressureZone';
import { isInsideDirectionalThreat } from '../pressure/ThreatEvaluation';
import { selectUnit, type SimulationState } from '../simulation/SimulationState';
import { findUnitAtGridPosition } from '../units/UnitModel';
import {
  clearAiLabSelection,
  getAiLabRuntime,
  setAiLabStatus,
  setAiLabTool,
  type AiLabDragState,
  type AiLabThreatHandle,
} from './AiLabRuntime';

const HANDLE_HIT_RADIUS = 0.46;

export function beginAiLabPointerAction(state: SimulationState, rawGrid: GridPosition): boolean {
  const runtime = getAiLabRuntime(state);
  if (!runtime.open || state.editor.enabled) return false;

  const grid = clampGridPositionToMap(state.map, rawGrid);
  runtime.drag = null;

  if (runtime.tool === 'place_fighter' || runtime.tool === 'place_threat' || runtime.tool === 'place_cover') {
    placeWithLabTool(state, grid);
    if (!runtime.repeatPlacement) setAiLabTool(state, 'select');
    return true;
  }

  if (runtime.tool === 'delete') {
    deleteAtPosition(state, grid);
    return true;
  }

  const selectedZone = getSelectedZone(state);
  if (selectedZone) {
    const handle = findThreatHandleAtPosition(selectedZone, grid);
    if (handle) {
      runtime.drag = createThreatDrag(selectedZone, handle, grid);
      setAiLabStatus(state, handleStatus(handle));
      return true;
    }
  }

  const unit = findUnitAtGridPosition(state.units, grid, 0.52);
  if (unit) {
    selectUnit(state, unit.id);
    state.editor.selectedObjectId = null;
    state.editor.selectedZoneId = null;
    runtime.drag = {
      kind: 'unit',
      id: unit.id,
      handle: 'move',
      startGrid: grid,
      snapshot: { x: unit.position.x, y: unit.position.y },
    };
    setAiLabStatus(state, `Выбран боец: ${unit.labels.ru}. Его можно перетащить.`);
    return true;
  }

  const zone = findThreatAtPosition(state.pressureZones, grid);
  if (zone) {
    state.editor.selectedZoneId = zone.id;
    state.editor.selectedObjectId = null;
    runtime.drag = createThreatDrag(zone, 'move', grid);
    setAiLabStatus(state, `Выбрана угроза: ${zone.labels.ru}. Потяните источник или ручку.`);
    return true;
  }

  const object = findObjectAtPosition(state.map.objects, grid);
  if (object) {
    state.editor.selectedObjectId = object.id;
    state.editor.selectedZoneId = null;
    runtime.drag = {
      kind: 'object',
      id: object.id,
      handle: 'move',
      startGrid: grid,
      snapshot: { x: object.x, y: object.y },
    };
    setAiLabStatus(state, `Выбрано укрытие: ${object.labels?.ru ?? object.kind}. Его можно перетащить.`);
    return true;
  }

  clearAiLabSelection(state);
  setAiLabStatus(state, 'В этой точке ничего не выбрано.');
  return true;
}

export function updateAiLabPointerAction(state: SimulationState, rawGrid: GridPosition): boolean {
  const runtime = getAiLabRuntime(state);
  if (!runtime.open || state.editor.enabled) return false;

  const grid = clampGridPositionToMap(state.map, rawGrid);
  if (!runtime.drag) {
    const selectedZone = getSelectedZone(state);
    runtime.hoveredHandle = selectedZone ? findThreatHandleAtPosition(selectedZone, grid) : null;
    return true;
  }

  if (runtime.drag.kind === 'unit') {
    const unit = state.units.find((item) => item.id === runtime.drag?.id);
    if (!unit) return true;
    unit.position = clampGridPositionToMap(state.map, {
      x: runtime.drag.snapshot.x + grid.x - runtime.drag.startGrid.x,
      y: runtime.drag.snapshot.y + grid.y - runtime.drag.startGrid.y,
    });
    unit.order = null;
    unit.tacticalKnowledge.revision += 1;
    setAiLabStatus(state, `Боец перемещается: ${unit.labels.ru}.`);
    return true;
  }

  if (runtime.drag.kind === 'object') {
    const object = state.map.objects.find((item) => item.id === runtime.drag?.id);
    if (!object) return true;
    const center = clampGridPositionToMap(state.map, {
      x: runtime.drag.snapshot.x + object.widthCells / 2 + grid.x - runtime.drag.startGrid.x,
      y: runtime.drag.snapshot.y + object.heightCells / 2 + grid.y - runtime.drag.startGrid.y,
    });
    object.x = center.x - object.widthCells / 2;
    object.y = center.y - object.heightCells / 2;
    setAiLabStatus(state, `Укрытие перемещается: ${object.labels?.ru ?? object.kind}.`);
    return true;
  }

  const zone = state.pressureZones.find((item) => item.id === runtime.drag?.id);
  if (!zone) return true;
  updateThreatFromDrag(zone, runtime.drag, grid);
  syncThreatDraft(state, zone);
  setAiLabStatus(state, handleStatus(runtime.drag.handle as AiLabThreatHandle));
  return true;
}

export function finishAiLabPointerAction(state: SimulationState, rawGrid: GridPosition): boolean {
  const runtime = getAiLabRuntime(state);
  if (!runtime.open || state.editor.enabled) return false;
  if (runtime.drag) updateAiLabPointerAction(state, rawGrid);
  runtime.drag = null;
  return true;
}

export function cancelAiLabPointerAction(state: SimulationState): void {
  const runtime = getAiLabRuntime(state);
  runtime.drag = null;
  runtime.hoveredHandle = null;
  setAiLabTool(state, 'select');
  setAiLabStatus(state, 'Действие отменено. Инструмент: выбор.');
}

export function resolveAiLabCursor(state: SimulationState): string {
  const runtime = getAiLabRuntime(state);
  if (!runtime.open || state.editor.enabled) return 'crosshair';
  if (runtime.drag) return 'grabbing';
  if (runtime.hoveredHandle === 'direction' || runtime.hoveredHandle === 'rect_rotate') return 'alias';
  if (runtime.hoveredHandle === 'range' || runtime.hoveredHandle === 'radius' || runtime.hoveredHandle === 'min_range') return 'ew-resize';
  if (runtime.hoveredHandle === 'arc_left' || runtime.hoveredHandle === 'arc_right') return 'col-resize';
  if (runtime.tool === 'place_fighter') return 'copy';
  if (runtime.tool === 'place_threat') return 'crosshair';
  if (runtime.tool === 'place_cover') return 'cell';
  if (runtime.tool === 'delete') return 'not-allowed';
  return 'grab';
}

export function findThreatHandleAtPosition(zone: PressureZone, position: GridPosition): AiLabThreatHandle | null {
  const settings = resolvePressureZoneSettings(zone);
  const center = { x: zone.x, y: zone.y };
  const angle = degreesToRadians(settings.directionDegrees);

  if (settings.mode === 'directional_fire') {
    const direction = pointOnRay(center, angle, Math.max(1.5, Math.min(3, settings.rangeCells * 0.3)));
    const range = pointOnRay(center, angle, settings.rangeCells);
    const minRange = pointOnRay(center, angle, Math.max(0.45, settings.minRangeCells));
    const left = pointOnRay(center, angle - degreesToRadians(settings.arcDegrees / 2), settings.rangeCells * 0.72);
    const right = pointOnRay(center, angle + degreesToRadians(settings.arcDegrees / 2), settings.rangeCells * 0.72);

    if (near(position, direction)) return 'direction';
    if (near(position, range)) return 'range';
    if (settings.minRangeCells > 0.05 && near(position, minRange)) return 'min_range';
    if (near(position, left)) return 'arc_left';
    if (near(position, right)) return 'arc_right';
    if (near(position, center)) return 'move';
    return null;
  }

  if (zone.shape === 'circle') {
    const radius = { x: center.x + zone.radiusCells, y: center.y };
    if (near(position, radius)) return 'radius';
    if (near(position, center)) return 'move';
    return null;
  }

  const rotation = degreesToRadians(zone.rotationDegrees ?? 0);
  const width = localToWorld(center, zone.widthCells / 2, 0, rotation);
  const height = localToWorld(center, 0, zone.heightCells / 2, rotation);
  const rotate = localToWorld(center, 0, -zone.heightCells / 2 - 1, rotation);
  if (near(position, width)) return 'rect_width';
  if (near(position, height)) return 'rect_height';
  if (near(position, rotate)) return 'rect_rotate';
  if (near(position, center)) return 'move';
  return null;
}

function placeWithLabTool(state: SimulationState, grid: GridPosition): void {
  const runtime = getAiLabRuntime(state);
  const previousTool = state.editor.tool;
  const drafts = getGameEditorDrafts(state);

  if (runtime.tool === 'place_cover') {
    drafts.object.kind = 'cover';
    syncLegacyEditorFields(state);
    state.editor.tool = 'spawn_object';
  } else if (runtime.tool === 'place_fighter') {
    state.editor.tool = 'spawn_unit';
  } else {
    state.editor.tool = 'spawn_zone';
  }

  placeConfiguredEditorEntity(state, grid);
  state.editor.tool = previousTool;
  setAiLabStatus(state, runtime.tool === 'place_fighter'
    ? 'Боец размещён. Настройте его в панели справа.'
    : runtime.tool === 'place_cover'
      ? 'Укрытие размещено. Настройте силу и надёжность защиты.'
      : 'Угроза размещена. Потяните ручки прямо на карте.');
}

function deleteAtPosition(state: SimulationState, grid: GridPosition): void {
  const unit = findUnitAtGridPosition(state.units, grid, 0.55);
  if (unit) {
    state.units = state.units.filter((item) => item.id !== unit.id);
    if (state.selectedUnitId === unit.id) selectUnit(state, null);
    setAiLabStatus(state, `Удалён боец: ${unit.labels.ru}.`);
    return;
  }

  const zone = findThreatAtPosition(state.pressureZones, grid);
  if (zone) {
    state.pressureZones = state.pressureZones.filter((item) => item.id !== zone.id);
    if (state.editor.selectedZoneId === zone.id) state.editor.selectedZoneId = null;
    setAiLabStatus(state, `Удалена угроза: ${zone.labels.ru}.`);
    return;
  }

  const object = findObjectAtPosition(state.map.objects, grid);
  if (object) {
    state.map.objects = state.map.objects.filter((item) => item.id !== object.id);
    if (state.editor.selectedObjectId === object.id) state.editor.selectedObjectId = null;
    setAiLabStatus(state, `Удалено укрытие: ${object.labels?.ru ?? object.kind}.`);
    return;
  }

  setAiLabStatus(state, 'В этой точке нечего удалить.');
}

function createThreatDrag(zone: PressureZone, handle: AiLabThreatHandle, grid: GridPosition): AiLabDragState {
  const settings = resolvePressureZoneSettings(zone);
  return {
    kind: 'threat',
    id: zone.id,
    handle,
    startGrid: grid,
    snapshot: {
      x: zone.x,
      y: zone.y,
      radiusCells: zone.radiusCells,
      widthCells: zone.widthCells,
      heightCells: zone.heightCells,
      rotationDegrees: zone.rotationDegrees ?? 0,
      directionDegrees: settings.directionDegrees,
      arcDegrees: settings.arcDegrees,
      rangeCells: settings.rangeCells,
      minRangeCells: settings.minRangeCells,
    },
  };
}

function updateThreatFromDrag(zone: PressureZone, drag: AiLabDragState, grid: GridPosition): void {
  const center = { x: drag.snapshot.x, y: drag.snapshot.y };
  const dx = grid.x - center.x;
  const dy = grid.y - center.y;
  const distanceCells = Math.hypot(dx, dy);
  const bearing = normalizeDegrees(Math.atan2(dy, dx) * 180 / Math.PI);

  if (drag.handle === 'move') {
    zone.x = center.x + grid.x - drag.startGrid.x;
    zone.y = center.y + grid.y - drag.startGrid.y;
  } else if (drag.handle === 'direction') {
    zone.directionDegrees = bearing;
  } else if (drag.handle === 'range') {
    zone.rangeCells = clamp(distanceCells, Math.max(0.5, zone.minRangeCells ?? 0), 100);
  } else if (drag.handle === 'min_range') {
    zone.minRangeCells = clamp(distanceCells, 0, Math.max(0, (zone.rangeCells ?? 1) - 0.25));
  } else if (drag.handle === 'arc_left' || drag.handle === 'arc_right') {
    const direction = zone.directionDegrees ?? drag.snapshot.directionDegrees;
    zone.arcDegrees = clamp(angularDifference(bearing, direction) * 2, 2, 360);
  } else if (drag.handle === 'radius') {
    zone.radiusCells = clamp(distanceCells, 0.5, 60);
  } else if (drag.handle === 'rect_rotate') {
    zone.rotationDegrees = normalizeDegrees(bearing + 90);
  } else if (drag.handle === 'rect_width' || drag.handle === 'rect_height') {
    const rotation = -degreesToRadians(zone.rotationDegrees ?? 0);
    const localX = dx * Math.cos(rotation) - dy * Math.sin(rotation);
    const localY = dx * Math.sin(rotation) + dy * Math.cos(rotation);
    if (drag.handle === 'rect_width') zone.widthCells = clamp(Math.abs(localX) * 2, 0.5, 80);
    if (drag.handle === 'rect_height') zone.heightCells = clamp(Math.abs(localY) * 2, 0.5, 80);
  }
}

function syncThreatDraft(state: SimulationState, zone: PressureZone): void {
  const draft = getGameEditorDrafts(state).threat;
  const settings = resolvePressureZoneSettings(zone);
  Object.assign(draft, {
    shape: zone.shape,
    mode: settings.mode,
    radiusCells: zone.radiusCells,
    widthCells: zone.widthCells,
    heightCells: zone.heightCells,
    directionDegrees: settings.directionDegrees,
    arcDegrees: settings.arcDegrees,
    rangeCells: settings.rangeCells,
    minRangeCells: settings.minRangeCells,
  });
  syncLegacyEditorFields(state);
}

function getSelectedZone(state: SimulationState): PressureZone | undefined {
  return state.editor.selectedZoneId
    ? state.pressureZones.find((zone) => zone.id === state.editor.selectedZoneId)
    : undefined;
}

function findThreatAtPosition(zones: PressureZone[], position: GridPosition): PressureZone | undefined {
  for (let index = zones.length - 1; index >= 0; index -= 1) {
    const zone = zones[index];
    const settings = resolvePressureZoneSettings(zone);
    if (near(position, { x: zone.x, y: zone.y }, 0.75)) return zone;
    if (settings.mode === 'directional_fire' && isInsideDirectionalThreat(position, zone)) return zone;
    if (settings.mode === 'area' && isPositionInsidePressureZone(position, zone)) return zone;
  }
  return undefined;
}

function findObjectAtPosition(objects: MapObject[], position: GridPosition): MapObject | undefined {
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    if (isInsideObject(position, objects[index])) return objects[index];
  }
  return undefined;
}

function isInsideObject(position: GridPosition, object: MapObject): boolean {
  const center = { x: object.x + object.widthCells / 2, y: object.y + object.heightCells / 2 };
  const rotation = -object.rotationRadians;
  const dx = position.x - center.x;
  const dy = position.y - center.y;
  const localX = dx * Math.cos(rotation) - dy * Math.sin(rotation);
  const localY = dx * Math.sin(rotation) + dy * Math.cos(rotation);
  return Math.abs(localX) <= object.widthCells / 2 + 0.18 && Math.abs(localY) <= object.heightCells / 2 + 0.18;
}

function handleStatus(handle: AiLabThreatHandle): string {
  const labels: Record<AiLabThreatHandle, string> = {
    move: 'Перемещение источника угрозы.',
    direction: 'Поворот направления огня.',
    range: 'Изменение дальности угрозы.',
    arc_left: 'Изменение ширины сектора.',
    arc_right: 'Изменение ширины сектора.',
    min_range: 'Изменение ближней мёртвой зоны.',
    radius: 'Изменение радиуса круглой угрозы.',
    rect_width: 'Изменение ширины прямоугольной угрозы.',
    rect_height: 'Изменение длины прямоугольной угрозы.',
    rect_rotate: 'Поворот прямоугольной угрозы.',
  };
  return labels[handle];
}

function pointOnRay(center: GridPosition, angle: number, length: number): GridPosition {
  return { x: center.x + Math.cos(angle) * length, y: center.y + Math.sin(angle) * length };
}

function localToWorld(center: GridPosition, x: number, y: number, rotation: number): GridPosition {
  return {
    x: center.x + x * Math.cos(rotation) - y * Math.sin(rotation),
    y: center.y + x * Math.sin(rotation) + y * Math.cos(rotation),
  };
}

function near(left: GridPosition, right: GridPosition, radius = HANDLE_HIT_RADIUS): boolean {
  return Math.hypot(left.x - right.x, left.y - right.y) <= radius;
}

function angularDifference(left: number, right: number): number {
  const difference = Math.abs(normalizeDegrees(left) - normalizeDegrees(right));
  return Math.min(difference, 360 - difference);
}

function degreesToRadians(value: number): number {
  return value * Math.PI / 180;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
