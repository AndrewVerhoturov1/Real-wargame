import assert from 'node:assert/strict';
import {
  CombatCatalogRegistry,
  createDefaultCombatCatalogRegistry,
  serializeCombatCatalogBundle,
  validateCombatCatalogBundle,
  type CombatCatalogBundleV1,
} from '../src/core/infantry-combat/catalogs';

function reverseInputArrays(bundle: CombatCatalogBundleV1): CombatCatalogBundleV1 {
  const result = structuredClone(bundle);
  result.ammoDefinitions.reverse();
  result.weaponDefinitions.reverse();
  result.loadoutTemplates.reverse();
  return result;
}

function reverseObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (typeof value !== 'object' || value === null) return value;
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(source).reverse()) result[key] = reverseObjectKeys(source[key]);
  return result;
}

const registry = createDefaultCombatCatalogRegistry();
const bundle = registry.toData();
const canonical = serializeCombatCatalogBundle(bundle);

assert.equal(serializeCombatCatalogBundle(bundle), canonical, 'repeated serialization must be byte-stable');
assert.equal(serializeCombatCatalogBundle(reverseInputArrays(bundle)), canonical, 'top-level array order must not affect output');
assert.equal(
  serializeCombatCatalogBundle(reverseObjectKeys(bundle) as CombatCatalogBundleV1),
  canonical,
  'object key insertion order must not affect output',
);
assert.deepEqual(
  validateCombatCatalogBundle(reverseInputArrays(bundle)).issues,
  validateCombatCatalogBundle(bundle).issues,
  'validation output must not depend on input array order',
);

const firstRoundTrip = CombatCatalogRegistry.importJson(canonical).exportJson();
assert.equal(firstRoundTrip, canonical, 'export → import → export must be byte-identical');
const secondRoundTrip = CombatCatalogRegistry.importJson(firstRoundTrip).exportJson();
assert.equal(secondRoundTrip, canonical, 'repeated import must be idempotent');

assert.throws(
  () => CombatCatalogRegistry.importJson(JSON.stringify({ ...bundle, formatVersion: 2 })),
  /formatVersion|верс/i,
  'future formatVersion must be rejected explicitly',
);
assert.throws(
  () => CombatCatalogRegistry.importJson('{broken'),
  /JSON/i,
  'malformed JSON must produce an understandable error',
);

const beforeInvalidImport = registry.exportJson();
const invalid = structuredClone(bundle);
invalid.weaponDefinitions[0].ammo = { definitionId: 'ammo_missing', revision: 1 };
assert.throws(() => CombatCatalogRegistry.fromUnknown(invalid), /missing_ammo_reference|отсутств/i);
assert.equal(registry.exportJson(), beforeInvalidImport, 'invalid import must not mutate an existing registry');

console.log('combat-catalog-serialization: smoke passed');
