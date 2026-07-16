import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { normalizeMap } from '../src/core/map/MapModel';
import { renderVegetationChunkPixels, vegetationChunkCoordinatesForRegion, vegetationRasterScale } from '../src/rendering/VegetationChunkRaster';

const width = 320; const height = 200;
const vegetationMaterialMap = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => ((x > 20 && x < 290 && y > 15 && y < 185) ? ((x + y) % 5 === 0 ? 'dense_forest' : 'sparse_forest') : 'none')));
const map = normalizeMap({ width, height, cellSize: 4.8, metersPerCell: 2, vegetationMaterialMap });
const chunks = vegetationChunkCoordinatesForRegion(map, { minX: 0, minY: 0, maxX: width - 1, maxY: height - 1 }, 0);
assert.equal(chunks.length, 70);
const rasterScale = vegetationRasterScale(map);
assert.ok(rasterScale < 0.32 && rasterScale > 0.3);
const started = performance.now();
let bytes = 0;
for (const { chunkX, chunkY } of chunks) {
  const minX = chunkX * 32; const minY = chunkY * 32;
  const raster = renderVegetationChunkPixels(map, { minX, minY, maxX: Math.min(width - 1, minX + 31), maxY: Math.min(height - 1, minY + 31) }, rasterScale);
  bytes += raster.data.byteLength;
}
const elapsed = performance.now() - started;
assert.ok(bytes < 700_000, `unexpected retained raster size: ${bytes}`);
assert.ok(elapsed < 250, `chunk raster fixture took ${elapsed.toFixed(1)} ms`);
const stableDirty = vegetationChunkCoordinatesForRegion(map, { minX: 100, minY: 100, maxX: 100, maxY: 100 });
assert.ok(stableDirty.length <= 1, 'non-boundary single-cell edit should update one chunk');
console.log(`environment-performance: smoke passed (${elapsed.toFixed(1)} ms, ${bytes} bytes)`);
