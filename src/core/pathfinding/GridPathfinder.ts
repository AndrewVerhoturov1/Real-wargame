import type { GridPosition } from '../geometry';
import type { TacticalMap } from '../map/MapModel';
import {
  buildNavigationGrid,
  gridPositionToNavigationCell,
  isNavigationCellPassable,
  navigationCellAt,
  navigationCellCenter,
  type NavigationGrid,
} from './GridNavigation';

export type GridPathFailureCode = 'start_blocked' | 'goal_unreachable' | 'no_route' | 'search_limit';

export interface GridPathOptions {
  readonly maxVisitedCells?: number;
  readonly nearestGoalRadiusCells?: number;
}

export interface GridPathSuccess {
  readonly ok: true;
  readonly requestedGoal: GridPosition;
  readonly resolvedGoal: GridPosition;
  readonly goalAdjusted: boolean;
  readonly cells: ReadonlyArray<{ x: number; y: number }>;
  readonly waypoints: readonly GridPosition[];
  readonly cost: number;
  readonly visitedCells: number;
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

const CARDINAL_COST = 1;
const DIAGONAL_COST = Math.SQRT2;
const MINIMUM_TERRAIN_COST = 0.8;
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

export function findGridPath(
  map: TacticalMap,
  start: GridPosition,
  requestedGoal: GridPosition,
  options: GridPathOptions = {},
): GridPathResult {
  const grid = buildNavigationGrid(map);
  const startCell = gridPositionToNavigationCell(map, start);
  if (!isNavigationCellPassable(grid, startCell.x, startCell.y)) {
    return failure('start_blocked', requestedGoal, 0,
      'The route start cell is blocked.',
      'Стартовая клетка маршрута непроходима.');
  }

  const requestedGoalCell = gridPositionToNavigationCell(map, requestedGoal);
  const resolvedGoalCell = isNavigationCellPassable(grid, requestedGoalCell.x, requestedGoalCell.y)
    ? requestedGoalCell
    : findNearestPassableGoal(
        grid,
        requestedGoalCell,
        Math.max(0, Math.floor(options.nearestGoalRadiusCells ?? DEFAULT_NEAREST_GOAL_RADIUS)),
      );

  if (!resolvedGoalCell) {
    return failure('goal_unreachable', requestedGoal, 0,
      'No passable cell is available near the requested goal.',
      'Рядом с запрошенной целью нет доступной клетки.');
  }

  const goalAdjusted = resolvedGoalCell.x !== requestedGoalCell.x || resolvedGoalCell.y !== requestedGoalCell.y;
  const resolvedGoal = goalAdjusted
    ? navigationCellCenter(resolvedGoalCell.x, resolvedGoalCell.y)
    : clampPositionInsideCell(requestedGoal, resolvedGoalCell.x, resolvedGoalCell.y);
  const search = runAStar(
    grid,
    startCell,
    resolvedGoalCell,
    Math.max(1, Math.floor(options.maxVisitedCells ?? grid.width * grid.height)),
  );

  if (!search.ok) {
    return failure(search.code, requestedGoal, search.visitedCells, search.reason, search.reasonRu);
  }

  const waypoints = simplifyPathToWaypoints(search.cells, resolvedGoal);
  return {
    ok: true,
    requestedGoal: { ...requestedGoal },
    resolvedGoal,
    goalAdjusted,
    cells: search.cells,
    waypoints,
    cost: round(search.cost, 6),
    visitedCells: search.visitedCells,
    reason: goalAdjusted
      ? 'The requested goal was blocked, so the route ends at the nearest passable cell.'
      : 'A passable grid route was found.',
    reasonRu: goalAdjusted
      ? 'Запрошенная цель непроходима; маршрут перенесён в ближайшую доступную клетку.'
      : 'Проходимый маршрут построен.',
  };
}

function runAStar(
  grid: NavigationGrid,
  start: { x: number; y: number },
  goal: { x: number; y: number },
  maxVisitedCells: number,
):
  | { ok: true; cells: Array<{ x: number; y: number }>; cost: number; visitedCells: number }
  | { ok: false; code: 'no_route' | 'search_limit'; visitedCells: number; reason: string; reasonRu: string } {
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
    const currentCell = navigationCellAt(grid, currentX, currentY);
    if (!currentCell) continue;

    for (const [dx, dy, stepLength] of DIRECTIONS) {
      const nextX = currentX + dx;
      const nextY = currentY + dy;
      if (!isNavigationCellPassable(grid, nextX, nextY)) continue;
      if (dx !== 0 && dy !== 0
        && (!isNavigationCellPassable(grid, currentX + dx, currentY)
          || !isNavigationCellPassable(grid, currentX, currentY + dy))) {
        continue;
      }

      const nextIndex = indexOf(grid, nextX, nextY);
      if (closed[nextIndex]) continue;
      const nextCell = navigationCellAt(grid, nextX, nextY);
      if (!nextCell) continue;
      const slopeCost = Math.abs(nextCell.height - currentCell.height) * 0.15;
      const stepCost = stepLength * ((currentCell.movementCost + nextCell.movementCost) / 2 + slopeCost);
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
    if (previousDirection && (direction[0] !== previousDirection[0] || direction[1] !== previousDirection[1])) {
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

function heuristic(x: number, y: number, goalX: number, goalY: number): number {
  const dx = Math.abs(goalX - x);
  const dy = Math.abs(goalY - y);
  return MINIMUM_TERRAIN_COST * (Math.max(dx, dy) + (DIAGONAL_COST - 1) * Math.min(dx, dy));
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
