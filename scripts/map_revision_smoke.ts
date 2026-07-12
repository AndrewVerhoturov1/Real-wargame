import assert from 'node:assert/strict';
import {
  consumeMapDirtyRegion,
  getMapRevisionSnapshot,
  markMapCellsDirty,
  markMapObjectsDirty,
  normalizeMap,
  type TacticalMapData,
} from '../src/core/map/MapModel';

const mapData: TacticalMapData = {
  width: 12,
  height: 8,
  cellSize: 24,
  metersPerCell: 10,
  defaultTerrain: 'field',
  defaultHeight: 0,
};

const map = normalizeMap(mapData);
const initial = getMapRevisionSnapshot(map);

assert.deepEqual(initial, {
  terrain: 1,
  height: 1,
  forest: 1,
  objects: 1,
  visual: 1,
});
assert.equal(consumeMapDirtyRegion(map, 'height'), null);

markMapCellsDirty(map, 'height', { minX: 2, minY: 3, maxX: 4, maxY: 5 });
let revisions = getMapRevisionSnapshot(map);
assert.equal(revisions.height, 2);
assert.equal(revisions.visual, 2);
assert.equal(revisions.forest, 1);

markMapCellsDirty(map, 'height', { minX: 1, minY: 4, maxX: 6, maxY: 7 });
revisions = getMapRevisionSnapshot(map);
assert.equal(revisions.height, 3);
assert.equal(revisions.visual, 3);
assert.deepEqual(consumeMapDirtyRegion(map, 'height'), {
  minX: 1,
  minY: 3,
  maxX: 6,
  maxY: 7,
});
assert.equal(consumeMapDirtyRegion(map, 'height'), null);

markMapCellsDirty(map, 'forest', { minX: -5, minY: -3, maxX: 99, maxY: 99 });
assert.deepEqual(consumeMapDirtyRegion(map, 'forest'), {
  minX: 0,
  minY: 0,
  maxX: 11,
  maxY: 7,
});
assert.equal(getMapRevisionSnapshot(map).forest, 2);

markMapObjectsDirty(map, { minX: 3, minY: 2, maxX: 5, maxY: 6 });
assert.equal(getMapRevisionSnapshot(map).objects, 2);
assert.deepEqual(consumeMapDirtyRegion(map, 'objects'), {
  minX: 3,
  minY: 2,
  maxX: 5,
  maxY: 6,
});

const snapshot = getMapRevisionSnapshot(map);
snapshot.height = 999;
assert.equal(getMapRevisionSnapshot(map).height, 3, 'revision snapshots must not expose mutable map state');

console.log('Map revision smoke passed: independent revisions, bounded dirty regions, merging and clean consumption.');
