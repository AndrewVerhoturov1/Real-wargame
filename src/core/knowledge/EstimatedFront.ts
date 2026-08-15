import type { GridPosition } from '../geometry';

export interface SubjectiveFrontEvidence {
  readonly id: string;
  readonly position: GridPosition;
  readonly confidence: number;
  readonly uncertaintyCells: number;
  readonly informationAtSeconds: number;
}

export interface EstimatedFrontKnowledge {
  readonly start: GridPosition;
  readonly end: GridPosition;
  readonly halfWidthCells: number;
  readonly confidence: number;
  readonly informationAtSeconds: number;
  readonly evidenceIds: readonly string[];
}

/**
 * Fits a subjective enemy-front band using only knowledge already owned by the
 * observer. Objective hostile-unit positions are intentionally not accepted.
 */
export function estimateSubjectiveFront(
  evidence: readonly SubjectiveFrontEvidence[],
): EstimatedFrontKnowledge | null {
  const usable = evidence
    .filter((item) => Number.isFinite(item.position.x) && Number.isFinite(item.position.y))
    .filter((item) => item.confidence >= 10);
  if (usable.length < 2) return null;

  const weightSum = usable.reduce((sum, item) => sum + weight(item), 0);
  if (weightSum <= 0) return null;
  const center = usable.reduce((result, item) => {
    const w = weight(item);
    result.x += item.position.x * w;
    result.y += item.position.y * w;
    return result;
  }, { x: 0, y: 0 });
  center.x /= weightSum;
  center.y /= weightSum;

  let xx = 0;
  let xy = 0;
  let yy = 0;
  for (const item of usable) {
    const w = weight(item);
    const dx = item.position.x - center.x;
    const dy = item.position.y - center.y;
    xx += dx * dx * w;
    xy += dx * dy * w;
    yy += dy * dy * w;
  }
  const axisAngle = 0.5 * Math.atan2(2 * xy, xx - yy);
  const axis = { x: Math.cos(axisAngle), y: Math.sin(axisAngle) };
  const normal = { x: -axis.y, y: axis.x };

  let minProjection = Number.POSITIVE_INFINITY;
  let maxProjection = Number.NEGATIVE_INFINITY;
  let weightedNormalSpread = 0;
  let weightedUncertainty = 0;
  let weightedConfidence = 0;
  for (const item of usable) {
    const w = weight(item);
    const dx = item.position.x - center.x;
    const dy = item.position.y - center.y;
    const along = dx * axis.x + dy * axis.y;
    const across = Math.abs(dx * normal.x + dy * normal.y);
    minProjection = Math.min(minProjection, along);
    maxProjection = Math.max(maxProjection, along);
    weightedNormalSpread += across * w;
    weightedUncertainty += Math.max(0, item.uncertaintyCells) * w;
    weightedConfidence += clamp(item.confidence, 0, 100) * w;
  }
  if (!Number.isFinite(minProjection) || !Number.isFinite(maxProjection) || maxProjection - minProjection < 0.5) {
    return null;
  }

  const sampleFactor = clamp(0.55 + usable.length * 0.1, 0.65, 1);
  return {
    start: {
      x: center.x + axis.x * minProjection,
      y: center.y + axis.y * minProjection,
    },
    end: {
      x: center.x + axis.x * maxProjection,
      y: center.y + axis.y * maxProjection,
    },
    halfWidthCells: Math.max(0.75, weightedUncertainty / weightSum, weightedNormalSpread / weightSum),
    confidence: clamp(weightedConfidence / weightSum * sampleFactor, 0, 100),
    informationAtSeconds: Math.max(...usable.map((item) => item.informationAtSeconds)),
    evidenceIds: usable.map((item) => item.id),
  };
}

function weight(item: SubjectiveFrontEvidence): number {
  return Math.max(0.05, clamp(item.confidence, 0, 100) / 100);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}
