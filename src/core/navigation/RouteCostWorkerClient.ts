import { measurePerformancePhase } from '../debug/PerformancePhases';
import { getEnvironmentProfileDomainKey } from '../map/EnvironmentMaterialProfile';
import { getActiveEnvironmentProfile } from '../map/EnvironmentProfileRuntime';
import type { TacticalMap, TerrainKind } from '../map/MapModel';
import { getMapRevisionSnapshot } from '../map/MapRuntimeState';
import { getBuiltInNavigationProfile, type NavigationProfile } from './NavigationProfiles';
import {
  getRouteCostFields,
  getSharedRouteCostFieldCache,
  getRouteCostMapIdentity,
  routeCostFieldsMatch,
  type RouteCostFields,
  type TacticalRouteContext,
} from './RouteCostField';
import type {
  RouteCostWorkerBuildSnapshot,
  RouteCostWorkerMapSnapshot,
  RouteCostWorkerResponse,
} from './RouteCostWorkerProtocol';

const TERRAIN_KINDS: readonly TerrainKind[] = ['field', 'forest', 'road', 'swamp', 'rough', 'water'];
const TERRAIN_CODE = new Map<TerrainKind, number>(TERRAIN_KINDS.map((kind, index) => [kind, index]));
const MAX_READY_FIELDS = 8;
const MAX_PENDING_OWNERS = 32;
// A worker preparation is allowed to outlive slow software-rendered CI frames.
// The current route remains authoritative while the exact replacement is pending;
// synchronous main-thread fallback is reserved for a genuinely failed worker.
const MAX_PENDING_MS = 30_000;

export type AsyncRouteCostPreparation =
  | { readonly status: 'ready'; readonly fields: RouteCostFields }
  | { readonly status: 'pending' }
  | { readonly status: 'unavailable' };

export interface RouteCostWorkerDiagnostics {
  readonly requests: number;
  readonly jobsStarted: number;
  readonly jobsCompleted: number;
  readonly jobsCoalesced: number;
  readonly staleResultsDropped: number;
  readonly workerErrors: number;
  readonly lastWorkerComputeMs: number;
  readonly lastWorkerError: string | null;
}

interface RequestDescriptor {
  readonly ownerKey: string;
  readonly requestKey: string;
  readonly mapKey: string;
  readonly profile: NavigationProfile;
  readonly tacticalContext: TacticalRouteContext;
}

interface InFlightRequest extends RequestDescriptor {
  readonly jobId: number;
  readonly startedAtMs: number;
}

interface MutableDiagnostics {
  requests: number;
  jobsStarted: number;
  jobsCompleted: number;
  jobsCoalesced: number;
  staleResultsDropped: number;
  workerErrors: number;
  lastWorkerComputeMs: number;
  lastWorkerError: string | null;
}

interface MapRuntime {
  worker: Worker | null;
  disabled: boolean;
  nextJobId: number;
  configuredMapKey: string;
  mainMapIdentity: number;
  inFlight: InFlightRequest | null;
  readonly pendingByOwner: Map<string, RequestDescriptor>;
  readonly latestRequestKeyByOwner: Map<string, string>;
  readonly ready: Map<string, RouteCostFields>;
  readonly diagnostics: MutableDiagnostics;
}

const runtimeByMap = new WeakMap<TacticalMap, MapRuntime>();

/**
 * Must stay byte-for-byte compatible with RouteCostField.mapRevisionKey.
 * PR #135 added the active environment movement domain to the route field key;
 * worker results that used the legacy four-part key were therefore rejected forever.
 */
export function buildRouteCostWorkerMapRevisionKey(map: TacticalMap): string {
  const revisions = getMapRevisionSnapshot(map);
  return [
    revisions.terrain,
    revisions.height,
    revisions.forest,
    getEnvironmentProfileDomainKey(getActiveEnvironmentProfile(), 'movement'),
    revisions.objects,
  ].join(':');
}

export function getOrRequestAsyncRouteCostFields(
  map: TacticalMap,
  profile: NavigationProfile,
  tacticalContext: TacticalRouteContext,
): AsyncRouteCostPreparation {
  if (typeof Worker === 'undefined') return { status: 'unavailable' };
  const runtime = getRuntime(map);
  if (!runtime || runtime.disabled || !runtime.worker) return { status: 'unavailable' };

  if (runtime.inFlight && performance.now() - runtime.inFlight.startedAtMs > MAX_PENDING_MS) {
    disableRuntime(runtime, 'Route-cost worker exceeded the bounded preparation window.');
    return { status: 'unavailable' };
  }

  const mapKey = buildMapKey(map);
  ensureConfigured(map, runtime, mapKey);
  if (runtime.disabled || !runtime.worker) return { status: 'unavailable' };

  const ownerKey = tacticalContext.unitId;
  const requestKey = buildRequestKey(mapKey, profile, tacticalContext);
  runtime.latestRequestKeyByOwner.set(ownerKey, requestKey);
  runtime.diagnostics.requests += 1;
  const ready = runtime.ready.get(requestKey);
  if (ready) {
    if (routeCostFieldsMatch(map, profile, ready)) {
      runtime.pendingByOwner.delete(ownerKey);
      touch(runtime.ready, requestKey, ready);
      return { status: 'ready', fields: ready };
    }
    runtime.ready.delete(requestKey);
  }

  const descriptor: RequestDescriptor = {
    ownerKey,
    requestKey,
    mapKey,
    profile: cloneProfile(profile),
    tacticalContext: cloneContext(tacticalContext),
  };
  if (runtime.inFlight) {
    if (runtime.inFlight.requestKey !== requestKey) queueLatestOwnerRequest(runtime, descriptor);
    return { status: 'pending' };
  }

  startRequest(runtime, descriptor);
  return { status: 'pending' };
}

export function getRouteCostWorkerDiagnostics(map: TacticalMap): RouteCostWorkerDiagnostics {
  const runtime = runtimeByMap.get(map);
  return runtime ? { ...runtime.diagnostics } : emptyDiagnostics();
}

export function clearAsyncRouteCostWorker(map: TacticalMap): void {
  const runtime = runtimeByMap.get(map);
  runtime?.worker?.terminate();
  runtimeByMap.delete(map);
}

function getRuntime(map: TacticalMap): MapRuntime | null {
  const existing = runtimeByMap.get(map);
  if (existing) return existing;
  try {
    const worker = new Worker(new URL('../../workers/RouteCostWorker.ts', import.meta.url), { type: 'module' });
    const created: MapRuntime = {
      worker,
      disabled: false,
      nextJobId: 1,
      configuredMapKey: '',
      mainMapIdentity: getRouteCostMapIdentity(map),
      inFlight: null,
      pendingByOwner: new Map(),
      latestRequestKeyByOwner: new Map(),
      ready: new Map(),
      diagnostics: emptyDiagnostics(),
    };
    worker.onmessage = (event: MessageEvent<RouteCostWorkerResponse>) => {
      handleResponse(map, created, event.data);
    };
    worker.onerror = (event): void => {
      disableRuntime(created, event.message || 'Unknown route-cost worker error.');
    };
    runtimeByMap.set(map, created);
    return created;
  } catch {
    return null;
  }
}

function ensureConfigured(map: TacticalMap, runtime: MapRuntime, mapKey: string): void {
  if (runtime.configuredMapKey === mapKey) return;
  if (runtime.inFlight) {
    runtime.diagnostics.staleResultsDropped += 1;
    runtime.worker?.terminate();
    try {
      runtime.worker = new Worker(new URL('../../workers/RouteCostWorker.ts', import.meta.url), { type: 'module' });
      runtime.worker.onmessage = (event: MessageEvent<RouteCostWorkerResponse>) => {
        handleResponse(map, runtime, event.data);
      };
      runtime.worker.onerror = (event): void => {
        disableRuntime(runtime, event.message || 'Unknown route-cost worker error.');
      };
    } catch (error) {
      disableRuntime(runtime, error instanceof Error ? error.message : String(error));
      return;
    }
  }
  runtime.inFlight = null;
  runtime.pendingByOwner.clear();
  runtime.latestRequestKeyByOwner.clear();
  runtime.ready.clear();
  const snapshot = measurePerformancePhase('route.worker.configure', () => buildMapSnapshot(map, mapKey));
  runtime.worker?.postMessage({ type: 'configure', map: snapshot }, [
    snapshot.terrainCodes.buffer,
    snapshot.heightLevels.buffer,
    snapshot.forestKinds.buffer,
  ]);
  runtime.configuredMapKey = mapKey;
}

function queueLatestOwnerRequest(runtime: MapRuntime, descriptor: RequestDescriptor): void {
  const current = runtime.pendingByOwner.get(descriptor.ownerKey);
  if (current?.requestKey === descriptor.requestKey) return;
  if (!current && runtime.pendingByOwner.size >= MAX_PENDING_OWNERS) {
    const oldestOwner = runtime.pendingByOwner.keys().next().value as string | undefined;
    if (oldestOwner) {
      runtime.pendingByOwner.delete(oldestOwner);
      runtime.diagnostics.staleResultsDropped += 1;
    }
  }
  runtime.pendingByOwner.set(descriptor.ownerKey, descriptor);
  runtime.diagnostics.jobsCoalesced += 1;
}

function startRequest(runtime: MapRuntime, descriptor: RequestDescriptor): void {
  if (!runtime.worker || runtime.disabled) return;
  const jobId = runtime.nextJobId;
  runtime.nextJobId += 1;
  runtime.inFlight = {
    ...descriptor,
    jobId,
    startedAtMs: performance.now(),
  };
  runtime.diagnostics.jobsStarted += 1;
  const snapshot: RouteCostWorkerBuildSnapshot = {
    jobId,
    requestKey: descriptor.requestKey,
    mapKey: descriptor.mapKey,
    profile: descriptor.profile,
    tacticalContext: descriptor.tacticalContext,
  };
  runtime.worker.postMessage({ type: 'build', snapshot });
}

function startNextPendingRequest(runtime: MapRuntime): void {
  const next = runtime.pendingByOwner.entries().next().value as [string, RequestDescriptor] | undefined;
  if (!next) return;
  runtime.pendingByOwner.delete(next[0]);
  startRequest(runtime, next[1]);
}

function handleResponse(map: TacticalMap, runtime: MapRuntime, response: RouteCostWorkerResponse): void {
  measurePerformancePhase('route.worker.response', () => {
    const inFlight = runtime.inFlight;
    if (!inFlight || response.jobId !== inFlight.jobId) {
      runtime.diagnostics.staleResultsDropped += 1;
      return;
    }
    runtime.inFlight = null;
    if (response.type === 'error') {
      disableRuntime(runtime, response.message);
      return;
    }
    runtime.diagnostics.jobsCompleted += 1;
    runtime.diagnostics.lastWorkerComputeMs = response.computeMs;
    const currentMapKey = buildMapKey(map);
    const stale = response.mapKey !== runtime.configuredMapKey
      || response.mapKey !== currentMapKey
      || response.requestKey !== inFlight.requestKey
      || response.requestKey !== runtime.latestRequestKeyByOwner.get(inFlight.ownerKey);
    if (stale) {
      runtime.diagnostics.staleResultsDropped += 1;
    } else {
      const fields: RouteCostFields = {
        ...response.fields,
        mapIdentity: runtime.mainMapIdentity,
        mapRevisionKey: buildRouteCostWorkerMapRevisionKey(map),
      };
      if (routeCostFieldsMatch(map, inFlight.profile, fields)) {
        runtime.ready.set(response.requestKey, fields);
        trimReady(runtime.ready);
      } else {
        runtime.diagnostics.staleResultsDropped += 1;
      }
    }
    startNextPendingRequest(runtime);
  });
}

function disableRuntime(runtime: MapRuntime, message: string): void {
  runtime.worker?.terminate();
  runtime.worker = null;
  runtime.disabled = true;
  runtime.inFlight = null;
  runtime.pendingByOwner.clear();
  runtime.latestRequestKeyByOwner.clear();
  runtime.ready.clear();
  runtime.diagnostics.workerErrors += 1;
  runtime.diagnostics.lastWorkerError = message;
}

function buildMapSnapshot(map: TacticalMap, mapKey: string): RouteCostWorkerMapSnapshot {
  const count = map.width * map.height;
  const terrainCodes = new Uint8Array(count);
  const heightLevels = new Int8Array(count);
  const forestKinds = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) {
    const cell = map.cells[index];
    terrainCodes[index] = TERRAIN_CODE.get(cell?.terrain ?? map.defaultTerrain) ?? 0;
    heightLevels[index] = cell?.height ?? map.defaultHeight;
    forestKinds[index] = cell?.forest ?? 0;
  }
  return {
    mapKey,
    width: map.width,
    height: map.height,
    cellSize: map.cellSize,
    metersPerCell: map.metersPerCell,
    sourceToRuntimeCellScale: map.sourceToRuntimeCellScale,
    defaultTerrainCode: TERRAIN_CODE.get(map.defaultTerrain) ?? 0,
    defaultHeight: map.defaultHeight,
    terrainCodes,
    heightLevels,
    forestKinds,
    objects: map.objects.map((object) => ({
      ...object,
      labels: object.labels ? { ...object.labels } : null,
    })),
  };
}

function buildMapKey(map: TacticalMap): string {
  return [
    map.width,
    map.height,
    map.cellSize,
    map.metersPerCell,
    map.sourceToRuntimeCellScale,
    buildRouteCostWorkerMapRevisionKey(map),
  ].join(':');
}

function buildRequestKey(
  mapKey: string,
  profile: NavigationProfile,
  context: TacticalRouteContext,
): string {
  return [
    'route-worker:v3',
    mapKey,
    profile.id,
    profile.revision,
    context.posture ?? 'standing',
    context.knowledgeRevision,
    context.exposureRevision ?? 0,
    context.territoryRevision ?? 0,
    context.knownThreats.map((threat) => [
      threat.id,
      threat.mode,
      threat.x,
      threat.y,
      threat.radiusCells,
      threat.widthCells,
      threat.heightCells,
      threat.rotationDegrees,
      threat.strength,
      threat.suppression,
      threat.confidence,
      threat.uncertaintyCells,
      threat.directionDegrees ?? 0,
      threat.arcDegrees ?? 45,
      threat.rangeCells ?? 0,
      threat.minRangeCells ?? 0,
      threat.falloffPercent ?? 0,
      threat.fireThreatClass ?? 'independent',
    ].join(':')).join('|'),
  ].join('#');
}

function cloneProfile(profile: NavigationProfile): NavigationProfile {
  return {
    ...profile,
    terrainCosts: { ...profile.terrainCosts },
    territoryWeights: { ...profile.territoryWeights },
    directionalTerrain: { ...profile.directionalTerrain },
    replanRules: { ...profile.replanRules },
  };
}

function cloneContext(context: TacticalRouteContext): TacticalRouteContext {
  return {
    ...context,
    knownThreats: context.knownThreats.map((threat) => ({ ...threat })),
  };
}

function trimReady(ready: Map<string, RouteCostFields>): void {
  while (ready.size > MAX_READY_FIELDS) {
    const oldest = ready.keys().next().value as string | undefined;
    if (!oldest) break;
    ready.delete(oldest);
  }
}

function touch<T>(cache: Map<string, T>, key: string, value: T): void {
  cache.delete(key);
  cache.set(key, value);
}

function emptyDiagnostics(): MutableDiagnostics {
  return {
    requests: 0,
    jobsStarted: 0,
    jobsCompleted: 0,
    jobsCoalesced: 0,
    staleResultsDropped: 0,
    workerErrors: 0,
    lastWorkerComputeMs: 0,
    lastWorkerError: null,
  };
}
