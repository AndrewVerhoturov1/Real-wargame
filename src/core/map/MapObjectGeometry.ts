import type { GridPosition } from '../geometry';
import type { MapObject, TacticalMap } from './MapModel';

const MIN_OBJECT_SIZE_CELLS = 0.05;
const GEOMETRY_EPSILON = 1e-9;

export interface MapObjectBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface MapObjectAxes {
  xAxis: GridPosition;
  yAxis: GridPosition;
}

export interface MapObjectSegmentIntersection {
  entryT: number;
  exitT: number;
}

export function getMapObjectCenter(object: MapObject): GridPosition {
  return { x: object.x + 0.5, y: object.y + 0.5 };
}

export function getMapObjectAnchorFromCenter(center: GridPosition): GridPosition {
  return { x: center.x - 0.5, y: center.y - 0.5 };
}

export function getMapObjectSizeCells(object: MapObject): { width: number; height: number } {
  return {
    width: Math.max(MIN_OBJECT_SIZE_CELLS, object.widthCells),
    height: Math.max(MIN_OBJECT_SIZE_CELLS, object.heightCells),
  };
}

export function getMapObjectSizeMetres(
  map: TacticalMap,
  object: MapObject,
): { width: number; height: number } {
  const size = getMapObjectSizeCells(object);
  return {
    width: size.width * map.metersPerCell,
    height: size.height * map.metersPerCell,
  };
}

export function getMapObjectHalfExtentsCells(object: MapObject): { x: number; y: number } {
  const size = getMapObjectSizeCells(object);
  return { x: size.width / 2, y: size.height / 2 };
}

export function getMapObjectAxes(object: MapObject): MapObjectAxes {
  const cos = Math.cos(object.rotationRadians);
  const sin = Math.sin(object.rotationRadians);
  return {
    xAxis: { x: cos, y: sin },
    yAxis: { x: -sin, y: cos },
  };
}

export function getMapObjectBounds(object: MapObject): MapObjectBounds {
  const center = getMapObjectCenter(object);
  const half = getMapObjectHalfExtentsCells(object);
  const cos = Math.abs(Math.cos(object.rotationRadians));
  const sin = Math.abs(Math.sin(object.rotationRadians));
  const extentX = cos * half.x + sin * half.y;
  const extentY = sin * half.x + cos * half.y;
  return {
    minX: center.x - extentX,
    minY: center.y - extentY,
    maxX: center.x + extentX,
    maxY: center.y + extentY,
  };
}

export function mapObjectBoundsOverlap(left: MapObjectBounds, right: MapObjectBounds): boolean {
  return left.maxX >= right.minX
    && left.minX <= right.maxX
    && left.maxY >= right.minY
    && left.minY <= right.maxY;
}

export function gridPointToMapObjectLocal(object: MapObject, point: GridPosition): GridPosition {
  const center = getMapObjectCenter(object);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const cos = Math.cos(-object.rotationRadians);
  const sin = Math.sin(-object.rotationRadians);
  return {
    x: dx * cos - dy * sin,
    y: dx * sin + dy * cos,
  };
}

export function mapObjectLocalToGrid(object: MapObject, point: GridPosition): GridPosition {
  const center = getMapObjectCenter(object);
  const cos = Math.cos(object.rotationRadians);
  const sin = Math.sin(object.rotationRadians);
  return {
    x: center.x + point.x * cos - point.y * sin,
    y: center.y + point.x * sin + point.y * cos,
  };
}

export function isPointInsideMapObject(
  object: MapObject,
  point: GridPosition,
  paddingCells = 0,
): boolean {
  const local = gridPointToMapObjectLocal(object, point);
  const half = getMapObjectHalfExtentsCells(object);
  const padding = Math.max(0, paddingCells);
  return Math.abs(local.x) <= half.x + padding + GEOMETRY_EPSILON
    && Math.abs(local.y) <= half.y + padding + GEOMETRY_EPSILON;
}

export function circleIntersectsMapObject(
  object: MapObject,
  center: GridPosition,
  radiusCells: number,
): boolean {
  const local = gridPointToMapObjectLocal(object, center);
  const half = getMapObjectHalfExtentsCells(object);
  const nearestX = clamp(local.x, -half.x, half.x);
  const nearestY = clamp(local.y, -half.y, half.y);
  const dx = local.x - nearestX;
  const dy = local.y - nearestY;
  const radius = Math.max(0, radiusCells);
  return dx * dx + dy * dy <= radius * radius + GEOMETRY_EPSILON;
}

export function mapObjectIntersectsRect(object: MapObject, rect: MapObjectBounds): boolean {
  const normalizedRect = normalizeBounds(rect);
  if (!mapObjectBoundsOverlap(getMapObjectBounds(object), normalizedRect)) return false;

  const half = getMapObjectHalfExtentsCells(object);
  const objectCorners = [
    mapObjectLocalToGrid(object, { x: -half.x, y: -half.y }),
    mapObjectLocalToGrid(object, { x: half.x, y: -half.y }),
    mapObjectLocalToGrid(object, { x: half.x, y: half.y }),
    mapObjectLocalToGrid(object, { x: -half.x, y: half.y }),
  ];
  const rectCorners = [
    { x: normalizedRect.minX, y: normalizedRect.minY },
    { x: normalizedRect.maxX, y: normalizedRect.minY },
    { x: normalizedRect.maxX, y: normalizedRect.maxY },
    { x: normalizedRect.minX, y: normalizedRect.maxY },
  ];
  const axes = getMapObjectAxes(object);
  for (const axis of [{ x: 1, y: 0 }, { x: 0, y: 1 }, axes.xAxis, axes.yAxis]) {
    const objectProjection = projectPoints(objectCorners, axis);
    const rectProjection = projectPoints(rectCorners, axis);
    if (objectProjection.max <= rectProjection.min + GEOMETRY_EPSILON
      || rectProjection.max <= objectProjection.min + GEOMETRY_EPSILON) {
      return false;
    }
  }
  return true;
}

export function intersectSegmentWithMapObject(
  object: MapObject,
  start: GridPosition,
  end: GridPosition,
  paddingCells = 0,
): MapObjectSegmentIntersection | null {
  const localStart = gridPointToMapObjectLocal(object, start);
  const localEnd = gridPointToMapObjectLocal(object, end);
  const dx = localEnd.x - localStart.x;
  const dy = localEnd.y - localStart.y;
  const half = getMapObjectHalfExtentsCells(object);
  const padding = Math.max(0, paddingCells);
  let entryT = 0;
  let exitT = 1;

  for (const axis of [
    { origin: localStart.x, direction: dx, min: -half.x - padding, max: half.x + padding },
    { origin: localStart.y, direction: dy, min: -half.y - padding, max: half.y + padding },
  ]) {
    if (Math.abs(axis.direction) <= GEOMETRY_EPSILON) {
      if (axis.origin < axis.min || axis.origin > axis.max) return null;
      continue;
    }
    const first = (axis.min - axis.origin) / axis.direction;
    const second = (axis.max - axis.origin) / axis.direction;
    entryT = Math.max(entryT, Math.min(first, second));
    exitT = Math.min(exitT, Math.max(first, second));
    if (exitT < entryT) return null;
  }

  if (exitT < 0 || entryT > 1) return null;
  return {
    entryT: clamp(entryT, 0, 1),
    exitT: clamp(exitT, 0, 1),
  };
}

export function getMapObjectHeightMetres(object: MapObject): number {
  return Math.max(0.05, Number.isFinite(object.losHeightMeters) ? object.losHeightMeters ?? 1 : 1);
}

function normalizeBounds(bounds: MapObjectBounds): MapObjectBounds {
  return {
    minX: Math.min(bounds.minX, bounds.maxX),
    minY: Math.min(bounds.minY, bounds.maxY),
    maxX: Math.max(bounds.minX, bounds.maxX),
    maxY: Math.max(bounds.minY, bounds.maxY),
  };
}

function projectPoints(points: readonly GridPosition[], axis: GridPosition): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    const value = point.x * axis.x + point.y * axis.y;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { min, max };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
