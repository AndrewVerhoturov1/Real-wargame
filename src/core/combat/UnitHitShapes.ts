import { sampleSmoothHeightLevel } from '../terrain/SmoothTerrain';
import type { TacticalMap } from '../map/MapModel';
import type { UnitModel } from '../units/UnitModel';

const ELEVATION_STEP_METRES = 2;

export type HitZone = 'head' | 'torso' | 'limbs';

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
  zone: HitZone;
  centerXMetres: number;
  centerYMetres: number;
  radiusMetres: number;
  bottomZMetres: number;
  topZMetres: number;
}

export interface UnitHitIntersection {
  distanceMetres: number;
  zone: HitZone;
  point: BallisticPoint3;
}

export function getUnitHitShapes(unit: UnitModel, map: TacticalMap): UnitHitShape[] {
  const x = unit.position.x * map.metersPerCell;
  const y = unit.position.y * map.metersPerCell;
  const ground = sampleSmoothHeightLevel(map, unit.position.x, unit.position.y) * ELEVATION_STEP_METRES;
  const forwardX = Math.cos(unit.facingRadians);
  const forwardY = Math.sin(unit.facingRadians);
  const shape = (
    zone: HitZone,
    forwardOffset: number,
    radiusMetres: number,
    bottom: number,
    top: number,
  ): UnitHitShape => ({
    zone,
    centerXMetres: x + forwardX * forwardOffset,
    centerYMetres: y + forwardY * forwardOffset,
    radiusMetres,
    bottomZMetres: ground + bottom,
    topZMetres: ground + top,
  });

  switch (unit.behaviorRuntime.posture) {
    case 'prone':
      return [
        shape('head', 0.68, 0.17, 0.16, 0.42),
        shape('torso', 0.12, 0.29, 0.12, 0.43),
        shape('limbs', -0.52, 0.25, 0.08, 0.34),
      ];
    case 'crouched':
      return [
        shape('head', 0.1, 0.16, 0.86, 1.22),
        shape('torso', 0, 0.28, 0.42, 1.02),
        shape('limbs', -0.08, 0.31, 0.08, 0.58),
      ];
    case 'standing':
    default:
      return [
        shape('head', 0.1, 0.16, 1.43, 1.78),
        shape('torso', 0, 0.29, 0.74, 1.48),
        shape('limbs', -0.05, 0.33, 0.08, 0.86),
      ];
  }
}

export function intersectRayWithUnitHitShapes(
  origin: BallisticPoint3,
  direction: BallisticDirection3,
  maximumDistanceMetres: number,
  unit: UnitModel,
  map: TacticalMap,
): UnitHitIntersection | null {
  const normalized = normalizeDirection(direction);
  let nearest: UnitHitIntersection | null = null;

  for (const shape of getUnitHitShapes(unit, map)) {
    const distanceMetres = intersectVerticalCylinder(origin, normalized, maximumDistanceMetres, shape);
    if (distanceMetres === null) continue;
    if (nearest && nearest.distanceMetres <= distanceMetres) continue;
    nearest = {
      distanceMetres,
      zone: shape.zone,
      point: pointAlongRay(origin, normalized, distanceMetres),
    };
  }

  return nearest;
}

function intersectVerticalCylinder(
  origin: BallisticPoint3,
  direction: BallisticDirection3,
  maximumDistanceMetres: number,
  shape: UnitHitShape,
): number | null {
  const ox = origin.xMetres - shape.centerXMetres;
  const oy = origin.yMetres - shape.centerYMetres;
  const a = direction.x * direction.x + direction.y * direction.y;
  if (a < 0.0000001) return null;
  const b = 2 * (ox * direction.x + oy * direction.y);
  const c = ox * ox + oy * oy - shape.radiusMetres * shape.radiusMetres;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const candidates = [(-b - root) / (2 * a), (-b + root) / (2 * a)]
    .filter((distance) => distance >= 0 && distance <= maximumDistanceMetres)
    .sort((left, right) => left - right);

  for (const distance of candidates) {
    const z = origin.zMetres + direction.z * distance;
    if (z >= shape.bottomZMetres && z <= shape.topZMetres) return distance;
  }
  return null;
}

export function normalizeDirection(direction: BallisticDirection3): BallisticDirection3 {
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (length <= 0.0000001) return { x: 1, y: 0, z: 0 };
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
