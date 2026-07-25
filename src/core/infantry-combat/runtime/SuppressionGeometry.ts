import {
  getUnitHitShapes,
  normalizeDirection,
  type BallisticDirection3,
  type BallisticPoint3,
  type UnitHitShape,
} from '../../combat/UnitHitShapes';
import type { TacticalMap } from '../../map/MapModel';
import type { UnitModel } from '../../units/UnitModel';

const EPSILON = 1e-12;

export interface SegmentUnitDistanceV1 {
  readonly distanceMetres: number;
  readonly segmentFraction: number;
  readonly nearestPoint: BallisticPoint3;
}

export function distanceFromProjectileSegmentToUnit(
  start: BallisticPoint3,
  end: BallisticPoint3,
  unit: UnitModel,
  map: TacticalMap,
): SegmentUnitDistanceV1 {
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestFraction = 0;
  for (const shape of getUnitHitShapes(unit, map)) {
    const candidate = distanceFromSegmentToVerticalCylinder(start, end, shape);
    if (
      candidate.distanceMetres < bestDistance - EPSILON
      || (Math.abs(candidate.distanceMetres - bestDistance) <= EPSILON && candidate.segmentFraction < bestFraction)
    ) {
      bestDistance = candidate.distanceMetres;
      bestFraction = candidate.segmentFraction;
    }
  }
  return {
    distanceMetres: canonicalNonNegative(bestDistance),
    segmentFraction: clamp01(bestFraction),
    nearestPoint: pointAlongSegment(start, end, bestFraction),
  };
}

export function distanceFromPointToUnit(
  point: BallisticPoint3,
  unit: UnitModel,
  map: TacticalMap,
): number {
  let best = Number.POSITIVE_INFINITY;
  for (const shape of getUnitHitShapes(unit, map)) {
    best = Math.min(best, distanceFromPointToVerticalCylinder(point, shape));
  }
  return canonicalNonNegative(best);
}

export function incomingSuppressionDirection(velocity: BallisticDirection3): BallisticDirection3 {
  const horizontal = Math.hypot(velocity.x, velocity.y);
  if (horizontal > EPSILON) return { x: -velocity.x / horizontal, y: -velocity.y / horizontal, z: 0 };
  const fallback = normalizeDirection({ x: -velocity.x, y: -velocity.y, z: -velocity.z });
  return { x: fallback.x, y: fallback.y, z: fallback.z };
}

function distanceFromSegmentToVerticalCylinder(
  start: BallisticPoint3,
  end: BallisticPoint3,
  shape: UnitHitShape,
): SegmentUnitDistanceV1 {
  const dx = end.xMetres - start.xMetres;
  const dy = end.yMetres - start.yMetres;
  const dz = end.zMetres - start.zMetres;
  const horizontalLengthSquared = dx * dx + dy * dy;
  const fractions = [0, 1];
  if (horizontalLengthSquared > EPSILON) {
    fractions.push(clamp01(
      ((shape.centerXMetres - start.xMetres) * dx + (shape.centerYMetres - start.yMetres) * dy)
      / horizontalLengthSquared,
    ));
  }
  if (Math.abs(dz) > EPSILON) {
    fractions.push(clamp01((shape.bottomZMetres - start.zMetres) / dz));
    fractions.push(clamp01((shape.topZMetres - start.zMetres) / dz));
  }
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestFraction = 0;
  for (const fraction of fractions) {
    const point = pointAlongSegment(start, end, fraction);
    const distance = distanceFromPointToVerticalCylinder(point, shape);
    if (distance < bestDistance - EPSILON || (Math.abs(distance - bestDistance) <= EPSILON && fraction < bestFraction)) {
      bestDistance = distance;
      bestFraction = fraction;
    }
  }
  return {
    distanceMetres: canonicalNonNegative(bestDistance),
    segmentFraction: clamp01(bestFraction),
    nearestPoint: pointAlongSegment(start, end, bestFraction),
  };
}

function distanceFromPointToVerticalCylinder(point: BallisticPoint3, shape: UnitHitShape): number {
  const radialDistance = Math.hypot(point.xMetres - shape.centerXMetres, point.yMetres - shape.centerYMetres);
  const radialOutside = Math.max(0, radialDistance - shape.radiusMetres);
  const verticalOutside = point.zMetres < shape.bottomZMetres
    ? shape.bottomZMetres - point.zMetres
    : point.zMetres > shape.topZMetres
      ? point.zMetres - shape.topZMetres
      : 0;
  return Math.hypot(radialOutside, verticalOutside);
}
function pointAlongSegment(start: BallisticPoint3, end: BallisticPoint3, fraction: number): BallisticPoint3 {
  const t = clamp01(fraction);
  return {
    xMetres: canonical(start.xMetres + (end.xMetres - start.xMetres) * t),
    yMetres: canonical(start.yMetres + (end.yMetres - start.yMetres) * t),
    zMetres: canonical(start.zMetres + (end.zMetres - start.zMetres) * t),
  };
}
function clamp01(value: number): number { return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)); }
function canonical(value: number): number { return Math.round(value * 1_000_000_000_000) / 1_000_000_000_000; }
function canonicalNonNegative(value: number): number { return canonical(Math.max(0, Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER)); }
