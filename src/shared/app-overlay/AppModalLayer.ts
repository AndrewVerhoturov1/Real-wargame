import './app-overlay.css';
import type { AppModalOptions } from './AppOverlayCoordinator';

export interface AppModalLayerController {
  readonly priority: number;
  isOpen(): boolean;
  requestClose(): Promise<boolean>;
  destroy(): void;
}

interface InertSnapshot {
  readonly element: HTMLElement;
  readonly inert: boolean;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function createAppModalLayer(
  document: Document,
  options: AppModalOptions,
): AppModalLayerController {
  const activeElement = document.activeElement;
  const trigger = options.trigger
    ?? (activeElement instanceof HTMLElement ? activeElement : null);
  const root = document.createElement('div');
  root.className = 'app-modal-layer';
  root.dataset.appModalLayer = 'open';

  const dialog = document.createElement('section');
  dialog.className = 'app-modal-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', options.ariaLabel);
  dialog.tabIndex = -1;

  const host = document.createElement('div');
  host.className = 'app-modal-host';
  dialog.append(host);
  root.append(dialog);
  options.render(host);
  document.body.append(root);

  const inertSnapshots = blockBackground(document, root);
  let open = true;
  let closing = false;

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!open || event.key === 'Escape') return;
    event.stopPropagation();
    if (event.key !== 'Tab') return;
    trapFocus(event, dialog);
  };
  const onFocusIn = (event: FocusEvent): void => {
    if (!open || (event.target instanceof Node && root.contains(event.target))) return;
    focusFirstAvailable(dialog);
  };
  const onBackdropPointerDown = (event: PointerEvent): void => {
    event.stopPropagation();
    if (event.target !== root) return;
    event.preventDefault();
    void requestClose();
  };
  const stopBackgroundInteraction = (event: Event): void => {
    event.stopPropagation();
  };

  root.addEventListener('keydown', onKeyDown);
  root.addEventListener('pointerdown', onBackdropPointerDown);
  root.addEventListener('pointerup', stopBackgroundInteraction);
  root.addEventListener('click', stopBackgroundInteraction);
  root.addEventListener('contextmenu', stopBackgroundInteraction);
  document.addEventListener('focusin', onFocusIn);
  queueMicrotask(() => {
    if (open) focusFirstAvailable(dialog);
  });

  async function requestClose(): Promise<boolean> {
    if (!open || closing) return false;
    closing = true;
    try {
      if (options.beforeClose && !(await options.beforeClose())) return false;
      cleanup(true);
      return true;
    } catch (error) {
      console.error('Не удалось закрыть модальный слой Real Wargame.', error);
      return false;
    } finally {
      closing = false;
    }
  }

  function cleanup(restoreTriggerFocus: boolean): void {
    if (!open) return;
    open = false;
    root.removeEventListener('keydown', onKeyDown);
    root.removeEventListener('pointerdown', onBackdropPointerDown);
    root.removeEventListener('pointerup', stopBackgroundInteraction);
    root.removeEventListener('click', stopBackgroundInteraction);
    root.removeEventListener('contextmenu', stopBackgroundInteraction);
    document.removeEventListener('focusin', onFocusIn);
    root.remove();
    restoreBackground(inertSnapshots);
    options.onClosed?.();
    if (restoreTriggerFocus) restoreFocus(trigger);
  }

  function destroy(): void {
    cleanup(true);
  }

  return {
    priority: options.priority,
    isOpen: () => open,
    requestClose,
    destroy,
  };
}

function blockBackground(document: Document, modalRoot: HTMLElement): InertSnapshot[] {
  const snapshots: InertSnapshot[] = [];
  for (const element of Array.from(document.body.children)) {
    if (!(element instanceof HTMLElement) || element === modalRoot) continue;
    const backgroundElement = element;
    snapshots.push({ element: backgroundElement, inert: backgroundElement.inert });
    backgroundElement.inert = true;
  }
  return snapshots;
}

function restoreBackground(snapshots: readonly InertSnapshot[]): void {
  for (const snapshot of snapshots) {
    if (snapshot.element.isConnected) snapshot.element.inert = snapshot.inert;
  }
}

function trapFocus(event: KeyboardEvent, dialog: HTMLElement): void {
  const focusable = getFocusableElements(dialog);
  if (focusable.length === 0) {
    event.preventDefault();
    dialog.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = dialog.ownerDocument.activeElement;
  if (event.shiftKey) {
    if (active === first || !(active instanceof Node) || !dialog.contains(active)) {
      event.preventDefault();
      last.focus();
    }
    return;
  }

  if (active === last || !(active instanceof Node) || !dialog.contains(active)) {
    event.preventDefault();
    first.focus();
  }
}

function getFocusableElements(host: HTMLElement): HTMLElement[] {
  return Array.from(host.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
}

function focusFirstAvailable(dialog: HTMLElement): void {
  const first = getFocusableElements(dialog)[0];
  (first ?? dialog).focus();
}

function restoreFocus(trigger: HTMLElement | null): void {
  if (!trigger || !trigger.isConnected || trigger.inert) return;
  trigger.focus();
}
