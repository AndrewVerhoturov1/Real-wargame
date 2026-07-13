import type { UnitPosture } from '../behavior/BehaviorModel';

export type PerceptionTargetType =
  | 'sniper'
  | 'soldier'
  | 'support_weapon'
  | 'light_vehicle'
  | 'armored_vehicle'
  | 'tank';

export interface PerceptionTargetProfile {
  type: PerceptionTargetType;
  labelRu: string;
  baseSize: number;
  heightMetersByPosture: Record<UnitPosture, number>;
}

const TARGET_PROFILES: Record<PerceptionTargetType, PerceptionTargetProfile> = {
  sniper: {
    type: 'sniper',
    labelRu: 'Снайпер / малый силуэт',
    baseSize: 0.85,
    heightMetersByPosture: {
      standing: 1.7,
      crouched: 1.1,
      prone: 0.35,
    },
  },
  soldier: {
    type: 'soldier',
    labelRu: 'Обычный боец',
    baseSize: 1,
    heightMetersByPosture: {
      standing: 1.7,
      crouched: 1.1,
      prone: 0.35,
    },
  },
  support_weapon: {
    type: 'support_weapon',
    labelRu: 'Расчёт тяжёлого оружия',
    baseSize: 1.3,
    heightMetersByPosture: {
      standing: 1.8,
      crouched: 1.2,
      prone: 0.5,
    },
  },
  light_vehicle: {
    type: 'light_vehicle',
    labelRu: 'Лёгкая машина',
    baseSize: 1.8,
    heightMetersByPosture: {
      standing: 2.1,
      crouched: 2.1,
      prone: 2.1,
    },
  },
  armored_vehicle: {
    type: 'armored_vehicle',
    labelRu: 'Бронемашина',
    baseSize: 2.4,
    heightMetersByPosture: {
      standing: 2.7,
      crouched: 2.7,
      prone: 2.7,
    },
  },
  tank: {
    type: 'tank',
    labelRu: 'Танк',
    baseSize: 3,
    heightMetersByPosture: {
      standing: 3.2,
      crouched: 3.2,
      prone: 3.2,
    },
  },
};

export function resolvePerceptionTargetProfile(
  value: PerceptionTargetType | string | null | undefined,
): PerceptionTargetProfile {
  if (value && value in TARGET_PROFILES) {
    return TARGET_PROFILES[value as PerceptionTargetType];
  }
  return TARGET_PROFILES.soldier;
}

export function getPerceptionTargetHeightMeters(
  value: PerceptionTargetType | string | null | undefined,
  posture: UnitPosture,
): number {
  return resolvePerceptionTargetProfile(value).heightMetersByPosture[posture];
}
