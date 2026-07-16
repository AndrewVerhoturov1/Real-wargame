import { distance, type GridPosition } from '../geometry';
import type { AttentionSample } from '../perception/AttentionModel';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';
import type { LineOfSightProbeResult } from './LineOfSight';
import {
  getVisibilityGeometryField,
  readVisibilityGeometryCell,
} from './VisibilityGeometryField';
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
  const distanceCells = distance(observer.position, target);
  const distanceMeters = distanceCells * state.map.metersPerCell;
  const rangeCells = Math.max(
    1,
    observer.attentionSettings.vision.maximumVisualRangeMeters / Math.max(0.001, state.map.metersPerCell),
  );
  const geometry = getVisibilityGeometryField(state.map, {
    origin: observer.position,
    originHeightAboveGroundMeters: eyeHeightForPosture(observer.behaviorRuntime.posture),
    targetHeightAboveGroundMeters: targetHeightMeters,
    rangeCells,
  });
  const geometryCell = readVisibilityGeometryCell(geometry, target.x, target.y);
  const lineOfSight = buildPointLineOfSight(
    observer.position,
    target,
    distanceMeters,
    geometryCell.hardBlocked,
    geometryCell.visualTransmission,
    geometryCell.blockerKind,
  );
  const observerCondition = observerVisibilityCondition({
    fatigue: observer.soldier.condition.fatigue,
    confusion: observer.soldier.condition.confusion,
    health: observer.soldier.condition.health,
    suppression: observer.behaviorRuntime.suppression,
  });
  const quality = evaluateCellVisibilityQuality({
    blocked: lineOfSight.blocked,
    visualTransmission: lineOfSight.visualTransmission,
    distanceMeters,
    attentionWeight: attention.weight,
    observerCondition,
    vision: observer.attentionSettings.vision,
  });

  return {
    lineOfSight,
    quality,
    distanceMeters,
    explanationRu: [
      `Качество зоны обзора: ${Math.round(quality.quality01 * 100)}%.`,
      `Дистанция в расчёте обзора: ×${format(quality.distanceFactor)}.`,
      `Направление внимания в расчёте обзора: ×${format(quality.attentionFactor)}.`,
      `Проходимость линии обзора: ×${format(quality.transmissionFactor)}.`,
      `Состояние наблюдателя в расчёте обзора: ×${format(quality.observerConditionFactor)}.`,
    ],
  };
}

function buildPointLineOfSight(
  origin: GridPosition,
  target: GridPosition,
  totalDistanceMeters: number,
  blocked: boolean,
  visualTransmission: number,
  blockerKind: number,
): LineOfSightProbeResult {
  const partialObscuration = !blocked && visualTransmission < 0.995;
  const blockerReasonRu = blockerKind === 2
    ? 'линию обзора закрыл объект карты'
    : blockerKind === 1
      ? 'линию обзора закрыл рельеф'
      : partialObscuration
        ? 'прямая видимость есть, но растительность ухудшает обзор'
        : 'прямая видимость есть';
  return {
    origin: { ...origin },
    target: { ...target },
    totalDistanceMeters,
    visibleDistanceMeters: blocked ? 0 : totalDistanceMeters,
    blocked,
    blockedAt: null,
    blockerReasonRu,
    visualTransmission,
    partialObscuration,
    accumulatedForestMeters: 0,
    obscurationReasonRu: partialObscuration
      ? 'растительность ослабляет общий visibility geometry field'
      : 'препятствий растительностью нет',
  };
}

function eyeHeightForPosture(posture: UnitModel['behaviorRuntime']['posture']): number {
  if (posture === 'prone') return 0.35;
  if (posture === 'crouched') return 1.1;
  return 1.7;
}

function format(value: number): string {
  return value.toFixed(2).replace('.', ',');
}
