import assert from 'node:assert/strict';
import {
  BUILT_IN_AMMO_DEFINITION_IDS,
  BUILT_IN_LOADOUT_TEMPLATE_IDS,
  BUILT_IN_WEAPON_DEFINITION_IDS,
  CombatCatalogRegistry,
  createDefaultCombatCatalogRegistry,
  validateCombatCatalogBundle,
  type CatalogValidationIssue,
  type CombatCatalogBundleV1,
} from '../src/core/infantry-combat/catalogs';

function hasIssue(issues: CatalogValidationIssue[], code: string): boolean {
  return issues.some((issue) => issue.code === code);
}

function invalidResult(mutator: (bundle: CombatCatalogBundleV1) => void): CatalogValidationIssue[] {
  const bundle = createDefaultCombatCatalogRegistry().toData();
  mutator(bundle);
  const validation = validateCombatCatalogBundle(bundle);
  assert.equal(validation.valid, false, `expected invalid bundle after mutation; issues=${JSON.stringify(validation.issues)}`);
  return validation.issues;
}

const registry = createDefaultCombatCatalogRegistry();
const defaults = registry.toData();
assert.equal(validateCombatCatalogBundle(defaults).valid, true, JSON.stringify(validateCombatCatalogBundle(defaults).issues, null, 2));
assert.deepEqual(defaults.ammoDefinitions.map((entry) => entry.ammoDefinitionId).sort(), [...BUILT_IN_AMMO_DEFINITION_IDS].sort());
assert.deepEqual(defaults.weaponDefinitions.map((entry) => entry.weaponDefinitionId).sort(), [...BUILT_IN_WEAPON_DEFINITION_IDS].sort());
assert.deepEqual(defaults.loadoutTemplates.map((entry) => entry.loadoutTemplateId).sort(), [...BUILT_IN_LOADOUT_TEMPLATE_IDS].sort());
assert.ok([...defaults.ammoDefinitions, ...defaults.weaponDefinitions, ...defaults.loadoutTemplates].every((entry) => entry.status === 'published'));

assert.ok(hasIssue(invalidResult((bundle) => { bundle.ammoDefinitions[0].ammoDefinitionId = 'INVALID ID'; }), 'invalid_id'));
assert.ok(hasIssue(invalidResult((bundle) => { bundle.ammoDefinitions[0].projectileMassKilograms = Number.NaN; }), 'non_finite_number'));
assert.ok(hasIssue(invalidResult((bundle) => { bundle.weaponDefinitions[0].roundsPerMinute = Number.POSITIVE_INFINITY; }), 'non_finite_number'));
assert.ok(hasIssue(invalidResult((bundle) => { bundle.ammoDefinitions[0].woundEffectMultiplier = -1; }), 'negative_number'));
assert.ok(hasIssue(invalidResult((bundle) => {
  const weapon = bundle.weaponDefinitions.find((entry) => entry.weaponDefinitionId === 'weapon_dp27');
  assert.ok(weapon);
  weapon.deploySeconds = 0;
}), 'non_positive_number'));

const mosin = registry.resolveWeapon({ definitionId: 'weapon_mosin_m9130', revision: 1 });
assert.equal(mosin.weaponDefinitionId, 'weapon_mosin_m9130');
assert.throws(() => registry.resolveWeapon({ definitionId: 'weapon_mosin_m9130', revision: 2 }), /revision 2/i);

assert.ok(hasIssue(invalidResult((bundle) => {
  bundle.weaponDefinitions[0].ammo = { definitionId: 'ammo_missing', revision: 1 };
}), 'missing_ammo_reference'));
assert.ok(hasIssue(invalidResult((bundle) => {
  bundle.loadoutTemplates[0].primary.definition = { definitionId: 'weapon_missing', revision: 1 };
}), 'missing_weapon_reference'));
assert.ok(hasIssue(invalidResult((bundle) => { bundle.loadoutTemplates[0].primary.loadedRounds = 6; }), 'loaded_rounds_exceed_capacity'));
assert.ok(hasIssue(invalidResult((bundle) => {
  const loadout = bundle.loadoutTemplates[0];
  loadout.reserveRoundsByAmmoDefinitionId.ammo_762x54r_ball = loadout.maximumReserveRoundsByAmmoDefinitionId.ammo_762x54r_ball + 1;
}), 'reserve_exceeds_maximum'));
assert.ok(hasIssue(invalidResult((bundle) => { bundle.weaponDefinitions[1].availableFireModes.push('single'); }), 'duplicate_fire_mode'));
assert.ok(hasIssue(invalidResult((bundle) => { bundle.weaponDefinitions[0].reloadStages[1].stageId = 'open'; }), 'duplicate_reload_stage'));
assert.ok(hasIssue(invalidResult((bundle) => { bundle.weaponDefinitions[0].reloadStages[1].kind = 'close'; }), 'invalid_load_stage_count'));
assert.ok(hasIssue(invalidResult((bundle) => { bundle.weaponDefinitions[0].reloadStages[0].loadedRoundsAppliedAtCompletion = true; }), 'invalid_load_application_stage'));

const publishedAmmo = registry.resolveAmmo({ definitionId: 'ammo_762x54r_ball', revision: 1 });
assert.throws(() => registry.saveAmmoDraft(publishedAmmo), /draft/i);
const draft = registry.saveAmmoDraft({ ...publishedAmmo, status: 'draft', nameEn: 'Edited rifle cartridge' });
assert.equal(draft.revision, 2);
assert.equal(draft.status, 'draft');
const publishedRevision = registry.publishAmmoRevision('ammo_762x54r_ball');
assert.equal(publishedRevision.revision, 2);
assert.equal(publishedRevision.status, 'published');
assert.equal(registry.resolveAmmo({ definitionId: 'ammo_762x54r_ball', revision: 1 }).nameEn, publishedAmmo.nameEn);
assert.equal(registry.resolveAmmo({ definitionId: 'ammo_762x54r_ball', revision: 2 }).nameEn, 'Edited rifle cartridge');

const secondaryRegistry = createDefaultCombatCatalogRegistry();
const weaponRevision1 = secondaryRegistry.resolveWeapon({ definitionId: 'weapon_mosin_m9130', revision: 1 });
const weaponDraft = secondaryRegistry.saveWeaponDraft({ ...weaponRevision1, status: 'draft', nameEn: 'Edited Mosin' });
assert.equal(weaponDraft.revision, 2);
assert.equal(secondaryRegistry.publishWeaponRevision('weapon_mosin_m9130').revision, 2);
assert.equal(secondaryRegistry.resolveWeapon({ definitionId: 'weapon_mosin_m9130', revision: 1 }).nameEn, weaponRevision1.nameEn);

const loadoutRevision1 = secondaryRegistry.resolveLoadout({ definitionId: 'loadout_rifleman', revision: 1 });
const loadoutDraft = secondaryRegistry.saveLoadoutDraft({ ...loadoutRevision1, status: 'draft', firstAidCharges: 2 });
assert.equal(loadoutDraft.revision, 2);
assert.equal(secondaryRegistry.publishLoadoutRevision('loadout_rifleman').revision, 2);
assert.equal(secondaryRegistry.resolveLoadout({ definitionId: 'loadout_rifleman', revision: 2 }).firstAidCharges, 2);

const beforeRejectedDraft = secondaryRegistry.exportJson();
assert.throws(() => secondaryRegistry.saveWeaponDraft({
  ...weaponRevision1,
  status: 'draft',
  ammo: { definitionId: 'ammo_missing', revision: 1 },
}), /missing_ammo_reference|отсутств/i);
assert.equal(secondaryRegistry.exportJson(), beforeRejectedDraft, 'rejected draft must not mutate the registry');

const archivedWeapon = secondaryRegistry.archiveWeaponRevision({ definitionId: 'weapon_mosin_m9130', revision: 1 });
assert.equal(archivedWeapon.status, 'archived');
assert.equal(secondaryRegistry.resolveWeapon({ definitionId: 'weapon_mosin_m9130', revision: 1 }).status, 'archived');
assert.equal(secondaryRegistry.listWeaponDefinitions().some((entry) => entry.weaponDefinitionId === 'weapon_mosin_m9130' && entry.revision === 1), false);
const archivedLoadout = secondaryRegistry.archiveLoadoutRevision({ definitionId: 'loadout_rifleman', revision: 1 });
assert.equal(archivedLoadout.status, 'archived');
assert.equal(secondaryRegistry.resolveLoadout({ definitionId: 'loadout_rifleman', revision: 1 }).status, 'archived');

const archived = registry.archiveAmmoRevision({ definitionId: 'ammo_762x54r_ball', revision: 1 });
assert.equal(archived.status, 'archived');
assert.equal(registry.resolveAmmo({ definitionId: 'ammo_762x54r_ball', revision: 1 }).status, 'archived');
assert.equal(registry.listAmmoDefinitions().some((entry) => entry.revision === 1 && entry.ammoDefinitionId === 'ammo_762x54r_ball'), false);
assert.equal(registry.listAmmoDefinitions({ includeArchived: true }).some((entry) => entry.revision === 1 && entry.ammoDefinitionId === 'ammo_762x54r_ball'), true);

const copy = registry.resolveWeapon({ definitionId: 'weapon_mosin_m9130', revision: 1 });
copy.nameEn = 'External mutation';
copy.ammo.definitionId = 'ammo_missing';
assert.equal(registry.resolveWeapon({ definitionId: 'weapon_mosin_m9130', revision: 1 }).nameEn, 'Mosin M91/30 rifle');
assert.equal(registry.resolveWeapon({ definitionId: 'weapon_mosin_m9130', revision: 1 }).ammo.definitionId, 'ammo_762x54r_ball');

assert.throws(() => CombatCatalogRegistry.fromUnknown({ ...defaults, formatVersion: 2 }), /formatVersion|верс/i);

console.log('combat-catalog-core: smoke passed');
