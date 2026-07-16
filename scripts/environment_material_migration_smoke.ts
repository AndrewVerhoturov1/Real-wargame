import assert from 'node:assert/strict';
import { normalizeMap } from '../src/core/map/MapModel';

const legacy = normalizeMap({
  width: 3, height: 1, cellSize: 10, metersPerCell: 2,
  cells: [
    { x: 0, y: 0, terrain: 'field', forest: 0 },
    { x: 1, y: 0, terrain: 'forest', forest: 0 },
    { x: 2, y: 0, terrain: 'swamp', forest: 2 },
  ],
});
assert.deepEqual(legacy.cells.map((cell) => cell.vegetationMaterialId), ['none', 'sparse_forest', 'dense_forest']);
assert.deepEqual(legacy.cells.map((cell) => cell.surfaceMaterialId), ['field', 'field', 'swamp']);
assert.equal(legacy.environmentProfileId, 'default');

const canonical = normalizeMap({
  width: 2, height: 1, cellSize: 10,
  environmentProfileId: 'custom',
  surfaceMaterialMap: [['road', 'rough']],
  vegetationMaterialMap: [['sparse_forest', 'none']],
});
assert.equal(canonical.environmentProfileId, 'custom');
assert.deepEqual(canonical.cells.map((cell) => [cell.surfaceMaterialId, cell.vegetationMaterialId]), [['road', 'sparse_forest'], ['rough', 'none']]);

const canonicalWins = normalizeMap({
  width: 1,
  height: 1,
  cellSize: 10,
  cells: [{
    x: 0,
    y: 0,
    terrain: 'water',
    forest: 2,
    surfaceMaterialId: 'road',
    vegetationMaterialId: 'none',
  }],
});
assert.deepEqual(
  [canonicalWins.cells[0].surfaceMaterialId, canonicalWins.cells[0].vegetationMaterialId, canonicalWins.cells[0].terrain, canonicalWins.cells[0].forest],
  ['road', 'none', 'road', 0],
  'canonical material IDs must win over contradictory legacy projections',
);
console.log('environment-material-migration: smoke passed');
