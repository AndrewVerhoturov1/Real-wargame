export interface MapGridLodInput {
  showGrid: boolean;
  metersPerCell: number;
  cellSize: number;
  zoom: number;
  editorEnabled: boolean;
}

export interface MapGridLodState {
  majorVisible: boolean;
  minorVisible: boolean;
  minorAlpha: number;
  majorSpacingCells: number;
  screenCellPixels: number;
}

const MAJOR_GRID_METERS = 10;
const SIMULATION_FINE_GRID_START_PX = 10;
const SIMULATION_FINE_GRID_FULL_PX = 14;
const EDITOR_FINE_GRID_START_PX = 7;
const EDITOR_FINE_GRID_FULL_PX = 11;

export function resolveMapGridLod(input: MapGridLodInput): MapGridLodState {
  const metersPerCell = Math.max(0.001, finiteOr(input.metersPerCell, 10));
  const cellSize = Math.max(0, finiteOr(input.cellSize, 0));
  const zoom = Math.max(0, finiteOr(input.zoom, 1));
  const majorSpacingCells = Math.max(1, Math.round(MAJOR_GRID_METERS / metersPerCell));
  const screenCellPixels = cellSize * zoom;
  const hasDistinctMinorGrid = majorSpacingCells > 1;
  const startPixels = input.editorEnabled
    ? EDITOR_FINE_GRID_START_PX
    : SIMULATION_FINE_GRID_START_PX;
  const fullPixels = input.editorEnabled
    ? EDITOR_FINE_GRID_FULL_PX
    : SIMULATION_FINE_GRID_FULL_PX;
  const minorAlpha = input.showGrid && hasDistinctMinorGrid
    ? clamp01((screenCellPixels - startPixels) / Math.max(0.001, fullPixels - startPixels))
    : 0;

  return {
    majorVisible: input.showGrid,
    minorVisible: minorAlpha > 0,
    minorAlpha,
    majorSpacingCells,
    screenCellPixels,
  };
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
