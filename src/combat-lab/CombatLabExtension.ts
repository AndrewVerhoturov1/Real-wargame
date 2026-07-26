import type { GameApplicationContext, GameApplicationExtension } from '../game/GameApplicationTypes';
import { CombatLabRenderer } from './rendering/CombatLabRenderer';
import type { CombatLabVisualSession } from './runtime/CombatLabVisualSession';
import { CombatLabShell, type CombatLabLayoutV1 } from './ui/CombatLabShell';

export class CombatLabExtension implements GameApplicationExtension {
  private readonly renderer: CombatLabRenderer;
  private readonly shell: CombatLabShell;
  private readonly drawer: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private collapsed = false;
  private destroyed = false;

  private constructor(
    private readonly root: HTMLElement,
    session: CombatLabVisualSession,
    context: GameApplicationContext,
  ) {
    const layout = createCombatLabDrawerLayout(root);
    this.drawer = layout.root;
    this.toggle = createToggle();
    root.prepend(this.toggle);

    let shell: CombatLabShell | null = null;
    this.renderer = CombatLabRenderer.create(context, session, () => shell?.refreshLive());
    this.shell = new CombatLabShell(layout, session, this.renderer);
    shell = this.shell;

    this.toggle.addEventListener('click', this.handleToggle);
    root.dataset.combatLabExtension = 'active';
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
    this.renderer.destroy();
    this.root.replaceChildren();
    delete this.root.dataset.combatLabExtension;
  }

  private readonly handleToggle = (): void => {
    this.collapsed = !this.collapsed;
    this.drawer.hidden = this.collapsed;
    this.toggle.textContent = this.collapsed ? 'Открыть полигон' : 'Скрыть полигон';
    this.toggle.setAttribute('aria-expanded', String(!this.collapsed));
    document.body.classList.toggle('combat-lab-drawer-collapsed', this.collapsed);
  };
}

function createCombatLabDrawerLayout(host: HTMLElement): CombatLabLayoutV1 {
  host.replaceChildren();
  const drawer = node('section', 'combat-lab-drawer');
  const top = node('header', 'combat-lab-top');
  const body = node('div', 'combat-lab-body combat-lab-drawer-body');
  const left = node('aside', 'combat-lab-left');
  const map = node('div', 'combat-lab-map combat-lab-map-placeholder');
  map.hidden = true;
  const right = node('aside', 'combat-lab-right');
  const bottom = node('footer', 'combat-lab-bottom');
  body.append(left, right, map);
  drawer.append(top, body, bottom);
  host.append(drawer);
  return { root: drawer, top, left, map, right, bottom };
}

function createToggle(): HTMLButtonElement {
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'combat-lab-drawer-toggle';
  toggle.textContent = 'Скрыть полигон';
  toggle.setAttribute('aria-expanded', 'true');
  toggle.setAttribute('aria-controls', 'combat-lab-extension-root');
  return toggle;
}

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  return element;
}
