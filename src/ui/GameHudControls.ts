import type { UnitPosture } from '../core/behavior/BehaviorModel';
import { buildEnvironmentSensorReport } from '../core/sensors/EnvironmentSensors';
import { getCell, gridToCellLabel, type MapCell } from '../core/map/MapModel';
import { getSelectedUnit, type SimulationState } from '../core/simulation/SimulationState';
import type { UnitModel } from '../core/units/UnitModel';

const HUD_UPDATE_INTERVAL_MS = 250;

type GameHudTab = 'unit' | 'behavior' | 'sensors' | 'debug';

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

  const modeBadge = document.createElement('div');
  modeBadge.className = 'mode-badge';
  modeBadge.textContent = 'Режим: игра';

  const topControls = document.createElement('div');
  topControls.className = 'top-command-controls';
  moveExistingButton('#grid-toggle', topControls);
  moveExistingButton('#vision-toggle', topControls);
  moveExistingButton('#height-toggle', topControls);
  moveExistingButton('#language-toggle', topControls);

  topBar.append(title, modeBadge, topControls);

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
    ['behavior', 'Поведение'],
    ['sensors', 'Сенсоры'],
    ['debug', 'Отладка'],
  ] as Array<[GameHudTab, string]>) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => {
      activeTab = tab;
      renderGameHud(state, modeBadge, cellStrip, unitCard, tabContent, tabButtons, activeTab);
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
    renderGameHud(state, modeBadge, cellStrip, unitCard, tabContent, tabButtons, activeTab);
  }, HUD_UPDATE_INTERVAL_MS);
  renderGameHud(state, modeBadge, cellStrip, unitCard, tabContent, tabButtons, activeTab);
}

function renderGameHud(
  state: SimulationState,
  modeBadge: HTMLElement,
  cellStrip: HTMLElement,
  unitCard: HTMLElement,
  tabContent: HTMLElement,
  tabButtons: Map<GameHudTab, HTMLButtonElement>,
  activeTab: GameHudTab,
): void {
  document.body.classList.toggle('editor-mode', state.editor.enabled);
  modeBadge.textContent = state.editor.enabled ? 'Режим: редактор' : 'Режим: игра';
  modeBadge.classList.toggle('mode-badge-editor', state.editor.enabled);

  renderCellStrip(cellStrip, state);
  renderUnitCommandCard(unitCard, state);
  renderRightTab(tabContent, state, activeTab);

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
    ? `Клетка ${cellLabel}  |  ${formatElevation(hoveredCell.height)}  |  ${formatTerrain(hoveredCell.terrain)}  |  лес: ${formatForest(hoveredCell.forest)}`
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
  const order = unit.order ? `движение к ${Math.round(unit.order.target.x)}, ${Math.round(unit.order.target.y)}` : 'нет приказа';
  const cell = getCell(state.map, Math.floor(unit.position.x), Math.floor(unit.position.y));

  unitCard.innerHTML = [
    '<div class="unit-card-main">',
    `<div><strong>${unit.labels.ru}</strong><span>${unit.id}</span></div>`,
    `<div>Состояние: <b>${runtime.state}</b></div>`,
    `<div>Поза: <b>${formatPosture(runtime.posture)}</b></div>`,
    `<div>Приказ: <b>${order}</b></div>`,
    `<div>Опасность: <b>${runtime.danger}</b> / стресс ${Math.round(runtime.stress)}</div>`,
    `<div>Позиция: <b>${Math.floor(unit.position.x)}, ${Math.floor(unit.position.y)}</b>${cell ? ` / ${formatElevation(cell.height)}` : ''}</div>`,
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
    button.addEventListener('click', () => setManualPosture(unit, option.posture, option.label));
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

  if (activeTab === 'behavior') {
    tabContent.innerHTML = unit ? renderBehaviorTab(unit) : emptyTab('Выберите солдата, чтобы увидеть поведение.');
    return;
  }

  if (activeTab === 'sensors') {
    tabContent.innerHTML = unit ? renderSensorsTab(unit, state) : emptyTab('Выберите солдата, чтобы увидеть сенсоры окружения.');
    return;
  }

  tabContent.innerHTML = renderDebugTab(state, unit);
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
    row('Лес', cell ? formatForest(cell.forest) : 'нет'),
    row('Скорость', `${unit.speedCellsPerSecond} кл/сек`),
    row('Обзор', `${unit.viewRangeCells} клеток`),
  ]);
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
    row('Лучшее укрытие', bestCover.exists ? `${bestCover.quality}, ${bestCover.distanceCells} кл.` : 'нет'),
    row('Угроза', threat.exists ? `${threat.label}, ${threat.distanceCells} кл.` : 'нет'),
  ]);
}

function renderDebugTab(state: SimulationState, unit: UnitModel | undefined): string {
  const hoveredCell = getHoveredCell(state);

  return panelHtml('Отладка', [
    row('Карта', `${state.map.width}×${state.map.height}`),
    row('Клетка мыши', state.mouseGridPosition ? gridToCellLabel(state.map, state.mouseGridPosition) : 'вне карты'),
    row('Высота мыши', hoveredCell ? formatElevation(hoveredCell.height) : 'нет'),
    row('Юнитов', String(state.units.length)),
    row('Предметов', String(state.map.objects.length)),
    row('Зон', String(state.pressureZones.length)),
    row('Выбран', unit ? unit.id : 'нет'),
    row('Редактор', state.editor.enabled ? 'вкл' : 'выкл'),
  ]);
}

function setManualPosture(unit: UnitModel, posture: UnitPosture, label: string): void {
  unit.behaviorRuntime.previousPosture = unit.behaviorRuntime.posture;
  unit.behaviorRuntime.posture = posture;
  unit.behaviorRuntime.postureChangedBecause = `ручной выбор: ${label}`;
  unit.behaviorRuntime.lastEvent = `ручное положение: ${label}`;
  unit.behaviorRuntime.reason = `положение задано вручную: ${label}`;
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

function formatTerrain(terrain: string): string {
  const names: Record<string, string> = {
    field: 'поле',
    forest: 'лесная земля',
    road: 'дорога',
    swamp: 'болото',
    rough: 'пересечённая',
    water: 'вода',
  };
  return names[terrain] ?? terrain;
}

function formatForest(forest: number): string {
  if (forest === 2) {
    return 'густой';
  }
  if (forest === 1) {
    return 'редкий';
  }
  return 'нет';
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
