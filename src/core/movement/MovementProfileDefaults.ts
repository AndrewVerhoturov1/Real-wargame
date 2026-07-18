import {
  BUILT_IN_MOVEMENT_PROFILE_IDS,
  type BuiltInMovementProfileId,
  type DeepPartial,
  type MovementProfile,
  type MovementProfileSettings,
} from './MovementProfileTypes';

const BASE_SETTINGS: MovementProfileSettings = {
  speed: {
    speedMultiplier: 1,
    startDelaySeconds: 0,
    stopDelaySeconds: 0.08,
    stanceChangeSeconds: 0.8,
    minimumSpeedMetersPerSecond: 0.1,
    lowStaminaSpeedMultiplier: 0.82,
  },
  stamina: {
    drainPerSecond: 0,
    recoveryPerSecond: 7,
    minimumToStart: 0,
    fallbackThreshold: 0,
    resumeThreshold: 0,
  },
  visibility: {
    movementVisibilityMultiplier: 1,
    usesStealthSkill: true,
    stealthSkillShare: 0.45,
    lateralMovementMultiplier: 1,
    openTerrainExposureBonus: 0,
  },
  noise: {
    loudness: 0.6,
    eventSpacingMeters: 3.2,
    fatigueMultiplier: 0,
    surfacePolicy: 'material_profile_adapter',
  },
  attention: {
    focusMultiplier: 1,
    directAttentionMultiplier: 1,
    peripheralMultiplier: 1,
    rearAwarenessMultiplier: 1,
    stationaryTargetDetectionMultiplier: 1,
    movingTargetDetectionMultiplier: 1,
    scanSpeedMultiplier: 1,
  },
  weapon: {
    allowFireWhileMoving: true,
    allowReloadWhileMoving: true,
    readyDelayAfterStopSeconds: 0.1,
    aimPreparationMultiplier: 1,
    weaponPreparationPenalty: 0,
  },
  restrictions: {
    maximumWoundSeverity: 1,
    allowedWhileSuppressed: true,
    maximumSuppressionPercent: 100,
    minimumPhysicalCapability: 0.25,
    minimumSoldierSpeedMetersPerSecond: 0.1,
    fallbackRule: 'slower_gait',
  },
  surface: {
    materialSpeedMultiplier: 1,
    materialNoiseMultiplier: 1,
  },
};

type ProfileSeed = Omit<MovementProfile, 'settings' | 'revision' | 'builtIn' | 'templateProfileId'> & {
  settings?: DeepPartial<MovementProfileSettings>;
};

function make(seed: ProfileSeed): MovementProfile {
  return {
    ...seed,
    templateProfileId: seed.id as BuiltInMovementProfileId,
    settings: mergeMovementProfileSettings(BASE_SETTINGS, seed.settings),
    revision: 1,
    builtIn: true,
  };
}

export const BUILT_IN_MOVEMENT_PROFILES: readonly MovementProfile[] = Object.freeze([
  make({
    id: 'normal_walk',
    nameEn: 'Normal walk',
    nameRu: 'Обычный шаг',
    descriptionEn: 'Balanced routine movement.',
    descriptionRu: 'Сбалансированное движение для обычных приказов.',
    preferredGait: 'walk',
    stancePolicy: 'standing',
    fallbackProfileId: null,
    category: 'routine',
    sortOrder: 10,
  }),
  make({
    id: 'stealth_move',
    nameEn: 'Stealth movement',
    nameRu: 'Скрытное движение',
    descriptionEn: 'Slow and quiet movement using stealth skill.',
    descriptionRu: 'Медленное тихое движение с навыком скрытности.',
    preferredGait: 'walk',
    stancePolicy: 'adaptive',
    fallbackProfileId: 'crouched_move',
    category: 'stealth',
    sortOrder: 20,
    settings: {
      speed: { speedMultiplier: 0.68, startDelaySeconds: 0.18, stopDelaySeconds: 0.1 },
      stamina: { drainPerSecond: 0, recoveryPerSecond: 4, minimumToStart: 4, fallbackThreshold: 6, resumeThreshold: 8 },
      visibility: { movementVisibilityMultiplier: 0.62, usesStealthSkill: true, stealthSkillShare: 0.9, lateralMovementMultiplier: 0.7 },
      noise: { loudness: 0.28, eventSpacingMeters: 4.4 },
      attention: { focusMultiplier: 0.96, directAttentionMultiplier: 0.94, peripheralMultiplier: 0.88, rearAwarenessMultiplier: 0.82, stationaryTargetDetectionMultiplier: 0.98 },
      weapon: { readyDelayAfterStopSeconds: 0.08, aimPreparationMultiplier: 1.08 },
      restrictions: { allowedWhileSuppressed: false, maximumSuppressionPercent: 54, fallbackRule: 'profile' },
    },
  }),
  make({
    id: 'crouched_move',
    nameEn: 'Crouched movement',
    nameRu: 'Движение пригнувшись',
    descriptionEn: 'Lower silhouette with weapon readiness.',
    descriptionRu: 'Движение с пониженным силуэтом и готовым оружием.',
    preferredGait: 'crouch_walk',
    stancePolicy: 'crouched',
    fallbackProfileId: 'normal_walk',
    category: 'combat',
    sortOrder: 30,
    settings: {
      speed: { speedMultiplier: 0.74, startDelaySeconds: 0.08, stopDelaySeconds: 0.08 },
      stamina: { drainPerSecond: 0, recoveryPerSecond: 4, minimumToStart: 0, fallbackThreshold: 0, resumeThreshold: 0 },
      visibility: { movementVisibilityMultiplier: 0.72, usesStealthSkill: true, stealthSkillShare: 0.75, lateralMovementMultiplier: 0.75 },
      noise: { loudness: 0.34, eventSpacingMeters: 4 },
      attention: { focusMultiplier: 1, directAttentionMultiplier: 0.98, peripheralMultiplier: 0.92, rearAwarenessMultiplier: 0.86 },
      weapon: { readyDelayAfterStopSeconds: 0.08, aimPreparationMultiplier: 1.04 },
      restrictions: { maximumWoundSeverity: 0.85, fallbackRule: 'profile' },
    },
  }),
  make({
    id: 'run',
    nameEn: 'Run',
    nameRu: 'Бег',
    descriptionEn: 'Fast sustained movement.',
    descriptionRu: 'Быстрое движение с повышенным шумом и ухудшенным обзором.',
    preferredGait: 'run',
    stancePolicy: 'standing',
    fallbackProfileId: 'normal_walk',
    category: 'routine',
    sortOrder: 40,
    settings: {
      speed: { speedMultiplier: 1.7325, startDelaySeconds: 0.08, stopDelaySeconds: 0.14, minimumSpeedMetersPerSecond: 0.55, lowStaminaSpeedMultiplier: 0.72 },
      stamina: { drainPerSecond: 10.8, recoveryPerSecond: 6, minimumToStart: 18, fallbackThreshold: 14, resumeThreshold: 18 },
      visibility: { movementVisibilityMultiplier: 1.28, usesStealthSkill: true, stealthSkillShare: 0.12, lateralMovementMultiplier: 1.2 },
      noise: { loudness: 0.95, eventSpacingMeters: 2.6, fatigueMultiplier: 0.2 },
      attention: { focusMultiplier: 0.7, directAttentionMultiplier: 0.62, peripheralMultiplier: 0.48, rearAwarenessMultiplier: 0.38, stationaryTargetDetectionMultiplier: 0.64, movingTargetDetectionMultiplier: 0.8, scanSpeedMultiplier: 0.7 },
      weapon: { allowFireWhileMoving: false, allowReloadWhileMoving: false, readyDelayAfterStopSeconds: 0.35, aimPreparationMultiplier: 1.35, weaponPreparationPenalty: 0.35 },
      restrictions: { maximumWoundSeverity: 0.65, minimumSoldierSpeedMetersPerSecond: 0.55, fallbackRule: 'profile' },
    },
  }),
  make({
    id: 'sprint',
    nameEn: 'Sprint',
    nameRu: 'Спринт',
    descriptionEn: 'Maximum short-duration speed.',
    descriptionRu: 'Максимальная скорость с большим расходом сил и штрафом оружия.',
    preferredGait: 'sprint',
    stancePolicy: 'standing',
    fallbackProfileId: 'run',
    category: 'emergency',
    sortOrder: 50,
    settings: {
      speed: { speedMultiplier: 2.322, startDelaySeconds: 0.06, stopDelaySeconds: 0.2, minimumSpeedMetersPerSecond: 0.8, lowStaminaSpeedMultiplier: 0.58 },
      stamina: { drainPerSecond: 25.3, recoveryPerSecond: 5, minimumToStart: 28, fallbackThreshold: 18, resumeThreshold: 28 },
      visibility: { movementVisibilityMultiplier: 1.55, usesStealthSkill: false, stealthSkillShare: 0, lateralMovementMultiplier: 1.35 },
      noise: { loudness: 1.2, eventSpacingMeters: 2.2, fatigueMultiplier: 0.35 },
      attention: { focusMultiplier: 0.5, directAttentionMultiplier: 0.42, peripheralMultiplier: 0.3, rearAwarenessMultiplier: 0.22, stationaryTargetDetectionMultiplier: 0.45, movingTargetDetectionMultiplier: 0.65, scanSpeedMultiplier: 0.5 },
      weapon: { allowFireWhileMoving: false, allowReloadWhileMoving: false, readyDelayAfterStopSeconds: 0.75, aimPreparationMultiplier: 1.7, weaponPreparationPenalty: 0.85 },
      restrictions: { maximumWoundSeverity: 0.4, minimumSoldierSpeedMetersPerSecond: 0.8, fallbackRule: 'profile' },
    },
  }),
  make({
    id: 'crawl',
    nameEn: 'Crawl',
    nameRu: 'Ползком',
    descriptionEn: 'Very slow prone movement.',
    descriptionRu: 'Очень медленное движение лёжа с низким силуэтом.',
    preferredGait: 'crawl',
    stancePolicy: 'prone',
    fallbackProfileId: null,
    category: 'stealth',
    sortOrder: 60,
    settings: {
      speed: { speedMultiplier: 0.63, startDelaySeconds: 0.24, stopDelaySeconds: 0.14, minimumSpeedMetersPerSecond: 0.08 },
      stamina: { drainPerSecond: 0, recoveryPerSecond: 2, minimumToStart: 3, fallbackThreshold: 2, resumeThreshold: 3 },
      visibility: { movementVisibilityMultiplier: 0.46, usesStealthSkill: true, stealthSkillShare: 1, lateralMovementMultiplier: 0.5 },
      noise: { loudness: 0.2, eventSpacingMeters: 5.2 },
      attention: { focusMultiplier: 0.88, directAttentionMultiplier: 0.86, peripheralMultiplier: 0.78, rearAwarenessMultiplier: 0.68, stationaryTargetDetectionMultiplier: 0.9, movingTargetDetectionMultiplier: 0.96, scanSpeedMultiplier: 0.82 },
      weapon: { allowFireWhileMoving: true, allowReloadWhileMoving: true, readyDelayAfterStopSeconds: 0.05, aimPreparationMultiplier: 1.16 },
      restrictions: { minimumSoldierSpeedMetersPerSecond: 0.08, fallbackRule: 'stop' },
    },
  }),
]);

export function getBuiltInMovementProfile(id: BuiltInMovementProfileId): MovementProfile {
  const value = BUILT_IN_MOVEMENT_PROFILES.find((profile) => profile.id === id);
  if (!value) throw new Error(`Unknown built-in movement profile: ${id}`);
  return cloneMovementProfile(value);
}

export function isBuiltInMovementProfileId(id: string): id is BuiltInMovementProfileId {
  return (BUILT_IN_MOVEMENT_PROFILE_IDS as readonly string[]).includes(id);
}

export function cloneMovementProfile(value: MovementProfile): MovementProfile {
  return {
    ...value,
    settings: mergeMovementProfileSettings(value.settings),
  };
}

export function mergeMovementProfileSettings(
  base: MovementProfileSettings,
  patch?: DeepPartial<MovementProfileSettings>,
): MovementProfileSettings {
  return {
    speed: { ...base.speed, ...patch?.speed },
    stamina: { ...base.stamina, ...patch?.stamina },
    visibility: { ...base.visibility, ...patch?.visibility },
    noise: { ...base.noise, ...patch?.noise },
    attention: { ...base.attention, ...patch?.attention },
    weapon: { ...base.weapon, ...patch?.weapon },
    restrictions: { ...base.restrictions, ...patch?.restrictions },
    surface: { ...base.surface, ...patch?.surface },
  };
}
