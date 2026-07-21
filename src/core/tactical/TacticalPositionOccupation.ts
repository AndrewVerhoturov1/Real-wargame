import {
  cancelPostureTransition,
  isPostureTransitionRunning,
  postureOwnerTokenForPlayerCommand,
  requestPostureTransition,
} from '../actions/PostureTransition';
import type { UnitPosture } from '../behavior/BehaviorModel';
import { releasePlayerCommandTacticalPosition } from '../orders/PlayerCommand';
import { updateAttentionController } from '../perception/AttentionController';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';

/**
 * Tactical-position occupation is serialized inside PlayerCommand. This module
 * applies the command-owned approach/arrival contract through the common
 * physical posture action; it owns no hidden per-object state.
 */
export function reconcileTacticalPositionOccupation(state: SimulationState, unit: UnitModel): void {
  const command = unit.playerCommand;
  if (!command?.arrivalPosture) return;

  if (
    unit.order
    && unit.order.playerCommandId !== command.id
    && command.tacticalPositionOccupationStatus !== 'released'
  ) {
    cancelPostureTransition(
      unit,
      postureOwnerTokenForPlayerCommand(command.id),
      'tactical_position_released_by_route',
      'Смена позы отменена: тактическая позиция освобождена новым маршрутом.',
    );
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

  requestCommandPosture(
    state,
    unit,
    command.approachPosture ?? 'standing',
    'tactical_position_approach',
    'Боец физически принимает позу подхода к тактической позиции.',
  );
}

export function applyCompletedTacticalPositionOccupation(
  state: SimulationState,
  unit: UnitModel,
): boolean {
  const command = unit.playerCommand;
  if (
    !command?.arrivalPosture
    || command.status !== 'completed'
    || command.tacticalPositionOccupationStatus === 'released'
    || unit.order
  ) return false;

  const result = requestCommandPosture(
    state,
    unit,
    command.arrivalPosture,
    'tactical_position_arrival',
    'Боец физически принимает позу прибытия в тактическую позицию.',
  );
  if (!result.accepted) return false;
  if (isPostureTransitionRunning(unit) || unit.behaviorRuntime.posture !== command.arrivalPosture) return false;

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
  // MovementRuntime already calls this canonical guard before applying a gait
  // posture. Returning the current effective posture while any transition is
  // running prevents a second subsystem from changing the silhouette mid-tick.
  if (isPostureTransitionRunning(unit)) return unit.behaviorRuntime.posture;
  return isTacticalPositionOccupationActive(unit)
    ? unit.playerCommand?.arrivalPosture ?? null
    : null;
}

function requestCommandPosture(
  state: SimulationState,
  unit: UnitModel,
  posture: UnitPosture,
  reasonCode: string,
  reasonRu: string,
) {
  const command = unit.playerCommand;
  if (!command) {
    return {
      accepted: false,
      action: unit.behaviorRuntime.physicalAction ?? null,
      reasonCode: 'tactical_position_command_missing',
      reasonRu: 'Команда тактической позиции отсутствует.',
    };
  }
  return requestPostureTransition(unit, {
    targetPosture: posture,
    owner: { source: 'tactical_position', id: command.id },
    ownerToken: postureOwnerTokenForPlayerCommand(command.id),
    startedSeconds: state.simulationTimeSeconds,
    reasonCode,
    reasonRu,
  });
}

function finiteFacing(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function angularDistance(left: number, right: number): number {
  return Math.abs(Math.atan2(Math.sin(left - right), Math.cos(left - right)));
}
