import type { GridPosition } from '../core/geometry';
import type { TacticalMap } from '../core/map/MapModel';
import type { UnitPosture } from '../core/behavior/BehaviorModel';
import type {
  TacticalTraversalAttentionPolicy,
  TacticalTraversalBodyFacingPolicy,
} from '../core/navigation/TacticalTraversalPlan';
import { isPlayerCommandOutstanding } from '../core/orders/PlayerCommand';
import type { UnitPlanStageStatus } from '../core/ai/UnitPlan';
import type { UnitModel } from '../core/units/UnitModel';

export interface CommandOverlaySnapshot {
  readonly target: GridPosition;
  readonly status: 'active' | 'blocked';
  readonly finalFacingRadians: number | null;
}

export interface PlanStageOverlaySnapshot {
  readonly id: string;
  readonly labelRu: string;
  readonly status: UnitPlanStageStatus;
  readonly target: GridPosition | null;
}

export interface TraversalSegmentOverlaySnapshot {
  readonly id: string;
  readonly movementProfileId: string;
  readonly posture: UnitPosture;
  readonly points: readonly GridPosition[];
  readonly active: boolean;
  readonly bodyFacingPolicy: TacticalTraversalBodyFacingPolicy;
  readonly attentionPolicy: TacticalTraversalAttentionPolicy;
  readonly bodyFacingRadians: number | null;
  readonly attentionCenterRadians: number | null;
  readonly attentionArcRadians: number | null;
}

export interface CommandPlanRouteOverlaySnapshot {
  readonly key: string;
  readonly unitId: string;
  readonly selected: boolean;
  readonly unitPosition: GridPosition;
  readonly command: CommandOverlaySnapshot | null;
  readonly planLabelRu: string | null;
  readonly activeStageIndex: number;
  readonly planStages: readonly PlanStageOverlaySnapshot[];
  readonly routePoints: readonly GridPosition[];
  readonly traversalSegments: readonly TraversalSegmentOverlaySnapshot[];
  readonly currentWaypointIndex: number;
  readonly waypointCount: number;
}

export function buildCommandPlanRouteOverlaySnapshot(
  map: TacticalMap,
  unit: UnitModel,
  selected: boolean,
): CommandPlanRouteOverlaySnapshot {
  const playerCommand = unit.playerCommand;
  const command = playerCommand && isPlayerCommandOutstanding(playerCommand)
    ? {
        target: { ...playerCommand.target },
        status: playerCommand.status as 'active' | 'blocked',
        finalFacingRadians: playerCommand.finalFacingRadians ?? null,
      }
    : null;
  const activePlan = selected && unit.plan?.status === 'active' ? unit.plan : null;
  const planStages = (activePlan?.stages ?? []).map((stage) => ({
    id: stage.id,
    labelRu: stage.labelRu,
    status: stage.status,
    target: stage.target ? { ...stage.target } : null,
  }));
  const traversalSegments = selected ? buildTraversalSegments(unit) : [];
  const routePoints = selected && traversalSegments.length === 0 ? remainingRoutePoints(unit) : [];
  const currentWaypointIndex = unit.order?.waypointIndex ?? 0;
  const waypointCount = unit.order?.waypoints?.length ?? (unit.order ? 1 : 0);
  const key = [
    `u:${unit.id}`,
    `s:${selected ? 1 : 0}`,
    `p:${pointKey(unit.position)}`,
    `m:${map.cellSize}`,
    `c:${unit.playerCommand?.revision ?? 0}:${unit.playerCommand?.status ?? 'none'}:${command ? pointKey(command.target) : '-'}:${command?.finalFacingRadians?.toFixed(4) ?? '-'}`,
    `plan:${unit.plan?.revision ?? 0}:${unit.plan?.status ?? 'none'}`,
    `order:${unit.order?.issuedAtMs ?? 0}:${unit.order?.routeRevision ?? 0}:${currentWaypointIndex}:${waypointCount}:${unit.order ? pointKey(unit.order.target) : '-'}`,
    `traversal:${unit.order?.traversalPlanRevision ?? 0}:${unit.order?.traversalPlanStatus ?? 'none'}:${unit.order?.activeTraversalSegmentIndex ?? -1}:${unit.order?.routeCellIndex ?? 0}`,
  ].join('|');

  return {
    key,
    unitId: unit.id,
    selected,
    unitPosition: { ...unit.position },
    command,
    planLabelRu: activePlan?.branchLabelRu ?? null,
    activeStageIndex: activePlan?.activeStageIndex ?? 0,
    planStages,
    routePoints,
    traversalSegments,
    currentWaypointIndex,
    waypointCount,
  };
}

function buildTraversalSegments(unit: UnitModel): TraversalSegmentOverlaySnapshot[] {
  const order = unit.order;
  const plan = order?.traversalPlan;
  const route = order?.routeCells;
  if (!order || order.traversalPlanStatus !== 'ready' || !plan || !route || route.length === 0) return [];
  const currentRouteIndex = Math.max(0, Math.min(route.length - 1, order.routeCellIndex ?? 0));
  const activeIndex = Math.max(0, order.activeTraversalSegmentIndex ?? 0);
  const result: TraversalSegmentOverlaySnapshot[] = [];
  for (let segmentIndex = activeIndex; segmentIndex < plan.segments.length; segmentIndex += 1) {
    const segment = plan.segments[segmentIndex]!;
    const start = Math.max(currentRouteIndex, segment.startRouteCellIndex);
    const end = Math.min(route.length - 1, segment.endRouteCellIndex);
    if (end < start) continue;
    const points: GridPosition[] = [];
    if (segmentIndex === activeIndex) points.push({ ...unit.position });
    for (let routeIndex = start; routeIndex <= end; routeIndex += 1) {
      const cell = route[routeIndex]!;
      const point = { x: cell.x + 0.5, y: cell.y + 0.5 };
      const previous = points[points.length - 1];
      if (!previous || Math.hypot(previous.x - point.x, previous.y - point.y) > 0.001) points.push(point);
    }
    if (points.length < 2) continue;
    result.push({
      id: segment.id,
      movementProfileId: segment.movementProfileId,
      posture: segment.posture,
      points,
      active: segmentIndex === activeIndex,
      bodyFacingPolicy: segment.bodyFacingPolicy,
      attentionPolicy: segment.attentionPolicy,
      bodyFacingRadians: segment.resolvedBodyFacingRadians,
      attentionCenterRadians: segment.resolvedAttentionCenterRadians,
      attentionArcRadians: segment.attentionArcRadians,
    });
  }
  return result;
}

function remainingRoutePoints(unit: UnitModel): GridPosition[] {
  const order = unit.order;
  if (!order) return [];
  const points = order.waypoints && order.waypoints.length > 0
    ? order.waypoints.slice(Math.max(0, order.waypointIndex ?? 0))
    : [order.target];
  return [{ ...unit.position }, ...points.map((point) => ({ ...point }))];
}

function pointKey(point: GridPosition): string {
  return `${finite(point.x).toFixed(3)}:${finite(point.y).toFixed(3)}`;
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
