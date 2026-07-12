import type { AiRouteStatusState } from '../ai/AiRouteStatus';
import type { SimulationAiFacts } from '../ai/events/SimulationAiEvents';
import type { AiRuntimeSessionSnapshotV1 } from '../ai/runtime/AiRuntimeSession';

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

export interface SoldierTraits {
  resilience: number;
  caution: number;
  decisiveness: number;
  discipline: number;
  initiative: number;
  tactics: number;
  weaponSkill: number;
}

export interface SoldierCondition {
  fatigue: number;
  morale: number;
  confusion: number;
  health: number;
  attention: number;
  view: number;
  intuition: number;
  speed: number;
  stealth: number;
}

export interface SoldierParameters {
  traits: SoldierTraits;
  condition: SoldierCondition;
}

export interface UnitInitialState {
  posture: UnitPosture;
  stress: number;
  suppression: number;
  ammo: number;
  weaponReady: boolean;
  fatigue: number;
  morale: number;
  confusion: number;
  health: number;
}

export interface SoldierParameterOverrides {
  traits?: Partial<SoldierTraits>;
  condition?: Partial<SoldierCondition>;
}

export interface UnitBehaviorRuntime {
  state: UnitState;
  previousState: UnitState;
  posture: UnitPosture;
  previousPosture: UnitPosture;
  danger: number;
  rawDanger: number;
  stress: number;
  suppression: number;
  ammo: number;
  weaponReady: boolean;
  currentAction: string;
  reason: string;
  lastEvent: string | null;
  stateChangedBecause: string;
  postureChangedBecause: string;
  aiSpeech: string | null;
  aiSpeechRu: string | null;
  aiSpeechUntilMs: number;
  aiGraphReason: string;
  aiGraphLastTickMs: number;
  aiNodeCooldowns: Record<string, number>;
  aiRuntimeSession: AiRuntimeSessionSnapshotV1 | null;
  aiRouteStatusState: AiRouteStatusState | null;
  aiSimulationEventFacts: SimulationAiFacts | null;
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

export const SOLDIER_PARAMETERS_BY_PROFILE: Record<BehaviorProfileId, SoldierParameters> = {
  green: {
    traits: {
      resilience: 35,
      caution: 62,
      decisiveness: 35,
      discipline: 45,
      initiative: 28,
      tactics: 32,
      weaponSkill: 38,
    },
    condition: {
      fatigue: 0,
      morale: 58,
      confusion: 12,
      health: 100,
      attention: 45,
      view: 52,
      intuition: 25,
      speed: 52,
      stealth: 35,
    },
  },
  regular: {
    traits: {
      resilience: 55,
      caution: 50,
      decisiveness: 52,
      discipline: 58,
      initiative: 45,
      tactics: 55,
      weaponSkill: 55,
    },
    condition: {
      fatigue: 0,
      morale: 68,
      confusion: 5,
      health: 100,
      attention: 58,
      view: 60,
      intuition: 42,
      speed: 58,
      stealth: 50,
    },
  },
  veteran: {
    traits: {
      resilience: 78,
      caution: 58,
      decisiveness: 70,
      discipline: 72,
      initiative: 66,
      tactics: 78,
      weaponSkill: 76,
    },
    condition: {
      fatigue: 0,
      morale: 82,
      confusion: 0,
      health: 100,
      attention: 72,
      view: 66,
      intuition: 70,
      speed: 60,
      stealth: 66,
    },
  },
  cautious: {
    traits: {
      resilience: 58,
      caution: 82,
      decisiveness: 42,
      discipline: 60,
      initiative: 40,
      tactics: 62,
      weaponSkill: 54,
    },
    condition: {
      fatigue: 0,
      morale: 64,
      confusion: 4,
      health: 100,
      attention: 68,
      view: 64,
      intuition: 58,
      speed: 54,
      stealth: 62,
    },
  },
  reckless: {
    traits: {
      resilience: 68,
      caution: 25,
      decisiveness: 78,
      discipline: 48,
      initiative: 74,
      tactics: 45,
      weaponSkill: 58,
    },
    condition: {
      fatigue: 0,
      morale: 76,
      confusion: 4,
      health: 100,
      attention: 50,
      view: 56,
      intuition: 44,
      speed: 66,
      stealth: 35,
    },
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

export function createSoldierParameters(
  profileId: BehaviorProfileId,
  overrides: SoldierParameterOverrides = {},
): SoldierParameters {
  const base = SOLDIER_PARAMETERS_BY_PROFILE[profileId];

  return {
    traits: {
      ...base.traits,
      ...overrides.traits,
    },
    condition: {
      ...base.condition,
      ...overrides.condition,
    },
  };
}

export function createUnitInitialState(
  soldier: SoldierParameters,
  overrides: Partial<UnitInitialState> = {},
): UnitInitialState {
  return {
    posture: overrides.posture ?? 'standing',
    stress: clampPercent(overrides.stress ?? 0),
    suppression: clampPercent(overrides.suppression ?? 0),
    ammo: Math.max(0, Math.round(overrides.ammo ?? 30)),
    weaponReady: overrides.weaponReady ?? true,
    fatigue: clampPercent(overrides.fatigue ?? soldier.condition.fatigue),
    morale: clampPercent(overrides.morale ?? soldier.condition.morale),
    confusion: clampPercent(overrides.confusion ?? soldier.condition.confusion),
    health: clampPercent(overrides.health ?? soldier.condition.health),
  };
}

export function createBehaviorRuntime(initialState?: Partial<UnitInitialState>): UnitBehaviorRuntime {
  return {
    state: 'idle',
    previousState: 'idle',
    posture: initialState?.posture ?? 'standing',
    previousPosture: initialState?.posture ?? 'standing',
    danger: 0,
    rawDanger: 0,
    stress: clampPercent(initialState?.stress ?? 0),
    suppression: clampPercent(initialState?.suppression ?? 0),
    ammo: Math.max(0, Math.round(initialState?.ammo ?? 30)),
    weaponReady: initialState?.weaponReady ?? true,
    currentAction: 'waiting',
    reason: 'No order has been issued yet.',
    lastEvent: null,
    stateChangedBecause: 'Initial idle state.',
    postureChangedBecause: 'Initial standing posture.',
    aiSpeech: null,
    aiSpeechRu: null,
    aiSpeechUntilMs: 0,
    aiGraphReason: 'AI graph is not connected yet.',
    aiGraphLastTickMs: 0,
    aiNodeCooldowns: {},
    aiRuntimeSession: null,
    aiRouteStatusState: null,
    aiSimulationEventFacts: null,
  };
}

export function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}
