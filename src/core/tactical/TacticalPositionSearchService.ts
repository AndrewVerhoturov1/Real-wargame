import type { UnitPosture } from '../behavior/BehaviorModel';
import type { GridPosition } from '../geometry';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';
import type { PreparedAwarenessWorldSnapshot } from '../../runtime/AwarenessWorldRuntime';
import { AwarenessWorldRuntime } from '../../runtime/AwarenessWorldRuntime';
import {
  type TacticalPositionCandidateSeedV2,
  type TacticalPositionSearchDiagnostics,
  type TacticalPositionSearchResult,
} from './TacticalPositionSearch';
import {
  normalizeTacticalPositionSearchObjective,
  resolveTacticalPositionReferenceThreat,
  searchTacticalPositionsForObjective,
  type TacticalPositionSearchObjective,
} from './TacticalPositionObjective';
import {
  createDefaultTacticalPositionSettings,
  getTacticalPositionSettings,
  getTacticalPositionSettingsRevision,
  type TacticalPositionSettings,
} from './TacticalPositionSettings';

export type TacticalPositionSearchKind =
  | 'cover'
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
  | 'no_candidates'
  | 'unsupported_kind'
  | 'owner_missing'
  | 'input_changed'
  | 'field_identity_changed'
  | 'reference_threat_missing'
  | 'order_target_missing'
  | 'replaced'
  | 'cancelled'
  | 'destroyed'
  | 'search_failed';

export interface TacticalPositionSearchParameters {
  readonly objective: TacticalPositionSearchObjective;
  readonly searchRadiusMeters: number;
  readonly maxCandidates: number;
  readonly maxSampledCells: number;
  readonly maxRouteExpansions: number;
  readonly minimumSeparationMeters: number;
}

export interface TacticalPositionSearchResultSnapshotV1 {
  readonly version: 1;
  readonly requestId: string;
  readonly ownerUnitId: string;
  readonly kind: TacticalPositionSearchKind;
  readonly fieldIdentity: string;
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
  /** Actual origin used by the local bounded search. Updated once when the field becomes ready. */
  readonly origin: GridPosition;
  readonly currentPosture: UnitPosture;
  readonly orderTarget: GridPosition | null;
  readonly orderIdentity: string | null;
  readonly referenceThreatId: string | null;
  readonly referenceThreatPosition: GridPosition | null;
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
  readonly destroyed: boolean;
}

export interface TacticalPositionSearchEnqueueOptions {
  /** Create a new request even when the stable tactical identity is unchanged. */
  readonly forceRefresh?: boolean;
}

const DEFAULT_PARAMETERS: TacticalPositionSearchParameters = Object.freeze({
  objective: 'balanced',
  searchRadiusMeters: 50,
  maxCandidates: 12,
  maxSampledCells: 2048,
  maxRouteExpansions: 2048,
  minimumSeparationMeters: 4,
});
const DEFAULT_MAX_REQUESTS = 36;
const DEFAULT_MAX_OWNERS = 12;
const serviceByState = new WeakMap<SimulationState, TacticalPositionSearchService>();

interface MutableRequest extends Omit<TacticalPositionSearchRequestSnapshotV1, 'result'> {
  result: TacticalPositionSearchResultSnapshotV1 | null;
}

export class TacticalPositionSearchService {
  private readonly requests = new Map<string, MutableRequest>();
  private readonly latestRequestIdByUnit = new Map<string, string>();
  private readonly listeners = new Set<() => void>();
  private readonly schedule: (callback: () => void) => void;
  private readonly searchPrepared: NonNullable<TacticalPositionSearchServiceOptions['searchPrepared']>;
  private readonly maxRequests: number;
  private readonly maxOwners: number;
  private readonly unsubscribeRuntime: () => void;
  private nextRequestSequence = 1;
  private pumpScheduled = false;
  private pumping = false;
  private destroyed = false;
  private localSearchCount = 0;

  constructor(
    private readonly state: SimulationState,
    private readonly fieldRuntime: TacticalPositionFieldRuntime = new AwarenessWorldRuntime(),
    options: TacticalPositionSearchServiceOptions = {},
  ) {
    this.schedule = options.schedule ?? ((callback) => queueMicrotask(callback));
    this.searchPrepared = options.searchPrepared ?? runPreparedSearch;
    this.maxRequests = clampInt(options.maxRequests ?? DEFAULT_MAX_REQUESTS, 4, 256);
    this.maxOwners = clampInt(options.maxOwners ?? DEFAULT_MAX_OWNERS, 1, 64);
    this.unsubscribeRuntime = this.fieldRuntime.subscribe(() => this.schedulePump());
  }

  enqueueCoverSearch(
    unit: UnitModel,
    overrides: Partial<TacticalPositionSearchParameters> = {},
    options: TacticalPositionSearchEnqueueOptions = {},
  ): TacticalPositionSearchRequestSnapshotV1 {
    return this.enqueue(unit, 'cover', overrides, options);
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
    const input = captureInput(this.state, unit, kind, parameters);
    const latestId = this.latestRequestIdByUnit.get(unit.id);
    const latest = latestId ? this.requests.get(latestId) : undefined;
    if (!options.forceRefresh && latest && latest.inputIdentity === input.inputIdentity && isReusableStatus(latest.status)) {
      return cloneRequest(latest);
    }

    if (latest && isActiveOrReady(latest.status)) {
      this.updateRequest(latest, {
        status: 'stale',
        reasonCode: 'replaced',
        reason: 'A newer tactical-position request replaced this request.',
        reasonRu: 'Этот запрос тактических позиций заменён более новым.',
      });
    }

    this.enforceOwnerBudget(unit.id);
    const requestId = `${unit.id}:tactical-position:${this.nextRequestSequence}:${Math.max(0, this.state.simulationStep)}`;
    this.nextRequestSequence += 1;
    const request: MutableRequest = {
      version: 1,
      requestId,
      ownerUnitId: unit.id,
      kind,
      ...parameters,
      origin: { ...input.origin },
      currentPosture: input.currentPosture,
      orderTarget: input.orderTarget ? { ...input.orderTarget } : null,
      orderIdentity: input.orderIdentity,
      referenceThreatId: input.referenceThreatId,
      referenceThreatPosition: input.referenceThreatPosition ? { ...input.referenceThreatPosition } : null,
      threatCount: input.threatCount,
      tacticalKnowledgeRevision: input.tacticalKnowledgeRevision,
      settingsRevision: input.settingsRevision,
      settings: { ...input.settings },
      createdAtSimulationStep: this.state.simulationStep,
      updatedAtSimulationStep: this.state.simulationStep,
      status: 'queued',
      inputIdentity: input.inputIdentity,
      requestedWorldKey: null,
      fieldIdentity: null,
      reasonCode: null,
      reason: null,
      reasonRu: null,
      result: null,
    };
    this.requests.set(requestId, request);
    this.latestRequestIdByUnit.delete(unit.id);
    this.latestRequestIdByUnit.set(unit.id, requestId);
    trimMap(this.latestRequestIdByUnit, this.maxOwners, (evictedUnitId, evictedRequestId) => {
      const evicted = this.requests.get(evictedRequestId);
      if (evicted && isActiveOrReady(evicted.status)) {
        this.updateRequest(evicted, {
          status: 'cancelled',
          reasonCode: 'cancelled',
          reason: 'Owner queue budget evicted the request.',
          reasonRu: 'Запрос удалён из-за ограничения очереди владельцев.',
        }, false);
      }
      this.latestRequestIdByUnit.delete(evictedUnitId);
    });
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
    const requestId = this.latestRequestIdByUnit.get(unitId);
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
    const latestId = this.latestRequestIdByUnit.get(unitId);
    this.latestRequestIdByUnit.delete(unitId);
    for (const [requestId, request] of this.requests) {
      if (request.ownerUnitId !== unitId) continue;
      if (requestId === latestId && isActiveOrReady(request.status)) {
        this.updateRequest(request, {
          status: 'cancelled',
          reasonCode: 'cancelled',
          reason: 'Tactical-position owner was cleared.',
          reasonRu: 'Владелец запроса тактических позиций очищен.',
        }, false);
      }
      this.requests.delete(requestId);
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
      ownerCount: this.latestRequestIdByUnit.size,
      queuedCount,
      readyCount,
      staleCount,
      listenerCount: this.listeners.size,
      localSearchCount: this.localSearchCount,
      destroyed: this.destroyed,
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribeRuntime();
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
    this.latestRequestIdByUnit.clear();
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
    if (this.destroyed || this.pumping) return;
    this.pumping = true;
    try {
      for (const requestId of this.latestRequestIdByUnit.values()) {
        const request = this.requests.get(requestId);
        if (!request || (request.status !== 'queued' && request.status !== 'calculating')) continue;
        this.process(request);
      }
    } finally {
      this.pumping = false;
    }
  }

  private process(request: MutableRequest): void {
    const unit = this.state.units.find((candidate) => candidate.id === request.ownerUnitId);
    if (!unit) {
      this.updateRequest(request, {
        status: 'failed', reasonCode: 'owner_missing',
        reason: 'Tactical-position owner no longer exists.',
        reasonRu: 'Владелец запроса тактических позиций больше не существует.',
      });
      return;
    }
    if (request.kind !== 'cover') {
      this.updateRequest(request, {
        status: 'failed', reasonCode: 'unsupported_kind',
        reason: `Tactical-position kind ${request.kind} is not implemented.`,
        reasonRu: `Тип тактической позиции «${request.kind}» пока не реализован.`,
      });
      return;
    }
    if (request.objective !== 'balanced' && request.objective !== 'continue_order' && !request.referenceThreatPosition) {
      this.updateRequest(request, {
        status: 'failed', reasonCode: 'reference_threat_missing',
        reason: 'The selected tactical-position objective requires a reference threat.',
        reasonRu: 'Для выбранной цели поиска нужна известная угроза.',
      });
      return;
    }
    if (request.objective === 'continue_order' && !request.orderTarget) {
      this.updateRequest(request, {
        status: 'failed', reasonCode: 'order_target_missing',
        reason: 'Continue-order search requires an active order target.',
        reasonRu: 'Для продолжения приказа нужна активная точка приказа.',
      });
      return;
    }
    if (buildCurrentInputIdentity(this.state, unit, request) !== request.inputIdentity) {
      this.updateRequest(request, {
        status: 'stale', reasonCode: 'input_changed',
        reason: 'The command, objective, map or settings changed before the request completed.',
        reasonRu: 'Приказ, цель поиска, карта или настройки изменились до завершения запроса.',
      });
      return;
    }

    const prepared = this.fieldRuntime.requestWorldField(this.state, unit);
    if (!prepared) {
      this.updateRequest(request, {
        status: 'calculating', reasonCode: 'field_preparing',
        reason: 'Shared tactical field is being prepared.',
        reasonRu: 'Подготавливается общее тактическое поле.',
      });
      return;
    }

    // Origin and posture are intentionally captured at execution time. Walking
    // while the shared field is prepared does not invalidate the request.
    Object.assign(request, {
      origin: { ...unit.position },
      currentPosture: unit.behaviorRuntime.posture,
      threatCount: unit.tacticalKnowledge.threats.length,
      tacticalKnowledgeRevision: unit.tacticalKnowledge.revision,
      status: 'calculating',
      requestedWorldKey: prepared.worldKey,
      fieldIdentity: prepared.fieldIdentity,
      reasonCode: null,
      reason: null,
      reasonRu: null,
      updatedAtSimulationStep: this.state.simulationStep,
    });

    try {
      this.localSearchCount += 1;
      const result = this.searchPrepared(prepared, cloneRequest(request));
      const currentPrepared = this.fieldRuntime.readReadyWorldField(unit.id);
      if (!currentPrepared || currentPrepared.fieldIdentity !== prepared.fieldIdentity) {
        this.updateRequest(request, {
          status: 'stale', reasonCode: 'field_identity_changed',
          reason: 'Prepared tactical field identity changed during local search.',
          reasonRu: 'Идентичность подготовленного тактического поля изменилась во время поиска.',
          result: null,
        });
        return;
      }
      if (buildCurrentInputIdentity(this.state, unit, request) !== request.inputIdentity) {
        this.updateRequest(request, {
          status: 'stale', reasonCode: 'input_changed',
          reason: 'Stable tactical request inputs changed during local search.',
          reasonRu: 'Стабильные входные данные запроса изменились во время поиска.',
          result: null,
        });
        return;
      }
      const snapshot = freezeResult({
        version: 1,
        requestId: request.requestId,
        ownerUnitId: request.ownerUnitId,
        kind: request.kind,
        fieldIdentity: prepared.fieldIdentity,
        worldKey: prepared.worldKey,
        searchIdentity: `${request.inputIdentity}|origin:${quantize(request.origin.x)}:${quantize(request.origin.y)}|posture:${request.currentPosture}|field:${prepared.fieldIdentity}`,
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
    } catch (error) {
      this.updateRequest(request, {
        status: 'failed', reasonCode: 'search_failed',
        reason: error instanceof Error ? error.message : String(error),
        reasonRu: 'Локальный поиск тактических позиций завершился ошибкой.',
        result: null,
      });
    }
  }

  private updateRequest(request: MutableRequest, patch: Partial<MutableRequest>, publish = true): void {
    Object.assign(request, patch, { updatedAtSimulationStep: this.state.simulationStep });
    if (publish) this.publish();
  }

  private publish(): void {
    for (const listener of this.listeners) listener();
  }

  private enforceOwnerBudget(incomingUnitId: string): void {
    if (this.latestRequestIdByUnit.has(incomingUnitId) || this.latestRequestIdByUnit.size < this.maxOwners) return;
    const oldestUnitId = this.latestRequestIdByUnit.keys().next().value as string | undefined;
    if (oldestUnitId) this.clearUnit(oldestUnitId);
  }

  private trimRequests(): void {
    while (this.requests.size > this.maxRequests) {
      const oldest = this.requests.entries().next().value as [string, MutableRequest] | undefined;
      if (!oldest) return;
      const [requestId, request] = oldest;
      this.requests.delete(requestId);
      if (this.latestRequestIdByUnit.get(request.ownerUnitId) === requestId) {
        this.latestRequestIdByUnit.delete(request.ownerUnitId);
      }
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

function runPreparedSearch(
  prepared: PreparedAwarenessWorldSnapshot,
  request: TacticalPositionSearchRequestSnapshotV1,
): TacticalPositionSearchResult {
  const field = prepared.field;
  return searchTacticalPositionsForObjective({
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
    origin: request.origin,
    currentPosture: request.currentPosture,
    orderTarget: request.orderTarget,
    threatCount: request.threatCount,
    searchRadiusMeters: request.searchRadiusMeters,
    maxSampledCells: request.maxSampledCells,
    maxRouteExpansions: request.maxRouteExpansions,
    maxCandidates: request.maxCandidates,
    minimumSeparationMeters: request.minimumSeparationMeters,
    settings: request.settings,
    objective: request.objective,
    referenceThreatId: request.referenceThreatId,
    referenceThreatPosition: request.referenceThreatPosition,
  });
}

function captureInput(
  state: SimulationState,
  unit: UnitModel,
  kind: TacticalPositionSearchKind,
  parameters: TacticalPositionSearchParameters,
) {
  const origin = { ...unit.position };
  const currentPosture = unit.behaviorRuntime.posture;
  const orderTarget = unit.order ? { ...unit.order.target } : unit.playerCommand?.target ? { ...unit.playerCommand.target } : null;
  const orderIdentity = resolveOrderIdentity(unit, orderTarget);
  const referenceThreat = resolveTacticalPositionReferenceThreat(unit);
  const threatCount = unit.tacticalKnowledge.threats.length;
  const tacticalKnowledgeRevision = unit.tacticalKnowledge.revision;
  const settingsRevision = getTacticalPositionSettingsRevision(unit);
  const settings = { ...getTacticalPositionSettings(unit) };
  const inputIdentity = buildInputIdentity({
    ownerUnitId: unit.id,
    kind,
    objective: parameters.objective,
    orderTarget,
    orderIdentity,
    referenceThreatId: referenceThreat?.id ?? null,
    referenceThreatPosition: referenceThreat?.position ?? null,
    settingsRevision,
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
    threatCount,
    tacticalKnowledgeRevision,
    settingsRevision,
    settings,
    inputIdentity,
  };
}

function buildCurrentInputIdentity(
  state: SimulationState,
  unit: UnitModel,
  request: TacticalPositionSearchRequestSnapshotV1,
): string {
  const currentOrderTarget = unit.order ? unit.order.target : unit.playerCommand?.target ?? null;
  return buildInputIdentity({
    ownerUnitId: unit.id,
    kind: request.kind,
    objective: request.objective,
    orderTarget: currentOrderTarget,
    orderIdentity: resolveOrderIdentity(unit, currentOrderTarget),
    referenceThreatId: request.referenceThreatId,
    referenceThreatPosition: request.referenceThreatPosition,
    settingsRevision: getTacticalPositionSettingsRevision(unit),
    parameters: request,
    simulationMapMetersPerCell: state.map.metersPerCell,
  });
}

function buildInputIdentity(value: {
  ownerUnitId: string;
  kind: TacticalPositionSearchKind;
  objective: TacticalPositionSearchObjective;
  orderTarget: GridPosition | null;
  orderIdentity: string | null;
  referenceThreatId: string | null;
  referenceThreatPosition: GridPosition | null;
  settingsRevision: number;
  parameters: TacticalPositionSearchParameters;
  simulationMapMetersPerCell: number;
}): string {
  return [
    `owner:${value.ownerUnitId}`,
    `kind:${value.kind}`,
    `objective:${value.objective}`,
    `order:${value.objective === 'continue_order' && value.orderTarget ? `${quantize(value.orderTarget.x)}:${quantize(value.orderTarget.y)}` : 'ignored'}`,
    `orderIdentity:${value.objective === 'continue_order' ? value.orderIdentity ?? 'none' : 'ignored'}`,
    `threat:${value.referenceThreatId ?? 'none'}:${value.referenceThreatPosition ? `${quantize(value.referenceThreatPosition.x)}:${quantize(value.referenceThreatPosition.y)}` : 'none'}`,
    `settings:${value.settingsRevision}`,
    `meters:${quantize(value.simulationMapMetersPerCell)}`,
    `radius:${quantize(value.parameters.searchRadiusMeters)}`,
    `candidates:${value.parameters.maxCandidates}`,
    `samples:${value.parameters.maxSampledCells}`,
    `routes:${value.parameters.maxRouteExpansions}`,
    `separation:${quantize(value.parameters.minimumSeparationMeters)}`,
  ].join('|');
}

function resolveOrderIdentity(unit: UnitModel, target: GridPosition | null): string | null {
  if (unit.playerCommand?.id) return unit.playerCommand.id;
  if (!target) return null;
  return `${unit.order?.source ?? 'order'}:${quantize(target.x)}:${quantize(target.y)}`;
}

function cloneRequest(request: TacticalPositionSearchRequestSnapshotV1): TacticalPositionSearchRequestSnapshotV1 {
  return Object.freeze({
    ...request,
    origin: Object.freeze({ ...request.origin }),
    orderTarget: request.orderTarget ? Object.freeze({ ...request.orderTarget }) : null,
    referenceThreatPosition: request.referenceThreatPosition
      ? Object.freeze({ ...request.referenceThreatPosition })
      : null,
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

function normalizeParameters(value: Partial<TacticalPositionSearchParameters>): TacticalPositionSearchParameters {
  return {
    objective: normalizeTacticalPositionSearchObjective(value.objective),
    searchRadiusMeters: bounded(value.searchRadiusMeters, DEFAULT_PARAMETERS.searchRadiusMeters, 1, 500),
    maxCandidates: clampInt(value.maxCandidates ?? DEFAULT_PARAMETERS.maxCandidates, 1, 12),
    maxSampledCells: clampInt(value.maxSampledCells ?? DEFAULT_PARAMETERS.maxSampledCells, 1, 4096),
    maxRouteExpansions: clampInt(value.maxRouteExpansions ?? DEFAULT_PARAMETERS.maxRouteExpansions, 1, 4096),
    minimumSeparationMeters: bounded(value.minimumSeparationMeters, DEFAULT_PARAMETERS.minimumSeparationMeters, 0, 100),
  };
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
    reasonCode,
    reason,
    reasonRu,
    result: null,
  });
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

function trimMap<Key, Value>(
  map: Map<Key, Value>,
  limit: number,
  onEvict: (key: Key, value: Value) => void,
): void {
  while (map.size > limit) {
    const oldest = map.entries().next().value as [Key, Value] | undefined;
    if (!oldest) return;
    onEvict(oldest[0], oldest[1]);
  }
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
