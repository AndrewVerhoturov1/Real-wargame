import type { CatalogValidationIssue, CatalogValidationResult } from './CombatCatalogTypes';
import { validateAmmo, validateLoadout, validateWeapon } from './CombatCatalogValidationDefinitions';
import { validateReferences } from './CombatCatalogValidationReferences';
import {
  COMBAT_CATALOG_ID_PATTERN, add, duplicateRevisions, entryPath, exact, finish, integer,
  isObject, orderedArray,
} from './CombatCatalogValidationSupport';

export { COMBAT_CATALOG_ID_PATTERN };

export class CombatCatalogValidationError extends Error {
  readonly issues: readonly CatalogValidationIssue[];

  constructor(issues: readonly CatalogValidationIssue[]) {
    super(issues.map((issue) => `${issue.path} [${issue.code}]: ${issue.messageRu}`).join('\n'));
    this.name = 'CombatCatalogValidationError';
    this.issues = issues.map((issue) => ({ ...issue }));
  }
}

export function validateCombatCatalogBundle(value: unknown): CatalogValidationResult {
  const issues: CatalogValidationIssue[] = [];
  if (!isObject(value)) {
    add(issues, '$', 'invalid_type', 'Корень каталога должен быть JSON-объектом.');
    return finish(issues);
  }
  exact(value.formatVersion, 1, '$.formatVersion', 'unsupported_format_version', issues);
  integer(value.revision, 1, '$.revision', issues);
  const ammo = orderedArray(value.ammoDefinitions, 'ammoDefinitionId', '$.ammoDefinitions', issues);
  const weapons = orderedArray(value.weaponDefinitions, 'weaponDefinitionId', '$.weaponDefinitions', issues);
  const loadouts = orderedArray(value.loadoutTemplates, 'loadoutTemplateId', '$.loadoutTemplates', issues);
  ammo.forEach((entry, index) => validateAmmo(entry, entryPath('ammoDefinitions', entry, 'ammoDefinitionId', index), issues));
  weapons.forEach((entry, index) => validateWeapon(entry, entryPath('weaponDefinitions', entry, 'weaponDefinitionId', index), issues));
  loadouts.forEach((entry, index) => validateLoadout(entry, entryPath('loadoutTemplates', entry, 'loadoutTemplateId', index), issues));
  duplicateRevisions(ammo, 'ammoDefinitionId', '$.ammoDefinitions', issues);
  duplicateRevisions(weapons, 'weaponDefinitionId', '$.weaponDefinitions', issues);
  duplicateRevisions(loadouts, 'loadoutTemplateId', '$.loadoutTemplates', issues);
  validateReferences(ammo, weapons, loadouts, issues);
  return finish(issues);
}
