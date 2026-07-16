import { BUILT_IN_MOVEMENT_PROFILES, cloneMovementProfile, getBuiltInMovementProfile, isBuiltInMovementProfileId, mergeSettings } from './MovementProfileDefaults';
import { MOVEMENT_PROFILE_FORMAT_VERSION, type BuiltInMovementProfileId, type MovementProfile, type MovementProfileRegistryData, type MovementProfileSettings } from './MovementProfileTypes';

export function normalizeMovementRegistryData(data?: Partial<MovementProfileRegistryData>): MovementProfileRegistryData {
  const imported = new Map<string, Record<string, unknown>>();
  for (const value of Array.isArray(data?.profiles) ? data.profiles : []) {
    if (isRecord(value) && typeof value.id === 'string') imported.set(value.id, value);
  }

  const profiles = BUILT_IN_MOVEMENT_PROFILES.map((defaults) => {
    const value = imported.get(defaults.id);
    imported.delete(defaults.id);
    return value
      ? normalizeMovementProfile({ ...defaults, ...value, id: defaults.id, builtIn: true, templateProfileId: defaults.id })
      : cloneMovementProfile(defaults);
  });

  for (const [id, value] of imported) {
    profiles.push(normalizeMovementProfile({ ...value, id: normalizeCustomMovementId(id), builtIn: false }));
  }

  const valid = new Set(profiles.map((profile) => profile.id));
  for (const profile of profiles) {
    if (profile.fallbackProfileId && (!valid.has(profile.fallbackProfileId) || profile.fallbackProfileId === profile.id)) {
      profile.fallbackProfileId = null;
    }
  }

  return {
    formatVersion: MOVEMENT_PROFILE_FORMAT_VERSION,
    revision: integer(data?.revision, 1, 1, Number.MAX_SAFE_INTEGER),
    profiles,
  };
}

export function normalizeMovementProfile(value: unknown): MovementProfile {
  if (!isRecord(value)) throw new Error('Movement profile must be an object.');
  const rawId = text(value.id, 'normal_walk');
  const template = isBuiltInMovementProfileId(String(value.templateProfileId ?? ''))
    ? String(value.templateProfileId) as BuiltInMovementProfileId
    : isBuiltInMovementProfileId(rawId)
      ? rawId
      : 'normal_walk';
  const defaults = getBuiltInMovementProfile(template);
  const settings = isRecord(value.settings) ? value.settings : {};
  return {
    id: Boolean(value.builtIn) && isBuiltInMovementProfileId(rawId) ? rawId : normalizeCustomOrBuiltIn(rawId),
    nameEn: text(value.nameEn, defaults.nameEn),
    nameRu: text(value.nameRu, value.nameEn ?? defaults.nameRu),
    descriptionEn: text(value.descriptionEn, defaults.descriptionEn),
    descriptionRu: text(value.descriptionRu, value.descriptionEn ?? defaults.descriptionRu),
    preferredGait: choice(value.preferredGait, ['walk', 'crouch', 'run', 'sprint', 'crawl'] as const, defaults.preferredGait),
    stancePolicy: choice(value.stancePolicy, ['standing', 'crouched', 'prone', 'adaptive'] as const, defaults.stancePolicy),
    fallbackProfileId: typeof value.fallbackProfileId === 'string' && value.fallbackProfileId.trim()
      ? value.fallbackProfileId.trim()
      : null,
    templateProfileId: template,
    category: choice(value.category, ['routine', 'stealth', 'combat', 'emergency'] as const, defaults.category),
    sortOrder: integer(value.sortOrder, defaults.sortOrder, 0, 100000),
    settings: normalizeSettings(settings, defaults.settings),
    revision: integer(value.revision, defaults.revision, 1, Number.MAX_SAFE_INTEGER),
    builtIn: Boolean(value.builtIn),
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
  return mergeSettings(defaults, {
    speed: {
      speedMultiplier: num(speed.speedMultiplier, defaults.speed.speedMultiplier, .05, 4),
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
      lateralMovementMultiplier: num(visibility.lateralMovementMultiplier, defaults.visibility.lateralMovementMultiplier, 0, 5),
      openTerrainExposureBonus: num(visibility.openTerrainExposureBonus, defaults.visibility.openTerrainExposureBonus, 0, 5),
    },
    noise: {
      loudness: num(noise.loudness, defaults.noise.loudness, 0, 1),
      eventSpacingMeters: num(noise.eventSpacingMeters, defaults.noise.eventSpacingMeters, .05, 50),
      fatigueMultiplier: num(noise.fatigueMultiplier, defaults.noise.fatigueMultiplier, 0, 5),
      surfacePolicy: choice(noise.surfacePolicy, ['profile_multiplier', 'material_profile_future'] as const, defaults.noise.surfacePolicy),
    },
    attention: {
      focusMultiplier: num(attention.focusMultiplier, defaults.attention.focusMultiplier, 0, 3),
      directAttentionMultiplier: num(attention.directAttentionMultiplier, defaults.attention.directAttentionMultiplier, 0, 3),
      peripheralMultiplier: num(attention.peripheralMultiplier, defaults.attention.peripheralMultiplier, 0, 3),
      rearAwarenessMultiplier: num(attention.rearAwarenessMultiplier, defaults.attention.rearAwarenessMultiplier, 0, 3),
      stationaryTargetDetectionMultiplier: num(attention.stationaryTargetDetectionMultiplier, defaults.attention.stationaryTargetDetectionMultiplier, 0, 3),
      movingTargetDetectionMultiplier: num(attention.movingTargetDetectionMultiplier, defaults.attention.movingTargetDetectionMultiplier, 0, 3),
      scanSpeedMultiplier: num(attention.scanSpeedMultiplier, defaults.attention.scanSpeedMultiplier, 0, 3),
    },
    weapon: {
      allowFireWhileMoving: bool(weapon.allowFireWhileMoving, defaults.weapon.allowFireWhileMoving),
      allowReloadWhileMoving: bool(weapon.allowReloadWhileMoving, defaults.weapon.allowReloadWhileMoving),
      readyDelayAfterStopSeconds: num(weapon.readyDelayAfterStopSeconds, defaults.weapon.readyDelayAfterStopSeconds, 0, 15),
      weaponPreparationPenalty: num(weapon.weaponPreparationPenalty, defaults.weapon.weaponPreparationPenalty, 0, 3),
    },
    restrictions: {
      maximumWoundSeverity: num(restrictions.maximumWoundSeverity, defaults.restrictions.maximumWoundSeverity, 0, 1),
      allowedWhileSuppressed: bool(restrictions.allowedWhileSuppressed, defaults.restrictions.allowedWhileSuppressed),
      minimumSoldierSpeedMetersPerSecond: num(restrictions.minimumSoldierSpeedMetersPerSecond, defaults.restrictions.minimumSoldierSpeedMetersPerSecond, 0, 10),
      fallbackRule: choice(restrictions.fallbackRule, ['profile', 'slower_gait', 'stop'] as const, defaults.restrictions.fallbackRule),
    },
  });
}

export function normalizeCustomMovementId(value: string): string {
  const id = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  if (!id) throw new Error('Movement profile id is empty after normalization.');
  if (isBuiltInMovementProfileId(id)) throw new Error(`Movement profile id is reserved: ${id}`);
  return id;
}

function normalizeCustomOrBuiltIn(id: string): string {
  return isBuiltInMovementProfileId(id) ? id : normalizeCustomMovementId(id);
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
