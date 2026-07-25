import type { PhysicalActionHandleV1, PhysicalActionOwner } from '../../actions/PhysicalActionCoordinatorTypes';
import type { DefinitionRef, LoadoutTemplateV1 } from '../catalogs/CombatCatalogTypes';
import {
  AMMO_INVENTORY_SCHEMA_VERSION,
  MAX_AMMO_RESERVE_ENTRIES,
  MAX_APPLIED_AMMO_TRANSFER_ACTION_IDS,
  MAX_APPLIED_RELOAD_STAGE_IDS,
  type AmmoActionResultV1,
  type AmmoInventoryRuntimeV1,
  type AmmoReserveEntryV1,
  type AmmoTransferActionV1,
  type InfantryCombatRole,
  type ReloadWeaponActionV1,
} from './AmmoInventoryTypes';

export interface PreparedReserveDeltaV1 {
  readonly ammoDefinitionId: string;
  readonly roundsBefore: number;
  readonly roundsAfter: number;
  readonly maximumRounds: number;
  readonly deltaRounds: number;
}

export function createAmmoInventoryRuntime(): AmmoInventoryRuntimeV1 {
  return {
    schemaVersion: AMMO_INVENTORY_SCHEMA_VERSION,
    role: null,
    loadoutRef: null,
    reserves: [],
    nextReloadSequence: 1,
    nextTransferSequence: 1,
    activeReload: null,
    activeTransfer: null,
    appliedReloadLoadIds: [],
    appliedTransferIds: [],
    lastActionResult: null,
    revision: 0,
  };
}

export function createAmmoInventoryFromLoadout(loadout: LoadoutTemplateV1, ref: DefinitionRef): AmmoInventoryRuntimeV1 {
  const ids = new Set([
    ...Object.keys(loadout.reserveRoundsByAmmoDefinitionId),
    ...Object.keys(loadout.maximumReserveRoundsByAmmoDefinitionId),
  ]);
  const reserves = [...ids]
    .sort(compareText)
    .slice(0, MAX_AMMO_RESERVE_ENTRIES)
    .map((ammoDefinitionId): AmmoReserveEntryV1 => {
      const maximumRounds = integer(loadout.maximumReserveRoundsByAmmoDefinitionId[ammoDefinitionId], 0, 0, Number.MAX_SAFE_INTEGER);
      return {
        ammoDefinitionId,
        rounds: integer(loadout.reserveRoundsByAmmoDefinitionId[ammoDefinitionId], 0, 0, maximumRounds),
        maximumRounds,
      };
    });
  return {
    ...createAmmoInventoryRuntime(),
    role: loadout.role,
    loadoutRef: cloneRef(ref),
    reserves,
    revision: 1,
  };
}

export function normalizeAmmoInventoryRuntime(value: unknown): AmmoInventoryRuntimeV1 {
  if (!isRecord(value) || value.schemaVersion !== AMMO_INVENTORY_SCHEMA_VERSION) return createAmmoInventoryRuntime();
  return {
    schemaVersion: AMMO_INVENTORY_SCHEMA_VERSION,
    role: normalizeRole(value.role),
    loadoutRef: normalizeRef(value.loadoutRef),
    reserves: normalizeReserves(value.reserves),
    nextReloadSequence: integer(value.nextReloadSequence, 1, 1, Number.MAX_SAFE_INTEGER),
    nextTransferSequence: integer(value.nextTransferSequence, 1, 1, Number.MAX_SAFE_INTEGER),
    activeReload: normalizeReloadAction(value.activeReload),
    activeTransfer: normalizeTransferAction(value.activeTransfer),
    appliedReloadLoadIds: normalizeLedger(value.appliedReloadLoadIds, MAX_APPLIED_RELOAD_STAGE_IDS),
    appliedTransferIds: normalizeLedger(value.appliedTransferIds, MAX_APPLIED_AMMO_TRANSFER_ACTION_IDS),
    lastActionResult: normalizeActionResult(value.lastActionResult),
    revision: integer(value.revision, 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

export function serializeAmmoInventoryRuntime(value: AmmoInventoryRuntimeV1): AmmoInventoryRuntimeV1 {
  return normalizeAmmoInventoryRuntime(structuredClone(value));
}

export function sameLoadoutRef(inventory: AmmoInventoryRuntimeV1, ref: DefinitionRef): boolean {
  return inventory.loadoutRef?.definitionId === ref.definitionId && inventory.loadoutRef.revision === ref.revision;
}

export function getReserveEntry(inventory: AmmoInventoryRuntimeV1, ammoDefinitionId: string): AmmoReserveEntryV1 | null {
  const id = cleanText(ammoDefinitionId, '');
  if (!id) return null;
  return inventory.reserves.find((entry) => entry.ammoDefinitionId === id) ?? null;
}

export function getReserveRounds(inventory: AmmoInventoryRuntimeV1, ammoDefinitionId: string): number {
  return getReserveEntry(inventory, ammoDefinitionId)?.rounds ?? 0;
}

export function getMaximumReserveRounds(inventory: AmmoInventoryRuntimeV1, ammoDefinitionId: string): number {
  return getReserveEntry(inventory, ammoDefinitionId)?.maximumRounds ?? 0;
}

export function prepareReserveDelta(
  inventory: AmmoInventoryRuntimeV1,
  ammoDefinitionId: string,
  requestedDeltaRounds: number,
): PreparedReserveDeltaV1 | null {
  const entry = getReserveEntry(inventory, ammoDefinitionId);
  if (!entry || !Number.isInteger(requestedDeltaRounds)) return null;
  const roundsAfter = entry.rounds + requestedDeltaRounds;
  if (roundsAfter < 0 || roundsAfter > entry.maximumRounds) return null;
  return {
    ammoDefinitionId: entry.ammoDefinitionId,
    roundsBefore: entry.rounds,
    roundsAfter,
    maximumRounds: entry.maximumRounds,
    deltaRounds: requestedDeltaRounds,
  };
}

export function preparedReserveDeltaStillValid(
  inventory: AmmoInventoryRuntimeV1,
  prepared: PreparedReserveDeltaV1,
): boolean {
  const entry = getReserveEntry(inventory, prepared.ammoDefinitionId);
  return Boolean(
    entry
    && entry.rounds === prepared.roundsBefore
    && entry.maximumRounds === prepared.maximumRounds
    && prepared.roundsAfter >= 0
    && prepared.roundsAfter <= prepared.maximumRounds,
  );
}

export function applyPreparedReserveDelta(inventory: AmmoInventoryRuntimeV1, prepared: PreparedReserveDeltaV1): boolean {
  if (!preparedReserveDeltaStillValid(inventory, prepared)) return false;
  getReserveEntry(inventory, prepared.ammoDefinitionId)!.rounds = prepared.roundsAfter;
  inventory.revision = increment(inventory.revision);
  return true;
}

export function applyPreparedReservePair(
  leftInventory: AmmoInventoryRuntimeV1,
  left: PreparedReserveDeltaV1,
  rightInventory: AmmoInventoryRuntimeV1,
  right: PreparedReserveDeltaV1,
): boolean {
  if (!preparedReserveDeltaStillValid(leftInventory, left) || !preparedReserveDeltaStillValid(rightInventory, right)) return false;
  getReserveEntry(leftInventory, left.ammoDefinitionId)!.rounds = left.roundsAfter;
  getReserveEntry(rightInventory, right.ammoDefinitionId)!.rounds = right.roundsAfter;
  leftInventory.revision = increment(leftInventory.revision);
  rightInventory.revision = increment(rightInventory.revision);
  return true;
}

export function appendBoundedLedger(ledger: string[], id: string, maximum: number): boolean {
  const cleanId = cleanText(id, '');
  if (!cleanId || ledger.includes(cleanId)) return false;
  ledger.push(cleanId);
  ledger.sort(compareText);
  if (ledger.length > maximum) ledger.splice(0, ledger.length - maximum);
  return true;
}

function normalizeReloadAction(value: unknown): ReloadWeaponActionV1 | null {
  if (!isRecord(value) || value.schemaVersion !== AMMO_INVENTORY_SCHEMA_VERSION) return null;
  const actionId = cleanText(value.actionId, '');
  const weaponInstanceId = cleanText(value.weaponInstanceId, '');
  const ammoDefinitionId = cleanText(value.ammoDefinitionId, '');
  const ownerToken = cleanText(value.ownerToken, '');
  if (!actionId || !weaponInstanceId || !ammoDefinitionId || !ownerToken) return null;
  const stageIndex = integer(value.stageIndex, 0, 0, 64);
  return {
    schemaVersion: AMMO_INVENTORY_SCHEMA_VERSION,
    actionId,
    sequence: integer(value.sequence, 1, 1, Number.MAX_SAFE_INTEGER),
    weaponInstanceId,
    ammoDefinitionId,
    owner: normalizeOwner(value.owner, 'reload'),
    ownerToken,
    weaponHandle: normalizeHandle(value.weaponHandle),
    locomotionHandle: normalizeHandle(value.locomotionHandle),
    helperUnitId: nullableText(value.helperUnitId),
    helperActionHandle: normalizeHandle(value.helperActionHandle),
    helperValidationCode: nullableText(value.helperValidationCode),
    stageIndex,
    stageId: cleanText(value.stageId, `stage-${stageIndex}`),
    completedBaseWorkSeconds: finiteNonNegative(value.completedBaseWorkSeconds),
    loadedRoundsApplied: integer(value.loadedRoundsApplied, 0, 0, Number.MAX_SAFE_INTEGER),
    appliedStageCompletionIds: normalizeLedger(value.appliedStageCompletionIds, MAX_APPLIED_RELOAD_STAGE_IDS),
    startedSeconds: finiteNonNegative(value.startedSeconds),
    lastAdvancedSeconds: finiteNonNegative(value.lastAdvancedSeconds),
    status: value.status === 'waiting_for_locomotion' ? 'waiting_for_locomotion' : 'running',
  };
}

function normalizeTransferAction(value: unknown): AmmoTransferActionV1 | null {
  if (!isRecord(value) || value.schemaVersion !== AMMO_INVENTORY_SCHEMA_VERSION) return null;
  const actionId = cleanText(value.actionId, '');
  const sourceUnitId = cleanText(value.sourceUnitId, '');
  const targetUnitId = cleanText(value.targetUnitId, '');
  const ammoDefinitionId = cleanText(value.ammoDefinitionId, '');
  const ownerToken = cleanText(value.ownerToken, '');
  if (!actionId || !sourceUnitId || !targetUnitId || !ammoDefinitionId || !ownerToken) return null;
  const legacyDuration = finiteNonNegative(value.durationSeconds);
  return {
    schemaVersion: AMMO_INVENTORY_SCHEMA_VERSION,
    actionId,
    sequence: integer(value.sequence, 1, 1, Number.MAX_SAFE_INTEGER),
    sourceUnitId,
    targetUnitId,
    ammoDefinitionId,
    requestedRounds: integer(value.requestedRounds, 1, 1, 1000),
    sourceHandle: normalizeHandle(value.sourceHandle),
    targetHandle: normalizeHandle(value.targetHandle),
    owner: normalizeOwner(value.owner, 'ammo-transfer'),
    ownerToken,
    startedSeconds: finiteNonNegative(value.startedSeconds),
    requiredBaseWorkSeconds: finiteNonNegative(value.requiredBaseWorkSeconds) || legacyDuration,
    completedBaseWorkSeconds: finiteNonNegative(value.completedBaseWorkSeconds),
    lastAdvancedSeconds: finiteNonNegative(value.lastAdvancedSeconds),
    phase: value.phase === 'completed' || value.phase === 'cancelled' || value.phase === 'failed' ? value.phase : 'working',
    transferredRounds: integer(value.transferredRounds, 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

function normalizeActionResult(value: unknown): AmmoActionResultV1 | null {
  if (!isRecord(value) || (value.kind !== 'reload' && value.kind !== 'transfer')) return null;
  if (value.status !== 'completed' && value.status !== 'cancelled' && value.status !== 'failed') return null;
  const actionId = cleanText(value.actionId, '');
  if (!actionId) return null;
  return {
    actionId,
    kind: value.kind,
    status: value.status,
    resultCode: cleanText(value.resultCode, 'ammo_action_result'),
    resultRu: cleanText(value.resultRu, 'Действие с боеприпасами завершено.'),
    endedSeconds: finiteNonNegative(value.endedSeconds),
    roundsChanged: integer(value.roundsChanged, 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

function normalizeReserves(value: unknown): AmmoReserveEntryV1[] {
  if (!Array.isArray(value)) return [];
  const byId = new Map<string, AmmoReserveEntryV1>();
  for (const candidate of value) {
    if (!isRecord(candidate)) continue;
    const ammoDefinitionId = cleanText(candidate.ammoDefinitionId, '');
    if (!ammoDefinitionId) continue;
    const maximumRounds = integer(candidate.maximumRounds, 0, 0, Number.MAX_SAFE_INTEGER);
    byId.set(ammoDefinitionId, {
      ammoDefinitionId,
      rounds: integer(candidate.rounds, 0, 0, maximumRounds),
      maximumRounds,
    });
  }
  return [...byId.values()].sort((left, right) => compareText(left.ammoDefinitionId, right.ammoDefinitionId)).slice(0, MAX_AMMO_RESERVE_ENTRIES);
}

function normalizeLedger(value: unknown, maximum: number): string[] {
  if (!Array.isArray(value)) return [];
  const result = [...new Set(value.map((item) => cleanText(item, '')).filter(Boolean))].sort(compareText);
  return result.slice(-maximum);
}

function normalizeRole(value: unknown): InfantryCombatRole | null {
  return value === 'rifleman' || value === 'submachine_gunner' || value === 'machine_gunner' || value === 'assistant_machine_gunner'
    ? value
    : null;
}
function normalizeRef(value: unknown): DefinitionRef | null {
  if (!isRecord(value)) return null;
  const definitionId = cleanText(value.definitionId, '');
  const revision = integer(value.revision, 0, 0, Number.MAX_SAFE_INTEGER);
  return definitionId && revision > 0 ? { definitionId, revision } : null;
}
function normalizeHandle(value: unknown): PhysicalActionHandleV1 | null {
  if (!isRecord(value)) return null;
  const actionId = cleanText(value.actionId, '');
  const ownerToken = cleanText(value.ownerToken, '');
  if (!actionId || !ownerToken) return null;
  return {
    actionId,
    sequence: integer(value.sequence, 1, 1, Number.MAX_SAFE_INTEGER),
    revision: integer(value.revision, 1, 1, Number.MAX_SAFE_INTEGER),
    ownerToken,
  };
}
function normalizeOwner(value: unknown, fallback: string): PhysicalActionOwner {
  if (!isRecord(value)) return { source: 'system', id: fallback };
  const source = value.source === 'player' || value.source === 'player_command' || value.source === 'movement'
    || value.source === 'tactical_position' || value.source === 'test' || value.source === 'graph_v2'
    || value.source === 'future_ai' ? value.source : 'system';
  return { source, id: cleanText(value.id, fallback) };
}
function cloneRef(value: DefinitionRef): DefinitionRef { return { definitionId: value.definitionId, revision: value.revision }; }
function increment(value: number): number { return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(value)) + 1); }
function finiteNonNegative(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0; }
function integer(value: unknown, fallback: number, minimum: number, maximum: number): number { const number = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback; return Math.max(minimum, Math.min(maximum, number)); }
function cleanText(value: unknown, fallback: string): string { return typeof value === 'string' && value.trim() ? value.trim() : fallback; }
function nullableText(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
