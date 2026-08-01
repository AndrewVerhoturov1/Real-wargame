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
  readonly perceptionProfileId: string;
  readonly conditionProfileId: string;
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

interface BaseProfile {
  readonly id: string;
  readonly nameRu: string;
  readonly builtIn: boolean;
  readonly revision: number;
}

export class GameplayTuningRegistry {
  readonly formatVersion = GAMEPLAY_TUNING_FORMAT_VERSION;
  semanticRevision: number;
  private activePerceptionProfileId: string;
  private readonly perceptionProfiles = new Map<string, PerceptionProfileDefinition>();
  private readonly soldierArchetypes = new Map<string, SoldierArchetypeDefinition>();
  private readonly conditionProfiles = new Map<string, ConditionProfileDefinition>();

  constructor(bundle?: Partial<GameplayTuningBundleV1>) {
    this.semanticRevision = positiveInteger(bundle?.semanticRevision, 1);
    for (const profile of BUILT_IN_PERCEPTION_PROFILES.values()) this.perceptionProfiles.set(profile.id, profile);
    for (const profile of BUILT_IN_CONDITION_PROFILES.values()) this.conditionProfiles.set(profile.id, profile);
    for (const profile of BUILT_IN_SOLDIER_ARCHETYPES.values()) this.soldierArchetypes.set(profile.id, profile);

    for (const profile of bundle?.perceptionProfiles ?? []) this.importPerceptionProfile(profile);
    for (const profile of bundle?.conditionProfiles ?? []) this.importConditionProfile(profile);
    for (const profile of bundle?.soldierArchetypes ?? []) this.importSoldierArchetype(profile);

    const requestedActive = normalizeId(bundle?.activePerceptionProfileId);
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
    const profileId = requiredId(input?.id, 'perception-profile');
    const builtIn = BUILT_IN_PERCEPTION_PROFILES.get(profileId);
    if (builtIn) return this.requirePerceptionProfile(profileId);
    return this.replaceCustomProfile(
      this.perceptionProfiles,
      normalizePerceptionProfile({ ...input, id: profileId, builtIn: false }),
    );
  }

  replaceSoldierArchetype(input: SoldierArchetypeDefinition): SoldierArchetypeDefinition {
    const profileId = requiredId(input?.id, 'soldier-archetype');
    const builtIn = BUILT_IN_SOLDIER_ARCHETYPES.get(profileId);
    if (builtIn) return this.requireSoldierArchetype(profileId);
    return this.replaceCustomProfile(
      this.soldierArchetypes,
      this.normalizeSoldierArchetype({ ...input, id: profileId, builtIn: false }),
    );
  }

  replaceConditionProfile(input: ConditionProfileDefinition): ConditionProfileDefinition {
    const profileId = requiredId(input?.id, 'condition-profile');
    const builtIn = BUILT_IN_CONDITION_PROFILES.get(profileId);
    if (builtIn) return this.requireConditionProfile(profileId);
    return this.replaceCustomProfile(
      this.conditionProfiles,
      normalizeConditionProfile({ ...input, id: profileId, builtIn: false }),
    );
  }

  deletePerceptionProfile(profileId: string): boolean {
    if (!this.deleteCustomProfile(this.perceptionProfiles, profileId, BUILT_IN_PERCEPTION_PROFILES)) return false;
    if (this.activePerceptionProfileId === profileId) this.activePerceptionProfileId = DEFAULT_PERCEPTION_PROFILE_ID;
    this.repairArchetypeReferences();
    return true;
  }

  deleteSoldierArchetype(profileId: string): boolean {
    return this.deleteCustomProfile(this.soldierArchetypes, profileId, BUILT_IN_SOLDIER_ARCHETYPES);
  }

  deleteConditionProfile(profileId: string): boolean {
    if (!this.deleteCustomProfile(this.conditionProfiles, profileId, BUILT_IN_CONDITION_PROFILES)) return false;
    this.repairArchetypeReferences();
    return true;
  }

  resetPerceptionProfile(profileId: string): PerceptionProfileDefinition | null {
    return BUILT_IN_PERCEPTION_PROFILES.get(profileId) ?? null;
  }

  resetSoldierArchetype(profileId: string): SoldierArchetypeDefinition | null {
    return BUILT_IN_SOLDIER_ARCHETYPES.get(profileId) ?? null;
  }

  resetConditionProfile(profileId: string): ConditionProfileDefinition | null {
    return BUILT_IN_CONDITION_PROFILES.get(profileId) ?? null;
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

  private importPerceptionProfile(input: PerceptionProfileDefinition): void {
    const profileId = requiredId(input?.id, 'perception-profile');
    if (BUILT_IN_PERCEPTION_PROFILES.has(profileId)) return;
    const normalized = normalizePerceptionProfile({ ...input, id: profileId, builtIn: false });
    this.perceptionProfiles.set(profileId, normalized);
  }

  private importConditionProfile(input: ConditionProfileDefinition): void {
    const profileId = requiredId(input?.id, 'condition-profile');
    if (BUILT_IN_CONDITION_PROFILES.has(profileId)) return;
    const normalized = normalizeConditionProfile({ ...input, id: profileId, builtIn: false });
    this.conditionProfiles.set(profileId, normalized);
  }

  private importSoldierArchetype(input: SoldierArchetypeDefinition): void {
    const profileId = requiredId(input?.id, 'soldier-archetype');
    if (BUILT_IN_SOLDIER_ARCHETYPES.has(profileId)) return;
    const normalized = this.normalizeSoldierArchetype({ ...input, id: profileId, builtIn: false });
    this.soldierArchetypes.set(profileId, normalized);
  }

  private normalizeSoldierArchetype(input: SoldierArchetypeDefinition): SoldierArchetypeDefinition {
    const fallback = BUILT_IN_SOLDIER_ARCHETYPES.get(DEFAULT_SOLDIER_ARCHETYPE_ID)!;
    const requestedPerceptionProfileId = normalizeId(input?.perceptionProfileId);
    const requestedConditionProfileId = normalizeId(input?.conditionProfileId);
    return deepFreeze({
      id: requiredId(input?.id, 'soldier-archetype'),
      nameRu: normalizeName(input?.nameRu, 'Архетип бойца'),
      builtIn: false,
      revision: positiveInteger(input?.revision, 1),
      perceptionProfileId: requestedPerceptionProfileId && this.perceptionProfiles.has(requestedPerceptionProfileId)
        ? requestedPerceptionProfileId
        : DEFAULT_PERCEPTION_PROFILE_ID,
      conditionProfileId: requestedConditionProfileId && this.conditionProfiles.has(requestedConditionProfileId)
        ? requestedConditionProfileId
        : DEFAULT_CONDITION_PROFILE_ID,
      traits: normalizePercentRecord(input?.traits, fallback.traits),
      condition: normalizePercentRecord(input?.condition, fallback.condition),
    });
  }

  private replaceCustomProfile<T extends BaseProfile>(store: Map<string, T>, normalized: T): T {
    const existing = store.get(normalized.id);
    const candidate = deepFreeze({
      ...normalized,
      builtIn: false,
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

  private repairArchetypeReferences(): void {
    for (const archetype of this.soldierArchetypes.values()) {
      if (archetype.builtIn) continue;
      const repaired = this.normalizeSoldierArchetype(archetype);
      if (semanticFingerprint(repaired) === semanticFingerprint(archetype)) continue;
      this.soldierArchetypes.set(archetype.id, deepFreeze({
        ...repaired,
        revision: archetype.revision + 1,
      }));
    }
  }
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
      perceptionProfileId: DEFAULT_PERCEPTION_PROFILE_ID,
      conditionProfileId: DEFAULT_CONDITION_PROFILE_ID,
      traits: SOLDIER_PARAMETERS_BY_PROFILE[profileId].traits,
      condition: SOLDIER_PARAMETERS_BY_PROFILE[profileId].condition,
    }),
  ]),
);

let currentRegistry = createDefaultGameplayTuningRegistry();

export function createDefaultGameplayTuningRegistry(): GameplayTuningRegistry {
  return new GameplayTuningRegistry();
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

function normalizePerceptionProfile(input: PerceptionProfileDefinition): PerceptionProfileDefinition {
  const fallback = BUILT_IN_PERCEPTION_PROFILES.get(DEFAULT_PERCEPTION_PROFILE_ID)!;
  const contact = input?.contact ?? fallback.contact;
  return deepFreeze({
    id: requiredId(input?.id, 'perception-profile'),
    nameRu: normalizeName(input?.nameRu, 'Профиль восприятия'),
    builtIn: false,
    revision: positiveInteger(input?.revision, 1),
    contact: {
      confidenceEvidenceDivisor: finiteNumber(contact.confidenceEvidenceDivisor, fallback.contact.confidenceEvidenceDivisor, 0.1, 10),
      minimumUncertaintyCells: finiteNumber(contact.minimumUncertaintyCells, fallback.contact.minimumUncertaintyCells, 0.05, 20),
      initialUncertaintyCells: finiteNumber(contact.initialUncertaintyCells, fallback.contact.initialUncertaintyCells, 0.05, 100),
      uncertaintyEvidenceDivisor: finiteNumber(contact.uncertaintyEvidenceDivisor, fallback.contact.uncertaintyEvidenceDivisor, 0.1, 500),
      evidenceDecayPerSecond: finiteNumber(contact.evidenceDecayPerSecond, fallback.contact.evidenceDecayPerSecond, 0, 50),
      confidenceDecayPerSecond: finiteNumber(contact.confidenceDecayPerSecond, fallback.contact.confidenceDecayPerSecond, 0, 50),
      uncertaintyGrowthMetersPerSecond: finiteNumber(contact.uncertaintyGrowthMetersPerSecond, fallback.contact.uncertaintyGrowthMetersPerSecond, 0, 20),
      soundEvidenceMultiplier: finiteNumber(contact.soundEvidenceMultiplier, fallback.contact.soundEvidenceMultiplier, 0, 4),
      reportedEvidenceMultiplier: finiteNumber(contact.reportedEvidenceMultiplier, fallback.contact.reportedEvidenceMultiplier, 0, 4),
    },
  });
}

function normalizeConditionProfile(input: ConditionProfileDefinition): ConditionProfileDefinition {
  const fallback = BUILT_IN_CONDITION_PROFILES.get(DEFAULT_CONDITION_PROFILE_ID)!;
  const wound = input?.wound ?? fallback.wound;
  const suppression = input?.suppression ?? fallback.suppression;
  return deepFreeze({
    id: requiredId(input?.id, 'condition-profile'),
    nameRu: normalizeName(input?.nameRu, 'Профиль ранений и подавления'),
    builtIn: false,
    revision: positiveInteger(input?.revision, 1),
    wound: {
      woundedMovementMultiplier: finiteNumber(wound.woundedMovementMultiplier, fallback.wound.woundedMovementMultiplier, 0, 1),
      severelyWoundedMovementMultiplier: finiteNumber(wound.severelyWoundedMovementMultiplier, fallback.wound.severelyWoundedMovementMultiplier, 0, 1),
      woundedAimMultiplier: finiteNumber(wound.woundedAimMultiplier, fallback.wound.woundedAimMultiplier, 0, 1),
      severelyWoundedAimMultiplier: finiteNumber(wound.severelyWoundedAimMultiplier, fallback.wound.severelyWoundedAimMultiplier, 0, 1),
      limbHitStressGain: finiteNumber(wound.limbHitStressGain, fallback.wound.limbHitStressGain, 0, 100),
      bodyHitStressGain: finiteNumber(wound.bodyHitStressGain, fallback.wound.bodyHitStressGain, 0, 100),
    },
    suppression: {
      gainMultiplier: finiteNumber(suppression.gainMultiplier, fallback.suppression.gainMultiplier, 0, 4),
      decayPerSecond: finiteNumber(suppression.decayPerSecond, fallback.suppression.decayPerSecond, 0, 100),
      stressMultiplier: finiteNumber(suppression.stressMultiplier, fallback.suppression.stressMultiplier, 0, 4),
      maximumSuppression: finiteNumber(suppression.maximumSuppression, fallback.suppression.maximumSuppression, 0, 100),
    },
  });
}

function normalizePercentRecord<T extends object>(value: T | undefined, fallback: T): T {
  const normalized: T = { ...fallback };
  for (const key of Object.keys(fallback) as Array<keyof T>) {
    const fallbackValue = fallback[key];
    if (typeof fallbackValue !== 'number') continue;
    normalized[key] = finiteNumber(value?.[key], fallbackValue, 0, 100) as T[keyof T];
  }
  return deepFreeze(normalized);
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
  return normalizeId(value) ?? fallback;
}

function normalizeId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized.length > 0 ? normalized : null;
}

function normalizeName(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim().slice(0, 120)
    : fallback;
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(1, Math.round(value))
    : fallback;
}

function finiteNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
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
