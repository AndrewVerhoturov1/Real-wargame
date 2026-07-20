import { measurePerformancePhase } from '../debug/PerformancePhases';
import { distance, type GridPosition } from '../geometry';
import { getEnvironmentProfileDomainKey } from '../map/EnvironmentMaterialProfile';
import { getActiveEnvironmentProfile } from '../map/EnvironmentProfileRuntime';
import { getMapRevisionSnapshot } from '../map/MapRuntimeState';
import type { AttentionSample } from '../perception/AttentionModel';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';
import type { LineOfSightProbeResult } from './LineOfSight';
import {
  probeTargetVisibility,
  VISIBILITY_SILHOUETTE_VERSION,
  type VisibilityTargetProbeResult,
} from './VisibilityTargetProbe';
import {
  evaluateCellVisibilityQuality,
  observerVisibilityCondition,
  type CellVisibilityQuality,
} from './VisibilityQuality';

const MAX_PERCEPTION_POINT_PROBES_PER_SIMULATION_STEP = 2;
const MAX_PERCEPTION_POINT_CACHE_ENTRIES = 512;

interface PerceptionPointCacheEntry {
  readonly result: VisibilityTargetProbeResult;
}

interface PerceptionGeometryPreparationRuntime {
  simulationStep: number;
  simulationTimeSeconds: number;
  preparationsThisStep: number;
  preparationCount: number;
  cacheHitCount: number;
  deferredCount: number;
  maxPreparationsPerStep: number;
  pointTargetProbeCount: number;
  pointPhysicalRayCount: number;
}

const perceptionPointCacheByState = new WeakMap<
  SimulationState,
  Map<string, PerceptionPointCacheEntry>
>();
const perceptionGeometryPreparationByState = new WeakMap<SimulationState, PerceptionGeometryPreparationRuntime>();

export interface PointVisibilityResult {
  lineOfSight: LineOfSightProbeResult;
  targetProbe: VisibilityTargetProbeResult;
  quality: CellVisibilityQuality;
  distanceMeters: number;
  explanationRu: string[];
}

export interface PerceptionGeometryPreparationDiagnostics {
  readonly preparationCount: number;
  readonly cacheHitCount: number;
  readonly deferredCount: number;
  readonly preparationsThisStep: number;
  readonly maxPreparationsPerStep: number;
  readonly pointTargetProbeCount: number;
  readonly pointPhysicalRayCount: number;
}

export function evaluatePointVisibility(
  state: SimulationState,
  observer: UnitModel,
  target: GridPosition,
  targetHeightMeters: number,
  attention: AttentionSample,
): PointVisibilityResult | null {
  const distanceCells = distance(observer.position, target);
  const distanceMeters = distanceCells * state.map.metersPerCell;
  const rangeCells = Math.max(
    1,
    observer.attentionSettings.vision.maximumVisualRangeMeters / Math.max(0.001, state.map.metersPerCell),
  );
  if (distanceCells > rangeCells) return null;
  if (attention.zone === 'outside' || attention.weight <= 0 || distanceMeters > attention.maximumRangeMeters) return null;

  const targetProbe = getPerceptionTargetProbe(
    state,
    observer,
    target,
    targetHeightMeters,
  );
  if (!targetProbe) return null;

  const observerCondition = observerVisibilityCondition({
    fatigue: observer.soldier.condition.fatigue,
    confusion: observer.soldier.condition.confusion,
    health: observer.soldier.condition.health,
    suppression: observer.behaviorRuntime.suppression,
  });
  const quality = evaluateCellVisibilityQuality({
    blocked: targetProbe.blocked,
    visualTransmission: targetProbe.visualTransmission,
    distanceMeters,
    attentionWeight: attention.weight,
    observerCondition,
    vision: observer.attentionSettings.vision,
    minimumVisibilityQuality: attention.minimumVisibilityQuality,
  });
  const lineOfSight = targetProbeToCompatibilityLineOfSight(targetProbe);

  return {
    lineOfSight,
    targetProbe,
    quality,
    distanceMeters,
    explanationRu: [
      `Качество зоны обзора: ${Math.round(quality.quality01 * 100)}%.`,
      `Видимая доля силуэта: ${Math.round(targetProbe.visibleFraction * 100)}%.`,
      `Дистанция в расчёте обзора: ×${format(quality.distanceFactor)}.`,
      `Направление внимания в расчёте обзора: ×${format(quality.attentionFactor)}.`,
      `Проходимость линии обзора: ×${format(quality.transmissionFactor)}.`,
      `Состояние наблюдателя в расчёте обзора: ×${format(quality.observerConditionFactor)}.`,
      ...targetProbe.explanationRu,
    ],
  };
}

export function getPerceptionGeometryPreparationDiagnostics(
  state: SimulationState,
): PerceptionGeometryPreparationDiagnostics {
  const runtime = perceptionGeometryPreparationByState.get(state);
  return runtime ? {
    preparationCount: runtime.preparationCount,
    cacheHitCount: runtime.cacheHitCount,
    deferredCount: runtime.deferredCount,
    preparationsThisStep: runtime.preparationsThisStep,
    maxPreparationsPerStep: runtime.maxPreparationsPerStep,
    pointTargetProbeCount: runtime.pointTargetProbeCount,
    pointPhysicalRayCount: runtime.pointPhysicalRayCount,
  } : {
    preparationCount: 0,
    cacheHitCount: 0,
    deferredCount: 0,
    preparationsThisStep: 0,
    maxPreparationsPerStep: 0,
    pointTargetProbeCount: 0,
    pointPhysicalRayCount: 0,
  };
}

export function clearPerceptionPointVisibilityCache(state: SimulationState): void {
  perceptionPointCacheByState.delete(state);
  perceptionGeometryPreparationByState.delete(state);
}

function getPerceptionTargetProbe(
  state: SimulationState,
  observer: UnitModel,
  target: GridPosition,
  targetHeightMeters: number,
): VisibilityTargetProbeResult | null {
  const cache = getPerceptionPointCache(state);
  const key = buildPerceptionPointKey(state, observer, target, targetHeightMeters);
  const cached = cache.get(key);
  if (cached) {
    touch(cache, key, cached);
    getPreparationRuntime(state).cacheHitCount += 1;
    return cached.result;
  }

  if (!consumePointProbeBudget(state)) return null;
  const result = measurePerformancePhase(
    'perception.point-los',
    () => probeTargetVisibility(state.map, observer, target, targetHeightMeters),
  );
  const runtime = getPreparationRuntime(state);
  runtime.pointTargetProbeCount += 1;
  runtime.pointPhysicalRayCount += result.physicalRayCount;
  cache.set(key, { result });
  trim(cache, MAX_PERCEPTION_POINT_CACHE_ENTRIES);
  return result;
}

function buildPerceptionPointKey(
  state: SimulationState,
  observer: UnitModel,
  target: GridPosition,
  targetHeightMeters: number,
): string {
  const revisions = getMapRevisionSnapshot(state.map);
  return [
    'visibility-target-probe',
    VISIBILITY_SILHOUETTE_VERSION,
    observer.id,
    observer.behaviorRuntime.posture,
    exactCoordinateKey(observer.position.x),
    exactCoordinateKey(observer.position.y),
    exactCoordinateKey(target.x),
    exactCoordinateKey(target.y),
    exactCoordinateKey(targetHeightMeters),
    revisions.terrain,
    revisions.height,
    revisions.forest,
    revisions.objects,
    getEnvironmentProfileDomainKey(getActiveEnvironmentProfile(), 'visibility'),
  ].join(':');
}

function consumePointProbeBudget(state: SimulationState): boolean {
  const runtime = getPreparationRuntime(state);
  if (runtime.preparationsThisStep >= MAX_PERCEPTION_POINT_PROBES_PER_SIMULATION_STEP) {
    runtime.deferredCount += 1;
    return false;
  }
  runtime.preparationsThisStep += 1;
  runtime.preparationCount += 1;
  runtime.maxPreparationsPerStep = Math.max(runtime.maxPreparationsPerStep, runtime.preparationsThisStep);
  return true;
}

function getPreparationRuntime(state: SimulationState): PerceptionGeometryPreparationRuntime {
  let runtime = perceptionGeometryPreparationByState.get(state);
  if (!runtime) {
    runtime = {
      simulationStep: state.simulationStep,
      simulationTimeSeconds: state.simulationTimeSeconds,
      preparationsThisStep: 0,
      preparationCount: 0,
      cacheHitCount: 0,
      deferredCount: 0,
      maxPreparationsPerStep: 0,
      pointTargetProbeCount: 0,
      pointPhysicalRayCount: 0,
    };
    perceptionGeometryPreparationByState.set(state, runtime);
  }
  if (
    runtime.simulationStep !== state.simulationStep
    || runtime.simulationTimeSeconds !== state.simulationTimeSeconds
  ) {
    runtime.simulationStep = state.simulationStep;
    runtime.simulationTimeSeconds = state.simulationTimeSeconds;
    runtime.preparationsThisStep = 0;
  }
  return runtime;
}

function getPerceptionPointCache(state: SimulationState): Map<string, PerceptionPointCacheEntry> {
  let cache = perceptionPointCacheByState.get(state);
  if (!cache) {
    cache = new Map();
    perceptionPointCacheByState.set(state, cache);
  }
  return cache;
}

function targetProbeToCompatibilityLineOfSight(
  probe: VisibilityTargetProbeResult,
): LineOfSightProbeResult {
  const representativeTrace = probe.blocked
    ? probe.samples[probe.samples.length - 1]!.trace
    : probe.samples.find((sample) => !sample.trace.hardBlocked)?.trace ?? probe.samples[0]!.trace;
  const vegetationMeters = probe.samples[0]?.trace.accumulatedVegetationMeters ?? 0;
  const partialObscuration = probe.visibleFraction < 1 || probe.visualTransmission < 0.995;
  return {
    origin: probe.origin,
    target: probe.target,
    totalDistanceMeters: representativeTrace.totalDistanceMeters,
    visibleDistanceMeters: representativeTrace.blockerDistanceMeters ?? representativeTrace.totalDistanceMeters,
    blocked: probe.blocked,
    blockedAt: probe.blocked ? representativeTrace.blockerPosition : null,
    blockerReasonRu: probe.blocked
      ? representativeTrace.reasonRu
      : partialObscuration
        ? 'цель видна только частично'
        : 'прямая видимость есть',
    visualTransmission: probe.visualTransmission,
    partialObscuration,
    accumulatedForestMeters: vegetationMeters,
    obscurationReasonRu: vegetationMeters > 0
      ? `Растительность: пройдено около ${Math.round(vegetationMeters)} м; видно ${Math.round(probe.visibleFraction * 100)}% силуэта.`
      : `Видно ${Math.round(probe.visibleFraction * 100)}% силуэта.`,
  };
}

function exactCoordinateKey(value: number): string {
  return Number.isFinite(value) ? Number(value).toPrecision(15) : 'invalid';
}

function touch<T>(cache: Map<string, T>, key: string, value: T): void {
  cache.delete(key);
  cache.set(key, value);
}

function trim<T>(cache: Map<string, T>, maximum: number): void {
  while (cache.size > maximum) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function format(value: number): string {
  return value.toFixed(2).replace('.', ',');
}
