import {
  ATTENTION_MODES,
  DEFAULT_ATTENTION_PROFILES,
  createAttentionRuntime,
  createAttentionSettings,
  type AttentionMode,
  type AttentionModeProfile,
  type UnitAttentionSettings,
  type UnitAttentionSettingsInput,
} from './AttentionModel';
import type { UnitModel } from '../units/UnitModel';

export const ATTENTION_PROFILE_FORMAT_VERSION = 2 as const;
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

export interface AttentionProfileImportIssue {
  path: string;
  message: string;
}

export class AttentionProfileImportError extends Error {
  readonly issues: readonly AttentionProfileImportIssue[];

  constructor(issues: readonly AttentionProfileImportIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
    this.name = 'AttentionProfileImportError';
    this.issues = [...issues];
  }
}

const BUILT_INS: ReadonlyArray<AttentionProfile> = [
  profile('balanced', 'Balanced', 'Обычный', 'Balanced observation for routine tasks.', 'Сбалансированное внимание для обычных задач.', {}),
  profile('cautious', 'Cautious', 'Осторожный', 'Checks flanks and rear more often and accepts slower recognition.', 'Чаще контролирует фланги и тыл, сохраняя осторожное широкое наблюдение.', {
    vision: { maximumVisualRangeMeters: 620, distanceFalloffStartMeters: 70, distanceFalloffExponent: 1.7, detectionVariancePercent: 8 },
    profiles: {
      march: { peripheralAngleDegrees: 250, peripheralWeight: 0.34, rearWeight: 0.1, rearMaximumRangeMeters: 130, peripheralCheckIntervalSeconds: 0.55, rearCheckIntervalSeconds: 2.2 },
      observe: { directAngleDegrees: 190, peripheralAngleDegrees: 240, peripheralWeight: 0.24, rearWeight: 0.08, rearMaximumRangeMeters: 145, peripheralCheckIntervalSeconds: 0.65, rearCheckIntervalSeconds: 3 },
    },
  }),
  profile('observer', 'Observer', 'Наблюдатель', 'Strong long-range observation with broad direct attention.', 'Усиленное дальнее наблюдение с широким прямым вниманием.', {
    vision: { maximumVisualRangeMeters: 850, distanceFalloffStartMeters: 110, distanceFalloffExponent: 1.45, detectionVariancePercent: 6 },
    profiles: {
      observe: { focusAngleDegrees: 70, directAngleDegrees: 210, peripheralAngleDegrees: 250, directWeight: 0.82, peripheralWeight: 0.2, rearWeight: 0.07, rearMaximumRangeMeters: 150, focusCheckIntervalSeconds: 0.14, directCheckIntervalSeconds: 0.22 },
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
      engage: { focusAngleDegrees: 18, directAngleDegrees: 44, peripheralAngleDegrees: 130, directWeight: 0.36, peripheralWeight: 0.025, rearWeight: 0.01, rearMaximumRangeMeters: 50, focusCheckIntervalSeconds: 0.08, directCheckIntervalSeconds: 0.25, rearCheckIntervalSeconds: 12 },
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

  static importJson(json: string): AttentionProfileRegistry {
    let value: unknown;
    try {
      value = JSON.parse(json) as unknown;
    } catch (error) {
      throw new AttentionProfileImportError([{ path: '$', message: error instanceof Error ? error.message : 'Некорректный JSON.' }]);
    }
    const issues = validateRegistryInput(value);
    if (issues.length > 0) throw new AttentionProfileImportError(issues);
    return new AttentionProfileRegistry(value as Partial<AttentionProfileRegistryData>);
  }

  static fromUnknown(value: unknown): AttentionProfileRegistry {
    if (typeof value !== 'object' || value === null) return createDefaultAttentionProfileRegistry();
    const issues = validateRegistryInput(value);
    if (issues.length > 0) throw new AttentionProfileImportError(issues);
    return new AttentionProfileRegistry(value as Partial<AttentionProfileRegistryData>);
  }

  private require(id: string): AttentionProfile {
    const value = this.profiles.get(id);
    if (!value) throw new Error(`Unknown attention profile: ${id}`);
    return value;
  }

  private touch(): void { this.registryRevision += 1; }
}

export function createDefaultAttentionProfileRegistry(): AttentionProfileRegistry {
  return new AttentionProfileRegistry({ formatVersion: ATTENTION_PROFILE_FORMAT_VERSION, revision: 1, profiles: BUILT_INS.map(cloneProfile) });
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
  const custom = Array.isArray(data?.profiles)
    ? data.profiles
      .filter((item) => item && !BUILT_IN_ATTENTION_PROFILE_IDS.includes(item.id as BuiltInAttentionProfileId))
      .map((item) => normalizeProfile(item))
    : [];
  return {
    formatVersion: ATTENTION_PROFILE_FORMAT_VERSION,
    revision: Math.max(1, Math.round(Number(data?.revision) || 1)),
    profiles: [...BUILT_INS.map(cloneProfile), ...custom],
  };
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
    nearAwarenessRangeMeters: settings.nearAwarenessRangeMeters,
    nearMinimumVisibilityQuality: settings.nearMinimumVisibilityQuality,
    profiles: Object.fromEntries(ATTENTION_MODES.map((mode: AttentionMode) => [mode, { ...settings.profiles[mode] }])) as UnitAttentionSettings['profiles'],
  };
}

function validateRegistryInput(value: unknown): AttentionProfileImportIssue[] {
  const issues: AttentionProfileImportIssue[] = [];
  if (!isRecord(value)) return [{ path: '$', message: 'Ожидался объект registry.' }];
  if (value.profiles !== undefined && !Array.isArray(value.profiles)) {
    issues.push({ path: 'profiles', message: 'Ожидался массив профилей.' });
    return issues;
  }
  const profiles = Array.isArray(value.profiles) ? value.profiles : [];
  profiles.forEach((profileValue, profileIndex) => {
    const profilePath = `profiles[${profileIndex}]`;
    if (!isRecord(profileValue)) {
      issues.push({ path: profilePath, message: 'Ожидался объект профиля.' });
      return;
    }
    if (profileValue.id !== undefined && typeof profileValue.id !== 'string') {
      issues.push({ path: `${profilePath}.id`, message: 'Технический id должен быть строкой.' });
    }
    if (profileValue.settings === undefined) return;
    if (!isRecord(profileValue.settings)) {
      issues.push({ path: `${profilePath}.settings`, message: 'Ожидался объект настроек.' });
      return;
    }
    validateOptionalFinite(profileValue.settings, 'nearAwarenessRangeMeters', `${profilePath}.settings`, issues, 0, 20);
    validateOptionalFinite(profileValue.settings, 'nearMinimumVisibilityQuality', `${profilePath}.settings`, issues, 0, 1);
    if (profileValue.settings.vision !== undefined) {
      if (!isRecord(profileValue.settings.vision)) {
        issues.push({ path: `${profilePath}.settings.vision`, message: 'Ожидался объект настроек зрения.' });
      } else {
        validateOptionalFinite(profileValue.settings.vision, 'maximumVisualRangeMeters', `${profilePath}.settings.vision`, issues, 20, 2000);
        validateOptionalFinite(profileValue.settings.vision, 'distanceFalloffStartMeters', `${profilePath}.settings.vision`, issues, 0, 2000);
        validateOptionalFinite(profileValue.settings.vision, 'distanceFalloffExponent', `${profilePath}.settings.vision`, issues, 0.25, 6);
        validateOptionalFinite(profileValue.settings.vision, 'detectionVariancePercent', `${profilePath}.settings.vision`, issues, 0, 25);
      }
    }
    if (profileValue.settings.profiles === undefined) return;
    if (!isRecord(profileValue.settings.profiles)) {
      issues.push({ path: `${profilePath}.settings.profiles`, message: 'Ожидался объект режимов внимания.' });
      return;
    }
    for (const mode of ATTENTION_MODES) {
      const modeValue = profileValue.settings.profiles[mode];
      if (modeValue === undefined) continue;
      const modePath = `${profilePath}.settings.profiles.${mode}`;
      if (!isRecord(modeValue)) {
        issues.push({ path: modePath, message: 'Ожидался объект режима внимания.' });
        continue;
      }
      validateModeInput(modeValue, modePath, DEFAULT_ATTENTION_PROFILES[mode], issues);
    }
  });
  return issues;
}

function validateModeInput(
  value: Record<string, unknown>,
  path: string,
  defaults: AttentionModeProfile,
  issues: AttentionProfileImportIssue[],
): void {
  const numericRanges: ReadonlyArray<readonly [keyof AttentionModeProfile, number, number]> = [
    ['focusAngleDegrees', 1, 180],
    ['directAngleDegrees', 1, 360],
    ['peripheralAngleDegrees', 1, 360],
    ['focusWeight', 0, 2],
    ['directWeight', 0, 2],
    ['peripheralWeight', 0, 1],
    ['rearWeight', 0, 1],
    ['focusCheckIntervalSeconds', 0.05, 5],
    ['directCheckIntervalSeconds', 0.05, 5],
    ['peripheralCheckIntervalSeconds', 0.05, 10],
    ['rearCheckIntervalSeconds', 0.25, 60],
    ['focusSampleDurationSeconds', 0.01, 60],
    ['directSampleDurationSeconds', 0.01, 60],
    ['peripheralSampleDurationSeconds', 0.01, 60],
    ['rearSampleDurationSeconds', 0.01, 60],
    ['rearMaximumRangeMeters', 0, 2000],
    ['defaultSearchArcDegrees', 1, 360],
  ];
  for (const [key, minimum, maximum] of numericRanges) {
    validateOptionalFinite(value, key, path, issues, minimum, maximum);
  }
  const merged = { ...defaults, ...value } as unknown as AttentionModeProfile;
  if (finiteNumber(merged.directAngleDegrees) && finiteNumber(merged.focusAngleDegrees)
    && merged.directAngleDegrees < merged.focusAngleDegrees) {
    issues.push({ path: `${path}.directAngleDegrees`, message: 'Прямой сектор не может быть уже фокуса.' });
  }
  if (finiteNumber(merged.peripheralAngleDegrees) && finiteNumber(merged.directAngleDegrees)
    && merged.peripheralAngleDegrees < merged.directAngleDegrees) {
    issues.push({ path: `${path}.peripheralAngleDegrees`, message: 'Внешний угол периферии не может быть уже прямого сектора.' });
  }
  validateSampleIntervalPair(merged, path, 'focusSampleDurationSeconds', 'focusCheckIntervalSeconds', issues);
  validateSampleIntervalPair(merged, path, 'directSampleDurationSeconds', 'directCheckIntervalSeconds', issues);
  validateSampleIntervalPair(merged, path, 'peripheralSampleDurationSeconds', 'peripheralCheckIntervalSeconds', issues);
  validateSampleIntervalPair(merged, path, 'rearSampleDurationSeconds', 'rearCheckIntervalSeconds', issues);
}

function validateSampleIntervalPair(
  value: AttentionModeProfile,
  path: string,
  sampleKey: keyof AttentionModeProfile,
  intervalKey: keyof AttentionModeProfile,
  issues: AttentionProfileImportIssue[],
): void {
  const sample = value[sampleKey];
  const interval = value[intervalKey];
  if (typeof sample === 'number' && typeof interval === 'number' && Number.isFinite(sample) && Number.isFinite(interval) && sample > interval) {
    issues.push({ path: `${path}.${String(sampleKey)}`, message: `Условная длительность взгляда не может превышать ${String(intervalKey)}.` });
  }
}

function validateOptionalFinite(
  value: Record<string, unknown>,
  key: string,
  path: string,
  issues: AttentionProfileImportIssue[],
  minimum: number,
  maximum: number,
): void {
  if (value[key] === undefined) return;
  if (!finiteNumber(value[key])) {
    issues.push({ path: `${path}.${key}`, message: 'Ожидалось конечное число.' });
    return;
  }
  const numeric = value[key] as number;
  if (numeric < minimum || numeric > maximum) {
    issues.push({ path: `${path}.${key}`, message: `Значение должно быть в диапазоне ${minimum}…${maximum}.` });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeId(value: string): string {
  const id = String(value).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  if (!id) throw new Error('Attention profile id is empty.');
  return id;
}

function cleanText(value: unknown, fallback: string): string { const text = typeof value === 'string' ? value.trim() : ''; return text || fallback; }
