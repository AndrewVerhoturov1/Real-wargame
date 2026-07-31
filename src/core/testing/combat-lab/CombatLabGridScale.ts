export const COMBAT_LAB_METRES_PER_CELL = 2 as const;
const BASE_PIXELS_PER_METRE = 5;

export function combatLabMetresToGrid(metres: number): number {
  if (!Number.isFinite(metres)) throw new Error('Combat Lab metre coordinate must be finite.');
  return metres / COMBAT_LAB_METRES_PER_CELL;
}

export function combatLabGridToMetres(gridCells: number): number {
  if (!Number.isFinite(gridCells)) throw new Error('Combat Lab grid coordinate must be finite.');
  return gridCells * COMBAT_LAB_METRES_PER_CELL;
}

export function combatLabMapCellsForMetres(metres: number): number {
  const cells = combatLabMetresToGrid(metres);
  if (!Number.isInteger(cells) || cells < 1) {
    throw new Error(`Combat Lab map extent ${metres} m must divide into whole ${COMBAT_LAB_METRES_PER_CELL} m cells.`);
  }
  return cells;
}

export function combatLabCellSizePixelsForPhysicalScale(pixelsPerMetre = BASE_PIXELS_PER_METRE): number {
  if (!Number.isFinite(pixelsPerMetre) || pixelsPerMetre <= 0) {
    throw new Error('Combat Lab pixels-per-metre scale must be positive.');
  }
  return pixelsPerMetre * COMBAT_LAB_METRES_PER_CELL;
}
