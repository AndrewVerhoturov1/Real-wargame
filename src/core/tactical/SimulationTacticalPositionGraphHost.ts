import type {
  TacticalQueryGenerationRequest,
  TacticalQueryGenerationResult,
} from '../ai/tactical/TacticalQuery';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';
import { getTacticalPositionSearchService } from './TacticalPositionSearchService';

const MAX_LOCAL_SAMPLE_CELLS = 4096;
const MAX_LOCAL_ROUTE_EXPANSIONS = 4096;
const MIN_LOCAL_WORK_CELLS = 256;
const CELLS_PER_REQUESTED_CANDIDATE = 72;
const DEFAULT_MINIMUM_SEPARATION_METERS = 4;

export function generateSimulationTacticalPositions(
  state: SimulationState,
  unit: UnitModel,
  request: TacticalQueryGenerationRequest,
): TacticalQueryGenerationResult {
  const service = getTacticalPositionSearchService(state);
  if (!service) {
    return stopped(
      'host_unavailable',
      'The simulation-owned tactical-position service is unavailable.',
      'Simulation-owned сервис тактических позиций недоступен.',
    );
  }

  const snapshot = request.requestId
    ? service.readRequest(request.requestId)
    : service.enqueueCoverSearch(unit, buildSearchParameters(state, request));
  if (!snapshot || snapshot.ownerUnitId !== unit.id || snapshot.kind !== 'cover') {
    return {
      ...stopped(
        'host_unavailable',
        'The saved tactical-position request is unavailable for this exact simulation owner.',
        'Сохранённый запрос тактических позиций недоступен для этого владельца в текущей симуляции.',
      ),
      requestId: request.requestId,
      requestStatus: 'failed',
    };
  }

  if (snapshot.status === 'ready' && snapshot.result) {
    if (snapshot.result.candidates.length === 0) {
      return {
        ...stopped(
          'no_candidates',
          'No reachable tactical position improved the current situation inside the bounded search.',
          'В ограниченной области не найдено достижимой позиции, улучшающей текущее положение.',
        ),
        requestId: snapshot.requestId,
        requestStatus: snapshot.status,
      };
    }
    return {
      candidates: snapshot.result.candidates,
      elapsedMs: 0,
      requestId: snapshot.requestId,
      requestStatus: snapshot.status,
      stopReason: snapshot.result.diagnostics.sampleBudgetExhausted
        ? {
            code: 'max_candidates',
            reason: `Deterministic cell budget stopped sampling after ${snapshot.result.diagnostics.sampledCells} cells.`,
            reasonRu: `Фиксированный лимит остановил перебор после ${snapshot.result.diagnostics.sampledCells} клеток.`,
          }
        : undefined,
    };
  }

  if (snapshot.status === 'queued' || snapshot.status === 'calculating') {
    return {
      ...stopped(
        'host_unavailable',
        snapshot.reason ?? 'The tactical field or bounded local search is still being prepared.',
        snapshot.reasonRu ?? 'Тактическое поле или ограниченный локальный поиск ещё готовятся.',
      ),
      requestId: snapshot.requestId,
      requestStatus: snapshot.status,
    };
  }

  return {
    ...stopped(
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
) {
  const radiusCells = Math.max(0, request.searchRadiusMeters / Math.max(0.001, state.map.metersPerCell));
  const localAreaUpperBound = Math.max(1, Math.ceil(Math.PI * radiusCells * radiusCells));
  const requestedWork = Math.max(
    MIN_LOCAL_WORK_CELLS,
    Math.floor(request.maxCandidates) * CELLS_PER_REQUESTED_CANDIDATE,
  );
  return {
    searchRadiusMeters: request.searchRadiusMeters,
    maxCandidates: Math.min(12, Math.max(1, Math.floor(request.maxCandidates))),
    maxSampledCells: Math.max(1, Math.min(MAX_LOCAL_SAMPLE_CELLS, localAreaUpperBound, requestedWork)),
    maxRouteExpansions: Math.max(1, Math.min(MAX_LOCAL_ROUTE_EXPANSIONS, localAreaUpperBound, requestedWork)),
    minimumSeparationMeters: DEFAULT_MINIMUM_SEPARATION_METERS,
  };
}

function stopped(
  code: 'host_unavailable' | 'no_candidates',
  reason: string,
  reasonRu: string,
): TacticalQueryGenerationResult {
  return {
    candidates: [],
    elapsedMs: 0,
    stopReason: { code, reason, reasonRu },
  };
}
