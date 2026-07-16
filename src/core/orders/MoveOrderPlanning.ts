import type { GridPosition } from '../geometry';
import type { TacticalMap } from '../map/MapModel';
import type { MovementProfileSource } from '../movement/MovementProfileContract';
import type { NavigationProfileSource } from '../navigation/NavigationProfileResolver';
import type { NavigationMovementMode, NavigationProfile } from '../navigation/NavigationProfiles';
import type { TacticalRouteContext } from '../navigation/RouteCostField';
import {
  findGridPath,
  type GridPathFailure,
  type GridPathSuccess,
} from '../pathfinding/GridPathfinder';
import {
  createMoveOrder,
  type MoveOrder,
  type MoveOrderRouteStatus,
  type MoveOrderSource,
} from './MoveOrder';

export interface PlanMoveOrderOptions {
  readonly source?: MoveOrderSource;
  readonly ownerToken?: string;
  readonly playerCommandId?: string;
  readonly routeStatus?: MoveOrderRouteStatus;
  readonly routeRevision?: number;
  readonly allowGoalAdjustment?: boolean;
  readonly navigationProfile?: NavigationProfile;
  readonly navigationProfileSource?: NavigationProfileSource;
  readonly movementMode?: NavigationMovementMode;
  readonly movementProfileId?: string;
  readonly movementProfileSource?: MovementProfileSource;
  readonly movementProfileOwnerToken?: string;
  readonly movementProfileDefinitionRevision?: number;
  readonly movementProfileSelectionRevision?: number;
  /** Deprecated compatibility input; interpreted only as selection revision. */
  readonly movementProfileRevision?: number;
  readonly finalFacingRadians?: number;
  readonly tacticalContext?: TacticalRouteContext;
  readonly replanSearchCount?: number;
  readonly replanCount?: number;
  readonly lastReplanAtSeconds?: number;
  readonly lastReplanReason?: string;
  readonly lastReplanReasonRu?: string;
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
    navigationProfile: options.navigationProfile,
    tacticalContext: options.tacticalContext,
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
    playerCommandId: options.playerCommandId,
    requestedTarget: path.requestedGoal,
    waypoints: path.waypoints,
    waypointIndex: 0,
    routeCells: path.cells,
    routeCellIndex: 0,
    routeStatus: options.routeStatus ?? 'planned',
    routeRevision: options.routeRevision ?? 1,
    pathCost: path.totalCost,
    pathDistanceMeters: path.distanceMeters,
    baselineDistanceMeters: path.baselineDistanceMeters,
    detourRatio: path.detourRatio,
    detourLimited: path.detourLimited,
    pathCostBreakdown: path.costBreakdown,
    pathVisitedCells: path.visitedCells,
    pathReason: path.routeReason,
    pathReasonRu: path.routeReasonRu,
    movementMode: options.movementMode,
    navigationProfileId: path.profileId,
    navigationProfileRevision: path.profileRevision,
    navigationProfileSource: options.navigationProfileSource,
    movementProfileId: options.movementProfileId,
    movementProfileSource: options.movementProfileSource,
    movementProfileOwnerToken: options.movementProfileOwnerToken,
    movementProfileDefinitionRevision: options.movementProfileDefinitionRevision,
    movementProfileSelectionRevision: options.movementProfileSelectionRevision ?? options.movementProfileRevision,
    finalFacingRadians: options.finalFacingRadians,
    knowledgeRevision: options.tacticalContext?.knowledgeRevision ?? 0,
    replanSearchCount: options.replanSearchCount ?? 0,
    replanCount: options.replanCount ?? 0,
    lastReplanAtSeconds: options.lastReplanAtSeconds,
    lastReplanReason: options.lastReplanReason,
    lastReplanReasonRu: options.lastReplanReasonRu,
  });

  return { ok: true, order, path };
}
