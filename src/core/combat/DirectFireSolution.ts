import type { UnitPosture } from '../behavior/BehaviorModel';
import type { GridPosition } from '../geometry';
import { getMapRevisionSnapshot } from '../map/MapRuntimeState';
import type { SimulationState } from '../simulation/SimulationState';
import { sampleSmoothHeightLevel } from '../terrain/SmoothTerrain';
import type { UnitModel } from '../units/UnitModel';
import { soldierPostureHeightMeters } from '../visibility/VisibilityPosture';
import { probeTargetVisibility } from '../visibility/VisibilityTargetProbe';
import {
  createBallisticLineProbeContext,
  probeBallisticLine,
  type BallisticLineBlocker,
  type BallisticLineProbeResult,
} from './BallisticLineProbe';
import type { BallisticPoint3 } from './UnitHitShapes';

const RIFLE_BORE_BELOW_EYE_METRES = 0.07;
const directFireCacheByState = new WeakMap<SimulationState, Map<string, DirectFireResolution>>();

export interface DirectFireTargetGeometry {
  readonly targetUnit: UnitModel;
  readonly aimGridPosition: GridPosition;
  readonly preferredAimHeightMetres: number;
}

export interface DirectFireSolution {
  readonly aimHeightMetres: number;
  readonly aimPoint: BallisticPoint3;
  readonly line: BallisticLineProbeResult;
}

export interface DirectFireResolution {
  readonly solution: DirectFireSolution | null;
  readonly blockedBy: BallisticLineBlocker;
  readonly obstructionId: string | null;
  readonly visibleAimHeightMetres: readonly number[];
}

/** Bore height for a shouldered rifle: close to, but slightly below, the eye/sight line. */
export function getShoulderedRifleMuzzleHeightMetres(posture: UnitPosture): number {
  return Math.max(0.05, soldierPostureHeightMeters(posture) - RIFLE_BORE_BELOW_EYE_METRES);
}

/**
 * Resolves a currently visible and physically clear point on the target silhouette.
 * The result is deterministic and cached until relevant geometry changes.
 */
export function resolveDirectFireSolution(
  state: SimulationState,
  shooter: UnitModel,
  target: DirectFireTargetGeometry,
  maximumDistanceMetres: number,
): DirectFireResolution {
  const key = buildCacheKey(state, shooter, target, maximumDistanceMetres);
  const cache = getCache(state);
  const cached = cache.get(key);
  if (cached) return cached;

  const targetHeightMetres = soldierPostureHeightMeters(target.targetUnit.behaviorRuntime.posture);
  const visibility = probeTargetVisibility(
    state.map,
    shooter,
    target.aimGridPosition,
    targetHeightMetres,
  );
  const visibleSamples = visibility.samples
    .filter((sample) => !sample.trace.hardBlocked)
    .sort((left, right) => (
      Math.abs(left.heightMeters - target.preferredAimHeightMetres)
      - Math.abs(right.heightMeters - target.preferredAimHeightMetres)
      || right.heightMeters - left.heightMeters
    ));
  const visibleAimHeightMetres = visibleSamples.map((sample) => sample.heightMeters);
  const origin = buildMuzzlePointTowardTarget(state, shooter, target.aimGridPosition);
  const context = createBallisticLineProbeContext(state);
  const ignoredUnitIds = state.units.map((unit) => unit.id);
  let firstBlockedLine: BallisticLineProbeResult | null = null;

  for (const sample of visibleSamples) {
    const aimPoint = buildAimPoint(state, target.aimGridPosition, sample.heightMeters);
    const line = probeBallisticLine(context, {
      origin,
      target: aimPoint,
      shooterId: shooter.id,
      // Moving units are handled by FireAction's last-moment friendly-fire corridor check.
      // Keeping them out of this cached result prevents stale unit blockers.
      ignoreUnitIds: ignoredUnitIds,
      maximumDistanceMetres,
    });
    if (line.clear) {
      return store(cache, key, {
        solution: {
          aimHeightMetres: sample.heightMeters,
          aimPoint,
          line,
        },
        blockedBy: null,
        obstructionId: null,
        visibleAimHeightMetres,
      });
    }
    firstBlockedLine ??= line;
  }

  return store(cache, key, {
    solution: null,
    blockedBy: firstBlockedLine?.blockedBy ?? null,
    obstructionId: firstBlockedLine?.obstructionId ?? null,
    visibleAimHeightMetres,
  });
}

function buildMuzzlePointTowardTarget(
  state: SimulationState,
  shooter: UnitModel,
  targetPosition: GridPosition,
): BallisticPoint3 {
  const dx = targetPosition.x - shooter.position.x;
  const dy = targetPosition.y - shooter.position.y;
  const length = Math.max(0.0001, Math.hypot(dx, dy));
  const forwardOffsetMetres = shooter.behaviorRuntime.posture === 'prone' ? 0.7 : 0.35;
  const ground = sampleSmoothHeightLevel(state.map, shooter.position.x, shooter.position.y) * 2;
  return {
    xMetres: shooter.position.x * state.map.metersPerCell + (dx / length) * forwardOffsetMetres,
    yMetres: shooter.position.y * state.map.metersPerCell + (dy / length) * forwardOffsetMetres,
    zMetres: ground + getShoulderedRifleMuzzleHeightMetres(shooter.behaviorRuntime.posture),
  };
}

function buildAimPoint(
  state: SimulationState,
  position: GridPosition,
  heightMetres: number,
): BallisticPoint3 {
  const ground = sampleSmoothHeightLevel(state.map, position.x, position.y) * 2;
  return {
    xMetres: position.x * state.map.metersPerCell,
    yMetres: position.y * state.map.metersPerCell,
    zMetres: ground + heightMetres,
  };
}

function buildCacheKey(
  state: SimulationState,
  shooter: UnitModel,
  target: DirectFireTargetGeometry,
  maximumDistanceMetres: number,
): string {
  const revisions = getMapRevisionSnapshot(state.map);
  return [
    shooter.id,
    target.targetUnit.id,
    shooter.behaviorRuntime.posture,
    target.targetUnit.behaviorRuntime.posture,
    exact(shooter.position.x),
    exact(shooter.position.y),
    exact(target.aimGridPosition.x),
    exact(target.aimGridPosition.y),
    exact(target.preferredAimHeightMetres),
    exact(maximumDistanceMetres),
    exact(state.map.metersPerCell),
    revisions.terrain,
    revisions.height,
    revisions.forest,
    revisions.objects,
  ].join(':');
}

function getCache(state: SimulationState): Map<string, DirectFireResolution> {
  let cache = directFireCacheByState.get(state);
  if (!cache) {
    cache = new Map();
    directFireCacheByState.set(state, cache);
  }
  return cache;
}

function store(
  cache: Map<string, DirectFireResolution>,
  key: string,
  resolution: DirectFireResolution,
): DirectFireResolution {
  cache.set(key, resolution);
  while (cache.size > 256) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return resolution;
}

function exact(value: number): string {
  return Number.isFinite(value) ? Number(value).toPrecision(15) : 'invalid';
}
