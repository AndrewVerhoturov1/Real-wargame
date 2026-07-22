import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
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

for (const collectionKey of ['ammoDefinitions', 'weaponDefinitions', 'loadoutTemplates'] as const) {
  const bundle = createDefaultCombatCatalogRegistry().toData();
  const entries = bundle[collectionKey] as unknown as Array<Record<string, unknown>>;
  const source = structuredClone(entries[0]);
  entries.push(
    { ...structuredClone(source), revision: 2, status: 'draft', nameEn: 'First draft' },
    { ...structuredClone(source), revision: 3, status: 'draft', nameEn: 'Second draft' },
  );
  const validation = validateCombatCatalogBundle(bundle);
  assert.ok(
    hasIssue(validation.issues, 'multiple_drafts_for_definition'),
    `${collectionKey} must reject multiple drafts for one definition ID`,
  );
}

const dependencyRegistry = createDefaultCombatCatalogRegistry();
const dependencyAmmoRevision1 = dependencyRegistry.resolveAmmo({ definitionId: 'ammo_762x54r_ball', revision: 1 });
const dependencyAmmoDraft = dependencyRegistry.saveAmmoDraft({
  ...dependencyAmmoRevision1,
  status: 'draft',
  nameEn: 'Draft rifle cartridge dependency',
});
assert.equal(dependencyAmmoDraft.revision, 2);
const dependencyWeaponRevision1 = dependencyRegistry.resolveWeapon({ definitionId: 'weapon_mosin_m9130', revision: 1 });
dependencyRegistry.saveWeaponDraft({
  ...dependencyWeaponRevision1,
  status: 'draft',
  nameEn: 'Weapon with draft ammo dependency',
  ammo: { definitionId: dependencyAmmoDraft.ammoDefinitionId, revision: dependencyAmmoDraft.revision },
});
const beforeRejectedWeaponPublish = dependencyRegistry.exportJson();
assert.throws(
  () => dependencyRegistry.publishWeaponRevision('weapon_mosin_m9130'),
  /unstable_ammo_reference/,
  'published weapon must not depend on a draft ammo revision',
);
assert.equal(
  dependencyRegistry.exportJson(),
  beforeRejectedWeaponPublish,
  'rejected weapon publication must not mutate the registry',
);
assert.equal(dependencyRegistry.publishAmmoRevision('ammo_762x54r_ball').revision, 2);
const stableWeaponRevision2 = dependencyRegistry.publishWeaponRevision('weapon_mosin_m9130');
assert.equal(stableWeaponRevision2.revision, 2);

const dependencyWeaponDraft = dependencyRegistry.saveWeaponDraft({
  ...stableWeaponRevision2,
  status: 'draft',
  nameEn: 'Draft weapon dependency for loadout',
});
assert.equal(dependencyWeaponDraft.revision, 3);
const dependencyLoadoutRevision1 = dependencyRegistry.resolveLoadout({ definitionId: 'loadout_rifleman', revision: 1 });
dependencyRegistry.saveLoadoutDraft({
  ...dependencyLoadoutRevision1,
  status: 'draft',
  nameEn: 'Loadout with draft weapon dependency',
  primary: {
    ...dependencyLoadoutRevision1.primary,
    definition: { definitionId: dependencyWeaponDraft.weaponDefinitionId, revision: dependencyWeaponDraft.revision },
  },
});
const beforeRejectedLoadoutPublish = dependencyRegistry.exportJson();
assert.throws(
  () => dependencyRegistry.publishLoadoutRevision('loadout_rifleman'),
  /unstable_weapon_reference/,
  'published loadout must not depend on a draft weapon revision',
);
assert.equal(
  dependencyRegistry.exportJson(),
  beforeRejectedLoadoutPublish,
  'rejected loadout publication must not mutate the registry',
);
assert.equal(dependencyRegistry.publishWeaponRevision('weapon_mosin_m9130').revision, 3);
assert.equal(dependencyRegistry.publishLoadoutRevision('loadout_rifleman').revision, 2);
assert.equal(
  dependencyRegistry.archiveAmmoRevision({ definitionId: 'ammo_762x54r_ball', revision: 1 }).status,
  'archived',
  'archived ammo revisions remain stable dependency targets',
);
assert.equal(
  dependencyRegistry.archiveWeaponRevision({ definitionId: 'weapon_mosin_m9130', revision: 1 }).status,
  'archived',
  'archived weapon revisions remain stable dependency targets',
);

const catalogSourceDirectory = path.join(process.cwd(), 'src', 'core', 'infantry-combat', 'catalogs');
const deterministicSourceFiles = [
  ...readdirSync(catalogSourceDirectory)
    .filter((fileName) => fileName.endsWith('.ts'))
    .map((fileName) => path.join(catalogSourceDirectory, fileName)),
  path.join(process.cwd(), 'scripts', 'combat_catalog_core_smoke.ts'),
  path.join(process.cwd(), 'scripts', 'combat_catalog_core_smoke.mjs'),
  path.join(process.cwd(), 'scripts', 'combat_catalog_serialization_smoke.ts'),
  path.join(process.cwd(), 'scripts', 'combat_catalog_serialization_smoke.mjs'),
].sort();
const forbiddenSourceFragments = [
  ['Date', 'now'].join('.'),
  ['performance', 'now'].join('.'),
  ['Math', 'random'].join('.'),
  ['random', 'UUID'].join(''),
];
for (const fileName of deterministicSourceFiles) {
  const source = readFileSync(fileName, 'utf8');
  for (const fragment of forbiddenSourceFragments) {
    assert.equal(source.includes(fragment), false, `${fileName} must not use ${fragment}`);
  }
}

console.log('combat-catalog-core: smoke passed');
