export type AttentionMode = 'march' | 'observe' | 'search' | 'engage';
export type AttentionZone = 'focus' | 'direct' | 'peripheral';
export type AttentionModeSource = 'automatic' | 'ai' | 'player';

export interface AttentionModeProfile {
  focusAngleDegrees: number;
  directAngleDegrees: number;
  focusWeight: number;
  directWeight: number;
  peripheralWeight: number;
  scanSpeedDegreesPerSecond: number;
  focusCheckIntervalSeconds: number;
  directCheckIntervalSeconds: number;
  peripheralCheckIntervalSeconds: number;
  rearCheckIntervalSeconds: number;
  defaultSearchArcDegrees: number;
}

export interface UnitAttentionSettings {
  defaultMode: AttentionMode;
  profiles: Record<AttentionMode, AttentionModeProfile>;
}

export interface UnitAttentionSettingsInput {
  defaultMode?: AttentionMode;
  profiles?: Partial<Record<AttentionMode, Partial<AttentionModeProfile>>>;
}

export interface AttentionRuntimeState {
  mode: AttentionMode;
  modeSource: AttentionModeSource;
  focusDirectionRadians: number;
  focusTargetId: string | null;
  searchCenterRadians: number;
  searchArcRadians: number;
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
}

export const ATTENTION_MODES: readonly AttentionMode[] = ['march', 'observe', 'search', 'engage'];

export const DEFAULT_ATTENTION_PROFILES: Readonly<Record<AttentionMode, AttentionModeProfile>> = {
  march: {
    focusAngleDegrees: 50,
    directAngleDegrees: 150,
    focusWeight: 1,
    directWeight: 0.58,
    peripheralWeight: 0.24,
    scanSpeedDegreesPerSecond: 55,
    focusCheckIntervalSeconds: 0.2,
    directCheckIntervalSeconds: 0.34,
    peripheralCheckIntervalSeconds: 0.75,
    rearCheckIntervalSeconds: 3.5,
    defaultSearchArcDegrees: 180,
  },
  observe: {
    focusAngleDegrees: 60,
    directAngleDegrees: 170,
    focusWeight: 1,
    directWeight: 0.66,
    peripheralWeight: 0.16,
    scanSpeedDegreesPerSecond: 38,
    focusCheckIntervalSeconds: 0.2,
    directCheckIntervalSeconds: 0.34,
    peripheralCheckIntervalSeconds: 0.9,
    rearCheckIntervalSeconds: 5,
    defaultSearchArcDegrees: 200,
  },
  search: {
    focusAngleDegrees: 30,
    directAngleDegrees: 80,
    focusWeight: 1,
    directWeight: 0.52,
    peripheralWeight: 0.08,
    scanSpeedDegreesPerSecond: 26,
    focusCheckIntervalSeconds: 0.16,
    directCheckIntervalSeconds: 0.3,
    peripheralCheckIntervalSeconds: 1.1,
    rearCheckIntervalSeconds: 8,
    defaultSearchArcDegrees: 120,
  },
  engage: {
    focusAngleDegrees: 20,
    directAngleDegrees: 50,
    focusWeight: 1,
    directWeight: 0.42,
    peripheralWeight: 0.04,
    scanSpeedDegreesPerSecond: 0,
    focusCheckIntervalSeconds: 0.12,
    directCheckIntervalSeconds: 0.34,
    peripheralCheckIntervalSeconds: 1.2,
    rearCheckIntervalSeconds: 10,
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

  return { defaultMode, profiles };
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
  return {
    focusAngleDegrees: focus,
    directAngleDegrees: direct,
    focusWeight: clampFinite(value.focusWeight, 0, 2, 1),
    directWeight: clampFinite(value.directWeight, 0, 2, 0.6),
    peripheralWeight: clampFinite(value.peripheralWeight, 0, 1, 0.1),
    scanSpeedDegreesPerSecond: clampFinite(value.scanSpeedDegreesPerSecond, 0, 360, 30),
    focusCheckIntervalSeconds: clampFinite(value.focusCheckIntervalSeconds, 0.05, 5, 0.2),
    directCheckIntervalSeconds: clampFinite(value.directCheckIntervalSeconds, 0.05, 5, 0.35),
    peripheralCheckIntervalSeconds: clampFinite(value.peripheralCheckIntervalSeconds, 0.05, 10, 1),
    rearCheckIntervalSeconds: clampFinite(value.rearCheckIntervalSeconds, 0.25, 60, 5),
    defaultSearchArcDegrees: clampFinite(value.defaultSearchArcDegrees, 1, 360, 120),
  };
}

export function sampleAttentionWeight(
  profile: AttentionModeProfile,
  angleDifferenceDegrees: number,
): AttentionSample {
  const angle = Math.min(180, Math.abs(normalizeSignedDegrees(angleDifferenceDegrees)));
  const focusHalf = profile.focusAngleDegrees / 2;
  const directHalf = profile.directAngleDegrees / 2;
  const focusBlend = Math.max(3, Math.min(12, profile.focusAngleDegrees * 0.18));
  const directBlend = Math.max(5, Math.min(18, profile.directAngleDegrees * 0.12));
  const focusMix = smoothstep(focusHalf - focusBlend, focusHalf + focusBlend, angle);
  const directMix = smoothstep(directHalf - directBlend, directHalf + directBlend, angle);
  const focusToDirect = lerp(profile.focusWeight, profile.directWeight, focusMix);
  const weight = clampFinite(lerp(focusToDirect, profile.peripheralWeight, directMix), 0, 2, 0);
  const zone: AttentionZone = angle <= focusHalf ? 'focus' : angle <= directHalf ? 'direct' : 'peripheral';

  return {
    zone,
    weight,
    normalizedAngle01: angle / 180,
  };
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
