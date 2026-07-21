import type { AwarenessWorkerFieldPayload } from '../core/knowledge/AwarenessWorldWorkerProtocol';
import { getSelectedUnit, type SimulationState } from '../core/simulation/SimulationState';
import { getTacticalPositionSearchService } from '../core/tactical/TacticalPositionSearchService';
import type { KnownThreatMemory } from '../core/units/UnitModel';
import type { CellInspectorContent, CellInspectorMetric } from './CellInspectorContent';
import {
  readDangerVisibilityExplanation,
  type DangerVisibilityExplanation,
} from './CellInspectorDangerVisibility';

const LOW_DANGER_VISIBILITY_DIAGNOSTIC_LIMIT = 20;

export function buildDetailedDangerCellInspectorContent(
  state: SimulationState,
  cellX: number,
  cellY: number,
): CellInspectorContent | null {
  if (cellX < 0 || cellY < 0 || cellX >= state.map.width || cellY >= state.map.height) return null;
  const unit = getSelectedUnit(state);
  if (!unit) return missingUnitContent();

  const prepared = getTacticalPositionSearchService(state)?.readReadyWorldField(unit.id) ?? null;
  if (!prepared) return pendingFieldContent();
  const field = prepared.field;
  const index = cellY * field.width + cellX;
  if (index < 0 || index >= field.width * field.height) return null;

  const danger = field.danger[index] ?? 0;
  const suppression = field.suppression[index] ?? 0;
  const protection = field.expectedProtectionAgainstThreat[index] ?? 0;
  const uncertainty = field.uncertainty[index] ?? 0;
  const forwardSlope = field.forwardSlopeRisk[index] ?? 0;
  const reverseSlope = field.reverseSlopeQuality[index] ?? 0;
  const threatCount = field.threatIds.length;
  const protectedThreat = resolveProtectedThreat(unit.tacticalKnowledge.threats, field, index);
  const visibility = danger <= LOW_DANGER_VISIBILITY_DIAGNOSTIC_LIMIT
    ? readDangerVisibilityExplanation(state, unit, cellX, cellY)
    : null;
  const reasons = buildDangerReasons({
    danger,
    suppression,
    protection,
    uncertainty,
    forwardSlope,
    reverseSlope,
    threatCount,
    protectedThreat,
    visibility,
  });
  const metrics: CellInspectorMetric[] = [
    { label: 'Подавление', value: score(suppression) },
    { label: 'Защита от известного огня', value: score(protection) },
    { label: 'Открытость склона', value: score(forwardSlope) },
    { label: 'Надёжность оценки', value: score(100 - uncertainty) },
    { label: 'Известных угроз', value: String(threatCount) },
  ];
  if (visibility && visibility.directionalThreatCount > 0) {
    metrics.push({
      label: 'Линии огня',
      value: visibility.potentialThreatCount === 0
        ? 'вне сектора / дальности'
        : `${visibility.clearThreatCount} открыто · ${visibility.blockedThreatCount} перекрыто`,
    });
  }

  return {
    layer: 'danger',
    title: `ОПАСНОСТЬ · КЛЕТКА ${cellX}, ${cellY}`,
    value: score(danger),
    level: dangerLevel(danger),
    reasons,
    metrics,
    note: threatCount === 0
      ? 'Это субъективная оценка бойца: отсутствие известных угроз не гарантирует безопасность.'
      : 'Оценка использует только известные выбранному бойцу угрозы и уже подготовленное поле опасности.',
  };
}

interface DangerReasonInput {
  readonly danger: number;
  readonly suppression: number;
  readonly protection: number;
  readonly uncertainty: number;
  readonly forwardSlope: number;
  readonly reverseSlope: number;
  readonly threatCount: number;
  readonly protectedThreat: KnownThreatMemory | null;
  readonly visibility: DangerVisibilityExplanation | null;
}

function buildDangerReasons(input: DangerReasonInput): string[] {
  if (input.threatCount === 0 && input.danger <= 2) {
    return [
      'Основная причина: у бойца нет известных угроз, воздействующих на эту клетку.',
      'Нулевая известная опасность не означает, что клетка объективно безопасна.',
    ];
  }

  if (input.danger <= LOW_DANGER_VISIBILITY_DIAGNOSTIC_LIMIT && input.visibility?.primaryReason) {
    return input.visibility.secondaryReason
      ? [input.visibility.primaryReason, input.visibility.secondaryReason]
      : [input.visibility.primaryReason];
  }

  const dominant = dominantDangerCause(input);
  const reasons = [`Основная причина: ${dominant}`];

  if (input.protectedThreat && input.protection >= 25) {
    reasons.push(
      `Лучшая защита клетки направлена против угрозы «${input.protectedThreat.labelRu}» и составляет ${score(input.protection)}.`,
    );
  } else if (input.threatCount > 1) {
    reasons.push(`Поле учитывает несколько известных угроз (${input.threatCount}); их воздействие суммируется.`);
  } else if (input.reverseSlope >= 45) {
    reasons.push(`Обратный склон снижает воздействие угрозы: ${score(input.reverseSlope)}.`);
  } else if (input.uncertainty >= 45) {
    reasons.push(`Данные об угрозе неточны; надёжность оценки только ${score(100 - input.uncertainty)}.`);
  } else {
    reasons.push('Итог учитывает силу известных угроз, линию огня и защиту клетки от их направления.');
  }

  return reasons;
}

function dominantDangerCause(input: DangerReasonInput): string {
  let scoreValue = input.suppression;
  let message = input.suppression >= 35
    ? `ожидается сильное подавление (${score(input.suppression)}).`
    : `клетка находится под воздействием известного огня (${score(input.danger)}).`;

  const exposureFromLowProtection = input.danger > 2 && input.protection < 50 ? 100 - input.protection : 0;
  if (exposureFromLowProtection > scoreValue) {
    scoreValue = exposureFromLowProtection;
    message = input.protection < 25
      ? `почти нет защиты от известного направления огня (${score(input.protection)}).`
      : `защита от известного огня ограничена (${score(input.protection)}).`;
  }

  if (input.forwardSlope > scoreValue) {
    scoreValue = input.forwardSlope;
    message = `прямой склон открывает клетку известному направлению огня (${score(input.forwardSlope)}).`;
  }

  const multipleThreatPressure = input.threatCount > 1 ? Math.min(100, 35 + input.threatCount * 10) : 0;
  if (multipleThreatPressure > scoreValue) {
    message = `на оценку одновременно влияют несколько известных угроз (${input.threatCount}).`;
  }

  return message;
}

function resolveProtectedThreat(
  threats: readonly KnownThreatMemory[],
  field: AwarenessWorkerFieldPayload,
  index: number,
): KnownThreatMemory | null {
  const protectedIndex = field.protectedThreatIndex[index] ?? -1;
  if (protectedIndex < 0) return null;
  const protectedThreatId = field.threatIds[protectedIndex];
  if (!protectedThreatId) return null;
  for (const threat of threats) {
    if (threat.id === protectedThreatId) return threat;
  }
  return null;
}

function pendingFieldContent(): CellInspectorContent {
  return {
    layer: 'danger',
    title: 'ОПАСНОСТЬ',
    value: 'Данные подготавливаются',
    level: 'Плашка не запускает расчёт сама',
    reasons: ['Будет показан уже готовый результат фоновой системы.'],
    metrics: [],
  };
}

function missingUnitContent(): CellInspectorContent {
  return {
    layer: 'danger',
    title: 'ОПАСНОСТЬ',
    value: 'Боец не выбран',
    level: 'Выберите бойца на карте',
    reasons: ['Опасность показывается по субъективным знаниям выбранного солдата.'],
    metrics: [],
  };
}

function score(value: number): string {
  return `${Math.round(clamp(value, 0, 100))}/100`;
}

function dangerLevel(value: number): string {
  if (value >= 70) return 'Крайне опасно';
  if (value >= 40) return 'Опасно';
  if (value > 2) return 'Умеренная опасность';
  return 'Низкая известная опасность';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}
