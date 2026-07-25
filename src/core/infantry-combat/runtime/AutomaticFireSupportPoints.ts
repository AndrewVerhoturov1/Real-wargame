import type { BallisticPoint3 } from '../../combat/UnitHitShapes';

export const SUPPRESSION_GOLDEN_ANGLE_RADIANS = Math.PI * (3 - Math.sqrt(5));
const FULL_ROTATION_RADIANS = Math.PI * 2;

export function getSuppressionSupportPoint(
  taskId: string,
  shotOrdinal: number,
  plannedRoundCount: number,
  center: BallisticPoint3,
  radiusMetres: number,
): BallisticPoint3 {
  const planned = integer(plannedRoundCount, 1, 1, 64);
  const ordinal = integer(shotOrdinal, 0, 0, planned - 1);
  const radius = Math.max(0, finite(radiusMetres, 0));
  const fraction = (ordinal + 0.5) / planned;
  const sampleRadius = radius * Math.sqrt(fraction);
  const seedRotation = unitFloat(hash32(`${cleanText(taskId)}:support-points`)) * FULL_ROTATION_RADIANS;
  const theta = seedRotation + ordinal * SUPPRESSION_GOLDEN_ANGLE_RADIANS;
  return {
    xMetres: canonical(finite(center.xMetres, 0) + Math.cos(theta) * sampleRadius),
    yMetres: canonical(finite(center.yMetres, 0) + Math.sin(theta) * sampleRadius),
    zMetres: canonical(finite(center.zMetres, 0)),
  };
}

function hash32(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
function unitFloat(value: number): number { return (value >>> 0) / 0x1_0000_0000; }
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function integer(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const numeric = Math.round(finite(value, fallback));
  return Math.max(minimum, Math.min(maximum, numeric));
}
function canonical(value: number): number { return Math.round(value * 1_000_000_000_000) / 1_000_000_000_000; }
function cleanText(value: unknown): string { return typeof value === 'string' && value.trim() ? value.trim() : 'suppression-task'; }
