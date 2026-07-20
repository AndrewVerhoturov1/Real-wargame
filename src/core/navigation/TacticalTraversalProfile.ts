export const TACTICAL_TRAVERSAL_PROFILE_VERSION = 1 as const;

export interface TacticalTraversalCostWeights {
  readonly time: number;
  readonly danger: number;
  readonly suppression: number;
  readonly visibility: number;
  readonly noise: number;
  readonly stamina: number;
  readonly protection: number;
  readonly concealment: number;
  readonly weaponReadiness: number;
  readonly threatAttention: number;
}

export interface TacticalTraversalProfile {
  readonly version: typeof TACTICAL_TRAVERSAL_PROFILE_VERSION;
  readonly revision: number;
  readonly id: string;
  readonly allowedMovementProfileIds: readonly string[];
  readonly weights: TacticalTraversalCostWeights;
  readonly maximumSamples: number;
  readonly maximumSegments: number;
  readonly minimumSegmentCells: number;
  readonly profileChangeCost: number;
  readonly postureChangeCost: number;
  readonly minimumImprovementToSwitch: number;
  readonly lowCoverDangerThreshold: number;
  readonly lowCoverProtectionAdvantageThreshold: number;
  readonly criticalStandingDanger: number;
  readonly criticalStandingSuppression: number;
  readonly criticalProneDanger: number;
  readonly criticalProneSuppression: number;
  readonly maximumThreatBiasedBodyAngleRadians: number;
  readonly bodyDirectionDeadbandRadians: number;
  readonly searchAttentionArcRadians: number;
  readonly baseSpeedMetersPerSecond: number;
}

export type TacticalTraversalProfileInput = Partial<Omit<TacticalTraversalProfile, 'weights'>> & {
  readonly weights?: Partial<TacticalTraversalCostWeights>;
};

export function createDefaultTacticalTraversalProfile(): TacticalTraversalProfile {
  return {
    version: 1,
    revision: 1,
    id: 'balanced',
    allowedMovementProfileIds: [
      'normal_walk',
      'stealth_move',
      'crouched_move',
      'run',
      'sprint',
      'crawl',
    ],
    weights: {
      time: 1,
      danger: 1,
      suppression: 1,
      visibility: 1,
      noise: 1,
      stamina: 1,
      protection: 1,
      concealment: 1,
      weaponReadiness: 1,
      threatAttention: 1,
    },
    maximumSamples: 256,
    maximumSegments: 12,
    minimumSegmentCells: 2,
    profileChangeCost: 2.8,
    postureChangeCost: 3.6,
    minimumImprovementToSwitch: 0.8,
    lowCoverDangerThreshold: 50,
    lowCoverProtectionAdvantageThreshold: 30,
    criticalStandingDanger: 82,
    criticalStandingSuppression: 45,
    criticalProneDanger: 90,
    criticalProneSuppression: 65,
    maximumThreatBiasedBodyAngleRadians: Math.PI / 5,
    bodyDirectionDeadbandRadians: Math.PI / 36,
    searchAttentionArcRadians: Math.PI * 0.72,
    baseSpeedMetersPerSecond: 1.4,
  };
}

export function normalizeTacticalTraversalProfile(
  value?: TacticalTraversalProfileInput | null,
): TacticalTraversalProfile {
  const defaults = createDefaultTacticalTraversalProfile();
  const allowed = Array.isArray(value?.allowedMovementProfileIds)
    ? [...new Set(value.allowedMovementProfileIds.filter((item): item is string => (
        typeof item === 'string' && item.trim().length > 0
      )))].slice(0, 6)
    : [...defaults.allowedMovementProfileIds];
  return {
    version: 1,
    revision: integer(value?.revision, defaults.revision, 0, Number.MAX_SAFE_INTEGER),
    id: typeof value?.id === 'string' && value.id.trim() ? value.id.trim() : defaults.id,
    allowedMovementProfileIds: allowed.length > 0 ? allowed : [...defaults.allowedMovementProfileIds],
    weights: normalizeWeights(value?.weights, defaults.weights),
    maximumSamples: integer(value?.maximumSamples, defaults.maximumSamples, 2, 256),
    maximumSegments: integer(value?.maximumSegments, defaults.maximumSegments, 1, 12),
    minimumSegmentCells: integer(value?.minimumSegmentCells, defaults.minimumSegmentCells, 1, 32),
    profileChangeCost: finite(value?.profileChangeCost, defaults.profileChangeCost, 0, 100),
    postureChangeCost: finite(value?.postureChangeCost, defaults.postureChangeCost, 0, 100),
    minimumImprovementToSwitch: finite(
      value?.minimumImprovementToSwitch,
      defaults.minimumImprovementToSwitch,
      0,
      100,
    ),
    lowCoverDangerThreshold: finite(
      value?.lowCoverDangerThreshold,
      defaults.lowCoverDangerThreshold,
      0,
      100,
    ),
    lowCoverProtectionAdvantageThreshold: finite(
      value?.lowCoverProtectionAdvantageThreshold,
      defaults.lowCoverProtectionAdvantageThreshold,
      0,
      100,
    ),
    criticalStandingDanger: finite(
      value?.criticalStandingDanger,
      defaults.criticalStandingDanger,
      0,
      100,
    ),
    criticalStandingSuppression: finite(
      value?.criticalStandingSuppression,
      defaults.criticalStandingSuppression,
      0,
      100,
    ),
    criticalProneDanger: finite(
      value?.criticalProneDanger,
      defaults.criticalProneDanger,
      0,
      100,
    ),
    criticalProneSuppression: finite(
      value?.criticalProneSuppression,
      defaults.criticalProneSuppression,
      0,
      100,
    ),
    maximumThreatBiasedBodyAngleRadians: finite(
      value?.maximumThreatBiasedBodyAngleRadians,
      defaults.maximumThreatBiasedBodyAngleRadians,
      0,
      Math.PI / 2,
    ),
    bodyDirectionDeadbandRadians: finite(
      value?.bodyDirectionDeadbandRadians,
      defaults.bodyDirectionDeadbandRadians,
      0,
      Math.PI / 2,
    ),
    searchAttentionArcRadians: finite(
      value?.searchAttentionArcRadians,
      defaults.searchAttentionArcRadians,
      Math.PI / 18,
      Math.PI * 2,
    ),
    baseSpeedMetersPerSecond: finite(
      value?.baseSpeedMetersPerSecond,
      defaults.baseSpeedMetersPerSecond,
      0.1,
      10,
    ),
  };
}

function normalizeWeights(
  value: Partial<TacticalTraversalCostWeights> | undefined,
  defaults: TacticalTraversalCostWeights,
): TacticalTraversalCostWeights {
  return {
    time: finite(value?.time, defaults.time, 0, 4),
    danger: finite(value?.danger, defaults.danger, 0, 4),
    suppression: finite(value?.suppression, defaults.suppression, 0, 4),
    visibility: finite(value?.visibility, defaults.visibility, 0, 4),
    noise: finite(value?.noise, defaults.noise, 0, 4),
    stamina: finite(value?.stamina, defaults.stamina, 0, 4),
    protection: finite(value?.protection, defaults.protection, 0, 4),
    concealment: finite(value?.concealment, defaults.concealment, 0, 4),
    weaponReadiness: finite(value?.weaponReadiness, defaults.weaponReadiness, 0, 4),
    threatAttention: finite(value?.threatAttention, defaults.threatAttention, 0, 4),
  };
}

function finite(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, numeric));
}

function integer(value: unknown, fallback: number, min: number, max: number): number {
  return Math.round(finite(value, fallback, min, max));
}
