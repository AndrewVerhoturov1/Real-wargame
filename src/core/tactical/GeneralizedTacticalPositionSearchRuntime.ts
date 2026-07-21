import type { UnitPosture } from '../behavior/BehaviorModel';
import type { GridPosition } from '../geometry';
import type { TacticalMap } from '../map/MapModel';
import {
  normalizeTacticalPositionKind,
  type TacticalFiringTarget,
  type TacticalPositionKind,
  type TacticalPositionTargetSpec,
} from '../ai/tactical/TacticalQuery';
import { traceVisibilityRay, traceVisibilityRayPath } from '../visibility/VisibilityRayKernel';
import type { TacticalPositionSearchObjective } from './TacticalPositionObjective';
import type {
  TacticalPositionCandidateSeedV2,
  TacticalPositionFieldView,
  TacticalPositionSearchDiagnostics,
  TacticalPositionSearchResult,
} from './TacticalPositionSearch';
import {
  normalizeTacticalPositionSearchSettings,
  type TacticalPositionSearchSettings,
} from './TacticalPositionNodeSettings';
import { rankTacticalPositionMetrics, type TacticalPositionRankResult } from './TacticalPositionObjectiveRanker';
import {
  postureIndex,
  postureMaskIncludes,
  readStaticTacticalCandidatesInBounds,
  type StaticTacticalPositionBasisSnapshot,
} from './static/StaticTacticalPositionBasis';

const POSTURES: readonly UnitPosture[] = ['standing', 'crouched', 'prone'];
const DIAGONAL_COST = Math.SQRT2;

export interface GeneralizedTacticalPositionSearchLimits {
  readonly preliminaryCandidates: number;
  readonly exactCandidates: number;
  readonly exactRayLimit: number;
  readonly maxPositionDanger: number;
  readonly minimumLineQuality: number;
  readonly maximumRouteCost: number;
}
export interface GeneralizedTacticalPositionSearchRequest {
  readonly requestIdentity: string;
  readonly kind: TacticalPositionKind | 'cover';
  readonly objective: TacticalPositionSearchObjective;
  readonly origin: GridPosition;
  readonly currentPosture: UnitPosture;
  readonly orderTarget: GridPosition | null;
  readonly referenceThreatId: string | null;
  readonly referenceThreatPosition: GridPosition | null;
  readonly target: TacticalPositionTargetSpec | null;
  readonly searchRadiusMeters: number;
  readonly maxRouteExpansions: number;
  readonly maxCandidates: number;
  readonly minimumSeparationMeters: number;
  readonly limits?: Partial<GeneralizedTacticalPositionSearchLimits>;
  readonly settings?: TacticalPositionSearchSettings;
}
export interface GeneralizedTacticalPositionFieldView extends TacticalPositionFieldView {
  readonly staticBasis: StaticTacticalPositionBasisSnapshot;
  readonly map?: TacticalMap;
}
interface RouteField {
  readonly minX: number; readonly minY: number; readonly width: number; readonly height: number;
  readonly cost: Float64Array; readonly dangerSum: Float64Array; readonly steps: Uint16Array;
  readonly settled: Uint8Array; readonly expandedCells: number; readonly budgetExhausted: boolean;
}
interface RankedCandidate {
  readonly cellIndex: number; readonly position: GridPosition; readonly staticPotential: number;
  readonly directionalFit: number; readonly posture: UnitPosture; readonly postureFit: number;
  readonly alternativePostureMask: number; readonly facingRadians: number; readonly protection: number;
  readonly concealment: number; readonly danger: number; readonly uncertainty: number;
  readonly routeDanger: number; readonly routeCost: number; readonly orderAlignment: number;
  readonly targetDistanceMeters: number | null; readonly desiredDistanceFit: number;
  readonly threatDistanceDeltaMeters: number | null; readonly objectiveAlignment: number;
  readonly dominantSectorMask: number; readonly rank: TacticalPositionRankResult;
}
interface ExactCandidate extends RankedCandidate {
  readonly lineQuality: number; readonly rangeFit: number; readonly withdrawalQuality: number;
  readonly rank: TacticalPositionRankResult; readonly exactRays: number; readonly exactLineChecked: boolean;
}

export function searchGeneralizedTacticalPositions(
  field: GeneralizedTacticalPositionFieldView,
  request: GeneralizedTacticalPositionSearchRequest,
): TacticalPositionSearchResult {
  assertInput(field);
  const kind = normalizeTacticalPositionKind(request.kind);
  const settings = resolveSettings(request, kind);
  const budget = settings.searchBudget;
  const constraints = settings.constraints;
  const radiusCells = Math.max(1, request.searchRadiusMeters / Math.max(0.001, field.metersPerCell));
  const originX = clampInt(Math.floor(request.origin.x), 0, field.width - 1);
  const originY = clampInt(Math.floor(request.origin.y), 0, field.height - 1);
  const route = buildRouteField(field, originX, originY, radiusCells, budget.maxRouteExpansions);
  const minX = Math.max(0, Math.floor(originX - radiusCells));
  const minY = Math.max(0, Math.floor(originY - radiusCells));
  const maxX = Math.min(field.width - 1, Math.ceil(originX + radiusCells));
  const maxY = Math.min(field.height - 1, Math.ceil(originY + radiusCells));
  const indexed = readStaticTacticalCandidatesInBounds(field.staticBasis.candidateIndex, kind, minX, minY, maxX, maxY);
  const preliminary: RankedCandidate[] = [];
  let scanned = 0;

  for (const indexedCandidate of indexed) {
    if (scanned >= budget.candidateScanLimit) break;
    scanned += 1;
    const cellIndex = indexedCandidate.cellIndex;
    const x = cellIndex % field.width;
    const y = Math.floor(cellIndex / field.width);
    const dx = x - originX;
    const dy = y - originY;
    if (dx * dx + dy * dy > radiusCells * radiusCells) continue;
    const routeIndex = routeLocalIndex(route, x, y);
    if (routeIndex < 0 || route.settled[routeIndex] !== 1) continue;
    const routeCost = route.cost[routeIndex] ?? Number.POSITIVE_INFINITY;
    if (!Number.isFinite(routeCost) || routeCost > budget.maximumRouteCost) continue;
    const danger = decodeAwareness(field.danger[cellIndex] ?? 0);
    if (danger > constraints.maxPositionDanger) continue;
    const postureChoice = choosePosture(field, kind, cellIndex, indexedCandidate.postureMask, request.currentPosture, settings);
    if (!postureChoice) continue;
    const position = { x: x + 0.5, y: y + 0.5 };
    const facingRadians = resolveFacing(request, kind, position, indexedCandidate.dominantSectorMask, field.staticBasis.sectorCount);
    const sector = bearingToSector(facingRadians, field.staticBasis.sectorCount);
    const directionalFit = readDirectionalFit(field.staticBasis, kind, cellIndex, sector);
    if (directionalFit < constraints.minimumDirectionalFit) continue;
    const protection = kind === 'defense'
      ? readDirection(field.staticBasis.protectionByDirection, field.staticBasis, cellIndex, sector)
      : decodeByte(field.staticBasis.staticProtectionByPosture[cellIndex * 3 + postureIndex(postureChoice.posture)] ?? 0);
    if (protection < constraints.minimumProtection) continue;
    const routeSteps = Math.max(1, route.steps[routeIndex] ?? 0);
    const routeDanger = clampPercent((route.dangerSum[routeIndex] ?? 0) / routeSteps);
    if (routeDanger > constraints.maxRouteDanger) continue;
    const concealment = Math.max(decodeAwareness(field.concealment[cellIndex] ?? 0), decodeByte(field.staticBasis.concealment[cellIndex] ?? 0));
    if (concealment < constraints.minimumConcealment) continue;
    const uncertainty = decodeAwareness(field.uncertainty[cellIndex] ?? 0);
    const staticPotential = decodeByte(indexedCandidate.score);
    const orderAlignment = request.orderTarget
      ? clampPercent(100 - distanceMeters(position, request.orderTarget, field.metersPerCell) / Math.max(1, request.searchRadiusMeters) * 100)
      : 50;
    const point = targetPoint(request.target, request.referenceThreatPosition);
    const targetDistanceMeters = point ? distanceMeters(position, point, field.metersPerCell) : null;
    if (!withinTargetDistance(targetDistanceMeters, constraints.minimumTargetDistanceMeters, constraints.maximumTargetDistanceMeters)) continue;
    const desiredDistanceFit = calculateDesiredDistanceFit(request.target, targetDistanceMeters, constraints.desiredDistanceMeters, constraints.desiredDistanceToleranceMeters);
    const threatDistanceDeltaMeters = request.referenceThreatPosition
      ? targetDistanceDelta(request.origin, position, request.referenceThreatPosition, field.metersPerCell)
      : null;
    const objectiveAlignmentValue = objectiveAlignment(field, request, position);
    const rank = rankTacticalPositionMetrics({
      staticPotential, directionalFit, lineQuality: directionalFit, rangeFit: 100, desiredDistanceFit,
      protection, concealment, positionDanger: danger, routeDanger, routeCost, uncertainty,
      orderAlignment, withdrawalQuality: withdrawalQuality(routeDanger, routeCost, request.searchRadiusMeters),
      postureFit: postureChoice.fit, objectiveAlignment: objectiveAlignmentValue, threatDistanceDeltaMeters,
    }, request.objective, settings, { searchRadiusMeters: request.searchRadiusMeters });
    insertRanked(preliminary, {
      cellIndex, position, staticPotential, directionalFit, posture: postureChoice.posture,
      postureFit: postureChoice.fit, alternativePostureMask: postureChoice.allowedMask,
      facingRadians, protection, concealment, danger, uncertainty, routeDanger, routeCost,
      orderAlignment, targetDistanceMeters, desiredDistanceFit, threatDistanceDeltaMeters,
      objectiveAlignment: objectiveAlignmentValue, dominantSectorMask: indexedCandidate.dominantSectorMask, rank,
    }, budget.preliminaryCandidates);
  }

  const exact: ExactCandidate[] = [];
  let exactRayCount = 0;
  for (const candidate of preliminary.slice(0, budget.exactCandidates)) {
    const evaluation = evaluateExact(field, request, kind, candidate, settings, budget.exactRayLimit - exactRayCount);
    exactRayCount += evaluation.exactRays;
    if (!passesExactConstraints(evaluation, kind, settings)) continue;
    exact.push(evaluation);
  }
  exact.sort((left, right) => right.rank.finalScore - left.rank.finalScore || right.rank.tacticalQuality - left.rank.tacticalQuality || left.cellIndex - right.cellIndex);

  const pool = exact.slice(0, budget.objectiveCandidatePool);
  const minimumSeparationCells = budget.minimumSeparationMeters / Math.max(0.001, field.metersPerCell);
  const selected: ExactCandidate[] = [];
  for (const candidate of pool) {
    if (selected.length >= budget.maxCandidates) break;
    if (selected.some((other) => Math.hypot(other.position.x - candidate.position.x, other.position.y - candidate.position.y) < minimumSeparationCells && directionalSimilarity(other.dominantSectorMask, candidate.dominantSectorMask) >= 0.67)) continue;
    selected.push(candidate);
  }

  return {
    candidates: selected.map((candidate): TacticalPositionCandidateSeedV2 => {
      const metrics = {
        onMap: true,
        routeExists: true,
        distanceMeters: distanceMeters(request.origin, candidate.position, field.metersPerCell),
        blocksThreat: candidate.protection >= constraints.minimumProtection,
        protection: roundTwo(candidate.protection),
        concealment: roundTwo(candidate.concealment),
        routeDanger: roundTwo(candidate.routeDanger),
        slopeType: readSlopeType(field, candidate.cellIndex),
        orderAlignment: roundTwo(candidate.orderAlignment),
        referenceThreatId: request.referenceThreatId,
        distanceToThreatMeters: request.referenceThreatPosition ? roundTwo(distanceMeters(candidate.position, request.referenceThreatPosition, field.metersPerCell)) : null,
        threatDistanceDeltaMeters: candidate.threatDistanceDeltaMeters === null ? null : roundTwo(candidate.threatDistanceDeltaMeters),
        distanceToOrderTargetMeters: request.orderTarget ? roundTwo(distanceMeters(candidate.position, request.orderTarget, field.metersPerCell)) : null,
        objectiveAlignment: roundTwo(candidate.objectiveAlignment),
        recommendedPosture: candidate.posture,
        alternativePostureMask: candidate.alternativePostureMask,
        recommendedFacingRadians: candidate.facingRadians,
        postureReason: postureReason(candidate.posture, kind),
        postureReasonRu: postureReasonRu(candidate.posture, kind),
        staticPotential: roundTwo(candidate.staticPotential),
        directionalFit: roundTwo(candidate.directionalFit),
        lineQuality: roundTwo(candidate.lineQuality),
        rangeFit: roundTwo(candidate.rangeFit),
        uncertainty: roundTwo(candidate.uncertainty),
        positionDanger: roundTwo(candidate.danger),
        withdrawalQuality: roundTwo(candidate.withdrawalQuality),
        danger: roundTwo(candidate.danger),
        suppression: decodeAwareness(field.suppression[candidate.cellIndex] ?? 0),
        safety: roundTwo(clampPercent(100 - candidate.danger * 0.65 + candidate.protection * 0.35)),
        safetyGain: 0,
        routeCost: roundTwo(candidate.routeCost),
        desiredDistanceFit: roundTwo(candidate.desiredDistanceFit),
        postureFit: roundTwo(candidate.postureFit),
        tacticalQuality: candidate.rank.tacticalQuality,
        movementObjectiveScore: candidate.rank.movementObjectiveScore,
        finalScore: candidate.rank.finalScore,
      } as TacticalPositionCandidateSeedV2['metrics'];
      return {
        id: `${kind}:${candidate.cellIndex}:${candidate.posture}`,
        kind,
        objective: request.objective,
        requestIdentity: request.requestIdentity,
        position: { ...candidate.position },
        source: { kind: 'static_basis', id: `static:${kind}:${candidate.cellIndex}`, label: `${kind} tactical position`, labelRu: kindLabelRu(kind) },
        metrics,
      };
    }),
    diagnostics: {
      sampledCells: scanned,
      routeExpandedCells: route.expandedCells,
      provisionalCandidates: preliminary.length,
      sampleBudgetExhausted: indexed.length > scanned,
      routeBudgetExhausted: route.budgetExhausted,
      indexedCandidates: indexed.length,
      preliminaryCandidates: preliminary.length,
      exactCandidates: exact.length,
      exactRays: exactRayCount,
    } as TacticalPositionSearchDiagnostics,
  };
}

function resolveSettings(request: GeneralizedTacticalPositionSearchRequest, kind: TacticalPositionKind): TacticalPositionSearchSettings {
  if (request.settings) return normalizeTacticalPositionSearchSettings(request.settings, kind, request.objective);
  const base = normalizeTacticalPositionSearchSettings(undefined, kind, request.objective);
  return normalizeTacticalPositionSearchSettings({
    ...base,
    constraints: { ...base.constraints, maxPositionDanger: request.limits?.maxPositionDanger ?? base.constraints.maxPositionDanger, minimumLineQuality: request.limits?.minimumLineQuality ?? base.constraints.minimumLineQuality },
    searchBudget: {
      ...base.searchBudget,
      maxCandidates: request.maxCandidates,
      preliminaryCandidates: request.limits?.preliminaryCandidates ?? base.searchBudget.preliminaryCandidates,
      exactCandidates: request.limits?.exactCandidates ?? base.searchBudget.exactCandidates,
      exactRayLimit: request.limits?.exactRayLimit ?? base.searchBudget.exactRayLimit,
      maxRouteExpansions: request.maxRouteExpansions,
      maximumRouteCost: request.limits?.maximumRouteCost ?? base.searchBudget.maximumRouteCost,
      minimumSeparationMeters: request.minimumSeparationMeters,
    },
  }, kind, request.objective);
}

function evaluateExact(
  field: GeneralizedTacticalPositionFieldView,
  request: GeneralizedTacticalPositionSearchRequest,
  kind: TacticalPositionKind,
  candidate: RankedCandidate,
  settings: TacticalPositionSearchSettings,
  remainingRayBudget: number,
): ExactCandidate {
  let lineQuality = candidate.directionalFit;
  let rangeFit = 100;
  let protection = candidate.protection;
  let exactRays = 0;
  let exactLineChecked = false;
  const point = targetPoint(request.target, request.referenceThreatPosition);
  if (field.map && point && remainingRayBudget > 0) {
    exactLineChecked = true;
    if (kind === 'observation') {
      const trace = traceVisibilityRay(field.map, { origin: candidate.position, target: point, originHeightAboveGroundMeters: postureHeight(candidate.posture), targetHeightAboveGroundMeters: 1.5, channel: 'visual' });
      exactRays = 1;
      lineQuality = clampPercent(trace.visualTransmission * 100 * (trace.hardBlocked ? 0.25 : 1));
    } else if (kind === 'firing') {
      const trace = traceVisibilityRayPath(field.map, { origin: candidate.position, target: point, originHeightAboveGroundMeters: postureHeight(candidate.posture), targetHeightAboveGroundMeters: 1.4, channel: 'combined' });
      exactRays = 1;
      const immediateBlocked = trace.samples.some((sample) => sample.distanceMeters <= 8 && sample.hardBlocked);
      lineQuality = immediateBlocked ? 0 : clampPercent(trace.result.fireTransmission * 100 * (trace.result.hardBlocked ? 0.2 : 1));
      rangeFit = firingRangeFit(request.target, candidate.targetDistanceMeters);
    } else {
      const trace = traceVisibilityRay(field.map, { origin: point, target: candidate.position, originHeightAboveGroundMeters: 1.65, targetHeightAboveGroundMeters: postureHeight(candidate.posture), channel: 'fire' });
      exactRays = 1;
      protection = clampPercent((1 - trace.fireTransmission) * 70 + (trace.hardBlocked ? 30 : 0));
      lineQuality = protection;
    }
  } else if (kind === 'firing') {
    rangeFit = firingRangeFit(request.target, candidate.targetDistanceMeters);
  }
  const withdrawal = withdrawalQuality(candidate.routeDanger, candidate.routeCost, request.searchRadiusMeters);
  const rank = rankTacticalPositionMetrics({
    staticPotential: candidate.staticPotential, directionalFit: candidate.directionalFit, lineQuality,
    rangeFit, desiredDistanceFit: candidate.desiredDistanceFit, protection, concealment: candidate.concealment,
    positionDanger: candidate.danger, routeDanger: candidate.routeDanger, routeCost: candidate.routeCost,
    uncertainty: candidate.uncertainty, orderAlignment: candidate.orderAlignment, withdrawalQuality: withdrawal,
    postureFit: candidate.postureFit, objectiveAlignment: candidate.objectiveAlignment,
    threatDistanceDeltaMeters: candidate.threatDistanceDeltaMeters,
  }, request.objective, settings, { searchRadiusMeters: request.searchRadiusMeters });
  return { ...candidate, protection, lineQuality, rangeFit, withdrawalQuality: withdrawal, rank, exactRays, exactLineChecked };
}

function passesExactConstraints(candidate: ExactCandidate, kind: TacticalPositionKind, settings: TacticalPositionSearchSettings): boolean {
  const constraints = settings.constraints;
  if (candidate.lineQuality < constraints.minimumLineQuality) return false;
  if (candidate.protection < constraints.minimumProtection) return false;
  if (kind === 'firing' && candidate.rangeFit <= 0) return false;
  if (kind === 'observation' && constraints.requireVisualLine && (!candidate.exactLineChecked || candidate.lineQuality <= 0)) return false;
  if (kind === 'firing' && constraints.requireBallisticLine && (!candidate.exactLineChecked || candidate.lineQuality <= 0)) return false;
  return true;
}

function choosePosture(field: GeneralizedTacticalPositionFieldView, kind: TacticalPositionKind, cellIndex: number, postureMask: number, currentPosture: UnitPosture, settings: TacticalPositionSearchSettings): { posture: UnitPosture; fit: number; allowedMask: number } | null {
  let best: { posture: UnitPosture; fit: number; score: number } | null = null;
  let allowedMask = 0;
  for (const posture of POSTURES) {
    if (!settings.constraints.allowedPostures[posture] || !postureMaskIncludes(postureMask, posture)) continue;
    allowedMask |= postureBit(posture);
    const offset = cellIndex * 3 + postureIndex(posture);
    const primary = kind === 'observation' ? decodeByte(field.staticBasis.observationByPosture[offset] ?? 0) : kind === 'firing' ? decodeByte(field.staticBasis.firingByPosture[offset] ?? 0) : decodeByte(field.staticBasis.staticProtectionByPosture[offset] ?? 0);
    const danger = decodeAwareness(field.danger[cellIndex] ?? 0) * postureExposure(posture);
    const transitionPenalty = posture === currentPosture ? 0 : transitionPenaltyFor(posture, settings);
    const fit = clampPercent(primary - danger * settings.posture.dangerExposureWeight - transitionPenalty);
    if (!best || fit > best.score || fit === best.score && postureRank(posture) > postureRank(best.posture)) best = { posture, fit, score: fit };
  }
  return best ? { posture: best.posture, fit: best.fit, allowedMask } : null;
}
function transitionPenaltyFor(posture: UnitPosture, settings: TacticalPositionSearchSettings): number { return posture === 'standing' ? settings.posture.transitionPenaltyStanding : posture === 'crouched' ? settings.posture.transitionPenaltyCrouched : settings.posture.transitionPenaltyProne; }
function postureBit(posture: UnitPosture): number { return posture === 'standing' ? 1 : posture === 'crouched' ? 2 : 4; }
function readDirectionalFit(basis: StaticTacticalPositionBasisSnapshot, kind: TacticalPositionKind, cellIndex: number, sector: number): number { return readDirection(kind === 'observation' ? basis.observationByDirection : kind === 'defense' ? basis.protectionByDirection : basis.firingByDirection, basis, cellIndex, sector); }
function readDirection(values: Uint8Array, basis: StaticTacticalPositionBasisSnapshot, cellIndex: number, sector: number): number { const safe = ((sector % basis.sectorCount) + basis.sectorCount) % basis.sectorCount; return decodeByte(values[cellIndex * basis.sectorCount + safe] ?? 0); }
function resolveFacing(request: GeneralizedTacticalPositionSearchRequest, kind: TacticalPositionKind, candidate: GridPosition, mask: number, sectors: number): number { const point = kind === 'defense' ? request.referenceThreatPosition : targetPoint(request.target, null); if (point) return Math.atan2(point.y - candidate.y, point.x - candidate.x); if (request.target && 'bearingRadians' in request.target && typeof request.target.bearingRadians === 'number') return request.target.bearingRadians; for (let sector = 0; sector < Math.min(sectors, 32); sector += 1) if ((mask & (1 << sector)) !== 0) return sector * Math.PI * 2 / sectors; return 0; }
function targetPoint(target: TacticalPositionTargetSpec | null, fallback: GridPosition | null): GridPosition | null { return target && 'point' in target && target.point ? target.point : fallback; }
function withinTargetDistance(distance: number | null, minimum: number, maximum: number): boolean { return distance === null || distance >= minimum && (maximum <= 0 || distance <= maximum); }
function calculateDesiredDistanceFit(target: TacticalPositionTargetSpec | null, distance: number | null, configured: number, tolerance: number): number { if (distance === null) return 100; const desired = configured > 0 ? configured : target && 'desiredDistanceMeters' in target && typeof target.desiredDistanceMeters === 'number' ? target.desiredDistanceMeters : target && isFiringTarget(target) ? target.effectiveRangeMeters ?? 0 : 0; if (desired <= 0) return 100; const excess = Math.max(0, Math.abs(distance - desired) - tolerance); return clampPercent(100 - excess / Math.max(1, desired) * 100); }
function firingRangeFit(target: TacticalPositionTargetSpec | null, distance: number | null): number { if (distance === null || !target || !isFiringTarget(target)) return 100; const minimum = Math.max(0, target.minimumRangeMeters ?? 0); const effective = Math.max(minimum + 1, target.effectiveRangeMeters ?? target.maximumRangeMeters ?? 300); const maximum = Math.max(effective, target.maximumRangeMeters ?? effective); if (distance < minimum || distance > maximum) return 0; return distance <= effective ? clampPercent(100 - Math.abs(distance - effective) / effective * 50) : clampPercent(100 - (distance - effective) / Math.max(1, maximum - effective) * 100); }
function isFiringTarget(target: TacticalPositionTargetSpec): target is TacticalFiringTarget { return target.mode === 'known_target' || target.mode === 'estimated_position' || target.mode === 'area'; }
function withdrawalQuality(routeDanger: number, routeCost: number, radius: number): number { return Math.min(100 - clampPercent(routeDanger), routeEfficiency(routeCost, radius)); }
function routeEfficiency(routeCost: number, radius: number): number { return clampPercent(100 / (1 + Math.max(0, routeCost) / Math.max(1, radius))); }
function targetDistanceDelta(origin: GridPosition, candidate: GridPosition, threat: GridPosition, metersPerCell: number): number { return distanceMeters(candidate, threat, metersPerCell) - distanceMeters(origin, threat, metersPerCell); }
function buildRouteField(field: TacticalPositionFieldView, originX: number, originY: number, radiusCells: number, maximumExpansions: number): RouteField { const margin = Math.ceil(radiusCells), minX = Math.max(0, originX - margin), minY = Math.max(0, originY - margin), maxX = Math.min(field.width - 1, originX + margin), maxY = Math.min(field.height - 1, originY + margin), width = maxX - minX + 1, height = maxY - minY + 1, count = width * height; const cost = new Float64Array(count); cost.fill(Number.POSITIVE_INFINITY); const dangerSum = new Float64Array(count), steps = new Uint16Array(count), settled = new Uint8Array(count), start = (originY - minY) * width + originX - minX, heap: Array<{ index: number; cost: number }> = [{ index: start, cost: 0 }]; cost[start] = 0; let expandedCells = 0; const limit = clampInt(maximumExpansions, 1, 8192); while (heap.length && expandedCells < limit) { const current = popHeap(heap)!; if (settled[current.index] === 1 || current.cost > cost[current.index]!) continue; settled[current.index] = 1; expandedCells += 1; const localX = current.index % width, localY = Math.floor(current.index / width), x = minX + localX, y = minY + localY; for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) { if (!ox && !oy) continue; const nx = x + ox, ny = y + oy; if (nx < minX || ny < minY || nx > maxX || ny > maxY) continue; const dx = nx - originX, dy = ny - originY; if (dx * dx + dy * dy > radiusCells * radiusCells) continue; const global = ny * field.width + nx; if (field.passable[global] !== 1) continue; if (ox && oy && (field.passable[y * field.width + nx] !== 1 || field.passable[ny * field.width + x] !== 1)) continue; const next = (ny - minY) * width + nx - minX; if (settled[next] === 1) continue; const movement = Math.max(0.05, finite(field.movementCost[global], 1)), danger = decodeAwareness(field.danger[global] ?? 0), step = ox && oy ? DIAGONAL_COST : 1, nextCost = current.cost + step * movement * (1 + danger / 100 * 1.5); if (nextCost >= cost[next]!) continue; cost[next] = nextCost; dangerSum[next] = (dangerSum[current.index] ?? 0) + danger; steps[next] = Math.min(65535, (steps[current.index] ?? 0) + 1); pushHeap(heap, { index: next, cost: nextCost }); } } return { minX, minY, width, height, cost, dangerSum, steps, settled, expandedCells, budgetExhausted: heap.length > 0 }; }
function objectiveAlignment(field: GeneralizedTacticalPositionFieldView, request: GeneralizedTacticalPositionSearchRequest, position: GridPosition): number { if (request.objective === 'continue_order') return request.orderTarget ? clampPercent(100 - distanceMeters(position, request.orderTarget, field.metersPerCell) / Math.max(1, request.searchRadiusMeters) * 100) : 0; if (!request.referenceThreatPosition) return 50; const delta = targetDistanceDelta(request.origin, position, request.referenceThreatPosition, field.metersPerCell); return request.objective === 'advance_to_threat' ? clampPercent(50 - delta / Math.max(1, request.searchRadiusMeters) * 100) : request.objective === 'withdraw_from_threat' ? clampPercent(50 + delta / Math.max(1, request.searchRadiusMeters) * 100) : 50; }
function readSlopeType(field: GeneralizedTacticalPositionFieldView, cellIndex: number): 'direct' | 'reverse' | 'flat' { const reverse = decodeAwareness(field.reverseSlopeQuality[cellIndex] ?? 0), forward = decodeAwareness(field.forwardSlopeRisk[cellIndex] ?? 0); return reverse >= forward + 8 && reverse >= 25 ? 'reverse' : forward >= reverse + 8 && forward >= 25 ? 'direct' : 'flat'; }
function bearingToSector(bearing: number, sectors: number): number { const normalized = ((bearing % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); return Math.round(normalized / (Math.PI * 2) * sectors) % sectors; }
function insertRanked(target: RankedCandidate[], value: RankedCandidate, limit: number): void { let index = target.length; for (let i = 0; i < target.length; i += 1) if (value.rank.finalScore > target[i]!.rank.finalScore || value.rank.finalScore === target[i]!.rank.finalScore && value.cellIndex < target[i]!.cellIndex) { index = i; break; } target.splice(index, 0, value); if (target.length > limit) target.length = limit; }
function pushHeap(heap: Array<{ index: number; cost: number }>, node: { index: number; cost: number }): void { heap.push(node); let i = heap.length - 1; while (i > 0) { const p = Math.floor((i - 1) / 2); if (!heapBefore(heap[i]!, heap[p]!)) break; [heap[i], heap[p]] = [heap[p]!, heap[i]!]; i = p; } }
function popHeap(heap: Array<{ index: number; cost: number }>): { index: number; cost: number } | undefined { if (!heap.length) return undefined; const root = heap[0]!, last = heap.pop()!; if (!heap.length) return root; heap[0] = last; let i = 0; while (true) { const left = i * 2 + 1, right = left + 1; let smallest = i; if (left < heap.length && heapBefore(heap[left]!, heap[smallest]!)) smallest = left; if (right < heap.length && heapBefore(heap[right]!, heap[smallest]!)) smallest = right; if (smallest === i) break; [heap[i], heap[smallest]] = [heap[smallest]!, heap[i]!]; i = smallest; } return root; }
function heapBefore(left: { index: number; cost: number }, right: { index: number; cost: number }): boolean { return left.cost < right.cost || left.cost === right.cost && left.index < right.index; }
function routeLocalIndex(route: RouteField, x: number, y: number): number { const lx = x - route.minX, ly = y - route.minY; return lx < 0 || ly < 0 || lx >= route.width || ly >= route.height ? -1 : ly * route.width + lx; }
function directionalSimilarity(left: number, right: number): number { const intersection = bitCount((left & right) >>> 0), union = bitCount((left | right) >>> 0); return union === 0 ? 1 : intersection / union; }
function bitCount(value: number): number { let count = 0, next = value >>> 0; while (next) { next &= next - 1; count += 1; } return count; }
function assertInput(field: GeneralizedTacticalPositionFieldView): void { if (field.staticBasis.width !== field.width || field.staticBasis.height !== field.height) throw new Error('Static tactical basis dimensions do not match subjective field.'); }
function postureHeight(posture: UnitPosture): number { return posture === 'standing' ? 1.65 : posture === 'crouched' ? 1.08 : 0.38; }
function postureExposure(posture: UnitPosture): number { return posture === 'standing' ? 1 : posture === 'crouched' ? 0.68 : 0.34; }
function postureRank(posture: UnitPosture): number { return posture === 'standing' ? 3 : posture === 'crouched' ? 2 : 1; }
function postureReason(posture: UnitPosture, kind: TacticalPositionKind): string { return `${posture} offers the best ${kind} balance for this cell.`; }
function postureReasonRu(posture: UnitPosture, kind: TacticalPositionKind): string { const p = posture === 'standing' ? 'стоя' : posture === 'crouched' ? 'пригнувшись' : 'лёжа', k = kind === 'observation' ? 'наблюдения' : kind === 'defense' ? 'защиты' : 'ведения огня'; return `Поза «${p}» даёт лучший баланс ${k} в этой клетке.`; }
function kindLabelRu(kind: TacticalPositionKind): string { return kind === 'observation' ? 'Наблюдательная позиция' : kind === 'defense' ? 'Оборонительная позиция' : 'Огневая позиция'; }
function distanceMeters(left: GridPosition, right: GridPosition, metersPerCell: number): number { return Math.hypot(left.x - right.x, left.y - right.y) * Math.max(0.001, metersPerCell); }
function decodeByte(value: number): number { return clampPercent(value / 255 * 100); }
function decodeAwareness(value: number): number { return clampPercent(value); }
function clampPercent(value: number): number { return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0)); }
function clampInt(value: number, minimum: number, maximum: number): number { const normalized = Number.isFinite(value) ? Math.floor(value) : minimum; return Math.max(minimum, Math.min(maximum, normalized)); }
function finite(value: number | undefined, fallback: number): number { return Number.isFinite(value) ? value as number : fallback; }
function roundTwo(value: number): number { return Math.round(value * 100) / 100; }
