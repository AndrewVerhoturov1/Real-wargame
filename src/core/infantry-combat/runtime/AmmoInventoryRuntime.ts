import type { DefinitionRef, LoadoutTemplateV1 } from '../catalogs/CombatCatalogTypes';
import {
  AMMO_INVENTORY_SCHEMA_VERSION,
  MAX_AMMO_RESERVE_ENTRIES,
  MAX_APPLIED_AMMO_TRANSFER_IDS,
  MAX_APPLIED_RELOAD_LOAD_IDS,
  type AmmoInventoryRuntimeV1,
  type AmmoReserveEntryV1,
  type InfantryCombatRole,
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
    activeReload: isRecord(value.activeReload) ? structuredClone(value.activeReload) as AmmoInventoryRuntimeV1['activeReload'] : null,
    activeTransfer: isRecord(value.activeTransfer) ? structuredClone(value.activeTransfer) as AmmoInventoryRuntimeV1['activeTransfer'] : null,
    appliedReloadLoadIds: normalizeLedger(value.appliedReloadLoadIds, MAX_APPLIED_RELOAD_LOAD_IDS),
    appliedTransferIds: normalizeLedger(value.appliedTransferIds, MAX_APPLIED_AMMO_TRANSFER_IDS),
    lastActionResult: isRecord(value.lastActionResult) ? structuredClone(value.lastActionResult) as AmmoInventoryRuntimeV1['lastActionResult'] : null,
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

export function applyPreparedReserveDelta(inventory: AmmoInventoryRuntimeV1, prepared: PreparedReserveDeltaV1): boolean {
  const entry = getReserveEntry(inventory, prepared.ammoDefinitionId);
  if (!entry || entry.rounds !== prepared.roundsBefore || entry.maximumRounds !== prepared.maximumRounds) return false;
  entry.rounds = prepared.roundsAfter;
  inventory.revision = Math.min(Number.MAX_SAFE_INTEGER, inventory.revision + 1);
  return true;
}

export function appendBoundedLedger(ledger: string[], id: string, maximum: number): boolean {
  const cleanId = cleanText(id, '');
  if (!cleanId || ledger.includes(cleanId)) return false;
  ledger.push(cleanId);
  while (ledger.length > maximum) ledger.shift();
  return true;
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
  const result: string[] = [];
  for (const item of value) {
    const id = cleanText(item, '');
    if (!id || result.includes(id)) continue;
    result.push(id);
  }
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
function cloneRef(value: DefinitionRef): DefinitionRef { return { definitionId: value.definitionId, revision: value.revision }; }
function integer(value: unknown, fallback: number, minimum: number, maximum: number): number { const number = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback; return Math.max(minimum, Math.min(maximum, number)); }
function cleanText(value: unknown, fallback: string): string { return typeof value === 'string' && value.trim() ? value.trim() : fallback; }
function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
