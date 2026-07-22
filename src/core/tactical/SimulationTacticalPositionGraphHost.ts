import {
  type TacticalPositionKind,
  type TacticalPositionTargetSpec,
  type TacticalQueryGenerationRequest,
  type TacticalQueryGenerationResult,
} from '../ai/tactical/TacticalQuery';
import { getWeaponDefinition, getWeaponRuntime } from '../combat/WeaponModel';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';
import {
  normalizeTacticalPositionSearchObjective,
  resolveTacticalPositionReferenceThreat,
} from './TacticalPositionObjective';
import {
  normalizeTacticalPositionSearchSettings,
  readTacticalPositionNodeSettings,
  type TacticalPositionSearchSettings,
} from './TacticalPositionNodeSettings';
import { attachTacticalPositionSearchSettings } from './TacticalPositionNodeSettingsTransport';
import { getTacticalPositionSearchService, type TacticalPositionSearchKind } from './TacticalPositionSearchService';

interface ExtendedTacticalQueryGenerationRequest extends TacticalQueryGenerationRequest {
  readonly targetMode?: 'automatic' | 'order_point' | 'facing_sector';
  readonly targetPoint?: { readonly x: number; readonly y: number } | null;
  readonly sectorCenterDegrees?: number;
  readonly sectorArcDegrees?: number;
  readonly maximumRouteCost?: number;
  readonly maxPositionDanger?: number;
  readonly preliminaryCandidates?: number;
  readonly exactCandidates?: number;
  readonly exactRayLimit?: number;
  readonly searchSettings?: TacticalPositionSearchSettings;
}

export function generateSimulationTacticalPositions(
  state: SimulationState,
  unit: UnitModel,
  request: TacticalQueryGenerationRequest,
): TacticalQueryGenerationResult {
  const service = getTacticalPositionSearchService(state);
  const kind = canonicalKind(request.kind ?? 'cover');
  if (!service || !kind) {
    return stopped(kind ?? 'defense', 'host_unavailable', 'The simulation-owned tactical-position service is unavailable.', 'Сервис тактических позиций симуляции недоступен.');
  }
  const parameters = buildSearchParameters(unit, request as ExtendedTacticalQueryGenerationRequest, kind);
  const snapshot = request.requestId
    ? service.readRequest(request.requestId)
    : request.kind === 'cover' || request.kind === undefined
      ? service.enqueueCoverSearch(unit, parameters)
      : service.enqueueTacticalSearch(unit, kind, parameters);
  const snapshotKind = snapshot ? canonicalServiceKind(snapshot.kind) : null;
  if (!snapshot || snapshot.ownerUnitId !== unit.id || snapshotKind !== kind) {
    return {
      ...stopped(kind, 'host_unavailable', 'The saved tactical-position request is unavailable for this exact simulation owner and kind.', 'Сохранённый запрос тактических позиций недоступен для этого владельца и типа позиции.'),
      requestId: request.requestId,
      requestStatus: 'failed',
    };
  }
  if (snapshot.status === 'ready' && snapshot.result) {
    if (snapshot.result.candidates.length === 0) {
      return {
        ...stopped(kind, 'no_candidates', 'No reachable tactical position satisfied the bounded search.', 'В ограниченной области не найдено достижимой подходящей тактической позиции.'),
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
      ...stopped(kind, 'host_unavailable', snapshot.reason ?? 'The tactical basis, subjective field or exact search is still being prepared.', snapshot.reasonRu ?? 'Постоянная основа, субъективное поле или точный поиск ещё готовятся.'),
      requestId: snapshot.requestId,
      requestStatus: snapshot.status,
    };
  }
  return {
    ...stopped(kind, snapshot.reasonCode === 'no_candidates' ? 'no_candidates' : 'host_unavailable', snapshot.reason ?? `Tactical-position request ended with status ${snapshot.status}.`, snapshot.reasonRu ?? `Запрос тактических позиций завершён со статусом ${snapshot.status}.`),
    requestId: snapshot.requestId,
    requestStatus: snapshot.status,
  };
}

function buildSearchParameters(
  unit: UnitModel,
  request: ExtendedTacticalQueryGenerationRequest,
  kind: TacticalPositionKind,
) {
  const objective = normalizeTacticalPositionSearchObjective(request.objective);
  const legacy = readTacticalPositionNodeSettings({
    kind,
    objective,
    maxCandidates: request.maxCandidates,
    maximumRouteCost: request.maximumRouteCost,
    maxPositionDanger: request.maxPositionDanger,
    preliminaryCandidates: request.preliminaryCandidates,
    exactCandidates: request.exactCandidates,
    exactRayLimit: request.exactRayLimit,
  }).search;
  const settings = request.searchSettings
    ? normalizeTacticalPositionSearchSettings(request.searchSettings, kind, objective)
    : legacy;
  const budget = settings.searchBudget;
  const target = attachTacticalPositionSearchSettings(resolveGraphTarget(unit, kind, request), settings);
  return {
    objective,
    queryKey: request.queryKey ?? `${kind}:graph`,
    target,
    searchRadiusMeters: request.searchRadiusMeters,
    maxCandidates: budget.maxCandidates,
    maxSampledCells: budget.candidateScanLimit,
    maxRouteExpansions: budget.maxRouteExpansions,
    minimumSeparationMeters: budget.minimumSeparationMeters,
    maximumRouteCost: budget.maximumRouteCost,
    maxPositionDanger: settings.constraints.maxPositionDanger,
    preliminaryCandidates: budget.preliminaryCandidates,
    exactCandidates: budget.exactCandidates,
    exactRayLimit: budget.exactRayLimit,
    minimumLineQuality: settings.constraints.minimumLineQuality,
  };
}

function resolveGraphTarget(
  unit: UnitModel,
  kind: TacticalPositionKind,
  request: ExtendedTacticalQueryGenerationRequest,
): TacticalPositionTargetSpec {
  if (request.target) return request.target;
  const mode = request.targetMode ?? 'automatic';
  const orderPoint = unit.order?.target ?? unit.playerCommand?.target ?? null;
  const referenceThreat = resolveTacticalPositionReferenceThreat(unit);
  const weaponRuntime = getWeaponRuntime(unit);
  const weapon = getWeaponDefinition(weaponRuntime.weaponId);
  if (request.targetPoint) {
    const point = { ...request.targetPoint };
    if (kind === 'observation') return { mode: 'point', point };
    if (kind === 'firing') return { mode: 'estimated_position', point, minimumRangeMeters: 0, effectiveRangeMeters: weapon.effectiveRangeMetres, maximumRangeMeters: weapon.maximumRangeMetres };
    return { mode: 'sector', bearingRadians: Math.atan2(point.y - unit.position.y, point.x - unit.position.x), arcRadians: bounded(request.sectorArcDegrees, 90, 1, 360) * Math.PI / 180 };
  }
  if (mode === 'order_point' && orderPoint) {
    if (kind === 'observation') return { mode: 'point', point: { ...orderPoint } };
    if (kind === 'firing') return { mode: 'estimated_position', point: { ...orderPoint }, minimumRangeMeters: 0, effectiveRangeMeters: weapon.effectiveRangeMetres, maximumRangeMeters: weapon.maximumRangeMetres };
    return { mode: 'sector', bearingRadians: Math.atan2(orderPoint.y - unit.position.y, orderPoint.x - unit.position.x), arcRadians: Math.PI / 3 };
  }
  if (mode === 'facing_sector') {
    return createSectorTarget(kind, unit.facingRadians + bounded(request.sectorCenterDegrees, 0, -360, 360) * Math.PI / 180, bounded(request.sectorArcDegrees, 90, 1, 360) * Math.PI / 180, weapon.effectiveRangeMetres, weapon.maximumRangeMetres);
  }
  if (kind === 'observation') {
    const point = referenceThreat?.position ?? orderPoint;
    return point ? { mode: 'point', point: { ...point } } : { mode: 'sector', bearingRadians: unit.facingRadians, arcRadians: Math.PI / 2 };
  }
  if (kind === 'defense') {
    const point = referenceThreat?.position ?? orderPoint;
    return point ? { mode: 'sector', bearingRadians: Math.atan2(point.y - unit.position.y, point.x - unit.position.x), arcRadians: Math.PI / 3 } : { mode: 'sector', bearingRadians: unit.facingRadians, arcRadians: Math.PI / 2 };
  }
  const point = referenceThreat?.position ?? orderPoint;
  return point
    ? { mode: referenceThreat ? 'known_target' : 'estimated_position', point: { ...point }, minimumRangeMeters: 0, effectiveRangeMeters: weapon.effectiveRangeMetres, maximumRangeMeters: weapon.maximumRangeMetres }
    : createSectorTarget(kind, unit.facingRadians, Math.PI / 2, weapon.effectiveRangeMetres, weapon.maximumRangeMetres);
}

function createSectorTarget(kind: TacticalPositionKind, bearingRadians: number, arcRadians: number, effectiveRangeMeters: number, maximumRangeMeters: number): TacticalPositionTargetSpec {
  return kind === 'firing'
    ? { mode: 'sector', bearingRadians, arcRadians, minimumRangeMeters: 0, effectiveRangeMeters, maximumRangeMeters }
    : { mode: 'sector', bearingRadians, arcRadians };
}
function canonicalKind(value: unknown): TacticalPositionKind | null { return value === 'observation' || value === 'firing' ? value : value === 'cover' || value === 'defense' ? 'defense' : null; }
function canonicalServiceKind(value: TacticalPositionSearchKind): TacticalPositionKind | null { return canonicalKind(value); }
function stopped(kind: TacticalPositionKind, code: 'host_unavailable' | 'no_candidates', reason: string, reasonRu: string): TacticalQueryGenerationResult { return { kind, candidates: [], elapsedMs: 0, stopReason: { code, reason, reasonRu } }; }
function bounded(value: unknown, fallback: number, minimum: number, maximum: number): number { const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback; return Math.max(minimum, Math.min(maximum, numeric)); }
