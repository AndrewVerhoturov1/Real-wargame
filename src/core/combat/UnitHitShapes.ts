import { sampleSmoothHeightLevel } from '../terrain/SmoothTerrain';
import type { TacticalMap } from '../map/MapModel';
import type { UnitModel } from '../units/UnitModel';

const ELEVATION_STEP_METRES = 2;
const INTERSECTION_EPSILON = 1e-9;
const NORMAL_EPSILON = 1e-7;

export type HitZone = 'head' | 'torso' | 'arms' | 'legs';

export interface BallisticPoint3 {
  xMetres: number;
  yMetres: number;
  zMetres: number;
}

export interface BallisticDirection3 {
  x: number;
  y: number;
  z: number;
}

export interface UnitHitShape {
  readonly shapeId: string;
  readonly zone: HitZone;
  readonly centerXMetres: number;
  readonly centerYMetres: number;
  readonly radiusMetres: number;
  readonly bottomZMetres: number;
  readonly topZMetres: number;
}

export interface UnitHitIntersection {
  readonly entryDistanceMetres: number;
  readonly exitDistanceMetres: number;
  readonly pathLengthMetres: number;
  readonly zone: HitZone;
  readonly shapeId: string;
  readonly entryPoint: BallisticPoint3;
  readonly exitPoint: BallisticPoint3;
  readonly entryNormal: BallisticDirection3;
  /** Compatibility alias for the old nearest-entry contract. */
  readonly distanceMetres: number;
  /** Compatibility alias for the old nearest-entry contract. */
  readonly point: BallisticPoint3;
}

export function getUnitHitShapes(unit: UnitModel, map: TacticalMap): UnitHitShape[] {
  const x = unit.position.x * map.metersPerCell;
  const y = unit.position.y * map.metersPerCell;
  const ground = sampleSmoothHeightLevel(map, unit.position.x, unit.position.y) * ELEVATION_STEP_METRES;
  const forwardX = Math.cos(unit.facingRadians);
  const forwardY = Math.sin(unit.facingRadians);
  const lateralX = -forwardY;
  const lateralY = forwardX;
  const posture = unit.behaviorRuntime.posture;
  const shape = (
    shapeId: string,
    zone: HitZone,
    forwardOffset: number,
    lateralOffset: number,
    radiusMetres: number,
    bottom: number,
    top: number,
  ): UnitHitShape => ({
    shapeId: `${posture}:${shapeId}`,
    zone,
    centerXMetres: x + forwardX * forwardOffset + lateralX * lateralOffset,
    centerYMetres: y + forwardY * forwardOffset + lateralY * lateralOffset,
    radiusMetres,
    bottomZMetres: ground + bottom,
    topZMetres: ground + top,
  });

  if (posture === 'prone') {
    return [
      shape('head', 'head', 0.68, 0, 0.17, 0.14, 0.42),
      shape('torso:chest', 'torso', 0.24, 0, 0.27, 0.10, 0.42),
      shape('torso:pelvis', 'torso', -0.12, 0, 0.24, 0.08, 0.36),
      shape('arms:left', 'arms', 0.28, 0.28, 0.13, 0.08, 0.34),
      shape('arms:right', 'arms', 0.28, -0.28, 0.13, 0.08, 0.34),
      shape('legs:left', 'legs', -0.55, 0.12, 0.13, 0.06, 0.30),
      shape('legs:right', 'legs', -0.55, -0.12, 0.13, 0.06, 0.30),
    ];
  }
  if (posture === 'crouched') {
    return [
      shape('head', 'head', 0.10, 0, 0.16, 0.86, 1.22),
      shape('torso', 'torso', 0, 0, 0.27, 0.43, 1.03),
      shape('arms:left', 'arms', 0.02, 0.28, 0.12, 0.48, 1.02),
      shape('arms:right', 'arms', 0.02, -0.28, 0.12, 0.48, 1.02),
      shape('legs:left', 'legs', -0.10, 0.13, 0.14, 0.08, 0.60),
      shape('legs:right', 'legs', -0.10, -0.13, 0.14, 0.08, 0.60),
    ];
  }
  return [
    shape('head', 'head', 0.10, 0, 0.16, 1.43, 1.78),
    shape('torso', 'torso', 0, 0, 0.28, 0.74, 1.48),
    shape('arms:left', 'arms', 0, 0.31, 0.12, 0.72, 1.45),
    shape('arms:right', 'arms', 0, -0.31, 0.12, 0.72, 1.45),
    shape('legs:left', 'legs', -0.06, 0.13, 0.14, 0.08, 0.86),
    shape('legs:right', 'legs', -0.06, -0.13, 0.14, 0.08, 0.86),
  ];
}

export function intersectRayWithUnitHitShapes(
  origin: BallisticPoint3,
  direction: BallisticDirection3,
  maximumDistanceMetres: number,
  unit: UnitModel,
  map: TacticalMap,
): UnitHitIntersection | null {
  return intersectRayWithUnitHitShapeList(origin, direction, maximumDistanceMetres, getUnitHitShapes(unit, map));
}

export function intersectRayWithUnitHitShapeList(
  origin: BallisticPoint3,
  direction: BallisticDirection3,
  maximumDistanceMetres: number,
  shapes: readonly UnitHitShape[],
): UnitHitIntersection | null {
  const normalized = normalizeDirection(direction);
  const maximum = finiteNonNegative(maximumDistanceMetres);
  let nearest: UnitHitIntersection | null = null;
  for (const shape of shapes) {
    const candidate = intersectVerticalCylinder(origin, normalized, maximum, shape);
    if (!candidate) continue;
    if (!nearest || compareIntersections(candidate, nearest) < 0) nearest = candidate;
  }
  return nearest;
}

function intersectVerticalCylinder(
  origin: BallisticPoint3,
  direction: BallisticDirection3,
  maximumDistanceMetres: number,
  shape: UnitHitShape,
): UnitHitIntersection | null {
  if (!validShape(shape) || maximumDistanceMetres < 0) return null;
  const ox = origin.xMetres - shape.centerXMetres;
  const oy = origin.yMetres - shape.centerYMetres;
  const a = direction.x * direction.x + direction.y * direction.y;
  let radialEnter = Number.NEGATIVE_INFINITY;
  let radialExit = Number.POSITIVE_INFINITY;
  if (a <= INTERSECTION_EPSILON) {
    if (ox * ox + oy * oy > shape.radiusMetres * shape.radiusMetres + INTERSECTION_EPSILON) return null;
  } else {
    const b = 2 * (ox * direction.x + oy * direction.y);
    const c = ox * ox + oy * oy - shape.radiusMetres * shape.radiusMetres;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < -INTERSECTION_EPSILON) return null;
    const root = Math.sqrt(Math.max(0, discriminant));
    radialEnter = (-b - root) / (2 * a);
    radialExit = (-b + root) / (2 * a);
  }

  let verticalEnter = Number.NEGATIVE_INFINITY;
  let verticalExit = Number.POSITIVE_INFINITY;
  if (Math.abs(direction.z) <= INTERSECTION_EPSILON) {
    if (origin.zMetres < shape.bottomZMetres - INTERSECTION_EPSILON || origin.zMetres > shape.topZMetres + INTERSECTION_EPSILON) return null;
  } else {
    const first = (shape.bottomZMetres - origin.zMetres) / direction.z;
    const second = (shape.topZMetres - origin.zMetres) / direction.z;
    verticalEnter = Math.min(first, second);
    verticalExit = Math.max(first, second);
  }

  const rawEntry = Math.max(radialEnter, verticalEnter);
  const rawExit = Math.min(radialExit, verticalExit);
  const entry = Math.max(0, rawEntry);
  const exit = Math.max(entry, rawExit);
  if (!Number.isFinite(entry) || !Number.isFinite(exit) || entry > maximumDistanceMetres + INTERSECTION_EPSILON || exit + INTERSECTION_EPSILON < entry) return null;
  const safeEntry = canonicalDistance(entry);
  const safeExit = canonicalDistance(Math.max(entry, exit));
  const entryPoint = pointAlongRay(origin, direction, safeEntry);
  const exitPoint = pointAlongRay(origin, direction, safeExit);
  const normalPoint = rawEntry >= -INTERSECTION_EPSILON ? entryPoint : exitPoint;
  const entryNormal = outwardCylinderNormal(normalPoint, shape, direction);
  return {
    entryDistanceMetres: safeEntry,
    exitDistanceMetres: safeExit,
    pathLengthMetres: canonicalDistance(Math.max(0, safeExit - safeEntry)),
    zone: shape.zone,
    shapeId: shape.shapeId,
    entryPoint,
    exitPoint,
    entryNormal,
    distanceMetres: safeEntry,
    point: entryPoint,
  };
}

function outwardCylinderNormal(
  point: BallisticPoint3,
  shape: UnitHitShape,
  direction: BallisticDirection3,
): BallisticDirection3 {
  const bottomDistance = Math.abs(point.zMetres - shape.bottomZMetres);
  const topDistance = Math.abs(point.zMetres - shape.topZMetres);
  const radialX = point.xMetres - shape.centerXMetres;
  const radialY = point.yMetres - shape.centerYMetres;
  const radialLength = Math.hypot(radialX, radialY);
  const sideDistance = Math.abs(radialLength - shape.radiusMetres);
  if (bottomDistance <= sideDistance + NORMAL_EPSILON && bottomDistance <= topDistance + NORMAL_EPSILON) return { x: 0, y: 0, z: -1 };
  if (topDistance <= sideDistance + NORMAL_EPSILON) return { x: 0, y: 0, z: 1 };
  if (radialLength > NORMAL_EPSILON) return { x: radialX / radialLength, y: radialY / radialLength, z: 0 };
  return normalizeDirection({ x: -direction.x, y: -direction.y, z: -direction.z });
}

function compareIntersections(left: UnitHitIntersection, right: UnitHitIntersection): number {
  const distance = left.entryDistanceMetres - right.entryDistanceMetres;
  if (Math.abs(distance) > INTERSECTION_EPSILON) return distance;
  const zone = hitZoneOrder(left.zone) - hitZoneOrder(right.zone);
  return zone || compareText(left.shapeId, right.shapeId);
}

function hitZoneOrder(zone: HitZone): number {
  return zone === 'head' ? 0 : zone === 'torso' ? 1 : zone === 'arms' ? 2 : 3;
}

function validShape(shape: UnitHitShape): boolean {
  return Boolean(shape.shapeId)
    && Number.isFinite(shape.centerXMetres)
    && Number.isFinite(shape.centerYMetres)
    && Number.isFinite(shape.radiusMetres)
    && shape.radiusMetres > 0
    && Number.isFinite(shape.bottomZMetres)
    && Number.isFinite(shape.topZMetres)
    && shape.topZMetres >= shape.bottomZMetres;
}

export function normalizeDirection(direction: BallisticDirection3): BallisticDirection3 {
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (!Number.isFinite(length) || length <= INTERSECTION_EPSILON) return { x: 1, y: 0, z: 0 };
  return { x: direction.x / length, y: direction.y / length, z: direction.z / length };
}

export function pointAlongRay(
  origin: BallisticPoint3,
  direction: BallisticDirection3,
  distanceMetres: number,
): BallisticPoint3 {
  return {
    xMetres: origin.xMetres + direction.x * distanceMetres,
    yMetres: origin.yMetres + direction.y * distanceMetres,
    zMetres: origin.zMetres + direction.z * distanceMetres,
  };
}

export function normalizeLegacyHitZone(value: unknown): HitZone | null {
  if (value === 'head' || value === 'torso' || value === 'arms' || value === 'legs') return value;
  return value === 'limbs' ? 'arms' : null;
}

function canonicalDistance(value: number): number {
  return Math.round(Math.max(0, value) * 1_000_000_000_000) / 1_000_000_000_000;
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
