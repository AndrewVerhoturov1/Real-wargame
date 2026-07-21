import type { UnitPosture } from '../behavior/BehaviorModel';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';
import {
  PHYSICAL_ACTION_SCHEMA_VERSION,
  POSTURE_TRANSITION_ACTION_TYPE,
  acceptedPhysicalAction,
  clampPhysicalActionProgress,
  cleanPhysicalActionText,
  finiteNonNegativePhysicalActionNumber,
  finitePhysicalActionNumber,
  finitePositivePhysicalActionNumber,
  isPhysicalActionRecord,
  normalizePhysicalActionOwner,
  normalizePhysicalActionStatus,
  nullablePhysicalActionText,
  physicalActionInteger,
  rejectedPhysicalAction,
  type PhysicalActionBaseV1,
  type PhysicalActionCommandResult,
  type PhysicalActionOwner,
  type PhysicalActionOwnerSource,
  type PhysicalActionStatus,
  type UnitPhysicalAction,
} from './PhysicalAction';

export {
  PHYSICAL_ACTION_SCHEMA_VERSION,
  POSTURE_TRANSITION_ACTION_TYPE,
  type PhysicalActionCommandResult,
  type PhysicalActionOwner,
  type PhysicalActionOwnerSource,
  type PhysicalActionStatus,
  type UnitPhysicalAction,
} from './PhysicalAction';

export interface PostureTransitionActionV1 extends PhysicalActionBaseV1 {
  readonly type: typeof POSTURE_TRANSITION_ACTION_TYPE;
  readonly sourcePosture: UnitPosture;
  readonly targetPosture: UnitPosture;
}

export interface RequestPostureTransitionInput {
  readonly targetPosture: UnitPosture;
  readonly owner: PhysicalActionOwner;
  readonly ownerToken: string;
  readonly startedSeconds: number;
  readonly reasonCode: string;
  readonly reasonRu: string;
}

export interface PostureTransitionDiagnostics {
  readonly effectivePosture: UnitPosture;
  readonly sourcePosture: UnitPosture | null;
  readonly targetPosture: UnitPosture | null;
  readonly transitionRunning: boolean;
  readonly progress: number;
  readonly owner: PhysicalActionOwner | null;
  readonly ownerToken: string | null;
  readonly startReasonCode: string | null;
  readonly startReasonRu: string | null;
  readonly resultCode: string | null;
  readonly resultRu: string | null;
}

export const POSTURE_TRANSITION_DURATIONS_SECONDS = Object.freeze({
  standingToCrouched: 0.45,
  crouchedToProne: 0.75,
  proneToCrouched: 0.65,
  crouchedToStanding: 0.4,
});

const REQUIRED_GAIT_POSTURES: Partial<Record<UnitModel['movementRuntime']['requestedGait'], UnitPosture>> = {
  crawl: 'prone',
  crouch_walk: 'crouched',
  sprint: 'standing',
};

export function requestPostureTransition(
  unit: UnitModel,
  input: RequestPostureTransitionInput,
): PhysicalActionCommandResult {
  const activePhysicalAction = unit.behaviorRuntime.physicalAction ?? null;
  if (activePhysicalAction?.status === 'running' && activePhysicalAction.type !== POSTURE_TRANSITION_ACTION_TYPE) {
    return rejectedPhysicalAction(
      activePhysicalAction,
      'posture_transition_physical_action_conflict',
      activePhysicalAction.type === 'weapon_reload'
        ? 'Смена позы запрещена во время физической перезарядки.'
        : 'Смена позы запрещена: тело уже занято другим физическим действием.',
    );
  }

  const running = getRunningPostureTransition(unit);
  if (running) {
    if (running.ownerToken === input.ownerToken && running.targetPosture === input.targetPosture) {
      return acceptedPhysicalAction(
        running,
        'posture_transition_already_running',
        'Такая смена позы уже выполняется этим владельцем.',
      );
    }
    if (running.ownerToken !== input.ownerToken) {
      return rejectedPhysicalAction(
        running,
        'posture_transition_owned_by_other',
        `Смена позы уже принадлежит другому владельцу: ${running.owner.source}:${running.owner.id}.`,
      );
    }
    finishPostureActionAtCurrentEffectivePosture(
      unit,
      running,
      'cancelled',
      'posture_transition_replaced_by_owner',
      'Владелец заменил собственную смену позы новой командой.',
    );
  }

  if (isWeaponHandlingBusy(unit)) {
    return rejectedPhysicalAction(
      unit.behaviorRuntime.physicalAction ?? null,
      'posture_transition_weapon_conflict',
      'Смена позы запрещена во время наведения, выстрела или подготовки оружия.',
    );
  }

  const sourcePosture = unit.behaviorRuntime.posture;
  if (sourcePosture === input.targetPosture) {
    return acceptedPhysicalAction(
      unit.behaviorRuntime.physicalAction ?? null,
      'posture_transition_not_required',
      'Боец уже находится в требуемой позе.',
    );
  }

  const sequence = Math.max(0, unit.behaviorRuntime.physicalAction?.sequence ?? 0) + 1;
  const owner = normalizePhysicalActionOwner(input.owner, unit.id);
  const action: PostureTransitionActionV1 = {
    schemaVersion: PHYSICAL_ACTION_SCHEMA_VERSION,
    id: `${unit.id}:physical-action:${sequence}`,
    sequence,
    type: POSTURE_TRANSITION_ACTION_TYPE,
    owner,
    ownerToken: cleanPhysicalActionText(input.ownerToken, `${owner.source}:${owner.id}`),
    sourcePosture,
    targetPosture: input.targetPosture,
    startedSeconds: finiteNonNegativePhysicalActionNumber(input.startedSeconds, 0),
    durationSeconds: postureTransitionDurationSeconds(sourcePosture, input.targetPosture),
    progress: 0,
    status: 'running',
    reasonCode: cleanPhysicalActionText(input.reasonCode, 'posture_transition_requested'),
    reasonRu: cleanPhysicalActionText(input.reasonRu, 'Начата физическая смена позы.'),
    resultCode: null,
    resultRu: null,
  };
  unit.behaviorRuntime.physicalAction = action;
  unit.behaviorRuntime.currentAction = 'change_posture';
  unit.behaviorRuntime.reason = action.reasonRu;
  unit.behaviorRuntime.lastEvent = 'posture_transition_started';
  unit.behaviorRuntime.postureChangedBecause = action.reasonCode;
  stopPhysicalTranslation(unit);
  return acceptedPhysicalAction(action, 'posture_transition_started', action.reasonRu);
}

export function cancelPostureTransition(
  unit: UnitModel,
  ownerToken: string,
  reasonCode: string,
  reasonRu: string,
): PhysicalActionCommandResult {
  const action = getRunningPostureTransition(unit);
  if (!action) {
    return rejectedPhysicalAction(
      unit.behaviorRuntime.physicalAction ?? null,
      'posture_transition_not_running',
      'Активной смены позы нет.',
    );
  }
  if (action.ownerToken !== ownerToken) {
    return rejectedPhysicalAction(
      action,
      'posture_transition_cancel_denied_owner',
      'Чужой владелец не может отменить эту смену позы.',
    );
  }
  finishPostureActionAtCurrentEffectivePosture(unit, action, 'cancelled', reasonCode, reasonRu);
  return acceptedPhysicalAction(action, reasonCode, reasonRu);
}

export function cancelPostureTransitionBySystem(
  unit: UnitModel,
  reasonCode: string,
  reasonRu: string,
): PhysicalActionCommandResult {
  const action = getRunningPostureTransition(unit);
  if (!action) {
    return rejectedPhysicalAction(
      unit.behaviorRuntime.physicalAction ?? null,
      'posture_transition_not_running',
      'Активной смены позы нет.',
    );
  }
  finishPostureActionAtCurrentEffectivePosture(unit, action, 'cancelled', reasonCode, reasonRu);
  return acceptedPhysicalAction(action, reasonCode, reasonRu);
}

export function tickPostureTransition(
  unit: UnitModel,
  deltaSeconds: number,
  combatCapable: boolean,
): void {
  const action = getRunningPostureTransition(unit);
  if (!action) return;
  if (!combatCapable) {
    finishPostureActionAtCurrentEffectivePosture(
      unit,
      action,
      'cancelled',
      'posture_transition_combat_capability_lost',
      'Смена позы отменена: боец потерял боеспособность.',
    );
    return;
  }
  const delta = finiteNonNegativePhysicalActionNumber(deltaSeconds, 0);
  if (delta <= 0) return;
  action.progress = clampPhysicalActionProgress(
    action.progress + delta / Math.max(0.001, action.durationSeconds),
  );
  applyEffectivePostureForProgress(unit, action);
  if (action.progress + 1e-9 < 1) {
    unit.behaviorRuntime.currentAction = 'change_posture';
    unit.behaviorRuntime.reason = `${action.reasonRu} ${Math.round(action.progress * 100)}%.`;
    stopPhysicalTranslation(unit);
    return;
  }
  action.progress = 1;
  applyEffectivePostureForProgress(unit, action);
  action.status = 'completed';
  action.resultCode = 'posture_transition_completed';
  action.resultRu = 'Физическая смена позы завершена.';
  unit.behaviorRuntime.currentAction = unit.order ? 'move' : 'observe';
  unit.behaviorRuntime.reason = action.resultRu;
  unit.behaviorRuntime.lastEvent = 'posture_transition_completed';
}

export function reconcileMovementPostureRequest(
  state: SimulationState,
  unit: UnitModel,
): PhysicalActionCommandResult | null {
  if (!unit.order) return null;
  const desired = resolveMovementDesiredPosture(state, unit);
  if (!desired) return null;
  if (unit.behaviorRuntime.physicalAction?.status === 'running') {
    stopPhysicalTranslation(unit);
    return null;
  }
  if (unit.behaviorRuntime.posture === desired) return null;
  const command = unit.playerCommand;
  const tacticalPosture = command?.arrivalPosture && command.status === 'active'
    && command.tacticalPositionOccupationStatus === 'approaching'
    ? command.approachPosture ?? 'standing'
    : null;
  const owner: PhysicalActionOwner = tacticalPosture
    ? { source: 'tactical_position', id: command!.id }
    : { source: 'movement', id: unit.order.ownerToken ?? unit.order.playerCommandId ?? unit.id };
  const ownerToken = tacticalPosture
    ? postureOwnerTokenForPlayerCommand(command!.id)
    : `movement-posture:${owner.id}`;
  return requestPostureTransition(unit, {
    targetPosture: desired,
    owner,
    ownerToken,
    startedSeconds: state.simulationTimeSeconds,
    reasonCode: tacticalPosture ? 'tactical_position_approach' : 'movement_posture_required',
    reasonRu: tacticalPosture
      ? 'Боец принимает позу подхода к тактической позиции.'
      : 'Профиль движения требует сначала физически изменить позу.',
  });
}

export function postureOwnerTokenForPlayerCommand(commandId: string): string {
  return `player-command-posture:${commandId}`;
}

export function isPostureTransitionRunning(unit: Pick<UnitModel, 'behaviorRuntime'>): boolean {
  return unit.behaviorRuntime.physicalAction?.type === POSTURE_TRANSITION_ACTION_TYPE
    && unit.behaviorRuntime.physicalAction.status === 'running';
}

export function getRunningPostureTransition(
  unit: Pick<UnitModel, 'behaviorRuntime'>,
): PostureTransitionActionV1 | null {
  return isPostureTransitionRunning(unit)
    ? unit.behaviorRuntime.physicalAction as PostureTransitionActionV1
    : null;
}

export function getPostureTransitionDiagnostics(
  unit: Pick<UnitModel, 'behaviorRuntime'>,
): PostureTransitionDiagnostics {
  const action = unit.behaviorRuntime.physicalAction?.type === POSTURE_TRANSITION_ACTION_TYPE
    ? unit.behaviorRuntime.physicalAction as PostureTransitionActionV1
    : null;
  return {
    effectivePosture: unit.behaviorRuntime.posture,
    sourcePosture: action?.sourcePosture ?? null,
    targetPosture: action?.targetPosture ?? null,
    transitionRunning: action?.status === 'running',
    progress: action?.progress ?? 0,
    owner: action?.owner ?? null,
    ownerToken: action?.ownerToken ?? null,
    startReasonCode: action?.reasonCode ?? null,
    startReasonRu: action?.reasonRu ?? null,
    resultCode: action?.resultCode ?? null,
    resultRu: action?.resultRu ?? null,
  };
}

export function postureTransitionDurationSeconds(source: UnitPosture, target: UnitPosture): number {
  if (source === target) return 0;
  if (source === 'standing' && target === 'crouched') return POSTURE_TRANSITION_DURATIONS_SECONDS.standingToCrouched;
  if (source === 'crouched' && target === 'prone') return POSTURE_TRANSITION_DURATIONS_SECONDS.crouchedToProne;
  if (source === 'prone' && target === 'crouched') return POSTURE_TRANSITION_DURATIONS_SECONDS.proneToCrouched;
  if (source === 'crouched' && target === 'standing') return POSTURE_TRANSITION_DURATIONS_SECONDS.crouchedToStanding;
  if (source === 'standing' && target === 'prone') {
    return POSTURE_TRANSITION_DURATIONS_SECONDS.standingToCrouched
      + POSTURE_TRANSITION_DURATIONS_SECONDS.crouchedToProne;
  }
  return POSTURE_TRANSITION_DURATIONS_SECONDS.proneToCrouched
    + POSTURE_TRANSITION_DURATIONS_SECONDS.crouchedToStanding;
}

export function normalizePostureTransitionAction(
  value: unknown,
  fallbackUnitId: string,
): PostureTransitionActionV1 | null {
  if (!isPhysicalActionRecord(value) || value.type !== POSTURE_TRANSITION_ACTION_TYPE) return null;
  const sourcePosture = normalizePosture(value.sourcePosture);
  const targetPosture = normalizePosture(value.targetPosture);
  if (!sourcePosture || !targetPosture || sourcePosture === targetPosture) return null;
  const status = normalizePhysicalActionStatus(value.status);
  const sequence = physicalActionInteger(value.sequence, 1, 1, Number.MAX_SAFE_INTEGER);
  const owner = normalizePhysicalActionOwner(
    isPhysicalActionRecord(value.owner) ? value.owner : { source: 'system', id: fallbackUnitId },
    fallbackUnitId,
  );
  const durationSeconds = finitePositivePhysicalActionNumber(
    value.durationSeconds,
    postureTransitionDurationSeconds(sourcePosture, targetPosture),
  );
  const progress = status === 'completed'
    ? 1
    : clampPhysicalActionProgress(finitePhysicalActionNumber(value.progress, 0));
  return {
    schemaVersion: PHYSICAL_ACTION_SCHEMA_VERSION,
    id: cleanPhysicalActionText(value.id, `${fallbackUnitId}:physical-action:${sequence}`),
    sequence,
    type: POSTURE_TRANSITION_ACTION_TYPE,
    owner,
    ownerToken: cleanPhysicalActionText(value.ownerToken, `${owner.source}:${owner.id}`),
    sourcePosture,
    targetPosture,
    startedSeconds: finiteNonNegativePhysicalActionNumber(value.startedSeconds, 0),
    durationSeconds,
    progress,
    status,
    reasonCode: cleanPhysicalActionText(value.reasonCode, 'posture_transition_restored'),
    reasonRu: cleanPhysicalActionText(value.reasonRu, 'Смена позы восстановлена из сохранения.'),
    resultCode: nullablePhysicalActionText(value.resultCode),
    resultRu: nullablePhysicalActionText(value.resultRu),
  };
}

export function synchronizeEffectivePostureFromAction(unit: UnitModel): void {
  const action = unit.behaviorRuntime.physicalAction;
  if (action?.type !== POSTURE_TRANSITION_ACTION_TYPE) return;
  applyEffectivePostureForProgress(unit, action);
}

function resolveMovementDesiredPosture(state: SimulationState, unit: UnitModel): UnitPosture | null {
  const command = unit.playerCommand;
  if (
    command?.arrivalPosture
    && command.status === 'active'
    && command.tacticalPositionOccupationStatus === 'approaching'
  ) return command.approachPosture ?? 'standing';

  const runtime = unit.movementRuntime;
  const gait = runtime.forcedFallbackReason ? runtime.actualGait : runtime.requestedGait;
  const structural = REQUIRED_GAIT_POSTURES[gait];
  if (structural) return structural;
  const profileId = runtime.effectiveProfileId || runtime.requestedProfileId;
  const profile = state.movementProfiles.resolveProfile(profileId).profile;
  return profile.stancePolicy === 'adaptive' ? null : profile.stancePolicy;
}

function applyEffectivePostureForProgress(unit: UnitModel, action: PostureTransitionActionV1): void {
  if (action.sourcePosture === 'standing' && action.targetPosture === 'prone') {
    const threshold = POSTURE_TRANSITION_DURATIONS_SECONDS.standingToCrouched / action.durationSeconds;
    if (action.progress + 1e-9 >= threshold) {
      setEffectivePosture(unit, 'crouched', 'posture_transition_progress');
    }
    if (action.progress + 1e-9 >= 1) {
      setEffectivePosture(unit, 'prone', 'posture_transition_completed');
    }
    return;
  }
  if (action.sourcePosture === 'prone' && action.targetPosture === 'standing') {
    const threshold = POSTURE_TRANSITION_DURATIONS_SECONDS.proneToCrouched / action.durationSeconds;
    if (action.progress + 1e-9 >= threshold) {
      setEffectivePosture(unit, 'crouched', 'posture_transition_progress');
    }
    if (action.progress + 1e-9 >= 1) {
      setEffectivePosture(unit, 'standing', 'posture_transition_completed');
    }
    return;
  }
  setEffectivePosture(
    unit,
    action.progress + 1e-9 >= 1 ? action.targetPosture : action.sourcePosture,
    action.progress + 1e-9 >= 1 ? 'posture_transition_completed' : 'posture_transition_progress',
  );
}

function finishPostureActionAtCurrentEffectivePosture(
  unit: UnitModel,
  action: PostureTransitionActionV1,
  status: 'cancelled' | 'failed',
  reasonCode: string,
  reasonRu: string,
): void {
  applyEffectivePostureForProgress(unit, action);
  action.status = status;
  action.resultCode = cleanPhysicalActionText(
    reasonCode,
    status === 'cancelled' ? 'posture_transition_cancelled' : 'posture_transition_failed',
  );
  action.resultRu = cleanPhysicalActionText(
    reasonRu,
    status === 'cancelled' ? 'Смена позы отменена.' : 'Смена позы завершилась ошибкой.',
  );
  unit.behaviorRuntime.currentAction = unit.order ? 'move' : 'observe';
  unit.behaviorRuntime.reason = action.resultRu;
  unit.behaviorRuntime.lastEvent = status === 'cancelled'
    ? 'posture_transition_cancelled'
    : 'posture_transition_failed';
}

function setEffectivePosture(unit: UnitModel, posture: UnitPosture, reason: string): void {
  if (unit.behaviorRuntime.posture === posture) return;
  unit.behaviorRuntime.previousPosture = unit.behaviorRuntime.posture;
  unit.behaviorRuntime.posture = posture;
  unit.behaviorRuntime.postureChangedBecause = reason;
}

function stopPhysicalTranslation(unit: UnitModel): void {
  unit.movementRuntime.isMoving = false;
  unit.movementRuntime.velocityCellsPerSecond = { x: 0, y: 0 };
}

function isWeaponHandlingBusy(unit: UnitModel): boolean {
  return unit.behaviorRuntime.currentAction === 'aim'
    || unit.behaviorRuntime.currentAction === 'fire'
    || unit.movementRuntime.weaponPreparation !== null;
}

function normalizePosture(value: unknown): UnitPosture | null {
  return value === 'standing' || value === 'crouched' || value === 'prone' ? value : null;
}
