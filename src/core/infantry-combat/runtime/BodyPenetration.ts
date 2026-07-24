import type { BallisticDirection3, BallisticPoint3, HitZone } from '../../combat/UnitHitShapes';
import {
  BODY_IMPACT_PHYSICS_SCHEMA_VERSION,
  type BodyImpactPhysicsV1,
  type BodyPenetrationStatus,
} from './InfantryBodyTypes';

export const MAX_BODY_PENETRATIONS_PER_PROJECTILE = 4;
export const BODY_EXIT_EPSILON_METRES = 0.002;
export const MIN_BODY_EXIT_BUDGET = 0.05;
export const MIN_CONTINUING_PROJECTILE_SPEED_METRES_PER_SECOND = 50;

export const BODY_ZONE_BASE_RESISTANCE: Readonly<Record<HitZone, number>> = Object.freeze({
  head: 0.70,
  torso: 1.20,
  arms: 0.45,
  legs: 0.55,
});

export const BODY_ZONE_REFERENCE_THICKNESS_METRES: Readonly<Record<HitZone, number>> = Object.freeze({
  head: 0.22,
  torso: 0.38,
  arms: 0.18,
  legs: 0.24,
});

const PENETRATION_EPSILON = 1e-9;
const MIN_INCIDENCE_COSINE = 0.35;
const MAX_OBLIQUITY_MULTIPLIER = 2.5;
const MIN_THICKNESS_MULTIPLIER = 0.5;
const MAX_THICKNESS_MULTIPLIER = 2;

export interface ResolveBodyPenetrationInput {
  readonly hitUnitId: string;
  readonly hitZone: HitZone;
  readonly hitShapeId: string;
  readonly entryPoint: BallisticPoint3;
  readonly exitPoint: BallisticPoint3 | null;
  readonly entryNormal: BallisticDirection3;
  readonly pathLengthMetres: number;
  readonly projectileMassKilograms: number;
  readonly woundEffectMultiplier: number;
  readonly velocityBeforeMetresPerSecond: BallisticDirection3;
  readonly penetrationBudgetBefore: number;
  readonly penetrationCountBefore: number;
}

export type CalculateBodyImpactPhysicsInput = Omit<
  ResolveBodyPenetrationInput,
  'velocityBeforeMetresPerSecond'
> & {
  readonly velocityBeforeImpact: BallisticDirection3;
};

/** Public Stage 6 name retained by the acceptance fixtures. */
export function calculateBodyImpactPhysics(
  input: CalculateBodyImpactPhysicsInput,
): BodyImpactPhysicsV1 {
  return resolveBodyPenetration({
    ...input,
    velocityBeforeMetresPerSecond: input.velocityBeforeImpact,
  });
}

export interface BodyContinuationState {
  readonly position: BallisticPoint3;
  readonly velocityMetresPerSecond: BallisticDirection3;
}

export function resolveBodyPenetration(input: ResolveBodyPenetrationInput): BodyImpactPhysicsV1 {
  const velocity = finiteVector(input.velocityBeforeMetresPerSecond);
  const speedBefore = Math.hypot(velocity.x, velocity.y, velocity.z);
  const velocityDirection = normalizeVector(velocity, { x: 1, y: 0, z: 0 });
  const entryNormal = normalizeVector(input.entryNormal, {
    x: -velocityDirection.x,
    y: -velocityDirection.y,
    z: -velocityDirection.z,
  });
  const incidenceCosine = clamp(
    Math.abs(
      -velocityDirection.x * entryNormal.x
      - velocityDirection.y * entryNormal.y
      - velocityDirection.z * entryNormal.z
    ),
    0,
    1,
  );
  const obliquityMultiplier = clamp(
    1 / Math.max(MIN_INCIDENCE_COSINE, incidenceCosine),
    1,
    MAX_OBLIQUITY_MULTIPLIER,
  );
  const pathLengthMetres = finiteNonNegative(input.pathLengthMetres);
  const referenceThickness = BODY_ZONE_REFERENCE_THICKNESS_METRES[input.hitZone];
  const thicknessMultiplier = clamp(
    pathLengthMetres / Math.max(PENETRATION_EPSILON, referenceThickness),
    MIN_THICKNESS_MULTIPLIER,
    MAX_THICKNESS_MULTIPLIER,
  );
  const penetrationResistance = BODY_ZONE_BASE_RESISTANCE[input.hitZone]
    * obliquityMultiplier
    * thicknessMultiplier;
  const penetrationBudgetBefore = finiteNonNegative(input.penetrationBudgetBefore);
  const penetrationBudgetAfter = Math.max(0, penetrationBudgetBefore - penetrationResistance);
  const penetrationCountBefore = boundedInteger(input.penetrationCountBefore, 0, 255);
  const penetrationCountAfter = Math.min(255, penetrationCountBefore + 1);
  const projectileMassKilograms = finiteNonNegative(input.projectileMassKilograms);
  const impactEnergyJoules = 0.5 * projectileMassKilograms * speedBefore * speedBefore;
  const energyRatio = clamp(
    penetrationBudgetAfter / Math.max(penetrationBudgetBefore, PENETRATION_EPSILON),
    0,
    1,
  );
  const calculatedSpeedAfter = speedBefore * Math.sqrt(energyRatio);
  const hasValidExit = input.exitPoint !== null && validPoint(input.exitPoint);
  let status: BodyPenetrationStatus = 'stopped';
  if (penetrationCountAfter > MAX_BODY_PENETRATIONS_PER_PROJECTILE) {
    status = 'penetration_limit';
  } else if (
    hasValidExit
    && penetrationBudgetAfter > MIN_BODY_EXIT_BUDGET
    && calculatedSpeedAfter >= MIN_CONTINUING_PROJECTILE_SPEED_METRES_PER_SECOND
  ) {
    status = 'penetrated';
  }
  const speedAfter = status === 'penetrated' ? Math.min(speedBefore, calculatedSpeedAfter) : 0;
  return {
    schemaVersion: BODY_IMPACT_PHYSICS_SCHEMA_VERSION,
    hitUnitId: cleanText(input.hitUnitId),
    hitZone: input.hitZone,
    hitShapeId: cleanText(input.hitShapeId),
    entryPoint: finitePoint(input.entryPoint),
    exitPoint: hasValidExit && input.exitPoint ? finitePoint(input.exitPoint) : null,
    entryNormal,
    pathLengthMetres: canonical(pathLengthMetres),
    projectileMassKilograms: canonical(projectileMassKilograms),
    woundEffectMultiplier: canonical(finiteNonNegative(input.woundEffectMultiplier)),
    speedBeforeMetresPerSecond: canonical(speedBefore),
    speedAfterMetresPerSecond: canonical(speedAfter),
    impactEnergyJoules: canonical(impactEnergyJoules),
    incidenceCosine: canonical(incidenceCosine),
    penetrationBudgetBefore: canonical(penetrationBudgetBefore),
    penetrationResistance: canonical(penetrationResistance),
    penetrationBudgetAfter: canonical(penetrationBudgetAfter),
    penetrationCountBefore,
    penetrationCountAfter,
    status,
  };
}

export function createBodyContinuationState(
  physics: BodyImpactPhysicsV1,
  velocityBefore: BallisticDirection3,
): BodyContinuationState | null {
  if (physics.status !== 'penetrated' || !physics.exitPoint) return null;
  if (physics.speedAfterMetresPerSecond < MIN_CONTINUING_PROJECTILE_SPEED_METRES_PER_SECOND) return null;
  const direction = normalizeVector(velocityBefore, { x: 1, y: 0, z: 0 });
  return {
    position: {
      xMetres: physics.exitPoint.xMetres + direction.x * BODY_EXIT_EPSILON_METRES,
      yMetres: physics.exitPoint.yMetres + direction.y * BODY_EXIT_EPSILON_METRES,
      zMetres: physics.exitPoint.zMetres + direction.z * BODY_EXIT_EPSILON_METRES,
    },
    velocityMetresPerSecond: {
      x: direction.x * physics.speedAfterMetresPerSecond,
      y: direction.y * physics.speedAfterMetresPerSecond,
      z: direction.z * physics.speedAfterMetresPerSecond,
    },
  };
}

function normalizeVector(value: BallisticDirection3, fallback: BallisticDirection3): BallisticDirection3 {
  const vector = finiteVector(value);
  const magnitude = Math.hypot(vector.x, vector.y, vector.z);
  if (magnitude <= PENETRATION_EPSILON) return { ...fallback };
  return { x: vector.x / magnitude, y: vector.y / magnitude, z: vector.z / magnitude };
}
function finiteVector(value: BallisticDirection3): BallisticDirection3 {
  return { x: finite(value.x), y: finite(value.y), z: finite(value.z) };
}
function finitePoint(value: BallisticPoint3): BallisticPoint3 {
  return { xMetres: finite(value.xMetres), yMetres: finite(value.yMetres), zMetres: finite(value.zMetres) };
}
function validPoint(value: BallisticPoint3): boolean {
  return Number.isFinite(value.xMetres) && Number.isFinite(value.yMetres) && Number.isFinite(value.zMetres);
}
function finite(value: number): number { return Number.isFinite(value) ? value : 0; }
function finiteNonNegative(value: number): number { return Math.max(0, finite(value)); }
function boundedInteger(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? Math.round(value) : minimum));
}
function cleanText(value: string): string { return typeof value === 'string' ? value.trim() : ''; }
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}
function canonical(value: number): number {
  return Math.round(value * 1_000_000_000_000) / 1_000_000_000_000;
}
