import { getActiveEnvironmentProfile } from '../../map/EnvironmentProfileRuntime';
import type { SimulationState } from '../../simulation/SimulationState';
import { buildStaticTacticalPositionBasis } from './StaticTacticalPositionBuilder';
import type { StaticTacticalPositionBasisSnapshot } from './StaticTacticalPositionBasis';
import {
  createStaticTacticalPositionBasisIdentity,
  sameStaticTacticalPositionIdentity,
  staticTacticalPositionIdentityKey,
  type StaticTacticalPositionBasisIdentity,
} from './StaticTacticalPositionIdentity';
import {
  createDefaultStaticTacticalPositionSettings,
  normalizeStaticTacticalPositionSettings,
  type StaticTacticalPositionSettings,
  type StaticTacticalPositionSettingsInput,
} from './StaticTacticalPositionSettings';
import {
  buildStaticTacticalPositionWorkerMapSnapshot,
  type StaticTacticalPositionWorkerResponse,
} from './StaticTacticalPositionWorkerProtocol';

export type StaticTacticalPositionServiceStatus =
  | 'idle'
  | 'queued'
  | 'calculating'
  | 'ready'
  | 'stale'
  | 'failed'
  | 'destroyed';

export interface StaticTacticalPositionServiceDiagnostics {
  readonly status: StaticTacticalPositionServiceStatus;
  readonly requestedIdentityKey: string;
  readonly readyIdentityKey: string;
  readonly workerAvailable: boolean;
  readonly workerJobsStarted: number;
  readonly workerJobsCompleted: number;
  readonly workerResultsStaleDropped: number;
  readonly synchronousFallbackBuilds: number;
  readonly rebuildRequests: number;
  readonly cacheHits: number;
  readonly settingsRevision: number;
  readonly lastBuildMs: number;
  readonly lastError: string;
  readonly buildDiagnostics: StaticTacticalPositionBasisSnapshot['diagnostics'] | null;
}

interface PendingBuild {
  readonly identity: StaticTacticalPositionBasisIdentity;
  readonly settings: StaticTacticalPositionSettings;
}

interface InFlightBuild extends PendingBuild {
  readonly jobId: number;
}

const serviceByState = new WeakMap<SimulationState, StaticTacticalPositionService>();

export class StaticTacticalPositionService {
  private readonly listeners = new Set<() => void>();
  private settings: StaticTacticalPositionSettings = createDefaultStaticTacticalPositionSettings();
  private settingsRevision = 1;
  private status: StaticTacticalPositionServiceStatus = 'idle';
  private ready: StaticTacticalPositionBasisSnapshot | null = null;
  private requestedIdentity: StaticTacticalPositionBasisIdentity | null = null;
  private pending: PendingBuild | null = null;
  private inFlight: InFlightBuild | null = null;
  private worker: Worker | null = null;
  private nextJobId = 1;
  private destroyed = false;
  private workerJobsStarted = 0;
  private workerJobsCompleted = 0;
  private workerResultsStaleDropped = 0;
  private synchronousFallbackBuilds = 0;
  private rebuildRequests = 0;
  private cacheHits = 0;
  private lastError = '';

  constructor(private readonly state: SimulationState) {}

  request(): StaticTacticalPositionBasisSnapshot | null {
    if (this.destroyed) return null;
    const identity = createStaticTacticalPositionBasisIdentity(this.state.map, this.settings);
    this.requestedIdentity = identity;
    if (this.ready && sameStaticTacticalPositionIdentity(this.ready.identity, identity)) {
      this.cacheHits += 1;
      this.status = 'ready';
      return this.ready;
    }
    if (this.inFlight && sameStaticTacticalPositionIdentity(this.inFlight.identity, identity)) {
      return null;
    }
    if (this.pending && sameStaticTacticalPositionIdentity(this.pending.identity, identity)) return null;
    this.rebuildRequests += 1;
    this.pending = { identity, settings: this.settings };
    this.status = this.inFlight ? 'queued' : 'calculating';
    this.publish();
    this.startNext();
    return null;
  }

  readReady(): StaticTacticalPositionBasisSnapshot | null {
    if (!this.ready || !this.requestedIdentity) return null;
    return sameStaticTacticalPositionIdentity(this.ready.identity, this.requestedIdentity) ? this.ready : null;
  }

  readAnyReady(): StaticTacticalPositionBasisSnapshot | null {
    return this.ready;
  }

  setSettings(input: StaticTacticalPositionSettingsInput): StaticTacticalPositionSettings {
    const next = normalizeStaticTacticalPositionSettings(input);
    const nextIdentity = createStaticTacticalPositionBasisIdentity(this.state.map, next);
    const currentIdentity = createStaticTacticalPositionBasisIdentity(this.state.map, this.settings);
    if (sameStaticTacticalPositionIdentity(currentIdentity, nextIdentity)) return this.settings;
    this.settings = next;
    this.settingsRevision += 1;
    this.requestedIdentity = nextIdentity;
    this.pending = { identity: nextIdentity, settings: next };
    this.status = this.inFlight ? 'queued' : 'calculating';
    this.publish();
    this.startNext();
    return this.settings;
  }

  getSettings(): StaticTacticalPositionSettings {
    return this.settings;
  }

  subscribe(listener: () => void): () => void {
    if (this.destroyed) return () => undefined;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getDiagnostics(): StaticTacticalPositionServiceDiagnostics {
    return {
      status: this.status,
      requestedIdentityKey: this.requestedIdentity ? staticTacticalPositionIdentityKey(this.requestedIdentity) : '',
      readyIdentityKey: this.ready?.identityKey ?? '',
      workerAvailable: typeof Worker !== 'undefined',
      workerJobsStarted: this.workerJobsStarted,
      workerJobsCompleted: this.workerJobsCompleted,
      workerResultsStaleDropped: this.workerResultsStaleDropped,
      synchronousFallbackBuilds: this.synchronousFallbackBuilds,
      rebuildRequests: this.rebuildRequests,
      cacheHits: this.cacheHits,
      settingsRevision: this.settingsRevision,
      lastBuildMs: this.ready?.diagnostics.buildMs ?? 0,
      lastError: this.lastError,
      buildDiagnostics: this.ready?.diagnostics ?? null,
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.worker?.terminate();
    this.worker = null;
    this.pending = null;
    this.inFlight = null;
    this.ready = null;
    this.status = 'destroyed';
    this.listeners.clear();
    if (serviceByState.get(this.state) === this) serviceByState.delete(this.state);
  }

  private startNext(): void {
    if (this.destroyed || this.inFlight || !this.pending) return;
    const pending = this.pending;
    this.pending = null;
    const jobId = this.nextJobId;
    this.nextJobId += 1;
    this.inFlight = { ...pending, jobId };
    this.status = 'calculating';
    this.workerJobsStarted += 1;
    this.publish();

    if (typeof Worker === 'undefined') {
      this.synchronousFallbackBuilds += 1;
      scheduleFallback(() => this.runFallback(jobId, pending));
      return;
    }

    try {
      const worker = this.ensureWorker();
      worker.postMessage({
        type: 'build',
        jobId,
        identity: pending.identity,
        settings: pending.settings,
        map: buildStaticTacticalPositionWorkerMapSnapshot(this.state.map),
        environmentProfile: getActiveEnvironmentProfile(),
      });
    } catch (error) {
      this.finishWithError(jobId, error instanceof Error ? error.message : String(error));
    }
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('../../../workers/StaticTacticalPositionWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<StaticTacticalPositionWorkerResponse>): void => {
      this.handleWorkerResponse(event.data);
    };
    worker.onerror = (event): void => {
      const jobId = this.inFlight?.jobId;
      if (jobId === undefined) return;
      this.finishWithError(jobId, event.message || 'Unknown static tactical position worker error.');
    };
    this.worker = worker;
    return worker;
  }

  private runFallback(jobId: number, pending: PendingBuild): void {
    if (this.destroyed || this.inFlight?.jobId !== jobId) return;
    try {
      const result = buildStaticTacticalPositionBasis(this.state.map, pending.identity, pending.settings);
      this.acceptResult(jobId, pending.identity, result.snapshot);
    } catch (error) {
      this.finishWithError(jobId, error instanceof Error ? error.message : String(error));
    }
  }

  private handleWorkerResponse(response: StaticTacticalPositionWorkerResponse): void {
    if (response.type === 'error') {
      this.finishWithError(response.jobId, response.message);
      return;
    }
    this.acceptResult(response.jobId, response.identity, response.snapshot);
  }

  private acceptResult(
    jobId: number,
    identity: StaticTacticalPositionBasisIdentity,
    snapshot: StaticTacticalPositionBasisSnapshot,
  ): void {
    const inFlight = this.inFlight;
    if (!inFlight || inFlight.jobId !== jobId) {
      this.workerResultsStaleDropped += 1;
      this.publish();
      return;
    }
    this.inFlight = null;
    this.workerJobsCompleted += 1;
    const currentIdentity = createStaticTacticalPositionBasisIdentity(this.state.map, this.settings);
    if (
      !sameStaticTacticalPositionIdentity(identity, inFlight.identity)
      || !sameStaticTacticalPositionIdentity(identity, currentIdentity)
      || !sameStaticTacticalPositionIdentity(identity, this.requestedIdentity)
    ) {
      this.workerResultsStaleDropped += 1;
      this.status = this.pending ? 'queued' : 'stale';
      this.publish();
      this.startNext();
      return;
    }
    this.ready = snapshot;
    this.lastError = '';
    this.status = 'ready';
    this.publish();
    this.startNext();
  }

  private finishWithError(jobId: number, message: string): void {
    if (this.inFlight?.jobId !== jobId) return;
    this.inFlight = null;
    this.lastError = message;
    this.status = this.pending ? 'queued' : 'failed';
    this.publish();
    this.startNext();
  }

  private publish(): void {
    for (const listener of this.listeners) listener();
  }
}

export function getStaticTacticalPositionService(state: SimulationState): StaticTacticalPositionService {
  let service = serviceByState.get(state);
  if (!service) {
    service = new StaticTacticalPositionService(state);
    serviceByState.set(state, service);
  }
  return service;
}

export function requestStaticTacticalPositionBasis(
  state: SimulationState,
): StaticTacticalPositionBasisSnapshot | null {
  return getStaticTacticalPositionService(state).request();
}

export function readReadyStaticTacticalPositionBasis(
  state: SimulationState,
): StaticTacticalPositionBasisSnapshot | null {
  return getStaticTacticalPositionService(state).readReady();
}

export function clearStaticTacticalPositionService(state: SimulationState): void {
  serviceByState.get(state)?.destroy();
  serviceByState.delete(state);
}

function scheduleFallback(callback: () => void): void {
  if (typeof setTimeout === 'function') setTimeout(callback, 0);
  else queueMicrotask(callback);
}
