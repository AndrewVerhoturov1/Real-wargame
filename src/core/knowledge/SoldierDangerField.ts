import type { UnitPosture } from '../behavior/BehaviorModel';
import {
  getThreatRelativeCoverField,
  type ThreatRelativeCoverField,
} from '../cover/ThreatRelativeCoverField';
import type { GridPosition } from '../geometry';
import type { TacticalMap } from '../map/MapModel';
import {
  getDirectionalTacticalField,
  readDirectionalExposureForBearing,
  readDirectionalProtectionForBearing,
  type DirectionalTacticalField,
} from '../terrain/DirectionalTacticalField';
import type { FireThreatClass } from '../units/UnitModel';
import {
  getAwarenessStaticField,
  type AwarenessStaticField,
} from './AwarenessStaticField';

const GEOMETRY_CACHE_LIMIT = 16;
const FIELD_CACHE_LIMIT = 24;
const DIRECTIONAL_UNCERTAINTY_ARC_DEGREES_PER_METER = 1;
const UNCERTAINTY_SCORE_PER_METER = 0.5;

export interface SoldierDangerThreat {
  readonly id: string;
  readonly mode: 'area' | 'directional_fire';
  readonly x: number;
  readonly y: number;
  readonly radiusCells: number;
  readonly widthCells: number;
  readonly heightCells: number;
  readonly rotationDegrees: number;
  readonly strength: number;
  readonly suppression: number;
  readonly confidence: number;
  readonly uncertaintyCells: number;
  readonly directionDegrees: number;
  readonly arcDegrees: number;
  readonly rangeCells: number;
  readonly minRangeCells: number;
  readonly falloffPercent: number;
  readonly fireThreatClass?: FireThreatClass | null;
}

export interface SoldierDangerFieldContext {
  readonly unitId: string;
  readonly originX: number;
  readonly originY: number;
  readonly posture: UnitPosture;
  readonly knowledgeRevision: number;
  readonly threats: readonly SoldierDangerThreat[];
}

export interface SoldierDangerField {
  readonly key: string;
  readonly geometryKey: string;
  readonly width: number;
  readonly height: number;
  readonly danger: Uint8Array;
  readonly suppression: Uint8Array;
  readonly confidence: Uint8Array;
  readonly uncertainty: Uint8Array;
  readonly expectedProtectionAgainstThreat: Uint8Array;
  readonly protectedThreatIndex: Int16Array;
  readonly threatIds: readonly string[];
}

export interface SoldierDangerFieldDiagnostics {
  readonly geometryBuildCount: number;
  readonly fieldBuildCount: number;
  readonly geometryCacheHitCount: number;
  readonly fieldCacheHitCount: number;
  readonly fullMapScanCount: number;
  readonly cachedGeometryCount: number;
  readonly cachedFieldCount: number;
  readonly lastGeometryKey: string;
  readonly lastFieldKey: string;
}

interface ThreatCellGeometry {
  readonly threatId: string;
  readonly factor: Float32Array;
  readonly protection: Uint8Array;
  readonly exposureFactor: Float32Array;
  readonly uncertaintyMeters: number;
}

interface DangerGeometry {
  readonly key: string;
  readonly threatGeometry: readonly ThreatCellGeometry[];
}

interface MutableDiagnostics {
  geometryBuildCount: number;
  fieldBuildCount: number;
  geometryCacheHitCount: number;
  fieldCacheHitCount: number;
  fullMapScanCount: number;
  lastGeometryKey: string;
  lastFieldKey: string;
}

interface MapCache {
  readonly geometries: Map<string, DangerGeometry>;
  readonly fields: Map<string, SoldierDangerField>;
  readonly diagnostics: MutableDiagnostics;
}

const cacheByMap = new WeakMap<TacticalMap, MapCache>();

export function getSoldierDangerField(
  map: TacticalMap,
  context: SoldierDangerFieldContext,
): SoldierDangerField {
  const cache = getMapCache(map);
  const staticField = getAwarenessStaticField(map, context.posture);
  const directionalField = getDirectionalTacticalField(map, {
    unitId: context.unitId,
    originX: context.originX,
    originY: context.originY,
    knowledgeRevision: context.knowledgeRevision,
    threats: context.threats,
  });
  const geometryKey = buildGeometryKey(staticField.key, directionalField.key, context);
  let geometry = cache.geometries.get(geometryKey);
  if (geometry) {
    cache.diagnostics.geometryCacheHitCount += 1;
    touch(cache.geometries, geometryKey, geometry);
  } else {
    geometry = buildDangerGeometry(map, context, staticField, directionalField, geometryKey);
    cache.geometries.set(geometryKey, geometry);
    trimCache(cache.geometries, GEOMETRY_CACHE_LIMIT);
    cache.diagnostics.geometryBuildCount += 1;
    cache.diagnostics.fullMapScanCount += 1;
  }
  cache.diagnostics.lastGeometryKey = geometryKey;

  const fieldKey = buildFieldKey(geometryKey, context.threats);
  const existing = cache.fields.get(fieldKey);
  if (existing) {
    cache.diagnostics.fieldCacheHitCount += 1;
    cache.diagnostics.lastFieldKey = fieldKey;
    touch(cache.fields, fieldKey, existing);
    return existing;
  }

  const field = scoreDangerField(map, context.threats, geometry, fieldKey);
  cache.fields.set(fieldKey, field);
  trimCache(cache.fields, FIELD_CACHE_LIMIT);
  cache.diagnostics.fieldBuildCount += 1;
  cache.diagnostics.lastFieldKey = fieldKey;
  return field;
}

export function getSoldierDangerFieldDiagnostics(map: TacticalMap): SoldierDangerFieldDiagnostics {
  const cache = cacheByMap.get(map);
  if (!cache) {
    return {
      geometryBuildCount: 0,
      fieldBuildCount: 0,
      geometryCacheHitCount: 0,
      fieldCacheHitCount: 0,
      fullMapScanCount: 0,
      cachedGeometryCount: 0,
      cachedFieldCount: 0,
      lastGeometryKey: '',
      lastFieldKey: '',
    };
  }
  return {
    ...cache.diagnostics,
    cachedGeometryCount: cache.geometries.size,
    cachedFieldCount: cache.fields.size,
  };
}

export function readSoldierDangerAt(
  field: SoldierDangerField,
  position: GridPosition,
): number {
  const x = Math.floor(position.x);
  const y = Math.floor(position.y);
  if (x < 0 || y < 0 || x >= field.width || y >= field.height) return 0;
  return field.danger[y * field.width + x] ?? 0;
}

function buildDangerGeometry(
  map: TacticalMap,
  context: SoldierDangerFieldContext,
  staticField: AwarenessStaticField,
  directionalField: DirectionalTacticalField,
  key: string,
): DangerGeometry {
  const cellCount = map.width * map.height;
  const threatGeometry: ThreatCellGeometry[] = [];

  for (const threat of context.threats) {
    const factor = new Float32Array(cellCount);
    const protection = new Uint8Array(cellCount);
    const exposureFactor = new Float32Array(cellCount);
    const coverField = threat.mode === 'directional_fire'
      ? getThreatRelativeCoverField(map, {
          threatId: threat.id,
          threatPosition: { x: threat.x, y: threat.y },
          posture: context.posture,
        })
      : null;

    for (let y = 0; y < map.height; y += 1) {
      for (let x = 0; x < map.width; x += 1) {
        const index = y * map.width + x;
        const position = { x: x + 0.5, y: y + 0.5 };
        const threatFactor = threatFactorAtPosition(position, threat, staticField.metersPerCell);
        if (threatFactor <= 0) continue;

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
          ? combinePercent(coverProtectionAt(coverField!, index), terrainProtection)
          : combinePercent(staticField.expectedProtection[index] ?? 0, terrainProtection * 0.35);

        factor[index] = threatFactor;
        protection[index] = threatProtection;
        exposureFactor[index] = threat.mode === 'directional_fire'
          ? 0.72 + terrainExposure / 100 * 0.28
          : 1;
      }
    }

    threatGeometry.push({
      threatId: threat.id,
      factor,
      protection,
      exposureFactor,
      uncertaintyMeters: threat.uncertaintyCells * staticField.metersPerCell,
    });
  }

  return { key, threatGeometry };
}

function scoreDangerField(
  map: TacticalMap,
  threats: readonly SoldierDangerThreat[],
  geometry: DangerGeometry,
  key: string,
): SoldierDangerField {
  const cellCount = map.width * map.height;
  const danger = new Uint8Array(cellCount);
  const suppression = new Uint8Array(cellCount);
  const confidence = new Uint8Array(cellCount);
  const uncertainty = new Uint8Array(cellCount);
  const expectedProtectionAgainstThreat = new Uint8Array(cellCount);
  const protectedThreatIndex = new Int16Array(cellCount);
  protectedThreatIndex.fill(-1);

  for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) {
    let remainingSafe = 1;
    let remainingUnsuppressed = 1;
    let rifleMaximum = 0;
    let machineGunMaximum = 0;
    let confidenceTotal = 0;
    let confidenceWeight = 0;
    let cellUncertainty = 0;
    let strongestProtection = 0;
    let strongestProtectionIndex = -1;

    for (let threatIndex = 0; threatIndex < threats.length; threatIndex += 1) {
      const threat = threats[threatIndex];
      const threatGeometry = geometry.threatGeometry[threatIndex];
      if (!threatGeometry || threatGeometry.threatId !== threat.id) continue;
      const factor = threatGeometry.factor[cellIndex] ?? 0;
      if (factor <= 0) continue;

      const threatProtection = threatGeometry.protection[cellIndex] ?? 0;
      if (threatProtection > strongestProtection) {
        strongestProtection = threatProtection;
        strongestProtectionIndex = threatIndex;
      }

      const confidenceFactor = clampPercent(threat.confidence) / 100;
      const uncovered = 1 - threatProtection / 100;
      const exposure = threatGeometry.exposureFactor[cellIndex] || 1;
      const individualDanger = clampPercent(threat.strength * factor * confidenceFactor * uncovered * exposure);
      const individualSuppression = clampPercent(threat.suppression * factor * confidenceFactor * uncovered * exposure);
      const fireClass = fireThreatClassForAggregation(threat);
      if (fireClass === 'rifle_fire') rifleMaximum = Math.max(rifleMaximum, individualDanger);
      else if (fireClass === 'machine_gun_fire') machineGunMaximum = Math.max(machineGunMaximum, individualDanger);
      else remainingSafe *= 1 - individualDanger / 100;
      remainingUnsuppressed *= 1 - individualSuppression / 100;

      confidenceTotal += threat.confidence * factor;
      confidenceWeight += factor;
      cellUncertainty = Math.max(
        cellUncertainty,
        clampPercent((100 - threat.confidence) + threatGeometry.uncertaintyMeters * UNCERTAINTY_SCORE_PER_METER),
      );
    }

    if (rifleMaximum > 0) remainingSafe *= 1 - rifleMaximum / 100;
    if (machineGunMaximum > 0) remainingSafe *= 1 - machineGunMaximum / 100;
    danger[cellIndex] = clampPercent(100 * (1 - remainingSafe));
    suppression[cellIndex] = clampPercent(100 * (1 - remainingUnsuppressed));
    confidence[cellIndex] = confidenceWeight > 0 ? clampPercent(confidenceTotal / confidenceWeight) : 0;
    uncertainty[cellIndex] = cellUncertainty;
    expectedProtectionAgainstThreat[cellIndex] = strongestProtection;
    protectedThreatIndex[cellIndex] = strongestProtectionIndex;
  }

  return {
    key,
    geometryKey: geometry.key,
    width: map.width,
    height: map.height,
    danger,
    suppression,
    confidence,
    uncertainty,
    expectedProtectionAgainstThreat,
    protectedThreatIndex,
    threatIds: threats.map((threat) => threat.id),
  };
}

function fireThreatClassForAggregation(threat: SoldierDangerThreat): FireThreatClass | null {
  if (!threat.id.startsWith('unit:')) return null;
  return threat.fireThreatClass === 'machine_gun_fire' ? 'machine_gun_fire' : 'rifle_fire';
}

function buildGeometryKey(
  staticFieldKey: string,
  directionalFieldKey: string,
  context: SoldierDangerFieldContext,
): string {
  return [
    context.posture,
    staticFieldKey,
    directionalFieldKey,
    context.threats.map((threat) => [
      threat.id,
      threat.mode,
      quantize(threat.x, 0.05),
      quantize(threat.y, 0.05),
      quantize(threat.radiusCells, 0.1),
      quantize(threat.widthCells, 0.1),
      quantize(threat.heightCells, 0.1),
      quantize(threat.rotationDegrees, 1),
      quantize(threat.directionDegrees, 1),
      quantize(threat.arcDegrees, 1),
      quantize(threat.rangeCells, 0.1),
      quantize(threat.minRangeCells, 0.1),
      quantize(threat.falloffPercent, 1),
      quantize(threat.uncertaintyCells, 1),
    ].join(':')).join('|'),
  ].join('#');
}

function buildFieldKey(geometryKey: string, threats: readonly SoldierDangerThreat[]): string {
  return [
    geometryKey,
    threats.map((threat) => [
      threat.id,
      quantize(threat.strength, 1),
      quantize(threat.suppression, 1),
      quantize(threat.confidence, 1),
      fireThreatClassForAggregation(threat) ?? 'independent',
    ].join(':')).join('|'),
  ].join('#');
}

function threatFactorAtPosition(
  position: GridPosition,
  threat: SoldierDangerThreat,
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
    const progress = Math.max(
      0,
      Math.min(1, (range - threat.minRangeCells) / Math.max(0.001, threat.rangeCells - threat.minRangeCells)),
    );
    return Math.max(0.05, 1 - progress * threat.falloffPercent / 100);
  }

  if (threat.radiusCells > 0) {
    return range <= threat.radiusCells + uncertaintyBonus
      ? Math.max(0.2, 1 - range / Math.max(1, threat.radiusCells + uncertaintyBonus) * 0.35)
      : 0;
  }

  const rotation = -threat.rotationDegrees * Math.PI / 180;
  const localX = dx * Math.cos(rotation) - dy * Math.sin(rotation);
  const localY = dx * Math.sin(rotation) + dy * Math.cos(rotation);
  return Math.abs(localX) <= threat.widthCells / 2 + uncertaintyBonus
    && Math.abs(localY) <= threat.heightCells / 2 + uncertaintyBonus
    ? 1
    : 0;
}

function coverProtectionAt(field: ThreatRelativeCoverField, index: number): number {
  return field.protection[index] ?? 0;
}

function combinePercent(base: number, addition: number): number {
  const base01 = clampPercent(base) / 100;
  const addition01 = clampPercent(addition) / 100;
  return clampPercent((1 - (1 - base01) * (1 - addition01)) * 100);
}

function getMapCache(map: TacticalMap): MapCache {
  const existing = cacheByMap.get(map);
  if (existing) return existing;
  const created: MapCache = {
    geometries: new Map(),
    fields: new Map(),
    diagnostics: {
      geometryBuildCount: 0,
      fieldBuildCount: 0,
      geometryCacheHitCount: 0,
      fieldCacheHitCount: 0,
      fullMapScanCount: 0,
      lastGeometryKey: '',
      lastFieldKey: '',
    },
  };
  cacheByMap.set(map, created);
  return created;
}

function touch<T>(cache: Map<string, T>, key: string, value: T): void {
  cache.delete(key);
  cache.set(key, value);
}

function trimCache<T>(cache: Map<string, T>, maximum: number): void {
  while (cache.size > maximum) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function quantize(value: number, bucket: number): number {
  return Math.round(finite(value) / bucket) * bucket;
}

function normalizeDegrees(value: number): number {
  const normalized = finite(value) % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function angularDifference(left: number, right: number): number {
  const difference = Math.abs(normalizeDegrees(left) - normalizeDegrees(right));
  return Math.min(difference, 360 - difference);
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(finite(value))));
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
