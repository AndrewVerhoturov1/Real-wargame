import type { UnitPosture } from '../core/behavior/BehaviorModel';
import type { AwarenessWorkerFieldPayload } from '../core/knowledge/AwarenessWorldWorkerProtocol';
import { getCell } from '../core/map/MapModel';
import { getSurfaceMaterial, getVegetationMaterial } from '../core/map/EnvironmentMaterialProfile';
import { getActiveEnvironmentProfile } from '../core/map/EnvironmentProfileRuntime';
import { buildUnitTacticalRouteContext, resolveUnitNavigationProfile } from '../core/navigation/NavigationRuntime';
import { readRouteCostCell, type RouteCostCellBreakdown } from '../core/navigation/RouteCostField';
import { getRouteCostOverlayState } from '../core/navigation/RouteCostOverlayState';
import { getOrRequestAsyncRouteCostFields } from '../core/navigation/RouteCostWorkerClient';
import type { PerceptionContactMemory } from '../core/perception/PerceptionContact';
import { getSelectedUnit, type SimulationState } from '../core/simulation/SimulationState';
import { findVisibleTacticalPositionAt, getTacticalPositionPresentation } from '../core/tactical/SimulationTacticalPositionSelection';
import { getTacticalPositionSearchService } from '../core/tactical/TacticalPositionSearchService';
import { sampleSmoothHeightLevel } from '../core/terrain/SmoothTerrain';
import { getSimulationLayerState } from '../core/ui/RuntimeUiState';
import {
  getSelectedUnitVisibilityField,
  sampleSelectedUnitVisibilityField,
  sampleSelectedUnitVisibilityZone,
  VISIBILITY_ZONE_CODE,
} from '../core/visibility/SelectedUnitVisibilityField';

export type CellInspectorLayer = 'info' | 'danger' | 'positions' | 'stealth' | 'memory' | 'routeCost';

export interface CellInspectorMetric {
  readonly label: string;
  readonly value: string;
}

export interface CellInspectorContent {
  readonly layer: CellInspectorLayer;
  readonly title: string;
  readonly value: string;
  readonly level: string;
  readonly reasons: readonly string[];
  readonly metrics: readonly CellInspectorMetric[];
  readonly note?: string;
}

type RouteCostDebugWindow = Window & {
  __realWargameRouteCostDebug?: { preparationStatus?: 'idle' | 'pending' | 'ready' | 'unavailable' };
};

export function resolveCellInspectorLayer(state: SimulationState): CellInspectorLayer {
  const mode = String(getSimulationLayerState(state).mode);
  if (mode === 'routeCost') return 'routeCost';
  if (mode === 'danger' || mode === 'positions' || mode === 'stealth' || mode === 'memory') return mode;
  return getRouteCostOverlayState(state).active ? 'routeCost' : 'info';
}

export function buildCellInspectorContent(
  state: SimulationState,
  layer: CellInspectorLayer,
  cellX: number,
  cellY: number,
): CellInspectorContent | null {
  if (!insideMap(state, cellX, cellY)) return null;
  if (layer === 'info') return buildInfoContent(state, cellX, cellY);
  const unit = getSelectedUnit(state);
  if (!unit) return missingUnitContent(layer);
  if (layer === 'positions') return buildPositionContent(state, cellX, cellY);
  if (layer === 'memory') return buildMemoryContent(state, unit, cellX, cellY);
  if (layer === 'routeCost') return buildRouteCostContent(state, unit, cellX, cellY);
  const prepared = getTacticalPositionSearchService(state)?.readReadyWorldField(unit.id) ?? null;
  if (!prepared) return pendingFieldContent(layer);
  const field = prepared.field;
  const index = cellY * field.width + cellX;
  if (index < 0 || index >= field.width * field.height) return null;
  return layer === 'danger'
    ? buildDangerContent(state, unit.id, field, index)
    : buildStealthContent(state, unit.behaviorRuntime.posture, field, index, cellX, cellY);
}

function buildInfoContent(state: SimulationState, cellX: number, cellY: number): CellInspectorContent {
  const cell = getCell(state.map, cellX, cellY)!;
  const profile = getActiveEnvironmentProfile();
  const surface = getSurfaceMaterial(profile, cell.surfaceMaterialId);
  const vegetation = getVegetationMaterial(profile, cell.vegetationMaterialId);
  const height = sampleSmoothHeightLevel(state.map, cellX + 0.5, cellY + 0.5);
  return {
    layer: 'info',
    title: `КЛЕТКА ${cellX}, ${cellY}`,
    value: vegetation.id === 'none' ? surface.nameRu : `${surface.nameRu} · ${vegetation.nameRu}`,
    level: surface.movement.passable ? 'Проходимая местность' : 'Непроходимая местность',
    reasons: [vegetation.id === 'none' ? 'Растительности нет.' : `Растительность: ${vegetation.nameRu.toLowerCase()}.`],
    metrics: [
      { label: 'Высота', value: formatHeight(height) },
      { label: 'Физическая цена', value: formatDecimal(surface.movement.physicalCost) },
      { label: 'Сопротивление', value: formatDecimal(surface.movement.resistance * vegetation.movement.resistance) },
      { label: 'Размер клетки', value: `${formatDecimal(state.map.metersPerCell)} м` },
    ],
  };
}

function buildDangerContent(
  state: SimulationState,
  unitId: string,
  field: AwarenessWorkerFieldPayload,
  index: number,
): CellInspectorContent {
  const danger = field.danger[index] ?? 0;
  const suppression = field.suppression[index] ?? 0;
  const protection = field.expectedProtectionAgainstThreat[index] ?? 0;
  const uncertainty = field.uncertainty[index] ?? 0;
  const forwardSlope = field.forwardSlopeRisk[index] ?? 0;
  const reverseSlope = field.reverseSlopeQuality[index] ?? 0;
  const unit = state.units.find((candidate) => candidate.id === unitId);
  const threatText = threatSummary(unit?.tacticalKnowledge.threats ?? [], field.threatIds);
  const reasons = rankedReasons([
    [suppression, suppression >= 35 ? 'Сильное ожидаемое подавление.' : ''],
    [100 - protection, danger >= 35 && protection < 35 ? 'Слабая защита от известного направления огня.' : ''],
    [forwardSlope, forwardSlope >= 35 ? 'Прямой склон повышает открытость позиции.' : ''],
    [reverseSlope, reverseSlope >= 45 ? 'Обратный склон частично снижает опасность.' : ''],
    [uncertainty, uncertainty >= 45 ? 'Положение угроз известно неточно.' : ''],
  ]);
  if (danger <= 2 && field.threatIds.length === 0) reasons.unshift('У бойца нет известных угроз, воздействующих на клетку.');
  else if (threatText) reasons.unshift(threatText);
  return {
    layer: 'danger',
    title: 'ОПАСНОСТЬ',
    value: score(danger),
    level: dangerLevel(danger),
    reasons: reasons.slice(0, 2),
    metrics: [
      { label: 'Подавление', value: score(suppression) },
      { label: 'Защита от угрозы', value: score(protection) },
      { label: 'Точность оценки', value: score(100 - uncertainty) },
    ],
    note: field.threatIds.length === 0 ? 'Нет известных угроз не означает объективную безопасность.' : undefined,
  };
}

function buildStealthContent(
  state: SimulationState,
  posture: UnitPosture,
  field: AwarenessWorkerFieldPayload,
  index: number,
  cellX: number,
  cellY: number,
): CellInspectorContent {
  const concealment = field.concealment[index] ?? 0;
  const safety = field.safety[index] ?? 0;
  const protection = field.expectedProtection[index] ?? 0;
  const reverseSlope = field.reverseSlopeQuality[index] ?? 0;
  const forwardSlope = field.forwardSlopeRisk[index] ?? 0;
  const cell = getCell(state.map, cellX, cellY)!;
  const vegetation = getVegetationMaterial(getActiveEnvironmentProfile(), cell.vegetationMaterialId);
  const reasons = rankedReasons([
    [concealment, vegetation.id !== 'none' ? `${vegetation.nameRu} скрывает силуэт.` : ''],
    [reverseSlope, reverseSlope >= 40 ? 'Обратный склон скрывает позицию от известных направлений угрозы.' : ''],
    [forwardSlope, forwardSlope >= 35 ? 'Прямой склон делает позицию заметнее.' : ''],
    [100 - concealment, concealment < 25 ? 'Открытая клетка почти не маскирует бойца.' : ''],
  ]);
  return {
    layer: 'stealth',
    title: 'СКРЫТНОСТЬ',
    value: score(concealment),
    level: stealthLevel(concealment),
    reasons: reasons.slice(0, 2),
    metrics: [
      { label: 'Заметность', value: score(100 - concealment) },
      { label: 'Поза', value: postureLabel(posture) },
      { label: 'Защита от пуль', value: score(protection) },
      { label: 'Безопасность', value: score(safety) },
    ],
    note: 'Маскировка скрывает бойца, но не обязательно останавливает пули.',
  };
}

function buildPositionContent(state: SimulationState, cellX: number, cellY: number): CellInspectorContent {
  const point = { x: cellX + 0.5, y: cellY + 0.5 };
  const candidate = findVisibleTacticalPositionAt(state, point);
  if (!candidate) {
    const ready = getTacticalPositionSearchService(state)?.readLatestForUnit(state.selectedUnitId ?? '') ?? null;
    return {
      layer: 'positions',
      title: 'ТАКТИЧЕСКАЯ ПОЗИЦИЯ',
      value: 'Обычная клетка',
      level: ready?.status === 'calculating' || ready?.status === 'queued' ? 'Поиск ещё выполняется' : 'Не входит в найденные позиции',
      reasons: ['Текущий поиск не предложил эту клетку как одну из лучших позиций.'],
      metrics: [],
    };
  }
  const presentation = getTacticalPositionPresentation(state);
  const rank = Math.max(1, presentation.candidates.findIndex((item) => item.id === candidate.id) + 1);
  const metrics = candidate.metrics as typeof candidate.metrics & {
    safety?: number;
    danger?: number;
    suppression?: number;
    routeCost?: number;
    safetyGain?: number;
  };
  const reasons = [candidate.source.labelRu];
  if (candidate.metrics.slopeType === 'reverse') reasons.push('Обратный склон улучшает защищённость.');
  if (candidate.metrics.blocksThreat) reasons.push('Позиция закрывает известное направление угрозы.');
  return {
    layer: 'positions',
    title: `ТАКТИЧЕСКАЯ ПОЗИЦИЯ · №${rank}`,
    value: candidate.source.labelRu,
    level: `Рекомендуемая поза: ${postureLabel(metrics.recommendedPosture ?? 'standing')}`,
    reasons: reasons.slice(0, 2),
    metrics: [
      { label: 'Безопасность', value: score(metrics.safety ?? 0) },
      { label: 'Защита', value: score(candidate.metrics.protection) },
      { label: 'Маскировка', value: score(candidate.metrics.concealment) },
      { label: 'Опасность пути', value: score(candidate.metrics.routeDanger) },
    ],
    note: `До позиции: ${Math.round(candidate.metrics.distanceMeters)} м.`,
  };
}

function buildMemoryContent(
  state: SimulationState,
  unit: NonNullable<ReturnType<typeof getSelectedUnit>>,
  cellX: number,
  cellY: number,
): CellInspectorContent {
  const contact = bestContactAt(unit.perceptionKnowledge.contacts, cellX, cellY);
  if (contact) return contactContent(state, contact);
  const diagnostics = (window as Window & { __realWargameViewMemoryDebug?: { fieldRevision?: number } }).__realWargameViewMemoryDebug;
  if ((diagnostics?.fieldRevision ?? -1) < 0) return pendingFieldContent('memory');
  const field = getSelectedUnitVisibilityField(state);
  if (!field) return pendingFieldContent('memory');
  const quality = Math.round(sampleSelectedUnitVisibilityField(field, cellX, cellY) / 255 * 100);
  const zone = sampleSelectedUnitVisibilityZone(field, cellX, cellY);
  const distanceMeters = Math.hypot(cellX + 0.5 - unit.position.x, cellY + 0.5 - unit.position.y) * state.map.metersPerCell;
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

function buildRouteCostContent(
  state: SimulationState,
  unit: NonNullable<ReturnType<typeof getSelectedUnit>>,
  cellX: number,
  cellY: number,
): CellInspectorContent {
  const debug = (window as RouteCostDebugWindow).__realWargameRouteCostDebug;
  if (debug?.preparationStatus !== 'ready') return pendingFieldContent('routeCost');
  const resolved = resolveUnitNavigationProfile(unit);
  const context = buildUnitTacticalRouteContext(unit, {
    freshness: 'coalesced',
    metersPerCell: state.map.metersPerCell,
  });
  const prepared = getOrRequestAsyncRouteCostFields(state.map, resolved.profile, context);
  if (prepared.status !== 'ready') return pendingFieldContent('routeCost');
  const cell = readRouteCostCell(prepared.fields, cellX, cellY);
  if (!cell) return pendingFieldContent('routeCost');
  if (!cell.passable) {
    return {
      layer: 'routeCost',
      title: 'СТОИМОСТЬ МАРШРУТА',
      value: 'Непроходимо',
      level: resolved.profile.nameRu,
      reasons: ['Выбранный профиль движения не может пройти через эту клетку.'],
      metrics: [],
    };
  }
  return routeCostCellContent(resolved.profile.nameRu, cell, getRouteCostOverlayState(state).mode);
}

function routeCostCellContent(profileName: string, cell: RouteCostCellBreakdown, mode: string): CellInspectorContent {
  const baseOnly = mode === 'baseTerrain';
  const value = baseOnly ? cell.terrainCost + cell.slopeCost + cell.coverAdjustment : cell.totalCost;
  const contributions: Array<[number, string, string]> = [
    [cell.terrainCost, 'Местность', signed(cell.terrainCost)],
    [cell.slopeCost, 'Уклон', signed(cell.slopeCost)],
    [cell.dangerCost, 'Опасность', cell.availability.danger ? signed(cell.dangerCost) : 'нет данных'],
    [cell.exposureCost, 'Открытость', cell.availability.exposure ? signed(cell.exposureCost) : 'нет данных'],
    [cell.directionalTerrainCost, 'Рельеф', cell.availability.directionalTerrain ? signed(cell.directionalTerrainCost) : 'нет данных'],
    [cell.coverAdjustment, 'Укрытие / маскировка', signed(cell.coverAdjustment)],
    [cell.enemyDistanceCost, 'Близость противника', cell.availability.enemyDistance ? signed(cell.enemyDistanceCost) : 'нет данных'],
    [cell.territoryCost, 'Территория', cell.availability.territory ? signed(cell.territoryCost) : 'нет данных'],
  ];
  const visible = (baseOnly ? contributions.slice(0, 2).concat(contributions.slice(5, 6)) : contributions)
    .filter((item) => Number.isFinite(item[0]) && Math.abs(item[0]) > 0.0005)
    .sort((left, right) => Math.abs(right[0]) - Math.abs(left[0]))
    .slice(0, 3);
  const main = visible[0];
  return {
    layer: 'routeCost',
    title: baseOnly ? 'БАЗОВАЯ СТОИМОСТЬ' : 'ИТОГОВАЯ СТОИМОСТЬ',
    value: formatDecimal(value),
    level: costLevel(value),
    reasons: [main ? `${main[1]} сильнее всего влияет на цену клетки.` : 'Заметных дополнительных факторов нет.'],
    metrics: visible.map((item) => ({ label: item[1], value: item[2] })),
    note: `Профиль: ${profileName}.`,
  };
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

function bestContactAt(contacts: readonly PerceptionContactMemory[], cellX: number, cellY: number): PerceptionContactMemory | null {
  return contacts
    .filter((contact) => Math.floor(contact.lastKnownPosition.x) === cellX && Math.floor(contact.lastKnownPosition.y) === cellY)
    .sort((left, right) => Number(right.visibleNow || right.observedNow) - Number(left.visibleNow || left.observedNow)
      || right.confidence - left.confidence)[0] ?? null;
}

function threatSummary(
  threats: readonly { id: string; labelRu: string }[],
  threatIds: readonly string[],
): string {
  if (threatIds.length === 0) return '';
  if (threatIds.length > 1) return `На клетку влияют несколько известных угроз (${threatIds.length}).`;
  const threat = threats.find((item) => item.id === threatIds[0]);
  return threat ? `Известная угроза: ${threat.labelRu}.` : 'На клетку воздействует известная бойцу угроза.';
}

function pendingFieldContent(layer: CellInspectorLayer): CellInspectorContent {
  return {
    layer,
    title: layerTitle(layer),
    value: 'Данные подготавливаются',
    level: 'Плашка не запускает расчёт сама',
    reasons: ['Будет показан уже готовый результат фоновой системы.'],
    metrics: [],
  };
}

function missingUnitContent(layer: CellInspectorLayer): CellInspectorContent {
  return {
    layer,
    title: layerTitle(layer),
    value: 'Боец не выбран',
    level: 'Выберите бойца на карте',
    reasons: ['Тактические слои показывают субъективную оценку выбранного солдата.'],
    metrics: [],
  };
}

function rankedReasons(items: ReadonlyArray<readonly [number, string]>): string[] {
  const result = items.filter((item) => item[1]).sort((left, right) => right[0] - left[0]).map((item) => item[1]);
  return result.length > 0 ? result : ['Заметных дополнительных факторов нет.'];
}

function insideMap(state: SimulationState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < state.map.width && y < state.map.height;
}

function layerTitle(layer: CellInspectorLayer): string {
  return ({ info: 'ИНФОРМАЦИЯ', danger: 'ОПАСНОСТЬ', positions: 'ТАКТИЧЕСКИЕ ПОЗИЦИИ', stealth: 'СКРЫТНОСТЬ', memory: 'ОБЗОР И ПАМЯТЬ', routeCost: 'СТОИМОСТЬ МАРШРУТА' } as const)[layer];
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

function stealthLevel(value: number): string {
  if (value >= 75) return 'Очень трудно заметить';
  if (value >= 50) return 'Хорошая скрытность';
  if (value >= 25) return 'Заметен';
  return 'Хорошо заметен';
}

function visibilityLevel(value: number): string {
  if (value >= 75) return 'Хорошо различима';
  if (value >= 45) return 'Видна частично';
  if (value > 0) return 'Различима с трудом';
  return 'Не видна сейчас';
}

function costLevel(value: number): string {
  if (!Number.isFinite(value)) return 'Непроходимо';
  if (value <= 0.85) return 'Выгодно';
  if (value <= 1.25) return 'Нормально';
  if (value <= 2) return 'Дорого';
  return 'Крайне дорого';
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

function formatHeight(value: number): string {
  const normalized = Math.abs(value) < 0.05 ? 0 : value;
  return `${normalized > 0 ? '+' : ''}${normalized.toFixed(1).replace('.', ',')}`;
}

function signed(value: number): string {
  if (!Number.isFinite(value)) return 'недоступно';
  return `${value > 0.0005 ? '+' : ''}${formatDecimal(value)}`;
}

function formatDecimal(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2).replace('.', ',') : '∞';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}
