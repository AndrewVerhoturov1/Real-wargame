import {
  movementPostureOwnerToken,
  requestPostureTransition,
} from '../actions/PostureTransition';
import { tickPostureTransitionWithTimeBudget } from '../actions/PostureTransitionClock';
import type { UnitPosture } from '../behavior/BehaviorModel';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';
import type { MovementGait, MovementProfile } from './MovementProfiles';
import * as legacy from './MovementRuntimeLegacy';

export * from './MovementRuntimeLegacy';

const REQUIRED_GAIT_POSTURES: Partial<Record<MovementGait, UnitPosture>> = {
  crawl: 'prone',
  crouch_walk: 'crouched',
  sprint: 'standing',
};

export function preparePhysicalMovementStep(
  state: SimulationState,
  unit: UnitModel,
  deltaSeconds: number,
  canTranslate: boolean,
  postureMultiplier: number,
  woundMultiplier: number,
): legacy.MovementStep {
  const postureBefore = unit.behaviorRuntime.posture;
  const previousPosture = unit.behaviorRuntime.previousPosture;
  const postureChangedBecause = unit.behaviorRuntime.postureChangedBecause;
  const step = legacy.preparePhysicalMovementStep(
    state,
    unit,
    deltaSeconds,
    canTranslate,
    postureMultiplier,
    woundMultiplier,
  );

  // The compatibility implementation may discover a hard-safety gait only
  // while integrating this step. Convert that old instant write into the same
  // serializable physical action used everywhere else.
  const requestedPosture = unit.behaviorRuntime.posture;
  if (requestedPosture !== postureBefore) {
    unit.behaviorRuntime.posture = postureBefore;
    unit.behaviorRuntime.previousPosture = previousPosture;
    unit.behaviorRuntime.postureChangedBecause = postureChangedBecause;
    const ownerId = unit.order?.ownerToken ?? unit.order?.playerCommandId ?? unit.id;
    const request = requestPostureTransition(unit, {
      targetPosture: requestedPosture,
      owner: { source: 'movement', id: ownerId },
      ownerToken: movementPostureOwnerToken(ownerId),
      startedSeconds: Math.max(0, state.simulationTimeSeconds - deltaSeconds),
      reasonCode: 'movement_fallback_posture_required',
      reasonRu: 'Резервный профиль движения требует физически изменить позу.',
    });
    if (!request.accepted) return zeroMovementStep(step);
    const postureTick = tickPostureTransitionWithTimeBudget(unit, deltaSeconds, true);
    if (postureTick.remainingSeconds <= 0) return zeroMovementStep(step);
    const share = Math.min(1, postureTick.remainingSeconds / Math.max(deltaSeconds, Number.EPSILON));
    return {
      ...step,
      maxDistanceCells: step.maxDistanceCells * share,
      activeSeconds: step.activeSeconds * share,
    };
  }
  return step;
}

export function requiredPostureForMovementExecution(
  profile: MovementProfile,
  gait: MovementGait,
): UnitPosture | null {
  const structuralPosture = REQUIRED_GAIT_POSTURES[gait];
  if (structuralPosture) return structuralPosture;
  return profile.stancePolicy === 'adaptive' ? null : profile.stancePolicy;
}

function zeroMovementStep(step: legacy.MovementStep): legacy.MovementStep {
  return {
    ...step,
    maxDistanceCells: 0,
    activeSeconds: 0,
    speedCellsPerSecond: 0,
    staminaEnd: step.staminaStart,
  };
}
