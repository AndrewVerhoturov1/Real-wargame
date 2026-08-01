import type { GameEditorRegistry } from '../../game-editors/GameEditorRegistry';
import type { GameEditorOpenRequest, GameEditorOpenResult } from '../../game-editors/GameEditorTypes';
import type { AppOverlayCoordinator } from '../../shared/app-overlay/AppOverlayCoordinator';
import { CombatLabGameEditorCatalogue } from './CombatLabGameEditorCatalogue';
import {
  COMBAT_LAB_OPEN_GAME_EDITOR_EVENT,
  readCombatLabGameEditorOpenRequest,
} from './CombatLabGameEditorLinks';
import { CombatLabGameEditorOverlay } from './CombatLabGameEditorOverlay';

export interface CombatLabGameEditorsOptions {
  readonly host: HTMLElement;
  readonly eventTarget: HTMLElement;
  readonly registry: GameEditorRegistry;
  readonly overlayCoordinator: AppOverlayCoordinator;
  readonly navigate?: (url: string) => void;
}

export class CombatLabGameEditors {
  private readonly overlay: CombatLabGameEditorOverlay;
  private readonly catalogue: CombatLabGameEditorCatalogue;
  private destroyed = false;

  private constructor(private readonly options: CombatLabGameEditorsOptions) {
    this.overlay = new CombatLabGameEditorOverlay({
      registry: options.registry,
      overlayCoordinator: options.overlayCoordinator,
      navigate: options.navigate,
    });
    this.catalogue = CombatLabGameEditorCatalogue.create({
      host: options.host,
      registry: options.registry,
      onOpen: (definition, trigger) => {
        void this.open({ editorId: definition.id, returnTo: '/combat-lab.html?tab=settings' }, trigger);
      },
    });
    options.eventTarget.addEventListener(
      COMBAT_LAB_OPEN_GAME_EDITOR_EVENT,
      this.handleOpenRequest,
    );
  }

  static create(options: CombatLabGameEditorsOptions): CombatLabGameEditors {
    return new CombatLabGameEditors(options);
  }

  async open(
    request: GameEditorOpenRequest,
    trigger: HTMLElement | null = null,
  ): Promise<GameEditorOpenResult> {
    if (this.destroyed) throw new Error('Доступ к общим редакторам Combat Lab уже закрыт.');
    return this.overlay.open(request, trigger);
  }

  refresh(): void {
    if (!this.destroyed) this.catalogue.refresh();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.options.eventTarget.removeEventListener(
      COMBAT_LAB_OPEN_GAME_EDITOR_EVENT,
      this.handleOpenRequest,
    );
    this.catalogue.destroy();
    this.overlay.destroy();
  }

  private readonly handleOpenRequest = (event: Event): void => {
    const detail = readCombatLabGameEditorOpenRequest(event);
    if (!detail || this.destroyed) return;
    void this.open(detail.request, detail.trigger);
  };
}
