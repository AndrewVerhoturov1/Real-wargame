export const NAVIGATION_PROFILE_FORMAT_VERSION = 2 as const;

export const BUILT_IN_NAVIGATION_PROFILE_IDS = [
  'normal',
  'fast',
  'stealth',
  'attack',
  'cautious',
  'retreat',
  'direct',
] as const;

export type BuiltInNavigationProfileId = typeof BUILT_IN_NAVIGATION_PROFILE_IDS[number];
export type NavigationProfileId = string;
export type NavigationMovementMode = BuiltInNavigationProfileId;
export type NavigationTerrainCostKey =
  | 'road'
  | 'field'
  | 'sparseForest'
  | 'denseForest'
  | 'rough'
  | 'swamp'
  | 'bridge'
  | 'ditch';

export interface NavigationTerrainCosts {
  road: number;
  field: number;
  sparseForest: number;
  denseForest: number;
  rough: number;
  swamp: number;
  bridge: number;
  ditch: number;
}

export interface NavigationTerritoryWeights {
  friendly: number;
  neutral: number;
  enemy: number;
}

export interface NavigationDirectionalTerrainWeights {
  forwardSlopePenalty: number;
  reverseSlopePreference: number;
  crestPenalty: number;
  silhouettePenalty: number;
  valleyPreference: number;
  criticalSectorMultiplier: number;
}

export interface NavigationReplanRules {
  replanOnBlocked: boolean;
  replanOnProfileChange: boolean;
  replanOnDangerChange: boolean;
  minimumCostImprovement: number;
  minimumDangerRevisionInterval: number;
  replanCooldownSeconds: number;
}

export interface NavigationProfile {
  id: NavigationProfileId;
  nameEn: string;
  nameRu: string;
  descriptionEn: string;
  descriptionRu: string;
  terrainCosts: NavigationTerrainCosts;
  slopeWeight: number;
  dangerWeight: number;
  exposureWeight: number;
  coverWeight: number;
  enemyDistanceWeight: number;
  territoryWeights: NavigationTerritoryWeights;
  directionalTerrain: NavigationDirectionalTerrainWeights;
  maximumDetourRatio: number;
  maximumRouteCost: number | null;
  allowGoalAdjustment: boolean;
  replanRules: NavigationReplanRules;
  revision: number;
  builtIn: boolean;
}

export interface NavigationProfileRegistryData {
  formatVersion: typeof NAVIGATION_PROFILE_FORMAT_VERSION;
  revision: number;
  profiles: NavigationProfile[];
}

const BASE_TERRAIN_COSTS: NavigationTerrainCosts = {
  road: 0.8,
  field: 1,
  sparseForest: 1.25,
  denseForest: 1.45,
  rough: 1.3,
  swamp: 1.8,
  bridge: 0.9,
  ditch: 1.2,
};

const BASE_DIRECTIONAL_TERRAIN: NavigationDirectionalTerrainWeights = {
  forwardSlopePenalty: 0.25,
  reverseSlopePreference: 0.08,
  crestPenalty: 0.2,
  silhouettePenalty: 0.15,
  valleyPreference: 0.05,
  criticalSectorMultiplier: 0.35,
};

const BASE_REPLAN_RULES: NavigationReplanRules = {
  replanOnBlocked: true,
  replanOnProfileChange: true,
  replanOnDangerChange: true,
  minimumCostImprovement: 0.15,
  minimumDangerRevisionInterval: 2,
  replanCooldownSeconds: 2,
};

const BUILT_IN_PROFILES: ReadonlyArray<NavigationProfile> = [
  profile('normal', 'Normal', 'Обычный', 'Balanced movement for routine orders.', 'Сбалансированный маршрут для обычного движения.', {}, {
    slopeWeight: 0.15,
    dangerWeight: 0.45,
    coverWeight: 0.08,
    directionalTerrain: { ...BASE_DIRECTIONAL_TERRAIN },
    maximumDetourRatio: 1.3,
  }),
  profile('fast', 'Fast', 'Быстрый', 'Prioritizes a short, quick route.', 'Предпочитает короткий и быстрый путь.', {
    road: 0.72,
    field: 0.92,
    sparseForest: 1.3,
    denseForest: 1.62,
    rough: 1.42,
    swamp: 2.1,
    ditch: 1.35,
  }, {
    slopeWeight: 0.2,
    dangerWeight: 0.18,
    coverWeight: 0,
    directionalTerrain: {
      forwardSlopePenalty: 0.08,
      reverseSlopePreference: 0.02,
      crestPenalty: 0.12,
      silhouettePenalty: 0.08,
      valleyPreference: 0,
      criticalSectorMultiplier: 0.15,
    },
    maximumDetourRatio: 1.08,
    replanRules: { ...BASE_REPLAN_RULES, minimumCostImprovement: 0.2, replanCooldownSeconds: 1.5 },
  }),
  profile('stealth', 'Stealth', 'Скрытный', 'Uses concealment and avoids open known danger when the detour is reasonable.', 'Использует маскировку и обходит известную опасность, если обход разумен.', {
    road: 1.35,
    field: 1.58,
    sparseForest: 0.82,
    denseForest: 0.92,
    rough: 1.02,
    swamp: 1.8,
    bridge: 1.15,
    ditch: 0.88,
  }, {
    slopeWeight: 0.14,
    dangerWeight: 1.35,
    exposureWeight: 1.6,
    coverWeight: 0.42,
    directionalTerrain: {
      forwardSlopePenalty: 1.15,
      reverseSlopePreference: 0.55,
      crestPenalty: 1.1,
      silhouettePenalty: 0.9,
      valleyPreference: 0.35,
      criticalSectorMultiplier: 0.65,
    },
    maximumDetourRatio: 1.6,
  }),
  profile('attack', 'Attack', 'Атака', 'Advances decisively while still considering known danger and cover.', 'Продвигается решительно, но учитывает известную опасность и укрытия.', {
    road: 0.92,
    field: 1,
    sparseForest: 1.02,
    denseForest: 1.2,
    rough: 1.16,
    swamp: 1.9,
    bridge: 0.96,
    ditch: 1.05,
  }, {
    slopeWeight: 0.16,
    dangerWeight: 0.7,
    exposureWeight: 0.7,
    coverWeight: 0.16,
    enemyDistanceWeight: -0.08,
    directionalTerrain: {
      forwardSlopePenalty: 0.45,
      reverseSlopePreference: 0.18,
      crestPenalty: 0.45,
      silhouettePenalty: 0.35,
      valleyPreference: 0.12,
      criticalSectorMultiplier: 0.35,
    },
    maximumDetourRatio: 1.25,
  }),
  profile('cautious', 'Cautious', 'Осторожный', 'Prefers safer and better covered approaches.', 'Предпочитает более безопасные и укрытые подходы.', {
    road: 1.02,
    field: 1.28,
    sparseForest: 0.95,
    denseForest: 1.02,
    rough: 1.12,
    swamp: 1.95,
    bridge: 1.05,
    ditch: 0.95,
  }, {
    slopeWeight: 0.16,
    dangerWeight: 1.65,
    exposureWeight: 1.45,
    coverWeight: 0.32,
    directionalTerrain: {
      forwardSlopePenalty: 0.85,
      reverseSlopePreference: 0.4,
      crestPenalty: 0.8,
      silhouettePenalty: 0.65,
      valleyPreference: 0.25,
      criticalSectorMultiplier: 0.55,
    },
    maximumDetourRatio: 1.5,
  }),
  profile('retreat', 'Retreat', 'Отступление', 'Strongly avoids known danger while keeping the escape route bounded.', 'Сильно избегает известной опасности, но ограничивает длину отхода.', {
    road: 0.78,
    field: 1.08,
    sparseForest: 0.9,
    denseForest: 1.02,
    rough: 1.14,
    swamp: 2.2,
    bridge: 0.9,
    ditch: 1,
  }, {
    slopeWeight: 0.18,
    dangerWeight: 2.4,
    exposureWeight: 1.8,
    coverWeight: 0.26,
    enemyDistanceWeight: 0.4,
    directionalTerrain: {
      forwardSlopePenalty: 1.4,
      reverseSlopePreference: 0.65,
      crestPenalty: 1.15,
      silhouettePenalty: 0.9,
      valleyPreference: 0.4,
      criticalSectorMultiplier: 0.8,
    },
    maximumDetourRatio: 1.45,
    replanRules: { ...BASE_REPLAN_RULES, minimumCostImprovement: 0.12, minimumDangerRevisionInterval: 1 },
  }),
  profile('direct', 'Direct route', 'Прямой маршрут', 'Diagnostic shortest passable route without tactical preferences.', 'Диагностический кратчайший проходимый маршрут без тактических предпочтений.', {
    road: 1,
    field: 1,
    sparseForest: 1,
    denseForest: 1,
    rough: 1,
    swamp: 1,
    bridge: 1,
    ditch: 1,
  }, {
    slopeWeight: 0,
    dangerWeight: 0,
    exposureWeight: 0,
    coverWeight: 0,
    enemyDistanceWeight: 0,
    directionalTerrain: {
      forwardSlopePenalty: 0,
      reverseSlopePreference: 0,
      crestPenalty: 0,
      silhouettePenalty: 0,
      valleyPreference: 0,
      criticalSectorMultiplier: 0,
    },
    maximumDetourRatio: 1,
    replanRules: { ...BASE_REPLAN_RULES, replanOnDangerChange: false, minimumCostImprovement: 0 },
  }),
];

export class NavigationProfileRegistry {
  readonly formatVersion = NAVIGATION_PROFILE_FORMAT_VERSION;
  private registryRevision: number;
  private readonly profiles = new Map<string, NavigationProfile>();

  constructor(data?: Partial<NavigationProfileRegistryData>) {
    const normalized = normalizeRegistryData(data);
    this.registryRevision = normalized.revision;
    for (const item of normalized.profiles) this.profiles.set(item.id, cloneProfile(item));
  }

  get revision(): number {
    return this.registryRevision;
  }

  listProfiles(): NavigationProfile[] {
    const builtIns = BUILT_IN_NAVIGATION_PROFILE_IDS
      .map((id) => this.profiles.get(id))
      .filter((item): item is NavigationProfile => Boolean(item));
    const custom = [...this.profiles.values()]
      .filter((item) => !item.builtIn)
      .sort((left, right) => left.nameRu.localeCompare(right.nameRu) || left.id.localeCompare(right.id));
    return [...builtIns, ...custom].map(cloneProfile);
  }

  hasProfile(id: string): boolean {
    return this.profiles.has(id);
  }

  getProfile(id: string): NavigationProfile {
    const value = this.profiles.get(id) ?? this.profiles.get('normal');
    if (!value) throw new Error('Navigation profile registry is missing the normal profile.');
    return cloneProfile(value);
  }

  createCustomProfile(id: string, nameEn: string, nameRu: string, sourceId = 'normal'): NavigationProfile {
    const normalizedId = normalizeCustomId(id);
    if (this.profiles.has(normalizedId)) throw new Error(`Navigation profile already exists: ${normalizedId}`);
    const source = this.getProfile(sourceId);
    const created: NavigationProfile = {
      ...source,
      id: normalizedId,
      nameEn: cleanText(nameEn, normalizedId),
      nameRu: cleanText(nameRu, nameEn || normalizedId),
      descriptionEn: `Custom profile based on ${source.nameEn}.`,
      descriptionRu: `Пользовательский профиль на основе «${source.nameRu}».`,
      builtIn: false,
      revision: 1,
    };
    this.profiles.set(created.id, created);
    this.touchRegistry();
    return cloneProfile(created);
  }

  copyProfile(sourceId: string, id: string, nameEn: string, nameRu: string): NavigationProfile {
    return this.createCustomProfile(id, nameEn, nameRu, sourceId);
  }

  updateProfile(id: string, changes: Partial<Omit<NavigationProfile, 'id' | 'builtIn' | 'revision'>>): NavigationProfile {
    const current = this.requireProfile(id);
    const updated = normalizeProfile({
      ...current,
      ...changes,
      id: current.id,
      builtIn: current.builtIn,
      revision: current.revision + 1,
      terrainCosts: changes.terrainCosts ?? current.terrainCosts,
      territoryWeights: changes.territoryWeights ?? current.territoryWeights,
      directionalTerrain: changes.directionalTerrain ?? current.directionalTerrain,
      replanRules: changes.replanRules ?? current.replanRules,
    }, current);
    this.profiles.set(id, updated);
    this.touchRegistry();
    return cloneProfile(updated);
  }

  renameProfile(id: string, nameEn: string, nameRu: string): NavigationProfile {
    return this.updateProfile(id, {
      nameEn: cleanText(nameEn, id),
      nameRu: cleanText(nameRu, nameEn || id),
    });
  }

  resetProfile(id: string): NavigationProfile {
    const current = this.requireProfile(id);
    if (current.builtIn) {
      const defaults = getBuiltInNavigationProfile(id as BuiltInNavigationProfileId);
      const reset = { ...defaults, revision: current.revision + 1 };
      this.profiles.set(id, reset);
      this.touchRegistry();
      return cloneProfile(reset);
    }
    const normal = this.getProfile('normal');
    const reset = normalizeProfile({
      ...normal,
      id: current.id,
      nameEn: current.nameEn,
      nameRu: current.nameRu,
      descriptionEn: current.descriptionEn,
      descriptionRu: current.descriptionRu,
      builtIn: false,
      revision: current.revision + 1,
    }, current);
    this.profiles.set(id, reset);
    this.touchRegistry();
    return cloneProfile(reset);
  }

  deleteProfile(id: string): boolean {
    const current = this.profiles.get(id);
    if (!current || current.builtIn) return false;
    const deleted = this.profiles.delete(id);
    if (deleted) this.touchRegistry();
    return deleted;
  }

  toData(): NavigationProfileRegistryData {
    return {
      formatVersion: NAVIGATION_PROFILE_FORMAT_VERSION,
      revision: this.registryRevision,
      profiles: this.listProfiles(),
    };
  }

  exportJson(): string {
    return JSON.stringify(this.toData(), null, 2);
  }

  static importJson(json: string): NavigationProfileRegistry {
    return NavigationProfileRegistry.fromUnknown(JSON.parse(json) as unknown);
  }

  static fromUnknown(value: unknown): NavigationProfileRegistry {
    return new NavigationProfileRegistry(migrateRegistryData(value));
  }

  private requireProfile(id: string): NavigationProfile {
    const current = this.profiles.get(id);
    if (!current) throw new Error(`Unknown navigation profile: ${id}`);
    return current;
  }

  private touchRegistry(): void {
    this.registryRevision += 1;
  }
}

export function createDefaultNavigationProfileRegistry(): NavigationProfileRegistry {
  return new NavigationProfileRegistry();
}

export function getBuiltInNavigationProfile(id: BuiltInNavigationProfileId): NavigationProfile {
  const found = BUILT_IN_PROFILES.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown built-in navigation profile: ${id}`);
  return cloneProfile(found);
}

export function isBuiltInNavigationProfileId(value: unknown): value is BuiltInNavigationProfileId {
  return typeof value === 'string' && (BUILT_IN_NAVIGATION_PROFILE_IDS as readonly string[]).includes(value);
}

function profile(
  id: BuiltInNavigationProfileId,
  nameEn: string,
  nameRu: string,
  descriptionEn: string,
  descriptionRu: string,
  terrainOverrides: Partial<NavigationTerrainCosts>,
  overrides: Partial<Omit<NavigationProfile, 'id' | 'nameEn' | 'nameRu' | 'descriptionEn' | 'descriptionRu' | 'terrainCosts' | 'builtIn' | 'revision'>>,
): NavigationProfile {
  return {
    id,
    nameEn,
    nameRu,
    descriptionEn,
    descriptionRu,
    terrainCosts: { ...BASE_TERRAIN_COSTS, ...terrainOverrides },
    slopeWeight: overrides.slopeWeight ?? 0.15,
    dangerWeight: overrides.dangerWeight ?? 0,
    exposureWeight: overrides.exposureWeight ?? 0,
    coverWeight: overrides.coverWeight ?? 0,
    enemyDistanceWeight: overrides.enemyDistanceWeight ?? 0,
    territoryWeights: overrides.territoryWeights ?? { friendly: 0, neutral: 0, enemy: 0 },
    directionalTerrain: overrides.directionalTerrain ?? { ...BASE_DIRECTIONAL_TERRAIN },
    maximumDetourRatio: overrides.maximumDetourRatio ?? 1.3,
    maximumRouteCost: overrides.maximumRouteCost ?? null,
    allowGoalAdjustment: overrides.allowGoalAdjustment ?? true,
    replanRules: overrides.replanRules ?? { ...BASE_REPLAN_RULES },
    revision: 1,
    builtIn: true,
  };
}

function normalizeRegistryData(data?: Partial<NavigationProfileRegistryData>): NavigationProfileRegistryData {
  const incoming = Array.isArray(data?.profiles) ? data.profiles : [];
  const incomingById = new Map(incoming.map((item) => [String(item.id), item]));
  const profiles: NavigationProfile[] = BUILT_IN_PROFILES.map((defaults) => {
    const candidate = incomingById.get(defaults.id);
    incomingById.delete(defaults.id);
    return candidate
      ? normalizeProfile({ ...candidate, id: defaults.id, builtIn: true }, defaults)
      : cloneProfile(defaults);
  });
  for (const candidate of incomingById.values()) {
    const fallback = BUILT_IN_PROFILES[0];
    profiles.push(normalizeProfile({ ...candidate, builtIn: false }, fallback));
  }
  return {
    formatVersion: NAVIGATION_PROFILE_FORMAT_VERSION,
    revision: positiveInteger(data?.revision, 1),
    profiles,
  };
}

function migrateRegistryData(value: unknown): Partial<NavigationProfileRegistryData> {
  if (!isRecord(value)) return {};
  const rawProfiles = Array.isArray(value.profiles) ? value.profiles : [];
  const profiles = rawProfiles
    .filter(isRecord)
    .map((raw) => {
      const id = normalizeCustomId(String(raw.id ?? 'custom'));
      const legacyName = cleanText(raw.name, id);
      return {
        ...raw,
        id,
        nameEn: cleanText(raw.nameEn, legacyName),
        nameRu: cleanText(raw.nameRu, legacyName),
        descriptionEn: cleanText(raw.descriptionEn, 'Migrated navigation profile.'),
        descriptionRu: cleanText(raw.descriptionRu, 'Перенесённый профиль маршрута.'),
        builtIn: isBuiltInNavigationProfileId(id),
      } as unknown as NavigationProfile;
    });
  return {
    formatVersion: NAVIGATION_PROFILE_FORMAT_VERSION,
    revision: positiveInteger(value.revision, 1),
    profiles,
  };
}

function normalizeProfile(value: Partial<NavigationProfile>, fallback: NavigationProfile): NavigationProfile {
  const terrain = (isRecord(value.terrainCosts) ? value.terrainCosts : {}) as unknown as Record<string, unknown>;
  const territory = (isRecord(value.territoryWeights) ? value.territoryWeights : {}) as unknown as Record<string, unknown>;
  const directional = (isRecord(value.directionalTerrain) ? value.directionalTerrain : {}) as unknown as Record<string, unknown>;
  const replan = (isRecord(value.replanRules) ? value.replanRules : {}) as unknown as Record<string, unknown>;
  const id = cleanText(value.id, fallback.id);
  return {
    id,
    nameEn: cleanText(value.nameEn, fallback.nameEn),
    nameRu: cleanText(value.nameRu, fallback.nameRu),
    descriptionEn: cleanText(value.descriptionEn, fallback.descriptionEn),
    descriptionRu: cleanText(value.descriptionRu, fallback.descriptionRu),
    terrainCosts: {
      road: boundedNumber(terrain.road, fallback.terrainCosts.road, 0.1, 10),
      field: boundedNumber(terrain.field, fallback.terrainCosts.field, 0.1, 10),
      sparseForest: boundedNumber(terrain.sparseForest, fallback.terrainCosts.sparseForest, 0.1, 10),
      denseForest: boundedNumber(terrain.denseForest, fallback.terrainCosts.denseForest, 0.1, 10),
      rough: boundedNumber(terrain.rough, fallback.terrainCosts.rough, 0.1, 10),
      swamp: boundedNumber(terrain.swamp, fallback.terrainCosts.swamp, 0.1, 10),
      bridge: boundedNumber(terrain.bridge, fallback.terrainCosts.bridge, 0.1, 10),
      ditch: boundedNumber(terrain.ditch, fallback.terrainCosts.ditch, 0.1, 10),
    },
    slopeWeight: boundedNumber(value.slopeWeight, fallback.slopeWeight, 0, 10),
    dangerWeight: boundedNumber(value.dangerWeight, fallback.dangerWeight, 0, 10),
    exposureWeight: boundedNumber(value.exposureWeight, fallback.exposureWeight, 0, 10),
    coverWeight: boundedNumber(value.coverWeight, fallback.coverWeight, -10, 10),
    enemyDistanceWeight: boundedNumber(value.enemyDistanceWeight, fallback.enemyDistanceWeight, -10, 10),
    territoryWeights: {
      friendly: boundedNumber(territory.friendly, fallback.territoryWeights.friendly, -10, 10),
      neutral: boundedNumber(territory.neutral, fallback.territoryWeights.neutral, -10, 10),
      enemy: boundedNumber(territory.enemy, fallback.territoryWeights.enemy, -10, 10),
    },
    directionalTerrain: {
      forwardSlopePenalty: boundedNumber(directional.forwardSlopePenalty, fallback.directionalTerrain.forwardSlopePenalty, 0, 10),
      reverseSlopePreference: boundedNumber(directional.reverseSlopePreference, fallback.directionalTerrain.reverseSlopePreference, 0, 10),
      crestPenalty: boundedNumber(directional.crestPenalty, fallback.directionalTerrain.crestPenalty, 0, 10),
      silhouettePenalty: boundedNumber(directional.silhouettePenalty, fallback.directionalTerrain.silhouettePenalty, 0, 10),
      valleyPreference: boundedNumber(directional.valleyPreference, fallback.directionalTerrain.valleyPreference, 0, 10),
      criticalSectorMultiplier: boundedNumber(directional.criticalSectorMultiplier, fallback.directionalTerrain.criticalSectorMultiplier, 0, 5),
    },
    maximumDetourRatio: boundedNumber(value.maximumDetourRatio, fallback.maximumDetourRatio, 1, 5),
    maximumRouteCost: value.maximumRouteCost === null
      ? null
      : boundedNumber(value.maximumRouteCost, fallback.maximumRouteCost ?? 100000, 0.1, 1_000_000),
    allowGoalAdjustment: typeof value.allowGoalAdjustment === 'boolean' ? value.allowGoalAdjustment : fallback.allowGoalAdjustment,
    replanRules: {
      replanOnBlocked: booleanValue(replan.replanOnBlocked, fallback.replanRules.replanOnBlocked),
      replanOnProfileChange: booleanValue(replan.replanOnProfileChange, fallback.replanRules.replanOnProfileChange),
      replanOnDangerChange: booleanValue(replan.replanOnDangerChange, fallback.replanRules.replanOnDangerChange),
      minimumCostImprovement: boundedNumber(replan.minimumCostImprovement, fallback.replanRules.minimumCostImprovement, 0, 1),
      minimumDangerRevisionInterval: positiveInteger(replan.minimumDangerRevisionInterval, fallback.replanRules.minimumDangerRevisionInterval),
      replanCooldownSeconds: boundedNumber(replan.replanCooldownSeconds, fallback.replanRules.replanCooldownSeconds, 0, 120),
    },
    revision: positiveInteger(value.revision, fallback.revision),
    builtIn: Boolean(value.builtIn),
  };
}

function cloneProfile(value: NavigationProfile): NavigationProfile {
  return {
    ...value,
    terrainCosts: { ...value.terrainCosts },
    territoryWeights: { ...value.territoryWeights },
    directionalTerrain: { ...value.directionalTerrain },
    replanRules: { ...value.replanRules },
  };
}

function normalizeCustomId(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return normalized || 'custom';
}

function cleanText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, numeric));
}

function positiveInteger(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.max(1, numeric);
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
