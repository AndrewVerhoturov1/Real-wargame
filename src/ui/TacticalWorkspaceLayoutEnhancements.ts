import '../tactical-workspace-refined.css';

const RIGHT_SIDEBAR_WIDTH_VAR = '--workspace-sidebar';
const LEFT_DOCK_WIDTH_VAR = '--combat-lab-dock-width';
const RIGHT_SIDEBAR_STORAGE_KEY = 'real-wargame.workspace.sidebar-width.v1';
const LEFT_DOCK_STORAGE_KEY = 'real-wargame.combat-lab.dock-width.v1';
const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 520;

let scanFrame = 0;

restoreStoredWidth(RIGHT_SIDEBAR_STORAGE_KEY, RIGHT_SIDEBAR_WIDTH_VAR);
restoreStoredWidth(LEFT_DOCK_STORAGE_KEY, LEFT_DOCK_WIDTH_VAR);

const observer = new MutationObserver(scheduleScan);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('real-wargame:route-cost-inspector-rendered', scheduleScan);
scheduleScan();

function scheduleScan(): void {
  if (scanFrame !== 0) return;
  scanFrame = window.requestAnimationFrame(() => {
    scanFrame = 0;
    const workspace = document.querySelector<HTMLElement>('.tactical-workspace-shell');
    if (workspace) refineWorkspace(workspace);
    const combatLab = document.querySelector<HTMLElement>('#combat-lab-extension-root[data-combat-lab-extension="active"]');
    if (combatLab) refineCombatLab(combatLab);
  });
}

function refineWorkspace(shell: HTMLElement): void {
  if (shell.dataset.refinedWorkspaceLayout === 'true') return;
  const header = shell.querySelector<HTMLElement>('.tactical-workspace-bar');
  const unitBar = shell.querySelector<HTMLElement>('.simulation-unit-bar');
  const sidebar = shell.querySelector<HTMLElement>('.simulation-sidebar');
  const routeInspectorProfile = shell.querySelector('.route-cost-inspector-panel .unit-route-profile');
  const pauseButton = unitBar?.querySelector<HTMLButtonElement>('[data-action="pause"]');
  const speedGroup = unitBar?.querySelector<HTMLElement>('.unit-bar-speed-group');
  if (!header || !unitBar || !sidebar || !routeInspectorProfile || !pauseButton || !speedGroup) return;

  const timeControls = document.createElement('section');
  timeControls.className = 'workspace-time-controls';
  timeControls.setAttribute('aria-label', 'Время симуляции');
  const timeLabel = document.createElement('span');
  timeLabel.className = 'workspace-time-controls-label';
  timeLabel.textContent = 'Время';
  timeControls.append(timeLabel, pauseButton, speedGroup);
  const topActions = header.querySelector('.workspace-top-actions');
  header.insertBefore(timeControls, topActions);

  for (const action of ['step', 'evaluate', 'execute', 'reset-unit']) {
    unitBar.querySelector(`[data-action="${action}"]`)?.remove();
  }
  unitBar.querySelector('.unit-attention-profile')?.remove();
  unitBar.querySelector('.unit-attention-mode')?.remove();
  unitBar.querySelector('[data-role="state-plan-panel"]')?.remove();

  const postureGroup = unitBar.querySelector<HTMLElement>('.posture-group');
  const turnButton = unitBar.querySelector<HTMLButtonElement>('[data-action="turn-unit"]');
  if (postureGroup && turnButton) postureGroup.append(turnButton);
  const routeControls = unitBar.querySelector<HTMLElement>('.unit-bar-route-controls');
  if (routeControls && routeControls.children.length === 0) routeControls.remove();

  const clearOrderButton = unitBar.querySelector<HTMLButtonElement>('[data-action="clear-order"]');
  if (clearOrderButton) clearOrderButton.textContent = 'Отменить приказ';

  installResizeHandle(sidebar, 'right');
  shell.dataset.refinedWorkspaceLayout = 'true';
  window.dispatchEvent(new Event('resize'));
}

function refineCombatLab(root: HTMLElement): void {
  if (root.dataset.refinedCombatLabLayout === 'true') return;
  const runToolbar = root.querySelector<HTMLElement>('.combat-lab-stage10-toolbar-host');
  const runControls = root.querySelector<HTMLElement>('.combat-lab-run-controls');
  const brandSubtitle = root.querySelector<HTMLElement>('.combat-lab-dock-brand span');
  if (!runToolbar && !runControls) return;

  runToolbar?.classList.add('combat-lab-run-toolbar');
  if (runControls) {
    Array.from(runControls.children).slice(1).forEach((element) => element.remove());
    runControls.classList.add('scenario-only');
  }
  if (brandSubtitle) brandSubtitle.textContent = 'Сценарии и измерения';
  installResizeHandle(root, 'left');
  root.dataset.refinedCombatLabLayout = 'true';
  window.dispatchEvent(new Event('resize'));
}

function installResizeHandle(target: HTMLElement, side: 'left' | 'right'): void {
  const className = side === 'left'
    ? 'workspace-resize-handle workspace-resize-handle-left'
    : 'workspace-resize-handle workspace-resize-handle-right';
  const ownClass = side === 'left' ? '.workspace-resize-handle-left' : '.workspace-resize-handle-right';
  if (target.querySelector(`:scope > ${ownClass}`)) return;

  const handle = document.createElement('div');
  handle.className = className;
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', 'vertical');
  handle.setAttribute('aria-label', side === 'left' ? 'Изменить ширину панели полигона' : 'Изменить ширину инспектора');
  target.append(handle);

  const cssVariable = side === 'left' ? LEFT_DOCK_WIDTH_VAR : RIGHT_SIDEBAR_WIDTH_VAR;
  const storageKey = side === 'left' ? LEFT_DOCK_STORAGE_KEY : RIGHT_SIDEBAR_STORAGE_KEY;

  const handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    document.body.classList.add('workspace-panel-resizing');

    const handlePointerMove = (moveEvent: PointerEvent): void => {
      const requested = side === 'left'
        ? moveEvent.clientX - 8
        : window.innerWidth - moveEvent.clientX - 10;
      const width = clamp(Math.round(requested), MIN_PANEL_WIDTH, MAX_PANEL_WIDTH);
      document.documentElement.style.setProperty(cssVariable, `${width}px`);
      try {
        window.localStorage.setItem(storageKey, String(width));
      } catch {
        // Persisting the convenience setting is optional.
      }
      window.dispatchEvent(new Event('resize'));
    };

    const handlePointerUp = (): void => {
      document.body.classList.remove('workspace-panel-resizing');
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointerup', handlePointerUp, true);
      window.removeEventListener('pointercancel', handlePointerUp, true);
    };

    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('pointerup', handlePointerUp, true);
    window.addEventListener('pointercancel', handlePointerUp, true);
  };

  handle.addEventListener('pointerdown', handlePointerDown);
}

function restoreStoredWidth(storageKey: string, cssVariable: string): void {
  try {
    const stored = Number(window.localStorage.getItem(storageKey));
    if (!Number.isFinite(stored) || stored <= 0) return;
    document.documentElement.style.setProperty(cssVariable, `${clamp(stored, MIN_PANEL_WIDTH, MAX_PANEL_WIDTH)}px`);
  } catch {
    // Storage may be unavailable in hardened browser contexts.
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
