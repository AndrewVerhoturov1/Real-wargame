import { measurePerformancePhase } from '../debug/PerformancePhases';
import { distance, type GridPosition } from '../geometry';
import { getMapRevisionSnapshot } from '../map/MapRuntimeState';
import type { AttentionSample } from '../perception/AttentionModel';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';
import { computeLineOfSight, type LineOfSightProbeResult } from './LineOfSight';
import {
  evaluateCellVisibilityQuality,
  observerVisibilityCondition,
  type CellVisibilityQuality,
} from './VisibilityQuality';

const MAX_PERCEPTION_POINT_PROBES_PER_SIMULATION_STEP = 2;
const MAX_PERCEPTION_POINT_CACHE_ENTRIES = 512;
const POINT_POSITION_QUANTUM_CELLS = 0.05;

interface PerceptionPointCacheEntry {
  readonly result: LineOfSightProbeResult;
}

interface PerceptionGeometryPreparationRuntime {
  simulationStep: number;
  simulationTimeSeconds: number;
  preparationsThisStep: number;
  preparationCount: number;
  cacheHitCount: number;
  deferredCount: number;
  maxPreparationsPerStep: number;
}

const perceptionPointCacheByState = new WeakMap<
  SimulationState,
  Map<string, PerceptionPointCacheEntry>
>();
const perceptionGeometryPreparationByState = new WeakMap<SimulationState, PerceptionGeometryPreparationRuntime>();

export interface PointVisibilityResult {
  lineOfSight: LineOfSightProbeResult;
  quality: CellVisibilityQuality;
  distanceMeters: number;
  explanationRu: string[];
}

/**
 * Compatibility name retained for report/smoke consumers. The runtime now
 * prepares bounded point probes instead of full 64,000-cell geometry fields.
 */
export interface PerceptionGeometryPreparationDiagnostics {
  readonly preparationCount: number;
  readonly cacheHitCount: number;
  readonly deferredCount: number;
  readonly preparationsThisStep: number;
  readonly maxPreparationsPerStep: number;
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

  const lineOfSight = getPerceptionPointProbe(
    state,
    observer,
    target,
    targetHeightMeters,
  );
  if (!lineOfSight) return null;

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
  } : {
    preparationCount: 0,
    cacheHitCount: 0,
    deferredCount: 0,
    preparationsThisStep: 0,
    maxPreparationsPerStep: 0,
  };
}

export function clearPerceptionPointVisibilityCache(state: SimulationState): void {
  perceptionPointCacheByState.delete(state);
  perceptionGeometryPreparationByState.delete(state);
}

function getPerceptionPointProbe(
  state: SimulationState,
  observer: UnitModel,
  target: GridPosition,
  targetHeightMeters: number,
): LineOfSightProbeResult | null {
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
    () => computeLineOfSight(state.map, observer, target, targetHeightMeters),
  );
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
    observer.id,
    observer.behaviorRuntime.posture,
    quantize(observer.position.x, POINT_POSITION_QUANTUM_CELLS),
    quantize(observer.position.y, POINT_POSITION_QUANTUM_CELLS),
    quantize(target.x, POINT_POSITION_QUANTUM_CELLS),
    quantize(target.y, POINT_POSITION_QUANTUM_CELLS),
    quantize(targetHeightMeters, 0.05),
    revisions.terrain,
    revisions.height,
    revisions.forest,
    revisions.objects,
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

function quantize(value: number, step: number): string {
  return (Math.round(value / step) * step).toFixed(3);
}

function format(value: number): string {
  return value.toFixed(2).replace('.', ',');
}
