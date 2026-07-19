import type { UnitPosture } from '../behavior/BehaviorModel';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';

export interface TacticalPositionSettings {
  standingMaximumDanger: number;
  standingMinimumSafety: number;
  crouchedMaximumDanger: number;
  crouchedMinimumSafety: number;
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
  uncertaintyPenaltyWeight: number;
  forwardSlopePenaltyWeight: number;
  markerRefreshIntervalSeconds: number;
  emptyResultHoldSeconds: number;
  moveCrouchedToProtectedPosition: boolean;
}

export interface TacticalPostureEvaluation {
  readonly posture: UnitPosture;
  readonly danger: number;
  readonly protection: number;
  readonly safety: number;
}

interface SettingsEntry {
  settings: TacticalPositionSettings;
  revision: number;
}

const settingsByUnit = new WeakMap<UnitModel, SettingsEntry>();
const draftByState = new WeakMap<SimulationState, TacticalPositionSettings>();

export function createDefaultTacticalPositionSettings(): TacticalPositionSettings {
  return {
    standingMaximumDanger: 28,
    standingMinimumSafety: 60,
    crouchedMaximumDanger: 55,
    crouchedMinimumSafety: 42,
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

export function normalizeTacticalPositionSettings(
  value: Partial<TacticalPositionSettings> | null | undefined,
): TacticalPositionSettings {
  const defaults = createDefaultTacticalPositionSettings();
  const source = value ?? {};
  return {
    standingMaximumDanger: percent(source.standingMaximumDanger, defaults.standingMaximumDanger),
    standingMinimumSafety: percent(source.standingMinimumSafety, defaults.standingMinimumSafety),
    crouchedMaximumDanger: percent(source.crouchedMaximumDanger, defaults.crouchedMaximumDanger),
    crouchedMinimumSafety: percent(source.crouchedMinimumSafety, defaults.crouchedMinimumSafety),
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
    uncertaintyPenaltyWeight: weight(source.uncertaintyPenaltyWeight, defaults.uncertaintyPenaltyWeight),
    forwardSlopePenaltyWeight: weight(source.forwardSlopePenaltyWeight, defaults.forwardSlopePenaltyWeight),
    markerRefreshIntervalSeconds: bounded(source.markerRefreshIntervalSeconds, defaults.markerRefreshIntervalSeconds, 0, 10),
    emptyResultHoldSeconds: bounded(source.emptyResultHoldSeconds, defaults.emptyResultHoldSeconds, 0, 15),
    moveCrouchedToProtectedPosition: typeof source.moveCrouchedToProtectedPosition === 'boolean'
      ? source.moveCrouchedToProtectedPosition
      : defaults.moveCrouchedToProtectedPosition,
  };
}

export function getTacticalPositionSettings(unit: UnitModel): TacticalPositionSettings {
  return ensureEntry(unit).settings;
}

export function getTacticalPositionSettingsRevision(unit: UnitModel): number {
  return ensureEntry(unit).revision;
}

export function setTacticalPositionSettings(
  unit: UnitModel,
  settings: Partial<TacticalPositionSettings>,
): TacticalPositionSettings {
  const previous = ensureEntry(unit);
  const normalized = normalizeTacticalPositionSettings(settings);
  settingsByUnit.set(unit, { settings: normalized, revision: previous.revision + 1 });
  return normalized;
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

export function selectHighestSafePosture(
  evaluations: readonly TacticalPostureEvaluation[],
  settings: TacticalPositionSettings,
): TacticalPostureEvaluation {
  const standing = evaluations.find((item) => item.posture === 'standing');
  if (
    standing
    && standing.danger <= settings.standingMaximumDanger
    && standing.safety >= settings.standingMinimumSafety
  ) return standing;

  const crouched = evaluations.find((item) => item.posture === 'crouched');
  if (
    crouched
    && crouched.danger <= settings.crouchedMaximumDanger
    && crouched.safety >= settings.crouchedMinimumSafety
  ) return crouched;

  return evaluations.find((item) => item.posture === 'prone')
    ?? crouched
    ?? standing
    ?? { posture: 'standing', danger: 100, protection: 0, safety: 0 };
}

export function tacticalPositionSettingsCacheNudge(unit: UnitModel): number {
  return getTacticalPositionSettingsRevision(unit) * 0.000001;
}

function ensureEntry(unit: UnitModel): SettingsEntry {
  let entry = settingsByUnit.get(unit);
  if (!entry) {
    entry = { settings: createDefaultTacticalPositionSettings(), revision: 0 };
    settingsByUnit.set(unit, entry);
  }
  return entry;
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
