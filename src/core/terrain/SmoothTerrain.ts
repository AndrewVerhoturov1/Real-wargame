import { getCell, type TacticalMap } from '../map/MapModel';

const SMOOTH_RADIUS_CELLS = 2;
const HEIGHT_WEIGHT_CENTER = 6;
const HEIGHT_WEIGHT_NEAR = 3;
const HEIGHT_WEIGHT_FAR = 1;

export function sampleSmoothHeightLevel(map: TacticalMap, gridX: number, gridY: number): number {
  const smoothed = buildSmoothedHeightGrid(map);
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

function lerp(start: number, end: number, factor: number): number {
  return start + (end - start) * factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max));
}
