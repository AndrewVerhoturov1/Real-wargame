import { requestPlayerPostureTransition } from '../core/actions/PostureTransition';
import type { UnitPosture } from '../core/behavior/BehaviorModel';
import { buildUnitKnowledgeReport, type KnowledgeCover, type KnowledgeDanger } from '../core/knowledge/UnitKnowledge';
import { getCell, gridToCellLabel, type MapCell } from '../core/map/MapModel';
import { getSurfaceMaterial, getVegetationMaterial } from '../core/map/EnvironmentMaterialProfile';
import { getActiveEnvironmentProfile } from '../core/map/EnvironmentProfileRuntime';
import { buildEnvironmentSensorReport } from '../core/sensors/EnvironmentSensors';
import { getSelectedUnit, type SimulationState } from '../core/simulation/SimulationState';
import {
  getRealReliefOverlayState,
  setKnowledgeOverlayActive,
  toggleRealReliefOverlay,
} from '../core/ui/RuntimeUiState';
import type { UnitModel } from '../core/units/UnitModel';

const HUD_UPDATE_INTERVAL_MS = 250;

type GameHudTab = 'unit' | 'layers' | 'behavior' | 'sensors';

const POSTURE_OPTIONS: Array<{ posture: UnitPosture; label: string; icon: string }> = [
  { posture: 'standing', label: 'Стоя', icon: '▮' },
  { posture: 'crouched', label: 'Пригнулся', icon: '▰' },
  { posture: 'prone', label: 'Лежит', icon: '━' },
];

export function installGameHudControls(state: SimulationState): void {
  const topBar = document.createElement('div');
  topBar.className = 'top-command-bar';

  const title = document.createElement('div');
  title.className = 'top-command-title';
  title.innerHTML = '<strong>Тактическая карта</strong><span>прототип v0.3</span>';

  const modeButton = document.createElement('button');
  modeButton.type = 'button';
  modeButton.className = 'mode-toggle-button';
  modeButton.textContent = 'Режим: игра';
  modeButton.addEventListener('click', () => toggleEditorModeFromGame(state));

  const realReliefButton = document.createElement('button');
  realReliefButton.type = 'button';
  realReliefButton.className = 'hud-toggle real-relief-toggle hud-toggle-off';
  realReliefButton.textContent = 'Реальный рельеф: выкл';
  realReliefButton.title = 'Показывает плавный слой высоты, который используется в расчёте видимости.';
  realReliefButton.addEventListener('click', () => {
    toggleRealReliefOverlay(state);
  });

  const topControls = document.createElement('div');
  topControls.className = 'top-command-controls';
  moveExistingButton('#grid-toggle', topControls);
  topControls.appendChild(realReliefButton);
  moveExistingButton('#height-toggle', topControls);
  moveExistingButton('#language-toggle', topControls);

  topBar.append(title, modeButton, topControls);

  const gameShell = document.createElement('div');
  gameShell.className = 'game-hud-shell';

  const rightPanel = document.createElement('aside');
  rightPanel.className = 'game-right-panel';

  const tabRow = document.createElement('div');
  tabRow.className = 'game-tab-row';
  const tabContent = document.createElement('div');
  tabContent.className = 'game-tab-content';

  let activeTab: GameHudTab = 'unit';
  const tabButtons = new Map<GameHudTab, HTMLButtonElement>();
  for (const [tab, label] of [
    ['unit', 'Юнит'],
    ['layers', 'Слои'],
    ['behavior', 'Поведение'],
    ['sensors', 'Сенсоры'],
  ] as Array<[GameHudTab, string]>) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => {
      activeTab = tab;
      renderGameHud(state, modeButton, realReliefButton, cellStrip, unitCard, tabContent, tabButtons, activeTab);
    });
    tabButtons.set(tab, button);
    tabRow.appendChild(button);
  }

  rightPanel.append(tabRow, tabContent);

  const bottomPanel = document.createElement('section');
  bottomPanel.className = 'game-bottom-panel';
  const cellStrip = document.createElement('div');
  cellStrip.className = 'cell-readout';
  const unitCard = document.createElement('div');
  unitCard.className = 'unit-command-card';
  bottomPanel.append(cellStrip, unitCard);

  gameShell.append(rightPanel, bottomPanel);
  document.body.append(topBar, gameShell);

  window.setInterval(() => {
    renderGameHud(state, modeButton, realReliefButton, cellStrip, unitCard, tabContent, tabButtons, activeTab);
  }, HUD_UPDATE_INTERVAL_MS);
  renderGameHud(state, modeButton, realReliefButton, cellStrip, unitCard, tabContent, tabButtons, activeTab);
}

function renderGameHud(
  state: SimulationState,
  modeButton: HTMLButtonElement,
  realReliefButton: HTMLButtonElement,
  cellStrip: HTMLElement,
  unitCard: HTMLElement,
  tabContent: HTMLElement,
  tabButtons: Map<GameHudTab, HTMLButtonElement>,
  activeTab: GameHudTab,
): void {
  document.body.classList.toggle('editor-mode', state.editor.enabled);
  modeButton.textContent = state.editor.enabled ? 'Режим: редактор' : 'Режим: игра';
  modeButton.classList.toggle('mode-toggle-editor', state.editor.enabled);
  modeButton.title = state.editor.enabled ? 'Нажми, чтобы вернуться в игру' : 'Нажми, чтобы открыть редактор карты';

  const realReliefActive = getRealReliefOverlayState(state).active;
  realReliefButton.textContent = realReliefActive ? 'Реальный рельеф: вкл' : 'Реальный рельеф: выкл';
  realReliefButton.setAttribute('aria-pressed', String(realReliefActive));
  realReliefButton.classList.toggle('hud-toggle-off', !realReliefActive);

  renderCellStrip(cellStrip, state);
  renderUnitCommandCard(unitCard, state);
  renderRightTab(tabContent, state, activeTab);
  setKnowledgeOverlayActive(state, activeTab === 'layers' && !state.editor.enabled && getSelectedUnit(state) !== undefined);

  for (const [tab, button] of tabButtons) {
    button.classList.toggle('active', tab === activeTab);
  }
}

function renderCellStrip(cellStrip: HTMLElement, state: SimulationState): void {
  const hoveredCell = getHoveredCell(state);
  const cellLabel = state.mouseGridPosition
    ? gridToCellLabel(state.map, state.mouseGridPosition)
    : 'вне карты';
  const text = hoveredCell
    ? `Клетка ${cellLabel}  |  ${formatElevation(hoveredCell.height)}  |  ${formatSurface(hoveredCell)}  |  растительность: ${formatVegetation(hoveredCell)}`
    : `Клетка: ${cellLabel}`;

  updateTextIfChanged(cellStrip, text);
}

function renderUnitCommandCard(unitCard: HTMLElement, state: SimulationState): void {
  const unit = getSelectedUnit(state);

  if (!unit) {
    unitCard.innerHTML = [
      '<div class="unit-card-empty">',
      '<strong>Юнит не выбран</strong>',
      '<span>Левый клик по солдату — выбрать. Правый клик по карте — приказ движения.</span>',
      '</div>',
    ].join('');
    return;
  }

  const runtime = unit.behaviorRuntime;
  const order = unit.order
    ? `движение к ${formatMeters(distanceMeters(state, unit.position.x, unit.position.y, unit.order.target.x, unit.order.target.y))}`
    : 'нет приказа';
  const cell = getCell(state.map, Math.floor(unit.position.x), Math.floor(unit.position.y));

  unitCard.innerHTML = [
    '<div class="unit-card-main">',
    `<div><strong>${unit.labels.ru}</strong><span>${unit.id}</span></div>`,
    `<div>Состояние: <b>${runtime.state}</b></div>`,
    `<div>Поза: <b>${formatPosture(runtime.posture)}</b></div>`,
    `<div>Приказ: <b>${order}</b></div>`,
    `<div>Опасность: <b>${runtime.danger}</b> / стресс ${Math.round(runtime.stress)}</div>`,
    `<div>Высота: <b>${cell ? formatElevation(cell.height) : 'нет'}</b></div>`,
    '</div>',
    '<div class="unit-command-actions"></div>',
  ].join('');

  const actions = unitCard.querySelector<HTMLElement>('.unit-command-actions');
  if (!actions) {
    return;
  }

  for (const option of POSTURE_OPTIONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${option.icon} ${option.label}`;
    button.className = runtime.posture === option.posture ? 'active' : '';
    button.addEventListener('click', () => setManualPosture(state, unit, option.posture, option.label));
    actions.appendChild(button);
  }

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.textContent = 'Очистить приказ';
  clearButton.addEventListener('click', () => {
    unit.order = null;
    unit.behaviorRuntime.lastEvent = 'приказ очищен вручную';
  });
  actions.appendChild(clearButton);
}

function renderRightTab(tabContent: HTMLElement, state: SimulationState, activeTab: GameHudTab): void {
  const unit = getSelectedUnit(state);

  if (activeTab === 'unit') {
    tabContent.innerHTML = unit ? renderUnitTab(unit, state) : emptyTab('Выберите солдата, чтобы увидеть карточку юнита.');
    return;
  }

  if (activeTab === 'layers') {
    tabContent.innerHTML = unit ? renderLayersTab(unit, state) : emptyTab('Выберите солдата, чтобы увидеть известную ему информацию.');
    return;
  }

  if (activeTab === 'behavior') {
    tabContent.innerHTML = unit ? renderBehaviorTab(unit) : emptyTab('Выберите солдата, чтобы увидеть поведение.');
    return;
  }

  tabContent.innerHTML = unit ? renderSensorsTab(unit, state) : emptyTab('Выберите солдата, чтобы увидеть сенсоры окружения.');
}

function renderUnitTab(unit: UnitModel, state: SimulationState): string {
  const cell = getCell(state.map, Math.floor(unit.position.x), Math.floor(unit.position.y));

  return panelHtml('Карточка юнита', [
    row('Имя', unit.labels.ru),
    row('Тип', unit.type),
    row('Профиль', unit.behaviorProfile),
    row('Поза', formatPosture(unit.behaviorRuntime.posture)),
    row('Позиция', `${Math.floor(unit.position.x)}, ${Math.floor(unit.position.y)}`),
    row('Высота', cell ? formatElevation(cell.height) : 'нет'),
    row('Растительность', cell ? formatVegetation(cell) : 'нет'),
    row('Скорость', `${formatMeters(unit.speedCellsPerSecond * state.map.metersPerCell)}/сек`),
    row('Обзор', formatMeters(unit.viewRangeCells * state.map.metersPerCell)),
  ]);
}

function renderLayersTab(unit: UnitModel, state: SimulationState): string {
  const report = buildUnitKnowledgeReport(state, unit);

  return [
    '<h2>Слои / знание юнита</h2>',
    '<div class="knowledge-section">',
    '<h3>Карта знаний</h3>',
    row('Видит до', formatMeters(report.viewRangeMeters)),
    row('Известная область', formatMeters(report.knownAreaMeters)),
    row('Оверлей', 'квадрат — ближнее, круг — дальнее, красное — опасность'),
    '</div>',
    '<div class="knowledge-section">',
    '<h3>Ближние укрытия</h3>',
    renderCoverList(report.nearbyCovers, 'Ближних укрытий пока нет.'),
    '</div>',
    '<div class="knowledge-section">',
    '<h3>Укрытия для плана</h3>',
    renderCoverList(report.planCovers, 'Дальних видимых укрытий для плана пока нет.'),
    '</div>',
    '<div class="knowledge-section">',
    '<h3>Опасность</h3>',
    renderDangerList(report.dangers),
    '</div>',
  ].join('');
}

function renderCoverList(covers: KnowledgeCover[], emptyText: string): string {
  if (covers.length === 0) {
    return `<div class="knowledge-card muted">${emptyText}</div>`;
  }

  return [
    '<div class="compact-knowledge-list">',
    ...covers.map((cover) => compactCoverRow(cover)),
    '</div>',
  ].join('');
}

function renderDangerList(dangers: KnowledgeDanger[]): string {
  if (dangers.length === 0) {
    return '<div class="knowledge-card muted">Видимой или подтверждённой опасности пока нет.</div>';
  }

  return [
    '<div class="compact-knowledge-list">',
    ...dangers.map((danger) => compactDangerRow(danger)),
    '</div>',
  ].join('');
}

function compactCoverRow(cover: KnowledgeCover): string {
  return [
    `<div class="compact-knowledge-row ${cover.currentCover ? 'near-cover-row' : 'plan-cover-row'}">`,
    `<strong>${escapeHtml(cover.labelRu)}</strong>`,
    `<span>${formatMeters(cover.distanceMeters)}</span>`,
    `<b>${Math.round(cover.quality)}/100</b>`,
    `<em>${escapeHtml(cover.sourceRu)}</em>`,
    '</div>',
  ].join('');
}

function compactDangerRow(danger: KnowledgeDanger): string {
  return [
    '<div class="compact-knowledge-row danger-row">',
    `<strong>${escapeHtml(danger.labelRu)}</strong>`,
    `<span>${formatMeters(danger.distanceMeters)}</span>`,
    `<b>${danger.strength}/100</b>`,
    `<em>${escapeHtml(danger.sourceRu)}</em>`,
    '</div>',
  ].join('');
}

function renderBehaviorTab(unit: UnitModel): string {
  const runtime = unit.behaviorRuntime;

  return panelHtml('Поведение', [
    row('Состояние', `${runtime.state} / было ${runtime.previousState}`),
    row('Поза', `${formatPosture(runtime.posture)} / было ${formatPosture(runtime.previousPosture)}`),
    row('Действие', runtime.currentAction),
    row('Причина', runtime.reason),
    row('Почему состояние', runtime.stateChangedBecause),
    row('Почему поза', runtime.postureChangedBecause),
    row('Последнее событие', runtime.lastEvent ?? 'нет'),
  ]);
}

function renderSensorsTab(unit: UnitModel, state: SimulationState): string {
  const report = buildEnvironmentSensorReport(state, unit);
  const bestCover = report.bestCoverNearby;
  const threat = report.knownThreat;

  return panelHtml('Сенсоры окружения', [
    row('Опасность', String(report.danger)),
    row('Напряжение зоны', `${report.zoneStressPerSecond}/сек`),
    row('Укрытие', String(report.cover)),
    row('Скрытность', String(report.concealment)),
    row('Открытость', String(report.openness)),
    row('Лучшее укрытие', bestCover.exists ? `${bestCover.quality}, ${formatMeters(bestCover.distanceCells * state.map.metersPerCell)}` : 'нет'),
    row('Угроза', threat.exists ? `${threat.label}, ${formatMeters(threat.distanceCells * state.map.metersPerCell)}` : 'нет'),
  ]);
}

function setManualPosture(state: SimulationState, unit: UnitModel, posture: UnitPosture, label: string): void {
  const result = requestPlayerPostureTransition(unit, posture, state.simulationTimeSeconds);
  unit.behaviorRuntime.reason = result.accepted
    ? `Принят приказ изменить позу: ${label}.`
    : result.reasonRu;
}

function toggleEditorModeFromGame(state: SimulationState): void {
  state.editor.enabled = !state.editor.enabled;
  state.editor.panelOpen = state.editor.enabled;
  state.editor.drag = null;
  state.editor.tool = 'select';
  setKnowledgeOverlayActive(state, false);
  state.editor.lastMessage = state.editor.enabled
    ? 'Редактор включён через верхнюю плашку режима.'
    : 'Редактор выключен через верхнюю плашку режима.';
}

function getHoveredCell(state: SimulationState): MapCell | undefined {
  if (!state.mouseGridPosition) {
    return undefined;
  }

  return getCell(state.map, Math.floor(state.mouseGridPosition.x), Math.floor(state.mouseGridPosition.y));
}

function panelHtml(title: string, rows: string[]): string {
  return [`<h2>${title}</h2>`, '<div class="game-panel-rows">', ...rows, '</div>'].join('');
}

function row(label: string, value: string): string {
  return `<div class="game-panel-row"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`;
}

function emptyTab(text: string): string {
  return `<div class="empty-tab">${escapeHtml(text)}</div>`;
}

function moveExistingButton(selector: string, target: HTMLElement): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (element) {
    target.appendChild(element);
  }
}

function distanceMeters(state: SimulationState, x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x1 - x2, y1 - y2) * state.map.metersPerCell;
}

function formatMeters(value: number): string {
  return `${Math.round(value)} м`;
}

function formatElevation(height: number): string {
  const prefix = height > 0 ? '+' : '';
  const names: Record<number, string> = {
    [-2]: 'глубокая низина',
    [-1]: 'низина',
    0: 'ровно',
    1: 'подъём',
    2: 'холм',
    3: 'высота',
    4: 'гребень',
  };
  return `${prefix}${height} ${names[height] ?? ''}`.trim();
}

function formatSurface(cell: MapCell): string {
  return getSurfaceMaterial(getActiveEnvironmentProfile(), cell.surfaceMaterialId).nameRu.toLowerCase();
}

function formatVegetation(cell: MapCell): string {
  const material = getVegetationMaterial(getActiveEnvironmentProfile(), cell.vegetationMaterialId);
  return material.id === 'none' ? 'нет' : material.nameRu.toLowerCase();
}

function formatPosture(posture: UnitPosture): string {
  switch (posture) {
    case 'crouched':
      return 'пригнулся';
    case 'prone':
      return 'лежит';
    case 'standing':
    default:
      return 'стоит';
  }
}

function updateTextIfChanged(element: HTMLElement, nextText: string): void {
  if (element.textContent !== nextText) {
    element.textContent = nextText;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
