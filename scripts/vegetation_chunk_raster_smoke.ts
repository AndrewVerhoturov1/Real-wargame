import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeMap } from '../src/core/map/MapModel';
import { createDefaultEnvironmentProfileRegistry } from '../src/core/map/EnvironmentMaterialProfile';
import { installEnvironmentProfileRegistry } from '../src/core/map/EnvironmentProfileRuntime';
import {
  VEGETATION_CHUNK_SIZE_CELLS,
  VEGETATION_TARGET_PIXELS_PER_CELL,
  renderVegetationChunkPixels,
  vegetationChunkCoordinatesForRegion,
  vegetationRasterScale,
} from '../src/rendering/VegetationChunkRaster';

assert.equal(VEGETATION_CHUNK_SIZE_CELLS, 32);
assert.equal(VEGETATION_TARGET_PIXELS_PER_CELL, 6);
assert.equal(vegetationRasterScale({ cellSize: 24 }), 0.25, 'normal map cells must retain six raster pixels per cell');
const map = normalizeMap({ width: 64, height: 32, cellSize: 2, metersPerCell: 2, vegetationMaterialMap: Array.from({ length: 32 }, () => Array(64).fill('sparse_forest')) });
const left = renderVegetationChunkPixels(map, { minX: 0, minY: 0, maxX: 31, maxY: 31 }, 1);
const right = renderVegetationChunkPixels(map, { minX: 32, minY: 0, maxX: 63, maxY: 31 }, 1);
const repeat = renderVegetationChunkPixels(map, { minX: 0, minY: 0, maxX: 31, maxY: 31 }, 1);
assert.deepEqual(left.data, repeat.data, 'raster must be deterministic');
assert.equal(left.containsVegetation && right.containsVegetation, true);
let leftBorder = 0; let rightBorder = 0;
for (let y = 0; y < left.height; y += 1) { leftBorder += left.data[(y * left.width + left.width - 1) * 4 + 3]; rightBorder += right.data[(y * right.width) * 4 + 3]; }
assert.ok(leftBorder / left.height > 100 && rightBorder / right.height > 100, 'connected chunks must not have a transparent seam');

const contourMap = normalizeMap({
  width: 16,
  height: 16,
  cellSize: 6,
  metersPerCell: 2,
  vegetationMaterialMap: Array.from({ length: 16 }, () => [
    ...Array(8).fill('sparse_forest'),
    ...Array(8).fill('none'),
  ]),
});
const contour = renderVegetationChunkPixels(contourMap, { minX: 0, minY: 0, maxX: 15, maxY: 15 }, 1);
const contourEdgeColumns = new Set<number>();
for (let y = 0; y < contour.height; y += 1) {
  let lastOpaqueX = -1;
  for (let x = 0; x < contour.width; x += 1) {
    if (contour.data[(y * contour.width + x) * 4 + 3] >= 48) lastOpaqueX = x;
  }
  if (lastOpaqueX >= 0) contourEdgeColumns.add(lastOpaqueX);
}
assert.ok(contourEdgeColumns.size >= 3, `visual forest contour must not remain one cell-aligned vertical edge: ${[...contourEdgeColumns]}`);

const coverageRegistry = createDefaultEnvironmentProfileRegistry();
installEnvironmentProfileRegistry(coverageRegistry);
const coverageProfile = coverageRegistry.getProfile();
coverageRegistry.updateVegetationMaterial('default', 'sparse_forest', {
  presentation: { ...coverageProfile.vegetation.sparse_forest.presentation, coverage: 0.2 },
});
installEnvironmentProfileRegistry(coverageRegistry);
const lowCoverage = renderVegetationChunkPixels(map, { minX: 0, minY: 0, maxX: 31, maxY: 31 }, 1);
const lowAlpha = averageAlpha(lowCoverage.data);
const lowProfile = coverageRegistry.getProfile();
coverageRegistry.updateVegetationMaterial('default', 'sparse_forest', {
  presentation: { ...lowProfile.vegetation.sparse_forest.presentation, coverage: 0.9 },
});
installEnvironmentProfileRegistry(coverageRegistry);
const highCoverage = renderVegetationChunkPixels(map, { minX: 0, minY: 0, maxX: 31, maxY: 31 }, 1);
const highAlpha = averageAlpha(highCoverage.data);
assert.ok(highAlpha > lowAlpha + 45, `coverage must materially change filled area/alpha: low=${lowAlpha}, high=${highAlpha}`);

const textureRegistry = createDefaultEnvironmentProfileRegistry();
installEnvironmentProfileRegistry(textureRegistry);
const beforeTexture = renderVegetationChunkPixels(map, { minX: 0, minY: 0, maxX: 31, maxY: 31 }, 1);
const textureProfile = textureRegistry.getProfile();
textureRegistry.updateVegetationMaterial('default', 'sparse_forest', {
  presentation: { ...textureProfile.vegetation.sparse_forest.presentation, textureId: 'procedural_forest_variant_b' },
});
installEnvironmentProfileRegistry(textureRegistry);
const afterTexture = renderVegetationChunkPixels(map, { minX: 0, minY: 0, maxX: 31, maxY: 31 }, 1);
assert.notDeepEqual(beforeTexture.data, afterTexture.data, 'textureId must affect the deterministic presentation pattern');

const dirty = vegetationChunkCoordinatesForRegion(map, { minX: 31, minY: 15, maxX: 31, maxY: 15 });
assert.ok(dirty.length <= 2, `single-cell edit touched too many chunks: ${dirty.length}`);
const largeMapChunkCount = Math.ceil(320 / 32) * Math.ceil(200 / 32);
assert.equal(largeMapChunkCount, 70);
const rendererSource = readFileSync('src/rendering/VegetationChunkRaster.ts', 'utf8');
assert.doesNotMatch(rendererSource, /new Graphics\(\).*cell|ellipse\(|circle\(/s);
console.log('vegetation-chunk-raster: smoke passed');

function averageAlpha(data: Uint8ClampedArray): number {
  let total = 0;
  for (let index = 3; index < data.length; index += 4) total += data[index];
  return total / Math.max(1, data.length / 4);
}
