import { buildAwarenessWorldField } from '../core/knowledge/AwarenessWorldFieldBuilder';
import {
  awarenessWorkerTransferables,
  type AwarenessWorkerRequest,
  type AwarenessWorkerResponse,
} from '../core/knowledge/AwarenessWorldWorkerProtocol';
import type { TacticalMap } from '../core/map/MapModel';
import type { UnitModel } from '../core/units/UnitModel';
import {
  installAwarenessWorkerEnvironmentProfile,
  restoreAwarenessWorkerMap,
} from '../core/knowledge/AwarenessWorkerMapSnapshot';

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
    installAwarenessWorkerEnvironmentProfile(request.map);
    configuredMap = restoreAwarenessWorkerMap(request.map);
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
