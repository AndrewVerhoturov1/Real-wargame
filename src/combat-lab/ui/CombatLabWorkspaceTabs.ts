import {
  COMBAT_LAB_WORKSPACE_TAB_DEFINITIONS,
  normalizeCombatLabWorkspaceTab,
  type CombatLabWorkspaceHosts,
  type CombatLabWorkspaceTab,
} from './CombatLabWorkspaceHosts';

const ACTIVE_TAB_STORAGE_KEY = 'real-wargame.combat-lab.workspace-tab.v2';
const RIGHT_PANEL_STORAGE_KEY = 'real-wargame.combat-lab.right-panel-tab.v1';
const workspaceHostsByRoot = new WeakMap<HTMLElement, CombatLabWorkspaceHosts>();
const registeredWorkspaceRoots = new Set<HTMLElement>();

const POLYGON_LEFT_WORKSPACE_DEFINITIONS: ReadonlyArray<{
  readonly tabId: CombatLabWorkspaceTab;
  readonly labelRu: string;
  readonly titleRu: string;
}> = Object.freeze([
  { tabId: 'program', labelRu: 'Программа', titleRu: 'Программа' },
  { tabId: 'laboratory', labelRu: 'Лаборатория', titleRu: 'Лаборатория' },
  { tabId: 'scene', labelRu: 'Редактор карты', titleRu: 'Редактор карты' },
  { tabId: 'parameters', labelRu: 'Редактор юнита', titleRu: 'Редактор юнита' },
  { tabId: 'batch', labelRu: 'Серия', titleRu: 'Серия' },
  { tabId: 'metrics', labelRu: 'Метрики', titleRu: 'Метрики' },
  { tabId: 'journal', labelRu: 'Журнал', titleRu: 'Журнал' },
]);

const POLYGON_RIGHT_PANEL_DEFINITIONS = Object.freeze([
  { tabId: 'unit', labelRu: 'Юнит' },
  { tabId: 'info', labelRu: 'Инфо' },
  { tabId: 'attention', labelRu: 'Внимание' },
  { tabId: 'memory', labelRu: 'Память' },
] as const);

type PolygonRightPanelTab = typeof POLYGON_RIGHT_PANEL_DEFINITIONS[number]['tabId'];

export interface CombatLabWorkspaceTabsOptions {
  readonly host: HTMLElement;
  readonly storage?: Storage | null;
}

export class CombatLabWorkspaceTabs {
  readonly root: HTMLElement;
  readonly status: HTMLElement;
  readonly toggle: HTMLButtonElement;
  readonly toolbarHost: HTMLElement;
  readonly hosts: CombatLabWorkspaceHosts;

  private readonly buttons = new Map<CombatLabWorkspaceTab, HTMLButtonElement>();
  private readonly panels = new Map<CombatLabWorkspaceTab, HTMLElement>();
  private readonly rightButtons = new Map<PolygonRightPanelTab, HTMLButtonElement>();
  private readonly rightPanels = new Map<PolygonRightPanelTab, HTMLElement>();
  private readonly rightToggle: HTMLButtonElement;
  private readonly leftTitle: HTMLElement;
  private readonly listeners: Array<readonly [EventTarget, string, EventListener]> = [];
  private readonly storage: Storage | null;
  private activeTab: CombatLabWorkspaceTab;
  private activeRightTab: PolygonRightPanelTab;
  private destroyed = false;
  private collapsed = false;
  private rightCollapsed = false;

  private constructor(private readonly options: CombatLabWorkspaceTabsOptions) {
    options.host.replaceChildren();
    this.storage = options.storage === undefined ? safeSessionStorage() : options.storage;

    const shell = node('section', 'combat-lab-dock combat-lab-drawer combat-lab-workspace polygon-shell');
    shell.setAttribute('aria-label', 'Испытательный полигон');
    this.root = shell;

    const topbar = node('header', 'polygon-shell-topbar');
    topbar.setAttribute('aria-label', 'Глобальная панель Полигона');

    const topbarLeft = node('div', 'polygon-shell-topbar-left');
    const brand = node('div', 'polygon-shell-brand');
    brand.setAttribute('aria-label', 'Полигон');
    brand.append(
      node('span', 'polygon-shell-brand-mark', 'П'),
      node('strong', 'polygon-shell-brand-text', 'ПОЛИГОН'),
    );

    const toolbarHost = node('div', 'combat-lab-workspace-toolbar combat-lab-stage10-toolbar-host polygon-shell-run-toolbar');
    toolbarHost.dataset.combatLabRunToolbarHost = 'true';
    this.toolbarHost = toolbarHost;
    topbarLeft.append(brand, toolbarHost);

    const topbarCenter = node('div', 'polygon-shell-topbar-center');
    topbarCenter.setAttribute('aria-hidden', 'true');

    const topbarRight = node('div', 'polygon-shell-topbar-right');
    topbarRight.append(
      shellButton('▤', 'Файл'),
      shellButton('≛', 'Редакторы'),
      shellButton('◉', 'Вид'),
      shellButton('EN', 'Язык'),
    );
    topbar.append(topbarLeft, topbarCenter, topbarRight);

    const historyStrip = node('div', 'polygon-shell-history-strip');
    historyStrip.setAttribute('aria-label', 'Хронология эксперимента');
    historyStrip.append(node('strong', 'polygon-shell-history-live', 'LIVE'));
    const historyTrack = node('span', 'polygon-shell-history-track');
    historyTrack.setAttribute('aria-hidden', 'true');
    historyTrack.append(node('i', 'polygon-shell-history-track-fill'));
    this.status = node('span', 'combat-lab-dock-status polygon-shell-history-status', 'LIVE');
    const historySpacer = node('span', 'polygon-shell-history-spacer');
    const historyActions = node('div', 'polygon-shell-history-actions');
    historyActions.append(
      historyButton('ФИЛЬТРЫ'),
      historyButton('‹', 'Предыдущее событие'),
      historyButton('›', 'Следующее событие'),
      historyButton('ХРОНОЛОГИЯ ▾'),
    );
    historyStrip.append(historyTrack, this.status, historySpacer, historyActions);

    const viewport = node('div', 'polygon-shell-viewport');
    const mapPlaceholder = node('div', 'polygon-shell-map-placeholder');
    mapPlaceholder.setAttribute('aria-hidden', 'true');
    const mapBoard = node('div', 'polygon-shell-map-board');
    mapPlaceholder.append(mapBoard);

    const left = node('aside', 'polygon-shell-side-panel polygon-shell-left');
    left.id = 'polygon-shell-left-panel';
    left.setAttribute('aria-label', 'Палитра инструментов');
    const leftHead = node('div', 'polygon-shell-panel-head');
    const leftHeadText = node('div', 'polygon-shell-panel-head-text');
    leftHeadText.append(node('div', 'polygon-shell-panel-kicker', 'РАБОЧИЙ РЕЖИМ'));
    this.leftTitle = node('div', 'polygon-shell-panel-title', 'Программа');
    leftHeadText.append(this.leftTitle);
    this.toggle = button('‹', 'combat-lab-dock-toggle combat-lab-drawer-toggle polygon-shell-panel-collapse');
    this.toggle.setAttribute('aria-label', 'Скрыть левую панель');
    this.toggle.setAttribute('aria-expanded', 'true');
    this.toggle.setAttribute('aria-controls', left.id);
    leftHead.append(leftHeadText, this.toggle);

    const leftTabs = node('nav', 'polygon-shell-left-tabs');
    leftTabs.setAttribute('role', 'tablist');
    leftTabs.setAttribute('aria-label', 'Разделы Полигона');
    for (const definition of POLYGON_LEFT_WORKSPACE_DEFINITIONS) {
      const control = button(definition.labelRu, 'polygon-shell-tab');
      control.setAttribute('role', 'tab');
      control.dataset.combatLabTab = definition.tabId;
      control.id = `combat-lab-workspace-tab-${definition.tabId}`;
      this.buttons.set(definition.tabId, control);
      leftTabs.append(control);
      this.listen(control, 'click', () => this.activate(definition.tabId));
    }

    const leftBody = node('div', 'polygon-shell-panel-body');
    leftBody.setAttribute('aria-hidden', 'true');
    const leftCollapsedLabel = node('div', 'polygon-shell-collapsed-label', 'Палитра инструментов');
    left.append(leftHead, leftTabs, leftBody, leftCollapsedLabel);

    const right = node('aside', 'polygon-shell-side-panel polygon-shell-right');
    right.id = 'polygon-shell-right-panel';
    right.setAttribute('aria-label', 'Информация о выбранном объекте');
    const rightHead = node('div', 'polygon-shell-panel-head');
    this.rightToggle = button('›', 'polygon-shell-panel-collapse');
    this.rightToggle.setAttribute('aria-label', 'Скрыть правую панель');
    this.rightToggle.setAttribute('aria-expanded', 'true');
    this.rightToggle.setAttribute('aria-controls', right.id);
    const rightHeadText = node('div', 'polygon-shell-panel-head-text');
    rightHeadText.append(
      node('div', 'polygon-shell-panel-kicker', 'ВЫБРАННЫЙ ОБЪЕКТ'),
      node('div', 'polygon-shell-panel-title', 'Юнит не выбран'),
    );
    rightHead.append(this.rightToggle, rightHeadText);

    const rightTabs = node('nav', 'polygon-shell-right-tabs');
    rightTabs.setAttribute('role', 'tablist');
    rightTabs.setAttribute('aria-label', 'Информация об объекте');
    const rightPanelHost = node('div', 'polygon-shell-panel-body polygon-shell-right-panels');
    for (const definition of POLYGON_RIGHT_PANEL_DEFINITIONS) {
      const control = button(definition.labelRu, 'polygon-shell-tab');
      control.setAttribute('role', 'tab');
      control.dataset.polygonRightTab = definition.tabId;
      control.id = `polygon-right-tab-${definition.tabId}`;
      this.rightButtons.set(definition.tabId, control);
      rightTabs.append(control);

      const panel = node('section', 'polygon-shell-right-panel');
      panel.id = `polygon-right-panel-${definition.tabId}`;
      panel.dataset.polygonRightPanel = definition.tabId;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', control.id);
      control.setAttribute('aria-controls', panel.id);
      this.rightPanels.set(definition.tabId, panel);
      rightPanelHost.append(panel);
      this.listen(control, 'click', () => this.activateRightPanel(definition.tabId));
    }
    const rightCollapsedLabel = node('div', 'polygon-shell-collapsed-label', 'Информация о юните');
    right.append(rightHead, rightTabs, rightPanelHost, rightCollapsedLabel);

    viewport.append(mapPlaceholder, left, right);

    const hiddenHosts = node('div', 'polygon-shell-hidden-hosts');
    hiddenHosts.setAttribute('aria-hidden', 'true');
    const hosts = {} as Record<CombatLabWorkspaceTab, HTMLElement>;
    for (const definition of COMBAT_LAB_WORKSPACE_TAB_DEFINITIONS) {
      const panel = node('section', 'combat-lab-tab-panel combat-lab-workspace-panel polygon-shell-hidden-panel');
      panel.dataset.combatLabTabPanel = definition.tabId;
      panel.id = `combat-lab-workspace-panel-${definition.tabId}`;
      const content = node('div', `combat-lab-workspace-host combat-lab-workspace-${definition.tabId}-host`);
      content.dataset.combatLabWorkspaceHost = definition.tabId;
      panel.append(content);
      this.panels.set(definition.tabId, panel);
      hosts[definition.tabId] = content;
      hiddenHosts.append(panel);
    }

    this.hosts = Object.freeze(hosts) as CombatLabWorkspaceHosts;
    workspaceHostsByRoot.set(this.root, this.hosts);
    registeredWorkspaceRoots.add(this.root);

    shell.append(topbar, historyStrip, viewport, hiddenHosts);
    options.host.append(shell);

    this.listen(this.toggle, 'click', () => this.setCollapsed(!this.collapsed));
    this.listen(this.rightToggle, 'click', () => this.setRightCollapsed(!this.rightCollapsed));

    const storedTab = readStoredTab(this.storage);
    this.activeTab = normalizeVisibleWorkspaceTab(storedTab);
    this.activate(this.activeTab, false);

    this.activeRightTab = normalizeRightPanelTab(readStoredRightTab(this.storage));
    this.activateRightPanel(this.activeRightTab, false);
    requestWorkspaceResize();
  }

  static create(options: CombatLabWorkspaceTabsOptions): CombatLabWorkspaceTabs {
    return new CombatLabWorkspaceTabs(options);
  }

  activate(tabId: CombatLabWorkspaceTab, persist = true): void {
    if (this.destroyed) return;
    const normalized = normalizeCombatLabWorkspaceTab(tabId);
    this.activeTab = normalized;
    this.root.dataset.activeWorkspace = normalized;
    this.leftTitle.textContent = leftWorkspaceTitle(normalized);
    for (const [value, buttonElement] of this.buttons) {
      const active = value === normalized;
      buttonElement.classList.toggle('active', active);
      buttonElement.setAttribute('aria-selected', String(active));
      buttonElement.tabIndex = active ? 0 : -1;
    }
    for (const [value, panel] of this.panels) panel.hidden = value !== normalized;
    if (persist) writeStoredTab(this.storage, normalized);
    this.root.dispatchEvent(new CustomEvent<CombatLabWorkspaceTab>('combat-lab-workspace-tab-change', {
      bubbles: true,
      detail: normalized,
    }));
  }

  getActiveTab(): CombatLabWorkspaceTab {
    return this.activeTab;
  }

  isActive(tabId: CombatLabWorkspaceTab): boolean {
    return !this.destroyed && this.activeTab === tabId;
  }

  setCollapsed(collapsed: boolean): void {
    if (this.destroyed || this.collapsed === collapsed) return;
    this.collapsed = collapsed;
    this.root.classList.toggle('collapsed', collapsed);
    this.root.classList.toggle('polygon-shell-left-collapsed', collapsed);
    this.toggle.textContent = collapsed ? '›' : '‹';
    this.toggle.setAttribute('aria-label', collapsed ? 'Показать левую панель' : 'Скрыть левую панель');
    this.toggle.setAttribute('aria-expanded', String(!collapsed));
    document.body.classList.toggle('combat-lab-dock-collapsed', collapsed);
    document.body.classList.toggle('combat-lab-dock-open', !collapsed);
    requestWorkspaceResize();
  }

  setRightCollapsed(collapsed: boolean): void {
    if (this.destroyed || this.rightCollapsed === collapsed) return;
    this.rightCollapsed = collapsed;
    this.root.classList.toggle('polygon-shell-right-collapsed', collapsed);
    this.rightToggle.textContent = collapsed ? '‹' : '›';
    this.rightToggle.setAttribute('aria-label', collapsed ? 'Показать правую панель' : 'Скрыть правую панель');
    this.rightToggle.setAttribute('aria-expanded', String(!collapsed));
    document.body.classList.toggle('polygon-shell-right-collapsed', collapsed);
    requestWorkspaceResize();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const [target, type, listener] of this.listeners) target.removeEventListener(type, listener);
    this.listeners.length = 0;
    if (workspaceHostsByRoot.get(this.root) === this.hosts) workspaceHostsByRoot.delete(this.root);
    registeredWorkspaceRoots.delete(this.root);
    document.body.classList.remove('polygon-shell-right-collapsed');
    this.options.host.replaceChildren();
  }

  private activateRightPanel(tabId: PolygonRightPanelTab, persist = true): void {
    if (this.destroyed) return;
    this.activeRightTab = tabId;
    for (const [value, buttonElement] of this.rightButtons) {
      const active = value === tabId;
      buttonElement.classList.toggle('active', active);
      buttonElement.setAttribute('aria-selected', String(active));
      buttonElement.tabIndex = active ? 0 : -1;
    }
    for (const [value, panel] of this.rightPanels) panel.hidden = value !== tabId;
    if (persist) writeStoredRightTab(this.storage, tabId);
  }

  private listen(target: EventTarget, type: string, callback: () => void): void {
    const listener: EventListener = () => callback();
    target.addEventListener(type, listener);
    this.listeners.push([target, type, listener]);
  }
}

export function getCombatLabWorkspaceHosts(root: HTMLElement): CombatLabWorkspaceHosts {
  const hosts = workspaceHostsByRoot.get(root);
  if (!hosts) throw new Error('Хосты рабочего пространства Combat Lab ещё не зарегистрированы.');
  return hosts;
}

export function getOnlyCombatLabWorkspaceRoot(): HTMLElement {
  if (registeredWorkspaceRoots.size !== 1) {
    throw new Error('Невозможно однозначно выбрать рабочее пространство Combat Lab.');
  }
  return [...registeredWorkspaceRoots][0]!;
}

function safeSessionStorage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function readStoredTab(storage: Storage | null): string | null {
  try {
    return storage?.getItem(ACTIVE_TAB_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeStoredTab(storage: Storage | null, tabId: CombatLabWorkspaceTab): void {
  try {
    storage?.setItem(ACTIVE_TAB_STORAGE_KEY, tabId);
  } catch {
    // Хранилище необязательно: выбор вкладки остаётся в памяти текущей страницы.
  }
}

function readStoredRightTab(storage: Storage | null): string | null {
  try {
    return storage?.getItem(RIGHT_PANEL_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeStoredRightTab(storage: Storage | null, tabId: PolygonRightPanelTab): void {
  try {
    storage?.setItem(RIGHT_PANEL_STORAGE_KEY, tabId);
  } catch {
    // Хранилище необязательно: выбор вкладки остаётся в памяти текущей страницы.
  }
}

function normalizeVisibleWorkspaceTab(value: unknown): CombatLabWorkspaceTab {
  const normalized = normalizeCombatLabWorkspaceTab(value);
  return POLYGON_LEFT_WORKSPACE_DEFINITIONS.some((definition) => definition.tabId === normalized)
    ? normalized
    : 'program';
}

function normalizeRightPanelTab(value: unknown): PolygonRightPanelTab {
  return typeof value === 'string'
    && POLYGON_RIGHT_PANEL_DEFINITIONS.some((definition) => definition.tabId === value)
    ? value as PolygonRightPanelTab
    : 'unit';
}

function leftWorkspaceTitle(tabId: CombatLabWorkspaceTab): string {
  return POLYGON_LEFT_WORKSPACE_DEFINITIONS.find((definition) => definition.tabId === tabId)?.titleRu
    ?? COMBAT_LAB_WORKSPACE_TAB_DEFINITIONS.find((definition) => definition.tabId === tabId)?.titleRu
    ?? 'Рабочий режим';
}

function requestWorkspaceResize(): void {
  window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
}

function shellButton(label: string, title = label): HTMLButtonElement {
  const element = button(label, 'polygon-shell-top-button');
  element.setAttribute('aria-disabled', 'true');
  element.setAttribute('aria-label', title);
  element.title = `${title}: команда будет подключена через штатный product owner в отдельной задаче.`;
  return element;
}

function historyButton(label: string, title = label): HTMLButtonElement {
  const element = button(label, 'polygon-shell-history-button');
  element.setAttribute('aria-disabled', 'true');
  element.title = title;
  return element;
}

function button(label: string, className = ''): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  if (className) element.className = className;
  return element;
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}
