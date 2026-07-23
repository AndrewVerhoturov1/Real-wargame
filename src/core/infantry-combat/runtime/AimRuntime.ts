import type { WeaponDefinitionV1, WeaponProficiency } from '../catalogs/CombatCatalogTypes';
import { normalizeDirection, type BallisticDirection3, type BallisticPoint3 } from '../../combat/UnitHitShapes';
import type { SimulationState } from '../../simulation/SimulationState';
import type { UnitModel } from '../../units/UnitModel';
import { getWeaponAnchor } from './MuzzleGeometry';
import { STAGE3_GRAVITY_METRES_PER_SECOND_SQUARED } from './ProjectileRuntimeTypes';
import {
  AIM_FACTOR_BREAKDOWN_SCHEMA_VERSION,
  AIM_SOLUTION_RUNTIME_SCHEMA_VERSION,
  AIM_TRACKING_RUNTIME_SCHEMA_VERSION,
  WEAPON_RECOIL_RUNTIME_SCHEMA_VERSION,
  type AimFactorBreakdownV1,
  type AimPerceptionSampleV1,
  type AimSolutionRuntimeV1,
  type AimTrackingRuntimeV1,
  type FireTaskRuntimeV1,
  type InfantryWeaponInstanceV1,
  type WeaponRecoilRuntimeV1,
} from './InfantryCombatRuntimeTypes';

export const AIM_TRACKING_INTERVAL_SECONDS = 0.2;
export const AIM_LEAD_ITERATIONS = 3;
export const AIM_VELOCITY_SMOOTHING_ALPHA = 0.5;
export const MAX_ESTIMATED_TARGET_SPEED_METRES_PER_SECOND = 25;
export const AIM_DIRECTION_PROGRESS_PER_SECOND = 2.5;
export const COARSE_HUMAN_TARGET_RADIUS_METRES = 0.45;
const EPSILON = 1e-9;

export interface AimFactorInput {
  readonly weapon: WeaponDefinitionV1;
  readonly posture: UnitModel['behaviorRuntime']['posture'];
  readonly isMoving: boolean;
  readonly movementSpeedMetresPerSecond: number;
  readonly shootingSkill: number;
  readonly proficiency: WeaponProficiency;
  readonly fatigue: number;
  readonly woundStabilityMultiplier: number;
}

export interface PredictedHitProbabilityInput {
  readonly distanceMetres: number;
  readonly targetRadiusMetres: number;
  readonly effectiveDispersionRadians: number;
  readonly aimQuality: number;
  readonly solutionQuality: number;
  readonly uncertaintyMetres: number;
  readonly contactAgeSeconds: number;
}

export interface SeededAngularOffsetInput {
  readonly shooterId: string;
  readonly weaponInstanceId: string;
  readonly shotId: string;
  readonly effectiveDispersionRadians: number;
}

export interface SeededAngularOffsetsV1 {
  readonly pitchRadians: number;
  readonly yawRadians: number;
}

export interface PreparedShotDirectionInput {
  readonly aimDirection: BallisticDirection3;
  readonly recoilPitchRadians: number;
  readonly recoilYawRadians: number;
  readonly dispersionPitchRadians: number;
  readonly dispersionYawRadians: number;
}

export function createAimTrackingRuntime(
  requestedSeconds: number,
  initialDirection: BallisticDirection3 = { x: 1, y: 0, z: 0 },
): AimTrackingRuntimeV1 {
  const direction = normalizeDirection(initialDirection);
  return {
    schemaVersion: AIM_TRACKING_RUNTIME_SCHEMA_VERSION,
    trackingIntervalSeconds: AIM_TRACKING_INTERVAL_SECONDS,
    lastTrackingBoundarySeconds: null,
    nextTrackingBoundarySeconds: canonicalSeconds(requestedSeconds + AIM_TRACKING_INTERVAL_SECONDS),
    trackingUpdateCount: 0,
    previousSample: null,
    lastSample: null,
    solution: {
      schemaVersion: AIM_SOLUTION_RUNTIME_SCHEMA_VERSION,
      valid: false,
      invalidReason: 'not_tracked_yet',
      perceivedPosition: null,
      previousPerceivedPosition: null,
      perceivedSampleSeconds: null,
      previousPerceivedSampleSeconds: null,
      estimatedVelocityMetresPerSecond: { x: 0, y: 0, z: 0 },
      contactAgeSeconds: 0,
      uncertaintyCells: 0,
      predictedAimPoint: null,
      desiredDirection: direction,
      currentDirection: direction,
      directionSegmentStart: direction,
      directionProgress: 0,
      physicalAimQuality: 0,
      solutionQuality: 0,
      usableAimQuality: 0,
      predictedHitProbability: 0,
      effectiveDispersionRadians: 0,
      factors: createNeutralAimFactorBreakdown(),
    },
  };
}

export function normalizeAimTrackingRuntime(
  value: unknown,
  requestedSeconds: number,
  fallbackDirection: BallisticDirection3,
): AimTrackingRuntimeV1 {
  const fallback = createAimTrackingRuntime(requestedSeconds, fallbackDirection);
  if (!isRecord(value) || value.schemaVersion !== AIM_TRACKING_RUNTIME_SCHEMA_VERSION) return fallback;
  const solution = normalizeAimSolution(value.solution, fallback.solution);
  const lastBoundary = nullableSeconds(value.lastTrackingBoundarySeconds);
  const nextBoundaryFallback = lastBoundary === null
    ? requestedSeconds + AIM_TRACKING_INTERVAL_SECONDS
    : lastBoundary + AIM_TRACKING_INTERVAL_SECONDS;
  return {
    schemaVersion: AIM_TRACKING_RUNTIME_SCHEMA_VERSION,
    trackingIntervalSeconds: AIM_TRACKING_INTERVAL_SECONDS,
    lastTrackingBoundarySeconds: lastBoundary,
    nextTrackingBoundarySeconds: canonicalSeconds(finiteNonNegative(value.nextTrackingBoundarySeconds, nextBoundaryFallback)),
    trackingUpdateCount: integer(value.trackingUpdateCount, 0, 0, Number.MAX_SAFE_INTEGER),
    previousSample: normalizeSample(value.previousSample),
    lastSample: normalizeSample(value.lastSample),
    solution,
  };
}

export function serializeAimTrackingRuntime(value: AimTrackingRuntimeV1): AimTrackingRuntimeV1 {
  return normalizeAimTrackingRuntime(structuredClone(value), 0, value.solution.currentDirection);
}

export function calculateAimFactorBreakdown(input: AimFactorInput): AimFactorBreakdownV1 {
  const shootingSkill = clamp01(input.shootingSkill);
  const fatigue = clamp01(input.fatigue);
  const woundStabilityMultiplier = clamp(input.woundStabilityMultiplier, 0.2, 1);
  const movementSpeed = Math.max(0, finite(input.movementSpeedMetresPerSecond, 0));
  const postureDispersionMultiplier = positive(
    input.weapon.postureDispersionMultiplier[input.posture],
    1,
  );
  const movementIntensity = input.isMoving ? clamp01(movementSpeed / 4) : 0;
  const movementDispersionMultiplier = input.isMoving
    ? positive(input.weapon.movingDispersionMultiplier, 1) * (1 + 0.25 * movementIntensity)
    : 1;
  const skillDispersionMultiplier = lerp(1.35, 0.7, shootingSkill);
  const proficiencyDispersionMultiplier = proficiencyValue(input.proficiency, 1.3, 1, 0.82);
  const fatigueDispersionMultiplier = 1 + fatigue * 0.6;
  const woundDispersionMultiplier = 1 / woundStabilityMultiplier;
  const postureAimMultiplier = 1 / Math.sqrt(Math.max(0.25, postureDispersionMultiplier));
  const movementAimMultiplier = 1 / Math.sqrt(Math.max(1, movementDispersionMultiplier));
  const skillAimMultiplier = lerp(0.65, 1.35, shootingSkill);
  const proficiencyAimMultiplier = proficiencyValue(input.proficiency, 0.75, 1, 1.15);
  const fatigueAimMultiplier = 1 - fatigue * 0.45;
  const aimRateMultiplier = postureAimMultiplier
    * movementAimMultiplier
    * skillAimMultiplier
    * proficiencyAimMultiplier
    * fatigueAimMultiplier
    * woundStabilityMultiplier;
  const recoilRecoveryMultiplier = clamp(
    postureAimMultiplier * lerp(0.75, 1.35, shootingSkill) * proficiencyAimMultiplier * fatigueAimMultiplier * woundStabilityMultiplier,
    0.1,
    3,
  );
  const recoilImpulseMultiplier = clamp(
    postureDispersionMultiplier
      * lerp(1.25, 0.7, shootingSkill)
      * proficiencyValue(input.proficiency, 1.25, 1, 0.82)
      * fatigueDispersionMultiplier
      * woundDispersionMultiplier,
    0.2,
    5,
  );
  const effectiveDispersionRadians = Math.max(0, finite(input.weapon.baseDispersionRadians, 0))
    * postureDispersionMultiplier
    * movementDispersionMultiplier
    * skillDispersionMultiplier
    * proficiencyDispersionMultiplier
    * fatigueDispersionMultiplier
    * woundDispersionMultiplier;
  return {
    schemaVersion: AIM_FACTOR_BREAKDOWN_SCHEMA_VERSION,
    posture: input.posture,
    isMoving: input.isMoving,
    movementSpeedMetresPerSecond: movementSpeed,
    shootingSkill,
    proficiency: input.proficiency,
    fatigue,
    woundStabilityMultiplier,
    postureDispersionMultiplier,
    movementDispersionMultiplier,
    skillDispersionMultiplier,
    proficiencyDispersionMultiplier,
    fatigueDispersionMultiplier,
    woundDispersionMultiplier,
    aimRateMultiplier,
    recoilRecoveryMultiplier,
    recoilImpulseMultiplier,
    effectiveDispersionRadians,
    aimQualityPerSecond: Math.max(0, finite(input.weapon.aimQualityPerSecond, 0)) * aimRateMultiplier,
  };
}

/** Stage 5 deliberately keeps Stage 6-7 capability inputs neutral in production. */
export function getNeutralAimCapabilityModifiers(): { readonly fatigue: 0; readonly woundStabilityMultiplier: 1 } {
  return { fatigue: 0, woundStabilityMultiplier: 1 };
}

export function resolveProductionAimFactors(
  state: Pick<SimulationState, 'map'>,
  shooter: UnitModel,
  weapon: InfantryWeaponInstanceV1,
): AimFactorBreakdownV1 {
  const neutral = getNeutralAimCapabilityModifiers();
  return calculateAimFactorBreakdown({
    weapon: weapon.resolved.weapon,
    posture: shooter.behaviorRuntime.posture,
    isMoving: shooter.movementRuntime.isMoving,
    movementSpeedMetresPerSecond: Math.hypot(
      shooter.movementRuntime.velocityCellsPerSecond.x,
      shooter.movementRuntime.velocityCellsPerSecond.y,
    ) * state.map.metersPerCell,
    shootingSkill: weapon.operatorProfile.shootingSkill,
    proficiency: weapon.operatorProfile.proficiencyByWeaponClass[weapon.resolved.weapon.weaponClass],
    fatigue: neutral.fatigue,
    woundStabilityMultiplier: neutral.woundStabilityMultiplier,
  });
}

export function updateAimTrackingAtBoundary(
  state: Pick<SimulationState, 'map'>,
  shooter: UnitModel,
  task: FireTaskRuntimeV1,
  weapon: InfantryWeaponInstanceV1,
  boundarySeconds: number,
): AimSolutionRuntimeV1 {
  const boundary = canonicalSeconds(boundarySeconds);
  const tracking = task.aimTracking;
  const factors = resolveProductionAimFactors(state, shooter, weapon);
  const muzzle = getWeaponAnchor(state.map, shooter);
  let perceivedPosition: BallisticPoint3 | null = null;
  let solutionQuality = 1;
  let contactAgeSeconds = 0;
  let uncertaintyCells = 0;

  if (task.contactId) {
    const contact = shooter.perceptionKnowledge.contacts.find((entry) => entry.id === task.contactId) ?? null;
    if (!contact) {
      invalidateSolution(task, factors, 'contact_missing', boundary);
      return task.aimTracking.solution;
    }
    const contactPosition: BallisticPoint3 = {
      xMetres: contact.lastKnownPosition.x * state.map.metersPerCell,
      yMetres: contact.lastKnownPosition.y * state.map.metersPerCell,
      zMetres: task.target.zMetres,
    };
    if (!isFinitePoint(contactPosition)) {
      invalidateSolution(task, factors, 'invalid_perceived_position', boundary);
      return task.aimTracking.solution;
    }
    const sourceUpdatedSeconds = canonicalSeconds(Math.max(0, contact.lastUpdatedSeconds));
    if (!tracking.lastSample || sourceUpdatedSeconds > tracking.lastSample.sourceUpdatedSeconds + EPSILON) {
      tracking.previousSample = tracking.lastSample ? structuredClone(tracking.lastSample) : null;
      tracking.lastSample = {
        position: contactPosition,
        observedSeconds: canonicalSeconds(Math.max(0, contact.lastObservedSeconds)),
        sourceUpdatedSeconds,
      };
      updateEstimatedVelocity(tracking);
    }
    perceivedPosition = structuredClone(tracking.lastSample?.position ?? contactPosition);
    const freshnessSeconds = Math.max(contact.lastObservedSeconds, contact.lastUpdatedSeconds, 0);
    contactAgeSeconds = Math.max(0, boundary - freshnessSeconds);
    uncertaintyCells = Math.max(0, finite(contact.uncertaintyCells, 0));
    solutionQuality = calculatePerceptionSolutionQuality({
      confidence: contact.confidence,
      uncertaintyMetres: uncertaintyCells * state.map.metersPerCell,
      contactAgeSeconds,
      visibleNow: contact.visibleNow,
      observedNow: contact.observedNow,
    });
  } else {
    perceivedPosition = structuredClone(task.target);
    tracking.previousSample = null;
    tracking.lastSample = null;
    tracking.solution.estimatedVelocityMetresPerSecond = { x: 0, y: 0, z: 0 };
  }

  const muzzleVelocity = weapon.resolved.ammo.muzzleVelocityMetersPerSecond;
  if (!(muzzleVelocity > 0) || !Number.isFinite(muzzleVelocity)) {
    invalidateSolution(task, factors, 'invalid_muzzle_velocity', boundary);
    return task.aimTracking.solution;
  }
  const predictedAimPoint = calculateLeadPoint(
    muzzle,
    perceivedPosition,
    tracking.solution.estimatedVelocityMetresPerSecond,
    muzzleVelocity,
  );
  const desiredDirection = directionBetween(muzzle, predictedAimPoint);
  if (!desiredDirection) {
    invalidateSolution(task, factors, 'invalid_geometry', boundary);
    return task.aimTracking.solution;
  }

  const solution = tracking.solution;
  solution.valid = true;
  solution.invalidReason = null;
  solution.previousPerceivedPosition = solution.perceivedPosition ? structuredClone(solution.perceivedPosition) : null;
  solution.perceivedPosition = structuredClone(perceivedPosition);
  solution.previousPerceivedSampleSeconds = solution.perceivedSampleSeconds;
  solution.perceivedSampleSeconds = tracking.lastSample?.sourceUpdatedSeconds ?? boundary;
  solution.contactAgeSeconds = contactAgeSeconds;
  solution.uncertaintyCells = uncertaintyCells;
  solution.predictedAimPoint = predictedAimPoint;
  solution.directionSegmentStart = structuredClone(solution.currentDirection);
  solution.directionProgress = 0;
  solution.desiredDirection = desiredDirection;
  solution.solutionQuality = clamp01(solutionQuality);
  solution.factors = factors;
  refreshUsableAimQuality(task);
  solution.effectiveDispersionRadians = effectiveDispersionForProgress(factors, solution.physicalAimQuality);
  solution.predictedHitProbability = calculatePredictedHitProbability({
    distanceMetres: distanceBetween(muzzle, perceivedPosition),
    targetRadiusMetres: task.targetRadiusMetres > 0 ? task.targetRadiusMetres : COARSE_HUMAN_TARGET_RADIUS_METRES,
    effectiveDispersionRadians: solution.effectiveDispersionRadians,
    aimQuality: solution.usableAimQuality,
    solutionQuality: solution.solutionQuality,
    uncertaintyMetres: uncertaintyCells * state.map.metersPerCell,
    contactAgeSeconds,
  });
  completeBoundary(tracking, boundary);
  return solution;
}

export function advanceAimPhysicalProgress(
  task: FireTaskRuntimeV1,
  factors: AimFactorBreakdownV1,
  deltaSeconds: number,
): void {
  const delta = Math.max(0, finite(deltaSeconds, 0));
  const solution = task.aimTracking.solution;
  solution.factors = factors;
  solution.physicalAimQuality = clamp01(solution.physicalAimQuality + factors.aimQualityPerSecond * delta);
  solution.directionProgress = clamp01(
    solution.directionProgress + AIM_DIRECTION_PROGRESS_PER_SECOND * Math.max(0.1, factors.aimRateMultiplier) * delta,
  );
  solution.currentDirection = interpolateDirection(
    solution.directionSegmentStart,
    solution.desiredDirection,
    solution.directionProgress,
  );
  solution.effectiveDispersionRadians = effectiveDispersionForProgress(factors, solution.physicalAimQuality);
  refreshUsableAimQuality(task);
}

export function calculatePredictedHitProbability(input: PredictedHitProbabilityInput): number {
  const distanceMetres = Math.max(0, finite(input.distanceMetres, 0));
  const targetRadiusMetres = Math.max(0.01, finite(input.targetRadiusMetres, COARSE_HUMAN_TARGET_RADIUS_METRES));
  const dispersion = Math.max(0, finite(input.effectiveDispersionRadians, 0));
  const uncertainty = Math.max(0, finite(input.uncertaintyMetres, 0));
  const spreadRadiusMetres = distanceMetres * Math.tan(Math.min(Math.PI / 3, dispersion)) + uncertainty;
  const geometricProbability = targetRadiusMetres * targetRadiusMetres
    / (targetRadiusMetres * targetRadiusMetres + spreadRadiusMetres * spreadRadiusMetres);
  const freshness = 1 / (1 + Math.max(0, finite(input.contactAgeSeconds, 0)) / 5);
  return clamp01(
    geometricProbability
      * clamp01(input.aimQuality)
      * clamp01(input.solutionQuality)
      * freshness,
  );
}

export function deriveSeededAngularOffsets(input: SeededAngularOffsetInput): SeededAngularOffsetsV1 {
  const seed = hash32(`${input.shooterId}\u0000${input.weaponInstanceId}\u0000${input.shotId}`);
  const first = unitFloat(mix32(seed ^ 0x9e3779b9));
  const second = unitFloat(mix32(seed ^ 0x85ebca6b));
  const radius = Math.sqrt(first) * Math.max(0, finite(input.effectiveDispersionRadians, 0));
  const angle = second * Math.PI * 2;
  return {
    yawRadians: radius * Math.cos(angle),
    pitchRadians: radius * Math.sin(angle),
  };
}

export function prepareCommittedShotDirection(input: PreparedShotDirectionInput): BallisticDirection3 {
  const forward = normalizeDirection(input.aimDirection);
  const referenceUp = Math.abs(forward.z) > 0.95 ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
  const right = normalizeDirection(cross(referenceUp, forward));
  const up = normalizeDirection(cross(forward, right));
  const yaw = finite(input.recoilYawRadians, 0) + finite(input.dispersionYawRadians, 0);
  const pitch = finite(input.recoilPitchRadians, 0) + finite(input.dispersionPitchRadians, 0);
  return normalizeDirection({
    x: forward.x + right.x * Math.tan(yaw) + up.x * Math.tan(pitch),
    y: forward.y + right.y * Math.tan(yaw) + up.y * Math.tan(pitch),
    z: forward.z + right.z * Math.tan(yaw) + up.z * Math.tan(pitch),
  });
}

export function createWeaponRecoilRuntime(): WeaponRecoilRuntimeV1 {
  return {
    schemaVersion: WEAPON_RECOIL_RUNTIME_SCHEMA_VERSION,
    pitchOffsetRadians: 0,
    yawOffsetRadians: 0,
    lastUpdatedSeconds: 0,
    sequence: 0,
  };
}

export function normalizeWeaponRecoilRuntime(value: unknown): WeaponRecoilRuntimeV1 {
  if (!isRecord(value) || value.schemaVersion !== WEAPON_RECOIL_RUNTIME_SCHEMA_VERSION) return createWeaponRecoilRuntime();
  return {
    schemaVersion: WEAPON_RECOIL_RUNTIME_SCHEMA_VERSION,
    pitchOffsetRadians: finite(value.pitchOffsetRadians, 0),
    yawOffsetRadians: finite(value.yawOffsetRadians, 0),
    lastUpdatedSeconds: finiteNonNegative(value.lastUpdatedSeconds, 0),
    sequence: integer(value.sequence, 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

export function getRecoveredWeaponRecoil(
  weapon: InfantryWeaponInstanceV1,
  simulationSeconds: number,
  factors: AimFactorBreakdownV1,
): WeaponRecoilRuntimeV1 {
  const elapsed = Math.max(0, finite(simulationSeconds, 0) - weapon.recoil.lastUpdatedSeconds);
  const pitchRecovery = Math.max(0, weapon.resolved.weapon.recoilRecoveryPitchRadiansPerSecond)
    * factors.recoilRecoveryMultiplier * elapsed;
  const yawRecovery = Math.max(0, weapon.resolved.weapon.recoilRecoveryYawRadiansPerSecond)
    * factors.recoilRecoveryMultiplier * elapsed;
  return {
    schemaVersion: WEAPON_RECOIL_RUNTIME_SCHEMA_VERSION,
    pitchOffsetRadians: approachZero(weapon.recoil.pitchOffsetRadians, pitchRecovery),
    yawOffsetRadians: approachZero(weapon.recoil.yawOffsetRadians, yawRecovery),
    lastUpdatedSeconds: canonicalSeconds(Math.max(weapon.recoil.lastUpdatedSeconds, simulationSeconds)),
    sequence: weapon.recoil.sequence,
  };
}

export function applySuccessfulShotRecoil(
  weapon: InfantryWeaponInstanceV1,
  simulationSeconds: number,
  shotId: string,
  factors: AimFactorBreakdownV1,
): void {
  const recovered = getRecoveredWeaponRecoil(weapon, simulationSeconds, factors);
  const yawUnit = unitFloat(mix32(hash32(`${shotId}\u0000recoil-yaw`))) * 2 - 1;
  weapon.recoil = {
    schemaVersion: WEAPON_RECOIL_RUNTIME_SCHEMA_VERSION,
    pitchOffsetRadians: recovered.pitchOffsetRadians
      + weapon.resolved.weapon.recoilPitchRadians * factors.recoilImpulseMultiplier,
    yawOffsetRadians: recovered.yawOffsetRadians
      + weapon.resolved.weapon.recoilYawRadians * yawUnit * factors.recoilImpulseMultiplier,
    lastUpdatedSeconds: canonicalSeconds(simulationSeconds),
    sequence: recovered.sequence + 1,
  };
}

export function calculateLeadPoint(
  muzzle: BallisticPoint3,
  perceivedPosition: BallisticPoint3,
  estimatedVelocityMetresPerSecond: BallisticDirection3,
  muzzleVelocityMetresPerSecond: number,
): BallisticPoint3 {
  let predicted = structuredClone(perceivedPosition);
  for (let iteration = 0; iteration < AIM_LEAD_ITERATIONS; iteration += 1) {
    const flightTime = distanceBetween(muzzle, predicted) / muzzleVelocityMetresPerSecond;
    predicted = {
      xMetres: perceivedPosition.xMetres + estimatedVelocityMetresPerSecond.x * flightTime,
      yMetres: perceivedPosition.yMetres + estimatedVelocityMetresPerSecond.y * flightTime,
      zMetres: perceivedPosition.zMetres
        + estimatedVelocityMetresPerSecond.z * flightTime
        + 0.5 * STAGE3_GRAVITY_METRES_PER_SECOND_SQUARED * flightTime * flightTime,
    };
  }
  return predicted;
}

function updateEstimatedVelocity(tracking: AimTrackingRuntimeV1): void {
  const previous = tracking.previousSample;
  const current = tracking.lastSample;
  if (!previous || !current) {
    tracking.solution.estimatedVelocityMetresPerSecond = { x: 0, y: 0, z: 0 };
    return;
  }
  const deltaSeconds = current.sourceUpdatedSeconds - previous.sourceUpdatedSeconds;
  if (!(deltaSeconds > EPSILON)) return;
  const raw = clampVectorMagnitude({
    x: (current.position.xMetres - previous.position.xMetres) / deltaSeconds,
    y: (current.position.yMetres - previous.position.yMetres) / deltaSeconds,
    z: (current.position.zMetres - previous.position.zMetres) / deltaSeconds,
  }, MAX_ESTIMATED_TARGET_SPEED_METRES_PER_SECOND);
  const old = tracking.solution.estimatedVelocityMetresPerSecond;
  const oldMagnitude = Math.hypot(old.x, old.y, old.z);
  tracking.solution.estimatedVelocityMetresPerSecond = oldMagnitude <= EPSILON
    ? raw
    : {
        x: lerp(old.x, raw.x, AIM_VELOCITY_SMOOTHING_ALPHA),
        y: lerp(old.y, raw.y, AIM_VELOCITY_SMOOTHING_ALPHA),
        z: lerp(old.z, raw.z, AIM_VELOCITY_SMOOTHING_ALPHA),
      };
}

function calculatePerceptionSolutionQuality(input: {
  readonly confidence: number;
  readonly uncertaintyMetres: number;
  readonly contactAgeSeconds: number;
  readonly visibleNow: boolean;
  readonly observedNow: boolean;
}): number {
  const confidence = clamp01(input.confidence / 100);
  const uncertainty = 1 / (1 + Math.max(0, input.uncertaintyMetres) / 2);
  const freshness = 1 / (1 + Math.max(0, input.contactAgeSeconds) / 2);
  const observation = input.observedNow ? 1 : input.visibleNow ? 0.9 : 0.7;
  return clamp01(confidence * uncertainty * freshness * observation);
}

function invalidateSolution(
  task: FireTaskRuntimeV1,
  factors: AimFactorBreakdownV1,
  reason: AimSolutionRuntimeV1['invalidReason'],
  boundary: number,
): void {
  const solution = task.aimTracking.solution;
  solution.valid = false;
  solution.invalidReason = reason;
  solution.solutionQuality = 0;
  solution.usableAimQuality = 0;
  solution.predictedHitProbability = 0;
  solution.effectiveDispersionRadians = effectiveDispersionForProgress(factors, solution.physicalAimQuality);
  solution.factors = factors;
  task.aimQuality = 0;
  completeBoundary(task.aimTracking, boundary);
}

function completeBoundary(tracking: AimTrackingRuntimeV1, boundary: number): void {
  tracking.lastTrackingBoundarySeconds = boundary;
  tracking.nextTrackingBoundarySeconds = canonicalSeconds(boundary + AIM_TRACKING_INTERVAL_SECONDS);
  tracking.trackingUpdateCount += 1;
}

function refreshUsableAimQuality(task: FireTaskRuntimeV1): void {
  const solution = task.aimTracking.solution;
  solution.usableAimQuality = clamp01(solution.physicalAimQuality * solution.solutionQuality);
  task.aimQuality = solution.usableAimQuality;
}

function effectiveDispersionForProgress(factors: AimFactorBreakdownV1, physicalAimQuality: number): number {
  return factors.effectiveDispersionRadians * (1 + (1 - clamp01(physicalAimQuality)) * 2);
}

function createNeutralAimFactorBreakdown(): AimFactorBreakdownV1 {
  return {
    schemaVersion: AIM_FACTOR_BREAKDOWN_SCHEMA_VERSION,
    posture: 'standing',
    isMoving: false,
    movementSpeedMetresPerSecond: 0,
    shootingSkill: 0.5,
    proficiency: 'trained',
    fatigue: 0,
    woundStabilityMultiplier: 1,
    postureDispersionMultiplier: 1,
    movementDispersionMultiplier: 1,
    skillDispersionMultiplier: 1,
    proficiencyDispersionMultiplier: 1,
    fatigueDispersionMultiplier: 1,
    woundDispersionMultiplier: 1,
    aimRateMultiplier: 1,
    recoilRecoveryMultiplier: 1,
    recoilImpulseMultiplier: 1,
    effectiveDispersionRadians: 0,
    aimQualityPerSecond: 0,
  };
}

function normalizeAimSolution(value: unknown, fallback: AimSolutionRuntimeV1): AimSolutionRuntimeV1 {
  if (!isRecord(value) || value.schemaVersion !== AIM_SOLUTION_RUNTIME_SCHEMA_VERSION) return structuredClone(fallback);
  const currentDirection = normalizeStoredDirection(value.currentDirection, fallback.currentDirection);
  const factors = normalizeFactors(value.factors, fallback.factors);
  return {
    schemaVersion: AIM_SOLUTION_RUNTIME_SCHEMA_VERSION,
    valid: value.valid === true,
    invalidReason: normalizeInvalidReason(value.invalidReason),
    perceivedPosition: normalizePoint(value.perceivedPosition),
    previousPerceivedPosition: normalizePoint(value.previousPerceivedPosition),
    perceivedSampleSeconds: nullableSeconds(value.perceivedSampleSeconds),
    previousPerceivedSampleSeconds: nullableSeconds(value.previousPerceivedSampleSeconds),
    estimatedVelocityMetresPerSecond: normalizeStoredDirection(value.estimatedVelocityMetresPerSecond, { x: 0, y: 0, z: 0 }, false),
    contactAgeSeconds: finiteNonNegative(value.contactAgeSeconds, 0),
    uncertaintyCells: finiteNonNegative(value.uncertaintyCells, 0),
    predictedAimPoint: normalizePoint(value.predictedAimPoint),
    desiredDirection: normalizeStoredDirection(value.desiredDirection, currentDirection),
    currentDirection,
    directionSegmentStart: normalizeStoredDirection(value.directionSegmentStart, currentDirection),
    directionProgress: clamp01(finite(value.directionProgress, 0)),
    physicalAimQuality: clamp01(finite(value.physicalAimQuality, 0)),
    solutionQuality: clamp01(finite(value.solutionQuality, 0)),
    usableAimQuality: clamp01(finite(value.usableAimQuality, 0)),
    predictedHitProbability: clamp01(finite(value.predictedHitProbability, 0)),
    effectiveDispersionRadians: finiteNonNegative(value.effectiveDispersionRadians, 0),
    factors,
  };
}

function normalizeFactors(value: unknown, fallback: AimFactorBreakdownV1): AimFactorBreakdownV1 {
  if (!isRecord(value) || value.schemaVersion !== AIM_FACTOR_BREAKDOWN_SCHEMA_VERSION) return structuredClone(fallback);
  const proficiency = normalizeProficiency(value.proficiency);
  const posture = value.posture === 'crouched' || value.posture === 'prone' ? value.posture : 'standing';
  return {
    schemaVersion: AIM_FACTOR_BREAKDOWN_SCHEMA_VERSION,
    posture,
    isMoving: value.isMoving === true,
    movementSpeedMetresPerSecond: finiteNonNegative(value.movementSpeedMetresPerSecond, 0),
    shootingSkill: clamp01(finite(value.shootingSkill, 0.5)),
    proficiency,
    fatigue: clamp01(finite(value.fatigue, 0)),
    woundStabilityMultiplier: clamp(finite(value.woundStabilityMultiplier, 1), 0.2, 1),
    postureDispersionMultiplier: positive(value.postureDispersionMultiplier, 1),
    movementDispersionMultiplier: positive(value.movementDispersionMultiplier, 1),
    skillDispersionMultiplier: positive(value.skillDispersionMultiplier, 1),
    proficiencyDispersionMultiplier: positive(value.proficiencyDispersionMultiplier, 1),
    fatigueDispersionMultiplier: positive(value.fatigueDispersionMultiplier, 1),
    woundDispersionMultiplier: positive(value.woundDispersionMultiplier, 1),
    aimRateMultiplier: finiteNonNegative(value.aimRateMultiplier, 1),
    recoilRecoveryMultiplier: finiteNonNegative(value.recoilRecoveryMultiplier, 1),
    recoilImpulseMultiplier: finiteNonNegative(value.recoilImpulseMultiplier, 1),
    effectiveDispersionRadians: finiteNonNegative(value.effectiveDispersionRadians, 0),
    aimQualityPerSecond: finiteNonNegative(value.aimQualityPerSecond, 0),
  };
}

function normalizeSample(value: unknown): AimPerceptionSampleV1 | null {
  if (!isRecord(value)) return null;
  const position = normalizePoint(value.position);
  if (!position) return null;
  return {
    position,
    observedSeconds: finiteNonNegative(value.observedSeconds, 0),
    sourceUpdatedSeconds: finiteNonNegative(value.sourceUpdatedSeconds, 0),
  };
}

function normalizeInvalidReason(value: unknown): AimSolutionRuntimeV1['invalidReason'] {
  return value === 'not_tracked_yet'
    || value === 'contact_missing'
    || value === 'invalid_perceived_position'
    || value === 'invalid_muzzle_velocity'
    || value === 'invalid_geometry'
    ? value
    : null;
}

function normalizeProficiency(value: unknown): WeaponProficiency {
  return value === 'untrained' || value === 'specialist' ? value : 'trained';
}

function proficiencyValue(value: WeaponProficiency, untrained: number, trained: number, specialist: number): number {
  return value === 'untrained' ? untrained : value === 'specialist' ? specialist : trained;
}

function directionBetween(from: BallisticPoint3, to: BallisticPoint3): BallisticDirection3 | null {
  const delta = {
    x: to.xMetres - from.xMetres,
    y: to.yMetres - from.yMetres,
    z: to.zMetres - from.zMetres,
  };
  return Math.hypot(delta.x, delta.y, delta.z) > EPSILON ? normalizeDirection(delta) : null;
}

function distanceBetween(left: BallisticPoint3, right: BallisticPoint3): number {
  return Math.hypot(
    right.xMetres - left.xMetres,
    right.yMetres - left.yMetres,
    right.zMetres - left.zMetres,
  );
}

function interpolateDirection(from: BallisticDirection3, to: BallisticDirection3, progress: number): BallisticDirection3 {
  return normalizeDirection({
    x: lerp(from.x, to.x, progress),
    y: lerp(from.y, to.y, progress),
    z: lerp(from.z, to.z, progress),
  });
}

function clampVectorMagnitude(value: BallisticDirection3, maximum: number): BallisticDirection3 {
  const magnitude = Math.hypot(value.x, value.y, value.z);
  if (magnitude <= maximum || magnitude <= EPSILON) return value;
  const scale = maximum / magnitude;
  return { x: value.x * scale, y: value.y * scale, z: value.z * scale };
}

function cross(left: BallisticDirection3, right: BallisticDirection3): BallisticDirection3 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function approachZero(value: number, amount: number): number {
  if (value > 0) return Math.max(0, value - amount);
  if (value < 0) return Math.min(0, value + amount);
  return 0;
}

function hash32(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mix32(value: number): number {
  let mixed = value >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846ca68b);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

function unitFloat(value: number): number {
  return (value >>> 0) / 0x1_0000_0000;
}

function normalizeStoredDirection(value: unknown, fallback: BallisticDirection3, normalize = true): BallisticDirection3 {
  if (!isRecord(value) || !Number.isFinite(value.x) || !Number.isFinite(value.y) || !Number.isFinite(value.z)) return structuredClone(fallback);
  const direction = { x: value.x as number, y: value.y as number, z: value.z as number };
  if (!normalize) return direction;
  return Math.hypot(direction.x, direction.y, direction.z) > EPSILON ? normalizeDirection(direction) : structuredClone(fallback);
}

function normalizePoint(value: unknown): BallisticPoint3 | null {
  if (!isRecord(value) || !Number.isFinite(value.xMetres) || !Number.isFinite(value.yMetres) || !Number.isFinite(value.zMetres)) return null;
  return { xMetres: value.xMetres as number, yMetres: value.yMetres as number, zMetres: value.zMetres as number };
}

function isFinitePoint(value: BallisticPoint3): boolean {
  return Number.isFinite(value.xMetres) && Number.isFinite(value.yMetres) && Number.isFinite(value.zMetres);
}

function nullableSeconds(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? canonicalSeconds(Math.max(0, value)) : null;
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function finiteNonNegative(value: unknown, fallback: number): number {
  return Math.max(0, finite(value, fallback));
}

function positive(value: unknown, fallback: number): number {
  const number = finite(value, fallback);
  return number > 0 ? number : fallback;
}

function integer(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.round(finite(value, fallback))));
}

function clamp01(value: number): number {
  return clamp(finite(value, 0), 0, 1);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function canonicalSeconds(value: number): number {
  return Math.round(Math.max(0, value) * 1_000_000_000_000) / 1_000_000_000_000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
