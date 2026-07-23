import type { UnitModel } from '../../units/UnitModel';
import type { CombatCatalogRegistry } from '../catalogs/CombatCatalogRegistry';
import { validateCombatCatalogBundle } from '../catalogs/CombatCatalogValidation';
import type {
  AmmoDefinitionV1,
  DefinitionRef,
  WeaponClass,
  WeaponDefinitionV1,
  WeaponProficiency,
} from '../catalogs/CombatCatalogTypes';
import { createWeaponRecoilRuntime, normalizeWeaponRecoilRuntime } from './AimRuntime';
import {
  INFANTRY_WEAPON_INSTANCE_SCHEMA_VERSION,
  WEAPON_OPERATOR_PROFILE_SCHEMA_VERSION,
  type InfantryWeaponInstanceV1,
  type ResolvedWeaponSnapshotV1,
  type WeaponOperatorProfileV1,
} from './InfantryCombatRuntimeTypes';

export type EquipPrimaryWeaponStatus =
  | 'equipped'
  | 'definition_not_found'
  | 'draft_revision_rejected'
  | 'primary_weapon_not_rifle'
  | 'invalid_definition_chain';

export interface EquipPrimaryWeaponResult {
  readonly ok: boolean;
  readonly status: EquipPrimaryWeaponStatus;
  readonly weapon: InfantryWeaponInstanceV1 | null;
  readonly reasonCode: string;
  readonly reasonRu: string;
}

const WEAPON_CLASSES: readonly WeaponClass[] = ['rifle', 'submachine_gun', 'machine_gun', 'pistol'];

export function equipPrimaryWeaponFromLoadout(
  unit: UnitModel,
  registry: CombatCatalogRegistry,
  loadoutRef: DefinitionRef,
): EquipPrimaryWeaponResult {
  let loadout;
  let weapon: WeaponDefinitionV1;
  let ammo: AmmoDefinitionV1;
  try {
    loadout = registry.resolveLoadout(loadoutRef);
    weapon = registry.resolveWeapon(loadout.primary.definition);
    ammo = registry.resolveAmmo(weapon.ammo);
  } catch {
    return rejected('definition_not_found', 'infantry_combat_definition_not_found', 'Точная ревизия комплекта, оружия или патрона не найдена.');
  }

  if (loadout.status === 'draft' || weapon.status === 'draft' || ammo.status === 'draft') {
    return rejected('draft_revision_rejected', 'infantry_combat_draft_revision_rejected', 'Draft-ревизию нельзя использовать в боевом runtime.');
  }
  if (weapon.weaponClass !== 'rifle') {
    return rejected('primary_weapon_not_rifle', 'infantry_combat_primary_weapon_not_rifle', 'Stage 3 поддерживает только основную винтовку.');
  }
  if (!refsEqual(loadout.primary.definition, refForWeapon(weapon)) || !refsEqual(weapon.ammo, refForAmmo(ammo))) {
    return rejected('invalid_definition_chain', 'infantry_combat_invalid_definition_chain', 'Точные ссылки комплекта, оружия и патрона не совпадают.');
  }

  const snapshot = freezeResolvedSnapshot({
    weaponDefinitionRef: cloneRef(loadout.primary.definition),
    ammoDefinitionRef: cloneRef(weapon.ammo),
    weapon: structuredClone(weapon),
    ammo: structuredClone(ammo),
  });
  const instance: InfantryWeaponInstanceV1 = {
    schemaVersion: INFANTRY_WEAPON_INSTANCE_SCHEMA_VERSION,
    weaponInstanceId: `${unit.id}:weapon:primary`,
    slot: 'primary',
    resolved: snapshot,
    operatorProfile: freezeOperatorProfile({
      schemaVersion: WEAPON_OPERATOR_PROFILE_SCHEMA_VERSION,
      shootingSkill: clamp01(unit.soldier.traits.weaponSkill / 100),
      proficiencyByWeaponClass: normalizeProficiencies(loadout.proficiencyByWeaponClass),
    }),
    recoil: createWeaponRecoilRuntime(),
    roundsInWeapon: integer(loadout.primary.loadedRounds, 0, 0, weapon.capacityRounds),
    shotSequence: 0,
    lastCommittedShotId: null,
  };
  unit.infantryCombatRuntime.primaryWeapon = instance;
  return {
    ok: true,
    status: 'equipped',
    weapon: instance,
    reasonCode: 'infantry_combat_primary_weapon_equipped',
    reasonRu: 'Основная винтовка экипирована из точной ревизии комплекта.',
  };
}

export function normalizeInfantryWeaponInstance(value: unknown): InfantryWeaponInstanceV1 | null {
  if (!isRecord(value) || value.schemaVersion !== INFANTRY_WEAPON_INSTANCE_SCHEMA_VERSION) return null;
  const weaponInstanceId = cleanText(value.weaponInstanceId, '');
  if (!weaponInstanceId || value.slot !== 'primary') return null;
  const resolved = normalizeResolvedSnapshot(value.resolved);
  if (!resolved) return null;
  return {
    schemaVersion: INFANTRY_WEAPON_INSTANCE_SCHEMA_VERSION,
    weaponInstanceId,
    slot: 'primary',
    resolved,
    operatorProfile: normalizeOperatorProfile(value.operatorProfile),
    recoil: normalizeWeaponRecoilRuntime(value.recoil),
    roundsInWeapon: integer(value.roundsInWeapon, 0, 0, resolved.weapon.capacityRounds),
    shotSequence: integer(value.shotSequence, 0, 0, Number.MAX_SAFE_INTEGER),
    lastCommittedShotId: nullableText(value.lastCommittedShotId),
  };
}

export function serializeInfantryWeaponInstance(value: InfantryWeaponInstanceV1): InfantryWeaponInstanceV1 {
  return {
    schemaVersion: INFANTRY_WEAPON_INSTANCE_SCHEMA_VERSION,
    weaponInstanceId: value.weaponInstanceId,
    slot: 'primary',
    resolved: cloneResolvedSnapshot(value.resolved),
    operatorProfile: freezeOperatorProfile(structuredClone(value.operatorProfile)),
    recoil: normalizeWeaponRecoilRuntime(structuredClone(value.recoil)),
    roundsInWeapon: integer(value.roundsInWeapon, 0, 0, value.resolved.weapon.capacityRounds),
    shotSequence: integer(value.shotSequence, 0, 0, Number.MAX_SAFE_INTEGER),
    lastCommittedShotId: nullableText(value.lastCommittedShotId),
  };
}

export function cloneResolvedSnapshot(value: ResolvedWeaponSnapshotV1): ResolvedWeaponSnapshotV1 {
  return freezeResolvedSnapshot(structuredClone(value));
}

function normalizeOperatorProfile(value: unknown): WeaponOperatorProfileV1 {
  if (!isRecord(value) || value.schemaVersion !== WEAPON_OPERATOR_PROFILE_SCHEMA_VERSION) {
    return freezeOperatorProfile({
      schemaVersion: WEAPON_OPERATOR_PROFILE_SCHEMA_VERSION,
      shootingSkill: 0.5,
      proficiencyByWeaponClass: normalizeProficiencies(undefined),
    });
  }
  return freezeOperatorProfile({
    schemaVersion: WEAPON_OPERATOR_PROFILE_SCHEMA_VERSION,
    shootingSkill: clamp01(finite(value.shootingSkill, 0.5)),
    proficiencyByWeaponClass: normalizeProficiencies(value.proficiencyByWeaponClass),
  });
}

function normalizeProficiencies(value: unknown): Record<WeaponClass, WeaponProficiency> {
  const source = isRecord(value) ? value : {};
  return {
    rifle: normalizeProficiency(source.rifle),
    submachine_gun: normalizeProficiency(source.submachine_gun),
    machine_gun: normalizeProficiency(source.machine_gun),
    pistol: normalizeProficiency(source.pistol),
  };
}

function normalizeProficiency(value: unknown): WeaponProficiency {
  return value === 'untrained' || value === 'specialist' ? value : 'trained';
}

function freezeOperatorProfile(value: WeaponOperatorProfileV1): WeaponOperatorProfileV1 {
  for (const weaponClass of WEAPON_CLASSES) {
    if (!value.proficiencyByWeaponClass[weaponClass]) throw new Error(`Missing proficiency snapshot for ${weaponClass}.`);
  }
  deepFreeze(value.proficiencyByWeaponClass);
  return Object.freeze(value);
}

function normalizeResolvedSnapshot(value: unknown): ResolvedWeaponSnapshotV1 | null {
  if (!isRecord(value) || !isDefinitionRef(value.weaponDefinitionRef) || !isDefinitionRef(value.ammoDefinitionRef)) return null;
  if (!isWeaponDefinition(value.weapon) || !isAmmoDefinition(value.ammo)) return null;
  if (value.weapon.status === 'draft' || value.ammo.status === 'draft') return null;
  if (value.weapon.weaponClass !== 'rifle') return null;
  if (!refsEqual(value.weaponDefinitionRef, refForWeapon(value.weapon))) return null;
  if (!refsEqual(value.ammoDefinitionRef, refForAmmo(value.ammo))) return null;
  if (!refsEqual(value.weapon.ammo, value.ammoDefinitionRef)) return null;
  const snapshot = structuredClone(value as unknown as ResolvedWeaponSnapshotV1);
  const validation = validateCombatCatalogBundle({
    formatVersion: 1,
    revision: 1,
    ammoDefinitions: [structuredClone(snapshot.ammo)],
    weaponDefinitions: [structuredClone(snapshot.weapon)],
    loadoutTemplates: [],
  });
  if (!validation.valid) return null;
  return freezeResolvedSnapshot(snapshot);
}

function freezeResolvedSnapshot(value: ResolvedWeaponSnapshotV1): ResolvedWeaponSnapshotV1 {
  deepFreeze(value.weaponDefinitionRef);
  deepFreeze(value.ammoDefinitionRef);
  deepFreeze(value.weapon);
  deepFreeze(value.ammo);
  return Object.freeze(value);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function isWeaponDefinition(value: unknown): value is WeaponDefinitionV1 {
  if (!isRecord(value)) return false;
  return value.schemaVersion === 1
    && cleanText(value.weaponDefinitionId, '') !== ''
    && integer(value.revision, 0, 0, Number.MAX_SAFE_INTEGER) > 0
    && (value.status === 'published' || value.status === 'archived' || value.status === 'draft')
    && (value.weaponClass === 'rifle' || value.weaponClass === 'submachine_gun' || value.weaponClass === 'machine_gun' || value.weaponClass === 'pistol')
    && isDefinitionRef(value.ammo)
    && finiteNonNegative(value.capacityRounds, -1) >= 0;
}

function isAmmoDefinition(value: unknown): value is AmmoDefinitionV1 {
  if (!isRecord(value)) return false;
  return value.schemaVersion === 1
    && cleanText(value.ammoDefinitionId, '') !== ''
    && integer(value.revision, 0, 0, Number.MAX_SAFE_INTEGER) > 0
    && (value.status === 'published' || value.status === 'archived' || value.status === 'draft')
    && finiteNonNegative(value.muzzleVelocityMetersPerSecond, -1) > 0
    && finiteNonNegative(value.maximumLifetimeSeconds, -1) > 0;
}

function isDefinitionRef(value: unknown): value is DefinitionRef {
  return isRecord(value)
    && cleanText(value.definitionId, '') !== ''
    && integer(value.revision, 0, 0, Number.MAX_SAFE_INTEGER) > 0;
}

function refForWeapon(value: WeaponDefinitionV1): DefinitionRef {
  return { definitionId: value.weaponDefinitionId, revision: value.revision };
}

function refForAmmo(value: AmmoDefinitionV1): DefinitionRef {
  return { definitionId: value.ammoDefinitionId, revision: value.revision };
}

function cloneRef(value: DefinitionRef): DefinitionRef {
  return { definitionId: value.definitionId, revision: value.revision };
}

function refsEqual(left: DefinitionRef, right: DefinitionRef): boolean {
  return left.definitionId === right.definitionId && left.revision === right.revision;
}

function rejected(status: Exclude<EquipPrimaryWeaponStatus, 'equipped'>, reasonCode: string, reasonRu: string): EquipPrimaryWeaponResult {
  return { ok: false, status, weapon: null, reasonCode, reasonRu };
}

function cleanText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function finiteNonNegative(value: unknown, fallback: number): number {
  return Math.max(0, finite(value, fallback));
}

function integer(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const numeric = finite(value, fallback);
  return Math.max(minimum, Math.min(maximum, Math.round(numeric)));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
