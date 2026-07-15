import type { UnitPosture } from '../behavior/BehaviorModel';
import {
  getThreatRelativeCoverField,
  readThreatRelativeCoverProtection,
  type ThreatRelativeCoverField,
} from '../cover/ThreatRelativeCoverField';
import { distance, type GridPosition } from '../geometry';
import type { TacticalMap } from '../map/MapModel';
import type { SimulationState } from '../simulation/SimulationState';
import {
  getDirectionalTacticalField,
  readDirectionalExposureForBearing,
  readDirectionalProtectionForBearing,
  readDirectionalTacticalCell,
  type DirectionalTacticalField,
  type DirectionalTacticalCell,
} from '../terrain/DirectionalTacticalField';
import type { KnownThreatMemory, UnitModel } from '../units/UnitModel';
import {
  getAwarenessStaticCell,
  getAwarenessStaticField,
  type AwarenessStaticField,
} from './AwarenessStaticField';

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
  cells: SoldierAwarenessCell[];
  bestSafePositions: SoldierSafePosition[];
  currentPosition: SoldierAwarenessCell;
  routeDanger: number;
  threatConfidence: number;
}

interface AwarenessField {
  unitId: string;
  cacheKey: string;
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

type ThreatCoverFields = ReadonlyMap<string, ThreatRelativeCoverField>;

const cache = new WeakMap<UnitModel, CachedAwareness>();
const MAX_SAFE_POSITIONS = 8;
const SAFE_SEARCH_RADIUS_METERS = 120;
const SAFE_DISTANCE_PENALTY_PER_METER = 0.18;
const ROUTE_SAMPLE_STEP_METERS = 5;
const UNCERTAINTY_SCORE_PER_METER = 0.5;
const DIRECTIONAL_UNCERTAINTY_ARC_DEGREES_PER_METER = 1;
export const KNOWLEDGE_CONFIDENCE_BUCKET = 10;
export const KNOWLEDGE_UNCERTAINTY_BUCKET = 1;

export function buildSoldierAwarenessReport(
  state: SimulationState,
  unit: UnitModel,
): SoldierAwarenessReport {
  const staticField = getAwarenessStaticField(state.map, unit.behaviorRuntime.posture);
  const directionalField = getDirectionalTacticalField(state.map, {
    unitId: unit.id,
    originX: unit.position.x,
    originY: unit.position.y,
    knowledgeRevision: unit.tacticalKnowledge.revision,
    threats: unit.tacticalKnowledge.threats,
  });
  const key = buildCacheKey(state, unit, staticField.key, directionalField.key);
  let cached = cache.get(unit);

  if (!cached || cached.key !== key) {
    const field = buildAwarenessField(state, unit, key, staticField, directionalField);
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
): AwarenessField {
  const cells: SoldierAwarenessCell[] = new Array(state.map.width * state.map.height);
  const threatCoverFields = buildThreatCoverFields(state.map, unit);
  for (let y = 0; y < state.map.height; y += 1) {
    for (let x = 0; x < state.map.width; x += 1) {
      cells[y * state.map.width + x] = evaluateAwarenessFieldCell(
        state.map,
        unit,
        { x: x + 0.5, y: y + 0.5 },
        staticField,
        directionalField,
        threatCoverFields,
      );
    }
  }

  const threatConfidence = unit.tacticalKnowledge.threats.length > 0
    ? Math.round(Math.max(...unit.tacticalKnowledge.threats.map((threat) => threat.confidence)))
    : 0;

  return {
    unitId: unit.id,
    cacheKey: key,
    cells,
    threatConfidence,
  };
}

function buildBestSafePositions(
  map: TacticalMap,
  cells: SoldierAwarenessCell[],
  unitPosition: GridPosition,
): SoldierSafePosition[] {
  const searchRadiusCells = SAFE_SEARCH_RADIUS_METERS / Math.max(0.001, map.metersPerCell);
  const minX = Math.max(0, Math.floor(unitPosition.x - searchRadiusCells));
  const maxX = Math.min(map.width - 1, Math.ceil(unitPosition.x + searchRadiusCells));
  const minY = Math.max(0, Math.floor(unitPosition.y - searchRadiusCells));
  const maxY = Math.min(map.height - 1, Math.ceil(unitPosition.y + searchRadiusCells));
  const candidates: SoldierSafePosition[] = [];

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const cell = cells[y * map.width + x];
      if (!cell) continue;
      const position = { x: x + 0.5, y: y + 0.5 };
      const distanceCells = distance(unitPosition, position);
      const distanceMeters = distanceCells * map.metersPerCell;
      if (distanceMeters > SAFE_SEARCH_RADIUS_METERS) continue;
      const score = cell.safety - distanceMeters * SAFE_DISTANCE_PENALTY_PER_METER;
      if (score <= 18) continue;
      candidates.push({
        position,
        score,
        danger: cell.danger,
        expectedProtection: cell.expectedProtection,
        expectedProtectionAgainstThreat: cell.expectedProtectionAgainstThreat,
        protectedAgainstThreatId: cell.protectedAgainstThreatId,
        concealment: cell.concealment,
        distanceCells,
        sourceRu: cell.sourceRu,
      });
    }
  }

  return candidates
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_SAFE_POSITIONS);
}

export function evaluateRouteDanger(
  state: SimulationState,
  unit: UnitModel,
  start: GridPosition,
  end: GridPosition,
): number {
  const staticField = getAwarenessStaticField(state.map, unit.behaviorRuntime.posture);
  const directionalField = getDirectionalTacticalField(state.map, {
    unitId: unit.id,
    originX: unit.position.x,
    originY: unit.position.y,
    knowledgeRevision: unit.tacticalKnowledge.revision,
    threats: unit.tacticalKnowledge.threats,
  });
  const threatCoverFields = buildThreatCoverFields(state.map, unit);
  const lengthMeters = distance(start, end) * state.map.metersPerCell;
  const samples = Math.max(2, Math.ceil(lengthMeters / ROUTE_SAMPLE_STEP_METERS));
  let total = 0;
  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples;
    const point = { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
    total += evaluateAwarenessFieldCell(
      state.map,
      unit,
      point,
      staticField,
      directionalField,
      threatCoverFields,
    ).danger;
  }
  return Math.round(total / (samples + 1));
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

function buildThreatCoverFields(map: TacticalMap, unit: UnitModel): ThreatCoverFields {
  const fields = new Map<string, ThreatRelativeCoverField>();
  for (const threat of unit.tacticalKnowledge.threats) {
    if (threat.mode !== 'directional_fire') continue;
    fields.set(threat.id, getThreatRelativeCoverField(map, {
      threatId: threat.id,
      threatPosition: { x: threat.x, y: threat.y },
      posture: unit.behaviorRuntime.posture,
    }));
  }
  return fields;
}

function evaluateAwarenessFieldCell(
  map: TacticalMap,
  unit: UnitModel,
  position: GridPosition,
  staticField: AwarenessStaticField,
  directionalField: DirectionalTacticalField,
  threatCoverFields: ThreatCoverFields,
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
  let remainingSafe = 1;
  let remainingUnsuppressed = 1;
  let confidenceTotal = 0;
  let confidenceWeight = 0;
  let uncertainty = 0;
  let expectedProtectionAgainstThreat = 0;
  let protectedAgainstThreatId: string | null = null;

  for (const threat of unit.tacticalKnowledge.threats) {
    const factor = threatFactorAtPosition(position, threat, staticField.metersPerCell);
    if (factor <= 0) continue;
    const confidenceFactor = threat.confidence / 100;
    const bearingToThreat = Math.atan2(threat.y - position.y, threat.x - position.x);
    const terrainProtection = readDirectionalProtectionForBearing(
      directionalField,
      position.x,
      position.y,
      bearingToThreat,
    );
    const terrainExposure = readDirectionalExposureForBearing(
      directionalField,
      position.x,
      position.y,
      bearingToThreat,
    );
    const threatProtection = threat.mode === 'directional_fire'
      ? combinePercent(
          readThreatRelativeCoverProtection(threatCoverFields.get(threat.id)!, position),
          terrainProtection,
        )
      : combinePercent(local.expectedProtection, terrainProtection * 0.35);
    if (threatProtection > expectedProtectionAgainstThreat) {
      expectedProtectionAgainstThreat = threatProtection;
      protectedAgainstThreatId = threat.id;
    }
    const uncovered = 1 - threatProtection / 100;
    const exposureFactor = threat.mode === 'directional_fire'
      ? 0.72 + terrainExposure / 100 * 0.28
      : 1;
    const danger = clampPercent(threat.strength * factor * confidenceFactor * uncovered * exposureFactor);
    const suppression = clampPercent(threat.suppression * factor * confidenceFactor * uncovered * exposureFactor);
    remainingSafe *= 1 - danger / 100;
    remainingUnsuppressed *= 1 - suppression / 100;
    confidenceTotal += threat.confidence * factor;
    confidenceWeight += factor;
    const uncertaintyMeters = threat.uncertaintyCells * staticField.metersPerCell;
    uncertainty = Math.max(
      uncertainty,
      clampPercent((100 - threat.confidence) + uncertaintyMeters * UNCERTAINTY_SCORE_PER_METER),
    );
  }

  const danger = clampPercent(100 * (1 - remainingSafe));
  const suppression = clampPercent(100 * (1 - remainingUnsuppressed));
  const confidence = confidenceWeight > 0 ? clampPercent(confidenceTotal / confidenceWeight) : 0;
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

function threatFactorAtPosition(
  position: GridPosition,
  threat: KnownThreatMemory,
  metersPerCell: number,
): number {
  const dx = position.x - threat.x;
  const dy = position.y - threat.y;
  const range = Math.hypot(dx, dy);
  const uncertaintyBonus = threat.uncertaintyCells;

  if (threat.mode === 'directional_fire') {
    if (range < Math.max(0, threat.minRangeCells - uncertaintyBonus)) return 0;
    if (range > threat.rangeCells + uncertaintyBonus) return 0;
    const bearing = normalizeDegrees(Math.atan2(dy, dx) * 180 / Math.PI);
    const uncertaintyMeters = uncertaintyBonus * metersPerCell;
    const allowedArc = Math.min(
      360,
      threat.arcDegrees + uncertaintyMeters * DIRECTIONAL_UNCERTAINTY_ARC_DEGREES_PER_METER,
    );
    if (angularDifference(bearing, threat.directionDegrees) > allowedArc / 2) return 0;
    const progress = Math.max(0, Math.min(1, (range - threat.minRangeCells) / Math.max(0.001, threat.rangeCells - threat.minRangeCells)));
    return Math.max(0.05, 1 - progress * threat.falloffPercent / 100);
  }

  if (threat.radiusCells > 0) {
    return range <= threat.radiusCells + uncertaintyBonus
      ? Math.max(0.2, 1 - range / Math.max(1, threat.radiusCells + uncertaintyBonus) * 0.35)
      : 0;
  }

  const rotation = -(threat.rotationDegrees ?? 0) * Math.PI / 180;
  const localX = dx * Math.cos(rotation) - dy * Math.sin(rotation);
  const localY = dx * Math.sin(rotation) + dy * Math.cos(rotation);
  return Math.abs(localX) <= threat.widthCells / 2 + uncertaintyBonus
    && Math.abs(localY) <= threat.heightCells / 2 + uncertaintyBonus
    ? 1
    : 0;
}

function buildCacheKey(
  state: SimulationState,
  unit: UnitModel,
  staticFieldKey: string,
  directionalFieldKey: string,
): string {
  return [
    unit.id,
    buildAwarenessKnowledgeKey(unit),
    unit.behaviorRuntime.posture,
    state.map.cellSize,
    staticFieldKey,
    directionalFieldKey,
  ].join('#');
}

function buildRouteKey(unit: UnitModel): string {
  const position = `${Math.floor(unit.position.x)}:${Math.floor(unit.position.y)}`;
  const target = unit.order
    ? `${Math.floor(unit.order.target.x)}:${Math.floor(unit.order.target.y)}`
    : 'none';
  return [position, target, unit.behaviorRuntime.posture, buildAwarenessKnowledgeKey(unit)].join(':');
}

export function buildAwarenessKnowledgeKey(unit: UnitModel): string {
  return unit.tacticalKnowledge.threats.map((threat) => [
    threat.id,
    threat.mode,
    quantize(threat.x, 0.05),
    quantize(threat.y, 0.05),
    quantize(threat.radiusCells, 0.1),
    quantize(threat.widthCells, 0.1),
    quantize(threat.heightCells, 0.1),
    quantize(threat.rotationDegrees, 1),
    quantize(threat.strength, 1),
    quantize(threat.suppression, 1),
    quantize(threat.directionDegrees, 1),
    quantize(threat.arcDegrees, 1),
    quantize(threat.rangeCells, 0.1),
    quantize(threat.minRangeCells, 0.1),
    quantize(threat.falloffPercent, 1),
    quantize(threat.confidence, KNOWLEDGE_CONFIDENCE_BUCKET),
    quantize(threat.uncertaintyCells, KNOWLEDGE_UNCERTAINTY_BUCKET),
    threat.source,
    threat.visibleNow ? '1' : '0',
  ].join(':')).join('|');
}

function awarenessCellAt(
  map: TacticalMap,
  cells: SoldierAwarenessCell[],
  position: GridPosition,
): SoldierAwarenessCell | undefined {
  const x = Math.floor(position.x);
  const y = Math.floor(position.y);
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return undefined;
  return cells[y * map.width + x];
}

function awarenessSourceRu(
  unit: UnitModel,
  localSourceRu: string,
  directional: DirectionalTacticalCell,
): string {
  if (unit.tacticalKnowledge.threats.length === 0) {
    return localSourceRu === 'открытая местность' ? 'нет известной угрозы' : localSourceRu;
  }
  const terrainMeaningful = directional.terrainProtection >= 15
    || directional.terrainConcealment >= 15
    || directional.silhouetteRisk >= 35;
  if (!terrainMeaningful) return localSourceRu;
  if (localSourceRu === 'открытая местность') return directional.sourceRu;
  if (localSourceRu === directional.sourceRu) return localSourceRu;
  return `${localSourceRu} + ${directional.sourceRu}`;
}

function combinePercent(base: number, addition: number): number {
  const base01 = clampPercent(base) / 100;
  const addition01 = clampPercent(addition) / 100;
  return clampPercent((1 - (1 - base01) * (1 - addition01)) * 100);
}

function emptyDirectionalCell(): DirectionalTacticalCell {
  return {
    primarySlope: 0,
    forwardSlopeRisk: 0,
    reverseSlopeProtection: 0,
    crestRisk: 0,
    valleyProtection: 0,
    silhouetteRisk: 0,
    primaryThreatExposure: 0,
    flankExposure: 0,
    terrainProtection: 0,
    terrainConcealment: 0,
    sourceRu: 'открытый склон',
  };
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
    safety: 100,
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

function quantize(value: number, bucket: number): number {
  return Math.round(value / bucket) * bucket;
}

function normalizeDegrees(value: number): number {
  const result = value % 360;
  return result < 0 ? result + 360 : result;
}

function angularDifference(left: number, right: number): number {
  const difference = Math.abs(normalizeDegrees(left) - normalizeDegrees(right));
  return Math.min(difference, 360 - difference);
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
