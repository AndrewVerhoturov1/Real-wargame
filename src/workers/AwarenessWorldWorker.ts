import { buildAwarenessWorldField } from '../core/knowledge/AwarenessWorldFieldBuilder';
import {
  awarenessWorkerTransferables,
  type AwarenessWorkerRequest,
  type AwarenessWorkerResponse,
} from '../core/knowledge/AwarenessWorldWorkerProtocol';
import type {
  ElevationLevel,
  ForestLayerKind,
  MapCell,
  TacticalMap,
  TerrainKind,
} from '../core/map/MapModel';
import type { UnitModel } from '../core/units/UnitModel';

const TERRAIN_KINDS: readonly TerrainKind[] = ['field', 'forest', 'road', 'swamp', 'rough', 'water'];

type WorkerGlobal = {
  onmessage: ((event: MessageEvent<AwarenessWorkerRequest>) => void) | null;
  postMessage(message: AwarenessWorkerResponse, transfer?: Transferable[]): void;
};

const workerGlobal = globalThis as unknown as WorkerGlobal;
let configuredMap: TacticalMap | null = null;
let configuredMapKey = '';
let workerUnit: UnitModel | null = null;

workerGlobal.onmessage = (event): void => {
  const request = event.data;
  if (request.type === 'configure') {
    configuredMap = restoreMap(request.map);
    configuredMapKey = request.map.mapKey;
    workerUnit = null;
    return;
  }

  const snapshot = request.snapshot;
  try {
    if (!configuredMap || configuredMapKey !== snapshot.mapKey) {
      throw new Error(`Awareness worker map mismatch: configured=${configuredMapKey || 'none'}, requested=${snapshot.mapKey}`);
    }
    const result = buildAwarenessWorldField(configuredMap, snapshot, workerUnit);
    workerUnit = result.reusableUnit;
    const response: Extract<AwarenessWorkerResponse, { type: 'result' }> = {
      type: 'result',
      jobId: snapshot.jobId,
      rasterKey: snapshot.rasterKey,
      canonicalThreatKey: snapshot.canonicalThreatKey,
      mapKey: snapshot.mapKey,
      finalExact: snapshot.finalExact,
      computeMs: result.computeMs,
      fieldIdentity: result.fieldIdentity,
      rasterDigest: result.rasterDigest,
      field: result.field,
      computation: result.computation,
    };
    workerGlobal.postMessage(response, awarenessWorkerTransferables(response));
  } catch (error) {
    workerGlobal.postMessage({
      type: 'error',
      jobId: snapshot.jobId,
      rasterKey: snapshot.rasterKey,
      canonicalThreatKey: snapshot.canonicalThreatKey,
      mapKey: snapshot.mapKey,
      message: error instanceof Error ? `${error.message}\n${error.stack ?? ''}`.trim() : String(error),
    });
  }
};

function restoreMap(snapshot: Extract<AwarenessWorkerRequest, { type: 'configure' }>['map']): TacticalMap {
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
