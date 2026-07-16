import { distance, type GridPosition } from '../geometry';
import type { AttentionSample } from '../perception/AttentionModel';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';
import type { LineOfSightProbeResult } from './LineOfSight';
import {
  getVisibilityGeometryField,
  readVisibilityGeometryCell,
  type VisibilityGeometryField,
} from './VisibilityGeometryField';
import { getVisibilityStaticGrid } from './VisibilityStaticGrid';
import {
  evaluateCellVisibilityQuality,
  observerVisibilityCondition,
  type CellVisibilityQuality,
} from './VisibilityQuality';

const PERCEPTION_MOVING_GEOMETRY_INTERVAL_SECONDS = 0.4;
const MAX_PERCEPTION_GEOMETRY_FIELDS_PER_STATE = 32;

interface PerceptionGeometryRuntimeEntry {
  readonly map: SimulationState['map'];
  readonly field: VisibilityGeometryField;
  readonly observerPosition: GridPosition;
  readonly builtAtSeconds: number;
}

const perceptionGeometryRuntimeByState = new WeakMap<
  SimulationState,
  Map<string, PerceptionGeometryRuntimeEntry>
>();

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
  const geometry = getPerceptionGeometryField(
    state,
    observer,
    targetHeightMeters,
    rangeCells,
  );
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

function getPerceptionGeometryField(
  state: SimulationState,
  observer: UnitModel,
  targetHeightMeters: number,
  rangeCells: number,
): VisibilityGeometryField {
  const runtime = getPerceptionGeometryRuntime(state);
  const key = [
    observer.id,
    observer.behaviorRuntime.posture,
    quantize(targetHeightMeters, 0.05),
    quantize(rangeCells, 0.25),
  ].join(':');
  const current = runtime.get(key) ?? null;
  const mapVisualRevision = getVisibilityStaticGrid(state.map).mapVisualRevision;
  const mapCurrent = current?.map === state.map
    && current.field.mapVisualRevision === mapVisualRevision;
  const moved = current !== null
    && (Math.abs(current.observerPosition.x - observer.position.x) > 0.001
      || Math.abs(current.observerPosition.y - observer.position.y) > 0.001);

  if (current && mapCurrent && (!moved
    || state.simulationTimeSeconds - current.builtAtSeconds < PERCEPTION_MOVING_GEOMETRY_INTERVAL_SECONDS)) {
    touch(runtime, key, current);
    return current.field;
  }

  const field = getVisibilityGeometryField(state.map, {
    origin: observer.position,
    originHeightAboveGroundMeters: eyeHeightForPosture(observer.behaviorRuntime.posture),
    targetHeightAboveGroundMeters: targetHeightMeters,
    rangeCells,
  });
  const next: PerceptionGeometryRuntimeEntry = {
    map: state.map,
    field,
    observerPosition: { ...observer.position },
    builtAtSeconds: state.simulationTimeSeconds,
  };
  runtime.set(key, next);
  trim(runtime, MAX_PERCEPTION_GEOMETRY_FIELDS_PER_STATE);
  return field;
}

function getPerceptionGeometryRuntime(
  state: SimulationState,
): Map<string, PerceptionGeometryRuntimeEntry> {
  let runtime = perceptionGeometryRuntimeByState.get(state);
  if (!runtime) {
    runtime = new Map();
    perceptionGeometryRuntimeByState.set(state, runtime);
  }
  return runtime;
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

function touch<T>(runtime: Map<string, T>, key: string, value: T): void {
  runtime.delete(key);
  runtime.set(key, value);
}

function trim<T>(runtime: Map<string, T>, maximum: number): void {
  while (runtime.size > maximum) {
    const oldest = runtime.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    runtime.delete(oldest);
  }
}

function quantize(value: number, step: number): string {
  return (Math.round(value / step) * step).toFixed(3);
}

function format(value: number): string {
  return value.toFixed(2).replace('.', ',');
}
