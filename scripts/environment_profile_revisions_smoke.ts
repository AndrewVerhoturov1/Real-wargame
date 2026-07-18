import assert from 'node:assert/strict';
import { EnvironmentProfileRegistry, createDefaultEnvironmentProfileRegistry } from '../src/core/map/EnvironmentMaterialProfile';
import { installEnvironmentProfileRegistry, subscribeEnvironmentProfileRuntime } from '../src/core/map/EnvironmentProfileRuntime';
import { normalizeMap } from '../src/core/map/MapModel';
import { getVisibilityGeometryField } from '../src/core/visibility/VisibilityGeometryField';
import { createRouteCostFieldCache, getRouteCostFieldDiagnostics, getRouteCostFields } from '../src/core/navigation/RouteCostField';
import { getBuiltInNavigationProfile } from '../src/core/navigation/NavigationProfiles';

const registry = createDefaultEnvironmentProfileRegistry();
installEnvironmentProfileRegistry(registry);
const map = normalizeMap({ width: 12, height: 12, cellSize: 4, metersPerCell: 2, forestMap: Array.from({ length: 12 }, () => Array(12).fill(1)) });
const options = { origin: { x: 5.5, y: 5.5 }, originHeightAboveGroundMeters: 1.7, targetHeightAboveGroundMeters: 1.7, rangeCells: 8 };
const visual0 = getVisibilityGeometryField(map, { ...options, channel: 'visual' }).key;
const fire0 = getVisibilityGeometryField(map, { ...options, channel: 'fire' }).key;

let profile = registry.getProfile();
registry.updateVegetationMaterial('default', 'sparse_forest', { presentation: { ...profile.vegetation.sparse_forest.presentation, coverage: 0.55 } });
installEnvironmentProfileRegistry(registry);
assert.equal(getVisibilityGeometryField(map, { ...options, channel: 'visual' }).key, visual0);
assert.equal(getVisibilityGeometryField(map, { ...options, channel: 'fire' }).key, fire0);

profile = registry.getProfile();
registry.updateVegetationMaterial('default', 'sparse_forest', { visibility: { ...profile.vegetation.sparse_forest.visibility, transmissionLossPerMeter: 0.09 } });
installEnvironmentProfileRegistry(registry);
const visual1 = getVisibilityGeometryField(map, { ...options, channel: 'visual' }).key;
assert.notEqual(visual1, visual0);
assert.equal(getVisibilityGeometryField(map, { ...options, channel: 'fire' }).key, fire0);

profile = registry.getProfile();
registry.updateVegetationMaterial('default', 'sparse_forest', { fire: { ...profile.vegetation.sparse_forest.fire, transmissionLossPerMeter: 0.08 } });
installEnvironmentProfileRegistry(registry);
const fire1 = getVisibilityGeometryField(map, { ...options, channel: 'fire' }).key;
assert.notEqual(fire1, fire0);
assert.equal(getVisibilityGeometryField(map, { ...options, channel: 'visual' }).key, visual1);

const routeCache = createRouteCostFieldCache();
const routeBefore = getRouteCostFields(map, getBuiltInNavigationProfile('normal'), undefined, routeCache);
const routeBuildsBefore = getRouteCostFieldDiagnostics(routeCache).staticCostBuildCount;
const routeCostBefore = routeBefore.terrainCost[0];
profile = registry.getProfile();
registry.updateVegetationMaterial('default', 'sparse_forest', { movement: { ...profile.vegetation.sparse_forest.movement, resistance: 2 } });
installEnvironmentProfileRegistry(registry);
assert.equal(getVisibilityGeometryField(map, { ...options, channel: 'visual' }).key, visual1);
assert.equal(getVisibilityGeometryField(map, { ...options, channel: 'fire' }).key, fire1);
const routeAfter = getRouteCostFields(map, getBuiltInNavigationProfile('normal'), undefined, routeCache);
assert.equal(getRouteCostFieldDiagnostics(routeCache).staticCostBuildCount, routeBuildsBefore + 1, 'movement-domain edit must invalidate the static route field');
assert.ok(routeAfter.terrainCost[0] > routeCostBefore, 'movement-domain edit must change physical route cost');

const custom = registry.createCustomProfile('alternate', 'Alternate', 'Альтернативный');
installEnvironmentProfileRegistry(registry);
const alternateVisual = getVisibilityGeometryField(map, { ...options, channel: 'visual' });
assert.equal(alternateVisual.profileId, 'alternate');
assert.notEqual(alternateVisual.key, visual1, 'profile identity must invalidate equal-numbered revisions');
registry.setActiveProfile('default');
installEnvironmentProfileRegistry(registry);
assert.equal(getVisibilityGeometryField(map, { ...options, channel: 'visual' }).key, visual1);


const importedData = registry.toData();
const importedDefault = importedData.profiles.find((candidate) => candidate.id === 'default');
assert.ok(importedDefault);
const importedSparse = importedDefault.vegetation.sparse_forest;
const importedChanged = structuredClone(importedData);
const changedDefault = importedChanged.profiles.find((candidate) => candidate.id === 'default');
assert.ok(changedDefault);
changedDefault.vegetation.sparse_forest = {
  ...importedSparse,
  visibility: {
    ...importedSparse.visibility,
    transmissionLossPerMeter: importedSparse.visibility.transmissionLossPerMeter + 0.011,
  },
};
let runtimeNotifications = 0;
const unsubscribe = subscribeEnvironmentProfileRuntime(() => { runtimeNotifications += 1; });
const importedRegistry = EnvironmentProfileRegistry.fromUnknown(importedChanged);
installEnvironmentProfileRegistry(importedRegistry);
unsubscribe();
const importedVisual = getVisibilityGeometryField(map, { ...options, channel: 'visual' }).key;
assert.notEqual(importedVisual, visual1, 'changed imported content must invalidate even when external revision numbers are unchanged');
assert.equal(runtimeNotifications, 1, 'runtime consumers must be notified when an imported domain hash changes');

console.log('environment-profile-revisions: smoke passed');
