import type { UnitPosture } from '../behavior/BehaviorModel';
import { distance, type GridPosition } from '../geometry';
import {
  clampGridPositionToMap,
  resolveObjectCoverProperties,
  type MapObject,
  type TacticalMap,
} from '../map/MapModel';

export interface CoverProtectionResult {
  object: MapObject | null;
  protection: number;
  concealment: number;
  blocksThreat: boolean;
}

export interface BestCoverResult extends CoverProtectionResult {
  position: GridPosition | null;
  distanceCells: number;
  score: number;
}

export function evaluateCoverBetween(
  map: TacticalMap,
  threatPosition: GridPosition,
  unitPosition: GridPosition,
  posture: UnitPosture,
): CoverProtectionResult {
  let best: CoverProtectionResult = {
    object: null,
    protection: 0,
    concealment: 0,
    blocksThreat: false,
  };

  for (const object of map.objects) {
    const properties = resolveObjectCoverProperties(object);
    if (!postureFitsCover(posture, properties.coverPosture)) continue;

    const center = objectCenter(object);
    const segment = distanceToSegment(center, threatPosition, unitPosition);
    const hitRadius = Math.max(0.3, Math.min(object.widthCells, object.heightCells) * 0.7);

    if (segment.t <= 0.05 || segment.t >= 0.97 || segment.distance > hitRadius) continue;

    const protection = clampPercent(properties.coverProtection * (properties.penetrable ? 0.55 : 1));
    if (protection <= best.protection) continue;

    best = {
      object,
      protection,
      concealment: properties.concealment,
      blocksThreat: protection > 0,
    };
  }

  return best;
}

export function findBestCoverForThreat(
  map: TacticalMap,
  unitPosition: GridPosition,
  threatPosition: GridPosition | null,
  posture: UnitPosture,
  radiusCells = 5,
): BestCoverResult {
  let best: BestCoverResult = {
    object: null,
    position: null,
    distanceCells: 9999,
    protection: 0,
    concealment: 0,
    blocksThreat: false,
    score: Number.NEGATIVE_INFINITY,
  };

  for (const object of map.objects) {
    const center = objectCenter(object);
    const distanceCells = distance(unitPosition, center);
    if (distanceCells > radiusCells) continue;

    const properties = resolveObjectCoverProperties(object);
    if (!postureFitsCover(posture, properties.coverPosture)) continue;

    const safePosition = threatPosition
      ? positionBehindObject(map, threatPosition, object)
      : clampGridPositionToMap(map, center);
    const directional = threatPosition
      ? evaluateCoverBetween(map, threatPosition, safePosition, posture)
      : {
          object,
          protection: properties.coverProtection,
          concealment: properties.concealment,
          blocksThreat: properties.coverProtection > 0,
        };
    const score = directional.protection + directional.concealment * 0.25 - distanceCells * 2.5;

    if (score <= best.score) continue;

    best = {
      ...directional,
      object,
      position: safePosition,
      distanceCells,
      score,
    };
  }

  return best;
}

export function objectCenter(object: MapObject): GridPosition {
  return {
    x: object.x + object.widthCells / 2,
    y: object.y + object.heightCells / 2,
  };
}

function positionBehindObject(map: TacticalMap, threatPosition: GridPosition, object: MapObject): GridPosition {
  const center = objectCenter(object);
  const dx = center.x - threatPosition.x;
  const dy = center.y - threatPosition.y;
  const length = Math.hypot(dx, dy) || 1;
  const offset = Math.max(object.widthCells, object.heightCells) / 2 + 0.55;

  return clampGridPositionToMap(map, {
    x: center.x + (dx / length) * offset,
    y: center.y + (dy / length) * offset,
  });
}

function postureFitsCover(posture: UnitPosture, coverPosture: UnitPosture): boolean {
  const rank: Record<UnitPosture, number> = {
    prone: 0,
    crouched: 1,
    standing: 2,
  };
  return rank[posture] <= rank[coverPosture];
}

function distanceToSegment(point: GridPosition, start: GridPosition, end: GridPosition): { distance: number; t: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared <= 0.000001) {
    return { distance: distance(point, start), t: 0 };
  }

  const rawT = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  const t = Math.max(0, Math.min(1, rawT));
  const projection = {
    x: start.x + dx * t,
    y: start.y + dy * t,
  };
  return { distance: distance(point, projection), t };
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
