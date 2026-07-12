import type { UnitVisionSettings } from '../perception/AttentionModel';

export interface CellVisibilityQualityInput {
  blocked: boolean;
  visualTransmission: number;
  distanceMeters: number;
  attentionWeight: number;
  observerCondition: number;
  vision: UnitVisionSettings;
}

export interface CellVisibilityQuality {
  quality01: number;
  distanceFactor: number;
  transmissionFactor: number;
  attentionFactor: number;
  observerConditionFactor: number;
  blocked: boolean;
}

export function calculateDistanceVisibilityFactor(
  distanceMeters: number,
  vision: Pick<UnitVisionSettings, 'maximumVisualRangeMeters' | 'distanceFalloffStartMeters' | 'distanceFalloffExponent'>,
): number {
  const distance = Math.max(0, distanceMeters);
  const maximum = Math.max(1, vision.maximumVisualRangeMeters);
  const start = Math.max(0, Math.min(maximum - 0.001, vision.distanceFalloffStartMeters));
  if (distance <= start) return 1;
  if (distance >= maximum) return 0;
  const normalized = (distance - start) / Math.max(0.001, maximum - start);
  return clamp01(Math.pow(1 - normalized, Math.max(0.1, vision.distanceFalloffExponent)));
}

export function evaluateCellVisibilityQuality(input: CellVisibilityQualityInput): CellVisibilityQuality {
  const distanceFactor = calculateDistanceVisibilityFactor(input.distanceMeters, input.vision);
  const transmissionFactor = clamp01(input.visualTransmission);
  const attentionFactor = clamp01(input.attentionWeight);
  const observerConditionFactor = clamp01(input.observerCondition);
  const quality01 = input.blocked
    ? 0
    : clamp01(distanceFactor * transmissionFactor * attentionFactor * observerConditionFactor);
  return {
    quality01,
    distanceFactor,
    transmissionFactor,
    attentionFactor,
    observerConditionFactor,
    blocked: input.blocked,
  };
}

export function observerVisibilityCondition(input: {
  fatigue: number;
  confusion: number;
  health: number;
  suppression: number;
}): number {
  const fatiguePenalty = clamp01(input.fatigue / 180);
  const confusionPenalty = clamp01(input.confusion / 160);
  const suppressionPenalty = clamp01(input.suppression / 170);
  const healthFactor = 0.55 + clamp01(input.health / 100) * 0.45;
  return clamp01(healthFactor * (1 - fatiguePenalty * 0.35) * (1 - confusionPenalty * 0.4) * (1 - suppressionPenalty * 0.45));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
