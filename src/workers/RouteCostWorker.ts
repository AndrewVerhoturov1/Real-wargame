import type {
  ElevationLevel,
  ForestLayerKind,
  MapCell,
  TacticalMap,
  TerrainKind,
} from '../core/map/MapModel';
import {
  createRouteCostFieldCache,
  getRouteCostFields,
  type RouteCostFields,
} from '../core/navigation/RouteCostField';
import {
  routeCostWorkerTransferables,
  type RouteCostWorkerRequest,
  type RouteCostWorkerResponse,
} from '../core/navigation/RouteCostWorkerProtocol';

const TERRAIN_KINDS: readonly TerrainKind[] = ['field', 'forest', 'road', 'swamp', 'rough', 'water'];

type WorkerGlobal = {
  onmessage: ((event: MessageEvent<RouteCostWorkerRequest>) => void) | null;
  postMessage(message: RouteCostWorkerResponse, transfer?: Transferable[]): void;
};

const workerGlobal = globalThis as unknown as WorkerGlobal;
let configuredMap: TacticalMap | null = null;
let configuredMapKey = '';
let routeCache = createRouteCostFieldCache();

workerGlobal.onmessage = (event): void => {
  const request = event.data;
  if (request.type === 'configure') {
    configuredMap = restoreMap(request.map);
    configuredMapKey = request.map.mapKey;
    routeCache = createRouteCostFieldCache();
    return;
  }

  const snapshot = request.snapshot;
  const startedAt = performance.now();
  try {
    if (!configuredMap || configuredMapKey !== snapshot.mapKey) {
      throw new Error(`Route-cost worker map mismatch: configured=${configuredMapKey || 'none'}, requested=${snapshot.mapKey}`);
    }
    const fields = getRouteCostFields(
      configuredMap,
      snapshot.profile,
      snapshot.tacticalContext,
      routeCache,
    );
    const response: Extract<RouteCostWorkerResponse, { type: 'result' }> = {
      type: 'result',
      jobId: snapshot.jobId,
      requestKey: snapshot.requestKey,
      mapKey: snapshot.mapKey,
      computeMs: performance.now() - startedAt,
      fields: cloneFields(fields),
    };
    workerGlobal.postMessage(response, routeCostWorkerTransferables(response));
  } catch (error) {
    workerGlobal.postMessage({
      type: 'error',
      jobId: snapshot.jobId,
      requestKey: snapshot.requestKey,
      mapKey: snapshot.mapKey,
      message: error instanceof Error ? `${error.message}\n${error.stack ?? ''}`.trim() : String(error),
    });
  }
};

function cloneFields(fields: RouteCostFields): RouteCostFields {
  return {
    ...fields,
    passable: fields.passable.slice(),
    // Terrain keys are map-static and already retained by the main-thread direct
    // field. Avoid structured-cloning 64k repeated strings with every response;
    // the client restores the canonical main-map array before publishing.
    terrainKeys: [],
    terrainCost: fields.terrainCost.slice(),
    slopeCost: fields.slopeCost.slice(),
    dangerCost: fields.dangerCost.slice(),
    exposureCost: fields.exposureCost.slice(),
    directionalTerrainCost: fields.directionalTerrainCost.slice(),
    directionalSlope: fields.directionalSlope.slice(),
    crestStrength: fields.crestStrength.slice(),
    valleyStrength: fields.valleyStrength.slice(),
    silhouettePotential: fields.silhouettePotential.slice(),
    threatSectorWeights: fields.threatSectorWeights.slice(),
    coverAdjustment: fields.coverAdjustment.slice(),
    enemyDistanceCost: fields.enemyDistanceCost.slice(),
    territoryCost: fields.territoryCost.slice(),
    totalCost: fields.totalCost.slice(),
    availability: { ...fields.availability },
  };
}

function restoreMap(snapshot: Extract<RouteCostWorkerRequest, { type: 'configure' }>['map']): TacticalMap {
  const cells: MapCell[] = new Array(snapshot.width * snapshot.height);
  for (let y = 0; y < snapshot.height; y += 1) {
    for (let x = 0; x < snapshot.width; x += 1) {
      const index = y * snapshot.width + x;
      cells[index] = {
        x,
        y,
        terrain: TERRAIN_KINDS[snapshot.terrainCodes[index] ?? 0] ?? 'field',
        height: clampHeight(snapshot.heightLevels[index] ?? 0),
        forest: clampForest(snapshot.forestKinds[index] ?? 0),
      };
    }
  }
  return {
    width: snapshot.width,
    height: snapshot.height,
    cellSize: snapshot.cellSize,
    metersPerCell: snapshot.metersPerCell,
    sourceToRuntimeCellScale: snapshot.sourceToRuntimeCellScale,
    defaultTerrain: TERRAIN_KINDS[snapshot.defaultTerrainCode] ?? 'field',
    defaultHeight: clampHeight(snapshot.defaultHeight),
    cells,
    objects: snapshot.objects.map((object) => ({
      ...object,
      labels: object.labels ? { ...object.labels } : null,
    })),
  };
}

function clampHeight(value: number): ElevationLevel {
  const rounded = Math.round(value);
  if (rounded <= -2) return -2;
  if (rounded >= 4) return 4;
  return rounded as ElevationLevel;
}

function clampForest(value: number): ForestLayerKind {
  if (value <= 0) return 0;
  if (value >= 2) return 2;
  return 1;
}
