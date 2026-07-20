import type { UnitPosture } from '../behavior/BehaviorModel';
import type { GridPosition } from '../geometry';
import { BUILT_IN_MOVEMENT_PROFILES } from '../movement/MovementProfileDefaults';
import type { MovementProfile } from '../movement/MovementProfileTypes';
import {
  estimatePostureSuppression,
  evaluateTacticalPostures,
  type TacticalPostureEvaluation,
} from '../tactical/TacticalPostureEvaluation';
import type { TacticalPositionSettings } from '../tactical/TacticalPositionSettings';
import { traversalFieldCellIndex, type TacticalTraversalFieldView } from './TacticalTraversalFieldView';
import { resolveTacticalTraversalFacing, type TacticalTraversalReferenceThreat } from './TacticalTraversalFacing';
import { resolveTacticalTraversalIntentWeights } from './TacticalTraversalIntent';
import { hashTraversalRoute, type TacticalTraversalPlanV1, type TacticalTraversalSegmentV1 } from './TacticalTraversalPlan';
import { normalizeTacticalTraversalProfile, type TacticalTraversalProfile } from './TacticalTraversalProfile';

export interface TacticalTraversalPlannerInput {
  readonly routeCells: readonly GridPosition[];
  readonly routeRevision: number;
  readonly commandId: string | null;
  readonly commandRevision: number;
  readonly worldKey: string;
  readonly fieldIdentity: string;
  readonly knowledgeRevision: number;
  readonly tacticalPositionSettingsRevision: number;
  readonly movementProfileRevision: number;
  readonly intentVersion: number;
  readonly currentPosture: UnitPosture;
  readonly intentPresetId: string;
  readonly baseMovementProfileId: string;
  readonly referenceThreat: TacticalTraversalReferenceThreat | null;
  readonly profile: TacticalTraversalProfile;
  readonly postureSettings: TacticalPositionSettings;
  readonly field: TacticalTraversalFieldView;
  readonly movementProfiles?: readonly MovementProfile[];
}

interface SampledRouteCell {
  readonly routeIndex: number;
  readonly position: GridPosition;
  readonly fieldIndex: number;
}

interface CandidateState {
  readonly profile: MovementProfile;
  readonly posture: UnitPosture;
  readonly postureEvaluation: TacticalPostureEvaluation;
  readonly edgeSeconds: number;
  readonly dangerExposure: number;
  readonly suppressionExposure: number;
  readonly staminaCost: number;
  readonly localCost: number;
  readonly reasonCodes: readonly string[];
}

interface DpCell {
  readonly cost: number;
  readonly previousStateIndex: number;
  readonly state: CandidateState;
  readonly transitionCost: number;
}

interface Assignment {
  readonly profile: MovementProfile;
  readonly posture: UnitPosture;
  readonly transitionCost: number;
  readonly reasonCodes: readonly string[];
}

interface MutableSegment {
  start: number;
  end: number;
  assignment: Assignment;
}

export function planTacticalTraversal(input: TacticalTraversalPlannerInput): TacticalTraversalPlanV1 {
  const profile = normalizeTacticalTraversalProfile(input.profile);
  const route = input.routeCells.length > 0 ? input.routeCells : [{ x: 0, y: 0 }];
  const samples = sampleRoute(route, input.field, profile.maximumSamples);
  const profiles = resolveAllowedProfiles(
    input.movementProfiles ?? BUILT_IN_MOVEMENT_PROFILES,
    profile,
    input.baseMovementProfileId,
  );
  const weights = multiplyWeights(
    resolveTacticalTraversalIntentWeights(input.intentPresetId),
    profile.weights,
  );
  const dp: DpCell[][] = [];

  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
    const sample = samples[sampleIndex]!;
    const previousSample = sampleIndex > 0 ? samples[sampleIndex - 1]! : sample;
    const edgeMeters = distance(previousSample.position, sample.position) * input.field.metersPerCell;
    const row: DpCell[] = [];

    for (let stateIndex = 0; stateIndex < profiles.length; stateIndex += 1) {
      const movementProfile = profiles[stateIndex]!;
      const candidate = evaluateCandidateState(
        input,
        profile,
        movementProfile,
        sample,
        edgeMeters,
        weights,
      );
      let bestCost = Number.POSITIVE_INFINITY;
      let bestPrevious = -1;
      let bestTransition = 0;
      const previousRow = dp[sampleIndex - 1];

      if (!previousRow) {
        const transition = initialTransitionCost(input, profile, movementProfile, candidate.posture);
        bestCost = candidate.localCost + transition;
        bestTransition = transition;
      } else {
        for (let previousIndex = 0; previousIndex < previousRow.length; previousIndex += 1) {
          const previous = previousRow[previousIndex]!;
          if (!Number.isFinite(previous.cost)) continue;
          const transition = stateTransitionCost(previous.state, candidate, profile);
          const total = previous.cost + candidate.localCost + transition;
          if (
            total < bestCost - 1e-9
            || (Math.abs(total - bestCost) <= 1e-9 && previousIndex < bestPrevious)
          ) {
            bestCost = total;
            bestPrevious = previousIndex;
            bestTransition = transition;
          }
        }
      }

      row.push({
        cost: bestCost,
        previousStateIndex: bestPrevious,
        state: candidate,
        transitionCost: bestTransition,
      });
    }
    dp.push(row);
  }

  const sampledAssignments = reconstructAssignments(dp);
  const assignments = expandAssignments(route.length, samples, sampledAssignments);
  let segments = buildMutableSegments(assignments);
  segments = mergeShortSegments(segments, profile.minimumSegmentCells);
  segments = limitSegments(segments, profile.maximumSegments);
  const builtSegments = segments.map((segment, index) => buildSegment(input, profile, segment, index));
  const totals = builtSegments.reduce((sum, segment) => ({
    duration: sum.duration + segment.estimatedDurationSeconds,
    danger: sum.danger + segment.averageDanger * segment.estimatedDurationSeconds / 100,
    suppression: sum.suppression + segment.averageSuppression * segment.estimatedDurationSeconds / 100,
  }), { duration: 0, danger: 0, suppression: 0 });

  return {
    version: 1,
    routeRevision: Math.max(0, Math.floor(input.routeRevision)),
    routeHash: hashTraversalRoute(route),
    commandId: input.commandId,
    commandRevision: Math.max(0, Math.floor(input.commandRevision)),
    worldKey: input.worldKey,
    fieldIdentity: input.fieldIdentity,
    knowledgeRevision: Math.max(0, Math.floor(input.knowledgeRevision)),
    tacticalPositionSettingsRevision: Math.max(0, Math.floor(input.tacticalPositionSettingsRevision)),
    tacticalTraversalProfileRevision: profile.revision,
    movementProfileRevision: Math.max(0, Math.floor(input.movementProfileRevision)),
    intentVersion: Math.max(0, Math.floor(input.intentVersion)),
    segments: builtSegments,
    estimatedDurationSeconds: roundThree(totals.duration),
    estimatedDangerExposure: roundThree(totals.danger),
    estimatedSuppressionExposure: roundThree(totals.suppression),
    estimatedStaminaCost: roundThree(estimatePlanStaminaCost(builtSegments, profiles)),
    reasonCodes: [
      'planner:dynamic_programming',
      `samples:${samples.length}`,
      `states:${profiles.length}`,
      `segments:${builtSegments.length}`,
      `intent:${input.intentPresetId}`,
      'field:shared_awareness_snapshot',
      'visibility_geometry:not_recomputed',
    ],
  };
}

function evaluateCandidateState(
  input: TacticalTraversalPlannerInput,
  traversalProfile: TacticalTraversalProfile,
  movementProfile: MovementProfile,
  sample: SampledRouteCell,
  edgeMeters: number,
  weights: ReturnType<typeof resolveTacticalTraversalIntentWeights>,
): CandidateState {
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
  const crouchedProtectionAdvantage = Math.max(
    0,
    crouchedStaticProtection - standingStaticProtection,
  );
  const protectedLowSilhouetteRequired = posture === 'standing'
    && rawDanger >= traversalProfile.lowCoverDangerThreshold
    && crouchedProtectionAdvantage >= traversalProfile.lowCoverProtectionAdvantageThreshold;
  const criticalStanding = posture === 'standing'
    && postureEvaluation.danger >= traversalProfile.criticalStandingDanger
    && (
      suppression >= traversalProfile.criticalStandingSuppression
      || forwardSlopeRisk >= 70
    );
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

function multiplyWeights(
  intent: ReturnType<typeof resolveTacticalTraversalIntentWeights>,
  profile: TacticalTraversalProfile['weights'],
): ReturnType<typeof resolveTacticalTraversalIntentWeights> {
  return {
    time: intent.time * profile.time,
    danger: intent.danger * profile.danger,
    suppression: intent.suppression * profile.suppression,
    visibility: intent.visibility * profile.visibility,
    noise: intent.noise * profile.noise,
    stamina: intent.stamina * profile.stamina,
    protection: intent.protection * profile.protection,
    concealment: intent.concealment * profile.concealment,
    weaponReadiness: intent.weaponReadiness * profile.weaponReadiness,
    threatAttention: intent.threatAttention * profile.threatAttention,
  };
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

function initialTransitionCost(
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

function stateTransitionCost(
  previous: CandidateState,
  next: CandidateState,
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

function postureDistance(left: UnitPosture, right: UnitPosture): number {
  const rank: Record<UnitPosture, number> = { standing: 0, crouched: 1, prone: 2 };
  return Math.max(1, Math.abs(rank[left] - rank[right]));
}

function sampleRoute(
  route: readonly GridPosition[],
  field: TacticalTraversalFieldView,
  maximumSamples: number,
): SampledRouteCell[] {
  const count = Math.min(route.length, maximumSamples);
  const indices: number[] = [];
  for (let sample = 0; sample < count; sample += 1) {
    const index = count === 1
      ? 0
      : Math.round(sample * (route.length - 1) / (count - 1));
    if (indices[indices.length - 1] !== index) indices.push(index);
  }
  return indices.map((routeIndex) => ({
    routeIndex,
    position: route[routeIndex]!,
    fieldIndex: traversalFieldCellIndex(field, route[routeIndex]!),
  }));
}

function resolveAllowedProfiles(
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

function reconstructAssignments(dp: readonly (readonly DpCell[])[]): Assignment[] {
  if (dp.length === 0) return [];
  const last = dp[dp.length - 1]!;
  let stateIndex = 0;
  for (let index = 1; index < last.length; index += 1) {
    if (last[index]!.cost < last[stateIndex]!.cost) stateIndex = index;
  }
  const result = new Array<Assignment>(dp.length);
  for (let rowIndex = dp.length - 1; rowIndex >= 0; rowIndex -= 1) {
    const cell = dp[rowIndex]![stateIndex]!;
    result[rowIndex] = {
      profile: cell.state.profile,
      posture: cell.state.posture,
      transitionCost: cell.transitionCost,
      reasonCodes: cell.state.reasonCodes,
    };
    stateIndex = cell.previousStateIndex < 0 ? stateIndex : cell.previousStateIndex;
  }
  return result;
}

function expandAssignments(
  routeLength: number,
  samples: readonly SampledRouteCell[],
  sampled: readonly Assignment[],
): Assignment[] {
  const result = new Array<Assignment>(routeLength);
  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
    const start = samples[sampleIndex]!.routeIndex;
    const end = sampleIndex + 1 < samples.length
      ? samples[sampleIndex + 1]!.routeIndex - 1
      : routeLength - 1;
    for (let index = start; index <= end; index += 1) result[index] = sampled[sampleIndex]!;
  }
  if (result.length > 0 && !result[0]) result.fill(sampled[0]!);
  return result;
}

function buildMutableSegments(assignments: readonly Assignment[]): MutableSegment[] {
  if (assignments.length === 0) return [];
  const result: MutableSegment[] = [];
  let start = 0;
  for (let index = 1; index <= assignments.length; index += 1) {
    const previous = assignments[index - 1]!;
    const current = assignments[index];
    if (
      current
      && current.profile.id === previous.profile.id
      && current.posture === previous.posture
    ) continue;
    result.push({ start, end: index - 1, assignment: previous });
    start = index;
  }
  return result;
}

function mergeShortSegments(
  segments: MutableSegment[],
  minimumCells: number,
): MutableSegment[] {
  const result = segments.map((item) => ({ ...item }));
  let changed = true;
  while (changed && result.length > 1) {
    changed = false;
    for (let index = 0; index < result.length; index += 1) {
      const item = result[index]!;
      if (
        item.end - item.start + 1 >= minimumCells
        || isHardSafetyAssignment(item.assignment)
      ) continue;
      const left = result[index - 1];
      const right = result[index + 1];
      if (!left && right) {
        right.start = item.start;
        result.splice(index, 1);
      } else if (left && !right) {
        left.end = item.end;
        result.splice(index, 1);
      } else if (left && right) {
        const chooseLeft = left.assignment.posture === item.assignment.posture
          || (
            right.assignment.posture !== item.assignment.posture
            && left.end - left.start >= right.end - right.start
          );
        if (chooseLeft) {
          left.end = item.end;
          right.start = item.end + 1;
        } else {
          right.start = item.start;
        }
        result.splice(index, 1);
      }
      changed = true;
      break;
    }
  }
  return mergeAdjacentSame(result);
}

function limitSegments(segments: MutableSegment[], maximum: number): MutableSegment[] {
  const result = segments.map((item) => ({ ...item }));
  while (result.length > maximum) {
    const mergeable = result
      .map((segment, index) => ({ segment, index }))
      .filter(({ segment }) => !isHardSafetyAssignment(segment.assignment));
    if (mergeable.length === 0) break;
    let shortest = mergeable[0]!.index;
    for (const candidate of mergeable.slice(1)) {
      const length = candidate.segment.end - candidate.segment.start;
      const shortestLength = result[shortest]!.end - result[shortest]!.start;
      if (length < shortestLength) shortest = candidate.index;
    }
    const left = result[shortest - 1];
    const current = result[shortest]!;
    const right = result[shortest + 1];
    if (!left && right) right.start = current.start;
    else if (left && !right) left.end = current.end;
    else if (left && right && left.end - left.start >= right.end - right.start) {
      left.end = current.end;
    } else if (right) {
      right.start = current.start;
    }
    result.splice(shortest, 1);
  }
  return mergeAdjacentSame(result);
}

function isHardSafetyAssignment(assignment: Assignment): boolean {
  return assignment.reasonCodes.some((reason) => reason.startsWith('hard_safety:'));
}

function mergeAdjacentSame(segments: MutableSegment[]): MutableSegment[] {
  const result: MutableSegment[] = [];
  for (const segment of segments) {
    const previous = result[result.length - 1];
    if (
      previous
      && previous.assignment.profile.id === segment.assignment.profile.id
      && previous.assignment.posture === segment.assignment.posture
    ) {
      previous.end = segment.end;
    } else {
      result.push({ ...segment });
    }
  }
  return result;
}

function buildSegment(
  input: TacticalTraversalPlannerInput,
  profile: TacticalTraversalProfile,
  segment: MutableSegment,
  index: number,
): TacticalTraversalSegmentV1 {
  const from = input.routeCells[segment.start]
    ?? input.routeCells[0]
    ?? { x: 0, y: 0 };
  const to = input.routeCells[segment.end] ?? from;
  const facing = resolveTacticalTraversalFacing({
    from,
    to,
    movementProfile: segment.assignment.profile,
    intentPresetId: input.intentPresetId,
    referenceThreat: input.referenceThreat,
    profile,
  });
  let dangerSum = 0;
  let suppressionSum = 0;
  let protectionSum = 0;
  let concealmentSum = 0;
  let maximumDanger = 0;
  let count = 0;
  let distanceMeters = 0;

  for (let routeIndex = segment.start; routeIndex <= segment.end; routeIndex += 1) {
    const position = input.routeCells[routeIndex] ?? from;
    const fieldIndex = traversalFieldCellIndex(input.field, position);
    const postureResult = evaluateTacticalPostures({
      danger: input.field.danger[fieldIndex] ?? 0,
      protection: input.field.expectedProtectionAgainstThreat[fieldIndex] ?? 0,
      safety: input.field.safety[fieldIndex] ?? 0,
      staticProtectionByPosture: {
        standing: input.field.staticProtectionByPosture.standing[fieldIndex] ?? 0,
        crouched: input.field.staticProtectionByPosture.crouched[fieldIndex] ?? 0,
        prone: input.field.staticProtectionByPosture.prone[fieldIndex] ?? 0,
      },
    }, input.currentPosture, input.postureSettings);
    const posture = postureResult.evaluations.find(
      (item) => item.posture === segment.assignment.posture,
    ) ?? postureResult.recommended;
    dangerSum += posture.danger;
    suppressionSum += estimatePostureSuppression(
      input.field.suppression[fieldIndex] ?? 0,
      posture,
      input.currentPosture,
    );
    protectionSum += posture.protection;
    concealmentSum += clamp100(input.field.concealment[fieldIndex] ?? 0);
    maximumDanger = Math.max(maximumDanger, posture.danger);
    count += 1;
    if (routeIndex > segment.start || (routeIndex === segment.start && routeIndex > 0)) {
      distanceMeters += distance(
        input.routeCells[routeIndex - 1]!,
        position,
      ) * input.field.metersPerCell;
    }
  }

  const speed = Math.max(
    0.08,
    profile.baseSpeedMetersPerSecond
      * segment.assignment.profile.settings.speed.speedMultiplier,
  );
  const duration = distanceMeters / speed
    + (index === 0 ? segment.assignment.profile.settings.speed.startDelaySeconds : 0);

  return {
    id: `segment-${String(index + 1).padStart(2, '0')}-${segment.start}-${segment.end}`,
    startRouteCellIndex: segment.start,
    endRouteCellIndex: segment.end,
    movementProfileId: segment.assignment.profile.id,
    posture: segment.assignment.posture,
    bodyFacingPolicy: facing.bodyFacingPolicy,
    attentionPolicy: facing.attentionPolicy,
    resolvedBodyFacingRadians: roundThree(facing.bodyFacingRadians),
    resolvedAttentionCenterRadians: roundThree(facing.attentionCenterRadians),
    attentionArcRadians: facing.attentionArcRadians === null
      ? null
      : roundThree(facing.attentionArcRadians),
    referenceThreatId: input.referenceThreat?.id ?? null,
    averageDanger: roundTwo(dangerSum / Math.max(1, count)),
    maximumDanger: roundTwo(maximumDanger),
    averageSuppression: roundTwo(suppressionSum / Math.max(1, count)),
    averageProtection: roundTwo(protectionSum / Math.max(1, count)),
    averageConcealment: roundTwo(concealmentSum / Math.max(1, count)),
    estimatedDurationSeconds: roundThree(duration),
    transitionCost: roundTwo(segment.assignment.transitionCost),
    reasonCodes: unique([
      ...segment.assignment.reasonCodes,
      ...facing.reasonCodes,
    ]),
  };
}

function estimatePlanStaminaCost(
  segments: readonly TacticalTraversalSegmentV1[],
  profiles: readonly MovementProfile[],
): number {
  const byId = new Map(profiles.map((item) => [item.id, item]));
  return segments.reduce((sum, segment) => (
    sum
    + (byId.get(segment.movementProfileId)?.settings.stamina.drainPerSecond ?? 0)
      * segment.estimatedDurationSeconds
  ), 0);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function distance(a: GridPosition, b: GridPosition): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp100(value: number): number {
  return Math.max(0, Math.min(100, finite(value, 0)));
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundThree(value: number): number {
  return Math.round(value * 1000) / 1000;
}
