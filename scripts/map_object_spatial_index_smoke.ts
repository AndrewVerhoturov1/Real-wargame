import assert from 'node:assert/strict';
import { normalizeMap, type TacticalMapData } from '../src/core/map/MapModel';
import { getMapRevisionSnapshot } from '../src/core/map/MapRuntimeState';
import {
  createMapObjectSpatialQueryScratch,
  getMapObjectSpatialIndex,
  getMapObjectSpatialIndexDiagnostics,
} from '../src/core/spatial/MapObjectSpatialIndex';

const mapData: TacticalMapData = {
  width: 32,
  height: 24,
  cellSize: 24,
  metersPerCell: 10,
  defaultTerrain: 'field',
  objects: [
    {
      id: 'rotated-wall',
      kind: 'structure',
      x: 8,
      y: 8,
      widthCells: 6,
      heightCells: 0.8,
      rotationDegrees: 45,
    },
    {
      id: 'far-tree',
      kind: 'tree',
      x: 25,
      y: 18,
    },
  ],
};

const map = normalizeMap(mapData);
const index = getMapObjectSpatialIndex(map);
assert.deepEqual(index.queryPoint(8.5, 8.5).map((object) => object.id), ['rotated-wall']);
assert.deepEqual(index.queryPoint(1, 1), []);
assert.deepEqual(index.querySegment({ x: 2, y: 8.5 }, { x: 15, y: 8.5 }).map((object) => object.id), ['rotated-wall']);
assert.deepEqual(index.queryCircle({ x: 25.5, y: 18.5 }, 2).map((object) => object.id), ['far-tree']);

let diagnostics = getMapObjectSpatialIndexDiagnostics(map);
assert.equal(diagnostics.buildCount, 1);
assert.equal(diagnostics.objectCount, 2);
assert.equal(diagnostics.queryCount, 4, 'each public query must be counted exactly once');
const segmentOutput: typeof map.objects = [];
index.querySegmentInto(
  { x: 2, y: 8.5 },
  { x: 15, y: 8.5 },
  0.25,
  segmentOutput,
  createMapObjectSpatialQueryScratch(),
);
assert.equal(getMapObjectSpatialIndexDiagnostics(map).queryCount, 5, 'prepared query must be counted exactly once');

const revisionsBeforeMove = getMapRevisionSnapshot(map);
map.objects[0].x = 18;
const revisionsAfterMove = getMapRevisionSnapshot(map);
assert.ok(revisionsAfterMove.objects > revisionsBeforeMove.objects, 'object proxy must invalidate the object revision');

const rebuilt = getMapObjectSpatialIndex(map);
assert.deepEqual(rebuilt.queryPoint(8.5, 8.5), []);
assert.deepEqual(rebuilt.queryPoint(18.5, 8.5).map((object) => object.id), ['rotated-wall']);
diagnostics = getMapObjectSpatialIndexDiagnostics(map);
assert.equal(diagnostics.buildCount, 2);

map.objects.push({
  id: 'new-rock',
  kind: 'rock',
  x: 4,
  y: 4,
  rotationRadians: 0,
  widthCells: 1,
  heightCells: 1,
  labels: null,
});
const afterPush = getMapObjectSpatialIndex(map);
assert.deepEqual(afterPush.queryPoint(4.5, 4.5).map((object) => object.id), ['new-rock']);
assert.equal(getMapObjectSpatialIndexDiagnostics(map).buildCount, 3);

console.log('Map-object spatial index smoke passed: conservative queries and revision-driven rebuilds.');
