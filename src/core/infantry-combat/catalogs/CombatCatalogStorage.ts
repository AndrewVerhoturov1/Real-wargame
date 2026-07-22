import {
  CombatCatalogImportError,
  CombatCatalogRegistry,
  createDefaultCombatCatalogRegistry,
} from './CombatCatalogRegistry';
import { CombatCatalogValidationError } from './CombatCatalogValidation';
import type { CatalogValidationIssue } from './CombatCatalogTypes';

export interface CombatCatalogKeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const COMBAT_CATALOG_STORAGE_KEY = 'real-wargame.combat-catalog.bundle.v1';

export type CombatCatalogStorageErrorCode =
  | 'malformed_json'
  | 'invalid_bundle'
  | 'storage_read_failed';

export interface CombatCatalogStorageError {
  readonly code: CombatCatalogStorageErrorCode;
  readonly messageRu: string;
  readonly issues: readonly CatalogValidationIssue[];
}

export interface CombatCatalogStorageLoadResult {
  readonly registry: CombatCatalogRegistry;
  readonly source: 'defaults' | 'storage';
  readonly error: CombatCatalogStorageError | null;
}

type CombatCatalogStorageListener = (registry: CombatCatalogRegistry) => void;

export class CombatCatalogStorageAdapter {
  private currentRegistry: CombatCatalogRegistry | null = null;
  private readonly listeners = new Set<CombatCatalogStorageListener>();

  constructor(
    private readonly storage: CombatCatalogKeyValueStorage,
    private readonly storageKey = COMBAT_CATALOG_STORAGE_KEY,
  ) {}

  load(): CombatCatalogStorageLoadResult {
    let raw: string | null;
    try {
      raw = this.storage.getItem(this.storageKey);
    } catch (error) {
      const registry = createDefaultCombatCatalogRegistry();
      this.currentRegistry = registry;
      return {
        registry: cloneRegistry(registry),
        source: 'defaults',
        error: {
          code: 'storage_read_failed',
          messageRu: `Не удалось прочитать каталог из браузерного хранилища: ${errorMessage(error)}`,
          issues: [],
        },
      };
    }

    if (raw === null) {
      const registry = createDefaultCombatCatalogRegistry();
      this.currentRegistry = registry;
      return { registry: cloneRegistry(registry), source: 'defaults', error: null };
    }

    try {
      const registry = CombatCatalogRegistry.importJson(raw);
      this.currentRegistry = registry;
      return { registry: cloneRegistry(registry), source: 'storage', error: null };
    } catch (error) {
      const registry = createDefaultCombatCatalogRegistry();
      this.currentRegistry = registry;
      return {
        registry: cloneRegistry(registry),
        source: 'defaults',
        error: storageError(error),
      };
    }
  }

  getRegistry(): CombatCatalogRegistry {
    if (!this.currentRegistry) this.load();
    return cloneRegistry(this.currentRegistry ?? createDefaultCombatCatalogRegistry());
  }

  save(registry: CombatCatalogRegistry): CombatCatalogRegistry {
    const serialized = registry.exportJson();
    const candidate = CombatCatalogRegistry.importJson(serialized);
    this.storage.setItem(this.storageKey, serialized);
    this.currentRegistry = candidate;
    this.publish(candidate);
    return cloneRegistry(candidate);
  }

  importJson(json: string): CombatCatalogRegistry {
    const candidate = CombatCatalogRegistry.importJson(json);
    return this.save(candidate);
  }

  reset(): CombatCatalogRegistry {
    return this.save(createDefaultCombatCatalogRegistry());
  }

  exportJson(): string {
    return this.getRegistry().exportJson();
  }

  subscribe(listener: CombatCatalogStorageListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private publish(registry: CombatCatalogRegistry): void {
    for (const listener of this.listeners) listener(cloneRegistry(registry));
  }
}

function storageError(error: unknown): CombatCatalogStorageError {
  if (error instanceof CombatCatalogValidationError) {
    return {
      code: 'invalid_bundle',
      messageRu: 'Сохранённый каталог не прошёл проверку. Показаны стандартные данные; исходная запись не изменена.',
      issues: error.issues.map((issue) => ({ ...issue })),
    };
  }
  if (error instanceof CombatCatalogImportError) {
    return {
      code: 'malformed_json',
      messageRu: 'Сохранённый каталог содержит повреждённый JSON. Показаны стандартные данные; исходная запись не изменена.',
      issues: [],
    };
  }
  return {
    code: 'invalid_bundle',
    messageRu: `Не удалось загрузить сохранённый каталог: ${errorMessage(error)}`,
    issues: [],
  };
}

function cloneRegistry(registry: CombatCatalogRegistry): CombatCatalogRegistry {
  return CombatCatalogRegistry.fromUnknown(registry.toData());
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
