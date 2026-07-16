import { BUILT_IN_MOVEMENT_PROFILES, cloneMovementProfile, getBuiltInMovementProfile } from './MovementProfileDefaults';
import { MovementProfileImportError, validateMovementProfileImport } from './MovementProfileImportValidation';
import { normalizeCustomMovementId, normalizeMovementProfile, normalizeMovementRegistryData } from './MovementProfileNormalization';
import {
  MOVEMENT_PROFILE_FORMAT_VERSION,
  type BuiltInMovementProfileId,
  type MovementProfile,
  type MovementProfileRegistryData,
} from './MovementProfileTypes';

export type MovementProfileFallbackReason = 'empty-profile-id' | 'missing-profile' | null;

export interface MovementProfileResolution {
  readonly requestedId: string | null;
  readonly resolvedId: string;
  readonly profile: MovementProfile;
  readonly fallbackReason: MovementProfileFallbackReason;
}

export class MovementProfileRegistry {
  readonly formatVersion = MOVEMENT_PROFILE_FORMAT_VERSION;
  private registryRevision: number;
  private readonly profiles = new Map<string, MovementProfile>();

  constructor(data?: Partial<MovementProfileRegistryData>) {
    const normalized = normalizeMovementRegistryData(data);
    this.registryRevision = normalized.revision;
    for (const profile of normalized.profiles) this.profiles.set(profile.id, cloneMovementProfile(profile));
  }

  get revision(): number {
    return this.registryRevision;
  }

  listProfiles(): MovementProfile[] {
    const builtIns = BUILT_IN_MOVEMENT_PROFILES
      .map((profile) => this.profiles.get(profile.id))
      .filter((profile): profile is MovementProfile => Boolean(profile));
    const custom = [...this.profiles.values()]
      .filter((profile) => !profile.builtIn)
      .sort((left, right) => left.sortOrder - right.sortOrder
        || left.nameRu.localeCompare(right.nameRu)
        || left.id.localeCompare(right.id));
    return [...builtIns, ...custom].map(cloneMovementProfile);
  }

  hasProfile(id: string): boolean {
    return this.profiles.has(id);
  }

  findProfile(id: string): MovementProfile | null {
    const value = this.profiles.get(id);
    return value ? cloneMovementProfile(value) : null;
  }

  requireProfile(id: string): MovementProfile {
    const value = this.findProfile(id);
    if (!value) throw new Error(`Unknown movement profile: ${id}`);
    return value;
  }

  resolveProfile(id: string | null | undefined): MovementProfileResolution {
    const requestedId = typeof id === 'string' && id.trim() ? id.trim() : null;
    if (requestedId) {
      const exact = this.findProfile(requestedId);
      if (exact) {
        return {
          requestedId,
          resolvedId: exact.id,
          profile: exact,
          fallbackReason: null,
        };
      }
    }
    const fallback = this.requireProfile('normal_walk');
    return {
      requestedId,
      resolvedId: fallback.id,
      profile: fallback,
      fallbackReason: requestedId ? 'missing-profile' : 'empty-profile-id',
    };
  }

  createCustomProfile(
    id: string,
    nameEn: string,
    nameRu: string,
    sourceId = 'normal_walk',
  ): MovementProfile {
    const normalizedId = normalizeCustomMovementId(id);
    if (this.profiles.has(normalizedId)) throw new Error(`Movement profile already exists: ${normalizedId}`);
    const source = this.requireProfile(sourceId);
    const created = normalizeMovementProfile({
      ...source,
      id: normalizedId,
      nameEn: clean(nameEn, normalizedId),
      nameRu: clean(nameRu, nameEn || normalizedId),
      descriptionEn: `Custom profile based on ${source.nameEn}.`,
      descriptionRu: `Пользовательский профиль на основе «${source.nameRu}».`,
      templateProfileId: source.templateProfileId,
      fallbackProfileId: source.fallbackProfileId === source.id ? null : source.fallbackProfileId,
      sortOrder: this.nextSortOrder(),
      revision: 1,
      builtIn: false,
    });
    this.profiles.set(created.id, created);
    this.touch();
    return this.requireProfile(created.id);
  }

  copyProfile(sourceId: string, id: string, nameEn: string, nameRu: string): MovementProfile {
    return this.createCustomProfile(id, nameEn, nameRu, sourceId);
  }

  updateProfile(
    id: string,
    changes: Partial<Omit<MovementProfile, 'id' | 'builtIn' | 'revision'>>,
  ): MovementProfile {
    const current = this.requireProfile(id);
    const updated = normalizeMovementProfile({
      ...current,
      ...clone(changes),
      id: current.id,
      builtIn: current.builtIn,
      revision: current.revision + 1,
    });
    this.profiles.set(id, updated);
    this.touch();
    return cloneMovementProfile(updated);
  }

  renameProfile(id: string, nameEn: string, nameRu: string): MovementProfile {
    return this.updateProfile(id, {
      nameEn: clean(nameEn, id),
      nameRu: clean(nameRu, nameEn || id),
    });
  }

  deleteProfile(id: string): boolean {
    const current = this.profiles.get(id);
    if (!current || current.builtIn) return false;
    this.profiles.delete(id);
    for (const profile of this.profiles.values()) {
      if (profile.fallbackProfileId === id) {
        profile.fallbackProfileId = profile.templateProfileId === profile.id ? null : profile.templateProfileId;
        profile.revision += 1;
      }
    }
    this.touch();
    return true;
  }

  resetProfile(id: string): MovementProfile {
    const current = this.requireProfile(id);
    const defaults = getBuiltInMovementProfile(
      current.builtIn ? id as BuiltInMovementProfileId : current.templateProfileId,
    );
    this.profiles.set(id, current.builtIn
      ? { ...defaults, revision: current.revision + 1 }
      : {
          ...defaults,
          id: current.id,
          nameEn: current.nameEn,
          nameRu: current.nameRu,
          descriptionEn: current.descriptionEn,
          descriptionRu: current.descriptionRu,
          sortOrder: current.sortOrder,
          revision: current.revision + 1,
          builtIn: false,
        });
    this.touch();
    return this.requireProfile(id);
  }

  toData(): MovementProfileRegistryData {
    return {
      formatVersion: MOVEMENT_PROFILE_FORMAT_VERSION,
      revision: this.registryRevision,
      profiles: this.listProfiles(),
    };
  }

  exportJson(): string {
    return `${JSON.stringify(this.toData(), null, 2)}\n`;
  }

  static fromUnknown(value: unknown): MovementProfileRegistry {
    return new MovementProfileRegistry(validateMovementProfileImport(value));
  }

  static importJson(raw: string): MovementProfileRegistry {
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new MovementProfileImportError([{
        path: '$',
        messageEn: 'Import is not valid JSON.',
        messageRu: 'Файл не является корректным JSON.',
      }]);
    }
    return this.fromUnknown(value);
  }

  private touch(): void {
    this.registryRevision += 1;
  }

  private nextSortOrder(): number {
    return Math.max(100, ...[...this.profiles.values()].map((profile) => profile.sortOrder)) + 10;
  }
}

export function createDefaultMovementProfileRegistry(): MovementProfileRegistry {
  return new MovementProfileRegistry();
}

function clean(value: unknown, fallback: unknown): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  const normalizedFallback = typeof fallback === 'string' ? fallback.trim() : '';
  return normalized || normalizedFallback || 'Movement profile';
}

function clone<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value)) as T;
}
