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
import {
  installPolygonGlobalEditorParity,
  isPolygonGlobalEditorId,
  type PolygonGlobalEditorId,
} from './PolygonGlobalEditorParity';

export interface CombatLabGameEditorCatalogueItem {
  readonly definition: GameEditorDefinition;
  readonly activation: GameEditorActivation;
}

export interface CombatLabGameEditorCatalogueGroup {
  readonly group: GameEditorGroup;
  readonly labelRu: string;
  readonly ids: readonly PolygonVisibleEditorId[];
  readonly items: readonly CombatLabGameEditorCatalogueItem[];
}

export interface CombatLabGameEditorCatalogueOptions {
  readonly host: HTMLElement;
  readonly registry: GameEditorRegistry;
  readonly onOpen: (definition: GameEditorDefinition, trigger: HTMLElement) => void;
}

type PolygonVisibleEditorId = PolygonGlobalEditorId | 'surfaceTypes';

export const POLYGON_GLOBAL_EDITOR_GROUPS = Object.freeze([
  Object.freeze({ group: 'behavior' as const, ids: Object.freeze(['routeProfiles', 'tacticalPositions'] as const) }),
  Object.freeze({
    group: 'soldier' as const,
    ids: Object.freeze(['soldierArchetypes', 'attentionProfiles', 'perceptionProfiles', 'movementProfiles'] as const),
  }),
  Object.freeze({ group: 'combat' as const, ids: Object.freeze(['weapons', 'conditionProfiles'] as const) }),
  Object.freeze({
    group: 'world' as const,
    ids: Object.freeze(['surfaceTypes', 'environmentProfiles', 'directionalTerrain'] as const),
  }),
] satisfies ReadonlyArray<{
  readonly group: GameEditorGroup;
  readonly ids: readonly PolygonVisibleEditorId[];
}>);

export function listCombatLabGameEditorGroups(
  registry: GameEditorRegistry,
): readonly CombatLabGameEditorCatalogueGroup[] {
  const available = new Map(
    registry.listForSurface('combat-lab').map((definition) => [definition.id, definition] as const),
  );
  return Object.freeze(POLYGON_GLOBAL_EDITOR_GROUPS.map(({ group, ids }) => {
    const items = ids.flatMap((id): CombatLabGameEditorCatalogueItem[] => {
      if (id === 'surfaceTypes') return [];
      const definition = available.get(id);
      if (!definition) return [];
      return [{
        definition,
        activation: definition.activationFor('combat-lab'),
      }];
    });
    return Object.freeze({
      group,
      labelRu: GROUP_LABEL_RU[group],
      ids,
      items: Object.freeze(items),
    });
  }));
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
    for (const id of group.ids) {
      if (id === 'surfaceTypes') {
        section.append(this.renderUnavailableSurfaceTypesItem());
        continue;
      }
      const item = group.items.find((candidate) => candidate.definition.id === id);
      if (item) section.append(this.renderNavigationItem(item));
    }
    return section;
  }

  private renderUnavailableSurfaceTypesItem(): HTMLButtonElement {
    const control = document.createElement('button');
    control.type = 'button';
    control.className = 'combat-lab-game-editor-item is-unavailable';
    control.dataset.gameEditorId = 'surfaceTypes';
    control.dataset.gameEditorAvailability = 'unavailable';
    control.disabled = true;
    control.setAttribute('aria-disabled', 'true');
    control.title = 'Product-owner для отдельного редактора типов поверхностей пока отсутствует.';
    control.append(
      node('strong', 'combat-lab-game-editor-item-label', 'Типы поверхностей'),
      node('span', 'combat-lab-game-editor-item-unavailable', 'НЕДОСТУПНО'),
    );
    return control;
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

      if (!isPolygonGlobalEditorId(selected.definition.id)) {
        this.installation = installation;
        return;
      }

      const parity = installPolygonGlobalEditorParity(selected.definition.id, host);
      this.installation = {
        beforeClose: installation.beforeClose ? () => installation.beforeClose!() : undefined,
        destroy(): void {
          parity.destroy();
          installation.destroy();
        },
      };
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
