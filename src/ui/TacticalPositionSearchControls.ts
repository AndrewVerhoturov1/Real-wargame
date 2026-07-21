import type { TacticalPositionKind, TacticalPositionTargetSpec } from '../core/ai/tactical/TacticalQuery';
import type { SimulationState } from '../core/simulation/SimulationState';
import { getTacticalPositionPresentation } from '../core/tactical/SimulationTacticalPositionSelection';
import {
  readTacticalPositionObjectiveMetrics,
  tacticalPositionObjectiveLabelRu,
  type TacticalPositionSearchObjective,
} from '../core/tactical/TacticalPositionObjective';
import { getTacticalPositionSearchService } from '../core/tactical/TacticalPositionSearchService';
import {
  isTacticalPositionWorkspaceTabActive,
  subscribeTacticalPositionWorkspaceTab,
} from './TacticalPositionWorkspaceTab';

const OBJECTIVES: readonly TacticalPositionSearchObjective[] = [
  'balanced',
  'advance_to_threat',
  'withdraw_from_threat',
  'continue_order',
];
const KINDS: readonly TacticalPositionKind[] = ['observation', 'defense', 'firing'];

type TargetMode = 'order_point' | 'facing_sector';

export function installTacticalPositionSearchControls(
  state: SimulationState,
  onChanged: () => void,
): () => void {
  const service = getTacticalPositionSearchService(state);
  let destroyed = false;
  let section: HTMLElement | null = null;
  let status: HTMLElement | null = null;
  let diagnostics: HTMLElement | null = null;
  let objectiveSelect: HTMLSelectElement | null = null;
  let kindSelect: HTMLSelectElement | null = null;
  let targetModeSelect: HTMLSelectElement | null = null;
  let selectedObjective: TacticalPositionSearchObjective = 'balanced';
  let selectedKind: TacticalPositionKind = 'defense';
  let selectedTargetMode: TargetMode = 'facing_sector';
  const objectiveDraftByUnit = new Map<string, TacticalPositionSearchObjective>();
  const kindDraftByUnit = new Map<string, TacticalPositionKind>();
  const targetModeDraftByUnit = new Map<string, TargetMode>();
  let draftUnitId: string | null = null;

  const unmount = (): void => {
    section?.remove();
    section = null;
    status = null;
    diagnostics = null;
    objectiveSelect = null;
    kindSelect = null;
    targetModeSelect = null;
  };

  const render = (): void => {
    if (destroyed) return;
    if (!isTacticalPositionWorkspaceTabActive(state)) {
      unmount();
      return;
    }
    ensureMounted();
    syncDraftForSelectedUnit();
    renderStatus();
    renderDiagnostics();
  };

  const syncDraftForSelectedUnit = (): void => {
    const unitId = state.selectedUnitId;
    if (draftUnitId === unitId) return;
    draftUnitId = unitId;
    const latest = unitId ? service?.readLatestForUnit(unitId) : null;
    selectedObjective = unitId
      ? objectiveDraftByUnit.get(unitId) ?? latest?.objective ?? 'balanced'
      : 'balanced';
    selectedKind = unitId
      ? kindDraftByUnit.get(unitId) ?? canonicalKind(latest?.kind) ?? 'defense'
      : 'defense';
    selectedTargetMode = unitId
      ? targetModeDraftByUnit.get(unitId) ?? 'facing_sector'
      : 'facing_sector';
    if (objectiveSelect) objectiveSelect.value = selectedObjective;
    if (kindSelect) kindSelect.value = selectedKind;
    if (targetModeSelect) targetModeSelect.value = selectedTargetMode;
  };

  const renderStatus = (): void => {
    if (!status) return;
    const unitId = state.selectedUnitId;
    if (!unitId) {
      status.textContent = 'Выберите бойца.';
      status.dataset.state = 'idle';
      return;
    }
    const request = service?.readLatestForUnit(unitId);
    if (!request) {
      status.textContent = 'Запрос ещё не создан.';
      status.dataset.state = 'idle';
      return;
    }
    status.dataset.state = request.status;
    const kind = kindLabelRu(canonicalKind(request.kind) ?? selectedKind);
    if (request.status === 'queued') status.textContent = `Запрос создан: ${kind}.`;
    else if (request.status === 'calculating' && request.reasonCode === 'static_basis_preparing') {
      status.textContent = 'Строится постоянная основа позиций. Это может занять заметное время.';
    } else if (request.status === 'calculating' && request.reasonCode === 'field_preparing') {
      status.textContent = 'Подготавливается субъективное поле бойца. Боец может продолжать движение.';
    } else if (request.status === 'calculating') status.textContent = `Выполняется поиск: ${kind}…`;
    else if (request.status === 'ready' && (request.result?.candidates.length ?? 0) > 0) {
      status.textContent = `Найдено позиций: ${request.result!.candidates.length}. Тип: ${kind}. Цель: ${tacticalPositionObjectiveLabelRu(request.objective)}.`;
    } else if (request.status === 'ready') status.textContent = 'Подходящие позиции не найдены.';
    else if (request.status === 'stale') status.textContent = 'Запрос устарел из-за изменения задачи, знаний, карты или настроек.';
    else if (request.status === 'cancelled') status.textContent = 'Запрос отменён.';
    else status.textContent = `Ошибка: ${request.reasonRu ?? 'поиск не выполнен'}`;
  };

  const renderDiagnostics = (): void => {
    if (!diagnostics) return;
    const presentation = getTacticalPositionPresentation(state);
    const unitId = state.selectedUnitId;
    const request = unitId ? service?.readLatestForUnit(unitId) : null;
    const candidate = presentation.selected
      ?? presentation.hovered
      ?? request?.result?.candidates[0]
      ?? null;
    if (!candidate) {
      diagnostics.innerHTML = '<span>После поиска выберите метку позиции, чтобы увидеть оценку и причину выбранной позы.</span>';
      return;
    }
    const objective = readTacticalPositionObjectiveMetrics(candidate);
    const metrics = candidate.metrics as typeof candidate.metrics & {
      finalScore?: number;
      staticPotential?: number;
      directionalFit?: number;
      lineQuality?: number;
      rangeFit?: number;
      positionDanger?: number;
      uncertainty?: number;
      recommendedFacingRadians?: number;
      postureReasonRu?: string;
    };
    diagnostics.innerHTML = [
      metric('Тип', kindLabelRu(canonicalKind(candidate.kind) ?? canonicalKind(request?.kind) ?? 'defense')),
      metric('Итоговая оценка', score(metrics.finalScore ?? metrics.staticPotential)),
      metric('Поза', postureLabel(metrics.recommendedPosture)),
      metric('Причина позы', metrics.postureReasonRu ?? 'лучшая доступная поза для этой клетки'),
      metric('Направление', degrees(metrics.recommendedFacingRadians)),
      metric('Статический потенциал', score(metrics.staticPotential)),
      metric('Соответствие направлению', score(metrics.directionalFit)),
      metric('Качество линии', score(metrics.lineQuality)),
      metric('Соответствие дальности', score(metrics.rangeFit)),
      metric('Защита', score(metrics.protection)),
      metric('Скрытность', score(metrics.concealment)),
      metric('Опасность позиции', score(metrics.positionDanger ?? metrics.danger)),
      metric('Опасность маршрута', score(metrics.routeDanger)),
      metric('Неопределённость', score(metrics.uncertainty)),
      metric('До угрозы', meters(objective.distanceToThreatMeters)),
      metric('Изменение дистанции', signedMeters(objective.threatDistanceDeltaMeters)),
      metric('До точки приказа', meters(objective.distanceToOrderTargetMeters)),
      metric('Соответствие задаче', score(objective.objectiveAlignment)),
    ].join('');
  };

  const ensureMounted = (): void => {
    if (section?.isConnected) return;
    const host = document.querySelector<HTMLElement>('[data-role="tactical-position-tab-body"]');
    if (!host) return;

    section = document.createElement('section');
    section.className = 'workspace-panel-section tactical-position-search-controls';
    section.dataset.role = 'tactical-position-search-controls';

    const title = document.createElement('h3');
    title.textContent = 'Поиск тактических позиций';
    const description = document.createElement('p');
    description.textContent = 'Кнопка только создаёт запрос. Расчёт выполняется общим фоновым обработчиком и использует лишь известные бойцу угрозы.';

    const kindLabel = document.createElement('label');
    kindLabel.className = 'tactical-position-objective-field';
    const kindCaption = document.createElement('span');
    kindCaption.textContent = 'Тип позиции';
    kindSelect = document.createElement('select');
    kindSelect.dataset.role = 'tactical-position-kind';
    kindSelect.innerHTML = KINDS.map((kind) => `<option value="${kind}">${escapeHtml(kindLabelRu(kind))}</option>`).join('');
    kindSelect.value = selectedKind;
    kindSelect.addEventListener('change', () => {
      selectedKind = kindSelect?.value as TacticalPositionKind;
      const unitId = state.selectedUnitId;
      if (unitId) kindDraftByUnit.set(unitId, selectedKind);
      syncTargetModeOptions();
    });
    kindLabel.append(kindCaption, kindSelect);

    const objectiveLabel = document.createElement('label');
    objectiveLabel.className = 'tactical-position-objective-field';
    const objectiveCaption = document.createElement('span');
    objectiveCaption.textContent = 'Задача движения';
    objectiveSelect = document.createElement('select');
    objectiveSelect.dataset.role = 'tactical-position-objective';
    objectiveSelect.innerHTML = OBJECTIVES.map((objective) => (
      `<option value="${objective}">${escapeHtml(tacticalPositionObjectiveLabelRu(objective))}</option>`
    )).join('');
    objectiveSelect.value = selectedObjective;
    objectiveSelect.addEventListener('change', () => {
      selectedObjective = objectiveSelect?.value as TacticalPositionSearchObjective;
      const unitId = state.selectedUnitId;
      if (unitId) objectiveDraftByUnit.set(unitId, selectedObjective);
    });
    objectiveLabel.append(objectiveCaption, objectiveSelect);

    const targetLabel = document.createElement('label');
    targetLabel.className = 'tactical-position-objective-field';
    const targetCaption = document.createElement('span');
    targetCaption.textContent = 'Цель или сектор';
    targetModeSelect = document.createElement('select');
    targetModeSelect.dataset.role = 'tactical-position-target-mode';
    targetModeSelect.addEventListener('change', () => {
      selectedTargetMode = targetModeSelect?.value as TargetMode;
      const unitId = state.selectedUnitId;
      if (unitId) targetModeDraftByUnit.set(unitId, selectedTargetMode);
    });
    targetLabel.append(targetCaption, targetModeSelect);
    syncTargetModeOptions();

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'primary';
    button.textContent = 'Найти позиции';
    button.addEventListener('click', () => {
      const unitId = state.selectedUnitId;
      const unit = unitId ? state.units.find((candidate) => candidate.id === unitId) : null;
      if (!unit || !service) {
        state.editor.lastMessage = unit ? 'Сервис поиска тактических позиций недоступен.' : 'Сначала выберите бойца.';
        renderStatus();
        return;
      }
      objectiveDraftByUnit.set(unit.id, selectedObjective);
      kindDraftByUnit.set(unit.id, selectedKind);
      targetModeDraftByUnit.set(unit.id, selectedTargetMode);
      const target = buildTarget(state, unit.id, selectedKind, selectedTargetMode);
      if (!target) {
        state.editor.lastMessage = 'Не удалось определить точку или сектор запроса.';
        renderStatus();
        return;
      }
      const request = service.enqueueTacticalSearch(
        unit,
        selectedKind,
        {
          objective: selectedObjective,
          target,
          queryKey: `ui:${selectedKind}`,
        },
        { forceRefresh: true },
      );
      state.editor.lastMessage = `Запрос создан: ${kindLabelRu(selectedKind)}, ${tacticalPositionObjectiveLabelRu(request.objective)}.`;
      renderStatus();
      onChanged();
    });

    status = document.createElement('p');
    status.className = 'tactical-position-search-status';
    status.dataset.role = 'tactical-position-search-status';

    const legend = document.createElement('p');
    legend.className = 'tactical-position-search-legend';
    legend.textContent = 'Тип позиции и задача движения задаются отдельно. Метка показывает рекомендуемую позу и направление корпуса.';

    diagnostics = document.createElement('div');
    diagnostics.className = 'workspace-info-grid tactical-position-metrics';
    diagnostics.dataset.role = 'tactical-position-metrics';

    section.append(title, description, kindLabel, objectiveLabel, targetLabel, button, status, legend, diagnostics);
    host.replaceChildren(section);
  };

  const syncTargetModeOptions = (): void => {
    if (!targetModeSelect) return;
    const previous = selectedTargetMode;
    targetModeSelect.innerHTML = [
      `<option value="facing_sector">Автоматический сектор перед бойцом (${selectedKind === 'defense' ? 'ожидаемая угроза' : selectedKind === 'observation' ? 'наблюдение' : 'ведение огня'})</option>`,
      '<option value="order_point">Точка действующего приказа</option>',
    ].join('');
    selectedTargetMode = previous;
    targetModeSelect.value = selectedTargetMode;
  };

  const unsubscribeService = service?.subscribe(() => {
    render();
    onChanged();
  }) ?? (() => undefined);
  const unsubscribeTab = subscribeTacticalPositionWorkspaceTab(render);
  const selectionRefresh = window.setInterval(() => {
    if (!document.hidden && isTacticalPositionWorkspaceTabActive(state)) render();
  }, 300);
  render();

  return () => {
    destroyed = true;
    window.clearInterval(selectionRefresh);
    unsubscribeTab();
    unsubscribeService();
    unmount();
  };
}

function buildTarget(
  state: SimulationState,
  unitId: string,
  kind: TacticalPositionKind,
  mode: TargetMode,
): TacticalPositionTargetSpec | null {
  const unit = state.units.find((candidate) => candidate.id === unitId);
  if (!unit) return null;
  if (mode === 'order_point') {
    const point = unit.order?.target ?? unit.playerCommand?.target ?? null;
    if (!point) return null;
    if (kind === 'observation') return { mode: 'point', point: { ...point } };
    if (kind === 'firing') return { mode: 'estimated_position', point: { ...point } };
    return {
      mode: 'sector',
      bearingRadians: Math.atan2(point.y - unit.position.y, point.x - unit.position.x),
      arcRadians: Math.PI / 3,
    };
  }
  return {
    mode: 'sector',
    bearingRadians: unit.facingRadians,
    arcRadians: Math.PI / 2,
  };
}

function metric(label: string, value: string): string {
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function canonicalKind(value: unknown): TacticalPositionKind | null {
  if (value === 'observation' || value === 'firing') return value;
  if (value === 'defense' || value === 'cover') return 'defense';
  return null;
}

function kindLabelRu(kind: TacticalPositionKind): string {
  if (kind === 'observation') return 'наблюдение';
  if (kind === 'defense') return 'оборона';
  return 'огневая позиция';
}

function postureLabel(value: unknown): string {
  if (value === 'prone') return 'лёжа';
  if (value === 'crouched') return 'пригнувшись';
  return 'стоя';
}

function score(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? '—' : `${Math.round(value)} / 100`;
}

function degrees(radians: number | undefined): string {
  if (radians === undefined || !Number.isFinite(radians)) return '—';
  const normalized = ((radians * 180 / Math.PI) % 360 + 360) % 360;
  return `${Math.round(normalized)}°`;
}

function meters(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)} м`;
}

function signedMeters(value: number | null): string {
  if (value === null) return '—';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(1)} м`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character] ?? character));
}
