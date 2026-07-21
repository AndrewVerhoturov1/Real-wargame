import {
  normalizeTacticalPositionKind,
  type TacticalPositionKind,
  type TacticalQueryGenerationRequest,
  type TacticalQueryGenerationResult,
} from '../ai/tactical/TacticalQuery';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';
import { normalizeTacticalPositionSearchObjective } from './TacticalPositionObjective';
import { getTacticalPositionSearchService } from './TacticalPositionSearchService';

const MAX_LOCAL_SAMPLE_CELLS = 4096;
const MAX_LOCAL_ROUTE_EXPANSIONS = 8192;
const MIN_LOCAL_WORK_CELLS = 256;
const CELLS_PER_REQUESTED_CANDIDATE = 72;
const DEFAULT_MINIMUM_SEPARATION_METERS = 4;

export function generateSimulationTacticalPositions(
  state: SimulationState,
  unit: UnitModel,
  request: TacticalQueryGenerationRequest,
): TacticalQueryGenerationResult {
  const service = getTacticalPositionSearchService(state);
  const kind = normalizeTacticalPositionKind(request.kind ?? 'cover');
  if (!service) {
    return stopped(
      kind,
      'host_unavailable',
      'The simulation-owned tactical-position service is unavailable.',
      'Сервис тактических позиций симуляции недоступен.',
    );
  }

  const snapshot = request.requestId
    ? service.readRequest(request.requestId)
    : request.kind === 'cover' || request.kind === undefined
      ? service.enqueueCoverSearch(unit, buildSearchParameters(state, request, kind))
      : service.enqueueTacticalSearch(unit, kind, buildSearchParameters(state, request, kind));
  if (!snapshot || snapshot.ownerUnitId !== unit.id || normalizeTacticalPositionKind(snapshot.kind) !== kind) {
    return {
      ...stopped(
        kind,
        'host_unavailable',
        'The saved tactical-position request is unavailable for this exact simulation owner and kind.',
        'Сохранённый запрос тактических позиций недоступен для этого владельца и типа позиции.',
      ),
      requestId: request.requestId,
      requestStatus: 'failed',
    };
  }

  if (snapshot.status === 'ready' && snapshot.result) {
    if (snapshot.result.candidates.length === 0) {
      return {
        ...stopped(
          kind,
          'no_candidates',
          'No reachable tactical position satisfied the bounded search.',
          'В ограниченной области не найдено достижимой подходящей тактической позиции.',
        ),
        requestId: snapshot.requestId,
        requestStatus: snapshot.status,
      };
    }
    return {
      kind,
      candidates: snapshot.result.candidates,
      elapsedMs: 0,
      requestId: snapshot.requestId,
      requestStatus: snapshot.status,
      stopReason: snapshot.result.diagnostics.sampleBudgetExhausted
        ? {
            code: 'max_candidates',
            reason: `Deterministic candidate budget stopped after ${snapshot.result.diagnostics.sampledCells} indexed candidates.`,
            reasonRu: `Фиксированный лимит остановил отбор после ${snapshot.result.diagnostics.sampledCells} индексированных кандидатов.`,
          }
        : undefined,
    };
  }

  if (snapshot.status === 'queued' || snapshot.status === 'calculating') {
    return {
      ...stopped(
        kind,
        'host_unavailable',
        snapshot.reason ?? 'The tactical basis, subjective field or exact search is still being prepared.',
        snapshot.reasonRu ?? 'Постоянная основа, субъективное поле или точный поиск ещё готовятся.',
      ),
      requestId: snapshot.requestId,
      requestStatus: snapshot.status,
    };
  }

  return {
    ...stopped(
      kind,
      snapshot.reasonCode === 'no_candidates' ? 'no_candidates' : 'host_unavailable',
      snapshot.reason ?? `Tactical-position request ended with status ${snapshot.status}.`,
      snapshot.reasonRu ?? `Запрос тактических позиций завершён со статусом ${snapshot.status}.`,
    ),
    requestId: snapshot.requestId,
    requestStatus: snapshot.status,
  };
}

function buildSearchParameters(
  state: SimulationState,
  request: TacticalQueryGenerationRequest,
  kind: TacticalPositionKind,
) {
  const radiusCells = Math.max(0, request.searchRadiusMeters / Math.max(0.001, state.map.metersPerCell));
  const localAreaUpperBound = Math.max(1, Math.ceil(Math.PI * radiusCells * radiusCells));
  const requestedWork = Math.max(
    MIN_LOCAL_WORK_CELLS,
    Math.floor(request.maxCandidates) * CELLS_PER_REQUESTED_CANDIDATE,
  );
  return {
    objective: normalizeTacticalPositionSearchObjective(request.objective),
    queryKey: request.queryKey ?? `${kind}:graph`,
    target: request.target ?? null,
    searchRadiusMeters: request.searchRadiusMeters,
    maxCandidates: Math.min(16, Math.max(1, Math.floor(request.maxCandidates))),
    maxSampledCells: Math.max(1, Math.min(MAX_LOCAL_SAMPLE_CELLS, localAreaUpperBound, requestedWork)),
    maxRouteExpansions: Math.max(1, Math.min(MAX_LOCAL_ROUTE_EXPANSIONS, localAreaUpperBound, requestedWork * 2)),
    minimumSeparationMeters: DEFAULT_MINIMUM_SEPARATION_METERS,
    preliminaryCandidates: 36,
    exactCandidates: 12,
    exactRayLimit: 32,
  };
}

function stopped(
  kind: TacticalPositionKind,
  code: 'host_unavailable' | 'no_candidates',
  reason: string,
  reasonRu: string,
): TacticalQueryGenerationResult {
  return {
    kind,
    candidates: [],
    elapsedMs: 0,
    stopReason: { code, reason, reasonRu },
  };
}
