import {
  cancelPhysicalAction,
  completePhysicalAction,
  failPhysicalAction,
  getPhysicalActionLease,
  requestPhysicalActionChannels,
} from '../../actions/PhysicalActionCoordinator';
import {
  normalizePhysicalActionHandle,
  normalizePhysicalActionOwner,
  physicalActionHandlesEqual,
} from '../../actions/PhysicalActionCoordinatorSerialization';
import type {
  PhysicalActionLeaseV1,
  PhysicalActionOwner,
} from '../../actions/PhysicalActionCoordinatorTypes';
import type { BallisticPoint3 } from '../../combat/UnitHitShapes';
import type { SimulationState } from '../../simulation/SimulationState';
import type { UnitModel } from '../../units/UnitModel';
import {
  advanceAimPhysicalProgress,
  createAimTrackingRuntime,
  normalizeAimTrackingRuntime,
  serializeAimTrackingRuntime,
  updateAimTrackingAtBoundary,
} from './AimRuntime';
import {
  FIRE_TASK_RUNTIME_SCHEMA_VERSION,
  type FireTaskPhase,
  type FireTaskRuntimeV1,
  type FireTaskTerminalResultV1,
} from './InfantryCombatRuntimeTypes';

export const FIRE_TASK_ACTION_TYPE = 'infantry_fire_task' as const;
const TIME_EPSILON_SECONDS = 1e-9;

export interface RequestSingleFireTaskInput {
  readonly owner: PhysicalActionOwner;
  readonly ownerToken: string;
  readonly target: BallisticPoint3;
  readonly targetRadiusMetres?: 0;
  readonly contactId?: string | null;
  readonly sourceUnitId?: string | null;
  readonly mode?: 'single';
  readonly minimumSolutionQuality: number;
  readonly maximumFriendlyFireRisk: number;
  readonly requestedSeconds: number;
}

export type RequestSingleFireTaskStatus =
  | 'started'
  | 'already_running'
  | 'active_task_owned_elsewhere'
  | 'explicit_cancel_required'
  | 'channels_blocked'
  | 'weapon_missing'
  | 'invalid_request'
  | 'unsupported_mode';

export interface RequestSingleFireTaskResult {
  readonly accepted: boolean;
  readonly status: RequestSingleFireTaskStatus;
  readonly task: FireTaskRuntimeV1 | null;
  readonly lease: PhysicalActionLeaseV1 | null;
  readonly reasonCode: string;
  readonly reasonRu: string;
}

export interface TickFireTaskInput {
  readonly intervalStartSeconds: number;
  readonly deltaSeconds: number;
  /** Production Stage 5 path. Omitted only by isolated Stage 3 action-clock tests. */
  readonly state?: Pick<SimulationState, 'map'>;
}

export interface TickFireTaskResult {
  readonly taskId: string | null;
  readonly commitRequested: boolean;
  readonly completed: boolean;
  readonly failed: boolean;
  readonly consumedSeconds: number;
  readonly remainingSeconds: number;
  readonly reasonCode: string | null;
}

export interface CancelSingleFireTaskInput {
  readonly ownerToken: string;
  readonly endedSeconds: number;
  readonly resultCode: string;
  readonly resultRu: string;
}

export interface CancelSingleFireTaskResult {
  readonly accepted: boolean;
  readonly status: 'cancelled' | 'already_finished' | 'not_found' | 'owner_mismatch' | 'stale_handle';
  readonly reasonCode: string;
  readonly reasonRu: string;
}

export function requestSingleFireTask(
  unit: UnitModel,
  input: RequestSingleFireTaskInput,
): RequestSingleFireTaskResult {
  if (input.mode !== undefined && input.mode !== 'single') {
    return requestRejected('unsupported_mode', 'infantry_fire_task_unsupported_mode', 'Stage 5 поддерживает только одиночный выстрел.');
  }
  const ownerToken = cleanText(input.ownerToken, '');
  const target = normalizePoint(input.target);
  if (!ownerToken || !target || (input.targetRadiusMetres ?? 0) !== 0) {
    return requestRejected('invalid_request', 'infantry_fire_task_invalid_request', 'Запрос одиночного выстрела заполнен неверно.');
  }
  const weapon = unit.infantryCombatRuntime.primaryWeapon;
  if (!weapon) {
    return requestRejected('weapon_missing', 'infantry_fire_task_weapon_missing', 'У бойца нет новой основной винтовки.');
  }

  const active = unit.infantryCombatRuntime.activeFireTask;
  if (active) {
    if (active.ownerToken !== ownerToken) {
      return requestRejected('active_task_owned_elsewhere', 'infantry_fire_task_owned_elsewhere', 'Активная огневая задача принадлежит другому владельцу.');
    }
    if (samePoint(active.target, target) && active.mode === 'single') {
      return {
        accepted: true,
        status: 'already_running',
        task: active,
        lease: active.actionHandle ? getPhysicalActionLease(unit, active.actionHandle) : null,
        reasonCode: 'infantry_fire_task_already_running',
        reasonRu: 'Идентичная огневая задача уже выполняется.',
      };
    }
    return requestRejected('explicit_cancel_required', 'infantry_fire_task_explicit_cancel_required', 'Для смены точки сначала явно отмените текущую огневую задачу.');
  }

  const requestedSeconds = finiteNonNegative(input.requestedSeconds, 0);
  const leaseResult = requestPhysicalActionChannels(unit, {
    actionType: FIRE_TASK_ACTION_TYPE,
    owner: input.owner,
    ownerToken,
    channels: ['weapon'],
    startedSeconds: requestedSeconds,
    reasonCode: 'infantry_fire_task_requested',
    reasonRu: 'Начата подготовка одиночного винтовочного выстрела.',
  });
  if (!leaseResult.accepted || !leaseResult.handle || !leaseResult.lease) {
    return requestRejected('channels_blocked', leaseResult.reasonCode, leaseResult.reasonRu);
  }

  const sequence = integer(unit.infantryCombatRuntime.nextFireTaskSequence, 1, 1, Number.MAX_SAFE_INTEGER);
  const initialDirection = {
    x: Math.cos(unit.facingRadians),
    y: Math.sin(unit.facingRadians),
    z: 0,
  };
  const task: FireTaskRuntimeV1 = {
    schemaVersion: FIRE_TASK_RUNTIME_SCHEMA_VERSION,
    taskId: `${unit.id}:fire-task:${sequence}`,
    sequence,
    actionHandle: { ...leaseResult.handle },
    owner: { ...leaseResult.lease.owner },
    ownerToken,
    target,
    targetRadiusMetres: 0,
    contactId: nullableText(input.contactId),
    sourceUnitId: nullableText(input.sourceUnitId),
    mode: 'single',
    phase: 'accepted',
    requestedSeconds,
    phaseStartedSeconds: requestedSeconds,
    readyRemainingSeconds: finiteNonNegative(weapon.resolved.weapon.readySeconds, 0),
    aimQuality: 0,
    aimTracking: createAimTrackingRuntime(requestedSeconds, initialDirection),
    minimumSolutionQuality: clamp01(input.minimumSolutionQuality),
    maximumFriendlyFireRisk: clamp01(input.maximumFriendlyFireRisk),
    recoveryRemainingSeconds: finiteNonNegative(weapon.resolved.weapon.recoverySeconds, 0),
    committedShotId: null,
    resultCode: null,
    resultRu: null,
  };
  unit.infantryCombatRuntime.nextFireTaskSequence = Math.min(Number.MAX_SAFE_INTEGER, sequence + 1);
  unit.infantryCombatRuntime.activeFireTask = task;
  return {
    accepted: true,
    status: 'started',
    task,
    lease: leaseResult.lease,
    reasonCode: 'infantry_fire_task_started',
    reasonRu: 'Огневая задача принята и владеет каналом оружия.',
  };
}

export function tickFireTaskWithTimeBudget(
  unit: UnitModel,
  input: TickFireTaskInput,
): TickFireTaskResult {
  const validation = validateTickPrerequisites(unit, input);
  if (validation) return validation;
  return input.state
    ? tickStage5FireTask(unit, input as TickFireTaskInput & { readonly state: Pick<SimulationState, 'map'> })
    : tickLegacyActionClock(unit, input);
}

function tickStage5FireTask(
  unit: UnitModel,
  input: TickFireTaskInput & { readonly state: Pick<SimulationState, 'map'> },
): TickFireTaskResult {
  const task = unit.infantryCombatRuntime.activeFireTask!;
  const weapon = unit.infantryCombatRuntime.primaryWeapon!;
  let remainingSeconds = finiteNonNegative(input.deltaSeconds, 0);
  let consumedSeconds = 0;
  const intervalStartSeconds = finiteNonNegative(input.intervalStartSeconds, 0);

  while (remainingSeconds > TIME_EPSILON_SECONDS) {
    const now = canonicalSeconds(intervalStartSeconds + consumedSeconds);
    if (task.phase === 'accepted') {
      transition(task, 'weapon_ready', now);
      continue;
    }
    if (task.phase === 'firing') {
      return tickResult(task.taskId, true, false, false, consumedSeconds, remainingSeconds, null);
    }
    if (task.phase === 'recovery') {
      const used = Math.min(remainingSeconds, task.recoveryRemainingSeconds);
      task.recoveryRemainingSeconds = cleanDuration(task.recoveryRemainingSeconds - used);
      remainingSeconds = cleanDuration(remainingSeconds - used);
      consumedSeconds = cleanDuration(consumedSeconds + used);
      if (task.recoveryRemainingSeconds <= TIME_EPSILON_SECONDS) {
        task.recoveryRemainingSeconds = 0;
        completeActiveFireTask(unit, intervalStartSeconds + consumedSeconds);
        return tickResult(task.taskId, false, true, false, consumedSeconds, remainingSeconds, null);
      }
      break;
    }
    if (isTerminalPhase(task.phase)) {
      return tickResult(task.taskId, false, true, task.phase === 'failed' || task.phase === 'denied', consumedSeconds, remainingSeconds, task.resultCode);
    }

    const nextBoundary = task.aimTracking.nextTrackingBoundarySeconds;
    if (nextBoundary <= now + TIME_EPSILON_SECONDS) {
      updateAimTrackingAtBoundary(input.state, unit, task, weapon, nextBoundary);
      if (task.phase === 'aiming' && canCommitAtCurrentQuality(task)) {
        transition(task, 'firing', now);
        return tickResult(task.taskId, true, false, false, consumedSeconds, remainingSeconds, null);
      }
      continue;
    }

    const timeToBoundary = Math.max(0, nextBoundary - now);
    if (task.phase === 'weapon_ready') {
      const used = Math.min(remainingSeconds, task.readyRemainingSeconds, timeToBoundary);
      task.readyRemainingSeconds = cleanDuration(task.readyRemainingSeconds - used);
      remainingSeconds = cleanDuration(remainingSeconds - used);
      consumedSeconds = cleanDuration(consumedSeconds + used);
      if (task.readyRemainingSeconds <= TIME_EPSILON_SECONDS) {
        task.readyRemainingSeconds = 0;
        transition(task, 'aiming', intervalStartSeconds + consumedSeconds);
        if (canCommitAtCurrentQuality(task)) {
          transition(task, 'firing', intervalStartSeconds + consumedSeconds);
          return tickResult(task.taskId, true, false, false, consumedSeconds, remainingSeconds, null);
        }
        continue;
      }
      if (used + TIME_EPSILON_SECONDS >= timeToBoundary) continue;
      break;
    }

    if (task.phase === 'aiming') {
      if (canCommitAtCurrentQuality(task)) {
        transition(task, 'firing', now);
        return tickResult(task.taskId, true, false, false, consumedSeconds, remainingSeconds, null);
      }
      const factors = task.aimTracking.solution.factors;
      const timeToThreshold = calculateTimeToThreshold(task, factors.aimQualityPerSecond);
      const used = Math.min(remainingSeconds, timeToBoundary, timeToThreshold);
      if (used <= TIME_EPSILON_SECONDS) {
        if (timeToThreshold <= TIME_EPSILON_SECONDS && canCommitAtCurrentQuality(task)) continue;
        break;
      }
      advanceAimPhysicalProgress(task, factors, used);
      remainingSeconds = cleanDuration(remainingSeconds - used);
      consumedSeconds = cleanDuration(consumedSeconds + used);
      if (canCommitAtCurrentQuality(task)) {
        transition(task, 'firing', intervalStartSeconds + consumedSeconds);
        return tickResult(task.taskId, true, false, false, consumedSeconds, remainingSeconds, null);
      }
      if (used + TIME_EPSILON_SECONDS >= timeToBoundary) continue;
      break;
    }
  }

  return tickResult(task.taskId, task.phase === 'firing', false, false, consumedSeconds, remainingSeconds, null);
}

/** Compatibility clock for old isolated tests that do not own a SimulationState. */
function tickLegacyActionClock(unit: UnitModel, input: TickFireTaskInput): TickFireTaskResult {
  const task = unit.infantryCombatRuntime.activeFireTask!;
  const weapon = unit.infantryCombatRuntime.primaryWeapon!;
  let remainingSeconds = finiteNonNegative(input.deltaSeconds, 0);
  let consumedSeconds = 0;
  const intervalStartSeconds = finiteNonNegative(input.intervalStartSeconds, 0);
  while (remainingSeconds > TIME_EPSILON_SECONDS) {
    if (task.phase === 'accepted') {
      transition(task, 'weapon_ready', intervalStartSeconds + consumedSeconds);
      continue;
    }
    if (task.phase === 'weapon_ready') {
      const used = Math.min(remainingSeconds, task.readyRemainingSeconds);
      task.readyRemainingSeconds = cleanDuration(task.readyRemainingSeconds - used);
      remainingSeconds = cleanDuration(remainingSeconds - used);
      consumedSeconds = cleanDuration(consumedSeconds + used);
      if (task.readyRemainingSeconds <= TIME_EPSILON_SECONDS) {
        task.readyRemainingSeconds = 0;
        transition(task, 'aiming', intervalStartSeconds + consumedSeconds);
        continue;
      }
      break;
    }
    if (task.phase === 'aiming') {
      if (task.aimQuality + TIME_EPSILON_SECONDS >= task.minimumSolutionQuality) {
        task.aimQuality = Math.max(task.aimQuality, task.minimumSolutionQuality);
        transition(task, 'firing', intervalStartSeconds + consumedSeconds);
        return tickResult(task.taskId, true, false, false, consumedSeconds, remainingSeconds, null);
      }
      const rate = finiteNonNegative(weapon.resolved.weapon.aimQualityPerSecond, 0);
      if (rate <= TIME_EPSILON_SECONDS) break;
      const needed = Math.max(0, (task.minimumSolutionQuality - task.aimQuality) / rate);
      const used = Math.min(remainingSeconds, needed);
      task.aimQuality = clamp01(task.aimQuality + rate * used);
      task.aimTracking.solution.physicalAimQuality = task.aimQuality;
      task.aimTracking.solution.solutionQuality = 1;
      task.aimTracking.solution.usableAimQuality = task.aimQuality;
      remainingSeconds = cleanDuration(remainingSeconds - used);
      consumedSeconds = cleanDuration(consumedSeconds + used);
      if (used + TIME_EPSILON_SECONDS >= needed) {
        task.aimQuality = Math.max(task.aimQuality, task.minimumSolutionQuality);
        transition(task, 'firing', intervalStartSeconds + consumedSeconds);
        return tickResult(task.taskId, true, false, false, consumedSeconds, remainingSeconds, null);
      }
      break;
    }
    if (task.phase === 'firing') return tickResult(task.taskId, true, false, false, consumedSeconds, remainingSeconds, null);
    if (task.phase === 'recovery') {
      const used = Math.min(remainingSeconds, task.recoveryRemainingSeconds);
      task.recoveryRemainingSeconds = cleanDuration(task.recoveryRemainingSeconds - used);
      remainingSeconds = cleanDuration(remainingSeconds - used);
      consumedSeconds = cleanDuration(consumedSeconds + used);
      if (task.recoveryRemainingSeconds <= TIME_EPSILON_SECONDS) {
        completeActiveFireTask(unit, intervalStartSeconds + consumedSeconds);
        return tickResult(task.taskId, false, true, false, consumedSeconds, remainingSeconds, null);
      }
      break;
    }
    return tickResult(task.taskId, false, isTerminalPhase(task.phase), task.phase === 'failed' || task.phase === 'denied', consumedSeconds, remainingSeconds, task.resultCode);
  }
  return tickResult(task.taskId, task.phase === 'firing', false, false, consumedSeconds, remainingSeconds, null);
}

function validateTickPrerequisites(unit: UnitModel, input: TickFireTaskInput): TickFireTaskResult | null {
  const task = unit.infantryCombatRuntime.activeFireTask;
  const deltaSeconds = finiteNonNegative(input.deltaSeconds, 0);
  const intervalStartSeconds = finiteNonNegative(input.intervalStartSeconds, 0);
  if (!task) return tickResult(null, false, false, false, 0, deltaSeconds, null);
  if (!task.actionHandle || !getPhysicalActionLease(unit, task.actionHandle)) {
    failActiveFireTask(unit, {
      endedSeconds: intervalStartSeconds,
      resultCode: 'infantry_fire_task_ownership_lost',
      resultRu: 'Огневая задача потеряла точный захват канала оружия.',
    });
    return tickResult(task.taskId, false, false, true, 0, deltaSeconds, 'infantry_fire_task_ownership_lost');
  }
  if (!unit.infantryCombatRuntime.primaryWeapon) {
    failActiveFireTask(unit, {
      endedSeconds: intervalStartSeconds,
      resultCode: 'infantry_fire_task_weapon_missing',
      resultRu: 'Основная винтовка исчезла во время огневой задачи.',
    });
    return tickResult(task.taskId, false, false, true, 0, deltaSeconds, 'infantry_fire_task_weapon_missing');
  }
  return null;
}

function calculateTimeToThreshold(task: FireTaskRuntimeV1, physicalRate: number): number {
  const solution = task.aimTracking.solution;
  if (!solution.valid || solution.solutionQuality <= TIME_EPSILON_SECONDS || physicalRate <= TIME_EPSILON_SECONDS) return Number.POSITIVE_INFINITY;
  const requiredPhysical = task.minimumSolutionQuality / solution.solutionQuality;
  if (requiredPhysical > 1 + TIME_EPSILON_SECONDS) return Number.POSITIVE_INFINITY;
  return Math.max(0, (requiredPhysical - solution.physicalAimQuality) / physicalRate);
}

function canCommitAtCurrentQuality(task: FireTaskRuntimeV1): boolean {
  return task.aimTracking.solution.valid
    && task.aimTracking.solution.usableAimQuality + TIME_EPSILON_SECONDS >= task.minimumSolutionQuality;
}

export function cancelSingleFireTask(
  unit: UnitModel,
  input: CancelSingleFireTaskInput,
): CancelSingleFireTaskResult {
  const task = unit.infantryCombatRuntime.activeFireTask;
  if (!task) {
    return {
      accepted: false,
      status: unit.infantryCombatRuntime.lastFireResult ? 'already_finished' : 'not_found',
      reasonCode: unit.infantryCombatRuntime.lastFireResult?.resultCode ?? 'infantry_fire_task_not_found',
      reasonRu: unit.infantryCombatRuntime.lastFireResult?.resultRu ?? 'Активная огневая задача не найдена.',
    };
  }
  if (task.ownerToken !== cleanText(input.ownerToken, '')) {
    return { accepted: false, status: 'owner_mismatch', reasonCode: 'infantry_fire_task_owner_mismatch', reasonRu: 'Владелец не может отменить чужую огневую задачу.' };
  }
  if (!task.actionHandle) {
    terminalizeWithoutLease(unit, task, 'cancelled', input.endedSeconds, input.resultCode, input.resultRu);
    return { accepted: true, status: 'cancelled', reasonCode: input.resultCode, reasonRu: input.resultRu };
  }
  const finish = cancelPhysicalAction(unit, task.actionHandle, {
    endedSeconds: input.endedSeconds,
    resultCode: input.resultCode,
    resultRu: input.resultRu,
  });
  if (!finish.accepted) {
    return { accepted: false, status: finish.status === 'stale_handle' ? 'stale_handle' : 'not_found', reasonCode: finish.reasonCode, reasonRu: finish.reasonRu };
  }
  terminalizeWithoutLease(unit, task, 'cancelled', input.endedSeconds, finish.reasonCode, finish.reasonRu);
  return { accepted: true, status: 'cancelled', reasonCode: finish.reasonCode, reasonRu: finish.reasonRu };
}

export function failActiveFireTask(
  unit: UnitModel,
  input: { readonly endedSeconds: number; readonly resultCode: string; readonly resultRu: string; readonly denied?: boolean },
): void {
  const task = unit.infantryCombatRuntime.activeFireTask;
  if (!task) return;
  if (task.actionHandle) {
    failPhysicalAction(unit, task.actionHandle, {
      endedSeconds: input.endedSeconds,
      resultCode: input.resultCode,
      resultRu: input.resultRu,
    });
  }
  terminalizeWithoutLease(unit, task, input.denied ? 'denied' : 'failed', input.endedSeconds, input.resultCode, input.resultRu);
}

export function beginFireTaskRecovery(
  unit: UnitModel,
  input: { readonly committedShotId: string; readonly startedSeconds: number },
): boolean {
  const task = unit.infantryCombatRuntime.activeFireTask;
  const weapon = unit.infantryCombatRuntime.primaryWeapon;
  if (!task || !weapon || task.phase !== 'firing') return false;
  task.committedShotId = cleanText(input.committedShotId, task.committedShotId ?? '');
  task.recoveryRemainingSeconds = finiteNonNegative(weapon.resolved.weapon.recoverySeconds, 0);
  transition(task, 'recovery', finiteNonNegative(input.startedSeconds, task.phaseStartedSeconds));
  return true;
}

export function normalizeFireTaskRuntime(value: unknown): FireTaskRuntimeV1 | null {
  if (!isRecord(value) || value.schemaVersion !== FIRE_TASK_RUNTIME_SCHEMA_VERSION) return null;
  const taskId = cleanText(value.taskId, '');
  const ownerToken = cleanText(value.ownerToken, '');
  const target = normalizePoint(value.target);
  const phase = normalizeActivePhase(value.phase);
  const sequence = integer(value.sequence, 0, 1, Number.MAX_SAFE_INTEGER);
  if (!taskId || !ownerToken || !target || !phase || sequence <= 0 || value.mode !== 'single') return null;
  const requestedSeconds = finiteNonNegative(value.requestedSeconds, 0);
  const fallbackDirection = directionFromTarget(target);
  const aimTracking = normalizeAimTrackingRuntime(value.aimTracking, requestedSeconds, fallbackDirection);
  const legacyAimQuality = clamp01(value.aimQuality);
  if (!isRecord(value.aimTracking) && legacyAimQuality > 0) {
    aimTracking.solution.physicalAimQuality = legacyAimQuality;
    aimTracking.solution.solutionQuality = 1;
    aimTracking.solution.usableAimQuality = legacyAimQuality;
  }
  return {
    schemaVersion: FIRE_TASK_RUNTIME_SCHEMA_VERSION,
    taskId,
    sequence,
    actionHandle: normalizePhysicalActionHandle(value.actionHandle),
    owner: normalizePhysicalActionOwner(value.owner, ownerToken),
    ownerToken,
    target,
    targetRadiusMetres: 0,
    contactId: nullableText(value.contactId),
    sourceUnitId: nullableText(value.sourceUnitId),
    mode: 'single',
    phase,
    requestedSeconds,
    phaseStartedSeconds: finiteNonNegative(value.phaseStartedSeconds, 0),
    readyRemainingSeconds: finiteNonNegative(value.readyRemainingSeconds, 0),
    aimQuality: aimTracking.solution.usableAimQuality,
    aimTracking,
    minimumSolutionQuality: clamp01(value.minimumSolutionQuality),
    maximumFriendlyFireRisk: clamp01(value.maximumFriendlyFireRisk),
    recoveryRemainingSeconds: finiteNonNegative(value.recoveryRemainingSeconds, 0),
    committedShotId: nullableText(value.committedShotId),
    resultCode: nullableText(value.resultCode),
    resultRu: nullableText(value.resultRu),
  };
}

export function serializeFireTaskRuntime(value: FireTaskRuntimeV1): FireTaskRuntimeV1 {
  return {
    ...structuredClone(value),
    aimQuality: clamp01(value.aimTracking.solution.usableAimQuality),
    aimTracking: serializeAimTrackingRuntime(value.aimTracking),
  };
}

export function normalizeFireTaskTerminalResult(value: unknown): FireTaskTerminalResultV1 | null {
  if (!isRecord(value)) return null;
  const taskId = cleanText(value.taskId, '');
  const phase = value.phase;
  const resultCode = cleanText(value.resultCode, '');
  const resultRu = cleanText(value.resultRu, '');
  if (!taskId || !isTerminalResultPhase(phase) || !resultCode || !resultRu) return null;
  return {
    taskId,
    phase,
    resultCode,
    resultRu,
    endedSeconds: finiteNonNegative(value.endedSeconds, 0),
    committedShotId: nullableText(value.committedShotId),
  };
}

export function fireTaskHasExactLease(unit: UnitModel, task: FireTaskRuntimeV1): boolean {
  if (!task.actionHandle) return false;
  const lease = getPhysicalActionLease(unit, task.actionHandle);
  return Boolean(lease && lease.actionType === FIRE_TASK_ACTION_TYPE && lease.channels.length === 1 && lease.channels[0] === 'weapon' && physicalActionHandlesEqual(lease.handle, task.actionHandle));
}

function completeActiveFireTask(unit: UnitModel, endedSeconds: number): void {
  const task = unit.infantryCombatRuntime.activeFireTask;
  if (!task) return;
  const resultCode = 'infantry_fire_task_completed';
  const resultRu = 'Одиночный винтовочный выстрел и восстановление завершены.';
  if (task.actionHandle) completePhysicalAction(unit, task.actionHandle, { endedSeconds, resultCode, resultRu });
  terminalizeWithoutLease(unit, task, 'completed', endedSeconds, resultCode, resultRu);
}

function terminalizeWithoutLease(
  unit: UnitModel,
  task: FireTaskRuntimeV1,
  phase: FireTaskTerminalResultV1['phase'],
  endedSeconds: number,
  resultCode: string,
  resultRu: string,
): void {
  task.phase = phase;
  task.phaseStartedSeconds = finiteNonNegative(endedSeconds, task.phaseStartedSeconds);
  task.resultCode = cleanText(resultCode, `infantry_fire_task_${phase}`);
  task.resultRu = cleanText(resultRu, 'Огневая задача завершена.');
  unit.infantryCombatRuntime.lastFireResult = {
    taskId: task.taskId,
    phase,
    resultCode: task.resultCode,
    resultRu: task.resultRu,
    endedSeconds: task.phaseStartedSeconds,
    committedShotId: task.committedShotId,
  };
  if (unit.infantryCombatRuntime.activeFireTask === task) unit.infantryCombatRuntime.activeFireTask = null;
}

function requestRejected(status: Exclude<RequestSingleFireTaskStatus, 'started' | 'already_running'>, reasonCode: string, reasonRu: string): RequestSingleFireTaskResult {
  return { accepted: false, status, task: null, lease: null, reasonCode, reasonRu };
}

function tickResult(
  taskId: string | null,
  commitRequested: boolean,
  completed: boolean,
  failed: boolean,
  consumedSeconds: number,
  remainingSeconds: number,
  reasonCode: string | null,
): TickFireTaskResult {
  return {
    taskId,
    commitRequested,
    completed,
    failed,
    consumedSeconds: cleanDuration(consumedSeconds),
    remainingSeconds: cleanDuration(remainingSeconds),
    reasonCode,
  };
}

function transition(task: FireTaskRuntimeV1, phase: FireTaskPhase, startedSeconds: number): void {
  task.phase = phase;
  task.phaseStartedSeconds = finiteNonNegative(startedSeconds, task.phaseStartedSeconds);
}

function directionFromTarget(target: BallisticPoint3): { x: number; y: number; z: number } {
  const length = Math.hypot(target.xMetres, target.yMetres, target.zMetres);
  return length > TIME_EPSILON_SECONDS
    ? { x: target.xMetres / length, y: target.yMetres / length, z: target.zMetres / length }
    : { x: 1, y: 0, z: 0 };
}

function normalizeActivePhase(value: unknown): FireTaskRuntimeV1['phase'] | null {
  return value === 'accepted' || value === 'weapon_ready' || value === 'aiming' || value === 'firing' || value === 'recovery' ? value : null;
}

function isTerminalPhase(value: FireTaskPhase): boolean {
  return value === 'completed' || value === 'cancelled' || value === 'denied' || value === 'failed';
}

function isTerminalResultPhase(value: unknown): value is FireTaskTerminalResultV1['phase'] {
  return value === 'completed' || value === 'cancelled' || value === 'denied' || value === 'failed';
}

function normalizePoint(value: unknown): BallisticPoint3 | null {
  if (!isRecord(value) || !isFiniteNumber(value.xMetres) || !isFiniteNumber(value.yMetres) || !isFiniteNumber(value.zMetres)) return null;
  return { xMetres: value.xMetres, yMetres: value.yMetres, zMetres: value.zMetres };
}

function samePoint(left: BallisticPoint3, right: BallisticPoint3): boolean {
  return left.xMetres === right.xMetres && left.yMetres === right.yMetres && left.zMetres === right.zMetres;
}

function clamp01(value: unknown): number {
  const numeric = isFiniteNumber(value) ? value : 0;
  return Math.max(0, Math.min(1, numeric));
}

function cleanDuration(value: number): number {
  if (!Number.isFinite(value) || value <= TIME_EPSILON_SECONDS) return 0;
  return canonicalSeconds(value);
}

function finiteNonNegative(value: unknown, fallback: number): number {
  return canonicalSeconds(Math.max(0, isFiniteNumber(value) ? value : fallback));
}

function canonicalSeconds(value: number): number {
  return Math.round(value * 1_000_000_000_000) / 1_000_000_000_000;
}

function integer(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const numeric = isFiniteNumber(value) ? Math.round(value) : fallback;
  return Math.max(minimum, Math.min(maximum, numeric));
}

function cleanText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
