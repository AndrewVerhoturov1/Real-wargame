import './app-shell-menu.css';
import {
  getAppOverlayCoordinator,
  type AppOverlayCoordinator,
  type AppOverlayHandle,
} from './app-overlay/AppOverlayCoordinator';

export type AppShellMenuMode = 'game' | 'editor' | 'combat-lab' | 'launcher';

export interface AppShellMenuOptions {
  mode: AppShellMenuMode;
}

export interface AppShellMenuInstallation {
  destroy(): void;
}

const LAB_SHUTDOWN_URL = 'http://127.0.0.1:8799/lab/shutdown';
const CLOSE_SIGNAL_KEY = 'real-wargame.lab.close-tabs';
const NEW_GAME_SIGNAL_KEY = 'real-wargame.lab.new-game';
const CLOSE_CHANNEL_NAME = 'real-wargame.lab.close-tabs';
const MENU_PRIORITY = 100;
const MODE_BODY_CLASSES = ['app-shell-mode-game', 'app-shell-mode-editor', 'app-shell-mode-combat-lab', 'app-shell-mode-launcher'] as const;
const installations = new WeakMap<Document, AppShellMenuController>();

export function installAppShellMenu(options: AppShellMenuOptions): AppShellMenuInstallation {
  const existing = installations.get(document);
  if (existing && !existing.isDestroyed()) {
    existing.update(options);
    return existing;
  }

  const controller = new AppShellMenuController(document, options, () => {
    installations.delete(document);
  });
  installations.set(document, controller);
  return controller;
}

export function openGameTab(): void {
  window.location.href = '/';
}

export function openEditorTab(): void {
  window.location.href = '/ai-node-editor.html';
}

export function openCombatLabTab(): void {
  window.location.href = '/combat-lab.html';
}

export function requestLabShutdown(): Promise<void> {
  return fetch(LAB_SHUTDOWN_URL, {
    method: 'POST',
    mode: 'cors',
    keepalive: true,
  }).then(() => undefined).catch(() => undefined);
}

export function exitLab(): void {
  setShellStatus('Закрываю режимы...');
  void requestLabShutdown();
  broadcastCloseTabs();
  window.setTimeout(closeThisTab, 350);
  window.setTimeout(() => setShellStatus('Если вкладка не закрылась сама, её можно закрыть вручную.'), 1200);
}

class AppShellMenuController implements AppShellMenuInstallation {
  private readonly coordinator: AppOverlayCoordinator;
  private readonly root: HTMLElement;
  private readonly trigger: HTMLButtonElement;
  private closeChannel: BroadcastChannel | null = null;
  private menuHandle: AppOverlayHandle | null = null;
  private mode: AppShellMenuMode;
  private destroyed = false;

  private readonly onTriggerClick = (): void => {
    if (this.menuHandle) this.menuHandle.close();
    else this.openMenu();
  };

  private readonly onStorage = (event: StorageEvent): void => {
    if (event.key === CLOSE_SIGNAL_KEY && event.newValue) closeThisTab();
    if (event.key === NEW_GAME_SIGNAL_KEY && event.newValue && isGamePage()) {
      window.location.href = gamePageUrl(event.newValue);
    }
  };

  private readonly onCloseChannelMessage = (event: MessageEvent): void => {
    if (event.data === 'close') closeThisTab();
  };

  constructor(
    private readonly document: Document,
    options: AppShellMenuOptions,
    private readonly onDestroyed: () => void,
  ) {
    this.mode = options.mode;
    this.coordinator = getAppOverlayCoordinator(document);
    this.root = document.createElement('div');
    this.root.className = 'app-shell-menu';
    this.root.dataset.appShellMenuRoot = 'true';
    this.root.innerHTML = '<button class="app-shell-menu-trigger" type="button" data-shell-action="open-menu" aria-haspopup="dialog"><span class="app-shell-menu-trigger__label">Меню</span><svg class="app-shell-menu-trigger__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"></path></svg></button>';
    const trigger = this.root.querySelector<HTMLButtonElement>('.app-shell-menu-trigger');
    if (!trigger) throw new Error('Не удалось создать кнопку общего меню.');
    this.trigger = trigger;
    document.body.prepend(this.root);
    this.trigger.addEventListener('click', this.onTriggerClick);
    this.installCloseListeners();
    this.applyMode(options.mode);
    this.coordinator.setEscapeFallback(() => this.openMenu());
  }

  update(options: AppShellMenuOptions): void {
    if (this.destroyed) return;
    this.menuHandle?.destroy();
    this.menuHandle = null;
    this.applyMode(options.mode);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.menuHandle?.destroy();
    this.menuHandle = null;
    this.coordinator.destroy();
    this.trigger.removeEventListener('click', this.onTriggerClick);
    this.destroyCloseListeners();
    this.root.remove();
    this.document.body.classList.remove('with-app-shell-menu', ...MODE_BODY_CLASSES);
    this.onDestroyed();
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  private applyMode(mode: AppShellMenuMode): void {
    this.mode = mode;
    this.document.body.classList.remove('with-app-shell-menu', ...MODE_BODY_CLASSES);
    this.document.body.classList.add(`app-shell-mode-${mode}`);
    this.trigger.setAttribute('aria-label', `Открыть общее меню Real Wargame. Текущий режим: ${modeTitle(mode)}`);
  }

  private openMenu(): void {
    if (this.destroyed || this.menuHandle) return;
    this.menuHandle = this.coordinator.openModal({
      ariaLabel: 'Общее игровое меню Real Wargame',
      priority: MENU_PRIORITY,
      trigger: this.trigger,
      render: (host) => this.renderMenu(host),
      onClosed: () => {
        this.menuHandle = null;
      },
    });
  }

  private renderMenu(host: HTMLElement): void {
    host.innerHTML = renderMenu(this.mode);
    host.addEventListener('click', (event) => this.handleMenuClick(event));
  }

  private handleMenuClick(event: Event): void {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-shell-action]')
      : null;
    const action = target?.dataset.shellAction;
    if (!action) return;
    if (action === 'close') {
      this.menuHandle?.close();
      return;
    }
    if (action === 'new-game') {
      startNewGame();
      return;
    }
    if (action === 'refresh') {
      window.location.reload();
      return;
    }
    if (action === 'exit') exitLab();
  }

  private installCloseListeners(): void {
    window.addEventListener('storage', this.onStorage);
    if (!('BroadcastChannel' in window)) return;
    this.closeChannel = new BroadcastChannel(CLOSE_CHANNEL_NAME);
    this.closeChannel.addEventListener('message', this.onCloseChannelMessage);
  }

  private destroyCloseListeners(): void {
    window.removeEventListener('storage', this.onStorage);
    this.closeChannel?.removeEventListener('message', this.onCloseChannelMessage);
    this.closeChannel?.close();
    this.closeChannel = null;
  }
}

function renderMenu(mode: AppShellMenuMode): string {
  return `
    <div class="app-shell-dialog">
      <header class="app-shell-dialog-header">
        <div>
          <strong class="app-shell-dialog-brand">REAL WARGAME</strong>
          <p class="app-shell-dialog-subtitle">${modeTitle(mode)}</p>
        </div>
        <button class="app-shell-close-button" type="button" data-shell-action="close" aria-label="Закрыть меню">×</button>
      </header>
      <nav class="app-shell-mode-links" aria-label="Режимы Real Wargame">
        ${modeLink('/', 'game', 'Игра', mode)}
        ${modeLink('/ai-node-editor.html', 'editor', 'Редактор ИИ', mode)}
        ${modeLink('/combat-lab.html', 'combat-lab', 'Испытательный полигон', mode)}
      </nav>
      <div class="app-shell-menu-actions">
        ${secondaryAction(mode)}
        <button class="app-shell-exit-button" type="button" data-shell-action="exit">Выход</button>
      </div>
      <p class="app-shell-status" aria-live="polite"></p>
    </div>
  `;
}

function modeLink(
  href: string,
  linkMode: Exclude<AppShellMenuMode, 'launcher'>,
  label: string,
  currentMode: AppShellMenuMode,
): string {
  const current = linkMode === currentMode;
  const marker = current ? '<span class="app-shell-current-marker">Текущий режим</span>' : '';
  return `<a class="app-shell-mode-link" href="${href}" data-shell-mode="${linkMode}"${current ? ' aria-current="page"' : ''}><span>${label}</span>${marker}</a>`;
}

function secondaryAction(mode: AppShellMenuMode): string {
  return mode === 'game'
    ? '<button type="button" data-shell-action="new-game">Новая игра</button>'
    : '<button type="button" data-shell-action="refresh">Обновить</button>';
}

function modeTitle(mode: AppShellMenuMode): string {
  if (mode === 'editor') return 'Редактор ИИ солдата';
  if (mode === 'combat-lab') return 'Испытательный полигон';
  if (mode === 'launcher') return 'Запуск лаборатории';
  return 'Тактическая карта';
}

function gamePageUrl(newGameStamp?: string): string {
  const url = new URL('/', window.location.origin);
  url.search = newGameStamp ? `newGame=${encodeURIComponent(newGameStamp)}` : '';
  return url.toString();
}

function startNewGame(): void {
  const stamp = String(Date.now());
  localStorage.setItem(NEW_GAME_SIGNAL_KEY, stamp);
  window.location.href = gamePageUrl(stamp);
}

function broadcastCloseTabs(): void {
  const stamp = String(Date.now());
  try {
    const channel = new BroadcastChannel(CLOSE_CHANNEL_NAME);
    channel.postMessage('close');
    channel.close();
  } catch {
    // Local close still runs below.
  }
  localStorage.setItem(CLOSE_SIGNAL_KEY, stamp);
}

function closeThisTab(): void {
  window.setTimeout(() => window.close(), 50);
}

function setShellStatus(message: string): void {
  document.querySelectorAll<HTMLElement>('.app-shell-status').forEach((status) => {
    status.textContent = message;
  });
}

function isGamePage(): boolean {
  return window.location.pathname.endsWith('/') || window.location.pathname.endsWith('/index.html');
}
