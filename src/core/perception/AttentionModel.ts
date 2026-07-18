export type AttentionMode = 'march' | 'observe' | 'search' | 'engage';
export type AttentionZone = 'focus' | 'direct' | 'peripheral' | 'rear' | 'near' | 'outside';
export type AttentionModeSource = 'automatic' | 'ai' | 'player';

export interface AttentionModeProfile {
  focusAngleDegrees: number;
  directAngleDegrees: number;
  /** Full outer width of all forward-facing attention zones. Rear is the remaining angle. */
  peripheralAngleDegrees: number;
  focusWeight: number;
  directWeight: number;
  peripheralWeight: number;
  rearWeight: number;
  /** Legacy import field. Physical sweep is no longer simulated. */
  scanSpeedDegreesPerSecond: number;
  focusCheckIntervalSeconds: number;
  directCheckIntervalSeconds: number;
  peripheralCheckIntervalSeconds: number;
  rearCheckIntervalSeconds: number;
  focusSampleDurationSeconds: number;
  directSampleDurationSeconds: number;
  peripheralSampleDurationSeconds: number;
  rearSampleDurationSeconds: number;
  rearMaximumRangeMeters: number;
  defaultSearchArcDegrees: number;
}

export interface UnitVisionSettings {
  maximumVisualRangeMeters: number;
  distanceFalloffStartMeters: number;
  distanceFalloffExponent: number;
  detectionVariancePercent: number;
}

export interface UnitAttentionSettings {
  defaultMode: AttentionMode;
  profiles: Record<AttentionMode, AttentionModeProfile>;
  vision: UnitVisionSettings;
  nearAwarenessRangeMeters: number;
  nearMinimumVisibilityQuality: number;
}

export interface UnitAttentionSettingsInput {
  defaultMode?: AttentionMode;
  profiles?: Partial<Record<AttentionMode, Partial<AttentionModeProfile>>>;
  vision?: Partial<UnitVisionSettings>;
  nearAwarenessRangeMeters?: number;
  nearMinimumVisibilityQuality?: number;
}

export interface AttentionRuntimeState {
  mode: AttentionMode;
  modeSource: AttentionModeSource;
  focusDirectionRadians: number;
  focusTargetId: string | null;
  searchCenterRadians: number;
  searchArcRadians: number;
  /** Legacy scene fields retained for compatibility; they are inert. */
  scanDirection: -1 | 1;
  scanProgress01: number;
  nextFocusCheckSeconds: number;
  nextDirectCheckSeconds: number;
  nextPeripheralCheckSeconds: number;
  nextRearCheckSeconds: number;
}

export interface AttentionSample {
  zone: AttentionZone;
  weight: number;
  normalizedAngle01: number;
  checkIntervalSeconds: number;
  sampleDurationSeconds: number;
  maximumRangeMeters: number;
  minimumVisibilityQuality: number;
}

export const ATTENTION_MODES: readonly AttentionMode[] = ['march', 'observe', 'search', 'engage'];

export const DEFAULT_NEAR_AWARENESS_RANGE_METERS = 2;
export const DEFAULT_NEAR_MINIMUM_VISIBILITY_QUALITY = 0.9;

export const DEFAULT_VISION_SETTINGS: Readonly<UnitVisionSettings> = {
  maximumVisualRangeMeters: 600,
  distanceFalloffStartMeters: 80,
  distanceFalloffExponent: 1.6,
  detectionVariancePercent: 10,
};

export const DEFAULT_ATTENTION_PROFILES: Readonly<Record<AttentionMode, AttentionModeProfile>> = {
  march: {
    focusAngleDegrees: 50,
    directAngleDegrees: 150,
    peripheralAngleDegrees: 230,
    focusWeight: 1,
    directWeight: 0.58,
    peripheralWeight: 0.24,
    rearWeight: 0.08,
    scanSpeedDegreesPerSecond: 0,
    focusCheckIntervalSeconds: 0.2,
    directCheckIntervalSeconds: 0.34,
    peripheralCheckIntervalSeconds: 0.75,
    rearCheckIntervalSeconds: 3.5,
    focusSampleDurationSeconds: 0.2,
    directSampleDurationSeconds: 0.18,
    peripheralSampleDurationSeconds: 0.12,
    rearSampleDurationSeconds: 0.3,
    rearMaximumRangeMeters: 100,
    defaultSearchArcDegrees: 180,
  },
  observe: {
    focusAngleDegrees: 60,
    directAngleDegrees: 170,
    peripheralAngleDegrees: 220,
    focusWeight: 1,
    directWeight: 0.66,
    peripheralWeight: 0.16,
    rearWeight: 0.06,
    scanSpeedDegreesPerSecond: 0,
    focusCheckIntervalSeconds: 0.2,
    directCheckIntervalSeconds: 0.34,
    peripheralCheckIntervalSeconds: 0.9,
    rearCheckIntervalSeconds: 5,
    focusSampleDurationSeconds: 0.2,
    directSampleDurationSeconds: 0.2,
    peripheralSampleDurationSeconds: 0.14,
    rearSampleDurationSeconds: 0.3,
    rearMaximumRangeMeters: 120,
    defaultSearchArcDegrees: 200,
  },
  search: {
    focusAngleDegrees: 30,
    directAngleDegrees: 80,
    peripheralAngleDegrees: 180,
    focusWeight: 1,
    directWeight: 0.52,
    peripheralWeight: 0.08,
    rearWeight: 0.035,
    scanSpeedDegreesPerSecond: 0,
    focusCheckIntervalSeconds: 0.16,
    directCheckIntervalSeconds: 0.3,
    peripheralCheckIntervalSeconds: 1.1,
    rearCheckIntervalSeconds: 8,
    focusSampleDurationSeconds: 0.16,
    directSampleDurationSeconds: 0.16,
    peripheralSampleDurationSeconds: 0.1,
    rearSampleDurationSeconds: 0.25,
    rearMaximumRangeMeters: 80,
    defaultSearchArcDegrees: 120,
  },
  engage: {
    focusAngleDegrees: 20,
    directAngleDegrees: 50,
    peripheralAngleDegrees: 140,
    focusWeight: 1,
    directWeight: 0.42,
    peripheralWeight: 0.04,
    rearWeight: 0.015,
    scanSpeedDegreesPerSecond: 0,
    focusCheckIntervalSeconds: 0.12,
    directCheckIntervalSeconds: 0.34,
    peripheralCheckIntervalSeconds: 1.2,
    rearCheckIntervalSeconds: 10,
    focusSampleDurationSeconds: 0.12,
    directSampleDurationSeconds: 0.14,
    peripheralSampleDurationSeconds: 0.08,
    rearSampleDurationSeconds: 0.2,
    rearMaximumRangeMeters: 60,
    defaultSearchArcDegrees: 50,
  },
};

export function createAttentionSettings(input: UnitAttentionSettingsInput = {}): UnitAttentionSettings {
  const defaultMode = isAttentionMode(input.defaultMode) ? input.defaultMode : 'observe';
  const profiles = Object.fromEntries(ATTENTION_MODES.map((mode) => [
    mode,
    normalizeAttentionProfile({
      ...DEFAULT_ATTENTION_PROFILES[mode],
      ...(input.profiles?.[mode] ?? {}),
    }),
  ])) as Record<AttentionMode, AttentionModeProfile>;
  const vision = normalizeVisionSettings({
    ...DEFAULT_VISION_SETTINGS,
    ...(input.vision ?? {}),
  });
  const nearAwarenessRangeMeters = clampFinite(
    input.nearAwarenessRangeMeters ?? DEFAULT_NEAR_AWARENESS_RANGE_METERS,
    0,
    20,
    DEFAULT_NEAR_AWARENESS_RANGE_METERS,
  );
  const nearMinimumVisibilityQuality = clampFinite(
    input.nearMinimumVisibilityQuality ?? DEFAULT_NEAR_MINIMUM_VISIBILITY_QUALITY,
    0,
    1,
    DEFAULT_NEAR_MINIMUM_VISIBILITY_QUALITY,
  );

  return {
    defaultMode,
    profiles,
    vision,
    nearAwarenessRangeMeters,
    nearMinimumVisibilityQuality,
  };
}

export function createAttentionRuntime(
  settings: UnitAttentionSettings,
  facingRadians = 0,
): AttentionRuntimeState {
  const profile = settings.profiles[settings.defaultMode];
  return {
    mode: settings.defaultMode,
    modeSource: 'automatic',
    focusDirectionRadians: normalizeRadians(facingRadians),
    focusTargetId: null,
    searchCenterRadians: normalizeRadians(facingRadians),
    searchArcRadians: degreesToRadians(profile.defaultSearchArcDegrees),
    scanDirection: 1,
    scanProgress01: 0.5,
    nextFocusCheckSeconds: 0,
    nextDirectCheckSeconds: 0,
    nextPeripheralCheckSeconds: 0,
    nextRearCheckSeconds: profile.rearCheckIntervalSeconds,
  };
}

export function normalizeAttentionProfile(value: AttentionModeProfile): AttentionModeProfile {
  const focus = clampFinite(value.focusAngleDegrees, 1, 180, 45);
  const direct = clampFinite(value.directAngleDegrees, focus, 360, Math.max(focus, 140));
  const peripheral = clampFinite(value.peripheralAngleDegrees, direct, 360, Math.max(direct, 220));
  const focusCheckIntervalSeconds = clampFinite(value.focusCheckIntervalSeconds, 0.05, 5, 0.2);
  const directCheckIntervalSeconds = clampFinite(value.directCheckIntervalSeconds, 0.05, 5, 0.35);
  const peripheralCheckIntervalSeconds = clampFinite(value.peripheralCheckIntervalSeconds, 0.05, 10, 1);
  const rearCheckIntervalSeconds = clampFinite(value.rearCheckIntervalSeconds, 0.25, 60, 5);
  return {
    focusAngleDegrees: focus,
    directAngleDegrees: direct,
    peripheralAngleDegrees: peripheral,
    focusWeight: clampFinite(value.focusWeight, 0, 2, 1),
    directWeight: clampFinite(value.directWeight, 0, 2, 0.6),
    peripheralWeight: clampFinite(value.peripheralWeight, 0, 1, 0.1),
    rearWeight: clampFinite(value.rearWeight, 0, 1, 0.05),
    scanSpeedDegreesPerSecond: 0,
    focusCheckIntervalSeconds,
    directCheckIntervalSeconds,
    peripheralCheckIntervalSeconds,
    rearCheckIntervalSeconds,
    focusSampleDurationSeconds: normalizeSampleDuration(value.focusSampleDurationSeconds, focusCheckIntervalSeconds, 0.2),
    directSampleDurationSeconds: normalizeSampleDuration(value.directSampleDurationSeconds, directCheckIntervalSeconds, 0.18),
    peripheralSampleDurationSeconds: normalizeSampleDuration(value.peripheralSampleDurationSeconds, peripheralCheckIntervalSeconds, 0.12),
    rearSampleDurationSeconds: normalizeSampleDuration(value.rearSampleDurationSeconds, rearCheckIntervalSeconds, 0.3),
    rearMaximumRangeMeters: clampFinite(value.rearMaximumRangeMeters, 0, 2000, 100),
    defaultSearchArcDegrees: clampFinite(value.defaultSearchArcDegrees, 1, 360, 120),
  };
}

export function normalizeVisionSettings(value: UnitVisionSettings): UnitVisionSettings {
  const maximumVisualRangeMeters = clampFinite(value.maximumVisualRangeMeters, 20, 2000, 600);
  return {
    maximumVisualRangeMeters,
    distanceFalloffStartMeters: clampFinite(value.distanceFalloffStartMeters, 0, maximumVisualRangeMeters - 1, 80),
    distanceFalloffExponent: clampFinite(value.distanceFalloffExponent, 0.25, 6, 1.6),
    detectionVariancePercent: clampFinite(value.detectionVariancePercent, 0, 25, 10),
  };
}

/**
 * Canonical resolver shared by machine perception and current-visibility rendering.
 * Directional angles are full nested widths: focus ⊂ direct ⊂ peripheral; rear is the remainder.
 */
export function resolveAttentionSample(
  profile: AttentionModeProfile,
  angleDifferenceDegrees: number,
  distanceMeters: number,
  nearAwarenessRangeMeters = 0,
  nearMinimumVisibilityQuality = 0,
): AttentionSample {
  const distance = Math.max(0, Number.isFinite(distanceMeters) ? distanceMeters : Number.POSITIVE_INFINITY);
  const angle = Math.min(180, Math.abs(normalizeSignedDegrees(angleDifferenceDegrees)));
  if (distance <= Math.max(0, nearAwarenessRangeMeters)) {
    return {
      zone: 'near',
      weight: 1,
      normalizedAngle01: angle / 180,
      checkIntervalSeconds: 0,
      sampleDurationSeconds: Math.max(profile.focusSampleDurationSeconds, profile.directSampleDurationSeconds),
      maximumRangeMeters: Math.max(0, nearAwarenessRangeMeters),
      minimumVisibilityQuality: clamp01(nearMinimumVisibilityQuality),
    };
  }

  const directional = resolveDirectionalAttentionSample(profile, angle);
  if (directional.zone === 'rear' && distance > profile.rearMaximumRangeMeters) {
    return {
      zone: 'outside',
      weight: 0,
      normalizedAngle01: angle / 180,
      checkIntervalSeconds: profile.rearCheckIntervalSeconds,
      sampleDurationSeconds: 0,
      maximumRangeMeters: profile.rearMaximumRangeMeters,
      minimumVisibilityQuality: 0,
    };
  }
  return directional;
}

/** Compatibility helper for callers that only need directional weight. */
export function sampleAttentionWeight(
  profile: AttentionModeProfile,
  angleDifferenceDegrees: number,
): AttentionSample {
  const angle = Math.min(180, Math.abs(normalizeSignedDegrees(angleDifferenceDegrees)));
  return resolveDirectionalAttentionSample(profile, angle);
}

export function rearAngleDegrees(profile: Pick<AttentionModeProfile, 'peripheralAngleDegrees'>): number {
  return Math.max(0, 360 - profile.peripheralAngleDegrees);
}

export function isAttentionMode(value: unknown): value is AttentionMode {
  return typeof value === 'string' && ATTENTION_MODES.includes(value as AttentionMode);
}

export function degreesToRadians(value: number): number {
  return value * Math.PI / 180;
}

export function radiansToDegrees(value: number): number {
  return value * 180 / Math.PI;
}

export function normalizeRadians(value: number): number {
  const full = Math.PI * 2;
  const normalized = value % full;
  return normalized < 0 ? normalized + full : normalized;
}

export function normalizeSignedDegrees(value: number): number {
  const normalized = ((value + 180) % 360 + 360) % 360 - 180;
  return normalized === -180 ? 180 : normalized;
}

function resolveDirectionalAttentionSample(profile: AttentionModeProfile, angle: number): AttentionSample {
  const focusHalf = profile.focusAngleDegrees / 2;
  const directHalf = profile.directAngleDegrees / 2;
  const peripheralHalf = profile.peripheralAngleDegrees / 2;
  const focusBlend = Math.max(3, Math.min(12, profile.focusAngleDegrees * 0.18));
  const directBlend = Math.max(5, Math.min(18, profile.directAngleDegrees * 0.12));
  const focusMix = smoothstep(focusHalf - focusBlend, focusHalf + focusBlend, angle);
  const directMix = smoothstep(directHalf - directBlend, directHalf + directBlend, angle);
  const focusToDirect = lerp(profile.focusWeight, profile.directWeight, focusMix);

  if (angle <= focusHalf) {
    return sample('focus', focusToDirect, angle, profile.focusCheckIntervalSeconds, profile.focusSampleDurationSeconds);
  }
  if (angle <= directHalf) {
    const weight = lerp(focusToDirect, profile.peripheralWeight, directMix);
    return sample('direct', weight, angle, profile.directCheckIntervalSeconds, profile.directSampleDurationSeconds);
  }
  if (angle <= peripheralHalf) {
    return sample('peripheral', profile.peripheralWeight, angle, profile.peripheralCheckIntervalSeconds, profile.peripheralSampleDurationSeconds);
  }
  return sample(
    'rear',
    profile.rearWeight,
    angle,
    profile.rearCheckIntervalSeconds,
    profile.rearSampleDurationSeconds,
    profile.rearMaximumRangeMeters,
  );
}

function sample(
  zone: AttentionZone,
  weight: number,
  angle: number,
  checkIntervalSeconds: number,
  sampleDurationSeconds: number,
  maximumRangeMeters = Number.POSITIVE_INFINITY,
): AttentionSample {
  return {
    zone,
    weight: clampFinite(weight, 0, 2, 0),
    normalizedAngle01: angle / 180,
    checkIntervalSeconds,
    sampleDurationSeconds,
    maximumRangeMeters,
    minimumVisibilityQuality: 0,
  };
}

function normalizeSampleDuration(value: number, interval: number, fallback: number): number {
  return clampFinite(value, 0.01, interval, Math.min(interval, Math.max(0.01, fallback)));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function lerp(start: number, end: number, factor: number): number {
  return start + (end - start) * factor;
}

function clampFinite(value: number, min: number, max: number, fallback: number): number {
  const finite = Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, finite));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
