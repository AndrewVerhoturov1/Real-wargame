import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = (relativePath) => readFileSync(path.join(process.cwd(), relativePath), 'utf8');

const profile = source('src/core/map/EnvironmentMaterialProfile.ts');
assert.match(profile, /sparse_forest: vegetation\(/);
assert.match(profile, /coverage: 0\.72/);
assert.match(profile, /dense_forest: vegetation\(/);
assert.match(profile, /coverage: 0\.94/);
assert.match(profile, /revisions: \{ presentation: 1, visibility: 1, fire: 1, movement: 1 \}/);

const definitions = source('src/core/map/VegetationDefinition.ts');
assert.match(definitions, /getActiveEnvironmentProfile/);
assert.match(definitions, /vegetationMaterialId/);
assert.doesNotMatch(definitions, /0x225637|0x133a25/);

const renderer = source('src/rendering/PixiMapRenderer.ts');
const raster = source('src/rendering/VegetationChunkRaster.ts');
assert.match(renderer, /VegetationChunkRaster/);
assert.match(raster, /VEGETATION_CHUNK_SIZE_CELLS = 32/);
assert.match(raster, /cell\?\.vegetationMaterialId/);
assert.doesNotMatch(raster, /ellipse\(|\.circle\(/);
assert.doesNotMatch(renderer, /const FOREST_PALETTE/);


const workerProtocol = source('src/core/knowledge/AwarenessWorldWorkerProtocol.ts');
const workerSnapshot = source('src/core/knowledge/AwarenessWorkerMapSnapshot.ts');
const worker = source('src/workers/AwarenessWorldWorker.ts');
assert.match(workerProtocol, /environmentProfile: EnvironmentMaterialProfile/);
assert.match(workerProtocol, /surfaceMaterialCodes: Uint16Array/);
assert.match(workerProtocol, /vegetationMaterialCodes: Uint16Array/);
assert.doesNotMatch(workerProtocol, /terrainCodes: Uint8Array|forestKinds: Uint8Array/);
assert.match(workerSnapshot, /installAwarenessWorkerEnvironmentProfile/);
assert.match(workerSnapshot, /surfaceMaterialId/);
assert.match(workerSnapshot, /vegetationMaterialId/);
assert.match(worker, /restoreAwarenessWorkerMap/);

const exactLos = source('src/core/visibility/LineOfSight.ts');
assert.match(exactLos, /resolveCellVegetationDefinition/);
assert.doesNotMatch(exactLos, /SPARSE_FOREST_LOSS_PER_METER|DENSE_FOREST_LOSS_PER_METER/);

const pointVisibility = source('src/core/visibility/PointVisibility.ts');
assert.match(pointVisibility, /getVisibilityGeometryField/);
assert.doesNotMatch(pointVisibility, /computeLineOfSight/);

const perception = source('src/core/perception/PerceptionStimulus.ts');
assert.match(perception, /visibility\.targetConcealment/);
assert.doesNotMatch(perception, /cell\?\.forest === 2 \? 65/);

const awareness = source('src/core/knowledge/AwarenessStaticField.ts');
assert.match(awareness, /visibility\.localConcealment/);
assert.doesNotMatch(awareness, /function forestConcealment/);

const navigation = source('src/core/pathfinding/GridNavigation.ts');
assert.match(navigation, /movement\.resistance/);
assert.match(navigation, /surface\.movement\.passable/);
assert.doesNotMatch(navigation, /forest >= 2 \? 1\.45/);

const routeCost = source('src/core/navigation/RouteCostField.ts');
assert.match(routeCost, /resolveCellVegetationDefinition/);
assert.match(routeCost, /movement\.tacticalConcealment/);
assert.doesNotMatch(routeCost, /cell\.forest >= 2 \? 0\.6/);

const threatRelativeCover = source('src/core/cover/ThreatRelativeCoverGeometry.ts');
assert.match(threatRelativeCover, /resolveCellVegetationDefinition/);
assert.match(threatRelativeCover, /fire\.densityWeight/);
assert.doesNotMatch(threatRelativeCover, /forest === 2\) return 1\.7|forest === 1\) return 0\.8/);

const smallArmsCover = source('src/core/cover/SmallArmsCoverEvaluation.ts');
assert.match(smallArmsCover, /fire\.densityWeight/);
assert.doesNotMatch(smallArmsCover, /denseCells \* 1\.7|lightCells \* 0\.8/);

const currentView = source('src/core/visibility/SelectedUnitVisibilityField.ts');
assert.match(currentView, /getUnitVisibilityField/);
assert.doesNotMatch(currentView, /SPARSE_FOREST_LOSS_PER_METER|DENSE_FOREST_LOSS_PER_METER/);

const danger = source('src/core/knowledge/SoldierDangerField.ts');
assert.match(danger, /getVisibilityGeometryField/);
assert.match(danger, /lineOfFire\.hardBlocked/);
assert.doesNotMatch(danger, /pixi\.js|\.\.\/rendering\//);

console.log('Shared vegetation source contract smoke passed: canonical material profiles feed renderer, perception, visibility, danger, cover and navigation without pixel-derived gameplay.');
