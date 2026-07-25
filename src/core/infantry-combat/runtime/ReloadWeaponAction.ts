import {
  cancelPhysicalAction,
  completePhysicalAction,
  failPhysicalAction,
  getPhysicalActionLease,
  requestPhysicalActionChannels,
} from '../../actions/PhysicalActionCoordinator';
import type { PhysicalActionHandleV1, PhysicalActionOwner } from '../../actions/PhysicalActionCoordinatorTypes';
import { getCombatUnitSpatialIndex } from '../../combat/CombatUnitSpatialIndex';
import type { SimulationState } from '../../simulation/SimulationState';
import type { UnitModel } from '../../units/UnitModel';
import {
  AMMO_INVENTORY_SCHEMA_VERSION,
  MAX_APPLIED_RELOAD_STAGE_IDS,
  type AmmoActionResultV1,
  type ReloadWeaponActionV1,
} from './AmmoInventoryTypes';
import {
  appendBoundedLedger,
  getReserveEntry,
  getReserveRounds,
  prepareReserveDelta,
  preparedReserveDeltaStillValid,
} from './AmmoInventoryRuntime';
import { getEffectiveCombatCapabilities } from './EffectiveCombatCapabilities';
import { assistantLeaseStillValid, requestAssistantLease } from './MachineGunAssistant';

export const RELOAD_WEAPON_ACTION_TYPE = 'infantry_reload_primary_weapon' as const;
export const RELOAD_LOCOMOTION_ACTION_TYPE = 'infantry_reload_locomotion_lock' as const;
export const RELOAD_ASSISTANT_ACTION_TYPE = 'infantry_assist_weapon_reload' as const;
const EPSILON = 1e-9;

export interface RequestReloadWeaponInput {
  readonly owner: PhysicalActionOwner;
  readonly ownerToken: string;
  readonly helperUnitId: string | null;
  readonly requestedSeconds: number;
}

export interface RequestReloadWeaponResult {
  readonly accepted: boolean;
  readonly status: 'started' | 'already_running' | 'weapon_missing' | 'weapon_full' | 'reserve_empty' | 'weapon_action_in_progress' | 'channels_blocked';
  readonly reasonCode: string;
  readonly reasonRu: string;
}

export function requestReloadWeapon(
  state: SimulationState,
  unit: UnitModel,
  input: RequestReloadWeaponInput,
): RequestReloadWeaponResult {
  const runtime = unit.infantryCombatRuntime;
  const weapon = runtime.primaryWeapon;
  if (!weapon) return rejected('weapon_missing', 'reload_weapon_missing', 'У бойца нет основного оружия.');
  if (runtime.ammoInventory.activeReload) {
    const active = runtime.ammoInventory.activeReload;
    return active.ownerToken === input.ownerToken && active.weaponInstanceId === weapon.weaponInstanceId
      ? { accepted: true, status: 'already_running', reasonCode: 'reload_already_running', reasonRu: 'Перезарядка уже выполняется.' }
      : rejected('weapon_action_in_progress', 'reload_owned_elsewhere', 'Перезарядка уже принадлежит другому владельцу.');
  }
  if (runtime.activeFireTask || weapon.deployment.activeAction || runtime.ammoInventory.activeTransfer) {
    return rejected('weapon_action_in_progress', 'weapon_action_in_progress', 'Канал оружия занят другим физическим действием.');
  }
  if (!getEffectiveCombatCapabilities(unit).canUseWeapon) {
    return rejected('weapon_action_in_progress', 'reload_capability_lost', 'Физическое состояние не позволяет перезаряжать оружие.');
  }
  const definition = weapon.resolved.weapon;
  if (weapon.roundsInWeapon >= definition.capacityRounds) return rejected('weapon_full', 'reload_weapon_full', 'Оружие уже полностью заряжено.');
  const ammoId = weapon.resolved.ammoDefinitionRef.definitionId;
  if (getReserveRounds(runtime.ammoInventory, ammoId) <= 0) return rejected('reserve_empty', 'reload_reserve_empty', 'В резерве нет подходящих патронов.');
  if (definition.reloadStages.length === 0 || definition.reloadStages.some((stage) => !stage.stageId.trim() || !Number.isFinite(stage.durationSeconds) || stage.durationSeconds < 0)) {
    return rejected('weapon_action_in_progress', 'reload_stages_invalid', 'В опубликованном профиле стадии перезарядки заданы неверно.');
  }

  const startedSeconds = finiteNonNegative(input.requestedSeconds);
  const weaponLease = requestPhysicalActionChannels(unit, {
    actionType: RELOAD_WEAPON_ACTION_TYPE,
    owner: input.owner,
    ownerToken: input.ownerToken,
    channels: ['weapon'],
    startedSeconds,
    reasonCode: 'reload_requested',
    reasonRu: 'Начата перезарядка основного оружия.',
  });
  if (!weaponLease.accepted || !weaponLease.handle) return rejected('channels_blocked', weaponLease.reasonCode, weaponLease.reasonRu);

  const helperRequest = requestAssistantLease({
    state,
    gunner: unit,
    helperUnitId: input.helperUnitId,
    actionType: RELOAD_ASSISTANT_ACTION_TYPE,
    ownerToken: input.ownerToken,
    channels: ['locomotion', 'weapon'],
    startedSeconds,
  });
  const sequence = runtime.ammoInventory.nextReloadSequence;
  runtime.ammoInventory.nextReloadSequence = increment(sequence);
  runtime.ammoInventory.activeReload = {
    schemaVersion: AMMO_INVENTORY_SCHEMA_VERSION,
    actionId: `${weapon.weaponInstanceId}:reload:${sequence}`,
    sequence,
    weaponInstanceId: weapon.weaponInstanceId,
    ammoDefinitionId: ammoId,
    owner: { ...input.owner },
    ownerToken: input.ownerToken,
    weaponHandle: weaponLease.handle,
    locomotionHandle: null,
    helperUnitId: helperRequest.handle && helperRequest.validation.helper ? helperRequest.validation.helper.id : null,
    helperActionHandle: helperRequest.handle,
    helperValidationCode: helperRequest.validation.reasonCode,
    stageIndex: 0,
    stageId: definition.reloadStages[0]!.stageId,
    completedBaseWorkSeconds: 0,
    loadedRoundsApplied: 0,
    appliedStageCompletionIds: [],
    startedSeconds,
    lastAdvancedSeconds: startedSeconds,
    status: 'running',
  };
  runtime.ammoInventory.revision = increment(runtime.ammoInventory.revision);
  return { accepted: true, status: 'started', reasonCode: 'reload_started', reasonRu: 'Перезарядка начата.' };
}

export function cancelReloadWeapon(
  state: SimulationState,
  unit: UnitModel,
  ownerToken: string,
  endedSeconds: number,
): { readonly status: 'cancelled' | 'not_found' | 'owner_mismatch' } {
  const action = unit.infantryCombatRuntime.ammoInventory.activeReload;
  if (!action) return { status: 'not_found' };
  if (action.ownerToken !== ownerToken) return { status: 'owner_mismatch' };
  finishReloadLeases(state, unit, action, endedSeconds, 'cancelled');
  recordReloadResult(unit, action, 'cancelled', endedSeconds, 'reload_cancelled', 'Перезарядка отменена.', action.loadedRoundsApplied);
  unit.infantryCombatRuntime.ammoInventory.activeReload = null;
  unit.infantryCombatRuntime.ammoInventory.revision = increment(unit.infantryCombatRuntime.ammoInventory.revision);
  return { status: 'cancelled' };
}

export function tickReloadWeaponActions(
  state: SimulationState,
  input: { readonly intervalStartSeconds: number; readonly deltaSeconds: number },
): void {
  const intervalStartSeconds = finiteNonNegative(input.intervalStartSeconds);
  const deltaSeconds = finiteNonNegative(input.deltaSeconds);
  if (deltaSeconds <= EPSILON) return;
  for (const unit of [...state.units].sort(compareUnits)) {
    const inventory = unit.infantryCombatRuntime.ammoInventory;
    const action = inventory.activeReload;
    const weapon = unit.infantryCombatRuntime.primaryWeapon;
    if (!action) continue;
    if (!weapon || action.weaponInstanceId !== weapon.weaponInstanceId || action.ammoDefinitionId !== weapon.resolved.ammoDefinitionRef.definitionId) {
      failReload(state, unit, action, intervalStartSeconds, 'reload_weapon_replaced', 'Основное оружие было заменено во время перезарядки.');
      continue;
    }
    if (!action.weaponHandle || !getPhysicalActionLease(unit, action.weaponHandle)) {
      failReload(state, unit, action, intervalStartSeconds, 'reload_weapon_ownership_lost', 'Потерян захват канала оружия.');
      continue;
    }
    if (!getEffectiveCombatCapabilities(unit).canUseWeapon) {
      failReload(state, unit, action, intervalStartSeconds, 'reload_capability_lost', 'Физическое состояние не позволяет продолжать перезарядку.');
      continue;
    }
    if (weapon.roundsInWeapon >= weapon.resolved.weapon.capacityRounds && action.loadedRoundsApplied === 0) {
      failReload(state, unit, action, intervalStartSeconds, 'reload_weapon_became_full', 'Перезарядка остановлена: оружие уже заполнено.');
      continue;
    }

    let assisted = false;
    if (action.helperActionHandle && assistantLeaseStillValid(state, unit, action.helperUnitId, action.helperActionHandle)) {
      assisted = true;
    } else if (action.helperActionHandle) {
      releaseHelper(state, action, intervalStartSeconds, 'assistant_lost');
      action.helperUnitId = null;
      action.helperActionHandle = null;
      action.helperValidationCode = 'assistant_lost';
    }

    let remaining = deltaSeconds;
    for (let guard = 0; guard < weapon.resolved.weapon.reloadStages.length + 2 && remaining > EPSILON; guard += 1) {
      const stage = weapon.resolved.weapon.reloadStages[action.stageIndex];
      if (!stage) {
        completeReload(state, unit, action, canonical(intervalStartSeconds + deltaSeconds - remaining));
        break;
      }
      action.stageId = stage.stageId;
      const boundarySeconds = canonical(intervalStartSeconds + deltaSeconds - remaining);
      if (!prepareLocomotionLease(unit, action, stage.movementAllowed, boundarySeconds)) {
        action.status = 'waiting_for_locomotion';
        action.lastAdvancedSeconds = boundarySeconds;
        break;
      }
      action.status = 'running';
      const multiplier = assisted ? clamp(weapon.resolved.weapon.assistantReloadMultiplier, 0.25, 1) : 1;
      const stageDuration = Math.max(0, stage.durationSeconds);
      const baseRemaining = Math.max(0, stageDuration - action.completedBaseWorkSeconds);
      const realTimeToComplete = baseRemaining * multiplier;
      const used = Math.min(remaining, realTimeToComplete);
      action.completedBaseWorkSeconds = Math.min(stageDuration, canonical(action.completedBaseWorkSeconds + used / multiplier));
      remaining = canonical(Math.max(0, remaining - used));
      action.lastAdvancedSeconds = canonical(boundarySeconds + used);
      if (action.completedBaseWorkSeconds + EPSILON < stageDuration) break;

      const stageCompletionId = `${action.actionId}:stage:${action.stageIndex}:${stage.stageId}`;
      if (stage.loadedRoundsAppliedAtCompletion) {
        const loaded = applyLoadStageExactlyOnce(unit, action, stageCompletionId);
        if (loaded < 0) {
          failReload(state, unit, action, action.lastAdvancedSeconds, 'reload_load_atomic_validation_failed', 'Загрузка патронов не прошла повторную атомарную проверку.');
          break;
        }
      }
      appendBoundedLedger(action.appliedStageCompletionIds, stageCompletionId, MAX_APPLIED_RELOAD_STAGE_IDS);
      action.stageIndex += 1;
      action.completedBaseWorkSeconds = 0;
      const nextStage = weapon.resolved.weapon.reloadStages[action.stageIndex];
      action.stageId = nextStage?.stageId ?? 'completed';
      if (action.stageIndex >= weapon.resolved.weapon.reloadStages.length) {
        completeReload(state, unit, action, action.lastAdvancedSeconds);
        break;
      }
    }
  }
}

function applyLoadStageExactlyOnce(unit: UnitModel, action: ReloadWeaponActionV1, completionId: string): number {
  const inventory = unit.infantryCombatRuntime.ammoInventory;
  const weapon = unit.infantryCombatRuntime.primaryWeapon;
  if (!weapon) return -1;
  if (inventory.appliedReloadLoadIds.includes(completionId) || action.appliedStageCompletionIds.includes(completionId)) return 0;
  const roundsBefore = weapon.roundsInWeapon;
  const requested = Math.max(0, weapon.resolved.weapon.capacityRounds - roundsBefore);
  const amount = Math.min(requested, getReserveRounds(inventory, action.ammoDefinitionId));
  if (amount <= 0) {
    appendBoundedLedger(inventory.appliedReloadLoadIds, completionId, MAX_APPLIED_RELOAD_STAGE_IDS);
    return 0;
  }
  const prepared = prepareReserveDelta(inventory, action.ammoDefinitionId, -amount);
  const entry = getReserveEntry(inventory, action.ammoDefinitionId);
  if (!prepared || !entry || !preparedReserveDeltaStillValid(inventory, prepared) || weapon.roundsInWeapon !== roundsBefore) return -1;

  // Both candidate states are validated before either authoritative field changes.
  entry.rounds = prepared.roundsAfter;
  weapon.roundsInWeapon = roundsBefore + amount;
  inventory.revision = increment(inventory.revision);
  action.loadedRoundsApplied += amount;
  appendBoundedLedger(inventory.appliedReloadLoadIds, completionId, MAX_APPLIED_RELOAD_STAGE_IDS);
  inventory.lastActionResult = resultFor(
    action,
    'completed',
    action.lastAdvancedSeconds,
    'reload_load_applied',
    'Патроны физически загружены в оружие.',
    amount,
  );
  return amount;
}

function prepareLocomotionLease(
  unit: UnitModel,
  action: ReloadWeaponActionV1,
  movementAllowed: boolean,
  startedSeconds: number,
): boolean {
  if (movementAllowed) {
    if (action.locomotionHandle && getPhysicalActionLease(unit, action.locomotionHandle)) {
      completePhysicalAction(unit, action.locomotionHandle, {
        endedSeconds: startedSeconds,
        resultCode: 'reload_locomotion_released',
        resultRu: 'Стадия перезарядки разрешает движение.',
      });
    }
    action.locomotionHandle = null;
    return true;
  }
  if (action.locomotionHandle && getPhysicalActionLease(unit, action.locomotionHandle)) return true;
  const request = requestPhysicalActionChannels(unit, {
    actionType: RELOAD_LOCOMOTION_ACTION_TYPE,
    owner: action.owner,
    ownerToken: `${action.ownerToken}:locomotion:${action.stageIndex}`,
    channels: ['locomotion'],
    startedSeconds,
    reasonCode: 'reload_locomotion_required',
    reasonRu: 'Текущая стадия перезарядки требует неподвижности.',
  });
  if (!request.accepted || !request.handle) return false;
  action.locomotionHandle = request.handle;
  return true;
}

function completeReload(state: SimulationState, unit: UnitModel, action: ReloadWeaponActionV1, endedSeconds: number): void {
  finishReloadLeases(state, unit, action, endedSeconds, 'completed');
  recordReloadResult(unit, action, 'completed', endedSeconds, 'reload_completed', 'Перезарядка завершена.', action.loadedRoundsApplied);
  unit.infantryCombatRuntime.ammoInventory.activeReload = null;
  unit.infantryCombatRuntime.ammoInventory.revision = increment(unit.infantryCombatRuntime.ammoInventory.revision);
}

function finishReloadLeases(
  state: SimulationState,
  unit: UnitModel,
  action: ReloadWeaponActionV1,
  endedSeconds: number,
  status: 'completed' | 'cancelled' | 'failed',
): void {
  if (action.locomotionHandle && getPhysicalActionLease(unit, action.locomotionHandle)) {
    finishLease(unit, action.locomotionHandle, endedSeconds, status);
  }
  if (action.weaponHandle && getPhysicalActionLease(unit, action.weaponHandle)) {
    finishLease(unit, action.weaponHandle, endedSeconds, status);
  }
  releaseHelper(state, action, endedSeconds, status);
  action.locomotionHandle = null;
  action.weaponHandle = null;
}

function finishLease(
  unit: UnitModel,
  handle: PhysicalActionHandleV1,
  endedSeconds: number,
  status: 'completed' | 'cancelled' | 'failed',
): void {
  const input = {
    endedSeconds,
    resultCode: `reload_${status}`,
    resultRu: status === 'completed' ? 'Перезарядка завершена.' : status === 'cancelled' ? 'Перезарядка отменена.' : 'Перезарядка завершена с ошибкой.',
  };
  if (status === 'completed') completePhysicalAction(unit, handle, input);
  else if (status === 'cancelled') cancelPhysicalAction(unit, handle, input);
  else failPhysicalAction(unit, handle, input);
}

function releaseHelper(
  state: SimulationState,
  action: ReloadWeaponActionV1,
  endedSeconds: number,
  status: 'completed' | 'cancelled' | 'failed' | 'assistant_lost',
): void {
  if (!action.helperUnitId || !action.helperActionHandle) return;
  const helper = getCombatUnitSpatialIndex(state).unitsById.get(action.helperUnitId);
  if (!helper || !getPhysicalActionLease(helper, action.helperActionHandle)) return;
  if (status === 'completed') {
    completePhysicalAction(helper, action.helperActionHandle, { endedSeconds, resultCode: 'reload_assistance_completed', resultRu: 'Помощь при перезарядке завершена.' });
  } else if (status === 'failed') {
    failPhysicalAction(helper, action.helperActionHandle, { endedSeconds, resultCode: 'reload_assistance_failed', resultRu: 'Помощь при перезарядке завершена с ошибкой.' });
  } else {
    cancelPhysicalAction(helper, action.helperActionHandle, {
      endedSeconds,
      resultCode: status === 'assistant_lost' ? 'assistant_lost' : 'reload_assistance_cancelled',
      resultRu: status === 'assistant_lost' ? 'Помощник больше не участвует.' : 'Помощь при перезарядке отменена.',
    });
  }
}

function failReload(
  state: SimulationState,
  unit: UnitModel,
  action: ReloadWeaponActionV1,
  endedSeconds: number,
  code: string,
  text: string,
): void {
  finishReloadLeases(state, unit, action, endedSeconds, 'failed');
  recordReloadResult(unit, action, 'failed', endedSeconds, code, text, action.loadedRoundsApplied);
  unit.infantryCombatRuntime.ammoInventory.activeReload = null;
  unit.infantryCombatRuntime.ammoInventory.revision = increment(unit.infantryCombatRuntime.ammoInventory.revision);
}

function recordReloadResult(
  unit: UnitModel,
  action: ReloadWeaponActionV1,
  status: AmmoActionResultV1['status'],
  endedSeconds: number,
  code: string,
  text: string,
  roundsChanged: number,
): void {
  unit.infantryCombatRuntime.ammoInventory.lastActionResult = resultFor(action, status, endedSeconds, code, text, roundsChanged);
}
function resultFor(
  action: ReloadWeaponActionV1,
  status: AmmoActionResultV1['status'],
  endedSeconds: number,
  resultCode: string,
  resultRu: string,
  roundsChanged: number,
): AmmoActionResultV1 {
  return { actionId: action.actionId, kind: 'reload', status, resultCode, resultRu, endedSeconds, roundsChanged };
}
function rejected(status: RequestReloadWeaponResult['status'], reasonCode: string, reasonRu: string): RequestReloadWeaponResult { return { accepted: false, status, reasonCode, reasonRu }; }
function increment(value: number): number { return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(value)) + 1); }
function finiteNonNegative(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0; }
function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum)); }
function canonical(value: number): number { return Math.round(Math.max(0, value) * 1_000_000_000_000) / 1_000_000_000_000; }
function compareUnits(left: UnitModel, right: UnitModel): number { return left.id < right.id ? -1 : left.id > right.id ? 1 : 0; }
