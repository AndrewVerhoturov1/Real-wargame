import assert from 'node:assert/strict';
import {
  createDefaultStaticTacticalPositionSettings,
  normalizeStaticTacticalPositionSettings,
  staticTacticalPositionSettingsDigest,
} from '../src/core/tactical/static/StaticTacticalPositionSettings';

const defaults = createDefaultStaticTacticalPositionSettings();
const normalized = normalizeStaticTacticalPositionSettings(JSON.parse(JSON.stringify(defaults)));
assert.equal(staticTacticalPositionSettingsDigest(defaults), staticTacticalPositionSettingsDigest(normalized));
assert.equal(normalized.sectors.count, 8);
assert.equal(normalized.index.chunkSizeCells, 16);
assert.ok(normalized.geometry.observationSamplesPerSector >= 2);
assert.ok(normalized.geometry.firingSamplesPerSector >= 2);

const changed = normalizeStaticTacticalPositionSettings({
  ...defaults,
  index: {
    ...defaults.index,
    maximumCandidatesPerKindPerChunk: defaults.index.maximumCandidatesPerKindPerChunk + 1,
  },
});
assert.notEqual(staticTacticalPositionSettingsDigest(defaults), staticTacticalPositionSettingsDigest(changed));

console.log('static tactical position settings smoke: ok');
