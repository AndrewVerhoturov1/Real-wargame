import type { KnownThreatMemory } from '../units/UnitModel';

const UNIT_THREAT_PREFIX = 'unit:';
const UNIT_CONTACT_RANGE_METERS = 250;
const POSITION_BUCKET_CELLS = 0.05;
const SIZE_BUCKET_CELLS = 0.1;
const ANGLE_BUCKET_DEGREES = 1;
const VALUE_BUCKET = 1;
const CONFIDENCE_BUCKET = 10;
const UNCERTAINTY_BUCKET_CELLS = 1;

export type CanonicalWorldThreatSemantic = 'unit_contact' | 'directional_evidence' | 'area_evidence';

/**
 * Immutable world-space input used by the danger raster key, worker payload and
 * full-field computation. Observer-relative contact descriptors never cross this boundary.
 */
export interface CanonicalWorldThreatSnapshot extends KnownThreatMemory {
  readonly worldSemantic: CanonicalWorldThreatSemantic;
}

export interface CanonicalWorldThreatSetSnapshot {
  readonly key: string;
  readonly threats: readonly CanonicalWorldThreatSnapshot[];
}

export function buildCanonicalWorldThreatSet(
  threats: readonly KnownThreatMemory[],
  metersPerCell: number,
): CanonicalWorldThreatSetSnapshot {
  const canonical = threats.map((threat) => canonicalizeWorldThreat(threat, metersPerCell));
  return {
    key: buildCanonicalWorldThreatKey(canonical),
    threats: canonical,
  };
}

export function buildCanonicalWorldThreatKey(
  threats: readonly CanonicalWorldThreatSnapshot[],
): string {
  return threats.map((threat) => [
    threat.worldSemantic,
    threat.id,
    threat.mode,
    threat.x,
    threat.y,
    threat.radiusCells,
    threat.widthCells,
    threat.heightCells,
    threat.rotationDegrees,
    threat.strength,
    threat.suppression,
    threat.directionDegrees,
    threat.arcDegrees,
    threat.rangeCells,
    threat.minRangeCells,
    threat.falloffPercent,
    threat.confidence,
    threat.uncertaintyCells,
    threat.source,
    threat.visibleNow ? '1' : '0',
  ].join(':')).join('|');
}

export function canonicalizeWorldThreat(
  threat: KnownThreatMemory,
  metersPerCell: number,
): CanonicalWorldThreatSnapshot {
  const unitContact = threat.id.startsWith(UNIT_THREAT_PREFIX);
  const directionalEvidence = !unitContact && threat.mode === 'directional_fire';
  const semantic: CanonicalWorldThreatSemantic = unitContact
    ? 'unit_contact'
    : directionalEvidence
      ? 'directional_evidence'
      : 'area_evidence';
  const safeMetersPerCell = Math.max(0.001, finite(metersPerCell));

  return {
    ...threat,
    worldSemantic: semantic,
    x: quantize(threat.x, POSITION_BUCKET_CELLS),
    y: quantize(threat.y, POSITION_BUCKET_CELLS),
    radiusCells: quantize(threat.radiusCells, SIZE_BUCKET_CELLS),
    widthCells: quantize(threat.widthCells, SIZE_BUCKET_CELLS),
    heightCells: quantize(threat.heightCells, SIZE_BUCKET_CELLS),
    rotationDegrees: quantize(normalizeDegrees(threat.rotationDegrees), ANGLE_BUCKET_DEGREES),
    strength: quantize(clampPercent(threat.strength), VALUE_BUCKET),
    suppression: quantize(clampPercent(threat.suppression), VALUE_BUCKET),
    directionDegrees: unitContact
      ? 0
      : quantize(normalizeDegrees(threat.directionDegrees), ANGLE_BUCKET_DEGREES),
    arcDegrees: unitContact
      ? 360
      : quantize(clamp(threat.arcDegrees, 1, 360), ANGLE_BUCKET_DEGREES),
    rangeCells: unitContact
      ? quantize(UNIT_CONTACT_RANGE_METERS / safeMetersPerCell, SIZE_BUCKET_CELLS)
      : quantize(Math.max(0.5, finite(threat.rangeCells)), SIZE_BUCKET_CELLS),
    minRangeCells: unitContact
      ? 0
      : quantize(Math.max(0, finite(threat.minRangeCells)), SIZE_BUCKET_CELLS),
    falloffPercent: quantize(clampPercent(threat.falloffPercent), VALUE_BUCKET),
    confidence: quantize(clampPercent(threat.confidence), CONFIDENCE_BUCKET),
    uncertaintyCells: quantize(Math.max(0, finite(threat.uncertaintyCells)), UNCERTAINTY_BUCKET_CELLS),
  };
}

export function cloneCanonicalWorldThreat(
  threat: CanonicalWorldThreatSnapshot,
): CanonicalWorldThreatSnapshot {
  return { ...threat };
}

function quantize(value: number, bucket: number): number {
  return Math.round(finite(value) / bucket) * bucket;
}

function normalizeDegrees(value: number): number {
  const normalized = finite(value) % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function clampPercent(value: number): number {
  return clamp(value, 0, 100);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, finite(value)));
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
