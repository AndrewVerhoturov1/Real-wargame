import assert from 'node:assert/strict';
import {
  cancelPostureTransition,
  postureOwnerTokenForPlayerCommand,
  requestPostureTransition,
} from '../src/core/actions/PostureTransition';
import { reloadWeapon } from '../src/core/combat/WeaponModel';
import type { TacticalMapData } from '../src/core/map/MapModel';
import { createMoveOrder } from '../src/core/orders/MoveOrder';
import {
  createPlayerMoveCommand,
  updatePlayerCommandStatus,
} from '../src/core/orders/PlayerCommand';
import { createInitialState } from '../src/core/simulation/SimulationState';
import { tickSimulation } from '../src/core/simulation/SimulationTick';
import { reconcileTacticalPositionOccupation } from '../src/core/tactical/TacticalPositionOccupation';
import type { UnitModel } from '../src/core/units/UnitModel';

verifyRoutePausesAndResumes();
verifyReloadAndPostureConflictsAreSymmetric();
verifyCancelledTacticalCommandCancelsItsPostureAction();

console.log('Posture transition route smoke passed: route retention, deterministic stop/resume, reload conflict and tactical cancellation.');

function verifyRoutePausesAndResumes(): void {
  const state = createInitialState(mapData(), [{
    id: 'route-posture-unit',
    type: 'infantry_squad',
    side: 'blue',
    aiControl: 'manual',
    x: 1,
    y: 2,
    speedCellsPerSecond: 4,
  }]);
  const unit = state.units[0];
  unit.movementRuntime.requestedGait = 'crouch_walk';
  unit.movementRuntime.actualGait = 'crouch_walk';
  const route = createMoveOrder(
    { x: 40.5, y: unit.position.y },
    { source: 'player', ownerToken: 'route-owner' },
  );
  unit.order = route;
  const startX = unit.position.x;
  const result = request(
    unit,
    state.simulationTimeSeconds,
    'crouched',
    'movement-posture:route-owner',
  );
  assert.equal(result.accepted, true);

  tickSimulation(state, 0.2);
  assert.equal(unit.position.x, startX, 'unit must not translate while posture action is running');
  assert.equal(unit.order, route, 'posture action must retain the current route');

  tickSimulation(state, 0.25);
  assert.equal(unit.position.x, startX, 'an exact completion tick has no movement remainder');
  assert.equal(unit.behaviorRuntime.posture, 'crouched');
  assert.equal(unit.order, route);

  tickSimulation(state, 0.5);
  assert.ok(unit.position.x > startX, 'movement must resume on the retained route after posture completion');
  assert.ok(unit.order, 'the distant route must remain active after movement resumes');
}

function verifyReloadAndPostureConflictsAreSymmetric(): void {
  const state = createInitialState(mapData(), [{
    id: 'reload-posture-unit',
    type: 'infantry_squad',
    side: 'blue',
    aiControl: 'manual',
    x: 1,
    y: 2,
  }]);
  const unit = state.units[0];
  request(unit, state.simulationTimeSeconds, 'prone', 'posture-owner');
  assert.equal(reloadWeapon(unit), 0);
  assert.equal(unit.behaviorRuntime.lastEvent, 'combat_reload_rejected_posture_transition');

  cancelPostureTransition(unit, 'posture-owner', 'test_cancel_before_reload', 'Переход отменён перед проверкой перезарядки.');
  unit.behaviorRuntime.currentAction = 'reload';
  const rejected = request(unit, state.simulationTimeSeconds, 'standing', 'reload-conflict-owner');
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.reasonCode, 'posture_transition_weapon_conflict');
}

function verifyCancelledTacticalCommandCancelsItsPostureAction(): void {
  const state = createInitialState(mapData(), [{
    id: 'cancelled-tactical-posture-unit',
    type: 'infantry_squad',
    side: 'blue',
    aiControl: 'manual',
    x: 1,
    y: 2,
  }]);
  const unit = state.units[0];
  const activeCommand = createPlayerMoveCommand(
    unit.id,
    { x: 5.5, y: 2.5 },
    null,
    10,
    'normal',
    null,
    null,
    'prone',
    'crouched',
  );
  unit.playerCommand = updatePlayerCommandStatus(
    activeCommand,
    'cancelled',
    'cancelled in posture test',
    'Приказ отменён в проверке позы.',
  );
  const ownerToken = postureOwnerTokenForPlayerCommand(activeCommand.id);
  requestPostureTransition(unit, {
    targetPosture: 'crouched',
    owner: { source: 'tactical_position', id: activeCommand.id },
    ownerToken,
    startedSeconds: state.simulationTimeSeconds,
    reasonCode: 'tactical_position_approach',
    reasonRu: 'Проверка отмены тактической позы.',
  });

  reconcileTacticalPositionOccupation(state, unit);
  assert.equal(unit.behaviorRuntime.physicalAction?.status, 'cancelled');
  assert.equal(
    unit.behaviorRuntime.physicalAction?.resultCode,
    'tactical_position_posture_cancelled_by_command',
  );
}

function request(
  unit: UnitModel,
  startedSeconds: number,
  targetPosture: UnitModel['behaviorRuntime']['posture'],
  ownerToken: string,
) {
  return requestPostureTransition(unit, {
    targetPosture,
    owner: { source: 'test', id: ownerToken },
    ownerToken,
    startedSeconds,
    reasonCode: 'route_posture_test',
    reasonRu: 'Проверка остановки и возобновления маршрута.',
  });
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
