import type { GridPosition } from '../geometry';
import type { UnitModel } from '../units/UnitModel';

export type CombatThreatEvidenceKind = 'near_miss' | 'impact' | 'wounded';

export interface CombatThreatEvidence {
  readonly id: string;
  readonly kind: CombatThreatEvidenceKind;
  readonly sourceUnitId: string | null;
  readonly estimatedSourcePosition: GridPosition;
  readonly directionDegrees: number;
  readonly confidence: number;
  readonly uncertaintyCells: number;
  readonly strength: number;
  readonly suppression: number;
  readonly stressPerSecond: number;
  readonly rangeCells: number;
  readonly arcDegrees: number;
  readonly createdSeconds: number;
  readonly lastUpdatedSeconds: number;
  readonly evidenceCount: number;
}

const MAX_EVIDENCE_PER_UNIT = 24;
const EVIDENCE_TTL_SECONDS = 12;
const MERGE_WINDOW_SECONDS = 4;
const MERGE_DIRECTION_DEGREES = 28;
const evidenceByUnit = new WeakMap<UnitModel, CombatThreatEvidence[]>();

export function recordCombatThreatEvidence(unit: UnitModel, evidence: CombatThreatEvidence): void {
  const now = Math.max(evidence.createdSeconds, evidence.lastUpdatedSeconds);
  const active = pruneEvidence(evidenceByUnit.get(unit) ?? [], now);
  const mergeIndex = active.findIndex((candidate) => canMerge(candidate, evidence));
  if (mergeIndex >= 0) active[mergeIndex] = mergeEvidence(active[mergeIndex], evidence);
  else active.push(normalizeEvidence(evidence));
  active.sort((left, right) => right.lastUpdatedSeconds - left.lastUpdatedSeconds || right.confidence - left.confidence);
  if (active.length > MAX_EVIDENCE_PER_UNIT) active.length = MAX_EVIDENCE_PER_UNIT;
  evidenceByUnit.set(unit, active);
}

export function drainCombatThreatEvidence(unit: UnitModel, nowSeconds: number): CombatThreatEvidence[] {
  const active = pruneEvidence(evidenceByUnit.get(unit) ?? [], nowSeconds);
  evidenceByUnit.delete(unit);
  return active.map(cloneEvidence);
}

export function peekCombatThreatEvidence(unit: UnitModel, nowSeconds: number): readonly CombatThreatEvidence[] {
  const active = pruneEvidence(evidenceByUnit.get(unit) ?? [], nowSeconds);
  if (active.length > 0) evidenceByUnit.set(unit, active);
  else evidenceByUnit.delete(unit);
  return active.map(cloneEvidence);
}

export function clearCombatThreatEvidence(unit: UnitModel): void {
  evidenceByUnit.delete(unit);
}

function canMerge(left: CombatThreatEvidence, right: CombatThreatEvidence): boolean {
  if (Math.abs(left.lastUpdatedSeconds - right.lastUpdatedSeconds) > MERGE_WINDOW_SECONDS) return false;
  if (left.sourceUnitId && right.sourceUnitId) {
    return left.sourceUnitId === right.sourceUnitId
      && angularDifference(left.directionDegrees, right.directionDegrees) <= MERGE_DIRECTION_DEGREES;
  }
  if (left.sourceUnitId || right.sourceUnitId) return false;
  if (angularDifference(left.directionDegrees, right.directionDegrees) > MERGE_DIRECTION_DEGREES) return false;
  const distance = Math.hypot(
    left.estimatedSourcePosition.x - right.estimatedSourcePosition.x,
    left.estimatedSourcePosition.y - right.estimatedSourcePosition.y,
  );
  return distance <= left.uncertaintyCells + right.uncertaintyCells;
}

function mergeEvidence(left: CombatThreatEvidence, right: CombatThreatEvidence): CombatThreatEvidence {
  const leftWeight = Math.max(1, left.evidenceCount);
  const rightWeight = Math.max(1, right.evidenceCount);
  const total = leftWeight + rightWeight;
  return normalizeEvidence({
    id: left.id,
    kind: evidenceRank(right.kind) > evidenceRank(left.kind) ? right.kind : left.kind,
    sourceUnitId: left.sourceUnitId ?? right.sourceUnitId,
    estimatedSourcePosition: {
      x: (left.estimatedSourcePosition.x * leftWeight + right.estimatedSourcePosition.x * rightWeight) / total,
      y: (left.estimatedSourcePosition.y * leftWeight + right.estimatedSourcePosition.y * rightWeight) / total,
    },
    directionDegrees: circularWeightedAverage(left.directionDegrees, leftWeight, right.directionDegrees, rightWeight),
    confidence: Math.min(92, Math.max(left.confidence, right.confidence) + Math.min(18, right.confidence * 0.18)),
    uncertaintyCells: Math.max(0.5, Math.min(left.uncertaintyCells, right.uncertaintyCells) * 0.92),
    strength: Math.max(left.strength, right.strength),
    suppression: Math.min(100, Math.max(left.suppression, right.suppression) + 6),
    stressPerSecond: Math.max(left.stressPerSecond, right.stressPerSecond),
    rangeCells: Math.max(left.rangeCells, right.rangeCells),
    arcDegrees: Math.max(24, Math.min(left.arcDegrees, right.arcDegrees) * 0.94),
    createdSeconds: Math.min(left.createdSeconds, right.createdSeconds),
    lastUpdatedSeconds: Math.max(left.lastUpdatedSeconds, right.lastUpdatedSeconds),
    evidenceCount: total,
  });
}

function pruneEvidence(values: CombatThreatEvidence[], nowSeconds: number): CombatThreatEvidence[] {
  return values
    .filter((item) => nowSeconds - item.lastUpdatedSeconds <= EVIDENCE_TTL_SECONDS)
    .map(normalizeEvidence);
}

function normalizeEvidence(value: CombatThreatEvidence): CombatThreatEvidence {
  return {
    ...value,
    sourceUnitId: value.sourceUnitId || null,
    estimatedSourcePosition: { ...value.estimatedSourcePosition },
    directionDegrees: normalizeDegrees(value.directionDegrees),
    confidence: clamp(value.confidence, 0, 100),
    uncertaintyCells: Math.max(0.5, value.uncertaintyCells),
    strength: clamp(value.strength, 0, 100),
    suppression: clamp(value.suppression, 0, 100),
    stressPerSecond: Math.max(0, value.stressPerSecond),
    rangeCells: Math.max(0.5, value.rangeCells),
    arcDegrees: clamp(value.arcDegrees, 1, 360),
    createdSeconds: Math.max(0, value.createdSeconds),
    lastUpdatedSeconds: Math.max(0, value.lastUpdatedSeconds),
    evidenceCount: Math.max(1, Math.round(value.evidenceCount)),
  };
}

function cloneEvidence(value: CombatThreatEvidence): CombatThreatEvidence {
  return { ...value, estimatedSourcePosition: { ...value.estimatedSourcePosition } };
}

function evidenceRank(kind: CombatThreatEvidenceKind): number {
  if (kind === 'wounded') return 3;
  if (kind === 'near_miss') return 2;
  return 1;
}

function circularWeightedAverage(left: number, leftWeight: number, right: number, rightWeight: number): number {
  const leftRadians = left * Math.PI / 180;
  const rightRadians = right * Math.PI / 180;
  return normalizeDegrees(Math.atan2(
    Math.sin(leftRadians) * leftWeight + Math.sin(rightRadians) * rightWeight,
    Math.cos(leftRadians) * leftWeight + Math.cos(rightRadians) * rightWeight,
  ) * 180 / Math.PI);
}

function angularDifference(left: number, right: number): number {
  const difference = Math.abs(normalizeDegrees(left) - normalizeDegrees(right));
  return Math.min(difference, 360 - difference);
}

function normalizeDegrees(value: number): number {
  const result = value % 360;
  return result < 0 ? result + 360 : result;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
