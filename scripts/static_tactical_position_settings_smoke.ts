import assert from 'node:assert/strict';
import {
  HIGH_QUALITY_STATIC_TACTICAL_CELL_LIMIT,
  shouldUseHighQualityStaticTacticalPositionBasis,
} from '../src/core/tactical/static/RuntimeStaticTacticalPositionBuilder';
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

assert.equal(shouldUseHighQualityStaticTacticalPositionBasis(64, 64), true);
assert.equal(64 * 64, HIGH_QUALITY_STATIC_TACTICAL_CELL_LIMIT);
assert.equal(
  shouldUseHighQualityStaticTacticalPositionBasis(320, 200),
  false,
  'the live 320x200 scenario must not run the per-cell quality ray pass',
);

console.log('static tactical position settings smoke: ok');
