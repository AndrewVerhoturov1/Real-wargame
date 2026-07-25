import { normalizeDirection } from '../../combat/UnitHitShapes';
import {
  MAX_APPLIED_SUPPRESSION_EVENT_IDS,
  MAX_SUPPRESSION_EVENT_IDS_PER_SOURCE_WINDOW,
  MAX_SUPPRESSION_SOURCES_PER_UNIT,
  OTHER_SUPPRESSION_SOURCES_ID,
  SUPPRESSION_CONTINUOUS_FIRE_DECAY_PER_SECOND,
  SUPPRESSION_CONTINUOUS_FIRE_MAX_BONUS,
  SUPPRESSION_DIRECT_HIT_SHOCK_MULTIPLIER,
  SUPPRESSION_LEVEL_DECAY_PER_SECOND,
  SUPPRESSION_NEAR_IMPACT_RADIUS_METRES,
  SUPPRESSION_NEAR_IMPACT_SHOCK_MULTIPLIER,
  SUPPRESSION_NEAR_MISS_RADIUS_METRES,
  SUPPRESSION_NEAR_MISS_SHOCK_MULTIPLIER,
  SUPPRESSION_RECENT_DISTANCE_MEMORY_SECONDS,
  SUPPRESSION_SHOCK_DECAY_PER_SECOND,
  SUPPRESSION_UPDATE_INTERVAL_SECONDS,
  UNIT_SUPPRESSION_RUNTIME_SCHEMA_VERSION,
  type SuppressionEventKind,
  type SuppressionEventV1,
  type SuppressionSourceWindowV1,
  type UnitSuppressionRuntimeV1,
} from './SuppressionTypes';

const TIME_EPSILON_SECONDS = 1e-9;
const VECTOR_EPSILON = 1e-12;
const MAX_SOURCE_COUNT_ESTIMATE = 65_535;

export function createUnitSuppressionRuntime(startSeconds = 0): UnitSuppressionRuntimeV1 {
  const start = canonicalSeconds(finiteNonNegative(startSeconds, 0));
  return {
    schemaVersion: UNIT_SUPPRESSION_RUNTIME_SCHEMA_VERSION,
    suppressionLevel: 0,
    shock: 0,
    continuousFire: 0,
    dominantDirection: { x: 1, y: 0, z: 0 },
    recentImpactDistanceMetres: null,
    sourceCountEstimate: 0,
    lastExposureSeconds: start,
    nextUpdateBoundarySeconds: nextGlobalBoundaryAfter(start),
    updateCount: 0,
    pendingSources: [],
    appliedEventIds: [],
    lastAppliedImpulse: 0,
    lastAppliedShock: 0,
    lastEventSeconds: null,
    lastEventKind: null,
    revision: 0,
  };
}

export function normalizeUnitSuppressionRuntime(
  value: unknown,
  fallbackSeconds = 0,
): UnitSuppressionRuntimeV1 {
  if (!isRecord(value) || value.schemaVersion !== UNIT_SUPPRESSION_RUNTIME_SCHEMA_VERSION) {
    return createUnitSuppressionRuntime(fallbackSeconds);
  }
  const lastExposureSeconds = canonicalSeconds(finiteNonNegative(value.lastExposureSeconds, fallbackSeconds));
  const pendingSources = readArray(value.pendingSources)
    .map(normalizeSourceWindow)
    .filter(isPresent)
    .sort(compareSources)
    .slice(0, MAX_SUPPRESSION_SOURCES_PER_UNIT);
  return {
    schemaVersion: UNIT_SUPPRESSION_RUNTIME_SCHEMA_VERSION,
    suppressionLevel: clamp01(finite(value.suppressionLevel, 0)),
    shock: clamp01(finite(value.shock, 0)),
    continuousFire: clamp01(finite(value.continuousFire, 0)),
    dominantDirection: normalizeDirection(normalizeVector(value.dominantDirection) ?? { x: 1, y: 0, z: 0 }),
    recentImpactDistanceMetres: nullableNonNegative(value.recentImpactDistanceMetres),
    sourceCountEstimate: integer(value.sourceCountEstimate, pendingSources.length, 0, MAX_SOURCE_COUNT_ESTIMATE),
    lastExposureSeconds,
    nextUpdateBoundarySeconds: normalizeNextBoundary(value.nextUpdateBoundarySeconds, lastExposureSeconds),
    updateCount: integer(value.updateCount, 0, 0, Number.MAX_SAFE_INTEGER),
    pendingSources,
    appliedEventIds: canonicalStrings(value.appliedEventIds).slice(-MAX_APPLIED_SUPPRESSION_EVENT_IDS),
    lastAppliedImpulse: clamp01(finite(value.lastAppliedImpulse, 0)),
    lastAppliedShock: clamp01(finite(value.lastAppliedShock, 0)),
    lastEventSeconds: nullableSeconds(value.lastEventSeconds),
    lastEventKind: normalizeEventKind(value.lastEventKind),
    revision: integer(value.revision, 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

export function serializeUnitSuppressionRuntime(
  value: UnitSuppressionRuntimeV1,
): UnitSuppressionRuntimeV1 {
  return normalizeUnitSuppressionRuntime(structuredClone(value), value.lastExposureSeconds);
}

export function advanceSuppressionRuntimeTo(
  runtime: UnitSuppressionRuntimeV1,
  targetSeconds: number,
): void {
  const target = canonicalSeconds(Math.max(runtime.lastExposureSeconds, finiteNonNegative(targetSeconds, runtime.lastExposureSeconds)));
  let guard = 0;
  while (runtime.nextUpdateBoundarySeconds <= target + TIME_EPSILON_SECONDS) {
    applyDecay(runtime, runtime.nextUpdateBoundarySeconds - runtime.lastExposureSeconds, runtime.nextUpdateBoundarySeconds);
    runtime.lastExposureSeconds = runtime.nextUpdateBoundarySeconds;
    commitPendingWindow(runtime);
    runtime.nextUpdateBoundarySeconds = canonicalSeconds(runtime.nextUpdateBoundarySeconds + SUPPRESSION_UPDATE_INTERVAL_SECONDS);
    guard += 1;
    if (guard > 100_000) throw new Error('Suppression boundary guard exceeded.');
  }
  if (target > runtime.lastExposureSeconds + TIME_EPSILON_SECONDS) {
    applyDecay(runtime, target - runtime.lastExposureSeconds, target);
    runtime.lastExposureSeconds = target;
  }
}

export function addSuppressionEvent(
  runtime: UnitSuppressionRuntimeV1,
  event: SuppressionEventV1,
): boolean {
  const normalized = normalizeEvent(event);
  if (!normalized) return false;
  advanceSuppressionRuntimeTo(runtime, normalized.eventSeconds);
  if (runtime.appliedEventIds.includes(normalized.eventId)) return false;
  insertSortedUniqueBounded(runtime.appliedEventIds, normalized.eventId, MAX_APPLIED_SUPPRESSION_EVENT_IDS);

  const source = getOrCreateSource(runtime, normalized.sourceUnitId);
  if (source.eventIds.includes(normalized.eventId)) return false;
  insertSortedUniqueBounded(source.eventIds, normalized.eventId, MAX_SUPPRESSION_EVENT_IDS_PER_SOURCE_WINDOW);

  const distanceFactor = normalized.kind === 'direct_hit'
    ? 1
    : 1 - clamp01(normalized.distanceMetres / radiusForKind(normalized.kind));
  const continuousMultiplier = 1
    + clamp01(normalized.continuousFireScore) * SUPPRESSION_CONTINUOUS_FIRE_MAX_BONUS;
  const eventImpulse = clamp01(normalized.baseImpulse * distanceFactor * continuousMultiplier);
  const eventShock = clamp01(eventImpulse * shockMultiplierForKind(normalized.kind));
  if (normalized.kind === 'near_miss') source.nearMissCount = increment(source.nearMissCount);
  else if (normalized.kind === 'near_impact') source.nearImpactCount = increment(source.nearImpactCount);
  else source.directHitCount = increment(source.directHitCount);
  source.minimumDistanceMetres = Math.min(source.minimumDistanceMetres, normalized.distanceMetres);
  source.weightedDirectionX += normalized.incomingDirection.x * eventImpulse;
  source.weightedDirectionY += normalized.incomingDirection.y * eventImpulse;
  source.weightedDirectionZ += normalized.incomingDirection.z * eventImpulse;
  source.baseImpulseSum = canonicalUnit(source.baseImpulseSum + eventImpulse);
  source.shockImpulseSum = canonicalUnit(source.shockImpulseSum + eventShock);
  source.maximumContinuousFireScore = Math.max(source.maximumContinuousFireScore, normalized.continuousFireScore);
  runtime.pendingSources.sort(compareSources);
  runtime.sourceCountEstimate = estimateCurrentSourceCount(runtime);
  runtime.lastEventSeconds = normalized.eventSeconds;
  runtime.lastEventKind = normalized.kind;
  runtime.revision = increment(runtime.revision);
  return true;
}

function commitPendingWindow(runtime: UnitSuppressionRuntimeV1): void {
  const sources = [...runtime.pendingSources].sort(compareSources);
  let totalImpulse = 0;
  let totalShock = 0;
  let maximumContinuousFire = 0;
  let weightedX = 0;
  let weightedY = 0;
  let weightedZ = 0;
  let minimumDistance = Number.POSITIVE_INFINITY;
  let strongestKind: SuppressionEventKind | null = null;
  for (const source of sources) {
    totalImpulse += clamp01(source.baseImpulseSum);
    totalShock += clamp01(source.shockImpulseSum);
    maximumContinuousFire = Math.max(maximumContinuousFire, source.maximumContinuousFireScore);
    weightedX += source.weightedDirectionX;
    weightedY += source.weightedDirectionY;
    weightedZ += source.weightedDirectionZ;
    minimumDistance = Math.min(minimumDistance, source.minimumDistanceMetres);
    if (source.directHitCount > 0) strongestKind = 'direct_hit';
    else if (source.nearImpactCount > 0 && strongestKind !== 'direct_hit') strongestKind = 'near_impact';
    else if (source.nearMissCount > 0 && strongestKind === null) strongestKind = 'near_miss';
  }
  const appliedImpulse = clamp01(totalImpulse);
  const appliedShock = clamp01(totalShock);
  if (sources.length > 0) {
    runtime.suppressionLevel = clamp01(
      runtime.suppressionLevel + appliedImpulse * (1 - runtime.suppressionLevel),
    );
    runtime.shock = clamp01(runtime.shock + appliedShock * (1 - runtime.shock));
    runtime.continuousFire = Math.max(runtime.continuousFire, clamp01(maximumContinuousFire));
    const magnitude = Math.hypot(weightedX, weightedY, weightedZ);
    if (magnitude > VECTOR_EPSILON) {
      runtime.dominantDirection = {
        x: weightedX / magnitude,
        y: weightedY / magnitude,
        z: weightedZ / magnitude,
      };
    }
    runtime.recentImpactDistanceMetres = Number.isFinite(minimumDistance) ? canonicalNonNegative(minimumDistance) : null;
    runtime.sourceCountEstimate = estimateCurrentSourceCount(runtime);
    runtime.lastAppliedImpulse = appliedImpulse;
    runtime.lastAppliedShock = appliedShock;
    runtime.lastEventKind = strongestKind ?? runtime.lastEventKind;
  } else {
    runtime.sourceCountEstimate = 0;
    runtime.lastAppliedImpulse = 0;
    runtime.lastAppliedShock = 0;
  }
  runtime.pendingSources = [];
  runtime.updateCount = increment(runtime.updateCount);
  runtime.revision = increment(runtime.revision);
}

function applyDecay(runtime: UnitSuppressionRuntimeV1, deltaSeconds: number, targetSeconds: number): void {
  const delta = Math.max(0, finite(deltaSeconds, 0));
  runtime.suppressionLevel = canonicalUnit(runtime.suppressionLevel - SUPPRESSION_LEVEL_DECAY_PER_SECOND * delta);
  runtime.shock = canonicalUnit(runtime.shock - SUPPRESSION_SHOCK_DECAY_PER_SECOND * delta);
  runtime.continuousFire = canonicalUnit(runtime.continuousFire - SUPPRESSION_CONTINUOUS_FIRE_DECAY_PER_SECOND * delta);
  if (
    runtime.lastEventSeconds !== null
    && targetSeconds - runtime.lastEventSeconds >= SUPPRESSION_RECENT_DISTANCE_MEMORY_SECONDS - TIME_EPSILON_SECONDS
  ) runtime.recentImpactDistanceMetres = null;
}

function getOrCreateSource(
  runtime: UnitSuppressionRuntimeV1,
  sourceUnitId: string,
): SuppressionSourceWindowV1 {
  const existing = runtime.pendingSources.find((source) => source.sourceUnitId === sourceUnitId);
  if (existing) return existing;
  const exactCount = runtime.pendingSources.filter((source) => source.sourceUnitId !== OTHER_SUPPRESSION_SOURCES_ID).length;
  const id = exactCount < MAX_SUPPRESSION_SOURCES_PER_UNIT - 1
    ? sourceUnitId
    : OTHER_SUPPRESSION_SOURCES_ID;
  const aggregate = runtime.pendingSources.find((source) => source.sourceUnitId === id);
  if (aggregate) return aggregate;
  const created = createSourceWindow(id);
  runtime.pendingSources.push(created);
  runtime.pendingSources.sort(compareSources);
  return created;
}

function createSourceWindow(sourceUnitId: string): SuppressionSourceWindowV1 {
  return {
    sourceUnitId,
    nearMissCount: 0,
    nearImpactCount: 0,
    directHitCount: 0,
    minimumDistanceMetres: Number.POSITIVE_INFINITY,
    weightedDirectionX: 0,
    weightedDirectionY: 0,
    weightedDirectionZ: 0,
    baseImpulseSum: 0,
    shockImpulseSum: 0,
    maximumContinuousFireScore: 0,
    eventIds: [],
  };
}

function normalizeSourceWindow(value: unknown): SuppressionSourceWindowV1 | null {
  if (!isRecord(value)) return null;
  const sourceUnitId = cleanText(value.sourceUnitId, '');
  if (!sourceUnitId) return null;
  return {
    sourceUnitId,
    nearMissCount: integer(value.nearMissCount, 0, 0, Number.MAX_SAFE_INTEGER),
    nearImpactCount: integer(value.nearImpactCount, 0, 0, Number.MAX_SAFE_INTEGER),
    directHitCount: integer(value.directHitCount, 0, 0, Number.MAX_SAFE_INTEGER),
    minimumDistanceMetres: finiteNonNegative(value.minimumDistanceMetres, Number.POSITIVE_INFINITY),
    weightedDirectionX: finite(value.weightedDirectionX, 0),
    weightedDirectionY: finite(value.weightedDirectionY, 0),
    weightedDirectionZ: finite(value.weightedDirectionZ, 0),
    baseImpulseSum: clamp01(finite(value.baseImpulseSum, 0)),
    shockImpulseSum: clamp01(finite(value.shockImpulseSum, 0)),
    maximumContinuousFireScore: clamp01(finite(value.maximumContinuousFireScore, 0)),
    eventIds: canonicalStrings(value.eventIds).slice(-MAX_SUPPRESSION_EVENT_IDS_PER_SOURCE_WINDOW),
  };
}

function normalizeEvent(value: unknown): SuppressionEventV1 | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  const eventId = cleanText(value.eventId, '');
  const sourceUnitId = cleanText(value.sourceUnitId, '');
  const affectedUnitId = cleanText(value.affectedUnitId, '');
  const shotId = cleanText(value.shotId, '');
  const projectileId = cleanText(value.projectileId, '');
  const kind = normalizeEventKind(value.kind);
  const direction = normalizeVector(value.incomingDirection);
  if (!eventId || !sourceUnitId || !affectedUnitId || !shotId || !projectileId || !kind || !direction) return null;
  return Object.freeze({
    schemaVersion: 1,
    eventId,
    sourceUnitId,
    affectedUnitId,
    shotId,
    projectileId,
    kind,
    eventSeconds: canonicalSeconds(finiteNonNegative(value.eventSeconds, 0)),
    distanceMetres: canonicalNonNegative(finiteNonNegative(value.distanceMetres, 0)),
    incomingDirection: normalizeDirection(direction),
    continuousFireScore: clamp01(finite(value.continuousFireScore, 0)),
    baseImpulse: clamp01(finite(value.baseImpulse, 0)),
  });
}

function estimateCurrentSourceCount(runtime: UnitSuppressionRuntimeV1): number {
  const exact = runtime.pendingSources.filter((source) => source.sourceUnitId !== OTHER_SUPPRESSION_SOURCES_ID).length;
  const hasOther = runtime.pendingSources.some((source) => source.sourceUnitId === OTHER_SUPPRESSION_SOURCES_ID);
  return Math.min(MAX_SOURCE_COUNT_ESTIMATE, exact + (hasOther ? 1 : 0));
}
function radiusForKind(kind: SuppressionEventKind): number {
  return kind === 'near_miss' ? SUPPRESSION_NEAR_MISS_RADIUS_METRES : SUPPRESSION_NEAR_IMPACT_RADIUS_METRES;
}
function shockMultiplierForKind(kind: SuppressionEventKind): number {
  return kind === 'near_miss'
    ? SUPPRESSION_NEAR_MISS_SHOCK_MULTIPLIER
    : kind === 'near_impact'
      ? SUPPRESSION_NEAR_IMPACT_SHOCK_MULTIPLIER
      : SUPPRESSION_DIRECT_HIT_SHOCK_MULTIPLIER;
}
function normalizeNextBoundary(value: unknown, lastExposureSeconds: number): number {
  const candidate = canonicalSeconds(finiteNonNegative(value, nextGlobalBoundaryAfter(lastExposureSeconds)));
  return candidate > lastExposureSeconds + TIME_EPSILON_SECONDS
    ? candidate
    : nextGlobalBoundaryAfter(lastExposureSeconds);
}
function nextGlobalBoundaryAfter(seconds: number): number {
  const step = Math.floor(Math.max(0, seconds) / SUPPRESSION_UPDATE_INTERVAL_SECONDS + TIME_EPSILON_SECONDS) + 1;
  return canonicalSeconds(step * SUPPRESSION_UPDATE_INTERVAL_SECONDS);
}
function insertSortedUniqueBounded(target: string[], value: string, capacity: number): void {
  if (target.includes(value)) return;
  target.push(value);
  target.sort(compareText);
  if (target.length > capacity) target.splice(0, target.length - capacity);
}
function canonicalStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => cleanText(entry, '')).filter(Boolean))].sort(compareText);
}
function normalizeEventKind(value: unknown): SuppressionEventKind | null {
  return value === 'near_miss' || value === 'near_impact' || value === 'direct_hit' ? value : null;
}
function normalizeVector(value: unknown): { x: number; y: number; z: number } | null {
  if (!isRecord(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y) || !isFiniteNumber(value.z)) return null;
  return { x: value.x, y: value.y, z: value.z };
}
function nullableNonNegative(value: unknown): number | null {
  return isFiniteNumber(value) ? canonicalNonNegative(value) : null;
}
function nullableSeconds(value: unknown): number | null {
  return isFiniteNumber(value) ? canonicalSeconds(Math.max(0, value)) : null;
}
function canonicalSeconds(value: number): number { return Math.round(Math.max(0, value) * 1_000_000_000_000) / 1_000_000_000_000; }
function canonicalNonNegative(value: number): number { return Math.round(Math.max(0, value) * 1_000_000_000_000) / 1_000_000_000_000; }
function canonicalUnit(value: number): number { return Math.round(clamp01(value) * 1_000_000_000_000) / 1_000_000_000_000; }
function clamp01(value: number): number { return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)); }
function increment(value: number): number { return Math.min(Number.MAX_SAFE_INTEGER, value + 1); }
function finite(value: unknown, fallback: number): number { return isFiniteNumber(value) ? value : fallback; }
function finiteNonNegative(value: unknown, fallback: number): number { return Math.max(0, finite(value, fallback)); }
function integer(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.round(finite(value, fallback))));
}
function cleanText(value: unknown, fallback: string): string { return typeof value === 'string' && value.trim() ? value.trim() : fallback; }
function readArray(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function compareSources(left: SuppressionSourceWindowV1, right: SuppressionSourceWindowV1): number { return compareText(left.sourceUnitId, right.sourceUnitId); }
function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function isFiniteNumber(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function isPresent<T>(value: T | null): value is T { return value !== null; }
