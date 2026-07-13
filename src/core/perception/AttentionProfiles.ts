import {
  ATTENTION_MODES,
  createAttentionRuntime,
  createAttentionSettings,
  type AttentionMode,
  type UnitAttentionSettings,
  type UnitAttentionSettingsInput,
} from './AttentionModel';
import type { UnitModel } from '../units/UnitModel';

export const ATTENTION_PROFILE_FORMAT_VERSION = 1 as const;
export const BUILT_IN_ATTENTION_PROFILE_IDS = ['balanced', 'cautious', 'observer', 'searcher', 'combat'] as const;
export type BuiltInAttentionProfileId = typeof BUILT_IN_ATTENTION_PROFILE_IDS[number];
export type AttentionProfileId = string;

export interface AttentionProfile {
  id: AttentionProfileId;
  nameEn: string;
  nameRu: string;
  descriptionEn: string;
  descriptionRu: string;
  settings: UnitAttentionSettings;
  revision: number;
  builtIn: boolean;
}

export interface AttentionProfileRegistryData {
  formatVersion: typeof ATTENTION_PROFILE_FORMAT_VERSION;
  revision: number;
  profiles: AttentionProfile[];
}

const BUILT_INS: ReadonlyArray<AttentionProfile> = [
  profile('balanced', 'Balanced', 'Обычный', 'Balanced observation for routine tasks.', 'Сбалансированное внимание для обычных задач.', {}),
  profile('cautious', 'Cautious', 'Осторожный', 'Checks flanks and rear more often and accepts slower recognition.', 'Чаще контролирует фланги и тыл, сохраняя осторожное широкое наблюдение.', {
    vision: { maximumVisualRangeMeters: 620, distanceFalloffStartMeters: 70, distanceFalloffExponent: 1.7, detectionVariancePercent: 8 },
    profiles: {
      march: { peripheralWeight: 0.34, peripheralCheckIntervalSeconds: 0.55, rearCheckIntervalSeconds: 2.2 },
      observe: { directAngleDegrees: 190, peripheralWeight: 0.24, peripheralCheckIntervalSeconds: 0.65, rearCheckIntervalSeconds: 3 },
    },
  }),
  profile('observer', 'Observer', 'Наблюдатель', 'Strong long-range observation with broad direct attention.', 'Усиленное дальнее наблюдение с широким прямым вниманием.', {
    vision: { maximumVisualRangeMeters: 850, distanceFalloffStartMeters: 110, distanceFalloffExponent: 1.45, detectionVariancePercent: 6 },
    profiles: {
      observe: { focusAngleDegrees: 70, directAngleDegrees: 210, directWeight: 0.82, peripheralWeight: 0.2, focusCheckIntervalSeconds: 0.14, directCheckIntervalSeconds: 0.22 },
      search: { directWeight: 0.68, focusCheckIntervalSeconds: 0.12, directCheckIntervalSeconds: 0.2 },
    },
  }),
  profile('searcher', 'Searcher', 'Поиск', 'Concentrates repeated checks inside the assigned search sector.', 'Чаще проверяет назначенный сектор поиска и быстрее накапливает признаки.', {
    vision: { maximumVisualRangeMeters: 700, distanceFalloffStartMeters: 90, distanceFalloffExponent: 1.55, detectionVariancePercent: 7 },
    profiles: {
      search: { focusAngleDegrees: 38, directAngleDegrees: 110, focusWeight: 1.2, directWeight: 0.72, focusCheckIntervalSeconds: 0.08, directCheckIntervalSeconds: 0.16, defaultSearchArcDegrees: 140 },
    },
  }),
  profile('combat', 'Combat', 'Бой', 'Keeps attention tightly around the engaged direction.', 'Сосредоточивает внимание около направления боя и хуже контролирует тыл.', {
    vision: { maximumVisualRangeMeters: 600, distanceFalloffStartMeters: 75, distanceFalloffExponent: 1.8, detectionVariancePercent: 10 },
    profiles: {
      engage: { focusAngleDegrees: 18, directAngleDegrees: 44, directWeight: 0.36, peripheralWeight: 0.025, focusCheckIntervalSeconds: 0.08, directCheckIntervalSeconds: 0.25, rearCheckIntervalSeconds: 12 },
      observe: { directWeight: 0.58 },
    },
  }),
];

export class AttentionProfileRegistry {
  readonly formatVersion = ATTENTION_PROFILE_FORMAT_VERSION;
  private registryRevision: number;
  private readonly profiles = new Map<string, AttentionProfile>();

  constructor(data?: Partial<AttentionProfileRegistryData>) {
    const normalized = normalizeRegistry(data);
    this.registryRevision = normalized.revision;
    for (const item of normalized.profiles) this.profiles.set(item.id, cloneProfile(item));
  }

  get revision(): number { return this.registryRevision; }

  listProfiles(): AttentionProfile[] {
    const builtIns = BUILT_IN_ATTENTION_PROFILE_IDS.map((id) => this.profiles.get(id)).filter((item): item is AttentionProfile => Boolean(item));
    const custom = [...this.profiles.values()].filter((item) => !item.builtIn).sort((a, b) => a.nameRu.localeCompare(b.nameRu) || a.id.localeCompare(b.id));
    return [...builtIns, ...custom].map(cloneProfile);
  }

  hasProfile(id: string): boolean { return this.profiles.has(id); }

  getProfile(id: string): AttentionProfile {
    const value = this.profiles.get(id) ?? this.profiles.get('balanced');
    if (!value) throw new Error('Attention profile registry is missing the balanced profile.');
    return cloneProfile(value);
  }

  createCustomProfile(id: string, nameEn: string, nameRu: string, sourceId = 'balanced'): AttentionProfile {
    const normalizedId = normalizeId(id);
    if (this.profiles.has(normalizedId)) throw new Error(`Attention profile already exists: ${normalizedId}`);
    const source = this.getProfile(sourceId);
    const created: AttentionProfile = {
      ...source,
      id: normalizedId,
      nameEn: cleanText(nameEn, normalizedId),
      nameRu: cleanText(nameRu, nameEn || normalizedId),
      descriptionEn: `Custom profile based on ${source.nameEn}.`,
      descriptionRu: `Пользовательский профиль на основе «${source.nameRu}».`,
      builtIn: false,
      revision: 1,
      settings: cloneSettings(source.settings),
    };
    this.profiles.set(created.id, created);
    this.touch();
    return cloneProfile(created);
  }

  copyProfile(sourceId: string, id: string, nameEn: string, nameRu: string): AttentionProfile {
    return this.createCustomProfile(id, nameEn, nameRu, sourceId);
  }

  updateProfile(id: string, changes: Partial<Omit<AttentionProfile, 'id' | 'builtIn' | 'revision'>>): AttentionProfile {
    const current = this.require(id);
    const updated = normalizeProfile({
      ...current,
      ...changes,
      id: current.id,
      builtIn: current.builtIn,
      revision: current.revision + 1,
      settings: changes.settings ?? current.settings,
    }, current);
    this.profiles.set(id, updated);
    this.touch();
    return cloneProfile(updated);
  }

  renameProfile(id: string, nameEn: string, nameRu: string): AttentionProfile {
    return this.updateProfile(id, { nameEn: cleanText(nameEn, id), nameRu: cleanText(nameRu, nameEn || id) });
  }

  resetProfile(id: string): AttentionProfile {
    const current = this.require(id);
    const source = current.builtIn ? builtIn(id as BuiltInAttentionProfileId) : builtIn('balanced');
    const reset = normalizeProfile({
      ...source,
      id: current.id,
      nameEn: current.builtIn ? source.nameEn : current.nameEn,
      nameRu: current.builtIn ? source.nameRu : current.nameRu,
      descriptionEn: current.builtIn ? source.descriptionEn : current.descriptionEn,
      descriptionRu: current.builtIn ? source.descriptionRu : current.descriptionRu,
      builtIn: current.builtIn,
      revision: current.revision + 1,
    }, current);
    this.profiles.set(id, reset);
    this.touch();
    return cloneProfile(reset);
  }

  deleteProfile(id: string): boolean {
    const current = this.profiles.get(id);
    if (!current || current.builtIn) return false;
    const deleted = this.profiles.delete(id);
    if (deleted) this.touch();
    return deleted;
  }

  toData(): AttentionProfileRegistryData {
    return { formatVersion: ATTENTION_PROFILE_FORMAT_VERSION, revision: this.registryRevision, profiles: this.listProfiles() };
  }

  exportJson(): string { return JSON.stringify(this.toData(), null, 2); }
  static importJson(json: string): AttentionProfileRegistry { return AttentionProfileRegistry.fromUnknown(JSON.parse(json) as unknown); }
  static fromUnknown(value: unknown): AttentionProfileRegistry {
    return typeof value === 'object' && value !== null ? new AttentionProfileRegistry(value as Partial<AttentionProfileRegistryData>) : createDefaultAttentionProfileRegistry();
  }

  private require(id: string): AttentionProfile {
    const value = this.profiles.get(id);
    if (!value) throw new Error(`Unknown attention profile: ${id}`);
    return value;
  }
  private touch(): void { this.registryRevision += 1; }
}

export function createDefaultAttentionProfileRegistry(): AttentionProfileRegistry {
  return new AttentionProfileRegistry({ formatVersion: 1, revision: 1, profiles: BUILT_INS.map(cloneProfile) });
}

export function getBuiltInAttentionProfile(id: BuiltInAttentionProfileId): AttentionProfile { return cloneProfile(builtIn(id)); }

export function applyAttentionProfileToUnit(unit: UnitModel, profile: AttentionProfile): void {
  const previous = unit.attentionRuntime;
  unit.attentionSettings = cloneSettings(profile.settings);
  const next = createAttentionRuntime(unit.attentionSettings, unit.facingRadians);
  next.mode = previous.mode;
  next.modeSource = previous.modeSource;
  next.focusDirectionRadians = previous.focusDirectionRadians;
  next.focusTargetId = previous.focusTargetId;
  next.searchCenterRadians = previous.searchCenterRadians;
  next.searchArcRadians = previous.searchArcRadians;
  unit.attentionRuntime = next;
  unit.viewAngleRadians = unit.attentionSettings.profiles.observe.directAngleDegrees * Math.PI / 180;
  unit.playerAttentionProfileId = profile.id;
}

export function cloneAttentionSettings(settings: UnitAttentionSettings): UnitAttentionSettings {
  return cloneSettings(settings);
}

function profile(id: BuiltInAttentionProfileId, nameEn: string, nameRu: string, descriptionEn: string, descriptionRu: string, overrides: UnitAttentionSettingsInput): AttentionProfile {
  return { id, nameEn, nameRu, descriptionEn, descriptionRu, settings: createAttentionSettings(overrides), revision: 1, builtIn: true };
}
function builtIn(id: BuiltInAttentionProfileId): AttentionProfile {
  const value = BUILT_INS.find((item) => item.id === id);
  if (!value) throw new Error(`Unknown built-in attention profile: ${id}`);
  return value;
}
function normalizeRegistry(data?: Partial<AttentionProfileRegistryData>): AttentionProfileRegistryData {
  const custom = Array.isArray(data?.profiles) ? data.profiles.filter((item) => item && !BUILT_IN_ATTENTION_PROFILE_IDS.includes(item.id as BuiltInAttentionProfileId)).map((item) => normalizeProfile(item)) : [];
  return { formatVersion: 1, revision: Math.max(1, Math.round(Number(data?.revision) || 1)), profiles: [...BUILT_INS.map(cloneProfile), ...custom] };
}
function normalizeProfile(value: Partial<AttentionProfile>, fallback?: AttentionProfile): AttentionProfile {
  const id = normalizeId(value.id ?? fallback?.id ?? 'custom');
  return {
    id,
    nameEn: cleanText(value.nameEn, fallback?.nameEn ?? id),
    nameRu: cleanText(value.nameRu, fallback?.nameRu ?? value.nameEn ?? id),
    descriptionEn: cleanText(value.descriptionEn, fallback?.descriptionEn ?? ''),
    descriptionRu: cleanText(value.descriptionRu, fallback?.descriptionRu ?? ''),
    settings: createAttentionSettings(value.settings ?? fallback?.settings ?? {}),
    revision: Math.max(1, Math.round(Number(value.revision ?? fallback?.revision) || 1)),
    builtIn: Boolean(value.builtIn ?? fallback?.builtIn),
  };
}
function cloneProfile(value: AttentionProfile): AttentionProfile { return { ...value, settings: cloneSettings(value.settings) }; }
function cloneSettings(settings: UnitAttentionSettings): UnitAttentionSettings {
  return {
    defaultMode: settings.defaultMode,
    vision: { ...settings.vision },
    profiles: Object.fromEntries(ATTENTION_MODES.map((mode: AttentionMode) => [mode, { ...settings.profiles[mode] }])) as UnitAttentionSettings['profiles'],
  };
}
function normalizeId(value: string): string {
  const id = String(value).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  if (!id) throw new Error('Attention profile id is empty.');
  return id;
}
function cleanText(value: unknown, fallback: string): string { const text = typeof value === 'string' ? value.trim() : ''; return text || fallback; }
