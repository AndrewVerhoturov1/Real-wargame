import assert from 'node:assert/strict';
import {
  getMapObjectBounds,
  getMapObjectCenter,
  intersectSegmentWithMapObject,
  isPointInsideMapObject,
  mapObjectIntersectsRect,
} from '../src/core/map/MapObjectGeometry';
import { normalizeMap, type MapObjectData, type TacticalMapData } from '../src/core/map/MapModel';
import { buildNavigationGrid, isNavigationCellPassable } from '../src/core/pathfinding/GridNavigation';
import { getMapObjectSpatialIndex } from '../src/core/spatial/MapObjectSpatialIndex';
import { createBallisticTraceContext, traceBallisticRay } from '../src/core/combat/BallisticTrace';
import { getVisibilityStaticGrid } from '../src/core/visibility/VisibilityStaticGrid';

const one = makeMap([{ id: 'one', kind: 'structure', x: 3, y: 4, widthCells: 1, heightCells: 1, losHeightMeters: 2 }]);
const oneObject = one.objects[0]!;
assert.deepEqual(getMapObjectCenter(oneObject), { x: 3.5, y: 4.5 });
assert.equal(isPointInsideMapObject(oneObject, { x: 3.5, y: 4.5 }), true);
assert.equal(getMapObjectSpatialIndex(one).queryPoint(3.5, 4.5)[0]?.id, 'one');

const wide = makeMap([{ id: 'wide', kind: 'structure', x: 8, y: 5, widthCells: 4, heightCells: 2, losHeightMeters: 2.5 }]);
const wideObject = wide.objects[0]!;
assert.deepEqual(getMapObjectCenter(wideObject), { x: 8.5, y: 5.5 }, 'size must not shift the canonical center');
assert.deepEqual(getMapObjectBounds(wideObject), { minX: 6.5, minY: 4.5, maxX: 10.5, maxY: 6.5 });
assert.equal(getMapObjectSpatialIndex(wide).queryPoint(8.5, 5.5)[0]?.id, 'wide');

const navigation = buildNavigationGrid(wide);
assert.equal(isNavigationCellPassable(navigation, 8, 5), false, 'navigation must block at the rendered object center');
const visibility = getVisibilityStaticGrid(wide);
assert.equal(visibility.blockingFlags[5 * wide.width + 8], 1, 'visibility must rasterize the same occupied cell');

const crossing = traceBallisticRay(createBallisticTraceContext(wide, []), rayInput(2.5, 5.5, 14.5, 5.5, 1));
assert.equal(crossing.hitType, 'object');
assert.equal(crossing.hitObjectId, 'wide');
assert.ok(Math.abs(crossing.travelledMetres - 8) < 1e-6, `expected 8 m entry distance, got ${crossing.travelledMetres}`);

const beside = traceBallisticRay(createBallisticTraceContext(wide, []), rayInput(2.5, 6.5001, 14.5, 6.5001, 1));
assert.equal(beside.hitType, 'none', 'a line just outside the exact edge must not hit');
assert.equal(intersectSegmentWithMapObject(wideObject, { x: 2.5, y: 6.5001 }, { x: 14.5, y: 6.5001 }), null);

const rotated = makeMap([{ id: 'rotated', kind: 'fence', x: 12, y: 9, widthCells: 5, heightCells: 0.5, rotationDegrees: 45, losHeightMeters: 1.5 }]);
const rotatedObject = rotated.objects[0]!;
assert.equal(isPointInsideMapObject(rotatedObject, { x: 12.5, y: 9.5 }), true);
assert.equal(mapObjectIntersectsRect(rotatedObject, { minX: 12, minY: 9, maxX: 13, maxY: 10 }), true);
assert.equal(getMapObjectSpatialIndex(rotated).queryPoint(12.5, 9.5)[0]?.id, 'rotated');
assert.equal(getVisibilityStaticGrid(rotated).blockingFlags[9 * rotated.width + 12], 1);

const boundary = makeMap([{ id: 'boundary', kind: 'post', x: 0, y: 0, widthCells: 1, heightCells: 1, losHeightMeters: 2 }]);
assert.equal(getMapObjectSpatialIndex(boundary).queryPoint(0.5, 0.5)[0]?.id, 'boundary');
assert.equal(buildNavigationGrid(boundary).cells[0]?.blockedByObjectId, 'boundary');

const overlappingA = makeMap([
  { id: 'b', kind: 'structure', x: 6, y: 5, widthCells: 2, heightCells: 2, losHeightMeters: 2 },
  { id: 'a', kind: 'structure', x: 6, y: 5, widthCells: 2, heightCells: 2, losHeightMeters: 2 },
]);
const overlappingB = makeMap([
  { id: 'a', kind: 'structure', x: 6, y: 5, widthCells: 2, heightCells: 2, losHeightMeters: 2 },
  { id: 'b', kind: 'structure', x: 6, y: 5, widthCells: 2, heightCells: 2, losHeightMeters: 2 },
]);
const orderedA = traceBallisticRay(createBallisticTraceContext(overlappingA, []), rayInput(2.5, 5.5, 12.5, 5.5, 1));
const orderedB = traceBallisticRay(createBallisticTraceContext(overlappingB, []), rayInput(2.5, 5.5, 12.5, 5.5, 1));
assert.equal(orderedA.hitObjectId, 'a');
assert.equal(orderedB.hitObjectId, 'a', 'equal-distance result must not depend on map object array order');

console.log('Map object geometry parity smoke passed.');

function makeMap(objects: MapObjectData[]) {
  const data: TacticalMapData = {
    width: 24,
    height: 16,
    cellSize: 16,
    metersPerCell: 2,
    runtimeMetersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects,
  };
  return normalizeMap(data);
}

function rayInput(startX: number, startY: number, endX: number, endY: number, zMetres: number) {
  const metresPerCell = 2;
  const dx = (endX - startX) * metresPerCell;
  const dy = (endY - startY) * metresPerCell;
  const distance = Math.hypot(dx, dy);
  return {
    shotId: 'geometry-parity',
    shooterId: 'none',
    origin: { xMetres: startX * metresPerCell, yMetres: startY * metresPerCell, zMetres },
    direction: { x: dx / distance, y: dy / distance, z: 0 },
    maximumDistanceMetres: distance,
    muzzleVelocityMetresPerSecond: 800,
  };
}
