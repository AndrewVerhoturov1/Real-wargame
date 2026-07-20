import type { UnitPosture } from '../core/behavior/BehaviorModel';
import type { PerceptionContactMemory } from '../core/perception/PerceptionContact';
import { getSelectedUnit, type SimulationState } from '../core/simulation/SimulationState';
import {
  getSelectedUnitVisibilityField,
  sampleSelectedUnitVisibilityField,
  sampleSelectedUnitVisibilityZone,
  VISIBILITY_ZONE_CODE,
  type SelectedUnitVisibilityField,
} from '../core/visibility/SelectedUnitVisibilityField';
import type { CellInspectorContent } from './CellInspectorContent';

type ViewMemoryDebugWindow = Window & {
  __realWargameViewMemoryDebug?: { fieldRevision?: number };
};

interface MemoryFieldCacheEntry {
  readonly unitId: string;
  readonly fieldRevision: number;
  readonly field: SelectedUnitVisibilityField;
}

const fieldCacheByState = new WeakMap<SimulationState, MemoryFieldCacheEntry>();

/**
 * Reads the already prepared memory-view field once per field revision.
 * Pointer movement and Control key repeat must remain O(1) cell sampling.
 */
export function buildCachedMemoryCellInspectorContent(
  state: SimulationState,
  cellX: number,
  cellY: number,
): CellInspectorContent {
  const unit = getSelectedUnit(state);
  if (!unit) return missingUnitContent();

  const contact = bestContactAt(unit.perceptionKnowledge.contacts, cellX, cellY);
  if (contact) return contactContent(state, contact);

  const fieldRevision = (window as ViewMemoryDebugWindow).__realWargameViewMemoryDebug?.fieldRevision ?? -1;
  if (fieldRevision < 0) return pendingFieldContent();

  const field = readPreparedField(state, unit.id, fieldRevision);
  if (!field) return pendingFieldContent();

  const quality = Math.round(sampleSelectedUnitVisibilityField(field, cellX, cellY) / 255 * 100);
  const zone = sampleSelectedUnitVisibilityZone(field, cellX, cellY);
  const distanceMeters = Math.hypot(
    cellX + 0.5 - unit.position.x,
    cellY + 0.5 - unit.position.y,
  ) * state.map.metersPerCell;

  return {
    layer: 'memory',
    title: 'ОБЗОР КЛЕТКИ',
    value: score(quality),
    level: visibilityLevel(quality),
    reasons: [visibilityZoneLabel(zone)],
    metrics: [
      { label: 'Расстояние', value: `${Math.round(distanceMeters)} м` },
      { label: 'Целевая поза', value: postureLabel(field.heatmapTargetPosture) },
    ],
  };
}

function readPreparedField(
  state: SimulationState,
  unitId: string,
  fieldRevision: number,
): SelectedUnitVisibilityField | null {
  const cached = fieldCacheByState.get(state);
  if (cached?.unitId === unitId && cached.fieldRevision === fieldRevision) return cached.field;

  const field = getSelectedUnitVisibilityField(state);
  if (!field) return null;
  fieldCacheByState.set(state, { unitId, fieldRevision, field });
  return field;
}

function bestContactAt(
  contacts: readonly PerceptionContactMemory[],
  cellX: number,
  cellY: number,
): PerceptionContactMemory | null {
  let best: PerceptionContactMemory | null = null;
  for (const contact of contacts) {
    if (Math.floor(contact.lastKnownPosition.x) !== cellX || Math.floor(contact.lastKnownPosition.y) !== cellY) continue;
    if (!best || contactPriority(contact) > contactPriority(best)) best = contact;
  }
  return best;
}

function contactPriority(contact: PerceptionContactMemory): number {
  return Number(contact.visibleNow || contact.observedNow) * 1000 + contact.confidence;
}

function contactContent(state: SimulationState, contact: PerceptionContactMemory): CellInspectorContent {
  const current = contact.visibleNow || contact.observedNow;
  const age = Math.max(0, state.simulationTimeSeconds - contact.lastUpdatedSeconds);
  return {
    layer: 'memory',
    title: current ? 'ТЕКУЩИЙ КОНТАКТ' : 'КОНТАКТ В ПАМЯТИ',
    value: contact.labelRu,
    level: current ? stageLabel(contact.stage) : `Обновлено ${age.toFixed(1).replace('.', ',')} с назад`,
    reasons: contact.explanationRu.length > 0 ? contact.explanationRu.slice(0, 2) : [sourceLabel(contact.source)],
    metrics: [
      { label: 'Уверенность', value: score(contact.confidence) },
      { label: 'Погрешность', value: `±${Math.round(contact.uncertaintyCells * state.map.metersPerCell)} м` },
      { label: 'Источник', value: sourceLabel(contact.source) },
    ],
  };
}

function pendingFieldContent(): CellInspectorContent {
  return {
    layer: 'memory',
    title: 'ОБЗОР И ПАМЯТЬ',
    value: 'Данные подготавливаются',
    level: 'Плашка не запускает расчёт сама',
    reasons: ['Будет показан уже готовый результат фоновой системы.'],
    metrics: [],
  };
}

function missingUnitContent(): CellInspectorContent {
  return {
    layer: 'memory',
    title: 'ОБЗОР И ПАМЯТЬ',
    value: 'Боец не выбран',
    level: 'Выберите бойца на карте',
    reasons: ['Тактические слои показывают субъективную оценку выбранного солдата.'],
    metrics: [],
  };
}

function score(value: number): string {
  return `${Math.round(clamp(value, 0, 100))}/100`;
}

function visibilityLevel(value: number): string {
  if (value >= 75) return 'Хорошо различима';
  if (value >= 45) return 'Видна частично';
  if (value > 0) return 'Различима с трудом';
  return 'Не видна сейчас';
}

function visibilityZoneLabel(zone: number): string {
  if (zone === VISIBILITY_ZONE_CODE.rear) return 'Задняя полусфера: качество наблюдения ограничено.';
  if (zone === VISIBILITY_ZONE_CODE.near) return 'Ближняя зона внимания.';
  if (zone === VISIBILITY_ZONE_CODE.unseen) return 'Клетка вне текущего обзора или закрыта.';
  return 'Клетка находится в текущем секторе наблюдения.';
}

function postureLabel(posture: UnitPosture): string {
  if (posture === 'prone') return 'лёжа';
  if (posture === 'crouched') return 'пригнувшись';
  return 'стоя';
}

function stageLabel(stage: PerceptionContactMemory['stage']): string {
  return ({ cue: 'Слабый сигнал', suspicion: 'Подозрение', contact: 'Контакт', identified: 'Опознан', confirmed: 'Подтверждён' } as const)[stage];
}

function sourceLabel(source: PerceptionContactMemory['source']): string {
  return ({ visual: 'личное наблюдение', sound: 'звук', reported: 'доклад', fire_pressure: 'воздействие огня' } as const)[source];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}
