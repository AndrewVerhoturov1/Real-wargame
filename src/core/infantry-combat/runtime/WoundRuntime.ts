import type { HitZone } from '../../combat/UnitHitShapes';
import {
  MAX_APPLIED_WOUND_IMPACT_IDS,
  MAX_WOUND_SLOTS,
  UNIT_WOUND_RUNTIME_SCHEMA_VERSION,
  WOUND_SLOT_SCHEMA_VERSION,
  compareHitZones,
  isHitZone,
  isWoundBleedingState,
  isWoundSeverity,
  woundSeverityIndex,
  type UnitWoundRuntimeV1,
  type WoundApplicationResultV1,
  type WoundBleedingState,
  type WoundCandidateV1,
  type WoundSeverity,
  type WoundSlotV1,
} from './InfantryBodyTypes';
import { createFullUnitCombatCapabilities, deriveUnitCombatCapabilities } from './WoundCapabilities';

export const WOUND_BASE_BLEEDING_RATE_PER_SECOND = Object.freeze({
  light: 0,
  severe: 0.003,
  critical: 0.008,
} as const);

export const WOUND_ZONE_BLEEDING_MULTIPLIER: Readonly<Record<HitZone, number>> = Object.freeze({
  head: 1.20,
  torso: 1.30,
  arms: 0.80,
  legs: 1.00,
});

export const MAX_ZONE_BLEEDING_RATE_PER_SECOND = 0.02;

export interface AggregateWoundCandidateResult {
  readonly runtime: UnitWoundRuntimeV1;
  readonly result: WoundApplicationResultV1;
}

export interface PreparedFirstAidTreatmentV1 {
  readonly applied: boolean;
  readonly reason: 'applied' | 'duplicate_action' | 'zone_missing' | 'bleeding_not_treatable' | 'invalid_request';
  readonly zone: HitZone | null;
  readonly previousBleedingState: WoundBleedingState | null;
  readonly nextBleedingState: WoundBleedingState | null;
  readonly runtime: UnitWoundRuntimeV1;
}

export function createUnitWoundRuntime(): UnitWoundRuntimeV1 {
  return {
    schemaVersion: UNIT_WOUND_RUNTIME_SCHEMA_VERSION,
    slots: [],
    appliedImpactIds: [],
    capabilities: createFullUnitCombatCapabilities(),
    lastApplication: null,
    revision: 0,
  };
}

export interface ApplyWoundCandidateResult {
  readonly status: 'applied' | 'duplicate' | 'rejected';
  readonly result: WoundApplicationResultV1;
}

/** Mutable command boundary; pure aggregation remains available separately. */
export function applyWoundCandidate(
  runtime: UnitWoundRuntimeV1,
  candidate: WoundCandidateV1,
): ApplyWoundCandidateResult {
  const aggregated = aggregateWoundCandidate(runtime, candidate);
  assignWoundRuntime(runtime, aggregated.runtime);
  return {
    status: aggregated.result.applied
      ? 'applied'
      : aggregated.result.reason === 'duplicate_impact'
        ? 'duplicate'
        : 'rejected',
    result: aggregated.result,
  };
}

export function aggregateWoundCandidate(
  source: UnitWoundRuntimeV1,
  candidate: WoundCandidateV1,
): AggregateWoundCandidateResult {
  const runtime = serializeUnitWoundRuntime(source);
  const revisionBefore = runtime.revision;
  if (!validCandidate(candidate)) {
    const result = applicationResult(false, 'invalid_candidate', candidate, revisionBefore, revisionBefore);
    return { runtime, result };
  }
  if (runtime.appliedImpactIds.includes(candidate.impactId)) {
    const result = applicationResult(false, 'duplicate_impact', candidate, revisionBefore, revisionBefore);
    return { runtime, result };
  }

  const slot = runtime.slots.find((entry) => entry.zone === candidate.zone);
  if (slot) strengthenSlot(slot, candidate);
  else if (runtime.slots.length < MAX_WOUND_SLOTS) runtime.slots.push(createSlot(candidate));
  else {
    const result = applicationResult(false, 'slot_capacity_reached', candidate, revisionBefore, revisionBefore);
    return { runtime, result };
  }
  runtime.slots.sort(compareSlots);
  insertSortedUniqueBounded(runtime.appliedImpactIds, candidate.impactId, MAX_APPLIED_WOUND_IMPACT_IDS);
  runtime.capabilities = deriveUnitCombatCapabilities(runtime.slots);
  runtime.revision = Math.min(Number.MAX_SAFE_INTEGER, runtime.revision + 1);
  const result = applicationResult(true, 'applied', candidate, revisionBefore, runtime.revision);
  runtime.lastApplication = result;
  return { runtime, result };
}

/**
 * Builds the complete next wound state without mutating the source. Structural
 * severity and structural capabilities deliberately remain unchanged.
 */
export function prepareFirstAidTreatment(
  source: UnitWoundRuntimeV1,
  zone: HitZone,
  actionId: string,
  treatedSeconds: number,
): PreparedFirstAidTreatmentV1 {
  const runtime = serializeUnitWoundRuntime(source);
  const normalizedActionId = text(actionId);
  if (!isHitZone(zone) || !normalizedActionId || !Number.isFinite(treatedSeconds) || treatedSeconds < 0) {
    return treatmentResult(false, 'invalid_request', null, null, null, runtime);
  }
  const slot = runtime.slots.find((entry) => entry.zone === zone) ?? null;
  if (!slot) return treatmentResult(false, 'zone_missing', zone, null, null, runtime);
  if (slot.lastFirstAidActionId === normalizedActionId) {
    return treatmentResult(false, 'duplicate_action', zone, slot.bleedingState, slot.bleedingState, runtime);
  }
  const previous = slot.bleedingState;
  if (previous !== 'severe' && previous !== 'critical') {
    return treatmentResult(false, 'bleeding_not_treatable', zone, previous, previous, runtime);
  }

  slot.bleedingState = previous === 'critical' ? 'severe' : 'stopped';
  slot.bleedingRatePerSecond = slot.bleedingState === 'severe'
    ? canonicalRate(Math.min(
      finiteNonNegative(slot.bleedingRatePerSecond),
      bleedingRateForSeverity(slot.zone, 'severe'),
    ))
    : 0;
  if (slot.bleedingState === 'severe' && slot.bleedingRatePerSecond <= 0) {
    slot.bleedingRatePerSecond = bleedingRateForSeverity(slot.zone, 'severe');
  }
  slot.firstAidApplicationCount = Math.min(Number.MAX_SAFE_INTEGER, slot.firstAidApplicationCount + 1);
  slot.lastFirstAidActionId = normalizedActionId;
  slot.lastTreatedSeconds = canonicalSeconds(treatedSeconds);
  runtime.revision = Math.min(Number.MAX_SAFE_INTEGER, runtime.revision + 1);
  runtime.capabilities = deriveUnitCombatCapabilities(runtime.slots);
  return treatmentResult(true, 'applied', zone, previous, slot.bleedingState, runtime);
}

export function applyPreparedFirstAidTreatment(
  target: UnitWoundRuntimeV1,
  prepared: PreparedFirstAidTreatmentV1,
): boolean {
  if (!prepared.applied) return false;
  assignWoundRuntime(target, prepared.runtime);
  return true;
}

export function normalizeUnitWoundRuntime(value: unknown): UnitWoundRuntimeV1 {
  if (!isRecord(value) || (value.schemaVersion !== 1 && value.schemaVersion !== UNIT_WOUND_RUNTIME_SCHEMA_VERSION)) {
    return createUnitWoundRuntime();
  }
  const byZone = new Map<HitZone, WoundSlotV1>();
  const normalizedSlots = (Array.isArray(value.slots) ? value.slots : [])
    .map(normalizeSlot)
    .filter((slot): slot is WoundSlotV1 => slot !== null)
    .sort(compareSlotHistory);
  for (const slot of normalizedSlots) {
    const existing = byZone.get(slot.zone);
    if (!existing) byZone.set(slot.zone, slot);
    else mergeSlots(existing, slot);
  }
  const slots = [...byZone.values()].sort(compareSlots).slice(0, MAX_WOUND_SLOTS);
  const appliedImpactIds = uniqueTexts(Array.isArray(value.appliedImpactIds) ? value.appliedImpactIds : [])
    .slice(-MAX_APPLIED_WOUND_IMPACT_IDS);
  return {
    schemaVersion: UNIT_WOUND_RUNTIME_SCHEMA_VERSION,
    slots,
    appliedImpactIds,
    capabilities: deriveUnitCombatCapabilities(slots),
    lastApplication: normalizeApplicationResult(value.lastApplication),
    revision: integer(value.revision, 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

export function serializeUnitWoundRuntime(value: UnitWoundRuntimeV1): UnitWoundRuntimeV1 {
  return normalizeUnitWoundRuntime(structuredClone(value));
}

export function bleedingRateForSeverity(zone: HitZone, severity: WoundSeverity): number {
  return canonicalRate(
    WOUND_BASE_BLEEDING_RATE_PER_SECOND[severity]
      * WOUND_ZONE_BLEEDING_MULTIPLIER[zone],
  );
}

export function totalWoundBleedingRatePerSecond(runtime: UnitWoundRuntimeV1): number {
  return canonicalRate(Math.min(
    MAX_WOUND_SLOTS * MAX_ZONE_BLEEDING_RATE_PER_SECOND,
    runtime.slots.reduce((sum, slot) => sum + finiteNonNegative(slot.bleedingRatePerSecond), 0),
  ));
}

function createSlot(candidate: WoundCandidateV1): WoundSlotV1 {
  const bleedingState = bleedingStateForSeverity(candidate.severity);
  return {
    schemaVersion: WOUND_SLOT_SCHEMA_VERSION,
    zone: candidate.zone,
    severity: candidate.severity,
    bleedingState,
    hitCount: 1,
    bleedingRatePerSecond: bleedingState === 'none'
      ? 0
      : activeBleedingRate(candidate.zone, candidate.severity, candidate.bleedingRatePerSecond),
    maximumTraumaScore: finiteNonNegative(candidate.traumaScore),
    lastImpactEnergyJoules: finiteNonNegative(candidate.impactEnergyJoules),
    firstImpactId: candidate.impactId,
    lastImpactId: candidate.impactId,
    firstAppliedSeconds: finiteNonNegative(candidate.appliedSeconds),
    lastAppliedSeconds: finiteNonNegative(candidate.appliedSeconds),
    firstAidApplicationCount: 0,
    lastFirstAidActionId: null,
    lastTreatedSeconds: null,
  };
}

function strengthenSlot(slot: WoundSlotV1, candidate: WoundCandidateV1): void {
  if (woundSeverityIndex(candidate.severity) > woundSeverityIndex(slot.severity)) slot.severity = candidate.severity;
  slot.hitCount = Math.min(Number.MAX_SAFE_INTEGER, slot.hitCount + 1);
  if (candidate.severity !== 'light') {
    const incomingRate = activeBleedingRate(candidate.zone, candidate.severity, candidate.bleedingRatePerSecond);
    slot.bleedingState = candidate.severity === 'critical'
      ? 'critical'
      : slot.bleedingState === 'critical'
        ? 'critical'
        : 'severe';
    slot.bleedingRatePerSecond = aggregateBleedingRate(slot.bleedingRatePerSecond, incomingRate);
  }
  slot.maximumTraumaScore = Math.max(slot.maximumTraumaScore, finiteNonNegative(candidate.traumaScore));
  slot.lastImpactEnergyJoules = finiteNonNegative(candidate.impactEnergyJoules);
  slot.lastImpactId = candidate.impactId;
  slot.lastAppliedSeconds = finiteNonNegative(candidate.appliedSeconds);
}

function mergeSlots(target: WoundSlotV1, source: WoundSlotV1): void {
  if (woundSeverityIndex(source.severity) > woundSeverityIndex(target.severity)) target.severity = source.severity;
  target.hitCount = Math.min(Number.MAX_SAFE_INTEGER, target.hitCount + source.hitCount);
  const mergedBleedingState = mergeBleedingStates(target.bleedingState, source.bleedingState);
  target.bleedingState = mergedBleedingState;
  target.bleedingRatePerSecond = isActiveBleedingState(mergedBleedingState)
    ? aggregateBleedingRate(target.bleedingRatePerSecond, source.bleedingRatePerSecond)
    : 0;
  target.maximumTraumaScore = Math.max(target.maximumTraumaScore, source.maximumTraumaScore);
  target.firstAidApplicationCount = Math.min(
    Number.MAX_SAFE_INTEGER,
    target.firstAidApplicationCount + source.firstAidApplicationCount,
  );
  if (source.firstAppliedSeconds < target.firstAppliedSeconds || (
    source.firstAppliedSeconds === target.firstAppliedSeconds && source.firstImpactId < target.firstImpactId
  )) {
    target.firstAppliedSeconds = source.firstAppliedSeconds;
    target.firstImpactId = source.firstImpactId;
  }
  if (source.lastAppliedSeconds > target.lastAppliedSeconds || (
    source.lastAppliedSeconds === target.lastAppliedSeconds && source.lastImpactId > target.lastImpactId
  )) {
    target.lastAppliedSeconds = source.lastAppliedSeconds;
    target.lastImpactId = source.lastImpactId;
    target.lastImpactEnergyJoules = source.lastImpactEnergyJoules;
  }
  if ((source.lastTreatedSeconds ?? -1) > (target.lastTreatedSeconds ?? -1) || (
    source.lastTreatedSeconds === target.lastTreatedSeconds
    && (source.lastFirstAidActionId ?? '') > (target.lastFirstAidActionId ?? '')
  )) {
    target.lastTreatedSeconds = source.lastTreatedSeconds;
    target.lastFirstAidActionId = source.lastFirstAidActionId;
  }
}

function normalizeSlot(value: unknown): WoundSlotV1 | null {
  if (!isRecord(value) || (value.schemaVersion !== 1 && value.schemaVersion !== WOUND_SLOT_SCHEMA_VERSION)
    || !isHitZone(value.zone) || !isWoundSeverity(value.severity)) return null;
  const firstImpactId = text(value.firstImpactId);
  const lastImpactId = text(value.lastImpactId);
  if (!firstImpactId || !lastImpactId) return null;
  const legacy = value.schemaVersion === 1;
  const bleedingState = legacy
    ? bleedingStateForSeverity(value.severity)
    : isWoundBleedingState(value.bleedingState)
      ? value.bleedingState
      : bleedingStateForSeverity(value.severity);
  const bleedingRate = isActiveBleedingState(bleedingState)
    ? activeBleedingRate(value.zone, bleedingState, value.bleedingRatePerSecond)
    : 0;
  return {
    schemaVersion: WOUND_SLOT_SCHEMA_VERSION,
    zone: value.zone,
    severity: value.severity,
    bleedingState,
    hitCount: integer(value.hitCount, 1, 1, Number.MAX_SAFE_INTEGER),
    bleedingRatePerSecond: bleedingRate,
    maximumTraumaScore: finiteNonNegative(value.maximumTraumaScore),
    lastImpactEnergyJoules: finiteNonNegative(value.lastImpactEnergyJoules),
    firstImpactId,
    lastImpactId,
    firstAppliedSeconds: finiteNonNegative(value.firstAppliedSeconds),
    lastAppliedSeconds: finiteNonNegative(value.lastAppliedSeconds),
    firstAidApplicationCount: legacy ? 0 : integer(value.firstAidApplicationCount, 0, 0, Number.MAX_SAFE_INTEGER),
    lastFirstAidActionId: legacy ? null : nullableText(value.lastFirstAidActionId),
    lastTreatedSeconds: legacy ? null : nullableNonNegative(value.lastTreatedSeconds),
  };
}

function validCandidate(value: WoundCandidateV1): boolean {
  return value.schemaVersion === 1
    && Boolean(text(value.impactId))
    && Boolean(text(value.affectedUnitId))
    && isHitZone(value.zone)
    && isWoundSeverity(value.severity)
    && Number.isFinite(value.impactEnergyJoules)
    && value.impactEnergyJoules >= 0
    && Number.isFinite(value.traumaScore)
    && value.traumaScore >= 0
    && Number.isFinite(value.appliedSeconds)
    && value.appliedSeconds >= 0;
}

function applicationResult(
  applied: boolean,
  reason: WoundApplicationResultV1['reason'],
  candidate: Partial<WoundCandidateV1>,
  revisionBefore: number,
  revisionAfter: number,
): WoundApplicationResultV1 {
  return {
    schemaVersion: 1,
    applied,
    reason,
    impactId: text(candidate.impactId) || null,
    affectedUnitId: text(candidate.affectedUnitId) || null,
    zone: isHitZone(candidate.zone) ? candidate.zone : null,
    severity: isWoundSeverity(candidate.severity) ? candidate.severity : null,
    revisionBefore,
    revisionAfter,
    appliedSeconds: finiteNonNegative(candidate.appliedSeconds),
  };
}

function normalizeApplicationResult(value: unknown): WoundApplicationResultV1 | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  const reasons: readonly WoundApplicationResultV1['reason'][] = [
    'applied', 'duplicate_impact', 'legacy_impact', 'body_physics_missing',
    'target_unit_missing', 'invalid_candidate', 'slot_capacity_reached',
  ];
  if (!reasons.includes(value.reason as WoundApplicationResultV1['reason'])) return null;
  return {
    schemaVersion: 1,
    applied: value.applied === true,
    reason: value.reason as WoundApplicationResultV1['reason'],
    impactId: nullableText(value.impactId),
    affectedUnitId: nullableText(value.affectedUnitId),
    zone: isHitZone(value.zone) ? value.zone : null,
    severity: isWoundSeverity(value.severity) ? value.severity : null,
    revisionBefore: integer(value.revisionBefore, 0, 0, Number.MAX_SAFE_INTEGER),
    revisionAfter: integer(value.revisionAfter, 0, 0, Number.MAX_SAFE_INTEGER),
    appliedSeconds: finiteNonNegative(value.appliedSeconds),
  };
}

function assignWoundRuntime(target: UnitWoundRuntimeV1, source: UnitWoundRuntimeV1): void {
  target.slots = source.slots;
  target.appliedImpactIds = source.appliedImpactIds;
  target.capabilities = source.capabilities;
  target.lastApplication = source.lastApplication;
  target.revision = source.revision;
}

function treatmentResult(
  applied: boolean,
  reason: PreparedFirstAidTreatmentV1['reason'],
  zone: HitZone | null,
  previousBleedingState: WoundBleedingState | null,
  nextBleedingState: WoundBleedingState | null,
  runtime: UnitWoundRuntimeV1,
): PreparedFirstAidTreatmentV1 {
  return { applied, reason, zone, previousBleedingState, nextBleedingState, runtime };
}

function bleedingStateForSeverity(severity: WoundSeverity): WoundBleedingState {
  return severity === 'light' ? 'none' : severity;
}
function isActiveBleedingState(value: WoundBleedingState): value is 'severe' | 'critical' {
  return value === 'severe' || value === 'critical';
}
function mergeBleedingStates(left: WoundBleedingState, right: WoundBleedingState): WoundBleedingState {
  if (left === 'critical' || right === 'critical') return 'critical';
  if (left === 'severe' || right === 'severe') return 'severe';
  if (left === 'stopped' || right === 'stopped') return 'stopped';
  return 'none';
}
function activeBleedingRate(zone: HitZone, severity: 'severe' | 'critical', value: unknown): number {
  const normalized = finiteNonNegative(value);
  return canonicalRate(Math.min(
    MAX_ZONE_BLEEDING_RATE_PER_SECOND,
    normalized > 0 ? normalized : bleedingRateForSeverity(zone, severity),
  ));
}
function aggregateBleedingRate(existing: unknown, incoming: unknown): number {
  const incomingRate = finiteNonNegative(incoming);
  return canonicalRate(Math.min(
    MAX_ZONE_BLEEDING_RATE_PER_SECOND,
    Math.max(finiteNonNegative(existing), incomingRate) + incomingRate * 0.25,
  ));
}
function compareSlots(left: WoundSlotV1, right: WoundSlotV1): number { return compareHitZones(left.zone, right.zone); }
function compareSlotHistory(left: WoundSlotV1, right: WoundSlotV1): number {
  return left.firstAppliedSeconds - right.firstAppliedSeconds
    || left.firstImpactId.localeCompare(right.firstImpactId)
    || left.lastAppliedSeconds - right.lastAppliedSeconds
    || left.lastImpactId.localeCompare(right.lastImpactId);
}
function uniqueTexts(values: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const item = text(value);
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out.sort((left, right) => left.localeCompare(right));
}
function insertSortedUniqueBounded(target: string[], value: string, capacity: number): void {
  if (target.includes(value)) return;
  let low = 0;
  let high = target.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (target[middle]!.localeCompare(value) < 0) low = middle + 1;
    else high = middle;
  }
  target.splice(low, 0, value);
  if (target.length > capacity) target.splice(0, target.length - capacity);
}
function text(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function nullableText(value: unknown): string | null { return text(value) || null; }
function finiteNonNegative(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0; }
function nullableNonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? canonicalSeconds(value) : null;
}
function integer(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.max(minimum, Math.min(maximum, numeric));
}
function canonicalRate(value: number): number { return Math.round(Math.max(0, value) * 1_000_000_000_000) / 1_000_000_000_000; }
function canonicalSeconds(value: number): number { return Math.round(Math.max(0, value) * 1_000_000_000_000) / 1_000_000_000_000; }
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
