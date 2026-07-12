import type { UnitModel } from '../units/UnitModel';
import type { LineOfSightProbeResult } from '../visibility/LineOfSight';
import { calculateDistanceVisibilityFactor } from '../visibility/VisibilityQuality';
import type { AttentionSample } from './AttentionModel';
import type { PerceptionStimulus } from './PerceptionStimulus';

export interface VisualSignalFactor {
  key: 'posture' | 'movement' | 'action' | 'size' | 'concealment' | 'distance'
    | 'lateral_motion' | 'attention' | 'observer' | 'transmission' | 'condition';
  multiplier: number;
  labelRu: string;
  explanationRu: string;
}

export interface VisualSignalResult {
  evidencePerSecond: number;
  factors: VisualSignalFactor[];
  explanationRu: string[];
}

export interface VisualSignalInput {
  observer: UnitModel;
  stimulus: PerceptionStimulus;
  attention: AttentionSample;
  lineOfSight: LineOfSightProbeResult;
  distanceMeters: number;
  nominalRangeMeters: number;
}

const POSTURE_MULTIPLIER = {
  standing: 1,
  crouched: 0.72,
  prone: 0.42,
} as const;

const MOVEMENT_MULTIPLIER = {
  stationary: 0.72,
  walking: 1.08,
  running: 1.45,
} as const;

const ACTION_MULTIPLIER = {
  observe: 0.9,
  move: 1.05,
  fire: 2.5,
  suppress: 3,
  reload: 0.95,
} as const;

export function evaluateVisualSignal(input: VisualSignalInput): VisualSignalResult {
  const { observer, stimulus, attention, lineOfSight } = input;
  if (!stimulus.visibleSource || lineOfSight.blocked || lineOfSight.visualTransmission <= 0) {
    return {
      evidencePerSecond: 0,
      factors: [],
      explanationRu: [lineOfSight.blocked ? `Обзор перекрыт: ${lineOfSight.blockerReasonRu}.` : 'Источник не создаёт видимый сигнал.'],
    };
  }

  const distanceMultiplier = calculateDistanceVisibilityFactor(
    input.distanceMeters,
    observer.attentionSettings.vision,
  );
  if (distanceMultiplier <= 0) {
    return {
      evidencePerSecond: 0,
      factors: [],
      explanationRu: [`Источник находится за практической дальностью обзора ${Math.round(observer.attentionSettings.vision.maximumVisualRangeMeters)} м.`],
    };
  }
  const concealmentMultiplier = Math.max(0.08, 1 - stimulus.concealment / 100);
  const lateralMultiplier = 1 + Math.max(0, Math.min(1, stimulus.lateralMotion)) * 0.25;
  const observerMultiplier = clamp(
    0.45
      + observer.soldier.condition.view / 180
      + observer.soldier.condition.attention / 220,
    0.35,
    1.45,
  );
  const fatigueMultiplier = 1 - observer.soldier.condition.fatigue * 0.004;
  const confusionMultiplier = 1 - observer.soldier.condition.confusion * 0.0045;
  const suppressionMultiplier = 1 - observer.behaviorRuntime.suppression * 0.005;
  const conditionMultiplier = clamp(fatigueMultiplier * confusionMultiplier * suppressionMultiplier, 0.22, 1);
  const sizeMultiplier = clamp(stimulus.baseSize, 0.25, 3);

  const factors: VisualSignalFactor[] = [
    factor('posture', POSTURE_MULTIPLIER[stimulus.posture], 'Поза цели', postureExplanation(stimulus.posture)),
    factor('movement', MOVEMENT_MULTIPLIER[stimulus.movement], 'Движение цели', movementExplanation(stimulus.movement)),
    factor('action', ACTION_MULTIPLIER[stimulus.action], 'Действие цели', actionExplanation(stimulus.action)),
    factor('size', sizeMultiplier, 'Размер сигнала', `Относительный размер сигнала: ×${format(sizeMultiplier)}.`),
    factor('concealment', concealmentMultiplier, 'Маскировка', `Маскировка ${Math.round(stimulus.concealment)} из 100: ×${format(concealmentMultiplier)}.`),
    factor('distance', distanceMultiplier, 'Дистанция', `Дистанция ${Math.round(input.distanceMeters)} м: ×${format(distanceMultiplier)}.`),
    factor('lateral_motion', lateralMultiplier, 'Поперечное движение', `Поперечное движение: ×${format(lateralMultiplier)}.`),
    factor('attention', attention.weight, 'Направление внимания', `${attentionZoneLabel(attention.zone)}: ×${format(attention.weight)}.`),
    factor('observer', observerMultiplier, 'Способности наблюдателя', `Зрение и внимание бойца: ×${format(observerMultiplier)}.`),
    factor('transmission', lineOfSight.visualTransmission, 'Проходимость обзора', `${lineOfSight.obscurationReasonRu}: ×${format(lineOfSight.visualTransmission)}.`),
    factor('condition', conditionMultiplier, 'Состояние бойца', `Усталость, замешательство и подавление: ×${format(conditionMultiplier)}.`),
  ];

  const combined = factors.reduce((result, item) => result * item.multiplier, 1);
  const evidencePerSecond = clamp(combined * 52, 0, 300);
  return {
    evidencePerSecond,
    factors,
    explanationRu: factors.map((item) => item.explanationRu),
  };
}

function factor(
  key: VisualSignalFactor['key'],
  multiplier: number,
  labelRu: string,
  explanationRu: string,
): VisualSignalFactor {
  return { key, multiplier, labelRu, explanationRu };
}

function postureExplanation(posture: PerceptionStimulus['posture']): string {
  if (posture === 'prone') return 'Цель лежит и показывает мало силуэта: ×0,42.';
  if (posture === 'crouched') return 'Цель пригнулась: ×0,72.';
  return 'Цель стоит в полный рост: ×1,00.';
}

function movementExplanation(movement: PerceptionStimulus['movement']): string {
  if (movement === 'running') return 'Цель бежит и хорошо выдаёт движение: ×1,45.';
  if (movement === 'walking') return 'Цель движется: ×1,08.';
  return 'Цель неподвижна: ×0,72.';
}

function actionExplanation(action: PerceptionStimulus['action']): string {
  if (action === 'suppress') return 'Длительная стрельба сильно демаскирует источник: ×3,00.';
  if (action === 'fire') return 'Выстрел сильно демаскирует источник: ×2,50.';
  if (action === 'move') return 'Активное движение слегка повышает заметность: ×1,05.';
  if (action === 'reload') return 'Перезарядка почти не меняет заметность: ×0,95.';
  return 'Спокойное наблюдение: ×0,90.';
}

function attentionZoneLabel(zone: AttentionSample['zone']): string {
  if (zone === 'focus') return 'Цель в фокусе';
  if (zone === 'direct') return 'Цель в прямом внимании';
  return 'Цель замечается косвенным вниманием';
}

function format(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
