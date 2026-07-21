import assert from 'node:assert/strict';
import { normalizeMap } from '../src/core/map/MapModel';
import { markMapCellsDirty } from '../src/core/map/MapRuntimeState';
import type { SimulationState } from '../src/core/simulation/SimulationState';
import { buildHighQualityStaticTacticalPositionBasis } from '../src/core/tactical/static/HighQualityStaticTacticalPositionBuilder';
import { StaticTacticalPositionService } from '../src/core/tactical/static/StaticTacticalPositionService';
import type {
  StaticTacticalPositionWorkerRequest,
  StaticTacticalPositionWorkerResponse,
} from '../src/core/tactical/static/StaticTacticalPositionWorkerProtocol';

const instances: FakeWorker[] = [];

class FakeWorker {
  onmessage: ((event: MessageEvent<StaticTacticalPositionWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly requests: Array<Extract<StaticTacticalPositionWorkerRequest, { type: 'build' }>> = [];
  terminated = false;

  constructor(_url: URL, _options?: WorkerOptions) {
    instances.push(this);
  }

  postMessage(message: StaticTacticalPositionWorkerRequest): void {
    if (message.type === 'build') this.requests.push(message);
  }

  emit(response: StaticTacticalPositionWorkerResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<StaticTacticalPositionWorkerResponse>);
  }

  fail(message: string): void {
    this.onerror?.({ message } as ErrorEvent);
  }

  terminate(): void {
    this.terminated = true;
  }
}

const originalWorker = globalThis.Worker;
(globalThis as { Worker: typeof Worker }).Worker = FakeWorker as unknown as typeof Worker;

try {
  const state = {
    map: normalizeMap({
      width: 4,
      height: 4,
      cellSize: 4,
      metersPerCell: 2,
      defaultTerrain: 'field',
      defaultHeight: 0,
    }),
  } as unknown as SimulationState;
  const service = new StaticTacticalPositionService(state);
  let publications = 0;
  const unsubscribe = service.subscribe(() => { publications += 1; });

  assert.equal(service.request(), null);
  const worker = instances[0]!;
  assert.ok(worker);
  assert.equal(worker.requests.length, 1, 'first identity must start exactly one worker build');
  assert.equal(service.request(), null);
  assert.equal(worker.requests.length, 1, 'another consumer must reuse the same in-flight build');

  const firstRequest = worker.requests[0]!;
  worker.emit(resultFor(firstRequest));
  const firstReady = service.readReady();
  assert.ok(firstReady);
  assert.equal(service.getDiagnostics().status, 'ready');
  assert.equal(service.request(), firstReady, 'ready consumers must share the same immutable basis');
  assert.equal(worker.requests.length, 1);

  markMapCellsDirty(state.map, 'height', { minX: 1, minY: 1, maxX: 1, maxY: 1 });
  assert.equal(service.request(), null);
  assert.equal(worker.requests.length, 2, 'a new map revision must start one replacement build');
  assert.equal(service.readReady(), null, 'old basis must not be exposed under a new requested identity');
  const secondRequest = worker.requests[1]!;

  worker.emit(resultFor(firstRequest));
  assert.equal(service.getDiagnostics().workerResultsStaleDropped, 1, 'late old worker result must be dropped');
  assert.equal(service.getDiagnostics().status, 'calculating');

  worker.fail('synthetic static worker failure');
  assert.equal(service.getDiagnostics().status, 'failed');
  assert.equal(service.getDiagnostics().lastError, 'synthetic static worker failure');

  assert.equal(service.request(), null);
  assert.equal(worker.requests.length, 3, 'failed identity must be retryable');
  const retryRequest = worker.requests[2]!;
  assert.equal(retryRequest.identity.terrainRevision, secondRequest.identity.terrainRevision);
  assert.equal(retryRequest.identity.heightRevision, secondRequest.identity.heightRevision);
  worker.emit(resultFor(retryRequest));
  assert.ok(service.readReady());
  assert.equal(service.getDiagnostics().status, 'ready');
  assert.equal(service.getDiagnostics().workerJobsStarted, 3);
  assert.equal(service.getDiagnostics().workerJobsCompleted, 2);
  assert.ok(publications > 0);

  unsubscribe();
  service.destroy();
  assert.equal(worker.terminated, true);
  assert.equal(service.getDiagnostics().status, 'destroyed');
} finally {
  if (originalWorker) (globalThis as { Worker: typeof Worker }).Worker = originalWorker;
  else delete (globalThis as { Worker?: typeof Worker }).Worker;
}

console.log('static tactical position service lifecycle smoke: ok');

function resultFor(
  request: Extract<StaticTacticalPositionWorkerRequest, { type: 'build' }>,
): Extract<StaticTacticalPositionWorkerResponse, { type: 'result' }> {
  return {
    type: 'result',
    jobId: request.jobId,
    identity: request.identity,
    snapshot: buildHighQualityStaticTacticalPositionBasis(
      request.map,
      request.identity,
      request.settings,
    ).snapshot,
  };
}
