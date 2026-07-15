import type { TacticalMap } from '../map/MapModel';
import {
  DIRECTIONAL_SECTOR_COUNT,
  DIRECTIONAL_SECTOR_RADIANS,
  getDirectionalTerrainSectorBasis,
  getDirectionalTerrainSectorBasisDiagnostics,
  readDirectionalBasisValue,
  type DirectionalTerrainSectorBasis,
} from './DirectionalTerrainSectorBasis';
import {
  buildThreatDirectionField,
  type DirectionalThreatSource,
  type ThreatDirectionField,
} from './ThreatDirectionField';

const CACHE_LIMIT = 12;
const THREAT_POSITION_BUCKET_CELLS = 0.1;
const NORMALIZED_WEIGHT_BUCKET = 0.0001;
const UNCERTAINTY_HALF_WEIGHT_CELLS = 4;

export interface DirectionalTacticalFieldOptions {
  readonly unitId: string;
  /** Retained for API compatibility. World danger content no longer depends on own position. */
  readonly originX: number;
  /** Retained for API compatibility. World danger content no longer depends on own position. */
  readonly originY: number;
  readonly knowledgeRevision?: number;
  readonly threats: readonly DirectionalThreatSource[];
}

export interface DirectionalTacticalField {
  readonly key: string;
  readonly width: number;
  readonly height: number;
  readonly threatField: ThreatDirectionField;
  readonly primarySlope: Float32Array;
  readonly forwardSlopeRisk: Uint8Array;
  readonly reverseSlopeProtection: Uint8Array;
  readonly crestRisk: Uint8Array;
  readonly valleyProtection: Uint8Array;
  readonly silhouetteRisk: Uint8Array;
  readonly primaryThreatExposure: Uint8Array;
  readonly flankExposure: Uint8Array;
  readonly terrainProtection: Uint8Array;
  readonly terrainConcealment: Uint8Array;
  readonly sectorProtection: Uint8Array;
  readonly sectorExposure: Uint8Array;
}

export interface DirectionalTacticalCell {
  readonly primarySlope: number;
  readonly forwardSlopeRisk: number;
  readonly reverseSlopeProtection: number;
  readonly crestRisk: number;
  readonly valleyProtection: number;
  readonly silhouetteRisk: number;
  readonly primaryThreatExposure: number;
  readonly flankExposure: number;
  readonly terrainProtection: number;
  readonly terrainConcealment: number;
  readonly sourceRu: string;
}

export interface DirectionalTacticalFieldDiagnostics {
  readonly buildCount: number;
  readonly cacheHitCount: number;
  readonly fullMapScanCount: number;
  readonly lastBuildMs: number;
  readonly cachedFieldCount: number;
  readonly lastKey: string;
  readonly basisBuildCount: number;
}

interface MutableDiagnostics {
  buildCount: number;
  cacheHitCount: number;
  fullMapScanCount: number;
  lastBuildMs: number;
  lastKey: string;
}

interface MapCache {
  readonly fields: Map<string, DirectionalTacticalField>;
  readonly diagnostics: MutableDiagnostics;
}

const cache = new WeakMap<TacticalMap, MapCache>();

export function getDirectionalTacticalField(
  map: TacticalMap,
  options: DirectionalTacticalFieldOptions,
): DirectionalTacticalField {
  const mapCache = getMapCache(map);
  const basis = getDirectionalTerrainSectorBasis(map);
  const key = buildKey(basis.key, options.threats);
  const existing = mapCache.fields.get(key);
  const metadata = buildThreatDirectionField(map.width / 2, map.height / 2, options.threats);
  if (existing) {
    mapCache.diagnostics.cacheHitCount += 1;
    if (mapCache.diagnostics.lastKey !== key) {
      mapCache.fields.delete(key);
      mapCache.fields.set(key, existing);
      mapCache.diagnostics.lastKey = key;
    }
    (existing as { threatField: ThreatDirectionField }).threatField = metadata;
    return existing;
  }

  const startedAt = performance.now();
  const field = buildField(map, key, metadata, basis, options.threats);
  mapCache.fields.set(key, field);
  trimCache(mapCache.fields);
  mapCache.diagnostics.buildCount += 1;
  mapCache.diagnostics.fullMapScanCount += 1;
  mapCache.diagnostics.lastBuildMs = performance.now() - startedAt;
  mapCache.diagnostics.lastKey = key;
  return field;
}

export function readDirectionalTacticalCell(
  field: DirectionalTacticalField,
  x: number,
  y: number,
): DirectionalTacticalCell | null {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= field.width || y >= field.height) {
    return null;
  }
  const index = y * field.width + x;
  const cell = {
    primarySlope: field.primarySlope[index] ?? 0,
    forwardSlopeRisk: field.forwardSlopeRisk[index] ?? 0,
    reverseSlopeProtection: field.reverseSlopeProtection[index] ?? 0,
    crestRisk: field.crestRisk[index] ?? 0,
    valleyProtection: field.valleyProtection[index] ?? 0,
    silhouetteRisk: field.silhouetteRisk[index] ?? 0,
    primaryThreatExposure: field.primaryThreatExposure[index] ?? 0,
    flankExposure: field.flankExposure[index] ?? 0,
    terrainProtection: field.terrainProtection[index] ?? 0,
    terrainConcealment: field.terrainConcealment[index] ?? 0,
  };
  return { ...cell, sourceRu: directionalTerrainSourceRu(cell) };
}

export function readDirectionalProtectionForBearing(
  field: DirectionalTacticalField,
  x: number,
  y: number,
  bearingRadians: number,
): number {
  return readSectorValue(field.sectorProtection, field.width, field.height, x, y, bearingRadians);
}

export function readDirectionalExposureForBearing(
  field: DirectionalTacticalField,
  x: number,
  y: number,
  bearingRadians: number,
): number {
  return readSectorValue(field.sectorExposure, field.width, field.height, x, y, bearingRadians);
}

export function getDirectionalTacticalFieldDiagnostics(map: TacticalMap): DirectionalTacticalFieldDiagnostics {
  const basisDiagnostics = getDirectionalTerrainSectorBasisDiagnostics(map);
  const mapCache = cache.get(map);
  if (!mapCache) {
    return {
      buildCount: 0,
      cacheHitCount: 0,
      fullMapScanCount: 0,
      lastBuildMs: 0,
      cachedFieldCount: 0,
      lastKey: '',
      basisBuildCount: basisDiagnostics.buildCount,
    };
  }
  return {
    ...mapCache.diagnostics,
    cachedFieldCount: mapCache.fields.size,
    basisBuildCount: basisDiagnostics.buildCount,
  };
}

export function clearDirectionalTacticalFieldCache(map: TacticalMap): void {
  cache.delete(map);
}

function buildField(
  map: TacticalMap,
  key: string,
  threatField: ThreatDirectionField,
  basis: DirectionalTerrainSectorBasis,
  threats: readonly DirectionalThreatSource[],
): DirectionalTacticalField {
  const cellCount = map.width * map.height;
  const primarySlope = new Float32Array(cellCount);
  const forwardSlopeRisk = new Uint8Array(cellCount);
  const reverseSlopeProtection = new Uint8Array(cellCount);
  const primaryThreatExposure = new Uint8Array(cellCount);
  const flankExposure = new Uint8Array(cellCount);
  const terrainProtection = new Uint8Array(cellCount);
  const terrainConcealment = new Uint8Array(cellCount);

  for (let y = 0; y < map.height; y += 1) {
    const cellY = y + 0.5;
    for (let x = 0; x < map.width; x += 1) {
      const index = y * map.width + x;
      const cellX = x + 0.5;
      let totalWeight = 0;
      let strongestWeight = 0;
      let primaryBearing = 0;

      for (const threat of threats) {
        const weight = threatWeight(threat);
        if (weight <= 1e-6) continue;
        const dx = threat.x - cellX;
        const dy = threat.y - cellY;
        if (Math.hypot(dx, dy) <= 1e-6) continue;
        totalWeight += weight;
        if (weight > strongestWeight) {
          strongestWeight = weight;
          primaryBearing = Math.atan2(dy, dx);
        }
      }

      if (totalWeight <= 1e-6) continue;
      let weightedForward = 0;
      let weightedReverse = 0;
      let weightedProtection = 0;
      let weightedExposure = 0;
      let worstFlankExposure = 0;
      let primarySlopeValue = 0;
      let primaryExposureValue = 0;

      for (const threat of threats) {
        const weight = threatWeight(threat);
        if (weight <= 1e-6) continue;
        const dx = threat.x - cellX;
        const dy = threat.y - cellY;
        if (Math.hypot(dx, dy) <= 1e-6) continue;
        const bearing = Math.atan2(dy, dx);
        const normalizedWeight = weight / totalWeight;
        const slope = readBasisSlope(basis, x, y, bearing);
        const protection = readDirectionalBasisValue(basis.protection, basis, x, y, bearing) / 100;
        const exposure = readDirectionalBasisValue(basis.exposure, basis, x, y, bearing) / 100;
        weightedForward += clamp01(slope) * normalizedWeight;
        weightedReverse += clamp01(-slope) * normalizedWeight;
        weightedProtection += protection * normalizedWeight;
        weightedExposure += exposure * normalizedWeight;
        const bearingDifference = angularDifferenceRadians(bearing, primaryBearing);
        if (bearingDifference >= Math.PI / 2) {
          worstFlankExposure = Math.max(worstFlankExposure, exposure * Math.min(1, normalizedWeight * 4));
        }
        if (weight === strongestWeight && bearingDifference <= 1e-6) {
          primarySlopeValue = slope;
          primaryExposureValue = exposure;
        }
      }

      const crest01 = (basis.crestRisk[index] ?? 0) / 100;
      const valley01 = (basis.valleyProtection[index] ?? 0) / 100;
      const silhouette01 = (basis.silhouetteRisk[index] ?? 0) / 100;
      const protection01 = clamp01(weightedProtection * (1 - worstFlankExposure * 0.35));
      const concealment01 = clamp01(
        protection01 * 0.78
          + weightedReverse * 0.22
          + valley01 * 0.12
          - silhouette01 * 0.24
          - weightedExposure * 0.10,
      );

      primarySlope[index] = primarySlopeValue;
      forwardSlopeRisk[index] = encodePercent(weightedForward);
      reverseSlopeProtection[index] = encodePercent(weightedReverse);
      primaryThreatExposure[index] = encodePercent(primaryExposureValue);
      flankExposure[index] = encodePercent(worstFlankExposure);
      terrainProtection[index] = encodePercent(protection01);
      terrainConcealment[index] = encodePercent(concealment01);
    }
  }

  return {
    key,
    width: map.width,
    height: map.height,
    threatField,
    primarySlope,
    forwardSlopeRisk,
    reverseSlopeProtection,
    crestRisk: basis.crestRisk,
    valleyProtection: basis.valleyProtection,
    silhouetteRisk: basis.silhouetteRisk,
    primaryThreatExposure,
    flankExposure,
    terrainProtection,
    terrainConcealment,
    sectorProtection: basis.protection,
    sectorExposure: basis.exposure,
  };
}

function readBasisSlope(
  basis: DirectionalTerrainSectorBasis,
  x: number,
  y: number,
  bearingRadians: number,
): number {
  const cellX = clampInt(Math.floor(x), 0, basis.width - 1);
  const cellY = clampInt(Math.floor(y), 0, basis.height - 1);
  const sectorPosition = normalizeRadians(bearingRadians) / DIRECTIONAL_SECTOR_RADIANS;
  const lower = Math.floor(sectorPosition);
  const baseSector = lower % DIRECTIONAL_SECTOR_COUNT;
  const fraction = sectorPosition - lower;
  const nextSector = (baseSector + 1) % DIRECTIONAL_SECTOR_COUNT;
  const offset = (cellY * basis.width + cellX) * DIRECTIONAL_SECTOR_COUNT;
  return (basis.slope[offset + baseSector] ?? 0) * (1 - fraction)
    + (basis.slope[offset + nextSector] ?? 0) * fraction;
}

function readSectorValue(
  values: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  bearingRadians: number,
): number {
  return readDirectionalBasisValue(values, { width, height }, x, y, bearingRadians);
}

function directionalTerrainSourceRu(cell: Omit<DirectionalTacticalCell, 'sourceRu'>): string {
  if (cell.reverseSlopeProtection >= 35 && cell.terrainConcealment >= 30) return 'обратный склон';
  if (cell.silhouetteRisk >= 45 || cell.crestRisk >= 55) return 'гребень и риск силуэта';
  if (cell.valleyProtection >= 40) return 'ложбина';
  if (cell.terrainProtection >= 20) return 'складка рельефа';
  return 'открытый склон';
}

function buildKey(basisKey: string, threats: readonly DirectionalThreatSource[]): string {
  const weights = threats.map(threatWeight);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  return [
    basisKey,
    ...threats.map((threat, index) => [
      threat.id,
      quantize(threat.x, THREAT_POSITION_BUCKET_CELLS),
      quantize(threat.y, THREAT_POSITION_BUCKET_CELLS),
      quantize(totalWeight > 1e-6 ? (weights[index] ?? 0) / totalWeight : 0, NORMALIZED_WEIGHT_BUCKET),
    ].join(':')),
  ].join('#');
}

function getMapCache(map: TacticalMap): MapCache {
  let existing = cache.get(map);
  if (existing) return existing;
  existing = {
    fields: new Map(),
    diagnostics: {
      buildCount: 0,
      cacheHitCount: 0,
      fullMapScanCount: 0,
      lastBuildMs: 0,
      lastKey: '',
    },
  };
  cache.set(map, existing);
  return existing;
}

function trimCache(fields: Map<string, DirectionalTacticalField>): void {
  while (fields.size > CACHE_LIMIT) {
    const oldest = fields.keys().next().value as string | undefined;
    if (!oldest) break;
    fields.delete(oldest);
  }
}

function threatWeight(threat: DirectionalThreatSource): number {
  const confidence01 = percent01(threat.confidence);
  const force01 = percent01(Math.max(threat.strength, threat.suppression));
  const uncertainty = Math.max(0, finite(threat.uncertaintyCells));
  const uncertaintyAttenuation = 1 / (1 + uncertainty / UNCERTAINTY_HALF_WEIGHT_CELLS);
  return confidence01 * (0.25 + force01 * 0.75) * uncertaintyAttenuation;
}

function angularDifferenceRadians(left: number, right: number): number {
  const full = Math.PI * 2;
  const difference = Math.abs(normalizeRadians(left) - normalizeRadians(right));
  return Math.min(difference, full - difference);
}

function percent01(value: number): number {
  return Math.max(0, Math.min(1, finite(value) / 100));
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function encodePercent(value01: number): number {
  return Math.round(clamp01(value01) * 100);
}

function quantize(value: number, step: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / step) * step;
}

function normalizeRadians(value: number): number {
  const full = Math.PI * 2;
  const normalized = value % full;
  return normalized < 0 ? normalized + full : normalized;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
