import assert from 'node:assert/strict';
import {
  COMBAT_CATALOG_STORAGE_KEY,
  CombatCatalogStorageAdapter,
  createDefaultCombatCatalogRegistry,
  type CombatCatalogKeyValueStorage,
} from '../src/core/infantry-combat/catalogs';

class MemoryStorage implements CombatCatalogKeyValueStorage {
  readonly values = new Map<string, string>();
  writes = 0;
  removals = 0;

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.writes += 1;
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.removals += 1;
    this.values.delete(key);
  }
}

assert.equal(typeof window, 'undefined', 'storage smoke must run without DOM');

const emptyStorage = new MemoryStorage();
const emptyAdapter = new CombatCatalogStorageAdapter(emptyStorage);
const emptyLoad = emptyAdapter.load();
assert.equal(emptyLoad.source, 'defaults');
assert.equal(emptyLoad.error, null);
assert.equal(emptyStorage.writes, 0, 'empty storage must not be populated automatically');
assert.equal(emptyLoad.registry.exportJson(), createDefaultCombatCatalogRegistry().exportJson());

const roundTripStorage = new MemoryStorage();
const roundTripAdapter = new CombatCatalogStorageAdapter(roundTripStorage);
const registry = createDefaultCombatCatalogRegistry();
const sourceWeapon = registry.resolveWeapon({ definitionId: 'weapon_mosin_m9130', revision: 1 });
registry.saveWeaponDraft({
  ...sourceWeapon,
  status: 'draft',
  nameRu: 'Винтовка с точной ссылкой',
  ammo: { definitionId: 'ammo_762x54r_ball', revision: 1 },
});
const saved = roundTripAdapter.save(registry);
assert.equal(roundTripStorage.writes, 1);
assert.equal(roundTripStorage.getItem(COMBAT_CATALOG_STORAGE_KEY), saved.exportJson());
const loaded = new CombatCatalogStorageAdapter(roundTripStorage).load();
assert.equal(loaded.source, 'storage');
assert.equal(loaded.error, null);
assert.equal(loaded.registry.exportJson(), saved.exportJson(), 'valid round-trip must be byte-stable');
assert.deepEqual(
  loaded.registry.resolveWeapon({ definitionId: 'weapon_mosin_m9130', revision: 2 }).ammo,
  { definitionId: 'ammo_762x54r_ball', revision: 1 },
  'exact references must survive storage round-trip',
);

const corruptStorage = new MemoryStorage();
const corruptPayload = '{broken-json';
corruptStorage.values.set(COMBAT_CATALOG_STORAGE_KEY, corruptPayload);
const corruptLoad = new CombatCatalogStorageAdapter(corruptStorage).load();
assert.equal(corruptLoad.source, 'defaults');
assert.equal(corruptLoad.error?.code, 'malformed_json');
assert.equal(corruptStorage.getItem(COMBAT_CATALOG_STORAGE_KEY), corruptPayload, 'corrupted payload must be preserved');
assert.equal(corruptStorage.writes, 0, 'corruption must not trigger automatic defaults write');
assert.equal(corruptStorage.removals, 0, 'corruption must not remove the payload');

const atomicStorage = new MemoryStorage();
const atomicAdapter = new CombatCatalogStorageAdapter(atomicStorage);
const validRegistry = atomicAdapter.save(createDefaultCombatCatalogRegistry());
const validPayload = atomicStorage.getItem(COMBAT_CATALOG_STORAGE_KEY);
const invalidBundle = validRegistry.toData();
invalidBundle.weaponDefinitions[0].ammo = { definitionId: 'ammo_missing', revision: 1 };
assert.throws(
  () => atomicAdapter.importJson(JSON.stringify(invalidBundle)),
  /missing_ammo_reference|отсутств/i,
  'invalid bundle must be rejected',
);
assert.equal(atomicStorage.getItem(COMBAT_CATALOG_STORAGE_KEY), validPayload, 'failed import must not replace storage');
assert.equal(atomicAdapter.getRegistry().exportJson(), validRegistry.exportJson(), 'failed import must not replace current registry');

let notifications = 0;
const unsubscribe = atomicAdapter.subscribe(() => { notifications += 1; });
const changedRegistry = createDefaultCombatCatalogRegistry();
const ammo = changedRegistry.resolveAmmo({ definitionId: 'ammo_762x54r_ball', revision: 1 });
changedRegistry.saveAmmoDraft({ ...ammo, status: 'draft', nameRu: 'Новый черновик' });
atomicAdapter.save(changedRegistry);
assert.equal(notifications, 1, 'one save must emit exactly one notification');
unsubscribe();

const beforeResetPayload = atomicStorage.getItem(COMBAT_CATALOG_STORAGE_KEY);
assert.notEqual(beforeResetPayload, createDefaultCombatCatalogRegistry().exportJson());
assert.equal(atomicStorage.removals, 0, 'reset must not happen implicitly');
const resetRegistry = atomicAdapter.reset();
assert.equal(resetRegistry.exportJson(), createDefaultCombatCatalogRegistry().exportJson());
assert.equal(atomicStorage.getItem(COMBAT_CATALOG_STORAGE_KEY), resetRegistry.exportJson());
assert.equal(notifications, 1, 'unsubscribed listener must not receive reset');

const stableExport = atomicAdapter.exportJson();
assert.equal(stableExport, atomicAdapter.exportJson(), 'export must be deterministic');

console.log('combat-catalog-storage: smoke passed');
