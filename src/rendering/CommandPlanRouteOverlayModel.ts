import type { GridPosition } from '../core/geometry';
import type { TacticalMap } from '../core/map/MapModel';
import { isPlayerCommandOutstanding } from '../core/orders/PlayerCommand';
import type { UnitPlanStageStatus } from '../core/ai/UnitPlan';
import type { UnitModel } from '../core/units/UnitModel';

export interface CommandOverlaySnapshot {
  readonly target: GridPosition;
  readonly status: 'active' | 'blocked';
}

export interface PlanStageOverlaySnapshot {
  readonly id: string;
  readonly labelRu: string;
  readonly status: UnitPlanStageStatus;
  readonly target: GridPosition | null;
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
      }
    : null;
  const activePlan = selected && unit.plan?.status === 'active' ? unit.plan : null;
  const planStages = (activePlan?.stages ?? []).map((stage) => ({
    id: stage.id,
    labelRu: stage.labelRu,
    status: stage.status,
    target: stage.target ? { ...stage.target } : null,
  }));
  const routePoints = selected ? remainingRoutePoints(unit) : [];
  const currentWaypointIndex = unit.order?.waypointIndex ?? 0;
  const waypointCount = unit.order?.waypoints?.length ?? (unit.order ? 1 : 0);
  const key = [
    `u:${unit.id}`,
    `s:${selected ? 1 : 0}`,
    `p:${pointKey(unit.position)}`,
    `m:${map.cellSize}`,
    `c:${unit.playerCommand?.revision ?? 0}:${unit.playerCommand?.status ?? 'none'}:${command ? pointKey(command.target) : '-'}`,
    `plan:${unit.plan?.revision ?? 0}:${unit.plan?.status ?? 'none'}`,
    `order:${unit.order?.issuedAtMs ?? 0}:${unit.order?.routeRevision ?? 0}:${currentWaypointIndex}:${waypointCount}:${unit.order ? pointKey(unit.order.target) : '-'}`,
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
    currentWaypointIndex,
    waypointCount,
  };
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
