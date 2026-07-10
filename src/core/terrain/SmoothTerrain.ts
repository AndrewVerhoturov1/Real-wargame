import { getCell, type TacticalMap } from '../map/MapModel';

// This kernel is also used by the painted terrain texture. Keeping one kernel means
// line of sight, relief overlays, height readouts and the visible landscape agree.
const SMOOTH_RADIUS_CELLS = 1;
const HEIGHT_WEIGHT_CENTER = 5;
const HEIGHT_WEIGHT_NEAR = 2;
const HEIGHT_WEIGHT_FAR = 1;

interface CachedSmoothGrid {
  key: string;
  grid: number[][];
}

const smoothGridCache = new WeakMap<TacticalMap, CachedSmoothGrid>();

export function sampleSmoothHeightLevel(map: TacticalMap, gridX: number, gridY: number): number {
  const smoothed = getSmoothedHeightGrid(map);
  const x = clamp(gridX - 0.5, 0, map.width - 1);
  const y = clamp(gridY - 0.5, 0, map.height - 1);
  const x1 = Math.floor(x);
  const y1 = Math.floor(y);
  const x2 = Math.min(map.width - 1, x1 + 1);
  const y2 = Math.min(map.height - 1, y1 + 1);
  const tx = x - x1;
  const ty = y - y1;
  const top = lerp(smoothed[y1][x1], smoothed[y1][x2], tx);
  const bottom = lerp(smoothed[y2][x1], smoothed[y2][x2], tx);

  return lerp(top, bottom, ty);
}

export function getSmoothedHeightGrid(map: TacticalMap): number[][] {
  const key = buildHeightKey(map);
  const cached = smoothGridCache.get(map);

  if (cached?.key === key) {
    return cached.grid;
  }

  const grid = buildSmoothedHeightGrid(map);
  smoothGridCache.set(map, { key, grid });
  return grid;
}

export function buildSmoothedHeightGrid(map: TacticalMap): number[][] {
  const rows: number[][] = [];

  for (let y = 0; y < map.height; y += 1) {
    const row: number[] = [];

    for (let x = 0; x < map.width; x += 1) {
      let total = 0;
      let weightTotal = 0;

      for (let oy = -SMOOTH_RADIUS_CELLS; oy <= SMOOTH_RADIUS_CELLS; oy += 1) {
        for (let ox = -SMOOTH_RADIUS_CELLS; ox <= SMOOTH_RADIUS_CELLS; ox += 1) {
          const sampleX = clampInt(x + ox, 0, map.width - 1);
          const sampleY = clampInt(y + oy, 0, map.height - 1);
          const cell = getCell(map, sampleX, sampleY);
          const distance = Math.hypot(ox, oy);
          const weight = distance < 0.01
            ? HEIGHT_WEIGHT_CENTER
            : distance <= 1.1
              ? HEIGHT_WEIGHT_NEAR
              : HEIGHT_WEIGHT_FAR;

          total += (cell?.height ?? map.defaultHeight) * weight;
          weightTotal += weight;
        }
      }

      row.push(total / weightTotal);
    }

    rows.push(row);
  }

  return rows;
}

export function hasHeightVariation(map: TacticalMap): boolean {
  return map.cells.some((cell) => cell.height !== map.defaultHeight);
}

function buildHeightKey(map: TacticalMap): string {
  return `${map.width}x${map.height}:${map.defaultHeight}:${map.cells.map((cell) => cell.height).join(',')}`;
}

function lerp(start: number, end: number, factor: number): number {
  return start + (end - start) * factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max));
}
