import type { UnitPosture } from '../behavior/BehaviorModel';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';
import {
  cancelPhysicalAction,
  cancelPhysicalActionBySystem as cancelCoordinatorActionBySystem,
  completePhysicalAction,
  failPhysicalAction,
  getPhysicalActionLease,
  requestPhysicalActionChannels,
  setPhysicalActionCoordinatorDiagnostic,
} from './PhysicalActionCoordinator';
import {
  normalizePhysicalActionHandle,
  normalizePhysicalActionOwner,
} from './PhysicalActionCoordinatorSerialization';
import type {
  PhysicalActionHandleV1,
  PhysicalActionOwner,
  PhysicalActionOwnerSource,
} from './PhysicalActionCoordinatorTypes';

export type { PhysicalActionOwner, PhysicalActionOwnerSource } from './PhysicalActionCoordinatorTypes';

export const PHYSICAL_ACTION_SCHEMA_VERSION = 1 as const;
export const POSTURE_TRANSITION_ACTION_TYPE = 'posture_transition' as const;

export type PhysicalActionStatus = 'running' | 'completed' | 'cancelled' | 'failed';

export interface PostureTransitionActionV1 {
  readonly schemaVersion: typeof PHYSICAL_ACTION_SCHEMA_VERSION;
  readonly id: string;
  readonly sequence: number;
  readonly type: typeof POSTURE_TRANSITION_ACTION_TYPE;
  readonly owner: PhysicalActionOwner;
  readonly ownerToken: string;
  readonly actionHandle: PhysicalActionHandleV1 | null;
  readonly sourcePosture: UnitPosture;
  readonly targetPosture: UnitPosture;
  readonly startedSeconds: number;
  readonly durationSeconds: number;
  progress: number;
  status: PhysicalActionStatus;
  readonly reasonCode: string;
  readonly reasonRu: string;
  resultCode: string | null;
  resultRu: string | null;
  /** Runtime-only marker. It is deliberately omitted from scene exports. */
  readonly restoredFromSave?: true;
}

export type UnitPhysicalAction = PostureTransitionActionV1;

export interface RequestPostureTransitionInput {
  readonly targetPosture: UnitPosture;
  readonly owner: PhysicalActionOwner;
  readonly ownerToken: string;
  readonly startedSeconds: number;
  readonly reasonCode: string;
  readonly reasonRu: string;
}

export interface PhysicalActionCommandResult {
  readonly accepted: boolean;
  readonly action: UnitPhysicalAction | null;
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

const POSTURE_CHANNELS = ['locomotion', 'posture', 'weapon'] as const;

const REQUIRED_GAIT_POSTURES: Partial<Record<UnitModel['movementRuntime']['requestedGait'], UnitPosture>> = {
  crawl: 'prone',
  crouch_walk: 'crouched',
  sprint: 'standing',
};

const PLAYER_REPLACEABLE_OWNER_SOURCES = new Set<PhysicalActionOwnerSource>([
  'player',
  'player_command',
  'movement',
  'tactical_position',
]);

export function requestPostureTransition(
  unit: UnitModel,
  input: RequestPostureTransitionInput,
): PhysicalActionCommandResult {
  const running = getRunningPostureTransition(unit);
  if (running) {
    if (running.ownerToken === input.ownerToken && running.targetPosture === input.targetPosture) {
      if (running.actionHandle && getPhysicalActionLease(unit, running.actionHandle)) {
        stopPhysicalTranslation(unit);
        return accepted(running, 'posture_transition_already_running', 'Такая смена позы уже выполняется этим владельцем.');
      }
      finishPostureActionAtCurrentEffectivePosture(
        unit,
        running,
        'failed',
        'posture_transition_lease_lost',
        'Смена позы остановлена: захват физических каналов потерян.',
        'missing',
      );
    } else if (running.ownerToken !== input.ownerToken) {
      return rejected(
        running,
        'posture_transition_owned_by_other',
        `Смена позы уже принадлежит другому владельцу: ${running.owner.source}:${running.owner.id}.`,
      );
    } else {
      finishPostureActionAtCurrentEffectivePosture(
        unit,
        running,
        'cancelled',
        'posture_transition_replaced_by_owner',
        'Владелец заменил собственную смену позы новой командой.',
        'owner',
      );
    }
  }

  const sourcePosture = unit.behaviorRuntime.posture;
  if (sourcePosture === input.targetPosture) {
    return accepted(
      unit.behaviorRuntime.physicalAction,
      'posture_transition_not_required',
      'Боец уже находится в требуемой позе.',
    );
  }

  const ownerToken = cleanText(input.ownerToken, '');
  const owner = normalizePhysicalActionOwner(input.owner, ownerToken || unit.id);
  const acquisition = requestPhysicalActionChannels(unit, {
    actionType: POSTURE_TRANSITION_ACTION_TYPE,
    owner,
    ownerToken,
    channels: POSTURE_CHANNELS,
    startedSeconds: finiteNonNegative(input.startedSeconds, 0),
    reasonCode: cleanText(input.reasonCode, 'posture_transition_requested'),
    reasonRu: cleanText(input.reasonRu, 'Начата физическая смена позы.'),
  });
  if (!acquisition.accepted || !acquisition.handle) {
    return rejected(
      unit.behaviorRuntime.physicalAction,
      acquisition.reasonCode === 'physical_action_invalid_request'
        ? 'posture_transition_invalid_request'
        : 'posture_transition_channels_blocked',
      acquisition.reasonRu,
    );
  }

  const action: PostureTransitionActionV1 = {
    schemaVersion: PHYSICAL_ACTION_SCHEMA_VERSION,
    id: acquisition.handle.actionId,
    sequence: acquisition.handle.sequence,
    type: POSTURE_TRANSITION_ACTION_TYPE,
    owner,
    ownerToken: acquisition.handle.ownerToken,
    actionHandle: { ...acquisition.handle },
    sourcePosture,
    targetPosture: input.targetPosture,
    startedSeconds: finiteNonNegative(input.startedSeconds, 0),
    durationSeconds: postureTransitionDurationSeconds(sourcePosture, input.targetPosture),
    progress: 0,
    status: 'running',
    reasonCode: cleanText(input.reasonCode, 'posture_transition_requested'),
    reasonRu: cleanText(input.reasonRu, 'Начата физическая смена позы.'),
    resultCode: null,
    resultRu: null,
  };
  unit.behaviorRuntime.physicalAction = action;
  unit.behaviorRuntime.currentAction = 'change_posture';
  unit.behaviorRuntime.reason = action.reasonRu;
  unit.behaviorRuntime.lastEvent = 'posture_transition_started';
  unit.behaviorRuntime.postureChangedBecause = action.reasonCode;
  stopPhysicalTranslation(unit);
  return accepted(action, acquisition.status === 'already_running' ? 'posture_transition_already_running' : 'posture_transition_started', action.reasonRu);
}

export function requestPlayerPostureTransition(
  unit: UnitModel,
  targetPosture: UnitPosture,
  startedSeconds: number,
  ownerId = unit.id,
): PhysicalActionCommandResult {
  const ownerToken = `player-posture:${ownerId}`;
  const running = getRunningPostureTransition(unit);
  if (running && running.ownerToken !== ownerToken) {
    cancelReplaceablePostureTransitionForNewPlayerCommand(unit);
  }
  return requestPostureTransition(unit, {
    targetPosture,
    owner: { source: 'player', id: ownerId },
    ownerToken,
    startedSeconds,
    reasonCode: 'player_posture_requested',
    reasonRu: 'Игрок приказал бойцу физически изменить позу.',
  });
}

export function cancelPostureTransition(
  unit: UnitModel,
  ownerToken: string,
  reasonCode: string,
  reasonRu: string,
): PhysicalActionCommandResult {
  const action = getRunningPostureTransition(unit);
  if (!action) {
    return rejected(unit.behaviorRuntime.physicalAction, 'posture_transition_not_running', 'Активной смены позы нет.');
  }
  if (action.ownerToken !== ownerToken) {
    return rejected(
      action,
      'posture_transition_cancel_denied_owner',
      'Чужой владелец не может отменить эту смену позы.',
    );
  }
  finishPostureActionAtCurrentEffectivePosture(unit, action, 'cancelled', reasonCode, reasonRu, 'owner');
  return accepted(action, reasonCode, reasonRu);
}

export function cancelPostureTransitionBySystem(
  unit: UnitModel,
  reasonCode: string,
  reasonRu: string,
): PhysicalActionCommandResult {
  const action = getRunningPostureTransition(unit);
  if (!action) {
    return rejected(unit.behaviorRuntime.physicalAction, 'posture_transition_not_running', 'Активной смены позы нет.');
  }
  finishPostureActionAtCurrentEffectivePosture(unit, action, 'cancelled', reasonCode, reasonRu, 'system');
  return accepted(action, reasonCode, reasonRu);
}

export function cancelReplaceablePostureTransitionForNewPlayerCommand(unit: UnitModel): boolean {
  const action = getRunningPostureTransition(unit);
  if (!action || !PLAYER_REPLACEABLE_OWNER_SOURCES.has(action.owner.source)) return false;
  finishPostureActionAtCurrentEffectivePosture(
    unit,
    action,
    'cancelled',
    'posture_transition_replaced_by_player_command',
    'Смена позы отменена новым приказом игрока.',
    'system',
  );
  return true;
}

export function tickPostureTransition(
  unit: UnitModel,
  deltaSeconds: number,
  combatCapable: boolean,
): void {
  const action = getRunningPostureTransition(unit);
  if (!action) return;
  if (!action.actionHandle || !getPhysicalActionLease(unit, action.actionHandle)) {
    finishPostureActionAtCurrentEffectivePosture(
      unit,
      action,
      'failed',
      'posture_transition_lease_lost',
      'Смена позы остановлена: захват физических каналов потерян.',
      'missing',
    );
    return;
  }
  if (!combatCapable) {
    finishPostureActionAtCurrentEffectivePosture(
      unit,
      action,
      'cancelled',
      'posture_transition_combat_capability_lost',
      'Смена позы отменена: боец потерял боеспособность.',
      'system',
    );
    return;
  }
  const delta = finiteNonNegative(deltaSeconds, 0);
  if (delta <= 0) return;
  action.progress = clamp01(action.progress + delta / Math.max(0.001, action.durationSeconds));
  applyEffectivePostureForProgress(unit, action);
  if (action.progress + 1e-9 < 1) {
    unit.behaviorRuntime.currentAction = 'change_posture';
    unit.behaviorRuntime.reason = `${action.reasonRu} ${Math.round(action.progress * 100)}%.`;
    stopPhysicalTranslation(unit);
    return;
  }
  action.progress = 1;
  setEffectivePosture(unit, action.targetPosture, 'posture_transition_completed');
  action.status = 'completed';
  action.resultCode = 'posture_transition_completed';
  action.resultRu = 'Физическая смена позы завершена.';
  completePhysicalAction(unit, action.actionHandle, {
    endedSeconds: action.startedSeconds + action.durationSeconds,
    resultCode: action.resultCode,
    resultRu: action.resultRu,
  });
  unit.behaviorRuntime.currentAction = unit.order ? 'move' : 'observe';
  unit.behaviorRuntime.reason = action.resultRu;
  unit.behaviorRuntime.lastEvent = 'posture_transition_completed';
}

export function reconcileMovementPostureRequest(
  state: SimulationState,
  unit: UnitModel,
  startedSeconds = state.simulationTimeSeconds,
): PhysicalActionCommandResult | null {
  if (!unit.order) return null;
  const desired = resolveMovementDesiredPosture(state, unit);
  if (!desired) return null;
  const running = getRunningPostureTransition(unit);
  if (running) {
    stopPhysicalTranslation(unit);
    return null;
  }
  if (unit.behaviorRuntime.posture === desired) return null;
  const command = unit.playerCommand;
  const tacticalApproach = command?.arrivalPosture
    && command.status === 'active'
    && command.tacticalPositionOccupationStatus === 'approaching'
    && unit.order.playerCommandId === command.id;
  const owner: PhysicalActionOwner = tacticalApproach
    ? { source: 'tactical_position', id: command.id }
    : { source: 'movement', id: unit.order.ownerToken ?? unit.order.playerCommandId ?? unit.id };
  const ownerToken = tacticalApproach
    ? postureOwnerTokenForPlayerCommand(command.id)
    : movementPostureOwnerToken(owner.id);
  return requestPostureTransition(unit, {
    targetPosture: desired,
    owner,
    ownerToken,
    startedSeconds,
    reasonCode: tacticalApproach ? 'tactical_position_approach' : 'movement_posture_required',
    reasonRu: tacticalApproach
      ? 'Боец принимает позу подхода к тактической позиции.'
      : 'Профиль движения требует сначала физически изменить позу.',
  });
}

export function resolveMovementDesiredPosture(state: SimulationState, unit: UnitModel): UnitPosture | null {
  const command = unit.playerCommand;
  if (
    command?.arrivalPosture
    && command.status === 'active'
    && command.tacticalPositionOccupationStatus === 'approaching'
    && unit.order?.playerCommandId === command.id
  ) return command.approachPosture ?? 'standing';

  const runtime = unit.movementRuntime;
  const gait = runtime.forcedFallbackReason ? runtime.actualGait : runtime.requestedGait;
  const structural = REQUIRED_GAIT_POSTURES[gait];
  if (structural) return structural;
  const profileId = runtime.effectiveProfileId || runtime.requestedProfileId;
  const profile = state.movementProfiles.resolveProfile(profileId).profile;
  return profile.stancePolicy === 'adaptive' ? null : profile.stancePolicy;
}

export function movementPostureOwnerToken(ownerId: string): string {
  return `movement-posture:${ownerId}`;
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
  return isPostureTransitionRunning(unit) ? unit.behaviorRuntime.physicalAction : null;
}

export function getPostureTransitionDiagnostics(
  unit: Pick<UnitModel, 'behaviorRuntime'>,
): PostureTransitionDiagnostics {
  const action = unit.behaviorRuntime.physicalAction;
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

export function normalizeUnitPhysicalAction(value: unknown, fallbackUnitId: string): UnitPhysicalAction | null {
  if (!isRecord(value) || value.type !== POSTURE_TRANSITION_ACTION_TYPE) return null;
  if (value.schemaVersion !== PHYSICAL_ACTION_SCHEMA_VERSION) return null;
  const sourcePosture = normalizePosture(value.sourcePosture);
  const targetPosture = normalizePosture(value.targetPosture);
  if (!sourcePosture || !targetPosture || sourcePosture === targetPosture) return null;
  let status = normalizeStatus(value.status);
  if (!status) return null;
  let progress = clamp01(finite(value.progress, status === 'completed' ? 1 : 0));
  if (status === 'completed' || (status === 'running' && progress + 1e-9 >= 1)) {
    status = 'completed';
    progress = 1;
  }
  const sequence = integer(value.sequence, 1, 1, Number.MAX_SAFE_INTEGER);
  const owner = normalizePhysicalActionOwner(isRecord(value.owner) ? value.owner : { source: 'system', id: fallbackUnitId }, fallbackUnitId);
  const canonicalDuration = postureTransitionDurationSeconds(sourcePosture, targetPosture);
  const restoredDuration = finitePositive(value.durationSeconds, canonicalDuration);
  const durationSeconds = restoredDuration >= 0.05 && restoredDuration <= 10
    ? restoredDuration
    : canonicalDuration;
  return {
    schemaVersion: PHYSICAL_ACTION_SCHEMA_VERSION,
    id: cleanText(value.id, `${fallbackUnitId}:physical-action:${sequence}`),
    sequence,
    type: POSTURE_TRANSITION_ACTION_TYPE,
    owner,
    ownerToken: cleanText(value.ownerToken, `${owner.source}:${owner.id}`),
    actionHandle: normalizePhysicalActionHandle(value.actionHandle),
    sourcePosture,
    targetPosture,
    startedSeconds: finiteNonNegative(value.startedSeconds, 0),
    durationSeconds,
    progress,
    status,
    reasonCode: cleanText(value.reasonCode, 'posture_transition_restored'),
    reasonRu: cleanText(value.reasonRu, 'Смена позы восстановлена из сохранения.'),
    resultCode: status === 'completed'
      ? cleanText(value.resultCode, 'posture_transition_completed')
      : nullableText(value.resultCode),
    resultRu: status === 'completed'
      ? cleanText(value.resultRu, 'Физическая смена позы завершена.')
      : nullableText(value.resultRu),
    restoredFromSave: true,
  };
}

export function serializeUnitPhysicalAction(action: UnitPhysicalAction | null): UnitPhysicalAction | undefined {
  if (!action) return undefined;
  const { restoredFromSave: _restoredFromSave, ...serializable } = action;
  return {
    ...serializable,
    owner: { ...action.owner },
    actionHandle: action.actionHandle ? { ...action.actionHandle } : null,
  };
}

export function synchronizeEffectivePostureFromAction(unit: UnitModel): void {
  const action = unit.behaviorRuntime.physicalAction;
  if (!action) return;
  applyEffectivePostureForProgress(unit, action);
}

/**
 * Explicit non-simulation reset used only by scene authoring tools. Gameplay
 * commands must use requestPostureTransition instead.
 */
export function resetPostureForSceneAuthoring(
  unit: UnitModel,
  posture: UnitPosture,
  reasonCode = 'scene_authoring_posture_reset',
): void {
  const running = getRunningPostureTransition(unit);
  if (running) {
    finishPostureActionAtCurrentEffectivePosture(
      unit,
      running,
      'cancelled',
      reasonCode,
      'Смена позы отменена сбросом редактора сцены.',
      'system',
    );
  }
  unit.behaviorRuntime.physicalAction = null;
  setEffectivePosture(unit, posture, reasonCode);
  unit.behaviorRuntime.previousPosture = posture;
}

function applyEffectivePostureForProgress(unit: UnitModel, action: PostureTransitionActionV1): void {
  const completed = action.progress + 1e-9 >= 1 || action.status === 'completed';
  if (action.sourcePosture === 'standing' && action.targetPosture === 'prone') {
    const threshold = POSTURE_TRANSITION_DURATIONS_SECONDS.standingToCrouched / action.durationSeconds;
    if (action.progress + 1e-9 < threshold) {
      setEffectivePosture(unit, 'standing', 'posture_transition_progress');
      return;
    }
    setEffectivePosture(unit, 'crouched', 'posture_transition_progress');
    if (completed) setEffectivePosture(unit, 'prone', 'posture_transition_progress');
    return;
  }
  if (action.sourcePosture === 'prone' && action.targetPosture === 'standing') {
    const threshold = POSTURE_TRANSITION_DURATIONS_SECONDS.proneToCrouched / action.durationSeconds;
    if (action.progress + 1e-9 < threshold) {
      setEffectivePosture(unit, 'prone', 'posture_transition_progress');
      return;
    }
    setEffectivePosture(unit, 'crouched', 'posture_transition_progress');
    if (completed) setEffectivePosture(unit, 'standing', 'posture_transition_progress');
    return;
  }
  setEffectivePosture(unit, completed ? action.targetPosture : action.sourcePosture, 'posture_transition_progress');
}

type CoordinatorReleaseMode = 'owner' | 'system' | 'missing';

function finishPostureActionAtCurrentEffectivePosture(
  unit: UnitModel,
  action: PostureTransitionActionV1,
  status: 'cancelled' | 'failed',
  reasonCode: string,
  reasonRu: string,
  releaseMode: CoordinatorReleaseMode,
): void {
  applyEffectivePostureForProgress(unit, action);
  action.status = status;
  action.resultCode = cleanText(reasonCode, status === 'cancelled' ? 'posture_transition_cancelled' : 'posture_transition_failed');
  action.resultRu = cleanText(reasonRu, status === 'cancelled' ? 'Смена позы отменена.' : 'Смена позы завершилась ошибкой.');
  const endedSeconds = action.startedSeconds + action.progress * action.durationSeconds;
  if (releaseMode === 'missing' || !action.actionHandle) {
    setPhysicalActionCoordinatorDiagnostic(unit, action.resultCode, action.resultRu);
  } else if (releaseMode === 'system') {
    cancelCoordinatorActionBySystem(unit, action.actionHandle.actionId, {
      endedSeconds,
      resultCode: action.resultCode,
      resultRu: action.resultRu,
    });
  } else if (status === 'failed') {
    failPhysicalAction(unit, action.actionHandle, {
      endedSeconds,
      resultCode: action.resultCode,
      resultRu: action.resultRu,
    });
  } else {
    cancelPhysicalAction(unit, action.actionHandle, {
      endedSeconds,
      resultCode: action.resultCode,
      resultRu: action.resultRu,
    });
  }
  unit.behaviorRuntime.currentAction = unit.order ? 'move' : 'observe';
  unit.behaviorRuntime.reason = action.resultRu;
  unit.behaviorRuntime.lastEvent = status === 'cancelled' ? 'posture_transition_cancelled' : 'posture_transition_failed';
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

function accepted(action: UnitPhysicalAction | null, reasonCode: string, reasonRu: string): PhysicalActionCommandResult {
  return { accepted: true, action, reasonCode, reasonRu };
}

function rejected(action: UnitPhysicalAction | null, reasonCode: string, reasonRu: string): PhysicalActionCommandResult {
  return { accepted: false, action, reasonCode, reasonRu };
}

function normalizePosture(value: unknown): UnitPosture | null {
  return value === 'standing' || value === 'crouched' || value === 'prone' ? value : null;
}

function normalizeStatus(value: unknown): PhysicalActionStatus | null {
  if (value === 'running' || value === 'completed' || value === 'cancelled' || value === 'failed') return value;
  return null;
}

function cleanText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function finiteNonNegative(value: unknown, fallback: number): number {
  return Math.max(0, finite(value, fallback));
}

function finitePositive(value: unknown, fallback: number): number {
  const normalized = finite(value, fallback);
  return normalized > 0 ? normalized : fallback;
}

function integer(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.round(finite(value, fallback))));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
