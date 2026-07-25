import type { SimulationState } from '../simulation/SimulationState';
import { getEffectiveCombatCapabilities } from '../infantry-combat/runtime/EffectiveCombatCapabilities';
import { getWeaponDeploymentPostureLock } from '../infantry-combat/runtime/WeaponDeploymentLocks';
import type { UnitModel } from '../units/UnitModel';
import {
  reconcileMovementPostureRequest as reconcileLegacyMovementPostureRequest,
  requestPlayerPostureTransition as requestLegacyPlayerPostureTransition,
  requestPostureTransition as requestLegacyPostureTransition,
  resolveMovementDesiredPosture,
  type PhysicalActionCommandResult,
  type RequestPostureTransitionInput,
} from './PostureTransitionLegacy.mjs';

export * from './PostureTransitionLegacy.mjs';

export function requestPostureTransition(
  unit: UnitModel,
  input: RequestPostureTransitionInput,
): PhysicalActionCommandResult {
  const deploymentLock = getWeaponDeploymentPostureLock(unit);
  if (deploymentLock.blocked) return deploymentPostureRejected(unit, deploymentLock.reasonCode!, deploymentLock.reasonRu!);
  const capabilities = getEffectiveCombatCapabilities(unit);
  if (!capabilities.alive || !capabilities.conscious) return postureCapabilityRejected(unit);
  if (input.targetPosture === 'standing' && !capabilities.canStand) return standingCapabilityRejected(unit);
  return requestLegacyPostureTransition(unit, input);
}

export function requestPlayerPostureTransition(
  unit: UnitModel,
  targetPosture: Parameters<typeof requestLegacyPlayerPostureTransition>[1],
  startedSeconds: number,
  ownerId = unit.id,
): PhysicalActionCommandResult {
  const deploymentLock = getWeaponDeploymentPostureLock(unit);
  if (deploymentLock.blocked) return deploymentPostureRejected(unit, deploymentLock.reasonCode!, deploymentLock.reasonRu!);
  const capabilities = getEffectiveCombatCapabilities(unit);
  if (!capabilities.alive || !capabilities.conscious) return postureCapabilityRejected(unit);
  if (targetPosture === 'standing' && !capabilities.canStand) return standingCapabilityRejected(unit);
  return requestLegacyPlayerPostureTransition(unit, targetPosture, startedSeconds, ownerId);
}

export function reconcileMovementPostureRequest(
  state: SimulationState,
  unit: UnitModel,
  startedSeconds = state.simulationTimeSeconds,
): PhysicalActionCommandResult | null {
  const deploymentLock = getWeaponDeploymentPostureLock(unit);
  if (deploymentLock.blocked) {
    unit.movementRuntime.isMoving = false;
    unit.movementRuntime.velocityCellsPerSecond = { x: 0, y: 0 };
    const desired = resolveMovementDesiredPosture(state, unit);
    return desired !== unit.behaviorRuntime.posture
      ? deploymentPostureRejected(unit, deploymentLock.reasonCode!, deploymentLock.reasonRu!)
      : null;
  }
  const capabilities = getEffectiveCombatCapabilities(unit);
  if (!capabilities.alive || !capabilities.conscious) {
    unit.movementRuntime.isMoving = false;
    unit.movementRuntime.velocityCellsPerSecond = { x: 0, y: 0 };
    return postureCapabilityRejected(unit);
  }
  const desired = resolveMovementDesiredPosture(state, unit);
  if (desired === 'standing' && !capabilities.canStand) {
    unit.movementRuntime.isMoving = false;
    unit.movementRuntime.velocityCellsPerSecond = { x: 0, y: 0 };
    return standingCapabilityRejected(unit);
  }
  return reconcileLegacyMovementPostureRequest(state, unit, startedSeconds);
}

function deploymentPostureRejected(unit: UnitModel, reasonCode: string, reasonRu: string): PhysicalActionCommandResult {
  unit.behaviorRuntime.reason = reasonRu;
  unit.behaviorRuntime.lastEvent = reasonCode;
  return { accepted: false, action: unit.behaviorRuntime.physicalAction, reasonCode, reasonRu };
}
function standingCapabilityRejected(unit: UnitModel): PhysicalActionCommandResult {
  unit.behaviorRuntime.reason = 'Физическое состояние не позволяет бойцу принять положение стоя.';
  unit.behaviorRuntime.lastEvent = 'posture_transition_cannot_stand';
  return {
    accepted: false,
    action: unit.behaviorRuntime.physicalAction,
    reasonCode: 'posture_transition_cannot_stand',
    reasonRu: 'Физическое состояние не позволяет бойцу принять положение стоя.',
  };
}
function postureCapabilityRejected(unit: UnitModel): PhysicalActionCommandResult {
  unit.behaviorRuntime.reason = 'Физическое состояние не позволяет бойцу менять позу.';
  unit.behaviorRuntime.lastEvent = 'posture_transition_capability_lost';
  return {
    accepted: false,
    action: unit.behaviorRuntime.physicalAction,
    reasonCode: 'posture_transition_capability_lost',
    reasonRu: 'Физическое состояние не позволяет бойцу менять позу.',
  };
}
