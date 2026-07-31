import assert from 'node:assert/strict';
import { createMoveOrder } from '../src/core/orders/MoveOrder';
import { setMovementProfileRequest } from '../src/core/movement/MovementRuntime';
import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';
import { tickSimulation } from '../src/core/simulation/SimulationTick';
import { clearStaticTacticalPositionService } from '../src/core/tactical/static/StaticTacticalPositionService';
import { buildCombatLabInitialState, getCombatLabScenarioDefinition } from '../src/core/testing/combat-lab';
import type { UnitModel } from '../src/core/units/UnitModel';

const definition = getCombatLabScenarioDefinition('rifle-moving-target');
const lab = buildCombatLabInitialState(definition.scenarioId, definition.revision, definition.defaultSeed).state;
assert.equal(lab.map.metersPerCell, 2, 'Combat Lab должен использовать клетки 2×2 м.');
const labUnit = lab.units.find((unit) => unit.id === 'moving-rifle-target');
assert.ok(labUnit);

const control = createInitialState({
  width: lab.map.width,
  height: lab.map.height,
  cellSize: lab.map.cellSize,
  metersPerCell: 2,
  defaultTerrain: 'field',
  defaultHeight: 0,
  objects: [],
}, [{
  id: 'control-mover',
  label: 'Control mover',
  labelRu: 'Контрольный боец',
  type: 'infantry_squad',
  side: 'red',
  aiControl: 'manual',
  x: labUnit.position.x,
  y: labUnit.position.y,
  facingDegrees: 0,
}]);

const labDistance = runFlatWalk(lab, labUnit);
const controlDistance = runFlatWalk(control, control.units[0]!);
assert.ok(labDistance > 0 && labDistance <= 20.000001, `Боец должен пройти положительное расстояние не больше 20 м, получено ${labDistance}.`);
assert.ok(Math.abs(labDistance - controlDistance) < 1e-6, `Combat Lab и production должны давать одинаковое расстояние: ${labDistance} против ${controlDistance}.`);

clearStaticTacticalPositionService(lab);
clearStaticTacticalPositionService(control);
console.log('Combat Lab movement distance regression smoke passed.');

function runFlatWalk(state: SimulationState, unit: UnitModel): number {
  unit.behaviorRuntime.posture = 'standing';
  unit.behaviorRuntime.previousPosture = 'standing';
  unit.suppression = 0;
  unit.stress = 0;
  const start = { ...unit.position };
  setMovementProfileRequest(state, unit, 'normal_walk', 'player_order');
  unit.order = createMoveOrder({ x: start.x + 10, y: start.y }, { source: 'player' });
  for (let index = 0; index < 300 && unit.order; index += 1) tickSimulation(state, 0.1);
  return Math.hypot(unit.position.x - start.x, unit.position.y - start.y) * state.map.metersPerCell;
}
