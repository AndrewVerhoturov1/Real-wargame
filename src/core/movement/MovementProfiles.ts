export const MOVEMENT_PROFILE_FORMAT_VERSION = 1 as const;

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
export type MovementGait = 'walk' | 'crouch' | 'run' | 'sprint' | 'crawl';
export type MovementStancePolicy = 'standing' | 'crouched' | 'prone' | 'adaptive';
export type MovementNoiseSurfacePolicy = 'profile_multiplier' | 'material_profile_future';
export type MovementFallbackRule = 'profile' | 'slower_gait' | 'stop';
export type MovementProfileCategory = 'routine' | 'stealth' | 'combat' | 'emergency';

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
  weaponPreparationPenalty: number;
}

export interface MovementRestrictionSettings {
  maximumWoundSeverity: number;
  allowedWhileSuppressed: boolean;
  minimumSoldierSpeedMetersPerSecond: number;
  fallbackRule: MovementFallbackRule;
}

export interface MovementProfileSettings {
  speed: MovementSpeedSettings;
  stamina: MovementStaminaSettings;
  visibility: MovementVisibilitySettings;
  noise: MovementNoiseSettings;
  attention: MovementAttentionModifiers;
  weapon: MovementWeaponSettings;
  restrictions: MovementRestrictionSettings;
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

const DEFAULT_SETTINGS: MovementProfileSettings = {
  speed: {
    speedMultiplier: 1,
    startDelaySeconds: 0.2,
    stopDelaySeconds: 0.15,
    stanceChangeSeconds: 0.8,
    minimumSpeedMetersPerSecond: 0.25,
    lowStaminaSpeedMultiplier: 0.65,
  },
  stamina: {
    drainPerSecond: 0.25,
    recoveryPerSecond: 1.1,
    minimumToStart: 0,
    fallbackThreshold: 12,
    resumeThreshold: 24,
  },
  visibility: {
    movementVisibilityMultiplier: 1,
    usesStealthSkill: false,
    lateralMovementMultiplier: 1.12,
    openTerrainExposureBonus: 0.18,
  },
  noise: {
    loudness: 0.28,
    eventSpacingMeters: 1.2,
    fatigueMultiplier: 0.15,
    surfacePolicy: 'profile_multiplier',
  },
  attention: {
    focusMultiplier: 0.92,
    directAttentionMultiplier: 0.95,
    peripheralMultiplier: 0.9,
    rearAwarenessMultiplier: 0.82,
    stationaryTargetDetectionMultiplier: 0.92,
    movingTargetDetectionMultiplier: 1,
    scanSpeedMultiplier: 0.95,
  },
  weapon: {
    allowFireWhileMoving: true,
    allowReloadWhileMoving: true,
    readyDelayAfterStopSeconds: 0.15,
    weaponPreparationPenalty: 0.12,
  },
  restrictions: {
    maximumWoundSeverity: 1,
    allowedWhileSuppressed: true,
    minimumSoldierSpeedMetersPerSecond: 0.2,
    fallbackRule: 'slower_gait',
  },
};

const BUILT_IN_PROFILES: ReadonlyArray<MovementProfile> = [
  builtInProfile({
    id: 'normal_walk',
    nameEn: 'Normal walk',
    nameRu: 'Обычный шаг',
    descriptionEn: 'Balanced movement for routine orders and patrols.',
    descriptionRu: 'Сбалансированное движение для обычных приказов и патрулирования.',
    preferredGait: 'walk',
    stancePolicy: 'standing',
    fallbackProfileId: null,
    category: 'routine',
    sortOrder: 10,
  }),
  builtInProfile({
    id: 'stealth_move',
    nameEn: 'Stealth movement',
    nameRu: 'Скрытное движение',
    descriptionEn: 'Slow, quiet movement that uses the soldier stealth skill.',
    descriptionRu: 'Медленное и тихое движение с использованием навыка скрытности бойца.',
    preferredGait: 'walk',
    stancePolicy: 'adaptive',
    fallbackProfileId: 'crouched_move',
    category: 'stealth',
    sortOrder: 20,
    settings: {
      speed: { speedMultiplier: 0.68, startDelaySeconds: 0.45, stopDelaySeconds: 0.28, stanceChangeSeconds: 0.9, minimumSpeedMetersPerSecond: 0.18, lowStaminaSpeedMultiplier: 0.72 },
      stamina: { drainPerSecond: 0.45, recoveryPerSecond: 0.9, minimumToStart: 0, fallbackThreshold: 10, resumeThreshold: 22 },
      visibility: { movementVisibilityMultiplier: 0.55, usesStealthSkill: true, lateralMovementMultiplier: 1.08, openTerrainExposureBonus: 0.28 },
      noise: { loudness: 0.12, eventSpacingMeters: 1.8, fatigueMultiplier: 0.22, surfacePolicy: 'profile_multiplier' },
      attention: { focusMultiplier: 1.08, directAttentionMultiplier: 1.04, peripheralMultiplier: 0.95, rearAwarenessMultiplier: 0.9, stationaryTargetDetectionMultiplier: 1.08, movingTargetDetectionMultiplier: 1.02, scanSpeedMultiplier: 0.88 },
      weapon: { allowFireWhileMoving: false, allowReloadWhileMoving: true, readyDelayAfterStopSeconds: 0.08, weaponPreparationPenalty: 0.08 },
      restrictions: { maximumWoundSeverity: 0.9, allowedWhileSuppressed: false, minimumSoldierSpeedMetersPerSecond: 0.18, fallbackRule: 'profile' },
    },
  }),
  builtInProfile({
    id: 'crouched_move',
    nameEn: 'Crouched movement',
    nameRu: 'Движение пригнувшись',
    descriptionEn: 'Lower profile movement with moderate speed and weapon readiness.',
    descriptionRu: 'Движение с пониженным силуэтом, умеренной скоростью и готовым оружием.',
    preferredGait: 'crouch',
    stancePolicy: 'crouched',
    fallbackProfileId: 'normal_walk',
    category: 'combat',
    sortOrder: 30,
    settings: {
      speed: { speedMultiplier: 0.74, startDelaySeconds: 0.3, stopDelaySeconds: 0.2, stanceChangeSeconds: 0.65, minimumSpeedMetersPerSecond: 0.2, lowStaminaSpeedMultiplier: 0.7 },
      stamina: { drainPerSecond: 0.7, recoveryPerSecond: 0.75, minimumToStart: 0, fallbackThreshold: 10, resumeThreshold: 20 },
      visibility: { movementVisibilityMultiplier: 0.72, usesStealthSkill: true, lateralMovementMultiplier: 1.08, openTerrainExposureBonus: 0.12 },
      noise: { loudness: 0.2, eventSpacingMeters: 1.35, fatigueMultiplier: 0.2, surfacePolicy: 'profile_multiplier' },
      attention: { focusMultiplier: 1, directAttentionMultiplier: 1, peripheralMultiplier: 0.92, rearAwarenessMultiplier: 0.86, stationaryTargetDetectionMultiplier: 1, movingTargetDetectionMultiplier: 1, scanSpeedMultiplier: 0.9 },
      weapon: { allowFireWhileMoving: true, allowReloadWhileMoving: true, readyDelayAfterStopSeconds: 0.08, weaponPreparationPenalty: 0.08 },
      restrictions: { maximumWoundSeverity: 0.85, allowedWhileSuppressed: true, minimumSoldierSpeedMetersPerSecond: 0.2, fallbackRule: 'profile' },
    },
  }),
  builtInProfile({
    id: 'run',
    nameEn: 'Run',
    nameRu: 'Бег',
    descriptionEn: 'Fast sustained movement with increased noise and reduced observation.',
    descriptionRu: 'Быстрое длительное движение с повышенным шумом и ухудшенным обзором.',
    preferredGait: 'run',
    stancePolicy: 'standing',
    fallbackProfileId: 'normal_walk',
    category: 'routine',
    sortOrder: 40,
    settings: {
      speed: { speedMultiplier: 1.55, startDelaySeconds: 0.22, stopDelaySeconds: 0.28, stanceChangeSeconds: 0.7, minimumSpeedMetersPerSecond: 0.55, lowStaminaSpeedMultiplier: 0.58 },
      stamina: { drainPerSecond: 3.5, recoveryPerSecond: 0.3, minimumToStart: 8, fallbackThreshold: 9, resumeThreshold: 28 },
      visibility: { movementVisibilityMultiplier: 1.55, usesStealthSkill: false, lateralMovementMultiplier: 1.2, openTerrainExposureBonus: 0.35 },
      noise: { loudness: 0.68, eventSpacingMeters: 0.9, fatigueMultiplier: 0.35, surfacePolicy: 'profile_multiplier' },
      attention: { focusMultiplier: 0.72, directAttentionMultiplier: 0.82, peripheralMultiplier: 0.72, rearAwarenessMultiplier: 0.58, stationaryTargetDetectionMultiplier: 0.72, movingTargetDetectionMultiplier: 0.88, scanSpeedMultiplier: 0.68 },
      weapon: { allowFireWhileMoving: true, allowReloadWhileMoving: false, readyDelayAfterStopSeconds: 0.35, weaponPreparationPenalty: 0.38 },
      restrictions: { maximumWoundSeverity: 0.65, allowedWhileSuppressed: true, minimumSoldierSpeedMetersPerSecond: 0.55, fallbackRule: 'profile' },
    },
  }),
  builtInProfile({
    id: 'sprint',
    nameEn: 'Sprint',
    nameRu: 'Спринт',
    descriptionEn: 'Maximum short-duration speed with severe stamina, noise and weapon penalties.',
    descriptionRu: 'Максимальная кратковременная скорость с большим расходом сил, шумом и штрафом оружия.',
    preferredGait: 'sprint',
    stancePolicy: 'standing',
    fallbackProfileId: 'run',
    category: 'emergency',
    sortOrder: 50,
    settings: {
      speed: { speedMultiplier: 2.05, startDelaySeconds: 0.14, stopDelaySeconds: 0.42, stanceChangeSeconds: 0.7, minimumSpeedMetersPerSecond: 0.8, lowStaminaSpeedMultiplier: 0.42 },
      stamina: { drainPerSecond: 8.5, recoveryPerSecond: 0.1, minimumToStart: 24, fallbackThreshold: 12, resumeThreshold: 48 },
      visibility: { movementVisibilityMultiplier: 2.1, usesStealthSkill: false, lateralMovementMultiplier: 1.32, openTerrainExposureBonus: 0.5 },
      noise: { loudness: 1, eventSpacingMeters: 0.72, fatigueMultiplier: 0.55, surfacePolicy: 'profile_multiplier' },
      attention: { focusMultiplier: 0.45, directAttentionMultiplier: 0.62, peripheralMultiplier: 0.52, rearAwarenessMultiplier: 0.35, stationaryTargetDetectionMultiplier: 0.48, movingTargetDetectionMultiplier: 0.72, scanSpeedMultiplier: 0.48 },
      weapon: { allowFireWhileMoving: false, allowReloadWhileMoving: false, readyDelayAfterStopSeconds: 0.75, weaponPreparationPenalty: 0.85 },
      restrictions: { maximumWoundSeverity: 0.4, allowedWhileSuppressed: true, minimumSoldierSpeedMetersPerSecond: 0.8, fallbackRule: 'profile' },
    },
  }),
  builtInProfile({
    id: 'crawl',
    nameEn: 'Crawl',
    nameRu: 'Ползком',
    descriptionEn: 'Very slow prone movement with a low silhouette and restricted weapon handling.',
    descriptionRu: 'Очень медленное движение лёжа с низким силуэтом и ограниченной работой с оружием.',
    preferredGait: 'crawl',
    stancePolicy: 'prone',
    fallbackProfileId: 'crouched_move',
    category: 'stealth',
    sortOrder: 60,
    settings: {
      speed: { speedMultiplier: 0.28, startDelaySeconds: 0.65, stopDelaySeconds: 0.45, stanceChangeSeconds: 1.2, minimumSpeedMetersPerSecond: 0.08, lowStaminaSpeedMultiplier: 0.62 },
      stamina: { drainPerSecond: 1.4, recoveryPerSecond: 0.35, minimumToStart: 0, fallbackThreshold: 8, resumeThreshold: 18 },
      visibility: { movementVisibilityMultiplier: 0.3, usesStealthSkill: true, lateralMovementMultiplier: 1.02, openTerrainExposureBonus: 0.08 },
      noise: { loudness: 0.08, eventSpacingMeters: 2.2, fatigueMultiplier: 0.2, surfacePolicy: 'profile_multiplier' },
      attention: { focusMultiplier: 0.86, directAttentionMultiplier: 0.88, peripheralMultiplier: 0.82, rearAwarenessMultiplier: 0.7, stationaryTargetDetectionMultiplier: 0.88, movingTargetDetectionMultiplier: 0.9, scanSpeedMultiplier: 0.62 },
      weapon: { allowFireWhileMoving: false, allowReloadWhileMoving: false, readyDelayAfterStopSeconds: 0.25, weaponPreparationPenalty: 0.45 },
      restrictions: { maximumWoundSeverity: 1, allowedWhileSuppressed: true, minimumSoldierSpeedMetersPerSecond: 0.08, fallbackRule: 'stop' },
    },
  }),
];

export class MovementProfileRegistry {
  readonly formatVersion = MOVEMENT_PROFILE_FORMAT_VERSION;
  private registryRevision: number;
  private readonly profiles = new Map<string, MovementProfile>();

  constructor(data?: Partial<MovementProfileRegistryData>) {
    const normalized = normalizeRegistryData(data);
    this.registryRevision = normalized.revision;
    for (const profileValue of normalized.profiles) this.profiles.set(profileValue.id, cloneProfile(profileValue));
  }

  get revision(): number {
    return this.registryRevision;
  }

  listProfiles(): MovementProfile[] {
    const builtIns = BUILT_IN_MOVEMENT_PROFILE_IDS
      .map((id) => this.profiles.get(id))
      .filter((value): value is MovementProfile => Boolean(value));
    const custom = [...this.profiles.values()]
      .filter((value) => !value.builtIn)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.nameRu.localeCompare(right.nameRu) || left.id.localeCompare(right.id));
    return [...builtIns, ...custom].map(cloneProfile);
  }

  hasProfile(id: string): boolean {
    return this.profiles.has(id);
  }

  getProfile(id: string): MovementProfile {
    const value = this.profiles.get(id) ?? this.profiles.get('normal_walk');
    if (!value) throw new Error('Movement profile registry is missing the normal_walk profile.');
    return cloneProfile(value);
  }

  createCustomProfile(id: string, nameEn: string, nameRu: string, sourceId = 'normal_walk'): MovementProfile {
    const normalizedId = normalizeCustomId(id);
    if (this.profiles.has(normalizedId)) throw new Error(`Movement profile already exists: ${normalizedId}`);
    const source = this.getProfile(sourceId);
    const created: MovementProfile = {
      ...cloneProfile(source),
      id: normalizedId,
      nameEn: cleanText(nameEn, normalizedId),
      nameRu: cleanText(nameRu, nameEn || normalizedId),
      descriptionEn: `Custom profile based on ${source.nameEn}.`,
      descriptionRu: `Пользовательский профиль на основе «${source.nameRu}».`,
      templateProfileId: source.templateProfileId,
      fallbackProfileId: source.fallbackProfileId === source.id ? null : source.fallbackProfileId,
      sortOrder: nextCustomSortOrder(this.profiles.values()),
      revision: 1,
      builtIn: false,
    };
    this.profiles.set(created.id, normalizeProfile(created));
    this.touchRegistry();
    return this.getProfile(created.id);
  }

  copyProfile(sourceId: string, id: string, nameEn: string, nameRu: string): MovementProfile {
    return this.createCustomProfile(id, nameEn, nameRu, sourceId);
  }

  updateProfile(id: string, changes: Partial<Omit<MovementProfile, 'id' | 'builtIn' | 'revision'>>): MovementProfile {
    const current = this.requireProfile(id);
    const updated = normalizeProfile({
      ...current,
      ...cloneUnknown(changes),
      id: current.id,
      builtIn: current.builtIn,
      revision: current.revision + 1,
    });
    this.profiles.set(id, updated);
    this.touchRegistry();
    return cloneProfile(updated);
  }

  renameProfile(id: string, nameEn: string, nameRu: string): MovementProfile {
    return this.updateProfile(id, { nameEn: cleanText(nameEn, id), nameRu: cleanText(nameRu, nameEn || id) });
  }

  deleteProfile(id: string): boolean {
    const current = this.profiles.get(id);
    if (!current || current.builtIn) return false;
    this.profiles.delete(id);
    for (const profileValue of this.profiles.values()) {
      if (profileValue.fallbackProfileId === id) {
        profileValue.fallbackProfileId = profileValue.templateProfileId === profileValue.id ? null : profileValue.templateProfileId;
        profileValue.revision += 1;
      }
    }
    this.touchRegistry();
    return true;
  }

  resetProfile(id: string): MovementProfile {
    const current = this.requireProfile(id);
    if (current.builtIn) {
      const defaults = getBuiltInMovementProfile(id as BuiltInMovementProfileId);
      const reset = { ...defaults, revision: current.revision + 1 };
      this.profiles.set(id, reset);
    } else {
      const defaults = getBuiltInMovementProfile(current.templateProfileId);
      const reset: MovementProfile = {
        ...defaults,
        id: current.id,
        nameEn: current.nameEn,
        nameRu: current.nameRu,
        descriptionEn: current.descriptionEn,
        descriptionRu: current.descriptionRu,
        fallbackProfileId: defaults.fallbackProfileId,
        sortOrder: current.sortOrder,
        revision: current.revision + 1,
        builtIn: false,
      };
      this.profiles.set(id, reset);
    }
    this.touchRegistry();
    return this.getProfile(id);
  }

  toData(): MovementProfileRegistryData {
    return {
      formatVersion: MOVEMENT_PROFILE_FORMAT_VERSION,
      revision: this.registryRevision,
      profiles: this.listProfiles(),
    };
  }

  exportJson(): string {
    return `${JSON.stringify(this.toData(), null, 2)}\n`;
  }

  static fromUnknown(value: unknown): MovementProfileRegistry {
    if (!isRecord(value)) throw new Error('Movement profile import must be a JSON object.');
    if ('profiles' in value && !Array.isArray(value.profiles)) throw new Error('Movement profile import field "profiles" must be an array.');
    return new MovementProfileRegistry(value as Partial<MovementProfileRegistryData>);
  }

  static importJson(raw: string): MovementProfileRegistry {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('Movement profile import is not valid JSON.');
    }
    return MovementProfileRegistry.fromUnknown(parsed);
  }

  private requireProfile(id: string): MovementProfile {
    const value = this.profiles.get(id);
    if (!value) throw new Error(`Unknown movement profile: ${id}`);
    return cloneProfile(value);
  }

  private touchRegistry(): void {
    this.registryRevision += 1;
  }
}

export function createDefaultMovementProfileRegistry(): MovementProfileRegistry {
  return new MovementProfileRegistry();
}

export function getBuiltInMovementProfile(id: BuiltInMovementProfileId): MovementProfile {
  const value = BUILT_IN_PROFILES.find((profileValue) => profileValue.id === id);
  if (!value) throw new Error(`Unknown built-in movement profile: ${id}`);
  return cloneProfile(value);
}

export function isBuiltInMovementProfileId(id: string): id is BuiltInMovementProfileId {
  return (BUILT_IN_MOVEMENT_PROFILE_IDS as readonly string[]).includes(id);
}

function normalizeRegistryData(data?: Partial<MovementProfileRegistryData>): MovementProfileRegistryData {
  const importedProfiles = Array.isArray(data?.profiles) ? data.profiles : [];
  const importedById = new Map<string, unknown>();
  for (const value of importedProfiles) {
    if (!isRecord(value) || typeof value.id !== 'string') continue;
    importedById.set(value.id, value);
  }

  const profiles: MovementProfile[] = BUILT_IN_PROFILES.map((defaults) => {
    const imported = importedById.get(defaults.id);
    importedById.delete(defaults.id);
    return imported ? normalizeProfile({ ...defaults, ...cloneUnknown(imported), id: defaults.id, builtIn: true, templateProfileId: defaults.id }) : cloneProfile(defaults);
  });

  for (const [id, value] of importedById) {
    if (!isRecord(value)) continue;
    try {
      profiles.push(normalizeProfile({ ...value, id: normalizeCustomId(id), builtIn: false }));
    } catch {
      // A single malformed custom profile is omitted while valid profiles remain available.
    }
  }

  const validIds = new Set(profiles.map((profileValue) => profileValue.id));
  for (const profileValue of profiles) {
    if (profileValue.fallbackProfileId && (!validIds.has(profileValue.fallbackProfileId) || profileValue.fallbackProfileId === profileValue.id)) {
      profileValue.fallbackProfileId = null;
    }
  }

  return {
    formatVersion: MOVEMENT_PROFILE_FORMAT_VERSION,
    revision: integer(data?.revision, 1, 1, Number.MAX_SAFE_INTEGER),
    profiles,
  };
}

function normalizeProfile(value: unknown): MovementProfile {
  if (!isRecord(value)) throw new Error('Movement profile must be an object.');
  const id = cleanText(value.id, 'normal_walk');
  const builtIn = Boolean(value.builtIn);
  const templateProfileId = isBuiltInMovementProfileId(String(value.templateProfileId ?? ''))
    ? String(value.templateProfileId) as BuiltInMovementProfileId
    : isBuiltInMovementProfileId(id)
      ? id
      : 'normal_walk';
  const defaults = getBuiltInDefaultsWithoutRecursion(templateProfileId);
  const settingsValue = isRecord(value.settings) ? value.settings : {};

  return {
    id: builtIn && isBuiltInMovementProfileId(id) ? id : normalizeCustomOrBuiltInId(id),
    nameEn: cleanText(value.nameEn, defaults.nameEn),
    nameRu: cleanText(value.nameRu, value.nameEn ?? defaults.nameRu),
    descriptionEn: cleanText(value.descriptionEn, defaults.descriptionEn),
    descriptionRu: cleanText(value.descriptionRu, value.descriptionEn ?? defaults.descriptionRu),
    preferredGait: enumValue(value.preferredGait, ['walk', 'crouch', 'run', 'sprint', 'crawl'] as const, defaults.preferredGait),
    stancePolicy: enumValue(value.stancePolicy, ['standing', 'crouched', 'prone', 'adaptive'] as const, defaults.stancePolicy),
    fallbackProfileId: typeof value.fallbackProfileId === 'string' && value.fallbackProfileId.trim() ? value.fallbackProfileId.trim() : null,
    templateProfileId,
    category: enumValue(value.category, ['routine', 'stealth', 'combat', 'emergency'] as const, defaults.category),
    sortOrder: integer(value.sortOrder, defaults.sortOrder, 0, 100000),
    settings: normalizeSettings(settingsValue, defaults.settings),
    revision: integer(value.revision, defaults.revision, 1, Number.MAX_SAFE_INTEGER),
    builtIn,
  };
}

function normalizeSettings(value: Record<string, unknown>, defaults: MovementProfileSettings): MovementProfileSettings {
  const speed = record(value.speed);
  const stamina = record(value.stamina);
  const visibility = record(value.visibility);
  const noise = record(value.noise);
  const attention = record(value.attention);
  const weapon = record(value.weapon);
  const restrictions = record(value.restrictions);
  return {
    speed: {
      speedMultiplier: numberValue(speed.speedMultiplier, defaults.speed.speedMultiplier, 0.05, 4),
      startDelaySeconds: numberValue(speed.startDelaySeconds, defaults.speed.startDelaySeconds, 0, 10),
      stopDelaySeconds: numberValue(speed.stopDelaySeconds, defaults.speed.stopDelaySeconds, 0, 10),
      stanceChangeSeconds: numberValue(speed.stanceChangeSeconds, defaults.speed.stanceChangeSeconds, 0, 15),
      minimumSpeedMetersPerSecond: numberValue(speed.minimumSpeedMetersPerSecond, defaults.speed.minimumSpeedMetersPerSecond, 0, 10),
      lowStaminaSpeedMultiplier: numberValue(speed.lowStaminaSpeedMultiplier, defaults.speed.lowStaminaSpeedMultiplier, 0, 1),
    },
    stamina: {
      drainPerSecond: numberValue(stamina.drainPerSecond, defaults.stamina.drainPerSecond, 0, 100),
      recoveryPerSecond: numberValue(stamina.recoveryPerSecond, defaults.stamina.recoveryPerSecond, 0, 100),
      minimumToStart: numberValue(stamina.minimumToStart, defaults.stamina.minimumToStart, 0, 100),
      fallbackThreshold: numberValue(stamina.fallbackThreshold, defaults.stamina.fallbackThreshold, 0, 100),
      resumeThreshold: numberValue(stamina.resumeThreshold, defaults.stamina.resumeThreshold, 0, 100),
    },
    visibility: {
      movementVisibilityMultiplier: numberValue(visibility.movementVisibilityMultiplier, defaults.visibility.movementVisibilityMultiplier, 0, 5),
      usesStealthSkill: booleanValue(visibility.usesStealthSkill, defaults.visibility.usesStealthSkill),
      lateralMovementMultiplier: numberValue(visibility.lateralMovementMultiplier, defaults.visibility.lateralMovementMultiplier, 0, 5),
      openTerrainExposureBonus: numberValue(visibility.openTerrainExposureBonus, defaults.visibility.openTerrainExposureBonus, 0, 5),
    },
    noise: {
      loudness: numberValue(noise.loudness, defaults.noise.loudness, 0, 1),
      eventSpacingMeters: numberValue(noise.eventSpacingMeters, defaults.noise.eventSpacingMeters, 0.05, 50),
      fatigueMultiplier: numberValue(noise.fatigueMultiplier, defaults.noise.fatigueMultiplier, 0, 5),
      surfacePolicy: enumValue(noise.surfacePolicy, ['profile_multiplier', 'material_profile_future'] as const, defaults.noise.surfacePolicy),
    },
    attention: {
      focusMultiplier: numberValue(attention.focusMultiplier, defaults.attention.focusMultiplier, 0, 3),
      directAttentionMultiplier: numberValue(attention.directAttentionMultiplier, defaults.attention.directAttentionMultiplier, 0, 3),
      peripheralMultiplier: numberValue(attention.peripheralMultiplier, defaults.attention.peripheralMultiplier, 0, 3),
      rearAwarenessMultiplier: numberValue(attention.rearAwarenessMultiplier, defaults.attention.rearAwarenessMultiplier, 0, 3),
      stationaryTargetDetectionMultiplier: numberValue(attention.stationaryTargetDetectionMultiplier, defaults.attention.stationaryTargetDetectionMultiplier, 0, 3),
      movingTargetDetectionMultiplier: numberValue(attention.movingTargetDetectionMultiplier, defaults.attention.movingTargetDetectionMultiplier, 0, 3),
      scanSpeedMultiplier: numberValue(attention.scanSpeedMultiplier, defaults.attention.scanSpeedMultiplier, 0, 3),
    },
    weapon: {
      allowFireWhileMoving: booleanValue(weapon.allowFireWhileMoving, defaults.weapon.allowFireWhileMoving),
      allowReloadWhileMoving: booleanValue(weapon.allowReloadWhileMoving, defaults.weapon.allowReloadWhileMoving),
      readyDelayAfterStopSeconds: numberValue(weapon.readyDelayAfterStopSeconds, defaults.weapon.readyDelayAfterStopSeconds, 0, 15),
      weaponPreparationPenalty: numberValue(weapon.weaponPreparationPenalty, defaults.weapon.weaponPreparationPenalty, 0, 3),
    },
    restrictions: {
      maximumWoundSeverity: numberValue(restrictions.maximumWoundSeverity, defaults.restrictions.maximumWoundSeverity, 0, 1),
      allowedWhileSuppressed: booleanValue(restrictions.allowedWhileSuppressed, defaults.restrictions.allowedWhileSuppressed),
      minimumSoldierSpeedMetersPerSecond: numberValue(restrictions.minimumSoldierSpeedMetersPerSecond, defaults.restrictions.minimumSoldierSpeedMetersPerSecond, 0, 10),
      fallbackRule: enumValue(restrictions.fallbackRule, ['profile', 'slower_gait', 'stop'] as const, defaults.restrictions.fallbackRule),
    },
  };
}

function builtInProfile(value: Omit<MovementProfile, 'settings' | 'revision' | 'builtIn' | 'templateProfileId'> & { settings?: Partial<MovementProfileSettings> }): MovementProfile {
  const settings = value.settings ? mergeSettings(DEFAULT_SETTINGS, value.settings) : cloneSettings(DEFAULT_SETTINGS);
  return {
    ...value,
    templateProfileId: value.id as BuiltInMovementProfileId,
    settings,
    revision: 1,
    builtIn: true,
  };
}

function mergeSettings(base: MovementProfileSettings, patch: Partial<MovementProfileSettings>): MovementProfileSettings {
  return {
    speed: { ...base.speed, ...patch.speed },
    stamina: { ...base.stamina, ...patch.stamina },
    visibility: { ...base.visibility, ...patch.visibility },
    noise: { ...base.noise, ...patch.noise },
    attention: { ...base.attention, ...patch.attention },
    weapon: { ...base.weapon, ...patch.weapon },
    restrictions: { ...base.restrictions, ...patch.restrictions },
  };
}

function getBuiltInDefaultsWithoutRecursion(id: BuiltInMovementProfileId): MovementProfile {
  const value = BUILT_IN_PROFILES.find((profileValue) => profileValue.id === id) ?? BUILT_IN_PROFILES[0];
  if (!value) throw new Error('Movement profile defaults are unavailable.');
  return cloneProfile(value);
}

function cloneProfile(value: MovementProfile): MovementProfile {
  return { ...value, settings: cloneSettings(value.settings) };
}

function cloneSettings(value: MovementProfileSettings): MovementProfileSettings {
  return {
    speed: { ...value.speed },
    stamina: { ...value.stamina },
    visibility: { ...value.visibility },
    noise: { ...value.noise },
    attention: { ...value.attention },
    weapon: { ...value.weapon },
    restrictions: { ...value.restrictions },
  };
}

function cloneUnknown<T>(value: T): T {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, fallback: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text) return text;
  const fallbackText = typeof fallback === 'string' ? fallback.trim() : '';
  return fallbackText || 'Movement profile';
}

function normalizeCustomId(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  if (!normalized) throw new Error('Movement profile id is empty after normalization.');
  if (isBuiltInMovementProfileId(normalized)) throw new Error(`Movement profile id is reserved: ${normalized}`);
  return normalized;
}

function normalizeCustomOrBuiltInId(value: string): string {
  return isBuiltInMovementProfileId(value) ? value : normalizeCustomId(value);
}

function nextCustomSortOrder(values: Iterable<MovementProfile>): number {
  let maximum = 100;
  for (const value of values) maximum = Math.max(maximum, value.sortOrder);
  return maximum + 10;
}

function numberValue(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
}

function integer(value: unknown, fallback: number, min: number, max: number): number {
  return Math.round(numberValue(value, fallback, min, max));
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function enumValue<const T extends readonly string[]>(value: unknown, values: T, fallback: T[number]): T[number] {
  return typeof value === 'string' && (values as readonly string[]).includes(value) ? value as T[number] : fallback;
}
