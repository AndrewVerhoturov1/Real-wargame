import type { TacticalMap } from '../map/MapModel';
import {
  getDirectionalTerrainStaticGrid,
  sampleDirectionalSlope,
} from './DirectionalTerrainStaticGrid';
import {
  buildThreatDirectionField,
  threatSectorBearingRadians,
  type DirectionalThreatSource,
  type ThreatDirectionField,
} from './ThreatDirectionField';

const SECTOR_COUNT = 8;
const SECTOR_RADIANS = Math.PI / 4;
const CACHE_LIMIT = 12;
const ORIGIN_BUCKET = 0.25;

export interface DirectionalTacticalFieldOptions {
  readonly unitId: string;
  readonly originX: number;
  readonly originY: number;
  readonly knowledgeRevision: number;
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
  const staticGrid = getDirectionalTerrainStaticGrid(map);
  const key = buildKey(staticGrid.mapVisualRevision, options);
  const existing = mapCache.fields.get(key);
  if (existing) {
    mapCache.diagnostics.cacheHitCount += 1;
    mapCache.fields.delete(key);
    mapCache.fields.set(key, existing);
    return existing;
  }

  const startedAt = performance.now();
  const field = buildField(map, key, options);
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
  const mapCache = cache.get(map);
  if (!mapCache) {
    return {
      buildCount: 0,
      cacheHitCount: 0,
      fullMapScanCount: 0,
      lastBuildMs: 0,
      cachedFieldCount: 0,
      lastKey: '',
    };
  }
  return {
    ...mapCache.diagnostics,
    cachedFieldCount: mapCache.fields.size,
  };
}

export function clearDirectionalTacticalFieldCache(map: TacticalMap): void {
  cache.delete(map);
}

function buildField(
  map: TacticalMap,
  key: string,
  options: DirectionalTacticalFieldOptions,
): DirectionalTacticalField {
  const terrain = getDirectionalTerrainStaticGrid(map);
  const threatField = buildThreatDirectionField(options.originX, options.originY, options.threats);
  const cellCount = map.width * map.height;
  const primarySlope = new Float32Array(cellCount);
  const forwardSlopeRisk = new Uint8Array(cellCount);
  const reverseSlopeProtection = new Uint8Array(cellCount);
  const crestRisk = new Uint8Array(cellCount);
  const valleyProtection = new Uint8Array(cellCount);
  const silhouetteRisk = new Uint8Array(cellCount);
  const primaryThreatExposure = new Uint8Array(cellCount);
  const flankExposure = new Uint8Array(cellCount);
  const terrainProtection = new Uint8Array(cellCount);
  const terrainConcealment = new Uint8Array(cellCount);
  const sectorProtection = new Uint8Array(cellCount * SECTOR_COUNT);
  const sectorExposure = new Uint8Array(cellCount * SECTOR_COUNT);

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const index = y * map.width + x;
      const crest01 = (terrain.crestStrength[index] ?? 0) / 255;
      const valley01 = (terrain.valleyStrength[index] ?? 0) / 255;
      const silhouette01 = (terrain.silhouettePotential[index] ?? 0) / 255;
      let weightedForward = 0;
      let weightedReverse = 0;
      let weightedProtection = 0;
      let weightedExposure = 0;
      let worstFlankExposure = 0;
      let primaryExposure = 0;
      let primarySlopeValue = 0;

      for (let sector = 0; sector < SECTOR_COUNT; sector += 1) {
        const slope = sampleDirectionalSlope(terrain, x, y, threatSectorBearingRadians(sector));
        const forward01 = clamp01(slope);
        const reverse01 = clamp01(-slope);
        const protection01 = clamp01(
          reverse01 * 0.78
          + valley01 * 0.30
          - crest01 * 0.16
          - silhouette01 * 0.20,
        );
        const exposure01 = clamp01(
          forward01 * 0.70
          + crest01 * 0.34
          + silhouette01 * 0.56
          - reverse01 * 0.58
          - valley01 * 0.24,
        );
        const sectorOffset = index * SECTOR_COUNT + sector;
        sectorProtection[sectorOffset] = encodePercent(protection01);
        sectorExposure[sectorOffset] = encodePercent(exposure01);

        const sectorWeight = threatField.normalizedSectorWeights[sector] ?? 0;
        if (sectorWeight <= 1e-6) continue;
        weightedForward += forward01 * sectorWeight;
        weightedReverse += reverse01 * sectorWeight;
        weightedProtection += protection01 * sectorWeight;
        weightedExposure += exposure01 * sectorWeight;
        if (sector === threatField.primarySector) {
          primarySlopeValue = slope;
          primaryExposure = exposure01;
        } else if (sectorDistance(sector, threatField.primarySector) >= 2) {
          worstFlankExposure = Math.max(worstFlankExposure, exposure01 * Math.min(1, sectorWeight * 4));
        }
      }

      const protection01 = clamp01(weightedProtection * (1 - worstFlankExposure * 0.35));
      const concealment01 = clamp01(
        protection01 * 0.78
        + weightedReverse * 0.22
        + valley01 * 0.12
        - silhouette01 * 0.24
        - weightedExposure * 0.10,
      );

      primarySlope[index] = threatField.primarySector >= 0 ? primarySlopeValue : 0;
      forwardSlopeRisk[index] = encodePercent(weightedForward);
      reverseSlopeProtection[index] = encodePercent(weightedReverse);
      crestRisk[index] = encodePercent(crest01);
      valleyProtection[index] = encodePercent(valley01);
      silhouetteRisk[index] = encodePercent(silhouette01);
      primaryThreatExposure[index] = encodePercent(primaryExposure);
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
    crestRisk,
    valleyProtection,
    silhouetteRisk,
    primaryThreatExposure,
    flankExposure,
    terrainProtection,
    terrainConcealment,
    sectorProtection,
    sectorExposure,
  };
}

function readSectorValue(
  values: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  bearingRadians: number,
): number {
  const cellX = clampInt(Math.floor(x), 0, width - 1);
  const cellY = clampInt(Math.floor(y), 0, height - 1);
  const position = normalizeRadians(bearingRadians) / SECTOR_RADIANS;
  const base = Math.floor(position) % SECTOR_COUNT;
  const fraction = position - Math.floor(position);
  const next = (base + 1) % SECTOR_COUNT;
  const cellOffset = (cellY * width + cellX) * SECTOR_COUNT;
  return (values[cellOffset + base] ?? 0) * (1 - fraction) + (values[cellOffset + next] ?? 0) * fraction;
}

function directionalTerrainSourceRu(cell: Omit<DirectionalTacticalCell, 'sourceRu'>): string {
  if (cell.reverseSlopeProtection >= 35 && cell.terrainConcealment >= 30) return 'обратный склон';
  if (cell.silhouetteRisk >= 45 || cell.crestRisk >= 55) return 'гребень и риск силуэта';
  if (cell.valleyProtection >= 40) return 'ложбина';
  if (cell.terrainProtection >= 20) return 'складка рельефа';
  return 'открытый склон';
}

function buildKey(mapVisualRevision: number, options: DirectionalTacticalFieldOptions): string {
  return [
    mapVisualRevision,
    options.unitId,
    quantize(options.originX, ORIGIN_BUCKET),
    quantize(options.originY, ORIGIN_BUCKET),
    options.knowledgeRevision,
    options.threats.map((threat) => [
      threat.id,
      quantize(threat.x, 0.05),
      quantize(threat.y, 0.05),
      quantize(threat.strength, 1),
      quantize(threat.suppression, 1),
      quantize(threat.confidence, 1),
      quantize(threat.uncertaintyCells, 0.1),
    ].join(':')).join('|'),
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

function sectorDistance(left: number, right: number): number {
  if (right < 0) return SECTOR_COUNT;
  const direct = Math.abs(left - right);
  return Math.min(direct, SECTOR_COUNT - direct);
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
