import type { TacticalMap } from '../map/MapModel';
import { getMapRevisionSnapshot } from '../map/MapRuntimeState';
import { getVisibilityStaticGrid } from '../visibility/VisibilityStaticGrid';

const FULL_SLOPE_RATIO = 0.75;
const FULL_CURVATURE_METERS = 2.5;

export interface DirectionalTerrainStaticGrid {
  readonly width: number;
  readonly height: number;
  readonly mapVisualRevision: number;
  readonly slopeMagnitude: Float32Array;
  readonly downhillX: Float32Array;
  readonly downhillY: Float32Array;
  readonly curvature: Float32Array;
  readonly crestStrength: Uint8Array;
  readonly valleyStrength: Uint8Array;
  readonly silhouettePotential: Uint8Array;
}

interface DirectionalTerrainStaticGridCacheEntry {
  readonly revision: number;
  readonly grid: DirectionalTerrainStaticGrid;
}

const cache = new WeakMap<TacticalMap, DirectionalTerrainStaticGridCacheEntry>();

export function getDirectionalTerrainStaticGrid(map: TacticalMap): DirectionalTerrainStaticGrid {
  const revision = getMapRevisionSnapshot(map).visual;
  const existing = cache.get(map);
  if (existing?.revision === revision) return existing.grid;
  const grid = buildDirectionalTerrainStaticGrid(map, revision);
  cache.set(map, { revision, grid });
  return grid;
}

export function clearDirectionalTerrainStaticGridCache(map: TacticalMap): void {
  cache.delete(map);
}

export function sampleDirectionalSlope(
  grid: DirectionalTerrainStaticGrid,
  cellX: number,
  cellY: number,
  threatBearingRadians: number,
): number {
  const x = clamp(Math.floor(cellX), 0, grid.width - 1);
  const y = clamp(Math.floor(cellY), 0, grid.height - 1);
  const index = y * grid.width + x;
  const slopeWeight = Math.min(1, grid.slopeMagnitude[index] / FULL_SLOPE_RATIO);
  if (slopeWeight <= 1e-6) return 0;
  const threatX = Math.cos(threatBearingRadians);
  const threatY = Math.sin(threatBearingRadians);
  return clamp((grid.downhillX[index] * threatX + grid.downhillY[index] * threatY) * slopeWeight, -1, 1);
}

function buildDirectionalTerrainStaticGrid(map: TacticalMap, revision: number): DirectionalTerrainStaticGrid {
  const heights = getVisibilityStaticGrid(map).terrainHeightMeters;
  const count = map.width * map.height;
  const slopeMagnitude = new Float32Array(count);
  const downhillX = new Float32Array(count);
  const downhillY = new Float32Array(count);
  const curvature = new Float32Array(count);
  const crestStrength = new Uint8Array(count);
  const valleyStrength = new Uint8Array(count);
  const silhouettePotential = new Uint8Array(count);
  const spacing = Math.max(0.001, map.metersPerCell);

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const index = y * map.width + x;
      const center = heightAt(heights, map.width, map.height, x, y);
      const west = heightAt(heights, map.width, map.height, x - 1, y);
      const east = heightAt(heights, map.width, map.height, x + 1, y);
      const north = heightAt(heights, map.width, map.height, x, y - 1);
      const south = heightAt(heights, map.width, map.height, x, y + 1);
      const gradientX = (east - west) / (2 * spacing);
      const gradientY = (south - north) / (2 * spacing);
      const magnitude = Math.hypot(gradientX, gradientY);
      slopeMagnitude[index] = magnitude;
      if (magnitude > 1e-6) {
        downhillX[index] = -gradientX / magnitude;
        downhillY[index] = -gradientY / magnitude;
      }

      const laplacianMeters = north + south + east + west - 4 * center;
      curvature[index] = laplacianMeters;
      const crest01 = clamp01(-laplacianMeters / FULL_CURVATURE_METERS);
      const valley01 = clamp01(laplacianMeters / FULL_CURVATURE_METERS);
      crestStrength[index] = encode01(crest01);
      valleyStrength[index] = encode01(valley01);

      const localHigh = center - Math.max(Math.min(west, east), Math.min(north, south));
      const prominence01 = clamp01(localHigh / FULL_CURVATURE_METERS);
      const slope01 = clamp01(magnitude / FULL_SLOPE_RATIO);
      silhouettePotential[index] = encode01(Math.max(crest01, prominence01 * (0.55 + slope01 * 0.45)));
    }
  }

  return {
    width: map.width,
    height: map.height,
    mapVisualRevision: revision,
    slopeMagnitude,
    downhillX,
    downhillY,
    curvature,
    crestStrength,
    valleyStrength,
    silhouettePotential,
  };
}

function heightAt(
  heights: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  const clampedX = clamp(x, 0, width - 1);
  const clampedY = clamp(y, 0, height - 1);
  return heights[clampedY * width + clampedX] ?? 0;
}

function encode01(value: number): number {
  return Math.round(clamp01(value) * 255);
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
