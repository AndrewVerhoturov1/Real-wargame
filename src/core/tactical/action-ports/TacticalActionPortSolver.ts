import type { UnitPosture } from '../../behavior/BehaviorModel';
import {
  createBallisticLineProbeContext,
  probeBallisticLine,
  type BallisticLineProbeRequest,
  type BallisticLineProbeResult,
} from '../../combat/BallisticLineProbe';
import { getShoulderedRifleMuzzleHeightMetres } from '../../combat/DirectFireSolution';
import type { GridPosition } from '../../geometry';
import type { EnvironmentMaterialProfile } from '../../map/EnvironmentMaterialProfile';
import {
  circleIntersectsMapObject,
} from '../../map/MapObjectGeometry';
import type { MapObject, TacticalMap } from '../../map/MapModel';
import {
  evaluateNavigationPosition,
  isMapObjectMovementBlocking,
} from '../../pathfinding/GridNavigation';
import { getMapObjectSpatialIndex } from '../../spatial/MapObjectSpatialIndex';
import { sampleSmoothHeightLevel } from '../../terrain/SmoothTerrain';
import { soldierPostureHeightMeters } from '../../visibility/VisibilityPosture';
import {
  traceVisibilityRay,
  type VisibilityTraceRequest,
  type VisibilityTraceResult,
} from '../../visibility/VisibilityRayKernel';
import {
  assertStaticTacticalPositionBasisShape,
  normalizeSector,
  postureMaskIncludes,
  readStaticTacticalDirectionalValue,
  readStaticTacticalPostureValue,
  type StaticTacticalPositionBasisSnapshot,
} from '../static/StaticTacticalPositionBasis';

const POSTURES: readonly UnitPosture[] = ['standing', 'crouched', 'prone'];
const DIAGONAL_DISTANCE = Math.SQRT2;
const HEIGHT_LEVEL_METRES = 2;
const POSITION_EPSILON = 1e-7;
const MAX_LOCAL_ROUTE_EXTENT = 64;

export type TacticalActionPortPurpose = 'observation' | 'firing';

export interface TacticalActionPortObservationTask {
  readonly purpose: 'observation';
  readonly directionRadians: number;
  readonly probePoint?: GridPosition;
  readonly probeDistanceMeters: number;
  readonly targetHeightAboveGroundMeters: number;
}

export interface TacticalActionPortFiringTarget {
  readonly position: GridPosition;
  readonly heightAboveGroundMeters: number;
  readonly maximumDistanceMeters: number;
}

export interface TacticalActionPortFiringTask {
  readonly purpose: 'firing';
  readonly directionRadians: number;
  readonly target: TacticalActionPortFiringTarget;
}

export type TacticalActionPortTask = TacticalActionPortObservationTask | TacticalActionPortFiringTask;

export interface TacticalActionPortMovementSettings {
  readonly nodeSpacingMeters: number;
  readonly maximumStepHeightLevels: number;
  readonly allowDiagonal: boolean;
}

export interface TacticalActionPortProbeContext {
  readonly probeVisibility: (request: VisibilityTraceRequest) => VisibilityTraceResult;
  readonly probeBallistic: (request: BallisticLineProbeRequest) => BallisticLineProbeResult;
}

export interface TacticalActionPortSolverRequest {
  readonly map: TacticalMap;
  readonly environmentProfile: EnvironmentMaterialProfile;
  readonly basis: StaticTacticalPositionBasisSnapshot;
  readonly anchor: GridPosition;
  readonly currentPosture: UnitPosture;
  readonly currentFacingRadians: number;
  readonly allowedPostures: readonly UnitPosture[];
  readonly task: TacticalActionPortTask;
  readonly searchRadiusMeters: number;
  readonly soldierRadiusMeters: number;
  readonly movement: TacticalActionPortMovementSettings;
  readonly maxCandidates: number;
  readonly maxRouteExpansions: number;
  readonly maxVisibilityProbes: number;
  readonly maxBallisticProbes: number;
  readonly probes: TacticalActionPortProbeContext;
}

export type TacticalActionPortRejectionReason =
  | 'outside_map'
  | 'inside_object'
  | 'navigation_blocked'
  | 'route_unreachable'
  | 'posture_forbidden'
  | 'visibility_blocked'
  | 'ballistic_blocked'
  | 'visibility_budget_exhausted'
  | 'ballistic_budget_exhausted'
  | 'invalid_target';

export interface TacticalActionPortCandidateMetrics {
  readonly requiredTurnRadians: number;
  readonly localDistanceMeters: number;
  readonly localRouteCost: number;
  readonly reachable: boolean;
  readonly returnAvailable: boolean;
  readonly lineClear: boolean;
  readonly lineQuality: number;
  readonly minimumLineClearanceMeters: number | null;
  readonly lineBlocker: string | null;
  readonly observationQuality: number | null;
  readonly staticDirectionQuality: number;
  readonly staticPostureQuality: number;
  readonly taskQuality: number;
  readonly staticProtection: number;
  readonly exposure: number;
  readonly leavesCover: boolean;
  readonly observedSector: number;
  readonly physicalScore: number;
  readonly visibilityProbesUsed: number;
  readonly ballisticProbesUsed: number;
}

export interface TacticalActionPortCandidate {
  readonly id: string;
  readonly purpose: TacticalActionPortPurpose;
  readonly position: GridPosition;
  readonly recommendedPosture: UnitPosture;
  readonly admissible: boolean;
  readonly rejectionReasons: readonly TacticalActionPortRejectionReason[];
  readonly metrics: TacticalActionPortCandidateMetrics;
}

export interface TacticalActionPortSolverDiagnostics {
  readonly candidatePositionsGenerated: number;
  readonly generatedCandidates: number;
  readonly rejectedByGeometry: number;
  readonly rejectedByNavigation: number;
  readonly rejectedByPosture: number;
  readonly rejectedByLine: number;
  readonly visibilityProbes: number;
  readonly ballisticProbes: number;
  readonly routeExpansions: number;
  readonly routeFieldBuilds: 1;
  readonly routeExtent: number;
  readonly routeFieldNodesAllocated: number;
  readonly routeBudgetExhausted: boolean;
  readonly visibilityBudgetExhausted: boolean;
  readonly ballisticBudgetExhausted: boolean;
  readonly objectsFromSpatialIndex: number;
  readonly navigationPositionChecks: number;
  readonly fullMapScans: 0;
  readonly acceptedCandidatesBeforeLimit: number;
  readonly acceptedCandidatesOmitted: number;
  readonly finalCandidates: number;
}

export interface TacticalActionPortSolverResult {
  readonly anchor: GridPosition;
  readonly purpose: TacticalActionPortPurpose;
  readonly candidates: readonly TacticalActionPortCandidate[];
  readonly best: TacticalActionPortCandidate | null;
  readonly rejected: readonly TacticalActionPortCandidate[];
  readonly diagnostics: TacticalActionPortSolverDiagnostics;
}

interface RouteField {
  readonly extent: number;
  readonly side: number;
  readonly spacingCells: number;
  readonly costs: Float64Array;
  readonly settled: Uint8Array;
  readonly passability: Uint8Array;
  readonly expanded: number;
  readonly budgetExhausted: boolean;
  readonly navigationPositionChecks: number;
}

interface CandidateNode {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly position: GridPosition;
  readonly distanceCells: number;
  readonly angularDeviation: number;
}

interface HeapNode {
  readonly index: number;
  readonly cost: number;
}

/**
 * Creates explicit probe functions bound to the canonical read-only kernels.
 * Dynamic units are deliberately absent from the ballistic context.
 */
export function createTacticalActionPortProbeContext(map: TacticalMap): TacticalActionPortProbeContext {
  const ballisticContext = createBallisticLineProbeContext({ map, units: [] });
  return Object.freeze({
    probeVisibility: (request: VisibilityTraceRequest) => traceVisibilityRay(map, request),
    probeBallistic: (request: BallisticLineProbeRequest) => probeBallisticLine(ballisticContext, request),
  });
}

/** Pure deterministic local solver. It returns data and never changes map, unit or combat state. */
export function solveTacticalActionPorts(
  request: TacticalActionPortSolverRequest,
): TacticalActionPortSolverResult {
  assertRequest(request);
  assertStaticTacticalPositionBasisShape(request.basis);
  assertBasisMatchesMap(request.map, request.basis);

  const allowedPostures = normalizeAllowedPostures(request.allowedPostures);
  const maxCandidates = clampInt(request.maxCandidates, 1, 256);
  const maxRouteExpansions = clampInt(request.maxRouteExpansions, 1, 65536);
  const maxVisibilityProbes = clampInt(request.maxVisibilityProbes, 0, 4096);
  const maxBallisticProbes = clampInt(request.maxBallisticProbes, 0, 4096);
  const searchRadiusCells = request.searchRadiusMeters / request.map.metersPerCell;
  const soldierRadiusCells = request.soldierRadiusMeters / request.map.metersPerCell;
  const spacingCells = clamp(
    request.movement.nodeSpacingMeters / request.map.metersPerCell,
    Math.max(0.125, soldierRadiusCells),
    Math.max(0.125, searchRadiusCells),
  );
  const routeBounds = resolveLocalRouteBounds(searchRadiusCells, spacingCells, maxRouteExpansions);
  const boundedSearchRadiusCells = Math.min(searchRadiusCells, routeBounds.extent * spacingCells);
  const nearbyObjects = [...getMapObjectSpatialIndex(request.map).queryCircle(
    request.anchor,
    boundedSearchRadiusCells + soldierRadiusCells + spacingCells,
  )].sort(compareObjectsStable);
  const route = buildLocalRouteField(
    request,
    nearbyObjects,
    searchRadiusCells,
    soldierRadiusCells,
    spacingCells,
    maxRouteExpansions,
    routeBounds,
  );
  const candidateNodes = generateCandidateNodes(
    request.anchor,
    request.task.directionRadians,
    route.extent,
    spacingCells,
    searchRadiusCells,
    maxCandidates,
  );
  const sector = directionSector(request.task.directionRadians, request.basis.sectorCount);
  const anchorCellIndex = cellIndexAt(request.map, request.anchor);
  const anchorProtection = anchorCellIndex >= 0
    ? readProtection(request.basis, anchorCellIndex, sector, request.currentPosture)
    : 0;

  const accepted: TacticalActionPortCandidate[] = [];
  const rejected: TacticalActionPortCandidate[] = [];
  let generatedCandidates = 0;
  let rejectedByGeometry = 0;
  let rejectedByNavigation = 0;
  let rejectedByPosture = 0;
  let rejectedByLine = 0;
  let visibilityProbes = 0;
  let ballisticProbes = 0;
  let visibilityBudgetExhausted = false;
  let ballisticBudgetExhausted = false;

  for (const node of candidateNodes) {
    const baseReasons: TacticalActionPortRejectionReason[] = [];
    if (!insideMapWithRadius(request.map, node.position, soldierRadiusCells)) {
      baseReasons.push('outside_map');
      rejectedByGeometry += 1;
    } else if (nearbyObjects.some((object) => (
      isMapObjectMovementBlocking(object.kind)
      && circleIntersectsMapObject(object, node.position, soldierRadiusCells)
    ))) {
      baseReasons.push('inside_object');
      rejectedByGeometry += 1;
    }
    const routeIndex = localNodeIndex(route, node.offsetX, node.offsetY);
    const routeReachable = routeIndex >= 0 && route.settled[routeIndex] === 1;
    const routePassability = routeIndex >= 0 ? route.passability[routeIndex] ?? 0 : 0;
    if (baseReasons.length === 0 && routePassability === 2) {
      baseReasons.push('navigation_blocked');
      rejectedByNavigation += 1;
    } else if (baseReasons.length === 0 && !routeReachable) {
      baseReasons.push('route_unreachable');
      rejectedByNavigation += 1;
    }

    const cellIndex = cellIndexAt(request.map, node.position);
    const availableMask = cellIndex >= 0 ? request.basis.availablePostureMask[cellIndex] ?? 0 : 0;
    for (const posture of allowedPostures) {
      generatedCandidates += 1;
      const reasons = [...baseReasons];
      if (!postureMaskIncludes(availableMask, posture)) {
        reasons.push('posture_forbidden');
        rejectedByPosture += 1;
      }
      const evaluation = reasons.length === 0
        ? evaluateLine(request, node.position, posture, {
            visibilityProbes,
            ballisticProbes,
            maxVisibilityProbes,
            maxBallisticProbes,
          })
        : null;
      if (evaluation?.visibilityProbesUsed) visibilityProbes += evaluation.visibilityProbesUsed;
      if (evaluation?.ballisticProbesUsed) ballisticProbes += evaluation.ballisticProbesUsed;
      if (evaluation?.reason) {
        reasons.push(evaluation.reason);
        if (evaluation.reason === 'visibility_budget_exhausted') visibilityBudgetExhausted = true;
        else if (evaluation.reason === 'ballistic_budget_exhausted') ballisticBudgetExhausted = true;
        else rejectedByLine += 1;
      }
      const candidate = createCandidate(
        request,
        node,
        posture,
        cellIndex,
        sector,
        anchorProtection,
        routeIndex >= 0 ? route.costs[routeIndex] ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY,
        routeReachable,
        reasons,
        evaluation,
      );
      if (candidate.admissible) accepted.push(candidate);
      else rejected.push(candidate);
    }
  }

  accepted.sort(compareCandidates);
  rejected.sort(compareRejectedCandidates);
  const candidates = Object.freeze(accepted.slice(0, maxCandidates));
  return Object.freeze({
    anchor: Object.freeze({ ...request.anchor }),
    purpose: request.task.purpose,
    candidates,
    best: candidates[0] ?? null,
    rejected: Object.freeze(rejected),
    diagnostics: Object.freeze({
      candidatePositionsGenerated: candidateNodes.length,
      generatedCandidates,
      rejectedByGeometry,
      rejectedByNavigation,
      rejectedByPosture,
      rejectedByLine,
      visibilityProbes,
      ballisticProbes,
      routeExpansions: route.expanded,
      routeFieldBuilds: 1,
      routeExtent: route.extent,
      routeFieldNodesAllocated: route.side * route.side,
      routeBudgetExhausted: route.budgetExhausted,
      visibilityBudgetExhausted,
      ballisticBudgetExhausted,
      objectsFromSpatialIndex: nearbyObjects.length,
      navigationPositionChecks: route.navigationPositionChecks,
      fullMapScans: 0,
      acceptedCandidatesBeforeLimit: accepted.length,
      acceptedCandidatesOmitted: Math.max(0, accepted.length - candidates.length),
      finalCandidates: candidates.length,
    }),
  });
}

function buildLocalRouteField(
  request: TacticalActionPortSolverRequest,
  nearbyObjects: readonly MapObject[],
  searchRadiusCells: number,
  soldierRadiusCells: number,
  spacingCells: number,
  maximumExpansions: number,
  bounds: LocalRouteBounds,
): RouteField {
  const { extent, extentClamped } = bounds;
  const side = extent * 2 + 1;
  const count = side * side;
  const costs = new Float64Array(count);
  costs.fill(Number.POSITIVE_INFINITY);
  const settled = new Uint8Array(count);
  const passability = new Uint8Array(count);
  const movementCost = new Float64Array(count);
  const heap: HeapNode[] = [];
  const start = extent * side + extent;
  let navigationPositionChecks = 0;

  const evaluateNode = (offsetX: number, offsetY: number): boolean => {
    const index = (offsetY + extent) * side + offsetX + extent;
    if (passability[index] !== 0) return passability[index] === 1;
    const position = {
      x: request.anchor.x + offsetX * spacingCells,
      y: request.anchor.y + offsetY * spacingCells,
    };
    if (Math.hypot(offsetX * spacingCells, offsetY * spacingCells) > searchRadiusCells + POSITION_EPSILON
      || !insideMapWithRadius(request.map, position, soldierRadiusCells)) {
      passability[index] = 2;
      return false;
    }
    navigationPositionChecks += 1;
    const evaluation = evaluateNavigationPosition(
      request.map,
      position,
      soldierRadiusCells,
      nearbyObjects,
      request.environmentProfile,
    );
    passability[index] = evaluation.passable ? 1 : 2;
    movementCost[index] = evaluation.movementCost;
    return evaluation.passable;
  };

  if (evaluateNode(0, 0)) {
    costs[start] = 0;
    heap.push({ index: start, cost: 0 });
  }
  let expanded = 0;
  while (heap.length > 0 && expanded < maximumExpansions) {
    const current = popHeap(heap)!;
    if (settled[current.index] === 1 || current.cost !== costs[current.index]) continue;
    settled[current.index] = 1;
    expanded += 1;
    const localX = current.index % side;
    const localY = Math.floor(current.index / side);
    const offsetX = localX - extent;
    const offsetY = localY - extent;
    const currentPosition = {
      x: request.anchor.x + offsetX * spacingCells,
      y: request.anchor.y + offsetY * spacingCells,
    };
    const currentCell = cellIndexAt(request.map, currentPosition);

    for (let stepY = -1; stepY <= 1; stepY += 1) {
      for (let stepX = -1; stepX <= 1; stepX += 1) {
        if (stepX === 0 && stepY === 0) continue;
        if (!request.movement.allowDiagonal && stepX !== 0 && stepY !== 0) continue;
        const nextX = offsetX + stepX;
        const nextY = offsetY + stepY;
        if (Math.abs(nextX) > extent || Math.abs(nextY) > extent || !evaluateNode(nextX, nextY)) continue;
        if (stepX !== 0 && stepY !== 0) {
          if (!evaluateNode(offsetX + stepX, offsetY) || !evaluateNode(offsetX, offsetY + stepY)) continue;
          const midpoint = {
            x: request.anchor.x + (offsetX + stepX * 0.5) * spacingCells,
            y: request.anchor.y + (offsetY + stepY * 0.5) * spacingCells,
          };
          navigationPositionChecks += 1;
          if (!evaluateNavigationPosition(
            request.map,
            midpoint,
            soldierRadiusCells,
            nearbyObjects,
            request.environmentProfile,
          ).passable) continue;
        }
        const nextIndex = (nextY + extent) * side + nextX + extent;
        if (settled[nextIndex] === 1) continue;
        const nextPosition = {
          x: request.anchor.x + nextX * spacingCells,
          y: request.anchor.y + nextY * spacingCells,
        };
        const nextCell = cellIndexAt(request.map, nextPosition);
        if (!heightStepAllowed(
          request.map,
          currentCell,
          nextCell,
          request.movement.maximumStepHeightLevels,
        )) continue;
        const distanceCells = stepX !== 0 && stepY !== 0 ? spacingCells * DIAGONAL_DISTANCE : spacingCells;
        const averageMovement = (movementCost[current.index] + movementCost[nextIndex]) * 0.5;
        const nextCost = current.cost + distanceCells * request.map.metersPerCell * averageMovement;
        if (nextCost >= costs[nextIndex]) continue;
        costs[nextIndex] = nextCost;
        pushHeap(heap, { index: nextIndex, cost: nextCost });
      }
    }
  }
  return {
    extent,
    side,
    spacingCells,
    costs,
    settled,
    passability,
    expanded,
    budgetExhausted: extentClamped || heap.length > 0,
    navigationPositionChecks,
  };
}

interface LocalRouteBounds {
  readonly extent: number;
  readonly extentClamped: boolean;
}

function resolveLocalRouteBounds(
  searchRadiusCells: number,
  spacingCells: number,
  maximumExpansions: number,
): LocalRouteBounds {
  const requestedExtent = Math.max(0, Math.ceil(searchRadiusCells / spacingCells));
  const maximumNodesFromBudget = Math.max(9, maximumExpansions * 4);
  const budgetExtent = Math.max(1, Math.floor((Math.sqrt(maximumNodesFromBudget) - 1) / 2));
  const extent = Math.min(requestedExtent, budgetExtent, MAX_LOCAL_ROUTE_EXTENT);
  return { extent, extentClamped: extent < requestedExtent };
}

function generateCandidateNodes(
  anchor: GridPosition,
  directionRadians: number,
  extent: number,
  spacingCells: number,
  searchRadiusCells: number,
  maximum: number,
): CandidateNode[] {
  const nodes: CandidateNode[] = [];
  for (let offsetY = -extent; offsetY <= extent; offsetY += 1) {
    for (let offsetX = -extent; offsetX <= extent; offsetX += 1) {
      const distanceCells = Math.hypot(offsetX * spacingCells, offsetY * spacingCells);
      if (distanceCells > searchRadiusCells + POSITION_EPSILON) continue;
      const bearing = distanceCells <= POSITION_EPSILON ? directionRadians : Math.atan2(offsetY, offsetX);
      nodes.push({
        offsetX,
        offsetY,
        position: Object.freeze({
          x: roundSix(anchor.x + offsetX * spacingCells),
          y: roundSix(anchor.y + offsetY * spacingCells),
        }),
        distanceCells,
        angularDeviation: absoluteAngleDelta(bearing, directionRadians),
      });
    }
  }
  nodes.sort((left, right) => (
    compareNumber(left.distanceCells, right.distanceCells)
    || compareNumber(left.angularDeviation, right.angularDeviation)
    || left.offsetY - right.offsetY
    || left.offsetX - right.offsetX
  ));
  return nodes.slice(0, maximum);
}

function evaluateLine(
  request: TacticalActionPortSolverRequest,
  position: GridPosition,
  posture: UnitPosture,
  budgets: {
    readonly visibilityProbes: number;
    readonly ballisticProbes: number;
    readonly maxVisibilityProbes: number;
    readonly maxBallisticProbes: number;
  },
): {
  readonly clear: boolean;
  readonly lineQuality: number;
  readonly clearanceMeters: number | null;
  readonly blocker: string | null;
  readonly observationQuality: number | null;
  readonly reason: TacticalActionPortRejectionReason | null;
  readonly visibilityProbesUsed: number;
  readonly ballisticProbesUsed: number;
} {
  if (request.task.purpose === 'observation') {
    if (budgets.visibilityProbes >= budgets.maxVisibilityProbes) {
      return emptyLineEvaluation('visibility_budget_exhausted');
    }
    const target = observationProbePoint(request.map, position, request.task);
    const trace = request.probes.probeVisibility({
      origin: position,
      target,
      originHeightAboveGroundMeters: soldierPostureHeightMeters(posture),
      targetHeightAboveGroundMeters: request.task.targetHeightAboveGroundMeters,
      channel: 'visual',
    });
    const clear = !trace.hardBlocked;
    const quality = clear ? clampPercent(trace.visualTransmission * 100) : 0;
    return {
      clear,
      lineQuality: quality,
      clearanceMeters: null,
      blocker: clear ? null : trace.blockerKind,
      observationQuality: quality,
      reason: clear ? null : 'visibility_blocked',
      visibilityProbesUsed: 1,
      ballisticProbesUsed: 0,
    };
  }
  if (!validFiringTarget(request.map, request.task.target)) return emptyLineEvaluation('invalid_target');
  if (budgets.ballisticProbes >= budgets.maxBallisticProbes) {
    return emptyLineEvaluation('ballistic_budget_exhausted');
  }
  const target = request.task.target;
  const ground = sampleSmoothHeightLevel(request.map, position.x, position.y) * HEIGHT_LEVEL_METRES;
  const targetGround = sampleSmoothHeightLevel(request.map, target.position.x, target.position.y) * HEIGHT_LEVEL_METRES;
  const line = request.probes.probeBallistic({
    origin: {
      xMetres: position.x * request.map.metersPerCell,
      yMetres: position.y * request.map.metersPerCell,
      zMetres: ground + getShoulderedRifleMuzzleHeightMetres(posture),
    },
    target: {
      xMetres: target.position.x * request.map.metersPerCell,
      yMetres: target.position.y * request.map.metersPerCell,
      zMetres: targetGround + target.heightAboveGroundMeters,
    },
    maximumDistanceMetres: target.maximumDistanceMeters,
  });
  const quality = line.clear
    ? line.clearanceMetres === null
      ? 100
      : clampPercent(50 + line.clearanceMetres * 25)
    : 0;
  return {
    clear: line.clear,
    lineQuality: quality,
    clearanceMeters: line.clearanceMetres,
    blocker: line.blockedBy,
    observationQuality: null,
    reason: line.clear ? null : 'ballistic_blocked',
    visibilityProbesUsed: 0,
    ballisticProbesUsed: 1,
  };
}

function createCandidate(
  request: TacticalActionPortSolverRequest,
  node: CandidateNode,
  posture: UnitPosture,
  cellIndex: number,
  sector: number,
  anchorProtection: number,
  routeCost: number,
  routeReachable: boolean,
  reasons: readonly TacticalActionPortRejectionReason[],
  line: ReturnType<typeof evaluateLine> | null,
): TacticalActionPortCandidate {
  const staticDirectionQuality = cellIndex < 0
    ? 0
    : decodeBasisByte(readStaticTacticalDirectionalValue(
        request.task.purpose === 'observation'
          ? request.basis.observationByDirection
          : request.basis.firingByDirection,
        request.basis,
        cellIndex,
        sector,
      ));
  const staticPostureQuality = cellIndex < 0
    ? 0
    : decodeBasisByte(readStaticTacticalPostureValue(
        request.task.purpose === 'observation'
          ? request.basis.observationByPosture
          : request.basis.firingByPosture,
        cellIndex,
        posture,
      ));
  const staticProtection = cellIndex < 0 ? 0 : readProtection(request.basis, cellIndex, sector, posture);
  const exposure = clampPercent(100 - staticProtection);
  const lineQuality = line?.lineQuality ?? 0;
  const taskQuality = clampPercent(lineQuality * 0.65 + staticDirectionQuality * 0.2 + staticPostureQuality * 0.15);
  const distanceMeters = node.distanceCells * request.map.metersPerCell;
  const distanceEfficiency = clampPercent(100 - distanceMeters / Math.max(0.001, request.searchRadiusMeters) * 100);
  const physicalScore = clampPercent(
    taskQuality * 0.55
      + staticProtection * 0.25
      + distanceEfficiency * 0.10
      + (routeReachable ? 100 : 0) * 0.10,
  );
  const targetBearing = targetBearingFromPosition(request, node.position);
  const admissible = reasons.length === 0;
  return Object.freeze({
    id: `action-port:${request.task.purpose}:${node.offsetX}:${node.offsetY}:${posture}`,
    purpose: request.task.purpose,
    position: Object.freeze({ ...node.position }),
    recommendedPosture: posture,
    admissible,
    rejectionReasons: Object.freeze([...reasons]),
    metrics: Object.freeze({
      requiredTurnRadians: absoluteAngleDelta(request.currentFacingRadians, targetBearing),
      localDistanceMeters: roundThree(distanceMeters),
      localRouteCost: Number.isFinite(routeCost) ? roundThree(routeCost) : Number.POSITIVE_INFINITY,
      reachable: routeReachable,
      returnAvailable: routeReachable,
      lineClear: line?.clear ?? false,
      lineQuality: roundTwo(lineQuality),
      minimumLineClearanceMeters: line?.clearanceMeters === null || line?.clearanceMeters === undefined
        ? null
        : roundThree(line.clearanceMeters),
      lineBlocker: line?.blocker ?? null,
      observationQuality: line?.observationQuality === null || line?.observationQuality === undefined
        ? null
        : roundTwo(line.observationQuality),
      staticDirectionQuality: roundTwo(staticDirectionQuality),
      staticPostureQuality: roundTwo(staticPostureQuality),
      taskQuality: roundTwo(taskQuality),
      staticProtection: roundTwo(staticProtection),
      exposure: roundTwo(exposure),
      leavesCover: distanceMeters > POSITION_EPSILON && staticProtection + 5 < anchorProtection,
      observedSector: sector,
      physicalScore: roundTwo(physicalScore),
      visibilityProbesUsed: line?.visibilityProbesUsed ?? 0,
      ballisticProbesUsed: line?.ballisticProbesUsed ?? 0,
    }),
  });
}

function readProtection(
  basis: StaticTacticalPositionBasisSnapshot,
  cellIndex: number,
  sector: number,
  posture: UnitPosture,
): number {
  const directional = decodeBasisByte(readStaticTacticalDirectionalValue(
    basis.protectionByDirection,
    basis,
    cellIndex,
    sector,
  ));
  const postureProtection = decodeBasisByte(readStaticTacticalPostureValue(
    basis.staticProtectionByPosture,
    cellIndex,
    posture,
  ));
  return clampPercent(directional * 0.58 + postureProtection * 0.42);
}

function compareCandidates(left: TacticalActionPortCandidate, right: TacticalActionPortCandidate): number {
  return compareNumber(right.metrics.lineQuality, left.metrics.lineQuality)
    || compareNumber(left.metrics.exposure, right.metrics.exposure)
    || compareNumber(left.metrics.localRouteCost, right.metrics.localRouteCost)
    || compareNumber(left.metrics.localDistanceMeters, right.metrics.localDistanceMeters)
    || left.id.localeCompare(right.id);
}

function compareRejectedCandidates(left: TacticalActionPortCandidate, right: TacticalActionPortCandidate): number {
  return left.rejectionReasons.join('|').localeCompare(right.rejectionReasons.join('|'))
    || left.id.localeCompare(right.id);
}

function observationProbePoint(
  map: TacticalMap,
  origin: GridPosition,
  task: TacticalActionPortObservationTask,
): GridPosition {
  if (task.probePoint && Number.isFinite(task.probePoint.x) && Number.isFinite(task.probePoint.y)) {
    return clampPointInsideMap(map, task.probePoint);
  }
  const distanceCells = task.probeDistanceMeters / map.metersPerCell;
  return clampPointInsideMap(map, {
    x: origin.x + Math.cos(task.directionRadians) * distanceCells,
    y: origin.y + Math.sin(task.directionRadians) * distanceCells,
  });
}

function targetBearingFromPosition(request: TacticalActionPortSolverRequest, position: GridPosition): number {
  if (request.task.purpose === 'firing') {
    return Math.atan2(
      request.task.target.position.y - position.y,
      request.task.target.position.x - position.x,
    );
  }
  const target = observationProbePoint(request.map, position, request.task);
  return Math.atan2(target.y - position.y, target.x - position.x);
}

function directionSector(directionRadians: number, sectorCount: number): number {
  const normalized = normalizeRadians(directionRadians);
  return normalizeSector(Math.round(normalized / (Math.PI * 2) * sectorCount), sectorCount);
}

function localNodeIndex(route: RouteField, offsetX: number, offsetY: number): number {
  if (Math.abs(offsetX) > route.extent || Math.abs(offsetY) > route.extent) return -1;
  return (offsetY + route.extent) * route.side + offsetX + route.extent;
}

function heightStepAllowed(
  map: TacticalMap,
  currentCellIndex: number,
  nextCellIndex: number,
  maximumStepHeightLevels: number,
): boolean {
  if (currentCellIndex < 0 || nextCellIndex < 0) return false;
  const current = map.cells[currentCellIndex];
  const next = map.cells[nextCellIndex];
  if (!current || !next) return false;
  return Math.abs(next.height - current.height) <= Math.max(0, maximumStepHeightLevels);
}

function cellIndexAt(map: TacticalMap, position: GridPosition): number {
  const x = Math.floor(position.x);
  const y = Math.floor(position.y);
  return x < 0 || y < 0 || x >= map.width || y >= map.height ? -1 : y * map.width + x;
}

function insideMapWithRadius(map: TacticalMap, position: GridPosition, radiusCells: number): boolean {
  return Number.isFinite(position.x)
    && Number.isFinite(position.y)
    && position.x - radiusCells >= 0
    && position.y - radiusCells >= 0
    && position.x + radiusCells <= map.width
    && position.y + radiusCells <= map.height;
}

function clampPointInsideMap(map: TacticalMap, position: GridPosition): GridPosition {
  const margin = 1e-5;
  return {
    x: clamp(position.x, margin, Math.max(margin, map.width - margin)),
    y: clamp(position.y, margin, Math.max(margin, map.height - margin)),
  };
}

function validFiringTarget(map: TacticalMap, target: TacticalActionPortFiringTarget): boolean {
  return Number.isFinite(target.position.x)
    && Number.isFinite(target.position.y)
    && target.position.x >= 0
    && target.position.y >= 0
    && target.position.x < map.width
    && target.position.y < map.height
    && Number.isFinite(target.heightAboveGroundMeters)
    && target.heightAboveGroundMeters > 0
    && Number.isFinite(target.maximumDistanceMeters)
    && target.maximumDistanceMeters > 0;
}

function emptyLineEvaluation(reason: TacticalActionPortRejectionReason): ReturnType<typeof evaluateLine> {
  return {
    clear: false,
    lineQuality: 0,
    clearanceMeters: null,
    blocker: null,
    observationQuality: null,
    reason,
    visibilityProbesUsed: 0,
    ballisticProbesUsed: 0,
  };
}

function normalizeAllowedPostures(values: readonly UnitPosture[]): UnitPosture[] {
  const allowed = new Set(values);
  return POSTURES.filter((posture) => allowed.has(posture));
}

function compareObjectsStable(left: MapObject, right: MapObject): number {
  return left.id.localeCompare(right.id)
    || left.kind.localeCompare(right.kind)
    || compareNumber(left.x, right.x)
    || compareNumber(left.y, right.y)
    || compareNumber(left.rotationRadians, right.rotationRadians);
}

function absoluteAngleDelta(left: number, right: number): number {
  return Math.abs(normalizeSignedRadians(finite(left) - finite(right)));
}

function normalizeRadians(value: number): number {
  const tau = Math.PI * 2;
  return ((finite(value) % tau) + tau) % tau;
}

function normalizeSignedRadians(value: number): number {
  const tau = Math.PI * 2;
  return ((finite(value) + Math.PI) % tau + tau) % tau - Math.PI;
}

function assertRequest(request: TacticalActionPortSolverRequest): void {
  if (!request || !request.map || !request.basis || !request.environmentProfile || !request.probes) {
    throw new Error('Tactical action-port request is incomplete.');
  }
  if (!Number.isFinite(request.anchor.x) || !Number.isFinite(request.anchor.y)) {
    throw new Error('Tactical action-port anchor must be finite.');
  }
  if (request.environmentProfile.id !== request.map.environmentProfileId) {
    throw new Error('Tactical action-port environment profile does not match the map.');
  }
  if (!Number.isFinite(request.currentFacingRadians) || !Number.isFinite(request.task.directionRadians)) {
    throw new Error('Tactical action-port directions must be finite.');
  }
  if (!Number.isFinite(request.searchRadiusMeters) || request.searchRadiusMeters <= 0) {
    throw new Error('Tactical action-port search radius must be positive.');
  }
  if (!Number.isFinite(request.soldierRadiusMeters) || request.soldierRadiusMeters < 0) {
    throw new Error('Tactical action-port soldier radius must be non-negative.');
  }
  if (!Number.isFinite(request.movement.nodeSpacingMeters) || request.movement.nodeSpacingMeters <= 0
    || !Number.isFinite(request.movement.maximumStepHeightLevels)
    || request.movement.maximumStepHeightLevels < 0) {
    throw new Error('Tactical action-port movement settings are invalid.');
  }
  if (normalizeAllowedPostures(request.allowedPostures).length === 0) {
    throw new Error('Tactical action-port request must allow at least one posture.');
  }
}

function assertBasisMatchesMap(map: TacticalMap, basis: StaticTacticalPositionBasisSnapshot): void {
  if (basis.width !== map.width || basis.height !== map.height || basis.metersPerCell !== map.metersPerCell) {
    throw new Error('Static tactical basis does not match the action-port map.');
  }
}

function decodeBasisByte(value: number): number {
  return clampPercent(value / 255 * 100);
}

function pushHeap(heap: HeapNode[], node: HeapNode): void {
  heap.push(node);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (heap[parent]!.cost <= node.cost) break;
    heap[index] = heap[parent]!;
    index = parent;
  }
  heap[index] = node;
}

function popHeap(heap: HeapNode[]): HeapNode | undefined {
  if (heap.length === 0) return undefined;
  const root = heap[0]!;
  const last = heap.pop()!;
  if (heap.length === 0) return root;
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    if (left >= heap.length) break;
    const child = right < heap.length && heap[right]!.cost < heap[left]!.cost ? right : left;
    if (heap[child]!.cost >= last.cost) break;
    heap[index] = heap[child]!;
    index = child;
  }
  heap[index] = last;
  return root;
}

function clampInt(value: number, minimum: number, maximum: number): number {
  const normalized = Number.isFinite(value) ? Math.floor(value) : minimum;
  return Math.max(minimum, Math.min(maximum, normalized));
}

function clampPercent(value: number): number {
  return clamp(finite(value), 0, 100);
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function compareNumber(left: number, right: number): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundThree(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function roundSix(value: number): number {
  return Math.round(value * 1000000) / 1000000;
}
