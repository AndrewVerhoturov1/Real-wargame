/// <reference lib="webworker" />

import { EnvironmentProfileRegistry } from '../core/map/EnvironmentMaterialProfile';
import { installEnvironmentProfileRegistry } from '../core/map/EnvironmentProfileRuntime';
import { searchGeneralizedTacticalPositions } from '../core/tactical/GeneralizedTacticalPositionSearch';
import type {
  TacticalPositionQueryWorkerConfiguration,
  TacticalPositionQueryWorkerRequest,
  TacticalPositionQueryWorkerResponse,
} from '../core/tactical/TacticalPositionQueryWorkerProtocol';

const workerScope = self as DedicatedWorkerGlobalScope;
let configuration: TacticalPositionQueryWorkerConfiguration | null = null;

workerScope.onmessage = (event: MessageEvent<TacticalPositionQueryWorkerRequest>): void => {
  const request = event.data;
  if (request.type === 'configure') {
    try {
      installEnvironmentProfileRegistry(new EnvironmentProfileRegistry({
        revision: Math.max(1, request.configuration.environmentProfile.revision),
        activeProfileId: request.configuration.environmentProfile.id,
        profiles: [request.configuration.environmentProfile],
      }));
      configuration = request.configuration;
      const response: TacticalPositionQueryWorkerResponse = {
        type: 'configured',
        basisIdentityKey: request.configuration.basisIdentityKey,
      };
      workerScope.postMessage(response);
    } catch (error) {
      const response: TacticalPositionQueryWorkerResponse = {
        type: 'error',
        jobId: null,
        basisIdentityKey: request.configuration.basisIdentityKey,
        message: error instanceof Error ? error.message : String(error),
      };
      workerScope.postMessage(response);
    }
    return;
  }

  if (!configuration || configuration.basisIdentityKey !== request.basisIdentityKey) {
    const response: TacticalPositionQueryWorkerResponse = {
      type: 'error',
      jobId: request.jobId,
      basisIdentityKey: request.basisIdentityKey,
      message: 'Tactical query worker static basis identity is not configured.',
    };
    workerScope.postMessage(response);
    return;
  }

  try {
    const result = searchGeneralizedTacticalPositions({
      ...request.field,
      staticProtectionByPosture: {
        standing: request.field.staticProtectionStanding,
        crouched: request.field.staticProtectionCrouched,
        prone: request.field.staticProtectionProne,
      },
      staticBasis: configuration.basis,
      map: configuration.map,
    }, request.request);
    const response: TacticalPositionQueryWorkerResponse = {
      type: 'result',
      jobId: request.jobId,
      basisIdentityKey: request.basisIdentityKey,
      fieldIdentity: request.fieldIdentity,
      result,
    };
    workerScope.postMessage(response);
  } catch (error) {
    const response: TacticalPositionQueryWorkerResponse = {
      type: 'error',
      jobId: request.jobId,
      basisIdentityKey: request.basisIdentityKey,
      message: error instanceof Error ? error.message : String(error),
    };
    workerScope.postMessage(response);
  }
};
