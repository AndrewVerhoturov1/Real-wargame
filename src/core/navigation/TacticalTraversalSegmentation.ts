import type { GridPosition } from '../geometry';
import type { MovementProfile } from '../movement/MovementProfileTypes';
import {
  estimatePostureSuppression,
  evaluateTacticalPostures,
} from '../tactical/TacticalPostureEvaluation';
import { traversalFieldCellIndex, type TacticalTraversalFieldView } from './TacticalTraversalFieldView';
import { resolveTacticalTraversalFacing } from './TacticalTraversalFacing';
import type { TacticalTraversalSegmentV1 } from './TacticalTraversalPlan';
import type {
  MutableTacticalTraversalSegment,
  SampledTraversalRouteCell,
  TacticalTraversalAssignment,
  TacticalTraversalDpCell,
  TacticalTraversalPlannerInput,
} from './TacticalTraversalPlannerTypes';
import type { TacticalTraversalProfile } from './TacticalTraversalProfile';

export function sampleTraversalRoute(
  route: readonly GridPosition[],
  field: TacticalTraversalFieldView,
  maximumSamples: number,
): SampledTraversalRouteCell[] {
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

export function buildTacticalTraversalSegments(
  input: TacticalTraversalPlannerInput,
  profile: TacticalTraversalProfile,
  routeLength: number,
  samples: readonly SampledTraversalRouteCell[],
  dp: readonly (readonly TacticalTraversalDpCell[])[],
): TacticalTraversalSegmentV1[] {
  const sampledAssignments = reconstructAssignments(dp);
  const assignments = expandAssignments(routeLength, samples, sampledAssignments);
  let segments = buildMutableSegments(assignments);
  segments = mergeShortSegments(segments, profile.minimumSegmentCells);
  segments = limitSegments(segments, profile.maximumSegments);
  return segments.map((segment, index) => buildSegment(input, profile, segment, index));
}

export function estimateTraversalPlanStaminaCost(
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

function reconstructAssignments(
  dp: readonly (readonly TacticalTraversalDpCell[])[],
): TacticalTraversalAssignment[] {
  if (dp.length === 0) return [];
  const last = dp[dp.length - 1]!;
  let stateIndex = 0;
  for (let index = 1; index < last.length; index += 1) {
    if (last[index]!.cost < last[stateIndex]!.cost) stateIndex = index;
  }
  const result = new Array<TacticalTraversalAssignment>(dp.length);
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
  samples: readonly SampledTraversalRouteCell[],
  sampled: readonly TacticalTraversalAssignment[],
): TacticalTraversalAssignment[] {
  const result = new Array<TacticalTraversalAssignment>(routeLength);
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

function buildMutableSegments(
  assignments: readonly TacticalTraversalAssignment[],
): MutableTacticalTraversalSegment[] {
  if (assignments.length === 0) return [];
  const result: MutableTacticalTraversalSegment[] = [];
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
  segments: MutableTacticalTraversalSegment[],
  minimumCells: number,
): MutableTacticalTraversalSegment[] {
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

function limitSegments(
  segments: MutableTacticalTraversalSegment[],
  maximum: number,
): MutableTacticalTraversalSegment[] {
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

function isHardSafetyAssignment(assignment: TacticalTraversalAssignment): boolean {
  return assignment.reasonCodes.some((reason) => reason.startsWith('hard_safety:'));
}

function mergeAdjacentSame(
  segments: MutableTacticalTraversalSegment[],
): MutableTacticalTraversalSegment[] {
  const result: MutableTacticalTraversalSegment[] = [];
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
  segment: MutableTacticalTraversalSegment,
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
