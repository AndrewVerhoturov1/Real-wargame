import type { PreparedAwarenessWorldSnapshot } from '../../runtime/AwarenessWorldRuntime';
import type { SimulationState } from '../simulation/SimulationState';
import { resolveTacticalPositionReferenceThreat } from '../tactical/TacticalPositionObjective';
import type { UnitModel } from '../units/UnitModel';
import { hashTraversalRoute, type TacticalTraversalPlanV1 } from './TacticalTraversalPlan';
import {
  buildTacticalTraversalFieldView,
  captureTacticalTraversalStableInput,
} from './TacticalTraversalPlanningIdentity';
import { planTacticalTraversal } from './TacticalTraversalPlanner';

export type TacticalTraversalPlanningStatus =
  | 'queued'
  | 'calculating'
  | 'ready'
  | 'stale'
  | 'cancelled'
  | 'failed';

export interface TacticalTraversalPlanningFieldRuntime {
  requestWorldField(state: SimulationState, unit: UnitModel): PreparedAwarenessWorldSnapshot | null;
  readReadyWorldField(unitId: string): PreparedAwarenessWorldSnapshot | null;
  subscribe(listener: () => void): () => void;
}

export interface TacticalTraversalPlanningRequestSnapshotV1 {
  readonly version: 1;
  readonly requestId: string;
  readonly ownerUnitId: string;
  readonly inputIdentity: string;
  readonly status: TacticalTraversalPlanningStatus;
  readonly routeRevision: number;
  readonly routeHash: string;
  readonly worldKey: string | null;
  readonly fieldIdentity: string | null;
  readonly createdAtSimulationStep: number;
  readonly updatedAtSimulationStep: number;
  readonly reasonCode: string | null;
  readonly reason: string | null;
  readonly reasonRu: string | null;
  readonly result: TacticalTraversalPlanV1 | null;
}

export interface TacticalTraversalPlanningServiceOptions {
  readonly schedule?: (callback: () => void) => void;
  readonly maximumOwners?: number;
  readonly maximumRequests?: number;
  readonly planPrepared?: typeof planTacticalTraversal;
}

export interface TacticalTraversalPlanningServiceDiagnostics {
  readonly requestCount: number;
  readonly ownerCount: number;
  readonly queuedCount: number;
  readonly readyCount: number;
  readonly staleCount: number;
  readonly planningCount: number;
  readonly destroyed: boolean;
}

interface MutableRequest extends Omit<TacticalTraversalPlanningRequestSnapshotV1, 'result'> {
  result: TacticalTraversalPlanV1 | null;
}

const DEFAULT_MAXIMUM_OWNERS = 12;
const DEFAULT_MAXIMUM_REQUESTS = 36;
const serviceByState = new WeakMap<SimulationState, TacticalTraversalPlanningService>();

export class TacticalTraversalPlanningService {
  private readonly requests = new Map<string, MutableRequest>();
  private readonly latestRequestIdByUnit = new Map<string, string>();
  private readonly schedule: (callback: () => void) => void;
  private readonly planPrepared: typeof planTacticalTraversal;
  private readonly maximumOwners: number;
  private readonly maximumRequests: number;
  private readonly unsubscribeFieldRuntime: () => void;
  private nextSequence = 1;
  private pumpScheduled = false;
  private pumping = false;
  private destroyed = false;
  private planningCount = 0;

  constructor(
    private readonly state: SimulationState,
    private readonly fieldRuntime: TacticalTraversalPlanningFieldRuntime,
    options: TacticalTraversalPlanningServiceOptions = {},
  ) {
    this.schedule = options.schedule ?? ((callback) => queueMicrotask(callback));
    this.planPrepared = options.planPrepared ?? planTacticalTraversal;
    this.maximumOwners = clampInteger(options.maximumOwners ?? DEFAULT_MAXIMUM_OWNERS, 1, 64);
    this.maximumRequests = clampInteger(options.maximumRequests ?? DEFAULT_MAXIMUM_REQUESTS, 4, 256);
    this.unsubscribeFieldRuntime = this.fieldRuntime.subscribe(() => {
      this.invalidateReadyRequestsForChangedField();
      this.schedulePump();
    });
  }

  ensureForUnit(unit: UnitModel): TacticalTraversalPlanningRequestSnapshotV1 | null {
    if (this.destroyed) return null;
    const order = unit.order;
    if (!order?.routeCells || order.routeCells.length === 0) {
      this.clearUnit(unit.id);
      return null;
    }

    const stable = captureTacticalTraversalStableInput(this.state, unit);
    const latestId = this.latestRequestIdByUnit.get(unit.id);
    const latest = latestId ? this.requests.get(latestId) : undefined;
    if (latest && latest.inputIdentity === stable.identity && isReusable(latest.status)) {
      return cloneRequest(latest);
    }

    if (latest && isActiveOrReady(latest.status)) {
      this.updateRequest(latest, {
        status: 'stale',
        reasonCode: 'input_changed',
        reason: 'Traversal planning inputs changed.',
        reasonRu: 'Входные данные плана прохождения изменились.',
      });
    }

    this.enforceOwnerBudget(unit.id);
    const requestId = `${unit.id}:tactical-traversal:${this.nextSequence}:${Math.max(0, this.state.simulationStep)}`;
    this.nextSequence += 1;
    const request: MutableRequest = {
      version: 1,
      requestId,
      ownerUnitId: unit.id,
      inputIdentity: stable.identity,
      status: 'queued',
      routeRevision: stable.routeRevision,
      routeHash: stable.routeHash,
      worldKey: null,
      fieldIdentity: null,
      createdAtSimulationStep: this.state.simulationStep,
      updatedAtSimulationStep: this.state.simulationStep,
      reasonCode: null,
      reason: null,
      reasonRu: null,
      result: null,
    };
    this.requests.set(requestId, request);
    this.latestRequestIdByUnit.delete(unit.id);
    this.latestRequestIdByUnit.set(unit.id, requestId);
    trimMap(this.latestRequestIdByUnit, this.maximumOwners, (evictedUnitId) => this.clearUnit(evictedUnitId));
    this.trimRequests();

    order.traversalPlanStatus = order.traversalPlan ? 'stale' : 'pending';
    order.activeTraversalSegmentIndex = undefined;
    order.traversalPlanReason = 'Traversal plan queued.';
    order.traversalPlanReasonRu = 'План прохождения поставлен в очередь.';
    this.schedulePump();
    return cloneRequest(request);
  }

  readLatestForUnit(unitId: string): TacticalTraversalPlanningRequestSnapshotV1 | null {
    const requestId = this.latestRequestIdByUnit.get(unitId);
    const request = requestId ? this.requests.get(requestId) : undefined;
    return request ? cloneRequest(request) : null;
  }

  readRequest(requestId: string): TacticalTraversalPlanningRequestSnapshotV1 | null {
    const request = this.requests.get(requestId);
    return request ? cloneRequest(request) : null;
  }

  clearUnit(unitId: string): void {
    this.latestRequestIdByUnit.delete(unitId);
    for (const [requestId, request] of this.requests) {
      if (request.ownerUnitId !== unitId) continue;
      if (isActiveOrReady(request.status)) {
        this.updateRequest(request, {
          status: 'cancelled',
          reasonCode: 'owner_cleared',
          reason: 'Traversal planning owner was cleared.',
          reasonRu: 'Владелец плана прохождения очищен.',
        });
      }
      this.requests.delete(requestId);
    }
  }

  getDiagnostics(): TacticalTraversalPlanningServiceDiagnostics {
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
      planningCount: this.planningCount,
      destroyed: this.destroyed,
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribeFieldRuntime();
    this.requests.clear();
    this.latestRequestIdByUnit.clear();
    if (serviceByState.get(this.state) === this) serviceByState.delete(this.state);
  }

  private invalidateReadyRequestsForChangedField(): void {
    if (this.destroyed) return;
    for (const requestId of [...this.latestRequestIdByUnit.values()]) {
      const request = this.requests.get(requestId);
      if (!request || request.status !== 'ready' || !request.worldKey || !request.fieldIdentity) continue;
      const prepared = this.fieldRuntime.readReadyWorldField(request.ownerUnitId);
      if (!prepared) continue;
      if (prepared.worldKey === request.worldKey && prepared.fieldIdentity === request.fieldIdentity) continue;

      this.stale(
        request,
        'field_identity_changed',
        'Shared tactical field identity changed.',
        'Идентичность общего тактического поля изменилась.',
      );
      const unit = this.state.units.find((candidate) => candidate.id === request.ownerUnitId);
      const order = unit?.order;
      if (!unit || !order?.routeCells || order.routeCells.length === 0) continue;
      if (
        order.traversalPlanStatus === 'ready'
        && order.traversalPlan?.worldKey === request.worldKey
        && order.traversalPlan.fieldIdentity === request.fieldIdentity
      ) {
        order.traversalPlanStatus = 'stale';
        order.activeTraversalSegmentIndex = undefined;
        order.traversalPlanReason = 'Shared tactical field changed.';
        order.traversalPlanReasonRu = 'Общее тактическое поле изменилось; нужен новый план.';
      }
      this.ensureForUnit(unit);
    }
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
    if (!unit?.order?.routeCells || unit.order.routeCells.length === 0) {
      this.fail(request, 'owner_or_route_missing', 'Traversal route is unavailable.', 'Маршрут прохождения недоступен.');
      return;
    }
    const stable = captureTacticalTraversalStableInput(this.state, unit);
    if (stable.identity !== request.inputIdentity) {
      this.stale(request, 'input_changed', 'Traversal inputs changed before planning completed.', 'Данные прохождения изменились до завершения расчёта.');
      return;
    }

    const prepared = this.fieldRuntime.requestWorldField(this.state, unit);
    if (!prepared) {
      this.updateRequest(request, {
        status: 'calculating',
        reasonCode: 'field_preparing',
        reason: 'Shared tactical field is being prepared.',
        reasonRu: 'Подготавливается общее тактическое поле.',
      });
      unit.order.traversalPlanStatus = 'pending';
      return;
    }

    this.updateRequest(request, {
      status: 'calculating',
      worldKey: prepared.worldKey,
      fieldIdentity: prepared.fieldIdentity,
      reasonCode: null,
      reason: null,
      reasonRu: null,
    });

    try {
      this.planningCount += 1;
      const threat = resolveTacticalPositionReferenceThreat(unit);
      const plan = this.planPrepared({
        routeCells: unit.order.routeCells,
        routeRevision: stable.routeRevision,
        commandId: stable.commandId,
        commandRevision: stable.commandRevision,
        worldKey: prepared.worldKey,
        fieldIdentity: prepared.fieldIdentity,
        knowledgeRevision: stable.knowledgeRevision,
        tacticalPositionSettingsRevision: stable.settingsRevision,
        movementProfileRevision: stable.movementProfileRevision,
        intentVersion: stable.intentVersion,
        currentPosture: unit.behaviorRuntime.posture,
        intentPresetId: stable.intentPresetId,
        baseMovementProfileId: stable.baseMovementProfileId,
        referenceThreat: threat,
        profile: stable.traversalProfile,
        postureSettings: unit.tacticalPositionSettings,
        field: buildTacticalTraversalFieldView(prepared),
        movementProfiles: this.state.movementProfiles.listProfiles(),
      });
      const currentPrepared = this.fieldRuntime.readReadyWorldField(unit.id);
      const currentStable = captureTacticalTraversalStableInput(this.state, unit);
      if (
        currentStable.identity !== request.inputIdentity
        || !currentPrepared
        || currentPrepared.fieldIdentity !== prepared.fieldIdentity
        || currentPrepared.worldKey !== prepared.worldKey
      ) {
        this.stale(request, 'result_stale', 'Traversal result became stale before it could be applied.', 'Результат прохождения устарел до применения.');
        return;
      }
      const order = unit.order;
      if (!order?.routeCells || hashTraversalRoute(order.routeCells) !== plan.routeHash) {
        this.stale(request, 'route_changed', 'The route changed before traversal plan application.', 'Маршрут изменился до применения плана прохождения.');
        return;
      }
      order.traversalPlan = plan;
      order.traversalPlanStatus = 'ready';
      order.activeTraversalSegmentIndex = 0;
      order.traversalPlanRevision = Math.max(0, order.traversalPlanRevision ?? 0) + 1;
      order.traversalPlanReason = 'Exact tactical traversal plan is ready.';
      order.traversalPlanReasonRu = 'Точный тактический план прохождения готов.';
      this.updateRequest(request, {
        status: 'ready',
        result: plan,
        reasonCode: null,
        reason: null,
        reasonRu: null,
      });
    } catch (error) {
      this.fail(
        request,
        'planning_failed',
        error instanceof Error ? error.message : String(error),
        'Расчёт тактического прохождения завершился ошибкой.',
      );
      if (unit.order) {
        unit.order.traversalPlanStatus = 'failed';
        unit.order.traversalPlanReason = error instanceof Error ? error.message : String(error);
        unit.order.traversalPlanReasonRu = 'План прохождения не рассчитан; используется базовый профиль приказа.';
      }
    }
  }

  private stale(request: MutableRequest, code: string, reason: string, reasonRu: string): void {
    this.updateRequest(request, { status: 'stale', reasonCode: code, reason, reasonRu, result: null });
  }

  private fail(request: MutableRequest, code: string, reason: string, reasonRu: string): void {
    this.updateRequest(request, { status: 'failed', reasonCode: code, reason, reasonRu, result: null });
  }

  private updateRequest(request: MutableRequest, patch: Partial<MutableRequest>): void {
    Object.assign(request, patch, { updatedAtSimulationStep: this.state.simulationStep });
  }

  private enforceOwnerBudget(incomingUnitId: string): void {
    if (this.latestRequestIdByUnit.has(incomingUnitId) || this.latestRequestIdByUnit.size < this.maximumOwners) return;
    const oldest = this.latestRequestIdByUnit.keys().next().value as string | undefined;
    if (oldest) this.clearUnit(oldest);
  }

  private trimRequests(): void {
    while (this.requests.size > this.maximumRequests) {
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

export function installTacticalTraversalPlanningService(
  state: SimulationState,
  service: TacticalTraversalPlanningService,
): void {
  serviceByState.set(state, service);
}

export function getTacticalTraversalPlanningService(
  state: SimulationState,
): TacticalTraversalPlanningService | null {
  return serviceByState.get(state) ?? null;
}

export function clearTacticalTraversalPlanningService(state: SimulationState): void {
  serviceByState.delete(state);
}

function cloneRequest(request: MutableRequest): TacticalTraversalPlanningRequestSnapshotV1 {
  return {
    ...request,
    result: request.result
      ? {
          ...request.result,
          segments: request.result.segments.map((segment) => ({
            ...segment,
            reasonCodes: [...segment.reasonCodes],
          })),
          reasonCodes: [...request.result.reasonCodes],
        }
      : null,
  };
}

function isReusable(status: TacticalTraversalPlanningStatus): boolean {
  return status === 'queued' || status === 'calculating' || status === 'ready';
}

function isActiveOrReady(status: TacticalTraversalPlanningStatus): boolean {
  return isReusable(status);
}

function trimMap<Key, Value>(
  map: Map<Key, Value>,
  maximum: number,
  onEvict: (key: Key, value: Value) => void,
): void {
  while (map.size > maximum) {
    const oldest = map.entries().next().value as [Key, Value] | undefined;
    if (!oldest) return;
    map.delete(oldest[0]);
    onEvict(oldest[0], oldest[1]);
  }
}

function clampInteger(value: number, min: number, max: number): number {
  const finite = Number.isFinite(value) ? Math.floor(value) : min;
  return Math.max(min, Math.min(max, finite));
}
