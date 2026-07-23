import type { PhysicalActionHandleV1, PhysicalActionOwner } from '../../actions/PhysicalActionCoordinatorTypes';
import type {
  AmmoDefinitionV1,
  DefinitionRef,
  WeaponDefinitionV1,
} from '../catalogs/CombatCatalogTypes';
import type { BallisticPoint3 } from '../../combat/UnitHitShapes';

export const INFANTRY_COMBAT_UNIT_RUNTIME_SCHEMA_VERSION = 1 as const;
export const INFANTRY_WEAPON_INSTANCE_SCHEMA_VERSION = 1 as const;
export const FIRE_TASK_RUNTIME_SCHEMA_VERSION = 1 as const;

export interface ResolvedWeaponSnapshotV1 {
  readonly weaponDefinitionRef: DefinitionRef;
  readonly ammoDefinitionRef: DefinitionRef;
  readonly weapon: WeaponDefinitionV1;
  readonly ammo: AmmoDefinitionV1;
}

export interface InfantryWeaponInstanceV1 {
  readonly schemaVersion: typeof INFANTRY_WEAPON_INSTANCE_SCHEMA_VERSION;
  readonly weaponInstanceId: string;
  readonly slot: 'primary';
  readonly resolved: ResolvedWeaponSnapshotV1;
  roundsInWeapon: number;
  shotSequence: number;
  lastCommittedShotId: string | null;
}

export type FireTaskPhase =
  | 'accepted'
  | 'weapon_ready'
  | 'aiming'
  | 'firing'
  | 'recovery'
  | 'completed'
  | 'cancelled'
  | 'denied'
  | 'failed';

export interface FireTaskTerminalResultV1 {
  readonly taskId: string;
  readonly phase: Extract<FireTaskPhase, 'completed' | 'cancelled' | 'denied' | 'failed'>;
  readonly resultCode: string;
  readonly resultRu: string;
  readonly endedSeconds: number;
  readonly committedShotId: string | null;
}

export interface FireTaskRuntimeV1 {
  readonly schemaVersion: typeof FIRE_TASK_RUNTIME_SCHEMA_VERSION;
  readonly taskId: string;
  readonly sequence: number;
  actionHandle: PhysicalActionHandleV1 | null;
  readonly owner: PhysicalActionOwner;
  readonly ownerToken: string;
  readonly target: BallisticPoint3;
  readonly targetRadiusMetres: 0;
  readonly contactId: string | null;
  readonly sourceUnitId: string | null;
  readonly mode: 'single';
  phase: FireTaskPhase;
  readonly requestedSeconds: number;
  phaseStartedSeconds: number;
  readyRemainingSeconds: number;
  aimQuality: number;
  readonly minimumSolutionQuality: number;
  readonly maximumFriendlyFireRisk: number;
  recoveryRemainingSeconds: number;
  committedShotId: string | null;
  resultCode: string | null;
  resultRu: string | null;
}

export interface InfantryCombatUnitRuntimeV1 {
  readonly schemaVersion: typeof INFANTRY_COMBAT_UNIT_RUNTIME_SCHEMA_VERSION;
  nextFireTaskSequence: number;
  primaryWeapon: InfantryWeaponInstanceV1 | null;
  activeFireTask: FireTaskRuntimeV1 | null;
  lastFireResult: FireTaskTerminalResultV1 | null;
}
