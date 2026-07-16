export interface AiEditorSectionDefinition {
  readonly id: string;
  readonly labelRu: string;
  readonly order: number;
  render(panel: HTMLElement): void;
  beforeLeave?: () => boolean | Promise<boolean>;
  onDeactivate?: () => void;
  dispose?: () => void;
}

interface EditorHost {
  readonly navigation: HTMLElement;
  readonly mainTabs: HTMLElement;
  readonly panel: HTMLElement;
  readonly graphRoot: HTMLElement;
}

const BUILT_IN_SECTIONS: ReadonlyArray<readonly [string, string, number]> = [
  ['graph', 'Граф поведения', 10],
  ['profiles', 'Профили маршрута', 20],
  ['attentionProfiles', 'Профили внимания', 40],
  ['blackboard', 'Данные бойца', 50],
];

const sections = new Map<string, AiEditorSectionDefinition>();
let host: EditorHost | null = null;
let activeSectionId: string | null = null;
let bypassBuiltInClick = false;
let unloadListenerInstalled = false;

export function registerAiEditorSection(definition: AiEditorSectionDefinition): () => void {
  if (!definition.id.trim()) throw new Error('AI editor section id is required.');
  if (sections.has(definition.id)) throw new Error(`AI editor section is already registered: ${definition.id}`);
  sections.set(definition.id, definition);
  ensureHost();
  syncSectionButtons();
  installUnloadListener();
  return () => unregisterAiEditorSection(definition.id);
}

export function getActiveAiEditorSectionId(): string | null {
  return activeSectionId;
}

async function activateCustomSection(sectionId: string): Promise<void> {
  const currentHost = ensureHost();
  const definition = sections.get(sectionId);
  if (!definition || activeSectionId === sectionId) return;
  if (!(await deactivateCurrentSection())) return;

  const graphButton = currentHost.mainTabs.querySelector<HTMLButtonElement>('[data-navigation-tab="graph"]');
  if (graphButton) {
    bypassBuiltInClick = true;
    graphButton.click();
  }

  activeSectionId = sectionId;
  currentHost.graphRoot.hidden = true;
  currentHost.panel.hidden = false;
  currentHost.panel.dataset.activeAiEditorSection = sectionId;
  updateSelectedButtons(sectionId);
  definition.render(currentHost.panel);
}

async function deactivateCurrentSection(): Promise<boolean> {
  if (!activeSectionId) return true;
  const definition = sections.get(activeSectionId);
  if (definition?.beforeLeave && !(await definition.beforeLeave())) return false;
  definition?.onDeactivate?.();
  activeSectionId = null;
  const currentHost = ensureHost();
  delete currentHost.panel.dataset.activeAiEditorSection;
  delete currentHost.panel.dataset.activeProfileEditor;
  updateSelectedButtons(null);
  return true;
}

function unregisterAiEditorSection(sectionId: string): void {
  const definition = sections.get(sectionId);
  if (!definition) return;
  if (activeSectionId === sectionId) {
    definition.onDeactivate?.();
    activeSectionId = null;
  }
  definition.dispose?.();
  sections.delete(sectionId);
  host?.mainTabs.querySelector(`[data-ai-editor-section="${cssEscape(sectionId)}"]`)?.remove();
  syncSectionButtons();
}

function ensureHost(): EditorHost {
  if (host) return host;
  const navigation = document.querySelector<HTMLElement>('.navigation-profile-tabs');
  const mainTabs = navigation?.querySelector<HTMLElement>('.navigation-profile-main-tabs');
  const panel = document.querySelector<HTMLElement>('.navigation-profile-workbench');
  const graphRoot = document.querySelector<HTMLElement>('#ai-node-editor-root');
  if (!navigation || !mainTabs || !panel || !graphRoot) {
    throw new Error('AI editor section registry could not find the editor shell.');
  }
  host = { navigation, mainTabs, panel, graphRoot };
  applyBuiltInLabels(mainTabs);
  navigation.addEventListener('click', handleNavigationClick, true);
  return host;
}

function handleNavigationClick(event: MouseEvent): void {
  const target = event.target instanceof Element ? event.target : null;
  const customButton = target?.closest<HTMLButtonElement>('[data-ai-editor-section]');
  if (customButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const sectionId = customButton.dataset.aiEditorSection;
    if (sectionId) void activateCustomSection(sectionId);
    return;
  }

  const builtInButton = target?.closest<HTMLButtonElement>('[data-navigation-tab]');
  if (!builtInButton) return;
  if (bypassBuiltInClick) {
    bypassBuiltInClick = false;
    scheduleBuiltInPanelLabel(builtInButton.dataset.navigationTab ?? '');
    return;
  }
  if (!activeSectionId) {
    scheduleBuiltInPanelLabel(builtInButton.dataset.navigationTab ?? '');
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  void leaveForBuiltInSection(builtInButton);
}

async function leaveForBuiltInSection(button: HTMLButtonElement): Promise<void> {
  if (!(await deactivateCurrentSection())) return;
  bypassBuiltInClick = true;
  button.click();
}

function syncSectionButtons(): void {
  const currentHost = ensureHost();
  for (const definition of sections.values()) {
    let button = currentHost.mainTabs.querySelector<HTMLButtonElement>(
      `[data-ai-editor-section="${cssEscape(definition.id)}"]`,
    );
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.dataset.aiEditorSection = definition.id;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', 'false');
    }
    button.textContent = definition.labelRu;
    currentHost.mainTabs.append(button);
  }

  const orderedButtons = [...currentHost.mainTabs.querySelectorAll<HTMLButtonElement>(
    '[data-navigation-tab], [data-ai-editor-section]',
  )].sort((left, right) => sectionOrder(left) - sectionOrder(right));
  for (const button of orderedButtons) currentHost.mainTabs.append(button);
  updateSelectedButtons(activeSectionId);
}

function applyBuiltInLabels(mainTabs: HTMLElement): void {
  for (const [id, labelRu] of BUILT_IN_SECTIONS) {
    const button = mainTabs.querySelector<HTMLButtonElement>(`[data-navigation-tab="${id}"]`);
    if (button) button.textContent = labelRu;
  }
}

function scheduleBuiltInPanelLabel(sectionId: string): void {
  if (sectionId !== 'profiles') return;
  queueMicrotask(() => {
    const currentHost = ensureHost();
    if (currentHost.panel.dataset.activeAiEditorSection) return;
    const heading = currentHost.panel.querySelector<HTMLHeadingElement>('.navigation-profile-list-heading h2');
    if (heading?.textContent?.trim() === 'Профили движения') heading.textContent = 'Профили маршрута';
  });
}

function sectionOrder(button: HTMLButtonElement): number {
  const customId = button.dataset.aiEditorSection;
  if (customId) return sections.get(customId)?.order ?? 1000;
  const builtInId = button.dataset.navigationTab;
  return BUILT_IN_SECTIONS.find(([id]) => id === builtInId)?.[2] ?? 1000;
}

function updateSelectedButtons(sectionId: string | null): void {
  const currentHost = ensureHost();
  currentHost.mainTabs.querySelectorAll<HTMLButtonElement>('[data-ai-editor-section]').forEach((button) => {
    const selected = button.dataset.aiEditorSection === sectionId;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
  });
  if (sectionId) {
    currentHost.mainTabs.querySelectorAll<HTMLButtonElement>('[data-navigation-tab]').forEach((button) => {
      button.classList.remove('active');
      button.setAttribute('aria-selected', 'false');
    });
  }
}

function installUnloadListener(): void {
  if (unloadListenerInstalled) return;
  unloadListenerInstalled = true;
  window.addEventListener('beforeunload', () => {
    for (const definition of sections.values()) definition.dispose?.();
  }, { once: true });
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && CSS.escape
    ? CSS.escape(value)
    : value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}
