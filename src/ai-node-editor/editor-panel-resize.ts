import './editor-panel-resize.css';

type PanelKind = 'palette' | 'inspector';

interface PanelWidths {
  paletteWidth: number;
  inspectorWidth: number;
}

interface ActiveResize {
  panel: PanelKind;
  pointerId: number;
  startX: number;
  startWidth: number;
  handle: HTMLElement;
}

const PANEL_WIDTHS_STORAGE_KEY = 'real-wargame.ai-node-editor.panel-widths.v1';
const MIN_GRAPH_WIDTH = 520;
const CLOSED_RAIL_WIDTH = 36;
const PALETTE_MIN_WIDTH = 180;
const PALETTE_DEFAULT_WIDTH = 228;
const PALETTE_MAX_WIDTH = 420;
const INSPECTOR_MIN_WIDTH = 260;
const INSPECTOR_DEFAULT_WIDTH = 300;
const INSPECTOR_MAX_WIDTH = 520;
const PANEL_RESIZER_HIT_WIDTH = 18;
const PANEL_RESIZER_PANEL_OVERLAP = 4;

let widths = loadPanelWidths();
let activeResize: ActiveResize | null = null;
let enhanceScheduled = false;

const observer = new MutationObserver(() => scheduleEnhance());
observer.observe(document.body, { childList: true, subtree: true });
window.addEventListener('resize', () => {
  widths.paletteWidth = clampPanelWidth('palette', widths.paletteWidth);
  widths.inspectorWidth = clampPanelWidth('inspector', widths.inspectorWidth);
  savePanelWidths();
  applyPanelLayout();
});

scheduleEnhance();

function scheduleEnhance(): void {
  if (enhanceScheduled) return;
  enhanceScheduled = true;
  window.requestAnimationFrame(() => {
    enhanceScheduled = false;
    installPanelResizers();
    applyPanelLayout();
  });
}

function installPanelResizers(): void {
  const main = document.querySelector<HTMLElement>('.compact-main');
  const shell = document.querySelector<HTMLElement>('.ai-editor-shell');
  if (!main || !shell) return;

  main.classList.add('panel-resize-layout-owner');
  ensurePanelResizer(main, 'palette');
  ensurePanelResizer(main, 'inspector');
  positionPanelResizers(main, shell);
}

function ensurePanelResizer(main: HTMLElement, panel: PanelKind): void {
  if (main.querySelector(`[data-overlay-resize-panel="${panel}"]`)) return;

  const handle = document.createElement('div');
  handle.className = `panel-resize-overlay-handle ${panel}-resize-overlay-handle`;
  handle.dataset.overlayResizePanel = panel;
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', 'vertical');
  handle.setAttribute('aria-label', panel === 'palette' ? 'Изменить ширину палитры' : 'Изменить ширину инспектора');
  handle.title = panel === 'palette'
    ? 'Потяните, чтобы изменить ширину палитры'
    : 'Потяните, чтобы изменить ширину инспектора';

  handle.addEventListener('pointerdown', (event) => startPanelResize(event, panel, handle));
  main.appendChild(handle);
}

function startPanelResize(event: PointerEvent, panel: PanelKind, handle: HTMLElement): void {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopImmediatePropagation();

  activeResize = {
    panel,
    pointerId: event.pointerId,
    startX: event.clientX,
    startWidth: panel === 'palette' ? widths.paletteWidth : widths.inspectorWidth,
    handle,
  };

  document.body.classList.add('panel-resizing');
  handle.classList.add('active');
  handle.setPointerCapture?.(event.pointerId);
  window.addEventListener('pointermove', onPanelResizeMove, { capture: true });
  window.addEventListener('pointerup', finishPanelResize, { capture: true });
  window.addEventListener('pointercancel', finishPanelResize, { capture: true });
}

function onPanelResizeMove(event: PointerEvent): void {
  const state = activeResize;
  if (!state || event.pointerId !== state.pointerId) return;
  event.preventDefault();
  event.stopImmediatePropagation();

  const direction = state.panel === 'palette' ? 1 : -1;
  const requestedWidth = state.startWidth + (event.clientX - state.startX) * direction;
  const nextWidth = clampPanelWidth(state.panel, requestedWidth);
  if (state.panel === 'palette') widths.paletteWidth = nextWidth;
  else widths.inspectorWidth = nextWidth;
  applyPanelLayout();
}

function finishPanelResize(event: PointerEvent): void {
  const state = activeResize;
  if (!state || event.pointerId !== state.pointerId) return;
  event.preventDefault();
  event.stopImmediatePropagation();

  try {
    if (state.handle.hasPointerCapture?.(state.pointerId)) state.handle.releasePointerCapture?.(state.pointerId);
  } catch {
    // Pointer capture may already be released by the browser.
  }

  activeResize = null;
  document.body.classList.remove('panel-resizing');
  state.handle.classList.remove('active');
  window.removeEventListener('pointermove', onPanelResizeMove, { capture: true });
  window.removeEventListener('pointerup', finishPanelResize, { capture: true });
  window.removeEventListener('pointercancel', finishPanelResize, { capture: true });
  savePanelWidths();
  applyPanelLayout();
}

function applyPanelLayout(): void {
  const main = document.querySelector<HTMLElement>('.compact-main');
  const shell = document.querySelector<HTMLElement>('.ai-editor-shell');
  if (!main || !shell) return;

  const paletteOpen = shell.classList.contains('palette-open');
  const inspectorOpen = shell.classList.contains('inspector-open');
  const paletteColumn = paletteOpen ? widths.paletteWidth : CLOSED_RAIL_WIDTH;
  const inspectorColumn = inspectorOpen ? widths.inspectorWidth : CLOSED_RAIL_WIDTH;

  main.style.setProperty('--palette-width', `${widths.paletteWidth}px`);
  main.style.setProperty('--inspector-width', `${widths.inspectorWidth}px`);
  main.style.setProperty(
    'grid-template-columns',
    `${paletteColumn}px minmax(0, 1fr) ${inspectorColumn}px`,
    'important',
  );

  positionPanelResizers(main, shell);
}

function positionPanelResizers(main: HTMLElement, shell: HTMLElement): void {
  const paletteHandle = main.querySelector<HTMLElement>('[data-overlay-resize-panel="palette"]');
  const inspectorHandle = main.querySelector<HTMLElement>('[data-overlay-resize-panel="inspector"]');
  const paletteOpen = shell.classList.contains('palette-open');
  const inspectorOpen = shell.classList.contains('inspector-open');

  if (paletteHandle) {
    paletteHandle.hidden = !paletteOpen;
    paletteHandle.style.left = `${widths.paletteWidth - PANEL_RESIZER_PANEL_OVERLAP}px`;
    paletteHandle.style.width = `${PANEL_RESIZER_HIT_WIDTH}px`;
  }
  if (inspectorHandle) {
    inspectorHandle.hidden = !inspectorOpen;
    inspectorHandle.style.right = `${widths.inspectorWidth - PANEL_RESIZER_PANEL_OVERLAP}px`;
    inspectorHandle.style.width = `${PANEL_RESIZER_HIT_WIDTH}px`;
  }
}

function clampPanelWidth(panel: PanelKind, requested: number): number {
  const shell = document.querySelector<HTMLElement>('.ai-editor-shell');
  const paletteOpen = shell?.classList.contains('palette-open') ?? true;
  const inspectorOpen = shell?.classList.contains('inspector-open') ?? true;
  const viewportWidth = Math.max(1180, window.innerWidth);

  if (panel === 'palette') {
    const otherWidth = inspectorOpen ? widths.inspectorWidth : CLOSED_RAIL_WIDTH;
    const dynamicMax = paletteOpen ? viewportWidth - otherWidth - MIN_GRAPH_WIDTH : PALETTE_MAX_WIDTH;
    return Math.round(clamp(requested, PALETTE_MIN_WIDTH, Math.max(PALETTE_MIN_WIDTH, Math.min(PALETTE_MAX_WIDTH, dynamicMax))));
  }

  const otherWidth = paletteOpen ? widths.paletteWidth : CLOSED_RAIL_WIDTH;
  const dynamicMax = inspectorOpen ? viewportWidth - otherWidth - MIN_GRAPH_WIDTH : INSPECTOR_MAX_WIDTH;
  return Math.round(clamp(requested, INSPECTOR_MIN_WIDTH, Math.max(INSPECTOR_MIN_WIDTH, Math.min(INSPECTOR_MAX_WIDTH, dynamicMax))));
}

function loadPanelWidths(): PanelWidths {
  try {
    const parsed = JSON.parse(localStorage.getItem(PANEL_WIDTHS_STORAGE_KEY) ?? '{}') as Partial<PanelWidths>;
    return {
      paletteWidth: clampNumber(parsed.paletteWidth, PALETTE_MIN_WIDTH, PALETTE_MAX_WIDTH, PALETTE_DEFAULT_WIDTH),
      inspectorWidth: clampNumber(parsed.inspectorWidth, INSPECTOR_MIN_WIDTH, INSPECTOR_MAX_WIDTH, INSPECTOR_DEFAULT_WIDTH),
    };
  } catch {
    return { paletteWidth: PALETTE_DEFAULT_WIDTH, inspectorWidth: INSPECTOR_DEFAULT_WIDTH };
  }
}

function savePanelWidths(): void {
  try {
    localStorage.setItem(PANEL_WIDTHS_STORAGE_KEY, JSON.stringify(widths));
  } catch {
    // Layout preferences must not block graph editing.
  }
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(clamp(value, min, max)) : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
