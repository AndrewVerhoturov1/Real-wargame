import assert from 'node:assert/strict';
import {
  POSTURE_TRANSITION_DURATIONS_SECONDS,
  cancelPostureTransition,
  getPostureTransitionDiagnostics,
  isPostureTransitionRunning,
  postureOwnerTokenForPlayerCommand,
  postureTransitionDurationSeconds,
  requestPostureTransition,
} from '../src/core/actions/PostureTransition';
import { evaluateFireRequest } from '../src/core/combat/CombatDecision';
import { replaceCombatRuntime } from '../src/core/combat/CombatDamage';
import { getUnitHitShapes } from '../src/core/combat/UnitHitShapes';
import type { TacticalMapData } from '../src/core/map/MapModel';
import { createMoveOrder } from '../src/core/orders/MoveOrder';
import {
  createPlayerMoveCommand,
  updatePlayerCommandStatus,
} from '../src/core/orders/PlayerCommand';
import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';
import { tickSimulation } from '../src/core/simulation/SimulationTick';
import { soldierPostureHeightMeters } from '../src/core/visibility/VisibilityPosture';
import type { UnitData, UnitModel } from '../src/core/units/UnitModel';
import { buildExportedScene, normalizeImportedScene } from '../src/ui/SceneExport';

verifyStandingToCrouchedIsTimed();
verifyCrouchedToProneIsTimed();
verifyProneToStandingUsesTwoPhases();
verifyStepPartitionInvariance();
verifyCanonicalEffectivePostureConsumers();
verifySecondIncompatibleTransitionIsRejected();
verifyOwnerCancellation();
verifyForeignCancellationIsRejected();
verifyCombatCapabilityLossCancelsTransition();
verifyMidTransitionSaveRestore();
verifyTacticalArrivalStartsPhysicalTransition();
verifyNewOrderDoesNotCreateTwoPostureOwners();
verifyTransitionBlocksAiming();
verifyEffectivePostureNeverFlickers();

console.log('Posture transition smoke passed: timed phases, deterministic progress, canonical effective posture, ownership, cancellation, save/restore, tactical arrival and aiming conflict.');

function verifyStandingToCrouchedIsTimed(): void {
  const state = makeState('standing');
  const unit = state.units[0];
  start(unit, state, 'crouched', 'owner-a');
  assert.equal(unit.behaviorRuntime.posture, 'standing');
  tickSimulation(state, POSTURE_TRANSITION_DURATIONS_SECONDS.standingToCrouched / 2);
  assert.equal(unit.behaviorRuntime.posture, 'standing');
  assert.equal(isPostureTransitionRunning(unit), true);
  tickSimulation(state, POSTURE_TRANSITION_DURATIONS_SECONDS.standingToCrouched / 2);
  assert.equal(unit.behaviorRuntime.posture, 'crouched');
  assert.equal(unit.behaviorRuntime.physicalAction?.status, 'completed');
}

function verifyCrouchedToProneIsTimed(): void {
  const state = makeState('crouched');
  const unit = state.units[0];
  start(unit, state, 'prone', 'owner-a');
  tickSimulation(state, POSTURE_TRANSITION_DURATIONS_SECONDS.crouchedToProne - 0.01);
  assert.equal(unit.behaviorRuntime.posture, 'crouched');
  tickSimulation(state, 0.01);
  assert.equal(unit.behaviorRuntime.posture, 'prone');
}

function verifyProneToStandingUsesTwoPhases(): void {
  const state = makeState('prone');
  const unit = state.units[0];
  const total = postureTransitionDurationSeconds('prone', 'standing');
  assert.equal(total, POSTURE_TRANSITION_DURATIONS_SECONDS.proneToCrouched + POSTURE_TRANSITION_DURATIONS_SECONDS.crouchedToStanding);
  start(unit, state, 'standing', 'owner-a');
  tickSimulation(state, POSTURE_TRANSITION_DURATIONS_SECONDS.proneToCrouched);
  assert.equal(unit.behaviorRuntime.posture, 'crouched');
  assert.equal(isPostureTransitionRunning(unit), true);
  tickSimulation(state, POSTURE_TRANSITION_DURATIONS_SECONDS.crouchedToStanding);
  assert.equal(unit.behaviorRuntime.posture, 'standing');
  assert.equal(unit.behaviorRuntime.physicalAction?.progress, 1);
}

function verifyStepPartitionInvariance(): void {
  const coarse = runTransition('standing', 'prone', [1.2]);
  const fine = runTransition('standing', 'prone', Array.from({ length: 12 }, () => 0.1));
  assert.deepEqual(coarse, fine);
}

function verifyCanonicalEffectivePostureConsumers(): void {
  const state = makeState('standing');
  const unit = state.units[0];
  unit.order = createMoveOrder({ x: 40.5, y: 2.5 }, { source: 'player', ownerToken: 'route-owner' });
  start(unit, state, 'prone', 'owner-a');
  tickSimulation(state, POSTURE_TRANSITION_DURATIONS_SECONDS.standingToCrouched);
  const diagnostics = getPostureTransitionDiagnostics(unit);
  assert.equal(diagnostics.effectivePosture, 'crouched');
  assert.equal(unit.movementRuntime.diagnostics.postureMultiplier, 0.65);
  assert.equal(soldierPostureHeightMeters(unit.behaviorRuntime.posture), 1.1);
  const shapes = getUnitHitShapes(unit, state.map);
  assert.ok(Math.max(...shapes.map((shape) => shape.topZMetres)) < 1.3);
  assert.ok(Math.max(...shapes.map((shape) => shape.topZMetres)) > 1.2);
}

function verifySecondIncompatibleTransitionIsRejected(): void {
  const state = makeState('standing');
  const unit = state.units[0];
  const first = start(unit, state, 'prone', 'owner-a');
  const second = requestPostureTransition(unit, request(state, 'crouched', 'owner-b'));
  assert.equal(first.accepted, true);
  assert.equal(second.accepted, false);
  assert.equal(second.reasonCode, 'posture_transition_owned_by_other');
  assert.equal(unit.behaviorRuntime.physicalAction?.ownerToken, 'owner-a');
}

function verifyOwnerCancellation(): void {
  const state = makeState('standing');
  const unit = state.units[0];
  start(unit, state, 'prone', 'owner-a');
  tickSimulation(state, 0.5);
  const result = cancelPostureTransition(unit, 'owner-a', 'test_owner_cancelled', 'Владелец отменил переход в тесте.');
  assert.equal(result.accepted, true);
  assert.equal(unit.behaviorRuntime.physicalAction?.status, 'cancelled');
  assert.equal(unit.behaviorRuntime.posture, 'crouched');
}

function verifyForeignCancellationIsRejected(): void {
  const state = makeState('standing');
  const unit = state.units[0];
  start(unit, state, 'prone', 'owner-a');
  const result = cancelPostureTransition(unit, 'owner-b', 'foreign_cancel', 'Чужая отмена.');
  assert.equal(result.accepted, false);
  assert.equal(result.reasonCode, 'posture_transition_cancel_denied_owner');
  assert.equal(isPostureTransitionRunning(unit), true);
}

function verifyCombatCapabilityLossCancelsTransition(): void {
  const state = makeState('standing');
  const unit = state.units[0];
  start(unit, state, 'prone', 'owner-a');
  replaceCombatRuntime(unit, { capability: 'incapacitated', lastHit: null });
  tickSimulation(state, 0.1);
  assert.equal(unit.behaviorRuntime.physicalAction?.status, 'cancelled');
  assert.equal(unit.behaviorRuntime.physicalAction?.resultCode, 'posture_transition_combat_capability_lost');
}

function verifyMidTransitionSaveRestore(): void {
  const state = makeState('standing');
  const unit = state.units[0];
  start(unit, state, 'prone', 'owner-save');
  tickSimulation(state, 0.6);
  const before = getPostureTransitionDiagnostics(unit);
  const exported = buildExportedScene(state);
  const normalized = normalizeImportedScene(exported);
  const restored = createInitialState(normalized.map, normalized.units, normalized.pressureZones);
  const restoredUnit = restored.units[0];
  const after = getPostureTransitionDiagnostics(restoredUnit);
  assert.equal(after.progress, before.progress);
  assert.deepEqual(after.owner, before.owner);
  assert.equal(after.ownerToken, before.ownerToken);
  assert.equal(restoredUnit.behaviorRuntime.physicalAction?.durationSeconds, unit.behaviorRuntime.physicalAction?.durationSeconds);
  const remaining = (1 - after.progress) * (restoredUnit.behaviorRuntime.physicalAction?.durationSeconds ?? 0);
  tickSimulation(restored, remaining);
  assert.equal(restoredUnit.behaviorRuntime.physicalAction?.status, 'completed');
  const event = restoredUnit.behaviorRuntime.lastEvent;
  tickSimulation(restored, 0.1);
  assert.equal(restoredUnit.behaviorRuntime.lastEvent, event, 'terminal action must not emit completion twice');
}

function verifyTacticalArrivalStartsPhysicalTransition(): void {
  const state = makeState('standing');
  const unit = state.units[0];
  const created = createPlayerMoveCommand(
    unit.id,
    { ...unit.position },
    null,
    10,
    'normal',
    null,
    null,
    'prone',
    'standing',
  );
  unit.playerCommand = updatePlayerCommandStatus(created, 'completed', 'arrived', 'Боец прибыл.');
  unit.order = null;
  tickSimulation(state, 0.01);
  assert.equal(isPostureTransitionRunning(unit), true);
  assert.equal(unit.behaviorRuntime.physicalAction?.owner.source, 'tactical_position');
  assert.equal(unit.playerCommand?.arrivalPostureApplied, false);
  tickSimulation(state, postureTransitionDurationSeconds('standing', 'prone'));
  assert.equal(unit.behaviorRuntime.posture, 'prone');
  assert.equal(unit.playerCommand?.arrivalPostureApplied, true);
  assert.equal(unit.playerCommand?.tacticalPositionOccupationStatus, 'occupied');
}

function verifyNewOrderDoesNotCreateTwoPostureOwners(): void {
  const state = makeState('standing');
  const unit = state.units[0];
  const oldCommand = createPlayerMoveCommand(unit.id, { x: 20.5, y: 2.5 }, null, 10, 'normal', null, null, 'prone', 'standing');
  start(unit, state, 'prone', postureOwnerTokenForPlayerCommand(oldCommand.id), 'tactical_position', oldCommand.id);
  const newCommand = createPlayerMoveCommand(unit.id, { x: 30.5, y: 2.5 }, oldCommand, 20, 'normal');
  const foreign = requestPostureTransition(unit, {
    ...request(state, 'crouched', postureOwnerTokenForPlayerCommand(newCommand.id)),
    owner: { source: 'player_command', id: newCommand.id },
  });
  assert.equal(foreign.accepted, false);
  assert.equal(unit.behaviorRuntime.physicalAction?.owner.id, oldCommand.id);
}

function verifyTransitionBlocksAiming(): void {
  const state = makeState('standing');
  const unit = state.units[0];
  start(unit, state, 'crouched', 'owner-a');
  const decision = evaluateFireRequest(state, unit, 'missing-contact');
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'Shooter is changing posture.');
}

function verifyEffectivePostureNeverFlickers(): void {
  const state = makeState('standing');
  const unit = state.units[0];
  start(unit, state, 'prone', 'owner-a');
  const seen: Array<UnitModel['behaviorRuntime']['posture']> = [unit.behaviorRuntime.posture];
  for (let index = 0; index < 30; index += 1) {
    tickSimulation(state, 0.05);
    seen.push(unit.behaviorRuntime.posture);
  }
  const rank = { standing: 2, crouched: 1, prone: 0 } as const;
  for (let index = 1; index < seen.length; index += 1) {
    assert.ok(rank[seen[index]] <= rank[seen[index - 1]], `posture flicker: ${seen.join(' -> ')}`);
  }
}

function runTransition(source: UnitModel['behaviorRuntime']['posture'], target: UnitModel['behaviorRuntime']['posture'], deltas: number[]) {
  const state = makeState(source);
  const unit = state.units[0];
  start(unit, state, target, 'owner-a');
  for (const delta of deltas) tickSimulation(state, delta);
  return {
    posture: unit.behaviorRuntime.posture,
    progress: unit.behaviorRuntime.physicalAction?.progress,
    status: unit.behaviorRuntime.physicalAction?.status,
  };
}

function start(
  unit: UnitModel,
  state: SimulationState,
  targetPosture: UnitModel['behaviorRuntime']['posture'],
  ownerToken: string,
  ownerSource: 'test' | 'tactical_position' = 'test',
  ownerId = ownerToken,
) {
  return requestPostureTransition(unit, {
    ...request(state, targetPosture, ownerToken),
    owner: { source: ownerSource, id: ownerId },
  });
}

function request(
  state: SimulationState,
  targetPosture: UnitModel['behaviorRuntime']['posture'],
  ownerToken: string,
) {
  return {
    targetPosture,
    owner: { source: 'test' as const, id: ownerToken },
    ownerToken,
    startedSeconds: state.simulationTimeSeconds,
    reasonCode: 'test_posture_request',
    reasonRu: 'Проверочная смена позы.',
  };
}

function makeState(posture: UnitModel['behaviorRuntime']['posture']): SimulationState {
  return createInitialState(mapData(), [unitData(posture)]);
}

function unitData(posture: UnitModel['behaviorRuntime']['posture']): UnitData {
  return {
    id: 'posture-unit',
    label: 'Posture unit',
    labelRu: 'Боец смены позы',
    type: 'infantry_squad',
    side: 'player',
    aiControl: 'manual',
    x: 1,
    y: 2,
    speedCellsPerSecond: 4,
    facingDegrees: 0,
    initialState: { posture },
  };
}

function mapData(): TacticalMapData {
  return {
    width: 64,
    height: 8,
    cellSize: 16,
    metersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: [],
  };
}
