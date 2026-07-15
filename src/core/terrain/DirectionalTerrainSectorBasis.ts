import type { TacticalMap } from '../map/MapModel';
import { getMapRevisionSnapshot } from '../map/MapRuntimeState';
import {
  getDirectionalTerrainStaticGrid,
  sampleDirectionalSlope,
} from './DirectionalTerrainStaticGrid';

export const DIRECTIONAL_SECTOR_COUNT = 8;
export const DIRECTIONAL_SECTOR_RADIANS = Math.PI / 4;

export interface DirectionalTerrainSectorBasis {
  readonly key: string;
  readonly width: number;
  readonly height: number;
  readonly slope: Float32Array;
  readonly protection: Uint8Array;
  readonly exposure: Uint8Array;
  readonly crestRisk: Uint8Array;
  readonly valleyProtection: Uint8Array;
  readonly silhouetteRisk: Uint8Array;
}

export interface DirectionalTerrainSectorBasisDiagnostics {
  readonly buildCount: number;
  readonly cacheHitCount: number;
  readonly fullMapScanCount: number;
  readonly lastBuildMs: number;
  readonly lastKey: string;
}

interface BasisCacheEntry {
  readonly basis: DirectionalTerrainSectorBasis;
  readonly diagnostics: MutableDiagnostics;
}

interface MutableDiagnostics {
  buildCount: number;
  cacheHitCount: number;
  fullMapScanCount: number;
  lastBuildMs: number;
  lastKey: string;
}

const cache = new WeakMap<TacticalMap, BasisCacheEntry>();

export function getDirectionalTerrainSectorBasis(map: TacticalMap): DirectionalTerrainSectorBasis {
  const revisions = getMapRevisionSnapshot(map);
  const key = [
    map.width,
    map.height,
    map.metersPerCell,
    revisions.height,
    revisions.terrain,
  ].join(':');
  const existing = cache.get(map);
  if (existing?.basis.key === key) {
    existing.diagnostics.cacheHitCount += 1;
    return existing.basis;
  }

  const startedAt = performance.now();
  const basis = buildBasis(map, key);
  const diagnostics = existing?.diagnostics ?? emptyMutableDiagnostics();
  diagnostics.buildCount += 1;
  diagnostics.fullMapScanCount += 1;
  diagnostics.lastBuildMs = performance.now() - startedAt;
  diagnostics.lastKey = key;
  cache.set(map, { basis, diagnostics });
  return basis;
}

export function getDirectionalTerrainSectorBasisDiagnostics(
  map: TacticalMap,
): DirectionalTerrainSectorBasisDiagnostics {
  const existing = cache.get(map);
  if (!existing) return emptyMutableDiagnostics();
  return { ...existing.diagnostics };
}

export function clearDirectionalTerrainSectorBasisCache(map: TacticalMap): void {
  cache.delete(map);
}

export function readDirectionalBasisValue(
  values: Uint8Array,
  basis: Pick<DirectionalTerrainSectorBasis, 'width' | 'height'>,
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
  return (values[offset + baseSector] ?? 0) * (1 - fraction)
    + (values[offset + nextSector] ?? 0) * fraction;
}

function buildBasis(map: TacticalMap, key: string): DirectionalTerrainSectorBasis {
  const terrain = getDirectionalTerrainStaticGrid(map);
  const cellCount = map.width * map.height;
  const slope = new Float32Array(cellCount * DIRECTIONAL_SECTOR_COUNT);
  const protection = new Uint8Array(cellCount * DIRECTIONAL_SECTOR_COUNT);
  const exposure = new Uint8Array(cellCount * DIRECTIONAL_SECTOR_COUNT);
  const crestRisk = new Uint8Array(cellCount);
  const valleyProtection = new Uint8Array(cellCount);
  const silhouetteRisk = new Uint8Array(cellCount);

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const index = y * map.width + x;
      const crest01 = (terrain.crestStrength[index] ?? 0) / 255;
      const valley01 = (terrain.valleyStrength[index] ?? 0) / 255;
      const silhouette01 = (terrain.silhouettePotential[index] ?? 0) / 255;
      crestRisk[index] = encodePercent(crest01);
      valleyProtection[index] = encodePercent(valley01);
      silhouetteRisk[index] = encodePercent(silhouette01);

      for (let sector = 0; sector < DIRECTIONAL_SECTOR_COUNT; sector += 1) {
        const bearing = sector * DIRECTIONAL_SECTOR_RADIANS;
        const sectorOffset = index * DIRECTIONAL_SECTOR_COUNT + sector;
        const slopeValue = sampleDirectionalSlope(terrain, x, y, bearing);
        const forward01 = clamp01(slopeValue);
        const reverse01 = clamp01(-slopeValue);
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
        slope[sectorOffset] = slopeValue;
        protection[sectorOffset] = encodePercent(protection01);
        exposure[sectorOffset] = encodePercent(exposure01);
      }
    }
  }

  return {
    key,
    width: map.width,
    height: map.height,
    slope,
    protection,
    exposure,
    crestRisk,
    valleyProtection,
    silhouetteRisk,
  };
}

function emptyMutableDiagnostics(): MutableDiagnostics {
  return {
    buildCount: 0,
    cacheHitCount: 0,
    fullMapScanCount: 0,
    lastBuildMs: 0,
    lastKey: '',
  };
}

function encodePercent(value01: number): number {
  return Math.round(clamp01(value01) * 100);
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
