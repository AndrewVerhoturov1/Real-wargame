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
    const introduction = node(
      'p',
      'combat-lab-game-editor-catalogue-intro',
      'Здесь открываются общие авторитетные редакторы игры. Изменения сохраняются в их собственных реестрах, а не в черновике эксперимента.',
    );
    const groups = listCombatLabGameEditorGroups(this.options.registry);
    const content = groups.length > 0
      ? groups.map((group) => this.renderGroup(group))
      : [node('div', 'combat-lab-empty-tab', 'Для испытательного полигона пока нет доступных общих редакторов.')];
    this.root.replaceChildren(introduction, ...content);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.removeListeners();
    this.options.host.replaceChildren();
  }

  private renderGroup(group: CombatLabGameEditorCatalogueGroup): HTMLElement {
    const section = node('section', 'combat-lab-game-editor-group');
    section.dataset.gameEditorGroup = group.group;
    section.append(node('h3', 'combat-lab-game-editor-group-title', group.labelRu));
    const list = node('div', 'combat-lab-game-editor-list');
    for (const item of group.items) list.append(this.renderItem(item));
    section.append(list);
    return section;
  }

  private renderItem(item: CombatLabGameEditorCatalogueItem): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'combat-lab-game-editor-item';
    button.dataset.gameEditorId = item.definition.id;
    button.dataset.gameEditorActivation = item.activation;
    const label = node('strong', 'combat-lab-game-editor-item-label', item.definition.labelRu);
    const mode = node(
      'span',
      'combat-lab-game-editor-item-mode',
      item.activation === 'route' ? 'Откроется в полноэкранном редакторе' : 'Откроется поверх карты',
    );
    button.append(label, mode);
    const listener: EventListener = () => this.options.onOpen(item.definition, button);
    button.addEventListener('click', listener);
    this.listeners.push([button, listener]);
    return button;
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
