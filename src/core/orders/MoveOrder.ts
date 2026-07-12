import type { GridPosition } from '../geometry';

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
  readonly pathCost?: number;
  readonly pathVisitedCells?: number;
  readonly pathReason?: string;
  readonly pathReasonRu?: string;
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
  pathCost?: number;
  pathVisitedCells?: number;
  pathReason?: string;
  pathReasonRu?: string;
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
    pathCost: options.pathCost,
    pathVisitedCells: options.pathVisitedCells,
    pathReason: options.pathReason,
    pathReasonRu: options.pathReasonRu,
  };
}
