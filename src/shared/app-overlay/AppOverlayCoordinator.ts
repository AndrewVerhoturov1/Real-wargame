import { createAppModalLayer, type AppModalLayerController } from './AppModalLayer';

export interface AppOverlayHandle {
  readonly priority: number;
  close(): void;
  destroy(): void;
}

export interface DismissLayerOptions {
  readonly priority: number;
  readonly isOpen: () => boolean;
  readonly requestClose: () => boolean | Promise<boolean>;
}

export interface AppModalOptions {
  readonly ariaLabel: string;
  readonly priority: number;
  readonly trigger?: HTMLElement | null;
  readonly render: (host: HTMLElement) => void;
  readonly beforeClose?: () => boolean | Promise<boolean>;
  readonly onClosed?: () => void;
}

export interface AppOverlayCoordinator {
  openModal(options: AppModalOptions): AppOverlayHandle;
  registerDismissLayer(options: DismissLayerOptions): () => void;
  setEscapeFallback(handler: (() => void) | null): void;
  hasOpenLayer(): boolean;
  destroy(): void;
}

interface RegisteredDismissLayer extends DismissLayerOptions {
  readonly sequence: number;
}

const coordinatorByDocument = new WeakMap<Document, AppOverlayCoordinatorImpl>();

export function getAppOverlayCoordinator(document: Document = window.document): AppOverlayCoordinator {
  const existing = coordinatorByDocument.get(document);
  if (existing && !existing.isDestroyed()) return existing;
  const coordinator = new AppOverlayCoordinatorImpl(document, () => {
    coordinatorByDocument.delete(document);
  });
  coordinatorByDocument.set(document, coordinator);
  return coordinator;
}

class AppOverlayCoordinatorImpl implements AppOverlayCoordinator {
  private readonly dismissLayers = new Set<RegisteredDismissLayer>();
  private readonly ownedModals = new Set<AppModalLayerController>();
  private escapeFallback: (() => void) | null = null;
  private nextSequence = 1;
  private destroyed = false;

  private readonly onDocumentKeyDown = (event: KeyboardEvent): void => {
    if (this.destroyed || event.key !== 'Escape' || event.defaultPrevented || event.repeat || event.isComposing) return;
    const highestLayer = this.findHighestOpenLayer();
    if (highestLayer) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void this.requestClose(highestLayer);
      return;
    }
    if (!this.escapeFallback) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.escapeFallback();
  };

  constructor(
    private readonly document: Document,
    private readonly onDestroyed: () => void,
  ) {
    document.addEventListener('keydown', this.onDocumentKeyDown);
  }

  openModal(options: AppModalOptions): AppOverlayHandle {
    this.assertAlive();
    let unregister = (): void => {};
    let modal: AppModalLayerController;
    modal = createAppModalLayer(this.document, {
      ...options,
      onClosed: () => {
        unregister();
        this.ownedModals.delete(modal);
        options.onClosed?.();
      },
    });
    this.ownedModals.add(modal);
    unregister = this.registerDismissLayer({
      priority: options.priority,
      isOpen: modal.isOpen,
      requestClose: modal.requestClose,
    });

    let handleDestroyed = false;
    return {
      priority: options.priority,
      close: () => {
        if (!handleDestroyed) void modal.requestClose();
      },
      destroy: () => {
        if (handleDestroyed) return;
        handleDestroyed = true;
        unregister();
        modal.destroy();
        this.ownedModals.delete(modal);
      },
    };
  }

  registerDismissLayer(options: DismissLayerOptions): () => void {
    this.assertAlive();
    const layer: RegisteredDismissLayer = {
      ...options,
      sequence: this.nextSequence++,
    };
    this.dismissLayers.add(layer);
    let registered = true;
    return () => {
      if (!registered) return;
      registered = false;
      this.dismissLayers.delete(layer);
    };
  }

  setEscapeFallback(handler: (() => void) | null): void {
    this.assertAlive();
    this.escapeFallback = handler;
  }

  hasOpenLayer(): boolean {
    return this.findHighestOpenLayer() !== null;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.document.removeEventListener('keydown', this.onDocumentKeyDown);
    this.escapeFallback = null;
    for (const modal of Array.from(this.ownedModals)) modal.destroy();
    this.ownedModals.clear();
    this.dismissLayers.clear();
    this.onDestroyed();
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  private findHighestOpenLayer(): RegisteredDismissLayer | null {
    let highest: RegisteredDismissLayer | null = null;
    for (const layer of this.dismissLayers) {
      if (!safeIsOpen(layer)) continue;
      if (!highest || layer.priority > highest.priority || (layer.priority === highest.priority && layer.sequence > highest.sequence)) {
        highest = layer;
      }
    }
    return highest;
  }

  private async requestClose(layer: RegisteredDismissLayer): Promise<void> {
    try {
      await layer.requestClose();
    } catch (error) {
      console.error('Не удалось закрыть верхний слой Real Wargame.', error);
    }
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('Координатор верхних слоёв уже уничтожен.');
  }
}

function safeIsOpen(layer: RegisteredDismissLayer): boolean {
  try {
    return layer.isOpen();
  } catch (error) {
    console.error('Не удалось определить состояние верхнего слоя Real Wargame.', error);
    return false;
  }
}
