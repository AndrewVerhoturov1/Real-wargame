import type { BallisticDirection3 } from '../../combat/UnitHitShapes';

export const UNIT_SUPPRESSION_RUNTIME_SCHEMA_VERSION = 1 as const;
export const SUPPRESSION_EVENT_SCHEMA_VERSION = 1 as const;
export const SUPPRESSION_UPDATE_INTERVAL_SECONDS = 0.2;

export const SUPPRESSION_NEAR_MISS_RADIUS_METRES = 3;
export const SUPPRESSION_NEAR_IMPACT_RADIUS_METRES = 6;
export const MAX_SUPPRESSION_CANDIDATES_PER_SEGMENT = 32;
export const MAX_SUPPRESSION_EVENTS_PER_PROJECTILE_SUBSTEP = 8;
export const SUPPRESSION_EVENT_BUFFER_MULTIPLIER = 8;

export const MAX_SUPPRESSION_SOURCES_PER_UNIT = 16;
export const MAX_APPLIED_SUPPRESSION_EVENT_IDS = 256;
export const MAX_SUPPRESSION_EVENT_IDS_PER_SOURCE_WINDOW = 32;
export const OTHER_SUPPRESSION_SOURCES_ID = '__other_sources__';

export const SUPPRESSION_NEAR_MISS_BASE_IMPULSE = 0.10;
export const SUPPRESSION_NEAR_IMPACT_BASE_IMPULSE = 0.18;
export const SUPPRESSION_DIRECT_HIT_BASE_IMPULSE = 0.30;

export const SUPPRESSION_NEAR_MISS_SHOCK_MULTIPLIER = 0.70;
export const SUPPRESSION_NEAR_IMPACT_SHOCK_MULTIPLIER = 1.20;
export const SUPPRESSION_DIRECT_HIT_SHOCK_MULTIPLIER = 1.50;
export const SUPPRESSION_CONTINUOUS_FIRE_MAX_BONUS = 0.75;

export const SUPPRESSION_LEVEL_DECAY_PER_SECOND = 0.08;
export const SUPPRESSION_SHOCK_DECAY_PER_SECOND = 0.45;
export const SUPPRESSION_CONTINUOUS_FIRE_DECAY_PER_SECOND = 0.50;
export const SUPPRESSION_RECENT_DISTANCE_MEMORY_SECONDS = 1;

export type SuppressionEventKind = 'near_miss' | 'near_impact' | 'direct_hit';

export interface SuppressionEventV1 {
  readonly schemaVersion: typeof SUPPRESSION_EVENT_SCHEMA_VERSION;
  readonly eventId: string;
  readonly sourceUnitId: string;
  readonly affectedUnitId: string;
  readonly shotId: string;
  readonly projectileId: string;
  readonly kind: SuppressionEventKind;
  readonly eventSeconds: number;
  readonly distanceMetres: number;
  readonly incomingDirection: BallisticDirection3;
  readonly continuousFireScore: number;
  readonly baseImpulse: number;
}

export interface SuppressionSourceWindowV1 {
  readonly sourceUnitId: string;
  nearMissCount: number;
  nearImpactCount: number;
  directHitCount: number;
  minimumDistanceMetres: number;
  weightedDirectionX: number;
  weightedDirectionY: number;
  weightedDirectionZ: number;
  baseImpulseSum: number;
  shockImpulseSum: number;
  maximumContinuousFireScore: number;
  eventIds: string[];
}

export interface UnitSuppressionRuntimeV1 {
  readonly schemaVersion: typeof UNIT_SUPPRESSION_RUNTIME_SCHEMA_VERSION;
  suppressionLevel: number;
  shock: number;
  continuousFire: number;
  dominantDirection: BallisticDirection3;
  recentImpactDistanceMetres: number | null;
  sourceCountEstimate: number;
  lastExposureSeconds: number;
  nextUpdateBoundarySeconds: number;
  updateCount: number;
  pendingSources: SuppressionSourceWindowV1[];
  appliedEventIds: string[];
  lastAppliedImpulse: number;
  lastAppliedShock: number;
  lastEventSeconds: number | null;
  lastEventKind: SuppressionEventKind | null;
  revision: number;
}

export interface SuppressionEventBufferDiagnosticsV1 {
  readonly capacity: number;
  count: number;
  highWaterMark: number;
  overflowCount: number;
  candidateTruncationCount: number;
  duplicateEventCount: number;
  emittedNearMissCount: number;
  emittedNearImpactCount: number;
  emittedDirectHitCount: number;
}
