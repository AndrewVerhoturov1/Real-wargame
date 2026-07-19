import type { UnitPosture } from '../behavior/BehaviorModel';
import { updateAttentionController } from '../perception/AttentionController';
import type { UnitModel } from '../units/UnitModel';

interface TacticalPositionOccupationState {
  commandId: string;
  posture: UnitPosture;
  facingRadians: number | null;
  active: boolean;
}

const occupationByUnit = new WeakMap<UnitModel, TacticalPositionOccupationState>();

export function registerTacticalPositionOccupation(
  unit: UnitModel,
  commandId: string,
  posture: UnitPosture,
  facingRadians: number | null,
): void {
  occupationByUnit.set(unit, {
    commandId,
    posture,
    facingRadians: finiteFacing(facingRadians),
    active: false,
  });
}

export function activateTacticalPositionOccupation(
  unit: UnitModel,
  commandId: string,
  posture: UnitPosture,
  facingRadians: number | null,
): void {
  occupationByUnit.set(unit, {
    commandId,
    posture,
    facingRadians: finiteFacing(facingRadians),
    active: true,
  });
  enforceOccupation(unit, posture, facingRadians);
}

export function activateRegisteredTacticalPositionOccupation(
  unit: UnitModel,
  commandId: string,
  fallbackPosture: UnitPosture,
): void {
  const registered = occupationByUnit.get(unit);
  activateTacticalPositionOccupation(
    unit,
    commandId,
    registered?.commandId === commandId ? registered.posture : fallbackPosture,
    registered?.commandId === commandId ? registered.facingRadians : null,
  );
}

export function reconcileTacticalPositionOccupation(unit: UnitModel): void {
  const occupation = occupationByUnit.get(unit);
  if (!occupation?.active) return;

  if (unit.order || unit.playerCommand?.id !== occupation.commandId) {
    occupationByUnit.delete(unit);
    return;
  }

  enforceOccupation(unit, occupation.posture, occupation.facingRadians);
}

export function clearTacticalPositionOccupation(unit: UnitModel): void {
  occupationByUnit.delete(unit);
}

function enforceOccupation(
  unit: UnitModel,
  posture: UnitPosture,
  facingRadians: number | null,
): void {
  if (unit.behaviorRuntime.posture !== posture) {
    unit.behaviorRuntime.previousPosture = unit.behaviorRuntime.posture;
    unit.behaviorRuntime.posture = posture;
    unit.behaviorRuntime.postureChangedBecause = 'tactical_position_occupied';
  }

  const facing = finiteFacing(facingRadians);
  if (facing !== null && angularDistance(unit.facingRadians, facing) > 0.0001) {
    unit.facingRadians = facing;
    if (unit.attentionRuntime.mode === 'search') unit.attentionRuntime.searchCenterRadians = facing;
    updateAttentionController(unit, 0);
  }
}

function finiteFacing(value: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function angularDistance(left: number, right: number): number {
  return Math.abs(Math.atan2(Math.sin(left - right), Math.cos(left - right)));
}
