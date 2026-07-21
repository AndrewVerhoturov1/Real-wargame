import type { UnitModel } from '../units/UnitModel';
import { isUnitCombatCapable } from '../combat/CombatDamage';
import {
  findWeaponDefinition,
  getWeaponRuntime,
  syncLegacyWeaponFields,
  type WeaponRuntimeState,
} from '../combat/WeaponModel';
import {
  PHYSICAL_ACTION_SCHEMA_VERSION,
  WEAPON_RELOAD_ACTION_TYPE,
  acceptedPhysicalAction,
  clampPhysicalActionProgress,
  cleanPhysicalActionText,
  finiteNonNegativePhysicalActionNumber,
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
} from './PhysicalAction';

export interface WeaponReloadActionV1 extends PhysicalActionBaseV1 {
  readonly type: typeof WEAPON_RELOAD_ACTION_TYPE;
  readonly weaponId: string;
  readonly roundsLoadedAtStart: number;
  readonly roundsReserveAtStart: number;
  readonly maximumTransferRounds: number;
  transferredRounds: number;
  normalizationCode: string | null;
  normalizationRu: string | null;
}

export interface RequestWeaponReloadInput {
  readonly owner: PhysicalActionOwner;
  readonly ownerToken: string;
  readonly startedSeconds: number;
  readonly reasonCode: string;
  readonly reasonRu: string;
}

export interface WeaponReloadDiagnostics {
  readonly running: boolean;
  readonly weaponId: string | null;
  readonly progress: number;
  readonly remainingSeconds: number;
  readonly roundsLoaded: number;
  readonly roundsReserve: number;
  readonly maximumTransferRounds: number;
  readonly transferredRounds: number;
  readonly owner: PhysicalActionOwner | null;
  readonly ownerToken: string | null;
  readonly startReasonCode: string | null;
  readonly startReasonRu: string | null;
  readonly refusalReasonCode: string | null;
  readonly refusalReasonRu: string | null;
  readonly resultCode: string | null;
  readonly resultRu: string | null;
  readonly normalizationCode: string | null;
  readonly normalizationRu: string | null;
  readonly canStart: boolean;
}

interface ReloadStartEvaluation {
  readonly allowed: boolean;
  readonly reasonCode: string;
  readonly reasonRu: string;
  readonly runtime: WeaponRuntimeState;
  readonly maximumTransferRounds: number;
}

export function requestWeaponReload(
  unit: UnitModel,
  input: RequestWeaponReloadInput,
): PhysicalActionCommandResult {
  const running = getRunningWeaponReload(unit);
  if (running) {
    if (running.ownerToken === input.ownerToken) {
      return acceptedPhysicalAction(
        running,
        'reload_already_running',
        'Эта физическая перезарядка уже выполняется данным владельцем.',
      );
    }
    return rejectedPhysicalAction(
      running,
      'reload_owned_by_other',
      `Перезарядка уже принадлежит другому владельцу: ${running.owner.source}:${running.owner.id}.`,
    );
  }

  const evaluation = evaluateWeaponReloadStart(unit);
  if (!evaluation.allowed) {
    unit.behaviorRuntime.reason = evaluation.reasonRu;
    unit.behaviorRuntime.lastEvent = evaluation.reasonCode;
    return rejectedPhysicalAction(
      unit.behaviorRuntime.physicalAction ?? null,
      evaluation.reasonCode,
      evaluation.reasonRu,
    );
  }

  const definition = findWeaponDefinition(evaluation.runtime.weaponId);
  if (!definition) {
    return rejectedPhysicalAction(
      unit.behaviorRuntime.physicalAction ?? null,
      'reload_weapon_missing',
      'Перезарядка не начата: оружие отсутствует или неизвестно.',
    );
  }

  const sequence = Math.max(0, unit.behaviorRuntime.physicalAction?.sequence ?? 0) + 1;
  const owner = normalizePhysicalActionOwner(input.owner, unit.id);
  const action: WeaponReloadActionV1 = {
    schemaVersion: PHYSICAL_ACTION_SCHEMA_VERSION,
    id: `${unit.id}:physical-action:${sequence}`,
    sequence,
    type: WEAPON_RELOAD_ACTION_TYPE,
    owner,
    ownerToken: cleanPhysicalActionText(input.ownerToken, `${owner.source}:${owner.id}`),
    weaponId: definition.id,
    startedSeconds: finiteNonNegativePhysicalActionNumber(input.startedSeconds, 0),
    durationSeconds: definition.reloadTimeSeconds,
    progress: 0,
    status: 'running',
    roundsLoadedAtStart: evaluation.runtime.roundsLoaded,
    roundsReserveAtStart: evaluation.runtime.roundsReserve,
    maximumTransferRounds: evaluation.maximumTransferRounds,
    transferredRounds: 0,
    reasonCode: cleanPhysicalActionText(input.reasonCode, 'reload_requested'),
    reasonRu: cleanPhysicalActionText(input.reasonRu, 'Начата физическая перезарядка оружия.'),
    resultCode: null,
    resultRu: null,
    normalizationCode: null,
    normalizationRu: null,
  };

  unit.behaviorRuntime.physicalAction = action;
  evaluation.runtime.ready = false;
  syncLegacyWeaponFields(unit, evaluation.runtime);
  unit.behaviorRuntime.currentAction = 'reload';
  unit.behaviorRuntime.reason = action.reasonRu;
  unit.behaviorRuntime.lastEvent = 'reload_started';
  stopPhysicalTranslation(unit);
  return acceptedPhysicalAction(action, 'reload_started', action.reasonRu);
}

export function cancelWeaponReload(
  unit: UnitModel,
  ownerToken: string,
  reasonCode = 'reload_cancelled',
  reasonRu = 'Перезарядка отменена владельцем.',
): PhysicalActionCommandResult {
  const action = getRunningWeaponReload(unit);
  if (!action) {
    return rejectedPhysicalAction(
      unit.behaviorRuntime.physicalAction ?? null,
      'reload_not_running',
      'Активной физической перезарядки нет.',
    );
  }
  if (action.ownerToken !== ownerToken) {
    return rejectedPhysicalAction(
      action,
      'reload_cancel_denied_owner',
      'Чужой владелец не может отменить эту перезарядку.',
    );
  }
  finishWeaponReload(unit, action, 'cancelled', reasonCode, reasonRu);
  return acceptedPhysicalAction(action, action.resultCode ?? 'reload_cancelled', action.resultRu ?? reasonRu);
}

export function cancelWeaponReloadBySystem(
  unit: UnitModel,
  reasonCode: string,
  reasonRu: string,
): PhysicalActionCommandResult {
  const action = getRunningWeaponReload(unit);
  if (!action) {
    return rejectedPhysicalAction(
      unit.behaviorRuntime.physicalAction ?? null,
      'reload_not_running',
      'Активной физической перезарядки нет.',
    );
  }
  finishWeaponReload(unit, action, 'cancelled', reasonCode, reasonRu);
  return acceptedPhysicalAction(action, action.resultCode ?? reasonCode, action.resultRu ?? reasonRu);
}

export function tickWeaponReload(unit: UnitModel, deltaSeconds: number): void {
  const action = getRunningWeaponReload(unit);
  if (!action) return;

  if (!isUnitCombatCapable(unit)) {
    finishWeaponReload(
      unit,
      action,
      'cancelled',
      'reload_combat_capability_lost',
      'Перезарядка отменена: боец потерял боеспособность.',
    );
    return;
  }

  const runtime = getWeaponRuntime(unit);
  if (!findWeaponDefinition(runtime.weaponId) || runtime.weaponId !== action.weaponId) {
    finishWeaponReload(
      unit,
      action,
      'failed',
      'reload_weapon_missing',
      'Перезарядка остановлена: оружие отсутствует или было заменено.',
    );
    return;
  }

  const delta = finiteNonNegativePhysicalActionNumber(deltaSeconds, 0);
  runtime.ready = false;
  syncLegacyWeaponFields(unit, runtime);
  stopPhysicalTranslation(unit);
  if (delta <= 0) return;

  action.progress = clampPhysicalActionProgress(
    action.progress + delta / Math.max(0.001, action.durationSeconds),
  );
  if (action.progress + 1e-9 < 1) {
    unit.behaviorRuntime.currentAction = 'reload';
    unit.behaviorRuntime.reason = `${action.reasonRu} ${Math.round(action.progress * 100)}%.`;
    return;
  }

  completeWeaponReload(unit, action, runtime);
}

export function isWeaponReloadRunning(unit: Pick<UnitModel, 'behaviorRuntime'>): boolean {
  return unit.behaviorRuntime.physicalAction?.type === WEAPON_RELOAD_ACTION_TYPE
    && unit.behaviorRuntime.physicalAction.status === 'running';
}

export function getRunningWeaponReload(
  unit: Pick<UnitModel, 'behaviorRuntime'>,
): WeaponReloadActionV1 | null {
  return isWeaponReloadRunning(unit)
    ? unit.behaviorRuntime.physicalAction as WeaponReloadActionV1
    : null;
}

export function getWeaponReloadDiagnostics(unit: UnitModel): WeaponReloadDiagnostics {
  const runtime = getWeaponRuntime(unit);
  const action = unit.behaviorRuntime.physicalAction?.type === WEAPON_RELOAD_ACTION_TYPE
    ? unit.behaviorRuntime.physicalAction as WeaponReloadActionV1
    : null;
  const evaluation = action?.status === 'running'
    ? null
    : evaluateWeaponReloadStart(unit);
  return {
    running: action?.status === 'running',
    weaponId: action?.weaponId ?? runtime.weaponId ?? null,
    progress: action?.progress ?? 0,
    remainingSeconds: action?.status === 'running'
      ? Math.max(0, action.durationSeconds * (1 - action.progress))
      : 0,
    roundsLoaded: runtime.roundsLoaded,
    roundsReserve: runtime.roundsReserve,
    maximumTransferRounds: action?.maximumTransferRounds ?? evaluation?.maximumTransferRounds ?? 0,
    transferredRounds: action?.transferredRounds ?? 0,
    owner: action?.owner ?? null,
    ownerToken: action?.ownerToken ?? null,
    startReasonCode: action?.reasonCode ?? null,
    startReasonRu: action?.reasonRu ?? null,
    refusalReasonCode: evaluation && !evaluation.allowed ? evaluation.reasonCode : null,
    refusalReasonRu: evaluation && !evaluation.allowed ? evaluation.reasonRu : null,
    resultCode: action?.resultCode ?? null,
    resultRu: action?.resultRu ?? null,
    normalizationCode: action?.normalizationCode ?? null,
    normalizationRu: action?.normalizationRu ?? null,
    canStart: action?.status === 'running' ? false : Boolean(evaluation?.allowed),
  };
}

export function normalizeWeaponReloadAction(
  value: unknown,
  fallbackUnitId: string,
  runtime: WeaponRuntimeState,
): WeaponReloadActionV1 | null {
  if (!isPhysicalActionRecord(value) || value.type !== WEAPON_RELOAD_ACTION_TYPE) return null;

  const definition = findWeaponDefinition(runtime.weaponId);
  const sequence = physicalActionInteger(value.sequence, 1, 1, Number.MAX_SAFE_INTEGER);
  const owner = normalizePhysicalActionOwner(
    isPhysicalActionRecord(value.owner) ? value.owner : { source: 'system', id: fallbackUnitId },
    fallbackUnitId,
  );
  const restoredWeaponId = cleanPhysicalActionText(value.weaponId, runtime.weaponId);
  const roundsLoadedAtStart = clampRounds(
    value.roundsLoadedAtStart,
    definition?.magazineCapacity ?? Math.max(0, runtime.roundsLoaded),
  );
  const roundsReserveAtStart = wholeNonNegative(value.roundsReserveAtStart, runtime.roundsReserve);
  const transferLimit = definition
    ? Math.min(
        Math.max(0, definition.magazineCapacity - roundsLoadedAtStart),
        roundsReserveAtStart,
      )
    : 0;
  const maximumTransferRounds = Math.min(
    transferLimit,
    wholeNonNegative(value.maximumTransferRounds, transferLimit),
  );
  const transferredRounds = Math.min(
    maximumTransferRounds,
    wholeNonNegative(value.transferredRounds, 0),
  );
  let status = normalizePhysicalActionStatus(value.status);
  let progress = clampPhysicalActionProgress(
    finiteNonNegativePhysicalActionNumber(value.progress, status === 'completed' ? 1 : 0),
  );
  let resultCode = nullablePhysicalActionText(value.resultCode);
  let resultRu = nullablePhysicalActionText(value.resultRu);
  let normalizationCode: string | null = null;
  let normalizationRu: string | null = null;

  if (!definition || restoredWeaponId !== runtime.weaponId) {
    status = 'failed';
    resultCode = 'reload_weapon_mismatch_normalized';
    resultRu = 'Повреждённая перезарядка остановлена: действие относится к неизвестному или другому оружию.';
    normalizationCode = 'reload_weapon_mismatch_normalized';
    normalizationRu = resultRu;
  } else if (status === 'completed' && progress < 1) {
    progress = 1;
    normalizationCode = 'reload_completed_progress_normalized';
    normalizationRu = 'Прогресс завершённой перезарядки нормализован до 100% без повторного переноса патронов.';
  } else if (status === 'running' && progress >= 1) {
    progress = 1 - 1e-9;
    normalizationCode = 'reload_running_completion_boundary_normalized';
    normalizationRu = 'Активная перезарядка восстановлена непосредственно перед границей завершения.';
  }

  return {
    schemaVersion: PHYSICAL_ACTION_SCHEMA_VERSION,
    id: cleanPhysicalActionText(value.id, `${fallbackUnitId}:physical-action:${sequence}`),
    sequence,
    type: WEAPON_RELOAD_ACTION_TYPE,
    owner,
    ownerToken: cleanPhysicalActionText(value.ownerToken, `${owner.source}:${owner.id}`),
    weaponId: restoredWeaponId,
    startedSeconds: finiteNonNegativePhysicalActionNumber(value.startedSeconds, 0),
    durationSeconds: finitePositivePhysicalActionNumber(
      value.durationSeconds,
      definition?.reloadTimeSeconds ?? 0.001,
    ),
    progress,
    status,
    roundsLoadedAtStart,
    roundsReserveAtStart,
    maximumTransferRounds,
    transferredRounds: status === 'running' ? 0 : transferredRounds,
    reasonCode: cleanPhysicalActionText(value.reasonCode, 'reload_restored'),
    reasonRu: cleanPhysicalActionText(value.reasonRu, 'Физическая перезарядка восстановлена из сохранения.'),
    resultCode,
    resultRu,
    normalizationCode: normalizationCode ?? nullablePhysicalActionText(value.normalizationCode),
    normalizationRu: normalizationRu ?? nullablePhysicalActionText(value.normalizationRu),
  };
}

export function synchronizeWeaponReloadRuntimeAfterRestore(unit: UnitModel): void {
  const runtime = getWeaponRuntime(unit);
  const action = unit.behaviorRuntime.physicalAction;
  if (action?.type === WEAPON_RELOAD_ACTION_TYPE && action.status === 'running') {
    runtime.ready = false;
    unit.behaviorRuntime.currentAction = 'reload';
    unit.behaviorRuntime.reason = action.reasonRu;
    stopPhysicalTranslation(unit);
  }
  syncLegacyWeaponFields(unit, runtime);
}

function evaluateWeaponReloadStart(unit: UnitModel): ReloadStartEvaluation {
  const runtime = getWeaponRuntime(unit);
  const definition = findWeaponDefinition(runtime.weaponId);
  if (!isUnitCombatCapable(unit)) {
    return denied(runtime, 'reload_combat_capability_lost', 'Перезарядка не начата: боец небоеспособен.');
  }
  if (!definition) {
    return denied(runtime, 'reload_weapon_missing', 'Перезарядка не начата: оружие отсутствует или неизвестно.');
  }
  const physicalAction = unit.behaviorRuntime.physicalAction;
  if (physicalAction?.status === 'running') {
    return denied(
      runtime,
      'reload_physical_action_conflict',
      physicalAction.type === 'posture_transition'
        ? 'Перезарядка запрещена во время физической смены позы.'
        : 'Перезарядка запрещена: тело уже занято другим физическим действием.',
    );
  }
  if (isFireHandlingBusy(unit)) {
    return denied(
      runtime,
      'reload_fire_action_conflict',
      'Перезарядка запрещена во время наведения, выстрела или подготовки оружия к выстрелу.',
    );
  }
  const need = Math.max(0, definition.magazineCapacity - runtime.roundsLoaded);
  if (need <= 0) {
    return denied(runtime, 'reload_not_required', 'Перезарядка не требуется: магазин уже заполнен.');
  }
  if (runtime.roundsReserve <= 0) {
    return denied(runtime, 'reload_no_reserve', 'Перезарядка невозможна: в запасе нет патронов.');
  }
  return {
    allowed: true,
    reasonCode: 'reload_started',
    reasonRu: 'Физическая перезарядка может быть начата.',
    runtime,
    maximumTransferRounds: Math.min(need, runtime.roundsReserve),
  };
}

function completeWeaponReload(
  unit: UnitModel,
  action: WeaponReloadActionV1,
  runtime: WeaponRuntimeState,
): void {
  if (action.status !== 'running') return;
  const definition = findWeaponDefinition(runtime.weaponId);
  if (!definition || runtime.weaponId !== action.weaponId) {
    finishWeaponReload(
      unit,
      action,
      'failed',
      'reload_weapon_missing',
      'Перезарядка завершилась ошибкой: оружие отсутствует или было заменено.',
    );
    return;
  }

  const magazineSpace = Math.max(0, definition.magazineCapacity - runtime.roundsLoaded);
  const moved = Math.min(
    action.maximumTransferRounds,
    magazineSpace,
    Math.max(0, runtime.roundsReserve),
  );
  runtime.roundsLoaded += moved;
  runtime.roundsReserve -= moved;
  runtime.ready = runtime.roundsLoaded > 0;
  action.transferredRounds = moved;
  action.progress = 1;
  action.status = 'completed';
  action.resultCode = 'reload_completed';
  action.resultRu = `Физическая перезарядка завершена: перенесено патронов ${moved}.`;
  syncLegacyWeaponFields(unit, runtime);
  unit.behaviorRuntime.currentAction = unit.order ? 'move' : 'observe';
  unit.behaviorRuntime.reason = action.resultRu;
  unit.behaviorRuntime.lastEvent = 'reload_completed';
}

function finishWeaponReload(
  unit: UnitModel,
  action: WeaponReloadActionV1,
  status: 'cancelled' | 'failed',
  reasonCode: string,
  reasonRu: string,
): void {
  if (action.status !== 'running') return;
  const runtime = getWeaponRuntime(unit);
  action.status = status;
  action.transferredRounds = 0;
  action.resultCode = cleanPhysicalActionText(
    reasonCode,
    status === 'cancelled' ? 'reload_cancelled' : 'reload_failed',
  );
  action.resultRu = cleanPhysicalActionText(
    reasonRu,
    status === 'cancelled' ? 'Перезарядка отменена.' : 'Перезарядка завершилась ошибкой.',
  );
  runtime.ready = runtime.roundsLoaded > 0;
  syncLegacyWeaponFields(unit, runtime);
  unit.behaviorRuntime.currentAction = unit.order ? 'move' : 'observe';
  unit.behaviorRuntime.reason = action.resultRu;
  unit.behaviorRuntime.lastEvent = status === 'cancelled' ? 'reload_cancelled' : 'reload_failed';
}

function isFireHandlingBusy(unit: UnitModel): boolean {
  return unit.behaviorRuntime.currentAction === 'aim'
    || unit.behaviorRuntime.currentAction === 'fire'
    || unit.movementRuntime.weaponPreparation !== null;
}

function denied(
  runtime: WeaponRuntimeState,
  reasonCode: string,
  reasonRu: string,
): ReloadStartEvaluation {
  return { allowed: false, reasonCode, reasonRu, runtime, maximumTransferRounds: 0 };
}

function stopPhysicalTranslation(unit: UnitModel): void {
  unit.movementRuntime.isMoving = false;
  unit.movementRuntime.velocityCellsPerSecond = { x: 0, y: 0 };
}

function wholeNonNegative(value: unknown, fallback: number): number {
  return Math.max(0, Math.round(finiteNonNegativePhysicalActionNumber(value, fallback)));
}

function clampRounds(value: unknown, capacity: number): number {
  return Math.max(0, Math.min(capacity, wholeNonNegative(value, 0)));
}
