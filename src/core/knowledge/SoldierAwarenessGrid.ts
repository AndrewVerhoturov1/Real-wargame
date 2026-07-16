import { distance, type GridPosition } from '../geometry';
import type { TacticalMap } from '../map/MapModel';
import { buildNavigationGrid } from '../pathfinding/GridNavigation';
import type { SimulationState } from '../simulation/SimulationState';
import { getDirectionalTerrainSectorBasis } from '../terrain/DirectionalTerrainSectorBasis';
import {
  getDirectionalTacticalField,
  readDirectionalTacticalCell,
  type DirectionalTacticalField,
  type DirectionalTacticalCell,
} from '../terrain/DirectionalTacticalField';
import type { UnitModel } from '../units/UnitModel';
import {
  getAwarenessStaticCell,
  getAwarenessStaticField,
  type AwarenessStaticField,
} from './AwarenessStaticField';
import {
  getSoldierDangerField,
  type SoldierDangerField,
} from './SoldierDangerField';

export type SoldierAwarenessMode = 'off' | 'all' | 'danger' | 'cover' | 'safe' | 'stealth' | 'memory' | 'uncertainty' | 'objective';

export interface SoldierAwarenessCell {
  x: number;
  y: number;
  danger: number;
  suppression: number;
  expectedProtection: number;
  expectedProtectionAgainstThreat: number;
  protectedAgainstThreatId: string | null;
  coverReliability: number;
  concealment: number;
  uncertainty: number;
  safety: number;
  confidence: number;
  terrainProtection: number;
  terrainConcealment: number;
  reverseSlopeQuality: number;
  forwardSlopeRisk: number;
  crestRisk: number;
  silhouetteRisk: number;
  valleyProtection: number;
  flankExposure: number;
  sourceRu: string;
}

export interface SoldierSafePosition {
  position: GridPosition;
  score: number;
  danger: number;
  expectedProtection: number;
  expectedProtectionAgainstThreat: number;
  protectedAgainstThreatId: string | null;
  concealment: number;
  distanceCells: number;
  sourceRu: string;
}

export interface SoldierAwarenessReport {
  unitId: string;
  cacheKey: string;
  dangerFieldKey: string;
  cells: SoldierAwarenessCell[];
  bestSafePositions: SoldierSafePosition[];
  currentPosition: SoldierAwarenessCell;
  routeDanger: number;
  threatConfidence: number;
}

interface AwarenessField {
  unitId: string;
  cacheKey: string;
  dangerFieldKey: string;
  cells: SoldierAwarenessCell[];
  threatConfidence: number;
}

interface CachedAwareness {
  key: string;
  field: AwarenessField;
  positionKey: string;
  currentPosition: SoldierAwarenessCell;
  bestSafePositions: SoldierSafePosition[];
  routeKey: string;
  routeDanger: number;
}

const cache = new WeakMap<UnitModel, CachedAwareness>();
const MAX_SAFE_POSITIONS = 8;
const SAFE_SEARCH_RADIUS_METERS = 120;
const SAFE_DISTANCE_PENALTY_PER_METER = 0.18;
const ROUTE_SAMPLE_STEP_METERS = 5;
export const KNOWLEDGE_CONFIDENCE_BUCKET = 10;
export const KNOWLEDGE_UNCERTAINTY_BUCKET = 1;

export function buildSoldierAwarenessReport(
  state: SimulationState,
  unit: UnitModel,
): SoldierAwarenessReport {
  const staticField = getAwarenessStaticField(state.map, unit.behaviorRuntime.posture);
  const directionalBasis = getDirectionalTerrainSectorBasis(state.map);
  const directionalField = getDirectionalTacticalField(state.map, {
    unitId: unit.id,
    originX: unit.position.x,
    originY: unit.position.y,
    knowledgeRevision: unit.tacticalKnowledge.revision,
    threats: unit.tacticalKnowledge.threats,
  });
  const dangerField = getSoldierDangerField(state.map, {
    unitId: unit.id,
    originX: unit.position.x,
    originY: unit.position.y,
    posture: unit.behaviorRuntime.posture,
    knowledgeRevision: unit.tacticalKnowledge.revision,
    threats: unit.tacticalKnowledge.threats,
  }, { staticField, directionalBasis });
  const key = buildCacheKey(state, unit, staticField.key, directionalField.key, dangerField.key);
  let cached = cache.get(unit);

  if (!cached || cached.key !== key) {
    const field = buildAwarenessField(state, unit, key, staticField, directionalField, dangerField);
    cached = {
      key,
      field,
      positionKey: '',
      currentPosition: field.cells[0] ?? emptyAwarenessCell(unit.position),
      bestSafePositions: [],
      routeKey: '',
      routeDanger: 0,
    };
    cache.set(unit, cached);
  }

  const positionKey = `${Math.floor(unit.position.x)}:${Math.floor(unit.position.y)}`;
  if (cached.positionKey !== positionKey) {
    cached.positionKey = positionKey;
    cached.currentPosition = awarenessCellAt(state.map, cached.field.cells, unit.position)
      ?? emptyAwarenessCell(unit.position);
    cached.bestSafePositions = buildBestSafePositions(state.map, cached.field.cells, unit.position);
  }

  const routeKey = buildRouteKey(unit);
  if (routeKey !== cached.routeKey) {
    cached.routeKey = routeKey;
    cached.routeDanger = unit.order
      ? evaluateRouteDangerFromField(state.map, cached.field.cells, unit.position, unit.order.target)
      : cached.currentPosition.danger;
  }

  return {
    ...cached.field,
    currentPosition: cached.currentPosition,
    bestSafePositions: cached.bestSafePositions,
    routeDanger: cached.routeDanger,
  };
}

function buildAwarenessField(
  state: SimulationState,
  unit: UnitModel,
  key: string,
  staticField: AwarenessStaticField,
  directionalField: DirectionalTacticalField,
  dangerField: SoldierDangerField,
): AwarenessField {
  const cells: SoldierAwarenessCell[] = new Array(state.map.width * state.map.height);
  for (let y = 0; y < state.map.height; y += 1) {
    for (let x = 0; x < state.map.width; x += 1) {
      const index = y * state.map.width + x;
      cells[index] = evaluateAwarenessFieldCell(
        unit,
        { x: x + 0.5, y: y + 0.5 },
        index,
        staticField,
        directionalField,
        dangerField,
      );
    }
  }

  return {
    unitId: unit.id,
    cacheKey: key,
    dangerFieldKey: dangerField.key,
    cells,
    threatConfidence: currentThreatConfidence(unit),
  };
}

function currentThreatConfidence(unit: UnitModel): number {
  return unit.tacticalKnowledge.threats.length > 0
    ? Math.round(Math.max(...unit.tacticalKnowledge.threats.map((threat) => threat.confidence)))
    : 0;
}

function buildBestSafePositions(
  map: TacticalMap,
  cells: SoldierAwarenessCell[],
  unitPosition: GridPosition,
): SoldierSafePosition[] {
  const searchRadiusCells = SAFE_SEARCH_RADIUS_METERS / Math.max(0.001, map.metersPerCell);
  const searchRadiusSquared = searchRadiusCells * searchRadiusCells;
  const minX = Math.max(0, Math.floor(unitPosition.x - searchRadiusCells));
  const maxX = Math.min(map.width - 1, Math.ceil(unitPosition.x + searchRadiusCells));
  const minY = Math.max(0, Math.floor(unitPosition.y - searchRadiusCells));
  const maxY = Math.min(map.height - 1, Math.ceil(unitPosition.y + searchRadiusCells));
  const navigation = buildNavigationGrid(map);
  const best: SoldierSafePosition[] = [];

  for (let y = minY; y <= maxY; y += 1) {
    const positionY = y + 0.5;
    const dy = positionY - unitPosition.y;
    for (let x = minX; x <= maxX; x += 1) {
      const index = y * map.width + x;
      const cell = cells[index];
      if (!cell || navigation.cells[index]?.passable !== true) continue;
      const positionX = x + 0.5;
      const dx = positionX - unitPosition.x;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared > searchRadiusSquared) continue;
      const distanceCells = Math.sqrt(distanceSquared);
      const distanceMeters = distanceCells * map.metersPerCell;
      const score = cell.safety - distanceMeters * SAFE_DISTANCE_PENALTY_PER_METER;
      if (score <= 18) continue;
      if (best.length === MAX_SAFE_POSITIONS && score <= best[MAX_SAFE_POSITIONS - 1].score) continue;

      let insertionIndex = 0;
      while (insertionIndex < best.length && best[insertionIndex].score >= score) insertionIndex += 1;
      best.splice(insertionIndex, 0, {
        position: { x: positionX, y: positionY },
        score,
        danger: cell.danger,
        expectedProtection: cell.expectedProtection,
        expectedProtectionAgainstThreat: cell.expectedProtectionAgainstThreat,
        protectedAgainstThreatId: cell.protectedAgainstThreatId,
        concealment: cell.concealment,
        distanceCells,
        sourceRu: cell.sourceRu,
      });
      if (best.length > MAX_SAFE_POSITIONS) best.pop();
    }
  }

  return best;
}

export function evaluateRouteDanger(
  state: SimulationState,
  unit: UnitModel,
  start: GridPosition,
  end: GridPosition,
): number {
  const report = buildSoldierAwarenessReport(state, unit);
  return evaluateRouteDangerFromField(state.map, report.cells, start, end);
}

function evaluateRouteDangerFromField(
  map: TacticalMap,
  cells: SoldierAwarenessCell[],
  start: GridPosition,
  end: GridPosition,
): number {
  const lengthMeters = distance(start, end) * map.metersPerCell;
  const samples = Math.max(2, Math.ceil(lengthMeters / ROUTE_SAMPLE_STEP_METERS));
  let total = 0;
  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples;
    const point = { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
    total += awarenessCellAt(map, cells, point)?.danger ?? 0;
  }
  return Math.round(total / (samples + 1));
}

function evaluateAwarenessFieldCell(
  unit: UnitModel,
  position: GridPosition,
  cellIndex: number,
  staticField: AwarenessStaticField,
  directionalField: DirectionalTacticalField,
  dangerField: SoldierDangerField,
): SoldierAwarenessCell {
  const local = getAwarenessStaticCell(staticField, position);
  const directional = readDirectionalTacticalCell(
    directionalField,
    Math.floor(position.x),
    Math.floor(position.y),
  ) ?? emptyDirectionalCell();
  const expectedProtection = combinePercent(local.expectedProtection, directional.terrainProtection);
  const concealment = combinePercent(local.concealment, directional.terrainConcealment);
  const coverReliability = clampPercent(Math.max(
    local.reliability,
    directional.terrainProtection * 0.82,
  ));
  const danger = dangerField.danger[cellIndex] ?? 0;
  const suppression = dangerField.suppression[cellIndex] ?? 0;
  const confidence = dangerField.confidence[cellIndex] ?? 0;
  const uncertainty = dangerField.uncertainty[cellIndex] ?? 0;
  const expectedProtectionAgainstThreat = dangerField.expectedProtectionAgainstThreat[cellIndex] ?? 0;
  const protectedIndex = dangerField.protectedThreatIndex[cellIndex] ?? -1;
  const protectedAgainstThreatId = protectedIndex >= 0
    ? dangerField.threatIds[protectedIndex] ?? null
    : null;
  const safety = clampPercent(
    expectedProtection * 0.58
      + concealment * 0.24
      + (100 - danger) * 0.45
      - suppression * 0.16
      - uncertainty * 0.08
      - local.terrainPenalty
      - directional.forwardSlopeRisk * 0.10
      - directional.silhouetteRisk * 0.15
      - directional.flankExposure * 0.08,
  );

  return {
    x: Math.floor(position.x),
    y: Math.floor(position.y),
    danger,
    suppression,
    expectedProtection,
    expectedProtectionAgainstThreat,
    protectedAgainstThreatId,
    coverReliability,
    concealment,
    uncertainty,
    safety,
    confidence,
    terrainProtection: directional.terrainProtection,
    terrainConcealment: directional.terrainConcealment,
    reverseSlopeQuality: directional.reverseSlopeProtection,
    forwardSlopeRisk: directional.forwardSlopeRisk,
    crestRisk: directional.crestRisk,
    silhouetteRisk: directional.silhouetteRisk,
    valleyProtection: directional.valleyProtection,
    flankExposure: directional.flankExposure,
    sourceRu: awarenessSourceRu(unit, local.sourceRu, directional),
  };
}

function buildCacheKey(
  state: SimulationState,
  unit: UnitModel,
  staticFieldKey: string,
  directionalFieldKey: string,
  dangerFieldKey: string,
): string {
  return [
    unit.id,
    buildAwarenessKnowledgeKey(unit),
    unit.behaviorRuntime.posture,
    state.map.cellSize,
    staticFieldKey,
    directionalFieldKey,
    dangerFieldKey,
  ].join(':');
}

export function buildAwarenessKnowledgeKey(unit: UnitModel): string {
  return unit.tacticalKnowledge.threats.map((threat) => [
    threat.id,
    threat.mode,
    quantize(threat.x, 0.25),
    quantize(threat.y, 0.25),
    quantize(threat.radiusCells, 0.5),
    quantize(threat.widthCells, 0.5),
    quantize(threat.heightCells, 0.5),
    quantize(threat.rotationDegrees, 5),
    quantize(threat.directionDegrees, 5),
    quantize(threat.arcDegrees, 5),
    quantize(threat.rangeCells, 1),
    quantize(threat.minRangeCells, 1),
    quantize(threat.falloffPercent, 5),
    quantize(threat.strength, 5),
    quantize(threat.suppression, 5),
    quantize(threat.confidence, KNOWLEDGE_CONFIDENCE_BUCKET),
    quantize(threat.uncertaintyCells, KNOWLEDGE_UNCERTAINTY_BUCKET),
  ].join(',')).sort().join('|');
}

function buildRouteKey(unit: UnitModel): string {
  if (!unit.order) return 'none';
  return `${unit.order.type}:${unit.order.target.x.toFixed(2)}:${unit.order.target.y.toFixed(2)}:${unit.order.pathRevision}`;
}

function awarenessCellAt(
  map: TacticalMap,
  cells: SoldierAwarenessCell[],
  position: GridPosition,
): SoldierAwarenessCell | undefined {
  const x = Math.max(0, Math.min(map.width - 1, Math.floor(position.x)));
  const y = Math.max(0, Math.min(map.height - 1, Math.floor(position.y)));
  return cells[y * map.width + x];
}

function awarenessSourceRu(
  unit: UnitModel,
  localSource: string,
  directional: DirectionalTacticalCell,
): string {
  if (unit.tacticalKnowledge.threats.length === 0) return localSource;
  if (directional.reverseSlopeProtection >= 45) return `${localSource}; обратный склон относительно известной угрозы`;
  if (directional.valleyProtection >= 45) return `${localSource}; низина относительно известной угрозы`;
  if (directional.silhouetteRisk >= 55) return `${localSource}; риск силуэта относительно известной угрозы`;
  if (directional.crestRisk >= 55) return `${localSource}; гребень относительно известной угрозы`;
  return `${localSource}; оценка относительно известной угрозы`;
}

function emptyAwarenessCell(position: GridPosition): SoldierAwarenessCell {
  return {
    x: Math.floor(position.x),
    y: Math.floor(position.y),
    danger: 0,
    suppression: 0,
    expectedProtection: 0,
    expectedProtectionAgainstThreat: 0,
    protectedAgainstThreatId: null,
    coverReliability: 0,
    concealment: 0,
    uncertainty: 0,
    safety: 0,
    confidence: 0,
    terrainProtection: 0,
    terrainConcealment: 0,
    reverseSlopeQuality: 0,
    forwardSlopeRisk: 0,
    crestRisk: 0,
    silhouetteRisk: 0,
    valleyProtection: 0,
    flankExposure: 0,
    sourceRu: 'нет данных',
  };
}

function emptyDirectionalCell(): DirectionalTacticalCell {
  return {
    terrainProtection: 0,
    terrainConcealment: 0,
    reverseSlopeProtection: 0,
    forwardSlopeRisk: 0,
    crestRisk: 0,
    silhouetteRisk: 0,
    valleyProtection: 0,
    flankExposure: 0,
  };
}

function combinePercent(base: number, addition: number): number {
  const base01 = clampPercent(base) / 100;
  const addition01 = clampPercent(addition) / 100;
  return clampPercent((1 - (1 - base01) * (1 - addition01)) * 100);
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function quantize(value: number, bucket: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) / bucket) * bucket;
}
