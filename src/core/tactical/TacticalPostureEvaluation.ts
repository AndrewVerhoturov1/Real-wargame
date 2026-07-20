import { POSTURE_EXPOSURE_MULTIPLIER, type UnitPosture } from '../behavior/BehaviorModel';
import type { TacticalPositionSettings } from './TacticalPositionSettings';

export const TACTICAL_POSTURES: readonly UnitPosture[] = ['standing', 'crouched', 'prone'];

export interface TacticalPostureFieldSample {
  readonly danger: number;
  readonly protection: number;
  readonly safety: number;
  readonly staticProtectionByPosture: Readonly<Record<UnitPosture, number>>;
}

export interface TacticalPostureEvaluation {
  readonly posture: UnitPosture;
  readonly danger: number;
  readonly protection: number;
  readonly safety: number;
}

export interface TacticalPostureEvaluationDetail extends TacticalPostureEvaluation {
  readonly transitionPenalty: number;
  readonly reasonCodes: readonly string[];
}

export interface TacticalPostureEvaluationResult {
  readonly evaluations: readonly TacticalPostureEvaluationDetail[];
  readonly recommended: TacticalPostureEvaluationDetail;
  readonly reasonCodes: readonly string[];
}

export function evaluateTacticalPostures(
  sample: TacticalPostureFieldSample,
  currentPosture: UnitPosture,
  settings: TacticalPositionSettings,
): TacticalPostureEvaluationResult {
  const baseDanger = clampPercent(sample.danger);
  const baseProtection = clampPercent(sample.protection);
  const currentStatic = clampPercent(sample.staticProtectionByPosture[currentPosture]);
  const baseSafety = clampPercent(sample.safety);
  const evaluations = TACTICAL_POSTURES.map((posture): TacticalPostureEvaluationDetail => {
    const staticProtection = clampPercent(sample.staticProtectionByPosture[posture]);
    const postureProtectionGain = Math.max(0, staticProtection - currentStatic) * settings.postureProtectionGainFactor;
    const protection = combinePercent(baseProtection, postureProtectionGain);
    const baseUncovered = Math.max(0.05, 1 - baseProtection / 100);
    const nextUncovered = Math.max(0.02, 1 - protection / 100);
    const exposureRatio = finite(
      POSTURE_EXPOSURE_MULTIPLIER[posture] / Math.max(0.05, POSTURE_EXPOSURE_MULTIPLIER[currentPosture]),
      1,
    );
    const danger = clampPercent(baseDanger * exposureRatio * nextUncovered / baseUncovered);
    const transitionPenalty = posture === currentPosture
      ? 0
      : posture === 'prone'
        ? settings.proneTransitionPenalty
        : settings.crouchedTransitionPenalty;
    const safety = clampPercent(
      baseSafety
      + (baseDanger - danger) * settings.dangerReductionSafetyWeight
      + (protection - baseProtection) * settings.protectionGainSafetyWeight
      - transitionPenalty,
    );
    return {
      posture,
      danger: roundTwo(danger),
      protection: roundTwo(protection),
      safety: roundTwo(safety),
      transitionPenalty,
      reasonCodes: postureReasonCodes(posture, danger, protection, transitionPenalty),
    };
  });
  const recommended = selectHighestSafePosture(evaluations, settings);
  return {
    evaluations,
    recommended,
    reasonCodes: [
      `recommended_posture:${recommended.posture}`,
      ...recommended.reasonCodes,
    ],
  };
}

export function selectHighestSafePosture<T extends TacticalPostureEvaluation>(
  evaluations: readonly T[],
  settings: TacticalPositionSettings,
): T {
  const standing = evaluations.find((item) => item.posture === 'standing');
  const crouched = evaluations.find((item) => item.posture === 'crouched');
  const prone = evaluations.find((item) => item.posture === 'prone');
  const standingAllowed = Boolean(standing
    && standing.danger <= settings.standingMaximumDanger
    && standing.safety >= settings.standingMinimumSafety);
  const crouchedAllowed = Boolean(crouched
    && crouched.danger <= settings.crouchedMaximumDanger
    && crouched.safety >= settings.crouchedMinimumSafety);
  let selected = standingAllowed ? standing! : crouchedAllowed ? crouched! : prone ?? crouched ?? standing;
  if (!selected) {
    return {
      posture: 'standing',
      danger: 100,
      protection: 0,
      safety: 0,
    } as T;
  }
  if (selected.posture === 'standing' && crouchedAllowed
    && crouched!.safety - selected.safety >= settings.crouchedSafetyAdvantageThreshold) {
    selected = crouched!;
  }
  if (prone && prone.safety - selected.safety >= settings.proneSafetyAdvantageThreshold) selected = prone;
  return selected;
}

export function estimatePostureSuppression(
  baseSuppression: number,
  evaluation: TacticalPostureEvaluation,
  currentPosture: UnitPosture,
): number {
  const exposureRatio = POSTURE_EXPOSURE_MULTIPLIER[evaluation.posture]
    / Math.max(0.05, POSTURE_EXPOSURE_MULTIPLIER[currentPosture]);
  return roundTwo(clampPercent(baseSuppression * exposureRatio * (1 - evaluation.protection / 100)));
}

function postureReasonCodes(
  posture: UnitPosture,
  danger: number,
  protection: number,
  transitionPenalty: number,
): string[] {
  const reasons = [`posture:${posture}`];
  if (danger >= 70) reasons.push('danger_remains_high');
  else if (danger <= 25) reasons.push('danger_reduced');
  if (protection >= 45) reasons.push('protection_effective');
  if (transitionPenalty > 0) reasons.push('posture_transition_cost');
  return reasons;
}

function combinePercent(left: number, right: number): number {
  const a = clampPercent(left) / 100;
  const b = clampPercent(right) / 100;
  return clampPercent((1 - (1 - a) * (1 - b)) * 100);
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, finite(value, 0)));
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}
