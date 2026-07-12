import { distance, type GridPosition } from '../geometry';
import { getCell, type MapObject, type MapObjectKind, type TacticalMap } from '../map/MapModel';
import { getMapObjectSpatialIndex } from '../spatial/MapObjectSpatialIndex';
import { sampleSmoothHeightLevel } from '../terrain/SmoothTerrain';
import type { UnitModel } from '../units/UnitModel';

const ELEVATION_STEP_METERS = 2;
const SAMPLE_STEP_CELLS = 0.12;
const TERRAIN_BLOCK_MARGIN_METERS = 0.95;
const OBJECT_BLOCK_MARGIN_METERS = 0.15;

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

  const objectCandidates = getMapObjectSpatialIndex(map).querySegment(origin, target, 1);
  const originGround = sampleSmoothHeightLevel(map, origin.x, origin.y) * ELEVATION_STEP_METERS;
  const targetGround = sampleSmoothHeightLevel(map, target.x, target.y) * ELEVATION_STEP_METERS;
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
    const lineHeight = lerp(originEye, targetEye, factor);

    if (!cell) {
      return blockedResult(origin, target, totalDistanceMeters, currentDistanceMeters, sample, 'край карты');
    }

    const objectBlocker = findObjectBlocker(objectCandidates, map, sample, origin, lineHeight);
    if (objectBlocker) {
      return blockedResult(
        origin,
        target,
        totalDistanceMeters,
        currentDistanceMeters,
        sample,
        `${formatObjectBlocker(objectBlocker)} / высота ${getObjectHeightMeters(objectBlocker)} м`,
      );
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

    const smoothHeightLevel = sampleSmoothHeightLevel(map, sample.x, sample.y);
    const groundHeight = smoothHeightLevel * ELEVATION_STEP_METERS;
    const isNearOrigin = currentDistanceMeters < map.metersPerCell * 0.7;
    const isNearTarget = totalDistanceMeters - currentDistanceMeters < map.metersPerCell * 0.7;

    if (!isNearOrigin && !isNearTarget && groundHeight > lineHeight + TERRAIN_BLOCK_MARGIN_METERS) {
      return blockedResult(
        origin,
        target,
        totalDistanceMeters,
        currentDistanceMeters,
        sample,
        `плавный склон / рельеф ${formatSigned(smoothHeightLevel)}`,
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

function findObjectBlocker(
  candidates: MapObject[],
  map: TacticalMap,
  sample: GridPosition,
  origin: GridPosition,
  lineHeightMeters: number,
): MapObject | null {
  for (const object of candidates) {
    if (!blocksLineOfSight(object)) continue;
    if (distance(origin, { x: object.x, y: object.y }) < 0.65) continue;

    const centerX = object.x + 0.5;
    const centerY = object.y + 0.5;
    const dx = sample.x - centerX;
    const dy = sample.y - centerY;
    const cos = Math.cos(-object.rotationRadians);
    const sin = Math.sin(-object.rotationRadians);
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;
    const halfWidth = Math.max(0.35, object.widthCells / 2);
    const halfHeight = Math.max(0.35, object.heightCells / 2);

    if (Math.abs(localX) > halfWidth || Math.abs(localY) > halfHeight) continue;

    const objectGround = sampleSmoothHeightLevel(map, centerX, centerY) * ELEVATION_STEP_METERS;
    const objectTop = objectGround + getObjectHeightMeters(object);

    if (objectTop + OBJECT_BLOCK_MARGIN_METERS >= lineHeightMeters) return object;
  }

  return null;
}

function blocksLineOfSight(object: MapObject): boolean {
  if (getObjectHeightMeters(object) <= 0.05) return false;

  switch (object.kind) {
    case 'structure':
    case 'rock':
    case 'cover':
    case 'crates':
    case 'logs':
    case 'fence':
    case 'tree':
    case 'post':
    case 'well':
      return true;
    case 'ditch':
    case 'bridge':
    default:
      return false;
  }
}

function getObjectHeightMeters(object: MapObject): number {
  if (typeof object.losHeightMeters === 'number' && Number.isFinite(object.losHeightMeters)) {
    return object.losHeightMeters;
  }
  return fallbackObjectHeightMeters(object.kind);
}

function fallbackObjectHeightMeters(kind: MapObjectKind): number {
  switch (kind) {
    case 'tree': return 6;
    case 'structure': return 5;
    case 'post': return 1.35;
    case 'crates': return 1.25;
    case 'rock':
    case 'fence': return 1.2;
    case 'cover':
    case 'well': return 1.1;
    case 'logs':
    case 'bridge': return 0.8;
    case 'ditch':
    default: return 0.2;
  }
}

function formatObjectBlocker(object: MapObject): string {
  const label = object.labels?.ru;
  if (label) return label;

  switch (object.kind) {
    case 'structure': return 'строение';
    case 'rock': return 'камень';
    case 'cover': return 'укрытие';
    case 'crates': return 'ящики / бочки';
    case 'logs': return 'брёвна';
    case 'fence': return 'забор';
    case 'tree': return 'дерево';
    case 'post': return 'пост / бочки';
    case 'well': return 'колодец / круглый объект';
    default: return object.kind;
  }
}

function eyeHeightForPosture(posture: UnitModel['behaviorRuntime']['posture']): number {
  switch (posture) {
    case 'prone': return 0.35;
    case 'crouched': return 1.1;
    case 'standing':
    default: return 1.7;
  }
}

function formatSigned(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function lerp(start: number, end: number, factor: number): number {
  return start + (end - start) * factor;
}
