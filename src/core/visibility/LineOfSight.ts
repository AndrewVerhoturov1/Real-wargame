import type { GridPosition } from '../geometry';
import type { TacticalMap } from '../map/MapModel';
import type { UnitModel } from '../units/UnitModel';
import { traceVisibilityRay } from './VisibilityRayKernel';
import { soldierPostureHeightMeters } from './VisibilityPosture';

export interface LineOfSightProbeResult {
  origin: GridPosition;
  target: GridPosition;
  totalDistanceMeters: number;
  visibleDistanceMeters: number;
  blocked: boolean;
  blockedAt: GridPosition | null;
  blockerReasonRu: string;
  visualTransmission: number;
  partialObscuration: boolean;
  accumulatedForestMeters: number;
  obscurationReasonRu: string;
}

/**
 * Compatibility facade retained for probes, reports and older smoke tests.
 * All physical visibility math lives in VisibilityRayKernel.
 */
export function computeLineOfSight(
  map: TacticalMap,
  unit: UnitModel,
  target: GridPosition,
  targetHeightMeters = 1.4,
): LineOfSightProbeResult {
  const trace = traceVisibilityRay(map, {
    origin: unit.position,
    target,
    originHeightAboveGroundMeters: soldierPostureHeightMeters(unit.behaviorRuntime.posture),
    targetHeightAboveGroundMeters: targetHeightMeters,
    channel: 'visual',
  });
  return {
    origin: trace.origin,
    target: trace.target,
    totalDistanceMeters: trace.totalDistanceMeters,
    visibleDistanceMeters: trace.blockerDistanceMeters ?? trace.totalDistanceMeters,
    blocked: trace.hardBlocked,
    blockedAt: trace.blockerPosition,
    blockerReasonRu: trace.reasonRu,
    visualTransmission: trace.visualTransmission,
    partialObscuration: trace.visualTransmission < 0.995,
    accumulatedForestMeters: trace.accumulatedVegetationMeters,
    obscurationReasonRu: trace.accumulatedVegetationMeters > 0
      ? `Растительность: пройдено около ${Math.round(trace.accumulatedVegetationMeters)} м.`
      : 'Препятствий растительностью нет',
  };
}
