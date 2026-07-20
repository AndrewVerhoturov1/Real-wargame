import { distance, type GridPosition } from '../geometry';
import type { TacticalMap } from '../map/MapModel';
import {
  getVegetationDefinitionKey,
  resolveVegetationDefinition,
} from '../map/VegetationDefinition';
import { sampleSmoothHeightLevel } from '../terrain/SmoothTerrain';
import { getVisibilityStaticGrid, type VisibilityStaticGrid } from './VisibilityStaticGrid';

const ELEVATION_STEP_METERS = 2;
const HORIZON_MARGIN = 0.02;
const EPSILON = 1e-9;

export type VisibilityTraceChannel = 'visual' | 'fire' | 'combined';
export type VisibilityTraceBlockerKind = 'none' | 'terrain' | 'object' | 'vegetation' | 'boundary';

export interface VisibilityTraceRequest {
  readonly origin: GridPosition;
  readonly target: GridPosition;
  readonly originHeightAboveGroundMeters: number;
  readonly targetHeightAboveGroundMeters: number;
  readonly channel?: VisibilityTraceChannel;
}

export interface VisibilityTraceResult {
  readonly origin: GridPosition;
  readonly target: GridPosition;
  readonly totalDistanceMeters: number;
  readonly traversedCellCount: number;
  readonly hardBlocked: boolean;
  readonly blockerKind: VisibilityTraceBlockerKind;
  readonly blockerPosition: GridPosition | null;
  readonly blockerDistanceMeters: number | null;
  readonly visualTransmission: number;
  readonly fireTransmission: number;
  readonly accumulatedVegetationMeters: number;
  readonly reasonRu: string;
}

export interface VisibilityTraceCellSample {
  readonly x: number;
  readonly y: number;
  readonly mapIndex: number;
  readonly distanceMeters: number;
  readonly hardBlocked: boolean;
  readonly blockerKind: VisibilityTraceBlockerKind;
  readonly visualTransmission: number;
  readonly fireTransmission: number;
}

export interface VisibilityTracePathResult {
  readonly result: VisibilityTraceResult;
  readonly samples: readonly VisibilityTraceCellSample[];
}

export interface TraversedVisibilityCell {
  readonly x: number;
  readonly y: number;
  readonly entryT: number;
  readonly exitT: number;
  readonly pathLengthMeters: number;
  readonly representative: GridPosition;
  readonly targetCell: boolean;
}

interface VisibilityTraceContext {
  readonly staticGrid: VisibilityStaticGrid;
  readonly key: string;
  readonly visualLossPerMeter: Float64Array;
  readonly fireLossPerMeter: Float64Array;
  readonly visualMinimumTransmission: Float64Array;
  readonly fireMinimumTransmission: Float64Array;
}

const contextByMap = new WeakMap<TacticalMap, VisibilityTraceContext>();

export function traceVisibilityRay(
  map: TacticalMap,
  request: VisibilityTraceRequest,
): VisibilityTraceResult {
  return traceVisibilityRayPath(map, request).result;
}

/**
 * Canonical geometry trace. Field builders may consume the cell samples, while
 * concrete point probes consume the final result. Both paths therefore share
 * exactly the same terrain, object and vegetation rules.
 */
export function traceVisibilityRayPath(
  map: TacticalMap,
  request: VisibilityTraceRequest,
): VisibilityTracePathResult {
  const origin = finitePosition(request.origin);
  const target = finitePosition(request.target);
  const channel = request.channel ?? 'combined';
  const totalDistanceMeters = distance(origin, target) * map.metersPerCell;
  const originHeight = normalizeHeight(request.originHeightAboveGroundMeters);
  const targetHeight = normalizeHeight(request.targetHeightAboveGroundMeters);

  if (!insideMap(map, origin)) {
    return {
      result: blockedResult(origin, target, totalDistanceMeters, 0, 'boundary', origin, 1, 1, 0, 0),
      samples: [],
    };
  }
  if (totalDistanceMeters <= 0.02) {
    return {
      result: visibleResult(origin, target, 0, 0, 1, 1, 0),
      samples: [],
    };
  }

  const context = getTraceContext(map);
  const cells = traverseVisibilitySegmentCells(map, origin, target);
  const originGround = sampleSmoothHeightLevel(map, origin.x, origin.y) * ELEVATION_STEP_METERS;
  const targetGround = insideMap(map, target)
    ? sampleSmoothHeightLevel(map, target.x, target.y) * ELEVATION_STEP_METERS
    : 0;
  const originEye = originGround + originHeight;
  const exactTargetPoint = targetGround + targetHeight;
  const exactTargetSlope = (exactTargetPoint - originEye) / Math.max(0.001, totalDistanceMeters);

  let visualTransmission = 1;
  let fireTransmission = 1;
  let accumulatedVegetationMeters = 0;
  let horizonSlope = Number.NEGATIVE_INFINITY;
  let horizonKind: VisibilityTraceBlockerKind = 'terrain';
  let horizonPosition: GridPosition | null = null;
  let horizonDistanceMeters: number | null = null;
  const samples: VisibilityTraceCellSample[] = [];
  let traversedCellCount = 0;

  for (let cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
    const traversed = cells[cellIndex]!;
    const isOriginCell = cellIndex === 0;
    if (!insideCell(map, traversed.x, traversed.y)) {
      return {
        result: blockedResult(
          origin,
          target,
          totalDistanceMeters,
          distance(origin, traversed.representative) * map.metersPerCell,
          'boundary',
          traversed.representative,
          visualTransmission,
          fireTransmission,
          accumulatedVegetationMeters,
          traversedCellCount,
        ),
        samples,
      };
    }

    if (isOriginCell) {
      if (traversed.targetCell) {
        return {
          result: visibleResult(origin, target, totalDistanceMeters, 0, 1, 1, 0),
          samples,
        };
      }
      continue;
    }

    traversedCellCount += 1;
    const mapIndex = traversed.y * map.width + traversed.x;
    const materialCode = context.staticGrid.vegetationMaterialCodes[mapIndex] ?? 0;
    const pathMeters = Math.max(0, traversed.pathLengthMeters);
    const hasVegetation = (context.visualLossPerMeter[materialCode] ?? 0) > 0
      || (context.fireLossPerMeter[materialCode] ?? 0) > 0;
    if (hasVegetation) accumulatedVegetationMeters += pathMeters;
    if (channel !== 'fire') {
      visualTransmission *= Math.exp(-(context.visualLossPerMeter[materialCode] ?? 0) * pathMeters);
    }
    if (channel !== 'visual') {
      fireTransmission *= Math.exp(-(context.fireLossPerMeter[materialCode] ?? 0) * pathMeters);
    }

    const currentDistanceMeters = distance(origin, traversed.representative) * map.metersPerCell;
    const sampleGround = traversed.targetCell
      ? targetGround
      : context.staticGrid.terrainHeightMeters[mapIndex] ?? 0;
    const samplePoint = sampleGround + targetHeight;
    const sampleSlope = traversed.targetCell
      ? exactTargetSlope
      : (samplePoint - originEye) / Math.max(0.001, currentDistanceMeters);
    const blockedByHorizon = horizonPosition !== null && sampleSlope + HORIZON_MARGIN < horizonSlope;
    const blockedByVegetation = vegetationExhausted(
      channel,
      visualTransmission,
      fireTransmission,
      context.visualMinimumTransmission[materialCode] ?? 0,
      context.fireMinimumTransmission[materialCode] ?? 0,
    );
    const hardBlocked = blockedByHorizon || blockedByVegetation;
    const blockerKind = blockedByHorizon ? horizonKind : blockedByVegetation ? 'vegetation' : 'none';
    const sampleVisual = blockedByHorizon ? 0 : clamp01(visualTransmission);
    const sampleFire = blockedByHorizon ? 0 : clamp01(fireTransmission);
    samples.push({
      x: traversed.x,
      y: traversed.y,
      mapIndex,
      distanceMeters: currentDistanceMeters,
      hardBlocked,
      blockerKind,
      visualTransmission: sampleVisual,
      fireTransmission: sampleFire,
    });

    if (traversed.targetCell) {
      if (hardBlocked) {
        const blockerPosition = blockedByHorizon ? horizonPosition! : traversed.representative;
        const blockerDistance = blockedByHorizon
          ? horizonDistanceMeters ?? currentDistanceMeters
          : currentDistanceMeters;
        return {
          result: blockedResult(
            origin,
            target,
            totalDistanceMeters,
            blockerDistance,
            blockerKind,
            blockerPosition,
            sampleVisual,
            sampleFire,
            accumulatedVegetationMeters,
            traversedCellCount,
          ),
          samples,
        };
      }
      return {
        result: visibleResult(
          origin,
          target,
          totalDistanceMeters,
          traversedCellCount,
          sampleVisual,
          sampleFire,
          accumulatedVegetationMeters,
        ),
        samples,
      };
    }

    const groundSlope = ((context.staticGrid.terrainHeightMeters[mapIndex] ?? 0) - originEye)
      / Math.max(0.001, currentDistanceMeters);
    if (groundSlope > horizonSlope) {
      horizonSlope = groundSlope;
      horizonKind = 'terrain';
      horizonPosition = { x: traversed.x + 0.5, y: traversed.y + 0.5 };
      horizonDistanceMeters = distance(origin, horizonPosition) * map.metersPerCell;
    }
    if (context.staticGrid.blockingFlags[mapIndex] === 1) {
      const objectSlope = ((context.staticGrid.objectTopHeightMeters[mapIndex] ?? 0) - originEye)
        / Math.max(0.001, currentDistanceMeters);
      if (objectSlope > horizonSlope) {
        horizonSlope = objectSlope;
        horizonKind = 'object';
        horizonPosition = { x: traversed.x + 0.5, y: traversed.y + 0.5 };
        horizonDistanceMeters = distance(origin, horizonPosition) * map.metersPerCell;
      }
    }
  }

  return {
    result: blockedResult(
      origin,
      target,
      totalDistanceMeters,
      totalDistanceMeters,
      'boundary',
      target,
      visualTransmission,
      fireTransmission,
      accumulatedVegetationMeters,
      traversedCellCount,
    ),
    samples,
  };
}

/** Pure exact-grid traversal used by the masked field to find useful ray extents. */
export function traverseVisibilitySegmentCells(
  map: TacticalMap,
  origin: GridPosition,
  target: GridPosition,
): TraversedVisibilityCell[] {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const totalCells = Math.hypot(dx, dy);
  if (totalCells <= EPSILON) return [];

  let cellX = Math.floor(origin.x);
  let cellY = Math.floor(origin.y);
  const targetCellX = Math.floor(target.x);
  const targetCellY = Math.floor(target.y);
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  const tDeltaX = stepX === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dx);
  const tDeltaY = stepY === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dy);
  let tMaxX = stepX > 0
    ? (cellX + 1 - origin.x) / dx
    : stepX < 0
      ? (origin.x - cellX) / -dx
      : Number.POSITIVE_INFINITY;
  let tMaxY = stepY > 0
    ? (cellY + 1 - origin.y) / dy
    : stepY < 0
      ? (origin.y - cellY) / -dy
      : Number.POSITIVE_INFINITY;
  let entryT = 0;
  const cells: TraversedVisibilityCell[] = [];
  const maximumSteps = Math.max(4, map.width + map.height + 8);

  for (let guard = 0; guard < maximumSteps && entryT < 1 - EPSILON; guard += 1) {
    const exitT = Math.min(1, tMaxX, tMaxY);
    const safeExitT = Math.max(entryT, exitT);
    const midT = (entryT + safeExitT) / 2;
    cells.push({
      x: cellX,
      y: cellY,
      entryT,
      exitT: safeExitT,
      pathLengthMeters: Math.max(0, safeExitT - entryT) * totalCells * map.metersPerCell,
      representative: { x: origin.x + dx * midT, y: origin.y + dy * midT },
      targetCell: cellX === targetCellX && cellY === targetCellY,
    });
    if (safeExitT >= 1) break;
    if (Math.abs(tMaxX - tMaxY) <= 1e-12) {
      cellX += stepX;
      cellY += stepY;
      tMaxX += tDeltaX;
      tMaxY += tDeltaY;
    } else if (tMaxX < tMaxY) {
      cellX += stepX;
      tMaxX += tDeltaX;
    } else {
      cellY += stepY;
      tMaxY += tDeltaY;
    }
    entryT = safeExitT;
  }
  return cells;
}

function getTraceContext(map: TacticalMap): VisibilityTraceContext {
  const staticGrid = getVisibilityStaticGrid(map);
  const key = [
    staticGrid.mapVisualRevision,
    getVegetationDefinitionKey('visibility'),
    getVegetationDefinitionKey('fire'),
    staticGrid.vegetationMaterialIds.join(','),
  ].join('|');
  const cached = contextByMap.get(map);
  if (cached?.key === key) return cached;

  const visualLossPerMeter = new Float64Array(staticGrid.vegetationMaterialIds.length);
  const fireLossPerMeter = new Float64Array(staticGrid.vegetationMaterialIds.length);
  const visualMinimumTransmission = new Float64Array(staticGrid.vegetationMaterialIds.length);
  const fireMinimumTransmission = new Float64Array(staticGrid.vegetationMaterialIds.length);
  for (let index = 0; index < staticGrid.vegetationMaterialIds.length; index += 1) {
    const definition = resolveVegetationDefinition(staticGrid.vegetationMaterialIds[index]);
    visualLossPerMeter[index] = definition.visibility.transmissionLossPerMeter;
    fireLossPerMeter[index] = definition.fire.transmissionLossPerMeter;
    visualMinimumTransmission[index] = definition.visibility.minimumTransmission;
    fireMinimumTransmission[index] = definition.fire.minimumTransmission;
  }
  const context: VisibilityTraceContext = {
    staticGrid,
    key,
    visualLossPerMeter,
    fireLossPerMeter,
    visualMinimumTransmission,
    fireMinimumTransmission,
  };
  contextByMap.set(map, context);
  return context;
}

function vegetationExhausted(
  channel: VisibilityTraceChannel,
  visual: number,
  fire: number,
  visualMinimum: number,
  fireMinimum: number,
): boolean {
  const visualBlocked = visualMinimum > 0 && visual <= visualMinimum;
  const fireBlocked = fireMinimum > 0 && fire <= fireMinimum;
  if (channel === 'visual') return visualBlocked;
  if (channel === 'fire') return fireBlocked;
  return visualBlocked && fireBlocked;
}

function visibleResult(
  origin: GridPosition,
  target: GridPosition,
  totalDistanceMeters: number,
  traversedCellCount: number,
  visualTransmission: number,
  fireTransmission: number,
  accumulatedVegetationMeters: number,
): VisibilityTraceResult {
  const partial = visualTransmission < 0.995 || fireTransmission < 0.995;
  return {
    origin: { ...origin },
    target: { ...target },
    totalDistanceMeters,
    traversedCellCount,
    hardBlocked: false,
    blockerKind: 'none',
    blockerPosition: null,
    blockerDistanceMeters: null,
    visualTransmission: clamp01(visualTransmission),
    fireTransmission: clamp01(fireTransmission),
    accumulatedVegetationMeters,
    reasonRu: partial
      ? 'прямая видимость есть, но растительность ослабляет прохождение'
      : 'прямая видимость есть',
  };
}

function blockedResult(
  origin: GridPosition,
  target: GridPosition,
  totalDistanceMeters: number,
  blockerDistanceMeters: number,
  blockerKind: VisibilityTraceBlockerKind,
  blockerPosition: GridPosition,
  visualTransmission: number,
  fireTransmission: number,
  accumulatedVegetationMeters: number,
  traversedCellCount: number,
): VisibilityTraceResult {
  return {
    origin: { ...origin },
    target: { ...target },
    totalDistanceMeters,
    traversedCellCount,
    hardBlocked: true,
    blockerKind,
    blockerPosition: { ...blockerPosition },
    blockerDistanceMeters,
    visualTransmission: clamp01(visualTransmission),
    fireTransmission: clamp01(fireTransmission),
    accumulatedVegetationMeters,
    reasonRu: blockerReasonRu(blockerKind),
  };
}

function blockerReasonRu(kind: VisibilityTraceBlockerKind): string {
  if (kind === 'terrain') return 'линию обзора перекрывает рельеф';
  if (kind === 'object') return 'линию обзора перекрывает объект';
  if (kind === 'vegetation') return 'растительность почти полностью закрыла обзор';
  if (kind === 'boundary') return 'линия обзора вышла за край карты';
  return 'линия обзора перекрыта';
}

function finitePosition(position: GridPosition): GridPosition {
  return {
    x: Number.isFinite(position.x) ? position.x : Number.NEGATIVE_INFINITY,
    y: Number.isFinite(position.y) ? position.y : Number.NEGATIVE_INFINITY,
  };
}

function normalizeHeight(value: number): number {
  return Math.max(0.05, Number.isFinite(value) ? value : 0.05);
}

function insideMap(map: TacticalMap, position: GridPosition): boolean {
  return Number.isFinite(position.x)
    && Number.isFinite(position.y)
    && position.x >= 0
    && position.y >= 0
    && position.x < map.width
    && position.y < map.height;
}

function insideCell(map: TacticalMap, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
