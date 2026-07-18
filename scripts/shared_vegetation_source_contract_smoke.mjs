import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = (relativePath) => readFileSync(path.join(process.cwd(), relativePath), 'utf8');

const profile = source('src/core/map/EnvironmentMaterialProfile.ts');
assert.match(profile, /sparse_forest: vegetation\(/);
assert.match(profile, /dense_forest: vegetation\(/);
assert.match(profile, /getEnvironmentProfileDomainKey/);
assert.match(profile, /presentation: 1, visibility: 1, fire: 1, movement: 1/);

const definitions = source('src/core/map/VegetationDefinition.ts');
assert.match(definitions, /getActiveEnvironmentProfile/);
assert.match(definitions, /getVegetationMaterial/);
assert.match(definitions, /resolveCellVegetationMaterialId/);
assert.match(definitions, /Compatibility facade for older consumers/);
assert.doesNotMatch(definitions, /const\s+(?:SPARSE|DENSE)_FOREST/);

const chunkRaster = source('src/rendering/VegetationChunkRaster.ts');
assert.match(chunkRaster, /VEGETATION_CHUNK_SIZE_CELLS = 32/);
assert.match(chunkRaster, /getMapDirtyRegionSince/);
assert.match(chunkRaster, /getEnvironmentProfileDomainKey\(profile, 'presentation'\)/);
assert.match(chunkRaster, /getVegetationMaterial\(profile, cell\?\.vegetationMaterialId\)/);
assert.match(chunkRaster, /record\.texture\.source\.update\(\)/);
assert.doesNotMatch(chunkRaster, /new Graphics\(\).*cell|ellipse\(|\.circle\(/s);

const renderer = source('src/rendering/PixiMapRenderer.ts');
assert.match(renderer, /new VegetationChunkRaster\(\)/);
assert.match(renderer, /renderer\.vegetation-raster/);
assert.match(renderer, /this\.vegetationRaster\.render\(map\)/);
assert.match(renderer, /getSurfaceMaterial\(environment, cell\.surfaceMaterialId\)/);
assert.doesNotMatch(renderer, /renderForestLayer|drawForestCell|FOREST_PALETTE|resolveCellVegetationDefinition/);

const workerProtocol = source('src/core/knowledge/AwarenessWorldWorkerProtocol.ts');
assert.match(workerProtocol, /surfaceMaterialIds: readonly string\[\]/);
assert.match(workerProtocol, /vegetationMaterialIds: readonly string\[\]/);
assert.match(workerProtocol, /surfaceMaterialCodes: Uint16Array/);
assert.match(workerProtocol, /vegetationMaterialCodes: Uint16Array/);
assert.doesNotMatch(workerProtocol, /terrainCodes|forestKinds/);

const workerSnapshot = source('src/core/knowledge/AwarenessWorkerMapSnapshot.ts');
assert.match(workerSnapshot, /surfaceMaterialCodes/);
assert.match(workerSnapshot, /vegetationMaterialCodes/);
assert.match(workerSnapshot, /environmentProfile/);

const exactLos = source('src/core/visibility/LineOfSight.ts');
assert.match(exactLos, /resolveCellVegetationDefinition/);
assert.match(exactLos, /vegetation\.visibility\.transmissionLossPerMeter/);
assert.doesNotMatch(exactLos, /SPARSE_FOREST_LOSS_PER_METER|DENSE_FOREST_LOSS_PER_METER/);

const visibilityRaycast = source('src/core/visibility/VisibilityRaycast.ts');
assert.match(visibilityRaycast, /vegetationMaterialCodes/);
assert.match(visibilityRaycast, /resolveVegetationDefinition\(vegetationMaterialId\)/);

const pointVisibility = source('src/core/visibility/PointVisibility.ts');
assert.match(pointVisibility, /computeLineOfSight/);
assert.match(pointVisibility, /MAX_PERCEPTION_POINT_PROBES_PER_SIMULATION_STEP/);
assert.match(pointVisibility, /perceptionPointCacheByState/);
assert.match(pointVisibility, /getMapRevisionSnapshot/);
assert.match(pointVisibility, /perception\.point-los/);
assert.doesNotMatch(pointVisibility, /getVisibilityGeometryField/);

const perception = source('src/core/perception/PerceptionStimulus.ts');
assert.match(perception, /visibility\.targetConcealment/);
assert.doesNotMatch(perception, /cell\?\.forest === 2 \? 65/);

const awareness = source('src/core/knowledge/AwarenessStaticField.ts');
assert.match(awareness, /visibility\.localConcealment/);
assert.match(awareness, /getSurfaceMaterial/);
assert.doesNotMatch(awareness, /function forestConcealment/);

const navigation = source('src/core/pathfinding/GridNavigation.ts');
assert.match(navigation, /movement\.resistance/);
assert.match(navigation, /getSurfaceMaterial\(getActiveEnvironmentProfile\(\), cell\.surfaceMaterialId\)/);
assert.doesNotMatch(navigation, /forest >= 2 \? 1\.45/);

const routeCost = source('src/core/navigation/RouteCostField.ts');
assert.match(routeCost, /resolveCellVegetationDefinition/);
assert.match(routeCost, /movement\.tacticalConcealment/);
assert.match(routeCost, /getEnvironmentProfileDomainKey\(getActiveEnvironmentProfile\(\), 'movement'\)/);
assert.doesNotMatch(routeCost, /cell\.forest >= 2 \? 0\.6/);

const threatRelativeCover = source('src/core/cover/ThreatRelativeCoverGeometry.ts');
assert.match(threatRelativeCover, /getVisibilityStaticGrid/);
assert.match(threatRelativeCover, /vegetationMaterialCodes/);
assert.match(threatRelativeCover, /resolveVegetationDefinition\(vegetationMaterialId\)\.fire\.densityWeight/);
assert.doesNotMatch(threatRelativeCover, /forest === 2\) return 1\.7|forest === 1\) return 0\.8/);

const currentView = source('src/core/visibility/SelectedUnitVisibilityField.ts');
assert.match(currentView, /getUnitVisibilityField/);
assert.doesNotMatch(currentView, /SPARSE_FOREST_LOSS_PER_METER|DENSE_FOREST_LOSS_PER_METER/);

const danger = source('src/core/knowledge/SoldierDangerField.ts');
assert.match(danger, /getVisibilityGeometryField/);
assert.match(danger, /lineOfFire\.hardBlocked/);
assert.doesNotMatch(danger, /pixi\.js|\.\.\/rendering\//);

console.log('Shared vegetation source contract smoke passed: canonical environment materials feed chunked rendering, worker snapshots, bounded point perception, visibility, awareness, danger, cover and route/navigation costs.');
