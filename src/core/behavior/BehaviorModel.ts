export type UnitState = 'idle' | 'moving' | 'observing' | 'taking_cover' | 'stressed';
export type UnitPosture = 'standing' | 'crouched' | 'prone';
export type BehaviorProfileId = 'green' | 'regular' | 'veteran' | 'cautious' | 'reckless';

export interface BehaviorSettings {
  obedience: number;
  caution: number;
  aggression: number;
  fear: number;
  dangerCrouchThreshold: number;
  dangerProneThreshold: number;
  stressStopThreshold: number;
  stressRecoveryPerSecond: number;
}

export interface UnitBehaviorRuntime {
  state: UnitState;
  previousState: UnitState;
  posture: UnitPosture;
  previousPosture: UnitPosture;
  danger: number;
  rawDanger: number;
  stress: number;
  currentAction: string;
  reason: string;
  lastEvent: string | null;
  stateChangedBecause: string;
  postureChangedBecause: string;
}

export const DEFAULT_BEHAVIOR_PROFILE: BehaviorProfileId = 'regular';

export const BEHAVIOR_PROFILES: Record<BehaviorProfileId, BehaviorSettings> = {
  green: {
    obedience: 0.8,
    caution: 1.25,
    aggression: 0.65,
    fear: 1.35,
    dangerCrouchThreshold: 28,
    dangerProneThreshold: 58,
    stressStopThreshold: 68,
    stressRecoveryPerSecond: 12,
  },
  regular: {
    obedience: 1,
    caution: 1,
    aggression: 1,
    fear: 1,
    dangerCrouchThreshold: 40,
    dangerProneThreshold: 70,
    stressStopThreshold: 82,
    stressRecoveryPerSecond: 16,
  },
  veteran: {
    obedience: 1.1,
    caution: 0.9,
    aggression: 1.05,
    fear: 0.75,
    dangerCrouchThreshold: 50,
    dangerProneThreshold: 82,
    stressStopThreshold: 92,
    stressRecoveryPerSecond: 22,
  },
  cautious: {
    obedience: 0.95,
    caution: 1.45,
    aggression: 0.7,
    fear: 1.15,
    dangerCrouchThreshold: 30,
    dangerProneThreshold: 62,
    stressStopThreshold: 74,
    stressRecoveryPerSecond: 15,
  },
  reckless: {
    obedience: 1.15,
    caution: 0.65,
    aggression: 1.35,
    fear: 0.65,
    dangerCrouchThreshold: 58,
    dangerProneThreshold: 88,
    stressStopThreshold: 96,
    stressRecoveryPerSecond: 18,
  },
};

export const POSTURE_MOVE_MULTIPLIER: Record<UnitPosture, number> = {
  standing: 1,
  crouched: 0.65,
  prone: 0.25,
};

export const POSTURE_EXPOSURE_MULTIPLIER: Record<UnitPosture, number> = {
  standing: 1,
  crouched: 0.75,
  prone: 0.45,
};

export function normalizeBehaviorProfileId(profileId?: string): BehaviorProfileId {
  if (profileId && profileId in BEHAVIOR_PROFILES) {
    return profileId as BehaviorProfileId;
  }

  return DEFAULT_BEHAVIOR_PROFILE;
}

export function createBehaviorSettings(
  profileId: BehaviorProfileId,
  overrides: Partial<BehaviorSettings> = {},
): BehaviorSettings {
  return {
    ...BEHAVIOR_PROFILES[profileId],
    ...overrides,
  };
}

export function createBehaviorRuntime(): UnitBehaviorRuntime {
  return {
    state: 'idle',
    previousState: 'idle',
    posture: 'standing',
    previousPosture: 'standing',
    danger: 0,
    rawDanger: 0,
    stress: 0,
    currentAction: 'waiting',
    reason: 'No order has been issued yet.',
    lastEvent: null,
    stateChangedBecause: 'Initial idle state.',
    postureChangedBecause: 'Initial standing posture.',
  };
}

export function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}
