import type { TacticalMap } from './MapModel';

export type MapRevisionLayer = 'terrain' | 'height' | 'forest' | 'objects';

export interface MapRevisionSnapshot {
  terrain: number;
  height: number;
  forest: number;
  objects: number;
  visual: number;
}

export interface MapDirtyRegion {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface MapLayerChange {
  revision: number;
  region: MapDirtyRegion;
}

interface MapRuntimeState {
  revisions: MapRevisionSnapshot;
  history: Record<MapRevisionLayer, MapLayerChange[]>;
}

const MAX_CHANGE_HISTORY = 128;
const runtimeStateByMap = new WeakMap<TacticalMap, MapRuntimeState>();

export function getMapRevisionSnapshot(map: TacticalMap): MapRevisionSnapshot {
  return { ...getRuntimeState(map).revisions };
}

export function getMapLayerRevision(map: TacticalMap, layer: MapRevisionLayer): number {
  return getRuntimeState(map).revisions[layer];
}

export function markMapCellsDirty(
  map: TacticalMap,
  layer: Exclude<MapRevisionLayer, 'objects'>,
  region: MapDirtyRegion,
): number {
  return recordMapChange(map, layer, clampRegionToMap(map, region));
}

export function markMapObjectsDirty(map: TacticalMap, region?: MapDirtyRegion): number {
  return recordMapChange(map, 'objects', clampRegionToMap(map, region ?? fullMapRegion(map)));
}

export function getMapDirtyRegionSince(
  map: TacticalMap,
  layer: MapRevisionLayer,
  afterRevision: number,
): MapDirtyRegion | null {
  const state = getRuntimeState(map);
  const currentRevision = state.revisions[layer];
  if (afterRevision >= currentRevision) return null;

  const changes = state.history[layer].filter((change) => change.revision > afterRevision);
  if (changes.length === 0 || changes[0].revision !== afterRevision + 1) {
    return fullMapRegion(map);
  }

  return changes.reduce<MapDirtyRegion>(
    (merged, change) => mergeDirtyRegions(merged, change.region),
    changes[0].region,
  );
}

export function resetMapRuntimeState(map: TacticalMap): void {
  runtimeStateByMap.delete(map);
}

export function mergeDirtyRegions(left: MapDirtyRegion, right: MapDirtyRegion): MapDirtyRegion {
  return {
    minX: Math.min(left.minX, right.minX),
    minY: Math.min(left.minY, right.minY),
    maxX: Math.max(left.maxX, right.maxX),
    maxY: Math.max(left.maxY, right.maxY),
  };
}

export function expandDirtyRegion(
  map: TacticalMap,
  region: MapDirtyRegion,
  marginCells: number,
): MapDirtyRegion {
  const margin = Math.max(0, Math.ceil(marginCells));
  return clampRegionToMap(map, {
    minX: region.minX - margin,
    minY: region.minY - margin,
    maxX: region.maxX + margin,
    maxY: region.maxY + margin,
  });
}

export function fullMapRegion(map: TacticalMap): MapDirtyRegion {
  return {
    minX: 0,
    minY: 0,
    maxX: Math.max(0, map.width - 1),
    maxY: Math.max(0, map.height - 1),
  };
}

function getRuntimeState(map: TacticalMap): MapRuntimeState {
  const existing = runtimeStateByMap.get(map);
  if (existing) return existing;

  const created: MapRuntimeState = {
    revisions: {
      terrain: 1,
      height: 1,
      forest: 1,
      objects: 1,
      visual: 1,
    },
    history: {
      terrain: [],
      height: [],
      forest: [],
      objects: [],
    },
  };
  runtimeStateByMap.set(map, created);
  return created;
}

function recordMapChange(map: TacticalMap, layer: MapRevisionLayer, region: MapDirtyRegion): number {
  const state = getRuntimeState(map);
  state.revisions[layer] += 1;
  state.revisions.visual += 1;
  const history = state.history[layer];
  history.push({ revision: state.revisions[layer], region });
  if (history.length > MAX_CHANGE_HISTORY) {
    history.splice(0, history.length - MAX_CHANGE_HISTORY);
  }
  return state.revisions[layer];
}

function clampRegionToMap(map: TacticalMap, region: MapDirtyRegion): MapDirtyRegion {
  const maxX = Math.max(0, map.width - 1);
  const maxY = Math.max(0, map.height - 1);
  const minX = clamp(Math.floor(Math.min(region.minX, region.maxX)), 0, maxX);
  const minY = clamp(Math.floor(Math.min(region.minY, region.maxY)), 0, maxY);
  const regionMaxX = clamp(Math.ceil(Math.max(region.minX, region.maxX)), 0, maxX);
  const regionMaxY = clamp(Math.ceil(Math.max(region.minY, region.maxY)), 0, maxY);
  return { minX, minY, maxX: regionMaxX, maxY: regionMaxY };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
