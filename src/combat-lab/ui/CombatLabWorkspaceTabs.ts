import {
  COMBAT_LAB_WORKSPACE_TAB_DEFINITIONS,
  normalizeCombatLabWorkspaceTab,
  type CombatLabWorkspaceHosts,
  type CombatLabWorkspaceTab,
} from './CombatLabWorkspaceHosts';

const ACTIVE_TAB_STORAGE_KEY = 'real-wargame.combat-lab.workspace-tab.v1';

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
  private readonly listeners: Array<readonly [EventTarget, string, EventListener]> = [];
  private readonly storage: Storage | null;
  private activeTab: CombatLabWorkspaceTab;
  private destroyed = false;
  private collapsed = false;

  private constructor(private readonly options: CombatLabWorkspaceTabsOptions) {
    options.host.replaceChildren();
    this.storage = options.storage === undefined ? safeSessionStorage() : options.storage;

    const dock = node('section', 'combat-lab-dock combat-lab-drawer combat-lab-workspace');
    dock.setAttribute('aria-label', 'Испытательный полигон');
    this.root = dock;

    const header = node('header', 'combat-lab-dock-header');
    const brand = node('div', 'combat-lab-dock-brand');
    brand.append(
      node('strong', '', 'Испытательный полигон'),
      node('span', '', 'Combat Lab · редактор и серии прогонов'),
    );
    this.status = node('span', 'combat-lab-dock-status');
    this.toggle = button('Свернуть', 'combat-lab-dock-toggle combat-lab-drawer-toggle');
    this.toggle.setAttribute('aria-expanded', 'true');
    this.toggle.setAttribute('aria-controls', 'combat-lab-extension-root');
    header.append(brand, this.status, this.toggle);

    const toolbarHost = node('div', 'combat-lab-workspace-toolbar combat-lab-stage10-toolbar-host');
    toolbarHost.dataset.combatLabRunToolbarHost = 'true';
    this.toolbarHost = toolbarHost;

    const tabList = node('nav', 'combat-lab-tab-list combat-lab-workspace-tab-list');
    tabList.setAttribute('role', 'tablist');
    tabList.setAttribute('aria-label', 'Разделы Combat Lab');
    const panelHost = node('div', 'combat-lab-tab-panels combat-lab-workspace-panels');
    const hosts = {} as Record<CombatLabWorkspaceTab, HTMLElement>;

    for (const definition of COMBAT_LAB_WORKSPACE_TAB_DEFINITIONS) {
      const control = button(definition.labelRu);
      control.setAttribute('role', 'tab');
      control.dataset.combatLabTab = definition.tabId;
      control.id = `combat-lab-workspace-tab-${definition.tabId}`;
      this.buttons.set(definition.tabId, control);
      tabList.append(control);

      const panel = node('section', `combat-lab-tab-panel combat-lab-workspace-panel combat-lab-${definition.tabId}-panel`);
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
    dock.append(header, toolbarHost, tabList, panelHost);
    options.host.append(dock);
    this.listen(this.toggle, 'click', () => this.setCollapsed(!this.collapsed));

    const storedTab = readStoredTab(this.storage);
    this.activeTab = normalizeCombatLabWorkspaceTab(storedTab);
    this.activate(this.activeTab);
  }

  static create(options: CombatLabWorkspaceTabsOptions): CombatLabWorkspaceTabs {
    return new CombatLabWorkspaceTabs(options);
  }

  activate(tabId: CombatLabWorkspaceTab, persist = true): void {
    if (this.destroyed) return;
    const normalized = normalizeCombatLabWorkspaceTab(tabId);
    this.activeTab = normalized;
    for (const [value, buttonElement] of this.buttons) {
      const active = value === normalized;
      buttonElement.classList.toggle('active', active);
      buttonElement.setAttribute('aria-selected', String(active));
      buttonElement.tabIndex = active ? 0 : -1;
    }
    for (const [tabId, panel] of this.panels) panel.hidden = tabId !== normalized;
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
    this.toggle.textContent = collapsed ? 'Полигон ›' : 'Свернуть';
    this.toggle.setAttribute('aria-expanded', String(!collapsed));
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const [target, type, listener] of this.listeners) target.removeEventListener(type, listener);
    this.listeners.length = 0;
    this.options.host.replaceChildren();
  }

  private listen(target: EventTarget, type: string, callback: () => void): void {
    const listener: EventListener = () => callback();
    target.addEventListener(type, listener);
    this.listeners.push([target, type, listener]);
  }
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
    // Storage is optional; the current session keeps its in-memory selection.
  }
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
