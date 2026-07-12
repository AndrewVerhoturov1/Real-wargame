import assert from 'node:assert/strict';
import { getCell, normalizeMap, type TacticalMapData } from '../src/core/map/MapModel';
import { markMapCellsDirty } from '../src/core/map/MapRuntimeState';
import {
  buildSmoothedHeightGrid,
  getSmoothedHeightGrid,
  getSmoothTerrainDiagnostics,
  sampleSmoothHeightLevel,
} from '../src/core/terrain/SmoothTerrain';

const data: TacticalMapData = {
  width: 7,
  height: 7,
  cellSize: 24,
  metersPerCell: 10,
  defaultTerrain: 'field',
  defaultHeight: 0,
  cells: [{ x: 3, y: 3, height: 4 }],
};

const map = normalizeMap(data);
const first = getSmoothedHeightGrid(map);
let diagnostics = getSmoothTerrainDiagnostics(map);
assert.equal(diagnostics.fullBuildCount, 1);
assert.equal(diagnostics.incrementalBuildCount, 0);
assert.equal(diagnostics.cacheHitCount, 0);

const second = getSmoothedHeightGrid(map);
assert.equal(second, first, 'cache hits must reuse the existing grid object');
diagnostics = getSmoothTerrainDiagnostics(map);
assert.equal(diagnostics.fullBuildCount, 1);
assert.equal(diagnostics.cacheHitCount, 1);

const changedCell = getCell(map, 2, 3);
assert.ok(changedCell);
changedCell.height = 3;
markMapCellsDirty(map, 'height', { minX: 2, minY: 3, maxX: 2, maxY: 3 });

const beforeFarSample = first[0][0];
const updated = getSmoothedHeightGrid(map);
assert.equal(updated, first, 'incremental invalidation must update the cached grid in place');
diagnostics = getSmoothTerrainDiagnostics(map);
assert.equal(diagnostics.fullBuildCount, 1);
assert.equal(diagnostics.incrementalBuildCount, 1);
assert.ok(diagnostics.lastUpdatedCellCount <= 9, `single-cell edit updated ${diagnostics.lastUpdatedCellCount} smoothed cells`);
assert.equal(updated[0][0], beforeFarSample, 'far cells must not be recomputed or changed');

const full = buildSmoothedHeightGrid(map);
assert.deepEqual(updated, full, 'incremental result must equal a clean full rebuild');
assert.ok(sampleSmoothHeightLevel(map, 2.5, 3.5) > 0);

console.log('Smooth terrain cache smoke passed: constant-time hits and bounded incremental rebuilds match full output.');
