import {
  isCombatLabWorkspaceTab,
  type CombatLabWorkspaceTab,
} from '../ui/CombatLabWorkspaceHosts';

const PRESENTED_LEFT_TABS = new Set<CombatLabWorkspaceTab>(['scene', 'parameters']);
const EDITOR_PANEL_TABS = ['scene', 'parameters', 'settings'] as const;
type EditorPanelTab = typeof EDITOR_PANEL_TABS[number];

export interface CombatLabEditorShellBridgeOptions {
  readonly root: HTMLElement;
  readonly eventTarget: HTMLElement;
  readonly search?: string;
}

/**
 * Presentation-only bridge between the accepted Polygon shell and the already
 * mounted Combat Lab editor hosts. It reparents the existing hosts; it never
 * creates editor state, a registry, or a second editor installation.
 */
export class CombatLabEditorShellBridge {
  private readonly hiddenHosts: HTMLElement;
  private readonly leftBody: HTMLElement;
  private readonly leftMount: HTMLElement;
  private readonly editorsButton: HTMLButtonElement;
  private readonly portal: HTMLElement;
  private readonly portalBody: HTMLElement;
  private readonly returnButton: HTMLButtonElement;
  private readonly panels: Readonly<Record<EditorPanelTab, HTMLElement>>;
  private readonly initialLeftBodyAriaHidden: string | null;
  private readonly initialEditorsTitle: string;
  private readonly initialEditorsAriaDisabled: string | null;
  private activeTab: CombatLabWorkspaceTab;
  private returnTab: CombatLabWorkspaceTab = 'program';
  private destroyed = false;

  private constructor(private readonly options: CombatLabEditorShellBridgeOptions) {
    this.hiddenHosts = requireElement(options.root, '.polygon-shell-hidden-hosts');
    this.leftBody = requireElement(options.root, '.polygon-shell-left > .polygon-shell-panel-body');
    this.editorsButton = requireElement<HTMLButtonElement>(options.root, '.polygon-shell-top-button--editors');
    this.panels = Object.freeze({
      scene: requireElement(options.root, '#combat-lab-workspace-panel-scene'),
      parameters: requireElement(options.root, '#combat-lab-workspace-panel-parameters'),
      settings: requireElement(options.root, '#combat-lab-workspace-panel-settings'),
    });

    this.initialLeftBodyAriaHidden = this.leftBody.getAttribute('aria-hidden');
    this.initialEditorsTitle = this.editorsButton.title;
    this.initialEditorsAriaDisabled = this.editorsButton.getAttribute('aria-disabled');

    this.leftMount = node('div', 'polygon-shell-editor-tab-host');
    this.leftMount.hidden = true;
    this.leftBody.append(this.leftMount);

    this.portal = node('section', 'polygon-shell-editors-portal');
    this.portal.hidden = true;
    this.portal.setAttribute('aria-label', 'Общие редакторы игры');
    const portalHeader = node('header', 'polygon-shell-editors-portal-header');
    const heading = node('div', 'polygon-shell-editors-portal-heading');
    heading.append(
      node('div', 'polygon-shell-panel-kicker', 'ОБЩИЕ РЕДАКТОРЫ'),
      node('h2', 'polygon-shell-editors-portal-title', 'Редакторы игры'),
    );
    this.returnButton = button('← Назад', 'polygon-shell-editors-return');
    this.returnButton.setAttribute('aria-label', 'Вернуться к Полигону');
    portalHeader.append(heading, this.returnButton);
    this.portalBody = node('div', 'polygon-shell-editors-portal-body');
    this.portal.append(portalHeader, this.portalBody);
    options.root.append(this.portal);

    this.editorsButton.removeAttribute('aria-disabled');
    this.editorsButton.setAttribute('aria-pressed', 'false');
    this.editorsButton.title = 'Открыть общие редакторы игры';
    this.editorsButton.addEventListener('click', this.handleEditorsClick);
    this.returnButton.addEventListener('click', this.handleReturnClick);
    options.root.addEventListener('combat-lab-workspace-tab-change', this.handleWorkspaceTabChanged);

    const initialTab = readWorkspaceTab(options.root.dataset.activeWorkspace) ?? 'program';
    this.activeTab = initialTab;
    if (initialTab !== 'settings') this.returnTab = initialTab;
    this.sync(initialTab);

    if (requestsEditorCatalogue(options.search ?? window.location.search)) {
      this.requestTab('settings');
    }
  }

  static create(options: CombatLabEditorShellBridgeOptions): CombatLabEditorShellBridge {
    return new CombatLabEditorShellBridge(options);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.editorsButton.removeEventListener('click', this.handleEditorsClick);
    this.returnButton.removeEventListener('click', this.handleReturnClick);
    this.options.root.removeEventListener('combat-lab-workspace-tab-change', this.handleWorkspaceTabChanged);

    for (const tabId of EDITOR_PANEL_TABS) this.restorePanel(tabId);
    this.leftMount.remove();
    this.portal.remove();
    this.options.root.classList.remove('polygon-shell-editors-open');
    restoreAttribute(this.leftBody, 'aria-hidden', this.initialLeftBodyAriaHidden);
    restoreAttribute(this.editorsButton, 'aria-disabled', this.initialEditorsAriaDisabled);
    this.editorsButton.removeAttribute('aria-pressed');
    this.editorsButton.title = this.initialEditorsTitle;
  }

  private readonly handleEditorsClick = (): void => {
    if (this.destroyed) return;
    if (this.activeTab === 'settings') {
      this.requestTab(this.returnTab);
      return;
    }
    this.returnTab = this.activeTab;
    this.requestTab('settings');
  };

  private readonly handleReturnClick = (): void => {
    if (!this.destroyed) this.requestTab(this.returnTab);
  };

  private readonly handleWorkspaceTabChanged = (event: Event): void => {
    if (this.destroyed) return;
    const requested = (event as CustomEvent<unknown>).detail;
    if (!isCombatLabWorkspaceTab(requested)) return;
    this.activeTab = requested;
    if (requested !== 'settings') this.returnTab = requested;
    this.sync(requested);
  };

  private requestTab(tabId: CombatLabWorkspaceTab): void {
    this.options.eventTarget.dispatchEvent(new CustomEvent<CombatLabWorkspaceTab>(
      'combat-lab:activate-tab',
      { bubbles: true, detail: tabId },
    ));
  }

  private sync(tabId: CombatLabWorkspaceTab): void {
    const settingsOpen = tabId === 'settings';
    this.options.root.classList.toggle('polygon-shell-editors-open', settingsOpen);
    this.editorsButton.setAttribute('aria-pressed', String(settingsOpen));
    this.portal.hidden = !settingsOpen;

    if (settingsOpen) {
      this.restorePanel('scene');
      this.restorePanel('parameters');
      this.leftMount.hidden = true;
      restoreAttribute(this.leftBody, 'aria-hidden', this.initialLeftBodyAriaHidden);
      this.presentPanel('settings', this.portalBody);
      return;
    }

    this.restorePanel('settings');
    if (PRESENTED_LEFT_TABS.has(tabId)) {
      const editorTab = tabId as Extract<EditorPanelTab, 'scene' | 'parameters'>;
      for (const candidate of ['scene', 'parameters'] as const) {
        if (candidate !== editorTab) this.restorePanel(candidate);
      }
      this.leftMount.hidden = false;
      this.leftBody.removeAttribute('aria-hidden');
      this.presentPanel(editorTab, this.leftMount);
      return;
    }

    this.restorePanel('scene');
    this.restorePanel('parameters');
    this.leftMount.hidden = true;
    restoreAttribute(this.leftBody, 'aria-hidden', this.initialLeftBodyAriaHidden);
  }

  private presentPanel(tabId: EditorPanelTab, host: HTMLElement): void {
    const panel = this.panels[tabId];
    panel.classList.add('polygon-shell-presented-editor-panel');
    host.append(panel);
  }

  private restorePanel(tabId: EditorPanelTab): void {
    const panel = this.panels[tabId];
    panel.classList.remove('polygon-shell-presented-editor-panel');
    if (panel.parentElement !== this.hiddenHosts) this.hiddenHosts.append(panel);
  }
}

export function requestsEditorCatalogue(search: string): boolean {
  try {
    return new URLSearchParams(search).get('tab') === 'settings';
  } catch {
    return false;
  }
}

function readWorkspaceTab(value: unknown): CombatLabWorkspaceTab | null {
  return isCombatLabWorkspaceTab(value) ? value : null;
}

function requireElement<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Не найден элемент нового Полигона: ${selector}`);
  return element;
}

function restoreAttribute(element: Element, name: string, value: string | null): void {
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

function button(label: string, className: string): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.textContent = label;
  return element;
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
