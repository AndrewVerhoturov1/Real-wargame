import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';
export { selectHighestSafePosture } from './TacticalPostureEvaluation';
export type { TacticalPostureEvaluation } from './TacticalPostureEvaluation';

export interface TacticalPositionSettings {
  standingMaximumDanger: number;
  standingMinimumSafety: number;
  crouchedMaximumDanger: number;
  crouchedMinimumSafety: number;
  crouchedSafetyAdvantageThreshold: number;
  proneSafetyAdvantageThreshold: number;
  crouchedTransitionPenalty: number;
  proneTransitionPenalty: number;
  postureProtectionGainFactor: number;
  dangerReductionSafetyWeight: number;
  protectionGainSafetyWeight: number;
  minimumPositionImprovement: number;
  minimumDirectionalProtection: number;
  minimumReverseSlopeQuality: number;
  safetyWeight: number;
  lowDangerWeight: number;
  protectionWeight: number;
  concealmentWeight: number;
  safetyGainWeight: number;
  reverseSlopeWeight: number;
  routeSafetyWeight: number;
  orderAlignmentWeight: number;
  advanceToThreatWeight: number;
  withdrawFromThreatWeight: number;
  orderTargetDistanceWeight: number;
  objectiveAlignmentWeight: number;
  uncertaintyPenaltyWeight: number;
  forwardSlopePenaltyWeight: number;
  markerRefreshIntervalSeconds: number;
  emptyResultHoldSeconds: number;
  moveCrouchedToProtectedPosition: boolean;
}

export interface TacticalPositionSettingsDataV1 {
  readonly version: 1;
  readonly revision: number;
  readonly values: TacticalPositionSettings;
}

export type TacticalPositionSettingsInput =
  | Partial<TacticalPositionSettings>
  | Partial<TacticalPositionSettingsDataV1>
  | null
  | undefined;

const draftByState = new WeakMap<SimulationState, TacticalPositionSettings>();

export function createDefaultTacticalPositionSettings(): TacticalPositionSettings {
  return {
    standingMaximumDanger: 28,
    standingMinimumSafety: 60,
    crouchedMaximumDanger: 55,
    crouchedMinimumSafety: 42,
    crouchedSafetyAdvantageThreshold: 6,
    proneSafetyAdvantageThreshold: 8,
    crouchedTransitionPenalty: 2,
    proneTransitionPenalty: 4,
    postureProtectionGainFactor: 0.6,
    dangerReductionSafetyWeight: 0.72,
    protectionGainSafetyWeight: 0.25,
    minimumPositionImprovement: 3,
    minimumDirectionalProtection: 12,
    minimumReverseSlopeQuality: 30,
    safetyWeight: 0.34,
    lowDangerWeight: 0.22,
    protectionWeight: 0.2,
    concealmentWeight: 0.08,
    safetyGainWeight: 0.12,
    reverseSlopeWeight: 0.08,
    routeSafetyWeight: 0.08,
    orderAlignmentWeight: 0.04,
    advanceToThreatWeight: 0.18,
    withdrawFromThreatWeight: 0.18,
    orderTargetDistanceWeight: 0.18,
    objectiveAlignmentWeight: 0.12,
    uncertaintyPenaltyWeight: 0.04,
    forwardSlopePenaltyWeight: 0.06,
    markerRefreshIntervalSeconds: 1,
    emptyResultHoldSeconds: 1.5,
    moveCrouchedToProtectedPosition: true,
  };
}

export function cloneTacticalPositionSettings(settings: TacticalPositionSettings): TacticalPositionSettings {
  return { ...settings };
}

export function normalizeTacticalPositionSettings(value: TacticalPositionSettingsInput): TacticalPositionSettings {
  const defaults = createDefaultTacticalPositionSettings();
  const source = readValues(value);
  return {
    standingMaximumDanger: percent(source.standingMaximumDanger, defaults.standingMaximumDanger),
    standingMinimumSafety: percent(source.standingMinimumSafety, defaults.standingMinimumSafety),
    crouchedMaximumDanger: percent(source.crouchedMaximumDanger, defaults.crouchedMaximumDanger),
    crouchedMinimumSafety: percent(source.crouchedMinimumSafety, defaults.crouchedMinimumSafety),
    crouchedSafetyAdvantageThreshold: percent(
      source.crouchedSafetyAdvantageThreshold,
      defaults.crouchedSafetyAdvantageThreshold,
    ),
    proneSafetyAdvantageThreshold: percent(
      source.proneSafetyAdvantageThreshold,
      defaults.proneSafetyAdvantageThreshold,
    ),
    crouchedTransitionPenalty: bounded(source.crouchedTransitionPenalty, defaults.crouchedTransitionPenalty, 0, 50),
    proneTransitionPenalty: bounded(source.proneTransitionPenalty, defaults.proneTransitionPenalty, 0, 50),
    postureProtectionGainFactor: bounded(source.postureProtectionGainFactor, defaults.postureProtectionGainFactor, 0, 2),
    dangerReductionSafetyWeight: bounded(source.dangerReductionSafetyWeight, defaults.dangerReductionSafetyWeight, 0, 2),
    protectionGainSafetyWeight: bounded(source.protectionGainSafetyWeight, defaults.protectionGainSafetyWeight, 0, 2),
    minimumPositionImprovement: percent(source.minimumPositionImprovement, defaults.minimumPositionImprovement),
    minimumDirectionalProtection: percent(source.minimumDirectionalProtection, defaults.minimumDirectionalProtection),
    minimumReverseSlopeQuality: percent(source.minimumReverseSlopeQuality, defaults.minimumReverseSlopeQuality),
    safetyWeight: weight(source.safetyWeight, defaults.safetyWeight),
    lowDangerWeight: weight(source.lowDangerWeight, defaults.lowDangerWeight),
    protectionWeight: weight(source.protectionWeight, defaults.protectionWeight),
    concealmentWeight: weight(source.concealmentWeight, defaults.concealmentWeight),
    safetyGainWeight: weight(source.safetyGainWeight, defaults.safetyGainWeight),
    reverseSlopeWeight: weight(source.reverseSlopeWeight, defaults.reverseSlopeWeight),
    routeSafetyWeight: weight(source.routeSafetyWeight, defaults.routeSafetyWeight),
    orderAlignmentWeight: weight(source.orderAlignmentWeight, defaults.orderAlignmentWeight),
    advanceToThreatWeight: weight(source.advanceToThreatWeight, defaults.advanceToThreatWeight),
    withdrawFromThreatWeight: weight(source.withdrawFromThreatWeight, defaults.withdrawFromThreatWeight),
    orderTargetDistanceWeight: weight(source.orderTargetDistanceWeight, defaults.orderTargetDistanceWeight),
    objectiveAlignmentWeight: weight(source.objectiveAlignmentWeight, defaults.objectiveAlignmentWeight),
    uncertaintyPenaltyWeight: weight(source.uncertaintyPenaltyWeight, defaults.uncertaintyPenaltyWeight),
    forwardSlopePenaltyWeight: weight(source.forwardSlopePenaltyWeight, defaults.forwardSlopePenaltyWeight),
    markerRefreshIntervalSeconds: bounded(source.markerRefreshIntervalSeconds, defaults.markerRefreshIntervalSeconds, 0, 10),
    emptyResultHoldSeconds: bounded(source.emptyResultHoldSeconds, defaults.emptyResultHoldSeconds, 0, 15),
    moveCrouchedToProtectedPosition: typeof source.moveCrouchedToProtectedPosition === 'boolean'
      ? source.moveCrouchedToProtectedPosition
      : defaults.moveCrouchedToProtectedPosition,
  };
}

export function initializeTacticalPositionSettings(
  unit: UnitModel,
  input: TacticalPositionSettingsInput,
): void {
  unit.tacticalPositionSettings = normalizeTacticalPositionSettings(input);
  unit.tacticalPositionSettingsRevision = readRevision(input);
}

export function getTacticalPositionSettings(unit: UnitModel): TacticalPositionSettings {
  return unit.tacticalPositionSettings;
}

export function getTacticalPositionSettingsRevision(unit: UnitModel): number {
  return unit.tacticalPositionSettingsRevision;
}

export function setTacticalPositionSettings(
  unit: UnitModel,
  settings: Partial<TacticalPositionSettings>,
): TacticalPositionSettings {
  const normalized = normalizeTacticalPositionSettings(settings);
  unit.tacticalPositionSettings = normalized;
  unit.tacticalPositionSettingsRevision = Math.max(0, unit.tacticalPositionSettingsRevision) + 1;
  return normalized;
}

export function serializeTacticalPositionSettings(unit: UnitModel): TacticalPositionSettingsDataV1 {
  return {
    version: 1,
    revision: Math.max(0, Math.floor(unit.tacticalPositionSettingsRevision)),
    values: cloneTacticalPositionSettings(unit.tacticalPositionSettings),
  };
}

export function getTacticalPositionSettingsDraft(state: SimulationState): TacticalPositionSettings {
  let draft = draftByState.get(state);
  if (!draft) {
    draft = createDefaultTacticalPositionSettings();
    draftByState.set(state, draft);
  }
  return draft;
}

export function replaceTacticalPositionSettingsDraft(
  state: SimulationState,
  settings: Partial<TacticalPositionSettings>,
): TacticalPositionSettings {
  const normalized = normalizeTacticalPositionSettings(settings);
  draftByState.set(state, normalized);
  return normalized;
}

export function applyTacticalPositionSettingsDraftToUnit(
  state: SimulationState,
  unit: UnitModel,
): TacticalPositionSettings {
  return setTacticalPositionSettings(unit, getTacticalPositionSettingsDraft(state));
}

function readValues(value: TacticalPositionSettingsInput): Partial<TacticalPositionSettings> {
  if (!value || typeof value !== 'object') return {};
  const candidate = value as Partial<TacticalPositionSettingsDataV1>;
  if (candidate.version === 1 && candidate.values && typeof candidate.values === 'object') {
    return candidate.values;
  }
  return value as Partial<TacticalPositionSettings>;
}

function readRevision(value: TacticalPositionSettingsInput): number {
  if (!value || typeof value !== 'object') return 0;
  const candidate = value as Partial<TacticalPositionSettingsDataV1>;
  return candidate.version === 1 && typeof candidate.revision === 'number' && Number.isFinite(candidate.revision)
    ? Math.max(0, Math.floor(candidate.revision))
    : 0;
}

function percent(value: unknown, fallback: number): number {
  return bounded(value, fallback, 0, 100);
}

function weight(value: unknown, fallback: number): number {
  return bounded(value, fallback, 0, 2);
}

function bounded(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, numeric));
}
