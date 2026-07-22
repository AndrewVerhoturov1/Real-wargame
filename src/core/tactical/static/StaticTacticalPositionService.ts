import { getActiveEnvironmentProfile } from '../../map/EnvironmentProfileRuntime';
import type { SimulationState } from '../../simulation/SimulationState';
import { buildHighQualityStaticTacticalPositionBasis } from './HighQualityStaticTacticalPositionBuilder';
import {
  decodeStaticTacticalPositionArtifact,
  encodeStaticTacticalPositionArtifact,
  inspectStaticTacticalPositionArtifactSettings,
  type StaticTacticalPositionArtifact,
  type StaticTacticalPositionArtifactDecodeResult,
  type StaticTacticalPositionArtifactRejectReason,
} from './StaticTacticalPositionArtifact';
import type { StaticTacticalPositionBasisSnapshot } from './StaticTacticalPositionBasis';
import {
  createStaticTacticalPositionFingerprint,
  type StaticTacticalPositionFingerprint,
} from './StaticTacticalPositionFingerprint';
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

export type StaticTacticalPositionExportOmissionReason = 'not_ready' | 'stale' | 'fingerprint_missing' | 'encode_failed';

export interface StaticTacticalPositionServiceDiagnostics {
  readonly status: StaticTacticalPositionServiceStatus;
  readonly requestedIdentityKey: string;
  readonly readyIdentityKey: string;
  readonly readyPersistentFingerprint: string;
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
  readonly persistentCacheHits: number;
  readonly persistentCacheMisses: number;
  readonly persistentCacheRejected: number;
  readonly persistentLastRejectReason: StaticTacticalPositionArtifactRejectReason | null;
  readonly persistentLastRejectMessage: string;
  readonly persistentDecodedBytes: number;
  readonly persistentDecodeMs: number;
  readonly workerBuildsAfterPersistentMiss: number;
  readonly exportedSnapshots: number;
  readonly exportOmissions: number;
  readonly lastExportOmissionReason: StaticTacticalPositionExportOmissionReason | null;
}

interface PendingBuild {
  readonly identity: StaticTacticalPositionBasisIdentity;
  readonly settings: StaticTacticalPositionSettings;
}

interface InFlightBuild extends PendingBuild {
  readonly jobId: number;
  readonly fingerprint: StaticTacticalPositionFingerprint;
}

export interface ReadyPersistentStaticTacticalPositionBasis {
  readonly snapshot: StaticTacticalPositionBasisSnapshot;
  readonly fingerprint: StaticTacticalPositionFingerprint;
}

const serviceByState = new WeakMap<SimulationState, StaticTacticalPositionService>();

export class StaticTacticalPositionService {
  private readonly listeners = new Set<() => void>();
  private settings: StaticTacticalPositionSettings = createDefaultStaticTacticalPositionSettings();
  private settingsRevision = 1;
  private status: StaticTacticalPositionServiceStatus = 'idle';
  private ready: StaticTacticalPositionBasisSnapshot | null = null;
  private readyFingerprint: StaticTacticalPositionFingerprint | null = null;
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
  private persistentCacheHits = 0;
  private persistentCacheMisses = 0;
  private persistentCacheRejected = 0;
  private persistentLastRejectReason: StaticTacticalPositionArtifactRejectReason | null = null;
  private persistentLastRejectMessage = '';
  private persistentDecodedBytes = 0;
  private persistentDecodeMs = 0;
  private workerBuildsAfterPersistentMiss = 0;
  private buildAfterPersistentMissPending = false;
  private exportedSnapshots = 0;
  private exportOmissions = 0;
  private lastExportOmissionReason: StaticTacticalPositionExportOmissionReason | null = null;

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
    if (this.inFlight && sameStaticTacticalPositionIdentity(this.inFlight.identity, identity)) return null;
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

  readReadyPersistent(): ReadyPersistentStaticTacticalPositionBasis | null {
    if (!this.ready || !this.readyFingerprint) return null;
    const currentIdentity = createStaticTacticalPositionBasisIdentity(this.state.map, this.settings);
    if (!sameStaticTacticalPositionIdentity(this.ready.identity, currentIdentity)) return null;
    return { snapshot: this.ready, fingerprint: this.readyFingerprint };
  }

  hydratePersistentArtifact(value: unknown): StaticTacticalPositionArtifactDecodeResult {
    if (this.destroyed) {
      return { ok: false, reason: 'malformed', message: 'Static tactical service is destroyed.', decodedBytes: 0, decodeMs: 0 };
    }
    const inspected = inspectStaticTacticalPositionArtifactSettings(value);
    if (!inspected.ok) {
      const decoded: StaticTacticalPositionArtifactDecodeResult = {
        ok: false,
        reason: inspected.reason,
        message: inspected.message,
        decodedBytes: 0,
        decodeMs: 0,
      };
      this.recordPersistentMiss(decoded);
      return decoded;
    }
    const artifactSettings = inspected.settings;
    const identity = createStaticTacticalPositionBasisIdentity(this.state.map, artifactSettings);
    const fingerprint = createStaticTacticalPositionFingerprint(this.state.map, artifactSettings, getActiveEnvironmentProfile());
    const decoded = decodeStaticTacticalPositionArtifact(value, fingerprint, identity);
    this.persistentDecodedBytes = decoded.decodedBytes;
    this.persistentDecodeMs = decoded.decodeMs;
    if (!decoded.ok) {
      if (decoded.reason === 'fingerprint') this.adoptPersistentSettings(artifactSettings);
      this.recordPersistentMiss(decoded);
      return decoded;
    }
    this.adoptPersistentSettings(artifactSettings);
    if (this.inFlight) {
      this.worker?.terminate();
      this.worker = null;
      this.inFlight = null;
    }
    this.ready = decoded.snapshot;
    this.readyFingerprint = decoded.fingerprint;
    this.requestedIdentity = identity;
    this.pending = null;
    this.status = 'ready';
    this.lastError = '';
    this.persistentCacheHits += 1;
    this.persistentLastRejectReason = null;
    this.persistentLastRejectMessage = '';
    this.buildAfterPersistentMissPending = false;
    this.publish();
    return decoded;
  }

  private adoptPersistentSettings(settings: StaticTacticalPositionSettings): void {
    const previousIdentity = createStaticTacticalPositionBasisIdentity(this.state.map, this.settings);
    const nextIdentity = createStaticTacticalPositionBasisIdentity(this.state.map, settings);
    if (sameStaticTacticalPositionIdentity(previousIdentity, nextIdentity)) return;
    this.settings = settings;
    this.settingsRevision += 1;
  }

  private recordPersistentMiss(decoded: Extract<StaticTacticalPositionArtifactDecodeResult, { readonly ok: false }>): void {
    this.persistentDecodedBytes = decoded.decodedBytes;
    this.persistentDecodeMs = decoded.decodeMs;
    this.persistentCacheMisses += 1;
    this.buildAfterPersistentMissPending = true;
    this.persistentLastRejectReason = decoded.reason;
    this.persistentLastRejectMessage = decoded.message;
    if (decoded.reason !== 'missing') this.persistentCacheRejected += 1;
    this.publish();
  }

  buildPersistentArtifactForExport(): StaticTacticalPositionArtifact | null {
    const ready = this.readReadyPersistent();
    if (!ready) {
      const reason = !this.ready ? 'not_ready' : this.readyFingerprint ? 'stale' : 'fingerprint_missing';
      this.recordExportOmission(reason);
      return null;
    }
    try {
      const artifact = encodeStaticTacticalPositionArtifact(ready.snapshot, ready.fingerprint);
      this.exportedSnapshots += 1;
      this.lastExportOmissionReason = null;
      return artifact;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.recordExportOmission('encode_failed');
      return null;
    }
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
      readyPersistentFingerprint: this.readyFingerprint?.value ?? '',
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
      persistentCacheHits: this.persistentCacheHits,
      persistentCacheMisses: this.persistentCacheMisses,
      persistentCacheRejected: this.persistentCacheRejected,
      persistentLastRejectReason: this.persistentLastRejectReason,
      persistentLastRejectMessage: this.persistentLastRejectMessage,
      persistentDecodedBytes: this.persistentDecodedBytes,
      persistentDecodeMs: this.persistentDecodeMs,
      workerBuildsAfterPersistentMiss: this.workerBuildsAfterPersistentMiss,
      exportedSnapshots: this.exportedSnapshots,
      exportOmissions: this.exportOmissions,
      lastExportOmissionReason: this.lastExportOmissionReason,
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
    this.readyFingerprint = null;
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
    let fingerprint: StaticTacticalPositionFingerprint;
    try {
      fingerprint = createStaticTacticalPositionFingerprint(this.state.map, pending.settings, getActiveEnvironmentProfile());
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.status = 'failed';
      this.publish();
      return;
    }
    this.inFlight = { ...pending, jobId, fingerprint };
    this.status = 'calculating';
    this.workerJobsStarted += 1;
    if (this.buildAfterPersistentMissPending) {
      this.workerBuildsAfterPersistentMiss += 1;
      this.buildAfterPersistentMissPending = false;
    }
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
      const result = buildHighQualityStaticTacticalPositionBasis(this.state.map, pending.identity, pending.settings);
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

  private acceptResult(jobId: number, identity: StaticTacticalPositionBasisIdentity, snapshot: StaticTacticalPositionBasisSnapshot): void {
    const inFlight = this.inFlight;
    if (!inFlight || inFlight.jobId !== jobId) {
      this.workerResultsStaleDropped += 1;
      this.publish();
      return;
    }
    this.inFlight = null;
    this.workerJobsCompleted += 1;
    const currentIdentity = createStaticTacticalPositionBasisIdentity(this.state.map, this.settings);
    if (!sameStaticTacticalPositionIdentity(identity, inFlight.identity)
      || !sameStaticTacticalPositionIdentity(identity, currentIdentity)
      || !sameStaticTacticalPositionIdentity(identity, this.requestedIdentity)) {
      this.workerResultsStaleDropped += 1;
      this.status = this.pending ? 'queued' : 'stale';
      this.publish();
      this.startNext();
      return;
    }
    this.ready = snapshot;
    this.readyFingerprint = inFlight.fingerprint;
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

  private recordExportOmission(reason: StaticTacticalPositionExportOmissionReason): void {
    this.exportOmissions += 1;
    this.lastExportOmissionReason = reason;
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

export function requestStaticTacticalPositionBasis(state: SimulationState): StaticTacticalPositionBasisSnapshot | null {
  return getStaticTacticalPositionService(state).request();
}

export function readReadyStaticTacticalPositionBasis(state: SimulationState): StaticTacticalPositionBasisSnapshot | null {
  return getStaticTacticalPositionService(state).readReady();
}

export function hydrateStaticTacticalPositionArtifact(state: SimulationState, value: unknown): StaticTacticalPositionArtifactDecodeResult {
  return getStaticTacticalPositionService(state).hydratePersistentArtifact(value);
}

export function buildStaticTacticalPositionArtifactForExport(state: SimulationState): StaticTacticalPositionArtifact | null {
  return getStaticTacticalPositionService(state).buildPersistentArtifactForExport();
}

export function clearStaticTacticalPositionService(state: SimulationState): void {
  serviceByState.get(state)?.destroy();
  serviceByState.delete(state);
}

function scheduleFallback(callback: () => void): void {
  if (typeof setTimeout === 'function') setTimeout(callback, 0);
  else queueMicrotask(callback);
}
