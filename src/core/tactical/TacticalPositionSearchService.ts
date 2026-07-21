import type { UnitPosture } from '../behavior/BehaviorModel';
import { getWeaponDefinition, getWeaponRuntime } from '../combat/WeaponModel';
import type { GridPosition } from '../geometry';
import type { PreparedAwarenessWorldSnapshot } from '../../runtime/AwarenessWorldRuntime';
import { AwarenessWorldRuntime } from '../../runtime/AwarenessWorldRuntime';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';
import {
  normalizeTacticalPositionKind,
  type TacticalPositionKind,
  type TacticalPositionTargetSpec,
} from '../ai/tactical/TacticalQuery';
import {
  type TacticalPositionCandidateSeedV2,
  type TacticalPositionSearchDiagnostics,
  type TacticalPositionSearchResult,
} from './TacticalPositionSearch';
import {
  normalizeTacticalPositionSearchObjective,
  resolveTacticalPositionReferenceThreat,
  type TacticalPositionSearchObjective,
} from './TacticalPositionObjective';
import {
  createDefaultTacticalPositionSettings,
  getTacticalPositionSettings,
  getTacticalPositionSettingsRevision,
  type TacticalPositionSettings,
} from './TacticalPositionSettings';
import {
  searchGeneralizedTacticalPositions,
  type GeneralizedTacticalPositionSearchLimits,
  type GeneralizedTacticalPositionSearchRequest,
} from './GeneralizedTacticalPositionSearch';
import {
  buildTacticalPositionQueryField,
  type TacticalPositionQuerySubjectiveFieldSnapshot,
  type TacticalPositionQueryWorkerResponse,
} from './TacticalPositionQueryWorkerProtocol';
import {
  buildStaticTacticalPositionWorkerMapSnapshot,
} from './static/StaticTacticalPositionWorkerProtocol';
import {
  createStaticTacticalPositionBasisIdentity,
  staticTacticalPositionIdentityKey,
} from './static/StaticTacticalPositionIdentity';
import {
  getStaticTacticalPositionService,
  type StaticTacticalPositionService,
} from './static/StaticTacticalPositionService';
import { getActiveEnvironmentProfile } from '../map/EnvironmentProfileRuntime';

export type TacticalPositionSearchKind =
  | 'cover'
  | 'defense'
  | 'observation'
  | 'firing'
  | 'fallback'
  | 'machine_gun'
  | 'group';

export type TacticalPositionSearchStatus =
  | 'queued'
  | 'calculating'
  | 'ready'
  | 'stale'
  | 'cancelled'
  | 'failed';

export type TacticalPositionSearchReasonCode =
  | 'field_preparing'
  | 'static_basis_preparing'
  | 'no_candidates'
  | 'unsupported_kind'
  | 'owner_missing'
  | 'input_changed'
  | 'field_identity_changed'
  | 'static_basis_identity_changed'
  | 'reference_threat_missing'
  | 'order_target_missing'
  | 'replaced'
  | 'cancelled'
  | 'destroyed'
  | 'search_failed';

export interface TacticalPositionSearchParameters {
  readonly objective: TacticalPositionSearchObjective;
  readonly queryKey?: string;
  readonly target?: TacticalPositionTargetSpec | null;
  readonly searchRadiusMeters: number;
  readonly maxCandidates: number;
  readonly maxSampledCells: number;
  readonly maxRouteExpansions: number;
  readonly minimumSeparationMeters: number;
  readonly maximumRouteCost?: number;
  readonly preliminaryCandidates?: number;
  readonly exactCandidates?: number;
  readonly exactRayLimit?: number;
  readonly maxPositionDanger?: number;
  readonly minimumLineQuality?: number;
}

export interface TacticalPositionKnownThreatSnapshot {
  readonly id: string;
  readonly position: GridPosition;
  readonly confidence: number;
  readonly uncertaintyCells: number;
  readonly strength: number;
  readonly visibleNow: boolean;
}

export interface TacticalPositionWeaponSnapshot {
  readonly weaponId: string;
  readonly ready: boolean;
  readonly minimumRangeMeters: number;
  readonly effectiveRangeMeters: number;
  readonly maximumRangeMeters: number;
}

export interface TacticalPositionSearchResultSnapshotV1 {
  readonly version: 1;
  readonly requestId: string;
  readonly ownerUnitId: string;
  readonly kind: TacticalPositionSearchKind;
  readonly fieldIdentity: string;
  readonly staticBasisIdentity: string;
  readonly worldKey: string;
  readonly searchIdentity: string;
  readonly candidates: readonly TacticalPositionCandidateSeedV2[];
  readonly diagnostics: TacticalPositionSearchDiagnostics;
  readonly completedAtSimulationStep: number;
}

export interface TacticalPositionSearchRequestSnapshotV1 extends TacticalPositionSearchParameters {
  readonly version: 1;
  readonly requestId: string;
  readonly ownerUnitId: string;
  readonly kind: TacticalPositionSearchKind;
  readonly queryKey: string;
  /** Actual origin used by the bounded search. Updated once when all fields are ready. */
  readonly origin: GridPosition;
  readonly currentPosture: UnitPosture;
  readonly orderTarget: GridPosition | null;
  readonly orderIdentity: string | null;
  readonly referenceThreatId: string | null;
  readonly referenceThreatPosition: GridPosition | null;
  readonly knownThreats: readonly TacticalPositionKnownThreatSnapshot[];
  readonly weapon: TacticalPositionWeaponSnapshot | null;
  readonly threatCount: number;
  readonly tacticalKnowledgeRevision: number;
  readonly settingsRevision: number;
  readonly settings: TacticalPositionSettings;
  readonly createdAtSimulationStep: number;
  readonly updatedAtSimulationStep: number;
  readonly status: TacticalPositionSearchStatus;
  readonly inputIdentity: string;
  readonly requestedWorldKey: string | null;
  readonly fieldIdentity: string | null;
  readonly staticBasisIdentity: string | null;
  readonly reasonCode: TacticalPositionSearchReasonCode | null;
  readonly reason: string | null;
  readonly reasonRu: string | null;
  readonly result: TacticalPositionSearchResultSnapshotV1 | null;
}

export interface TacticalPositionFieldRuntime {
  requestWorldField(state: SimulationState, unit: UnitModel): PreparedAwarenessWorldSnapshot | null;
  readReadyWorldField(unitId: string): PreparedAwarenessWorldSnapshot | null;
  subscribe(listener: () => void): () => void;
  destroy(): void;
}

export interface TacticalPositionSearchServiceOptions {
  readonly schedule?: (callback: () => void) => void;
  /** Test/fallback injection. Browser production uses one long-lived query worker. */
  readonly searchPrepared?: (
    prepared: PreparedAwarenessWorldSnapshot,
    request: TacticalPositionSearchRequestSnapshotV1,
  ) => TacticalPositionSearchResult;
  readonly maxRequests?: number;
  readonly maxOwners?: number;
}

export interface TacticalPositionSearchServiceDiagnostics {
  readonly requestCount: number;
  readonly ownerCount: number;
  readonly queuedCount: number;
  readonly readyCount: number;
  readonly staleCount: number;
  readonly listenerCount: number;
  readonly localSearchCount: number;
  readonly workerJobsStarted: number;
  readonly workerJobsCompleted: number;
  readonly workerResultsStaleDropped: number;
  readonly workerQueueDepth: number;
  readonly synchronousFallbackSearches: number;
  readonly destroyed: boolean;
}

export interface TacticalPositionSearchEnqueueOptions {
  /** Create a new request even when the stable tactical identity is unchanged. */
  readonly forceRefresh?: boolean;
}

interface NormalizedParameters extends TacticalPositionSearchParameters {
  readonly objective: TacticalPositionSearchObjective;
  readonly queryKey: string;
  readonly target: TacticalPositionTargetSpec | null;
  readonly maximumRouteCost: number;
  readonly preliminaryCandidates: number;
  readonly exactCandidates: number;
  readonly exactRayLimit: number;
  readonly maxPositionDanger: number;
  readonly minimumLineQuality: number;
}

interface MutableRequest extends Omit<TacticalPositionSearchRequestSnapshotV1, 'result'> {
  result: TacticalPositionSearchResultSnapshotV1 | null;
}

interface InFlightQuery {
  readonly jobId: number;
  readonly requestId: string;
  readonly ownerKey: string;
  readonly fieldIdentity: string;
  readonly staticBasisIdentity: string;
}

const DEFAULT_PARAMETERS: NormalizedParameters = Object.freeze({
  objective: 'balanced',
  queryKey: 'default',
  target: null,
  searchRadiusMeters: 50,
  maxCandidates: 12,
  maxSampledCells: 2048,
  maxRouteExpansions: 2048,
  minimumSeparationMeters: 4,
  maximumRouteCost: 100000,
  preliminaryCandidates: 36,
  exactCandidates: 12,
  exactRayLimit: 32,
  maxPositionDanger: 78,
  minimumLineQuality: 18,
});
const DEFAULT_MAX_REQUESTS = 48;
const DEFAULT_MAX_OWNERS = 12;
const serviceByState = new WeakMap<SimulationState, TacticalPositionSearchService>();

export class TacticalPositionSearchService {
  private readonly requests = new Map<string, MutableRequest>();
  private readonly latestRequestIdByOwnerKey = new Map<string, string>();
  private readonly latestAnyRequestIdByUnit = new Map<string, string>();
  private readonly pendingByOwner = new Map<string, string[]>();
  private readonly pendingOwnerOrder: string[] = [];
  private readonly listeners = new Set<() => void>();
  private readonly schedule: (callback: () => void) => void;
  private readonly injectedSearch: TacticalPositionSearchServiceOptions['searchPrepared'];
  private readonly maxRequests: number;
  private readonly maxOwners: number;
  private readonly staticService: StaticTacticalPositionService;
  private readonly unsubscribeRuntime: () => void;
  private readonly unsubscribeStatic: () => void;
  private worker: Worker | null = null;
  private workerConfiguredBasisIdentity = '';
  private inFlight: InFlightQuery | null = null;
  private nextRequestSequence = 1;
  private nextWorkerJobId = 1;
  private pumpScheduled = false;
  private pumping = false;
  private destroyed = false;
  private localSearchCount = 0;
  private workerJobsStarted = 0;
  private workerJobsCompleted = 0;
  private workerResultsStaleDropped = 0;
  private synchronousFallbackSearches = 0;

  constructor(
    private readonly state: SimulationState,
    private readonly fieldRuntime: TacticalPositionFieldRuntime = new AwarenessWorldRuntime(),
    options: TacticalPositionSearchServiceOptions = {},
  ) {
    this.schedule = options.schedule ?? ((callback) => queueMicrotask(callback));
    this.injectedSearch = options.searchPrepared;
    this.maxRequests = clampInt(options.maxRequests ?? DEFAULT_MAX_REQUESTS, 4, 256);
    this.maxOwners = clampInt(options.maxOwners ?? DEFAULT_MAX_OWNERS, 1, 64);
    this.staticService = getStaticTacticalPositionService(state);
    this.unsubscribeRuntime = this.fieldRuntime.subscribe(() => this.schedulePump());
    this.unsubscribeStatic = this.staticService.subscribe(() => this.schedulePump());
  }

  enqueueCoverSearch(
    unit: UnitModel,
    overrides: Partial<TacticalPositionSearchParameters> = {},
    options: TacticalPositionSearchEnqueueOptions = {},
  ): TacticalPositionSearchRequestSnapshotV1 {
    return this.enqueue(unit, 'cover', overrides, options);
  }

  enqueueTacticalSearch(
    unit: UnitModel,
    kind: TacticalPositionKind,
    overrides: Partial<TacticalPositionSearchParameters> = {},
    options: TacticalPositionSearchEnqueueOptions = {},
  ): TacticalPositionSearchRequestSnapshotV1 {
    return this.enqueue(unit, kind, overrides, options);
  }

  enqueue(
    unit: UnitModel,
    kind: TacticalPositionSearchKind,
    overrides: Partial<TacticalPositionSearchParameters> = {},
    options: TacticalPositionSearchEnqueueOptions = {},
  ): TacticalPositionSearchRequestSnapshotV1 {
    if (this.destroyed) return failedDestroyedRequest(this.state, unit, kind, overrides);
    if (!this.state.units.includes(unit)) return failedMissingOwnerRequest(this.state, unit.id, kind, overrides);

    const parameters = normalizeParameters(overrides);
    const input = captureInput(this.state, this.staticService, unit, kind, parameters);
    const ownerKey = buildOwnerKey(unit.id, parameters.queryKey);
    const latestId = this.latestRequestIdByOwnerKey.get(ownerKey);
    const latest = latestId ? this.requests.get(latestId) : undefined;
    if (!options.forceRefresh && latest && latest.inputIdentity === input.inputIdentity && isReusableStatus(latest.status)) {
      return cloneRequest(latest);
    }
    if (latest && isActiveOrReady(latest.status)) {
      this.updateRequest(latest, {
        status: 'stale',
        reasonCode: 'replaced',
        reason: 'A newer tactical-position request replaced this owner/key request.',
        reasonRu: 'Этот запрос тактической позиции заменён новым запросом с тем же ключом.',
      }, false);
    }

    this.enforceOwnerBudget(unit.id);
    const requestId = `${unit.id}:tactical-position:${parameters.queryKey}:${this.nextRequestSequence}:${Math.max(0, this.state.simulationStep)}`;
    this.nextRequestSequence += 1;
    const request: MutableRequest = {
      version: 1,
      requestId,
      ownerUnitId: unit.id,
      kind,
      ...parameters,
      target: cloneTarget(input.target),
      origin: { ...input.origin },
      currentPosture: input.currentPosture,
      orderTarget: input.orderTarget ? { ...input.orderTarget } : null,
      orderIdentity: input.orderIdentity,
      referenceThreatId: input.referenceThreatId,
      referenceThreatPosition: input.referenceThreatPosition ? { ...input.referenceThreatPosition } : null,
      knownThreats: input.knownThreats.map(cloneKnownThreat),
      weapon: input.weapon ? { ...input.weapon } : null,
      threatCount: input.knownThreats.length,
      tacticalKnowledgeRevision: input.tacticalKnowledgeRevision,
      settingsRevision: input.settingsRevision,
      settings: { ...input.settings },
      createdAtSimulationStep: this.state.simulationStep,
      updatedAtSimulationStep: this.state.simulationStep,
      status: 'queued',
      inputIdentity: input.inputIdentity,
      requestedWorldKey: null,
      fieldIdentity: null,
      staticBasisIdentity: null,
      reasonCode: null,
      reason: null,
      reasonRu: null,
      result: null,
    };
    this.requests.set(requestId, request);
    this.latestRequestIdByOwnerKey.set(ownerKey, requestId);
    this.latestAnyRequestIdByUnit.set(unit.id, requestId);
    this.enqueuePending(unit.id, requestId);
    this.trimRequests();
    this.publish();
    this.schedulePump();
    return cloneRequest(request);
  }

  readRequest(requestId: string): TacticalPositionSearchRequestSnapshotV1 | null {
    const request = this.requests.get(requestId);
    return request ? cloneRequest(request) : null;
  }

  readLatestForUnit(unitId: string): TacticalPositionSearchRequestSnapshotV1 | null {
    const requestId = this.latestAnyRequestIdByUnit.get(unitId);
    return requestId ? this.readRequest(requestId) : null;
  }

  readLatestForOwnerKey(unitId: string, queryKey: string): TacticalPositionSearchRequestSnapshotV1 | null {
    const requestId = this.latestRequestIdByOwnerKey.get(buildOwnerKey(unitId, queryKey));
    return requestId ? this.readRequest(requestId) : null;
  }

  readReadyResultForUnit(unitId: string): TacticalPositionSearchResultSnapshotV1 | null {
    const latest = this.readLatestForUnit(unitId);
    return latest?.status === 'ready' && latest.result ? cloneResult(latest.result) : null;
  }

  readReadyWorldField(unitId: string): PreparedAwarenessWorldSnapshot | null {
    return this.fieldRuntime.readReadyWorldField(unitId);
  }

  cancel(requestId: string, reasonRu = 'Запрос отменён.'): boolean {
    const request = this.requests.get(requestId);
    if (!request || !isActiveOrReady(request.status)) return false;
    this.updateRequest(request, {
      status: 'cancelled',
      reasonCode: 'cancelled',
      reason: 'Tactical-position request cancelled.',
      reasonRu,
    });
    return true;
  }

  clearUnit(unitId: string): void {
    this.latestAnyRequestIdByUnit.delete(unitId);
    this.pendingByOwner.delete(unitId);
    removeValue(this.pendingOwnerOrder, unitId);
    for (const [ownerKey, requestId] of this.latestRequestIdByOwnerKey) {
      if (!ownerKey.startsWith(`${unitId}|`)) continue;
      this.latestRequestIdByOwnerKey.delete(ownerKey);
      const request = this.requests.get(requestId);
      if (request && isActiveOrReady(request.status)) {
        this.updateRequest(request, {
          status: 'cancelled',
          reasonCode: 'cancelled',
          reason: 'Tactical-position owner was cleared.',
          reasonRu: 'Владелец запроса тактической позиции очищен.',
        }, false);
      }
    }
    for (const [requestId, request] of this.requests) {
      if (request.ownerUnitId === unitId) this.requests.delete(requestId);
    }
    this.publish();
  }

  subscribe(listener: () => void): () => void {
    if (this.destroyed) return () => undefined;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getDiagnostics(): TacticalPositionSearchServiceDiagnostics {
    let queuedCount = 0;
    let readyCount = 0;
    let staleCount = 0;
    for (const request of this.requests.values()) {
      if (request.status === 'queued' || request.status === 'calculating') queuedCount += 1;
      if (request.status === 'ready') readyCount += 1;
      if (request.status === 'stale') staleCount += 1;
    }
    return {
      requestCount: this.requests.size,
      ownerCount: this.pendingByOwner.size + new Set([...this.latestRequestIdByOwnerKey.keys()].map((key) => key.split('|')[0])).size,
      queuedCount,
      readyCount,
      staleCount,
      listenerCount: this.listeners.size,
      localSearchCount: this.localSearchCount,
      workerJobsStarted: this.workerJobsStarted,
      workerJobsCompleted: this.workerJobsCompleted,
      workerResultsStaleDropped: this.workerResultsStaleDropped,
      workerQueueDepth: [...this.pendingByOwner.values()].reduce((sum, queue) => sum + queue.length, 0),
      synchronousFallbackSearches: this.synchronousFallbackSearches,
      destroyed: this.destroyed,
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribeRuntime();
    this.unsubscribeStatic();
    this.worker?.terminate();
    this.worker = null;
    this.inFlight = null;
    for (const request of this.requests.values()) {
      if (!isTerminal(request.status)) {
        this.updateRequest(request, {
          status: 'cancelled',
          reasonCode: 'destroyed',
          reason: 'Simulation tactical-position service was destroyed.',
          reasonRu: 'Сервис тактических позиций симуляции уничтожен.',
        }, false);
      }
    }
    this.requests.clear();
    this.latestRequestIdByOwnerKey.clear();
    this.latestAnyRequestIdByUnit.clear();
    this.pendingByOwner.clear();
    this.pendingOwnerOrder.length = 0;
    this.listeners.clear();
    this.fieldRuntime.destroy();
    if (serviceByState.get(this.state) === this) serviceByState.delete(this.state);
  }

  private schedulePump(): void {
    if (this.destroyed || this.pumpScheduled) return;
    this.pumpScheduled = true;
    this.schedule(() => {
      this.pumpScheduled = false;
      this.pump();
    });
  }

  private pump(): void {
    if (this.destroyed || this.pumping || this.inFlight) return;
    const maximumAttempts = [...this.pendingByOwner.values()].reduce((sum, queue) => sum + queue.length, 0);
    if (maximumAttempts === 0) return;
    this.pumping = true;
    try {
      for (let attempt = 0; attempt < maximumAttempts && !this.inFlight; attempt += 1) {
        const next = this.takeNextPending();
        if (!next) break;
        const result = this.process(next);
        if (result === 'waiting') this.enqueuePending(next.ownerUnitId, next.requestId);
        if (result === 'dispatched') break;
      }
    } finally {
      this.pumping = false;
    }
  }

  private process(request: MutableRequest): 'dispatched' | 'waiting' | 'terminal' {
    const unit = this.state.units.find((candidate) => candidate.id === request.ownerUnitId);
    if (!unit) {
      this.fail(request, 'owner_missing', 'Tactical-position owner no longer exists.', 'Владелец запроса тактической позиции больше не существует.');
      return 'terminal';
    }
    const kind = canonicalKindOrNull(request.kind);
    if (!kind) {
      this.fail(request, 'unsupported_kind', `Tactical-position kind ${request.kind} is not implemented.`, `Тип тактической позиции «${request.kind}» пока не реализован.`);
      return 'terminal';
    }
    if (kind === 'defense' && request.objective !== 'balanced' && request.objective !== 'continue_order' && !request.referenceThreatPosition) {
      this.fail(request, 'reference_threat_missing', 'The selected tactical-position objective requires a known reference threat.', 'Для выбранной цели поиска нужна известная бойцу угроза.');
      return 'terminal';
    }
    if (request.objective === 'continue_order' && !request.orderTarget) {
      this.fail(request, 'order_target_missing', 'Continue-order search requires an active order target.', 'Для продолжения приказа нужна активная точка приказа.');
      return 'terminal';
    }
    if (buildCurrentInputIdentity(this.state, this.staticService, unit, request) !== request.inputIdentity) {
      this.stale(request, 'input_changed', 'The task, legal knowledge, map or settings changed before calculation.', 'Задача, разрешённые знания, карта или настройки изменились до расчёта.');
      return 'terminal';
    }

    const basis = this.staticService.request();
    if (!basis) {
      this.updateRequest(request, {
        status: 'calculating',
        reasonCode: 'static_basis_preparing',
        reason: 'Static tactical-position basis is being prepared.',
        reasonRu: 'Подготавливается постоянная основа тактических позиций.',
      });
      return 'waiting';
    }
    const prepared = this.fieldRuntime.requestWorldField(this.state, unit);
    if (!prepared) {
      this.updateRequest(request, {
        status: 'calculating',
        reasonCode: 'field_preparing',
        reason: 'Subjective tactical field is being prepared.',
        reasonRu: 'Подготавливается субъективное тактическое поле бойца.',
      });
      return 'waiting';
    }

    Object.assign(request, {
      origin: { ...unit.position },
      currentPosture: unit.behaviorRuntime.posture,
      threatCount: unit.tacticalKnowledge.threats.length,
      tacticalKnowledgeRevision: unit.tacticalKnowledge.revision,
      status: 'calculating',
      requestedWorldKey: prepared.worldKey,
      fieldIdentity: prepared.fieldIdentity,
      staticBasisIdentity: basis.identityKey,
      reasonCode: null,
      reason: null,
      reasonRu: null,
      updatedAtSimulationStep: this.state.simulationStep,
    });

    if (this.injectedSearch) {
      this.localSearchCount += 1;
      try {
        const result = this.injectedSearch(prepared, cloneRequest(request));
        this.acceptResult(request, prepared.fieldIdentity, basis.identityKey, result);
      } catch (error) {
        this.fail(request, 'search_failed', error instanceof Error ? error.message : String(error), 'Поиск тактической позиции завершился ошибкой.');
      }
      return 'terminal';
    }

    const generalizedRequest = buildGeneralizedRequest(request, kind);
    if (typeof Worker === 'undefined') {
      this.synchronousFallbackSearches += 1;
      this.localSearchCount += 1;
      try {
        const result = searchGeneralizedTacticalPositions({
          ...preparedFieldView(prepared),
          staticBasis: basis,
          map: this.state.map,
        }, generalizedRequest);
        this.acceptResult(request, prepared.fieldIdentity, basis.identityKey, result);
      } catch (error) {
        this.fail(request, 'search_failed', error instanceof Error ? error.message : String(error), 'Поиск тактической позиции завершился ошибкой.');
      }
      return 'terminal';
    }

    try {
      const worker = this.ensureWorker(basis.identityKey, basis);
      const jobId = this.nextWorkerJobId;
      this.nextWorkerJobId += 1;
      this.inFlight = {
        jobId,
        requestId: request.requestId,
        ownerKey: buildOwnerKey(request.ownerUnitId, request.queryKey),
        fieldIdentity: prepared.fieldIdentity,
        staticBasisIdentity: basis.identityKey,
      };
      this.workerJobsStarted += 1;
      const field = buildTacticalPositionQueryField(prepared.field);
      worker.postMessage({
        type: 'search',
        jobId,
        basisIdentityKey: basis.identityKey,
        fieldIdentity: prepared.fieldIdentity,
        field,
        request: generalizedRequest,
      }, fieldTransferables(field));
      return 'dispatched';
    } catch (error) {
      this.fail(request, 'search_failed', error instanceof Error ? error.message : String(error), 'Не удалось запустить фоновый поиск тактической позиции.');
      return 'terminal';
    }
  }

  private ensureWorker(basisIdentity: string, basis: ReturnType<StaticTacticalPositionService['readReady']>): Worker {
    if (!basis) throw new Error('Static tactical basis is unavailable.');
    if (!this.worker) {
      this.worker = new Worker(new URL('../../workers/TacticalPositionQueryWorker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<TacticalPositionQueryWorkerResponse>): void => this.handleWorkerResponse(event.data);
      this.worker.onerror = (event): void => {
        const inFlight = this.inFlight;
        if (!inFlight) return;
        const request = this.requests.get(inFlight.requestId);
        this.inFlight = null;
        if (request) this.fail(request, 'search_failed', event.message || 'Unknown tactical query worker error.', 'Фоновый поиск тактической позиции завершился ошибкой.');
        this.schedulePump();
      };
    }
    if (this.workerConfiguredBasisIdentity !== basisIdentity) {
      this.worker.postMessage({
        type: 'configure',
        configuration: {
          basisIdentityKey: basisIdentity,
          map: buildStaticTacticalPositionWorkerMapSnapshot(this.state.map),
          environmentProfile: getActiveEnvironmentProfile(),
          basis,
        },
      });
      this.workerConfiguredBasisIdentity = basisIdentity;
    }
    return this.worker;
  }

  private handleWorkerResponse(response: TacticalPositionQueryWorkerResponse): void {
    if (response.type === 'configured') return;
    const inFlight = this.inFlight;
    if (!inFlight || response.jobId !== inFlight.jobId) {
      if (response.type !== 'error' || response.jobId !== null) this.workerResultsStaleDropped += 1;
      this.publish();
      return;
    }
    this.inFlight = null;
    const request = this.requests.get(inFlight.requestId);
    if (!request) {
      this.workerResultsStaleDropped += 1;
      this.schedulePump();
      return;
    }
    if (response.type === 'error') {
      this.fail(request, 'search_failed', response.message, 'Фоновый поиск тактической позиции завершился ошибкой.');
      this.schedulePump();
      return;
    }
    this.workerJobsCompleted += 1;
    if (response.fieldIdentity !== inFlight.fieldIdentity || response.basisIdentityKey !== inFlight.staticBasisIdentity) {
      this.workerResultsStaleDropped += 1;
      this.stale(request, 'field_identity_changed', 'Worker result identities do not match the dispatched query.', 'Идентичность результата фонового поиска не совпала с запросом.');
      this.schedulePump();
      return;
    }
    this.acceptResult(request, response.fieldIdentity, response.basisIdentityKey, response.result);
    this.schedulePump();
  }

  private acceptResult(
    request: MutableRequest,
    fieldIdentity: string,
    staticBasisIdentity: string,
    result: TacticalPositionSearchResult,
  ): void {
    const unit = this.state.units.find((candidate) => candidate.id === request.ownerUnitId);
    const currentField = this.fieldRuntime.readReadyWorldField(request.ownerUnitId);
    const currentBasis = this.staticService.readReady();
    const ownerKey = buildOwnerKey(request.ownerUnitId, request.queryKey);
    if (
      !unit
      || this.latestRequestIdByOwnerKey.get(ownerKey) !== request.requestId
      || !currentField
      || currentField.fieldIdentity !== fieldIdentity
      || !currentBasis
      || currentBasis.identityKey !== staticBasisIdentity
      || buildCurrentInputIdentity(this.state, this.staticService, unit, request) !== request.inputIdentity
    ) {
      this.workerResultsStaleDropped += 1;
      this.stale(request, 'input_changed', 'Tactical request inputs changed before the result could be applied.', 'Входные данные тактического запроса изменились до применения результата.');
      return;
    }
    const snapshot = freezeResult({
      version: 1,
      requestId: request.requestId,
      ownerUnitId: request.ownerUnitId,
      kind: request.kind,
      fieldIdentity,
      staticBasisIdentity,
      worldKey: currentField.worldKey,
      searchIdentity: `${request.inputIdentity}|origin:${quantize(request.origin.x)}:${quantize(request.origin.y)}|posture:${request.currentPosture}|field:${fieldIdentity}|basis:${staticBasisIdentity}`,
      candidates: result.candidates.slice(0, request.maxCandidates).map(cloneCandidate),
      diagnostics: { ...result.diagnostics },
      completedAtSimulationStep: this.state.simulationStep,
    });
    this.updateRequest(request, {
      status: 'ready',
      result: snapshot,
      reasonCode: snapshot.candidates.length === 0 ? 'no_candidates' : null,
      reason: snapshot.candidates.length === 0 ? 'No tactical positions matched the bounded search.' : null,
      reasonRu: snapshot.candidates.length === 0 ? 'Ограниченный поиск не нашёл подходящих тактических позиций.' : null,
    });
  }

  private takeNextPending(): MutableRequest | null {
    while (this.pendingOwnerOrder.length > 0) {
      const ownerId = this.pendingOwnerOrder.shift()!;
      const queue = this.pendingByOwner.get(ownerId);
      if (!queue || queue.length === 0) {
        this.pendingByOwner.delete(ownerId);
        continue;
      }
      const requestId = queue.shift()!;
      if (queue.length > 0) this.pendingOwnerOrder.push(ownerId);
      else this.pendingByOwner.delete(ownerId);
      const request = this.requests.get(requestId);
      if (!request || (request.status !== 'queued' && request.status !== 'calculating')) continue;
      const ownerKey = buildOwnerKey(request.ownerUnitId, request.queryKey);
      if (this.latestRequestIdByOwnerKey.get(ownerKey) !== requestId) continue;
      return request;
    }
    return null;
  }

  private enqueuePending(ownerId: string, requestId: string): void {
    let queue = this.pendingByOwner.get(ownerId);
    if (!queue) {
      queue = [];
      this.pendingByOwner.set(ownerId, queue);
    }
    if (!queue.includes(requestId)) queue.push(requestId);
    if (!this.pendingOwnerOrder.includes(ownerId)) this.pendingOwnerOrder.push(ownerId);
  }

  private updateRequest(request: MutableRequest, patch: Partial<MutableRequest>, publish = true): void {
    Object.assign(request, patch, { updatedAtSimulationStep: this.state.simulationStep });
    if (publish) this.publish();
  }

  private fail(
    request: MutableRequest,
    reasonCode: TacticalPositionSearchReasonCode,
    reason: string,
    reasonRu: string,
  ): void {
    this.updateRequest(request, { status: 'failed', reasonCode, reason, reasonRu, result: null });
  }

  private stale(
    request: MutableRequest,
    reasonCode: TacticalPositionSearchReasonCode,
    reason: string,
    reasonRu: string,
  ): void {
    this.updateRequest(request, { status: 'stale', reasonCode, reason, reasonRu, result: null });
  }

  private publish(): void {
    for (const listener of this.listeners) listener();
  }

  private enforceOwnerBudget(incomingUnitId: string): void {
    const owners = new Set([...this.latestRequestIdByOwnerKey.keys()].map((key) => key.split('|')[0]));
    if (owners.has(incomingUnitId) || owners.size < this.maxOwners) return;
    const oldestOwner = owners.values().next().value as string | undefined;
    if (oldestOwner) this.clearUnit(oldestOwner);
  }

  private trimRequests(): void {
    while (this.requests.size > this.maxRequests) {
      const oldest = this.requests.entries().next().value as [string, MutableRequest] | undefined;
      if (!oldest) return;
      const [requestId, request] = oldest;
      this.requests.delete(requestId);
      const ownerKey = buildOwnerKey(request.ownerUnitId, request.queryKey);
      if (this.latestRequestIdByOwnerKey.get(ownerKey) === requestId) this.latestRequestIdByOwnerKey.delete(ownerKey);
      if (this.latestAnyRequestIdByUnit.get(request.ownerUnitId) === requestId) this.latestAnyRequestIdByUnit.delete(request.ownerUnitId);
    }
  }
}

export function installTacticalPositionSearchService(
  state: SimulationState,
  service: TacticalPositionSearchService,
): void {
  serviceByState.set(state, service);
}

export function getTacticalPositionSearchService(
  state: SimulationState,
): TacticalPositionSearchService | null {
  return serviceByState.get(state) ?? null;
}

export function clearTacticalPositionSearchService(state: SimulationState): void {
  serviceByState.delete(state);
}

function preparedFieldView(prepared: PreparedAwarenessWorldSnapshot) {
  const field = prepared.field;
  return {
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
  };
}

function buildGeneralizedRequest(
  request: TacticalPositionSearchRequestSnapshotV1,
  kind: TacticalPositionKind,
): GeneralizedTacticalPositionSearchRequest {
  const limits: Partial<GeneralizedTacticalPositionSearchLimits> = {
    preliminaryCandidates: request.preliminaryCandidates,
    exactCandidates: request.exactCandidates,
    exactRayLimit: request.exactRayLimit,
    maxPositionDanger: request.maxPositionDanger,
    minimumLineQuality: request.minimumLineQuality,
    maximumRouteCost: request.maximumRouteCost,
  };
  return {
    requestIdentity: request.inputIdentity,
    kind,
    objective: request.objective,
    origin: { ...request.origin },
    currentPosture: request.currentPosture,
    orderTarget: request.orderTarget ? { ...request.orderTarget } : null,
    referenceThreatId: request.referenceThreatId,
    referenceThreatPosition: request.referenceThreatPosition ? { ...request.referenceThreatPosition } : null,
    target: cloneTarget(request.target ?? null),
    searchRadiusMeters: request.searchRadiusMeters,
    maxRouteExpansions: request.maxRouteExpansions,
    maxCandidates: request.maxCandidates,
    minimumSeparationMeters: request.minimumSeparationMeters,
    limits,
  };
}

function captureInput(
  state: SimulationState,
  staticService: StaticTacticalPositionService,
  unit: UnitModel,
  kind: TacticalPositionSearchKind,
  parameters: NormalizedParameters,
) {
  const origin = { ...unit.position };
  const currentPosture = unit.behaviorRuntime.posture;
  const orderTarget = unit.order ? { ...unit.order.target } : unit.playerCommand?.target ? { ...unit.playerCommand.target } : null;
  const orderIdentity = resolveOrderIdentity(unit, orderTarget);
  const referenceThreat = resolveTacticalPositionReferenceThreat(unit);
  const knownThreats = unit.tacticalKnowledge.threats.map((threat): TacticalPositionKnownThreatSnapshot => ({
    id: threat.id,
    position: { x: threat.x, y: threat.y },
    confidence: threat.confidence,
    uncertaintyCells: threat.uncertaintyCells,
    strength: threat.strength,
    visibleNow: threat.visibleNow,
  }));
  const tacticalKnowledgeRevision = unit.tacticalKnowledge.revision;
  const settingsRevision = getTacticalPositionSettingsRevision(unit);
  const settings = { ...getTacticalPositionSettings(unit) };
  const weapon = captureWeapon(unit, kind);
  const target = parameters.target ?? defaultTarget(
    unit,
    kind,
    orderTarget,
    referenceThreat?.position ?? null,
    state.map.metersPerCell,
    weapon,
  );
  const staticIdentity = createStaticTacticalPositionBasisIdentity(state.map, staticService.getSettings());
  const inputIdentity = buildInputIdentity({
    ownerUnitId: unit.id,
    queryKey: parameters.queryKey,
    kind,
    objective: parameters.objective,
    target,
    orderTarget,
    orderIdentity,
    knownThreats,
    tacticalKnowledgeRevision,
    settingsRevision,
    weapon,
    staticBasisIdentity: staticTacticalPositionIdentityKey(staticIdentity),
    parameters,
    simulationMapMetersPerCell: state.map.metersPerCell,
  });
  return {
    origin,
    currentPosture,
    orderTarget,
    orderIdentity,
    referenceThreatId: referenceThreat?.id ?? null,
    referenceThreatPosition: referenceThreat?.position ?? null,
    knownThreats,
    tacticalKnowledgeRevision,
    settingsRevision,
    settings,
    weapon,
    target,
    inputIdentity,
  };
}

function buildCurrentInputIdentity(
  state: SimulationState,
  staticService: StaticTacticalPositionService,
  unit: UnitModel,
  request: TacticalPositionSearchRequestSnapshotV1,
): string {
  const currentOrderTarget = unit.order ? unit.order.target : unit.playerCommand?.target ?? null;
  const knownThreats = unit.tacticalKnowledge.threats.map((threat): TacticalPositionKnownThreatSnapshot => ({
    id: threat.id,
    position: { x: threat.x, y: threat.y },
    confidence: threat.confidence,
    uncertaintyCells: threat.uncertaintyCells,
    strength: threat.strength,
    visibleNow: threat.visibleNow,
  }));
  const staticIdentity = createStaticTacticalPositionBasisIdentity(state.map, staticService.getSettings());
  return buildInputIdentity({
    ownerUnitId: unit.id,
    queryKey: request.queryKey,
    kind: request.kind,
    objective: request.objective,
    target: request.target ?? null,
    orderTarget: currentOrderTarget,
    orderIdentity: resolveOrderIdentity(unit, currentOrderTarget),
    knownThreats,
    tacticalKnowledgeRevision: unit.tacticalKnowledge.revision,
    settingsRevision: getTacticalPositionSettingsRevision(unit),
    weapon: captureWeapon(unit, request.kind),
    staticBasisIdentity: staticTacticalPositionIdentityKey(staticIdentity),
    parameters: normalizeParameters(request),
    simulationMapMetersPerCell: state.map.metersPerCell,
  });
}

function buildInputIdentity(value: {
  ownerUnitId: string;
  queryKey: string;
  kind: TacticalPositionSearchKind;
  objective: TacticalPositionSearchObjective;
  target: TacticalPositionTargetSpec | null;
  orderTarget: GridPosition | null;
  orderIdentity: string | null;
  knownThreats: readonly TacticalPositionKnownThreatSnapshot[];
  tacticalKnowledgeRevision: number;
  settingsRevision: number;
  weapon: TacticalPositionWeaponSnapshot | null;
  staticBasisIdentity: string;
  parameters: TacticalPositionSearchParameters;
  simulationMapMetersPerCell: number;
}): string {
  return [
    `owner:${value.ownerUnitId}`,
    `key:${value.queryKey}`,
    `kind:${normalizeTacticalPositionKind(value.kind === 'cover' ? 'cover' : canonicalKindOrNull(value.kind) ?? 'defense')}`,
    `objective:${value.objective}`,
    `target:${stableSerialize(value.target)}`,
    `order:${value.objective === 'continue_order' && value.orderTarget ? `${quantize(value.orderTarget.x)}:${quantize(value.orderTarget.y)}` : 'ignored'}`,
    `orderIdentity:${value.objective === 'continue_order' ? value.orderIdentity ?? 'none' : 'ignored'}`,
    `knowledge:${value.tacticalKnowledgeRevision}:${stableSerialize(value.knownThreats.map((threat) => ({
      id: threat.id,
      x: quantize(threat.position.x),
      y: quantize(threat.position.y),
      confidence: quantize(threat.confidence),
      uncertainty: quantize(threat.uncertaintyCells),
      strength: quantize(threat.strength),
      visible: threat.visibleNow,
    })))}`,
    `settings:${value.settingsRevision}`,
    `weapon:${stableSerialize(value.weapon)}`,
    `basis:${value.staticBasisIdentity}`,
    `meters:${quantize(value.simulationMapMetersPerCell)}`,
    `radius:${quantize(value.parameters.searchRadiusMeters)}`,
    `candidates:${value.parameters.maxCandidates}`,
    `samples:${value.parameters.maxSampledCells}`,
    `routes:${value.parameters.maxRouteExpansions}`,
    `separation:${quantize(value.parameters.minimumSeparationMeters)}`,
    `routeCost:${quantize(value.parameters.maximumRouteCost ?? DEFAULT_PARAMETERS.maximumRouteCost)}`,
    `preliminary:${value.parameters.preliminaryCandidates ?? DEFAULT_PARAMETERS.preliminaryCandidates}`,
    `exact:${value.parameters.exactCandidates ?? DEFAULT_PARAMETERS.exactCandidates}`,
    `rays:${value.parameters.exactRayLimit ?? DEFAULT_PARAMETERS.exactRayLimit}`,
    `danger:${quantize(value.parameters.maxPositionDanger ?? DEFAULT_PARAMETERS.maxPositionDanger)}`,
    `line:${quantize(value.parameters.minimumLineQuality ?? DEFAULT_PARAMETERS.minimumLineQuality)}`,
  ].join('|');
}

function defaultTarget(
  unit: UnitModel,
  kind: TacticalPositionSearchKind,
  orderTarget: GridPosition | null,
  referenceThreat: GridPosition | null,
  metersPerCell: number,
  weapon: TacticalPositionWeaponSnapshot | null,
): TacticalPositionTargetSpec {
  const canonical = canonicalKindOrNull(kind) ?? 'defense';
  if (canonical === 'observation') {
    const point = orderTarget ?? referenceThreat;
    return point
      ? {
          mode: 'point',
          point: { ...point },
          desiredDistanceMeters: unit.viewRangeCells * Math.max(0.001, metersPerCell),
        }
      : { mode: 'sector', bearingRadians: unit.facingRadians, arcRadians: Math.PI / 2 };
  }
  if (canonical === 'firing') {
    const point = referenceThreat ?? orderTarget;
    return point
      ? {
          mode: referenceThreat ? 'known_target' : 'estimated_position',
          point: { ...point },
          minimumRangeMeters: weapon?.minimumRangeMeters ?? 0,
          effectiveRangeMeters: weapon?.effectiveRangeMeters ?? 500,
          maximumRangeMeters: weapon?.maximumRangeMeters ?? 1200,
        }
      : {
          mode: 'sector',
          bearingRadians: unit.facingRadians,
          arcRadians: Math.PI / 2,
          minimumRangeMeters: weapon?.minimumRangeMeters ?? 0,
          effectiveRangeMeters: weapon?.effectiveRangeMeters ?? 500,
          maximumRangeMeters: weapon?.maximumRangeMeters ?? 1200,
        };
  }
  return referenceThreat
    ? { mode: 'sector', bearingRadians: Math.atan2(referenceThreat.y - unit.position.y, referenceThreat.x - unit.position.x), arcRadians: Math.PI / 3 }
    : { mode: 'known_threats' };
}

function captureWeapon(unit: UnitModel, kind: TacticalPositionSearchKind): TacticalPositionWeaponSnapshot | null {
  if (canonicalKindOrNull(kind) !== 'firing') return null;
  const runtime = getWeaponRuntime(unit);
  const definition = getWeaponDefinition(runtime.weaponId);
  return {
    weaponId: definition.id,
    ready: runtime.ready && runtime.roundsLoaded > 0,
    minimumRangeMeters: 0,
    effectiveRangeMeters: definition.effectiveRangeMetres,
    maximumRangeMeters: definition.maximumRangeMetres,
  };
}

function canonicalKindOrNull(kind: TacticalPositionSearchKind): TacticalPositionKind | null {
  if (kind === 'cover' || kind === 'defense') return 'defense';
  if (kind === 'observation' || kind === 'firing') return kind;
  return null;
}

function normalizeParameters(value: Partial<TacticalPositionSearchParameters>): NormalizedParameters {
  return {
    objective: normalizeTacticalPositionSearchObjective(value.objective),
    queryKey: normalizeQueryKey(value.queryKey),
    target: cloneTarget(value.target ?? null),
    searchRadiusMeters: bounded(value.searchRadiusMeters, DEFAULT_PARAMETERS.searchRadiusMeters, 1, 500),
    maxCandidates: clampInt(value.maxCandidates ?? DEFAULT_PARAMETERS.maxCandidates, 1, 16),
    maxSampledCells: clampInt(value.maxSampledCells ?? DEFAULT_PARAMETERS.maxSampledCells, 1, 4096),
    maxRouteExpansions: clampInt(value.maxRouteExpansions ?? DEFAULT_PARAMETERS.maxRouteExpansions, 1, 8192),
    minimumSeparationMeters: bounded(value.minimumSeparationMeters, DEFAULT_PARAMETERS.minimumSeparationMeters, 0, 100),
    maximumRouteCost: bounded(value.maximumRouteCost, DEFAULT_PARAMETERS.maximumRouteCost, 1, 1000000),
    preliminaryCandidates: clampInt(value.preliminaryCandidates ?? DEFAULT_PARAMETERS.preliminaryCandidates, 8, 128),
    exactCandidates: clampInt(value.exactCandidates ?? DEFAULT_PARAMETERS.exactCandidates, 1, 32),
    exactRayLimit: clampInt(value.exactRayLimit ?? DEFAULT_PARAMETERS.exactRayLimit, 0, 128),
    maxPositionDanger: bounded(value.maxPositionDanger, DEFAULT_PARAMETERS.maxPositionDanger, 0, 100),
    minimumLineQuality: bounded(value.minimumLineQuality, DEFAULT_PARAMETERS.minimumLineQuality, 0, 100),
  };
}

function cloneRequest(request: TacticalPositionSearchRequestSnapshotV1): TacticalPositionSearchRequestSnapshotV1 {
  return Object.freeze({
    ...request,
    origin: Object.freeze({ ...request.origin }),
    orderTarget: request.orderTarget ? Object.freeze({ ...request.orderTarget }) : null,
    referenceThreatPosition: request.referenceThreatPosition ? Object.freeze({ ...request.referenceThreatPosition }) : null,
    knownThreats: Object.freeze(request.knownThreats.map((threat) => Object.freeze(cloneKnownThreat(threat)))),
    weapon: request.weapon ? Object.freeze({ ...request.weapon }) : null,
    target: cloneTarget(request.target ?? null),
    settings: Object.freeze({ ...request.settings }),
    result: request.result ? cloneResult(request.result) : null,
  });
}

function cloneResult(result: TacticalPositionSearchResultSnapshotV1): TacticalPositionSearchResultSnapshotV1 {
  return freezeResult({
    ...result,
    candidates: result.candidates.map(cloneCandidate),
    diagnostics: { ...result.diagnostics },
  });
}

function freezeResult(result: TacticalPositionSearchResultSnapshotV1): TacticalPositionSearchResultSnapshotV1 {
  return Object.freeze({
    ...result,
    candidates: Object.freeze(result.candidates.map((candidate) => Object.freeze(cloneCandidate(candidate)))),
    diagnostics: Object.freeze({ ...result.diagnostics }),
  });
}

function cloneCandidate(candidate: TacticalPositionCandidateSeedV2): TacticalPositionCandidateSeedV2 {
  return {
    ...candidate,
    position: { ...candidate.position },
    source: { ...candidate.source },
    metrics: { ...candidate.metrics },
  };
}

function cloneKnownThreat(threat: TacticalPositionKnownThreatSnapshot): TacticalPositionKnownThreatSnapshot {
  return { ...threat, position: { ...threat.position } };
}

function cloneTarget(target: TacticalPositionTargetSpec | null): TacticalPositionTargetSpec | null {
  if (!target) return null;
  return 'point' in target && target.point
    ? Object.freeze({ ...target, point: Object.freeze({ ...target.point }) })
    : Object.freeze({ ...target });
}

function failedDestroyedRequest(
  state: SimulationState,
  unit: UnitModel,
  kind: TacticalPositionSearchKind,
  overrides: Partial<TacticalPositionSearchParameters>,
): TacticalPositionSearchRequestSnapshotV1 {
  return failedRequest(state, unit.id, kind, overrides, 'destroyed', 'Service destroyed.', 'Сервис уничтожен.');
}

function failedMissingOwnerRequest(
  state: SimulationState,
  unitId: string,
  kind: TacticalPositionSearchKind,
  overrides: Partial<TacticalPositionSearchParameters>,
): TacticalPositionSearchRequestSnapshotV1 {
  return failedRequest(state, unitId, kind, overrides, 'owner_missing', 'Owner missing.', 'Владелец не найден.');
}

function failedRequest(
  state: SimulationState,
  unitId: string,
  kind: TacticalPositionSearchKind,
  overrides: Partial<TacticalPositionSearchParameters>,
  reasonCode: TacticalPositionSearchReasonCode,
  reason: string,
  reasonRu: string,
): TacticalPositionSearchRequestSnapshotV1 {
  const parameters = normalizeParameters(overrides);
  return Object.freeze({
    version: 1,
    requestId: `${unitId}:tactical-position:failed:${Math.max(0, state.simulationStep)}`,
    ownerUnitId: unitId,
    kind,
    ...parameters,
    origin: Object.freeze({ x: 0, y: 0 }),
    currentPosture: 'standing',
    orderTarget: null,
    orderIdentity: null,
    referenceThreatId: null,
    referenceThreatPosition: null,
    knownThreats: Object.freeze([]),
    weapon: null,
    threatCount: 0,
    tacticalKnowledgeRevision: 0,
    settingsRevision: 0,
    settings: Object.freeze({ ...createDefaultTacticalPositionSettings() }),
    createdAtSimulationStep: state.simulationStep,
    updatedAtSimulationStep: state.simulationStep,
    status: 'failed',
    inputIdentity: 'failed',
    requestedWorldKey: null,
    fieldIdentity: null,
    staticBasisIdentity: null,
    reasonCode,
    reason,
    reasonRu,
    result: null,
  });
}

function fieldTransferables(field: TacticalPositionQuerySubjectiveFieldSnapshot): Transferable[] {
  return [
    field.passable.buffer,
    field.movementCost.buffer,
    field.danger.buffer,
    field.suppression.buffer,
    field.concealment.buffer,
    field.safety.buffer,
    field.expectedProtectionAgainstThreat.buffer,
    field.uncertainty.buffer,
    field.reverseSlopeQuality.buffer,
    field.forwardSlopeRisk.buffer,
    field.staticProtectionStanding.buffer,
    field.staticProtectionCrouched.buffer,
    field.staticProtectionProne.buffer,
  ];
}

function resolveOrderIdentity(unit: UnitModel, target: GridPosition | null): string | null {
  if (unit.playerCommand?.id) return unit.playerCommand.id;
  if (!target) return null;
  return `${unit.order?.source ?? 'order'}:${quantize(target.x)}:${quantize(target.y)}`;
}

function buildOwnerKey(unitId: string, queryKey: string): string {
  return `${unitId}|${queryKey}`;
}

function normalizeQueryKey(value: unknown): string {
  if (typeof value !== 'string') return 'default';
  const cleaned = value.trim().replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 80);
  return cleaned || 'default';
}

function isReusableStatus(status: TacticalPositionSearchStatus): boolean {
  return status === 'queued' || status === 'calculating' || status === 'ready';
}

function isActiveOrReady(status: TacticalPositionSearchStatus): boolean {
  return status === 'queued' || status === 'calculating' || status === 'ready';
}

function isTerminal(status: TacticalPositionSearchStatus): boolean {
  return status === 'ready' || status === 'stale' || status === 'cancelled' || status === 'failed';
}

function removeValue(values: string[], value: string): void {
  let index = values.indexOf(value);
  while (index >= 0) {
    values.splice(index, 1);
    index = values.indexOf(value);
  }
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableSerialize(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function clampInt(value: number, minimum: number, maximum: number): number {
  const normalized = Number.isFinite(value) ? Math.floor(value) : minimum;
  return Math.max(minimum, Math.min(maximum, normalized));
}

function bounded(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(minimum, Math.min(maximum, numeric));
}

function quantize(value: number): string {
  return (Math.round(value * 1000) / 1000).toString();
}
