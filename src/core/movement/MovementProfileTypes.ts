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

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export function isMovementGait(value: unknown): value is MovementGait {
  return typeof value === 'string' && (MOVEMENT_GAITS as readonly string[]).includes(value);
}

export function isMovementProfileSource(value: unknown): value is MovementProfileAuthoritySource {
  return typeof value === 'string' && (MOVEMENT_PROFILE_AUTHORITY_SOURCES as readonly string[]).includes(value);
}
