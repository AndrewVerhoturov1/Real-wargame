import assert from 'node:assert/strict';
import {
  AttentionProfileRegistry,
  BUILT_IN_ATTENTION_PROFILE_IDS,
  createDefaultAttentionProfileRegistry,
} from '../src/core/perception/AttentionProfiles';

const registry = createDefaultAttentionProfileRegistry();
assert.deepEqual(registry.listProfiles().slice(0, BUILT_IN_ATTENTION_PROFILE_IDS.length).map((item) => item.id), [...BUILT_IN_ATTENTION_PROFILE_IDS]);
assert.equal(registry.getProfile('balanced').builtIn, true);
assert.equal(registry.getProfile('observer').settings.profiles.observe.directWeight > registry.getProfile('combat').settings.profiles.observe.directWeight, true);

const copy = registry.copyProfile('observer', 'my_observer', 'My observer', 'Мой наблюдатель');
assert.equal(copy.builtIn, false);
assert.equal(registry.hasProfile('my_observer'), true);
registry.updateProfile('my_observer', {
  settings: {
    ...copy.settings,
    vision: { ...copy.settings.vision, maximumVisualRangeMeters: 777 },
  },
});
assert.equal(registry.getProfile('my_observer').settings.vision.maximumVisualRangeMeters, 777);
registry.renameProfile('my_observer', 'Renamed observer', 'Переименованный наблюдатель');
assert.equal(registry.getProfile('my_observer').nameRu, 'Переименованный наблюдатель');
const restored = AttentionProfileRegistry.importJson(registry.exportJson());
assert.equal(restored.getProfile('my_observer').settings.vision.maximumVisualRangeMeters, 777);
assert.equal(restored.deleteProfile('balanced'), false, 'built-in profiles must not be deleted');
assert.equal(restored.deleteProfile('my_observer'), true);

console.log('Attention profiles smoke passed.');
