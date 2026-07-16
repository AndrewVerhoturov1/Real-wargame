import type { UnitPosture } from '../behavior/BehaviorModel';
import { distance, type GridPosition } from '../geometry';
import {
  getCell,
  resolveObjectCoverProperties,
  type MapObject,
  type TacticalMap,
} from '../map/MapModel';
import { resolveCellVegetationDefinition } from '../map/VegetationDefinition';

export interface SmallArmsCoverContribution {
  kind: 'object' | 'forest' | 'relief';
  labelRu: string;
  strength: number;
  reliability: number;
  expectedProtection: number;
  concealment: number;
  object: MapObject | null;
}

export interface SmallArmsCoverResult {
  strength: number;
  reliability: number;
  expectedProtection: number;
  concealment: number;
  sourceRu: string;
  object: MapObject | null;
  contributions: SmallArmsCoverContribution[];
}

export interface SmallArmsCoverOptions {
  readonly includeObjects?: boolean;
  readonly includeForest?: boolean;
  readonly includeRelief?: boolean;
}

const ELEVATION_METERS_PER_LEVEL = 2;
const POSTURE_HEIGHT_METERS: Record<UnitPosture, number> = {
  standing: 1.65,
  crouched: 1.05,
  prone: 0.38,
};

export function evaluateSmallArmsCover(
  map: TacticalMap,
  threatPosition: GridPosition,
  targetPosition: GridPosition,
  posture: UnitPosture,
  options: SmallArmsCoverOptions = {},
): SmallArmsCoverResult {
  const contributions = [
    ...(options.includeObjects === false
      ? []
      : evaluateObjectCover(map, threatPosition, targetPosition, posture)),
    options.includeForest === false
      ? null
      : evaluateForestCover(map, threatPosition, targetPosition),
    options.includeRelief === false
      ? null
      : evaluateReliefCover(map, threatPosition, targetPosition, posture),
  ].filter((item): item is SmallArmsCoverContribution => item !== null && item.expectedProtection > 0);

  const strongest = [...contributions].sort((left, right) => right.expectedProtection - left.expectedProtection)[0] ?? null;
  const combinedExpected = clampPercent(100 * (1 - contributions.reduce(
    (remaining, item) => remaining * (1 - item.expectedProtection / 100),
    1,
  )));
  const combinedConcealment = clampPercent(100 * (1 - contributions.reduce(
    (remaining, item) => remaining * (1 - item.concealment / 100),
    1,
  )));

  return {
    strength: strongest?.strength ?? 0,
    reliability: strongest?.reliability ?? 0,
    expectedProtection: combinedExpected,
    concealment: combinedConcealment,
    sourceRu: strongest?.labelRu ?? 'нет укрытия',
    object: strongest?.object ?? null,
    contributions,
  };
}

function evaluateObjectCover(
  map: TacticalMap,
  threatPosition: GridPosition,
  targetPosition: GridPosition,
  posture: UnitPosture,
): SmallArmsCoverContribution[] {
  const results: SmallArmsCoverContribution[] = [];

  for (const object of map.objects) {
    const properties = resolveObjectCoverProperties(object);
    if (!postureFitsCover(posture, properties.coverPosture)) continue;

    const center = objectCenter(object);
    const segment = distanceToSegment(center, threatPosition, targetPosition);
    const hitRadius = Math.max(0.28, Math.min(object.widthCells, object.heightCells) * 0.72);
    if (segment.t <= 0.035 || segment.t >= 0.985 || segment.distance > hitRadius) continue;

    const angleReliability = clampPercent(100 - (segment.distance / hitRadius) * 52);
    const sizeReliability = clampPercent(35 + Math.min(55, Math.max(object.widthCells, object.heightCells) * 18));
    const baseReliability = properties.coverReliability;
    const reliability = clampPercent(baseReliability * 0.55 + angleReliability * 0.3 + sizeReliability * 0.15);
    const strength = clampPercent(properties.coverProtection * (properties.penetrable ? 0.58 : 1));
    const expectedProtection = clampPercent(strength * reliability / 100);

    results.push({
      kind: 'object',
      labelRu: object.labels?.ru ?? 'предмет',
      strength,
      reliability,
      expectedProtection,
      concealment: properties.concealment,
      object,
    });
  }

  return results;
}

export function evaluateForestCover(
  map: TacticalMap,
  threatPosition: GridPosition,
  targetPosition: GridPosition,
): SmallArmsCoverContribution | null {
  const length = distance(threatPosition, targetPosition);
  if (length < 0.5) return null;

  const samples = Math.max(4, Math.ceil(length * 3));
  let sparseSamples = 0;
  let denseSamples = 0;
  let density = 0;

  for (let index = 1; index < samples; index += 1) {
    const t = index / samples;
    const point = lerpPoint(threatPosition, targetPosition, t);
    const cell = getCell(map, Math.floor(point.x), Math.floor(point.y));
    const vegetation = resolveCellVegetationDefinition(cell);
    density += vegetation.fire.densityWeight;
    if (vegetation.id === 'sparse_forest') sparseSamples += 1;
    if (vegetation.id === 'dense_forest') denseSamples += 1;
  }

  if (density <= 0) return null;

  const strength = clampPercent(8 + Math.min(34, density * 2.1));
  const reliability = clampPercent(18 + Math.min(72, density * 4.2));
  const concealment = clampPercent(20 + Math.min(78, density * 6));

  return {
    kind: 'forest',
    labelRu: denseSamples > sparseSamples ? 'густой лес' : 'лес и кустарник',
    strength,
    reliability,
    expectedProtection: clampPercent(strength * reliability / 100),
    concealment,
    object: null,
  };
}

export function evaluateReliefCover(
  map: TacticalMap,
  threatPosition: GridPosition,
  targetPosition: GridPosition,
  posture: UnitPosture,
): SmallArmsCoverContribution | null {
  const length = distance(threatPosition, targetPosition);
  if (length < 0.75) return null;

  const sourceCell = getCell(map, Math.floor(threatPosition.x), Math.floor(threatPosition.y));
  const targetCell = getCell(map, Math.floor(targetPosition.x), Math.floor(targetPosition.y));
  if (!sourceCell || !targetCell) return null;

  const sourceHeight = sourceCell.height * ELEVATION_METERS_PER_LEVEL + 1.45;
  const targetHeight = targetCell.height * ELEVATION_METERS_PER_LEVEL + POSTURE_HEIGHT_METERS[posture];
  const samples = Math.max(8, Math.ceil(length * 5));
  let bestClearance = 0;
  let blockingSamples = 0;

  for (let index = 1; index < samples; index += 1) {
    const t = index / samples;
    const point = lerpPoint(threatPosition, targetPosition, t);
    const cell = getCell(map, Math.floor(point.x), Math.floor(point.y));
    if (!cell) continue;

    const lineHeight = sourceHeight + (targetHeight - sourceHeight) * t;
    const terrainHeight = cell.height * ELEVATION_METERS_PER_LEVEL;
    const clearance = terrainHeight - lineHeight;
    if (clearance > 0) {
      bestClearance = Math.max(bestClearance, clearance);
      blockingSamples += 1;
    }
  }

  if (blockingSamples === 0) return null;

  const strength = clampPercent(62 + bestClearance * 16);
  const reliability = clampPercent(48 + blockingSamples * 5 + bestClearance * 10);

  return {
    kind: 'relief',
    labelRu: bestClearance >= 1 ? 'складка местности / обратный склон' : 'низина рельефа',
    strength,
    reliability,
    expectedProtection: clampPercent(strength * reliability / 100),
    concealment: clampPercent(45 + bestClearance * 14),
    object: null,
  };
}

function objectCenter(object: MapObject): GridPosition {
  return {
    x: object.x + object.widthCells / 2,
    y: object.y + object.heightCells / 2,
  };
}

function postureFitsCover(posture: UnitPosture, coverPosture: UnitPosture): boolean {
  const rank: Record<UnitPosture, number> = { prone: 0, crouched: 1, standing: 2 };
  return rank[posture] <= rank[coverPosture];
}

function distanceToSegment(
  point: GridPosition,
  start: GridPosition,
  end: GridPosition,
): { distance: number; t: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0.000001) return { distance: distance(point, start), t: 0 };

  const rawT = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  const t = Math.max(0, Math.min(1, rawT));
  const projection = { x: start.x + dx * t, y: start.y + dy * t };
  return { distance: distance(point, projection), t };
}

function lerpPoint(start: GridPosition, end: GridPosition, t: number): GridPosition {
  return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
