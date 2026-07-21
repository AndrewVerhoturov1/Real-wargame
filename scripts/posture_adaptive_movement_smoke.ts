import assert from 'node:assert/strict';
import { requestPlayerPostureTransition } from '../src/core/actions/PostureTransition';
import type { UnitPosture } from '../src/core/behavior/BehaviorModel';
import type { TacticalMapData } from '../src/core/map/MapModel';
import type { MovementGait } from '../src/core/movement/MovementProfiles';
import { issueRoutedMoveOrderToSelectedUnits } from '../src/core/orders/RoutedMoveOrders';
import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';
import { tickSimulation } from '../src/core/simulation/SimulationTick';
import { issueTacticalPositionMoveOrderToSelectedUnit } from '../src/core/tactical/TacticalPositionOrders';
import { clearStaticTacticalPositionService } from '../src/core/tactical/static/StaticTacticalPositionService';

const createdStates = new Set<SimulationState>();

verifyOrdinaryMovementPreservesPostureAndUsesMatchingGait();
verifyManualPostureChangeRetargetsActiveRoute();
verifyStandingUnitUsesCrouchedProtectedApproach();
verifyLowerPostureSurvivesTacticalApproach();
verifyManualPostureChangeRetargetsTacticalApproach();

for (const state of createdStates) clearStaticTacticalPositionService(state);

console.log('Posture-adaptive movement smoke passed: starting posture selects gait, manual posture changes retarget active routes, and tactical approaches advance without posture rollback or oscillation.');

function verifyOrdinaryMovementPreservesPostureAndUsesMatchingGait(): void {
  const scenarios: readonly [UnitPosture, MovementGait][] = [
    ['standing', 'walk'],
    ['crouched', 'crouch_walk'],
    ['prone', 'crawl'],
  ];

  for (const [posture, expectedGait] of scenarios) {
    const state = makeState(`ordinary-${posture}`);
    const unit = state.units[0]!;
    setPosture(unit, posture);
    selectOnlyUnit(state, unit.id);
    const startX = unit.position.x;

    issueRoutedMoveOrderToSelectedUnits(state, { x: 40.5, y: unit.position.y });
    tickSimulation(state, 0.25);

    assert.equal(unit.behaviorRuntime.posture, posture, `${posture} ordinary movement must not force standing`);
    assert.equal(unit.movementRuntime.actualGait, expectedGait, `${posture} ordinary movement must use ${expectedGait}`);
    assert.ok(unit.position.x > startX, `${posture} ordinary movement must translate during the first movement step`);
    assert.notEqual(unit.behaviorRuntime.physicalAction?.status, 'running', `${posture} ordinary movement must not start a conflicting posture transition`);
  }
}

function verifyManualPostureChangeRetargetsActiveRoute(): void {
  const state = makeState('manual-posture-active-route');
  const unit = state.units[0]!;
  selectOnlyUnit(state, unit.id);
  issueRoutedMoveOrderToSelectedUnits(state, { x: 50.5, y: unit.position.y });
  tickSimulation(state, 0.4);
  const route = unit.order;
  const beforeProneX = unit.position.x;

  const proneRequest = requestPlayerPostureTransition(unit, 'prone', state.simulationTimeSeconds);
  assert.equal(proneRequest.accepted, true);
  for (let index = 0; index < 13; index += 1) tickSimulation(state, 0.1);
  tickSimulation(state, 0.4);

  assert.equal(unit.order, route, 'manual posture change must retain the active route');
  assert.equal(unit.behaviorRuntime.posture, 'prone', 'manual prone command must survive after the transition completes');
  assert.equal(unit.movementRuntime.requestedProfileId, 'crawl');
  assert.equal(unit.movementRuntime.requestedGait, 'crawl');
  assert.equal(unit.movementRuntime.actualGait, 'crawl');
  assert.equal(unit.playerCommand?.movementProfileId, 'crawl');
  assert.ok(unit.position.x > beforeProneX, 'unit must resume the same route by crawling');

  for (let index = 0; index < 10; index += 1) tickSimulation(state, 0.1);
  assert.equal(unit.behaviorRuntime.posture, 'prone', 'old standing movement authority must not restore the starting posture');

  const crouchedRequest = requestPlayerPostureTransition(unit, 'crouched', state.simulationTimeSeconds);
  assert.equal(crouchedRequest.accepted, true);
  for (let index = 0; index < 7; index += 1) tickSimulation(state, 0.1);
  tickSimulation(state, 0.3);

  assert.equal(unit.behaviorRuntime.posture, 'crouched');
  assert.equal(unit.movementRuntime.requestedProfileId, 'crouched_move');
  assert.equal(unit.movementRuntime.actualGait, 'crouch_walk');
  assert.equal(unit.playerCommand?.movementProfileId, 'crouched_move');
  assert.equal(unit.order, route, 'a second manual posture change must still retain the route');
}

function verifyStandingUnitUsesCrouchedProtectedApproach(): void {
  const state = makeState('standing-protected-tactical-approach');
  const unit = state.units[0]!;
  selectOnlyUnit(state, unit.id);
  const startX = unit.position.x;

  issueProtectedTacticalOrder(state, 'prone', 'standing-to-protected-prone');
  assert.equal(unit.playerCommand?.approachPosture, 'crouched');

  for (let index = 0; index < 20; index += 1) tickSimulation(state, 0.1);

  assert.equal(unit.behaviorRuntime.posture, 'crouched', 'standing unit may lower to crouched for a protected approach');
  assert.equal(unit.movementRuntime.actualGait, 'crouch_walk', 'protected approach from standing must use crouched movement');
  assert.ok(unit.position.x > startX + 0.1, 'protected approach must advance instead of alternating between standing and crouched');
  assert.ok(unit.order, 'the distant tactical route must remain active while approaching');
  assert.equal(unit.behaviorRuntime.physicalAction?.sequence, 1, 'approach posture must be requested once, without a standing/crouched loop');
}

function verifyLowerPostureSurvivesTacticalApproach(): void {
  const scenarios: readonly [UnitPosture, UnitPosture, MovementGait][] = [
    ['crouched', 'prone', 'crouch_walk'],
    ['prone', 'prone', 'crawl'],
  ];

  for (const [posture, arrivalPosture, expectedGait] of scenarios) {
    const state = makeState(`${posture}-tactical-approach`);
    const unit = state.units[0]!;
    setPosture(unit, posture);
    selectOnlyUnit(state, unit.id);
    const startX = unit.position.x;

    issueProtectedTacticalOrder(state, arrivalPosture, `${posture}-to-${arrivalPosture}`);
    assert.equal(unit.playerCommand?.approachPosture, posture, `${posture} unit must keep its current lower posture during approach`);

    for (let index = 0; index < 20; index += 1) tickSimulation(state, 0.1);

    assert.equal(unit.behaviorRuntime.posture, posture, `${posture} tactical approach must not raise the unit`);
    assert.equal(unit.movementRuntime.actualGait, expectedGait, `${posture} tactical approach must use ${expectedGait}`);
    assert.ok(unit.position.x > startX + 0.1, `${posture} tactical approach must advance`);
    assert.ok(unit.order, 'the distant tactical route must remain active while approaching');
    assert.notEqual(unit.behaviorRuntime.physicalAction?.status, 'running', `${posture} tactical approach must not create a redundant posture transition`);
  }
}

function verifyManualPostureChangeRetargetsTacticalApproach(): void {
  const state = makeState('manual-posture-tactical-approach');
  const unit = state.units[0]!;
  selectOnlyUnit(state, unit.id);
  issueProtectedTacticalOrder(state, 'prone', 'manual-tactical-posture-change');
  for (let index = 0; index < 10; index += 1) tickSimulation(state, 0.1);
  const route = unit.order;
  const beforeChangeX = unit.position.x;

  const request = requestPlayerPostureTransition(unit, 'prone', state.simulationTimeSeconds);
  assert.equal(request.accepted, true);
  for (let index = 0; index < 9; index += 1) tickSimulation(state, 0.1);
  tickSimulation(state, 0.4);

  assert.equal(unit.order, route, 'manual tactical approach posture change must retain the route');
  assert.equal(unit.playerCommand?.approachPosture, 'prone', 'manual posture must replace the stored tactical approach posture');
  assert.equal(unit.playerCommand?.arrivalPosture, 'prone', 'arrival posture contract must remain intact');
  assert.equal(unit.behaviorRuntime.posture, 'prone');
  assert.equal(unit.movementRuntime.actualGait, 'crawl');
  assert.ok(unit.position.x > beforeChangeX, 'tactical approach must resume by crawling');

  for (let index = 0; index < 10; index += 1) tickSimulation(state, 0.1);
  assert.equal(unit.behaviorRuntime.posture, 'prone', 'old crouched approach authority must not restore the previous posture');
}

function issueProtectedTacticalOrder(
  state: SimulationState,
  arrivalPosture: UnitPosture,
  candidateId: string,
): void {
  assert.equal(
    issueTacticalPositionMoveOrderToSelectedUnit(
      state,
      { x: 40.5, y: state.units[0]!.position.y },
      arrivalPosture,
      {
        kind: 'defense',
        requestIdentity: 'posture-adaptive-regression',
        candidateId,
        recommendedFacingRadians: 0,
      },
    ),
    true,
  );
}

function setPosture(unit: SimulationState['units'][number], posture: UnitPosture): void {
  unit.behaviorRuntime.posture = posture;
  unit.behaviorRuntime.previousPosture = posture;
}

function makeState(id: string): SimulationState {
  const state = createInitialState(mapData(), [{
    id,
    label: id,
    labelRu: 'Боец',
    type: 'infantry_squad',
    side: 'blue',
    aiControl: 'manual',
    x: 1,
    y: 2,
    speedCellsPerSecond: 4,
    facingDegrees: 0,
  }], []);
  createdStates.add(state);
  return state;
}

function selectOnlyUnit(state: SimulationState, unitId: string): void {
  state.selectedUnitId = unitId;
  state.selectedUnitIds = [unitId];
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
