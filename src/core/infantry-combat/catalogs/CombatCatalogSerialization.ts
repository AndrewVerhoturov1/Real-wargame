import { CombatCatalogValidationError, validateCombatCatalogBundle } from './CombatCatalogValidation';
import type { CombatCatalogBundleV1 } from './CombatCatalogTypes';

export function serializeCombatCatalogBundle(bundle: CombatCatalogBundleV1): string {
  const validation = validateCombatCatalogBundle(bundle);
  if (!validation.valid) throw new CombatCatalogValidationError(validation.issues);
  return `${JSON.stringify(canonicalizeBundle(bundle), null, 2)}\n`;
}

function canonicalizeBundle(bundle: CombatCatalogBundleV1): unknown {
  return sortObjectKeys({
    ...structuredClone(bundle),
    ammoDefinitions: [...bundle.ammoDefinitions].sort((a, b) => compareText(a.ammoDefinitionId, b.ammoDefinitionId) || a.revision - b.revision),
    weaponDefinitions: [...bundle.weaponDefinitions].sort((a, b) => compareText(a.weaponDefinitionId, b.weaponDefinitionId) || a.revision - b.revision),
    loadoutTemplates: [...bundle.loadoutTemplates].sort((a, b) => compareText(a.loadoutTemplateId, b.loadoutTemplateId) || a.revision - b.revision),
  });
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (typeof value !== 'object' || value === null) return value;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    result[key] = sortObjectKeys((value as Record<string, unknown>)[key]);
  }
  return result;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
