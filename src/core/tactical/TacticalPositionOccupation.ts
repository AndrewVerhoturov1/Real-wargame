import type { UnitPosture } from '../behavior/BehaviorModel';
import { updateAttentionController } from '../perception/AttentionController';
import type { UnitModel } from '../units/UnitModel';

/**
 * Tactical-position occupation is serialized inside PlayerCommand. This module
 * only applies the command-owned approach/arrival contract; it owns no hidden
 * per-object state and performs no perpetual occupied-state correction.
 */
export function reconcileTacticalPositionOccupation(unit: UnitModel): void {
  const command = unit.playerCommand;
  if (
    !command?.arrivalPosture
    || command.status !== 'active'
    || command.tacticalPositionOccupationStatus !== 'approaching'
    || !unit.order
    || unit.order.playerCommandId !== command.id
  ) return;

  enforcePosture(
    unit,
    command.approachPosture ?? 'standing',
    'tactical_position_approach',
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
