import type { AiRouteStatus, AiRouteStatusState } from '../AiRouteStatus';
import type { GridPosition } from '../../geometry';
import type {
  MoveOrder,
  MoveOrderRouteCell,
  MoveOrderRouteStatus,
  MoveOrderSource,
} from '../../orders/MoveOrder';
import {
  cloneAiRuntimeSession,
  normalizeAiRuntimeSession,
  type AiRuntimeSessionSnapshotV1,
} from './AiRuntimeSession';

export interface SerializedMoveOrder {
  readonly type: 'move';
  readonly target: GridPosition;
  readonly issuedAtMs: number;
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

export interface AiRuntimeSceneSnapshotV1 {
  readonly version: 1;
  readonly session: AiRuntimeSessionSnapshotV1;
  readonly activeOrder?: SerializedMoveOrder;
  readonly routeStatus?: AiRouteStatusState;
}

export interface NormalizeAiRuntimeSceneSnapshotContext {
  readonly unitId: string;
  readonly expectedGraphId?: string;
}

export interface NormalizeAiRuntimeSceneSnapshotResult {
  readonly snapshot?: AiRuntimeSceneSnapshotV1;
  readonly restored: boolean;
  readonly legacy: boolean;
  readonly message: string;
  readonly messageRu: string;
}

const ROUTE_STATUSES: readonly AiRouteStatus[] = [
  'idle',
  'moving',
  'stalled',
  'blocked',
  'arrived',
  'player_override',
  'target_lost',
  'order_missing',
  'cancelled',
];

const MOVE_ROUTE_STATUSES: readonly MoveOrderRouteStatus[] = ['planned', 'following', 'replanned'];
const MOVE_SOURCES: readonly MoveOrderSource[] = ['player', 'ai'];

export function buildAiRuntimeSceneSnapshot(
  session: AiRuntimeSessionSnapshotV1 | null | undefined,
  order: MoveOrder | null | undefined,
  routeStatus: AiRouteStatusState | null | undefined,
): AiRuntimeSceneSnapshotV1 | undefined {
  if (!session) return undefined;
  const activeOrder = isAiOwnedOrder(order) ? serializeMoveOrder(order) : undefined;
  const compatibleRouteStatus = activeOrder?.ownerToken
    && routeStatus?.ownerToken === activeOrder.ownerToken
    ? cloneRouteStatus(routeStatus)
    : undefined;
  return {
    version: 1,
    session: cloneAiRuntimeSession(session),
    activeOrder,
    routeStatus: compatibleRouteStatus,
  };
}

export function normalizeAiRuntimeSceneSnapshot(
  value: unknown,
  context: NormalizeAiRuntimeSceneSnapshotContext,
): NormalizeAiRuntimeSceneSnapshotResult {
  if (value === undefined || value === null) {
    return {
      restored: false,
      legacy: true,
      message: 'Old scene format loaded without an active AI action.',
      messageRu: 'Старый формат сцены загружен без активного действия ИИ.',
    };
  }
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.session)) {
    return resetResult(
      'Runtime scene snapshot version is missing or unsupported.',
      'Runtime сброшен: версия snapshot отсутствует или не поддерживается.',
    );
  }

  const rawGraphId = typeof value.session.graphId === 'string' ? value.session.graphId : '';
  const expectedGraphId = context.expectedGraphId ?? rawGraphId;
  if (!expectedGraphId) {
    return resetResult(
      'Runtime scene snapshot has no graph id.',
      'Runtime сброшен: в snapshot отсутствует id графа.',
    );
  }

  const normalizedSession = normalizeAiRuntimeSession(value.session, {
    graphId: expectedGraphId,
    unitId: context.unitId,
  });
  if (normalizedSession.resetReasonRu) {
    return resetResult(
      normalizedSession.resetReason ?? 'Runtime session is incompatible.',
      context.expectedGraphId && rawGraphId !== context.expectedGraphId
        ? 'Runtime сброшен: граф изменился.'
        : normalizedSession.resetReasonRu,
    );
  }

  const activeOrder = normalizeSerializedMoveOrder(value.activeOrder);
  const activeOwnerToken = readActiveMoveOwnerToken(normalizedSession.session);
  const hasCompatibleOrder = activeOrder
    && activeOrder.source === 'ai'
    && typeof activeOrder.ownerToken === 'string'
    && (!activeOwnerToken || activeOrder.ownerToken === activeOwnerToken);
  const restoredOrder = hasCompatibleOrder ? activeOrder : undefined;
  const routeStatus = restoredOrder?.ownerToken
    ? normalizeRouteStatus(value.routeStatus, restoredOrder.ownerToken)
    : undefined;

  return {
    snapshot: {
      version: 1,
      session: normalizedSession.session,
      activeOrder: restoredOrder,
      routeStatus,
    },
    restored: true,
    legacy: false,
    message: 'AI runtime restored.',
    messageRu: 'Runtime восстановлен.',
  };
}

export function serializeMoveOrder(order: MoveOrder): SerializedMoveOrder {
  return {
    type: 'move',
    target: { ...order.target },
    issuedAtMs: finiteNonNegative(order.issuedAtMs, 0),
    source: order.source,
    ownerToken: order.ownerToken,
    playerCommandId: order.playerCommandId,
    requestedTarget: clonePosition(order.requestedTarget),
    waypoints: order.waypoints?.map((point) => ({ ...point })),
    waypointIndex: integerNonNegative(order.waypointIndex),
    routeCells: order.routeCells?.map((cell) => ({ x: cell.x, y: cell.y })),
    routeCellIndex: integerNonNegative(order.routeCellIndex),
    routeStatus: order.routeStatus,
    routeRevision: integerNonNegative(order.routeRevision),
    pathCost: finiteOptional(order.pathCost),
    pathVisitedCells: integerNonNegative(order.pathVisitedCells),
    pathReason: order.pathReason,
    pathReasonRu: order.pathReasonRu,
  };
}

export function restoreMoveOrder(value: SerializedMoveOrder): MoveOrder {
  return {
    type: 'move',
    target: { ...value.target },
    issuedAtMs: value.issuedAtMs,
    source: value.source,
    ownerToken: value.ownerToken,
    playerCommandId: value.playerCommandId,
    requestedTarget: clonePosition(value.requestedTarget),
    waypoints: value.waypoints?.map((point) => ({ ...point })),
    waypointIndex: value.waypointIndex,
    routeCells: value.routeCells?.map((cell) => ({ x: cell.x, y: cell.y })),
    routeCellIndex: value.routeCellIndex,
    routeStatus: value.routeStatus,
    routeRevision: value.routeRevision,
    pathCost: value.pathCost,
    pathVisitedCells: value.pathVisitedCells,
    pathReason: value.pathReason,
    pathReasonRu: value.pathReasonRu,
  };
}

function normalizeSerializedMoveOrder(value: unknown): SerializedMoveOrder | undefined {
  if (!isRecord(value) || value.type !== 'move' || !isPosition(value.target)) return undefined;
  const source = MOVE_SOURCES.includes(value.source as MoveOrderSource)
    ? value.source as MoveOrderSource
    : undefined;
  const routeStatus = MOVE_ROUTE_STATUSES.includes(value.routeStatus as MoveOrderRouteStatus)
    ? value.routeStatus as MoveOrderRouteStatus
    : undefined;
  const waypoints = normalizePositions(value.waypoints);
  const routeCells = normalizeRouteCells(value.routeCells);
  return {
    type: 'move',
    target: cloneRequiredPosition(value.target),
    issuedAtMs: finiteNonNegative(value.issuedAtMs, 0),
    source,
    ownerToken: typeof value.ownerToken === 'string' ? value.ownerToken : undefined,
    playerCommandId: typeof value.playerCommandId === 'string' ? value.playerCommandId : undefined,
    requestedTarget: isPosition(value.requestedTarget) ? cloneRequiredPosition(value.requestedTarget) : undefined,
    waypoints,
    waypointIndex: integerNonNegative(value.waypointIndex),
    routeCells,
    routeCellIndex: integerNonNegative(value.routeCellIndex),
    routeStatus,
    routeRevision: integerNonNegative(value.routeRevision),
    pathCost: finiteOptional(value.pathCost),
    pathVisitedCells: integerNonNegative(value.pathVisitedCells),
    pathReason: typeof value.pathReason === 'string' ? value.pathReason : undefined,
    pathReasonRu: typeof value.pathReasonRu === 'string' ? value.pathReasonRu : undefined,
  };
}

function normalizeRouteStatus(value: unknown, ownerToken: string): AiRouteStatusState | undefined {
  if (!isRecord(value)
    || value.version !== 1
    || value.ownerToken !== ownerToken
    || !isPosition(value.target)
    || !ROUTE_STATUSES.includes(value.status as AiRouteStatus)) {
    return undefined;
  }
  return {
    version: 1,
    ownerToken,
    target: cloneRequiredPosition(value.target),
    startedAtMs: finiteNonNegative(value.startedAtMs, 0),
    lastCheckedAtMs: finiteNonNegative(value.lastCheckedAtMs, 0),
    lastProgressAtMs: finiteNonNegative(value.lastProgressAtMs, 0),
    lastDistanceCells: finiteNonNegative(value.lastDistanceCells, 0),
    status: value.status as AiRouteStatus,
    abortCode: typeof value.abortCode === 'string' ? value.abortCode as AiRouteStatusState['abortCode'] : undefined,
    abortReason: typeof value.abortReason === 'string' ? value.abortReason : undefined,
    abortReasonRu: typeof value.abortReasonRu === 'string' ? value.abortReasonRu : undefined,
  };
}

function cloneRouteStatus(value: AiRouteStatusState): AiRouteStatusState {
  return { ...value, target: { ...value.target } };
}

function readActiveMoveOwnerToken(session: AiRuntimeSessionSnapshotV1): string | undefined {
  const data = session.executionState?.activeData;
  return data?.kind === 'move_to_blackboard_position' ? data.actionToken : undefined;
}

function isAiOwnedOrder(order: MoveOrder | null | undefined): order is MoveOrder {
  return Boolean(order && (order.source === 'ai' || order.ownerToken));
}

function normalizePositions(value: unknown): GridPosition[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const positions = value.filter(isPosition).map(cloneRequiredPosition);
  return positions.length === value.length ? positions : undefined;
}

function normalizeRouteCells(value: unknown): MoveOrderRouteCell[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const cells: MoveOrderRouteCell[] = [];
  for (const item of value) {
    if (!isRecord(item) || !Number.isInteger(item.x) || !Number.isInteger(item.y)) return undefined;
    cells.push({ x: item.x as number, y: item.y as number });
  }
  return cells;
}

function clonePosition(value: GridPosition | undefined): GridPosition | undefined {
  return value ? { ...value } : undefined;
}

function cloneRequiredPosition(value: GridPosition): GridPosition {
  return { x: value.x, y: value.y };
}

function isPosition(value: unknown): value is GridPosition {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

function integerNonNegative(value: unknown): number | undefined {
  return Number.isInteger(value) && (value as number) >= 0 ? value as number : undefined;
}

function finiteOptional(value: unknown): number | undefined {
  return isFiniteNumber(value) ? value : undefined;
}

function finiteNonNegative(value: unknown, fallback: number): number {
  return isFiniteNumber(value) ? Math.max(0, value) : fallback;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resetResult(message: string, messageRu: string): NormalizeAiRuntimeSceneSnapshotResult {
  return {
    restored: false,
    legacy: false,
    message,
    messageRu,
  };
}
