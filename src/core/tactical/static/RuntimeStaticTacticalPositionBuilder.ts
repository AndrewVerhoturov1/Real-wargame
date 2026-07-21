import type { TacticalMap } from '../../map/MapModel';
import { buildHighQualityStaticTacticalPositionBasis } from './HighQualityStaticTacticalPositionBuilder';
import {
  buildStaticTacticalPositionBasis,
  type StaticTacticalPositionBuildResult,
} from './StaticTacticalPositionBuilder';
import type { StaticTacticalPositionBasisIdentity } from './StaticTacticalPositionIdentity';
import type { StaticTacticalPositionSettings } from './StaticTacticalPositionSettings';

/**
 * The full quality pass traces many angular rays for every cell, posture and
 * sector. It is appropriate for small test/editor maps but is deliberately
 * bounded for live scenarios so the background worker cannot monopolize CPU
 * and starve route-cost or awareness workers.
 */
export const HIGH_QUALITY_STATIC_TACTICAL_CELL_LIMIT = 4096;

export function shouldUseHighQualityStaticTacticalPositionBasis(
  width: number,
  height: number,
): boolean {
  return width > 0
    && height > 0
    && width * height <= HIGH_QUALITY_STATIC_TACTICAL_CELL_LIMIT;
}

export function buildRuntimeStaticTacticalPositionBasis(
  map: TacticalMap,
  identity: StaticTacticalPositionBasisIdentity,
  settings: StaticTacticalPositionSettings,
): StaticTacticalPositionBuildResult {
  if (shouldUseHighQualityStaticTacticalPositionBasis(map.width, map.height)) {
    return buildHighQualityStaticTacticalPositionBasis(map, identity, settings);
  }
  return buildStaticTacticalPositionBasis(map, identity, settings);
}
