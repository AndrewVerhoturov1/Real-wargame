import type { GameApplicationContext, GameApplicationExtension } from '../game/GameApplicationTypes';
import { CombatLabRenderer } from './rendering/CombatLabRenderer';
import type { CombatLabVisualSession } from './runtime/CombatLabVisualSession';
import { CombatLabShell, type CombatLabLayoutV1 } from './ui/CombatLabShell';

type CombatLabDockTab = 'fighter' | 'stand' | 'metrics' | 'log';

interface DockLayout {
  readonly root: HTMLElement;
  readonly status: HTMLElement;
  readonly toggle: HTMLButtonElement;
  readonly buttons: ReadonlyMap<CombatLabDockTab, HTMLButtonElement>;
  readonly panels: ReadonlyMap<CombatLabDockTab, HTMLElement>;
  readonly shell: CombatLabLayoutV1;
}

export class CombatLabExtension implements GameApplicationExtension {
  private readonly renderer: CombatLabRenderer;
  private readonly shell: CombatLabShell;
  private readonly dock: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private readonly buttons: ReadonlyMap<CombatLabDockTab, HTMLButtonElement>;
  private readonly panels: ReadonlyMap<CombatLabDockTab, HTMLElement>;
  private readonly restoreSimulationSidebar: () => void;
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
    this.buttons = layout.buttons;
    this.panels = layout.panels;
    this.restoreSimulationSidebar = adoptSimulationSidebar(layout.panels.get('fighter')!);

    let shell: CombatLabShell | null = null;
    const refreshUi = () => {
      shell?.refreshLive();
      layout.status.textContent = compactRunStatus(session);
      syncGamePauseControl(session);
    };
    this.renderer = CombatLabRenderer.create(context, session, refreshUi);
    this.shell = new CombatLabShell(layout.shell, session, this.renderer);
    shell = this.shell;
    refineCombatLabShell(layout);

    this.toggle.addEventListener('click', this.handleToggle);
    for (const [tab, button] of this.buttons) button.addEventListener('click', () => this.activateTab(tab));
    this.root.addEventListener('combat-lab:activate-tab', this.handleTabRequest as EventListener);
    this.root.dataset.combatLabExtension = 'active';
    document.body.classList.add('combat-lab-dock-open', 'sidebar-open');
    document.body.classList.remove('combat-lab-dock-collapsed', 'sidebar-collapsed');
    this.activateTab('stand');
    refreshUi();
    context.forceRender();
  }

  static create(root: HTMLElement, session: CombatLabVisualSession, context: GameApplicationContext): CombatLabExtension {
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
    for (const [candidate, button] of this.buttons) {
      const active = candidate === tab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    }
    for (const [candidate, panel] of this.panels) panel.hidden = candidate !== tab;
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
    if (this.panels.has(event.detail)) this.activateTab(event.detail);
  };
}

function createCombatLabDockLayout(host: HTMLElement): DockLayout {
  host.replaceChildren();
  const dock = node('section', 'combat-lab-dock combat-lab-drawer');
  dock.setAttribute('aria-label', 'Испытательный полигон');

  const header = node('header', 'combat-lab-dock-header');
  const brand = node('div', 'combat-lab-dock-brand');
  brand.append(node('strong', '', 'Испытательный полигон'), node('span', '', 'Stage 3–9 · production runtime'));
  const status = node('span', 'combat-lab-dock-status');
  const toggle = createToggle();
  header.append(brand, status, toggle);

  const tabList = node('nav', 'combat-lab-tab-list');
  tabList.setAttribute('role', 'tablist');
  const buttons = new Map<CombatLabDockTab, HTMLButtonElement>();
  const panels = new Map<CombatLabDockTab, HTMLElement>();
  for (const [tab, label] of [
    ['fighter', 'Боец'], ['stand', 'Стенд'], ['metrics', 'Метрики'], ['log', 'Журнал'],
  ] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('data-combat-lab-tab', tab);
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', `combat-lab-panel-${tab}`);
    buttons.set(tab, button);
    tabList.append(button);
  }

  const panelHost = node('div', 'combat-lab-tab-panels');
  for (const tab of ['fighter', 'stand', 'metrics', 'log'] as const) {
    const panel = node('section', `combat-lab-tab-panel combat-lab-${tab}-panel`);
    panel.id = `combat-lab-panel-${tab}`;
    panel.dataset.combatLabTabPanel = tab;
    panel.setAttribute('role', 'tabpanel');
    panels.set(tab, panel);
    panelHost.append(panel);
  }

  const top = node('div', 'combat-lab-top combat-lab-run-toolbar');
  const body = node('div', 'combat-lab-body combat-lab-stand-content');
  const left = node('aside', 'combat-lab-left');
  const map = node('div', 'combat-lab-map combat-lab-map-placeholder');
  map.hidden = true;
  const right = node('aside', 'combat-lab-right');
  body.append(left, right, map);
  panels.get('stand')!.append(top, body);
  const bottom = panels.get('log')!;
  bottom.classList.add('combat-lab-bottom', 'combat-lab-log-panel');
  panels.get('metrics')!.classList.add('combat-lab-metrics-panel');

  dock.append(header, tabList, panelHost);
  host.append(dock);
  return { root: dock, status, toggle, buttons, panels, shell: { root: dock, top, left, map, right, bottom } };
}

function refineCombatLabShell(layout: DockLayout): void {
  compactRunToolbar(layout.shell.top);
  compactStandPanel(layout.shell.left, layout.shell.right);
  installMetricsView(layout.shell.right, layout.panels.get('metrics')!);
}

function compactRunToolbar(toolbar: HTMLElement): void {
  const children = Array.from(toolbar.children) as HTMLElement[];
  if (children.length < 12) return;
  const [, scenario, seed, visual, headless, pause, step, speed, program, save, restore, remove] = children;
  visual.textContent = 'Новый прогон';
  visual.classList.add('primary');
  const scenarioRow = node('div', 'combat-lab-scenario-row');
  scenarioRow.append(scenario, seed);
  const controls = node('div', 'combat-lab-run-controls');
  controls.append(visual, pause, step, speed);
  const more = document.createElement('details');
  more.className = 'combat-lab-run-more';
  more.append(node('summary', '', 'Дополнительно'), headless, program, save, restore, remove);
  toolbar.replaceChildren(scenarioRow, controls, more);
}

function compactStandPanel(left: HTMLElement, right: HTMLElement): void {
  const description = left.querySelector<HTMLElement>('.combat-lab-instructions');
  if (description) {
    const details = document.createElement('details');
    details.className = 'combat-lab-details combat-lab-scenario-details';
    details.append(node('summary', '', 'Описание стенда'), description);
    left.prepend(details);
  }

  const panels = Array.from(right.querySelectorAll<HTMLElement>(':scope > .combat-lab-panel'));
  const fire = panels.shift();
  if (fire) compactFirePanel(fire);
  const advanced = document.createElement('details');
  advanced.className = 'combat-lab-advanced';
  advanced.append(node('summary', '', 'Дополнительные действия'));
  for (const panel of panels) advanced.append(panel);

  const layerList = left.querySelector<HTMLElement>('.combat-lab-layer-list');
  if (layerList) {
    const layers = node('section', 'combat-lab-panel');
    layers.append(node('h2', 'combat-lab-section-title', 'Диагностические слои'), layerList);
    advanced.append(layers);
  }
  if (fire) left.append(fire);
  left.append(advanced);
  right.hidden = true;
}

function compactFirePanel(panel: HTMLElement): void {
  const fields = Array.from(panel.querySelectorAll<HTMLLabelElement>(':scope > .combat-lab-field'));
  const advancedFields = fields.filter((field) => {
    const label = field.querySelector('span')?.textContent ?? '';
    return label.startsWith('X ') || label.startsWith('Y ') || label.includes('Радиус') || label.includes('качество');
  });
  if (advancedFields.length === 0) return;
  const details = document.createElement('details');
  details.className = 'combat-lab-details';
  details.append(node('summary', '', 'Точные параметры'), ...advancedFields);
  const actions = panel.querySelector(':scope > .combat-lab-row');
  panel.insertBefore(details, actions);
}

function installMetricsView(source: HTMLElement, host: HTMLElement): void {
  const diagnostics = source.querySelector<HTMLElement>('.combat-lab-diagnostics');
  const title = source.querySelector<HTMLElement>('.combat-lab-section-title:last-of-type');
  if (!diagnostics) {
    host.append(node('div', 'combat-lab-empty-tab', 'Диагностика появится после запуска стенда.'));
    return;
  }
  title?.remove();
  const grid = node('div', 'combat-lab-metric-grid');
  const details = document.createElement('details');
  details.className = 'combat-lab-details combat-lab-raw-diagnostics';
  details.append(node('summary', '', 'Полная диагностика'), diagnostics);
  host.append(grid, details);
  const render = () => renderMetricCards(grid, diagnostics.textContent ?? '');
  new MutationObserver(render).observe(diagnostics, { childList: true, characterData: true, subtree: true });
  render();
}

function renderMetricCards(host: HTMLElement, json: string): void {
  let metrics: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(json) as { metrics?: Record<string, unknown> };
    metrics = parsed.metrics ?? {};
  } catch {
    // The pre is updated atomically; keep the previous readable state during a transient write.
  }
  const entries = Object.entries(metrics).slice(0, 20);
  host.replaceChildren(...entries.map(([key, value]) => {
    const card = node('div', 'combat-lab-metric-card');
    card.append(node('span', '', humanize(key)), node('strong', '', formatMetric(value)));
    return card;
  }));
  if (entries.length === 0) host.append(node('div', 'combat-lab-empty-tab', 'Метрики появятся после прогона.'));
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
    if (originalParent) originalParent.insertBefore(sidebar, originalNextSibling);
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

function humanize(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[._-]+/g, ' ');
}

function formatMetric(value: unknown): string {
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(3);
  if (typeof value === 'string' || typeof value === 'boolean') return String(value);
  return value == null ? '—' : (JSON.stringify(value) ?? String(value));
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}
