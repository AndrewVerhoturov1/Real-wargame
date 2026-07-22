import assert from 'node:assert/strict';
import {
  isPostureTransitionRunning,
  postureTransitionDurationSeconds,
  requestPlayerPostureTransition,
  requestPostureTransition,
} from '../src/core/actions/PostureTransition';
import {
  movementGaitForPosture,
  movementProfileIdForPosture,
} from '../src/core/movement/PostureMovementProfile';
import { issueRoutedMoveOrderToSelectedUnits } from '../src/core/orders/RoutedMoveOrders';
import { createInitialState } from '../src/core/simulation/SimulationState';
import { tickSimulation } from '../src/core/simulation/SimulationTick';
import { clearStaticTacticalPositionService } from '../src/core/tactical/static/StaticTacticalPositionService';
import type { TacticalMapData } from '../src/core/map/MapModel';
import type { UnitData } from '../src/core/units/UnitModel';

verifyPlayerPostureOwnsMovementProfileDuringRoute();
verifyForeignPostureActionDoesNotStealPlayerMovementAuthority();

console.log('Player posture movement authority smoke passed.');

function verifyPlayerPostureOwnsMovementProfileDuringRoute(): void {
  const state = makeState();
  const unit = state.units[0];
  selectAndIssueRoute(state);

  const commandBefore = unit.playerCommand;
  assert.ok(commandBefore);
  assert.ok(unit.order);

  const result = requestPlayerPostureTransition(unit, 'prone', state.simulationTimeSeconds);
  assert.equal(result.accepted, true);
  assert.equal(result.action?.owner.source, 'player');
  assert.equal(isPostureTransitionRunning(unit), true);

  tickSimulation(state, 0.01);

  const profileId = movementProfileIdForPosture('prone');
  const gait = movementGaitForPosture('prone');
  assert.equal(unit.playerCommand?.intent.movementProfileId, profileId);
  assert.equal(unit.playerCommand?.movementProfileId, profileId);
  assert.ok((unit.playerCommand?.revision ?? 0) > commandBefore.revision);
  assert.equal(unit.playerCommand?.reason, 'Player changed posture during active movement.');
  assert.equal(unit.movementRuntime.requestedProfileId, profileId);
  assert.equal(unit.movementRuntime.effectiveProfileId, profileId);
  assert.equal(unit.movementRuntime.requestedProfileSource, 'player_order');
  assert.equal(unit.movementRuntime.effectiveProfileSource, 'player_order');
  assert.equal(unit.movementRuntime.requestedGait, gait);
  assert.equal(unit.order?.movementProfileId, profileId);
  assert.equal(unit.order?.movementProfileSource, 'player_order');
  assert.equal(unit.behaviorRuntime.lastEvent, 'player_posture_movement_authority_updated');

  tickSimulation(state, postureTransitionDurationSeconds('standing', 'prone') + 0.1);
  assert.equal(unit.behaviorRuntime.posture, 'prone');
  assert.equal(unit.behaviorRuntime.physicalAction?.status, 'completed');
  assert.equal(unit.movementRuntime.requestedProfileId, profileId);
  assert.equal(unit.movementRuntime.effectiveProfileId, profileId);

  tickSimulation(state, 0.1);
  assert.equal(unit.behaviorRuntime.posture, 'prone', 'movement authority must not request the starting posture again');
  assert.equal(isPostureTransitionRunning(unit), false);

  clearStaticTacticalPositionService(state);
}

function verifyForeignPostureActionDoesNotStealPlayerMovementAuthority(): void {
  const state = makeState();
  const unit = state.units[0];
  selectAndIssueRoute(state);

  const profileBefore = unit.movementRuntime.requestedProfileId;
  const sourceBefore = unit.movementRuntime.requestedProfileSource;
  const orderProfileBefore = unit.order?.movementProfileId;
  const commandRevisionBefore = unit.playerCommand?.revision;

  const result = requestPostureTransition(unit, {
    targetPosture: 'crouched',
    owner: { source: 'test', id: 'foreign-test-owner' },
    ownerToken: 'foreign-test-owner',
    startedSeconds: state.simulationTimeSeconds,
    reasonCode: 'foreign_test_transition',
    reasonRu: 'Проверочный переход не от игрока.',
  });
  assert.equal(result.accepted, true);

  tickSimulation(state, 0.01);

  assert.equal(unit.movementRuntime.requestedProfileId, profileBefore);
  assert.equal(unit.movementRuntime.requestedProfileSource, sourceBefore);
  assert.equal(unit.order?.movementProfileId, orderProfileBefore);
  assert.equal(unit.playerCommand?.revision, commandRevisionBefore);

  clearStaticTacticalPositionService(state);
}

function selectAndIssueRoute(state: ReturnType<typeof createInitialState>): void {
  const unit = state.units[0];
  state.selectedUnitId = unit.id;
  state.selectedUnitIds = [unit.id];
  issueRoutedMoveOrderToSelectedUnits(state, { x: 18.5, y: 2.5 });
  assert.ok(unit.order, 'route order must be created');
  assert.ok(unit.playerCommand, 'player command must be created');
}

function makeState() {
  return createInitialState(mapData(), [unitData()]);
}

function unitData(): UnitData {
  return {
    id: 'player-posture-sync-unit',
    label: 'Player posture sync unit',
    labelRu: 'Боец проверки ручной позы',
    type: 'infantry_squad',
    side: 'player',
    aiControl: 'manual',
    x: 1,
    y: 2,
    speedCellsPerSecond: 4,
    facingDegrees: 0,
    initialState: { posture: 'standing' },
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
