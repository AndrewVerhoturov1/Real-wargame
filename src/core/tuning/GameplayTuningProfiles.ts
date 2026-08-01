import {
  SOLDIER_PARAMETERS_BY_PROFILE,
  type BehaviorProfileId,
  type SoldierCondition,
  type SoldierTraits,
} from '../behavior/BehaviorModel';

export const GAMEPLAY_TUNING_FORMAT_VERSION = 1 as const;
export const DEFAULT_PERCEPTION_PROFILE_ID = 'standard';
export const DEFAULT_CONDITION_PROFILE_ID = 'standard';
export const DEFAULT_SOLDIER_ARCHETYPE_ID: BehaviorProfileId = 'regular';

export interface PerceptionContactProfile {
  readonly confidenceEvidenceDivisor: number;
  readonly minimumUncertaintyCells: number;
  readonly initialUncertaintyCells: number;
  readonly uncertaintyEvidenceDivisor: number;
  readonly evidenceDecayPerSecond: number;
  readonly confidenceDecayPerSecond: number;
  readonly uncertaintyGrowthMetersPerSecond: number;
  readonly soundEvidenceMultiplier: number;
  readonly reportedEvidenceMultiplier: number;
}

export interface PerceptionProfileDefinition {
  readonly id: string;
  readonly nameRu: string;
  readonly builtIn: boolean;
  readonly revision: number;
  readonly contact: PerceptionContactProfile;
}

export interface SoldierArchetypeDefinition {
  readonly id: string;
  readonly nameRu: string;
  readonly builtIn: boolean;
  readonly revision: number;
  readonly traits: SoldierTraits;
  readonly condition: SoldierCondition;
}

export interface WoundConditionProfile {
  readonly woundedMovementMultiplier: number;
  readonly severelyWoundedMovementMultiplier: number;
  readonly woundedAimMultiplier: number;
  readonly severelyWoundedAimMultiplier: number;
  readonly limbHitStressGain: number;
  readonly bodyHitStressGain: number;
}

export interface SuppressionConditionProfile {
  readonly gainMultiplier: number;
  readonly decayPerSecond: number;
  readonly stressMultiplier: number;
  readonly maximumSuppression: number;
}

export interface ConditionProfileDefinition {
  readonly id: string;
  readonly nameRu: string;
  readonly builtIn: boolean;
  readonly revision: number;
  readonly wound: WoundConditionProfile;
  readonly suppression: SuppressionConditionProfile;
}

export interface GameplayTuningBundleV1 {
  readonly formatVersion: typeof GAMEPLAY_TUNING_FORMAT_VERSION;
  readonly semanticRevision: number;
  readonly activePerceptionProfileId: string;
  readonly perceptionProfiles: readonly PerceptionProfileDefinition[];
  readonly soldierArchetypes: readonly SoldierArchetypeDefinition[];
  readonly conditionProfiles: readonly ConditionProfileDefinition[];
}

export class GameplayTuningRegistry {
  readonly formatVersion = GAMEPLAY_TUNING_FORMAT_VERSION;
  semanticRevision: number;
  private activePerceptionProfileId: string;
  private readonly perceptionProfiles = new Map<string, PerceptionProfileDefinition>();
  private readonly soldierArchetypes = new Map<string, SoldierArchetypeDefinition>();
  private readonly conditionProfiles = new Map<string, ConditionProfileDefinition>();

  constructor(bundle?: Partial<GameplayTuningBundleV1>) {
    const defaults = builtInBundle();
    this.semanticRevision = positiveInteger(bundle?.semanticRevision, defaults.semanticRevision);
    for (const profile of defaults.perceptionProfiles) this.perceptionProfiles.set(profile.id, profile);
    for (const profile of defaults.soldierArchetypes) this.soldierArchetypes.set(profile.id, profile);
    for (const profile of defaults.conditionProfiles) this.conditionProfiles.set(profile.id, profile);
    this.importProfiles(bundle?.perceptionProfiles, bundle?.soldierArchetypes, bundle?.conditionProfiles, false);
    const requestedActive = id(bundle?.activePerceptionProfileId);
    this.activePerceptionProfileId = requestedActive && this.perceptionProfiles.has(requestedActive)
      ? requestedActive
      : DEFAULT_PERCEPTION_PROFILE_ID;
  }

  listPerceptionProfiles(): readonly PerceptionProfileDefinition[] {
    return Object.freeze([...this.perceptionProfiles.values()].sort(profileSort));
  }

  listSoldierArchetypes(): readonly SoldierArchetypeDefinition[] {
    return Object.freeze([...this.soldierArchetypes.values()].sort(profileSort));
  }

  listConditionProfiles(): readonly ConditionProfileDefinition[] {
    return Object.freeze([...this.conditionProfiles.values()].sort(profileSort));
  }

  requirePerceptionProfile(profileId: string): PerceptionProfileDefinition {
    return this.perceptionProfiles.get(profileId)
      ?? this.perceptionProfiles.get(DEFAULT_PERCEPTION_PROFILE_ID)!;
  }

  requireSoldierArchetype(profileId: string): SoldierArchetypeDefinition {
    return this.soldierArchetypes.get(profileId)
      ?? this.soldierArchetypes.get(DEFAULT_SOLDIER_ARCHETYPE_ID)!;
  }

  requireConditionProfile(profileId: string): ConditionProfileDefinition {
    return this.conditionProfiles.get(profileId)
      ?? this.conditionProfiles.get(DEFAULT_CONDITION_PROFILE_ID)!;
  }

  getActivePerceptionProfileId(): string {
    return this.activePerceptionProfileId;
  }

  setActivePerceptionProfileId(profileId: string): boolean {
    if (!this.perceptionProfiles.has(profileId) || this.activePerceptionProfileId === profileId) return false;
    this.activePerceptionProfileId = profileId;
    this.semanticRevision += 1;
    return true;
  }

  replacePerceptionProfile(input: PerceptionProfileDefinition): PerceptionProfileDefinition {
    return this.replaceProfile(
      this.perceptionProfiles,
      normalizePerceptionProfile(input),
      BUILT_IN_PERCEPTION_PROFILES,
    );
  }

  replaceSoldierArchetype(input: SoldierArchetypeDefinition): SoldierArchetypeDefinition {
    return this.replaceProfile(
      this.soldierArchetypes,
      normalizeSoldierArchetype(input),
      BUILT_IN_SOLDIER_ARCHETYPES,
    );
  }

  replaceConditionProfile(input: ConditionProfileDefinition): ConditionProfileDefinition {
    return this.replaceProfile(
      this.conditionProfiles,
      normalizeConditionProfile(input),
      BUILT_IN_CONDITION_PROFILES,
    );
  }

  deletePerceptionProfile(profileId: string): boolean {
    if (BUILT_IN_PERCEPTION_PROFILES.has(profileId) || !this.perceptionProfiles.delete(profileId)) return false;
    if (this.activePerceptionProfileId === profileId) this.activePerceptionProfileId = DEFAULT_PERCEPTION_PROFILE_ID;
    this.semanticRevision += 1;
    return true;
  }

  deleteSoldierArchetype(profileId: string): boolean {
    return this.deleteCustomProfile(this.soldierArchetypes, profileId, BUILT_IN_SOLDIER_ARCHETYPES);
  }

  deleteConditionProfile(profileId: string): boolean {
    return this.deleteCustomProfile(this.conditionProfiles, profileId, BUILT_IN_CONDITION_PROFILES);
  }

  resetPerceptionProfile(profileId: string): PerceptionProfileDefinition | null {
    return this.resetBuiltIn(this.perceptionProfiles, profileId, BUILT_IN_PERCEPTION_PROFILES);
  }

  resetSoldierArchetype(profileId: string): SoldierArchetypeDefinition | null {
    return this.resetBuiltIn(this.soldierArchetypes, profileId, BUILT_IN_SOLDIER_ARCHETYPES);
  }

  resetConditionProfile(profileId: string): ConditionProfileDefinition | null {
    return this.resetBuiltIn(this.conditionProfiles, profileId, BUILT_IN_CONDITION_PROFILES);
  }

  exportBundle(): GameplayTuningBundleV1 {
    return deepFreeze({
      formatVersion: GAMEPLAY_TUNING_FORMAT_VERSION,
      semanticRevision: this.semanticRevision,
      activePerceptionProfileId: this.activePerceptionProfileId,
      perceptionProfiles: this.listPerceptionProfiles(),
      soldierArchetypes: this.listSoldierArchetypes(),
      conditionProfiles: this.listConditionProfiles(),
    });
  }

  private importProfiles(
    perceptionProfiles: readonly PerceptionProfileDefinition[] | undefined,
    soldierArchetypes: readonly SoldierArchetypeDefinition[] | undefined,
    conditionProfiles: readonly ConditionProfileDefinition[] | undefined,
    countRevision: boolean,
  ): void {
    for (const profile of perceptionProfiles ?? []) this.importOne(this.perceptionProfiles, normalizePerceptionProfile(profile), BUILT_IN_PERCEPTION_PROFILES);
    for (const profile of soldierArchetypes ?? []) this.importOne(this.soldierArchetypes, normalizeSoldierArchetype(profile), BUILT_IN_SOLDIER_ARCHETYPES);
    for (const profile of conditionProfiles ?? []) this.importOne(this.conditionProfiles, normalizeConditionProfile(profile), BUILT_IN_CONDITION_PROFILES);
    if (countRevision) this.semanticRevision += 1;
  }

  private importOne<T extends BaseProfile>(
    store: Map<string, T>,
    profile: T,
    builtIns: ReadonlyMap<string, T>,
  ): void {
    const builtIn = builtIns.get(profile.id);
    store.set(profile.id, deepFreeze({
      ...profile,
      builtIn: Boolean(builtIn),
      revision: positiveInteger(profile.revision, 1),
    }) as T);
  }

  private replaceProfile<T extends BaseProfile>(
    store: Map<string, T>,
    normalized: T,
    builtIns: ReadonlyMap<string, T>,
  ): T {
    const existing = store.get(normalized.id);
    const builtIn = builtIns.has(normalized.id);
    const candidate = deepFreeze({
      ...normalized,
      builtIn,
      revision: existing ? existing.revision + 1 : 1,
    }) as T;
    if (existing && semanticFingerprint(existing) === semanticFingerprint(candidate)) return existing;
    store.set(candidate.id, candidate);
    this.semanticRevision += 1;
    return candidate;
  }

  private deleteCustomProfile<T extends BaseProfile>(
    store: Map<string, T>,
    profileId: string,
    builtIns: ReadonlyMap<string, T>,
  ): boolean {
    if (builtIns.has(profileId) || !store.delete(profileId)) return false;
    this.semanticRevision += 1;
    return true;
  }

  private resetBuiltIn<T extends BaseProfile>(
    store: Map<string, T>,
    profileId: string,
    builtIns: ReadonlyMap<string, T>,
  ): T | null {
    const builtIn = builtIns.get(profileId);
    if (!builtIn) return null;
    const existing = store.get(profileId);
    if (existing && semanticFingerprint(existing) === semanticFingerprint(builtIn)) return existing;
    const reset = deepFreeze({ ...builtIn, revision: (existing?.revision ?? 0) + 1 }) as T;
    store.set(profileId, reset);
    this.semanticRevision += 1;
    return reset;
  }
}

interface BaseProfile {
  readonly id: string;
  readonly nameRu: string;
  readonly builtIn: boolean;
  readonly revision: number;
}

const BUILT_IN_PERCEPTION_PROFILES = new Map<string, PerceptionProfileDefinition>([
  [DEFAULT_PERCEPTION_PROFILE_ID, deepFreeze({
    id: DEFAULT_PERCEPTION_PROFILE_ID,
    nameRu: 'Стандартное восприятие',
    builtIn: true,
    revision: 1,
    contact: {
      confidenceEvidenceDivisor: 1.5,
      minimumUncertaintyCells: 0.25,
      initialUncertaintyCells: 6,
      uncertaintyEvidenceDivisor: 35,
      evidenceDecayPerSecond: 1.15,
      confidenceDecayPerSecond: 0.55,
      uncertaintyGrowthMetersPerSecond: 0.12,
      soundEvidenceMultiplier: 0.85,
      reportedEvidenceMultiplier: 1.1,
    },
  })],
]);

const ARCHETYPE_NAMES: Record<BehaviorProfileId, string> = {
  green: 'Необстрелянный',
  regular: 'Линейный пехотинец',
  veteran: 'Ветеран',
  cautious: 'Осторожный',
  reckless: 'Безрассудный',
};

const BUILT_IN_SOLDIER_ARCHETYPES = new Map<string, SoldierArchetypeDefinition>(
  (Object.keys(SOLDIER_PARAMETERS_BY_PROFILE) as BehaviorProfileId[]).map((profileId) => [
    profileId,
    deepFreeze({
      id: profileId,
      nameRu: ARCHETYPE_NAMES[profileId],
      builtIn: true,
      revision: 1,
      traits: SOLDIER_PARAMETERS_BY_PROFILE[profileId].traits,
      condition: SOLDIER_PARAMETERS_BY_PROFILE[profileId].condition,
    }),
  ]),
);

const BUILT_IN_CONDITION_PROFILES = new Map<string, ConditionProfileDefinition>([
  [DEFAULT_CONDITION_PROFILE_ID, deepFreeze({
    id: DEFAULT_CONDITION_PROFILE_ID,
    nameRu: 'Стандартные ранения и подавление',
    builtIn: true,
    revision: 1,
    wound: {
      woundedMovementMultiplier: 0.78,
      severelyWoundedMovementMultiplier: 0.42,
      woundedAimMultiplier: 0.82,
      severelyWoundedAimMultiplier: 0.52,
      limbHitStressGain: 28,
      bodyHitStressGain: 45,
    },
    suppression: {
      gainMultiplier: 1,
      decayPerSecond: 13,
      stressMultiplier: 1,
      maximumSuppression: 100,
    },
  })],
]);

let currentRegistry = createDefaultGameplayTuningRegistry();

export function createDefaultGameplayTuningRegistry(): GameplayTuningRegistry {
  return new GameplayTuningRegistry(builtInBundle());
}

export function getGameplayTuningRegistry(): GameplayTuningRegistry {
  return currentRegistry;
}

export function replaceGameplayTuningRegistry(registry: GameplayTuningRegistry): void {
  currentRegistry = registry;
}

export function getActivePerceptionProfileSnapshot(): PerceptionProfileDefinition {
  return currentRegistry.requirePerceptionProfile(currentRegistry.getActivePerceptionProfileId());
}

export function resolvePerceptionProfileSnapshot(profileId?: string | null): PerceptionProfileDefinition {
  return currentRegistry.requirePerceptionProfile(profileId ?? currentRegistry.getActivePerceptionProfileId());
}

export function resolveSoldierArchetypeSnapshot(profileId?: string | null): SoldierArchetypeDefinition {
  return currentRegistry.requireSoldierArchetype(profileId ?? DEFAULT_SOLDIER_ARCHETYPE_ID);
}

export function resolveConditionProfileSnapshot(profileId?: string | null): ConditionProfileDefinition {
  return currentRegistry.requireConditionProfile(profileId ?? DEFAULT_CONDITION_PROFILE_ID);
}

function builtInBundle(): GameplayTuningBundleV1 {
  return deepFreeze({
    formatVersion: GAMEPLAY_TUNING_FORMAT_VERSION,
    semanticRevision: 1,
    activePerceptionProfileId: DEFAULT_PERCEPTION_PROFILE_ID,
    perceptionProfiles: Object.freeze([...BUILT_IN_PERCEPTION_PROFILES.values()]),
    soldierArchetypes: Object.freeze([...BUILT_IN_SOLDIER_ARCHETYPES.values()]),
    conditionProfiles: Object.freeze([...BUILT_IN_CONDITION_PROFILES.values()]),
  });
}

function normalizePerceptionProfile(value: PerceptionProfileDefinition): PerceptionProfileDefinition {
  const fallback = BUILT_IN_PERCEPTION_PROFILES.get(DEFAULT_PERCEPTION_PROFILE_ID)!;
  const contact = value?.contact ?? fallback.contact;
  return deepFreeze({
    id: requiredId(value?.id, 'perception-profile'),
    nameRu: name(value?.nameRu, 'Профиль восприятия'),
    builtIn: Boolean(value?.builtIn),
    revision: positiveInteger(value?.revision, 1),
    contact: {
      confidenceEvidenceDivisor: number(contact.confidenceEvidenceDivisor, fallback.contact.confidenceEvidenceDivisor, 0.1, 10),
      minimumUncertaintyCells: number(contact.minimumUncertaintyCells, fallback.contact.minimumUncertaintyCells, 0.05, 20),
      initialUncertaintyCells: number(contact.initialUncertaintyCells, fallback.contact.initialUncertaintyCells, 0.05, 100),
      uncertaintyEvidenceDivisor: number(contact.uncertaintyEvidenceDivisor, fallback.contact.uncertaintyEvidenceDivisor, 0.1, 500),
      evidenceDecayPerSecond: number(contact.evidenceDecayPerSecond, fallback.contact.evidenceDecayPerSecond, 0, 50),
      confidenceDecayPerSecond: number(contact.confidenceDecayPerSecond, fallback.contact.confidenceDecayPerSecond, 0, 50),
      uncertaintyGrowthMetersPerSecond: number(contact.uncertaintyGrowthMetersPerSecond, fallback.contact.uncertaintyGrowthMetersPerSecond, 0, 20),
      soundEvidenceMultiplier: number(contact.soundEvidenceMultiplier, fallback.contact.soundEvidenceMultiplier, 0, 4),
      reportedEvidenceMultiplier: number(contact.reportedEvidenceMultiplier, fallback.contact.reportedEvidenceMultiplier, 0, 4),
    },
  });
}

function normalizeSoldierArchetype(value: SoldierArchetypeDefinition): SoldierArchetypeDefinition {
  const fallback = BUILT_IN_SOLDIER_ARCHETYPES.get(DEFAULT_SOLDIER_ARCHETYPE_ID)!;
  return deepFreeze({
    id: requiredId(value?.id, 'soldier-archetype'),
    nameRu: name(value?.nameRu, 'Архетип бойца'),
    builtIn: Boolean(value?.builtIn),
    revision: positiveInteger(value?.revision, 1),
    traits: normalizePercentRecord(value?.traits, fallback.traits),
    condition: normalizePercentRecord(value?.condition, fallback.condition),
  });
}

function normalizeConditionProfile(value: ConditionProfileDefinition): ConditionProfileDefinition {
  const fallback = BUILT_IN_CONDITION_PROFILES.get(DEFAULT_CONDITION_PROFILE_ID)!;
  const wound = value?.wound ?? fallback.wound;
  const suppression = value?.suppression ?? fallback.suppression;
  return deepFreeze({
    id: requiredId(value?.id, 'condition-profile'),
    nameRu: name(value?.nameRu, 'Профиль ранений и подавления'),
    builtIn: Boolean(value?.builtIn),
    revision: positiveInteger(value?.revision, 1),
    wound: {
      woundedMovementMultiplier: number(wound.woundedMovementMultiplier, fallback.wound.woundedMovementMultiplier, 0, 2),
      severelyWoundedMovementMultiplier: number(wound.severelyWoundedMovementMultiplier, fallback.wound.severelyWoundedMovementMultiplier, 0, 2),
      woundedAimMultiplier: number(wound.woundedAimMultiplier, fallback.wound.woundedAimMultiplier, 0, 2),
      severelyWoundedAimMultiplier: number(wound.severelyWoundedAimMultiplier, fallback.wound.severelyWoundedAimMultiplier, 0, 2),
      limbHitStressGain: number(wound.limbHitStressGain, fallback.wound.limbHitStressGain, 0, 100),
      bodyHitStressGain: number(wound.bodyHitStressGain, fallback.wound.bodyHitStressGain, 0, 100),
    },
    suppression: {
      gainMultiplier: number(suppression.gainMultiplier, fallback.suppression.gainMultiplier, 0, 4),
      decayPerSecond: number(suppression.decayPerSecond, fallback.suppression.decayPerSecond, 0, 100),
      stressMultiplier: number(suppression.stressMultiplier, fallback.suppression.stressMultiplier, 0, 4),
      maximumSuppression: number(suppression.maximumSuppression, fallback.suppression.maximumSuppression, 0, 100),
    },
  });
}

function normalizePercentRecord<T extends Record<string, number>>(value: T | undefined, fallback: T): T {
  const normalized: Record<string, number> = {};
  for (const key of Object.keys(fallback)) normalized[key] = number(value?.[key], fallback[key]!, 0, 100);
  return deepFreeze(normalized) as T;
}

function semanticFingerprint(profile: BaseProfile): string {
  const { revision: _revision, builtIn: _builtIn, ...semantic } = profile;
  return JSON.stringify(semantic);
}

function profileSort<T extends BaseProfile>(left: T, right: T): number {
  return Number(right.builtIn) - Number(left.builtIn)
    || left.nameRu.localeCompare(right.nameRu, 'ru')
    || left.id.localeCompare(right.id);
}

function requiredId(value: unknown, fallback: string): string {
  const normalized = id(value);
  return normalized ?? fallback;
}

function id(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized.length > 0 ? normalized : null;
}

function name(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim().slice(0, 120) : fallback;
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(1, Math.round(value))
    : fallback;
}

function number(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const normalized = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(minimum, Math.min(maximum, normalized));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}
