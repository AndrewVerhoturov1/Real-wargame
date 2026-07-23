import assert from 'node:assert/strict';
import {
  CombatCatalogRegistry,
  createDefaultCombatCatalogBundle,
  createDefaultCombatCatalogRegistry,
  type DefinitionRef,
} from '../src/core/infantry-combat/catalogs';
import {
  createInfantryCombatUnitRuntime,
  equipPrimaryWeaponFromLoadout,
  normalizeInfantryCombatUnitRuntime,
  serializeInfantryCombatUnitRuntime,
} from '../src/core/infantry-combat/runtime';
import { normalizeUnits, type UnitModel } from '../src/core/units/UnitModel';

verifyEmptyLegacyRuntime();
verifyExactRifleEquipAndIndependentSnapshot();
verifyDraftLoadoutRejected();
verifyRuntimeRoundTrip();
verifyCorruptedResolvedSnapshotRejected();

console.log('Infantry combat Stage 3 smoke passed: empty runtime, exact rifle equip, immutable snapshots, draft rejection and unit runtime round-trip.');

function verifyEmptyLegacyRuntime(): void {
  const unit = makeUnit('legacy-empty');
  assert.deepEqual(unit.infantryCombatRuntime, createInfantryCombatUnitRuntime());
  assert.equal(unit.infantryCombatRuntime.primaryWeapon, null);
  assert.equal(unit.infantryCombatRuntime.activeFireTask, null);
}

function verifyExactRifleEquipAndIndependentSnapshot(): void {
  const unit = makeUnit('rifleman');
  const registry = createDefaultCombatCatalogRegistry();
  const legacyAmmoBefore = unit.behaviorRuntime.ammo;
  const legacyReadyBefore = unit.behaviorRuntime.weaponReady;
  const result = equipPrimaryWeaponFromLoadout(unit, registry, ref('loadout_rifleman', 1));

  assert.equal(result.ok, true);
  assert.equal(result.status, 'equipped');
  const weapon = unit.infantryCombatRuntime.primaryWeapon;
  assert.ok(weapon);
  assert.equal(weapon.weaponInstanceId, 'rifleman:weapon:primary');
  assert.equal(weapon.slot, 'primary');
  assert.equal(weapon.roundsInWeapon, 5);
  assert.equal(weapon.shotSequence, 0);
  assert.deepEqual(weapon.resolved.weaponDefinitionRef, ref('weapon_mosin_m9130', 1));
  assert.deepEqual(weapon.resolved.ammoDefinitionRef, ref('ammo_762x54r_ball', 1));
  assert.equal(weapon.resolved.weapon.weaponClass, 'rifle');
  assert.equal(weapon.resolved.weapon.status, 'published');
  assert.equal(weapon.resolved.ammo.status, 'published');
  assert.equal(Object.isFrozen(weapon.resolved), true);
  assert.equal(Object.isFrozen(weapon.resolved.weapon), true);
  assert.equal(Object.isFrozen(weapon.resolved.ammo), true);

  const mutated = registry.toData();
  const catalogWeapon = mutated.weaponDefinitions.find((entry) => entry.weaponDefinitionId === 'weapon_mosin_m9130' && entry.revision === 1);
  assert.ok(catalogWeapon);
  catalogWeapon.nameRu = 'Изменённое имя в отдельной копии';
  const replacement = new CombatCatalogRegistry(mutated);
  assert.equal(replacement.resolveWeapon(ref('weapon_mosin_m9130', 1)).nameRu, 'Изменённое имя в отдельной копии');
  assert.equal(weapon.resolved.weapon.nameRu, 'Винтовка Мосина обр. 1891/30');

  assert.equal(unit.behaviorRuntime.ammo, legacyAmmoBefore);
  assert.equal(unit.behaviorRuntime.weaponReady, legacyReadyBefore);
}

function verifyDraftLoadoutRejected(): void {
  const unit = makeUnit('draft-rejected');
  const registry = createDefaultCombatCatalogRegistry();
  const draft = registry.saveLoadoutDraft({
    ...registry.resolveLoadout(ref('loadout_rifleman', 1)),
    revision: 2,
    status: 'draft',
  });
  const before = serializeInfantryCombatUnitRuntime(unit.infantryCombatRuntime);
  const result = equipPrimaryWeaponFromLoadout(unit, registry, ref(draft.loadoutTemplateId, draft.revision));
  assert.equal(result.ok, false);
  assert.equal(result.status, 'draft_revision_rejected');
  assert.deepEqual(serializeInfantryCombatUnitRuntime(unit.infantryCombatRuntime), before);
}

function verifyRuntimeRoundTrip(): void {
  const unit = makeUnit('round-trip');
  const registry = new CombatCatalogRegistry(createDefaultCombatCatalogBundle());
  assert.equal(equipPrimaryWeaponFromLoadout(unit, registry, ref('loadout_rifleman', 1)).ok, true);
  unit.infantryCombatRuntime.nextFireTaskSequence = 7;
  unit.infantryCombatRuntime.primaryWeapon!.roundsInWeapon = 3;
  unit.infantryCombatRuntime.primaryWeapon!.shotSequence = 4;
  unit.infantryCombatRuntime.primaryWeapon!.lastCommittedShotId = 'round-trip:shot:4';

  const serialized = serializeInfantryCombatUnitRuntime(unit.infantryCombatRuntime);
  const restored = normalizeInfantryCombatUnitRuntime(JSON.parse(JSON.stringify(serialized)));
  assert.deepEqual(restored, serialized);
  assert.notEqual(restored, unit.infantryCombatRuntime);
  assert.notEqual(restored.primaryWeapon, unit.infantryCombatRuntime.primaryWeapon);
  assert.equal(Object.isFrozen(restored.primaryWeapon!.resolved.weapon), true);
}


function verifyCorruptedResolvedSnapshotRejected(): void {
  const unit = makeUnit('corrupted-snapshot');
  assert.equal(equipPrimaryWeaponFromLoadout(
    unit,
    createDefaultCombatCatalogRegistry(),
    ref('loadout_rifleman', 1),
  ).ok, true);
  const serialized = structuredClone(serializeInfantryCombatUnitRuntime(unit.infantryCombatRuntime));
  serialized.primaryWeapon!.resolved.weapon.readySeconds = -1;
  const restored = normalizeInfantryCombatUnitRuntime(serialized);
  assert.equal(restored.primaryWeapon, null, 'invalid resolved catalog snapshot must not enter runtime');
}

function makeUnit(id: string): UnitModel {
  return normalizeUnits([{
    id,
    type: 'infantry_squad',
    side: 'blue',
    x: 2,
    y: 2,
  }])[0]!;
}

function ref(definitionId: string, revision: number): DefinitionRef {
  return { definitionId, revision };
}
