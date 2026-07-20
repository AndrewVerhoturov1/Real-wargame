import { distance, type GridPosition } from '../geometry';
import { getCell, type MapObject, type MapObjectKind, type TacticalMap } from '../map/MapModel';
import { resolveCellVegetationDefinition } from '../map/VegetationDefinition';
import { getMapObjectSpatialIndex } from '../spatial/MapObjectSpatialIndex';
import { sampleSmoothHeightLevel } from '../terrain/SmoothTerrain';
import type { UnitModel } from '../units/UnitModel';

const ELEVATION_STEP_METERS = 2;
const SAMPLE_STEP_METERS = 1.2;
const OBJECT_ORIGIN_IGNORE_METERS = 1.25;
const TERRAIN_HORIZON_MARGIN = 0.02;
const OBJECT_BLOCK_MARGIN_METERS = 0.15;

export interface LineOfSightProbeResult {
  origin: GridPosition;
  target: GridPosition;
  totalDistanceMeters: number;
  visibleDistanceMeters: number;
  blocked: boolean;
  blockedAt: GridPosition | null;
  blockerReasonRu: string;
  visualTransmission: number;
  partialObscuration: boolean;
  accumulatedForestMeters: number;
  obscurationReasonRu: string;
}

interface TerrainHorizonBlocker {
  position: GridPosition;
  distanceMeters: number;
  smoothHeightLevel: number;
}

export function computeLineOfSight(
  map: TacticalMap,
  unit: UnitModel,
  target: GridPosition,
  targetHeightMeters = 1.4,
): LineOfSightProbeResult {
  const origin = unit.position;
  const totalDistanceCells = distance(origin, target);
  const totalDistanceMeters = totalDistanceCells * map.metersPerCell;

  if (totalDistanceMeters <= 0.02) {
    return {
      origin,
      target,
      totalDistanceMeters: 0,
      visibleDistanceMeters: 0,
      blocked: false,
      blockedAt: null,
      blockerReasonRu: 'видимость не проверялась: точка рядом с юнитом',
      visualTransmission: 1,
      partialObscuration: false,
      accumulatedForestMeters: 0,
      obscurationReasonRu: 'препятствий нет',
    };
  }

  const objectCandidates = getMapObjectSpatialIndex(map).querySegment(
    origin,
    target,
    Math.max(0.5, 2 / map.metersPerCell),
  );
  const postureEyeHeightMeters = eyeHeightForPosture(unit.behaviorRuntime.posture);
  const normalizedTargetHeightMeters = normalizeTargetHeightMeters(targetHeightMeters);
  const originGround = sampleSmoothHeightLevel(map, origin.x, origin.y) * ELEVATION_STEP_METERS;
  const targetGround = sampleSmoothHeightLevel(map, target.x, target.y) * ELEVATION_STEP_METERS;
  const originEye = originGround + postureEyeHeightMeters;
  const targetEye = targetGround + normalizedTargetHeightMeters;
  const terrainOriginCell = cellCenterForPosition(map, origin);
  const terrainTargetCell = cellCenterForPosition(map, target);
  const terrainOriginEye = sampleSmoothHeightLevel(
    map,
    terrainOriginCell.x,
    terrainOriginCell.y,
  ) * ELEVATION_STEP_METERS + postureEyeHeightMeters;
  const terrainTargetEye = sampleSmoothHeightLevel(
    map,
    terrainTargetCell.x,
    terrainTargetCell.y,
  ) * ELEVATION_STEP_METERS + normalizedTargetHeightMeters;
  const terrainBlocker = findTerrainHorizonBlocker(
    map,
    origin,
    terrainTargetCell,
    terrainOriginEye,
    terrainTargetEye,
  );
  const steps = Math.max(2, Math.ceil(totalDistanceMeters / SAMPLE_STEP_METERS));
  let accumulatedForestMeters = 0;
  let visualTransmission = 1;
  let strongestForestKind = 0;
  let strongestVegetationNameRu = '';
  let strongestVegetationLoss = 0;

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
      return blockedResult(
        origin,
        target,
        totalDistanceMeters,
        currentDistanceMeters,
        sample,
        'край карты',
        0,
        accumulatedForestMeters,
        forestReason(strongestForestKind, accumulatedForestMeters, strongestVegetationNameRu),
      );
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
        0,
        accumulatedForestMeters,
        forestReason(strongestForestKind, accumulatedForestMeters, strongestVegetationNameRu),
      );
    }

    const stepMeters = totalDistanceMeters / steps;
    const vegetation = resolveCellVegetationDefinition(cell);
    const hasVegetation = vegetation.id !== 'none'
      && (vegetation.visibility.transmissionLossPerMeter > 0
        || vegetation.visibility.localConcealment > 0
        || vegetation.visibility.targetConcealment > 0);
    if (hasVegetation) {
      accumulatedForestMeters += stepMeters;
      strongestForestKind = Math.max(strongestForestKind, vegetation.layer);
      if (vegetation.visibility.transmissionLossPerMeter >= strongestVegetationLoss) {
        strongestVegetationLoss = vegetation.visibility.transmissionLossPerMeter;
        strongestVegetationNameRu = vegetation.nameRu;
      }
      visualTransmission *= Math.exp(-vegetation.visibility.transmissionLossPerMeter * stepMeters);
      if (vegetation.visibility.minimumTransmission > 0
        && visualTransmission <= vegetation.visibility.minimumTransmission) {
        return blockedResult(
          origin,
          target,
          totalDistanceMeters,
          currentDistanceMeters,
          sample,
          `${vegetation.nameRu.toLowerCase()} почти полностью закрыл обзор`,
          visualTransmission,
          accumulatedForestMeters,
          forestReason(strongestForestKind, accumulatedForestMeters, strongestVegetationNameRu),
        );
      }
    }

    if (terrainBlocker && currentDistanceMeters >= terrainBlocker.distanceMeters) {
      return blockedResult(
        origin,
        target,
        totalDistanceMeters,
        terrainBlocker.distanceMeters,
        terrainBlocker.position,
        `плавный склон / рельеф ${formatSigned(terrainBlocker.smoothHeightLevel)}`,
        0,
        accumulatedForestMeters,
        forestReason(strongestForestKind, accumulatedForestMeters, strongestVegetationNameRu),
      );
    }
  }

  const partialObscuration = visualTransmission < 0.995;
  return {
    origin,
    target,
    totalDistanceMeters,
    visibleDistanceMeters: totalDistanceMeters,
    blocked: false,
    blockedAt: null,
    blockerReasonRu: partialObscuration ? 'прямая видимость есть, но обзор частично ухудшен' : 'прямая видимость есть',
    visualTransmission,
    partialObscuration,
    accumulatedForestMeters,
    obscurationReasonRu: forestReason(strongestForestKind, accumulatedForestMeters, strongestVegetationNameRu),
  };
}

function findTerrainHorizonBlocker(
  map: TacticalMap,
  origin: GridPosition,
  target: GridPosition,
  originEyeMeters: number,
  targetEyeMeters: number,
): TerrainHorizonBlocker | null {
  const originCellX = clampInt(Math.floor(origin.x), 0, map.width - 1);
  const originCellY = clampInt(Math.floor(origin.y), 0, map.height - 1);
  const targetCellX = clampInt(Math.floor(target.x), 0, map.width - 1);
  const targetCellY = clampInt(Math.floor(target.y), 0, map.height - 1);
  if (originCellX === targetCellX && originCellY === targetCellY) return null;

  const totalDistanceMeters = Math.max(0.001, distance(origin, target) * map.metersPerCell);
  const targetSlope = (targetEyeMeters - originEyeMeters) / totalDistanceMeters;
  const deltaX = targetCellX - originCellX;
  const deltaY = targetCellY - originCellY;
  const stepsX = Math.abs(deltaX);
  const stepsY = Math.abs(deltaY);
  const signX = deltaX > 0 ? 1 : deltaX < 0 ? -1 : 0;
  const signY = deltaY > 0 ? 1 : deltaY < 0 ? -1 : 0;
  let cellX = originCellX;
  let cellY = originCellY;
  let completedX = 0;
  let completedY = 0;
  let horizonSlope = Number.NEGATIVE_INFINITY;
  let horizonPosition: GridPosition | null = null;
  let horizonDistanceMeters = 0;
  let horizonHeightLevel = 0;

  while (completedX < stepsX || completedY < stepsY) {
    const decision = (1 + 2 * completedX) * stepsY - (1 + 2 * completedY) * stepsX;
    if (decision === 0) {
      cellX += signX;
      cellY += signY;
      completedX += 1;
      completedY += 1;
    } else if (decision < 0) {
      cellX += signX;
      completedX += 1;
    } else {
      cellY += signY;
      completedY += 1;
    }

    if (cellX === targetCellX && cellY === targetCellY) {
      if (horizonPosition && targetSlope + TERRAIN_HORIZON_MARGIN < horizonSlope) {
        return {
          position: horizonPosition,
          distanceMeters: horizonDistanceMeters,
          smoothHeightLevel: horizonHeightLevel,
        };
      }
      return null;
    }

    const position = { x: cellX + 0.5, y: cellY + 0.5 };
    const currentDistanceMeters = distance(origin, position) * map.metersPerCell;
    if (currentDistanceMeters <= 0.001) continue;
    const smoothHeightLevel = sampleSmoothHeightLevel(map, position.x, position.y);
    const groundHeightMeters = smoothHeightLevel * ELEVATION_STEP_METERS;
    const groundSlope = (groundHeightMeters - originEyeMeters) / currentDistanceMeters;
    if (groundSlope > horizonSlope) {
      horizonSlope = groundSlope;
      horizonPosition = position;
      horizonDistanceMeters = currentDistanceMeters;
      horizonHeightLevel = smoothHeightLevel;
    }
  }

  return null;
}

function blockedResult(
  origin: GridPosition,
  target: GridPosition,
  totalDistanceMeters: number,
  visibleDistanceMeters: number,
  blockedAt: GridPosition,
  reason: string,
  visualTransmission: number,
  accumulatedForestMeters: number,
  obscurationReasonRu: string,
): LineOfSightProbeResult {
  return {
    origin,
    target,
    totalDistanceMeters,
    visibleDistanceMeters,
    blocked: true,
    blockedAt,
    blockerReasonRu: reason,
    visualTransmission: Math.max(0, Math.min(1, visualTransmission)),
    partialObscuration: accumulatedForestMeters > 0 || visualTransmission > 0,
    accumulatedForestMeters,
    obscurationReasonRu,
  };
}

function forestReason(kind: number, meters: number, materialNameRu = ''): string {
  if (meters <= 0) return 'препятствий растительностью нет';
  const label = materialNameRu || (kind === 2 ? 'Густой лес' : kind === 1 ? 'Редкий лес' : 'Растительность');
  return `${label.toLowerCase()}: пройдено около ${Math.round(meters)} м растительности`;
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
    const centerX = object.x + 0.5;
    const centerY = object.y + 0.5;
    if (distance(origin, { x: centerX, y: centerY }) * map.metersPerCell < OBJECT_ORIGIN_IGNORE_METERS) continue;

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

function normalizeTargetHeightMeters(value: number): number {
  return Number.isFinite(value) ? Math.max(0.05, value) : 1.4;
}

function cellCenterForPosition(map: TacticalMap, position: GridPosition): GridPosition {
  return {
    x: clampInt(Math.floor(position.x), 0, map.width - 1) + 0.5,
    y: clampInt(Math.floor(position.y), 0, map.height - 1) + 0.5,
  };
}

function formatSigned(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function lerp(start: number, end: number, factor: number): number {
  return start + (end - start) * factor;
}
