import type { GridPosition, WorldPosition } from '../geometry';
import {
  DEFAULT_ENVIRONMENT_PROFILE_ID,
  legacyForestLayerToVegetationMaterialId,
  surfaceMaterialIdToTerrainKind,
  terrainKindToSurfaceMaterialId,
  vegetationMaterialIdToLegacyForestLayer,
} from './EnvironmentMaterialProfile';

export type TerrainKind = 'field' | 'forest' | 'road' | 'swamp' | 'rough' | 'water';
export type ElevationLevel = -2 | -1 | 0 | 1 | 2 | 3 | 4;
export type ForestLayerKind = 0 | 1 | 2;
export type CoverPosture = 'standing' | 'crouched' | 'prone';

export const ELEVATION_LEVELS = [-2, -1, 0, 1, 2, 3, 4] as const;

export type MapObjectKind =
  | 'tree'
  | 'rock'
  | 'structure'
  | 'cover'
  | 'ditch'
  | 'crates'
  | 'fence'
  | 'post'
  | 'logs'
  | 'well'
  | 'bridge';

export interface CoverProperties {
  coverProtection: number;
  coverReliability: number;
  concealment: number;
  penetrable: boolean;
  coverPosture: CoverPosture;
}

export interface MapCellData {
  x: number;
  y: number;
  terrain?: TerrainKind;
  height?: number;
  forest?: number;
  surfaceMaterialId?: string;
  vegetationMaterialId?: string;
}

export interface MapCellRunData {
  x1: number;
  x2: number;
  y: number;
  terrain?: TerrainKind;
  height?: number;
  forest?: number;
  surfaceMaterialId?: string;
  vegetationMaterialId?: string;
}

export interface MapCellRectData {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
  terrain?: TerrainKind;
  height?: number;
  forest?: number;
  surfaceMaterialId?: string;
  vegetationMaterialId?: string;
}

export interface MapObjectData {
  id: string;
  kind: MapObjectKind;
  x: number;
  y: number;
  rotationDegrees?: number;
  widthCells?: number;
  heightCells?: number;
  losHeightMeters?: number;
  coverProtection?: number;
  coverReliability?: number;
  concealment?: number;
  penetrable?: boolean;
  coverPosture?: CoverPosture;
  label?: string;
  labelRu?: string;
}

export interface TacticalMapData {
  width: number;
  height: number;
  cellSize: number;
  metersPerCell?: number;
  /**
   * Optional runtime resolution. Source coordinates remain in `metersPerCell`, while
   * normalization expands them into this finer grid without changing physical/map pixel size.
   */
  runtimeMetersPerCell?: number;
  environmentProfileId?: string;
  defaultTerrain?: TerrainKind;
  defaultHeight?: number;
  heightMap?: number[][];
  forestMap?: number[][];
  surfaceMaterialMap?: string[][];
  vegetationMaterialMap?: string[][];
  cellRuns?: MapCellRunData[];
  cellRects?: MapCellRectData[];
  cells?: MapCellData[];
  objects?: MapObjectData[];
}

export interface MapCell {
  x: number;
  y: number;
  /** Canonical physical surface material reference. */
  surfaceMaterialId: string;
  /** Canonical vegetation material reference. */
  vegetationMaterialId: string;
  height: ElevationLevel;
  /** @deprecated Compatibility projection; never use as authoritative state. */
  terrain: TerrainKind;
  /** @deprecated Compatibility projection; never use as authoritative state. */
  forest: ForestLayerKind;
}

export interface MapObject {
  id: string;
  kind: MapObjectKind;
  x: number;
  y: number;
  rotationRadians: number;
  widthCells: number;
  heightCells: number;
  losHeightMeters?: number;
  coverProtection?: number;
  coverReliability?: number;
  concealment?: number;
  penetrable?: boolean;
  coverPosture?: CoverPosture;
  labels: {
    en: string;
    ru: string;
  } | null;
}

export interface TacticalMap {
  width: number;
  height: number;
  cellSize: number;
  metersPerCell: number;
  /** Scale applied to source coordinates. Native-resolution maps use 1. */
  sourceToRuntimeCellScale: number;
  environmentProfileId: string;
  defaultTerrain: TerrainKind;
  defaultHeight: ElevationLevel;
  cells: MapCell[];
  objects: MapObject[];
}

export function normalizeMap(data: TacticalMapData): TacticalMap {
  const defaultTerrain = data.defaultTerrain ?? 'field';
  const defaultHeight = normalizeElevationLevel(data.defaultHeight);
  const sourceMetersPerCell = normalizeMetersPerCell(data.metersPerCell, 10);
  const runtimeMetersPerCell = normalizeMetersPerCell(data.runtimeMetersPerCell, sourceMetersPerCell);
  const sourceToRuntimeCellScale = normalizeResolutionScale(sourceMetersPerCell / runtimeMetersPerCell);
  const runtimeWidth = Math.max(1, Math.round(data.width * sourceToRuntimeCellScale));
  const runtimeHeight = Math.max(1, Math.round(data.height * sourceToRuntimeCellScale));
  const overrides = new Map<string, MapCellData>();

  for (const rect of data.cellRects ?? []) {
    for (let y = rect.y1; y <= rect.y2; y += 1) {
      for (let x = rect.x1; x <= rect.x2; x += 1) {
        overrides.set(cellKey(x, y), {
          x,
          y,
          terrain: rect.terrain,
          height: rect.height,
          forest: rect.forest,
          surfaceMaterialId: rect.surfaceMaterialId,
          vegetationMaterialId: rect.vegetationMaterialId,
        });
      }
    }
  }

  for (const run of data.cellRuns ?? []) {
    for (let x = run.x1; x <= run.x2; x += 1) {
      overrides.set(cellKey(x, run.y), {
        x,
        y: run.y,
        terrain: run.terrain,
        height: run.height,
        forest: run.forest,
        surfaceMaterialId: run.surfaceMaterialId,
        vegetationMaterialId: run.vegetationMaterialId,
      });
    }
  }

  for (const cell of data.cells ?? []) overrides.set(cellKey(cell.x, cell.y), cell);

  const cells: MapCell[] = new Array(runtimeWidth * runtimeHeight);
  for (let y = 0; y < runtimeHeight; y += 1) {
    const sourceY = clamp(Math.floor(y / sourceToRuntimeCellScale), 0, data.height - 1);
    for (let x = 0; x < runtimeWidth; x += 1) {
      const sourceX = clamp(Math.floor(x / sourceToRuntimeCellScale), 0, data.width - 1);
      const override = overrides.get(cellKey(sourceX, sourceY));
      const heightFromMap = readMatrixValue(data.heightMap, sourceX, sourceY);
      const forestFromMap = readMatrixValue(data.forestMap, sourceX, sourceY);
      const surfaceFromMap = readStringMatrixValue(data.surfaceMaterialMap, sourceX, sourceY);
      const vegetationFromMap = readStringMatrixValue(data.vegetationMaterialMap, sourceX, sourceY);
      const legacyTerrain = override?.terrain ?? defaultTerrain;
      const legacyForest = normalizeForestLayer(override?.forest ?? forestFromMap ?? 0);
      const surfaceMaterialId = override?.surfaceMaterialId ?? surfaceFromMap ?? terrainKindToSurfaceMaterialId(legacyTerrain);
      const vegetationMaterialId = override?.vegetationMaterialId ?? vegetationFromMap
        ?? legacyForestLayerToVegetationMaterialId(legacyForest > 0 ? legacyForest : legacyTerrain === 'forest' ? 1 : 0);
      cells[y * runtimeWidth + x] = {
        x,
        y,
        surfaceMaterialId,
        vegetationMaterialId,
        terrain: surfaceMaterialIdToTerrainKind(surfaceMaterialId),
        height: normalizeElevationLevel(override?.height ?? heightFromMap ?? defaultHeight),
        forest: vegetationMaterialIdToLegacyForestLayer(vegetationMaterialId),
      };
    }
  }

  return {
    width: runtimeWidth,
    height: runtimeHeight,
    cellSize: data.cellSize / sourceToRuntimeCellScale,
    metersPerCell: runtimeMetersPerCell,
    sourceToRuntimeCellScale,
    environmentProfileId: data.environmentProfileId?.trim() || DEFAULT_ENVIRONMENT_PROFILE_ID,
    defaultTerrain,
    defaultHeight,
    cells,
    objects: normalizeMapObjects(data.objects ?? [], sourceToRuntimeCellScale),
  };
}


export function setCellSurfaceMaterialId(cell: MapCell, materialId: string): void {
  cell.surfaceMaterialId = materialId || 'field';
  cell.terrain = surfaceMaterialIdToTerrainKind(cell.surfaceMaterialId);
}

export function setCellVegetationMaterialId(cell: MapCell, materialId: string): void {
  cell.vegetationMaterialId = materialId || 'none';
  cell.forest = vegetationMaterialIdToLegacyForestLayer(cell.vegetationMaterialId);
}

export function normalizeElevationLevel(value: number | undefined): ElevationLevel {
  const rounded = Number.isFinite(value) ? Math.round(value as number) : 0;
  if (rounded <= -2) return -2;
  if (rounded >= 4) return 4;
  return rounded as ElevationLevel;
}

export function normalizeForestLayer(value: number | undefined): ForestLayerKind {
  const rounded = Number.isFinite(value) ? Math.round(value as number) : 0;
  if (rounded <= 0) return 0;
  if (rounded >= 2) return 2;
  return 1;
}

export function getCell(map: TacticalMap, x: number, y: number): MapCell | undefined {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return undefined;
  return map.cells[y * map.width + x];
}

export function worldToGrid(map: TacticalMap, world: WorldPosition): GridPosition {
  return { x: world.x / map.cellSize, y: world.y / map.cellSize };
}

export function gridToWorld(map: TacticalMap, grid: GridPosition): WorldPosition {
  return { x: grid.x * map.cellSize, y: grid.y * map.cellSize };
}

export function gridToCellLabel(map: TacticalMap, grid: GridPosition): string {
  const cell = gridToCellCenter(map, grid);
  const metersX = Math.floor(cell.x * map.metersPerCell);
  const metersY = Math.floor(cell.y * map.metersPerCell);
  return `${metersX} м, ${metersY} м (${map.metersPerCell} м/клетка)`;
}

export function gridToCellCenter(map: TacticalMap, grid: GridPosition): GridPosition {
  const cellX = clamp(Math.floor(grid.x), 0, map.width - 1);
  const cellY = clamp(Math.floor(grid.y), 0, map.height - 1);
  return { x: cellX + 0.5, y: cellY + 0.5 };
}

export function clampGridPositionToMap(map: TacticalMap, grid: GridPosition): GridPosition {
  return {
    x: clamp(grid.x, 0.5, map.width - 0.5),
    y: clamp(grid.y, 0.5, map.height - 0.5),
  };
}

export function getDefaultObjectCoverProperties(kind: MapObjectKind): CoverProperties {
  switch (kind) {
    case 'structure': return { coverProtection: 92, coverReliability: 96, concealment: 95, penetrable: false, coverPosture: 'standing' };
    case 'cover': return { coverProtection: 88, coverReliability: 90, concealment: 70, penetrable: false, coverPosture: 'crouched' };
    case 'ditch': return { coverProtection: 82, coverReliability: 86, concealment: 65, penetrable: false, coverPosture: 'prone' };
    case 'logs': return { coverProtection: 76, coverReliability: 72, concealment: 45, penetrable: false, coverPosture: 'crouched' };
    case 'rock': return { coverProtection: 72, coverReliability: 68, concealment: 40, penetrable: false, coverPosture: 'crouched' };
    case 'crates': return { coverProtection: 58, coverReliability: 62, concealment: 55, penetrable: true, coverPosture: 'crouched' };
    case 'fence': return { coverProtection: 35, coverReliability: 46, concealment: 70, penetrable: true, coverPosture: 'crouched' };
    case 'tree': return { coverProtection: 42, coverReliability: 34, concealment: 55, penetrable: true, coverPosture: 'standing' };
    case 'post': return { coverProtection: 45, coverReliability: 38, concealment: 35, penetrable: true, coverPosture: 'crouched' };
    case 'well': return { coverProtection: 62, coverReliability: 64, concealment: 45, penetrable: false, coverPosture: 'crouched' };
    case 'bridge': return { coverProtection: 20, coverReliability: 28, concealment: 10, penetrable: true, coverPosture: 'prone' };
  }
}

export function resolveObjectCoverProperties(object: MapObject): CoverProperties {
  const defaults = getDefaultObjectCoverProperties(object.kind);
  return {
    coverProtection: clampPercent(object.coverProtection ?? defaults.coverProtection),
    coverReliability: clampPercent(object.coverReliability ?? defaults.coverReliability),
    concealment: clampPercent(object.concealment ?? defaults.concealment),
    penetrable: object.penetrable ?? defaults.penetrable,
    coverPosture: object.coverPosture ?? defaults.coverPosture,
  };
}

function normalizeMapObjects(objects: MapObjectData[], coordinateScale: number): MapObject[] {
  return objects.map((object) => {
    const defaultSize = getDefaultObjectSize(object.kind);
    const cover = getDefaultObjectCoverProperties(object.kind);
    return {
      id: object.id,
      kind: object.kind,
      x: scaleSourceCellAnchor(object.x, coordinateScale),
      y: scaleSourceCellAnchor(object.y, coordinateScale),
      rotationRadians: degreesToRadians(object.rotationDegrees ?? 0),
      // Object dimensions are intentionally reinterpreted in the finer grid. This is the
      // realism gain: a 2.5-cell cover becomes 5 metres, not the legacy 25 metres.
      widthCells: Math.max(0.05, object.widthCells ?? defaultSize.widthCells),
      heightCells: Math.max(0.05, object.heightCells ?? defaultSize.heightCells),
      losHeightMeters: normalizeObjectHeightMeters(object.losHeightMeters ?? defaultSize.losHeightMeters),
      coverProtection: clampPercent(object.coverProtection ?? cover.coverProtection),
      coverReliability: clampPercent(object.coverReliability ?? cover.coverReliability),
      concealment: clampPercent(object.concealment ?? cover.concealment),
      penetrable: object.penetrable ?? cover.penetrable,
      coverPosture: object.coverPosture ?? cover.coverPosture,
      labels: object.label ? { en: object.label, ru: object.labelRu ?? object.label } : null,
    };
  });
}

export function scaleSourceCellAnchor(value: number, scale: number): number {
  return (value + 0.5) * scale - 0.5;
}

function getDefaultObjectSize(kind: MapObjectKind): { widthCells: number; heightCells: number; losHeightMeters: number } {
  switch (kind) {
    case 'tree': return { widthCells: 0.75, heightCells: 0.75, losHeightMeters: 6 };
    case 'rock': return { widthCells: 0.45, heightCells: 0.35, losHeightMeters: 1.2 };
    case 'crates': return { widthCells: 0.75, heightCells: 0.65, losHeightMeters: 1.25 };
    case 'post': return { widthCells: 0.55, heightCells: 0.55, losHeightMeters: 1.35 };
    case 'logs': return { widthCells: 1.25, heightCells: 0.45, losHeightMeters: 0.8 };
    case 'well': return { widthCells: 0.7, heightCells: 0.7, losHeightMeters: 1.1 };
    case 'cover': return { widthCells: 2.5, heightCells: 0.45, losHeightMeters: 1.1 };
    case 'ditch': return { widthCells: 4.5, heightCells: 0.55, losHeightMeters: 0.2 };
    case 'fence': return { widthCells: 4, heightCells: 0.25, losHeightMeters: 1.2 };
    case 'bridge': return { widthCells: 2.6, heightCells: 1.1, losHeightMeters: 0.8 };
    case 'structure':
    default: return { widthCells: 2, heightCells: 1.5, losHeightMeters: 5 };
  }
}

function normalizeObjectHeightMeters(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(20, Math.round(value * 10) / 10));
}

function normalizeMetersPerCell(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || (value as number) <= 0) return fallback;
  return Math.max(0.25, Math.min(100, value as number));
}

function normalizeResolutionScale(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const rounded = Math.round(value);
  return Math.abs(value - rounded) < 0.0001 ? Math.max(1, rounded) : Math.max(0.1, value);
}

function readMatrixValue(matrix: number[][] | undefined, x: number, y: number): number | undefined {
  return matrix?.[y]?.[x];
}

function readStringMatrixValue(matrix: string[][] | undefined, x: number, y: number): string | undefined {
  const value = matrix?.[y]?.[x];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function cellKey(x: number, y: number): string {
  return `${x}:${y}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampPercent(value: number): number {
  return clamp(Math.round(value), 0, 100);
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
