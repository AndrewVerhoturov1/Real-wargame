import type { PhysicalActionHandleV1, PhysicalActionOwner } from '../../actions/PhysicalActionCoordinatorTypes';
import type { DefinitionRef } from '../catalogs/CombatCatalogTypes';

export const AMMO_INVENTORY_SCHEMA_VERSION = 1 as const;
export const MAX_AMMO_RESERVE_ENTRIES = 8;
export const MAX_APPLIED_RELOAD_LOAD_IDS = 32;
export const MAX_APPLIED_AMMO_TRANSFER_IDS = 32;

export type InfantryCombatRole =
  | 'rifleman'
  | 'submachine_gunner'
  | 'machine_gunner'
  | 'assistant_machine_gunner';

export interface AmmoReserveEntryV1 {
  readonly ammoDefinitionId: string;
  rounds: number;
  maximumRounds: number;
}

export interface ReloadWeaponActionV1 {
  readonly schemaVersion: typeof AMMO_INVENTORY_SCHEMA_VERSION;
  readonly actionId: string;
  readonly sequence: number;
  readonly owner: PhysicalActionOwner;
  readonly ownerToken: string;
  weaponHandle: PhysicalActionHandleV1;
  locomotionHandle: PhysicalActionHandleV1 | null;
  helperUnitId: string | null;
  helperActionHandle: PhysicalActionHandleV1 | null;
  helperValidationCode: string | null;
  stageIndex: number;
  completedBaseWorkSeconds: number;
  stageLoadMutationApplied: boolean;
  readonly startedSeconds: number;
  lastAdvancedSeconds: number;
  status: 'running' | 'waiting_for_locomotion';
}

export interface AmmoTransferActionV1 {
  readonly schemaVersion: typeof AMMO_INVENTORY_SCHEMA_VERSION;
  readonly actionId: string;
  readonly sequence: number;
  readonly sourceUnitId: string;
  readonly targetUnitId: string;
  readonly ammoDefinitionId: string;
  readonly requestedRounds: number;
  readonly durationSeconds: number;
  completedBaseWorkSeconds: number;
  readonly sourceHandle: PhysicalActionHandleV1;
  readonly targetHandle: PhysicalActionHandleV1;
  readonly startedSeconds: number;
  lastAdvancedSeconds: number;
}

export interface AmmoActionResultV1 {
  readonly actionId: string;
  readonly kind: 'reload' | 'transfer';
  readonly status: 'completed' | 'cancelled' | 'failed';
  readonly resultCode: string;
  readonly resultRu: string;
  readonly endedSeconds: number;
  readonly roundsChanged: number;
}

export interface AmmoInventoryRuntimeV1 {
  readonly schemaVersion: typeof AMMO_INVENTORY_SCHEMA_VERSION;
  role: InfantryCombatRole | null;
  loadoutRef: DefinitionRef | null;
  reserves: AmmoReserveEntryV1[];
  nextReloadSequence: number;
  nextTransferSequence: number;
  activeReload: ReloadWeaponActionV1 | null;
  activeTransfer: AmmoTransferActionV1 | null;
  appliedReloadLoadIds: string[];
  appliedTransferIds: string[];
  lastActionResult: AmmoActionResultV1 | null;
  revision: number;
}
