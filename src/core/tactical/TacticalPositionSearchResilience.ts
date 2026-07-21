import type { SimulationState } from '../simulation/SimulationState';
import {
  TacticalPositionSearchService,
  type TacticalPositionSearchParameters,
  type TacticalPositionSearchRequestSnapshotV1,
} from './TacticalPositionSearchService';

const PATCH_FLAG = Symbol.for('real-wargame.tactical-position-search-resilience.v1');
const MAX_AUTO_REFRESH_ATTEMPTS = 3;
const RETRYABLE_REASON_CODES = new Set([
  'input_changed',
  'field_identity_changed',
  'static_basis_identity_changed',
]);

interface ResilienceState {
  unsubscribe: () => void;
  readonly scheduledRequestIds: Set<string>;
  readonly retryAttemptsByOwnerKey: Map<string, number>;
}

const resilienceByService = new WeakMap<TacticalPositionSearchService, ResilienceState>();
const automaticEnqueueServices = new WeakSet<TacticalPositionSearchService>();
const prototype = TacticalPositionSearchService.prototype as TacticalPositionSearchService & Record<PropertyKey, unknown>;

if (!prototype[PATCH_FLAG]) {
  prototype[PATCH_FLAG] = true;
  const originalEnqueue = TacticalPositionSearchService.prototype.enqueue;
  const originalDestroy = TacticalPositionSearchService.prototype.destroy;

  TacticalPositionSearchService.prototype.enqueue = function resilientEnqueue(...args) {
    ensureResilience(this);
    if (!automaticEnqueueServices.has(this)) {
      const unitId = args[0]?.id;
      const resilience = resilienceByService.get(this);
      if (unitId && resilience) clearUnitRetryAttempts(resilience, unitId);
    }
    return originalEnqueue.apply(this, args);
  };

  TacticalPositionSearchService.prototype.destroy = function resilientDestroy(): void {
    const resilience = resilienceByService.get(this);
    resilience?.unsubscribe();
    resilience?.scheduledRequestIds.clear();
    resilience?.retryAttemptsByOwnerKey.clear();
    resilienceByService.delete(this);
    automaticEnqueueServices.delete(this);
    originalDestroy.call(this);
  };
}

function ensureResilience(service: TacticalPositionSearchService): void {
  if (resilienceByService.has(service)) return;
  const state = (service as unknown as { readonly state: SimulationState }).state;
  const scheduledRequestIds = new Set<string>();
  const retryAttemptsByOwnerKey = new Map<string, number>();
  const resilience: ResilienceState = {
    unsubscribe: () => undefined,
    scheduledRequestIds,
    retryAttemptsByOwnerKey,
  };
  resilience.unsubscribe = service.subscribe(() => {
    for (const unit of state.units) {
      const request = service.readLatestForUnit(unit.id);
      if (!request) continue;
      const ownerKey = buildOwnerKey(request.ownerUnitId, request.queryKey);
      if (request.status === 'ready' || request.status === 'cancelled' || request.status === 'failed') {
        retryAttemptsByOwnerKey.delete(ownerKey);
        continue;
      }
      if (!isRetryableStale(request) || scheduledRequestIds.has(request.requestId)) continue;
      if ((retryAttemptsByOwnerKey.get(ownerKey) ?? 0) >= MAX_AUTO_REFRESH_ATTEMPTS) continue;
      scheduledRequestIds.add(request.requestId);
      queueMicrotask(() => {
        scheduledRequestIds.delete(request.requestId);
        const latest = service.readLatestForOwnerKey(request.ownerUnitId, request.queryKey);
        if (!latest || latest.requestId !== request.requestId || !isRetryableStale(latest)) return;
        const attempts = retryAttemptsByOwnerKey.get(ownerKey) ?? 0;
        if (attempts >= MAX_AUTO_REFRESH_ATTEMPTS) return;
        const owner = state.units.find((candidate) => candidate.id === latest.ownerUnitId);
        if (!owner) return;
        retryAttemptsByOwnerKey.set(ownerKey, attempts + 1);
        automaticEnqueueServices.add(service);
        try {
          service.enqueue(owner, latest.kind, retryParameters(latest), { forceRefresh: true });
        } finally {
          automaticEnqueueServices.delete(service);
        }
      });
    }
  });
  resilienceByService.set(service, resilience);
}

function clearUnitRetryAttempts(resilience: ResilienceState, unitId: string): void {
  const prefix = `${unitId}|`;
  for (const ownerKey of resilience.retryAttemptsByOwnerKey.keys()) {
    if (ownerKey.startsWith(prefix)) resilience.retryAttemptsByOwnerKey.delete(ownerKey);
  }
}

function buildOwnerKey(unitId: string, queryKey: string): string {
  return `${unitId}|${queryKey}`;
}

function isRetryableStale(
  request: TacticalPositionSearchRequestSnapshotV1 | null,
): request is TacticalPositionSearchRequestSnapshotV1 {
  return Boolean(
    request
      && request.status === 'stale'
      && request.reasonCode
      && RETRYABLE_REASON_CODES.has(request.reasonCode),
  );
}

function retryParameters(request: TacticalPositionSearchRequestSnapshotV1): TacticalPositionSearchParameters {
  return {
    objective: request.objective,
    queryKey: request.queryKey,
    target: request.target,
    searchRadiusMeters: request.searchRadiusMeters,
    maxCandidates: request.maxCandidates,
    maxSampledCells: request.maxSampledCells,
    maxRouteExpansions: request.maxRouteExpansions,
    minimumSeparationMeters: request.minimumSeparationMeters,
    maximumRouteCost: request.maximumRouteCost,
    preliminaryCandidates: request.preliminaryCandidates,
    exactCandidates: request.exactCandidates,
    exactRayLimit: request.exactRayLimit,
    maxPositionDanger: request.maxPositionDanger,
    minimumLineQuality: request.minimumLineQuality,
  };
}
