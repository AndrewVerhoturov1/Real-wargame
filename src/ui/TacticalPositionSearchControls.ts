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
  let selectedObjective: TacticalPositionSearchObjective = 'balanced';
  const objectiveDraftByUnit = new Map<string, TacticalPositionSearchObjective>();
  let objectiveUnitId: string | null = null;

  const unmount = (): void => {
    section?.remove();
    section = null;
    status = null;
    diagnostics = null;
    objectiveSelect = null;
  };

  const render = (): void => {
    if (destroyed) return;
    if (!isTacticalPositionWorkspaceTabActive(state)) {
      unmount();
      return;
    }
    ensureMounted();
    renderStatus();
    renderDiagnostics();
  };

  const renderStatus = (): void => {
    if (!status) return;
    const unitId = state.selectedUnitId;
    if (objectiveUnitId !== unitId) {
      objectiveUnitId = unitId;
      selectedObjective = unitId
        ? objectiveDraftByUnit.get(unitId) ?? service?.readLatestForUnit(unitId)?.objective ?? 'balanced'
        : 'balanced';
      if (objectiveSelect) objectiveSelect.value = selectedObjective;
    }
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
    if (request.status === 'queued') status.textContent = 'Запрос создан.';
    else if (request.status === 'calculating' && request.reasonCode === 'field_preparing') {
      status.textContent = 'Подготавливается тактическое поле… Боец может продолжать движение.';
    } else if (request.status === 'calculating') status.textContent = 'Поиск выполняется…';
    else if (request.status === 'ready' && (request.result?.candidates.length ?? 0) > 0) {
      status.textContent = `Найдено позиций: ${request.result!.candidates.length}. Цель: ${tacticalPositionObjectiveLabelRu(request.objective)}.`;
    } else if (request.status === 'ready') status.textContent = 'Подходящие позиции не найдены.';
    else if (request.status === 'stale') status.textContent = 'Запрос устарел из-за изменения приказа или настроек.';
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
      diagnostics.innerHTML = '<span>После поиска выберите ромб, чтобы увидеть числовые показатели.</span>';
      return;
    }
    const objective = readTacticalPositionObjectiveMetrics(candidate);
    diagnostics.innerHTML = [
      metric('Поза', postureLabel(candidate.metrics.recommendedPosture)),
      metric('До угрозы', meters(objective.distanceToThreatMeters)),
      metric('Изменение дистанции', signedMeters(objective.threatDistanceDeltaMeters)),
      metric('До точки приказа', meters(objective.distanceToOrderTargetMeters)),
      metric('Соответствие цели', `${Math.round(objective.objectiveAlignment)} / 100`),
      metric('Безопасность', `${Math.round((candidate.metrics as { safety?: number }).safety ?? 0)} / 100`),
      metric('Защита', `${Math.round(candidate.metrics.protection)} / 100`),
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
    description.textContent = 'Поиск не отменяет текущий маршрут. После расчёта выберите ромб левой кнопкой или отправьте бойца правой.';

    const objectiveLabel = document.createElement('label');
    objectiveLabel.className = 'tactical-position-objective-field';
    const objectiveCaption = document.createElement('span');
    objectiveCaption.textContent = 'Цель поиска';
    objectiveSelect = document.createElement('select');
    objectiveSelect.dataset.role = 'tactical-position-objective';
    objectiveSelect.innerHTML = OBJECTIVES.map((objective) => (
      `<option value="${objective}">${escapeHtml(tacticalPositionObjectiveLabelRu(objective))}</option>`
    )).join('');
    const unitId = state.selectedUnitId;
    if (unitId) {
      selectedObjective = objectiveDraftByUnit.get(unitId)
        ?? service?.readLatestForUnit(unitId)?.objective
        ?? selectedObjective;
      objectiveUnitId = unitId;
    }
    objectiveSelect.value = selectedObjective;
    objectiveSelect.addEventListener('change', () => {
      selectedObjective = objectiveSelect?.value as TacticalPositionSearchObjective;
      const selectedUnitId = state.selectedUnitId;
      if (selectedUnitId) objectiveDraftByUnit.set(selectedUnitId, selectedObjective);
    });
    objectiveLabel.append(objectiveCaption, objectiveSelect);

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
      const request = service.enqueueCoverSearch(
        unit,
        { objective: selectedObjective },
        { forceRefresh: true },
      );
      state.editor.lastMessage = `Запрос создан: ${tacticalPositionObjectiveLabelRu(request.objective)}.`;
      renderStatus();
      onChanged();
    });

    status = document.createElement('p');
    status.className = 'tactical-position-search-status';
    status.dataset.role = 'tactical-position-search-status';

    const legend = document.createElement('p');
    legend.className = 'tactical-position-search-legend';
    legend.textContent = 'Ромб: вертикаль — стоя, угол — пригнувшись, горизонталь — лёжа. Отрицательная дельта означает продвижение к угрозе, положительная — отход.';

    diagnostics = document.createElement('div');
    diagnostics.className = 'workspace-info-grid tactical-position-metrics';
    diagnostics.dataset.role = 'tactical-position-metrics';

    section.append(title, description, objectiveLabel, button, status, legend, diagnostics);
    host.replaceChildren(section);
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

function metric(label: string, value: string): string {
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function postureLabel(value: unknown): string {
  if (value === 'prone') return 'лёжа';
  if (value === 'crouched') return 'пригнувшись';
  return 'стоя';
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
