import {
  createDefaultTacticalPositionSettings,
  normalizeTacticalPositionSettings,
  type TacticalPositionSettings,
} from './TacticalPositionSettings';
import {
  normalizeTacticalPositionSearchObjective,
  type TacticalPositionSearchObjective,
} from './TacticalPositionObjective';

export interface TacticalPositionProfile {
  readonly id: string;
  readonly nameRu: string;
  readonly nameEn: string;
  readonly descriptionRu: string;
  readonly descriptionEn: string;
  readonly revision: number;
  readonly builtIn: boolean;
  readonly defaultObjective: TacticalPositionSearchObjective;
  readonly settings: TacticalPositionSettings;
}

export interface TacticalPositionProfileRegistryDataV1 {
  readonly version: 1;
  readonly revision: number;
  readonly activeProfileId: string;
  readonly profiles: readonly TacticalPositionProfile[];
}

const STORAGE_KEY = 'real-wargame.tactical-position-profiles.v1';
const CHANGE_EVENT = 'real-wargame:tactical-position-profiles-changed';
const BUILT_IN_ID = 'balanced';

export function createBuiltInTacticalPositionProfile(): TacticalPositionProfile {
  return {
    id: BUILT_IN_ID,
    nameRu: 'Сбалансированный',
    nameEn: 'Balanced',
    descriptionRu: 'Базовые правила поиска безопасной позиции без обязательного продвижения или отхода.',
    descriptionEn: 'Default safe-position search without mandatory advance or withdrawal.',
    revision: 1,
    builtIn: true,
    defaultObjective: 'balanced',
    settings: createDefaultTacticalPositionSettings(),
  };
}

export function loadTacticalPositionProfileRegistry(): TacticalPositionProfileRegistryDataV1 {
  const stored = readStorage();
  return normalizeRegistry(stored);
}

export function saveTacticalPositionProfileRegistry(
  value: TacticalPositionProfileRegistryDataV1,
): TacticalPositionProfileRegistryDataV1 {
  const normalized = normalizeRegistry(value);
  writeStorage(normalized);
  publishChange(normalized);
  return cloneRegistry(normalized);
}

export function listTacticalPositionProfiles(): TacticalPositionProfile[] {
  return loadTacticalPositionProfileRegistry().profiles.map(cloneProfile);
}

export function getTacticalPositionProfile(profileId?: string | null): TacticalPositionProfile {
  const registry = loadTacticalPositionProfileRegistry();
  const requested = profileId?.trim() || registry.activeProfileId;
  return cloneProfile(
    registry.profiles.find((profile) => profile.id === requested)
      ?? registry.profiles.find((profile) => profile.id === BUILT_IN_ID)
      ?? createBuiltInTacticalPositionProfile(),
  );
}

export function setActiveTacticalPositionProfile(profileId: string): TacticalPositionProfileRegistryDataV1 {
  const registry = loadTacticalPositionProfileRegistry();
  if (!registry.profiles.some((profile) => profile.id === profileId)) return registry;
  return saveTacticalPositionProfileRegistry({
    ...registry,
    revision: registry.revision + 1,
    activeProfileId: profileId,
  });
}

export function createTacticalPositionProfileCopy(
  sourceProfileId = BUILT_IN_ID,
  requestedId?: string,
): TacticalPositionProfile {
  const registry = loadTacticalPositionProfileRegistry();
  const source = registry.profiles.find((profile) => profile.id === sourceProfileId)
    ?? createBuiltInTacticalPositionProfile();
  const id = uniqueProfileId(registry, requestedId || `${source.id}-custom`);
  const profile: TacticalPositionProfile = {
    ...cloneProfile(source),
    id,
    nameRu: `${source.nameRu} — копия`,
    nameEn: `${source.nameEn} copy`,
    descriptionRu: `Пользовательский профиль на основе «${source.nameRu}».`,
    descriptionEn: `Custom profile based on ${source.nameEn}.`,
    revision: 1,
    builtIn: false,
  };
  saveTacticalPositionProfileRegistry({
    version: 1,
    revision: registry.revision + 1,
    activeProfileId: profile.id,
    profiles: [...registry.profiles, profile],
  });
  return cloneProfile(profile);
}

export function updateTacticalPositionProfile(
  profile: TacticalPositionProfile,
): TacticalPositionProfile {
  const registry = loadTacticalPositionProfileRegistry();
  const existing = registry.profiles.find((candidate) => candidate.id === profile.id);
  if (!existing || existing.builtIn) throw new Error('Built-in tactical-position profiles cannot be overwritten.');
  const normalized = normalizeProfile({
    ...profile,
    id: existing.id,
    builtIn: false,
    revision: existing.revision + 1,
  }, existing);
  saveTacticalPositionProfileRegistry({
    version: 1,
    revision: registry.revision + 1,
    activeProfileId: normalized.id,
    profiles: registry.profiles.map((candidate) => candidate.id === normalized.id ? normalized : candidate),
  });
  return cloneProfile(normalized);
}

export function deleteTacticalPositionProfile(profileId: string): TacticalPositionProfileRegistryDataV1 {
  const registry = loadTacticalPositionProfileRegistry();
  const existing = registry.profiles.find((profile) => profile.id === profileId);
  if (!existing || existing.builtIn) return registry;
  const profiles = registry.profiles.filter((profile) => profile.id !== profileId);
  return saveTacticalPositionProfileRegistry({
    version: 1,
    revision: registry.revision + 1,
    activeProfileId: registry.activeProfileId === profileId ? BUILT_IN_ID : registry.activeProfileId,
    profiles,
  });
}

export function importTacticalPositionProfile(value: unknown): TacticalPositionProfile {
  const registry = loadTacticalPositionProfileRegistry();
  const candidate = isRecord(value) && Array.isArray(value.profiles)
    ? value.profiles[0]
    : value;
  const normalized = normalizeProfile(candidate, createBuiltInTacticalPositionProfile());
  const id = uniqueProfileId(registry, normalized.id === BUILT_IN_ID ? 'imported-profile' : normalized.id);
  const imported: TacticalPositionProfile = {
    ...normalized,
    id,
    builtIn: false,
    revision: 1,
  };
  saveTacticalPositionProfileRegistry({
    version: 1,
    revision: registry.revision + 1,
    activeProfileId: imported.id,
    profiles: [...registry.profiles, imported],
  });
  return cloneProfile(imported);
}

export function exportTacticalPositionProfile(profileId: string): string {
  return JSON.stringify(getTacticalPositionProfile(profileId), null, 2);
}

export function resetTacticalPositionProfileRegistry(): TacticalPositionProfileRegistryDataV1 {
  const registry = defaultRegistry();
  writeStorage(registry);
  publishChange(registry);
  return cloneRegistry(registry);
}

export function subscribeTacticalPositionProfileRegistry(
  listener: (registry: TacticalPositionProfileRegistryDataV1) => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handleCustom = (event: Event): void => {
    const detail = (event as CustomEvent<TacticalPositionProfileRegistryDataV1>).detail;
    listener(detail ? cloneRegistry(detail) : loadTacticalPositionProfileRegistry());
  };
  const handleStorage = (event: StorageEvent): void => {
    if (event.key === STORAGE_KEY) listener(loadTacticalPositionProfileRegistry());
  };
  window.addEventListener(CHANGE_EVENT, handleCustom);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handleCustom);
    window.removeEventListener('storage', handleStorage);
  };
}

export function tacticalPositionProfileStorageKey(): string {
  return STORAGE_KEY;
}

function defaultRegistry(): TacticalPositionProfileRegistryDataV1 {
  return {
    version: 1,
    revision: 1,
    activeProfileId: BUILT_IN_ID,
    profiles: [createBuiltInTacticalPositionProfile()],
  };
}

function normalizeRegistry(value: unknown): TacticalPositionProfileRegistryDataV1 {
  const fallback = defaultRegistry();
  if (!isRecord(value)) return fallback;
  const rawProfiles = Array.isArray(value.profiles) ? value.profiles : [];
  const profiles = rawProfiles
    .map((profile) => normalizeProfile(profile, fallback.profiles[0]!))
    .filter((profile, index, all) => all.findIndex((candidate) => candidate.id === profile.id) === index);
  const builtIn = createBuiltInTacticalPositionProfile();
  const withoutBuiltIn = profiles.filter((profile) => profile.id !== BUILT_IN_ID && !profile.builtIn);
  const normalizedProfiles = [builtIn, ...withoutBuiltIn];
  const requestedActive = cleanId(value.activeProfileId, BUILT_IN_ID);
  return {
    version: 1,
    revision: nonNegativeInteger(value.revision, fallback.revision),
    activeProfileId: normalizedProfiles.some((profile) => profile.id === requestedActive)
      ? requestedActive
      : BUILT_IN_ID,
    profiles: normalizedProfiles.map(cloneProfile),
  };
}

function normalizeProfile(value: unknown, fallback: TacticalPositionProfile): TacticalPositionProfile {
  const source = isRecord(value) ? value : {};
  return {
    id: cleanId(source.id, fallback.id),
    nameRu: cleanText(source.nameRu, fallback.nameRu),
    nameEn: cleanText(source.nameEn, fallback.nameEn),
    descriptionRu: cleanText(source.descriptionRu, fallback.descriptionRu),
    descriptionEn: cleanText(source.descriptionEn, fallback.descriptionEn),
    revision: Math.max(1, nonNegativeInteger(source.revision, fallback.revision)),
    builtIn: source.builtIn === true,
    defaultObjective: normalizeTacticalPositionSearchObjective(source.defaultObjective),
    settings: normalizeTacticalPositionSettings(source.settings as Partial<TacticalPositionSettings>),
  };
}

function cloneProfile(profile: TacticalPositionProfile): TacticalPositionProfile {
  return { ...profile, settings: { ...profile.settings } };
}

function cloneRegistry(registry: TacticalPositionProfileRegistryDataV1): TacticalPositionProfileRegistryDataV1 {
  return { ...registry, profiles: registry.profiles.map(cloneProfile) };
}

function uniqueProfileId(registry: TacticalPositionProfileRegistryDataV1, requested: string): string {
  const base = cleanId(requested, 'tactical-profile');
  if (!registry.profiles.some((profile) => profile.id === base)) return base;
  let suffix = 2;
  while (registry.profiles.some((profile) => profile.id === `${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function readStorage(): unknown {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStorage(registry: TacticalPositionProfileRegistryDataV1): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(registry));
}

function publishChange(registry: TacticalPositionProfileRegistryDataV1): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: cloneRegistry(registry) }));
}

function cleanId(value: unknown, fallback: string): string {
  const source = typeof value === 'string' ? value.trim().toLowerCase() : '';
  const normalized = source.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function cleanText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
