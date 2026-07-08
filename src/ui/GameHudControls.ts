import type { UnitPosture } from '../core/behavior/BehaviorModel';
import { buildEnvironmentSensorReport } from '../core/sensors/EnvironmentSensors';
import { getCell, gridToCellLabel, type MapCell, type MapObject, type MapObjectKind } from '../core/map/MapModel';
import { getSelectedUnit, type SimulationState } from '../core/simulation/SimulationState';
import type { UnitModel } from '../core/units/UnitModel';

const HUD_UPDATE_INTERVAL_MS = 250;

type GameHudTab = 'unit' | 'layers' | 'behavior' | 'sensors';

const POSTURE_OPTIONS: Array<{ posture: UnitPosture; label: string; icon: string }> = [
  { posture: 'standing', label: 'Стоя', icon: '▮' },
  { posture: 'crouched', label: 'Пригнулся', icon: '▰' },
  { posture: 'prone', label: 'Лежит', icon: '━' },
];

const COVER_KINDS = new Set<MapObjectKind>(['tree', 'rock', 'structure', 'cover', 'ditch', 'crates', 'fence', 'logs']);

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

  const topControls = document.createElement('div');
  topControls.className = 'top-command-controls';
  moveExistingButton('#grid-toggle', topControls);
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
      renderGameHud(state, modeButton, cellStrip, unitCard, tabContent, tabButtons, activeTab);
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
    renderGameHud(state, modeButton, cellStrip, unitCard, tabContent, tabButtons, activeTab);
  }, HUD_UPDATE_INTERVAL_MS);
  renderGameHud(state, modeButton, cellStrip, unitCard, tabContent, tabButtons, activeTab);
}

function renderGameHud(
  state: SimulationState,
  modeButton: HTMLButtonElement,
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
    row('Лес', cell ? formatForest(cell.forest) : 'нет'),
    row('Скорость', `${unit.speedCellsPerSecond} кл/сек`),
    row('Обзор', `${unit.viewRangeCells} клеток`),
  ]);
}

function renderLayersTab(unit: UnitModel, state: SimulationState): string {
  const visibleObjects = state.map.objects
    .map((object) => ({ object, distanceCells: distanceCells(unit.position.x, unit.position.y, object.x, object.y) }))
    .filter((entry) => entry.distanceCells <= unit.viewRangeCells)
    .sort((a, b) => a.distanceCells - b.distanceCells);
  const visibleCovers = visibleObjects
    .filter((entry) => COVER_KINDS.has(entry.object.kind))
    .slice(0, 8);
  const visibleZones = state.pressureZones
    .map((zone) => ({ zone, distanceCells: distanceCells(unit.position.x, unit.position.y, zone.x, zone.y) }))
    .filter((entry) => entry.distanceCells <= unit.viewRangeCells)
    .sort((a, b) => a.distanceCells - b.distanceCells)
    .slice(0, 5);

  const coverRows = visibleCovers.length > 0
    ? visibleCovers.map(({ object, distanceCells }) => coverCard(object, distanceCells)).join('')
    : '<div class="knowledge-card muted">Видимых укрытий пока нет.</div>';
  const zoneRows = visibleZones.length > 0
    ? visibleZones.map(({ zone, distanceCells }) => `<div class="knowledge-line"><span>${escapeHtml(zone.labels.ru)}</span><b>${Math.round(distanceCells)} кл., опасность ${zone.strength}</b></div>`).join('')
    : '<div class="knowledge-line"><span>Зоны опасности</span><b>не видит</b></div>';

  return [
    '<h2>Слои и известная информация</h2>',
    '<div class="knowledge-section">',
    '<h3>Известно юниту</h3>',
    row('Дальность взгляда', `${unit.viewRangeCells} клеток`),
    row('Видимые объекты', String(visibleObjects.length)),
    row('Видимые укрытия', String(visibleCovers.length)),
    row('Видимые зоны', String(visibleZones.length)),
    '</div>',
    '<div class="knowledge-section">',
    '<h3>Укрытия, которые он видит</h3>',
    '<div class="knowledge-list">',
    coverRows,
    '</div>',
    '</div>',
    '<div class="knowledge-section">',
    '<h3>Опасные зоны в известной области</h3>',
    '<div class="game-panel-rows">',
    zoneRows,
    '</div>',
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
    row('Лучшее укрытие', bestCover.exists ? `${bestCover.quality}, ${bestCover.distanceCells} кл.` : 'нет'),
    row('Угроза', threat.exists ? `${threat.label}, ${threat.distanceCells} кл.` : 'нет'),
  ]);
}

function coverCard(object: MapObject, distanceCellsValue: number): string {
  const score = coverScore(object.kind, distanceCellsValue);

  return [
    '<div class="knowledge-card">',
    `<div><strong>${escapeHtml(object.labels?.ru ?? formatObjectKind(object.kind))}</strong><span>${escapeHtml(formatObjectKind(object.kind))}</span></div>`,
    `<div><span>Дистанция</span><b>${distanceCellsValue.toFixed(1)} кл.</b></div>`,
    `<div><span>Пригодность</span><b>${formatCoverScore(score)}</b></div>`,
    '</div>',
  ].join('');
}

function setManualPosture(unit: UnitModel, posture: UnitPosture, label: string): void {
  unit.behaviorRuntime.previousPosture = unit.behaviorRuntime.posture;
  unit.behaviorRuntime.posture = posture;
  unit.behaviorRuntime.postureChangedBecause = `ручной выбор: ${label}`;
  unit.behaviorRuntime.lastEvent = `ручное положение: ${label}`;
  unit.behaviorRuntime.reason = `положение задано вручную: ${label}`;
}

function toggleEditorModeFromGame(state: SimulationState): void {
  state.editor.enabled = !state.editor.enabled;
  state.editor.panelOpen = state.editor.enabled;
  state.editor.drag = null;
  state.editor.tool = 'select';
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

function distanceCells(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x1 - x2, y1 - y2);
}

function coverScore(kind: MapObjectKind, distanceCellsValue: number): number {
  const base: Record<MapObjectKind, number> = {
    structure: 90,
    cover: 85,
    ditch: 80,
    logs: 74,
    rock: 70,
    crates: 62,
    fence: 56,
    tree: 50,
    post: 30,
    well: 25,
    bridge: 20,
  };
  return Math.max(0, Math.min(100, Math.round((base[kind] ?? 35) - distanceCellsValue * 4)));
}

function formatCoverScore(score: number): string {
  if (score >= 80) {
    return `${score}/100 отлично`;
  }
  if (score >= 60) {
    return `${score}/100 хорошо`;
  }
  if (score >= 40) {
    return `${score}/100 годится`;
  }
  return `${score}/100 слабо`;
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

function formatObjectKind(kind: MapObjectKind): string {
  const names: Record<MapObjectKind, string> = {
    tree: 'дерево',
    rock: 'камень',
    structure: 'дом',
    cover: 'укрытие',
    ditch: 'канава',
    crates: 'ящики',
    fence: 'забор',
    post: 'пост',
    logs: 'брёвна',
    well: 'колодец',
    bridge: 'мост',
  };
  return names[kind] ?? kind;
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
