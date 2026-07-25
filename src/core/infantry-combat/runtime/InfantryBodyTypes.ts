import type { BallisticDirection3, BallisticPoint3, HitZone } from '../../combat/UnitHitShapes';

export const UNIT_WOUND_RUNTIME_SCHEMA_VERSION = 2 as const;
export const BODY_IMPACT_PHYSICS_SCHEMA_VERSION = 1 as const;
export const WOUND_CANDIDATE_SCHEMA_VERSION = 1 as const;
export const WOUND_SLOT_SCHEMA_VERSION = 2 as const;
export const MAX_WOUND_SLOTS = 4;
export const MAX_APPLIED_WOUND_IMPACT_IDS = 128;

export const HIT_ZONE_CANONICAL_ORDER: readonly HitZone[] = Object.freeze([
  'head', 'torso', 'arms', 'legs',
]);

export type BodyPenetrationStatus = 'penetrated' | 'stopped' | 'penetration_limit';
export type WoundSeverity = 'light' | 'severe' | 'critical';
export type WoundBleedingState = 'none' | 'severe' | 'critical' | 'stopped';

export interface BodyImpactPhysicsV1 {
  readonly schemaVersion: typeof BODY_IMPACT_PHYSICS_SCHEMA_VERSION;
  readonly hitUnitId: string;
  readonly hitZone: HitZone;
  readonly hitShapeId: string;
  readonly entryPoint: BallisticPoint3;
  readonly exitPoint: BallisticPoint3 | null;
  readonly entryNormal: BallisticDirection3;
  readonly pathLengthMetres: number;
  readonly projectileMassKilograms: number;
  readonly woundEffectMultiplier: number;
  readonly speedBeforeMetresPerSecond: number;
  readonly speedAfterMetresPerSecond: number;
  readonly impactEnergyJoules: number;
  readonly incidenceCosine: number;
  readonly penetrationBudgetBefore: number;
  readonly penetrationResistance: number;
  readonly penetrationBudgetAfter: number;
  readonly penetrationCountBefore: number;
  readonly penetrationCountAfter: number;
  readonly status: BodyPenetrationStatus;
}

export interface WoundCandidateV1 {
  readonly schemaVersion: typeof WOUND_CANDIDATE_SCHEMA_VERSION;
  readonly impactId: string;
  readonly shotId: string;
  readonly projectileId: string;
  readonly sourceUnitId: string;
  readonly affectedUnitId: string;
  readonly zone: HitZone;
  readonly severity: WoundSeverity;
  readonly impactEnergyJoules: number;
  readonly traumaScore: number;
  readonly bleedingRatePerSecond: number;
  readonly functionalPenalty: number;
  readonly appliedSeconds: number;
}

export interface UnitCombatCapabilitiesV1 {
  readonly alive: boolean;
  readonly conscious: boolean;
  readonly canStand: boolean;
  readonly canMove: boolean;
  readonly canUseHands: boolean;
  readonly canUseWeapon: boolean;
  readonly movementSpeedMultiplier: number;
  readonly stabilityMultiplier: number;
  readonly accuracyMultiplier: number;
}

export interface WoundSlotV2 {
  readonly schemaVersion: typeof WOUND_SLOT_SCHEMA_VERSION;
  readonly zone: HitZone;
  /** Permanent structural damage. First aid must never lower this value. */
  severity: WoundSeverity;
  /** Treatable bleeding state, kept separate from structural severity. */
  bleedingState: WoundBleedingState;
  bleedingRatePerSecond: number;
  hitCount: number;
  maximumTraumaScore: number;
  lastImpactEnergyJoules: number;
  firstImpactId: string;
  lastImpactId: string;
  firstAppliedSeconds: number;
  lastAppliedSeconds: number;
  firstAidApplicationCount: number;
  lastFirstAidActionId: string | null;
  lastTreatedSeconds: number | null;
}

/** Compatibility name retained for Stage 6 consumers while the persisted slot is V2. */
export type WoundSlotV1 = WoundSlotV2;

export type WoundApplicationReason =
  | 'applied'
  | 'duplicate_impact'
  | 'legacy_impact'
  | 'body_physics_missing'
  | 'target_unit_missing'
  | 'invalid_candidate'
  | 'slot_capacity_reached';

export interface WoundApplicationResultV1 {
  readonly schemaVersion: 1;
  readonly applied: boolean;
  readonly reason: WoundApplicationReason;
  readonly impactId: string | null;
  readonly affectedUnitId: string | null;
  readonly zone: HitZone | null;
  readonly severity: WoundSeverity | null;
  readonly revisionBefore: number;
  readonly revisionAfter: number;
  readonly appliedSeconds: number;
}

export interface UnitWoundRuntimeV2 {
  readonly schemaVersion: typeof UNIT_WOUND_RUNTIME_SCHEMA_VERSION;
  slots: WoundSlotV2[];
  appliedImpactIds: string[];
  capabilities: UnitCombatCapabilitiesV1;
  lastApplication: WoundApplicationResultV1 | null;
  revision: number;
}

/** Compatibility name retained for existing public imports; its persisted schema is V2. */
export type UnitWoundRuntimeV1 = UnitWoundRuntimeV2;

export function compareHitZones(left: HitZone, right: HitZone): number {
  return HIT_ZONE_CANONICAL_ORDER.indexOf(left) - HIT_ZONE_CANONICAL_ORDER.indexOf(right);
}

export function isHitZone(value: unknown): value is HitZone {
  return value === 'head' || value === 'torso' || value === 'arms' || value === 'legs';
}

export function isWoundSeverity(value: unknown): value is WoundSeverity {
  return value === 'light' || value === 'severe' || value === 'critical';
}

export function isWoundBleedingState(value: unknown): value is WoundBleedingState {
  return value === 'none' || value === 'severe' || value === 'critical' || value === 'stopped';
}

export function woundSeverityIndex(value: WoundSeverity): number {
  return value === 'light' ? 0 : value === 'severe' ? 1 : 2;
}

export function woundSeverityAt(index: number): WoundSeverity {
  return index <= 0 ? 'light' : index >= 2 ? 'critical' : 'severe';
}
