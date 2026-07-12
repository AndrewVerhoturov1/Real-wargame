import type { GridPosition } from '../geometry';
import type { TacticalMap } from '../map/MapModel';
import { getMapRevisionSnapshot } from '../map/MapRuntimeState';
import {
  createRouteCostFieldCache,
  getRouteCostFields,
  type RouteCostFieldCache,
  type RouteCostFields,
  type TacticalRouteContext,
} from '../navigation/RouteCostField';
import {
  getBuiltInNavigationProfile,
  type NavigationProfile,
} from '../navigation/NavigationProfiles';
import {
  buildNavigationGrid,
  gridPositionToNavigationCell,
  isNavigationCellPassable,
  navigationCellAt,
  navigationCellCenter,
  type NavigationGrid,
} from './GridNavigation';

export type GridPathFailureCode = 'start_blocked' | 'goal_unreachable' | 'no_route' | 'search_limit';

export interface GridPathCostBreakdown {
  readonly terrainCost: number;
  readonly slopeCost: number;
  readonly dangerCost: number;
  readonly exposureCost: number;
  readonly coverAdjustment: number;
  readonly enemyDistanceCost: number;
  readonly territoryCost: number;
}

export interface GridPathOptions {
  readonly maxVisitedCells?: number;
  readonly nearestGoalRadiusCells?: number;
  readonly allowGoalAdjustment?: boolean;
  readonly navigationProfile?: NavigationProfile;
  readonly tacticalContext?: TacticalRouteContext;
  readonly costFieldCache?: RouteCostFieldCache;
}

export interface GridPathSuccess {
  readonly ok: true;
  readonly requestedGoal: GridPosition;
  readonly resolvedGoal: GridPosition;
  readonly goalAdjusted: boolean;
  readonly cells: ReadonlyArray<{ x: number; y: number }>;
  readonly waypoints: readonly GridPosition[];
  readonly cost: number;
  readonly totalCost: number;
  readonly distanceMeters: number;
  readonly baselineDistanceMeters: number;
  readonly detourRatio: number;
  readonly detourLimited: boolean;
  readonly visitedCells: number;
  readonly profileId: string;
  readonly profileRevision: number;
  readonly costBreakdown: GridPathCostBreakdown;
  readonly routeReason: string;
  readonly routeReasonRu: string;
  readonly reason: string;
  readonly reasonRu: string;
}

export interface GridPathFailure {
  readonly ok: false;
  readonly code: GridPathFailureCode;
  readonly requestedGoal: GridPosition;
  readonly visitedCells: number;
  readonly reason: string;
  readonly reasonRu: string;
}

export type GridPathResult = GridPathSuccess | GridPathFailure;

interface OpenNode {
  readonly index: number;
  readonly f: number;
  readonly h: number;
}

interface SearchSuccess {
  readonly ok: true;
  readonly cells: Array<{ x: number; y: number }>;
  readonly cost: number;
  readonly visitedCells: number;
}

interface SearchFailure {
  readonly ok: false;
  readonly code: 'no_route' | 'search_limit';
  readonly visitedCells: number;
  readonly reason: string;
  readonly reasonRu: string;
}

type SearchResult = SearchSuccess | SearchFailure;

const CARDINAL_COST = 1;
const DIAGONAL_COST = Math.SQRT2;
const MINIMUM_STEP_COST = 0.05;
const DEFAULT_NEAREST_GOAL_RADIUS = 6;
const DIRECTIONS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, CARDINAL_COST],
  [0, 1, CARDINAL_COST],
  [-1, 0, CARDINAL_COST],
  [0, -1, CARDINAL_COST],
  [1, 1, DIAGONAL_COST],
  [-1, 1, DIAGONAL_COST],
  [-1, -1, DIAGONAL_COST],
  [1, -1, DIAGONAL_COST],
];

const sharedCostFieldCache = createRouteCostFieldCache();
const baselineCache = new WeakMap<TacticalMap, Map<string, SearchSuccess>>();

export function findGridPath(
  map: TacticalMap,
  start: GridPosition,
  requestedGoal: GridPosition,
  options: GridPathOptions = {},
): GridPathResult {
  const grid = buildNavigationGrid(map);
  const profile = options.navigationProfile ?? getBuiltInNavigationProfile('normal');
  const costCache = options.costFieldCache ?? sharedCostFieldCache;
  const fields = getRouteCostFields(map, profile, options.tacticalContext, costCache);
  const startCell = gridPositionToNavigationCell(map, start);
  if (!isNavigationCellPassable(grid, startCell.x, startCell.y)) {
    return failure(
      'start_blocked',
      requestedGoal,
      0,
      'The route start cell is blocked.',
      'Стартовая клетка маршрута непроходима.',
    );
  }

  const requestedGoalCell = gridPositionToNavigationCell(map, requestedGoal);
  const requestedGoalPassable = isNavigationCellPassable(grid, requestedGoalCell.x, requestedGoalCell.y);
  const allowGoalAdjustment = options.allowGoalAdjustment ?? profile.allowGoalAdjustment;
  if (!requestedGoalPassable && allowGoalAdjustment === false) {
    return failure(
      'goal_unreachable',
      requestedGoal,
      0,
      'The exact requested goal cell is blocked.',
      'Точная клетка цели непроходима.',
    );
  }

  const resolvedGoalCell = requestedGoalPassable
    ? requestedGoalCell
    : findNearestPassableGoal(
        grid,
        requestedGoalCell,
        Math.max(0, Math.floor(options.nearestGoalRadiusCells ?? DEFAULT_NEAREST_GOAL_RADIUS)),
      );

  if (!resolvedGoalCell) {
    return failure(
      'goal_unreachable',
      requestedGoal,
      0,
      'No passable cell is available near the requested goal.',
      'Рядом с запрошенной целью нет доступной клетки.',
    );
  }

  const goalAdjusted = resolvedGoalCell.x !== requestedGoalCell.x || resolvedGoalCell.y !== requestedGoalCell.y;
  const resolvedGoal = goalAdjusted
    ? navigationCellCenter(resolvedGoalCell.x, resolvedGoalCell.y)
    : clampPositionInsideCell(requestedGoal, resolvedGoalCell.x, resolvedGoalCell.y);
  const maxVisitedCells = Math.max(1, Math.floor(options.maxVisitedCells ?? grid.width * grid.height));
  const tacticalSearch = runAStar(grid, fields, startCell, resolvedGoalCell, maxVisitedCells);

  if (!tacticalSearch.ok) {
    return failure(tacticalSearch.code, requestedGoal, tacticalSearch.visitedCells, tacticalSearch.reason, tacticalSearch.reasonRu);
  }

  const baseline = getBaselineSearch(map, grid, costCache, startCell, resolvedGoalCell, maxVisitedCells);
  const tacticalDistanceCells = pathDistanceCells(tacticalSearch.cells);
  const baselineDistanceCells = baseline.ok ? pathDistanceCells(baseline.cells) : tacticalDistanceCells;
  const rawDetourRatio = baselineDistanceCells > 0 ? tacticalDistanceCells / baselineDistanceCells : 1;
  const maximumDetourRatio = Math.max(1, profile.maximumDetourRatio);
  const detourLimited = baseline.ok && rawDetourRatio > maximumDetourRatio + 1e-9;
  const selectedSearch = detourLimited ? baseline : tacticalSearch;
  if (!selectedSearch.ok) {
    return failure(selectedSearch.code, requestedGoal, selectedSearch.visitedCells, selectedSearch.reason, selectedSearch.reasonRu);
  }

  const selectedDistanceCells = pathDistanceCells(selectedSearch.cells);
  const selectedDetourRatio = baselineDistanceCells > 0 ? selectedDistanceCells / baselineDistanceCells : 1;
  const costBreakdown = calculatePathCostBreakdown(selectedSearch.cells, fields);
  const totalCost = sumBreakdown(costBreakdown);
  if (profile.maximumRouteCost !== null && totalCost > profile.maximumRouteCost) {
    return failure(
      'no_route',
      requestedGoal,
      tacticalSearch.visitedCells + (baseline.ok ? baseline.visitedCells : 0),
      `The route exceeds the profile maximum cost (${profile.maximumRouteCost}).`,
      `Стоимость маршрута превышает предел профиля (${profile.maximumRouteCost}).`,
    );
  }

  const routeReason = buildRouteReason(goalAdjusted, detourLimited, profile, costBreakdown, false);
  const routeReasonRu = buildRouteReason(goalAdjusted, detourLimited, profile, costBreakdown, true);
  const waypoints = simplifyPathToWaypoints(selectedSearch.cells, resolvedGoal);
  return {
    ok: true,
    requestedGoal: { ...requestedGoal },
    resolvedGoal,
    goalAdjusted,
    cells: selectedSearch.cells,
    waypoints,
    cost: round(totalCost, 6),
    totalCost: round(totalCost, 6),
    distanceMeters: round(selectedDistanceCells * map.metersPerCell, 3),
    baselineDistanceMeters: round(baselineDistanceCells * map.metersPerCell, 3),
    detourRatio: round(selectedDetourRatio, 6),
    detourLimited,
    visitedCells: tacticalSearch.visitedCells + (baseline.ok ? baseline.visitedCells : 0),
    profileId: profile.id,
    profileRevision: profile.revision,
    costBreakdown: roundBreakdown(costBreakdown),
    routeReason,
    routeReasonRu,
    reason: routeReason,
    reasonRu: routeReasonRu,
  };
}

function getBaselineSearch(
  map: TacticalMap,
  grid: NavigationGrid,
  costCache: RouteCostFieldCache,
  start: { x: number; y: number },
  goal: { x: number; y: number },
  maxVisitedCells: number,
): SearchResult {
  const revisions = getMapRevisionSnapshot(map);
  const key = [
    revisions.terrain,
    revisions.height,
    revisions.forest,
    revisions.objects,
    start.x,
    start.y,
    goal.x,
    goal.y,
    maxVisitedCells,
  ].join(':');
  let mapCache = baselineCache.get(map);
  if (!mapCache) {
    mapCache = new Map();
    baselineCache.set(map, mapCache);
  }
  const existing = mapCache.get(key);
  if (existing) return existing;

  const direct = getBuiltInNavigationProfile('direct');
  const fields = getRouteCostFields(map, direct, undefined, costCache);
  const result = runAStar(grid, fields, start, goal, maxVisitedCells);
  if (result.ok) {
    mapCache.set(key, result);
    while (mapCache.size > 32) {
      const oldest = mapCache.keys().next().value as string | undefined;
      if (!oldest) break;
      mapCache.delete(oldest);
    }
  }
  return result;
}

function runAStar(
  grid: NavigationGrid,
  fields: RouteCostFields,
  start: { x: number; y: number },
  goal: { x: number; y: number },
  maxVisitedCells: number,
): SearchResult {
  const cellCount = grid.width * grid.height;
  const startIndex = indexOf(grid, start.x, start.y);
  const goalIndex = indexOf(grid, goal.x, goal.y);
  const gScore = new Float64Array(cellCount);
  const parent = new Int32Array(cellCount);
  const closed = new Uint8Array(cellCount);
  gScore.fill(Number.POSITIVE_INFINITY);
  parent.fill(-1);
  gScore[startIndex] = 0;

  const open = new BinaryHeap();
  const startH = heuristic(start.x, start.y, goal.x, goal.y);
  open.push({ index: startIndex, f: startH, h: startH });
  let visitedCells = 0;

  while (open.size > 0) {
    const current = open.pop();
    if (!current) break;
    if (closed[current.index]) continue;
    closed[current.index] = 1;
    visitedCells += 1;

    if (visitedCells > maxVisitedCells) {
      return {
        ok: false,
        code: 'search_limit',
        visitedCells,
        reason: 'Path search exceeded its visited-cell limit.',
        reasonRu: 'Поиск пути превысил лимит проверенных клеток.',
      };
    }

    if (current.index === goalIndex) {
      return {
        ok: true,
        cells: reconstructPath(grid, parent, current.index),
        cost: gScore[current.index],
        visitedCells,
      };
    }

    const currentX = current.index % grid.width;
    const currentY = Math.floor(current.index / grid.width);
    if (!navigationCellAt(grid, currentX, currentY)) continue;

    for (const [dx, dy, stepLength] of DIRECTIONS) {
      const nextX = currentX + dx;
      const nextY = currentY + dy;
      if (!isNavigationCellPassable(grid, nextX, nextY)) continue;
      if (
        dx !== 0
        && dy !== 0
        && (
          !isNavigationCellPassable(grid, currentX + dx, currentY)
          || !isNavigationCellPassable(grid, currentX, currentY + dy)
        )
      ) {
        continue;
      }

      const nextIndex = indexOf(grid, nextX, nextY);
      if (closed[nextIndex]) continue;
      const currentCost = fields.totalCost[current.index];
      const nextCost = fields.totalCost[nextIndex];
      if (!Number.isFinite(currentCost) || !Number.isFinite(nextCost)) continue;
      const stepCost = stepLength * Math.max(MINIMUM_STEP_COST, (currentCost + nextCost) / 2);
      const tentativeG = gScore[current.index] + stepCost;
      if (tentativeG + 1e-9 >= gScore[nextIndex]) continue;

      parent[nextIndex] = current.index;
      gScore[nextIndex] = tentativeG;
      const h = heuristic(nextX, nextY, goal.x, goal.y);
      open.push({ index: nextIndex, f: tentativeG + h, h });
    }
  }

  return {
    ok: false,
    code: 'no_route',
    visitedCells,
    reason: 'No passable route connects the start and goal.',
    reasonRu: 'Между стартом и целью нет проходимого маршрута.',
  };
}

function calculatePathCostBreakdown(
  cells: ReadonlyArray<{ x: number; y: number }>,
  fields: RouteCostFields,
): GridPathCostBreakdown {
  const breakdown: GridPathCostBreakdown = {
    terrainCost: 0,
    slopeCost: 0,
    dangerCost: 0,
    exposureCost: 0,
    coverAdjustment: 0,
    enemyDistanceCost: 0,
    territoryCost: 0,
  };
  for (let index = 1; index < cells.length; index += 1) {
    const previous = cells[index - 1];
    const current = cells[index];
    const previousIndex = previous.y * fields.width + previous.x;
    const currentIndex = current.y * fields.width + current.x;
    const stepLength = previous.x !== current.x && previous.y !== current.y ? DIAGONAL_COST : CARDINAL_COST;
    addAverage(breakdown, 'terrainCost', fields.terrainCost, previousIndex, currentIndex, stepLength);
    addAverage(breakdown, 'slopeCost', fields.slopeCost, previousIndex, currentIndex, stepLength);
    addAverage(breakdown, 'dangerCost', fields.dangerCost, previousIndex, currentIndex, stepLength);
    addAverage(breakdown, 'exposureCost', fields.exposureCost, previousIndex, currentIndex, stepLength);
    addAverage(breakdown, 'coverAdjustment', fields.coverAdjustment, previousIndex, currentIndex, stepLength);
    addAverage(breakdown, 'enemyDistanceCost', fields.enemyDistanceCost, previousIndex, currentIndex, stepLength);
    addAverage(breakdown, 'territoryCost', fields.territoryCost, previousIndex, currentIndex, stepLength);
  }
  return breakdown;
}

function addAverage(
  target: GridPathCostBreakdown,
  key: keyof GridPathCostBreakdown,
  values: Float32Array,
  leftIndex: number,
  rightIndex: number,
  multiplier: number,
): void {
  (target as Record<keyof GridPathCostBreakdown, number>)[key] += multiplier * (values[leftIndex] + values[rightIndex]) / 2;
}

function sumBreakdown(value: GridPathCostBreakdown): number {
  return Math.max(0, value.terrainCost
    + value.slopeCost
    + value.dangerCost
    + value.exposureCost
    + value.coverAdjustment
    + value.enemyDistanceCost
    + value.territoryCost);
}

function roundBreakdown(value: GridPathCostBreakdown): GridPathCostBreakdown {
  return {
    terrainCost: round(value.terrainCost, 6),
    slopeCost: round(value.slopeCost, 6),
    dangerCost: round(value.dangerCost, 6),
    exposureCost: round(value.exposureCost, 6),
    coverAdjustment: round(value.coverAdjustment, 6),
    enemyDistanceCost: round(value.enemyDistanceCost, 6),
    territoryCost: round(value.territoryCost, 6),
  };
}

function buildRouteReason(
  goalAdjusted: boolean,
  detourLimited: boolean,
  profile: NavigationProfile,
  breakdown: GridPathCostBreakdown,
  russian: boolean,
): string {
  if (detourLimited) {
    return russian
      ? 'Предпочтительный тактический маршрут оказался длиннее разрешённого обхода; выбран кратчайший проходимый маршрут.'
      : 'The preferred tactical route exceeded the allowed detour; the shortest passable route was selected.';
  }
  if (goalAdjusted) {
    return russian
      ? 'Запрошенная цель непроходима; маршрут перенесён в ближайшую доступную клетку.'
      : 'The requested goal was blocked, so the route ends at the nearest passable cell.';
  }
  const weighted: Array<[number, string, string]> = [
    [Math.max(0, breakdown.dangerCost), 'known danger avoidance', 'избегание известной опасности'],
    [Math.max(0, breakdown.exposureCost), 'exposure avoidance', 'избегание просматриваемых мест'],
    [Math.max(0, -breakdown.coverAdjustment), 'cover preference', 'предпочтение укрытий'],
    [Math.max(0, breakdown.slopeCost), 'slope cost', 'штраф за уклон'],
  ];
  weighted.sort((left, right) => right[0] - left[0]);
  const strongest = weighted[0];
  if (strongest && strongest[0] > 0.001) {
    return russian
      ? `Маршрут построен профилем «${profile.nameRu}»; главная причина: ${strongest[2]}.`
      : `Route built with the ${profile.nameEn} profile; strongest reason: ${strongest[1]}.`;
  }
  return russian
    ? `Проходимый маршрут построен профилем «${profile.nameRu}».`
    : `A passable route was built with the ${profile.nameEn} profile.`;
}

function findNearestPassableGoal(
  grid: NavigationGrid,
  goal: { x: number; y: number },
  radius: number,
): { x: number; y: number } | null {
  const candidates: Array<{ x: number; y: number; distanceSquared: number; index: number }> = [];
  for (let y = Math.max(0, goal.y - radius); y <= Math.min(grid.height - 1, goal.y + radius); y += 1) {
    for (let x = Math.max(0, goal.x - radius); x <= Math.min(grid.width - 1, goal.x + radius); x += 1) {
      if (!isNavigationCellPassable(grid, x, y)) continue;
      const dx = x - goal.x;
      const dy = y - goal.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared > radius * radius) continue;
      candidates.push({ x, y, distanceSquared, index: indexOf(grid, x, y) });
    }
  }
  candidates.sort((left, right) => left.distanceSquared - right.distanceSquared || left.index - right.index);
  return candidates[0] ? { x: candidates[0].x, y: candidates[0].y } : null;
}

function simplifyPathToWaypoints(
  cells: ReadonlyArray<{ x: number; y: number }>,
  resolvedGoal: GridPosition,
): GridPosition[] {
  if (cells.length <= 1) return [{ ...resolvedGoal }];
  const waypoints: GridPosition[] = [];
  let previousDirection: readonly [number, number] | null = null;

  for (let index = 1; index < cells.length; index += 1) {
    const previous = cells[index - 1];
    const current = cells[index];
    const direction: readonly [number, number] = [
      Math.sign(current.x - previous.x),
      Math.sign(current.y - previous.y),
    ];
    if (
      previousDirection
      && (direction[0] !== previousDirection[0] || direction[1] !== previousDirection[1])
    ) {
      waypoints.push(navigationCellCenter(previous.x, previous.y));
    }
    previousDirection = direction;
  }

  waypoints.push({ ...resolvedGoal });
  return waypoints;
}

function reconstructPath(
  grid: NavigationGrid,
  parent: Int32Array,
  goalIndex: number,
): Array<{ x: number; y: number }> {
  const reverse: Array<{ x: number; y: number }> = [];
  let current = goalIndex;
  while (current >= 0) {
    reverse.push({ x: current % grid.width, y: Math.floor(current / grid.width) });
    current = parent[current];
  }
  reverse.reverse();
  return reverse;
}

function pathDistanceCells(cells: ReadonlyArray<{ x: number; y: number }>): number {
  let distance = 0;
  for (let index = 1; index < cells.length; index += 1) {
    const previous = cells[index - 1];
    const current = cells[index];
    distance += previous.x !== current.x && previous.y !== current.y ? DIAGONAL_COST : CARDINAL_COST;
  }
  return distance;
}

function heuristic(x: number, y: number, goalX: number, goalY: number): number {
  const dx = Math.abs(goalX - x);
  const dy = Math.abs(goalY - y);
  return MINIMUM_STEP_COST * (Math.max(dx, dy) + (DIAGONAL_COST - 1) * Math.min(dx, dy));
}

function indexOf(grid: NavigationGrid, x: number, y: number): number {
  return y * grid.width + x;
}

function clampPositionInsideCell(position: GridPosition, cellX: number, cellY: number): GridPosition {
  return {
    x: Math.max(cellX + 0.001, Math.min(cellX + 0.999, position.x)),
    y: Math.max(cellY + 0.001, Math.min(cellY + 0.999, position.y)),
  };
}

function failure(
  code: GridPathFailureCode,
  requestedGoal: GridPosition,
  visitedCells: number,
  reason: string,
  reasonRu: string,
): GridPathFailure {
  return {
    ok: false,
    code,
    requestedGoal: { ...requestedGoal },
    visitedCells,
    reason,
    reasonRu,
  };
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

class BinaryHeap {
  private readonly values: OpenNode[] = [];

  get size(): number {
    return this.values.length;
  }

  push(value: OpenNode): void {
    this.values.push(value);
    this.bubbleUp(this.values.length - 1);
  }

  pop(): OpenNode | undefined {
    if (this.values.length === 0) return undefined;
    const first = this.values[0];
    const last = this.values.pop();
    if (this.values.length > 0 && last) {
      this.values[0] = last;
      this.sinkDown(0);
    }
    return first;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (compareNodes(this.values[parentIndex], this.values[index]) <= 0) break;
      [this.values[parentIndex], this.values[index]] = [this.values[index], this.values[parentIndex]];
      index = parentIndex;
    }
  }

  private sinkDown(index: number): void {
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let best = index;
      if (left < this.values.length && compareNodes(this.values[left], this.values[best]) < 0) best = left;
      if (right < this.values.length && compareNodes(this.values[right], this.values[best]) < 0) best = right;
      if (best === index) break;
      [this.values[index], this.values[best]] = [this.values[best], this.values[index]];
      index = best;
    }
  }
}

function compareNodes(left: OpenNode, right: OpenNode): number {
  return left.f - right.f || left.h - right.h || left.index - right.index;
}
