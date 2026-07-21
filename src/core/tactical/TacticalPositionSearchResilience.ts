import type { SimulationState } from '../simulation/SimulationState';
import {
  TacticalPositionSearchService,
  type TacticalPositionSearchParameters,
  type TacticalPositionSearchRequestSnapshotV1,
} from './TacticalPositionSearchService';

const PATCH_FLAG = Symbol.for('real-wargame.tactical-position-search-resilience.v1');
const RETRYABLE_REASON_CODES = new Set([
  'input_changed',
  'field_identity_changed',
  'static_basis_identity_changed',
]);

interface ResilienceState {
  readonly unsubscribe: () => void;
  readonly scheduledRequestIds: Set<string>;
}

const resilienceByService = new WeakMap<TacticalPositionSearchService, ResilienceState>();
const prototype = TacticalPositionSearchService.prototype as TacticalPositionSearchService['prototype'] & Record<PropertyKey, unknown>;

if (!prototype[PATCH_FLAG]) {
  prototype[PATCH_FLAG] = true;
  const originalEnqueue = TacticalPositionSearchService.prototype.enqueue;
  const originalDestroy = TacticalPositionSearchService.prototype.destroy;

  TacticalPositionSearchService.prototype.enqueue = function resilientEnqueue(...args) {
    ensureResilience(this);
    return originalEnqueue.apply(this, args);
  };

  TacticalPositionSearchService.prototype.destroy = function resilientDestroy(): void {
    const resilience = resilienceByService.get(this);
    resilience?.unsubscribe();
    resilience?.scheduledRequestIds.clear();
    resilienceByService.delete(this);
    originalDestroy.call(this);
  };
}

function ensureResilience(service: TacticalPositionSearchService): void {
  if (resilienceByService.has(service)) return;
  const state = (service as unknown as { readonly state: SimulationState }).state;
  const scheduledRequestIds = new Set<string>();
  const unsubscribe = service.subscribe(() => {
    for (const unit of state.units) {
      const request = service.readLatestForUnit(unit.id);
      if (!isRetryableStale(request) || scheduledRequestIds.has(request.requestId)) continue;
      scheduledRequestIds.add(request.requestId);
      queueMicrotask(() => {
        scheduledRequestIds.delete(request.requestId);
        const latest = service.readLatestForOwnerKey(request.ownerUnitId, request.queryKey);
        if (!latest || latest.requestId !== request.requestId || !isRetryableStale(latest)) return;
        const owner = state.units.find((candidate) => candidate.id === latest.ownerUnitId);
        if (!owner) return;
        service.enqueue(owner, latest.kind, retryParameters(latest), { forceRefresh: true });
      });
    }
  });
  resilienceByService.set(service, { unsubscribe, scheduledRequestIds });
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
