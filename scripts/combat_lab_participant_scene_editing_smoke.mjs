import assert from 'node:assert/strict';
import { makeExperiment, makeFireStep, makeSceneUnit } from './combat_lab_participant_test_support.mjs';
import {
  assertValid,
  initialRuntime,
  normalizeUnits,
  registry,
  removal,
  scene,
} from './combat_lab_participant_scene_test_environment.mjs';

const original = makeExperiment();
const originalSnapshot = structuredClone(original);
const created = scene.createCombatLabParticipant(original, {
  roleId: 'created', unitId: 'unit-created', titleRu: 'Новый', side: 'blue', unitType: 'infantry_squad', x: 10, y: 11,
  loadoutRef: { definitionId: 'published', revision: 1 }, loadedRounds: 4, reserveRoundsByAmmoDefinitionId: { ball: 30 }, firstAidCharges: 2,
  initialHealth: { mode: 'healthy' },
}, { catalogRegistry: registry });
assert.equal(created.revision, original.revision + 1);
assert.equal(created.roles.length, original.roles.length + 1);
assert.deepEqual(original, originalSnapshot);
assertValid(created, 'Создание бойца');

const updated = scene.updateCombatLabParticipantInitialState(created, 'created', {
  titleRu: 'Изменённый', x: 12, y: 13, posture: 'prone',
  loadoutRef: { definitionId: 'alternate', revision: 1 }, loadedRounds: 20, reserveRoundsByAmmoDefinitionId: { pistol: 70 }, firstAidCharges: 1,
  initialHealth: { mode: 'wound_set', wounds: [{ zone: 'torso', severity: 'severe', hitCount: 2 }], bloodLoss: 0.25 },
}, { catalogRegistry: registry });
assert.equal(updated.revision, created.revision + 1);
const updatedDraft = scene.readCombatLabParticipantInitialDraft(updated, 'created');
assert.equal(updatedDraft.titleRu, 'Изменённый');
assert.equal(updatedDraft.posture, 'prone');
assert.equal(updatedDraft.unit.infantryCombatRuntime.primaryWeapon.resolved.weapon.weaponDefinitionId, 'smg');
assert.equal(updatedDraft.wounds[0].hitCount, 2);
assert.equal(updatedDraft.bloodLoss, 0.25);
const updatedRecord = updated.sceneSnapshot.units.find((unit) => unit.id === 'unit-created');
assert.equal(updatedRecord.runtime.physicalAction ?? null, null);
assert.equal(updatedRecord.runtime.moveOrder ?? null, null);
assert.equal(updatedRecord.runtime.infantryCombat.activeFireTask ?? null, null);
assert.equal(updatedRecord.runtime.infantryCombat.ammoInventory.activeReload ?? null, null);
assert.equal(updatedRecord.runtime.infantryCombat.medical.activeFirstAidAction ?? null, null);
assertValid(updated, 'Изменение бойца');

const duplicated = scene.duplicateCombatLabParticipant(updated, 'created', { catalogRegistry: registry });
assert.equal(duplicated.revision, updated.revision + 1);
assert.equal(duplicated.roles.length, updated.roles.length + 1);
assert.notEqual(duplicated.roles.at(-1).unitId, 'unit-created');
assertValid(duplicated, 'Копирование бойца');

const unreferencedRemoved = removal.removeCombatLabParticipant(duplicated, duplicated.roles.at(-1).roleId, 'block_if_referenced');
assert.equal(unreferencedRemoved.revision, duplicated.revision + 1);
assert.equal(unreferencedRemoved.roles.length, duplicated.roles.length - 1);
assertValid(unreferencedRemoved, 'Удаление бойца без ссылок');

const referenced = structuredClone(updated);
referenced.markers = [{ markerId: 'target', kind: 'point', titleRu: 'Цель', xMetres: 1, yMetres: 1, zMetres: 1 }];
referenced.tracks = [{ trackId: 'created-track', titleRu: 'Дорожка', actorRoleId: 'created', enabled: true, steps: [makeFireStep('fire', 'created')] }];
assert.throws(() => removal.removeCombatLabParticipant(referenced, 'created', 'block_if_referenced'), /Нельзя удалить бойца/);
const removedWithReferences = removal.removeCombatLabParticipant(referenced, 'created', 'remove_with_program_references');
assert.equal(removedWithReferences.roles.some((role) => role.roleId === 'created'), false);
assert.equal(removedWithReferences.tracks.length, 0);
assertValid(removedWithReferences, 'Удаление бойца со ссылками');

const publishedUnit = normalizeUnits([makeSceneUnit('weapon-test')])[0];
initialRuntime.applyPublishedLoadout(publishedUnit, { definitionId: 'published', revision: 1 }, registry);
assert.equal(publishedUnit.infantryCombatRuntime.primaryWeapon.resolved.weapon.weaponDefinitionId, 'rifle');
assert.throws(() => initialRuntime.applyPublishedLoadout(publishedUnit, { definitionId: 'draft', revision: 1 }, registry), /Draft|опубликованные/);
assert.throws(() => initialRuntime.applyPublishedLoadout(publishedUnit, { definitionId: 'archived', revision: 1 }, registry), /опубликованные/);
assert.throws(() => initialRuntime.applyAmmoAndAid(publishedUnit, { loadedRounds: 6 }), /вместимость/);
assert.throws(() => initialRuntime.applyAmmoAndAid(publishedUnit, { reserveRoundsByAmmoDefinitionId: { ball: 41 } }), /превышает/);
assert.throws(() => initialRuntime.applyAmmoAndAid(publishedUnit, { reserveRoundsByAmmoDefinitionId: { pistol: 1 } }), /несовместим/);
initialRuntime.applyPublishedLoadout(publishedUnit, { definitionId: 'alternate', revision: 1 }, registry);
assert.equal(publishedUnit.infantryCombatRuntime.primaryWeapon.resolved.weapon.weaponDefinitionId, 'smg');

const healthUnit = normalizeUnits([makeSceneUnit('health-test')])[0];
healthUnit.infantryCombatRuntime.wounds = { slots: [{ zone: 'head', severity: 'light', hitCount: 1 }], appliedImpactIds: [] };
healthUnit.infantryCombatRuntime.physiology.blood.bloodLoss = 0.1;
const preserved = structuredClone(healthUnit.infantryCombatRuntime);
initialRuntime.applyInitialHealth(healthUnit, { mode: 'preserve_current' }, 0, 'health');
assert.deepEqual(healthUnit.infantryCombatRuntime, preserved);
initialRuntime.applyInitialHealth(healthUnit, { mode: 'healthy' }, 0, 'health');
assert.equal(healthUnit.infantryCombatRuntime.wounds.slots.length, 0);
assert.equal(healthUnit.infantryCombatRuntime.physiology.blood.bloodLoss, 0);
const woundSet = { mode: 'wound_set', wounds: [{ zone: 'legs', severity: 'critical', hitCount: 2 }], bloodLoss: 0.4 };
initialRuntime.applyInitialHealth(healthUnit, woundSet, 0, 'health');
assert.equal(healthUnit.infantryCombatRuntime.wounds.slots[0].hitCount, 2);
assert.equal(healthUnit.infantryCombatRuntime.physiology.blood.bloodLoss, 0.4);
assert.equal(healthUnit.infantryCombatRuntime.physiology.blood.currentBleedingRatePerSecond, 0.02);
initialRuntime.applyInitialHealth(healthUnit, woundSet, 0, 'health');
assert.equal(healthUnit.infantryCombatRuntime.wounds.slots[0].hitCount, 2, 'Повторное сохранение не должно дублировать ранения.');

const preservedWeapon = scene.updateCombatLabParticipantInitialState(updated, 'created', { titleRu: 'Без изменения комплекта' }, { catalogRegistry: registry });
const preservedDraft = scene.readCombatLabParticipantInitialDraft(preservedWeapon, 'created');
assert.equal(preservedDraft.unit.infantryCombatRuntime.primaryWeapon.resolved.weapon.weaponDefinitionId, 'smg');

console.log('combat_lab_participant_scene_editing_smoke: PASS');
