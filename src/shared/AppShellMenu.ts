export type AppShellMenuMode = 'game' | 'editor' | 'combat-lab' | 'launcher';

export interface AppShellMenuOptions {
  mode: AppShellMenuMode;
}

const LAB_SHUTDOWN_URL = 'http://127.0.0.1:8799/lab/shutdown';
const CLOSE_SIGNAL_KEY = 'real-wargame.lab.close-tabs';
const NEW_GAME_SIGNAL_KEY = 'real-wargame.lab.new-game';
const CLOSE_CHANNEL_NAME = 'real-wargame.lab.close-tabs';
const STYLE_ID = 'real-wargame-app-shell-menu-style';
const MODE_BODY_CLASSES = ['app-shell-mode-game', 'app-shell-mode-editor', 'app-shell-mode-combat-lab', 'app-shell-mode-launcher'] as const;

let closeChannel: BroadcastChannel | null = null;
let closeListenerInstalled = false;

export function installAppShellMenu(options: AppShellMenuOptions): void {
  document.body.classList.add('with-app-shell-menu');
  document.body.classList.remove(...MODE_BODY_CLASSES);
  document.body.classList.add(`app-shell-mode-${options.mode}`);
  installStyles();
  installCloseListeners();
  document.querySelector('.app-shell-menu')?.remove();

  const menu = document.createElement('nav');
  menu.className = `app-shell-menu app-shell-menu-${options.mode}`;
  menu.setAttribute('aria-label', 'Режимы Real-Wargame');
  menu.innerHTML = renderMenu(options.mode);
  document.body.prepend(menu);

  menu.querySelector<HTMLButtonElement>('[data-shell-action="new-game"]')?.addEventListener('click', startNewGame);
  menu.querySelector<HTMLButtonElement>('[data-shell-action="refresh"]')?.addEventListener('click', () => window.location.reload());
  menu.querySelector<HTMLButtonElement>('[data-shell-action="exit"]')?.addEventListener('click', exitLab);
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

function renderMenu(mode: AppShellMenuMode): string {
  const title = mode === 'editor'
    ? 'Редактор ИИ солдата'
    : mode === 'combat-lab'
      ? 'Испытательный полигон'
      : mode === 'launcher'
        ? 'Запуск лаборатории'
        : 'Тактическая карта';

  const modeLinks = [
    modeLink('/', 'game', 'Игра', mode),
    modeLink('/ai-node-editor.html', 'editor', 'Редактор ИИ', mode),
    modeLink('/combat-lab.html', 'combat-lab', 'Испытательный полигон', mode),
  ].join('');

  const secondaryActions = mode === 'game'
    ? '<button type="button" data-shell-action="new-game">Новая игра</button>'
    : '<button type="button" data-shell-action="refresh">Обновить</button>';

  return `
    <strong class="app-shell-title">${title}</strong>
    <div class="app-shell-mode-links">${modeLinks}</div>
    <div class="app-shell-actions">
      ${secondaryActions}
      <button class="app-shell-exit-button" type="button" data-shell-action="exit">Выход</button>
    </div>
    <span class="app-shell-status" aria-live="polite"></span>
  `;
}

function modeLink(href: string, linkMode: Exclude<AppShellMenuMode, 'launcher'>, label: string, currentMode: AppShellMenuMode): string {
  const current = linkMode === currentMode;
  return `<a href="${href}" data-shell-mode="${linkMode}"${current ? ' aria-current="page"' : ''}>${label}</a>`;
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

function installCloseListeners(): void {
  if (closeListenerInstalled) return;
  closeListenerInstalled = true;

  if ('BroadcastChannel' in window) {
    closeChannel = new BroadcastChannel(CLOSE_CHANNEL_NAME);
    closeChannel.addEventListener('message', (event) => {
      if (event.data === 'close') closeThisTab();
    });
  }

  window.addEventListener('storage', (event) => {
    if (event.key === CLOSE_SIGNAL_KEY && event.newValue) closeThisTab();
    if (event.key === NEW_GAME_SIGNAL_KEY && event.newValue && isGamePage()) {
      window.location.href = gamePageUrl(event.newValue);
    }
  });
}

function broadcastCloseTabs(): void {
  const stamp = String(Date.now());
  try {
    closeChannel?.postMessage('close');
  } catch {
    // Local close still runs below.
  }
  localStorage.setItem(CLOSE_SIGNAL_KEY, stamp);
}

function closeThisTab(): void {
  window.setTimeout(() => window.close(), 50);
}

function setShellStatus(message: string): void {
  const status = document.querySelector<HTMLElement>('.app-shell-status');
  if (status) status.textContent = message;
}

function isGamePage(): boolean {
  return window.location.pathname.endsWith('/') || window.location.pathname.endsWith('/index.html');
}

function installStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .app-shell-menu {
      position: fixed;
      top: 8px;
      left: 50%;
      z-index: 10000;
      display: grid;
      grid-template-columns: auto auto auto;
      gap: 10px;
      align-items: center;
      max-width: calc(100vw - 20px);
      padding: 7px 9px;
      border: 1px solid rgba(255, 242, 168, 0.3);
      border-radius: 14px;
      color: #f6edcf;
      background: rgba(10, 13, 9, 0.94);
      box-shadow: 0 10px 32px rgba(0, 0, 0, 0.4);
      font-family: Arial, Helvetica, sans-serif;
      transform: translateX(-50%);
      backdrop-filter: blur(8px);
    }
    .app-shell-title { color: #fff2a8; white-space: nowrap; font-size: 12px; }
    .app-shell-mode-links, .app-shell-actions { display: flex; gap: 5px; align-items: center; }
    .app-shell-menu a, .app-shell-menu button {
      min-height: 30px;
      padding: 6px 9px;
      border: 1px solid rgba(255, 242, 168, 0.25);
      border-radius: 9px;
      color: #d8d0b8;
      background: rgba(255, 242, 168, 0.05);
      font: inherit;
      font-size: 12px;
      font-weight: 700;
      line-height: 1;
      text-decoration: none;
      cursor: pointer;
    }
    .app-shell-menu a:hover, .app-shell-menu button:hover { background: rgba(255, 242, 168, 0.14); }
    .app-shell-menu a:focus-visible, .app-shell-menu button:focus-visible { outline: 2px solid #fff2a8; outline-offset: 2px; }
    .app-shell-menu a[aria-current="page"] { color: #121612; border-color: #fff2a8; background: #fff2a8; }
    .app-shell-exit-button { color: #ffb0a8 !important; }
    .app-shell-status { grid-column: 1 / -1; min-height: 0; color: #d6ceb2; font-size: 11px; text-align: center; }
    .app-shell-status:empty { display: none; }

    .app-shell-mode-game .top-command-bar { top: 62px; }
    .app-shell-mode-game .game-right-panel { top: 124px; max-height: calc(100vh - 238px); }
    .app-shell-mode-game .map-scale-fixed-label { top: 126px; }
    .app-shell-mode-editor .ai-editor-shell { height: calc(100vh - 54px); margin-top: 54px; }

    @media (max-width: 900px) {
      .app-shell-menu { left: 8px; right: 8px; grid-template-columns: 1fr; transform: none; }
      .app-shell-title { display: none; }
      .app-shell-mode-links, .app-shell-actions { justify-content: center; flex-wrap: wrap; }
      .app-shell-mode-game .top-command-bar { top: 104px; }
      .app-shell-mode-editor .ai-editor-shell { height: calc(100vh - 100px); margin-top: 100px; }
    }
  `;
  document.head.append(style);
}
