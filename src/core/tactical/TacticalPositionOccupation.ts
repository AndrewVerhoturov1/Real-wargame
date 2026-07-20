import type { UnitPosture } from '../behavior/BehaviorModel';
import { releasePlayerCommandTacticalPosition } from '../orders/PlayerCommand';
import { updateAttentionController } from '../perception/AttentionController';
import type { UnitModel } from '../units/UnitModel';

/**
 * Tactical-position occupation is serialized inside PlayerCommand. This module
 * only applies the command-owned approach/arrival contract; it owns no hidden
 * per-object state and performs no perpetual occupied-state correction.
 */
export function reconcileTacticalPositionOccupation(unit: UnitModel): void {
  const command = unit.playerCommand;
  if (!command?.arrivalPosture) return;

  if (
    unit.order
    && unit.order.playerCommandId !== command.id
    && command.tacticalPositionOccupationStatus !== 'released'
  ) {
    unit.playerCommand = releasePlayerCommandTacticalPosition(
      command,
      'Tactical position released by an unrelated route.',
      'Занятая тактическая позиция освобождена новым маршрутом.',
    );
    return;
  }

  if (
    command.status !== 'active'
    || command.tacticalPositionOccupationStatus !== 'approaching'
    || !unit.order
    || unit.order.playerCommandId !== command.id
  ) return;

  // A ready traversal plan owns posture during movement. approachPosture remains
  // the safe fallback while the plan is pending, stale, failed or unavailable.
  if (
    unit.order.traversalPlanStatus === 'ready'
    && unit.order.traversalPlan
    && unit.order.traversalPlan.segments.length > 0
  ) return;

  enforcePosture(
    unit,
    command.approachPosture ?? 'standing',
    'tactical_position_approach_fallback',
  );
}

export function applyCompletedTacticalPositionOccupation(unit: UnitModel): boolean {
  const command = unit.playerCommand;
  if (
    !command?.arrivalPosture
    || command.status !== 'completed'
    || command.tacticalPositionOccupationStatus === 'released'
    || unit.order
  ) return false;

  enforcePosture(unit, command.arrivalPosture, 'tactical_position_arrival');
  const facing = finiteFacing(command.finalFacingRadians);
  if (facing !== null && angularDistance(unit.facingRadians, facing) > 0.0001) {
    unit.facingRadians = facing;
    if (unit.attentionRuntime.mode === 'search') unit.attentionRuntime.searchCenterRadians = facing;
    updateAttentionController(unit, 0);
  }
  return true;
}

export function isTacticalPositionOccupationActive(unit: UnitModel): boolean {
  const command = unit.playerCommand;
  return Boolean(
    command?.arrivalPosture
    && command.arrivalPostureApplied
    && command.status === 'completed'
    && command.tacticalPositionOccupationStatus === 'occupied'
    && !unit.order,
  );
}

export function occupiedTacticalPositionPosture(unit: UnitModel): UnitPosture | null {
  return isTacticalPositionOccupationActive(unit)
    ? unit.playerCommand?.arrivalPosture ?? null
    : null;
}

function enforcePosture(
  unit: UnitModel,
  posture: UnitPosture,
  reason: string,
): void {
  if (unit.behaviorRuntime.posture === posture) return;
  unit.behaviorRuntime.previousPosture = unit.behaviorRuntime.posture;
  unit.behaviorRuntime.posture = posture;
  unit.behaviorRuntime.postureChangedBecause = reason;
}

function finiteFacing(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function angularDistance(left: number, right: number): number {
  return Math.abs(Math.atan2(Math.sin(left - right), Math.cos(left - right)));
}
