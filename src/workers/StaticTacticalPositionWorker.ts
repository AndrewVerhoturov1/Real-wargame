/// <reference lib="webworker" />

import {
  EnvironmentProfileRegistry,
} from '../core/map/EnvironmentMaterialProfile';
import { installEnvironmentProfileRegistry } from '../core/map/EnvironmentProfileRuntime';
import { buildStaticTacticalPositionBasis } from '../core/tactical/static/StaticTacticalPositionBuilder';
import {
  staticTacticalPositionWorkerTransferables,
  type StaticTacticalPositionWorkerRequest,
  type StaticTacticalPositionWorkerResponse,
} from '../core/tactical/static/StaticTacticalPositionWorkerProtocol';

const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<StaticTacticalPositionWorkerRequest>): void => {
  const request = event.data;
  if (request.type !== 'build') return;
  try {
    installEnvironmentProfileRegistry(new EnvironmentProfileRegistry({
      revision: Math.max(1, request.environmentProfile.revision),
      activeProfileId: request.environmentProfile.id,
      profiles: [request.environmentProfile],
    }));
    const result = buildStaticTacticalPositionBasis(request.map, request.identity, request.settings);
    const response: Extract<StaticTacticalPositionWorkerResponse, { type: 'result' }> = {
      type: 'result',
      jobId: request.jobId,
      identity: request.identity,
      snapshot: result.snapshot,
    };
    workerScope.postMessage(response, staticTacticalPositionWorkerTransferables(response));
  } catch (error) {
    const response: Extract<StaticTacticalPositionWorkerResponse, { type: 'error' }> = {
      type: 'error',
      jobId: request.jobId,
      identity: request.identity,
      message: error instanceof Error ? error.message : String(error),
    };
    workerScope.postMessage(response);
  }
};
