import './debug-panel-dock.css';

const DOCK_CLASS = 'ai-debug-panel-dock';
const STORAGE_KEY = 'real-wargame.ai-node-editor.debug-dock.v1';
const CLOSED_VALUE = 'none';

export type AiDebugPanelId = 'state-plan' | 'runtime-trace';

export interface AiDebugPanelCardOptions {
  readonly id: AiDebugPanelId;
  readonly title: string;
  readonly subtitle: string;
  readonly defaultOpen?: boolean;
}

export interface AiDebugPanelCard {
  readonly details: HTMLDetailsElement;
  readonly summary: HTMLElement;
  readonly content: HTMLElement;
}

export function ensureAiDebugPanelCard(
  workspace: HTMLElement,
  options: AiDebugPanelCardOptions,
): AiDebugPanelCard {
  const dock = ensureDock(workspace);
  let details = dock.querySelector<HTMLDetailsElement>(`[data-ai-debug-panel="${options.id}"]`);
  if (!details) {
    details = document.createElement('details');
    details.className = 'ai-debug-panel-card';
    details.dataset.aiDebugPanel = options.id;
    details.style.order = options.id === 'state-plan' ? '1' : '2';

    const summary = document.createElement('summary');
    summary.className = 'ai-debug-panel-summary';
    summary.innerHTML = `<strong>${escapeHtml(options.title)}</strong><span>${escapeHtml(options.subtitle)}</span><i aria-hidden="true"></i>`;

    const content = document.createElement('div');
    content.className = 'ai-debug-panel-content';

    details.append(summary, content);
    dock.appendChild(details);
    details.open = shouldOpenInitially(options);
    details.addEventListener('toggle', () => handleToggle(dock, details as HTMLDetailsElement));
  }

  const summary = details.querySelector<HTMLElement>(':scope > summary');
  const content = details.querySelector<HTMLElement>(':scope > .ai-debug-panel-content');
  if (!summary || !content) throw new Error(`AI debug panel card ${options.id} is incomplete.`);
  return { details, summary, content };
}

function ensureDock(workspace: HTMLElement): HTMLElement {
  const existing = workspace.querySelector<HTMLElement>(`:scope > .${DOCK_CLASS}`);
  if (existing) return existing;
  const dock = document.createElement('aside');
  dock.className = DOCK_CLASS;
  dock.setAttribute('aria-label', 'Диагностика ИИ');
  workspace.appendChild(dock);
  return dock;
}

function shouldOpenInitially(options: AiDebugPanelCardOptions): boolean {
  const stored = readStoredPanel();
  if (stored === CLOSED_VALUE) return false;
  if (stored) return stored === options.id;
  return options.defaultOpen === true;
}

function handleToggle(dock: HTMLElement, active: HTMLDetailsElement): void {
  if (!active.open) {
    if (readStoredPanel() === active.dataset.aiDebugPanel) writeStoredPanel(CLOSED_VALUE);
    return;
  }

  dock.querySelectorAll<HTMLDetailsElement>('.ai-debug-panel-card[open]').forEach((candidate) => {
    if (candidate !== active) candidate.open = false;
  });
  writeStoredPanel(active.dataset.aiDebugPanel ?? CLOSED_VALUE);
}

function readStoredPanel(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredPanel(value: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Dock persistence is optional and must never break editor diagnostics.
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
