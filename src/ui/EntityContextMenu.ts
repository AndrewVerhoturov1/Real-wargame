import '../entity-context-menu.css';
import type { EntityContextTarget } from '../input/EntityContextTarget';
import { getRegisteredEntityContextMenuRoutes } from './EntityContextMenuRouteRegistry';

export type EntityContextPanelView = 'unit' | 'info' | 'attention' | 'memory';

export interface EntityContextMenuRoutes {
  readonly selectUnit?: (unitId: string) => void;
  readonly openPanel?: (target: EntityContextTarget, view: EntityContextPanelView) => void;
  readonly openEditor?: (target: EntityContextTarget) => void;
}

interface EntityContextMenuAction {
  readonly id: string;
  readonly label: string;
  readonly route: string;
  readonly enabled: boolean;
  readonly run: (() => void) | null;
}

const VIEWPORT_MARGIN_PX = 10;

export class EntityContextMenu {
  private readonly root = document.createElement('div');
  private readonly title = document.createElement('div');
  private readonly actionsRoot = document.createElement('div');
  private readonly buttons: HTMLButtonElement[] = [];

  constructor(private readonly routes: EntityContextMenuRoutes = {}) {
    this.root.className = 'entity-context-menu';
    this.root.dataset.role = 'entity-context-menu';
    this.root.setAttribute('role', 'menu');
    this.root.setAttribute('aria-label', 'Действия с сущностью');
    this.root.hidden = true;

    this.title.className = 'entity-context-menu-title';
    this.actionsRoot.className = 'entity-context-menu-actions';
    this.root.append(this.title, this.actionsRoot);
    document.body.append(this.root);

    document.addEventListener('pointerdown', this.handleOutsidePointerDown, true);
    window.addEventListener('keydown', this.handleKeyDown, true);
    this.root.addEventListener('contextmenu', this.handleContextMenu);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(target: EntityContextTarget, anchor: { x: number; y: number }): void {
    this.root.dataset.targetKind = target.kind;
    this.root.dataset.targetId = target.id;
    this.title.textContent = target.labelRu;
    this.renderActions(this.buildActions(target));
    this.root.hidden = false;
    this.root.style.left = '0px';
    this.root.style.top = '0px';

    const rect = this.root.getBoundingClientRect();
    const left = clamp(anchor.x + 7, VIEWPORT_MARGIN_PX, Math.max(VIEWPORT_MARGIN_PX, window.innerWidth - rect.width - VIEWPORT_MARGIN_PX));
    const top = clamp(anchor.y + 7, VIEWPORT_MARGIN_PX, Math.max(VIEWPORT_MARGIN_PX, window.innerHeight - rect.height - VIEWPORT_MARGIN_PX));
    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
    this.root.dataset.menuX = String(left);
    this.root.dataset.menuY = String(top);

    const firstEnabled = this.buttons.find((button) => !button.disabled);
    firstEnabled?.focus({ preventScroll: true });
  }

  hide(): void {
    if (this.root.hidden) return;
    this.root.hidden = true;
    this.buttons.length = 0;
    this.actionsRoot.replaceChildren();
    delete this.root.dataset.targetKind;
    delete this.root.dataset.targetId;
    delete this.root.dataset.menuX;
    delete this.root.dataset.menuY;
  }

  destroy(): void {
    document.removeEventListener('pointerdown', this.handleOutsidePointerDown, true);
    window.removeEventListener('keydown', this.handleKeyDown, true);
    this.root.removeEventListener('contextmenu', this.handleContextMenu);
    this.hide();
    this.root.remove();
  }

  private buildActions(target: EntityContextTarget): readonly EntityContextMenuAction[] {
    const routes = { ...getRegisteredEntityContextMenuRoutes(), ...this.routes };
    if (target.kind === 'unit') {
      return [
        this.action('select', 'Выбрать', 'pulse.selection', Boolean(routes.selectUnit), () => routes.selectUnit?.(target.id)),
        this.action('unit', 'Юнит', 'pulse.right-panel.unit', Boolean(routes.openPanel), () => routes.openPanel?.(target, 'unit')),
        this.action('attention', 'Внимание', 'linza.right-panel.attention', Boolean(routes.openPanel), () => routes.openPanel?.(target, 'attention')),
        this.action('memory', 'Память', 'linza.right-panel.memory', Boolean(routes.openPanel), () => routes.openPanel?.(target, 'memory')),
        this.action('edit', 'Редактировать', 'editors.open', Boolean(routes.openEditor), () => routes.openEditor?.(target)),
      ];
    }

    return [
      this.action('info', 'Инфо', 'linza.right-panel.info', Boolean(routes.openPanel), () => routes.openPanel?.(target, 'info')),
      this.action('edit', 'Редактировать', 'editors.open', Boolean(routes.openEditor), () => routes.openEditor?.(target)),
    ];
  }

  private action(
    id: string,
    label: string,
    route: string,
    enabled: boolean,
    run: () => void,
  ): EntityContextMenuAction {
    return Object.freeze({ id, label, route, enabled, run: enabled ? run : null });
  }

  private renderActions(actions: readonly EntityContextMenuAction[]): void {
    this.actionsRoot.replaceChildren();
    this.buttons.length = 0;
    for (const action of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'entity-context-menu-action';
      button.dataset.actionId = action.id;
      button.dataset.route = action.route;
      button.setAttribute('role', 'menuitem');
      button.disabled = !action.enabled;
      if (!action.enabled) button.title = 'Недоступно: владелец перехода ещё не подключён.';
      button.textContent = action.label;
      button.addEventListener('click', () => {
        if (!action.run) return;
        action.run();
        this.hide();
      });
      this.actionsRoot.append(button);
      this.buttons.push(button);
    }
  }

  private readonly handleOutsidePointerDown = (event: PointerEvent): void => {
    if (this.root.hidden || this.root.contains(event.target as Node)) return;
    this.hide();
  };

  private readonly handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (this.root.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.hide();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const enabled = this.buttons.filter((button) => !button.disabled);
    if (enabled.length === 0) return;
    event.preventDefault();
    const current = document.activeElement instanceof HTMLButtonElement ? enabled.indexOf(document.activeElement) : -1;
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    const next = (current + direction + enabled.length) % enabled.length;
    enabled[next]?.focus({ preventScroll: true });
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
