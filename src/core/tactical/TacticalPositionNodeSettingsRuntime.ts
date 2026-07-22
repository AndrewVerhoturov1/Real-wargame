import { DEFAULT_TACTICAL_POSITION_RANKING_BY_KIND, TACTICAL_POSITION_NODE_PARAMETER_DESCRIPTORS } from './TacticalPositionNodeSettingsCatalog';
import type {
  TacticalPositionNodeKind,
  TacticalPositionNodeObjective,
  TacticalPositionNodeParameterGroup,
  TacticalPositionNodeParameters,
  TacticalPositionNodeParameterValue,
  TacticalPositionNodeSettings,
  TacticalPositionSearchSettings,
} from './TacticalPositionNodeSettingsTypes';

const RANKING_IDS = Object.freeze([
  'tacticalQualityWeight', 'movementObjectiveWeight', 'staticPotentialWeight', 'directionalFitWeight',
  'lineQualityWeight', 'rangeFitWeight', 'desiredDistanceWeight', 'protectionWeight',
  'concealmentWeight', 'dangerWeight', 'routeDangerWeight', 'routeCostWeight', 'certaintyWeight',
  'orderAlignmentWeight', 'withdrawalWeight', 'postureFitWeight', 'balancedObjectiveInfluence',
  'advanceObjectiveInfluence', 'withdrawObjectiveInfluence', 'continueOrderObjectiveInfluence',
] as const);
const PERCENT_IDS = Object.freeze([
  'maxPositionDanger', 'maxRouteDanger', 'minimumProtection', 'minimumConcealment',
  'minimumDirectionalFit', 'minimumLineQuality',
] as const);

export function createDefaultTacticalPositionNodeParameters(
  kind: TacticalPositionNodeKind = 'defense',
  objective: TacticalPositionNodeObjective = 'balanced',
): TacticalPositionNodeParameters {
  kind = normalizeKind(kind);
  objective = normalizeObjective(objective);
  const weights = DEFAULT_TACTICAL_POSITION_RANKING_BY_KIND[kind];
  const defense = kind === 'defense';
  return {
    kind,
    objective,
    queryKey: 'tactical_position_query',
    targetMode: 'automatic',
    targetPoint: null,
    sectorCenterDegrees: 0,
    sectorArcDegrees: 90,
    searchRadiusMeters: 50,
    maxCandidates: 12,
    desiredDistanceMeters: 0,
    tacticalQualityWeight: defense ? 0.58 : 0.66,
    movementObjectiveWeight: defense ? 0.42 : 0.34,
    staticPotentialWeight: weights.staticPotential,
    directionalFitWeight: weights.directionalFit,
    lineQualityWeight: weights.lineQuality,
    rangeFitWeight: weights.rangeFit,
    desiredDistanceWeight: weights.desiredDistance,
    protectionWeight: weights.protection,
    concealmentWeight: weights.concealment,
    dangerWeight: weights.danger,
    routeDangerWeight: weights.routeDanger,
    routeCostWeight: weights.routeCost,
    certaintyWeight: weights.certainty,
    orderAlignmentWeight: weights.orderAlignment,
    withdrawalWeight: weights.withdrawal,
    postureFitWeight: weights.postureFit,
    balancedObjectiveInfluence: 0,
    advanceObjectiveInfluence: 1,
    withdrawObjectiveInfluence: 1,
    continueOrderObjectiveInfluence: defense ? 0.5918367347 : 0.8319327731,
    wrongDirectionPenalty: 0,
    objectiveDistanceToleranceMeters: 2,
    maxPositionDanger: 78,
    maxRouteDanger: 100,
    minimumProtection: defense ? 10 : 0,
    minimumConcealment: 0,
    minimumDirectionalFit: kind === 'observation' || kind === 'firing' ? 18 : 0,
    minimumLineQuality: 18,
    minimumTargetDistanceMeters: 0,
    maximumTargetDistanceMeters: 0,
    desiredDistanceToleranceMeters: 10,
    allowStanding: true,
    allowCrouched: true,
    allowProne: true,
    requireVisualLine: false,
    requireBallisticLine: false,
    transitionPenaltyStanding: 3,
    transitionPenaltyCrouched: 3,
    transitionPenaltyProne: 7,
    postureDangerExposureWeight: 0.30,
    candidateScanLimit: 864,
    preliminaryCandidates: 36,
    exactCandidates: 12,
    exactRayLimit: 32,
    maxRouteExpansions: 1728,
    maximumRouteCost: 100000,
    objectiveCandidatePool: 12,
    minimumSeparationMeters: 4,
    maxCalculationMs: 12,
  };
}

export function normalizeTacticalPositionNodeParameters(
  value: Readonly<Record<string, unknown>> | null | undefined,
): TacticalPositionNodeParameters {
  const source = value ?? {};
  const kind = normalizeKind(source.kind);
  const objective = normalizeObjective(source.objective);
  const defaults = createDefaultTacticalPositionNodeParameters(kind, objective);
  const result: TacticalPositionNodeParameters = {};
  for (const [key, entry] of Object.entries(source)) {
    if (isParameterValue(entry)) result[key] = cloneValue(entry);
  }
  Object.assign(result, defaults);
  result.kind = kind;
  result.objective = objective;
  result.queryKey = readString(source.queryKey, defaults.queryKey as string);
  result.targetMode = source.targetMode === 'order_point' || source.targetMode === 'facing_sector' ? source.targetMode : 'automatic';
  result.targetPoint = readPosition(source.targetPoint);
  result.sectorCenterDegrees = readNumber(source.sectorCenterDegrees, 0, -360, 360);
  result.sectorArcDegrees = readNumber(source.sectorArcDegrees, 90, 1, 360);
  result.searchRadiusMeters = readNumber(source.searchRadiusMeters, 50, 1, 500);
  result.maxCandidates = readInteger(source.maxCandidates, 12, 1, 16);
  result.desiredDistanceMeters = readNumber(source.desiredDistanceMeters, 0, 0, 3000);
  for (const id of RANKING_IDS) result[id] = readNumber(source[id], defaults[id] as number, 0, 10);
  result.wrongDirectionPenalty = readNumber(source.wrongDirectionPenalty, 0, 0, 100);
  result.objectiveDistanceToleranceMeters = readNumber(source.objectiveDistanceToleranceMeters, 2, 0, 100);
  for (const id of PERCENT_IDS) result[id] = readNumber(source[id], defaults[id] as number, 0, 100);
  result.minimumTargetDistanceMeters = readNumber(source.minimumTargetDistanceMeters, 0, 0, 3000);
  result.maximumTargetDistanceMeters = readNumber(source.maximumTargetDistanceMeters, 0, 0, 5000);
  result.desiredDistanceToleranceMeters = readNumber(source.desiredDistanceToleranceMeters, 10, 0.1, 1000);
  result.allowStanding = readBoolean(source.allowStanding, true);
  result.allowCrouched = readBoolean(source.allowCrouched, true);
  result.allowProne = readBoolean(source.allowProne, true);
  if (!result.allowStanding && !result.allowCrouched && !result.allowProne) result.allowStanding = true;
  result.requireVisualLine = readBoolean(source.requireVisualLine, false);
  result.requireBallisticLine = readBoolean(source.requireBallisticLine, false);
  result.transitionPenaltyStanding = readNumber(source.transitionPenaltyStanding, 3, 0, 50);
  result.transitionPenaltyCrouched = readNumber(source.transitionPenaltyCrouched, 3, 0, 50);
  result.transitionPenaltyProne = readNumber(source.transitionPenaltyProne, 7, 0, 50);
  result.postureDangerExposureWeight = readNumber(source.postureDangerExposureWeight, 0.30, 0, 10);
  result.candidateScanLimit = readInteger(source.candidateScanLimit, 864, 64, 4096);
  result.preliminaryCandidates = readInteger(source.preliminaryCandidates, 36, 8, 128);
  result.exactCandidates = readInteger(source.exactCandidates, 12, 1, 32);
  result.exactRayLimit = readInteger(source.exactRayLimit, 32, 0, 128);
  result.maxRouteExpansions = readInteger(source.maxRouteExpansions, 1728, 64, 8192);
  result.maximumRouteCost = readNumber(source.maximumRouteCost, 100000, 1, 1_000_000);
  result.objectiveCandidatePool = readInteger(source.objectiveCandidatePool, 12, 1, 32);
  result.minimumSeparationMeters = readNumber(source.minimumSeparationMeters, 4, 0, 100);
  result.maxCalculationMs = readNumber(source.maxCalculationMs, 12, 0.1, 100);
  result.exactCandidates = Math.max(result.exactCandidates as number, result.maxCandidates as number);
  result.preliminaryCandidates = Math.max(result.preliminaryCandidates as number, result.exactCandidates as number);
  result.candidateScanLimit = Math.max(result.candidateScanLimit as number, result.preliminaryCandidates as number);
  result.objectiveCandidatePool = Math.min(
    result.exactCandidates as number,
    Math.max(result.maxCandidates as number, result.objectiveCandidatePool as number),
  );
  if ((result.maximumTargetDistanceMeters as number) > 0) {
    result.maximumTargetDistanceMeters = Math.max(
      result.maximumTargetDistanceMeters as number,
      result.minimumTargetDistanceMeters as number,
    );
  }
  return result;
}

export function readTacticalPositionNodeSettings(
  value: Readonly<Record<string, unknown>> | null | undefined,
): TacticalPositionNodeSettings {
  const p = normalizeTacticalPositionNodeParameters(value);
  const ranking = Object.freeze({
    tacticalQualityWeight: p.tacticalQualityWeight as number,
    movementObjectiveWeight: p.movementObjectiveWeight as number,
    weights: Object.freeze({
      staticPotential: p.staticPotentialWeight as number,
      directionalFit: p.directionalFitWeight as number,
      lineQuality: p.lineQualityWeight as number,
      rangeFit: p.rangeFitWeight as number,
      desiredDistance: p.desiredDistanceWeight as number,
      protection: p.protectionWeight as number,
      concealment: p.concealmentWeight as number,
      danger: p.dangerWeight as number,
      routeDanger: p.routeDangerWeight as number,
      routeCost: p.routeCostWeight as number,
      certainty: p.certaintyWeight as number,
      orderAlignment: p.orderAlignmentWeight as number,
      withdrawal: p.withdrawalWeight as number,
      postureFit: p.postureFitWeight as number,
    }),
  });
  const movementObjective = Object.freeze({
    balancedInfluence: p.balancedObjectiveInfluence as number,
    advanceToThreatInfluence: p.advanceObjectiveInfluence as number,
    withdrawFromThreatInfluence: p.withdrawObjectiveInfluence as number,
    continueOrderInfluence: p.continueOrderObjectiveInfluence as number,
    wrongDirectionPenalty: p.wrongDirectionPenalty as number,
    distanceToleranceMeters: p.objectiveDistanceToleranceMeters as number,
  });
  const constraints = Object.freeze({
    maxPositionDanger: p.maxPositionDanger as number,
    maxRouteDanger: p.maxRouteDanger as number,
    minimumProtection: p.minimumProtection as number,
    minimumConcealment: p.minimumConcealment as number,
    minimumDirectionalFit: p.minimumDirectionalFit as number,
    minimumLineQuality: p.minimumLineQuality as number,
    minimumTargetDistanceMeters: p.minimumTargetDistanceMeters as number,
    maximumTargetDistanceMeters: p.maximumTargetDistanceMeters as number,
    desiredDistanceMeters: p.desiredDistanceMeters as number,
    desiredDistanceToleranceMeters: p.desiredDistanceToleranceMeters as number,
    allowedPostures: Object.freeze({ standing: p.allowStanding as boolean, crouched: p.allowCrouched as boolean, prone: p.allowProne as boolean }),
    requireVisualLine: p.requireVisualLine as boolean,
    requireBallisticLine: p.requireBallisticLine as boolean,
  });
  const posture = Object.freeze({
    transitionPenaltyStanding: p.transitionPenaltyStanding as number,
    transitionPenaltyCrouched: p.transitionPenaltyCrouched as number,
    transitionPenaltyProne: p.transitionPenaltyProne as number,
    dangerExposureWeight: p.postureDangerExposureWeight as number,
  });
  const searchBudget = Object.freeze({
    maxCandidates: p.maxCandidates as number,
    candidateScanLimit: p.candidateScanLimit as number,
    preliminaryCandidates: p.preliminaryCandidates as number,
    exactCandidates: p.exactCandidates as number,
    exactRayLimit: p.exactRayLimit as number,
    maxRouteExpansions: p.maxRouteExpansions as number,
    maximumRouteCost: p.maximumRouteCost as number,
    objectiveCandidatePool: p.objectiveCandidatePool as number,
    minimumSeparationMeters: p.minimumSeparationMeters as number,
  });
  const search: TacticalPositionSearchSettings = Object.freeze({ version: 1, ranking, movementObjective, constraints, posture, searchBudget });
  return Object.freeze({
    version: 1,
    queryKey: p.queryKey as string,
    kind: p.kind as TacticalPositionNodeKind,
    objective: p.objective as TacticalPositionNodeObjective,
    target: Object.freeze({
      mode: p.targetMode as 'automatic' | 'order_point' | 'facing_sector',
      point: p.targetPoint ? Object.freeze({ ...(p.targetPoint as { x: number; y: number }) }) : null,
      sectorCenterDegrees: p.sectorCenterDegrees as number,
      sectorArcDegrees: p.sectorArcDegrees as number,
    }),
    searchRadiusMeters: p.searchRadiusMeters as number,
    maxCalculationMs: p.maxCalculationMs as number,
    search,
    ranking,
    movementObjective,
    constraints,
    posture,
    searchBudget,
  });
}

export function normalizeTacticalPositionSearchSettings(
  value: unknown,
  kind: TacticalPositionNodeKind = 'defense',
  objective: TacticalPositionNodeObjective = 'balanced',
): TacticalPositionSearchSettings {
  if (!isRecord(value)) return readTacticalPositionNodeSettings({ kind, objective }).search;
  const ranking = isRecord(value.ranking) ? value.ranking : {};
  const weights = isRecord(ranking.weights) ? ranking.weights : {};
  const movement = isRecord(value.movementObjective) ? value.movementObjective : {};
  const constraints = isRecord(value.constraints) ? value.constraints : {};
  const allowed = isRecord(constraints.allowedPostures) ? constraints.allowedPostures : {};
  const posture = isRecord(value.posture) ? value.posture : {};
  const budget = isRecord(value.searchBudget) ? value.searchBudget : {};
  return readTacticalPositionNodeSettings({
    kind, objective,
    tacticalQualityWeight: ranking.tacticalQualityWeight, movementObjectiveWeight: ranking.movementObjectiveWeight,
    staticPotentialWeight: weights.staticPotential, directionalFitWeight: weights.directionalFit,
    lineQualityWeight: weights.lineQuality, rangeFitWeight: weights.rangeFit,
    desiredDistanceWeight: weights.desiredDistance, protectionWeight: weights.protection,
    concealmentWeight: weights.concealment, dangerWeight: weights.danger,
    routeDangerWeight: weights.routeDanger, routeCostWeight: weights.routeCost,
    certaintyWeight: weights.certainty, orderAlignmentWeight: weights.orderAlignment,
    withdrawalWeight: weights.withdrawal, postureFitWeight: weights.postureFit,
    balancedObjectiveInfluence: movement.balancedInfluence,
    advanceObjectiveInfluence: movement.advanceToThreatInfluence,
    withdrawObjectiveInfluence: movement.withdrawFromThreatInfluence,
    continueOrderObjectiveInfluence: movement.continueOrderInfluence,
    wrongDirectionPenalty: movement.wrongDirectionPenalty,
    objectiveDistanceToleranceMeters: movement.distanceToleranceMeters,
    maxPositionDanger: constraints.maxPositionDanger, maxRouteDanger: constraints.maxRouteDanger,
    minimumProtection: constraints.minimumProtection, minimumConcealment: constraints.minimumConcealment,
    minimumDirectionalFit: constraints.minimumDirectionalFit, minimumLineQuality: constraints.minimumLineQuality,
    minimumTargetDistanceMeters: constraints.minimumTargetDistanceMeters,
    maximumTargetDistanceMeters: constraints.maximumTargetDistanceMeters,
    desiredDistanceMeters: constraints.desiredDistanceMeters,
    desiredDistanceToleranceMeters: constraints.desiredDistanceToleranceMeters,
    allowStanding: allowed.standing, allowCrouched: allowed.crouched, allowProne: allowed.prone,
    requireVisualLine: constraints.requireVisualLine, requireBallisticLine: constraints.requireBallisticLine,
    transitionPenaltyStanding: posture.transitionPenaltyStanding,
    transitionPenaltyCrouched: posture.transitionPenaltyCrouched,
    transitionPenaltyProne: posture.transitionPenaltyProne,
    postureDangerExposureWeight: posture.dangerExposureWeight,
    maxCandidates: budget.maxCandidates, candidateScanLimit: budget.candidateScanLimit,
    preliminaryCandidates: budget.preliminaryCandidates, exactCandidates: budget.exactCandidates,
    exactRayLimit: budget.exactRayLimit, maxRouteExpansions: budget.maxRouteExpansions,
    maximumRouteCost: budget.maximumRouteCost, objectiveCandidatePool: budget.objectiveCandidatePool,
    minimumSeparationMeters: budget.minimumSeparationMeters,
  }).search;
}

export function tacticalPositionSearchSettingsDigest(settings: TacticalPositionSearchSettings): string {
  return stableSerialize(normalizeTacticalPositionSearchSettings(settings));
}
export function resetTacticalPositionNodeParameter(parameters: Readonly<Record<string, unknown>>, id: string): TacticalPositionNodeParameters {
  const current = normalizeTacticalPositionNodeParameters(parameters);
  const defaults = createDefaultTacticalPositionNodeParameters(current.kind as TacticalPositionNodeKind, current.objective as TacticalPositionNodeObjective);
  if (id in defaults) current[id] = cloneValue(defaults[id]!);
  return normalizeTacticalPositionNodeParameters(current);
}
export function resetTacticalPositionNodeParameterGroup(parameters: Readonly<Record<string, unknown>>, group: TacticalPositionNodeParameterGroup): TacticalPositionNodeParameters {
  const current = normalizeTacticalPositionNodeParameters(parameters);
  const defaults = createDefaultTacticalPositionNodeParameters(current.kind as TacticalPositionNodeKind, current.objective as TacticalPositionNodeObjective);
  for (const descriptor of TACTICAL_POSITION_NODE_PARAMETER_DESCRIPTORS) {
    if (descriptor.group === group && descriptor.id in defaults) current[descriptor.id] = cloneValue(defaults[descriptor.id]!);
  }
  return normalizeTacticalPositionNodeParameters(current);
}

function normalizeKind(value: unknown): TacticalPositionNodeKind { return value === 'observation' || value === 'firing' ? value : 'defense'; }
function normalizeObjective(value: unknown): TacticalPositionNodeObjective { return value === 'advance_to_threat' || value === 'withdraw_from_threat' || value === 'continue_order' ? value : 'balanced'; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function readString(value: unknown, fallback: string): string { return typeof value === 'string' && value.trim() ? value.trim() : fallback; }
function readNumber(value: unknown, fallback: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, typeof value === 'number' && Number.isFinite(value) ? value : fallback)); }
function readInteger(value: unknown, fallback: number, minimum: number, maximum: number): number { return Math.round(readNumber(value, fallback, minimum, maximum)); }
function readBoolean(value: unknown, fallback: boolean): boolean { return typeof value === 'boolean' ? value : fallback; }
function readPosition(value: unknown): { readonly x: number; readonly y: number } | null { return isRecord(value) && typeof value.x === 'number' && Number.isFinite(value.x) && typeof value.y === 'number' && Number.isFinite(value.y) ? { x: value.x, y: value.y } : null; }
function isParameterValue(value: unknown): value is TacticalPositionNodeParameterValue { return value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value) || readPosition(value) !== null; }
function cloneValue(value: TacticalPositionNodeParameterValue): TacticalPositionNodeParameterValue { return typeof value === 'object' && value !== null ? { ...value } : value; }
function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`).join(',')}}`;
}
