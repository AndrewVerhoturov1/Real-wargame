import type { UnitModel } from '../units/UnitModel';
import {
  buildCanonicalWorldThreatSet,
  type CanonicalWorldThreatSetSnapshot,
} from './CanonicalWorldThreat';

/**
 * Builds the world-raster threat snapshot and its content key from one canonical
 * representation. Unit contacts are converted from observer-relative memory
 * descriptors to world-space point sources; evidence-authored directional fire
 * retains its authored direction, arc and range.
 */
export function buildPositionIndependentAwarenessKnowledgeSnapshot(
  unit: UnitModel,
  metersPerCell: number,
): CanonicalWorldThreatSetSnapshot {
  return buildCanonicalWorldThreatSet(unit.tacticalKnowledge.threats, metersPerCell);
}

/**
 * Compatibility key helper. Production renderer code should build the snapshot
 * once and pass the same snapshot to both the world key and worker payload.
 */
export function buildPositionIndependentAwarenessKnowledgeKey(
  unit: UnitModel,
  metersPerCell = 1,
): string {
  return buildPositionIndependentAwarenessKnowledgeSnapshot(unit, metersPerCell).key;
}
