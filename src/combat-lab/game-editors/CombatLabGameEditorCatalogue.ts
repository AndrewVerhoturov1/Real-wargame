import {
  GROUP_LABEL_RU,
  type GameEditorRegistry,
} from '../../game-editors/GameEditorRegistry';
import type {
  GameEditorActivation,
  GameEditorDefinition,
  GameEditorGroup,
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
    this.removeListeners();

    const groups = listCombatLabGameEditorGroups(this.options.registry);
    const allItems = groups.flatMap((group) => [...group.items]);
    if (!allItems.some((item) => item.definition.id === this.selectedEditorId)) {
      this.selectedEditorId = allItems[0]?.definition.id ?? null;
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
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'combat-lab-game-editor-item';
    button.dataset.gameEditorId = item.definition.id;
    button.dataset.gameEditorActivation = item.activation;
    button.classList.toggle('is-active', item.definition.id === this.selectedEditorId);
    button.setAttribute('aria-pressed', String(item.definition.id === this.selectedEditorId));
    button.append(
      node('strong', 'combat-lab-game-editor-item-label', item.definition.labelRu),
      node(
        'span',
        'combat-lab-game-editor-item-mode',
        item.activation === 'route' ? 'Полноэкранный редактор' : 'Редактор поверх карты',
      ),
    );
    const listener: EventListener = () => {
      this.selectedEditorId = item.definition.id;
      this.refresh();
    };
    button.addEventListener('click', listener);
    this.listeners.push([button, listener]);
    return button;
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
      selected.activation === 'route' ? 'ПОЛНОЭКРАННЫЙ' : 'ПОВЕРХ КАРТЫ',
    ));

    const body = node('div', 'combat-lab-game-editor-stage-body');
    const empty = node('div', 'combat-lab-game-editor-stage-empty');
    empty.append(
      node('div', 'combat-lab-game-editor-stage-empty-mark', '↗'),
      node('strong', '', selected.definition.labelRu),
      node(
        'p',
        '',
        'Редактор остаётся авторитетным продуктовым инструментом. Полигон показывает его через единый реестр без копии данных или отдельного состояния.',
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

  private removeListeners(): void {
    for (const [button, listener] of this.listeners) button.removeEventListener('click', listener);
    this.listeners.length = 0;
  }
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
