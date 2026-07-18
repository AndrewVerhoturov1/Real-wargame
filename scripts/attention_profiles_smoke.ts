import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DEFAULT_ATTENTION_PROFILES,
  rearAngleDegrees,
  resolveAttentionSample,
} from '../src/core/perception/AttentionModel';
import {
  ATTENTION_PROFILE_FORMAT_VERSION,
  AttentionProfileImportError,
  AttentionProfileRegistry,
  BUILT_IN_ATTENTION_PROFILE_IDS,
  createDefaultAttentionProfileRegistry,
} from '../src/core/perception/AttentionProfiles';

const registry = createDefaultAttentionProfileRegistry();
assert.equal(registry.formatVersion, ATTENTION_PROFILE_FORMAT_VERSION);
assert.equal(registry.formatVersion, 2, 'rear-attention schema must be versioned as v2');
assert.deepEqual(registry.listProfiles().slice(0, BUILT_IN_ATTENTION_PROFILE_IDS.length).map((item) => item.id), [...BUILT_IN_ATTENTION_PROFILE_IDS]);
assert.equal(registry.getProfile('balanced').builtIn, true);
assert.equal(registry.getProfile('observer').settings.profiles.observe.directWeight > registry.getProfile('combat').settings.profiles.observe.directWeight, true);

const march = DEFAULT_ATTENTION_PROFILES.march;
assert.equal(resolveAttentionSample(march, 0, 10).zone, 'focus');
assert.equal(resolveAttentionSample(march, 50, 10).zone, 'direct');
assert.equal(resolveAttentionSample(march, 100, 10).zone, 'peripheral');
assert.equal(resolveAttentionSample(march, 140, 10).zone, 'rear');
assert.equal(rearAngleDegrees(march), 360 - march.peripheralAngleDegrees);
assert.equal(rearAngleDegrees(march), 130);
assert.equal(resolveAttentionSample(march, 180, 101).zone, 'outside', 'rear targets beyond rear range must be denied before LOS');
assert.equal(resolveAttentionSample(march, 180, 1.9, 2, 0.9).zone, 'near');
assert.equal(resolveAttentionSample(march, 180, 1.9, 2, 0.9).minimumVisibilityQuality, 0.9);
assert.equal(resolveAttentionSample(march, 180, 2.1, 2, 0.9).zone, 'rear');
assert.equal(resolveAttentionSample(march, 180, 10).sampleDurationSeconds, march.rearSampleDurationSeconds);
assert.notEqual(march.rearSampleDurationSeconds, march.rearCheckIntervalSeconds, 'a rear sample must not equal the whole rear interval');

for (const profile of Object.values(DEFAULT_ATTENTION_PROFILES)) {
  assert.ok(profile.focusAngleDegrees <= profile.directAngleDegrees);
  assert.ok(profile.directAngleDegrees <= profile.peripheralAngleDegrees);
  assert.ok(profile.peripheralAngleDegrees <= 360);
  assert.ok(profile.focusSampleDurationSeconds > 0 && profile.focusSampleDurationSeconds <= profile.focusCheckIntervalSeconds);
  assert.ok(profile.directSampleDurationSeconds > 0 && profile.directSampleDurationSeconds <= profile.directCheckIntervalSeconds);
  assert.ok(profile.peripheralSampleDurationSeconds > 0 && profile.peripheralSampleDurationSeconds <= profile.peripheralCheckIntervalSeconds);
  assert.ok(profile.rearSampleDurationSeconds > 0 && profile.rearSampleDurationSeconds <= profile.rearCheckIntervalSeconds);
}

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
assert.equal(restored.getProfile('my_observer').settings.profiles.observe.rearMaximumRangeMeters > 0, true);
assert.equal(restored.deleteProfile('balanced'), false, 'built-in profiles must not be deleted');
assert.equal(restored.deleteProfile('my_observer'), true);

const migrated = AttentionProfileRegistry.fromUnknown({
  formatVersion: 1,
  revision: 4,
  profiles: [{
    id: 'legacy_attention',
    nameEn: 'Legacy attention',
    nameRu: 'Старое внимание',
    settings: {
      defaultMode: 'observe',
      vision: { maximumVisualRangeMeters: 500 },
      profiles: { observe: { focusAngleDegrees: 55, directAngleDegrees: 160 } },
    },
    revision: 1,
    builtIn: false,
  }],
});
const migratedSettings = migrated.getProfile('legacy_attention').settings;
assert.equal(migrated.formatVersion, 2);
assert.equal(migratedSettings.profiles.observe.peripheralAngleDegrees, DEFAULT_ATTENTION_PROFILES.observe.peripheralAngleDegrees);
assert.equal(migratedSettings.profiles.observe.rearWeight, DEFAULT_ATTENTION_PROFILES.observe.rearWeight);
assert.equal(migratedSettings.profiles.observe.rearSampleDurationSeconds, DEFAULT_ATTENTION_PROFILES.observe.rearSampleDurationSeconds);
assert.equal(migratedSettings.nearAwarenessRangeMeters, 2);
assert.equal(migratedSettings.nearMinimumVisibilityQuality, 0.9);

const beforeBrokenImport = registry.exportJson();
assert.throws(
  () => AttentionProfileRegistry.importJson(JSON.stringify({
    formatVersion: 2,
    profiles: [{
      id: 'broken',
      settings: {
        profiles: {
          observe: {
            focusCheckIntervalSeconds: 0.2,
            focusSampleDurationSeconds: 0.3,
          },
        },
      },
    }],
  })),
  AttentionProfileImportError,
  'sample duration greater than its check interval must be rejected',
);
assert.equal(registry.exportJson(), beforeBrokenImport, 'failed import must not mutate the current registry');

const editorSource = await readFile(new URL('../src/ai-node-editor/AttentionProfileEditorPanel.ts', import.meta.url), 'utf8');
const perceptionSource = await readFile(new URL('../src/core/perception/PerceptionSystem.ts', import.meta.url), 'utf8');
const visibilityFieldSource = await readFile(new URL('../src/core/visibility/SelectedUnitVisibilityField.ts', import.meta.url), 'utf8');
const rendererSource = await readFile(new URL('../src/rendering/PixiVisibilityHeatmapRenderer.ts', import.meta.url), 'utf8');
for (const label of [
  'Внешний угол периферии',
  'Задний сектор:',
  'вычисляется автоматически',
  'Качество тыла',
  'Максимальная дальность тыла',
  'Условная длительность взгляда — фокус',
  'Условная длительность взгляда — прямой обзор',
  'Условная длительность взгляда — периферия',
  'Условная длительность взгляда — тыл',
  'Радиус ближнего обзора',
  'Минимальное качество вблизи',
]) {
  assert.match(editorSource, new RegExp(label), `attention editor label is missing: ${label}`);
}
assert.doesNotMatch(editorSource, /Периферия и тыл/);
assert.doesNotMatch(perceptionSource, /REAR_SECTOR_START_DEGREES/);
assert.match(perceptionSource, /deltaSeconds:\s*attention\.sampleDurationSeconds/);
assert.match(perceptionSource, /attention\.zone === 'outside'/);
assert.match(visibilityFieldSource, /let currentVisibilityQuality = 0/);
assert.match(visibilityFieldSource, /Deny by default/);
assert.match(rendererSource, /0x8b70d6/);
assert.match(rendererSource, /complete map is shadow/);

console.log('Attention profiles smoke passed: rear zones, bounded samples, near awareness, migration, editor and deny-by-default visibility.');
