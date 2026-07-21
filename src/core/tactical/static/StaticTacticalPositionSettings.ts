export const STATIC_TACTICAL_POSITION_SETTINGS_VERSION = 1 as const;

export interface StaticTacticalGeometrySettings {
  readonly maximumObservationRangeMeters: number;
  readonly maximumFiringRangeMeters: number;
  readonly observationSamplesPerSector: number;
  readonly firingSamplesPerSector: number;
  readonly immediateClearanceMeters: number;
}

export interface StaticTacticalKindWeights {
  readonly primary: number;
  readonly directionalBreadth: number;
  readonly concealment: number;
  readonly protection: number;
  readonly exposurePenalty: number;
  readonly slopePenalty: number;
}

export interface StaticTacticalCandidateIndexSettings {
  readonly chunkSizeCells: number;
  readonly maximumCandidatesPerKindPerChunk: number;
  readonly minimumSeparationCells: number;
  readonly observationThreshold: number;
  readonly defenseThreshold: number;
  readonly firingThreshold: number;
  readonly directionalDiversityThreshold: number;
}

export interface StaticTacticalPostureSettings {
  readonly standingHeightMeters: number;
  readonly crouchedHeightMeters: number;
  readonly proneHeightMeters: number;
  readonly standingExposure: number;
  readonly crouchedExposure: number;
  readonly proneExposure: number;
}

export interface StaticTacticalSectorSettings {
  readonly count: number;
  readonly minimumUsefulTransmission: number;
  readonly nearSampleWeight: number;
  readonly farSampleWeight: number;
}

export interface StaticTacticalPositionSettings {
  readonly version: typeof STATIC_TACTICAL_POSITION_SETTINGS_VERSION;
  readonly geometry: StaticTacticalGeometrySettings;
  readonly observation: StaticTacticalKindWeights;
  readonly defense: StaticTacticalKindWeights;
  readonly firing: StaticTacticalKindWeights;
  readonly index: StaticTacticalCandidateIndexSettings;
  readonly postures: StaticTacticalPostureSettings;
  readonly sectors: StaticTacticalSectorSettings;
}

export type StaticTacticalPositionSettingsInput = Partial<{
  geometry: Partial<StaticTacticalGeometrySettings>;
  observation: Partial<StaticTacticalKindWeights>;
  defense: Partial<StaticTacticalKindWeights>;
  firing: Partial<StaticTacticalKindWeights>;
  index: Partial<StaticTacticalCandidateIndexSettings>;
  postures: Partial<StaticTacticalPostureSettings>;
  sectors: Partial<StaticTacticalSectorSettings>;
}> | null | undefined;

const DEFAULT_KIND_WEIGHTS: StaticTacticalKindWeights = Object.freeze({
  primary: 0.44,
  directionalBreadth: 0.16,
  concealment: 0.14,
  protection: 0.18,
  exposurePenalty: 0.16,
  slopePenalty: 0.08,
});

export function createDefaultStaticTacticalPositionSettings(): StaticTacticalPositionSettings {
  return Object.freeze({
    version: STATIC_TACTICAL_POSITION_SETTINGS_VERSION,
    geometry: Object.freeze({
      maximumObservationRangeMeters: 240,
      maximumFiringRangeMeters: 320,
      observationSamplesPerSector: 10,
      firingSamplesPerSector: 12,
      immediateClearanceMeters: 8,
    }),
    observation: Object.freeze({
      ...DEFAULT_KIND_WEIGHTS,
      primary: 0.48,
      directionalBreadth: 0.20,
      concealment: 0.16,
      protection: 0.12,
      exposurePenalty: 0.20,
      slopePenalty: 0.08,
    }),
    defense: Object.freeze({
      ...DEFAULT_KIND_WEIGHTS,
      primary: 0.52,
      directionalBreadth: 0.18,
      concealment: 0.12,
      protection: 0.24,
      exposurePenalty: 0.12,
      slopePenalty: 0.04,
    }),
    firing: Object.freeze({
      ...DEFAULT_KIND_WEIGHTS,
      primary: 0.50,
      directionalBreadth: 0.20,
      concealment: 0.10,
      protection: 0.16,
      exposurePenalty: 0.18,
      slopePenalty: 0.10,
    }),
    index: Object.freeze({
      chunkSizeCells: 16,
      maximumCandidatesPerKindPerChunk: 12,
      minimumSeparationCells: 3,
      observationThreshold: 76,
      defenseThreshold: 72,
      firingThreshold: 76,
      directionalDiversityThreshold: 42,
    }),
    postures: Object.freeze({
      standingHeightMeters: 1.65,
      crouchedHeightMeters: 1.08,
      proneHeightMeters: 0.38,
      standingExposure: 1,
      crouchedExposure: 0.68,
      proneExposure: 0.34,
    }),
    sectors: Object.freeze({
      count: 8,
      minimumUsefulTransmission: 0.12,
      nearSampleWeight: 0.38,
      farSampleWeight: 0.62,
    }),
  });
}

export function normalizeStaticTacticalPositionSettings(
  input: StaticTacticalPositionSettingsInput,
): StaticTacticalPositionSettings {
  const defaults = createDefaultStaticTacticalPositionSettings();
  const geometry = input?.geometry ?? {};
  const index = input?.index ?? {};
  const postures = input?.postures ?? {};
  const sectors = input?.sectors ?? {};
  return Object.freeze({
    version: STATIC_TACTICAL_POSITION_SETTINGS_VERSION,
    geometry: Object.freeze({
      maximumObservationRangeMeters: bounded(geometry.maximumObservationRangeMeters, defaults.geometry.maximumObservationRangeMeters, 10, 2000),
      maximumFiringRangeMeters: bounded(geometry.maximumFiringRangeMeters, defaults.geometry.maximumFiringRangeMeters, 10, 3000),
      observationSamplesPerSector: integer(geometry.observationSamplesPerSector, defaults.geometry.observationSamplesPerSector, 2, 64),
      firingSamplesPerSector: integer(geometry.firingSamplesPerSector, defaults.geometry.firingSamplesPerSector, 2, 64),
      immediateClearanceMeters: bounded(geometry.immediateClearanceMeters, defaults.geometry.immediateClearanceMeters, 1, 50),
    }),
    observation: normalizeKindWeights(input?.observation, defaults.observation),
    defense: normalizeKindWeights(input?.defense, defaults.defense),
    firing: normalizeKindWeights(input?.firing, defaults.firing),
    index: Object.freeze({
      chunkSizeCells: integer(index.chunkSizeCells, defaults.index.chunkSizeCells, 4, 64),
      maximumCandidatesPerKindPerChunk: integer(index.maximumCandidatesPerKindPerChunk, defaults.index.maximumCandidatesPerKindPerChunk, 1, 32),
      minimumSeparationCells: bounded(index.minimumSeparationCells, defaults.index.minimumSeparationCells, 0, 16),
      observationThreshold: byte(index.observationThreshold, defaults.index.observationThreshold),
      defenseThreshold: byte(index.defenseThreshold, defaults.index.defenseThreshold),
      firingThreshold: byte(index.firingThreshold, defaults.index.firingThreshold),
      directionalDiversityThreshold: byte(index.directionalDiversityThreshold, defaults.index.directionalDiversityThreshold),
    }),
    postures: Object.freeze({
      standingHeightMeters: bounded(postures.standingHeightMeters, defaults.postures.standingHeightMeters, 0.2, 3),
      crouchedHeightMeters: bounded(postures.crouchedHeightMeters, defaults.postures.crouchedHeightMeters, 0.15, 2.5),
      proneHeightMeters: bounded(postures.proneHeightMeters, defaults.postures.proneHeightMeters, 0.05, 1.2),
      standingExposure: bounded(postures.standingExposure, defaults.postures.standingExposure, 0.05, 2),
      crouchedExposure: bounded(postures.crouchedExposure, defaults.postures.crouchedExposure, 0.05, 2),
      proneExposure: bounded(postures.proneExposure, defaults.postures.proneExposure, 0.02, 2),
    }),
    sectors: Object.freeze({
      count: integer(sectors.count, defaults.sectors.count, 4, 32),
      minimumUsefulTransmission: bounded(sectors.minimumUsefulTransmission, defaults.sectors.minimumUsefulTransmission, 0, 1),
      nearSampleWeight: bounded(sectors.nearSampleWeight, defaults.sectors.nearSampleWeight, 0, 1),
      farSampleWeight: bounded(sectors.farSampleWeight, defaults.sectors.farSampleWeight, 0, 1),
    }),
  });
}

export function staticTacticalPositionSettingsDigest(settings: StaticTacticalPositionSettings): string {
  const serialized = stableSerialize(settings);
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function normalizeKindWeights(
  input: Partial<StaticTacticalKindWeights> | undefined,
  defaults: StaticTacticalKindWeights,
): StaticTacticalKindWeights {
  return Object.freeze({
    primary: weight(input?.primary, defaults.primary),
    directionalBreadth: weight(input?.directionalBreadth, defaults.directionalBreadth),
    concealment: weight(input?.concealment, defaults.concealment),
    protection: weight(input?.protection, defaults.protection),
    exposurePenalty: weight(input?.exposurePenalty, defaults.exposurePenalty),
    slopePenalty: weight(input?.slopePenalty, defaults.slopePenalty),
  });
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableSerialize(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function integer(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.max(minimum, Math.min(maximum, numeric));
}

function bounded(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(minimum, Math.min(maximum, numeric));
}

function byte(value: unknown, fallback: number): number {
  return integer(value, fallback, 0, 255);
}

function weight(value: unknown, fallback: number): number {
  return bounded(value, fallback, 0, 4);
}
