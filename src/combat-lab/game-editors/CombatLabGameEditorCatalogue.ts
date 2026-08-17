import {
  GROUP_LABEL_RU,
  type GameEditorRegistry,
} from '../../game-editors/GameEditorRegistry';
import type {
  GameEditorActivation,
  GameEditorDefinition,
  GameEditorGroup,
  GameEditorInstallation,
} from '../../game-editors/GameEditorTypes';

export interface CombatLabGameEditorCatalogueItem {
  readonly definition: GameEditorDefinition;
  readonly activation: GameEditorActivation;
}

export interface CombatLabGameEditorCatalogueGroup {
  readonly group: GameEditorGroup;
  readonly labelRu: string;
  readonly items: readonly CombatLabGameEditorCatalogueItem[];
}

export interface CombatLabGameEditorCatalogueOptions {
  readonly host: HTMLElement;
  readonly registry: GameEditorRegistry;
  readonly onOpen: (definition: GameEditorDefinition, trigger: HTMLElement) => void;
}

export function listCombatLabGameEditorGroups(
  registry: GameEditorRegistry,
): readonly CombatLabGameEditorCatalogueGroup[] {
  const grouped = new Map<GameEditorGroup, CombatLabGameEditorCatalogueItem[]>();
  for (const definition of registry.listForSurface('combat-lab')) {
    const activation = definition.activationFor('combat-lab');
    const items = grouped.get(definition.group) ?? [];
    items.push(Object.freeze({ definition, activation }));
    grouped.set(definition.group, items);
  }
  return Object.freeze([...grouped.entries()].map(([group, items]) => Object.freeze({
    group,
    labelRu: GROUP_LABEL_RU[group],
    items: Object.freeze(items),
  })));
}

export class CombatLabGameEditorCatalogue {
  private readonly root = document.createElement('section');
  private readonly listeners: Array<readonly [HTMLButtonElement, EventListener]> = [];
  private selectedEditorId: string | null = null;
  private installation: GameEditorInstallation | null = null;
  private mountGeneration = 0;
  private destroyed = false;

  private constructor(private readonly options: CombatLabGameEditorCatalogueOptions) {
    this.root.className = 'combat-lab-game-editor-catalogue';
    this.root.dataset.combatLabGameEditorCatalogue = 'true';
    this.options.host.replaceChildren(this.root);
    this.refresh();
  }

  static create(options: CombatLabGameEditorCatalogueOptions): CombatLabGameEditorCatalogue {
    return new CombatLabGameEditorCatalogue(options);
  }

  refresh(): void {
    if (this.destroyed) return;
    this.disposeInstallation();
    this.removeListeners();

    const groups = listCombatLabGameEditorGroups(this.options.registry);
    const allItems = groups.flatMap((group) => [...group.items]);
    if (!allItems.some((item) => item.definition.id === this.selectedEditorId)) {
      this.selectedEditorId = allItems.find((item) => item.activation === 'embedded' && item.definition.mount)?.definition.id
        ?? allItems[0]?.definition.id
        ?? null;
    }

    if (allItems.length === 0) {
      this.root.replaceChildren(node(
        'div',
        'combat-lab-empty-tab',
        'Для испытательного полигона пока нет доступных общих редакторов.',
      ));
      return;
    }

    const workspace = node('div', 'combat-lab-game-editor-workspace');
    const navigation = node('nav', 'combat-lab-game-editor-nav');
    navigation.setAttribute('aria-label', 'Общие редакторы');
    for (const group of groups) navigation.append(this.renderNavigationGroup(group));

    const stage = node('section', 'combat-lab-game-editor-stage');
    stage.setAttribute('aria-live', 'polite');
    this.renderStage(stage, allItems);
    workspace.append(navigation, stage);
    this.root.replaceChildren(workspace);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.disposeInstallation();
    this.removeListeners();
    this.options.host.replaceChildren();
  }

  private renderNavigationGroup(group: CombatLabGameEditorCatalogueGroup): HTMLElement {
    const section = node('section', 'combat-lab-game-editor-nav-group');
    section.dataset.gameEditorGroup = group.group;
    section.append(node('div', 'combat-lab-game-editor-nav-group-title', group.labelRu));
    for (const item of group.items) section.append(this.renderNavigationItem(item));
    return section;
  }

  private renderNavigationItem(item: CombatLabGameEditorCatalogueItem): HTMLButtonElement {
    const control = document.createElement('button');
    control.type = 'button';
    control.className = 'combat-lab-game-editor-item';
    control.dataset.gameEditorId = item.definition.id;
    control.dataset.gameEditorActivation = item.activation;
    control.classList.toggle('is-active', item.definition.id === this.selectedEditorId);
    control.setAttribute('aria-pressed', String(item.definition.id === this.selectedEditorId));
    control.append(
      node('strong', 'combat-lab-game-editor-item-label', item.definition.labelRu),
      node(
        'span',
        'combat-lab-game-editor-item-mode',
        item.activation === 'route' ? 'Полноэкранный редактор' : 'Встроенный редактор',
      ),
    );
    const listener: EventListener = () => { void this.selectItem(item); };
    control.addEventListener('click', listener);
    this.listeners.push([control, listener]);
    return control;
  }

  private async selectItem(item: CombatLabGameEditorCatalogueItem): Promise<void> {
    if (this.destroyed || item.definition.id === this.selectedEditorId) return;
    if (this.installation?.beforeClose && !(await this.installation.beforeClose())) return;
    this.selectedEditorId = item.definition.id;
    this.refresh();
  }

  private renderStage(
    stage: HTMLElement,
    allItems: readonly CombatLabGameEditorCatalogueItem[],
  ): void {
    const selected = allItems.find((item) => item.definition.id === this.selectedEditorId) ?? allItems[0];
    if (!selected) return;

    const header = node('header', 'combat-lab-game-editor-stage-head');
    const titleWrap = node('div', 'combat-lab-game-editor-stage-title-wrap');
    titleWrap.append(
      node('span', 'combat-lab-game-editor-stage-kicker', 'ОБЩИЕ ИГРОВЫЕ ДАННЫЕ'),
      node('h2', 'combat-lab-game-editor-stage-title', selected.definition.labelRu),
    );
    header.append(titleWrap, node(
      'span',
      'combat-lab-game-editor-stage-mode',
      selected.activation === 'route' ? 'ПОЛНОЭКРАННЫЙ' : 'ВСТРОЕННЫЙ',
    ));

    const body = node('div', `combat-lab-game-editor-stage-body${selected.activation === 'embedded' ? ' is-editor-mounted' : ''}`);
    if (selected.activation === 'embedded' && selected.definition.mount) {
      const mountHost = node('div', 'combat-lab-game-editor-mounted-host');
      body.append(mountHost);
      stage.replaceChildren(header, body);
      void this.mountEmbedded(selected, mountHost);
      return;
    }

    const empty = node('div', 'combat-lab-game-editor-stage-empty');
    empty.append(
      node('div', 'combat-lab-game-editor-stage-empty-mark', '↗'),
      node('strong', '', selected.definition.labelRu),
      node(
        'p',
        '',
        'Этот authoritative editor живёт на отдельном product-route. Полигон не создаёт его копию.',
      ),
    );
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'combat-lab-game-editor-stage-open';
    open.textContent = 'ОТКРЫТЬ РЕДАКТОР';
    const listener: EventListener = () => this.options.onOpen(selected.definition, open);
    open.addEventListener('click', listener);
    this.listeners.push([open, listener]);
    empty.append(open);
    body.append(empty);
    stage.replaceChildren(header, body);
  }

  private async mountEmbedded(
    selected: CombatLabGameEditorCatalogueItem,
    host: HTMLElement,
  ): Promise<void> {
    if (selected.activation !== 'embedded' || !selected.definition.mount) return;
    const generation = ++this.mountGeneration;
    try {
      const installation = await selected.definition.mount({
        host,
        surface: 'combat-lab',
        request: {
          editorId: selected.definition.id,
          profileId: selected.definition.id === 'routeProfiles' ? 'cautious' : undefined,
        },
        requestClose: () => {},
      });
      if (this.destroyed || generation !== this.mountGeneration || selected.definition.id !== this.selectedEditorId) {
        installation.destroy();
        return;
      }

      if (selected.definition.id === 'routeProfiles') {
        const observer = new MutationObserver(() => {
          queueMicrotask(() => decorateRouteProfileEditor(host));
        });
        decorateRouteProfileEditor(host);
        observer.observe(host, { childList: true });
        this.installation = {
          beforeClose: installation.beforeClose ? () => installation.beforeClose!() : undefined,
          destroy(): void {
            observer.disconnect();
            installation.destroy();
          },
        };
        return;
      }

      this.installation = installation;
    } catch (error) {
      if (this.destroyed || generation !== this.mountGeneration) return;
      host.replaceChildren(node(
        'div',
        'combat-lab-game-editor-stage-error',
        `Редактор не открылся: ${error instanceof Error ? error.message : String(error)}`,
      ));
    }
  }

  private disposeInstallation(): void {
    this.mountGeneration += 1;
    this.installation?.destroy();
    this.installation = null;
  }

  private removeListeners(): void {
    for (const [control, listener] of this.listeners) control.removeEventListener('click', listener);
    this.listeners.length = 0;
  }
}

function decorateRouteProfileEditor(host: HTMLElement): void {
  if (host.querySelector('.polygon-route-profile-tabs')) return;
  const layout = host.querySelector<HTMLElement>('.navigation-profile-layout');
  const listPanel = host.querySelector<HTMLElement>('.navigation-profile-list-panel');
  const listHeading = host.querySelector<HTMLElement>('.navigation-profile-list-heading');
  const list = host.querySelector<HTMLElement>('.navigation-profile-list');
  const listActions = host.querySelector<HTMLElement>('.navigation-profile-list-actions');
  const form = host.querySelector<HTMLElement>('.navigation-profile-form-panel');
  const formHeading = host.querySelector<HTMLElement>('.navigation-profile-form-heading');
  const formActions = host.querySelector<HTMLElement>('.navigation-profile-form-actions');
  const nameCard = host.querySelector<HTMLElement>('.navigation-profile-name-card');
  if (!layout || !listPanel || !listHeading || !list || !listActions || !form || !formHeading) return;

  host.classList.add('polygon-route-profile-editor');
  const profileButtons = [...list.querySelectorAll<HTMLButtonElement>('[data-profile-id]')];
  const selectedButton = profileButtons.find((button) => button.classList.contains('active')) ?? profileButtons[0];
  const profileId = selectedButton?.dataset.profileId ?? '—';
  const profileName = selectedButton?.querySelector('strong')?.textContent?.trim()
    ?? formHeading.querySelector('h2')?.textContent?.trim()
    ?? 'Профиль';
  const description = formHeading.querySelector('p')?.textContent?.trim() ?? '';
  const kicker = formHeading.querySelector('.navigation-profile-kicker')?.textContent?.trim() ?? '';

  const headingCount = listHeading.querySelector<HTMLElement>('span');
  if (headingCount) {
    headingCount.textContent = String(profileButtons.length);
    headingCount.title = 'Количество доступных профилей';
  }
  const headingTitle = listHeading.querySelector<HTMLElement>('h2');
  if (headingTitle) headingTitle.textContent = 'Профили маршрута';
  const headingDescription = listHeading.querySelector<HTMLElement>('p');
  if (headingDescription) headingDescription.textContent = 'Выберите профиль';

  const createButton = listActions.querySelector<HTMLButtonElement>('[data-profile-action="create"]');
  if (createButton) createButton.textContent = '+ Создать профиль';
  const copyButton = listActions.querySelector<HTMLButtonElement>('[data-profile-action="copy"]');
  const management = document.createElement('details');
  management.className = 'polygon-route-profile-management';
  const managementSummary = document.createElement('summary');
  managementSummary.textContent = '⋯ Управление';
  const managementBody = node('div', 'polygon-route-profile-management-body');
  management.append(managementSummary, managementBody);

  for (const child of [...listActions.children]) {
    if (child === createButton || child === copyButton) continue;
    managementBody.append(child);
  }
  listActions.append(management);

  if (formActions) {
    for (const child of [...formActions.children]) managementBody.append(child);
    if (copyButton) {
      copyButton.textContent = 'Создать свою копию';
      formActions.append(copyButton);
    }
  } else if (copyButton) {
    managementBody.append(copyButton);
  }

  const tabs = node('nav', 'polygon-route-profile-tabs');
  tabs.setAttribute('aria-label', 'Разделы профиля маршрута');
  const summary = node('section', 'polygon-route-profile-summary');
  summary.append(
    node('span', 'polygon-route-profile-summary-kicker', 'КРАТКОЕ РЕЗЮМЕ'),
    node('strong', '', profileName),
    node('p', '', description || 'Описание хранится в авторитетном профиле маршрута.'),
  );

  const primary = node('section', 'polygon-route-profile-primary');
  primary.append(node('header', '', 'Основное ограничение'));
  const maximumInput = host.querySelector<HTMLInputElement>('[data-profile-number="maximumDetourRatio"]');
  const maximumField = maximumInput?.closest<HTMLElement>('label');
  if (maximumField) primary.append(maximumField);
  else primary.append(node('p', '', 'Параметр максимального обхода недоступен.'));

  const metadata = node('section', 'polygon-route-profile-metadata');
  metadata.append(
    node('header', '', 'О ПРОФИЛЕ'),
    metaRow('Название', profileName),
    metaRow('Тип', kicker.toLowerCase().includes('встроенный') ? 'Встроенный' : 'Пользовательский'),
    metaRow('Технический ID', profileId),
    metaRow('Ревизия', kicker.match(/revision\s+(\d+)/i)?.[1] ?? '—'),
  );

  const groups = [...form.querySelectorAll<HTMLElement>('.navigation-profile-group')];
  if (nameCard) form.append(nameCard);
  formHeading.after(tabs, summary, primary, metadata);

  const views = [
    { id: 'main', label: 'Основное', groups: [] as HTMLElement[], showName: false },
    { id: 'terrain', label: 'Местность', groups: groups.slice(0, 1), showName: false },
    { id: 'tactics', label: 'Тактика', groups: groups.slice(1, 3), showName: false },
    { id: 'route', label: 'Маршрут', groups: groups.slice(3), showName: true },
  ] as const;

  const activate = (id: string): void => {
    const main = id === 'main';
    summary.hidden = !main;
    primary.hidden = !main;
    metadata.hidden = !main;
    groups.forEach((group) => { group.hidden = true; });
    if (nameCard) nameCard.hidden = true;
    const view = views.find((candidate) => candidate.id === id) ?? views[0];
    for (const group of view.groups) group.hidden = false;
    if (nameCard) nameCard.hidden = !view.showName;
    tabs.querySelectorAll<HTMLButtonElement>('button').forEach((control) => {
      const active = control.dataset.routeProfileTab === view.id;
      control.classList.toggle('is-active', active);
      control.setAttribute('aria-selected', String(active));
    });
  };

  for (const view of views) {
    const control = document.createElement('button');
    control.type = 'button';
    control.dataset.routeProfileTab = view.id;
    control.textContent = view.label;
    control.addEventListener('click', () => activate(view.id));
    tabs.append(control);
  }
  activate('main');
}

function metaRow(label: string, value: string): HTMLElement {
  const row = node('div', 'polygon-route-profile-meta-row');
  row.append(node('span', '', label), node('strong', '', value));
  return row;
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
