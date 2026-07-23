import {
  cancelPhysicalAction,
  completePhysicalAction,
  getPhysicalActionLease,
  isPhysicalActionChannelAvailable,
  requestPhysicalActionChannels,
  setPhysicalActionCoordinatorDiagnostic,
} from '../actions/PhysicalActionCoordinator';
import { normalizePhysicalActionHandle } from '../actions/PhysicalActionCoordinatorSerialization';
import {
  movementPostureOwnerToken,
  requestPostureTransition,
} from '../actions/PostureTransition';
import { tickPostureTransitionWithTimeBudget } from '../actions/PostureTransitionClock';
import type { UnitPosture } from '../behavior/BehaviorModel';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';
import {
  DEFAULT_MOVEMENT_PROFILE_ID,
  resolveMovementProfile,
  type MovementGait,
  type MovementProfile,
  type MovementProfileSource,
  type MovementWeaponPreparationState,
} from './MovementProfiles';
import * as legacy from './MovementRuntimeLegacy';

export * from './MovementRuntimeLegacy';

export const MOVEMENT_WEAPON_PREPARATION_ACTION_TYPE = 'movement_weapon_preparation' as const;

const MOVEMENT_PREPARATION_CHANNELS = ['locomotion', 'weapon'] as const;
const REQUIRED_GAIT_POSTURES: Partial<Record<MovementGait, UnitPosture>> = {
  crawl: 'prone',
  crouch_walk: 'crouched',
  sprint: 'standing',
};

export function createMovementRuntime(
  requestedProfileId: string = DEFAULT_MOVEMENT_PROFILE_ID,
  requestedGait: MovementGait = 'walk',
  input?: unknown,
): legacy.MovementRuntimeState {
  const runtime = legacy.createMovementRuntime(requestedProfileId, requestedGait, input);
  const record = isRecord(input) ? input : {};
  const preparation = isRecord(record.weaponPreparation) ? record.weaponPreparation : null;
  if (runtime.weaponPreparation) {
    runtime.weaponPreparation.actionHandle = normalizePhysicalActionHandle(preparation?.actionHandle);
  }
  return runtime;
}

export function setMovementProfileRequest(
  state: SimulationState,
  unit: UnitModel,
  profileId: string,
  source: MovementProfileSource,
  gait?: MovementGait,
): void {
  cancelMovementWeaponPreparation(unit, undefined, 'movement_weapon_preparation_profile_replaced', 'Подготовка оружия отменена сменой профиля движения.');
  legacy.setMovementProfileRequest(state, unit, profileId, source, gait);
}

export function setMovementRequest(
  unit: UnitModel,
  profileId: string,
  source: MovementProfileSource,
  gait?: MovementGait,
): void {
  cancelMovementWeaponPreparation(unit, undefined, 'movement_weapon_preparation_request_replaced', 'Подготовка оружия отменена новой командой движения.');
  legacy.setMovementRequest(unit, profileId, source, gait);
}

export function requestMovementWeaponPreparation(
  state: SimulationState,
  unit: UnitModel,
  request: legacy.MovementWeaponPreparationRequest,
): { allowed: boolean; reasonRu: string; handle: legacy.MovementWeaponPreparationHandle | null } {
  const runtime = unit.movementRuntime;
  const profile = resolveMovementProfile(state.movementProfiles, runtime.effectiveProfileId || runtime.requestedProfileId);
  let current = runtime.weaponPreparation;

  if (current && current.ownerToken === request.ownerToken && current.contactId === request.contactId) {
    if (!hasExactPreparationLease(unit, current)) {
      runtime.weaponPreparation = null;
      setPhysicalActionCoordinatorDiagnostic(
        unit,
        'movement_weapon_preparation_lease_lost',
        'Подготовка оружия отменена: захват физических каналов потерян.',
      );
      current = null;
    } else if (current.remainingSeconds > 1e-9) {
      return {
        allowed: false,
        reasonRu: 'Боец останавливается и подготавливает оружие после движения.',
        handle: { ownerToken: current.ownerToken, revision: current.revision },
      };
    } else {
      completePreparation(unit, current, state.simulationTimeSeconds);
      return {
        allowed: true,
        reasonRu: '',
        handle: { ownerToken: current.ownerToken, revision: current.revision },
      };
    }
  }

  if (current) {
    cancelMovementWeaponPreparation(
      unit,
      { ownerToken: current.ownerToken, revision: current.revision, contactId: current.contactId },
      'movement_weapon_preparation_contact_replaced',
      'Подготовка оружия отменена из-за смены цели.',
    );
  }

  if (!runtime.isMoving || profile.settings.weapon.allowFireWhileMoving) {
    return { allowed: true, reasonRu: '', handle: null };
  }

  const acquisition = requestPhysicalActionChannels(unit, {
    actionType: MOVEMENT_WEAPON_PREPARATION_ACTION_TYPE,
    owner: { source: 'movement', id: request.contactId },
    ownerToken: request.ownerToken,
    channels: MOVEMENT_PREPARATION_CHANNELS,
    startedSeconds: state.simulationTimeSeconds,
    reasonCode: 'movement_weapon_preparation_started',
    reasonRu: 'Боец останавливается и подготавливает оружие после движения.',
  });
  if (!acquisition.accepted || !acquisition.handle) {
    return {
      allowed: false,
      reasonRu: acquisition.reasonRu,
      handle: null,
    };
  }

  runtime.weaponPreparationRevision += 1;
  const pending: MovementWeaponPreparationState = {
    ownerToken: request.ownerToken,
    contactId: request.contactId,
    orderIssuedAtMs: unit.order?.issuedAtMs ?? null,
    remainingSeconds: Math.max(0, profile.settings.speed.stopDelaySeconds + profile.settings.weapon.readyDelayAfterStopSeconds),
    revision: runtime.weaponPreparationRevision,
    actionHandle: { ...acquisition.handle },
  };
  runtime.weaponPreparation = pending;
  runtime.isMoving = false;
  runtime.velocityCellsPerSecond = { x: 0, y: 0 };

  const adapterHandle = { ownerToken: pending.ownerToken, revision: pending.revision };
  if (pending.remainingSeconds <= 1e-9) {
    completePreparation(unit, pending, state.simulationTimeSeconds);
    return { allowed: true, reasonRu: '', handle: adapterHandle };
  }
  return {
    allowed: false,
    reasonRu: 'Боец останавливается и подготавливает оружие после движения.',
    handle: adapterHandle,
  };
}

export function cancelMovementWeaponPreparation(
  unit: UnitModel,
  expected?: Partial<legacy.MovementWeaponPreparationHandle> & { contactId?: string },
  resultCode = 'movement_weapon_preparation_cancelled',
  resultRu = 'Подготовка оружия после движения отменена.',
): boolean {
  const current = unit.movementRuntime.weaponPreparation;
  if (!current) return false;
  if (expected?.ownerToken !== undefined && current.ownerToken !== expected.ownerToken) return false;
  if (expected?.revision !== undefined && current.revision !== expected.revision) return false;
  if (expected?.contactId !== undefined && current.contactId !== expected.contactId) return false;

  const lease = current.actionHandle ? getPhysicalActionLease(unit, current.actionHandle) : null;
  if (current.actionHandle && lease) {
    cancelPhysicalAction(unit, current.actionHandle, {
      endedSeconds: lease.startedSeconds,
      resultCode,
      resultRu,
    });
  } else if (current.actionHandle || current.remainingSeconds > 1e-9) {
    setPhysicalActionCoordinatorDiagnostic(unit, 'movement_weapon_preparation_lease_lost', 'Подготовка оружия удалена без соответствующего захвата каналов.');
  }
  unit.movementRuntime.weaponPreparation = null;
  unit.movementRuntime.isMoving = false;
  unit.movementRuntime.velocityCellsPerSecond = { x: 0, y: 0 };
  return true;
}

export function getMovementWeaponPreparation(unit: UnitModel): MovementWeaponPreparationState | null {
  const value = unit.movementRuntime.weaponPreparation;
  return value ? {
    ...value,
    actionHandle: value.actionHandle ? { ...value.actionHandle } : null,
  } : null;
}

export function serializeMovementRuntime(runtime: legacy.MovementRuntimeState): legacy.MovementRuntimeState {
  const serialized = legacy.serializeMovementRuntime(runtime);
  if (serialized.weaponPreparation) {
    serialized.weaponPreparation.actionHandle = runtime.weaponPreparation?.actionHandle
      ? { ...runtime.weaponPreparation.actionHandle }
      : null;
  }
  return serialized;
}

export function preparePhysicalMovementStep(
  state: SimulationState,
  unit: UnitModel,
  deltaSeconds: number,
  canTranslate: boolean,
  postureMultiplier: number,
  woundMultiplier: number,
): legacy.MovementStep {
  const preparationBefore = clonePreparation(unit.movementRuntime.weaponPreparation);
  const ownPreparationLease = preparationBefore && hasExactPreparationLease(unit, preparationBefore)
    ? getPhysicalActionLease(unit, preparationBefore.actionHandle!)
    : null;

  if (preparationBefore && !ownPreparationLease) {
    unit.movementRuntime.weaponPreparation = null;
    unit.movementRuntime.isMoving = false;
    unit.movementRuntime.velocityCellsPerSecond = { x: 0, y: 0 };
    setPhysicalActionCoordinatorDiagnostic(
      unit,
      'movement_weapon_preparation_lease_lost',
      'Подготовка оружия остановлена: захват физических каналов потерян.',
    );
    return zeroMovementStep(legacy.preparePhysicalMovementStep(state, unit, 0, false, postureMultiplier, woundMultiplier));
  }

  const locomotionAvailable = isPhysicalActionChannelAvailable(unit, 'locomotion')
    || Boolean(ownPreparationLease?.channels.includes('locomotion'));
  if (!locomotionAvailable) {
    unit.movementRuntime.isMoving = false;
    unit.movementRuntime.velocityCellsPerSecond = { x: 0, y: 0 };
    return zeroMovementStep(legacy.preparePhysicalMovementStep(state, unit, 0, false, postureMultiplier, woundMultiplier));
  }

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

  if (preparationBefore && unit.movementRuntime.weaponPreparation === null && preparationBefore.actionHandle) {
    const tickStart = Math.max(0, state.simulationTimeSeconds - Math.max(0, deltaSeconds));
    completePhysicalAction(unit, preparationBefore.actionHandle, {
      endedSeconds: tickStart + Math.min(Math.max(0, deltaSeconds), preparationBefore.remainingSeconds),
      resultCode: 'movement_weapon_preparation_completed',
      resultRu: 'Остановка и подготовка оружия завершены.',
    });
  }

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

function completePreparation(unit: UnitModel, pending: MovementWeaponPreparationState, endedSeconds: number): void {
  if (pending.actionHandle && getPhysicalActionLease(unit, pending.actionHandle)) {
    completePhysicalAction(unit, pending.actionHandle, {
      endedSeconds: Math.max(0, endedSeconds),
      resultCode: 'movement_weapon_preparation_completed',
      resultRu: 'Остановка и подготовка оружия завершены.',
    });
  }
  unit.movementRuntime.weaponPreparation = null;
}

function hasExactPreparationLease(unit: UnitModel, preparation: MovementWeaponPreparationState): boolean {
  return Boolean(preparation.actionHandle && getPhysicalActionLease(unit, preparation.actionHandle));
}

function clonePreparation(value: MovementWeaponPreparationState | null): MovementWeaponPreparationState | null {
  return value ? {
    ...value,
    actionHandle: value.actionHandle ? { ...value.actionHandle } : null,
  } : null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
