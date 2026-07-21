import assert from 'node:assert/strict';
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
verifyStandingUnitUsesCrouchedProtectedApproach();
verifyLowerPostureSurvivesTacticalApproach();

for (const state of createdStates) clearStaticTacticalPositionService(state);

console.log('Posture-adaptive movement smoke passed: standing walks, crouched crouch-walks, prone crawls, and tactical approaches advance without posture oscillation.');

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
