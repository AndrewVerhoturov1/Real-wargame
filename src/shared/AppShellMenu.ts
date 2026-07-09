export type AppShellMenuMode = 'game' | 'editor' | 'launcher';

export interface AppShellMenuOptions {
  mode: AppShellMenuMode;
}

const LAB_SHUTDOWN_URL = 'http://127.0.0.1:8799/lab/shutdown';
const CLOSE_SIGNAL_KEY = 'real-wargame.lab.close-tabs';
const NEW_GAME_SIGNAL_KEY = 'real-wargame.lab.new-game';
const CLOSE_CHANNEL_NAME = 'real-wargame.lab.close-tabs';

let closeChannel: BroadcastChannel | null = null;
let closeListenerInstalled = false;

export function installAppShellMenu(options: AppShellMenuOptions): void {
  document.body.classList.add('with-app-shell-menu');
  installCloseListeners();
  document.querySelector('.app-shell-menu')?.remove();

  const menu = document.createElement('nav');
  menu.className = `app-shell-menu app-shell-menu-${options.mode}`;
  menu.setAttribute('aria-label', 'Общее меню Real-Wargame');
  menu.innerHTML = renderMenu(options.mode);
  document.body.prepend(menu);

  menu.querySelector<HTMLButtonElement>('[data-shell-action="open-editor"]')?.addEventListener('click', openEditorTab);
  menu.querySelector<HTMLButtonElement>('[data-shell-action="open-game"]')?.addEventListener('click', openGameTab);
  menu.querySelector<HTMLButtonElement>('[data-shell-action="new-game"]')?.addEventListener('click', startNewGame);
  menu.querySelector<HTMLButtonElement>('[data-shell-action="refresh"]')?.addEventListener('click', () => window.location.reload());
  menu.querySelector<HTMLButtonElement>('[data-shell-action="exit"]')?.addEventListener('click', exitLab);
}

export function openGameTab(): void {
  window.open('/', '_blank');
}

export function openEditorTab(): void {
  window.open('/ai-node-editor.html', '_blank');
}

export function requestLabShutdown(): Promise<void> {
  return fetch(LAB_SHUTDOWN_URL, {
    method: 'POST',
    mode: 'cors',
    keepalive: true,
  }).then(() => undefined).catch(() => undefined);
}

function renderMenu(mode: AppShellMenuMode): string {
  const title = mode === 'editor'
    ? 'Редактор ИИ солдата'
    : mode === 'launcher'
      ? 'Запуск лаборатории'
      : 'Тактическая карта';

  const buttons = mode === 'editor'
    ? [
        '<button type="button" data-shell-action="refresh">Обновить</button>',
        '<button type="button" data-shell-action="open-game">Открыть игру</button>',
        '<button class="app-shell-exit-button" type="button" data-shell-action="exit">Выход</button>',
      ]
    : mode === 'launcher'
      ? [
          '<button type="button" data-shell-action="open-game">Открыть игру</button>',
          '<button type="button" data-shell-action="open-editor">Редактор ИИ солдат</button>',
          '<button class="app-shell-exit-button" type="button" data-shell-action="exit">Выход</button>',
        ]
      : [
          '<button type="button" data-shell-action="open-editor">Редактор ИИ солдат</button>',
          '<button type="button" data-shell-action="new-game">Новая игра</button>',
          '<button class="app-shell-exit-button" type="button" data-shell-action="exit">Выход</button>',
        ];

  return `
    <strong>${title}</strong>
    <div class="app-shell-actions">${buttons.join('')}</div>
    <span class="app-shell-status" aria-live="polite"></span>
  `;
}

function startNewGame(): void {
  const stamp = String(Date.now());
  localStorage.setItem(NEW_GAME_SIGNAL_KEY, stamp);
  window.location.href = `/?newGame=${encodeURIComponent(stamp)}`;
}

function exitLab(): void {
  setShellStatus('Закрываю игру и редактор...');
  void requestLabShutdown();
  broadcastCloseTabs();
  window.setTimeout(closeThisTab, 350);
  window.setTimeout(() => setShellStatus('Если вкладка не закрылась сама, её можно закрыть вручную.'), 1200);
}

function installCloseListeners(): void {
  if (closeListenerInstalled) {
    return;
  }

  closeListenerInstalled = true;

  if ('BroadcastChannel' in window) {
    closeChannel = new BroadcastChannel(CLOSE_CHANNEL_NAME);
    closeChannel.addEventListener('message', (event) => {
      if (event.data === 'close') {
        closeThisTab();
      }
    });
  }

  window.addEventListener('storage', (event) => {
    if (event.key === CLOSE_SIGNAL_KEY && event.newValue) {
      closeThisTab();
    }
    if (event.key === NEW_GAME_SIGNAL_KEY && event.newValue && isGamePage()) {
      window.location.href = `/?newGame=${encodeURIComponent(event.newValue)}`;
    }
  });
}

function broadcastCloseTabs(): void {
  const stamp = String(Date.now());
  try {
    closeChannel?.postMessage('close');
  } catch {
    // local close still runs below.
  }
  localStorage.setItem(CLOSE_SIGNAL_KEY, stamp);
}

function closeThisTab(): void {
  window.setTimeout(() => window.close(), 50);
}

function setShellStatus(message: string): void {
  const status = document.querySelector<HTMLElement>('.app-shell-status');
  if (status) {
    status.textContent = message;
  }
}

function isGamePage(): boolean {
  return window.location.pathname === '/' || window.location.pathname.endsWith('/index.html');
}
