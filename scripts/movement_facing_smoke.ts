import assert from 'node:assert/strict';
import { normalizeMap, type TacticalMapData } from '../src/core/map/MapModel';
import { createMoveOrder } from '../src/core/orders/MoveOrder';
import { createInitialState } from '../src/core/simulation/SimulationState';
import { tickSimulation } from '../src/core/simulation/SimulationTick';
import type { UnitData } from '../src/core/units/UnitModel';

const state = createInitialState(makeMap(), [makeUnit()], []);
const unit = state.units[0];
unit.facingRadians = Math.PI;
unit.order = createMoveOrder({ x: 6.5, y: 1.5 }, {
  waypoints: [{ x: 3.5, y: 1.5 }, { x: 3.5, y: 4.5 }, { x: 6.5, y: 4.5 }],
  finalFacingRadians: Math.PI / 4,
});

tickSimulation(state, 0.05);
assert.ok(angleDistance(unit.facingRadians, 0) < 0.001, 'unit must face east on the first segment');

for (let index = 0; index < 200 && (unit.order?.waypointIndex ?? 0) < 1; index += 1) tickSimulation(state, 0.05);
tickSimulation(state, 0.05);
assert.ok(angleDistance(unit.facingRadians, Math.PI / 2) < 0.001, 'unit must face south on the second segment');

for (let index = 0; index < 800 && unit.order; index += 1) tickSimulation(state, 0.05);
assert.equal(unit.order, null);
assert.ok(angleDistance(unit.facingRadians, Math.PI / 4) < 0.001, 'explicit final facing must override the last movement heading');

console.log('Movement facing smoke passed.');

function makeMap(): TacticalMapData {
  return { width: 10, height: 7, cellSize: 24, metersPerCell: 2, defaultTerrain: 'field', defaultHeight: 0, cells: [], objects: [] };
}
function makeUnit(): UnitData {
  return { id: 'turning_unit', label: 'Turning unit', labelRu: 'Поворачивающийся боец', type: 'infantry_squad', side: 'player', x: 1, y: 1, speedCellsPerSecond: 4 };
}
function angleDistance(a: number, b: number): number {
  const full = Math.PI * 2;
  const difference = Math.abs(((a - b + Math.PI) % full + full) % full - Math.PI);
  return difference;
}
