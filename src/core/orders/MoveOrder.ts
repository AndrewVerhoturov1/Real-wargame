import type { GridPosition } from '../geometry';
import type { MovementProfileSource } from '../movement/MovementProfiles';
import { cloneRouteDangerDiagnostic, type RouteDangerDiagnostic } from '../navigation/RouteDangerDiagnostic';
import type { NavigationProfileSource } from '../navigation/NavigationProfileResolver';
import type { NavigationMovementMode } from '../navigation/NavigationProfiles';
import type { GridPathCostBreakdown } from '../pathfinding/GridPathfinder';

export type MoveOrderSource = 'player' | 'ai';
export type MoveOrderRouteStatus = 'planned' | 'following' | 'replanned';

export interface MoveOrderRouteCell {
  readonly x: number;
  readonly y: number;
}

export interface MoveOrderOptions {
  readonly source?: MoveOrderSource;
  readonly ownerToken?: string;
  readonly playerCommandId?: string;
  readonly requestedTarget?: GridPosition;
  readonly waypoints?: readonly GridPosition[];
  readonly waypointIndex?: number;
  readonly routeCells?: readonly MoveOrderRouteCell[];
  readonly routeCellIndex?: number;
  readonly routeStatus?: MoveOrderRouteStatus;
  readonly routeRevision?: number;
  readonly routeDangerDiagnostic?: RouteDangerDiagnostic;
  readonly pathCost?: number;
  readonly pathDistanceMeters?: number;
  readonly baselineDistanceMeters?: number;
  readonly detourRatio?: number;
  readonly detourLimited?: boolean;
  readonly pathCostBreakdown?: GridPathCostBreakdown;
  readonly pathVisitedCells?: number;
  readonly pathReason?: string;
  readonly pathReasonRu?: string;
  readonly movementMode?: NavigationMovementMode;
  readonly navigationProfileId?: string;
  readonly navigationProfileRevision?: number;
  readonly navigationProfileSource?: NavigationProfileSource;
  readonly movementProfileId?: string;
  readonly movementProfileSource?: MovementProfileSource;
  readonly movementProfileOwnerToken?: string;
  readonly movementProfileDefinitionRevision?: number;
  readonly movementProfileSelectionRevision?: number;
  readonly finalFacingRadians?: number;
  readonly knowledgeRevision?: number;
  readonly replanSearchCount?: number;
  readonly replanCount?: number;
  readonly lastReplanAtSeconds?: number;
  readonly lastReplanReason?: string;
  readonly lastReplanReasonRu?: string;
}

export interface MoveOrder {
  type: 'move';
  target: GridPosition;
  issuedAtMs: number;
  source?: MoveOrderSource;
  ownerToken?: string;
  playerCommandId?: string;
  requestedTarget?: GridPosition;
  waypoints?: GridPosition[];
  waypointIndex?: number;
  routeCells?: MoveOrderRouteCell[];
  routeCellIndex?: number;
  routeStatus?: MoveOrderRouteStatus;
  routeRevision?: number;
  routeDangerDiagnostic?: RouteDangerDiagnostic;
  pathCost?: number;
  pathDistanceMeters?: number;
  baselineDistanceMeters?: number;
  detourRatio?: number;
  detourLimited?: boolean;
  pathCostBreakdown?: GridPathCostBreakdown;
  pathVisitedCells?: number;
  pathReason?: string;
  pathReasonRu?: string;
  movementMode?: NavigationMovementMode;
  navigationProfileId?: string;
  navigationProfileRevision?: number;
  navigationProfileSource?: NavigationProfileSource;
  movementProfileId?: string;
  movementProfileSource?: MovementProfileSource;
  movementProfileOwnerToken?: string;
  movementProfileDefinitionRevision?: number;
  movementProfileSelectionRevision?: number;
  finalFacingRadians?: number;
  knowledgeRevision?: number;
  replanSearchCount?: number;
  replanCount?: number;
  lastReplanAtSeconds?: number;
  lastReplanReason?: string;
  lastReplanReasonRu?: string;
}

export function createMoveOrder(target: GridPosition, options: MoveOrderOptions = {}): MoveOrder {
  return {
    type: 'move',
    target: { ...target },
    issuedAtMs: Date.now(),
    source: options.source,
    ownerToken: options.ownerToken,
    playerCommandId: options.playerCommandId,
    requestedTarget: options.requestedTarget ? { ...options.requestedTarget } : undefined,
    waypoints: options.waypoints?.map((point) => ({ ...point })),
    waypointIndex: options.waypointIndex,
    routeCells: options.routeCells?.map((cell) => ({ ...cell })),
    routeCellIndex: options.routeCellIndex,
    routeStatus: options.routeStatus,
    routeRevision: options.routeRevision,
    routeDangerDiagnostic: cloneRouteDangerDiagnostic(options.routeDangerDiagnostic),
    pathCost: options.pathCost,
    pathDistanceMeters: options.pathDistanceMeters,
    baselineDistanceMeters: options.baselineDistanceMeters,
    detourRatio: options.detourRatio,
    detourLimited: options.detourLimited,
    pathCostBreakdown: options.pathCostBreakdown ? { ...options.pathCostBreakdown } : undefined,
    pathVisitedCells: options.pathVisitedCells,
    pathReason: options.pathReason,
    pathReasonRu: options.pathReasonRu,
    movementMode: options.movementMode,
    navigationProfileId: options.navigationProfileId,
    navigationProfileRevision: options.navigationProfileRevision,
    navigationProfileSource: options.navigationProfileSource,
    movementProfileId: options.movementProfileId,
    movementProfileSource: options.movementProfileSource,
    movementProfileOwnerToken: options.movementProfileOwnerToken,
    movementProfileDefinitionRevision: options.movementProfileDefinitionRevision,
    movementProfileSelectionRevision: options.movementProfileSelectionRevision,
    finalFacingRadians: options.finalFacingRadians,
    knowledgeRevision: options.knowledgeRevision,
    replanSearchCount: options.replanSearchCount,
    replanCount: options.replanCount,
    lastReplanAtSeconds: options.lastReplanAtSeconds,
    lastReplanReason: options.lastReplanReason,
    lastReplanReasonRu: options.lastReplanReasonRu,
  };
}
