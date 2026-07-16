import {
  BUILT_IN_MOVEMENT_PROFILES,
  cloneMovementProfile,
  getBuiltInMovementProfile,
  mergeMovementProfileSettings,
} from './MovementProfileDefaults';
import {
  normalizeCustomMovementId,
  normalizeMovementProfile,
  normalizeMovementRegistryData,
  resolveMovementProfileIdAlias,
} from './MovementProfileNormalization';
import {
  MOVEMENT_PROFILE_FORMAT_VERSION,
  type BuiltInMovementProfileId,
  type DeepPartial,
  type MovementProfile,
  type MovementProfileRegistryData,
  type MovementProfileSettings,
} from './MovementProfileTypes';

export const DEFAULT_MOVEMENT_PROFILE_ID = 'normal_walk';
export type MovementProfileFallbackReason = 'empty_profile_id' | 'missing_profile' | null;

export interface MovementProfileResolution {
  requestedId: string | null;
  resolvedId: string;
  profile: MovementProfile;
  fallbackReason: MovementProfileFallbackReason;
}

export class MovementProfileRegistry {
  readonly formatVersion = MOVEMENT_PROFILE_FORMAT_VERSION;
  private registryRevision: number;
  private readonly profiles = new Map<string, MovementProfile>();

  constructor(data?: unknown) {
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
      .sort((left, right) => left.sortOrder - right.sortOrder || left.nameRu.localeCompare(right.nameRu) || left.id.localeCompare(right.id));
    return [...builtIns, ...custom].map(cloneMovementProfile);
  }

  hasProfile(id: string): boolean {
    return this.profiles.has(resolveMovementProfileIdAlias(id).id);
  }

  findProfile(id: string): MovementProfile | null {
    const value = this.profiles.get(resolveMovementProfileIdAlias(id).id);
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
      if (exact) return { requestedId, resolvedId: exact.id, profile: exact, fallbackReason: null };
    }
    const fallback = this.requireProfile(DEFAULT_MOVEMENT_PROFILE_ID);
    return {
      requestedId,
      resolvedId: fallback.id,
      profile: fallback,
      fallbackReason: requestedId ? 'missing_profile' : 'empty_profile_id',
    };
  }

  upsertProfile(value: unknown): MovementProfile {
    const normalized = normalizeMovementProfile(value);
    this.profiles.set(normalized.id, normalized);
    this.registryRevision += 1;
    return cloneMovementProfile(normalized);
  }

  createCustomProfile(id: string, nameEn: string, nameRu: string, sourceId = DEFAULT_MOVEMENT_PROFILE_ID): MovementProfile {
    const normalizedId = normalizeCustomMovementId(id);
    if (this.profiles.has(normalizedId)) throw new Error(`Movement profile already exists: ${normalizedId}`);
    const source = this.requireProfile(sourceId);
    return this.upsertProfile({
      ...source,
      id: normalizedId,
      nameEn: nameEn.trim() || normalizedId,
      nameRu: nameRu.trim() || nameEn.trim() || normalizedId,
      templateProfileId: source.templateProfileId,
      sortOrder: Math.max(100, ...this.listProfiles().map((profile) => profile.sortOrder)) + 10,
      revision: 1,
      builtIn: false,
    });
  }

  updateProfile(id: string, changes: Partial<Omit<MovementProfile, 'id' | 'builtIn' | 'revision'>>): MovementProfile {
    const current = this.requireProfile(id);
    return this.upsertProfile({
      ...current,
      ...changes,
      settings: changes.settings
        ? mergeMovementProfileSettings(current.settings, changes.settings as DeepPartial<MovementProfileSettings>)
        : current.settings,
      id: current.id,
      builtIn: current.builtIn,
      revision: current.revision + 1,
    });
  }

  deleteProfile(id: string): boolean {
    const current = this.profiles.get(id);
    if (!current || current.builtIn) return false;
    this.profiles.delete(id);
    for (const profile of this.profiles.values()) {
      if (profile.fallbackProfileId !== id) continue;
      profile.fallbackProfileId = profile.templateProfileId === profile.id ? null : profile.templateProfileId;
      profile.revision += 1;
    }
    this.registryRevision += 1;
    return true;
  }

  resetProfile(id: string): MovementProfile {
    const current = this.requireProfile(id);
    const defaults = getBuiltInMovementProfile(current.builtIn ? id as BuiltInMovementProfileId : current.templateProfileId);
    return this.upsertProfile(current.builtIn
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
  }

  toData(): MovementProfileRegistryData {
    return {
      formatVersion: MOVEMENT_PROFILE_FORMAT_VERSION,
      revision: this.registryRevision,
      profiles: this.listProfiles(),
    };
  }
}

export function createMovementProfileRegistry(data?: unknown): MovementProfileRegistry {
  return new MovementProfileRegistry(data);
}

export function serializeMovementProfileRegistry(registry: MovementProfileRegistry): MovementProfileRegistryData {
  return registry.toData();
}

export function resolveMovementProfile(registry: MovementProfileRegistry, id: string | null | undefined): MovementProfile {
  return registry.resolveProfile(id).profile;
}

export function upsertMovementProfile(registry: MovementProfileRegistry, value: unknown): MovementProfile | null {
  try {
    return registry.upsertProfile(value);
  } catch {
    return null;
  }
}
