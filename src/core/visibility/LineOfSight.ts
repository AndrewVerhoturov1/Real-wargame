import { distance, type GridPosition } from '../geometry';
import { getCell, type MapObject, type TacticalMap } from '../map/MapModel';
import type { UnitModel } from '../units/UnitModel';

const ELEVATION_STEP_METERS = 2;
const SAMPLE_STEP_CELLS = 0.12;

export interface LineOfSightProbeResult {
  origin: GridPosition;
  target: GridPosition;
  totalDistanceMeters: number;
  visibleDistanceMeters: number;
  blocked: boolean;
  blockedAt: GridPosition | null;
  blockerReasonRu: string;
}

export function computeLineOfSight(map: TacticalMap, unit: UnitModel, target: GridPosition): LineOfSightProbeResult {
  const origin = unit.position;
  const totalDistanceCells = distance(origin, target);
  const totalDistanceMeters = totalDistanceCells * map.metersPerCell;

  if (totalDistanceCells <= 0.01) {
    return {
      origin,
      target,
      totalDistanceMeters: 0,
      visibleDistanceMeters: 0,
      blocked: false,
      blockedAt: null,
      blockerReasonRu: 'видимость не проверялась: точка рядом с юнитом',
    };
  }

  const originCell = getCell(map, Math.floor(origin.x), Math.floor(origin.y));
  const targetCell = getCell(map, Math.floor(target.x), Math.floor(target.y));
  const originGround = (originCell?.height ?? 0) * ELEVATION_STEP_METERS;
  const targetGround = (targetCell?.height ?? 0) * ELEVATION_STEP_METERS;
  const originEye = originGround + eyeHeightForPosture(unit.behaviorRuntime.posture);
  const targetEye = targetGround + 1.4;
  const steps = Math.max(2, Math.ceil(totalDistanceCells / SAMPLE_STEP_CELLS));
  let forestMeters = 0;

  for (let step = 1; step <= steps; step += 1) {
    const factor = step / steps;
    const sample = {
      x: lerp(origin.x, target.x, factor),
      y: lerp(origin.y, target.y, factor),
    };
    const currentDistanceMeters = totalDistanceMeters * factor;
    const cell = getCell(map, Math.floor(sample.x), Math.floor(sample.y));

    if (!cell) {
      return blockedResult(origin, target, totalDistanceMeters, currentDistanceMeters, sample, 'край карты');
    }

    const objectBlocker = findObjectBlocker(map.objects, sample, origin);
    if (objectBlocker) {
      return blockedResult(origin, target, totalDistanceMeters, currentDistanceMeters, sample, formatObjectBlocker(objectBlocker));
    }

    if (cell.forest > 0) {
      forestMeters += map.metersPerCell / Math.max(1, steps / totalDistanceCells);
      const forestLimit = cell.forest === 2 ? 18 : 34;
      if (forestMeters >= forestLimit) {
        return blockedResult(
          origin,
          target,
          totalDistanceMeters,
          currentDistanceMeters,
          sample,
          cell.forest === 2 ? 'густой лес' : 'редкий лес',
        );
      }
    } else {
      forestMeters = Math.max(0, forestMeters - map.metersPerCell * 0.4);
    }

    const groundHeight = cell.height * ELEVATION_STEP_METERS;
    const lineHeight = lerp(originEye, targetEye, factor);
    const isNearOrigin = currentDistanceMeters < map.metersPerCell * 0.7;
    const isNearTarget = totalDistanceMeters - currentDistanceMeters < map.metersPerCell * 0.7;

    if (!isNearOrigin && !isNearTarget && groundHeight > lineHeight + 0.75) {
      return blockedResult(
        origin,
        target,
        totalDistanceMeters,
        currentDistanceMeters,
        sample,
        `склон / высота ${formatSigned(cell.height)}`,
      );
    }
  }

  return {
    origin,
    target,
    totalDistanceMeters,
    visibleDistanceMeters: totalDistanceMeters,
    blocked: false,
    blockedAt: null,
    blockerReasonRu: 'прямая видимость есть',
  };
}

function blockedResult(
  origin: GridPosition,
  target: GridPosition,
  totalDistanceMeters: number,
  visibleDistanceMeters: number,
  blockedAt: GridPosition,
  reason: string,
): LineOfSightProbeResult {
  return {
    origin,
    target,
    totalDistanceMeters,
    visibleDistanceMeters,
    blocked: true,
    blockedAt,
    blockerReasonRu: reason,
  };
}

function findObjectBlocker(objects: MapObject[], sample: GridPosition, origin: GridPosition): MapObject | null {
  for (const object of objects) {
    if (!blocksLineOfSight(object)) {
      continue;
    }

    if (distance(origin, { x: object.x, y: object.y }) < 0.65) {
      continue;
    }

    const halfWidth = Math.max(0.35, object.widthCells / 2);
    const halfHeight = Math.max(0.35, object.heightCells / 2);

    if (Math.abs(sample.x - object.x) <= halfWidth && Math.abs(sample.y - object.y) <= halfHeight) {
      return object;
    }
  }

  return null;
}

function blocksLineOfSight(object: MapObject): boolean {
  switch (object.kind) {
    case 'structure':
    case 'rock':
    case 'cover':
    case 'crates':
    case 'logs':
    case 'fence':
    case 'tree':
      return true;
    case 'ditch':
    case 'post':
    case 'well':
    case 'bridge':
    default:
      return false;
  }
}

function formatObjectBlocker(object: MapObject): string {
  const label = object.labels?.ru;
  if (label) {
    return label;
  }

  switch (object.kind) {
    case 'structure':
      return 'строение';
    case 'rock':
      return 'камень';
    case 'cover':
      return 'укрытие';
    case 'crates':
      return 'ящики';
    case 'logs':
      return 'брёвна';
    case 'fence':
      return 'забор';
    case 'tree':
      return 'дерево';
    default:
      return object.kind;
  }
}

function eyeHeightForPosture(posture: UnitModel['behaviorRuntime']['posture']): number {
  switch (posture) {
    case 'prone':
      return 0.35;
    case 'crouched':
      return 1.1;
    case 'standing':
    default:
      return 1.7;
  }
}

function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function lerp(start: number, end: number, factor: number): number {
  return start + (end - start) * factor;
}
