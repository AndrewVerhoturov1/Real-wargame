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
}

export interface GeneralizedTacticalPositionFieldView extends TacticalPositionFieldView {
  readonly staticBasis: StaticTacticalPositionBasisSnapshot;
  readonly map?: TacticalMap;
}

interface RouteField {
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;
  readonly cost: Float64Array;
  readonly dangerSum: Float64Array;
  readonly steps: Uint16Array;
  readonly settled: Uint8Array;
  readonly expandedCells: number;
  readonly budgetExhausted: boolean;
}

interface RankedCandidate {
  readonly cellIndex: number;
  readonly position: GridPosition;
  readonly staticPotential: number;
  readonly directionalFit: number;
  readonly posture: UnitPosture;
  readonly alternativePostureMask: number;
  readonly facingRadians: number;
  readonly protection: number;
  readonly concealment: number;
  readonly danger: number;
  readonly uncertainty: number;
  readonly routeDanger: number;
  readonly routeCost: number;
  readonly orderAlignment: number;
  readonly cheapScore: number;
  readonly dominantSectorMask: number;
}

interface ExactCandidate extends RankedCandidate {
  readonly lineQuality: number;
  readonly rangeFit: number;
  readonly withdrawalQuality: number;
  readonly finalScore: number;
  readonly exactRays: number;
}

const DEFAULT_LIMITS: GeneralizedTacticalPositionSearchLimits = Object.freeze({
  preliminaryCandidates: 36,
  exactCandidates: 12,
  exactRayLimit: 32,
  maxPositionDanger: 78,
  minimumLineQuality: 18,
  maximumRouteCost: 100000,
});

export function searchGeneralizedTacticalPositions(
  field: GeneralizedTacticalPositionFieldView,
  request: GeneralizedTacticalPositionSearchRequest,
): TacticalPositionSearchResult {
  assertInput(field);
  const kind = normalizeTacticalPositionKind(request.kind);
  const limits = normalizeLimits(request.limits);
  const radiusCells = Math.max(1, request.searchRadiusMeters / Math.max(0.001, field.metersPerCell));
  const originX = clampInt(Math.floor(request.origin.x), 0, field.width - 1);
  const originY = clampInt(Math.floor(request.origin.y), 0, field.height - 1);
  const route = buildRouteField(field, originX, originY, radiusCells, request.maxRouteExpansions);
  const minX = Math.max(0, Math.floor(originX - radiusCells));
  const minY = Math.max(0, Math.floor(originY - radiusCells));
  const maxX = Math.min(field.width - 1, Math.ceil(originX + radiusCells));
  const maxY = Math.min(field.height - 1, Math.ceil(originY + radiusCells));
  const indexed = readStaticTacticalCandidatesInBounds(
    field.staticBasis.candidateIndex,
    kind,
    minX,
    minY,
    maxX,
    maxY,
  );
  const preliminary: RankedCandidate[] = [];

  for (const indexedCandidate of indexed) {
    const cellIndex = indexedCandidate.cellIndex;
    const x = cellIndex % field.width;
    const y = Math.floor(cellIndex / field.width);
    const dx = x - originX;
    const dy = y - originY;
    if (dx * dx + dy * dy > radiusCells * radiusCells) continue;
    const routeIndex = routeLocalIndex(route, x, y);
    if (routeIndex < 0 || route.settled[routeIndex] !== 1) continue;
    const routeCost = route.cost[routeIndex] ?? Number.POSITIVE_INFINITY;
    if (!Number.isFinite(routeCost) || routeCost > limits.maximumRouteCost) continue;
    const danger = decodeAwareness(field.danger[cellIndex] ?? 0);
    if (danger > limits.maxPositionDanger) continue;
    const posture = choosePosture(field, kind, cellIndex, indexedCandidate.postureMask, request.currentPosture);
    if (!posture) continue;
    const facingRadians = resolveFacing(request, kind, { x: x + 0.5, y: y + 0.5 }, indexedCandidate.dominantSectorMask, field.staticBasis.sectorCount);
    const sector = bearingToSector(facingRadians, field.staticBasis.sectorCount);
    const directionalFit = readDirectionalFit(field.staticBasis, kind, cellIndex, sector);
    if ((kind === 'observation' || kind === 'firing') && directionalFit < limits.minimumLineQuality) continue;
    const protection = kind === 'defense'
      ? readDirection(field.staticBasis.protectionByDirection, field.staticBasis, cellIndex, sector)
      : decodeByte(field.staticBasis.staticProtectionByPosture[cellIndex * 3 + postureIndex(posture)] ?? 0);
    if (kind === 'defense' && request.referenceThreatPosition && protection < 10) continue;
    const routeSteps = Math.max(1, route.steps[routeIndex] ?? 0);
    const routeDanger = clampPercent((route.dangerSum[routeIndex] ?? 0) / routeSteps);
    const concealment = Math.max(
      decodeAwareness(field.concealment[cellIndex] ?? 0),
      decodeByte(field.staticBasis.concealment[cellIndex] ?? 0),
    );
    const uncertainty = decodeAwareness(field.uncertainty[cellIndex] ?? 0);
    const staticPotential = decodeByte(indexedCandidate.score);
    const orderAlignment = request.orderTarget
      ? clampPercent(100 - distanceMeters({ x: x + 0.5, y: y + 0.5 }, request.orderTarget, field.metersPerCell)
        / Math.max(1, request.searchRadiusMeters) * 100)
      : 50;
    const cheapScore = cheapScoreForKind(kind, {
      staticPotential,
      directionalFit,
      protection,
      concealment,
      danger,
      routeDanger,
      uncertainty,
      orderAlignment,
    });
    insertRanked(preliminary, {
      cellIndex,
      position: { x: x + 0.5, y: y + 0.5 },
      staticPotential,
      directionalFit,
      posture,
      alternativePostureMask: indexedCandidate.postureMask,
      facingRadians,
      protection,
      concealment,
      danger,
      uncertainty,
      routeDanger,
      routeCost,
      orderAlignment,
      cheapScore,
      dominantSectorMask: indexedCandidate.dominantSectorMask,
    }, limits.preliminaryCandidates);
  }

  const exact: ExactCandidate[] = [];
  let exactRayCount = 0;
  for (const candidate of preliminary.slice(0, limits.exactCandidates)) {
    if (exactRayCount >= limits.exactRayLimit) break;
    const exactEvaluation = evaluateExact(field, request, kind, candidate, limits.exactRayLimit - exactRayCount);
    exactRayCount += exactEvaluation.exactRays;
    if (exactEvaluation.lineQuality < limits.minimumLineQuality) continue;
    if (kind === 'firing' && exactEvaluation.rangeFit <= 0) continue;
    exact.push(exactEvaluation);
  }
  exact.sort((left, right) => right.finalScore - left.finalScore || left.cellIndex - right.cellIndex);

  const minimumSeparationCells = Math.max(0, request.minimumSeparationMeters / Math.max(0.001, field.metersPerCell));
  const selected: ExactCandidate[] = [];
  for (const candidate of exact) {
    if (selected.length >= Math.max(1, request.maxCandidates)) break;
    if (selected.some((other) => Math.hypot(
      other.position.x - candidate.position.x,
      other.position.y - candidate.position.y,
    ) < minimumSeparationCells && directionalSimilarity(other.dominantSectorMask, candidate.dominantSectorMask) >= 0.67)) continue;
    selected.push(candidate);
  }

  return {
    candidates: selected.map((candidate): TacticalPositionCandidateSeedV2 => ({
      id: `${kind}:${candidate.cellIndex}:${candidate.posture}`,
      kind,
      objective: request.objective,
      requestIdentity: request.requestIdentity,
      position: { ...candidate.position },
      source: {
        kind: 'static_basis',
        id: `static:${kind}:${candidate.cellIndex}`,
        label: `${kind} tactical position`,
        labelRu: kindLabelRu(kind),
      },
      metrics: {
        onMap: true,
        routeExists: true,
        distanceMeters: distanceMeters(request.origin, candidate.position, field.metersPerCell),
        blocksThreat: candidate.protection >= 18,
        protection: roundTwo(candidate.protection),
        concealment: roundTwo(candidate.concealment),
        routeDanger: roundTwo(candidate.routeDanger),
        slopeType: readSlopeType(field, candidate.cellIndex),
        orderAlignment: roundTwo(candidate.orderAlignment),
        referenceThreatId: request.referenceThreatId,
        distanceToThreatMeters: request.referenceThreatPosition
          ? roundTwo(distanceMeters(candidate.position, request.referenceThreatPosition, field.metersPerCell))
          : null,
        distanceToOrderTargetMeters: request.orderTarget
          ? roundTwo(distanceMeters(candidate.position, request.orderTarget, field.metersPerCell))
          : null,
        objectiveAlignment: objectiveAlignment(field, request, candidate.position),
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
      },
    })),
    diagnostics: {
      sampledCells: indexed.length,
      routeExpandedCells: route.expandedCells,
      provisionalCandidates: preliminary.length,
      sampleBudgetExhausted: indexed.length > limits.preliminaryCandidates,
      routeBudgetExhausted: route.budgetExhausted,
      indexedCandidates: indexed.length,
      preliminaryCandidates: preliminary.length,
      exactCandidates: exact.length,
      exactRays: exactRayCount,
    } as TacticalPositionSearchDiagnostics,
  };
}

function evaluateExact(
  field: GeneralizedTacticalPositionFieldView,
  request: GeneralizedTacticalPositionSearchRequest,
  kind: TacticalPositionKind,
  candidate: RankedCandidate,
  remainingRayBudget: number,
): ExactCandidate {
  let lineQuality = candidate.directionalFit;
  let rangeFit = 100;
  let protection = candidate.protection;
  let exactRays = 0;
  const map = field.map;
  const point = targetPoint(request.target, request.referenceThreatPosition);

  if (map && point && remainingRayBudget > 0) {
    if (kind === 'observation') {
      const trace = traceVisibilityRay(map, {
        origin: candidate.position,
        target: point,
        originHeightAboveGroundMeters: postureHeight(candidate.posture),
        targetHeightAboveGroundMeters: 1.5,
        channel: 'visual',
      });
      exactRays += 1;
      lineQuality = clampPercent(trace.visualTransmission * 100 * (trace.hardBlocked ? 0.25 : 1));
    } else if (kind === 'firing') {
      const trace = traceVisibilityRayPath(map, {
        origin: candidate.position,
        target: point,
        originHeightAboveGroundMeters: postureHeight(candidate.posture),
        targetHeightAboveGroundMeters: 1.4,
        channel: 'combined',
      });
      exactRays += 1;
      const immediateBlocked = trace.samples.some((sample) => sample.distanceMeters <= 8 && sample.hardBlocked);
      lineQuality = immediateBlocked
        ? 0
        : clampPercent(trace.result.fireTransmission * 100 * (trace.result.hardBlocked ? 0.2 : 1));
      rangeFit = firingRangeFit(request.target, distanceMeters(candidate.position, point, field.metersPerCell));
    } else {
      const trace = traceVisibilityRay(map, {
        origin: point,
        target: candidate.position,
        originHeightAboveGroundMeters: 1.65,
        targetHeightAboveGroundMeters: postureHeight(candidate.posture),
        channel: 'fire',
      });
      exactRays += 1;
      protection = clampPercent((1 - trace.fireTransmission) * 70 + (trace.hardBlocked ? 30 : 0));
      lineQuality = protection;
    }
  }

  const withdrawalQuality = clampPercent(
    100
      - candidate.routeDanger * 0.55
      - candidate.routeCost / Math.max(1, request.searchRadiusMeters) * 8,
  );
  const finalScore = finalScoreForKind(kind, {
    ...candidate,
    protection,
    lineQuality,
    rangeFit,
    withdrawalQuality,
  });
  return {
    ...candidate,
    protection,
    lineQuality,
    rangeFit,
    withdrawalQuality,
    finalScore,
    exactRays,
  };
}

function choosePosture(
  field: GeneralizedTacticalPositionFieldView,
  kind: TacticalPositionKind,
  cellIndex: number,
  postureMask: number,
  currentPosture: UnitPosture,
): UnitPosture | null {
  let best: { posture: UnitPosture; score: number } | null = null;
  for (const posture of POSTURES) {
    if (!postureMaskIncludes(postureMask, posture)) continue;
    const offset = cellIndex * 3 + postureIndex(posture);
    const primary = kind === 'observation'
      ? decodeByte(field.staticBasis.observationByPosture[offset] ?? 0)
      : kind === 'firing'
        ? decodeByte(field.staticBasis.firingByPosture[offset] ?? 0)
        : decodeByte(field.staticBasis.staticProtectionByPosture[offset] ?? 0);
    const danger = decodeAwareness(field.danger[cellIndex] ?? 0) * postureExposure(posture);
    const transitionPenalty = posture === currentPosture ? 0 : posture === 'prone' ? 7 : 3;
    const score = primary - danger * 0.30 - transitionPenalty;
    if (!best || score > best.score || (score === best.score && postureRank(posture) > postureRank(best.posture))) {
      best = { posture, score };
    }
  }
  return best?.posture ?? null;
}

function readDirectionalFit(
  basis: StaticTacticalPositionBasisSnapshot,
  kind: TacticalPositionKind,
  cellIndex: number,
  sector: number,
): number {
  const values = kind === 'observation'
    ? basis.observationByDirection
    : kind === 'defense'
      ? basis.protectionByDirection
      : basis.firingByDirection;
  return readDirection(values, basis, cellIndex, sector);
}

function readDirection(
  values: Uint8Array,
  basis: StaticTacticalPositionBasisSnapshot,
  cellIndex: number,
  sector: number,
): number {
  const safeSector = ((sector % basis.sectorCount) + basis.sectorCount) % basis.sectorCount;
  return decodeByte(values[cellIndex * basis.sectorCount + safeSector] ?? 0);
}

function resolveFacing(
  request: GeneralizedTacticalPositionSearchRequest,
  kind: TacticalPositionKind,
  candidate: GridPosition,
  dominantSectorMask: number,
  sectorCount: number,
): number {
  const point = kind === 'defense' ? request.referenceThreatPosition : targetPoint(request.target, null);
  if (point) return Math.atan2(point.y - candidate.y, point.x - candidate.x);
  if (request.target && 'bearingRadians' in request.target && typeof request.target.bearingRadians === 'number') {
    return request.target.bearingRadians;
  }
  for (let sector = 0; sector < Math.min(sectorCount, 32); sector += 1) {
    if ((dominantSectorMask & (1 << sector)) !== 0) return sector * Math.PI * 2 / sectorCount;
  }
  return 0;
}

function targetPoint(target: TacticalPositionTargetSpec | null, fallback: GridPosition | null): GridPosition | null {
  if (target && 'point' in target && target.point) return target.point;
  return fallback;
}

function firingRangeFit(target: TacticalPositionTargetSpec | null, distance: number): number {
  if (!target || !isFiringTarget(target)) return 100;
  const minimum = Math.max(0, target.minimumRangeMeters ?? 0);
  const effective = Math.max(minimum + 1, target.effectiveRangeMeters ?? target.maximumRangeMeters ?? 300);
  const maximum = Math.max(effective, target.maximumRangeMeters ?? effective * 1.35);
  if (distance < minimum || distance > maximum) return 0;
  if (distance <= effective) return clampPercent(100 - Math.abs(distance - effective * 0.72) / effective * 35);
  return clampPercent(100 - (distance - effective) / Math.max(1, maximum - effective) * 65);
}

function isFiringTarget(target: TacticalPositionTargetSpec): target is TacticalFiringTarget {
  return target.mode === 'known_target'
    || target.mode === 'estimated_position'
    || target.mode === 'area';
}

function cheapScoreForKind(kind: TacticalPositionKind, value: {
  staticPotential: number;
  directionalFit: number;
  protection: number;
  concealment: number;
  danger: number;
  routeDanger: number;
  uncertainty: number;
  orderAlignment: number;
}): number {
  const common = value.staticPotential * 0.28
    + value.directionalFit * 0.20
    + value.concealment * 0.09
    + (100 - value.danger) * 0.12
    + (100 - value.routeDanger) * 0.10
    + value.orderAlignment * 0.07
    - value.uncertainty * 0.08;
  if (kind === 'defense') return common + value.protection * 0.28;
  if (kind === 'firing') return common + value.protection * 0.10 + value.directionalFit * 0.12;
  return common + value.protection * 0.08 + value.concealment * 0.08;
}

function finalScoreForKind(kind: TacticalPositionKind, value: RankedCandidate & {
  lineQuality: number;
  rangeFit: number;
  withdrawalQuality: number;
}): number {
  const common = value.staticPotential * 0.20
    + value.directionalFit * 0.12
    + value.lineQuality * 0.22
    + value.protection * 0.14
    + value.concealment * 0.08
    + (100 - value.danger) * 0.10
    + (100 - value.routeDanger) * 0.06
    + value.orderAlignment * 0.04
    + value.withdrawalQuality * 0.04
    - value.uncertainty * 0.06;
  if (kind === 'firing') return common + value.rangeFit * 0.14;
  if (kind === 'defense') return common + value.protection * 0.12;
  return common + value.concealment * 0.06;
}

function buildRouteField(
  field: TacticalPositionFieldView,
  originX: number,
  originY: number,
  radiusCells: number,
  maximumExpansions: number,
): RouteField {
  const margin = Math.ceil(radiusCells);
  const minX = Math.max(0, originX - margin);
  const minY = Math.max(0, originY - margin);
  const maxX = Math.min(field.width - 1, originX + margin);
  const maxY = Math.min(field.height - 1, originY + margin);
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const count = width * height;
  const cost = new Float64Array(count);
  cost.fill(Number.POSITIVE_INFINITY);
  const dangerSum = new Float64Array(count);
  const steps = new Uint16Array(count);
  const settled = new Uint8Array(count);
  const start = (originY - minY) * width + originX - minX;
  cost[start] = 0;
  const heap: Array<{ index: number; cost: number }> = [{ index: start, cost: 0 }];
  let expandedCells = 0;
  const limit = clampInt(maximumExpansions, 1, 65536);

  while (heap.length > 0 && expandedCells < limit) {
    const current = popHeap(heap)!;
    if (settled[current.index] === 1 || current.cost > cost[current.index]!) continue;
    settled[current.index] = 1;
    expandedCells += 1;
    const localX = current.index % width;
    const localY = Math.floor(current.index / width);
    const x = minX + localX;
    const y = minY + localY;
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (offsetX === 0 && offsetY === 0) continue;
        const nextX = x + offsetX;
        const nextY = y + offsetY;
        if (nextX < minX || nextY < minY || nextX > maxX || nextY > maxY) continue;
        const dx = nextX - originX;
        const dy = nextY - originY;
        if (dx * dx + dy * dy > radiusCells * radiusCells) continue;
        const globalIndex = nextY * field.width + nextX;
        if (field.passable[globalIndex] !== 1) continue;
        if (offsetX !== 0 && offsetY !== 0) {
          if (field.passable[y * field.width + nextX] !== 1 || field.passable[nextY * field.width + x] !== 1) continue;
        }
        const nextLocal = (nextY - minY) * width + nextX - minX;
        if (settled[nextLocal] === 1) continue;
        const movement = Math.max(0.05, finite(field.movementCost[globalIndex], 1));
        const danger = decodeAwareness(field.danger[globalIndex] ?? 0);
        const stepDistance = offsetX !== 0 && offsetY !== 0 ? DIAGONAL_COST : 1;
        const nextCost = current.cost + stepDistance * movement * (1 + danger / 100 * 1.5);
        if (nextCost >= cost[nextLocal]!) continue;
        cost[nextLocal] = nextCost;
        dangerSum[nextLocal] = (dangerSum[current.index] ?? 0) + danger;
        steps[nextLocal] = Math.min(65535, (steps[current.index] ?? 0) + 1);
        pushHeap(heap, { index: nextLocal, cost: nextCost });
      }
    }
  }
  return { minX, minY, width, height, cost, dangerSum, steps, settled, expandedCells, budgetExhausted: heap.length > 0 };
}

function objectiveAlignment(
  field: GeneralizedTacticalPositionFieldView,
  request: GeneralizedTacticalPositionSearchRequest,
  position: GridPosition,
): number {
  if (request.objective === 'continue_order') {
    return request.orderTarget
      ? clampPercent(100 - distanceMeters(position, request.orderTarget, field.metersPerCell) / Math.max(1, request.searchRadiusMeters) * 100)
      : 0;
  }
  if (!request.referenceThreatPosition) return 50;
  const originDistance = distanceMeters(request.origin, request.referenceThreatPosition, field.metersPerCell);
  const candidateDistance = distanceMeters(position, request.referenceThreatPosition, field.metersPerCell);
  const delta = candidateDistance - originDistance;
  if (request.objective === 'advance_to_threat') return clampPercent(50 - delta / Math.max(1, request.searchRadiusMeters) * 100);
  if (request.objective === 'withdraw_from_threat') return clampPercent(50 + delta / Math.max(1, request.searchRadiusMeters) * 100);
  return 50;
}

function readSlopeType(field: GeneralizedTacticalPositionFieldView, cellIndex: number): 'direct' | 'reverse' | 'flat' {
  const reverse = decodeAwareness(field.reverseSlopeQuality[cellIndex] ?? 0);
  const forward = decodeAwareness(field.forwardSlopeRisk[cellIndex] ?? 0);
  if (reverse >= forward + 8 && reverse >= 25) return 'reverse';
  if (forward >= reverse + 8 && forward >= 25) return 'direct';
  return 'flat';
}

function bearingToSector(bearing: number, sectorCount: number): number {
  const normalized = ((bearing % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return Math.round(normalized / (Math.PI * 2) * sectorCount) % sectorCount;
}

function insertRanked(target: RankedCandidate[], value: RankedCandidate, limit: number): void {
  let index = target.length;
  for (let current = 0; current < target.length; current += 1) {
    if (value.cheapScore > target[current]!.cheapScore || (value.cheapScore === target[current]!.cheapScore && value.cellIndex < target[current]!.cellIndex)) {
      index = current;
      break;
    }
  }
  target.splice(index, 0, value);
  if (target.length > limit) target.length = limit;
}

function pushHeap(heap: Array<{ index: number; cost: number }>, node: { index: number; cost: number }): void {
  heap.push(node);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (!heapBefore(heap[index]!, heap[parent]!)) break;
    [heap[index], heap[parent]] = [heap[parent]!, heap[index]!];
    index = parent;
  }
}

function popHeap(heap: Array<{ index: number; cost: number }>): { index: number; cost: number } | undefined {
  if (heap.length === 0) return undefined;
  const root = heap[0]!;
  const last = heap.pop()!;
  if (heap.length === 0) return root;
  heap[0] = last;
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    let smallest = index;
    if (left < heap.length && heapBefore(heap[left]!, heap[smallest]!)) smallest = left;
    if (right < heap.length && heapBefore(heap[right]!, heap[smallest]!)) smallest = right;
    if (smallest === index) break;
    [heap[index], heap[smallest]] = [heap[smallest]!, heap[index]!];
    index = smallest;
  }
  return root;
}

function heapBefore(left: { index: number; cost: number }, right: { index: number; cost: number }): boolean {
  return left.cost < right.cost || (left.cost === right.cost && left.index < right.index);
}

function routeLocalIndex(route: RouteField, x: number, y: number): number {
  const localX = x - route.minX;
  const localY = y - route.minY;
  if (localX < 0 || localY < 0 || localX >= route.width || localY >= route.height) return -1;
  return localY * route.width + localX;
}

function directionalSimilarity(left: number, right: number): number {
  const intersection = bitCount((left & right) >>> 0);
  const union = bitCount((left | right) >>> 0);
  return union === 0 ? 1 : intersection / union;
}

function bitCount(value: number): number {
  let count = 0;
  let next = value >>> 0;
  while (next !== 0) {
    next &= next - 1;
    count += 1;
  }
  return count;
}

function normalizeLimits(input: Partial<GeneralizedTacticalPositionSearchLimits> | undefined): GeneralizedTacticalPositionSearchLimits {
  return {
    preliminaryCandidates: clampInt(input?.preliminaryCandidates ?? DEFAULT_LIMITS.preliminaryCandidates, 8, 128),
    exactCandidates: clampInt(input?.exactCandidates ?? DEFAULT_LIMITS.exactCandidates, 1, 32),
    exactRayLimit: clampInt(input?.exactRayLimit ?? DEFAULT_LIMITS.exactRayLimit, 0, 128),
    maxPositionDanger: clampPercent(input?.maxPositionDanger ?? DEFAULT_LIMITS.maxPositionDanger),
    minimumLineQuality: clampPercent(input?.minimumLineQuality ?? DEFAULT_LIMITS.minimumLineQuality),
    maximumRouteCost: Math.max(1, finite(input?.maximumRouteCost, DEFAULT_LIMITS.maximumRouteCost)),
  };
}

function assertInput(field: GeneralizedTacticalPositionFieldView): void {
  if (field.staticBasis.width !== field.width || field.staticBasis.height !== field.height) {
    throw new Error('Static tactical basis dimensions do not match subjective field.');
  }
}

function postureHeight(posture: UnitPosture): number {
  if (posture === 'standing') return 1.65;
  if (posture === 'crouched') return 1.08;
  return 0.38;
}

function postureExposure(posture: UnitPosture): number {
  if (posture === 'standing') return 1;
  if (posture === 'crouched') return 0.68;
  return 0.34;
}

function postureRank(posture: UnitPosture): number {
  if (posture === 'standing') return 3;
  if (posture === 'crouched') return 2;
  return 1;
}

function postureReason(posture: UnitPosture, kind: TacticalPositionKind): string {
  return `${posture} offers the best ${kind} balance for this cell.`;
}

function postureReasonRu(posture: UnitPosture, kind: TacticalPositionKind): string {
  const postureRu = posture === 'standing' ? 'стоя' : posture === 'crouched' ? 'пригнувшись' : 'лёжа';
  const kindRu = kind === 'observation' ? 'наблюдения' : kind === 'defense' ? 'защиты' : 'ведения огня';
  return `Поза «${postureRu}» даёт лучший баланс ${kindRu} в этой клетке.`;
}

function kindLabelRu(kind: TacticalPositionKind): string {
  if (kind === 'observation') return 'Наблюдательная позиция';
  if (kind === 'defense') return 'Оборонительная позиция';
  return 'Огневая позиция';
}

function distanceMeters(left: GridPosition, right: GridPosition, metersPerCell: number): number {
  return Math.hypot(left.x - right.x, left.y - right.y) * Math.max(0.001, metersPerCell);
}

function decodeByte(value: number): number {
  return clampPercent(value / 255 * 100);
}

function decodeAwareness(value: number): number {
  return clampPercent(value);
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function clampInt(value: number, minimum: number, maximum: number): number {
  const normalized = Number.isFinite(value) ? Math.floor(value) : minimum;
  return Math.max(minimum, Math.min(maximum, normalized));
}

function finite(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? value as number : fallback;
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}
