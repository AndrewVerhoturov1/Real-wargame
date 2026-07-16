import assert from 'node:assert/strict';
import { createDefaultEnvironmentProfileRegistry } from '../src/core/map/EnvironmentMaterialProfile';
import { installEnvironmentProfileRegistry } from '../src/core/map/EnvironmentProfileRuntime';
import { normalizeMap } from '../src/core/map/MapModel';
import { getVisibilityGeometryField } from '../src/core/visibility/VisibilityGeometryField';

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

profile = registry.getProfile();
registry.updateVegetationMaterial('default', 'sparse_forest', { movement: { ...profile.vegetation.sparse_forest.movement, resistance: 2 } });
installEnvironmentProfileRegistry(registry);
assert.equal(getVisibilityGeometryField(map, { ...options, channel: 'visual' }).key, visual1);
assert.equal(getVisibilityGeometryField(map, { ...options, channel: 'fire' }).key, fire1);

const custom = registry.createCustomProfile('alternate', 'Alternate', 'Альтернативный');
installEnvironmentProfileRegistry(registry);
const alternateVisual = getVisibilityGeometryField(map, { ...options, channel: 'visual' });
assert.equal(alternateVisual.profileId, 'alternate');
assert.notEqual(alternateVisual.key, visual1, 'profile identity must invalidate equal-numbered revisions');
registry.setActiveProfile('default');
installEnvironmentProfileRegistry(registry);
assert.equal(getVisibilityGeometryField(map, { ...options, channel: 'visual' }).key, visual1);

console.log('environment-profile-revisions: smoke passed');
