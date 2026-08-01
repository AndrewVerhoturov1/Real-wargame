import { GameEditorWorkspace } from '../../game-editors/GameEditorWorkspace';
import { getSafeGameEditorReturnTarget } from '../../game-editors/GameEditorReturnTarget';
import type { GameEditorRegistry } from '../../game-editors/GameEditorRegistry';
import type {
  GameEditorDefinition,
  GameEditorOpenRequest,
  GameEditorOpenResult,
} from '../../game-editors/GameEditorTypes';
import type {
  AppOverlayCoordinator,
  AppOverlayHandle,
} from '../../shared/app-overlay/AppOverlayCoordinator';

const COMBAT_LAB_EDITOR_OVERLAY_PRIORITY = 200;
const DEFAULT_RETURN_TARGET = '/combat-lab.html?tab=settings';

export interface CombatLabGameEditorOverlayOptions {
  readonly registry: GameEditorRegistry;
  readonly overlayCoordinator: AppOverlayCoordinator;
  readonly navigate?: (url: string) => void;
}

export class CombatLabGameEditorOverlay {
  private modalHandle: AppOverlayHandle | null = null;
  private workspace: GameEditorWorkspace | null = null;
  private titleHost: HTMLElement | null = null;
  private messageHost: HTMLElement | null = null;
  private closeButton: HTMLButtonElement | null = null;
  private destroyed = false;

  constructor(private readonly options: CombatLabGameEditorOverlayOptions) {}

  async open(
    request: GameEditorOpenRequest,
    trigger: HTMLElement | null = null,
  ): Promise<GameEditorOpenResult> {
    this.assertAlive();
    const definition = this.options.registry.require(request.editorId);
    const activation = definition.activationFor('combat-lab');
    if (activation === 'hidden') return { kind: 'hidden', definition };

    const normalizedRequest = this.withSafeReturnTarget(request);
    if (activation === 'route') return this.openRoute(definition, normalizedRequest);

    if (!this.workspace) this.createModal(trigger);
    const workspace = this.workspace;
    if (!workspace) throw new Error('Не удалось создать рабочее место общего редактора.');
    const result = await workspace.open(normalizedRequest);
    if (result.kind === 'mounted') {
      if (this.titleHost) this.titleHost.textContent = definition.labelRu;
      if (this.messageHost) this.messageHost.textContent = 'Изменения сохраняются в общем авторитетном профиле игры.';
    }
    return result;
  }

  async close(): Promise<boolean> {
    if (this.destroyed || !this.workspace || !this.modalHandle) return true;
    const accepted = await this.workspace.close();
    if (!accepted) return false;
    this.modalHandle.destroy();
    return true;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.modalHandle?.destroy();
    this.clearModalState();
  }

  private async openRoute(
    definition: GameEditorDefinition,
    request: GameEditorOpenRequest,
  ): Promise<GameEditorOpenResult> {
    if (this.workspace && !(await this.workspace.close())) return { kind: 'refused', definition };
    this.modalHandle?.destroy();
    const url = definition.route!(request);
    (this.options.navigate ?? ((target) => window.location.assign(target)))(url);
    return { kind: 'route', definition, url };
  }

  private createModal(trigger: HTMLElement | null): void {
    this.modalHandle = this.options.overlayCoordinator.openModal({
      ariaLabel: 'Общий редактор настройки игры',
      priority: COMBAT_LAB_EDITOR_OVERLAY_PRIORITY,
      trigger,
      render: (host) => this.renderModal(host),
      beforeClose: async () => this.workspace?.close() ?? true,
      onClosed: () => this.clearModalState(),
    });
  }

  private renderModal(host: HTMLElement): void {
    const root = node('section', 'combat-lab-game-editor-workbench');
    const header = node('header', 'combat-lab-game-editor-workbench-header');
    const heading = node('div', 'combat-lab-game-editor-workbench-heading');
    this.titleHost = node('h2', 'combat-lab-game-editor-workbench-title', 'Настройка игры');
    this.messageHost = node(
      'p',
      'combat-lab-game-editor-workbench-message',
      'Открываю общий редактор…',
    );
    heading.append(this.titleHost, this.messageHost);
    this.closeButton = document.createElement('button');
    this.closeButton.type = 'button';
    this.closeButton.className = 'combat-lab-game-editor-workbench-close';
    this.closeButton.textContent = 'Закрыть';
    this.closeButton.setAttribute('aria-label', 'Закрыть общий редактор');
    this.closeButton.addEventListener('click', this.handleCloseClick);
    header.append(heading, this.closeButton);

    const workspaceHost = node('div', 'combat-lab-game-editor-workbench-content');
    workspaceHost.dataset.combatLabGameEditorWorkspace = 'true';
    root.append(header, workspaceHost);
    host.replaceChildren(root);
    this.workspace = new GameEditorWorkspace(
      workspaceHost,
      this.options.registry,
      'combat-lab',
    );
  }

  private readonly handleCloseClick = (): void => {
    this.modalHandle?.close();
  };

  private clearModalState(): void {
    this.closeButton?.removeEventListener('click', this.handleCloseClick);
    this.closeButton = null;
    this.workspace?.destroy();
    this.workspace = null;
    this.modalHandle = null;
    this.titleHost = null;
    this.messageHost = null;
  }

  private withSafeReturnTarget(request: GameEditorOpenRequest): GameEditorOpenRequest {
    const safeReturnTo = getSafeGameEditorReturnTarget(request.returnTo)
      ?? DEFAULT_RETURN_TARGET;
    return Object.freeze({ ...request, returnTo: safeReturnTo });
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('Интеграция общих редакторов Combat Lab уже уничтожена.');
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
