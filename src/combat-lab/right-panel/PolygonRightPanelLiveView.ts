import './polygon-right-panel-live.css';
import type { AttentionMode } from '../../core/perception/AttentionModel';
import type { SimulationState } from '../../core/simulation/SimulationState';
import {
  applyPolygonAttentionProfile,
  clearPolygonAttentionOverride,
  readPolygonAttentionLive,
  readPolygonInfoLive,
  readPolygonMemoryLive,
  setPolygonAttentionMode,
  setPolygonSearchSector,
  type PolygonAttentionLiveData,
  type PolygonContactLiveData,
  type PolygonInfoLiveData,
  type PolygonInfoPoint,
  type PolygonInfoPreparedOwners,
  type PolygonMemoryLiveData,
} from './PolygonRightPanelLive';

export interface PolygonRightPanelLiveHosts {
  readonly info: HTMLElement;
  readonly attention: HTMLElement;
  readonly memory: HTMLElement;
}

export interface PolygonRightPanelAttentionContext {
  readonly state: SimulationState;
  readonly unitId: string | null;
}

export interface PolygonRightPanelLiveViewOptions {
  readonly hosts: PolygonRightPanelLiveHosts;
  /** Supplied by the PULSE-owned selection seam. LINZA never owns or subscribes to selection. */
  readonly getAttentionContext: () => PolygonRightPanelAttentionContext;
}

export class PolygonRightPanelLiveView {
  private readonly listeners: Array<readonly [EventTarget, string, EventListener]> = [];
  private infoKey = '';
  private attentionKey = '';
  private memoryKey = '';
  private destroyed = false;

  constructor(private readonly options: PolygonRightPanelLiveViewOptions) {
    this.options.hosts.info.classList.add('polygon-linza-panel');
    this.options.hosts.attention.classList.add('polygon-linza-panel');
    this.options.hosts.memory.classList.add('polygon-linza-panel');
    this.listen(this.options.hosts.attention, 'click', (event) => this.onAttentionClick(event));
    this.listen(this.options.hosts.attention, 'change', (event) => this.onAttentionChange(event));
  }

  renderInfo(state: SimulationState, point: PolygonInfoPoint | null, prepared: PolygonInfoPreparedOwners | null): void {
    if (this.destroyed) return;
    const host = this.options.hosts.info;
    if (!point) {
      const key = 'empty';
      if (this.infoKey === key) return;
      this.infoKey = key;
      renderEmpty(host, '⌖', 'Наведите курсор на карту', 'Здесь появятся реальные свойства точки карты.');
      return;
    }
    if (!prepared) {
      const key = 'prepared-unavailable';
      if (this.infoKey === key) return;
      this.infoKey = key;
      host.replaceChildren(unavailable('Подготовленные владельцы рельефа и объектов ещё не переданы общей оболочкой.'));
      return;
    }
    const data = readPolygonInfoLive(state, point, prepared);
    const key = JSON.stringify(data);
    if (this.infoKey === key) return;
    this.infoKey = key;
    renderInfo(host, data);
  }

  renderAttention(state: SimulationState, unitId: string | null): void {
    if (this.destroyed) return;
    const data = readPolygonAttentionLive(state, unitId);
    const key = JSON.stringify(data);
    if (this.attentionKey === key) return;
    this.attentionKey = key;
    renderAttention(this.options.hosts.attention, data);
  }

  renderMemory(state: SimulationState, unitId: string | null): void {
    if (this.destroyed) return;
    const data = readPolygonMemoryLive(state, unitId);
    const key = JSON.stringify(data);
    if (this.memoryKey === key) return;
    this.memoryKey = key;
    renderMemory(this.options.hosts.memory, data);
  }

  invalidate(): void {
    this.infoKey = '';
    this.attentionKey = '';
    this.memoryKey = '';
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const [target, type, listener] of this.listeners) target.removeEventListener(type, listener);
    this.listeners.length = 0;
    for (const host of Object.values(this.options.hosts)) {
      host.classList.remove('polygon-linza-panel');
      host.replaceChildren();
    }
  }

  private onAttentionClick(event: Event): void {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-linza-action]') : null;
    if (!target || !this.options.hosts.attention.contains(target)) return;
    const { state, unitId } = this.options.getAttentionContext();
    if (!unitId) return;

    const action = target.dataset.linzaAction;
    if (action === 'mode') {
      const mode = target.dataset.linzaMode as AttentionMode | undefined;
      if (mode === 'march' || mode === 'observe' || mode === 'search' || mode === 'engage') {
        setPolygonAttentionMode(state, unitId, mode);
      }
    } else if (action === 'clear') {
      clearPolygonAttentionOverride(state, unitId);
    } else if (action === 'search') {
      const center = readNumericInput(this.options.hosts.attention, 'center');
      const arc = readNumericInput(this.options.hosts.attention, 'arc');
      if (center !== null && arc !== null) setPolygonSearchSector(state, unitId, center, arc);
    }
    this.attentionKey = '';
    this.renderAttention(state, unitId);
  }

  private onAttentionChange(event: Event): void {
    const target = event.target instanceof HTMLSelectElement ? event.target : null;
    if (!target || target.dataset.linzaAction !== 'profile') return;
    const { state, unitId } = this.options.getAttentionContext();
    if (!unitId || !target.value) return;
    applyPolygonAttentionProfile(state, unitId, target.value);
    this.attentionKey = '';
    this.renderAttention(state, unitId);
  }

  private listen(target: EventTarget, type: string, callback: (event: Event) => void): void {
    const listener: EventListener = (event) => callback(event);
    target.addEventListener(type, listener);
    this.listeners.push([target, type, listener]);
  }
}

function renderInfo(host: HTMLElement, data: PolygonInfoLiveData): void {
  host.replaceChildren();
  const scroll = node('div', 'polygon-linza-scroll polygon-linza-info-tab');
  if (data.availability === 'unavailable') {
    scroll.append(unavailable(data.reasonRu ?? 'Нет данных.'));
    host.append(scroll);
    return;
  }

  scroll.append(
    summary('Инспектор карты', data.point.pinned ? 'Точка закреплена' : 'Под курсором', data.cellLabel ?? '—'),
    card('Точка', [
      metric('Клетка', data.cellX !== null && data.cellY !== null ? `${data.cellX} × ${data.cellY}` : '—'),
      metric('Высота', formatNumber(data.heightLevel, 2, ' ур.')),
      metric('Уклон', formatNumber(data.slopePercent, 1, ' %')),
      metric('Вниз', data.downhillDegrees === null ? 'ровно' : `${Math.round(data.downhillDegrees)}°`),
    ]),
    card('Поверхность', [
      metric('Грунт', data.surfaceNameRu ?? '—'),
      metric('Растительность', data.vegetationNameRu ?? '—'),
      metric('Проходимость', data.passable === null ? '—' : data.passable ? 'проходимо' : 'непроходимо'),
      metric('Сопр. грунта', formatNumber(data.surfaceResistance, 2)),
      metric('Сопр. растительности', formatNumber(data.vegetationResistance, 2)),
      metric('Физ. стоимость', formatNumber(data.physicalCost, 2)),
      metric('Скрытность цели', formatNumber(data.targetConcealment, 0, ' %')),
      metric('Местная скрытность', formatNumber(data.localConcealment, 0, ' %')),
    ]),
    objectCard(data),
    unavailableRow('Юниты рядом', data.nearbyUnits.reasonRu),
    unavailableRow('Опасность', data.danger.reasonRu),
  );
  host.append(scroll);
}

function objectCard(data: PolygonInfoLiveData): HTMLElement {
  const wrapper = node('section', 'polygon-linza-card');
  wrapper.append(cardHead('Объекты рядом', `${data.nearbyObjects.length}`));
  const list = node('div', 'polygon-linza-list');
  if (data.nearbyObjects.length === 0) {
    list.append(node('div', 'polygon-linza-list-empty', 'В радиусе 2 клеток объектов нет.'));
  } else {
    for (const object of data.nearbyObjects) {
      const row = node('div', 'polygon-linza-list-row');
      const main = node('div', 'polygon-linza-list-main');
      main.append(node('strong', '', object.labelRu), node('small', '', `${object.kind} · укрытие ${object.coverProtection}% · надёжность ${object.coverReliability}%`));
      const badgeNode = node('span', 'polygon-linza-badge', object.penetrable ? 'пробиваемо' : 'непробиваемо');
      row.append(main, badgeNode);
      list.append(row);
    }
  }
  wrapper.append(list);
  return wrapper;
}

function renderAttention(host: HTMLElement, data: PolygonAttentionLiveData): void {
  host.replaceChildren();
  if (data.availability === 'unavailable') {
    renderEmpty(host, '◎', 'Выберите юнита на карте', 'Здесь появятся его реальные режим внимания, сектор и субъективные контакты.');
    return;
  }

  const scroll = node('div', 'polygon-linza-scroll polygon-linza-attention-tab');
  const top = node('div', 'polygon-linza-attention-toolbar');
  const profileLabel = node('label', 'polygon-linza-field');
  profileLabel.append(node('span', '', 'Профиль'));
  const select = document.createElement('select');
  select.dataset.linzaAction = 'profile';
  select.setAttribute('aria-label', 'Профиль внимания');
  for (const profile of data.availableProfiles) {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = profile.nameRu;
    option.selected = profile.id === data.profileId;
    select.append(option);
  }
  profileLabel.append(select);
  top.append(profileLabel, node('div', 'polygon-linza-source', sourceLabel(data.modeSource)));

  const modes = node('div', 'polygon-linza-mode-row');
  for (const [mode, label] of [['march', 'Марш'], ['observe', 'Наблюдение'], ['search', 'Поиск'], ['engage', 'Бой']] as const) {
    const button = node('button', `polygon-linza-mode${data.mode === mode ? ' is-active' : ''}`, label) as HTMLButtonElement;
    button.type = 'button';
    button.dataset.linzaAction = 'mode';
    button.dataset.linzaMode = mode;
    modes.append(button);
  }

  const search = node('div', 'polygon-linza-search-row');
  search.append(numberField('Центр, °', 'center', data.searchCenterDegrees ?? 0, 0, 359, 1));
  search.append(numberField('Дуга, °', 'arc', data.searchArcDegrees ?? 120, 1, 360, 1));
  const apply = node('button', 'polygon-linza-small-button', 'Задать сектор') as HTMLButtonElement;
  apply.type = 'button';
  apply.dataset.linzaAction = 'search';
  const clear = node('button', 'polygon-linza-small-button', 'Авто') as HTMLButtonElement;
  clear.type = 'button';
  clear.dataset.linzaAction = 'clear';
  search.append(apply, clear);

  const modeCard = card('Сектора внимания', [
    metric('Фокус', formatNumber(data.focusAngleDegrees, 0, '°')),
    metric('Прямое', formatNumber(data.directAngleDegrees, 0, '°')),
    metric('Периферия', formatNumber(data.peripheralAngleDegrees, 0, '°')),
    metric('Тыл до', formatNumber(data.rearMaximumRangeMeters, 0, ' м')),
    metric('Направление', formatNumber(data.focusDirectionDegrees, 0, '°')),
    metric('Дальность', formatNumber(data.maximumVisualRangeMeters, 0, ' м')),
    metric('Спад с', formatNumber(data.distanceFalloffStartMeters, 0, ' м')),
    metric('Разброс', formatNumber(data.detectionVariancePercent, 0, ' %')),
  ]);

  const contacts = node('section', 'polygon-linza-card');
  contacts.append(cardHead('Контакты', `${data.contacts.length}`), contactGroups(data.contacts));
  scroll.append(top, modes, search, modeCard, contacts);
  host.append(scroll);
}

function renderMemory(host: HTMLElement, data: PolygonMemoryLiveData): void {
  host.replaceChildren();
  if (data.availability === 'unavailable') {
    renderEmpty(host, '◇', 'Выберите юнита на карте', 'Память показывает только сведения, реально известные выбранному бойцу.');
    return;
  }
  const scroll = node('div', 'polygon-linza-scroll polygon-linza-memory-tab');
  const summaryNode = node('div', 'polygon-linza-memory-summary');
  const main = node('div', 'polygon-linza-memory-summary-main');
  main.append(node('strong', '', 'Картина мира бойца'), node('small', '', 'Только сведения, известные выбранному юниту'));
  const counts = node('div', 'polygon-linza-memory-counts');
  counts.append(
    badge(`Сейчас ${data.currentCount}`),
    badge(`Прошлое ${data.pastCount}`),
    badge(`Предп. ${data.assumptionCount}`),
    badge(`Разведка ${data.intelCount}`),
  );
  summaryNode.append(main, counts);

  const legend = node('div', 'polygon-linza-memory-legend');
  for (const [kind, text] of [['current', '◆ Сейчас'], ['past', '◇ Прошлое'], ['assumption', '○ Предположение'], ['intel', '▣ Разведка']] as const) {
    const item = node('span', `polygon-linza-memory-kind is-${kind}`, text);
    legend.append(item);
  }
  const front = node('span', 'polygon-linza-memory-kind is-unavailable', '— Фронт недоступен');
  front.title = data.estimatedFront.reasonRu;
  legend.append(front);

  const list = node('section', 'polygon-linza-memory-list');
  list.append(cardHead('Известные сведения', `${data.contacts.length}`));
  if (data.contacts.length === 0) {
    list.append(node('div', 'polygon-linza-list-empty', 'У бойца пока нет субъективных контактов.'));
  } else {
    for (const contact of data.contacts) list.append(memoryEntry(contact));
  }
  scroll.append(summaryNode, legend, list);
  host.append(scroll);
}

function contactGroups(contacts: readonly PolygonContactLiveData[]): HTMLElement {
  const wrapper = node('div', 'polygon-linza-contact-groups');
  const groups: ReadonlyArray<readonly [PolygonContactLiveData['kind'], string]> = [
    ['current', 'Видит сейчас'], ['past', 'Последние сведения'], ['assumption', 'Подозрения и сигналы'], ['intel', 'Разведданные'],
  ];
  for (const [kind, label] of groups) {
    const items = contacts.filter((contact) => contact.kind === kind);
    if (items.length === 0) continue;
    const group = node('div', 'polygon-linza-contact-group');
    group.append(node('div', 'polygon-linza-contact-group-title', `${label} · ${items.length}`));
    for (const item of items) group.append(memoryEntry(item));
    wrapper.append(group);
  }
  if (!wrapper.firstChild) wrapper.append(node('div', 'polygon-linza-list-empty', 'Субъективных контактов нет.'));
  return wrapper;
}

function memoryEntry(contact: PolygonContactLiveData): HTMLElement {
  const row = node('div', `polygon-linza-memory-entry is-${contact.kind}`);
  const icon = node('span', 'polygon-linza-memory-icon', kindIcon(contact.kind));
  const body = node('div', 'polygon-linza-memory-body');
  const position = contact.lastKnownPosition ? `${contact.lastKnownPosition.x.toFixed(1)} × ${contact.lastKnownPosition.y.toFixed(1)}` : 'позиция не известна';
  body.append(
    node('strong', '', contact.labelRu || 'Контакт'),
    node('small', '', `${sourceName(contact.source)} · ${position} · неопределённость ${contact.uncertaintyCells.toFixed(1)} кл.`),
  );
  if (contact.explanationRu.length > 0) body.append(node('p', '', contact.explanationRu.join(' ')));
  const confidence = node('span', 'polygon-linza-memory-confidence', `${Math.round(contact.confidence)}%`);
  row.append(icon, body, confidence);
  return row;
}

function card(title: string, metrics: HTMLElement[]): HTMLElement {
  const wrapper = node('section', 'polygon-linza-card');
  wrapper.append(cardHead(title));
  const grid = node('div', 'polygon-linza-metrics');
  for (const item of metrics) grid.append(item);
  wrapper.append(grid);
  return wrapper;
}

function cardHead(title: string, meta = ''): HTMLElement {
  const head = node('div', 'polygon-linza-card-head');
  head.append(node('strong', '', title));
  if (meta) head.append(node('span', '', meta));
  return head;
}

function metric(label: string, value: string): HTMLElement {
  const item = node('div', 'polygon-linza-metric');
  item.append(node('span', '', label), node('strong', '', value));
  return item;
}

function summary(kicker: string, status: string, value: string): HTMLElement {
  const wrapper = node('div', 'polygon-linza-summary');
  const main = node('div', 'polygon-linza-summary-main');
  main.append(node('small', '', kicker), node('strong', '', value));
  wrapper.append(main, badge(status));
  return wrapper;
}

function unavailableRow(label: string, reason: string): HTMLElement {
  const row = node('div', 'polygon-linza-unavailable-row');
  const main = node('div', 'polygon-linza-list-main');
  main.append(node('strong', '', label), node('small', '', reason));
  row.append(main, badge('нет данных'));
  return row;
}

function unavailable(reason: string): HTMLElement {
  return unavailableRow('Недоступно', reason);
}

function renderEmpty(host: HTMLElement, icon: string, title: string, text: string): void {
  host.replaceChildren();
  const empty = node('div', 'polygon-linza-empty');
  const inner = node('div', 'polygon-linza-empty-inner');
  inner.append(node('div', 'polygon-linza-empty-icon', icon), node('strong', '', title), node('p', '', text));
  empty.append(inner);
  host.append(empty);
}

function numberField(label: string, key: string, value: number, min: number, max: number, step: number): HTMLLabelElement {
  const field = node('label', 'polygon-linza-field') as HTMLLabelElement;
  field.append(node('span', '', label));
  const input = document.createElement('input');
  input.type = 'number';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(Math.round(value));
  input.dataset.linzaSearch = key;
  field.append(input);
  return field;
}

function readNumericInput(host: HTMLElement, key: string): number | null {
  const input = host.querySelector<HTMLInputElement>(`input[data-linza-search="${key}"]`);
  if (!input) return null;
  const value = Number(input.value);
  return Number.isFinite(value) ? value : null;
}

function badge(text: string): HTMLElement { return node('span', 'polygon-linza-badge', text); }

function formatNumber(value: number | null, digits: number, suffix = ''): string {
  return value === null || !Number.isFinite(value) ? 'нет данных' : `${value.toFixed(digits)}${suffix}`;
}

function sourceLabel(source: PolygonAttentionLiveData['modeSource']): string {
  if (source === 'player') return 'Игрок';
  if (source === 'ai') return 'ИИ';
  return 'Авто';
}

function sourceName(source: PolygonContactLiveData['source']): string {
  switch (source) {
    case 'visual': return 'зрение';
    case 'sound': return 'звук';
    case 'reported': return 'доклад';
    case 'fire_pressure': return 'огневое давление';
  }
}

function kindIcon(kind: PolygonContactLiveData['kind']): string {
  switch (kind) {
    case 'current': return '◆';
    case 'past': return '◇';
    case 'assumption': return '○';
    case 'intel': return '▣';
  }
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}
