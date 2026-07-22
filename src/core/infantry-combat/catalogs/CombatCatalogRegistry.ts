import { createDefaultCombatCatalogBundle } from './CombatCatalogDefaults';
import { serializeCombatCatalogBundle } from './CombatCatalogSerialization';
import {
  CombatCatalogValidationError,
  validateCombatCatalogBundle,
} from './CombatCatalogValidation';
import type {
  AmmoDefinitionV1,
  CombatCatalogBundleV1,
  DefinitionRef,
  LoadoutTemplateV1,
  WeaponDefinitionV1,
} from './CombatCatalogTypes';

export class CombatCatalogImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CombatCatalogImportError';
  }
}

export class CombatCatalogRegistry {
  private data: CombatCatalogBundleV1;

  constructor(data: CombatCatalogBundleV1 = createDefaultCombatCatalogBundle()) {
    assertValid(data);
    this.data = sortBundle(clone(data));
  }

  static fromUnknown(value: unknown): CombatCatalogRegistry {
    const validation = validateCombatCatalogBundle(value);
    if (!validation.valid) throw new CombatCatalogValidationError(validation.issues);
    return new CombatCatalogRegistry(value as CombatCatalogBundleV1);
  }

  static importJson(json: string): CombatCatalogRegistry {
    let value: unknown;
    try {
      value = JSON.parse(json);
    } catch {
      throw new CombatCatalogImportError('Некорректный JSON каталога.');
    }
    return CombatCatalogRegistry.fromUnknown(value);
  }

  exportJson(): string {
    return serializeCombatCatalogBundle(this.data);
  }

  toData(): CombatCatalogBundleV1 {
    return clone(sortBundle(this.data));
  }

  listAmmoDefinitions(options: { includeArchived?: boolean } = {}): AmmoDefinitionV1[] {
    return listEntries(this.data.ammoDefinitions, options.includeArchived === true);
  }

  listWeaponDefinitions(options: { includeArchived?: boolean } = {}): WeaponDefinitionV1[] {
    return listEntries(this.data.weaponDefinitions, options.includeArchived === true);
  }

  listLoadoutTemplates(options: { includeArchived?: boolean } = {}): LoadoutTemplateV1[] {
    return listEntries(this.data.loadoutTemplates, options.includeArchived === true);
  }

  resolveAmmo(ref: DefinitionRef): AmmoDefinitionV1 {
    return resolveExact(this.data.ammoDefinitions, 'ammoDefinitionId', ref, 'ammo');
  }

  resolveWeapon(ref: DefinitionRef): WeaponDefinitionV1 {
    return resolveExact(this.data.weaponDefinitions, 'weaponDefinitionId', ref, 'weapon');
  }

  resolveLoadout(ref: DefinitionRef): LoadoutTemplateV1 {
    return resolveExact(this.data.loadoutTemplates, 'loadoutTemplateId', ref, 'loadout');
  }

  saveAmmoDraft(definition: AmmoDefinitionV1): AmmoDefinitionV1 {
    return this.saveDraft('ammoDefinitions', definition, (entry) => entry.ammoDefinitionId);
  }

  saveWeaponDraft(definition: WeaponDefinitionV1): WeaponDefinitionV1 {
    return this.saveDraft('weaponDefinitions', definition, (entry) => entry.weaponDefinitionId);
  }

  saveLoadoutDraft(template: LoadoutTemplateV1): LoadoutTemplateV1 {
    return this.saveDraft('loadoutTemplates', template, (entry) => entry.loadoutTemplateId);
  }

  publishAmmoRevision(definitionId: string): AmmoDefinitionV1 {
    return this.publishDraft('ammoDefinitions', definitionId, (entry) => entry.ammoDefinitionId);
  }

  publishWeaponRevision(definitionId: string): WeaponDefinitionV1 {
    return this.publishDraft('weaponDefinitions', definitionId, (entry) => entry.weaponDefinitionId);
  }

  publishLoadoutRevision(definitionId: string): LoadoutTemplateV1 {
    return this.publishDraft('loadoutTemplates', definitionId, (entry) => entry.loadoutTemplateId);
  }

  archiveAmmoRevision(ref: DefinitionRef): AmmoDefinitionV1 {
    return this.archiveRevision('ammoDefinitions', ref, (entry) => entry.ammoDefinitionId);
  }

  archiveWeaponRevision(ref: DefinitionRef): WeaponDefinitionV1 {
    return this.archiveRevision('weaponDefinitions', ref, (entry) => entry.weaponDefinitionId);
  }

  archiveLoadoutRevision(ref: DefinitionRef): LoadoutTemplateV1 {
    return this.archiveRevision('loadoutTemplates', ref, (entry) => entry.loadoutTemplateId);
  }

  private saveDraft<T extends CatalogEntry>(
    collectionKey: EntryCollectionKey,
    definition: T,
    getId: (entry: T) => string,
  ): T {
    if (definition.status !== 'draft') throw new Error('save-draft принимает только запись со статусом draft.');
    const entries = this.data[collectionKey] as unknown as T[];
    const definitionId = getId(definition);
    const stableRevisions = entries
      .filter((entry) => getId(entry) === definitionId && entry.status !== 'draft')
      .map((entry) => entry.revision);
    const existingDraft = entries.find((entry) => getId(entry) === definitionId && entry.status === 'draft');
    const nextRevision = existingDraft?.revision ?? Math.max(0, ...stableRevisions) + 1;
    const candidate = clone({ ...definition, revision: nextRevision, status: 'draft' } as T);
    const nextData = clone(this.data);
    const nextEntries = nextData[collectionKey] as unknown as T[];
    const replacement = nextEntries
      .filter((entry) => !(getId(entry) === definitionId && entry.status === 'draft'))
      .concat(candidate);
    (nextData[collectionKey] as unknown) = replacement;
    this.commitMutation(nextData);
    return clone(candidate);
  }

  private publishDraft<T extends CatalogEntry>(
    collectionKey: EntryCollectionKey,
    definitionId: string,
    getId: (entry: T) => string,
  ): T {
    const entries = this.data[collectionKey] as unknown as T[];
    const drafts = entries.filter((entry) => getId(entry) === definitionId && entry.status === 'draft');
    if (drafts.length !== 1) throw new Error(`Ожидалась одна draft-ревизия для ${definitionId}, найдено: ${drafts.length}.`);
    const draft = drafts[0];
    const latestStable = Math.max(0, ...entries
      .filter((entry) => getId(entry) === definitionId && entry.status !== 'draft')
      .map((entry) => entry.revision));
    const published = clone({ ...draft, revision: latestStable + 1, status: 'published' } as T);
    const nextData = clone(this.data);
    const nextEntries = nextData[collectionKey] as unknown as T[];
    const replacement = nextEntries
      .filter((entry) => !(getId(entry) === definitionId && entry.status === 'draft'))
      .concat(published);
    (nextData[collectionKey] as unknown) = replacement;
    this.commitMutation(nextData);
    return clone(published);
  }

  private archiveRevision<T extends CatalogEntry>(
    collectionKey: EntryCollectionKey,
    ref: DefinitionRef,
    getId: (entry: T) => string,
  ): T {
    const entries = this.data[collectionKey] as unknown as T[];
    const index = entries.findIndex((entry) => getId(entry) === ref.definitionId && entry.revision === ref.revision);
    if (index < 0) throw new Error(`Unknown definition ${ref.definitionId} revision ${ref.revision}.`);
    const current = entries[index];
    if (current.status === 'draft') throw new Error('Draft-ревизию нельзя архивировать; сначала опубликуйте или замените её.');
    if (current.status === 'archived') return clone(current);
    const archived = clone({ ...current, status: 'archived' } as T);
    const nextData = clone(this.data);
    const nextEntries = nextData[collectionKey] as unknown as T[];
    nextEntries[index] = archived;
    this.commitMutation(nextData);
    return clone(archived);
  }

  private commitMutation(nextData: CombatCatalogBundleV1): void {
    nextData.revision = this.data.revision + 1;
    assertValid(nextData);
    this.data = sortBundle(nextData);
  }
}

export function createDefaultCombatCatalogRegistry(): CombatCatalogRegistry {
  return new CombatCatalogRegistry(createDefaultCombatCatalogBundle());
}

type EntryCollectionKey = 'ammoDefinitions' | 'weaponDefinitions' | 'loadoutTemplates';
type CatalogEntry = AmmoDefinitionV1 | WeaponDefinitionV1 | LoadoutTemplateV1;

function assertValid(value: unknown): asserts value is CombatCatalogBundleV1 {
  const validation = validateCombatCatalogBundle(value);
  if (!validation.valid) throw new CombatCatalogValidationError(validation.issues);
}

function listEntries<T extends { status: string; revision: number }>(entries: readonly T[], includeArchived: boolean): T[] {
  return entries
    .filter((entry) => includeArchived || entry.status !== 'archived')
    .map(clone);
}

function resolveExact<T extends { revision: number }>(
  entries: readonly T[],
  idField: keyof T,
  ref: DefinitionRef,
  label: string,
): T {
  const entry = entries.find((candidate) => candidate[idField] === ref.definitionId && candidate.revision === ref.revision);
  if (!entry) throw new Error(`Unknown ${label} definition ${ref.definitionId} revision ${ref.revision}.`);
  return clone(entry);
}

function sortBundle(bundle: CombatCatalogBundleV1): CombatCatalogBundleV1 {
  return {
    ...clone(bundle),
    ammoDefinitions: [...bundle.ammoDefinitions].map(clone).sort((a, b) => compareEntry(a.ammoDefinitionId, a.revision, b.ammoDefinitionId, b.revision)),
    weaponDefinitions: [...bundle.weaponDefinitions].map(clone).sort((a, b) => compareEntry(a.weaponDefinitionId, a.revision, b.weaponDefinitionId, b.revision)),
    loadoutTemplates: [...bundle.loadoutTemplates].map(clone).sort((a, b) => compareEntry(a.loadoutTemplateId, a.revision, b.loadoutTemplateId, b.revision)),
  };
}

function compareEntry(leftId: string, leftRevision: number, rightId: string, rightRevision: number): number {
  return compareText(leftId, rightId) || leftRevision - rightRevision;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
