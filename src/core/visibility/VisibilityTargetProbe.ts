import type { GridPosition } from '../geometry';
import type { TacticalMap } from '../map/MapModel';
import { resolveVegetationDefinition } from '../map/VegetationDefinition';
import type { UnitModel } from '../units/UnitModel';
import {
  traceVisibilityRay,
  type VisibilityTraceResult,
} from './VisibilityRayKernel';
import { soldierPostureHeightMeters } from './VisibilityPosture';

export const VISIBILITY_SILHOUETTE_VERSION = 1;
const SAMPLE_FRACTIONS = [0.3, 0.6, 0.9] as const;

export interface VisibilitySilhouetteSample {
  readonly heightFraction: 0.3 | 0.6 | 0.9;
  readonly heightMeters: number;
  readonly trace: VisibilityTraceResult;
}

export interface VisibilityTargetProbeResult {
  readonly origin: GridPosition;
  readonly target: GridPosition;
  readonly targetHeightMeters: number;
  readonly samples: readonly VisibilitySilhouetteSample[];
  readonly visibleSampleCount: number;
  readonly visibleFraction: number;
  readonly bestVisibleSampleHeightMeters: number | null;
  readonly blocked: boolean;
  readonly visualTransmission: number;
  readonly fireTransmission: number;
  readonly physicalRayCount: 3;
  readonly explanationRu: string[];
}

export function probeTargetVisibility(
  map: TacticalMap,
  observer: Pick<UnitModel, 'position' | 'behaviorRuntime'>,
  target: GridPosition,
  targetHeightMeters: number,
): VisibilityTargetProbeResult {
  const normalizedHeight = Math.max(0.05, Number.isFinite(targetHeightMeters) ? targetHeightMeters : 0.05);
  const originHeight = soldierPostureHeightMeters(observer.behaviorRuntime.posture);
  const samples: VisibilitySilhouetteSample[] = SAMPLE_FRACTIONS.map((heightFraction) => {
    const heightMeters = normalizedHeight * heightFraction;
    return {
      heightFraction,
      heightMeters,
      trace: traceVisibilityRay(map, {
        origin: observer.position,
        target,
        originHeightAboveGroundMeters: originHeight,
        targetHeightAboveGroundMeters: heightMeters,
        channel: 'visual',
      }),
    };
  });
  const visible = samples.filter((sample) => !sample.trace.hardBlocked);
  const visualTransmission = samples.reduce(
    (sum, sample) => sum + (sample.trace.hardBlocked ? 0 : sample.trace.visualTransmission),
    0,
  ) / samples.length;
  const fireTransmission = samples.reduce(
    (sum, sample) => sum + (sample.trace.hardBlocked ? 0 : sample.trace.fireTransmission),
    0,
  ) / samples.length;
  const minimumVisualTransmission = resolveVegetationDefinition('none').visibility.minimumTransmission;
  const blocked = visible.length === 0 || visualTransmission <= minimumVisualTransmission;
  return {
    origin: { ...observer.position },
    target: { ...target },
    targetHeightMeters: normalizedHeight,
    samples,
    visibleSampleCount: visible.length,
    visibleFraction: visible.length / samples.length,
    bestVisibleSampleHeightMeters: visible.length > 0 ? visible[visible.length - 1]!.heightMeters : null,
    blocked,
    visualTransmission: clamp01(visualTransmission),
    fireTransmission: clamp01(fireTransmission),
    physicalRayCount: 3,
    explanationRu: buildSilhouetteExplanation(samples, visible.length, visualTransmission, blocked),
  };
}

function buildSilhouetteExplanation(
  samples: readonly VisibilitySilhouetteSample[],
  visibleSampleCount: number,
  visualTransmission: number,
  blocked: boolean,
): string[] {
  const blockedLabels = samples
    .filter((sample) => sample.trace.hardBlocked)
    .map((sample) => `${Math.round(sample.heightFraction * 100)}%: ${sample.trace.reasonRu}`);
  const result = [
    `Видимая часть силуэта: ${visibleSampleCount} из ${samples.length} уровней.`,
    `Средняя проходимость по силуэту: ${Math.round(visualTransmission * 100)}%.`,
  ];
  if (blocked) result.push('Весь полезный силуэт цели закрыт.');
  else if (visibleSampleCount < samples.length) result.push('Цель видна частично из-за укрытия или рельефа.');
  if (blockedLabels.length > 0) result.push(`Перекрытые уровни: ${blockedLabels.join('; ')}.`);
  return result;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
