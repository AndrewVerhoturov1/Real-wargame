import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  POSTURE_TRANSITION_DURATIONS_SECONDS,
  cancelPostureTransition,
  getPostureTransitionDiagnostics,
  isPostureTransitionRunning,
  postureOwnerTokenForPlayerCommand,
  postureTransitionDurationSeconds,
  requestPostureTransition,
} from '../src/core/actions/PostureTransition';
import { tickPostureTransitionWithTimeBudget } from '../src/core/actions/PostureTransitionClock';
import { evaluateFireRequest } from '../src/core/combat/CombatDecision';
import { requestFireAction } from '../src/core/combat/FireAction';
import { replaceCombatRuntime } from '../src/core/combat/CombatDamage';
import { getUnitHitShapes } from '../src/core/combat/UnitHitShapes';
import { setFireAllowed } from '../src/core/combat/CombatRules';
import type { TacticalMapData } from '../src/core/map/MapModel';
import { createMoveOrder } from '../src/core/orders/MoveOrder';
import { issueRoutedMoveOrderToSelectedUnits } from '../src/core/orders/RoutedMoveOrders';
import {
  createPlayerMoveCommand,
  updatePlayerCommandStatus,
} from '../src/core/orders/PlayerCommand';
import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';
import { tickSimulation } from '../src/core/simulation/SimulationTick';
import { clearStaticTacticalPositionService } from '../src/core/tactical/static/StaticTacticalPositionService';
import { soldierPostureHeightMeters } from '../src/core/visibility/VisibilityPosture';
import type { UnitData, UnitModel } from '../src/core/units/UnitModel';
import { buildExportedScene, normalizeImportedScene } from '../src/ui/SceneExport';

const createdStates = new Set<SimulationState>();

verifyStandingToCrouchedIsTimed();
verifyCrouchedToProneIsTimed();
verifyProneToCrouchedIsTimed();
verifyCrouchedToStandingIsTimed();
verifyProneToStandingUsesTwoPhases();
verifyStepPartitionInvariance();
verifyPostureConsumesOnlyRequiredSimulationTime();
verifyCanonicalEffectivePostureConsumers();
verifySecondIncompatibleTransitionIsRejected();
verifyRepeatedOwnerRequestIsIdempotent();
verifyOwnerCancellation();
verifyForeignCancellationIsRejected();
verifyCombatCapabilityLossCancelsTransition();
verifySaveRestoreAtRequiredCheckpoints();
verifyTacticalArrivalStartsPhysicalTransition();
verifyNewOrderDoesNotCreateTwoPostureOwners();
verifyTransitionBlocksAiming();
verifyTransitionBlocksFireRequest();
verifyEffectivePostureNeverFlickers();
verifyNoInstantLivePostureWritesRemain();

for (const state of createdStates) clearStaticTacticalPositionService(state);

console.log('Posture transition smoke passed: timed phases, deterministic tick budgets, canonical effective posture, ownership, cancellation, save/restore, tactical arrival and aiming conflict.');

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

function verifyProneToCrouchedIsTimed(): void {
  const state = makeState('prone');
  const unit = state.units[0];
  start(unit, state, 'crouched', 'owner-a');
  tickSimulation(state, POSTURE_TRANSITION_DURATIONS_SECONDS.proneToCrouched - 0.01);
  assert.equal(unit.behaviorRuntime.posture, 'prone');
  tickSimulation(state, 0.01);
  assert.equal(unit.behaviorRuntime.posture, 'crouched');
}

function verifyCrouchedToStandingIsTimed(): void {
  const state = makeState('crouched');
  const unit = state.units[0];
  start(unit, state, 'standing', 'owner-a');
  tickSimulation(state, POSTURE_TRANSITION_DURATIONS_SECONDS.crouchedToStanding - 0.01);
  assert.equal(unit.behaviorRuntime.posture, 'crouched');
  tickSimulation(state, 0.01);
  assert.equal(unit.behaviorRuntime.posture, 'standing');
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

function verifyPostureConsumesOnlyRequiredSimulationTime(): void {
  const total = postureTransitionDurationSeconds('standing', 'prone');
  const coarseState = makeState('standing');
  const coarseUnit = coarseState.units[0];
  start(coarseUnit, coarseState, 'prone', 'owner-budget');
  const coarse = tickPostureTransitionWithTimeBudget(coarseUnit, total + 0.8, true);
  assert.equal(coarse.completed, true);
  assert.ok(approximately(coarse.consumedSeconds, total));
  assert.ok(approximately(coarse.remainingSeconds, 0.8));

  const fineState = makeState('standing');
  const fineUnit = fineState.units[0];
  start(fineUnit, fineState, 'prone', 'owner-budget');
  let fineRemaining = 0;
  for (let index = 0; index < 20; index += 1) {
    fineRemaining += tickPostureTransitionWithTimeBudget(fineUnit, 0.1, true).remainingSeconds;
  }
  assert.equal(fineUnit.behaviorRuntime.physicalAction?.status, 'completed');
  assert.ok(approximately(fineRemaining, coarse.remainingSeconds));
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

function verifyRepeatedOwnerRequestIsIdempotent(): void {
  const state = makeState('standing');
  const unit = state.units[0];
  const first = start(unit, state, 'prone', 'owner-repeat');
  const repeated = start(unit, state, 'prone', 'owner-repeat');
  assert.equal(repeated.accepted, true);
  assert.equal(repeated.reasonCode, 'posture_transition_already_running');
  assert.equal(repeated.action?.id, first.action?.id);
  assert.equal(repeated.action?.sequence, first.action?.sequence);
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

function verifySaveRestoreAtRequiredCheckpoints(): void {
  const total = postureTransitionDurationSeconds('standing', 'prone');
  for (const elapsed of [0, total / 2, total - 0.01]) {
    const state = makeState('standing');
    const unit = state.units[0];
    start(unit, state, 'prone', 'owner-save');
    if (elapsed > 0) tickSimulation(state, elapsed);
    const before = unit.behaviorRuntime.physicalAction;
    assert.ok(before);
    const restored = restoreScene(state);
    const after = restored.units[0].behaviorRuntime.physicalAction;
    assert.ok(after);
    assert.equal(after.id, before.id);
    assert.equal(after.progress, before.progress);
    assert.deepEqual(after.owner, before.owner);
    assert.equal(after.ownerToken, before.ownerToken);
    assert.equal(after.durationSeconds, before.durationSeconds);
    assert.equal(after.status, before.status);
  }

  const middle = makeState('standing');
  const middleUnit = middle.units[0];
  start(middleUnit, middle, 'prone', 'owner-save');
  tickSimulation(middle, total / 2);
  const restoredMiddle = restoreScene(middle);
  const restoredUnit = restoredMiddle.units[0];
  const remaining = (1 - (restoredUnit.behaviorRuntime.physicalAction?.progress ?? 0))
    * (restoredUnit.behaviorRuntime.physicalAction?.durationSeconds ?? 0);
  tickSimulation(restoredMiddle, remaining);
  assert.equal(restoredUnit.behaviorRuntime.physicalAction?.status, 'completed');
  const event = restoredUnit.behaviorRuntime.lastEvent;
  tickSimulation(restoredMiddle, 0.1);
  assert.equal(restoredUnit.behaviorRuntime.lastEvent, event, 'terminal action must not emit completion twice');

  const immediateAtLaterTime = makeState('standing');
  tickSimulation(immediateAtLaterTime, 12);
  const immediateAtLaterTimeUnit = immediateAtLaterTime.units[0];
  start(immediateAtLaterTimeUnit, immediateAtLaterTime, 'crouched', 'owner-immediate-late-save');
  const restoredImmediateAtLaterTime = restoreScene(immediateAtLaterTime);
  tickSimulation(
    restoredImmediateAtLaterTime,
    POSTURE_TRANSITION_DURATIONS_SECONDS.standingToCrouched,
  );
  assert.equal(restoredImmediateAtLaterTime.units[0].behaviorRuntime.posture, 'crouched');
  assert.equal(restoredImmediateAtLaterTime.units[0].behaviorRuntime.physicalAction?.status, 'completed');

  const cancelled = makeState('standing');
  const cancelledUnit = cancelled.units[0];
  start(cancelledUnit, cancelled, 'prone', 'owner-save');
  tickSimulation(cancelled, total / 2);
  cancelPostureTransition(cancelledUnit, 'owner-save', 'test_saved_cancel', 'Переход отменён до сохранения.');
  const restoredCancelled = restoreScene(cancelled);
  const restoredCancelledUnit = restoredCancelled.units[0];
  assert.equal(restoredCancelledUnit.behaviorRuntime.physicalAction?.status, 'cancelled');
  assert.equal(restoredCancelledUnit.behaviorRuntime.physicalAction?.ownerToken, 'owner-save');
  const cancelledProgress = restoredCancelledUnit.behaviorRuntime.physicalAction?.progress;
  tickSimulation(restoredCancelled, 0.5);
  assert.equal(restoredCancelledUnit.behaviorRuntime.physicalAction?.status, 'cancelled');
  assert.equal(restoredCancelledUnit.behaviorRuntime.physicalAction?.progress, cancelledProgress);

  const completed = makeState('standing');
  const completedUnit = completed.units[0];
  start(completedUnit, completed, 'prone', 'owner-completed-save');
  tickSimulation(completed, total);
  const restoredCompleted = restoreScene(completed);
  assert.equal(restoredCompleted.units[0].behaviorRuntime.posture, 'prone');
  assert.equal(restoredCompleted.units[0].behaviorRuntime.physicalAction?.status, 'completed');
  const completedAction = JSON.stringify(restoredCompleted.units[0].behaviorRuntime.physicalAction);
  tickSimulation(restoredCompleted, 0.2);
  assert.equal(
    JSON.stringify(restoredCompleted.units[0].behaviorRuntime.physicalAction),
    completedAction,
    'a restored completed action must not complete or mutate twice',
  );

  const oldScene = buildExportedScene(makeState('crouched')) as unknown as {
    units: Array<{ runtime?: { physicalAction?: unknown } }>;
    map: Parameters<typeof createInitialState>[0];
    pressureZones?: Parameters<typeof createInitialState>[2];
  };
  delete oldScene.units[0]?.runtime?.physicalAction;
  const oldNormalized = normalizeImportedScene(oldScene as never);
  const restoredOld = rememberState(createInitialState(oldNormalized.map, oldNormalized.units, oldNormalized.pressureZones));
  assert.equal(restoredOld.units[0].behaviorRuntime.posture, 'crouched');
  assert.equal(restoredOld.units[0].behaviorRuntime.physicalAction, null);

  const corruptScene = buildExportedScene(makeState('standing')) as unknown as {
    units: Array<{ runtime?: { physicalAction?: unknown } }>;
  };
  if (corruptScene.units[0]?.runtime) {
    corruptScene.units[0].runtime.physicalAction = {
      schemaVersion: 999,
      type: 'posture_transition',
      sourcePosture: 'standing',
      targetPosture: 'prone',
      progress: 0.75,
    };
  }
  const corruptNormalized = normalizeImportedScene(corruptScene as never);
  const restoredCorrupt = rememberState(createInitialState(
    corruptNormalized.map,
    corruptNormalized.units,
    corruptNormalized.pressureZones,
  ));
  assert.equal(restoredCorrupt.units[0].behaviorRuntime.posture, 'standing');
  assert.equal(restoredCorrupt.units[0].behaviorRuntime.physicalAction, null);

  const unknownStatusScene = buildExportedScene(makeState('standing')) as unknown as {
    units: Array<{ runtime?: { physicalAction?: unknown } }>;
  };
  if (unknownStatusScene.units[0]?.runtime) {
    unknownStatusScene.units[0].runtime.physicalAction = {
      schemaVersion: 1,
      id: 'corrupt-status-action',
      sequence: 1,
      type: 'posture_transition',
      owner: { source: 'system', id: 'corrupt-save' },
      ownerToken: 'corrupt-save',
      sourcePosture: 'standing',
      targetPosture: 'prone',
      startedSeconds: 0,
      durationSeconds: total,
      progress: 0.75,
      status: 'unknown',
      reasonCode: 'corrupt_save',
      reasonRu: 'Повреждённое сохранение.',
      resultCode: null,
      resultRu: null,
    };
  }
  const unknownStatusNormalized = normalizeImportedScene(unknownStatusScene as never);
  const restoredUnknownStatus = rememberState(createInitialState(
    unknownStatusNormalized.map,
    unknownStatusNormalized.units,
    unknownStatusNormalized.pressureZones,
  ));
  assert.equal(restoredUnknownStatus.units[0].behaviorRuntime.posture, 'standing');
  assert.equal(restoredUnknownStatus.units[0].behaviorRuntime.physicalAction, null);
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

  state.selectedUnitIds = [unit.id];
  state.selectedUnitId = unit.id;
  issueRoutedMoveOrderToSelectedUnits(state, { x: 12.5, y: 2.5 });
  assert.equal(unit.behaviorRuntime.physicalAction?.status, 'cancelled');
  assert.equal(
    unit.behaviorRuntime.physicalAction?.resultCode,
    'posture_transition_replaced_by_player_command',
  );
  assert.equal(isPostureTransitionRunning(unit), false);
}

function verifyTransitionBlocksAiming(): void {
  const state = makeState('standing');
  const unit = state.units[0];
  start(unit, state, 'crouched', 'owner-a');
  const decision = evaluateFireRequest(state, unit, 'missing-contact');
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'Shooter is changing posture.');
}

function verifyTransitionBlocksFireRequest(): void {
  const state = makeState('standing');
  const unit = state.units[0];
  setFireAllowed(state, true);
  start(unit, state, 'crouched', 'owner-fire-block');
  assert.equal(requestFireAction(state, unit, 'missing-contact'), false);
  assert.equal(unit.behaviorRuntime.lastEvent, 'combat_fire_request_denied');
  assert.equal(unit.behaviorRuntime.reason, 'Нельзя начать наведение или выстрел во время физической смены позы.');
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

function verifyNoInstantLivePostureWritesRemain(): void {
  const allowed = new Set([
    'src/core/actions/PostureTransition.ts',
    'src/core/knowledge/AwarenessWorldFieldBuilder.ts',
    'src/core/units/UnitModel.ts',
  ]);
  const violations: string[] = [];
  for (const file of walkTypeScriptFiles('src')) {
    const source = readFileSync(file, 'utf8');
    if (!/behaviorRuntime\.posture\s*=(?!=)/.test(source)) continue;
    const normalized = file.split(path.sep).join('/');
    if (!allowed.has(normalized)) violations.push(normalized);
  }
  assert.deepEqual(violations, [], `instant live posture writes: ${violations.join(', ')}`);
}

function walkTypeScriptFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const item = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkTypeScriptFiles(item));
    else if (entry.isFile() && item.endsWith('.ts')) files.push(item);
  }
  return files;
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

function restoreScene(state: SimulationState): SimulationState {
  const exported = buildExportedScene(state);
  const normalized = normalizeImportedScene(exported);
  return rememberState(createInitialState(normalized.map, normalized.units, normalized.pressureZones));
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
  return rememberState(createInitialState(mapData(), [unitData(posture)]));
}

function rememberState(state: SimulationState): SimulationState {
  createdStates.add(state);
  return state;
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

function approximately(left: number, right: number, epsilon = 1e-9): boolean {
  return Math.abs(left - right) <= epsilon;
}
