import type { SimulationState } from '../simulation/SimulationState';
import {
  TacticalPositionSearchService,
  type TacticalPositionSearchParameters,
  type TacticalPositionSearchRequestSnapshotV1,
} from './TacticalPositionSearchService';

const MAX_AUTO_REFRESH_ATTEMPTS = 3;
const RETRYABLE_REASON_CODES = new Set([
  'input_changed',
  'field_identity_changed',
  'static_basis_identity_changed',
]);

interface ResilienceState {
  readonly simulation: SimulationState;
  readonly service: TacticalPositionSearchService;
  readonly originalEnqueue: TacticalPositionSearchService['enqueue'];
  readonly patchedEnqueue: TacticalPositionSearchService['enqueue'];
  readonly scheduledRequestIds: Set<string>;
  readonly retryAttemptsByOwnerKey: Map<string, number>;
  unsubscribe: () => void;
  referenceCount: number;
  automaticEnqueueDepth: number;
  destroyed: boolean;
}

const resilienceByService = new WeakMap<TacticalPositionSearchService, ResilienceState>();

/**
 * Adds bounded automatic refresh to one live tactical-position service.
 *
 * Installation is explicit and session-scoped. Importing this module has no
 * global side effects, so headless simulation, scheduler and graph tests keep
 * the unmodified core service. The browser application installs this adapter
 * alongside the shared awareness controller and removes it during teardown.
 */
export function installTacticalPositionSearchResilience(
  simulation: SimulationState,
  service: TacticalPositionSearchService,
): () => void {
  const existing = resilienceByService.get(service);
  if (existing && !existing.destroyed) {
    existing.referenceCount += 1;
    return () => release(existing);
  }

  const originalEnqueue = service.enqueue;
  const state: ResilienceState = {
    simulation,
    service,
    originalEnqueue,
    patchedEnqueue: originalEnqueue,
    scheduledRequestIds: new Set<string>(),
    retryAttemptsByOwnerKey: new Map<string, number>(),
    unsubscribe: () => undefined,
    referenceCount: 1,
    automaticEnqueueDepth: 0,
    destroyed: false,
  };

  const patchedEnqueue: TacticalPositionSearchService['enqueue'] = function patchedTacticalPositionEnqueue(
    this: TacticalPositionSearchService,
    ...args: Parameters<TacticalPositionSearchService['enqueue']>
  ) {
    if (state.automaticEnqueueDepth === 0) {
      const unitId = args[0]?.id;
      if (unitId) clearUnitRetryAttempts(state, unitId);
    }
    return originalEnqueue.apply(this, args);
  };
  (state as { patchedEnqueue: TacticalPositionSearchService['enqueue'] }).patchedEnqueue = patchedEnqueue;
  service.enqueue = patchedEnqueue;
  state.unsubscribe = service.subscribe(() => reconcileRetryableRequests(state));
  resilienceByService.set(service, state);

  return () => release(state);
}

function reconcileRetryableRequests(state: ResilienceState): void {
  if (state.destroyed) return;
  for (const unit of state.simulation.units) {
    const request = state.service.readLatestForUnit(unit.id);
    if (!request) continue;
    const ownerKey = buildOwnerKey(request.ownerUnitId, request.queryKey);
    if (request.status === 'ready' || request.status === 'cancelled' || request.status === 'failed') {
      state.retryAttemptsByOwnerKey.delete(ownerKey);
      continue;
    }
    if (!isRetryableStale(request) || state.scheduledRequestIds.has(request.requestId)) continue;
    if ((state.retryAttemptsByOwnerKey.get(ownerKey) ?? 0) >= MAX_AUTO_REFRESH_ATTEMPTS) continue;
    state.scheduledRequestIds.add(request.requestId);
    queueMicrotask(() => retryLatestRequest(state, request, ownerKey));
  }
}

function retryLatestRequest(
  state: ResilienceState,
  request: TacticalPositionSearchRequestSnapshotV1,
  ownerKey: string,
): void {
  state.scheduledRequestIds.delete(request.requestId);
  if (state.destroyed) return;
  const latest = state.service.readLatestForOwnerKey(request.ownerUnitId, request.queryKey);
  if (!latest || latest.requestId !== request.requestId || !isRetryableStale(latest)) return;
  const attempts = state.retryAttemptsByOwnerKey.get(ownerKey) ?? 0;
  if (attempts >= MAX_AUTO_REFRESH_ATTEMPTS) return;
  const owner = state.simulation.units.find((candidate) => candidate.id === latest.ownerUnitId);
  if (!owner) return;

  state.retryAttemptsByOwnerKey.set(ownerKey, attempts + 1);
  state.automaticEnqueueDepth += 1;
  try {
    state.service.enqueue(owner, latest.kind, retryParameters(latest), { forceRefresh: true });
  } finally {
    state.automaticEnqueueDepth = Math.max(0, state.automaticEnqueueDepth - 1);
  }
}

function release(state: ResilienceState): void {
  if (state.destroyed) return;
  state.referenceCount -= 1;
  if (state.referenceCount > 0) return;
  state.destroyed = true;
  state.unsubscribe();
  state.scheduledRequestIds.clear();
  state.retryAttemptsByOwnerKey.clear();
  if (state.service.enqueue === state.patchedEnqueue) state.service.enqueue = state.originalEnqueue;
  resilienceByService.delete(state.service);
}

function clearUnitRetryAttempts(state: ResilienceState, unitId: string): void {
  const prefix = `${unitId}|`;
  for (const ownerKey of state.retryAttemptsByOwnerKey.keys()) {
    if (ownerKey.startsWith(prefix)) state.retryAttemptsByOwnerKey.delete(ownerKey);
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
