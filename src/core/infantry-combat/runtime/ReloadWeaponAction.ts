import {
  cancelPhysicalAction,
  completePhysicalAction,
  failPhysicalAction,
  getPhysicalActionLease,
  requestPhysicalActionChannels,
} from '../../actions/PhysicalActionCoordinator';
import { getCombatUnitSpatialIndex } from '../../combat/CombatUnitSpatialIndex';
import type { PhysicalActionOwner } from '../../actions/PhysicalActionCoordinatorTypes';
import type { SimulationState } from '../../simulation/SimulationState';
import type { UnitModel } from '../../units/UnitModel';
import {
  AMMO_INVENTORY_SCHEMA_VERSION,
  MAX_APPLIED_RELOAD_LOAD_IDS,
  type AmmoActionResultV1,
  type ReloadWeaponActionV1,
} from './AmmoInventoryTypes';
import {
  appendBoundedLedger,
  getReserveRounds,
  prepareReserveDelta,
  applyPreparedReserveDelta,
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

export function requestReloadWeapon(state: SimulationState, unit: UnitModel, input: RequestReloadWeaponInput): RequestReloadWeaponResult {
  const runtime = unit.infantryCombatRuntime;
  const weapon = runtime.primaryWeapon;
  if (!weapon) return rejected('weapon_missing', 'reload_weapon_missing', 'У бойца нет основного оружия.');
  if (runtime.ammoInventory.activeReload) {
    return runtime.ammoInventory.activeReload.ownerToken === input.ownerToken
      ? { accepted: true, status: 'already_running', reasonCode: 'reload_already_running', reasonRu: 'Перезарядка уже выполняется.' }
      : rejected('weapon_action_in_progress', 'reload_owned_elsewhere', 'Перезарядка уже принадлежит другому владельцу.');
  }
  if (runtime.activeFireTask || weapon.deployment.activeAction || runtime.ammoInventory.activeTransfer) {
    return rejected('weapon_action_in_progress', 'weapon_action_in_progress', 'Канал оружия занят другим физическим действием.');
  }
  const definition = weapon.resolved.weapon;
  if (weapon.roundsInWeapon >= definition.capacityRounds) return rejected('weapon_full', 'reload_weapon_full', 'Оружие уже полностью заряжено.');
  const ammoId = weapon.resolved.ammoDefinitionRef.definitionId;
  if (getReserveRounds(runtime.ammoInventory, ammoId) <= 0) return rejected('reserve_empty', 'reload_reserve_empty', 'В резерве нет подходящих патронов.');
  if (definition.reloadStages.length === 0) return rejected('weapon_action_in_progress', 'reload_stages_missing', 'В опубликованном профиле отсутствуют стадии перезарядки.');

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
  runtime.ammoInventory.nextReloadSequence = Math.min(Number.MAX_SAFE_INTEGER, sequence + 1);
  runtime.ammoInventory.activeReload = {
    schemaVersion: AMMO_INVENTORY_SCHEMA_VERSION,
    actionId: `${weapon.weaponInstanceId}:reload:${sequence}`,
    sequence,
    owner: { ...input.owner },
    ownerToken: input.ownerToken,
    weaponHandle: weaponLease.handle,
    locomotionHandle: null,
    helperUnitId: helperRequest.handle && helperRequest.validation.helper ? helperRequest.validation.helper.id : null,
    helperActionHandle: helperRequest.handle,
    helperValidationCode: helperRequest.validation.reasonCode,
    stageIndex: 0,
    completedBaseWorkSeconds: 0,
    stageLoadMutationApplied: false,
    startedSeconds,
    lastAdvancedSeconds: startedSeconds,
    status: 'running',
  };
  runtime.ammoInventory.revision += 1;
  return { accepted: true, status: 'started', reasonCode: 'reload_started', reasonRu: 'Перезарядка начата.' };
}

export function cancelReloadWeapon(state: SimulationState, unit: UnitModel, ownerToken: string, endedSeconds: number): { readonly status: 'cancelled' | 'not_found' | 'owner_mismatch' } {
  const action = unit.infantryCombatRuntime.ammoInventory.activeReload;
  if (!action) return { status: 'not_found' };
  if (action.ownerToken !== ownerToken) return { status: 'owner_mismatch' };
  finishReloadLeases(state, unit, action, endedSeconds, 'cancelled');
  recordReloadResult(unit, action, 'cancelled', endedSeconds, 'reload_cancelled', 'Перезарядка отменена.', 0);
  unit.infantryCombatRuntime.ammoInventory.activeReload = null;
  unit.infantryCombatRuntime.ammoInventory.revision += 1;
  return { status: 'cancelled' };
}

export function tickReloadWeaponActions(state: SimulationState, input: { readonly intervalStartSeconds: number; readonly deltaSeconds: number }): void {
  const intervalStartSeconds = finiteNonNegative(input.intervalStartSeconds);
  const deltaSeconds = finiteNonNegative(input.deltaSeconds);
  if (deltaSeconds <= EPSILON) return;
  for (const unit of [...state.units].sort(compareUnits)) {
    const inventory = unit.infantryCombatRuntime.ammoInventory;
    const action = inventory.activeReload;
    const weapon = unit.infantryCombatRuntime.primaryWeapon;
    if (!action || !weapon) continue;
    if (!getPhysicalActionLease(unit, action.weaponHandle)) {
      failReload(state, unit, action, intervalStartSeconds, 'reload_weapon_ownership_lost', 'Потерян захват канала оружия.');
      continue;
    }
    if (!getEffectiveCombatCapabilities(unit).canUseWeapon) {
      failReload(state, unit, action, intervalStartSeconds, 'reload_capability_lost', 'Физическое состояние не позволяет продолжать перезарядку.');
      continue;
    }

    let assisted = false;
    if (action.helperActionHandle && assistantLeaseStillValid(state, unit, action.helperUnitId, action.helperActionHandle)) assisted = true;
    else if (action.helperActionHandle) {
      releaseHelper(state, action, intervalStartSeconds, 'assistant_lost');
      action.helperUnitId = null;
      action.helperActionHandle = null;
      action.helperValidationCode = 'assistant_lost';
    }

    let remaining = deltaSeconds;
    for (let guard = 0; guard < weapon.resolved.weapon.reloadStages.length + 2 && remaining > EPSILON; guard += 1) {
      const stage = weapon.resolved.weapon.reloadStages[action.stageIndex];
      if (!stage) {
        finishReloadLeases(state, unit, action, intervalStartSeconds + deltaSeconds - remaining, 'completed');
        recordReloadResult(unit, action, 'completed', intervalStartSeconds + deltaSeconds - remaining, 'reload_completed', 'Перезарядка завершена.', 0);
        inventory.activeReload = null;
        inventory.revision += 1;
        break;
      }
      const boundarySeconds = intervalStartSeconds + deltaSeconds - remaining;
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
      action.completedBaseWorkSeconds = Math.min(stageDuration, action.completedBaseWorkSeconds + used / multiplier);
      remaining -= used;
      action.lastAdvancedSeconds = boundarySeconds + used;
      if (action.completedBaseWorkSeconds + EPSILON < stageDuration) break;

      let roundsChanged = 0;
      if (stage.loadedRoundsAppliedAtCompletion && !action.stageLoadMutationApplied) {
        const loadId = `${action.actionId}:stage:${action.stageIndex}:load`;
        if (!inventory.appliedReloadLoadIds.includes(loadId)) {
          const ammoId = weapon.resolved.ammoDefinitionRef.definitionId;
          const amount = Math.min(
            weapon.resolved.weapon.capacityRounds - weapon.roundsInWeapon,
            getReserveRounds(inventory, ammoId),
          );
          const prepared = prepareReserveDelta(inventory, ammoId, -amount);
          if (amount > 0 && prepared && applyPreparedReserveDelta(inventory, prepared)) {
            weapon.roundsInWeapon += amount;
            roundsChanged = amount;
          }
          appendBoundedLedger(inventory.appliedReloadLoadIds, loadId, MAX_APPLIED_RELOAD_LOAD_IDS);
        }
        action.stageLoadMutationApplied = true;
      }
      action.stageIndex += 1;
      action.completedBaseWorkSeconds = 0;
      action.stageLoadMutationApplied = false;
      if (roundsChanged > 0) inventory.lastActionResult = resultFor(action, 'completed', action.lastAdvancedSeconds, 'reload_load_applied', 'Патроны физически загружены в оружие.', roundsChanged);
      if (action.stageIndex >= weapon.resolved.weapon.reloadStages.length) {
        finishReloadLeases(state, unit, action, action.lastAdvancedSeconds, 'completed');
        recordReloadResult(unit, action, 'completed', action.lastAdvancedSeconds, 'reload_completed', 'Перезарядка завершена.', roundsChanged);
        inventory.activeReload = null;
        inventory.revision += 1;
        break;
      }
    }
  }
}

function prepareLocomotionLease(unit: UnitModel, action: ReloadWeaponActionV1, movementAllowed: boolean, startedSeconds: number): boolean {
  if (movementAllowed) {
    if (action.locomotionHandle && getPhysicalActionLease(unit, action.locomotionHandle)) {
      completePhysicalAction(unit, action.locomotionHandle, { endedSeconds: startedSeconds, resultCode: 'reload_locomotion_released', resultRu: 'Стадия перезарядки разрешает движение.' });
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

function finishReloadLeases(state: SimulationState, unit: UnitModel, action: ReloadWeaponActionV1, endedSeconds: number, status: 'completed' | 'cancelled' | 'failed'): void {
  if (action.locomotionHandle && getPhysicalActionLease(unit, action.locomotionHandle)) finishLease(unit, action.locomotionHandle, endedSeconds, status);
  if (getPhysicalActionLease(unit, action.weaponHandle)) finishLease(unit, action.weaponHandle, endedSeconds, status);
  releaseHelper(state, action, endedSeconds, status);
}
function finishLease(unit: UnitModel, handle: ReloadWeaponActionV1['weaponHandle'], endedSeconds: number, status: 'completed' | 'cancelled' | 'failed'): void {
  const input = { endedSeconds, resultCode: `reload_${status}`, resultRu: status === 'completed' ? 'Перезарядка завершена.' : status === 'cancelled' ? 'Перезарядка отменена.' : 'Перезарядка завершена с ошибкой.' };
  if (status === 'completed') completePhysicalAction(unit, handle, input);
  else if (status === 'cancelled') cancelPhysicalAction(unit, handle, input);
  else failPhysicalAction(unit, handle, input);
}
function releaseHelper(state: SimulationState, action: ReloadWeaponActionV1, endedSeconds: number, status: 'completed' | 'cancelled' | 'failed' | 'assistant_lost'): void {
  if (!action.helperUnitId || !action.helperActionHandle) return;
  const helper = getCombatUnitSpatialIndex(state).unitsById.get(action.helperUnitId);
  if (!helper || !getPhysicalActionLease(helper, action.helperActionHandle)) return;
  if (status === 'completed') completePhysicalAction(helper, action.helperActionHandle, { endedSeconds, resultCode: 'reload_assistance_completed', resultRu: 'Помощь при перезарядке завершена.' });
  else if (status === 'failed') failPhysicalAction(helper, action.helperActionHandle, { endedSeconds, resultCode: 'reload_assistance_failed', resultRu: 'Помощь при перезарядке завершена с ошибкой.' });
  else cancelPhysicalAction(helper, action.helperActionHandle, { endedSeconds, resultCode: status === 'assistant_lost' ? 'assistant_lost' : 'reload_assistance_cancelled', resultRu: status === 'assistant_lost' ? 'Помощник больше не участвует.' : 'Помощь при перезарядке отменена.' });
}
function failReload(state: SimulationState, unit: UnitModel, action: ReloadWeaponActionV1, endedSeconds: number, code: string, text: string): void {
  finishReloadLeases(state, unit, action, endedSeconds, 'failed');
  recordReloadResult(unit, action, 'failed', endedSeconds, code, text, 0);
  unit.infantryCombatRuntime.ammoInventory.activeReload = null;
  unit.infantryCombatRuntime.ammoInventory.revision += 1;
}
function recordReloadResult(unit: UnitModel, action: ReloadWeaponActionV1, status: AmmoActionResultV1['status'], endedSeconds: number, code: string, text: string, roundsChanged: number): void {
  unit.infantryCombatRuntime.ammoInventory.lastActionResult = resultFor(action, status, endedSeconds, code, text, roundsChanged);
}
function resultFor(action: ReloadWeaponActionV1, status: AmmoActionResultV1['status'], endedSeconds: number, resultCode: string, resultRu: string, roundsChanged: number): AmmoActionResultV1 {
  return { actionId: action.actionId, kind: 'reload', status, resultCode, resultRu, endedSeconds, roundsChanged };
}
function rejected(status: RequestReloadWeaponResult['status'], reasonCode: string, reasonRu: string): RequestReloadWeaponResult { return { accepted: false, status, reasonCode, reasonRu }; }
function finiteNonNegative(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0; }
function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum)); }
function compareUnits(left: UnitModel, right: UnitModel): number { return left.id < right.id ? -1 : left.id > right.id ? 1 : 0; }
