import type { TacticalPositionKind } from '../ai/tactical/TacticalQuery';

export interface TacticalPositionRankingWeights {
  readonly staticPotential: number;
  readonly directionalFit: number;
  readonly lineQuality: number;
  readonly rangeFit: number;
  readonly protection: number;
  readonly concealment: number;
  readonly positionSafety: number;
  readonly routeSafety: number;
  readonly certainty: number;
  readonly orderAlignment: number;
  readonly withdrawal: number;
}

export interface TacticalPositionSearchWorkLimits {
  readonly preliminaryCandidates: number;
  readonly exactCandidates: number;
  readonly exactRayLimit: number;
  readonly routeExpansionLimit: number;
  readonly maximumPositionDanger: number;
  readonly minimumLineQuality: number;
  readonly maximumRouteCost: number;
}

export interface TacticalPositionSearchSettingsV1 {
  readonly version: 1;
  readonly work: TacticalPositionSearchWorkLimits;
  readonly observation: TacticalPositionRankingWeights;
  readonly defense: TacticalPositionRankingWeights;
  readonly firing: TacticalPositionRankingWeights;
}

export const DEFAULT_TACTICAL_POSITION_SEARCH_SETTINGS: TacticalPositionSearchSettingsV1 = deepFreeze({
  version: 1,
  work: {
    preliminaryCandidates: 36,
    exactCandidates: 12,
    exactRayLimit: 32,
    routeExpansionLimit: 2048,
    maximumPositionDanger: 78,
    minimumLineQuality: 18,
    maximumRouteCost: 100000,
  },
  observation: {
    staticPotential: 0.19,
    directionalFit: 0.13,
    lineQuality: 0.25,
    rangeFit: 0,
    protection: 0.08,
    concealment: 0.12,
    positionSafety: 0.09,
    routeSafety: 0.05,
    certainty: 0.04,
    orderAlignment: 0.03,
    withdrawal: 0.02,
  },
  defense: {
    staticPotential: 0.18,
    directionalFit: 0.16,
    lineQuality: 0.03,
    rangeFit: 0,
    protection: 0.29,
    concealment: 0.09,
    positionSafety: 0.10,
    routeSafety: 0.06,
    certainty: 0.04,
    orderAlignment: 0.03,
    withdrawal: 0.02,
  },
  firing: {
    staticPotential: 0.16,
    directionalFit: 0.12,
    lineQuality: 0.24,
    rangeFit: 0.16,
    protection: 0.08,
    concealment: 0.06,
    positionSafety: 0.07,
    routeSafety: 0.04,
    certainty: 0.02,
    orderAlignment: 0.03,
    withdrawal: 0.02,
  },
});

export function tacticalPositionRankingWeights(
  kind: TacticalPositionKind,
  settings: TacticalPositionSearchSettingsV1 = DEFAULT_TACTICAL_POSITION_SEARCH_SETTINGS,
): TacticalPositionRankingWeights {
  if (kind === 'observation') return settings.observation;
  if (kind === 'defense') return settings.defense;
  return settings.firing;
}

export function normalizeTacticalPositionSearchSettings(
  value: Partial<TacticalPositionSearchSettingsV1> | null | undefined,
): TacticalPositionSearchSettingsV1 {
  const defaults = DEFAULT_TACTICAL_POSITION_SEARCH_SETTINGS;
  return deepFreeze({
    version: 1,
    work: {
      preliminaryCandidates: integer(value?.work?.preliminaryCandidates, defaults.work.preliminaryCandidates, 8, 128),
      exactCandidates: integer(value?.work?.exactCandidates, defaults.work.exactCandidates, 1, 32),
      exactRayLimit: integer(value?.work?.exactRayLimit, defaults.work.exactRayLimit, 0, 128),
      routeExpansionLimit: integer(value?.work?.routeExpansionLimit, defaults.work.routeExpansionLimit, 64, 8192),
      maximumPositionDanger: bounded(value?.work?.maximumPositionDanger, defaults.work.maximumPositionDanger, 0, 100),
      minimumLineQuality: bounded(value?.work?.minimumLineQuality, defaults.work.minimumLineQuality, 0, 100),
      maximumRouteCost: bounded(value?.work?.maximumRouteCost, defaults.work.maximumRouteCost, 1, 1000000),
    },
    observation: normalizeWeights(value?.observation, defaults.observation),
    defense: normalizeWeights(value?.defense, defaults.defense),
    firing: normalizeWeights(value?.firing, defaults.firing),
  });
}

function normalizeWeights(
  value: Partial<TacticalPositionRankingWeights> | undefined,
  defaults: TacticalPositionRankingWeights,
): TacticalPositionRankingWeights {
  return {
    staticPotential: weight(value?.staticPotential, defaults.staticPotential),
    directionalFit: weight(value?.directionalFit, defaults.directionalFit),
    lineQuality: weight(value?.lineQuality, defaults.lineQuality),
    rangeFit: weight(value?.rangeFit, defaults.rangeFit),
    protection: weight(value?.protection, defaults.protection),
    concealment: weight(value?.concealment, defaults.concealment),
    positionSafety: weight(value?.positionSafety, defaults.positionSafety),
    routeSafety: weight(value?.routeSafety, defaults.routeSafety),
    certainty: weight(value?.certainty, defaults.certainty),
    orderAlignment: weight(value?.orderAlignment, defaults.orderAlignment),
    withdrawal: weight(value?.withdrawal, defaults.withdrawal),
  };
}

function weight(value: unknown, fallback: number): number {
  return bounded(value, fallback, 0, 10);
}

function integer(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.max(minimum, Math.min(maximum, numeric));
}

function bounded(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(minimum, Math.min(maximum, numeric));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
