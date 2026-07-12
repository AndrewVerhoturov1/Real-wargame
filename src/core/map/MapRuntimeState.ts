import type { MapObject, TacticalMap } from './MapModel';

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
  observedObjectArray: MapObject[] | null;
  objectProxyByTarget: WeakMap<MapObject, MapObject>;
  objectProxies: WeakSet<MapObject>;
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
  const state = getRuntimeState(map);
  return recordMapChangeWithState(state, layer, clampRegionToMap(map, region));
}

export function markMapObjectsDirty(map: TacticalMap, region?: MapDirtyRegion): number {
  const state = getRuntimeState(map);
  return recordMapChangeWithState(state, 'objects', clampRegionToMap(map, region ?? fullMapRegion(map)));
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

export function ensureMapObjectObservation(map: TacticalMap): void {
  ensureObjectObservation(map, getRuntimeState(map));
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

export function getMapObjectDirtyRegion(map: TacticalMap, object: MapObject): MapDirtyRegion {
  const halfWidth = Math.max(0.05, object.widthCells / 2);
  const halfHeight = Math.max(0.05, object.heightCells / 2);
  const cos = Math.abs(Math.cos(object.rotationRadians));
  const sin = Math.abs(Math.sin(object.rotationRadians));
  const extentX = cos * halfWidth + sin * halfHeight;
  const extentY = sin * halfWidth + cos * halfHeight;
  const centerX = object.x + 0.5;
  const centerY = object.y + 0.5;
  return clampRegionToMap(map, {
    minX: centerX - extentX,
    minY: centerY - extentY,
    maxX: centerX + extentX,
    maxY: centerY + extentY,
  });
}

function getRuntimeState(map: TacticalMap): MapRuntimeState {
  const existing = runtimeStateByMap.get(map);
  if (existing) {
    ensureObjectObservation(map, existing);
    return existing;
  }

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
    observedObjectArray: null,
    objectProxyByTarget: new WeakMap<MapObject, MapObject>(),
    objectProxies: new WeakSet<MapObject>(),
  };
  runtimeStateByMap.set(map, created);
  ensureObjectObservation(map, created);
  return created;
}

function ensureObjectObservation(map: TacticalMap, state: MapRuntimeState): void {
  if (state.observedObjectArray === map.objects) return;

  const wrapped = map.objects.map((object) => wrapMapObject(map, state, object));
  const observed = new Proxy(wrapped, {
    set(target, property, value, receiver) {
      if (isArrayIndex(property)) {
        const index = Number(property);
        const previous = target[index];
        const previousRegion = previous ? getMapObjectDirtyRegion(map, previous) : null;
        const next = wrapMapObject(map, state, value as MapObject);
        const changed = Reflect.set(target, property, next, receiver);
        if (changed && previous !== next) {
          const nextRegion = getMapObjectDirtyRegion(map, next);
          recordMapChangeWithState(
            state,
            'objects',
            previousRegion ? mergeDirtyRegions(previousRegion, nextRegion) : nextRegion,
          );
        }
        return changed;
      }

      if (property === 'length') {
        const previousLength = target.length;
        const changed = Reflect.set(target, property, value, receiver);
        if (changed && typeof value === 'number' && value < previousLength) {
          recordMapChangeWithState(state, 'objects', fullMapRegion(map));
        }
        return changed;
      }

      return Reflect.set(target, property, value, receiver);
    },
    deleteProperty(target, property) {
      if (isArrayIndex(property)) {
        const previous = target[Number(property)];
        const deleted = Reflect.deleteProperty(target, property);
        if (deleted && previous) {
          recordMapChangeWithState(state, 'objects', getMapObjectDirtyRegion(map, previous));
        }
        return deleted;
      }
      return Reflect.deleteProperty(target, property);
    },
  });

  state.observedObjectArray = observed;
  map.objects = observed;
}

function wrapMapObject(map: TacticalMap, state: MapRuntimeState, object: MapObject): MapObject {
  if (state.objectProxies.has(object)) return object;
  const existing = state.objectProxyByTarget.get(object);
  if (existing) return existing;

  const proxy = new Proxy(object, {
    set(target, property, value, receiver) {
      const previous = Reflect.get(target, property, receiver);
      if (Object.is(previous, value)) return true;
      const before = getMapObjectDirtyRegion(map, target);
      const changed = Reflect.set(target, property, value, receiver);
      if (changed) {
        const after = getMapObjectDirtyRegion(map, target);
        recordMapChangeWithState(state, 'objects', mergeDirtyRegions(before, after));
      }
      return changed;
    },
  });
  state.objectProxyByTarget.set(object, proxy);
  state.objectProxies.add(proxy);
  return proxy;
}

function recordMapChangeWithState(
  state: MapRuntimeState,
  layer: MapRevisionLayer,
  region: MapDirtyRegion,
): number {
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

function isArrayIndex(property: string | symbol): boolean {
  if (typeof property !== 'string' || property === '') return false;
  const numeric = Number(property);
  return Number.isInteger(numeric) && numeric >= 0 && String(numeric) === property;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
