export const ENVIRONMENT_PROFILE_FORMAT_VERSION = 1 as const;
export const DEFAULT_ENVIRONMENT_PROFILE_ID = 'default';

export type EnvironmentRevisionDomain = 'presentation' | 'visibility' | 'fire' | 'movement';
export type SurfaceMaterialId = string;
export type VegetationMaterialId = string;

export interface SurfaceMaterialDefinition {
  readonly id: SurfaceMaterialId;
  readonly nameEn: string;
  readonly nameRu: string;
  readonly presentation: {
    readonly colorTint: number;
    readonly opacity: number;
    readonly textureId: string;
    readonly textureScale: number;
    readonly noiseScale: number;
  };
  readonly movement: {
    readonly resistance: number;
    readonly passable: boolean;
    readonly physicalCost: number;
  };
}

export interface VegetationMaterialDefinition {
  readonly id: VegetationMaterialId;
  readonly nameEn: string;
  readonly nameRu: string;
  readonly legacyLayer: 0 | 1 | 2 | null;
  readonly presentation: {
    readonly textureId: string;
    readonly colorTint: number;
    readonly opacity: number;
    readonly coverage: number;
    readonly textureScale: number;
    readonly noiseScale: number;
    readonly edgeSoftness: number;
  };
  readonly visibility: {
    readonly transmissionLossPerMeter: number;
    readonly minimumTransmission: number;
    readonly targetConcealment: number;
    readonly localConcealment: number;
  };
  readonly fire: {
    readonly transmissionLossPerMeter: number;
    readonly protectionPerMeter: number;
    readonly maximumProtection: number;
    readonly densityWeight: number;
  };
  readonly movement: {
    readonly resistance: number;
    readonly tacticalConcealment: number;
  };
}

export interface EnvironmentProfileRevisions {
  readonly presentation: number;
  readonly visibility: number;
  readonly fire: number;
  readonly movement: number;
}

export interface EnvironmentMaterialProfile {
  readonly id: string;
  readonly nameEn: string;
  readonly nameRu: string;
  readonly descriptionEn: string;
  readonly descriptionRu: string;
  readonly builtIn: boolean;
  readonly revision: number;
  readonly revisions: EnvironmentProfileRevisions;
  readonly surfaces: Readonly<Record<SurfaceMaterialId, SurfaceMaterialDefinition>>;
  readonly vegetation: Readonly<Record<VegetationMaterialId, VegetationMaterialDefinition>>;
}

export interface EnvironmentProfileRegistryData {
  readonly formatVersion: typeof ENVIRONMENT_PROFILE_FORMAT_VERSION;
  readonly revision: number;
  readonly activeProfileId: string;
  readonly profiles: EnvironmentMaterialProfile[];
}

const DEFAULT_PROFILE: EnvironmentMaterialProfile = deepFreeze({
  id: DEFAULT_ENVIRONMENT_PROFILE_ID,
  nameEn: 'Default environment',
  nameRu: 'Стандартная местность',
  descriptionEn: 'Built-in physical surface and vegetation material definitions.',
  descriptionRu: 'Встроенные физические свойства поверхностей и растительности.',
  builtIn: true,
  revision: 1,
  revisions: { presentation: 1, visibility: 1, fire: 1, movement: 1 },
  surfaces: {
    field: surface('field', 'Field', 'Поле', 0x77775b, 1, true, 1, 0),
    road: surface('road', 'Road', 'Дорога', 0x8b7655, 1, true, 0.8, 0),
    rough: surface('rough', 'Rough ground', 'Пересечённая местность', 0x68634f, 1, true, 1.3, 0),
    swamp: surface('swamp', 'Swamp', 'Болото', 0x4c6052, 1, true, 1.8, 0),
    water: surface('water', 'Water', 'Вода', 0x315d74, 1, false, 99, 99),
  },
  vegetation: {
    none: vegetation('none', 'No vegetation', 'Нет растительности', 0, {
      textureId: 'none', colorTint: 0x000000, opacity: 0, coverage: 0,
      textureScale: 1, noiseScale: 1, edgeSoftness: 0,
    }, { transmissionLossPerMeter: 0, minimumTransmission: 0.04, targetConcealment: 0, localConcealment: 0 },
    { transmissionLossPerMeter: 0, protectionPerMeter: 0, maximumProtection: 0, densityWeight: 0 },
    { resistance: 1, tacticalConcealment: 0 }),
    sparse_forest: vegetation('sparse_forest', 'Sparse forest', 'Редкий лес', 1, {
      textureId: 'procedural_forest', colorTint: 0x285f3a, opacity: 0.9, coverage: 0.72,
      textureScale: 1.15, noiseScale: 0.85, edgeSoftness: 0.34,
    }, { transmissionLossPerMeter: 0.035, minimumTransmission: 0.04, targetConcealment: 35, localConcealment: 52 },
    { transmissionLossPerMeter: 0.018, protectionPerMeter: 0.8, maximumProtection: 42, densityWeight: 0.8 },
    { resistance: 1.25, tacticalConcealment: 0.35 }),
    dense_forest: vegetation('dense_forest', 'Dense forest', 'Густой лес', 2, {
      textureId: 'procedural_forest', colorTint: 0x123b25, opacity: 0.98, coverage: 0.94,
      textureScale: 0.88, noiseScale: 1.35, edgeSoftness: 0.24,
    }, { transmissionLossPerMeter: 0.075, minimumTransmission: 0.04, targetConcealment: 65, localConcealment: 82 },
    { transmissionLossPerMeter: 0.04, protectionPerMeter: 1.7, maximumProtection: 68, densityWeight: 1.7 },
    { resistance: 1.45, tacticalConcealment: 0.6 }),
  },
});

export class EnvironmentProfileRegistry {
  readonly formatVersion = ENVIRONMENT_PROFILE_FORMAT_VERSION;
  private registryRevision: number;
  private activeId: string;
  private readonly profiles = new Map<string, EnvironmentMaterialProfile>();

  constructor(data?: Partial<EnvironmentProfileRegistryData>) {
    const normalized = normalizeRegistryData(data);
    this.registryRevision = normalized.revision;
    this.activeId = normalized.activeProfileId;
    for (const profile of normalized.profiles) this.profiles.set(profile.id, profile);
  }

  get revision(): number { return this.registryRevision; }
  get activeProfileId(): string { return this.activeId; }

  listProfiles(): EnvironmentMaterialProfile[] {
    return [...this.profiles.values()]
      .sort((a, b) => Number(b.builtIn) - Number(a.builtIn) || a.nameRu.localeCompare(b.nameRu))
      .map(cloneProfile);
  }

  hasProfile(id: string): boolean { return this.profiles.has(id); }

  getProfile(id = this.activeId): EnvironmentMaterialProfile {
    return cloneProfile(this.profiles.get(id) ?? this.profiles.get(DEFAULT_ENVIRONMENT_PROFILE_ID) ?? DEFAULT_PROFILE);
  }

  setActiveProfile(id: string): EnvironmentMaterialProfile {
    if (!this.profiles.has(id)) throw new Error(`Unknown environment profile: ${id}`);
    if (this.activeId !== id) { this.activeId = id; this.touch(); }
    return this.getProfile(id);
  }

  createCustomProfile(id: string, nameEn: string, nameRu: string, sourceId = this.activeId): EnvironmentMaterialProfile {
    const normalizedId = normalizeId(id);
    if (this.profiles.has(normalizedId)) throw new Error(`Environment profile already exists: ${normalizedId}`);
    const source = this.getProfile(sourceId);
    const created = deepFreeze({
      ...source,
      id: normalizedId,
      nameEn: cleanText(nameEn, normalizedId),
      nameRu: cleanText(nameRu, nameEn || normalizedId),
      descriptionEn: `Custom environment profile based on ${source.nameEn}.`,
      descriptionRu: `Пользовательский профиль на основе «${source.nameRu}».`,
      builtIn: false,
      revision: 1,
      revisions: { presentation: 1, visibility: 1, fire: 1, movement: 1 },
    });
    this.profiles.set(normalizedId, created);
    this.activeId = normalizedId;
    this.touch();
    return cloneProfile(created);
  }

  renameProfile(id: string, nameEn: string, nameRu: string): EnvironmentMaterialProfile {
    return this.replaceProfile(id, { nameEn: cleanText(nameEn, id), nameRu: cleanText(nameRu, nameEn || id) }, []);
  }

  updateVegetationMaterial(
    profileId: string,
    materialId: string,
    changes: Partial<VegetationMaterialDefinition>,
  ): EnvironmentMaterialProfile {
    const current = this.requireProfile(profileId);
    const previous = current.vegetation[materialId];
    if (!previous) throw new Error(`Unknown vegetation material: ${materialId}`);
    const next = normalizeVegetation({ ...previous, ...changes, id: previous.id, legacyLayer: previous.legacyLayer }, previous);
    const domains = changedVegetationDomains(previous, next);
    if (domains.length === 0) return cloneProfile(current);
    return this.replaceProfile(profileId, { vegetation: { ...current.vegetation, [materialId]: next } }, domains);
  }

  updateSurfaceMaterial(
    profileId: string,
    materialId: string,
    changes: Partial<SurfaceMaterialDefinition>,
  ): EnvironmentMaterialProfile {
    const current = this.requireProfile(profileId);
    const previous = current.surfaces[materialId];
    if (!previous) throw new Error(`Unknown surface material: ${materialId}`);
    const next = normalizeSurface({ ...previous, ...changes, id: previous.id }, previous);
    const domains: EnvironmentRevisionDomain[] = [];
    if (JSON.stringify(previous.presentation) !== JSON.stringify(next.presentation)) domains.push('presentation');
    if (JSON.stringify(previous.movement) !== JSON.stringify(next.movement)) domains.push('movement');
    if (domains.length === 0) return cloneProfile(current);
    return this.replaceProfile(profileId, { surfaces: { ...current.surfaces, [materialId]: next } }, domains);
  }

  resetProfile(id: string): EnvironmentMaterialProfile {
    const current = this.requireProfile(id);
    const source = current.builtIn ? DEFAULT_PROFILE : { ...DEFAULT_PROFILE, id: current.id, builtIn: false, nameEn: current.nameEn, nameRu: current.nameRu };
    const reset = deepFreeze({
      ...source,
      revision: current.revision + 1,
      revisions: incrementDomains(current.revisions, ['presentation', 'visibility', 'fire', 'movement']),
    });
    this.profiles.set(id, reset);
    this.touch();
    return cloneProfile(reset);
  }

  deleteProfile(id: string): boolean {
    const profile = this.profiles.get(id);
    if (!profile || profile.builtIn) return false;
    const deleted = this.profiles.delete(id);
    if (deleted) {
      if (this.activeId === id) this.activeId = DEFAULT_ENVIRONMENT_PROFILE_ID;
      this.touch();
    }
    return deleted;
  }

  toData(): EnvironmentProfileRegistryData {
    return { formatVersion: ENVIRONMENT_PROFILE_FORMAT_VERSION, revision: this.registryRevision, activeProfileId: this.activeId, profiles: this.listProfiles() };
  }

  exportJson(): string { return JSON.stringify(this.toData(), null, 2); }
  static importJson(json: string): EnvironmentProfileRegistry { return EnvironmentProfileRegistry.fromUnknown(JSON.parse(json)); }
  static fromUnknown(value: unknown): EnvironmentProfileRegistry { return new EnvironmentProfileRegistry(migrateRegistryData(value)); }

  private requireProfile(id: string): EnvironmentMaterialProfile {
    const profile = this.profiles.get(id);
    if (!profile) throw new Error(`Unknown environment profile: ${id}`);
    return profile;
  }

  private replaceProfile(
    id: string,
    changes: Partial<EnvironmentMaterialProfile>,
    domains: EnvironmentRevisionDomain[],
  ): EnvironmentMaterialProfile {
    const current = this.requireProfile(id);
    const updated = deepFreeze({
      ...current,
      ...changes,
      id: current.id,
      builtIn: current.builtIn,
      revision: current.revision + 1,
      revisions: incrementDomains(current.revisions, domains),
    });
    this.profiles.set(id, updated);
    this.touch();
    return cloneProfile(updated);
  }

  private touch(): void { this.registryRevision += 1; }
}

export function createDefaultEnvironmentProfileRegistry(): EnvironmentProfileRegistry { return new EnvironmentProfileRegistry(); }
export function getDefaultEnvironmentProfile(): EnvironmentMaterialProfile { return cloneProfile(DEFAULT_PROFILE); }

export function getSurfaceMaterial(profile: EnvironmentMaterialProfile, id: string | undefined): SurfaceMaterialDefinition {
  return profile.surfaces[id ?? 'field'] ?? profile.surfaces.field ?? Object.values(profile.surfaces)[0];
}

export function getVegetationMaterial(profile: EnvironmentMaterialProfile, id: string | undefined): VegetationMaterialDefinition {
  return profile.vegetation[id ?? 'none'] ?? profile.vegetation.none ?? Object.values(profile.vegetation)[0];
}

export function legacyForestLayerToVegetationMaterialId(layer: number | undefined): VegetationMaterialId {
  const rounded = Number.isFinite(layer) ? Math.round(layer as number) : 0;
  return rounded >= 2 ? 'dense_forest' : rounded >= 1 ? 'sparse_forest' : 'none';
}

export function vegetationMaterialIdToLegacyForestLayer(id: string | undefined): 0 | 1 | 2 {
  return id === 'dense_forest' ? 2 : id === 'sparse_forest' ? 1 : 0;
}

export function terrainKindToSurfaceMaterialId(terrain: string | undefined): SurfaceMaterialId {
  return terrain === 'forest' ? 'field' : (terrain || 'field');
}

export function surfaceMaterialIdToTerrainKind(id: string | undefined): 'field' | 'road' | 'rough' | 'swamp' | 'water' {
  return id === 'road' || id === 'rough' || id === 'swamp' || id === 'water' ? id : 'field';
}

function surface(id: string, nameEn: string, nameRu: string, colorTint: number, opacity: number, passable: boolean, resistance: number, physicalCost: number): SurfaceMaterialDefinition {
  return { id, nameEn, nameRu, presentation: { colorTint, opacity, textureId: `surface_${id}`, textureScale: 1, noiseScale: 1 }, movement: { resistance, passable, physicalCost } };
}

function vegetation(
  id: string, nameEn: string, nameRu: string, legacyLayer: 0 | 1 | 2,
  presentation: VegetationMaterialDefinition['presentation'],
  visibility: VegetationMaterialDefinition['visibility'],
  fire: VegetationMaterialDefinition['fire'],
  movement: VegetationMaterialDefinition['movement'],
): VegetationMaterialDefinition {
  return { id, nameEn, nameRu, legacyLayer, presentation, visibility, fire, movement };
}

function normalizeRegistryData(data?: Partial<EnvironmentProfileRegistryData>): EnvironmentProfileRegistryData {
  const incoming = Array.isArray(data?.profiles) ? data.profiles : [];
  const byId = new Map(incoming.map((item) => [String(item.id), item]));
  const defaultsIncoming = byId.get(DEFAULT_ENVIRONMENT_PROFILE_ID);
  byId.delete(DEFAULT_ENVIRONMENT_PROFILE_ID);
  const profiles = [normalizeProfile(defaultsIncoming, DEFAULT_PROFILE, true)];
  for (const candidate of byId.values()) profiles.push(normalizeProfile(candidate, DEFAULT_PROFILE, false));
  const active = profiles.some((profile) => profile.id === data?.activeProfileId) ? String(data?.activeProfileId) : DEFAULT_ENVIRONMENT_PROFILE_ID;
  return { formatVersion: ENVIRONMENT_PROFILE_FORMAT_VERSION, revision: positiveInteger(data?.revision, 1), activeProfileId: active, profiles };
}

function migrateRegistryData(value: unknown): Partial<EnvironmentProfileRegistryData> {
  if (!isRecord(value)) return {};
  return {
    formatVersion: ENVIRONMENT_PROFILE_FORMAT_VERSION,
    revision: positiveInteger(value.revision, 1),
    activeProfileId: cleanText(value.activeProfileId, DEFAULT_ENVIRONMENT_PROFILE_ID),
    profiles: Array.isArray(value.profiles) ? value.profiles.filter(isRecord) as unknown as EnvironmentMaterialProfile[] : [],
  };
}

function normalizeProfile(value: Partial<EnvironmentMaterialProfile> | undefined, fallback: EnvironmentMaterialProfile, builtIn: boolean): EnvironmentMaterialProfile {
  const raw = value ?? {};
  const surfaces = { ...fallback.surfaces };
  const vegetationMap = { ...fallback.vegetation };
  if (isRecord(raw.surfaces)) for (const [id, item] of Object.entries(raw.surfaces)) if (isRecord(item)) surfaces[id] = normalizeSurface(item, surfaces[id] ?? fallback.surfaces.field);
  if (isRecord(raw.vegetation)) for (const [id, item] of Object.entries(raw.vegetation)) if (isRecord(item)) vegetationMap[id] = normalizeVegetation(item, vegetationMap[id] ?? fallback.vegetation.none);
  return deepFreeze({
    id: builtIn ? DEFAULT_ENVIRONMENT_PROFILE_ID : normalizeId(raw.id ?? 'custom_environment'),
    nameEn: cleanText(raw.nameEn, fallback.nameEn), nameRu: cleanText(raw.nameRu, fallback.nameRu),
    descriptionEn: cleanText(raw.descriptionEn, fallback.descriptionEn), descriptionRu: cleanText(raw.descriptionRu, fallback.descriptionRu),
    builtIn, revision: positiveInteger(raw.revision, 1),
    revisions: normalizeRevisions(raw.revisions), surfaces, vegetation: vegetationMap,
  });
}

function normalizeSurface(value: Partial<SurfaceMaterialDefinition>, fallback: SurfaceMaterialDefinition): SurfaceMaterialDefinition {
  const presentation: Record<string, unknown> = isRecord(value.presentation) ? value.presentation : {};
  const movement: Record<string, unknown> = isRecord(value.movement) ? value.movement : {};
  return deepFreeze({
    id: cleanText(value.id, fallback.id), nameEn: cleanText(value.nameEn, fallback.nameEn), nameRu: cleanText(value.nameRu, fallback.nameRu),
    presentation: {
      colorTint: colorNumber(presentation.colorTint, fallback.presentation.colorTint), opacity: bounded(presentation.opacity, 0, 1, fallback.presentation.opacity),
      textureId: cleanText(presentation.textureId, fallback.presentation.textureId), textureScale: bounded(presentation.textureScale, 0.1, 10, fallback.presentation.textureScale),
      noiseScale: bounded(presentation.noiseScale, 0, 10, fallback.presentation.noiseScale),
    },
    movement: { resistance: bounded(movement.resistance, 0.05, 100, fallback.movement.resistance), passable: typeof movement.passable === 'boolean' ? movement.passable : fallback.movement.passable, physicalCost: bounded(movement.physicalCost, -10, 100, fallback.movement.physicalCost) },
  });
}

function normalizeVegetation(value: Partial<VegetationMaterialDefinition>, fallback: VegetationMaterialDefinition): VegetationMaterialDefinition {
  const p: Record<string, unknown> = isRecord(value.presentation) ? value.presentation : {};
  const v: Record<string, unknown> = isRecord(value.visibility) ? value.visibility : {};
  const f: Record<string, unknown> = isRecord(value.fire) ? value.fire : {};
  const m: Record<string, unknown> = isRecord(value.movement) ? value.movement : {};
  return deepFreeze({
    id: cleanText(value.id, fallback.id), nameEn: cleanText(value.nameEn, fallback.nameEn), nameRu: cleanText(value.nameRu, fallback.nameRu),
    legacyLayer: value.legacyLayer === 0 || value.legacyLayer === 1 || value.legacyLayer === 2 ? value.legacyLayer : fallback.legacyLayer,
    presentation: { textureId: cleanText(p.textureId, fallback.presentation.textureId), colorTint: colorNumber(p.colorTint, fallback.presentation.colorTint), opacity: bounded(p.opacity, 0, 1, fallback.presentation.opacity), coverage: bounded(p.coverage, 0, 1, fallback.presentation.coverage), textureScale: bounded(p.textureScale, 0.1, 10, fallback.presentation.textureScale), noiseScale: bounded(p.noiseScale, 0, 10, fallback.presentation.noiseScale), edgeSoftness: bounded(p.edgeSoftness, 0, 1, fallback.presentation.edgeSoftness) },
    visibility: { transmissionLossPerMeter: bounded(v.transmissionLossPerMeter, 0, 10, fallback.visibility.transmissionLossPerMeter), minimumTransmission: bounded(v.minimumTransmission, 0, 1, fallback.visibility.minimumTransmission), targetConcealment: bounded(v.targetConcealment, 0, 100, fallback.visibility.targetConcealment), localConcealment: bounded(v.localConcealment, 0, 100, fallback.visibility.localConcealment) },
    fire: { transmissionLossPerMeter: bounded(f.transmissionLossPerMeter, 0, 10, fallback.fire.transmissionLossPerMeter), protectionPerMeter: bounded(f.protectionPerMeter, 0, 100, fallback.fire.protectionPerMeter), maximumProtection: bounded(f.maximumProtection, 0, 100, fallback.fire.maximumProtection), densityWeight: bounded(f.densityWeight, 0, 100, fallback.fire.densityWeight) },
    movement: { resistance: bounded(m.resistance, 0.05, 100, fallback.movement.resistance), tacticalConcealment: bounded(m.tacticalConcealment, 0, 10, fallback.movement.tacticalConcealment) },
  });
}

function changedVegetationDomains(a: VegetationMaterialDefinition, b: VegetationMaterialDefinition): EnvironmentRevisionDomain[] {
  const result: EnvironmentRevisionDomain[] = [];
  if (JSON.stringify(a.presentation) !== JSON.stringify(b.presentation)) result.push('presentation');
  if (JSON.stringify(a.visibility) !== JSON.stringify(b.visibility)) result.push('visibility');
  if (JSON.stringify(a.fire) !== JSON.stringify(b.fire)) result.push('fire');
  if (JSON.stringify(a.movement) !== JSON.stringify(b.movement)) result.push('movement');
  return result;
}
function incrementDomains(current: EnvironmentProfileRevisions, domains: EnvironmentRevisionDomain[]): EnvironmentProfileRevisions { const next = { ...current }; for (const domain of domains) next[domain] += 1; return next; }
function normalizeRevisions(value: unknown): EnvironmentProfileRevisions { const record = isRecord(value) ? value : {}; return { presentation: positiveInteger(record.presentation, 1), visibility: positiveInteger(record.visibility, 1), fire: positiveInteger(record.fire, 1), movement: positiveInteger(record.movement, 1) }; }
function cloneProfile(profile: EnvironmentMaterialProfile): EnvironmentMaterialProfile { return structuredCloneAvailable(profile); }
function structuredCloneAvailable<T>(value: T): T { return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T; }
function deepFreeze<T>(value: T): T { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); } return value; }
function normalizeId(value: unknown): string { const id = String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, ''); if (!id || id === DEFAULT_ENVIRONMENT_PROFILE_ID) throw new Error('Custom environment profile id is invalid.'); return id; }
function cleanText(value: unknown, fallback: string): string { const text = typeof value === 'string' ? value.trim() : ''; return text || fallback; }
function positiveInteger(value: unknown, fallback: number): number { const n = Number(value); return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback; }
function bounded(value: unknown, min: number, max: number, fallback: number): number { const n = Number(value); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback; }
function colorNumber(value: unknown, fallback: number): number { const n = typeof value === 'string' ? Number.parseInt(value.replace(/^#/, ''), 16) : Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(0xffffff, Math.round(n))) : fallback; }
function isRecord(value: unknown): value is Record<string, any> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
