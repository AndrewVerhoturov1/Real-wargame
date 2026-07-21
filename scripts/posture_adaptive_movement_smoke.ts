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
verifyProtectedTacticalApproachDoesNotOscillate();

for (const state of createdStates) clearStaticTacticalPositionService(state);

console.log('Posture-adaptive movement smoke passed: standing walks, crouched crouch-walks, prone crawls, and protected tactical approaches advance without posture oscillation.');

function verifyOrdinaryMovementPreservesPostureAndUsesMatchingGait(): void {
  const scenarios: readonly [UnitPosture, MovementGait][] = [
    ['standing', 'walk'],
    ['crouched', 'crouch_walk'],
    ['prone', 'crawl'],
  ];

  for (const [posture, expectedGait] of scenarios) {
    const state = makeState(`ordinary-${posture}`);
    const unit = state.units[0]!;
    unit.behaviorRuntime.posture = posture;
    unit.behaviorRuntime.previousPosture = posture;
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

function verifyProtectedTacticalApproachDoesNotOscillate(): void {
  const state = makeState('protected-tactical-approach');
  const unit = state.units[0]!;
  selectOnlyUnit(state, unit.id);
  const startX = unit.position.x;

  assert.equal(
    issueTacticalPositionMoveOrderToSelectedUnit(
      state,
      { x: 40.5, y: unit.position.y },
      'prone',
      {
        kind: 'cover',
        requestIdentity: 'posture-adaptive-regression',
        candidateId: 'protected-prone-position',
        recommendedFacingRadians: 0,
      },
    ),
    true,
  );
  assert.equal(unit.playerCommand?.approachPosture, 'crouched');

  for (let index = 0; index < 20; index += 1) tickSimulation(state, 0.1);

  assert.equal(unit.behaviorRuntime.posture, 'crouched', 'protected approach must remain crouched until arrival');
  assert.equal(unit.movementRuntime.actualGait, 'crouch_walk', 'protected approach must use crouched movement');
  assert.ok(unit.position.x > startX + 0.1, 'protected approach must advance instead of alternating between standing and crouched');
  assert.ok(unit.order, 'the distant tactical route must remain active while approaching');
  assert.equal(unit.behaviorRuntime.physicalAction?.sequence, 1, 'approach posture must be requested once, without a standing/crouched loop');
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
