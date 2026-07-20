import type { AiBlackboardValue } from '../ai/AiBlackboard';
import type { UnitPosture } from '../behavior/BehaviorModel';
import { MOVEMENT_PROFILE_MEMORY_KEYS } from '../movement/MovementProfiles';
import type { MoveOrder } from '../orders/MoveOrder';
import {
  clearAttentionOverride,
  setAttentionMode,
  setFocusTarget,
  setSearchSector,
} from '../perception/AttentionController';
import type { SimulationState } from '../simulation/SimulationState';
import { isTacticalPositionOccupationActive } from '../tactical/TacticalPositionOccupation';
import type { UnitModel } from '../units/UnitModel';
import { captureTacticalTraversalStableInput } from './TacticalTraversalPlanningIdentity';
import { getTacticalTraversalPlanningService } from './TacticalTraversalPlanningService';
import {
  findTraversalSegmentIndex,
  type TacticalTraversalPlanV1,
  type TacticalTraversalSegmentV1,
} from './TacticalTraversalPlan';

const BODY_TURN_SPEED_RADIANS_PER_SECOND = Math.PI * 1.35;
const BODY_DIRECTION_DEADBAND_RADIANS = Math.PI / 180 * 2;
const ROUTE_INDEX_LOOKAHEAD = 16;
const ROUTE_INDEX_LOOKBEHIND = 2;
const TRAVERSAL_OWNER_PREFIX = 'tactical-traversal:';

export function reconcileTacticalTraversalBeforeMovement(
  state: SimulationState,
  deltaSeconds: number,
): void {
  const service = getTacticalTraversalPlanningService(state);
  for (const unit of state.units) {
    const order = unit.order;
    if (!order?.routeCells || order.routeCells.length === 0) {
      clearTacticalTraversalOverride(unit);
      service?.clearUnit(unit.id);
      continue;
    }

    const stable = captureTacticalTraversalStableInput(state, unit);
    const plan = order.traversalPlan;
    if (!plan || order.traversalPlanStatus !== 'ready' || !planMatchesStable(plan, stable)) {
      if (plan && order.traversalPlanStatus === 'ready') {
        order.traversalPlanStatus = 'stale';
        order.activeTraversalSegmentIndex = undefined;
        order.traversalPlanReason = 'Traversal plan identity no longer matches the order.';
        order.traversalPlanReasonRu = 'Идентификаторы плана прохождения больше не совпадают с приказом.';
      }
      clearTacticalTraversalOverride(unit);
      service?.ensureForUnit(unit);
      continue;
    }

    const routeIndex = resolveCurrentRouteCellIndex(unit, order);
    const segmentIndex = findTraversalSegmentIndex(plan, routeIndex);
    const segment = plan.segments[segmentIndex];
    if (!segment) {
      order.traversalPlanStatus = 'failed';
      order.traversalPlanReason = 'Ready traversal plan has no active segment.';
      order.traversalPlanReasonRu = 'В готовом плане прохождения отсутствует активный участок.';
      clearTacticalTraversalOverride(unit);
      continue;
    }
    applyTraversalSegment(unit, order, segment, segmentIndex, deltaSeconds);
  }
}

export function reconcileTacticalTraversalAfterMovement(
  state: SimulationState,
  deltaSeconds: number,
): void {
  for (const unit of state.units) {
    const order = unit.order;
    const plan = order?.traversalPlan;
    const segmentIndex = order?.activeTraversalSegmentIndex;
    const segment = plan && typeof segmentIndex === 'number'
      ? plan.segments[segmentIndex]
      : undefined;
    if (!order || order.traversalPlanStatus !== 'ready' || !segment) {
      clearTacticalTraversalOverride(unit);
      continue;
    }
    applyPlannedBodyFacing(unit, segment, deltaSeconds);
    applyPlannedAttention(unit, segment);
  }
}

export function clearTacticalTraversalOverride(unit: UnitModel): void {
  const memory = getMovementMemory(unit);
  const owner = memory[MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideOwnerToken];
  if (typeof owner !== 'string' || !owner.startsWith(TRAVERSAL_OWNER_PREFIX)) return;
  delete memory[MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideProfileId];
  delete memory[MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideOwnerToken];
  delete memory[MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideReason];
  if (unit.attentionRuntime.modeSource === 'ai') clearAttentionOverride(unit);
}

function applyTraversalSegment(
  unit: UnitModel,
  order: MoveOrder,
  segment: TacticalTraversalSegmentV1,
  segmentIndex: number,
  deltaSeconds: number,
): void {
  const ownerToken = traversalOwnerToken(order);
  const memory = getMovementMemory(unit);
  memory[MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideProfileId] = segment.movementProfileId;
  memory[MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideOwnerToken] = ownerToken;
  memory[MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideReason] = `tactical_traversal_segment:${segment.id}`;

  if (order.activeTraversalSegmentIndex !== segmentIndex) {
    order.activeTraversalSegmentIndex = segmentIndex;
    order.traversalPlanReason = `Active traversal segment changed to ${segment.id}.`;
    order.traversalPlanReasonRu = `Активирован участок прохождения ${segment.id}.`;
    unit.behaviorRuntime.lastEvent = 'tactical_traversal_segment_changed';
    unit.behaviorRuntime.reason = `Профиль ${segment.movementProfileId}, поза ${segment.posture}.`;
  }

  if (!isTacticalPositionOccupationActive(unit)) {
    applyPlannedPosture(unit, segment.posture, segment.id);
  }
  applyPlannedBodyFacing(unit, segment, deltaSeconds);
  applyPlannedAttention(unit, segment);
}

function applyPlannedPosture(unit: UnitModel, posture: UnitPosture, segmentId: string): void {
  if (unit.behaviorRuntime.posture === posture) return;
  unit.behaviorRuntime.previousPosture = unit.behaviorRuntime.posture;
  unit.behaviorRuntime.posture = posture;
  unit.behaviorRuntime.postureChangedBecause = `tactical_traversal:${segmentId}`;
}

function applyPlannedBodyFacing(
  unit: UnitModel,
  segment: TacticalTraversalSegmentV1,
  deltaSeconds: number,
): void {
  const target = segment.resolvedBodyFacingRadians;
  if (target === null || !Number.isFinite(target)) return;
  const delta = signedAngle(target - unit.facingRadians);
  if (Math.abs(delta) <= BODY_DIRECTION_DEADBAND_RADIANS) return;
  const maximumTurn = BODY_TURN_SPEED_RADIANS_PER_SECOND * Math.max(0, deltaSeconds);
  unit.facingRadians = normalizeRadians(
    unit.facingRadians + clamp(delta, -maximumTurn, maximumTurn),
  );
}

function applyPlannedAttention(unit: UnitModel, segment: TacticalTraversalSegmentV1): void {
  const center = segment.resolvedAttentionCenterRadians;
  if (center === null || !Number.isFinite(center)) return;
  if (segment.attentionPolicy === 'search_sector') {
    setSearchSector(
      unit,
      center,
      segment.attentionArcRadians ?? unit.attentionRuntime.searchArcRadians,
      'ai',
    );
    return;
  }
  if (segment.attentionPolicy === 'reference_threat') {
    setAttentionMode(unit, 'engage', 'ai');
    setFocusTarget(unit, segment.referenceThreatId, center);
    return;
  }
  setAttentionMode(unit, 'march', 'ai');
  unit.attentionRuntime.focusDirectionRadians = normalizeRadians(center);
  unit.attentionRuntime.focusTargetId = segment.attentionPolicy === 'blended'
    ? segment.referenceThreatId
    : null;
}

function resolveCurrentRouteCellIndex(unit: UnitModel, order: MoveOrder): number {
  const route = order.routeCells ?? [];
  if (route.length === 0) return 0;
  const previous = clampInteger(order.routeCellIndex ?? 0, 0, route.length - 1);
  const start = Math.max(0, previous - ROUTE_INDEX_LOOKBEHIND);
  const end = Math.min(route.length - 1, previous + ROUTE_INDEX_LOOKAHEAD);
  let best = previous;
  let bestDistance = routeCellDistanceSquared(unit, route[previous]!);
  for (let index = start; index <= end; index += 1) {
    const distance = routeCellDistanceSquared(unit, route[index]!);
    if (distance < bestDistance - 1e-9 || (Math.abs(distance - bestDistance) <= 1e-9 && index > best)) {
      best = index;
      bestDistance = distance;
    }
  }
  order.routeCellIndex = best;
  return best;
}

function routeCellDistanceSquared(unit: UnitModel, cell: { x: number; y: number }): number {
  const dx = unit.position.x - (cell.x + 0.5);
  const dy = unit.position.y - (cell.y + 0.5);
  return dx * dx + dy * dy;
}

function planMatchesStable(
  plan: TacticalTraversalPlanV1,
  stable: ReturnType<typeof captureTacticalTraversalStableInput>,
): boolean {
  return plan.version === 1
    && plan.routeRevision === stable.routeRevision
    && plan.routeHash === stable.routeHash
    && plan.commandId === stable.commandId
    && plan.commandRevision === stable.commandRevision
    && plan.knowledgeRevision === stable.knowledgeRevision
    && plan.tacticalPositionSettingsRevision === stable.settingsRevision
    && plan.tacticalTraversalProfileRevision === stable.traversalProfile.revision
    && plan.movementProfileRevision === stable.movementProfileRevision
    && plan.intentVersion === stable.intentVersion;
}

function traversalOwnerToken(order: MoveOrder): string {
  return `${TRAVERSAL_OWNER_PREFIX}${order.playerCommandId ?? order.ownerToken ?? order.issuedAtMs}`;
}

function getMovementMemory(unit: UnitModel): Record<string, AiBlackboardValue> {
  if (unit.behaviorRuntime.aiRuntimeSession) {
    return unit.behaviorRuntime.aiRuntimeSession.blackboardMemory;
  }
  const runtime = unit.behaviorRuntime as UnitModel['behaviorRuntime'] & {
    aiGraphMemory?: Record<string, AiBlackboardValue>;
  };
  const memory = runtime.aiGraphMemory ?? {};
  runtime.aiGraphMemory = memory;
  return memory;
}

function signedAngle(value: number): number {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function normalizeRadians(value: number): number {
  const full = Math.PI * 2;
  const result = value % full;
  return result < 0 ? result + full : result;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(Number.isFinite(value) ? value : min)));
}
