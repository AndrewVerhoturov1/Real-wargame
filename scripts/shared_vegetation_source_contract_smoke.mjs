import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = (relativePath) => readFileSync(path.join(process.cwd(), relativePath), 'utf8');

const definitions = source('src/core/map/VegetationDefinition.ts');
assert.match(definitions, /presentation: \{ color: 0x225637, opacity: 1, detailDensity: 3 \}/);
assert.match(definitions, /presentation: \{ color: 0x133a25, opacity: 1, detailDensity: 7 \}/);

const renderer = source('src/rendering/PixiMapRenderer.ts');
assert.match(renderer, /resolveCellVegetationDefinition/);
assert.match(renderer, /vegetation\.presentation\.opacity/);
assert.doesNotMatch(renderer, /const FOREST_PALETTE/);

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
assert.match(navigation, /movement\.baseResistance/);
assert.doesNotMatch(navigation, /forest >= 2 \? 1\.45/);

const routeCost = source('src/core/navigation/RouteCostField.ts');
assert.match(routeCost, /resolveCellVegetationDefinition/);
assert.match(routeCost, /movement\.tacticalConcealment/);
assert.doesNotMatch(routeCost, /cell\.forest >= 2 \? 0\.6/);

const threatRelativeCover = source('src/core/cover/ThreatRelativeCoverGeometry.ts');
assert.match(threatRelativeCover, /getVisibilityStaticGrid/);
assert.match(threatRelativeCover, /resolveVegetationDefinition/);
assert.match(threatRelativeCover, /fire\.densityWeight/);
assert.doesNotMatch(threatRelativeCover, /map\.cells\[previousIndex\]/);
assert.doesNotMatch(threatRelativeCover, /forest === 2\) return 1\.7|forest === 1\) return 0\.8/);

const currentView = source('src/core/visibility/SelectedUnitVisibilityField.ts');
assert.match(currentView, /getUnitVisibilityField/);
assert.doesNotMatch(currentView, /SPARSE_FOREST_LOSS_PER_METER|DENSE_FOREST_LOSS_PER_METER/);

const danger = source('src/core/knowledge/SoldierDangerField.ts');
assert.match(danger, /getVisibilityGeometryField/);
assert.match(danger, /lineOfFire\.hardBlocked/);
assert.doesNotMatch(danger, /pixi\.js|\.\.\/rendering\//);

console.log('Shared vegetation source contract smoke passed: renderer, perception, visibility, awareness, danger, cover and route/navigation costs use the shared core catalog/field boundary.');
