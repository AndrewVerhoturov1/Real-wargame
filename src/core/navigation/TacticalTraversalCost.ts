import type { UnitPosture } from '../behavior/BehaviorModel';
import { BUILT_IN_MOVEMENT_PROFILES } from '../movement/MovementProfileDefaults';
import type { MovementProfile } from '../movement/MovementProfileTypes';
import {
  estimatePostureSuppression,
  evaluateTacticalPostures,
} from '../tactical/TacticalPostureEvaluation';
import { resolveTacticalTraversalIntentWeights } from './TacticalTraversalIntent';
import type {
  SampledTraversalRouteCell,
  TacticalTraversalCandidateState,
  TacticalTraversalPlannerInput,
} from './TacticalTraversalPlannerTypes';
import type { TacticalTraversalProfile } from './TacticalTraversalProfile';

export type TacticalTraversalResolvedWeights = ReturnType<typeof resolveTacticalTraversalIntentWeights>;

export function resolveTraversalMovementProfiles(
  all: readonly MovementProfile[],
  profile: TacticalTraversalProfile,
  baseId: string,
): MovementProfile[] {
  const byId = new Map(all.map((item) => [item.id, item]));
  const result: MovementProfile[] = [];
  for (const id of profile.allowedMovementProfileIds.slice(0, 6)) {
    const item = byId.get(id);
    if (item) result.push(item);
  }
  const base = byId.get(baseId);
  if (base && !result.some((item) => item.id === base.id)) result.unshift(base);
  if (result.length === 0) result.push(...BUILT_IN_MOVEMENT_PROFILES.slice(0, 6));
  return result.slice(0, 6);
}

export function resolveTraversalCostWeights(
  intentPresetId: string,
  profile: TacticalTraversalProfile,
): TacticalTraversalResolvedWeights {
  const intent = resolveTacticalTraversalIntentWeights(intentPresetId);
  return {
    time: intent.time * profile.weights.time,
    danger: intent.danger * profile.weights.danger,
    suppression: intent.suppression * profile.weights.suppression,
    visibility: intent.visibility * profile.weights.visibility,
    noise: intent.noise * profile.weights.noise,
    stamina: intent.stamina * profile.weights.stamina,
    protection: intent.protection * profile.weights.protection,
    concealment: intent.concealment * profile.weights.concealment,
    weaponReadiness: intent.weaponReadiness * profile.weights.weaponReadiness,
    threatAttention: intent.threatAttention * profile.weights.threatAttention,
  };
}

export function evaluateTraversalCandidateState(
  input: TacticalTraversalPlannerInput,
  traversalProfile: TacticalTraversalProfile,
  movementProfile: MovementProfile,
  sample: SampledTraversalRouteCell,
  edgeMeters: number,
  weights: TacticalTraversalResolvedWeights,
): TacticalTraversalCandidateState {
  const field = input.field;
  const index = sample.fieldIndex;
  const postureResult = evaluateTacticalPostures({
    danger: field.danger[index] ?? 0,
    protection: field.expectedProtectionAgainstThreat[index] ?? 0,
    safety: field.safety[index] ?? 0,
    staticProtectionByPosture: {
      standing: field.staticProtectionByPosture.standing[index] ?? 0,
      crouched: field.staticProtectionByPosture.crouched[index] ?? 0,
      prone: field.staticProtectionByPosture.prone[index] ?? 0,
    },
  }, input.currentPosture, input.postureSettings);
  const posture = movementProfile.stancePolicy === 'adaptive'
    ? postureResult.recommended.posture === 'prone'
      ? 'crouched'
      : postureResult.recommended.posture
    : movementProfile.stancePolicy;
  const postureEvaluation = postureResult.evaluations.find((item) => item.posture === posture)
    ?? postureResult.recommended;
  const baseSuppression = field.suppression[index] ?? 0;
  const suppression = estimatePostureSuppression(baseSuppression, postureEvaluation, input.currentPosture);
  const speed = Math.max(
    0.08,
    traversalProfile.baseSpeedMetersPerSecond
      * Math.max(0.05, movementProfile.settings.speed.speedMultiplier),
  );
  const edgeSeconds = edgeMeters <= 1e-9 ? 0 : edgeMeters / speed;
  const concealment = clamp100(field.concealment[index] ?? 0);
  const uncertainty = clamp100(field.uncertainty[index] ?? 0);
  const forwardSlopeRisk = clamp100(field.forwardSlopeRisk[index] ?? 0);
  const rawDanger = clamp100(field.danger[index] ?? 0);
  const standingStaticProtection = clamp100(field.staticProtectionByPosture.standing[index] ?? 0);
  const crouchedStaticProtection = clamp100(field.staticProtectionByPosture.crouched[index] ?? 0);
  const crouchedProtectionAdvantage = Math.max(0, crouchedStaticProtection - standingStaticProtection);
  const protectedLowSilhouetteRequired = posture === 'standing'
    && rawDanger >= traversalProfile.lowCoverDangerThreshold
    && crouchedProtectionAdvantage >= traversalProfile.lowCoverProtectionAdvantageThreshold;
  const criticalStanding = posture === 'standing'
    && postureEvaluation.danger >= traversalProfile.criticalStandingDanger
    && (suppression >= traversalProfile.criticalStandingSuppression || forwardSlopeRisk >= 70);
  const criticalProneRequired = rawDanger >= traversalProfile.criticalProneDanger
    && baseSuppression >= traversalProfile.criticalProneSuppression;
  const criticalNonProne = posture !== 'prone' && criticalProneRequired;

  if (criticalStanding || protectedLowSilhouetteRequired || criticalNonProne) {
    const reason = criticalNonProne
      ? 'hard_safety:critical_exposure_requires_prone'
      : protectedLowSilhouetteRequired
        ? 'hard_safety:low_cover_requires_lower_silhouette'
        : 'hard_safety:critical_standing_exposure';
    return {
      profile: movementProfile,
      posture,
      postureEvaluation,
      edgeSeconds,
      dangerExposure: Number.POSITIVE_INFINITY,
      suppressionExposure: Number.POSITIVE_INFINITY,
      staminaCost: Number.POSITIVE_INFINITY,
      localCost: Number.POSITIVE_INFINITY,
      reasonCodes: [reason],
    };
  }

  const dangerExposure = postureEvaluation.danger * edgeSeconds / 100;
  const suppressionExposure = suppression * edgeSeconds / 100;
  const visibility = movementProfile.settings.visibility.movementVisibilityMultiplier
    * (1 - concealment / 100)
    * edgeSeconds;
  const noise = movementProfile.settings.noise.loudness * edgeMeters;
  const staminaCost = movementProfile.settings.stamina.drainPerSecond * edgeSeconds;
  const weaponPenalty = (movementProfile.settings.weapon.allowFireWhileMoving ? 0 : 0.8)
    + movementProfile.settings.weapon.weaponPreparationPenalty;
  const protectionBenefit = postureEvaluation.protection * edgeSeconds / 100;
  const concealmentBenefit = concealment * edgeSeconds / 100;
  const terrainCost = Math.max(0, finite(field.movementCost[index], 1) - 1) * edgeSeconds * 0.25;
  const uncertaintyPenalty = uncertainty * edgeSeconds / 100 * 0.2;
  const basePreference = intentProfilePenalty(
    input.intentPresetId,
    input.baseMovementProfileId,
    movementProfile.id,
  ) * Math.max(0.5, edgeSeconds);
  const openCrossingSpeedBenefit = (
    movementProfile.id === 'run'
    || movementProfile.id === 'sprint'
  )
    && rawDanger >= 55
    && rawDanger < traversalProfile.criticalStandingDanger
    && baseSuppression < traversalProfile.criticalStandingSuppression
    && postureEvaluation.protection < 20
    && concealment < 25
      ? edgeSeconds
        * (rawDanger / 100)
        * Math.max(0, movementProfile.settings.speed.speedMultiplier - 1)
        * 1.65
      : 0;
  const localCost = edgeSeconds * weights.time
    + dangerExposure * weights.danger
    + suppressionExposure * weights.suppression
    + visibility * weights.visibility
    + noise * weights.noise
    + staminaCost * weights.stamina / 10
    + weaponPenalty * weights.weaponReadiness * edgeSeconds
    - protectionBenefit * weights.protection
    - concealmentBenefit * weights.concealment
    + terrainCost
    + uncertaintyPenalty
    + basePreference
    - openCrossingSpeedBenefit;
  const reasonCodes = [
    `profile:${movementProfile.id}`,
    `planned_posture:${posture}`,
    ...postureEvaluation.reasonCodes,
  ];
  if (criticalProneRequired && posture === 'prone') {
    reasonCodes.push('hard_safety:critical_exposure_requires_prone');
  }
  if (postureEvaluation.danger >= 65) reasonCodes.push('danger:high');
  if (suppression >= 40) reasonCodes.push('suppression:high');
  if (postureEvaluation.protection >= 45) reasonCodes.push('protection:useful');
  if (concealment >= 50) reasonCodes.push('concealment:useful');
  if (openCrossingSpeedBenefit > 0) reasonCodes.push('open_crossing:short_fast');
  if (movementProfile.id === 'crawl' && postureEvaluation.danger >= 60) {
    reasonCodes.push('exposure:reduced_by_crawl');
  }

  return {
    profile: movementProfile,
    posture,
    postureEvaluation,
    edgeSeconds,
    dangerExposure,
    suppressionExposure,
    staminaCost,
    localCost,
    reasonCodes,
  };
}

export function initialTraversalTransitionCost(
  input: TacticalTraversalPlannerInput,
  profile: TacticalTraversalProfile,
  movementProfile: MovementProfile,
  posture: UnitPosture,
): number {
  return (movementProfile.id === input.baseMovementProfileId ? 0 : profile.profileChangeCost * 0.35)
    + (posture === input.currentPosture
      ? 0
      : profile.postureChangeCost * postureDistance(input.currentPosture, posture));
}

export function traversalStateTransitionCost(
  previous: TacticalTraversalCandidateState,
  next: TacticalTraversalCandidateState,
  profile: TacticalTraversalProfile,
): number {
  const profileChanged = previous.profile.id !== next.profile.id;
  const postureChanged = previous.posture !== next.posture;
  return (profileChanged ? profile.profileChangeCost : 0)
    + (postureChanged
      ? profile.postureChangeCost * postureDistance(previous.posture, next.posture)
      : 0)
    + (profileChanged || postureChanged ? profile.minimumImprovementToSwitch : 0);
}

function intentProfilePenalty(intent: string, baseId: string, candidateId: string): number {
  if (candidateId === baseId) return 0;
  if (intent === 'recon') {
    if (candidateId === 'crouched_move') return 0.45;
    if (candidateId === 'crawl') return 0.9;
    if (candidateId === 'normal_walk') return 1.1;
    if (candidateId === 'run') return 3.5;
    if (candidateId === 'sprint') return 5;
    return 1.2;
  }
  if (intent === 'assault') {
    if (candidateId === 'sprint') return 0.25;
    if (candidateId === 'normal_walk') return 0.6;
    if (candidateId === 'crouched_move') return 0.75;
    if (candidateId === 'stealth_move') return 1.6;
    if (candidateId === 'crawl') return 2.5;
    return 1;
  }
  if (candidateId === 'run') return 0.55;
  if (candidateId === 'crouched_move') return 0.75;
  if (candidateId === 'stealth_move') return 1.15;
  if (candidateId === 'sprint') return 1.6;
  if (candidateId === 'crawl') return 2.3;
  return 1;
}

function postureDistance(left: UnitPosture, right: UnitPosture): number {
  const rank: Record<UnitPosture, number> = { standing: 0, crouched: 1, prone: 2 };
  return Math.max(1, Math.abs(rank[left] - rank[right]));
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp100(value: number): number {
  return Math.max(0, Math.min(100, finite(value, 0)));
}
