import type { GameApplicationContext, GameApplicationExtension } from '../game/GameApplicationTypes';
import { CombatLabRenderer } from './rendering/CombatLabRenderer';
import type { CombatLabVisualSession } from './runtime/CombatLabVisualSession';
import { CombatLabShell, type CombatLabLayoutV1 } from './ui/CombatLabShell';

type CombatLabDockTab = 'fighter' | 'stand' | 'metrics' | 'log';

interface CombatLabDockLayout {
  readonly root: HTMLElement;
  readonly titleStatus: HTMLElement;
  readonly toggle: HTMLButtonElement;
  readonly tabButtons: ReadonlyMap<CombatLabDockTab, HTMLButtonElement>;
  readonly tabPanels: ReadonlyMap<CombatLabDockTab, HTMLElement>;
  readonly shellLayout: CombatLabLayoutV1;
}

export class CombatLabExtension implements GameApplicationExtension {
  private readonly renderer: CombatLabRenderer;
  private readonly shell: CombatLabShell;
  private readonly dock: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private readonly tabButtons: ReadonlyMap<CombatLabDockTab, HTMLButtonElement>;
  private readonly tabPanels: ReadonlyMap<CombatLabDockTab, HTMLElement>;
  private readonly restoreSimulationSidebar: () => void;
  private activeTab: CombatLabDockTab = 'stand';
  private collapsed = false;
  private destroyed = false;

  private constructor(
    private readonly root: HTMLElement,
    session: CombatLabVisualSession,
    context: GameApplicationContext,
  ) {
    const layout = createCombatLabDockLayout(root);
    this.dock = layout.root;
    this.toggle = layout.toggle;
    this.tabButtons = layout.tabButtons;
    this.tabPanels = layout.tabPanels;
    this.restoreSimulationSidebar = adoptSimulationSidebar(layout.tabPanels.get('fighter')!);

    let shell: CombatLabShell | null = null;
    const refreshUi = () => {
      shell?.refreshLive();
      layout.titleStatus.textContent = compactRunStatus(session);
      syncGamePauseControl(session);
    };
    this.renderer = CombatLabRenderer.create(context, session, refreshUi);
    this.shell = new CombatLabShell(layout.shellLayout, session, this.renderer);
    shell = this.shell;

    this.toggle.addEventListener('click', this.handleToggle);
    for (const [tab, button] of this.tabButtons) {
      button.addEventListener('click', () => this.activateTab(tab));
    }
    this.root.addEventListener('combat-lab:activate-tab', this.handleTabRequest as EventListener);
    this.root.dataset.combatLabExtension = 'active';
    document.body.classList.add('combat-lab-dock-open');
    document.body.classList.remove('combat-lab-dock-collapsed', 'sidebar-collapsed');
    document.body.classList.add('sidebar-open');
    this.activateTab('stand');
    refreshUi();
    context.forceRender();
  }

  static create(
    root: HTMLElement,
    session: CombatLabVisualSession,
    context: GameApplicationContext,
  ): CombatLabExtension {
    return new CombatLabExtension(root, session, context);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.toggle.removeEventListener('click', this.handleToggle);
    this.root.removeEventListener('combat-lab:activate-tab', this.handleTabRequest as EventListener);
    this.restoreSimulationSidebar();
    this.renderer.destroy();
    this.root.replaceChildren();
    delete this.root.dataset.combatLabExtension;
    document.body.classList.remove('combat-lab-dock-open', 'combat-lab-dock-collapsed');
  }

  private activateTab(tab: CombatLabDockTab): void {
    this.activeTab = tab;
    for (const [candidate, button] of this.tabButtons) {
      const active = candidate === tab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    }
    for (const [candidate, panel] of this.tabPanels) {
      panel.hidden = candidate !== tab;
    }
  }

  private readonly handleToggle = (): void => {
    this.collapsed = !this.collapsed;
    this.dock.classList.toggle('collapsed', this.collapsed);
    this.toggle.textContent = this.collapsed ? 'Полигон ›' : 'Свернуть';
    this.toggle.setAttribute('aria-expanded', String(!this.collapsed));
    document.body.classList.toggle('combat-lab-dock-collapsed', this.collapsed);
    document.body.classList.toggle('combat-lab-dock-open', !this.collapsed);
  };

  private readonly handleTabRequest = (event: CustomEvent<CombatLabDockTab>): void => {
    if (!this.tabPanels.has(event.detail)) return;
    this.activateTab(event.detail);
  };
}

function createCombatLabDockLayout(host: HTMLElement): CombatLabDockLayout {
  host.replaceChildren();
  const dock = node('section', 'combat-lab-dock combat-lab-drawer');
  dock.setAttribute('aria-label', 'Испытательный полигон');

  const header = node('header', 'combat-lab-dock-header');
  const brand = node('div', 'combat-lab-dock-brand');
  brand.append(
    node('strong', '', 'Испытательный полигон'),
    node('span', '', 'Производственная симуляция Stage 3–9'),
  );
  const titleStatus = node('span', 'combat-lab-dock-status');
  const toggle = createToggle();
  header.append(brand, titleStatus, toggle);

  const tabList = node('nav', 'combat-lab-tab-list');
  tabList.setAttribute('role', 'tablist');
  const tabButtons = new Map<CombatLabDockTab, HTMLButtonElement>();
  const tabPanels = new Map<CombatLabDockTab, HTMLElement>();
  for (const [tab, label] of [
    ['fighter', 'Боец'],
    ['stand', 'Стенд'],
    ['metrics', 'Метрики'],
    ['log', 'Журнал'],
  ] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.combatLabTab = tab;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', `combat-lab-panel-${tab}`);
    tabButtons.set(tab, button);
    tabList.append(button);
  }

  const panels = node('div', 'combat-lab-tab-panels');
  for (const tab of ['fighter', 'stand', 'metrics', 'log'] as const) {
    const panel = node('section', `combat-lab-tab-panel combat-lab-${tab}-panel`);
    panel.id = `combat-lab-panel-${tab}`;
    panel.dataset.combatLabTabPanel = tab;
    panel.setAttribute('role', 'tabpanel');
    panels.append(panel);
    tabPanels.set(tab, panel);
  }

  const toolbar = node('div', 'combat-lab-toolbar-slot');
  const stand = node('div', 'combat-lab-stand-content');
  tabPanels.get('stand')!.append(toolbar, stand);
  const shellLayout: CombatLabLayoutV1 = {
    root: dock,
    toolbar,
    stand,
    metrics: tabPanels.get('metrics')!,
    log: tabPanels.get('log')!,
  };

  dock.append(header, tabList, panels);
  host.append(dock);
  return { root: dock, titleStatus, toggle, tabButtons, tabPanels, shellLayout };
}

function adoptSimulationSidebar(host: HTMLElement): () => void {
  const sidebar = document.querySelector<HTMLElement>('.simulation-sidebar');
  if (!sidebar) {
    host.append(node('div', 'combat-lab-empty-tab', 'Панель бойца ещё не создана.'));
    return () => undefined;
  }
  const originalParent = sidebar.parentNode;
  const originalNextSibling = sidebar.nextSibling;
  sidebar.classList.add('combat-lab-adopted-sidebar');
  host.append(sidebar);
  return () => {
    sidebar.classList.remove('combat-lab-adopted-sidebar');
    if (!originalParent) return;
    originalParent.insertBefore(sidebar, originalNextSibling);
  };
}

function createToggle(): HTMLButtonElement {
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'combat-lab-dock-toggle combat-lab-drawer-toggle';
  toggle.textContent = 'Свернуть';
  toggle.setAttribute('aria-expanded', 'true');
  toggle.setAttribute('aria-controls', 'combat-lab-extension-root');
  return toggle;
}

function compactRunStatus(session: CombatLabVisualSession): string {
  const snapshot = session.getSnapshot();
  return `${snapshot.simulatedSeconds.toFixed(1)} с · ${snapshot.paused ? 'пауза' : `×${snapshot.speed}`}`;
}

function syncGamePauseControl(session: CombatLabVisualSession): void {
  const button = document.querySelector<HTMLButtonElement>('#pause-toggle');
  if (!button) return;
  const paused = session.isPaused();
  const label = paused ? 'Пауза: вкл' : 'Пауза: выкл';
  if (button.textContent !== label) button.textContent = label;
  if (button.getAttribute('aria-pressed') !== String(paused)) button.setAttribute('aria-pressed', String(paused));
  button.classList.toggle('hud-toggle-off', !paused);
}

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}
