import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';
import {
  reconcileMovementPostureRequest as reconcileLegacyMovementPostureRequest,
  requestPlayerPostureTransition as requestLegacyPlayerPostureTransition,
  requestPostureTransition as requestLegacyPostureTransition,
  resolveMovementDesiredPosture,
  type PhysicalActionCommandResult,
  type RequestPostureTransitionInput,
} from './PostureTransitionLegacy';

export * from './PostureTransitionLegacy';

export function requestPostureTransition(
  unit: UnitModel,
  input: RequestPostureTransitionInput,
): PhysicalActionCommandResult {
  if (input.targetPosture === 'standing' && !unit.infantryCombatRuntime.wounds.capabilities.canStand) {
    return standingCapabilityRejected(unit);
  }
  return requestLegacyPostureTransition(unit, input);
}

export function requestPlayerPostureTransition(
  unit: UnitModel,
  targetPosture: Parameters<typeof requestLegacyPlayerPostureTransition>[1],
  startedSeconds: number,
  ownerId = unit.id,
): PhysicalActionCommandResult {
  if (targetPosture === 'standing' && !unit.infantryCombatRuntime.wounds.capabilities.canStand) {
    return standingCapabilityRejected(unit);
  }
  return requestLegacyPlayerPostureTransition(unit, targetPosture, startedSeconds, ownerId);
}

export function reconcileMovementPostureRequest(
  state: SimulationState,
  unit: UnitModel,
  startedSeconds = state.simulationTimeSeconds,
): PhysicalActionCommandResult | null {
  const desired = resolveMovementDesiredPosture(state, unit);
  if (desired === 'standing' && !unit.infantryCombatRuntime.wounds.capabilities.canStand) {
    unit.movementRuntime.isMoving = false;
    unit.movementRuntime.velocityCellsPerSecond = { x: 0, y: 0 };
    return standingCapabilityRejected(unit);
  }
  return reconcileLegacyMovementPostureRequest(state, unit, startedSeconds);
}

function standingCapabilityRejected(unit: UnitModel): PhysicalActionCommandResult {
  unit.behaviorRuntime.reason = 'Ранение не позволяет бойцу принять положение стоя.';
  unit.behaviorRuntime.lastEvent = 'posture_transition_cannot_stand';
  return {
    accepted: false,
    action: unit.behaviorRuntime.physicalAction,
    reasonCode: 'posture_transition_cannot_stand',
    reasonRu: 'Ранение не позволяет бойцу принять положение стоя.',
  };
}
