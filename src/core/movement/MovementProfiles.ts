import type { UnitPosture } from '../behavior/BehaviorModel';

export const MOVEMENT_GAITS = ['crawl', 'crouch_walk', 'walk', 'run', 'sprint'] as const;
export type MovementGait = typeof MOVEMENT_GAITS[number];
export type MovementProfileSource = 'default' | 'unit' | 'player' | 'ai' | 'fallback' | 'migration';

export interface MovementProfileMovement {
  preferredPosture: UnitPosture;
  postureRequired: boolean;
  speedMultiplier: number;
  startSeconds: number;
  stopSeconds: number;
  autoPosture: boolean;
}

export interface MovementProfileStamina {
  drainMultiplier: number;
  recoveryPerSecond: number;
  minimumToStart: number;
  downgradeThreshold: number;
  fallbackGait: MovementGait;
}

export interface MovementProfileSignature {
  visualMovementMultiplier: number;
  stealthSkillShare: number;
  lateralVisibilityMultiplier: number;
  soundLoudness: number;
  soundIntervalMeters: number;
}

export interface MovementProfileObservation {
  focusMultiplier: number;
  directMultiplier: number;
  peripheralMultiplier: number;
  rearMultiplier: number;
  stationaryTargetMultiplier: number;
  movingTargetMultiplier: number;
}

export interface MovementProfileWeapon {
  allowFireWhileMoving: boolean;
  allowReloadWhileMoving: boolean;
  readyDelayAfterStopSeconds: number;
  aimPreparationMultiplier: number;
}

export interface MovementProfileRestrictions {
  allowedWhenWounded: boolean;
  allowedWhenSuppressed: boolean;
  minimumPhysicalCapability: number;
  safeFallbackGait: MovementGait;
}

export interface MovementProfile {
  id: string;
  label: string;
  labelRu: string;
  revision: number;
  builtIn: boolean;
  defaultGait: MovementGait;
  movement: MovementProfileMovement;
  stamina: MovementProfileStamina;
  signature: MovementProfileSignature;
  observation: MovementProfileObservation;
  weapon: MovementProfileWeapon;
  restrictions: MovementProfileRestrictions;
}

export interface MovementProfileRegistryData {
  version: 1;
  profiles: MovementProfile[];
}

export interface MovementProfileRegistry {
  version: 1;
  profiles: Record<string, MovementProfile>;
}

export const DEFAULT_MOVEMENT_PROFILE_ID = 'normal';

const BASE_PROFILE: Omit<MovementProfile, 'id' | 'label' | 'labelRu' | 'builtIn' | 'defaultGait'> = {
  revision: 1,
  movement: {
    preferredPosture: 'standing',
    postureRequired: false,
    speedMultiplier: 1,
    startSeconds: 0.12,
    stopSeconds: 0.08,
    autoPosture: true,
  },
  stamina: {
    drainMultiplier: 1,
    recoveryPerSecond: 7,
    minimumToStart: 8,
    downgradeThreshold: 12,
    fallbackGait: 'walk',
  },
  signature: {
    visualMovementMultiplier: 1,
    stealthSkillShare: 0.45,
    lateralVisibilityMultiplier: 1,
    soundLoudness: 0.6,
    soundIntervalMeters: 3.2,
  },
  observation: {
    focusMultiplier: 0.9,
    directMultiplier: 0.86,
    peripheralMultiplier: 0.78,
    rearMultiplier: 0.7,
    stationaryTargetMultiplier: 0.92,
    movingTargetMultiplier: 1,
  },
  weapon: {
    allowFireWhileMoving: true,
    allowReloadWhileMoving: true,
    readyDelayAfterStopSeconds: 0.1,
    aimPreparationMultiplier: 1,
  },
  restrictions: {
    allowedWhenWounded: true,
    allowedWhenSuppressed: true,
    minimumPhysicalCapability: 0.25,
    safeFallbackGait: 'walk',
  },
};

export const BUILT_IN_MOVEMENT_PROFILES: Readonly<Record<string, MovementProfile>> = Object.freeze({
  normal: profile({
    id: 'normal', label: 'Normal movement', labelRu: 'Обычное движение', builtIn: true, defaultGait: 'walk',
  }),
  stealth: profile({
    id: 'stealth', label: 'Stealth movement', labelRu: 'Скрытное движение', builtIn: true, defaultGait: 'crouch_walk',
    movement: { preferredPosture: 'crouched', postureRequired: true, speedMultiplier: 0.82, startSeconds: 0.18, stopSeconds: 0.1, autoPosture: true },
    stamina: { drainMultiplier: 0.55, recoveryPerSecond: 4, minimumToStart: 4, downgradeThreshold: 6, fallbackGait: 'walk' },
    signature: { visualMovementMultiplier: 0.62, stealthSkillShare: 0.9, lateralVisibilityMultiplier: 0.7, soundLoudness: 0.28, soundIntervalMeters: 4.4 },
    observation: { focusMultiplier: 0.96, directMultiplier: 0.94, peripheralMultiplier: 0.88, rearMultiplier: 0.82, stationaryTargetMultiplier: 0.98, movingTargetMultiplier: 1 },
    weapon: { allowFireWhileMoving: true, allowReloadWhileMoving: true, readyDelayAfterStopSeconds: 0.08, aimPreparationMultiplier: 1.08 },
  }),
  rapid: profile({
    id: 'rapid', label: 'Rapid movement', labelRu: 'Быстрое движение', builtIn: true, defaultGait: 'run',
    movement: { preferredPosture: 'standing', postureRequired: false, speedMultiplier: 1.05, startSeconds: 0.08, stopSeconds: 0.14, autoPosture: true },
    stamina: { drainMultiplier: 1.08, recoveryPerSecond: 6, minimumToStart: 18, downgradeThreshold: 14, fallbackGait: 'walk' },
    signature: { visualMovementMultiplier: 1.28, stealthSkillShare: 0.12, lateralVisibilityMultiplier: 1.2, soundLoudness: 0.95, soundIntervalMeters: 2.6 },
    observation: { focusMultiplier: 0.7, directMultiplier: 0.62, peripheralMultiplier: 0.48, rearMultiplier: 0.38, stationaryTargetMultiplier: 0.64, movingTargetMultiplier: 0.8 },
    weapon: { allowFireWhileMoving: false, allowReloadWhileMoving: false, readyDelayAfterStopSeconds: 0.35, aimPreparationMultiplier: 1.35 },
  }),
  assault: profile({
    id: 'assault', label: 'Assault movement', labelRu: 'Штурмовое движение', builtIn: true, defaultGait: 'sprint',
    movement: { preferredPosture: 'standing', postureRequired: true, speedMultiplier: 1.08, startSeconds: 0.06, stopSeconds: 0.2, autoPosture: true },
    stamina: { drainMultiplier: 1.15, recoveryPerSecond: 5, minimumToStart: 28, downgradeThreshold: 18, fallbackGait: 'run' },
    signature: { visualMovementMultiplier: 1.55, stealthSkillShare: 0, lateralVisibilityMultiplier: 1.35, soundLoudness: 1.2, soundIntervalMeters: 2.2 },
    observation: { focusMultiplier: 0.5, directMultiplier: 0.42, peripheralMultiplier: 0.3, rearMultiplier: 0.22, stationaryTargetMultiplier: 0.45, movingTargetMultiplier: 0.65 },
    weapon: { allowFireWhileMoving: false, allowReloadWhileMoving: false, readyDelayAfterStopSeconds: 0.75, aimPreparationMultiplier: 1.7 },
  }),
  low: profile({
    id: 'low', label: 'Low crawl', labelRu: 'Переползание', builtIn: true, defaultGait: 'crawl',
    movement: { preferredPosture: 'prone', postureRequired: true, speedMultiplier: 0.9, startSeconds: 0.24, stopSeconds: 0.14, autoPosture: true },
    stamina: { drainMultiplier: 0.35, recoveryPerSecond: 2, minimumToStart: 3, downgradeThreshold: 2, fallbackGait: 'crawl' },
    signature: { visualMovementMultiplier: 0.46, stealthSkillShare: 1, lateralVisibilityMultiplier: 0.5, soundLoudness: 0.2, soundIntervalMeters: 5.2 },
    observation: { focusMultiplier: 0.88, directMultiplier: 0.86, peripheralMultiplier: 0.78, rearMultiplier: 0.68, stationaryTargetMultiplier: 0.9, movingTargetMultiplier: 0.96 },
    weapon: { allowFireWhileMoving: true, allowReloadWhileMoving: true, readyDelayAfterStopSeconds: 0.05, aimPreparationMultiplier: 1.16 },
  }),
});

export function createMovementProfileRegistry(data?: unknown): MovementProfileRegistry {
  const profiles: Record<string, MovementProfile> = {};
  for (const builtIn of Object.values(BUILT_IN_MOVEMENT_PROFILES)) profiles[builtIn.id] = cloneProfile(builtIn);
  if (isRecord(data)) {
    const list = Array.isArray(data.profiles) ? data.profiles : [];
    for (const candidate of list) {
      const normalized = normalizeMovementProfile(candidate);
      if (normalized) profiles[normalized.id] = normalized;
    }
  }
  return { version: 1, profiles };
}

export function serializeMovementProfileRegistry(registry: MovementProfileRegistry): MovementProfileRegistryData {
  return {
    version: 1,
    profiles: Object.values(registry.profiles)
      .filter((item) => !item.builtIn || !profilesEqual(item, BUILT_IN_MOVEMENT_PROFILES[item.id]))
      .map(cloneProfile),
  };
}

export function resolveMovementProfile(registry: MovementProfileRegistry, id: string | null | undefined): MovementProfile {
  return registry.profiles[id ?? ''] ?? registry.profiles[DEFAULT_MOVEMENT_PROFILE_ID] ?? cloneProfile(BUILT_IN_MOVEMENT_PROFILES.normal);
}

export function upsertMovementProfile(registry: MovementProfileRegistry, value: unknown): MovementProfile | null {
  const profileValue = normalizeMovementProfile(value);
  if (!profileValue) return null;
  registry.profiles[profileValue.id] = profileValue;
  return profileValue;
}

export function isMovementGait(value: unknown): value is MovementGait {
  return typeof value === 'string' && MOVEMENT_GAITS.includes(value as MovementGait);
}

export function isMovementProfileSource(value: unknown): value is MovementProfileSource {
  return value === 'default' || value === 'unit' || value === 'player' || value === 'ai'
    || value === 'fallback' || value === 'migration';
}

function profile(overrides: Partial<MovementProfile> & Pick<MovementProfile, 'id' | 'label' | 'labelRu' | 'builtIn' | 'defaultGait'>): MovementProfile {
  return normalizeProfileParts({ ...BASE_PROFILE, ...overrides });
}

function normalizeMovementProfile(value: unknown): MovementProfile | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id.trim()) return null;
  const base = resolveBuiltInOrDefault(value.id);
  return normalizeProfileParts({
    ...base,
    ...value,
    id: value.id.trim(),
    label: typeof value.label === 'string' && value.label.trim() ? value.label : value.id,
    labelRu: typeof value.labelRu === 'string' && value.labelRu.trim() ? value.labelRu : value.id,
    builtIn: value.builtIn === true && Boolean(BUILT_IN_MOVEMENT_PROFILES[value.id]),
    defaultGait: isMovementGait(value.defaultGait) ? value.defaultGait : base.defaultGait,
    movement: { ...base.movement, ...(isRecord(value.movement) ? value.movement : {}) },
    stamina: { ...base.stamina, ...(isRecord(value.stamina) ? value.stamina : {}) },
    signature: { ...base.signature, ...(isRecord(value.signature) ? value.signature : {}) },
    observation: { ...base.observation, ...(isRecord(value.observation) ? value.observation : {}) },
    weapon: { ...base.weapon, ...(isRecord(value.weapon) ? value.weapon : {}) },
    restrictions: { ...base.restrictions, ...(isRecord(value.restrictions) ? value.restrictions : {}) },
  } as MovementProfile);
}

function normalizeProfileParts(value: MovementProfile): MovementProfile {
  const fallback = BASE_PROFILE;
  return {
    id: value.id,
    label: value.label,
    labelRu: value.labelRu,
    revision: finite(value.revision, 1, 1, 1_000_000),
    builtIn: value.builtIn,
    defaultGait: isMovementGait(value.defaultGait) ? value.defaultGait : 'walk',
    movement: {
      preferredPosture: posture(value.movement?.preferredPosture, fallback.movement.preferredPosture),
      postureRequired: value.movement?.postureRequired === true,
      speedMultiplier: finite(value.movement?.speedMultiplier, fallback.movement.speedMultiplier, 0.05, 4),
      startSeconds: finite(value.movement?.startSeconds, fallback.movement.startSeconds, 0, 5),
      stopSeconds: finite(value.movement?.stopSeconds, fallback.movement.stopSeconds, 0, 5),
      autoPosture: value.movement?.autoPosture !== false,
    },
    stamina: {
      drainMultiplier: finite(value.stamina?.drainMultiplier, fallback.stamina.drainMultiplier, 0, 5),
      recoveryPerSecond: finite(value.stamina?.recoveryPerSecond, fallback.stamina.recoveryPerSecond, 0, 100),
      minimumToStart: finite(value.stamina?.minimumToStart, fallback.stamina.minimumToStart, 0, 100),
      downgradeThreshold: finite(value.stamina?.downgradeThreshold, fallback.stamina.downgradeThreshold, 0, 100),
      fallbackGait: isMovementGait(value.stamina?.fallbackGait) ? value.stamina.fallbackGait : fallback.stamina.fallbackGait,
    },
    signature: {
      visualMovementMultiplier: finite(value.signature?.visualMovementMultiplier, fallback.signature.visualMovementMultiplier, 0.05, 4),
      stealthSkillShare: finite(value.signature?.stealthSkillShare, fallback.signature.stealthSkillShare, 0, 1),
      lateralVisibilityMultiplier: finite(value.signature?.lateralVisibilityMultiplier, fallback.signature.lateralVisibilityMultiplier, 0, 4),
      soundLoudness: finite(value.signature?.soundLoudness, fallback.signature.soundLoudness, 0, 2),
      soundIntervalMeters: finite(value.signature?.soundIntervalMeters, fallback.signature.soundIntervalMeters, 0.25, 30),
    },
    observation: {
      focusMultiplier: finite(value.observation?.focusMultiplier, fallback.observation.focusMultiplier, 0.05, 2),
      directMultiplier: finite(value.observation?.directMultiplier, fallback.observation.directMultiplier, 0.05, 2),
      peripheralMultiplier: finite(value.observation?.peripheralMultiplier, fallback.observation.peripheralMultiplier, 0.05, 2),
      rearMultiplier: finite(value.observation?.rearMultiplier, fallback.observation.rearMultiplier, 0.05, 2),
      stationaryTargetMultiplier: finite(value.observation?.stationaryTargetMultiplier, fallback.observation.stationaryTargetMultiplier, 0.05, 2),
      movingTargetMultiplier: finite(value.observation?.movingTargetMultiplier, fallback.observation.movingTargetMultiplier, 0.05, 2),
    },
    weapon: {
      allowFireWhileMoving: value.weapon?.allowFireWhileMoving !== false,
      allowReloadWhileMoving: value.weapon?.allowReloadWhileMoving !== false,
      readyDelayAfterStopSeconds: finite(value.weapon?.readyDelayAfterStopSeconds, fallback.weapon.readyDelayAfterStopSeconds, 0, 5),
      aimPreparationMultiplier: finite(value.weapon?.aimPreparationMultiplier, fallback.weapon.aimPreparationMultiplier, 0.25, 4),
    },
    restrictions: {
      allowedWhenWounded: value.restrictions?.allowedWhenWounded !== false,
      allowedWhenSuppressed: value.restrictions?.allowedWhenSuppressed !== false,
      minimumPhysicalCapability: finite(value.restrictions?.minimumPhysicalCapability, fallback.restrictions.minimumPhysicalCapability, 0, 1),
      safeFallbackGait: isMovementGait(value.restrictions?.safeFallbackGait) ? value.restrictions.safeFallbackGait : fallback.restrictions.safeFallbackGait,
    },
  };
}

function resolveBuiltInOrDefault(id: unknown): MovementProfile {
  return typeof id === 'string' && BUILT_IN_MOVEMENT_PROFILES[id]
    ? BUILT_IN_MOVEMENT_PROFILES[id]
    : BUILT_IN_MOVEMENT_PROFILES.normal;
}

function cloneProfile(value: MovementProfile): MovementProfile {
  return {
    ...value,
    movement: { ...value.movement }, stamina: { ...value.stamina }, signature: { ...value.signature },
    observation: { ...value.observation }, weapon: { ...value.weapon }, restrictions: { ...value.restrictions },
  };
}

function profilesEqual(left: MovementProfile, right: MovementProfile | undefined): boolean {
  return Boolean(right) && JSON.stringify(left) === JSON.stringify(right);
}

function posture(value: unknown, fallback: UnitPosture): UnitPosture {
  return value === 'standing' || value === 'crouched' || value === 'prone' ? value : fallback;
}

function finite(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
