import {
  BUILT_IN_MOVEMENT_PROFILES,
  cloneMovementProfile,
  getBuiltInMovementProfile,
  isBuiltInMovementProfileId,
  mergeMovementProfileSettings,
} from './MovementProfileDefaults';
import {
  MOVEMENT_GAITS,
  MOVEMENT_PROFILE_FORMAT_VERSION,
  type BuiltInMovementProfileId,
  type MovementGait,
  type MovementProfile,
  type MovementProfileMigrationInfo,
  type MovementProfileRegistryData,
  type MovementProfileSettings,
} from './MovementProfileTypes';

export const MOVEMENT_PROFILE_ID_ALIASES: Readonly<Record<string, BuiltInMovementProfileId>> = Object.freeze({
  normal: 'normal_walk',
  stealth: 'stealth_move',
  rapid: 'run',
  fast: 'run',
  assault: 'run',
  low: 'crawl',
});

export function resolveMovementProfileIdAlias(value: unknown): {
  id: string;
  migrationInfo: MovementProfileMigrationInfo | null;
} {
  const raw = typeof value === 'string' ? value.trim() : '';
  const normalized = raw.toLowerCase();
  const alias = MOVEMENT_PROFILE_ID_ALIASES[normalized];
  if (!alias) return { id: raw || 'normal_walk', migrationInfo: null };
  return {
    id: alias,
    migrationInfo: {
      fromProfileId: raw,
      toProfileId: alias,
      reason: 'legacy_alias',
    },
  };
}

export function normalizeMovementRegistryData(data?: unknown): MovementProfileRegistryData {
  const record = isRecord(data) ? data : {};
  const imported = new Map<string, Record<string, unknown>>();
  for (const value of Array.isArray(record.profiles) ? record.profiles : []) {
    if (!isRecord(value) || typeof value.id !== 'string') continue;
    const resolved = resolveMovementProfileIdAlias(value.id);
    const id = normalizeCustomOrBuiltIn(resolved.id);
    imported.set(id, { ...value, id });
  }

  const profiles = BUILT_IN_MOVEMENT_PROFILES.map((defaults) => {
    const value = imported.get(defaults.id);
    imported.delete(defaults.id);
    return value
      ? normalizeMovementProfile({ ...defaults, ...value, id: defaults.id, builtIn: true, templateProfileId: defaults.id })
      : cloneMovementProfile(defaults);
  });

  for (const [id, value] of imported) {
    profiles.push(normalizeMovementProfile({ ...value, id, builtIn: false }));
  }

  const valid = new Set(profiles.map((profile) => profile.id));
  for (const profile of profiles) {
    if (profile.fallbackProfileId && (!valid.has(profile.fallbackProfileId) || profile.fallbackProfileId === profile.id)) {
      profile.fallbackProfileId = null;
    }
  }

  return {
    formatVersion: MOVEMENT_PROFILE_FORMAT_VERSION,
    revision: integer(record.revision, 1, 1, Number.MAX_SAFE_INTEGER),
    profiles,
  };
}

export function normalizeMovementProfile(value: unknown): MovementProfile {
  if (!isRecord(value)) throw new Error('Movement profile must be an object.');
  const resolvedId = resolveMovementProfileIdAlias(value.id);
  const normalizedId = normalizeCustomOrBuiltIn(resolvedId.id);
  const templateCandidateRaw = typeof value.templateProfileId === 'string'
    ? resolveMovementProfileIdAlias(value.templateProfileId).id
    : '';
  const templateCandidate = templateCandidateRaw.trim().toLowerCase();
  const template = isBuiltInMovementProfileId(templateCandidate)
    ? templateCandidate
    : isBuiltInMovementProfileId(normalizedId)
      ? normalizedId
      : 'normal_walk';
  const defaults = getBuiltInMovementProfile(template);
  const settings = isRecord(value.settings)
    ? value.settings
    : legacySettings(value, defaults.settings);
  const preferredGait = normalizeGait(value.preferredGait ?? value.defaultGait, defaults.preferredGait);
  const stancePolicy = normalizeStancePolicy(value.stancePolicy, value, defaults.stancePolicy);
  const fallbackProfileId = normalizeMovementProfileReference(
    value.fallbackProfileId ?? legacyFallbackProfileId(value),
  );
  return {
    id: normalizedId,
    nameEn: text(value.nameEn ?? value.label, defaults.nameEn),
    nameRu: text(value.nameRu ?? value.labelRu, value.nameEn ?? value.label ?? defaults.nameRu),
    descriptionEn: text(value.descriptionEn, defaults.descriptionEn),
    descriptionRu: text(value.descriptionRu, value.descriptionEn ?? defaults.descriptionRu),
    preferredGait,
    stancePolicy,
    fallbackProfileId,
    templateProfileId: template,
    category: choice(value.category, ['routine', 'stealth', 'combat', 'emergency'] as const, defaults.category),
    sortOrder: integer(value.sortOrder, defaults.sortOrder, 0, 100_000),
    settings: normalizeSettings(settings, defaults.settings),
    revision: integer(value.revision, defaults.revision, 1, Number.MAX_SAFE_INTEGER),
    builtIn: Boolean(value.builtIn) && isBuiltInMovementProfileId(normalizedId),
  };
}

export function normalizeCustomMovementId(value: string): string {
  const id = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  if (!id) throw new Error('Movement profile id is empty after normalization.');
  if (isBuiltInMovementProfileId(id) || MOVEMENT_PROFILE_ID_ALIASES[id]) {
    throw new Error(`Movement profile id is reserved: ${id}`);
  }
  return id;
}

function legacySettings(value: Record<string, unknown>, defaults: MovementProfileSettings): Record<string, unknown> {
  const movement = rec(value.movement);
  const stamina = rec(value.stamina);
  const signature = rec(value.signature);
  const observation = rec(value.observation);
  const weapon = rec(value.weapon);
  const restrictions = rec(value.restrictions);
  return {
    speed: {
      speedMultiplier: movement.speedMultiplier,
      startDelaySeconds: movement.startSeconds,
      stopDelaySeconds: movement.stopSeconds,
    },
    stamina: {
      drainPerSecond: typeof stamina.drainPerSecond === 'number'
        ? stamina.drainPerSecond
        : defaults.stamina.drainPerSecond * num(stamina.drainMultiplier, 1, 0, 5),
      recoveryPerSecond: stamina.recoveryPerSecond,
      minimumToStart: stamina.minimumToStart,
      fallbackThreshold: stamina.downgradeThreshold,
      resumeThreshold: stamina.resumeThreshold ?? stamina.minimumToStart,
    },
    visibility: {
      movementVisibilityMultiplier: signature.visualMovementMultiplier,
      usesStealthSkill: typeof signature.stealthSkillShare === 'number' ? signature.stealthSkillShare > 0 : undefined,
      stealthSkillShare: signature.stealthSkillShare,
      lateralMovementMultiplier: signature.lateralVisibilityMultiplier,
    },
    noise: {
      loudness: signature.soundLoudness,
      eventSpacingMeters: signature.soundIntervalMeters,
    },
    attention: {
      focusMultiplier: observation.focusMultiplier,
      directAttentionMultiplier: observation.directMultiplier,
      peripheralMultiplier: observation.peripheralMultiplier,
      rearAwarenessMultiplier: observation.rearMultiplier,
      stationaryTargetDetectionMultiplier: observation.stationaryTargetMultiplier,
      movingTargetDetectionMultiplier: observation.movingTargetMultiplier,
    },
    weapon: {
      allowFireWhileMoving: weapon.allowFireWhileMoving,
      allowReloadWhileMoving: weapon.allowReloadWhileMoving,
      readyDelayAfterStopSeconds: weapon.readyDelayAfterStopSeconds,
      aimPreparationMultiplier: weapon.aimPreparationMultiplier,
      weaponPreparationPenalty: typeof weapon.aimPreparationMultiplier === 'number'
        ? Math.max(0, weapon.aimPreparationMultiplier - 1)
        : undefined,
    },
    restrictions: {
      maximumWoundSeverity: restrictions.allowedWhenWounded === false ? 0.54 : 1,
      allowedWhileSuppressed: restrictions.allowedWhenSuppressed,
      maximumSuppressionPercent: restrictions.allowedWhenSuppressed === false ? 54 : 100,
      minimumPhysicalCapability: restrictions.minimumPhysicalCapability,
      fallbackRule: 'profile',
    },
  };
}

function normalizeSettings(value: Record<string, unknown>, defaults: MovementProfileSettings): MovementProfileSettings {
  const speed = rec(value.speed);
  const stamina = rec(value.stamina);
  const visibility = rec(value.visibility);
  const noise = rec(value.noise);
  const attention = rec(value.attention);
  const weapon = rec(value.weapon);
  const restrictions = rec(value.restrictions);
  const surface = rec(value.surface);
  return mergeMovementProfileSettings(defaults, {
    speed: {
      speedMultiplier: num(speed.speedMultiplier, defaults.speed.speedMultiplier, 0.05, 4),
      startDelaySeconds: num(speed.startDelaySeconds, defaults.speed.startDelaySeconds, 0, 10),
      stopDelaySeconds: num(speed.stopDelaySeconds, defaults.speed.stopDelaySeconds, 0, 10),
      stanceChangeSeconds: num(speed.stanceChangeSeconds, defaults.speed.stanceChangeSeconds, 0, 15),
      minimumSpeedMetersPerSecond: num(speed.minimumSpeedMetersPerSecond, defaults.speed.minimumSpeedMetersPerSecond, 0, 10),
      lowStaminaSpeedMultiplier: num(speed.lowStaminaSpeedMultiplier, defaults.speed.lowStaminaSpeedMultiplier, 0, 1),
    },
    stamina: {
      drainPerSecond: num(stamina.drainPerSecond, defaults.stamina.drainPerSecond, 0, 100),
      recoveryPerSecond: num(stamina.recoveryPerSecond, defaults.stamina.recoveryPerSecond, 0, 100),
      minimumToStart: num(stamina.minimumToStart, defaults.stamina.minimumToStart, 0, 100),
      fallbackThreshold: num(stamina.fallbackThreshold, defaults.stamina.fallbackThreshold, 0, 100),
      resumeThreshold: num(stamina.resumeThreshold, defaults.stamina.resumeThreshold, 0, 100),
    },
    visibility: {
      movementVisibilityMultiplier: num(visibility.movementVisibilityMultiplier, defaults.visibility.movementVisibilityMultiplier, 0, 5),
      usesStealthSkill: bool(visibility.usesStealthSkill, defaults.visibility.usesStealthSkill),
      stealthSkillShare: num(visibility.stealthSkillShare, defaults.visibility.stealthSkillShare, 0, 1),
      lateralMovementMultiplier: num(visibility.lateralMovementMultiplier, defaults.visibility.lateralMovementMultiplier, 0, 5),
      openTerrainExposureBonus: num(visibility.openTerrainExposureBonus, defaults.visibility.openTerrainExposureBonus, 0, 5),
    },
    noise: {
      loudness: num(noise.loudness, defaults.noise.loudness, 0, 2),
      eventSpacingMeters: num(noise.eventSpacingMeters, defaults.noise.eventSpacingMeters, 0.05, 50),
      fatigueMultiplier: num(noise.fatigueMultiplier, defaults.noise.fatigueMultiplier, 0, 5),
      surfacePolicy: choice(noise.surfacePolicy, ['profile_multiplier', 'material_profile_adapter'] as const, defaults.noise.surfacePolicy),
    },
    attention: {
      focusMultiplier: num(attention.focusMultiplier, defaults.attention.focusMultiplier, 0.05, 3),
      directAttentionMultiplier: num(attention.directAttentionMultiplier, defaults.attention.directAttentionMultiplier, 0.05, 3),
      peripheralMultiplier: num(attention.peripheralMultiplier, defaults.attention.peripheralMultiplier, 0.05, 3),
      rearAwarenessMultiplier: num(attention.rearAwarenessMultiplier, defaults.attention.rearAwarenessMultiplier, 0.05, 3),
      stationaryTargetDetectionMultiplier: num(attention.stationaryTargetDetectionMultiplier, defaults.attention.stationaryTargetDetectionMultiplier, 0.05, 3),
      movingTargetDetectionMultiplier: num(attention.movingTargetDetectionMultiplier, defaults.attention.movingTargetDetectionMultiplier, 0.05, 3),
      scanSpeedMultiplier: num(attention.scanSpeedMultiplier, defaults.attention.scanSpeedMultiplier, 0.05, 3),
    },
    weapon: {
      allowFireWhileMoving: bool(weapon.allowFireWhileMoving, defaults.weapon.allowFireWhileMoving),
      allowReloadWhileMoving: bool(weapon.allowReloadWhileMoving, defaults.weapon.allowReloadWhileMoving),
      readyDelayAfterStopSeconds: num(weapon.readyDelayAfterStopSeconds, defaults.weapon.readyDelayAfterStopSeconds, 0, 15),
      aimPreparationMultiplier: num(weapon.aimPreparationMultiplier, defaults.weapon.aimPreparationMultiplier, 0.25, 4),
      weaponPreparationPenalty: num(weapon.weaponPreparationPenalty, defaults.weapon.weaponPreparationPenalty, 0, 3),
    },
    restrictions: {
      maximumWoundSeverity: num(restrictions.maximumWoundSeverity, defaults.restrictions.maximumWoundSeverity, 0, 1),
      allowedWhileSuppressed: bool(restrictions.allowedWhileSuppressed, defaults.restrictions.allowedWhileSuppressed),
      maximumSuppressionPercent: num(restrictions.maximumSuppressionPercent, defaults.restrictions.maximumSuppressionPercent, 0, 100),
      minimumPhysicalCapability: num(restrictions.minimumPhysicalCapability, defaults.restrictions.minimumPhysicalCapability, 0, 1),
      minimumSoldierSpeedMetersPerSecond: num(restrictions.minimumSoldierSpeedMetersPerSecond, defaults.restrictions.minimumSoldierSpeedMetersPerSecond, 0, 10),
      fallbackRule: choice(restrictions.fallbackRule, ['profile', 'slower_gait', 'stop'] as const, defaults.restrictions.fallbackRule),
    },
    surface: {
      materialSpeedMultiplier: num(surface.materialSpeedMultiplier, defaults.surface.materialSpeedMultiplier, 0, 3),
      materialNoiseMultiplier: num(surface.materialNoiseMultiplier, defaults.surface.materialNoiseMultiplier, 0, 3),
    },
  });
}

function legacyFallbackProfileId(value: Record<string, unknown>): string | null {
  const stamina = rec(value.stamina);
  const restrictions = rec(value.restrictions);
  const gait = normalizeGait(restrictions.safeFallbackGait ?? stamina.fallbackGait, 'walk');
  return profileIdForGait(gait);
}

export function profileIdForGait(gait: MovementGait): BuiltInMovementProfileId {
  if (gait === 'crouch_walk') return 'crouched_move';
  if (gait === 'run') return 'run';
  if (gait === 'sprint') return 'sprint';
  if (gait === 'crawl') return 'crawl';
  return 'normal_walk';
}

function normalizeMovementProfileReference(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return normalizeCustomOrBuiltIn(resolveMovementProfileIdAlias(value).id);
}

function normalizeCustomOrBuiltIn(id: string): string {
  const normalized = id.trim().toLowerCase();
  return isBuiltInMovementProfileId(normalized) ? normalized : normalizeCustomMovementId(normalized);
}

function normalizeGait(value: unknown, fallback: MovementGait): MovementGait {
  const normalized = value === 'crouch' ? 'crouch_walk' : value;
  return typeof normalized === 'string' && (MOVEMENT_GAITS as readonly string[]).includes(normalized)
    ? normalized as MovementGait
    : fallback;
}

function normalizeStancePolicy(
  value: unknown,
  legacy: Record<string, unknown>,
  fallback: MovementProfile['stancePolicy'],
): MovementProfile['stancePolicy'] {
  if (value === 'standing' || value === 'crouched' || value === 'prone' || value === 'adaptive') return value;
  const movement = rec(legacy.movement);
  const posture = movement.preferredPosture;
  if (movement.autoPosture === false) return 'adaptive';
  return posture === 'standing' || posture === 'crouched' || posture === 'prone' ? posture : fallback;
}

function rec(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback: unknown): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  const normalizedFallback = typeof fallback === 'string' ? fallback.trim() : '';
  return normalized || normalizedFallback || 'Movement profile';
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  const normalized = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(normalized) ? Math.max(min, Math.min(max, normalized)) : fallback;
}

function integer(value: unknown, fallback: number, min: number, max: number): number {
  return Math.round(num(value, fallback, min, max));
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function choice<const T extends readonly string[]>(value: unknown, values: T, fallback: T[number]): T[number] {
  return typeof value === 'string' && (values as readonly string[]).includes(value)
    ? value as T[number]
    : fallback;
}
