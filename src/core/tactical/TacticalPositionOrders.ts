import {
  cancelReplaceablePostureTransitionForNewPlayerCommand,
  isPostureTransitionRunning,
  postureOwnerTokenForPlayerCommand,
  requestPostureTransition,
} from '../actions/PostureTransition';
import { publishTacticalOrderIntentToAiMemory } from '../ai/TacticalOrderBlackboard';
import { createDirectPlayerMovePlan } from '../ai/UnitPlan';
import type { UnitPosture } from '../behavior/BehaviorModel';
import type { GridPosition } from '../geometry';
import { clampGridPositionToMap } from '../map/MapModel';
import {
  movementGaitForPosture,
  movementProfileIdForPosture,
} from '../movement/PostureMovementProfile';
import { buildUnitTacticalRouteContext, resolveUnitNavigationProfile } from '../navigation/NavigationRuntime';
import { planMoveOrder } from '../orders/MoveOrderPlanning';
import {
  createPlayerMoveCommand,
  updatePlayerCommandStatus,
  withPlayerCommandTacticalPositionMetadata,
  type PlayerCommandTacticalPositionKind,
} from '../orders/PlayerCommand';
import {
  createTacticalOrderIntent,
  withTacticalOrderMovementProfile,
  withTacticalOrderNavigationProfile,
} from '../orders/TacticalOrderIntent';
import { clearAttentionOverride } from '../perception/AttentionController';
import { getBestPerceptionContact } from '../perception/PerceptionSystem';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';
import { getTacticalPositionSettings } from './TacticalPositionSettings';

export interface TacticalPositionMoveOrderMetadata {
  readonly kind: PlayerCommandTacticalPositionKind;
  readonly requestIdentity: string;
  readonly candidateId: string;
  readonly recommendedFacingRadians?: number | null;
}

export function issueTacticalPositionMoveOrderToSelectedUnit(
  state: SimulationState,
  rawTarget: GridPosition,
  arrivalPosture: UnitPosture,
  metadata: TacticalPositionMoveOrderMetadata | null = null,
): boolean {
  const unitId = state.selectedUnitId;
  if (!unitId) return false;
  const unit = state.units.find((candidate) => candidate.id === unitId);
  if (!unit) return false;

  const target = clampGridPositionToMap(state.map, rawTarget);
  const finalFacingRadians = normalizeFacing(
    metadata?.recommendedFacingRadians,
    resolveThreatFacingAtPosition(unit, target),
  );
  const approachPosture = resolveApproachPosture(unit, arrivalPosture);
  const intent = withTacticalOrderMovementProfile(
    withTacticalOrderNavigationProfile(
      createTacticalOrderIntent('move'),
      unit.playerNavigationProfileId ?? 'normal',
    ),
    movementProfileIdForPosture(approachPosture),
  );
  cancelReplaceablePostureTransitionForNewPlayerCommand(unit);
  const baseCommand = createPlayerMoveCommand(
    unit.id,
    target,
    unit.playerCommand,
    Date.now(),
    intent,
    null,
    finalFacingRadians,
    arrivalPosture,
    approachPosture,
  );
  const command = withPlayerCommandTacticalPositionMetadata(
    baseCommand,
    metadata
      ? {
          kind: metadata.kind,
          requestIdentity: metadata.requestIdentity,
          candidateId: metadata.candidateId,
        }
      : null,
  );

  unit.playerCommand = command;
  unit.playerNavigationProfileId = command.intent.navigationProfileId;
  unit.movementRuntime.requestedGait = movementGaitForPosture(approachPosture);
  publishTacticalOrderIntentToAiMemory(unit, command.intent);
  clearAttentionOverride(unit);

  const resolvedNavigation = resolveUnitNavigationProfile(unit, command);
  const planned = planMoveOrder(state.map, unit.position, target, {
    source: 'player',
    playerCommandId: command.id,
    movementMode: command.movementMode,
    navigationProfile: resolvedNavigation.profile,
    navigationProfileSource: resolvedNavigation.source,
    movementProfileId: command.intent.movementProfileId,
    movementProfileSource: 'player_order',
    movementProfileOwnerToken: command.id,
    movementProfileSelectionRevision: command.revision,
    calculatedAtSimulationStep: state.simulationStep,
    tacticalContext: buildUnitTacticalRouteContext(unit, {
      freshness: 'immediate',
      metersPerCell: state.map.metersPerCell,
    }),
  });

  if (!planned.ok) {
    unit.order = null;
    unit.playerCommand = updatePlayerCommandStatus(
      command,
      'blocked',
      `Tactical-position order is blocked: ${planned.reason}`,
      `Путь к тактической позиции заблокирован: ${planned.reasonRu}`,
    );
    unit.plan = createDirectPlayerMovePlan(unit.plan, unit.playerCommand, target);
    unit.behaviorRuntime.currentAction = 'observe';
    unit.behaviorRuntime.lastEvent = 'tactical_position_route_unavailable';
    unit.behaviorRuntime.reason = `Маршрут к позиции недоступен: ${planned.reasonRu}`;
    return false;
  }

  if (typeof command.finalFacingRadians === 'number') {
    planned.order.finalFacingRadians = command.finalFacingRadians;
  }
  unit.order = planned.order;
  unit.plan = createDirectPlayerMovePlan(unit.plan, command, planned.order.target);
  requestPostureTransition(unit, {
    targetPosture: approachPosture,
    owner: { source: 'tactical_position', id: command.id },
    ownerToken: postureOwnerTokenForPlayerCommand(command.id),
    startedSeconds: state.simulationTimeSeconds,
    reasonCode: 'tactical_position_approach',
    reasonRu: 'Боец физически принимает позу подхода к тактической позиции.',
  });
  if (!isPostureTransitionRunning(unit)) {
    unit.behaviorRuntime.state = 'moving';
    unit.behaviorRuntime.currentAction = 'move';
  }
  unit.behaviorRuntime.lastEvent = 'tactical_position_order_received';
  unit.behaviorRuntime.reason = finalFacingRadians === null
    ? `Боец направлен на тактическую позицию; после прибытия: ${postureLabel(arrivalPosture)}.`
    : `Боец направлен на тактическую позицию; после прибытия: ${postureLabel(arrivalPosture)} и разворот к рекомендуемому направлению.`;
  setUnitDirection(unit, planned.order.waypoints?.[0] ?? planned.order.target);
  return true;
}

function resolveApproachPosture(unit: UnitModel, arrivalPosture: UnitPosture): UnitPosture {
  const currentPosture = unit.behaviorRuntime.posture;
  if (currentPosture === 'prone') return 'prone';
  if (currentPosture === 'crouched') return 'crouched';
  const settings = getTacticalPositionSettings(unit);
  return settings.moveCrouchedToProtectedPosition && arrivalPosture !== 'standing'
    ? 'crouched'
    : 'standing';
}

function resolveThreatFacingAtPosition(unit: UnitModel, position: GridPosition): number | null {
  const contact = getBestPerceptionContact(unit);
  if (contact) return directionTo(position, contact.lastKnownPosition);

  let strongest: UnitModel['tacticalKnowledge']['threats'][number] | null = null;
  let strongestScore = Number.NEGATIVE_INFINITY;
  for (const threat of unit.tacticalKnowledge.threats) {
    const score = threat.confidence * 2
      + threat.strength
      + threat.suppression * 0.5
      + (threat.visibleNow ? 1000 : 0);
    if (score <= strongestScore) continue;
    strongest = threat;
    strongestScore = score;
  }
  return strongest ? directionTo(position, strongest) : null;
}

function directionTo(from: GridPosition, to: GridPosition): number | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.hypot(dx, dy) < 0.0001) return null;
  return Math.atan2(dy, dx);
}

function normalizeFacing(preferred: number | null | undefined, fallback: number | null): number | null {
  return typeof preferred === 'number' && Number.isFinite(preferred) ? preferred : fallback;
}

function postureLabel(posture: UnitPosture): string {
  if (posture === 'standing') return 'стоять';
  if (posture === 'crouched') return 'сесть';
  return 'лечь';
}

function setUnitDirection(unit: UnitModel, target: GridPosition): void {
  const dx = target.x - unit.position.x;
  const dy = target.y - unit.position.y;
  if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) return;
  unit.facingRadians = Math.atan2(dy, dx);
}
