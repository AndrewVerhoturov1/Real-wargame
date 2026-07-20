import type { TacticalPositionCandidateSeed, TacticalSlopeType } from '../ai/tactical/TacticalQuery';
import type { UnitPosture } from '../behavior/BehaviorModel';
import type { GridPosition } from '../geometry';
import {
  estimatePostureSuppression,
  evaluateTacticalPostures,
  type TacticalPostureEvaluation,
} from './TacticalPostureEvaluation';
import {
  createDefaultTacticalPositionSettings,
  type TacticalPositionSettings,
} from './TacticalPositionSettings';

const DIAGONAL_COST = Math.SQRT2;
const CANDIDATE_POOL_MULTIPLIER = 8;

export interface TacticalPositionFieldView {
  readonly width: number;
  readonly height: number;
  readonly metersPerCell: number;
  readonly passable: Uint8Array;
  readonly movementCost: Float32Array;
  readonly danger: Uint8Array;
  readonly suppression: Uint8Array;
  readonly concealment: Uint8Array;
  readonly safety: Uint8Array;
  readonly expectedProtectionAgainstThreat: Uint8Array;
  readonly uncertainty: Uint8Array;
  readonly reverseSlopeQuality: Uint8Array;
  readonly forwardSlopeRisk: Uint8Array;
  readonly staticProtectionByPosture: Readonly<Record<UnitPosture, Uint8Array>>;
}

export interface TacticalPositionSearchRequest {
  readonly origin: GridPosition;
  readonly currentPosture: UnitPosture;
  readonly orderTarget: GridPosition | null;
  readonly threatCount: number;
  readonly searchRadiusMeters: number;
  readonly maxSampledCells: number;
  readonly maxRouteExpansions: number;
  readonly maxCandidates: number;
  readonly minimumSeparationMeters: number;
  readonly settings?: TacticalPositionSettings;
}

export interface TacticalPositionCandidateMetricsV2 {
  readonly danger: number;
  readonly suppression: number;
  readonly safety: number;
  readonly safetyGain: number;
  readonly uncertainty: number;
  readonly recommendedPosture: UnitPosture;
  readonly routeCost: number;
}

export interface TacticalPositionCandidateSeedV2 extends TacticalPositionCandidateSeed {
  readonly metrics: TacticalPositionCandidateSeed['metrics'] & TacticalPositionCandidateMetricsV2;
}

export interface TacticalPositionSearchDiagnostics {
  readonly sampledCells: number;
  readonly routeExpandedCells: number;
  readonly provisionalCandidates: number;
  readonly sampleBudgetExhausted: boolean;
  readonly routeBudgetExhausted: boolean;
}

export interface TacticalPositionSearchResult {
  readonly candidates: readonly TacticalPositionCandidateSeedV2[];
  readonly diagnostics: TacticalPositionSearchDiagnostics;
}

interface LocalRouteField {
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
  readonly candidate: TacticalPositionCandidateSeedV2;
  readonly score: number;
  readonly cellIndex: number;
}

interface HeapNode {
  readonly index: number;
  readonly cost: number;
}

/**
 * Extracts deterministic position-plus-posture candidates from one prepared
 * subjective field. It is bounded by cell counts and never calls A* per
 * candidate, scans the full map, or reads wall-clock time.
 */
export function searchTacticalPositions(
  field: TacticalPositionFieldView,
  request: TacticalPositionSearchRequest,
): TacticalPositionSearchResult {
  assertFieldShape(field);
  const settings = request.settings ?? createDefaultTacticalPositionSettings();
  const maxCandidates = clampInt(request.maxCandidates, 1, 256);
  const maxSampledCells = clampInt(request.maxSampledCells, 1, 65536);
  const maxRouteExpansions = clampInt(request.maxRouteExpansions, 1, 65536);
  const radiusCells = Math.max(0, request.searchRadiusMeters / Math.max(0.001, field.metersPerCell));
  const originX = clampInt(Math.floor(request.origin.x), 0, field.width - 1);
  const originY = clampInt(Math.floor(request.origin.y), 0, field.height - 1);
  const originIndex = originY * field.width + originX;

  if (request.threatCount <= 0 || field.passable[originIndex] !== 1 || radiusCells < 1) {
    return emptyResult();
  }

  const route = buildLocalRouteField(field, originX, originY, radiusCells, maxRouteExpansions);
  const current = evaluateBestPosture(field, originIndex, request.currentPosture, settings);
  const poolLimit = Math.max(24, maxCandidates * CANDIDATE_POOL_MULTIPLIER);
  const provisional: RankedCandidate[] = [];
  let sampledCells = 0;
  let sampleBudgetExhausted = false;

  outer: for (let ring = 0; ring <= Math.ceil(radiusCells); ring += 1) {
    for (const point of ringCells(originX, originY, ring)) {
      if (sampledCells >= maxSampledCells) {
        sampleBudgetExhausted = true;
        break outer;
      }
      if (!insideMap(field, point.x, point.y)) continue;
      const dx = point.x - originX;
      const dy = point.y - originY;
      if (dx * dx + dy * dy > radiusCells * radiusCells) continue;
      sampledCells += 1;
      if (point.x === originX && point.y === originY) continue;

      const cellIndex = point.y * field.width + point.x;
      if (field.passable[cellIndex] !== 1) continue;
      const routeIndex = localIndex(route, point.x, point.y);
      if (routeIndex < 0 || route.settled[routeIndex] !== 1) continue;

      const posture = evaluateBestPosture(field, cellIndex, request.currentPosture, settings);
      const safetyGain = posture.safety - current.safety;
      const dangerGain = current.danger - posture.danger;
      const protection = posture.protection;
      const concealment = field.concealment[cellIndex] ?? 0;
      const reverseSlope = field.reverseSlopeQuality[cellIndex] ?? 0;
      const forwardSlope = field.forwardSlopeRisk[cellIndex] ?? 0;
      if (
        safetyGain < settings.minimumPositionImprovement
        && dangerGain < settings.minimumPositionImprovement
        && protection < settings.minimumDirectionalProtection
        && reverseSlope < settings.minimumReverseSlopeQuality
      ) continue;

      const routeSteps = Math.max(1, route.steps[routeIndex] ?? 0);
      const routeDanger = clampPercent((route.dangerSum[routeIndex] ?? 0) / routeSteps);
      const distanceMeters = Math.hypot(dx, dy) * field.metersPerCell;
      const slopeType = classifySlope(reverseSlope, forwardSlope, settings.minimumReverseSlopeQuality);
      const orderAlignment = request.orderTarget
        ? clampPercent(100 - distanceBetweenCellAndPoint(point.x, point.y, request.orderTarget)
          * field.metersPerCell / Math.max(1, request.searchRadiusMeters) * 100)
        : 50;
      const source = sourceForCell(protection, concealment, reverseSlope);
      const candidate: TacticalPositionCandidateSeedV2 = {
        id: `tactical:${point.x}:${point.y}:${posture.posture}`,
        position: { x: point.x + 0.5, y: point.y + 0.5 },
        source: {
          kind: 'terrain',
          id: `field:${point.x}:${point.y}`,
          label: source.label,
          labelRu: source.labelRu,
        },
        metrics: {
          onMap: true,
          routeExists: true,
          distanceMeters,
          blocksThreat: protection >= settings.minimumDirectionalProtection || posture.danger <= 5,
          protection,
          concealment,
          routeDanger,
          slopeType,
          orderAlignment,
          danger: posture.danger,
          suppression: estimateSuppression(field, cellIndex, posture, request.currentPosture),
          safety: posture.safety,
          safetyGain,
          uncertainty: field.uncertainty[cellIndex] ?? 0,
          recommendedPosture: posture.posture,
          routeCost: roundTwo(route.cost[routeIndex] ?? Number.POSITIVE_INFINITY),
        },
      };
      insertRankedCandidate(provisional, {
        candidate,
        score: candidatePreselectionScore(candidate, current.danger, reverseSlope, forwardSlope, settings),
        cellIndex,
      }, poolLimit);
    }
  }

  const minimumSeparationCells = Math.max(
    1,
    request.minimumSeparationMeters / Math.max(0.001, field.metersPerCell),
  );
  const candidates: TacticalPositionCandidateSeedV2[] = [];
  for (const ranked of provisional) {
    if (candidates.length >= maxCandidates) break;
    if (candidates.some((existing) => Math.hypot(
      existing.position.x - ranked.candidate.position.x,
      existing.position.y - ranked.candidate.position.y,
    ) < minimumSeparationCells)) continue;
    candidates.push(ranked.candidate);
  }

  return {
    candidates,
    diagnostics: {
      sampledCells,
      routeExpandedCells: route.expandedCells,
      provisionalCandidates: provisional.length,
      sampleBudgetExhausted,
      routeBudgetExhausted: route.budgetExhausted,
    },
  };
}

function buildLocalRouteField(
  field: TacticalPositionFieldView,
  originX: number,
  originY: number,
  radiusCells: number,
  maximumExpansions: number,
): LocalRouteField {
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
  const heap: HeapNode[] = [{ index: start, cost: 0 }];
  let expandedCells = 0;

  while (heap.length > 0 && expandedCells < maximumExpansions) {
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
          const sideA = y * field.width + nextX;
          const sideB = nextY * field.width + x;
          if (field.passable[sideA] !== 1 || field.passable[sideB] !== 1) continue;
        }

        const nextLocalIndex = (nextY - minY) * width + nextX - minX;
        if (settled[nextLocalIndex] === 1) continue;
        const movement = Math.max(0.05, finite(field.movementCost[globalIndex], 1));
        const danger = clampPercent(field.danger[globalIndex] ?? 0);
        const stepDistance = offsetX !== 0 && offsetY !== 0 ? DIAGONAL_COST : 1;
        const nextCost = current.cost + stepDistance * movement * (1 + danger / 100 * 1.5);
        if (nextCost >= cost[nextLocalIndex]!) continue;
        cost[nextLocalIndex] = nextCost;
        dangerSum[nextLocalIndex] = (dangerSum[current.index] ?? 0) + danger;
        steps[nextLocalIndex] = Math.min(65535, (steps[current.index] ?? 0) + 1);
        pushHeap(heap, { index: nextLocalIndex, cost: nextCost });
      }
    }
  }

  return {
    minX,
    minY,
    width,
    height,
    cost,
    dangerSum,
    steps,
    settled,
    expandedCells,
    budgetExhausted: heap.length > 0,
  };
}

function evaluateBestPosture(
  field: TacticalPositionFieldView,
  cellIndex: number,
  currentPosture: UnitPosture,
  settings: TacticalPositionSettings,
): TacticalPostureEvaluation {
  return evaluateTacticalPostures({
    danger: field.danger[cellIndex] ?? 0,
    protection: field.expectedProtectionAgainstThreat[cellIndex] ?? 0,
    safety: field.safety[cellIndex] ?? 0,
    staticProtectionByPosture: {
      standing: field.staticProtectionByPosture.standing[cellIndex] ?? 0,
      crouched: field.staticProtectionByPosture.crouched[cellIndex] ?? 0,
      prone: field.staticProtectionByPosture.prone[cellIndex] ?? 0,
    },
  }, currentPosture, settings).recommended;
}

function estimateSuppression(
  field: TacticalPositionFieldView,
  cellIndex: number,
  posture: TacticalPostureEvaluation,
  currentPosture: UnitPosture,
): number {
  return estimatePostureSuppression(
    clampPercent(field.suppression[cellIndex] ?? 0),
    posture,
    currentPosture,
  );
}

function candidatePreselectionScore(
  candidate: TacticalPositionCandidateSeedV2,
  currentDanger: number,
  reverseSlope: number,
  forwardSlope: number,
  settings: TacticalPositionSettings,
): number {
  const metrics = candidate.metrics;
  return roundTwo(
    metrics.safety * settings.safetyWeight
      + (100 - metrics.danger) * settings.lowDangerWeight
      + metrics.protection * settings.protectionWeight
      + metrics.concealment * settings.concealmentWeight
      + Math.max(0, currentDanger - metrics.danger) * settings.safetyGainWeight
      + reverseSlope * settings.reverseSlopeWeight
      + (100 - metrics.routeDanger) * settings.routeSafetyWeight
      + metrics.orderAlignment * settings.orderAlignmentWeight
      - metrics.uncertainty * settings.uncertaintyPenaltyWeight
      - forwardSlope * settings.forwardSlopePenaltyWeight,
  );
}

function insertRankedCandidate(
  target: RankedCandidate[],
  candidate: RankedCandidate,
  limit: number,
): void {
  let insertAt = target.length;
  for (let index = 0; index < target.length; index += 1) {
    const current = target[index]!;
    if (candidate.score > current.score || (candidate.score === current.score && candidate.cellIndex < current.cellIndex)) {
      insertAt = index;
      break;
    }
  }
  target.splice(insertAt, 0, candidate);
  if (target.length > limit) target.length = limit;
}

function sourceForCell(
  protection: number,
  concealment: number,
  reverseSlope: number,
): { label: string; labelRu: string } {
  if (reverseSlope >= 45) return { label: 'Reverse-slope position', labelRu: 'Позиция на обратном склоне' };
  if (protection >= 45) return { label: 'Threat-protected position', labelRu: 'Позиция, защищённая от угрозы' };
  if (concealment >= 50) return { label: 'Concealed tactical position', labelRu: 'Скрытая тактическая позиция' };
  return { label: 'Safer tactical position', labelRu: 'Более безопасная тактическая позиция' };
}

function classifySlope(reverseSlope: number, forwardSlope: number, threshold: number): TacticalSlopeType {
  if (reverseSlope >= Math.max(threshold, forwardSlope + 8)) return 'reverse';
  if (forwardSlope >= Math.max(threshold, reverseSlope + 8)) return 'direct';
  return 'flat';
}

function* ringCells(originX: number, originY: number, ring: number): Generator<{ x: number; y: number }> {
  if (ring === 0) {
    yield { x: originX, y: originY };
    return;
  }
  const minX = originX - ring;
  const maxX = originX + ring;
  const minY = originY - ring;
  const maxY = originY + ring;
  for (let x = minX; x <= maxX; x += 1) yield { x, y: minY };
  for (let y = minY + 1; y <= maxY; y += 1) yield { x: maxX, y };
  for (let x = maxX - 1; x >= minX; x -= 1) yield { x, y: maxY };
  for (let y = maxY - 1; y > minY; y -= 1) yield { x: minX, y };
}

function pushHeap(heap: HeapNode[], node: HeapNode): void {
  heap.push(node);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (!heapComesBefore(heap[index]!, heap[parent]!)) break;
    [heap[index], heap[parent]] = [heap[parent]!, heap[index]!];
    index = parent;
  }
}

function popHeap(heap: HeapNode[]): HeapNode | undefined {
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
    if (left < heap.length && heapComesBefore(heap[left]!, heap[smallest]!)) smallest = left;
    if (right < heap.length && heapComesBefore(heap[right]!, heap[smallest]!)) smallest = right;
    if (smallest === index) break;
    [heap[index], heap[smallest]] = [heap[smallest]!, heap[index]!];
    index = smallest;
  }
  return root;
}

function heapComesBefore(left: HeapNode, right: HeapNode): boolean {
  return left.cost < right.cost || (left.cost === right.cost && left.index < right.index);
}

function localIndex(route: LocalRouteField, x: number, y: number): number {
  const localX = x - route.minX;
  const localY = y - route.minY;
  if (localX < 0 || localY < 0 || localX >= route.width || localY >= route.height) return -1;
  return localY * route.width + localX;
}

function distanceBetweenCellAndPoint(x: number, y: number, point: GridPosition): number {
  return Math.hypot(x + 0.5 - point.x, y + 0.5 - point.y);
}

function insideMap(field: Pick<TacticalPositionFieldView, 'width' | 'height'>, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < field.width && y < field.height;
}

function assertFieldShape(field: TacticalPositionFieldView): void {
  const expected = field.width * field.height;
  if (field.width <= 0 || field.height <= 0 || !Number.isFinite(field.metersPerCell) || field.metersPerCell <= 0) {
    throw new Error('Tactical position field dimensions are invalid.');
  }
  const arrays: readonly ArrayLike<number>[] = [
    field.passable,
    field.movementCost,
    field.danger,
    field.suppression,
    field.concealment,
    field.safety,
    field.expectedProtectionAgainstThreat,
    field.uncertainty,
    field.reverseSlopeQuality,
    field.forwardSlopeRisk,
    field.staticProtectionByPosture.standing,
    field.staticProtectionByPosture.crouched,
    field.staticProtectionByPosture.prone,
  ];
  if (arrays.some((value) => value.length !== expected)) {
    throw new Error(`Tactical position field array length mismatch; expected ${expected}.`);
  }
}

function emptyResult(): TacticalPositionSearchResult {
  return {
    candidates: [],
    diagnostics: {
      sampledCells: 0,
      routeExpandedCells: 0,
      provisionalCandidates: 0,
      sampleBudgetExhausted: false,
      routeBudgetExhausted: false,
    },
  };
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, roundTwo(finite(value, 0))));
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
