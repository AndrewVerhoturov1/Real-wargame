import type { GridPosition } from '../geometry';
import type { TacticalMap } from '../map/MapModel';
import {
  createMoveOrder,
  type MoveOrder,
  type MoveOrderRouteStatus,
  type MoveOrderSource,
} from './MoveOrder';
import {
  findGridPath,
  type GridPathFailure,
  type GridPathSuccess,
} from '../pathfinding/GridPathfinder';

export interface PlanMoveOrderOptions {
  readonly source?: MoveOrderSource;
  readonly ownerToken?: string;
  readonly routeStatus?: MoveOrderRouteStatus;
  readonly routeRevision?: number;
  readonly allowGoalAdjustment?: boolean;
}

export interface PlannedMoveOrder {
  readonly ok: true;
  readonly order: MoveOrder;
  readonly path: GridPathSuccess;
}

export interface FailedMoveOrderPlan {
  readonly ok: false;
  readonly code: GridPathFailure['code'];
  readonly reason: string;
  readonly reasonRu: string;
  readonly path: GridPathFailure;
}

export type MoveOrderPlanResult = PlannedMoveOrder | FailedMoveOrderPlan;

export function planMoveOrder(
  map: TacticalMap,
  start: GridPosition,
  requestedTarget: GridPosition,
  options: PlanMoveOrderOptions = {},
): MoveOrderPlanResult {
  const path = findGridPath(map, start, requestedTarget, {
    allowGoalAdjustment: options.allowGoalAdjustment,
  });
  if (!path.ok) {
    return {
      ok: false,
      code: path.code,
      reason: path.reason,
      reasonRu: path.reasonRu,
      path,
    };
  }

  const order = createMoveOrder(path.resolvedGoal, {
    source: options.source,
    ownerToken: options.ownerToken,
    requestedTarget: path.requestedGoal,
    waypoints: path.waypoints,
    waypointIndex: 0,
    routeCells: path.cells,
    routeCellIndex: 0,
    routeStatus: options.routeStatus ?? 'planned',
    routeRevision: options.routeRevision ?? 1,
    pathCost: path.cost,
    pathVisitedCells: path.visitedCells,
    pathReason: path.reason,
    pathReasonRu: path.reasonRu,
  });

  return { ok: true, order, path };
}
