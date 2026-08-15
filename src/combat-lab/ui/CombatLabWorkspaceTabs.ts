import {
  COMBAT_LAB_AUXILIARY_WORKSPACE_TAB_DEFINITIONS,
  COMBAT_LAB_PRIMARY_WORKSPACE_TAB_DEFINITIONS,
  COMBAT_LAB_WORKSPACE_TAB_DEFINITIONS,
  normalizeCombatLabWorkspaceTab,
  type CombatLabWorkspaceHosts,
  type CombatLabWorkspaceTab,
} from './CombatLabWorkspaceHosts';

const ACTIVE_TAB_STORAGE_KEY = 'real-wargame.combat-lab.workspace-tab.v2';
const RIGHT_PANEL_STORAGE_KEY = 'real-wargame.combat-lab.right-panel-tab.v1';
const workspaceHostsByRoot = new WeakMap<HTMLElement, CombatLabWorkspaceHosts>();
const registeredWorkspaceRoots = new Set<HTMLElement>();

const POLYGON_RIGHT_PANEL_DEFINITIONS = Object.freeze([
  {
    tabId: 'unit',
    labelRu: 'Юнит',
    emptyRu: 'Живые данные выбранного юнита будут подключены через существующий UnitModel. Каркас не хранит копию состояния.',
  },
  {
    tabId: 'info',
    labelRu: 'Инфо',
    emptyRu: 'Инспектор точки карты ждёт подтверждённый продуктовый запрос. Каркас не вычисляет свойства мира самостоятельно.',
  },
  {
    tabId: 'attention',
    labelRu: 'Внимание',
    emptyRu: 'Вкладка ждёт данные внимания и восприятия, уже подготовленные симуляцией. Повторного расчёта видимости в интерфейсе нет.',
  },
  {
    tabId: 'memory',
    labelRu: 'Память',
    emptyRu: 'Вкладка ждёт подтверждённые субъективные данные памяти. Отсутствующие типы знаний не подменяются демонстрационными значениями.',
  },
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

    const header = node('header', 'polygon-shell-header');
    const brand = node('div', 'combat-lab-dock-brand polygon-shell-brand');
    brand.append(
      node('strong', '', 'ПОЛИГОН'),
      node('span', '', 'Real Wargame · единое пространство эксперимента'),
    );
    const shellControls = node('div', 'polygon-shell-header-controls');
    this.toggle = button('Свернуть слева', 'combat-lab-dock-toggle combat-lab-drawer-toggle polygon-shell-collapse-button');
    this.toggle.setAttribute('aria-expanded', 'true');
    this.toggle.setAttribute('aria-controls', 'polygon-shell-left-panel');
    this.rightToggle = button('Свернуть справа', 'polygon-shell-collapse-button polygon-shell-right-toggle');
    this.rightToggle.setAttribute('aria-expanded', 'true');
    this.rightToggle.setAttribute('aria-controls', 'polygon-shell-right-panel');
    shellControls.append(this.toggle, this.rightToggle);
    header.append(brand, shellControls);

    const primaryTabList = node('nav', 'combat-lab-tab-list combat-lab-workspace-tab-list polygon-shell-primary-tabs');
    primaryTabList.setAttribute('role', 'tablist');
    primaryTabList.setAttribute('aria-label', 'Разделы Полигона');

    const main = node('div', 'polygon-shell-main');
    const left = node('aside', 'polygon-shell-left');
    left.id = 'polygon-shell-left-panel';
    left.setAttribute('aria-label', 'Рабочая панель Полигона');

    const leftHeader = node('div', 'polygon-shell-panel-header');
    leftHeader.append(
      node('strong', '', 'Рабочая панель'),
      node('span', '', 'Раздел и текущие инструменты'),
    );

    const toolbarHost = node('div', 'combat-lab-workspace-toolbar combat-lab-stage10-toolbar-host polygon-shell-run-toolbar');
    toolbarHost.dataset.combatLabRunToolbarHost = 'true';
    this.toolbarHost = toolbarHost;

    const panelHost = node('div', 'combat-lab-tab-panels combat-lab-workspace-panels polygon-shell-workspace-panels');
    const auxiliaryTabList = node('nav', 'polygon-shell-auxiliary-tabs');
    auxiliaryTabList.setAttribute('role', 'tablist');
    auxiliaryTabList.setAttribute('aria-label', 'Текущие продуктовые инструменты');
    auxiliaryTabList.append(node('span', 'polygon-shell-auxiliary-label', 'Текущие инструменты'));

    const hosts = {} as Record<CombatLabWorkspaceTab, HTMLElement>;
    const primaryIds = new Set<CombatLabWorkspaceTab>(
      COMBAT_LAB_PRIMARY_WORKSPACE_TAB_DEFINITIONS.map((definition) => definition.tabId),
    );

    for (const definition of COMBAT_LAB_WORKSPACE_TAB_DEFINITIONS) {
      const control = button(definition.labelRu);
      control.setAttribute('role', 'tab');
      control.dataset.combatLabTab = definition.tabId;
      control.id = `combat-lab-workspace-tab-${definition.tabId}`;
      this.buttons.set(definition.tabId, control);
      (primaryIds.has(definition.tabId) ? primaryTabList : auxiliaryTabList).append(control);

      const panel = node(
        'section',
        `combat-lab-tab-panel combat-lab-workspace-panel polygon-shell-workspace-panel combat-lab-${definition.tabId}-panel`,
      );
      panel.dataset.combatLabTabPanel = definition.tabId;
      panel.id = `combat-lab-workspace-panel-${definition.tabId}`;
      control.setAttribute('aria-controls', panel.id);
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', control.id);
      const title = node('h2', 'combat-lab-tab-heading', definition.titleRu);
      const content = node('div', `combat-lab-workspace-host combat-lab-workspace-${definition.tabId}-host`);
      content.dataset.combatLabWorkspaceHost = definition.tabId;
      panel.append(title, content);
      this.panels.set(definition.tabId, panel);
      hosts[definition.tabId] = content;
      panelHost.append(panel);

      this.listen(control, 'click', () => this.activate(definition.tabId));
    }

    this.hosts = Object.freeze(hosts) as CombatLabWorkspaceHosts;
    workspaceHostsByRoot.set(this.root, this.hosts);
    registeredWorkspaceRoots.add(this.root);
    left.append(leftHeader, toolbarHost, panelHost, auxiliaryTabList);

    const center = node('div', 'polygon-shell-center');
    center.setAttribute('aria-hidden', 'true');
    center.append(node('span', 'polygon-shell-center-label', 'КАРТА'));

    const right = node('aside', 'polygon-shell-right');
    right.id = 'polygon-shell-right-panel';
    right.setAttribute('aria-label', 'Контекстный инспектор');
    const rightHeader = node('div', 'polygon-shell-panel-header');
    rightHeader.append(
      node('strong', '', 'Контекст'),
      node('span', '', 'Данные подключаются только от владельцев продукта'),
    );
    const rightTabs = node('nav', 'polygon-shell-right-tabs');
    rightTabs.setAttribute('role', 'tablist');
    rightTabs.setAttribute('aria-label', 'Разделы правой панели');
    const rightPanelHost = node('div', 'polygon-shell-right-panels');

    for (const definition of POLYGON_RIGHT_PANEL_DEFINITIONS) {
      const control = button(definition.labelRu);
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
      panel.append(
        node('h2', 'polygon-shell-right-heading', definition.labelRu),
        node('div', 'polygon-shell-empty-state', definition.emptyRu),
      );
      this.rightPanels.set(definition.tabId, panel);
      rightPanelHost.append(panel);
      this.listen(control, 'click', () => this.activateRightPanel(definition.tabId));
    }
    right.append(rightHeader, rightTabs, rightPanelHost);

    main.append(left, center, right);

    const timeline = node('footer', 'polygon-shell-timeline');
    const timelineLabel = node('div', 'polygon-shell-timeline-label');
    timelineLabel.append(
      node('strong', '', 'Временная шкала'),
      node('span', '', 'История будет подключена отдельным поставщиком данных'),
    );
    const timelineTrack = node('div', 'polygon-shell-timeline-track');
    timelineTrack.setAttribute('aria-hidden', 'true');
    timelineTrack.append(node('div', 'polygon-shell-timeline-live-marker'));
    this.status = node('span', 'combat-lab-dock-status polygon-shell-live-status', 'LIVE');
    timeline.append(timelineLabel, timelineTrack, this.status);

    shell.append(header, primaryTabList, main, timeline);
    options.host.append(shell);

    this.listen(this.toggle, 'click', () => this.setCollapsed(!this.collapsed));
    this.listen(this.rightToggle, 'click', () => this.setRightCollapsed(!this.rightCollapsed));

    const storedTab = readStoredTab(this.storage);
    this.activeTab = normalizeCombatLabWorkspaceTab(storedTab);
    this.activate(this.activeTab, false);

    this.activeRightTab = normalizeRightPanelTab(readStoredRightTab(this.storage));
    this.activateRightPanel(this.activeRightTab, false);
  }

  static create(options: CombatLabWorkspaceTabsOptions): CombatLabWorkspaceTabs {
    return new CombatLabWorkspaceTabs(options);
  }

  activate(tabId: CombatLabWorkspaceTab, persist = true): void {
    if (this.destroyed) return;
    const normalized = normalizeCombatLabWorkspaceTab(tabId);
    this.activeTab = normalized;
    this.root.dataset.activeWorkspace = normalized;
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
    this.toggle.textContent = collapsed ? 'Развернуть слева' : 'Свернуть слева';
    this.toggle.setAttribute('aria-expanded', String(!collapsed));
    document.body.classList.toggle('combat-lab-dock-collapsed', collapsed);
    document.body.classList.toggle('combat-lab-dock-open', !collapsed);
    requestWorkspaceResize();
  }

  setRightCollapsed(collapsed: boolean): void {
    if (this.destroyed || this.rightCollapsed === collapsed) return;
    this.rightCollapsed = collapsed;
    this.root.classList.toggle('polygon-shell-right-collapsed', collapsed);
    this.rightToggle.textContent = collapsed ? 'Развернуть справа' : 'Свернуть справа';
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

function normalizeRightPanelTab(value: unknown): PolygonRightPanelTab {
  return typeof value === 'string'
    && POLYGON_RIGHT_PANEL_DEFINITIONS.some((definition) => definition.tabId === value)
    ? value as PolygonRightPanelTab
    : 'unit';
}

function requestWorkspaceResize(): void {
  window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
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
