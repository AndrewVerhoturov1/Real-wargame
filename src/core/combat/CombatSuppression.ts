import { clampPercent, POSTURE_EXPOSURE_MULTIPLIER } from '../behavior/BehaviorModel';
import { evaluateSmallArmsCover } from '../cover/SmallArmsCoverEvaluation';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';
import { isUnitCombatCapable } from './CombatDamage';
import { recordCombatThreatEvidence, type CombatThreatEvidenceKind } from './CombatThreatEvidence';
import { queryUnitsNearBallisticSegment } from './CombatUnitSpatialIndex';

export interface BallisticCombatEffectInput {
  readonly shotId: string;
  readonly shooterId: string;
  readonly origin: { xMetres: number; yMetres: number; zMetres: number };
  readonly direction: { x: number; y: number; z: number };
  readonly travelledMetres: number;
  readonly impactPoint: { xMetres: number; yMetres: number; zMetres: number };
  readonly hitType: 'none' | 'terrain' | 'object' | 'unit';
  readonly hitUnitId?: string;
  readonly hitObjectId?: string;
  readonly muzzleVelocityMetresPerSecond: number;
}

export interface CombatSuppressionSnapshot {
  readonly suppression: number;
  readonly recentShotCount: number;
  readonly lastEffectSeconds: number;
}

interface CombatSuppressionRuntime {
  suppression: number;
  lastUpdatedSeconds: number;
  lastEffectSeconds: number;
  recentShotTimes: number[];
}

const NEAR_MISS_RADIUS_METRES = 6;
const NEAR_IMPACT_RADIUS_METRES = 10;
const RECENT_SHOT_WINDOW_SECONDS = 4;
const MAX_RECENT_SHOTS = 16;
const SUPPRESSION_DECAY_PER_SECOND = 13;
const runtimeByUnit = new WeakMap<UnitModel, CombatSuppressionRuntime>();

export function applyBallisticCombatEffects(state: SimulationState, input: BallisticCombatEffectInput): void {
  const metresPerCell = Math.max(0.001, state.map.metersPerCell);
  const startGrid = {
    x: input.origin.xMetres / metresPerCell,
    y: input.origin.yMetres / metresPerCell,
  };
  const endGrid = {
    x: input.impactPoint.xMetres / metresPerCell,
    y: input.impactPoint.yMetres / metresPerCell,
  };
  const candidates = queryUnitsNearBallisticSegment(
    state,
    startGrid,
    endGrid,
    Math.max(NEAR_MISS_RADIUS_METRES, NEAR_IMPACT_RADIUS_METRES),
  );
  const directionLength = Math.max(0.000001, Math.hypot(input.direction.x, input.direction.y));
  const directionX = input.direction.x / directionLength;
  const directionY = input.direction.y / directionLength;

  for (const unit of candidates) {
    if (unit.id === input.shooterId || !isUnitCombatCapable(unit)) continue;
    const unitMetres = {
      x: unit.position.x * metresPerCell,
      y: unit.position.y * metresPerCell,
    };
    const segment = distanceToSegmentMetres(
      unitMetres,
      { x: input.origin.xMetres, y: input.origin.yMetres },
      { x: input.impactPoint.xMetres, y: input.impactPoint.yMetres },
    );
    const impactDistance = Math.hypot(
      unitMetres.x - input.impactPoint.xMetres,
      unitMetres.y - input.impactPoint.yMetres,
    );
    const directHit = input.hitType === 'unit' && input.hitUnitId === unit.id;
    const nearMissFactor = segment.t > 0.015 && segment.t < 0.999
      ? clamp01(1 - segment.distance / NEAR_MISS_RADIUS_METRES)
      : 0;
    const nearImpactFactor = clamp01(1 - impactDistance / NEAR_IMPACT_RADIUS_METRES);
    if (!directHit && nearMissFactor <= 0 && nearImpactFactor <= 0) continue;

    const runtime = getRuntime(unit, state.simulationTimeSeconds);
    pruneRecentShots(runtime, state.simulationTimeSeconds);
    const accumulationFactor = 1 + Math.min(0.75, runtime.recentShotTimes.length * 0.12);
    const weaponFactor = clamp(input.muzzleVelocityMetresPerSecond / 865, 0.55, 1.5);
    const postureFactor = 0.55 + POSTURE_EXPOSURE_MULTIPLIER[unit.behaviorRuntime.posture] * 0.45;
    const resilienceFactor = clamp(1.12 - unit.soldier.traits.resilience / 260, 0.68, 1.08);
    const cover = evaluateSmallArmsCover(state.map, startGrid, unit.position, unit.behaviorRuntime.posture);
    let coverFactor = 1 - cover.expectedProtection / 100 * 0.82;
    if (input.hitType === 'object' && nearImpactFactor > 0) coverFactor *= 0.82;
    if (input.hitType === 'terrain' && nearImpactFactor > 0) coverFactor *= 0.9;
    coverFactor = clamp(coverFactor, 0.12, 1);

    const directSuppression = directHit ? 74 : 0;
    const missSuppression = nearMissFactor * 42;
    const impactSuppression = nearImpactFactor * (input.hitType === 'unit' ? 36 : input.hitType === 'object' ? 30 : 25);
    const rawSuppression = Math.max(directSuppression, missSuppression, impactSuppression);
    const suppression = rawSuppression * weaponFactor * postureFactor * resilienceFactor * coverFactor * accumulationFactor;
    if (suppression < 0.75) continue;

    runtime.suppression = clampPercent(runtime.suppression + suppression);
    runtime.lastUpdatedSeconds = state.simulationTimeSeconds;
    runtime.lastEffectSeconds = state.simulationTimeSeconds;
    runtime.recentShotTimes.push(state.simulationTimeSeconds);
    if (runtime.recentShotTimes.length > MAX_RECENT_SHOTS) {
      runtime.recentShotTimes.splice(0, runtime.recentShotTimes.length - MAX_RECENT_SHOTS);
    }
    unit.behaviorRuntime.suppression = Math.max(unit.behaviorRuntime.suppression, runtime.suppression);

    const stress = suppression * (directHit ? 0.48 : 0.30) * clamp(1.18 - unit.soldier.traits.resilience / 220, 0.65, 1.12);
    unit.behaviorRuntime.stress = clampPercent(unit.behaviorRuntime.stress + stress);
    unit.behaviorRuntime.lastEvent = directHit ? `combat_hit:${input.shotId}` : `combat_fire_pressure:${input.shotId}`;
    unit.behaviorRuntime.reason = directHit
      ? 'Прямое попадание вызвало сильное подавление.'
      : nearMissFactor >= nearImpactFactor
        ? 'Пуля прошла рядом и вызвала подавление.'
        : 'Попадание рядом вызвало подавление.';

    const kind: CombatThreatEvidenceKind = directHit
      ? 'wounded'
      : nearMissFactor >= nearImpactFactor
        ? 'near_miss'
        : 'impact';
    const uncertaintyMetres = kind === 'wounded' ? 10 : kind === 'near_miss' ? 16 : 26;
    const estimatedSourcePosition = estimateSourcePosition(
      state,
      unit,
      input.shotId,
      directionX,
      directionY,
      uncertaintyMetres,
      kind,
    );
    const baseConfidence = kind === 'wounded' ? 58 : kind === 'near_miss' ? 44 : 31;
    const confidence = clamp(baseConfidence + Math.min(20, suppression * 0.22), 8, 82);
    const estimatedRangeMetres = kind === 'near_miss'
      ? Math.max(35, Math.min(120, input.travelledMetres * 0.8))
      : kind === 'wounded'
        ? Math.max(25, Math.min(90, input.travelledMetres * 0.65))
        : Math.max(45, Math.min(140, input.travelledMetres));

    recordCombatThreatEvidence(unit, {
      id: `${input.shotId}:${unit.id}:${kind}`,
      kind,
      sourceUnitId: input.shooterId,
      estimatedSourcePosition,
      directionDegrees: normalizeDegrees(Math.atan2(directionY, directionX) * 180 / Math.PI),
      confidence,
      uncertaintyCells: uncertaintyMetres / metresPerCell,
      strength: clamp(42 + suppression * 0.65, 20, 88),
      suppression: clamp(30 + suppression * 0.85, 15, 96),
      stressPerSecond: clamp(stress * 0.28, 1, 18),
      rangeCells: estimatedRangeMetres / metresPerCell,
      arcDegrees: kind === 'near_miss' ? 58 : kind === 'wounded' ? 48 : 92,
      createdSeconds: state.simulationTimeSeconds,
      lastUpdatedSeconds: state.simulationTimeSeconds,
      evidenceCount: 1,
    });
  }
}

export function getCombatSuppressionSnapshot(unit: UnitModel, nowSeconds: number): CombatSuppressionSnapshot {
  const runtime = runtimeByUnit.get(unit);
  if (!runtime) return { suppression: 0, recentShotCount: 0, lastEffectSeconds: -1 };
  decayRuntime(runtime, nowSeconds);
  pruneRecentShots(runtime, nowSeconds);
  if (runtime.suppression <= 0 && runtime.recentShotTimes.length === 0) runtimeByUnit.delete(unit);
  return {
    suppression: runtime.suppression,
    recentShotCount: runtime.recentShotTimes.length,
    lastEffectSeconds: runtime.lastEffectSeconds,
  };
}

export function clearCombatSuppression(unit: UnitModel): void {
  runtimeByUnit.delete(unit);
}

function getRuntime(unit: UnitModel, nowSeconds: number): CombatSuppressionRuntime {
  let runtime = runtimeByUnit.get(unit);
  if (!runtime) {
    runtime = {
      suppression: 0,
      lastUpdatedSeconds: nowSeconds,
      lastEffectSeconds: -1,
      recentShotTimes: [],
    };
    runtimeByUnit.set(unit, runtime);
  } else {
    decayRuntime(runtime, nowSeconds);
  }
  return runtime;
}

function decayRuntime(runtime: CombatSuppressionRuntime, nowSeconds: number): void {
  const elapsed = Math.max(0, nowSeconds - runtime.lastUpdatedSeconds);
  if (elapsed <= 0) return;
  runtime.suppression = Math.max(0, runtime.suppression - SUPPRESSION_DECAY_PER_SECOND * elapsed);
  runtime.lastUpdatedSeconds = nowSeconds;
}

function pruneRecentShots(runtime: CombatSuppressionRuntime, nowSeconds: number): void {
  runtime.recentShotTimes = runtime.recentShotTimes.filter((time) => nowSeconds - time <= RECENT_SHOT_WINDOW_SECONDS);
}

function estimateSourcePosition(
  state: SimulationState,
  unit: UnitModel,
  shotId: string,
  directionX: number,
  directionY: number,
  uncertaintyMetres: number,
  kind: CombatThreatEvidenceKind,
): { x: number; y: number } {
  const metresPerCell = Math.max(0.001, state.map.metersPerCell);
  const seed = hashString(`${unit.id}:${shotId}:${kind}`);
  const side = ((seed % 2001) / 1000 - 1) * uncertaintyMetres * 0.48;
  const radial = (((Math.floor(seed / 2001) % 2001) / 1000) - 1) * uncertaintyMetres * 0.30;
  const baseDistance = kind === 'wounded' ? 28 : kind === 'near_miss' ? 46 : 62;
  const distanceCells = Math.max(8, baseDistance + radial) / metresPerCell;
  const sideCells = side / metresPerCell;
  const sourceDirectionX = -directionX;
  const sourceDirectionY = -directionY;
  const perpendicularX = -sourceDirectionY;
  const perpendicularY = sourceDirectionX;
  return {
    x: clamp(unit.position.x + sourceDirectionX * distanceCells + perpendicularX * sideCells, 0.5, state.map.width - 0.5),
    y: clamp(unit.position.y + sourceDirectionY * distanceCells + perpendicularY * sideCells, 0.5, state.map.height - 0.5),
  };
}

function distanceToSegmentMetres(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
): { distance: number; t: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0.000001) return { distance: Math.hypot(point.x - start.x, point.y - start.y), t: 0 };
  const rawT = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  const t = clamp(rawT, 0, 1);
  return {
    distance: Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t)),
    t,
  };
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeDegrees(value: number): number {
  const result = value % 360;
  return result < 0 ? result + 360 : result;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
