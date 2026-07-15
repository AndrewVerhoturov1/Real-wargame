import type { UnitModel } from '../units/UnitModel';

const POSITION_BUCKET_CELLS = 0.05;
const SIZE_BUCKET_CELLS = 0.1;
const ANGLE_BUCKET_DEGREES = 1;
const VALUE_BUCKET = 1;
const CONFIDENCE_BUCKET = 10;
const UNCERTAINTY_BUCKET_CELLS = 1;
const OBSERVER_RELATIVE_UNIT_PREFIX = 'unit:';

/**
 * Builds the content key for the world danger raster.
 *
 * A visible unit threat's direction/range are observer-relative memory descriptors:
 * SoldierThreatMemory refreshes them from the observer position even while the
 * subjective source remains stationary. They therefore cannot invalidate a
 * position-independent world raster. The source position and all actual danger
 * amplitude/uncertainty inputs remain part of the key, so moving-threat and
 * tactical evidence updates still schedule a new worker result. Visibility remains
 * an explicit input: losing a real contact is legitimate knowledge invalidation,
 * not an own-position raster update. Movement acceptance starts only after the
 * initial final-exact worker refresh has been applied, so baseline work is not
 * misclassified as movement-triggered work.
 *
 * Pressure-zone and unknown-fire directions are evidence-authored world geometry,
 * so their direction/range remain explicit key inputs.
 */
export function buildPositionIndependentAwarenessKnowledgeKey(unit: UnitModel): string {
  return unit.tacticalKnowledge.threats.map((threat) => {
    const observerRelativeUnitThreat = threat.id.startsWith(OBSERVER_RELATIVE_UNIT_PREFIX);
    return [
      threat.id,
      threat.mode,
      quantize(threat.x, POSITION_BUCKET_CELLS),
      quantize(threat.y, POSITION_BUCKET_CELLS),
      quantize(threat.radiusCells, SIZE_BUCKET_CELLS),
      quantize(threat.widthCells, SIZE_BUCKET_CELLS),
      quantize(threat.heightCells, SIZE_BUCKET_CELLS),
      quantize(threat.rotationDegrees, ANGLE_BUCKET_DEGREES),
      quantize(threat.strength, VALUE_BUCKET),
      quantize(threat.suppression, VALUE_BUCKET),
      observerRelativeUnitThreat ? 'observer-direction' : quantize(threat.directionDegrees, ANGLE_BUCKET_DEGREES),
      quantize(threat.arcDegrees, ANGLE_BUCKET_DEGREES),
      observerRelativeUnitThreat ? 'observer-range' : quantize(threat.rangeCells, SIZE_BUCKET_CELLS),
      quantize(threat.minRangeCells, SIZE_BUCKET_CELLS),
      quantize(threat.falloffPercent, VALUE_BUCKET),
      quantize(threat.confidence, CONFIDENCE_BUCKET),
      quantize(threat.uncertaintyCells, UNCERTAINTY_BUCKET_CELLS),
      threat.source,
      threat.visibleNow ? '1' : '0',
    ].join(':');
  }).join('|');
}

function quantize(value: number, bucket: number): number {
  return Math.round(value / bucket) * bucket;
}
