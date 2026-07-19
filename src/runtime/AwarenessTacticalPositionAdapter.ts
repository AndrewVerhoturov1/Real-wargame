import type {
  TacticalQueryGenerationRequest,
  TacticalQueryGenerationResult,
} from '../core/ai/tactical/TacticalQuery';
import type { SimulationState } from '../core/simulation/SimulationState';
import {
  clearTacticalPositionProvider,
  installTacticalPositionProvider,
} from '../core/tactical/TacticalPositionProvider';
import {
  getTacticalPositionSettings,
  tacticalPositionSettingsCacheNudge,
} from '../core/tactical/TacticalPositionSettings';
import type { AwarenessWorldRuntime } from './AwarenessWorldRuntime';

const MAX_LOCAL_SAMPLE_CELLS = 4096;
const MAX_LOCAL_ROUTE_EXPANSIONS = 4096;
const MIN_LOCAL_WORK_CELLS = 256;
const CELLS_PER_REQUESTED_CANDIDATE = 72;
const DEFAULT_MINIMUM_SEPARATION_METERS = 4;

const installedRuntimeByState = new WeakMap<SimulationState, AwarenessWorldRuntime>();

export function ensureAwarenessTacticalPositionProvider(
  state: SimulationState,
  runtime: AwarenessWorldRuntime,
): void {
  if (installedRuntimeByState.get(state) === runtime) return;
  installedRuntimeByState.set(state, runtime);
  installTacticalPositionProvider(state, {
    generate: (unit, request) => generateFromAwarenessRuntime(state, runtime, unit.id, request),
  });
}

export function releaseAwarenessTacticalPositionProvider(
  state: SimulationState,
  runtime: AwarenessWorldRuntime,
): void {
  if (installedRuntimeByState.get(state) !== runtime) return;
  installedRuntimeByState.delete(state);
  clearTacticalPositionProvider(state);
}

function generateFromAwarenessRuntime(
  state: SimulationState,
  runtime: AwarenessWorldRuntime,
  unitId: string,
  request: TacticalQueryGenerationRequest,
): TacticalQueryGenerationResult {
  const unit = state.units.find((candidate) => candidate.id === unitId);
  if (!unit) {
    return stopped(
      'host_unavailable',
      'The tactical-position owner could not resolve the requested soldier.',
      'Источник тактических позиций не нашёл запрошенного бойца.',
    );
  }

  const radiusCells = Math.max(0, request.searchRadiusMeters / Math.max(0.001, state.map.metersPerCell));
  const localAreaUpperBound = Math.ceil(Math.PI * radiusCells * radiusCells);
  const requestedWork = Math.max(
    MIN_LOCAL_WORK_CELLS,
    Math.floor(request.maxCandidates) * CELLS_PER_REQUESTED_CANDIDATE,
  );
  const maxSampledCells = Math.max(
    1,
    Math.min(MAX_LOCAL_SAMPLE_CELLS, localAreaUpperBound, requestedWork),
  );
  const maxRouteExpansions = Math.max(
    1,
    Math.min(MAX_LOCAL_ROUTE_EXPANSIONS, localAreaUpperBound, requestedWork),
  );
  const settings = getTacticalPositionSettings(unit);
  const snapshot = runtime.requestTacticalPositions(state, unit, {
    searchRadiusMeters: request.searchRadiusMeters,
    maxSampledCells,
    maxRouteExpansions,
    maxCandidates: request.maxCandidates,
    minimumSeparationMeters: DEFAULT_MINIMUM_SEPARATION_METERS + tacticalPositionSettingsCacheNudge(unit),
    settings,
  });

  if (!snapshot) {
    return stopped(
      'host_unavailable',
      'The shared awareness field is still being prepared; no synchronous full-map fallback was used.',
      'Общее поле восприятия ещё готовится; синхронный полный пересчёт карты не запускался.',
    );
  }
  if (snapshot.candidates.length === 0) {
    return stopped(
      'no_candidates',
      'No reachable tactical position improved the current situation inside the bounded search.',
      'В ограниченной области не найдено достижимой позиции, улучшающей текущее положение.',
    );
  }

  return {
    candidates: snapshot.candidates,
    elapsedMs: 0,
    stopReason: snapshot.diagnostics.sampleBudgetExhausted
      ? {
          code: 'max_candidates',
          reason: `Deterministic cell budget stopped sampling after ${snapshot.diagnostics.sampledCells} cells.`,
          reasonRu: `Фиксированный лимит остановил перебор после ${snapshot.diagnostics.sampledCells} клеток.`,
        }
      : undefined,
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
