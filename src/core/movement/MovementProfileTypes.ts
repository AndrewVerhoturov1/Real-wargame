import type { UnitPosture } from '../behavior/BehaviorModel';

export const MOVEMENT_PROFILE_FORMAT_VERSION = 1 as const;
export const MOVEMENT_GAITS = ['crawl', 'crouch_walk', 'walk', 'run', 'sprint'] as const;
export type MovementGait = typeof MOVEMENT_GAITS[number];

export const BUILT_IN_MOVEMENT_PROFILE_IDS = [
  'normal_walk',
  'stealth_move',
  'crouched_move',
  'run',
  'sprint',
  'crawl',
] as const;
export type BuiltInMovementProfileId = typeof BUILT_IN_MOVEMENT_PROFILE_IDS[number];
export type MovementProfileId = string;
export const DEFAULT_MOVEMENT_PROFILE_ID = 'normal_walk' as const;

export const MOVEMENT_PROFILE_AUTHORITY_SOURCES = [
  'hard_safety',
  'ai_override',
  'player_order',
  'unit_role',
  'default',
] as const;
export type MovementProfileAuthoritySource = typeof MOVEMENT_PROFILE_AUTHORITY_SOURCES[number];
/** Compatibility name used by existing adapters. */
export type MovementProfileSource = MovementProfileAuthoritySource;
export const MOVEMENT_PROFILE_SOURCES = MOVEMENT_PROFILE_AUTHORITY_SOURCES;
export type MovementProfileBaselineSource = Exclude<MovementProfileSource, 'hard_safety' | 'ai_override'>;

export const BUILTIN_MOVEMENT_PROFILE_IDS = BUILT_IN_MOVEMENT_PROFILE_IDS;
export type BuiltinMovementProfileId = BuiltInMovementProfileId;

export const MOVEMENT_PROFILE_SELECTION_MODES = [
  'from_order',
  'current_active',
  'automatic',
  'specific',
] as const;
export type MovementProfileSelectionMode = typeof MOVEMENT_PROFILE_SELECTION_MODES[number];

export const MOVEMENT_PROFILE_MEMORY_KEYS = Object.freeze({
  requestedProfileId: 'requested_movement_profile_id',
  activeProfileId: 'active_movement_profile_id',
  activeProfileSource: 'active_movement_profile_source',
  activeGait: 'active_movement_gait',
  speed: 'movement_speed',
  stamina: 'movement_stamina',
  noise: 'movement_noise',
  visualSignature: 'movement_visual_signature',
  canFire: 'movement_can_fire',
  forcedFallback: 'movement_forced_fallback',
  forcedReason: 'movement_forced_reason',
  profileDefinitionRevision: 'movement_profile_definition_revision',
  profileSelectionRevision: 'movement_profile_selection_revision',
  aiOverrideProfileId: 'movement_profile_override_id',
  aiOverrideOwnerToken: 'movement_profile_override_owner_token',
  aiOverrideReason: 'movement_profile_override_reason',
  hardSafetyProfileId: 'movement_hard_safety_profile_id',
  hardSafetyReason: 'movement_hard_safety_reason',
} as const);

export type MovementStancePolicy = UnitPosture | 'adaptive';
export type MovementFallbackRule = 'profile' | 'slower_gait' | 'stop';
export type MovementProfileCategory = 'routine' | 'stealth' | 'combat' | 'emergency';
export type MovementNoiseSurfacePolicy = 'profile_multiplier' | 'material_profile_adapter';

export interface MovementSpeedSettings {
  speedMultiplier: number;
  startDelaySeconds: number;
  stopDelaySeconds: number;
  stanceChangeSeconds: number;
  minimumSpeedMetersPerSecond: number;
  lowStaminaSpeedMultiplier: number;
}

export interface MovementStaminaSettings {
  drainPerSecond: number;
  recoveryPerSecond: number;
  minimumToStart: number;
  fallbackThreshold: number;
  resumeThreshold: number;
}

export interface MovementVisibilitySettings {
  movementVisibilityMultiplier: number;
  usesStealthSkill: boolean;
  stealthSkillShare: number;
  lateralMovementMultiplier: number;
  openTerrainExposureBonus: number;
}

export interface MovementNoiseSettings {
  loudness: number;
  eventSpacingMeters: number;
  fatigueMultiplier: number;
  surfacePolicy: MovementNoiseSurfacePolicy;
}

export interface MovementAttentionModifiers {
  focusMultiplier: number;
  directAttentionMultiplier: number;
  peripheralMultiplier: number;
  rearAwarenessMultiplier: number;
  stationaryTargetDetectionMultiplier: number;
  movingTargetDetectionMultiplier: number;
  scanSpeedMultiplier: number;
}

export interface MovementWeaponSettings {
  allowFireWhileMoving: boolean;
  allowReloadWhileMoving: boolean;
  readyDelayAfterStopSeconds: number;
  aimPreparationMultiplier: number;
  weaponPreparationPenalty: number;
}

export interface MovementRestrictionSettings {
  maximumWoundSeverity: number;
  allowedWhileSuppressed: boolean;
  maximumSuppressionPercent: number;
  minimumPhysicalCapability: number;
  minimumSoldierSpeedMetersPerSecond: number;
  fallbackRule: MovementFallbackRule;
}

export interface MovementSurfaceSettings {
  materialSpeedMultiplier: number;
  materialNoiseMultiplier: number;
}

export interface MovementProfileSettings {
  speed: MovementSpeedSettings;
  stamina: MovementStaminaSettings;
  visibility: MovementVisibilitySettings;
  noise: MovementNoiseSettings;
  attention: MovementAttentionModifiers;
  weapon: MovementWeaponSettings;
  restrictions: MovementRestrictionSettings;
  surface: MovementSurfaceSettings;
}

export interface MovementProfile {
  id: MovementProfileId;
  nameEn: string;
  nameRu: string;
  descriptionEn: string;
  descriptionRu: string;
  preferredGait: MovementGait;
  stancePolicy: MovementStancePolicy;
  fallbackProfileId: MovementProfileId | null;
  templateProfileId: BuiltInMovementProfileId;
  category: MovementProfileCategory;
  sortOrder: number;
  settings: MovementProfileSettings;
  revision: number;
  builtIn: boolean;
}

export interface MovementProfileRegistryData {
  formatVersion: typeof MOVEMENT_PROFILE_FORMAT_VERSION;
  revision: number;
  profiles: MovementProfile[];
}

export interface MovementProfileMigrationInfo {
  fromProfileId: string;
  toProfileId: string;
  reason: 'legacy_alias' | 'legacy_source' | 'runtime_normalization';
}

export interface MovementWeaponPreparationState {
  ownerToken: string;
  contactId: string;
  orderIssuedAtMs: number | null;
  remainingSeconds: number;
  revision: number;
}



export interface MovementProfileRegistryEntry {
  readonly id: string;
  readonly revision?: number;
  readonly nameRu?: string;
}

export interface ResolveMovementProfileAuthorityInput {
  readonly hardSafetyProfileId?: unknown;
  readonly hardSafetyReason?: unknown;
  readonly aiOverrideProfileId?: unknown;
  readonly aiOverrideOwnerToken?: unknown;
  readonly aiOverrideReason?: unknown;
  readonly playerOrderProfileId?: unknown;
  readonly unitRoleProfileId?: unknown;
  readonly defaultProfileId?: unknown;
  readonly knownProfileIds?: readonly string[] | ReadonlySet<string>;
}

export interface ResolvedMovementProfileAuthority {
  readonly requestedProfileId: string;
  readonly requestedSource: MovementProfileBaselineSource;
  readonly profileId: string;
  readonly source: MovementProfileSource;
  readonly ownerToken?: string;
  readonly forcedFallback: boolean;
  readonly forcedReason?: string;
}

export interface ResolveMovementProfileSelectionInput {
  readonly mode?: unknown;
  readonly specificProfileId?: unknown;
  readonly playerOrderActive?: unknown;
  readonly playerOrderProfileId?: unknown;
  readonly activeProfileId?: unknown;
  readonly activeProfileSource?: unknown;
}

export interface ResolvedMovementProfileSelection {
  readonly mode: MovementProfileSelectionMode;
  readonly profileId?: string;
  readonly source?: MovementProfileSource;
  readonly diagnosticReason?: string;
  readonly diagnosticReasonRu?: string;
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export function isMovementGait(value: unknown): value is MovementGait {
  return typeof value === 'string' && (MOVEMENT_GAITS as readonly string[]).includes(value);
}

export function isMovementProfileSource(value: unknown): value is MovementProfileAuthoritySource {
  return typeof value === 'string' && (MOVEMENT_PROFILE_AUTHORITY_SOURCES as readonly string[]).includes(value);
}
