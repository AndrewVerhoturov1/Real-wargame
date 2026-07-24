import assert from 'node:assert/strict';
import {
  getUnitHitShapes,
  intersectRayWithUnitHitShapeList,
  intersectRayWithUnitHitShapes,
  normalizeLegacyHitZone,
} from '../src/core/combat/UnitHitShapes';
import { createInitialState } from '../src/core/simulation/SimulationState';

for (const posture of ['standing', 'crouched', 'prone'] as const) {
  const state = createInitialState({
    width: 20,
    height: 20,
    cellSize: 20,
    metersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: [],
  }, [{ id: `geometry-${posture}`, side: 'blue', x: 5, y: 5, type: 'infantry_squad', initialState: { posture } }]);
  const unit = state.units[0]!;
  unit.behaviorRuntime.posture = posture;
  const shapes = getUnitHitShapes(unit, state.map);
  assert.deepEqual([...new Set(shapes.map((shape) => shape.zone))].sort(), ['arms', 'head', 'legs', 'torso']);
  assert.equal(new Set(shapes.map((shape) => shape.shapeId)).size, shapes.length);
  assert.ok(shapes.every((shape) => shape.shapeId.startsWith(`${posture}:`)));
}

const state = createInitialState({
  width: 20,
  height: 20,
  cellSize: 20,
  metersPerCell: 2,
  defaultTerrain: 'field',
  defaultHeight: 0,
  objects: [],
}, [{ id: 'geometry-target', side: 'red', x: 5, y: 5, type: 'infantry_squad', facingDegrees: 0 }]);
const unit = state.units[0]!;
const origin = { xMetres: 5, yMetres: unit.position.y * state.map.metersPerCell, zMetres: 1.1 };
const direction = { x: 1, y: 0, z: 0 };
const intersection = intersectRayWithUnitHitShapes(origin, direction, 30, unit, state.map);
assert.ok(intersection);
assert.equal(intersection.zone, 'torso');
assert.ok(intersection.entryDistanceMetres <= intersection.exitDistanceMetres);
assert.equal(intersection.pathLengthMetres, intersection.exitDistanceMetres - intersection.entryDistanceMetres);
assert.deepEqual(intersection.point, intersection.entryPoint);
assert.equal(intersection.distanceMetres, intersection.entryDistanceMetres);
assert.ok(Number.isFinite(intersection.entryNormal.x));
assert.ok(Number.isFinite(intersection.entryNormal.y));
assert.ok(Number.isFinite(intersection.entryNormal.z));
assert.ok(Math.abs(Math.hypot(intersection.entryNormal.x, intersection.entryNormal.y, intersection.entryNormal.z) - 1) < 1e-9);

const shapes = getUnitHitShapes(unit, state.map);
const forward = intersectRayWithUnitHitShapeList(origin, direction, 30, shapes);
const reversed = intersectRayWithUnitHitShapeList(origin, direction, 30, [...shapes].reverse());
assert.deepEqual(reversed, forward, 'shape storage order must not change the nearest body intersection');

const inside = intersectRayWithUnitHitShapes(
  { xMetres: unit.position.x * state.map.metersPerCell, yMetres: unit.position.y * state.map.metersPerCell, zMetres: 1.1 },
  direction,
  30,
  unit,
  state.map,
);
assert.ok(inside);
assert.equal(inside.entryDistanceMetres, 0);
assert.ok(inside.exitDistanceMetres > 0);

const torso = shapes.find((shape) => shape.zone === 'torso')!;
const tangent = intersectRayWithUnitHitShapeList(
  { xMetres: 0, yMetres: torso.centerYMetres + torso.radiusMetres, zMetres: 1.1 },
  direction,
  30,
  shapes.filter((shape) => shape.zone === 'torso'),
);
assert.ok(tangent === null || (Number.isFinite(tangent.pathLengthMetres) && tangent.pathLengthMetres >= 0));
assert.equal(normalizeLegacyHitZone('limbs'), 'arms');
assert.equal(normalizeLegacyHitZone('invalid'), null);

console.log('Infantry combat Stage 6 body geometry smoke passed: four zones, stable shape IDs, deterministic entry/exit/path/normal and legacy limbs normalization.');
