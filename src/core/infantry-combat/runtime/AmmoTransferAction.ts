import {
  cancelPhysicalAction,
  completePhysicalAction,
  failPhysicalAction,
  getPhysicalActionLease,
  requestPhysicalActionChannels,
} from '../../actions/PhysicalActionCoordinator';
import { getCombatUnitSpatialIndex } from '../../combat/CombatUnitSpatialIndex';
import type { SimulationState } from '../../simulation/SimulationState';
import type { UnitModel } from '../../units/UnitModel';
import {
  AMMO_INVENTORY_SCHEMA_VERSION,
  MAX_APPLIED_AMMO_TRANSFER_IDS,
  type AmmoActionResultV1,
  type AmmoTransferActionV1,
} from './AmmoInventoryTypes';
import {
  appendBoundedLedger,
  applyPreparedReserveDelta,
  getMaximumReserveRounds,
  getReserveRounds,
  prepareReserveDelta,
} from './AmmoInventoryRuntime';
import { getEffectiveCombatCapabilities } from './EffectiveCombatCapabilities';
import { validateMachineGunAssistant } from './MachineGunAssistant';

export const AMMO_TRANSFER_SOURCE_ACTION_TYPE = 'infantry_ammo_transfer_source' as const;
export const AMMO_TRANSFER_TARGET_ACTION_TYPE = 'infantry_ammo_transfer_target' as const;
export const AMMO_TRANSFER_BASE_SECONDS = 0.75;
export const AMMO_TRANSFER_ROUNDS_PER_SECOND = 30;
export const MAX_AMMO_TRANSFER_REQUEST_ROUNDS = 1000;
const EPSILON = 1e-9;

export interface RequestAmmoTransferInput {
  readonly sourceUnitId: string;
  readonly targetUnitId: string;
  readonly ammoDefinitionId: string;
  readonly requestedRounds: number;
  readonly ownerToken: string;
  readonly requestedSeconds: number;
}

export interface RequestAmmoTransferResult {
  readonly accepted: boolean;
  readonly status: 'started' | 'already_running' | 'invalid_request' | 'assistant_invalid' | 'weapon_action_in_progress' | 'channels_blocked' | 'reserve_empty' | 'target_full';
  readonly reasonCode: string;
  readonly reasonRu: string;
}

export function requestAmmoTransfer(state: SimulationState, input: RequestAmmoTransferInput): RequestAmmoTransferResult {
  const index = getCombatUnitSpatialIndex(state);
  const source = index.unitsById.get(input.sourceUnitId);
  const target = index.unitsById.get(input.targetUnitId);
  const ammoDefinitionId = cleanText(input.ammoDefinitionId, '');
  const requestedRounds = integer(input.requestedRounds, 0, 1, MAX_AMMO_TRANSFER_REQUEST_ROUNDS);
  const ownerToken = cleanText(input.ownerToken, '');
  if (!source || !target || !ammoDefinitionId || !ownerToken || requestedRounds < 1) return rejected('invalid_request', 'ammo_transfer_invalid_request', 'Запрос передачи патронов заполнен неверно.');
  const validation = validateMachineGunAssistant(state, target, source.id);
  if (!validation.valid) return rejected('assistant_invalid', validation.reasonCode, validation.reasonRu);
  const sourceInventory = source.infantryCombatRuntime.ammoInventory;
  const targetInventory = target.infantryCombatRuntime.ammoInventory;
  if (sourceInventory.activeTransfer) {
    return sourceInventory.activeTransfer.targetUnitId === target.id && sourceInventory.activeTransfer.ammoDefinitionId === ammoDefinitionId
      ? { accepted: true, status: 'already_running', reasonCode: 'ammo_transfer_already_running', reasonRu: 'Такая передача патронов уже выполняется.' }
      : rejected('weapon_action_in_progress', 'ammo_transfer_source_busy', 'Помощник уже участвует в другой передаче патронов.');
  }
  if (targetInventory.activeTransfer || sourceInventory.activeReload || targetInventory.activeReload
    || source.infantryCombatRuntime.activeFireTask || target.infantryCombatRuntime.activeFireTask
    || source.infantryCombatRuntime.primaryWeapon?.deployment.activeAction || target.infantryCombatRuntime.primaryWeapon?.deployment.activeAction) {
    return rejected('weapon_action_in_progress', 'weapon_action_in_progress', 'Один из бойцов занят несовместимым действием оружия.');
  }
  if (getReserveRounds(sourceInventory, ammoDefinitionId) <= 0) return rejected('reserve_empty', 'ammo_transfer_source_empty', 'У помощника нет подходящих патронов.');
  if (getReserveRounds(targetInventory, ammoDefinitionId) >= getMaximumReserveRounds(targetInventory, ammoDefinitionId)) return rejected('target_full', 'ammo_transfer_target_full', 'Резерв пулемётчика уже заполнен.');

  const startedSeconds = finiteNonNegative(input.requestedSeconds);
  const sourceLease = requestPhysicalActionChannels(source, {
    actionType: AMMO_TRANSFER_SOURCE_ACTION_TYPE,
    owner: { source: 'system', id: `${source.id}:${target.id}:ammo-transfer` },
    ownerToken: `${ownerToken}:source`,
    channels: ['locomotion', 'weapon'],
    startedSeconds,
    reasonCode: 'ammo_transfer_source_started',
    reasonRu: 'Помощник передаёт патроны пулемётчику.',
  });
  if (!sourceLease.accepted || !sourceLease.handle) return rejected('channels_blocked', sourceLease.reasonCode, sourceLease.reasonRu);
  const targetLease = requestPhysicalActionChannels(target, {
    actionType: AMMO_TRANSFER_TARGET_ACTION_TYPE,
    owner: { source: 'system', id: `${source.id}:${target.id}:ammo-transfer` },
    ownerToken: `${ownerToken}:target`,
    channels: ['weapon'],
    startedSeconds,
    reasonCode: 'ammo_transfer_target_started',
    reasonRu: 'Пулемётчик принимает патроны.',
  });
  if (!targetLease.accepted || !targetLease.handle) {
    cancelPhysicalAction(source, sourceLease.handle, { endedSeconds: startedSeconds, resultCode: 'ammo_transfer_target_blocked', resultRu: 'Передача не начата: канал пулемётчика занят.' });
    return rejected('channels_blocked', targetLease.reasonCode, targetLease.reasonRu);
  }

  const sequence = Math.max(sourceInventory.nextTransferSequence, targetInventory.nextTransferSequence);
  sourceInventory.nextTransferSequence = Math.min(Number.MAX_SAFE_INTEGER, sequence + 1);
  targetInventory.nextTransferSequence = Math.min(Number.MAX_SAFE_INTEGER, sequence + 1);
  const action: AmmoTransferActionV1 = {
    schemaVersion: AMMO_INVENTORY_SCHEMA_VERSION,
    actionId: `${source.id}:${target.id}:ammo-transfer:${sequence}`,
    sequence,
    sourceUnitId: source.id,
    targetUnitId: target.id,
    ammoDefinitionId,
    requestedRounds,
    durationSeconds: AMMO_TRANSFER_BASE_SECONDS + requestedRounds / AMMO_TRANSFER_ROUNDS_PER_SECOND,
    completedBaseWorkSeconds: 0,
    sourceHandle: sourceLease.handle,
    targetHandle: targetLease.handle,
    startedSeconds,
    lastAdvancedSeconds: startedSeconds,
  };
  sourceInventory.activeTransfer = structuredClone(action);
  targetInventory.activeTransfer = structuredClone(action);
  sourceInventory.revision += 1;
  targetInventory.revision += 1;
  return { accepted: true, status: 'started', reasonCode: 'ammo_transfer_started', reasonRu: 'Передача патронов начата.' };
}

export function cancelAmmoTransfer(state: SimulationState, actionId: string, endedSeconds: number): { readonly status: 'cancelled' | 'not_found' } {
  const action = findTransferAction(state, actionId);
  if (!action) return { status: 'not_found' };
  const source = getCombatUnitSpatialIndex(state).unitsById.get(action.sourceUnitId);
  const target = getCombatUnitSpatialIndex(state).unitsById.get(action.targetUnitId);
  if (source && getPhysicalActionLease(source, action.sourceHandle)) cancelPhysicalAction(source, action.sourceHandle, { endedSeconds, resultCode: 'ammo_transfer_cancelled', resultRu: 'Передача патронов отменена.' });
  if (target && getPhysicalActionLease(target, action.targetHandle)) cancelPhysicalAction(target, action.targetHandle, { endedSeconds, resultCode: 'ammo_transfer_cancelled', resultRu: 'Передача патронов отменена.' });
  clearTransfer(source, target, action, result(action, 'cancelled', endedSeconds, 'ammo_transfer_cancelled', 'Передача патронов отменена.', 0));
  return { status: 'cancelled' };
}

export function tickAmmoTransferActions(state: SimulationState, input: { readonly intervalStartSeconds: number; readonly deltaSeconds: number }): void {
  const start = finiteNonNegative(input.intervalStartSeconds);
  const delta = finiteNonNegative(input.deltaSeconds);
  if (delta <= EPSILON) return;
  const index = getCombatUnitSpatialIndex(state);
  const actions = new Map<string, AmmoTransferActionV1>();
  for (const unit of state.units) {
    const action = unit.infantryCombatRuntime.ammoInventory.activeTransfer;
    if (action) actions.set(action.actionId, action);
  }
  for (const action of [...actions.values()].sort((left, right) => compareText(left.actionId, right.actionId))) {
    const source = index.unitsById.get(action.sourceUnitId);
    const target = index.unitsById.get(action.targetUnitId);
    if (!source || !target) {
      failTransfer(source, target, action, start, 'ammo_transfer_unit_missing', 'Один из участников передачи отсутствует.');
      continue;
    }
    if (!getPhysicalActionLease(source, action.sourceHandle) || !getPhysicalActionLease(target, action.targetHandle)) {
      failTransfer(source, target, action, start, 'ammo_transfer_ownership_lost', 'Потерян физический захват одного из участников передачи.');
      continue;
    }
    const validation = validateMachineGunAssistant(state, target, source.id);
    const sourceCapabilities = getEffectiveCombatCapabilities(source);
    const targetCapabilities = getEffectiveCombatCapabilities(target);
    if (!validation.valid || !sourceCapabilities.canUseHands || !sourceCapabilities.canMove || !targetCapabilities.canUseHands) {
      failTransfer(source, target, action, start, 'ammo_transfer_revalidation_failed', 'Условия передачи патронов больше не выполняются.');
      continue;
    }
    const canonical = source.infantryCombatRuntime.ammoInventory.activeTransfer;
    if (!canonical || canonical.actionId !== action.actionId) continue;
    canonical.completedBaseWorkSeconds = Math.min(canonical.durationSeconds, canonical.completedBaseWorkSeconds + delta);
    canonical.lastAdvancedSeconds = start + delta;
    const targetCopy = target.infantryCombatRuntime.ammoInventory.activeTransfer;
    if (targetCopy?.actionId === canonical.actionId) {
      targetCopy.completedBaseWorkSeconds = canonical.completedBaseWorkSeconds;
      targetCopy.lastAdvancedSeconds = canonical.lastAdvancedSeconds;
    }
    if (canonical.completedBaseWorkSeconds + EPSILON < canonical.durationSeconds) continue;

    const sourceInventory = source.infantryCombatRuntime.ammoInventory;
    const targetInventory = target.infantryCombatRuntime.ammoInventory;
    if (sourceInventory.appliedTransferIds.includes(canonical.actionId) || targetInventory.appliedTransferIds.includes(canonical.actionId)) {
      completeTransferLeases(source, target, canonical, start + delta);
      clearTransfer(source, target, canonical, result(canonical, 'completed', start + delta, 'ammo_transfer_already_applied', 'Передача уже была применена.', 0));
      continue;
    }
    const sourceRounds = getReserveRounds(sourceInventory, canonical.ammoDefinitionId);
    const targetRounds = getReserveRounds(targetInventory, canonical.ammoDefinitionId);
    const targetMaximum = getMaximumReserveRounds(targetInventory, canonical.ammoDefinitionId);
    const transferred = Math.min(canonical.requestedRounds, sourceRounds, Math.max(0, targetMaximum - targetRounds));
    const sourceDelta = prepareReserveDelta(sourceInventory, canonical.ammoDefinitionId, -transferred);
    const targetDelta = prepareReserveDelta(targetInventory, canonical.ammoDefinitionId, transferred);
    if (transferred <= 0 || !sourceDelta || !targetDelta) {
      failTransfer(source, target, canonical, start + delta, 'ammo_transfer_nothing_to_move', 'К завершению действия передавать больше нечего.');
      continue;
    }
    const sourceApplied = applyPreparedReserveDelta(sourceInventory, sourceDelta);
    const targetApplied = sourceApplied && applyPreparedReserveDelta(targetInventory, targetDelta);
    if (!targetApplied) {
      if (sourceApplied) {
        const rollback = prepareReserveDelta(sourceInventory, canonical.ammoDefinitionId, transferred);
        if (rollback) applyPreparedReserveDelta(sourceInventory, rollback);
      }
      failTransfer(source, target, canonical, start + delta, 'ammo_transfer_atomic_validation_failed', 'Атомарная передача не прошла повторную проверку.');
      continue;
    }
    appendBoundedLedger(sourceInventory.appliedTransferIds, canonical.actionId, MAX_APPLIED_AMMO_TRANSFER_IDS);
    appendBoundedLedger(targetInventory.appliedTransferIds, canonical.actionId, MAX_APPLIED_AMMO_TRANSFER_IDS);
    completeTransferLeases(source, target, canonical, start + delta);
    clearTransfer(source, target, canonical, result(canonical, 'completed', start + delta, 'ammo_transfer_completed', 'Патроны переданы.', transferred));
  }
}

function completeTransferLeases(source: UnitModel, target: UnitModel, action: AmmoTransferActionV1, endedSeconds: number): void {
  if (getPhysicalActionLease(source, action.sourceHandle)) completePhysicalAction(source, action.sourceHandle, { endedSeconds, resultCode: 'ammo_transfer_completed', resultRu: 'Передача патронов завершена.' });
  if (getPhysicalActionLease(target, action.targetHandle)) completePhysicalAction(target, action.targetHandle, { endedSeconds, resultCode: 'ammo_transfer_completed', resultRu: 'Передача патронов завершена.' });
}
function failTransfer(source: UnitModel | undefined, target: UnitModel | undefined, action: AmmoTransferActionV1, endedSeconds: number, code: string, text: string): void {
  if (source && getPhysicalActionLease(source, action.sourceHandle)) failPhysicalAction(source, action.sourceHandle, { endedSeconds, resultCode: code, resultRu: text });
  if (target && getPhysicalActionLease(target, action.targetHandle)) failPhysicalAction(target, action.targetHandle, { endedSeconds, resultCode: code, resultRu: text });
  clearTransfer(source, target, action, result(action, 'failed', endedSeconds, code, text, 0));
}
function clearTransfer(source: UnitModel | undefined, target: UnitModel | undefined, action: AmmoTransferActionV1, actionResult: AmmoActionResultV1): void {
  for (const unit of [source, target]) {
    if (!unit) continue;
    const inventory = unit.infantryCombatRuntime.ammoInventory;
    if (inventory.activeTransfer?.actionId === action.actionId) inventory.activeTransfer = null;
    inventory.lastActionResult = structuredClone(actionResult);
    inventory.revision += 1;
  }
}
function findTransferAction(state: SimulationState, actionId: string): AmmoTransferActionV1 | null {
  const id = cleanText(actionId, '');
  if (!id) return null;
  for (const unit of state.units) {
    const action = unit.infantryCombatRuntime.ammoInventory.activeTransfer;
    if (action?.actionId === id) return action;
  }
  return null;
}
function result(action: AmmoTransferActionV1, status: AmmoActionResultV1['status'], endedSeconds: number, resultCode: string, resultRu: string, roundsChanged: number): AmmoActionResultV1 {
  return { actionId: action.actionId, kind: 'transfer', status, endedSeconds, resultCode, resultRu, roundsChanged };
}
function rejected(status: RequestAmmoTransferResult['status'], reasonCode: string, reasonRu: string): RequestAmmoTransferResult { return { accepted: false, status, reasonCode, reasonRu }; }
function finiteNonNegative(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0; }
function integer(value: unknown, fallback: number, minimum: number, maximum: number): number { const number = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback; return Math.max(minimum, Math.min(maximum, number)); }
function cleanText(value: unknown, fallback: string): string { return typeof value === 'string' && value.trim() ? value.trim() : fallback; }
function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
