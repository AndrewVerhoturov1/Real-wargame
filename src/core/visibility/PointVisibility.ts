import type { GridPosition } from '../geometry';
import type { AttentionSample } from '../perception/AttentionModel';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';
import { computeLineOfSight, type LineOfSightProbeResult } from './LineOfSight';
import {
  evaluateCellVisibilityQuality,
  observerVisibilityCondition,
  type CellVisibilityQuality,
} from './VisibilityQuality';

export interface PointVisibilityResult {
  lineOfSight: LineOfSightProbeResult;
  quality: CellVisibilityQuality;
  distanceMeters: number;
  explanationRu: string[];
}

export function evaluatePointVisibility(
  state: SimulationState,
  observer: UnitModel,
  target: GridPosition,
  targetHeightMeters: number,
  attention: AttentionSample,
): PointVisibilityResult {
  const lineOfSight = computeLineOfSight(state.map, observer, target, targetHeightMeters);
  const observerCondition = observerVisibilityCondition({
    fatigue: observer.soldier.condition.fatigue,
    confusion: observer.soldier.condition.confusion,
    health: observer.soldier.condition.health,
    suppression: observer.behaviorRuntime.suppression,
  });
  const quality = evaluateCellVisibilityQuality({
    blocked: lineOfSight.blocked,
    visualTransmission: lineOfSight.visualTransmission,
    distanceMeters: lineOfSight.totalDistanceMeters,
    attentionWeight: attention.weight,
    observerCondition,
    vision: observer.attentionSettings.vision,
  });

  return {
    lineOfSight,
    quality,
    distanceMeters: lineOfSight.totalDistanceMeters,
    explanationRu: [
      `Качество зоны обзора: ${Math.round(quality.quality01 * 100)}%.`,
      `Дистанция в расчёте обзора: ×${format(quality.distanceFactor)}.`,
      `Направление внимания в расчёте обзора: ×${format(quality.attentionFactor)}.`,
      `Проходимость линии обзора: ×${format(quality.transmissionFactor)}.`,
      `Состояние наблюдателя в расчёте обзора: ×${format(quality.observerConditionFactor)}.`,
    ],
  };
}

function format(value: number): string {
  return value.toFixed(2).replace('.', ',');
}
