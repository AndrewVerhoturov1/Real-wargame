import {
  getAwarenessMovementDiagnostics,
  publishAwarenessMovementDiagnostics,
  resetAwarenessMovementDiagnostics,
  type AwarenessMovementDiagnostics,
} from '../core/debug/AwarenessMovementDiagnostics';
import {
  buildPositionIndependentAwarenessKnowledgeSnapshot,
} from '../core/knowledge/AwarenessWorldKey';
import {
  cloneCanonicalWorldThreat,
  type CanonicalWorldThreatSetSnapshot,
  type CanonicalWorldThreatSnapshot,
} from '../core/knowledge/CanonicalWorldThreat';
import type {
  AwarenessWorkerBuildSnapshot,
  AwarenessWorkerFieldPayload,
  AwarenessWorkerResponse,
} from '../core/knowledge/AwarenessWorldWorkerProtocol';
import { buildAwarenessWorkerMapSnapshot } from '../core/knowledge/AwarenessWorkerMapSnapshot';
import { getActiveEnvironmentProfile } from '../core/map/EnvironmentProfileRuntime';
import { getEnvironmentProfileDomainKey } from '../core/map/EnvironmentMaterialProfile';
import type { TacticalMap } from '../core/map/MapModel';
import { getMapRevisionSnapshot } from '../core/map/MapRuntimeState';
import type { SimulationState } from '../core/simulation/SimulationState';
import {
  searchTacticalPositions,
  type TacticalPositionSearchRequest,
  type TacticalPositionSearchResult,
} from '../core/tactical/TacticalPositionSearch';
import type { UnitModel } from '../core/units/UnitModel';

const MAX_PENDING_OWNERS = 12;
const MAX_READY_OWNERS = 12;
const MAX_SEARCH_CACHE_PER_OWNER = 4;

interface PendingWorldBuild {
  readonly rasterKey: string;
  readonly canonicalThreatKey: string;
  readonly mapKey: string;
  readonly unitId: string;
  readonly posture: UnitModel['behaviorRuntime']['posture'];
  readonly compatibilityOrigin: { x: number; y: number };
  readonly threats: readonly CanonicalWorldThreatSnapshot[];
  readonly knowledgeRevision: number;
  readonly orderTarget: null;
  readonly finalExact: false;
}

interface InFlightWorldBuild extends PendingWorldBuild {
  readonly jobId: number;
  readonly requestedAt: number;
}

interface SearchCacheEntry {
  readonly key: string;
  readonly result: TacticalPositionSearchResult;
}

type MutableDiagnostics = {
  -readonly [Key in keyof AwarenessMovementDiagnostics]: AwarenessMovementDiagnostics[Key];
};

export interface PreparedAwarenessWorldSnapshot {
  readonly unitId: string;
  readonly worldKey: string;
  readonly canonicalThreatKey: string;
  readonly mapKey: string;
  readonly fieldIdentity: string;
  readonly rasterDigest: string;
  readonly jobId: number;
  readonly field: AwarenessWorkerFieldPayload;
}

export interface PreparedTacticalPositionSnapshot extends TacticalPositionSearchResult {
  readonly unitId: string;
  readonly worldKey: string;
  readonly fieldIdentity: string;
  readonly searchKey: string;
}

/**
 * Shared application-owned worker runtime for awareness rasters and tactical positions.
 *
 * A single worker owns full-world preparation. Requests are coalesced latest-per-unit,
 * processed fairly through a bounded owner queue, and rejected when their exact map or
 * subjective-threat identity is stale. Local position extraction never asks the worker
 * to rebuild the world when the soldier merely changes cells.
 */
export class AwarenessWorldRuntime {
  private readonly listeners = new Set<() => void>();
  private readonly readyByUnit = new Map<string, PreparedAwarenessWorldSnapshot>();
  private readonly latestWorldKeyByUnit = new Map<string, string>();
  private readonly pendingByUnit = new Map<string, PendingWorldBuild>();
  private readonly pendingOrder: string[] = [];
  private readonly searchCacheByUnit = new Map<string, SearchCacheEntry[]>();
  private readonly diagnostics: MutableDiagnostics = createDiagnostics();
  private worker: Worker | null = null;
  private workerMapKey = '';
  private inFlight: InFlightWorldBuild | null = null;
  private nextJobId = 1;
  private destroyed = false;

  constructor() {
    resetAwarenessMovementDiagnostics();
    this.publishDiagnostics();
  }

  requestWorldField(state: SimulationState, unit: UnitModel): PreparedAwarenessWorldSnapshot | null {
    if (this.destroyed) return null;
    const mapKey = buildAwarenessMapKey(state.map);
    this.ensureWorkerConfigured(state.map, mapKey);
    const canonical = buildPositionIndependentAwarenessKnowledgeSnapshot(unit, state.map.metersPerCell);
    const worldKey = buildAwarenessWorldKey(state, unit, canonical.key);
    this.latestWorldKeyByUnit.set(unit.id, worldKey);
    this.diagnostics.lastRequestedRasterKey = worldKey;
    this.diagnostics.lastRequestedWorldKey = worldKey;
    this.diagnostics.lastRequestedCanonicalThreatKey = canonical.key;

    const ready = this.readyByUnit.get(unit.id);
    if (ready?.worldKey === worldKey && ready.mapKey === mapKey) {
      this.publishDiagnostics();
      return ready;
    }

    if (!(this.inFlight?.unitId === unit.id && this.inFlight.rasterKey === worldKey)) {
      this.enqueue(buildPendingWorldSnapshot(unit, worldKey, mapKey, canonical));
    }
    this.publishDiagnostics();
    return null;
  }

  requestTacticalPositions(
    state: SimulationState,
    unit: UnitModel,
    request: Omit<TacticalPositionSearchRequest, 'origin' | 'currentPosture' | 'orderTarget' | 'threatCount'>,
  ): PreparedTacticalPositionSnapshot | null {
    const prepared = this.requestWorldField(state, unit);
    if (!prepared) return null;
    const originCell = `${Math.floor(unit.position.x)}:${Math.floor(unit.position.y)}`;
    const orderTarget = unit.order?.target ?? null;
    const orderKey = orderTarget
      ? `${quantize(orderTarget.x, 0.25)}:${quantize(orderTarget.y, 0.25)}`
      : 'none';
    const searchKey = [
      prepared.fieldIdentity,
      originCell,
      unit.behaviorRuntime.posture,
      orderKey,
      unit.tacticalKnowledge.threats.length,
      request.searchRadiusMeters,
      request.maxSampledCells,
      request.maxRouteExpansions,
      request.maxCandidates,
      request.minimumSeparationMeters,
    ].join('|');
    const cached = this.searchCacheByUnit.get(unit.id)?.find((entry) => entry.key === searchKey);
    if (cached) {
      return {
        ...cached.result,
        unitId: unit.id,
        worldKey: prepared.worldKey,
        fieldIdentity: prepared.fieldIdentity,
        searchKey,
      };
    }

    const field = prepared.field;
    const result = searchTacticalPositions({
      width: field.width,
      height: field.height,
      metersPerCell: field.metersPerCell,
      passable: field.passable,
      movementCost: field.movementCost,
      danger: field.danger,
      suppression: field.suppression,
      concealment: field.concealment,
      safety: field.safety,
      expectedProtectionAgainstThreat: field.expectedProtectionAgainstThreat,
      uncertainty: field.uncertainty,
      reverseSlopeQuality: field.reverseSlopeQuality,
      forwardSlopeRisk: field.forwardSlopeRisk,
      staticProtectionByPosture: {
        standing: field.staticProtectionStanding,
        crouched: field.staticProtectionCrouched,
        prone: field.staticProtectionProne,
      },
    }, {
      ...request,
      origin: unit.position,
      currentPosture: unit.behaviorRuntime.posture,
      orderTarget,
      threatCount: unit.tacticalKnowledge.threats.length,
    });
    let ownerCache = this.searchCacheByUnit.get(unit.id);
    if (!ownerCache) {
      ownerCache = [];
      this.searchCacheByUnit.set(unit.id, ownerCache);
    }
    ownerCache.unshift({ key: searchKey, result });
    if (ownerCache.length > MAX_SEARCH_CACHE_PER_OWNER) ownerCache.length = MAX_SEARCH_CACHE_PER_OWNER;
    return {
      ...result,
      unitId: unit.id,
      worldKey: prepared.worldKey,
      fieldIdentity: prepared.fieldIdentity,
      searchKey,
    };
  }

  readReadyWorldField(unitId: string): PreparedAwarenessWorldSnapshot | null {
    return this.readyByUnit.get(unitId) ?? null;
  }

  subscribe(listener: () => void): () => void {
    if (this.destroyed) return () => undefined;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  recordMainThreadRasterSwap(durationMs: number): void {
    this.diagnostics.mainThreadRasterSwaps += 1;
    this.diagnostics.lastMainThreadApplyMs = roundMs(durationMs);
    this.diagnostics.maxMainThreadApplyMs = Math.max(
      this.diagnostics.maxMainThreadApplyMs,
      this.diagnostics.lastMainThreadApplyMs,
    );
    this.publishDiagnostics();
  }

  getDiagnostics(): AwarenessMovementDiagnostics {
    return { ...this.diagnostics };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.inFlight) this.diagnostics.workerJobsCancelled += 1;
    this.diagnostics.workerJobsCancelled += this.pendingByUnit.size;
    this.worker?.terminate();
    this.worker = null;
    this.inFlight = null;
    this.pendingByUnit.clear();
    this.pendingOrder.length = 0;
    this.readyByUnit.clear();
    this.latestWorldKeyByUnit.clear();
    this.searchCacheByUnit.clear();
    this.listeners.clear();
    this.diagnostics.workerInFlight = false;
    this.updatePendingDepth();
    this.publishDiagnostics();
  }

  private ensureWorkerConfigured(map: TacticalMap, mapKey: string): void {
    if (this.worker && this.workerMapKey === mapKey) return;
    if (this.inFlight) this.diagnostics.workerJobsCancelled += 1;
    this.diagnostics.workerJobsCancelled += this.pendingByUnit.size;
    this.worker?.terminate();
    this.worker = new Worker(new URL('../workers/AwarenessWorldWorker.ts', import.meta.url), { type: 'module' });
    this.workerMapKey = mapKey;
    this.inFlight = null;
    this.pendingByUnit.clear();
    this.pendingOrder.length = 0;
    this.readyByUnit.clear();
    this.latestWorldKeyByUnit.clear();
    this.searchCacheByUnit.clear();
    this.diagnostics.workerInFlight = false;
    this.updatePendingDepth();

    this.worker.onmessage = (event: MessageEvent<AwarenessWorkerResponse>) => this.handleWorkerResponse(event.data);
    this.worker.onerror = (event): void => {
      if (this.destroyed) return;
      this.diagnostics.lastWorkerError = event.message || 'Unknown awareness worker error.';
      this.finishInFlight();
      this.publishDiagnostics();
    };

    const snapshot = buildAwarenessWorkerMapSnapshot(map, mapKey, getActiveEnvironmentProfile());
    this.worker.postMessage({ type: 'configure', map: snapshot }, [
      snapshot.surfaceMaterialCodes.buffer,
      snapshot.vegetationMaterialCodes.buffer,
      snapshot.heightLevels.buffer,
    ]);
  }

  private enqueue(snapshot: PendingWorldBuild): void {
    const previous = this.pendingByUnit.get(snapshot.unitId);
    if (previous) this.diagnostics.workerJobsCoalesced += 1;
    this.pendingByUnit.set(snapshot.unitId, snapshot);
    if (!this.pendingOrder.includes(snapshot.unitId)) this.pendingOrder.push(snapshot.unitId);
    while (this.pendingOrder.length > MAX_PENDING_OWNERS) {
      const evictedUnitId = this.pendingOrder.shift();
      if (!evictedUnitId) break;
      if (this.pendingByUnit.delete(evictedUnitId)) this.diagnostics.workerJobsCancelled += 1;
    }
    this.updatePendingDepth();
    this.startNext();
  }

  private startNext(): void {
    if (this.destroyed || this.inFlight || !this.worker) return;
    while (this.pendingOrder.length > 0) {
      const unitId = this.pendingOrder.shift()!;
      const snapshot = this.pendingByUnit.get(unitId);
      this.pendingByUnit.delete(unitId);
      if (!snapshot) continue;
      this.startWorldBuild(snapshot);
      return;
    }
    this.updatePendingDepth();
  }

  private startWorldBuild(snapshot: PendingWorldBuild): void {
    if (this.destroyed || !this.worker || snapshot.mapKey !== this.workerMapKey) return;
    const jobId = this.nextJobId;
    this.nextJobId += 1;
    this.inFlight = {
      ...snapshot,
      jobId,
      requestedAt: performance.now(),
    };
    this.diagnostics.workerJobsStarted += 1;
    this.diagnostics.workerInFlight = true;
    const request: AwarenessWorkerBuildSnapshot = { jobId, ...snapshot };
    this.worker.postMessage({ type: 'build', snapshot: request });
    this.updatePendingDepth();
  }

  private handleWorkerResponse(response: AwarenessWorkerResponse): void {
    if (this.destroyed) return;
    const inFlight = this.inFlight;
    if (!inFlight || response.jobId !== inFlight.jobId) {
      this.diagnostics.workerResultsStaleDropped += 1;
      this.publishDiagnostics();
      return;
    }

    const latency = performance.now() - inFlight.requestedAt;
    this.diagnostics.workerJobsCompleted += 1;
    this.diagnostics.lastCompletedJobId = response.jobId;
    this.diagnostics.lastCompletedJobFinalExact = false;
    this.diagnostics.lastWorkerLatencyMs = roundMs(latency);
    this.diagnostics.maxWorkerLatencyMs = Math.max(
      this.diagnostics.maxWorkerLatencyMs,
      this.diagnostics.lastWorkerLatencyMs,
    );
    this.inFlight = null;
    this.diagnostics.workerInFlight = false;

    if (response.type === 'error') {
      this.diagnostics.lastWorkerError = response.message;
    } else {
      this.diagnostics.lastWorkerComputeMs = roundMs(response.computeMs);
      this.diagnostics.maxWorkerComputeMs = Math.max(
        this.diagnostics.maxWorkerComputeMs,
        this.diagnostics.lastWorkerComputeMs,
      );
      this.diagnostics.workerThreatRelativeGeometryBuilds += response.computation.threatRelativeGeometryBuilds;
      this.diagnostics.workerDirectionalFieldBuilds += response.computation.directionalFieldBuilds;
      this.diagnostics.workerDirectionalBasisBuilds += response.computation.directionalBasisBuilds;
      this.diagnostics.workerAwarenessGeometryBuilds += response.computation.awarenessGeometryBuilds;
      this.diagnostics.workerAwarenessRescores += response.computation.awarenessRescores;
      this.diagnostics.directionalBasisBuilds = this.diagnostics.workerDirectionalBasisBuilds;
      const latestWorldKey = this.latestWorldKeyByUnit.get(inFlight.unitId);
      const stale = response.mapKey !== this.workerMapKey
        || response.rasterKey !== latestWorldKey
        || response.canonicalThreatKey !== inFlight.canonicalThreatKey;
      if (stale) {
        this.diagnostics.workerResultsStaleDropped += 1;
      } else {
        const prepared: PreparedAwarenessWorldSnapshot = {
          unitId: inFlight.unitId,
          worldKey: response.rasterKey,
          canonicalThreatKey: response.canonicalThreatKey,
          mapKey: response.mapKey,
          fieldIdentity: response.fieldIdentity,
          rasterDigest: response.rasterDigest,
          jobId: response.jobId,
          field: response.field,
        };
        this.readyByUnit.delete(inFlight.unitId);
        this.readyByUnit.set(inFlight.unitId, prepared);
        trimMap(this.readyByUnit, MAX_READY_OWNERS);
        this.searchCacheByUnit.delete(inFlight.unitId);
        this.diagnostics.lastAppliedRasterKey = response.rasterKey;
        this.diagnostics.lastAppliedWorldKey = response.rasterKey;
        this.diagnostics.lastAppliedCanonicalThreatKey = response.canonicalThreatKey;
        this.diagnostics.lastAppliedFieldIdentity = response.fieldIdentity;
        this.diagnostics.lastAppliedRasterDigest = response.rasterDigest;
        this.diagnostics.lastAppliedJobId = response.jobId;
        this.diagnostics.worldRasterBuilds += 1;
        for (const listener of this.listeners) listener();
      }
    }

    this.updatePendingDepth();
    this.publishDiagnostics();
    this.startNext();
  }

  private finishInFlight(): void {
    this.inFlight = null;
    this.diagnostics.workerInFlight = false;
    this.startNext();
  }

  private updatePendingDepth(): void {
    this.diagnostics.pendingQueueDepth = this.pendingByUnit.size;
    this.diagnostics.maxPendingQueueDepth = Math.max(
      this.diagnostics.maxPendingQueueDepth,
      this.diagnostics.pendingQueueDepth,
    );
  }

  private publishDiagnostics(): void {
    publishAwarenessMovementDiagnostics(this.diagnostics);
  }
}

export function buildAwarenessWorldKey(
  state: SimulationState,
  unit: UnitModel,
  canonicalThreatKey = buildPositionIndependentAwarenessKnowledgeSnapshot(unit, state.map.metersPerCell).key,
): string {
  return [
    buildAwarenessMapKey(state.map),
    `unit:${unit.id}`,
    `posture:${unit.behaviorRuntime.posture}`,
    `canonicalThreats:${canonicalThreatKey}`,
  ].join(';');
}

export function buildAwarenessMapKey(map: TacticalMap): string {
  const revisions = getMapRevisionSnapshot(map);
  const environment = getActiveEnvironmentProfile();
  return [
    `map:${getMapIdentity(map)}`,
    `size:${map.width}x${map.height}`,
    `cellSize:${map.cellSize}`,
    `meters:${map.metersPerCell}`,
    `terrain:${revisions.terrain}`,
    `height:${revisions.height}`,
    `forest:${revisions.forest}`,
    `objects:${revisions.objects}`,
    `visibility:${getEnvironmentProfileDomainKey(environment, 'visibility')}`,
    `fire:${getEnvironmentProfileDomainKey(environment, 'fire')}`,
    `movement:${getEnvironmentProfileDomainKey(environment, 'movement')}`,
  ].join(';');
}

function buildPendingWorldSnapshot(
  unit: UnitModel,
  rasterKey: string,
  mapKey: string,
  canonical: CanonicalWorldThreatSetSnapshot,
): PendingWorldBuild {
  return {
    rasterKey,
    canonicalThreatKey: canonical.key,
    mapKey,
    unitId: unit.id,
    posture: unit.behaviorRuntime.posture,
    compatibilityOrigin: { x: 0.5, y: 0.5 },
    threats: canonical.threats.map(cloneCanonicalWorldThreat),
    knowledgeRevision: unit.tacticalKnowledge.revision,
    orderTarget: null,
    finalExact: false,
  };
}

const mapIdentity = new WeakMap<object, number>();
let nextMapIdentity = 1;

function getMapIdentity(map: object): number {
  const existing = mapIdentity.get(map);
  if (existing !== undefined) return existing;
  const identity = nextMapIdentity;
  nextMapIdentity += 1;
  mapIdentity.set(map, identity);
  return identity;
}

function createDiagnostics(): MutableDiagnostics {
  return {
    worldRasterBuilds: 0,
    directionalBasisBuilds: 0,
    workerThreatRelativeGeometryBuilds: 0,
    workerDirectionalFieldBuilds: 0,
    workerDirectionalBasisBuilds: 0,
    workerAwarenessGeometryBuilds: 0,
    workerAwarenessRescores: 0,
    workerJobsStarted: 0,
    workerJobsCompleted: 0,
    workerJobsCancelled: 0,
    workerJobsCoalesced: 0,
    workerResultsStaleDropped: 0,
    mainThreadRasterSwaps: 0,
    finalRefreshRequests: 0,
    finalRefreshApplied: 0,
    pendingQueueDepth: 0,
    maxPendingQueueDepth: 0,
    workerInFlight: false,
    lastWorkerLatencyMs: 0,
    maxWorkerLatencyMs: 0,
    lastWorkerComputeMs: 0,
    maxWorkerComputeMs: 0,
    lastMainThreadApplyMs: 0,
    maxMainThreadApplyMs: 0,
    lastRequestedRasterKey: '',
    lastAppliedRasterKey: '',
    lastRequestedWorldKey: '',
    lastAppliedWorldKey: '',
    lastRequestedCanonicalThreatKey: '',
    lastAppliedCanonicalThreatKey: '',
    lastCompletedJobId: 0,
    lastAppliedJobId: 0,
    lastCompletedJobFinalExact: false,
    lastFinalRefreshLatencyMs: 0,
    maxFinalRefreshLatencyMs: 0,
    lastAppliedFieldIdentity: '',
    lastAppliedRasterDigest: '',
    lastWorkerError: null,
  };
}

function trimMap<Key, Value>(map: Map<Key, Value>, maximum: number): void {
  while (map.size > maximum) {
    const oldest = map.keys().next().value as Key | undefined;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

function quantize(value: number, quantum: number): number {
  return Math.round(value / quantum) * quantum;
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}
