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
import type { PhysicalActionLeaseV1, PhysicalActionOwner } from '../../actions/PhysicalActionCoordinatorTypes';
import type { BallisticPoint3 } from '../../combat/UnitHitShapes';
import type { SimulationState } from '../../simulation/SimulationState';
import type { UnitModel } from '../../units/UnitModel';
import type { FireMode } from '../catalogs/CombatCatalogTypes';
import { getWeaponShotIntervalSeconds } from './AutomaticFireRuntime';
import {
  advanceAimPhysicalProgress,
  createAimTrackingRuntime,
  normalizeAimTrackingRuntime,
  serializeAimTrackingRuntime,
  updateAimTrackingAtBoundary,
} from './AimRuntime';
import {
  FIRE_TASK_RUNTIME_SCHEMA_VERSION,
  MAX_FIRE_TASK_ROUNDS,
  type FireTaskCommittedShotV1,
  type FireTaskPhase,
  type FireTaskRuntimeV1,
  type FireTaskTerminalResultV1,
} from './InfantryCombatRuntimeTypes';

export const FIRE_TASK_ACTION_TYPE = 'infantry_fire_task' as const;
export const MAX_SUPPRESSION_TARGET_RADIUS_METRES = 20;
export const MIN_SUPPRESSION_TARGET_RADIUS_METRES = 0.5;
const TIME_EPSILON_SECONDS = 1e-9;

export interface RequestFireTaskInput {
  readonly owner: PhysicalActionOwner;
  readonly ownerToken: string;
  readonly target: BallisticPoint3;
  readonly targetRadiusMetres: number;
  readonly contactId: string | null;
  readonly sourceUnitId: string | null;
  readonly mode: FireMode;
  readonly minimumSolutionQuality: number;
  readonly maximumFriendlyFireRisk: number;
  readonly requestedSeconds: number;
}

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

export type RequestFireTaskStatus =
  | 'started'
  | 'already_running'
  | 'active_task_owned_elsewhere'
  | 'explicit_cancel_required'
  | 'channels_blocked'
  | 'weapon_missing'
  | 'invalid_request'
  | 'unsupported_mode';

export type RequestSingleFireTaskStatus = RequestFireTaskStatus;

export interface RequestFireTaskResult {
  readonly accepted: boolean;
  readonly status: RequestFireTaskStatus;
  readonly task: FireTaskRuntimeV1 | null;
  readonly lease: PhysicalActionLeaseV1 | null;
  readonly reasonCode: string;
  readonly reasonRu: string;
}
export type RequestSingleFireTaskResult = RequestFireTaskResult;

export interface TickFireTaskInput {
  readonly intervalStartSeconds: number;
  readonly deltaSeconds: number;
  /** Omitted only by legacy isolated action-clock tests. */
  readonly state?: Pick<SimulationState, 'map'>;
}

export interface TickFireTaskResult {
  readonly taskId: string | null;
  readonly commitRequested: boolean;
  readonly requestedShotOrdinal: number | null;
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

export function requestFireTask(unit: UnitModel, input: RequestFireTaskInput): RequestFireTaskResult {
  const ownerToken = cleanText(input.ownerToken, '');
  const target = normalizePoint(input.target);
  const mode = normalizeFireMode(input.mode);
  const radius = finiteNonNegative(input.targetRadiusMetres, Number.NaN);
  if (!ownerToken || !target || !mode || !Number.isFinite(radius) || !validRadius(mode, radius)) {
    return requestRejected('invalid_request', 'infantry_fire_task_invalid_request', 'Запрос огневой задачи заполнен неверно.');
  }
  const weapon = unit.infantryCombatRuntime.primaryWeapon;
  if (!weapon) {
    return requestRejected('weapon_missing', 'infantry_fire_task_weapon_missing', 'У бойца нет нового основного оружия.');
  }
  const definition = weapon.resolved.weapon;
  const plannedRoundCount = plannedRoundsForMode(mode, definition.shortBurstRounds, definition.longBurstRounds);
  if (
    !definition.availableFireModes.includes(mode)
    || !(definition.roundsPerMinute > 0)
    || !Number.isFinite(definition.roundsPerMinute)
    || plannedRoundCount < 1
    || plannedRoundCount > MAX_FIRE_TASK_ROUNDS
    || !Number.isFinite(getWeaponShotIntervalSeconds(definition))
  ) {
    return requestRejected('unsupported_mode', 'infantry_fire_task_unsupported_mode', 'Точная ревизия оружия не поддерживает запрошенный режим огня.');
  }

  const contactId = nullableText(input.contactId);
  const sourceUnitId = nullableText(input.sourceUnitId);
  const active = unit.infantryCombatRuntime.activeFireTask;
  if (active) {
    if (active.ownerToken !== ownerToken) {
      return requestRejected('active_task_owned_elsewhere', 'infantry_fire_task_owned_elsewhere', 'Активная огневая задача принадлежит другому владельцу.');
    }
    if (
      samePoint(active.target, target)
      && active.targetRadiusMetres === radius
      && active.contactId === contactId
      && active.sourceUnitId === sourceUnitId
      && active.mode === mode
    ) {
      return {
        accepted: true,
        status: 'already_running',
        task: active,
        lease: active.actionHandle ? getPhysicalActionLease(unit, active.actionHandle) : null,
        reasonCode: 'infantry_fire_task_already_running',
        reasonRu: 'Идентичная огневая задача уже выполняется.',
      };
    }
    return requestRejected('explicit_cancel_required', 'infantry_fire_task_explicit_cancel_required', 'Для смены огневой задачи сначала явно отмените текущую.');
  }

  const requestedSeconds = finiteNonNegative(input.requestedSeconds, 0);
  const leaseResult = requestPhysicalActionChannels(unit, {
    actionType: FIRE_TASK_ACTION_TYPE,
    owner: input.owner,
    ownerToken,
    channels: ['weapon'],
    startedSeconds: requestedSeconds,
    reasonCode: 'infantry_fire_task_requested',
    reasonRu: 'Начата подготовка огневой задачи.',
  });
  if (!leaseResult.accepted || !leaseResult.handle || !leaseResult.lease) {
    return requestRejected('channels_blocked', leaseResult.reasonCode, leaseResult.reasonRu);
  }

  const sequence = integer(unit.infantryCombatRuntime.nextFireTaskSequence, 1, 1, Number.MAX_SAFE_INTEGER);
  const initialDirection = { x: Math.cos(unit.facingRadians), y: Math.sin(unit.facingRadians), z: 0 };
  const task: FireTaskRuntimeV1 = {
    schemaVersion: FIRE_TASK_RUNTIME_SCHEMA_VERSION,
    taskId: `${unit.id}:fire-task:${sequence}`,
    sequence,
    actionHandle: { ...leaseResult.handle },
    owner: { ...leaseResult.lease.owner },
    ownerToken,
    target,
    targetRadiusMetres: radius,
    contactId,
    sourceUnitId,
    mode,
    phase: 'accepted',
    requestedSeconds,
    phaseStartedSeconds: requestedSeconds,
    readyRemainingSeconds: finiteNonNegative(definition.readySeconds, 0),
    aimQuality: 0,
    aimTracking: createAimTrackingRuntime(requestedSeconds, initialDirection),
    minimumSolutionQuality: clamp01(input.minimumSolutionQuality),
    maximumFriendlyFireRisk: clamp01(input.maximumFriendlyFireRisk),
    plannedRoundCount,
    nextShotOrdinal: 0,
    nextShotBoundarySeconds: null,
    burstStartedSeconds: null,
    lastShotCommittedSeconds: null,
    committedShots: [],
    supportPointIndex: 0,
    lastSupportPoint: null,
    recoveryRemainingSeconds: finiteNonNegative(definition.recoverySeconds, 0),
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

export function requestSingleFireTask(unit: UnitModel, input: RequestSingleFireTaskInput): RequestSingleFireTaskResult {
  return requestFireTask(unit, {
    owner: input.owner,
    ownerToken: input.ownerToken,
    target: input.target,
    targetRadiusMetres: 0,
    contactId: input.contactId ?? null,
    sourceUnitId: input.sourceUnitId ?? null,
    mode: 'single',
    minimumSolutionQuality: input.minimumSolutionQuality,
    maximumFriendlyFireRisk: input.maximumFriendlyFireRisk,
    requestedSeconds: input.requestedSeconds,
  });
}

export function tickFireTaskWithTimeBudget(unit: UnitModel, input: TickFireTaskInput): TickFireTaskResult {
  const prerequisite = validateTickPrerequisites(unit, input);
  if (prerequisite) return prerequisite;
  return input.state
    ? tickProductionFireTask(unit, input as TickFireTaskInput & { readonly state: Pick<SimulationState, 'map'> })
    : tickLegacyActionClock(unit, input);
}

function tickProductionFireTask(
  unit: UnitModel,
  input: TickFireTaskInput & { readonly state: Pick<SimulationState, 'map'> },
): TickFireTaskResult {
  const task = unit.infantryCombatRuntime.activeFireTask!;
  const weapon = unit.infantryCombatRuntime.primaryWeapon!;
  const intervalStartSeconds = finiteNonNegative(input.intervalStartSeconds, 0);
  let remainingSeconds = finiteNonNegative(input.deltaSeconds, 0);
  let consumedSeconds = 0;

  for (let guard = 0; guard < 512; guard += 1) {
    const now = canonicalSeconds(intervalStartSeconds + consumedSeconds);
    if (task.phase === 'accepted') {
      transition(task, 'weapon_ready', now);
      continue;
    }
    if (task.phase === 'recovery') {
      if (remainingSeconds <= TIME_EPSILON_SECONDS) break;
      const used = Math.min(remainingSeconds, task.recoveryRemainingSeconds);
      consume(task, 'recoveryRemainingSeconds', used);
      remainingSeconds = cleanDuration(remainingSeconds - used);
      consumedSeconds = cleanDuration(consumedSeconds + used);
      if (task.recoveryRemainingSeconds <= TIME_EPSILON_SECONDS) {
        task.recoveryRemainingSeconds = 0;
        completeActiveFireTask(unit, intervalStartSeconds + consumedSeconds);
        return tickResult(task.taskId, false, null, true, false, consumedSeconds, remainingSeconds, null);
      }
      break;
    }
    if (isTerminalPhase(task.phase)) {
      return tickResult(task.taskId, false, null, true, task.phase === 'failed' || task.phase === 'denied', consumedSeconds, remainingSeconds, task.resultCode);
    }

    if (task.aimTracking.nextTrackingBoundarySeconds <= now + TIME_EPSILON_SECONDS) {
      updateAimTrackingAtBoundary(input.state, unit, task, weapon, task.aimTracking.nextTrackingBoundarySeconds);
      if (task.phase === 'aiming' && canCommitAtCurrentQuality(task)) enterFiring(task, weapon, now);
      continue;
    }

    if (task.phase === 'firing') {
      if (!task.aimTracking.solution.valid) {
        return interruptForInvalidAim(unit, task, now, consumedSeconds, remainingSeconds);
      }
      const boundary = task.nextShotBoundarySeconds ?? Math.max(now, weapon.automaticFire.nextShotAllowedSeconds);
      task.nextShotBoundarySeconds = canonicalSeconds(boundary);
      if (boundary <= now + TIME_EPSILON_SECONDS) {
        if (!canCommitAtCurrentQuality(task)) {
          return interruptForInvalidAim(unit, task, now, consumedSeconds, remainingSeconds);
        }
        return tickResult(task.taskId, true, task.nextShotOrdinal, false, false, consumedSeconds, remainingSeconds, null);
      }
      if (remainingSeconds <= TIME_EPSILON_SECONDS) break;
      const nextEvent = Math.min(boundary, task.aimTracking.nextTrackingBoundarySeconds);
      const used = Math.min(remainingSeconds, Math.max(0, nextEvent - now));
      if (used <= TIME_EPSILON_SECONDS) continue;
      advanceAimPhysicalProgress(task, task.aimTracking.solution.factors, used);
      remainingSeconds = cleanDuration(remainingSeconds - used);
      consumedSeconds = cleanDuration(consumedSeconds + used);
      continue;
    }

    if (remainingSeconds <= TIME_EPSILON_SECONDS) break;
    const timeToTracking = Math.max(0, task.aimTracking.nextTrackingBoundarySeconds - now);
    if (task.phase === 'weapon_ready') {
      const used = Math.min(remainingSeconds, task.readyRemainingSeconds, timeToTracking);
      consume(task, 'readyRemainingSeconds', used);
      remainingSeconds = cleanDuration(remainingSeconds - used);
      consumedSeconds = cleanDuration(consumedSeconds + used);
      const eventSeconds = canonicalSeconds(intervalStartSeconds + consumedSeconds);
      if (task.readyRemainingSeconds <= TIME_EPSILON_SECONDS) {
        task.readyRemainingSeconds = 0;
        transition(task, 'aiming', eventSeconds);
        if (canCommitAtCurrentQuality(task)) enterFiring(task, weapon, eventSeconds);
        continue;
      }
      if (used + TIME_EPSILON_SECONDS >= timeToTracking) continue;
      break;
    }

    if (task.phase === 'aiming') {
      if (canCommitAtCurrentQuality(task)) {
        enterFiring(task, weapon, now);
        continue;
      }
      const factors = task.aimTracking.solution.factors;
      const timeToThreshold = calculateTimeToThreshold(task, factors.aimQualityPerSecond);
      const used = Math.min(remainingSeconds, timeToTracking, timeToThreshold);
      if (used <= TIME_EPSILON_SECONDS) break;
      advanceAimPhysicalProgress(task, factors, used);
      remainingSeconds = cleanDuration(remainingSeconds - used);
      consumedSeconds = cleanDuration(consumedSeconds + used);
      if (canCommitAtCurrentQuality(task)) enterFiring(task, weapon, intervalStartSeconds + consumedSeconds);
      continue;
    }
    break;
  }
  return tickResult(task.taskId, false, null, false, false, consumedSeconds, remainingSeconds, null);
}

function tickLegacyActionClock(unit: UnitModel, input: TickFireTaskInput): TickFireTaskResult {
  const task = unit.infantryCombatRuntime.activeFireTask!;
  const weapon = unit.infantryCombatRuntime.primaryWeapon!;
  let remainingSeconds = finiteNonNegative(input.deltaSeconds, 0);
  let consumedSeconds = 0;
  const start = finiteNonNegative(input.intervalStartSeconds, 0);
  for (let guard = 0; guard < 256; guard += 1) {
    const now = canonicalSeconds(start + consumedSeconds);
    if (task.phase === 'accepted') { transition(task, 'weapon_ready', now); continue; }
    if (task.phase === 'weapon_ready') {
      const used = Math.min(remainingSeconds, task.readyRemainingSeconds);
      consume(task, 'readyRemainingSeconds', used);
      remainingSeconds = cleanDuration(remainingSeconds - used);
      consumedSeconds = cleanDuration(consumedSeconds + used);
      if (task.readyRemainingSeconds <= TIME_EPSILON_SECONDS) { task.readyRemainingSeconds = 0; transition(task, 'aiming', start + consumedSeconds); continue; }
      break;
    }
    if (task.phase === 'aiming') {
      if (task.aimQuality + TIME_EPSILON_SECONDS >= task.minimumSolutionQuality) { enterFiring(task, weapon, now); continue; }
      const rate = finiteNonNegative(weapon.resolved.weapon.aimQualityPerSecond, 0);
      if (rate <= TIME_EPSILON_SECONDS || remainingSeconds <= TIME_EPSILON_SECONDS) break;
      const needed = Math.max(0, (task.minimumSolutionQuality - task.aimQuality) / rate);
      const used = Math.min(remainingSeconds, needed);
      task.aimQuality = clamp01(task.aimQuality + rate * used);
      task.aimTracking.solution.valid = true;
      task.aimTracking.solution.physicalAimQuality = task.aimQuality;
      task.aimTracking.solution.solutionQuality = 1;
      task.aimTracking.solution.usableAimQuality = task.aimQuality;
      remainingSeconds = cleanDuration(remainingSeconds - used);
      consumedSeconds = cleanDuration(consumedSeconds + used);
      continue;
    }
    if (task.phase === 'firing') {
      const boundary = task.nextShotBoundarySeconds ?? Math.max(now, weapon.automaticFire.nextShotAllowedSeconds);
      task.nextShotBoundarySeconds = canonicalSeconds(boundary);
      if (boundary <= now + TIME_EPSILON_SECONDS) return tickResult(task.taskId, true, task.nextShotOrdinal, false, false, consumedSeconds, remainingSeconds, null);
      const used = Math.min(remainingSeconds, boundary - now);
      remainingSeconds = cleanDuration(remainingSeconds - used);
      consumedSeconds = cleanDuration(consumedSeconds + used);
      if (used <= TIME_EPSILON_SECONDS || remainingSeconds <= TIME_EPSILON_SECONDS) break;
      continue;
    }
    if (task.phase === 'recovery') {
      const used = Math.min(remainingSeconds, task.recoveryRemainingSeconds);
      consume(task, 'recoveryRemainingSeconds', used);
      remainingSeconds = cleanDuration(remainingSeconds - used);
      consumedSeconds = cleanDuration(consumedSeconds + used);
      if (task.recoveryRemainingSeconds <= TIME_EPSILON_SECONDS) {
        completeActiveFireTask(unit, start + consumedSeconds);
        return tickResult(task.taskId, false, null, true, false, consumedSeconds, remainingSeconds, null);
      }
      break;
    }
    return tickResult(task.taskId, false, null, isTerminalPhase(task.phase), task.phase === 'failed' || task.phase === 'denied', consumedSeconds, remainingSeconds, task.resultCode);
  }
  return tickResult(task.taskId, false, null, false, false, consumedSeconds, remainingSeconds, null);
}

export function recordCommittedFireTaskShot(
  unit: UnitModel,
  input: {
    readonly ordinal: number;
    readonly shotId: string;
    readonly projectileId: string;
    readonly committedSeconds: number;
    readonly shotIntervalSeconds: number;
  },
): boolean {
  const task = unit.infantryCombatRuntime.activeFireTask;
  const weapon = unit.infantryCombatRuntime.primaryWeapon;
  if (!task || !weapon || task.phase !== 'firing' || input.ordinal !== task.nextShotOrdinal) return false;
  if (task.committedShots.some((record) => record.ordinal === input.ordinal)) return false;
  const record: FireTaskCommittedShotV1 = {
    ordinal: input.ordinal,
    shotId: cleanText(input.shotId, ''),
    projectileId: cleanText(input.projectileId, ''),
    committedSeconds: canonicalSeconds(finiteNonNegative(input.committedSeconds, task.phaseStartedSeconds)),
  };
  if (!record.shotId || !record.projectileId) return false;
  task.committedShots = [...task.committedShots, record].sort(compareCommittedShots).slice(0, task.plannedRoundCount);
  task.committedShotId = record.shotId;
  task.lastShotCommittedSeconds = record.committedSeconds;
  task.nextShotOrdinal = Math.min(task.plannedRoundCount, input.ordinal + 1);
  task.nextShotBoundarySeconds = canonicalSeconds(Math.max(
    record.committedSeconds + finiteNonNegative(input.shotIntervalSeconds, 0),
    weapon.automaticFire.nextShotAllowedSeconds,
  ));
  if (task.mode === 'suppress') {
    task.supportPointIndex = task.nextShotOrdinal;
  }
  return true;
}

export function beginFireTaskRecovery(
  unit: UnitModel,
  input: { readonly committedShotId: string; readonly startedSeconds: number; readonly resultCode?: string; readonly resultRu?: string },
): boolean {
  const task = unit.infantryCombatRuntime.activeFireTask;
  const weapon = unit.infantryCombatRuntime.primaryWeapon;
  if (!task || !weapon || task.phase !== 'firing') return false;
  task.committedShotId = cleanText(input.committedShotId, task.committedShotId ?? '');
  task.recoveryRemainingSeconds = finiteNonNegative(weapon.resolved.weapon.recoverySeconds, 0);
  task.resultCode = nullableText(input.resultCode) ?? task.resultCode;
  task.resultRu = nullableText(input.resultRu) ?? task.resultRu;
  task.nextShotBoundarySeconds = null;
  transition(task, 'recovery', finiteNonNegative(input.startedSeconds, task.phaseStartedSeconds));
  return true;
}

export function beginCompletedBurstRecovery(unit: UnitModel, startedSeconds: number): boolean {
  const task = unit.infantryCombatRuntime.activeFireTask;
  if (!task || task.committedShots.length === 0) return false;
  return beginFireTaskRecovery(unit, {
    committedShotId: task.committedShots[task.committedShots.length - 1]!.shotId,
    startedSeconds,
    resultCode: 'infantry_fire_task_completed',
    resultRu: task.mode === 'single' ? 'Одиночный выстрел завершён.' : 'Запланированная очередь завершена.',
  });
}

export function beginAmmoExhaustedRecovery(unit: UnitModel, startedSeconds: number): boolean {
  const task = unit.infantryCombatRuntime.activeFireTask;
  if (!task || task.committedShots.length === 0) return false;
  return beginFireTaskRecovery(unit, {
    committedShotId: task.committedShots[task.committedShots.length - 1]!.shotId,
    startedSeconds,
    resultCode: 'burst_ammo_exhausted',
    resultRu: 'Очередь завершена раньше: боеприпасы в оружии закончились.',
  });
}

export function cancelSingleFireTask(unit: UnitModel, input: CancelSingleFireTaskInput): CancelSingleFireTaskResult {
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
    failPhysicalAction(unit, task.actionHandle, { endedSeconds: input.endedSeconds, resultCode: input.resultCode, resultRu: input.resultRu });
  }
  terminalizeWithoutLease(unit, task, input.denied ? 'denied' : 'failed', input.endedSeconds, input.resultCode, input.resultRu);
}

export function normalizeFireTaskRuntime(value: unknown): FireTaskRuntimeV1 | null {
  if (!isRecord(value) || (value.schemaVersion !== 1 && value.schemaVersion !== FIRE_TASK_RUNTIME_SCHEMA_VERSION)) return null;
  const taskId = cleanText(value.taskId, '');
  const ownerToken = cleanText(value.ownerToken, '');
  const target = normalizePoint(value.target);
  const phase = normalizeActivePhase(value.phase);
  const sequence = integer(value.sequence, 0, 1, Number.MAX_SAFE_INTEGER);
  const mode = normalizeFireMode(value.mode);
  if (!taskId || !ownerToken || !target || !phase || sequence <= 0 || !mode) return null;
  const requestedSeconds = finiteNonNegative(value.requestedSeconds, 0);
  const aimTracking = normalizeAimTrackingRuntime(value.aimTracking, requestedSeconds, directionFromTarget(target));
  const legacyAimQuality = clamp01(value.aimQuality);
  if (!isRecord(value.aimTracking) && legacyAimQuality > 0) {
    aimTracking.solution.physicalAimQuality = legacyAimQuality;
    aimTracking.solution.solutionQuality = 1;
    aimTracking.solution.usableAimQuality = legacyAimQuality;
  }
  const plannedRoundCount = integer(
    value.plannedRoundCount,
    mode === 'single' ? 1 : 1,
    1,
    MAX_FIRE_TASK_ROUNDS,
  );
  const committedShots = normalizeCommittedShots(
    value.committedShots,
    nullableText(value.committedShotId),
    finiteNonNegative(value.lastShotCommittedSeconds ?? value.phaseStartedSeconds, requestedSeconds),
    plannedRoundCount,
  );
  const migratedNextOrdinal = committedShots.length > 0
    ? Math.min(plannedRoundCount, Math.max(...committedShots.map((record) => record.ordinal)) + 1)
    : 0;
  const nextShotOrdinal = integer(value.nextShotOrdinal, migratedNextOrdinal, migratedNextOrdinal, plannedRoundCount);
  return {
    schemaVersion: FIRE_TASK_RUNTIME_SCHEMA_VERSION,
    taskId,
    sequence,
    actionHandle: normalizePhysicalActionHandle(value.actionHandle),
    owner: normalizePhysicalActionOwner(value.owner, ownerToken),
    ownerToken,
    target,
    targetRadiusMetres: mode === 'suppress'
      ? clamp(finiteNonNegative(value.targetRadiusMetres, MIN_SUPPRESSION_TARGET_RADIUS_METRES), MIN_SUPPRESSION_TARGET_RADIUS_METRES, MAX_SUPPRESSION_TARGET_RADIUS_METRES)
      : 0,
    contactId: nullableText(value.contactId),
    sourceUnitId: nullableText(value.sourceUnitId),
    mode,
    phase,
    requestedSeconds,
    phaseStartedSeconds: finiteNonNegative(value.phaseStartedSeconds, 0),
    readyRemainingSeconds: finiteNonNegative(value.readyRemainingSeconds, 0),
    aimQuality: aimTracking.solution.usableAimQuality,
    aimTracking,
    minimumSolutionQuality: clamp01(value.minimumSolutionQuality),
    maximumFriendlyFireRisk: clamp01(value.maximumFriendlyFireRisk),
    plannedRoundCount,
    nextShotOrdinal,
    nextShotBoundarySeconds: nullableSeconds(value.nextShotBoundarySeconds),
    burstStartedSeconds: nullableSeconds(value.burstStartedSeconds),
    lastShotCommittedSeconds: nullableSeconds(value.lastShotCommittedSeconds) ?? committedShots.at(-1)?.committedSeconds ?? null,
    committedShots,
    supportPointIndex: integer(value.supportPointIndex, nextShotOrdinal, 0, plannedRoundCount),
    lastSupportPoint: normalizePoint(value.lastSupportPoint),
    recoveryRemainingSeconds: finiteNonNegative(value.recoveryRemainingSeconds, 0),
    committedShotId: committedShots.at(-1)?.shotId ?? nullableText(value.committedShotId),
    resultCode: nullableText(value.resultCode),
    resultRu: nullableText(value.resultRu),
  };
}

export function serializeFireTaskRuntime(value: FireTaskRuntimeV1): FireTaskRuntimeV1 {
  return {
    ...structuredClone(value),
    schemaVersion: FIRE_TASK_RUNTIME_SCHEMA_VERSION,
    aimQuality: clamp01(value.aimTracking.solution.usableAimQuality),
    aimTracking: serializeAimTrackingRuntime(value.aimTracking),
    committedShots: normalizeCommittedShots(value.committedShots, value.committedShotId, value.lastShotCommittedSeconds ?? value.phaseStartedSeconds, value.plannedRoundCount),
  };
}

export function normalizeFireTaskTerminalResult(value: unknown): FireTaskTerminalResultV1 | null {
  if (!isRecord(value)) return null;
  const taskId = cleanText(value.taskId, '');
  const phase = value.phase;
  const resultCode = cleanText(value.resultCode, '');
  const resultRu = cleanText(value.resultRu, '');
  if (!taskId || !isTerminalResultPhase(phase) || !resultCode || !resultRu) return null;
  const committedShotId = nullableText(value.committedShotId);
  const plannedRoundCount = integer(value.plannedRoundCount, 1, 1, MAX_FIRE_TASK_ROUNDS);
  const committedRoundCount = integer(value.committedRoundCount, committedShotId ? 1 : 0, 0, plannedRoundCount);
  return {
    taskId,
    phase,
    resultCode,
    resultRu,
    endedSeconds: finiteNonNegative(value.endedSeconds, 0),
    committedShotId,
    plannedRoundCount,
    committedRoundCount,
    firstCommittedShotId: nullableText(value.firstCommittedShotId) ?? committedShotId,
    lastCommittedShotId: nullableText(value.lastCommittedShotId) ?? committedShotId,
  };
}

export function fireTaskHasExactLease(unit: UnitModel, task: FireTaskRuntimeV1): boolean {
  if (!task.actionHandle) return false;
  const lease = getPhysicalActionLease(unit, task.actionHandle);
  return Boolean(
    lease
      && lease.actionType === FIRE_TASK_ACTION_TYPE
      && lease.channels.length === 1
      && lease.channels[0] === 'weapon'
      && physicalActionHandlesEqual(lease.handle, task.actionHandle),
  );
}

function validateTickPrerequisites(unit: UnitModel, input: TickFireTaskInput): TickFireTaskResult | null {
  const task = unit.infantryCombatRuntime.activeFireTask;
  const deltaSeconds = finiteNonNegative(input.deltaSeconds, 0);
  const start = finiteNonNegative(input.intervalStartSeconds, 0);
  if (!task) return tickResult(null, false, null, false, false, 0, deltaSeconds, null);
  if (!task.actionHandle || !getPhysicalActionLease(unit, task.actionHandle)) {
    failActiveFireTask(unit, { endedSeconds: start, resultCode: 'infantry_fire_task_ownership_lost', resultRu: 'Огневая задача потеряла точный захват канала оружия.' });
    return tickResult(task.taskId, false, null, false, true, 0, deltaSeconds, 'infantry_fire_task_ownership_lost');
  }
  if (!unit.infantryCombatRuntime.primaryWeapon) {
    failActiveFireTask(unit, { endedSeconds: start, resultCode: 'infantry_fire_task_weapon_missing', resultRu: 'Основное оружие исчезло во время огневой задачи.' });
    return tickResult(task.taskId, false, null, false, true, 0, deltaSeconds, 'infantry_fire_task_weapon_missing');
  }
  return null;
}

function interruptForInvalidAim(
  unit: UnitModel,
  task: FireTaskRuntimeV1,
  seconds: number,
  consumedSeconds: number,
  remainingSeconds: number,
): TickFireTaskResult {
  const code = task.committedShots.length > 0 ? 'burst_aim_solution_lost' : 'infantry_fire_task_aim_solution_invalid';
  const text = task.committedShots.length > 0
    ? 'Очередь прервана: решение прицеливания потеряно после части выстрелов.'
    : 'Огневая задача завершена: решение прицеливания недействительно.';
  failActiveFireTask(unit, { endedSeconds: seconds, resultCode: code, resultRu: text, denied: task.committedShots.length === 0 });
  return tickResult(task.taskId, false, null, false, true, consumedSeconds, remainingSeconds, code);
}

function enterFiring(task: FireTaskRuntimeV1, weapon: UnitModel['infantryCombatRuntime']['primaryWeapon'] & {}, seconds: number): void {
  const now = canonicalSeconds(finiteNonNegative(seconds, task.phaseStartedSeconds));
  transition(task, 'firing', now);
  task.burstStartedSeconds ??= now;
  task.nextShotBoundarySeconds = canonicalSeconds(Math.max(now, weapon?.automaticFire.nextShotAllowedSeconds ?? now));
}

function completeActiveFireTask(unit: UnitModel, endedSeconds: number): void {
  const task = unit.infantryCombatRuntime.activeFireTask;
  if (!task) return;
  const resultCode = task.resultCode ?? 'infantry_fire_task_completed';
  const resultRu = task.resultRu ?? (task.mode === 'single' ? 'Одиночный выстрел и восстановление завершены.' : 'Очередь и восстановление завершены.');
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
  const first = task.committedShots[0]?.shotId ?? null;
  const last = task.committedShots.at(-1)?.shotId ?? task.committedShotId;
  unit.infantryCombatRuntime.lastFireResult = {
    taskId: task.taskId,
    phase,
    resultCode: task.resultCode,
    resultRu: task.resultRu,
    endedSeconds: task.phaseStartedSeconds,
    committedShotId: last,
    plannedRoundCount: task.plannedRoundCount,
    committedRoundCount: task.committedShots.length,
    firstCommittedShotId: first,
    lastCommittedShotId: last,
  };
  if (unit.infantryCombatRuntime.activeFireTask === task) unit.infantryCombatRuntime.activeFireTask = null;
}

function normalizeCommittedShots(
  value: unknown,
  legacyShotId: string | null,
  legacySeconds: number,
  plannedRoundCount: number,
): FireTaskCommittedShotV1[] {
  const values = Array.isArray(value) ? value : [];
  const result: FireTaskCommittedShotV1[] = [];
  const ordinals = new Set<number>();
  const shotIds = new Set<string>();
  for (const entry of values) {
    if (!isRecord(entry)) continue;
    const ordinal = integer(entry.ordinal, -1, -1, plannedRoundCount - 1);
    const shotId = cleanText(entry.shotId, '');
    const projectileId = cleanText(entry.projectileId, shotId ? `${shotId}:projectile` : '');
    if (ordinal < 0 || !shotId || !projectileId || ordinals.has(ordinal) || shotIds.has(shotId)) continue;
    ordinals.add(ordinal); shotIds.add(shotId);
    result.push({ ordinal, shotId, projectileId, committedSeconds: canonicalSeconds(finiteNonNegative(entry.committedSeconds, legacySeconds)) });
  }
  if (result.length === 0 && legacyShotId) {
    result.push({ ordinal: 0, shotId: legacyShotId, projectileId: `${legacyShotId}:projectile`, committedSeconds: canonicalSeconds(legacySeconds) });
  }
  return result.sort(compareCommittedShots).slice(0, plannedRoundCount);
}
function compareCommittedShots(left: FireTaskCommittedShotV1, right: FireTaskCommittedShotV1): number { return left.ordinal - right.ordinal || compareText(left.shotId, right.shotId); }
function plannedRoundsForMode(mode: FireMode, shortRounds: number, longRounds: number): number {
  if (mode === 'single') return 1;
  return integer(mode === 'short_burst' ? shortRounds : longRounds, 0, 0, MAX_FIRE_TASK_ROUNDS + 1);
}
function validRadius(mode: FireMode, radius: number): boolean {
  return mode === 'suppress'
    ? radius >= MIN_SUPPRESSION_TARGET_RADIUS_METRES && radius <= MAX_SUPPRESSION_TARGET_RADIUS_METRES
    : radius === 0;
}
function calculateTimeToThreshold(task: FireTaskRuntimeV1, physicalRate: number): number {
  const solution = task.aimTracking.solution;
  if (!solution.valid || solution.solutionQuality <= TIME_EPSILON_SECONDS || physicalRate <= TIME_EPSILON_SECONDS) return Number.POSITIVE_INFINITY;
  const requiredPhysical = task.minimumSolutionQuality / solution.solutionQuality;
  if (requiredPhysical > 1 + TIME_EPSILON_SECONDS) return Number.POSITIVE_INFINITY;
  return Math.max(0, (requiredPhysical - solution.physicalAimQuality) / physicalRate);
}
function canCommitAtCurrentQuality(task: FireTaskRuntimeV1): boolean {
  return task.aimTracking.solution.valid && task.aimTracking.solution.usableAimQuality + TIME_EPSILON_SECONDS >= task.minimumSolutionQuality;
}
function requestRejected(status: Exclude<RequestFireTaskStatus, 'started' | 'already_running'>, reasonCode: string, reasonRu: string): RequestFireTaskResult { return { accepted: false, status, task: null, lease: null, reasonCode, reasonRu }; }
function tickResult(taskId: string | null, commitRequested: boolean, requestedShotOrdinal: number | null, completed: boolean, failed: boolean, consumedSeconds: number, remainingSeconds: number, reasonCode: string | null): TickFireTaskResult {
  return { taskId, commitRequested, requestedShotOrdinal, completed, failed, consumedSeconds: cleanDuration(consumedSeconds), remainingSeconds: cleanDuration(remainingSeconds), reasonCode };
}
function transition(task: FireTaskRuntimeV1, phase: FireTaskPhase, startedSeconds: number): void { task.phase = phase; task.phaseStartedSeconds = finiteNonNegative(startedSeconds, task.phaseStartedSeconds); }
function consume(task: FireTaskRuntimeV1, field: 'readyRemainingSeconds' | 'recoveryRemainingSeconds', seconds: number): void { task[field] = cleanDuration(task[field] - seconds); }
function directionFromTarget(target: BallisticPoint3): { x: number; y: number; z: number } { const length = Math.hypot(target.xMetres, target.yMetres, target.zMetres); return length > TIME_EPSILON_SECONDS ? { x: target.xMetres / length, y: target.yMetres / length, z: target.zMetres / length } : { x: 1, y: 0, z: 0 }; }
function normalizeActivePhase(value: unknown): FireTaskRuntimeV1['phase'] | null { return value === 'accepted' || value === 'weapon_ready' || value === 'aiming' || value === 'firing' || value === 'recovery' ? value : null; }
function normalizeFireMode(value: unknown): FireMode | null { return value === 'single' || value === 'short_burst' || value === 'long_burst' || value === 'suppress' ? value : null; }
function isTerminalPhase(value: FireTaskPhase): boolean { return value === 'completed' || value === 'cancelled' || value === 'denied' || value === 'failed'; }
function isTerminalResultPhase(value: unknown): value is FireTaskTerminalResultV1['phase'] { return value === 'completed' || value === 'cancelled' || value === 'denied' || value === 'failed'; }
function normalizePoint(value: unknown): BallisticPoint3 | null { if (!isRecord(value) || !isFiniteNumber(value.xMetres) || !isFiniteNumber(value.yMetres) || !isFiniteNumber(value.zMetres)) return null; return { xMetres: value.xMetres, yMetres: value.yMetres, zMetres: value.zMetres }; }
function samePoint(left: BallisticPoint3, right: BallisticPoint3): boolean { return left.xMetres === right.xMetres && left.yMetres === right.yMetres && left.zMetres === right.zMetres; }
function clamp01(value: unknown): number { const numeric = isFiniteNumber(value) ? value : 0; return Math.max(0, Math.min(1, numeric)); }
function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, value)); }
function cleanDuration(value: number): number { if (!Number.isFinite(value) || value <= TIME_EPSILON_SECONDS) return 0; return canonicalSeconds(value); }
function finiteNonNegative(value: unknown, fallback: number): number { return canonicalSeconds(Math.max(0, isFiniteNumber(value) ? value : fallback)); }
function nullableSeconds(value: unknown): number | null { return isFiniteNumber(value) ? canonicalSeconds(Math.max(0, value)) : null; }
function canonicalSeconds(value: number): number { return Math.round(value * 1_000_000_000_000) / 1_000_000_000_000; }
function integer(value: unknown, fallback: number, minimum: number, maximum: number): number { const numeric = isFiniteNumber(value) ? Math.round(value) : fallback; return Math.max(minimum, Math.min(maximum, numeric)); }
function cleanText(value: unknown, fallback: string): string { return typeof value === 'string' && value.trim() ? value.trim() : fallback; }
function nullableText(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function isFiniteNumber(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
