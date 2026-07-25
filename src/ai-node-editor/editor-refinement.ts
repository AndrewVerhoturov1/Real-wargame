import './editor-refinement.css';
import {
  removeIncomingFlowLink,
  removeTypedInputBinding,
  setPaletteFilter,
} from './main-ux';

type PaletteFilterValue = Parameters<typeof setPaletteFilter>[0];
type LinkKind = 'flow' | 'data';
type PanelKind = 'palette' | 'inspector';

interface StoredInputBinding {
  source?: string;
  nodeId?: string;
  port?: string;
}

interface StoredNode {
  id: string;
  type?: string;
  displayName?: string;
  displayNameRu?: string;
  children?: string[];
  inputBindings?: Record<string, StoredInputBinding>;
}

interface StoredGraph {
  nodes?: StoredNode[];
}

export interface OutgoingDataConsumer {
  node: StoredNode;
  inputPortId: string;
}

interface OutgoingMenuState {
  sourceNodeId: string;
  sourcePortId: string;
  kind: LinkKind;
}

interface PanelWidths {
  paletteWidth: number;
  inspectorWidth: number;
}

interface ResizeState {
  panel: PanelKind;
  startX: number;
  startWidth: number;
}

const GRAPH_STORAGE_KEY = 'real-wargame.ai-node-editor.graph.v6';
export const PANEL_WIDTHS_STORAGE_KEY = 'real-wargame.ai-node-editor.panel-widths.v1';
const MIN_GRAPH_WIDTH = 520;
const CLOSED_RAIL_WIDTH = 36;
const PALETTE_MIN_WIDTH = 180;
const PALETTE_DEFAULT_WIDTH = 228;
const PALETTE_MAX_WIDTH = 420;
const INSPECTOR_MIN_WIDTH = 260;
const INSPECTOR_DEFAULT_WIDTH = 300;
const INSPECTOR_MAX_WIDTH = 520;

let enhanceScheduled = false;
let outgoingMenuState: OutgoingMenuState | null = null;
let resizeState: ResizeState | null = null;
let panelWidths = loadPanelWidths();

const observer = new MutationObserver(() => scheduleEnhance());
observer.observe(document.body, { childList: true, subtree: true });

document.addEventListener('pointerdown', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (outgoingMenuState && !target?.closest('.outgoing-link-menu, .node-output-link-control')) {
    outgoingMenuState = null;
    document.querySelectorAll('.outgoing-link-menu').forEach((menu) => menu.remove());
  }
}, true);

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest<HTMLButtonElement>('[data-menu-action="unlink-outgoing"]');
  if (!button) return;
  const selectedNodeId = document.querySelector<HTMLElement>('.graph-node.selected[data-node-id]')?.dataset.nodeId;
  if (!selectedNodeId) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  outgoingMenuState = null;
  removeAllOutgoingLinks(selectedNodeId);
}, true);

document.addEventListener('pointermove', (event) => {
  if (!resizeState) return;
  event.preventDefault();
  const direction = resizeState.panel === 'palette' ? 1 : -1;
  const requested = resizeState.startWidth + (event.clientX - resizeState.startX) * direction;
  const nextWidth = clampPanelWidth(resizeState.panel, requested);
  if (resizeState.panel === 'palette') panelWidths.paletteWidth = nextWidth;
  else panelWidths.inspectorWidth = nextWidth;
  applyPanelWidths();
});

document.addEventListener('pointerup', () => finishPanelResize());
document.addEventListener('pointercancel', () => finishPanelResize());
window.addEventListener('resize', () => {
  panelWidths.paletteWidth = clampPanelWidth('palette', panelWidths.paletteWidth);
  panelWidths.inspectorWidth = clampPanelWidth('inspector', panelWidths.inspectorWidth);
  savePanelWidths();
  applyPanelWidths();
});

scheduleEnhance();

function scheduleEnhance(): void {
  if (enhanceScheduled) return;
  enhanceScheduled = true;
  window.requestAnimationFrame(() => {
    enhanceScheduled = false;
    enhanceEditor();
  });
}

function enhanceEditor(): void {
  applyPanelWidths();
  enhancePaletteFilter();
  enhanceInspector();
  enhanceOutgoingPorts();
  installPanelResizers();
}

function enhancePaletteFilter(): void {
  const sourceRow = document.querySelector<HTMLElement>('.palette-filter-row');
  if (!sourceRow) return;
  sourceRow.classList.add('refinement-filter-source');
  if (document.querySelector('#palette-filter-select')) return;

  const buttons = Array.from(sourceRow.querySelectorAll<HTMLButtonElement>('[data-palette-filter]'));
  if (buttons.length === 0) return;

  const field = document.createElement('label');
  field.className = 'palette-filter-field';
  const caption = document.createElement('span');
  caption.textContent = document.documentElement.lang === 'en' ? 'Node type' : 'Тип нод';
  const select = document.createElement('select');
  select.id = 'palette-filter-select';
  select.className = 'palette-filter-select';
  select.setAttribute('aria-label', caption.textContent);

  for (const button of buttons) {
    const value = button.dataset.paletteFilter;
    if (!value) continue;
    const option = document.createElement('option');
    option.value = value;
    option.textContent = button.textContent?.trim() || value;
    option.selected = button.classList.contains('active');
    select.appendChild(option);
  }

  select.addEventListener('change', () => setPaletteFilter(select.value as PaletteFilterValue));
  field.append(caption, select);
  sourceRow.insertAdjacentElement('beforebegin', field);
}

function enhanceInspector(): void {
  const inspector = document.querySelector<HTMLElement>('.inspector-panel');
  if (!inspector) return;
  inspector.classList.add('refined-inspector');

  const saveButton = inspector.querySelector<HTMLButtonElement>('#save-node');
  const editCard = saveButton?.closest<HTMLElement>('.inspector-card');
  if (editCard) {
    editCard.classList.add('inspector-save-bridge');
    editCard.setAttribute('aria-hidden', 'true');
  }

  const visibleCards = Array.from(inspector.querySelectorAll<HTMLElement>('.inspector-card'))
    .filter((card) => !card.classList.contains('inspector-save-bridge'));
  visibleCards[0]?.classList.add('refined-inspector-summary');

  const linksCard = inspector.querySelector<HTMLElement>('#link-selected-node')?.closest('.inspector-card');
  if (linksCard) {
    linksCard.classList.add('refined-inspector-links');
    const linkButton = linksCard.querySelector<HTMLButtonElement>('#link-selected-node');
    if (linkButton) linkButton.textContent = document.documentElement.lang === 'en' ? 'Link' : 'Связать';
    const heading = linksCard.querySelector<HTMLHeadingElement>('h3');
    if (heading && !heading.querySelector('.inspector-count-badge')) {
      const count = linksCard.querySelectorAll('.child-link-row').length;
      const badge = document.createElement('span');
      badge.className = 'inspector-count-badge';
      badge.textContent = String(count);
      heading.appendChild(badge);
    }
    linksCard.querySelectorAll<HTMLButtonElement>('[data-unlink-child]').forEach((button) => {
      button.textContent = '×';
      button.title = document.documentElement.lang === 'en' ? 'Remove link' : 'Удалить связь';
      button.setAttribute('aria-label', button.title);
    });
  }

  const dangerCard = inspector.querySelector<HTMLElement>('#delete-selected-node')?.closest('.inspector-card');
  if (dangerCard) {
    dangerCard.classList.add('refined-inspector-danger');
    const deleteButton = dangerCard.querySelector<HTMLButtonElement>('#delete-selected-node');
    if (deleteButton) deleteButton.textContent = document.documentElement.lang === 'en' ? 'Delete node' : 'Удалить ноду';
  }

  inspector.querySelector<HTMLElement>('.result-card')?.classList.add('refined-inspector-result');
  enhanceHumanInspector(inspector);
}

function enhanceHumanInspector(inspector: HTMLElement): void {
  const humanPanel = inspector.querySelector<HTMLElement>('.human-node-panel');
  const saveButton = humanPanel?.querySelector<HTMLButtonElement>('.human-save-node');
  if (!humanPanel || !saveButton) return;
  humanPanel.classList.add('refined-human-node-panel');
  saveButton.textContent = document.documentElement.lang === 'en' ? 'Save node' : 'Сохранить ноду';

  if (!humanPanel.querySelector('.human-node-metadata')) {
    const displayName = inspector.querySelector<HTMLInputElement>('#node-display-name')?.value ?? '';
    const displayNameRu = inspector.querySelector<HTMLInputElement>('#node-display-name-ru')?.value ?? '';
    const description = inspector.querySelector<HTMLTextAreaElement>('#node-description')?.value ?? '';
    const descriptionRu = inspector.querySelector<HTMLTextAreaElement>('#node-description-ru')?.value ?? '';
    const details = document.createElement('details');
    details.className = 'human-node-metadata';
    details.innerHTML = `
      <summary>${document.documentElement.lang === 'en' ? 'Name and description' : 'Название и описание'}</summary>
      <label class="human-control wide"><span>Название</span><input class="human-meta-field" data-node-meta="displayNameRu" type="text" value="${escapeAttribute(displayNameRu)}" /></label>
      <label class="human-control wide"><span>Описание</span><textarea class="human-meta-field" data-node-meta="descriptionRu" rows="2">${escapeHtml(descriptionRu)}</textarea></label>
      <details class="human-translation-details">
        <summary>English</summary>
        <label class="human-control wide"><span>Name</span><input class="human-meta-field" data-node-meta="displayName" type="text" value="${escapeAttribute(displayName)}" /></label>
        <label class="human-control wide"><span>Description</span><textarea class="human-meta-field" data-node-meta="description" rows="2">${escapeHtml(description)}</textarea></label>
      </details>
    `;
    const descriptionElement = humanPanel.querySelector('.human-description');
    if (descriptionElement) descriptionElement.insertAdjacentElement('afterend', details);
    else humanPanel.prepend(details);
  }

  if (saveButton.dataset.refinedSaveInstalled !== 'yes') {
    saveButton.dataset.refinedSaveInstalled = 'yes';
    saveButton.addEventListener('click', () => syncHumanMetadataToSaveBridge(inspector, humanPanel), { capture: true });
  }
}

function syncHumanMetadataToSaveBridge(inspector: HTMLElement, humanPanel: HTMLElement): void {
  const mappings: ReadonlyArray<readonly [string, string]> = [
    ['displayName', '#node-display-name'],
    ['displayNameRu', '#node-display-name-ru'],
    ['description', '#node-description'],
    ['descriptionRu', '#node-description-ru'],
  ];
  for (const [key, targetSelector] of mappings) {
    const source = humanPanel.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-node-meta="${key}"]`);
    const target = inspector.querySelector<HTMLInputElement | HTMLTextAreaElement>(targetSelector);
    if (source && target) target.value = source.value;
  }
}

function enhanceOutgoingPorts(): void {
  const graph = readGraph();
  const nodes = graph.nodes ?? [];
  const byId = new Map(nodes.map((node) => [node.id, node]));

  document.querySelectorAll<HTMLElement>('.graph-node[data-node-id]').forEach((nodeElement) => {
    const sourceNodeId = nodeElement.dataset.nodeId;
    if (!sourceNodeId) return;
    const sourceNode = byId.get(sourceNodeId);
    if (!sourceNode) return;

    const flowPort = nodeElement.querySelector<HTMLButtonElement>('[data-port-kind="flow-out"]');
    const children = (sourceNode.children ?? []).filter((childId) => byId.has(childId));
    if (flowPort) {
      flowPort.classList.toggle('connected', children.length > 0);
      if (children.length > 0) installOutgoingControl(nodeElement, flowPort, sourceNodeId, 'flow', 'flow', children.length);
    }

    nodeElement.querySelectorAll<HTMLButtonElement>('[data-port-kind="data-out"][data-port-id]').forEach((port) => {
      const sourcePortId = port.dataset.portId;
      if (!sourcePortId) return;
      const consumers = getOutgoingDataConsumers(sourceNodeId, sourcePortId);
      port.classList.toggle('connected', consumers.length > 0);
      if (consumers.length > 0) installOutgoingControl(nodeElement, port, sourceNodeId, sourcePortId, 'data', consumers.length);
    });

    if (outgoingMenuState?.sourceNodeId === sourceNodeId) renderOutgoingMenu(nodeElement, sourceNode, byId);
  });
}

function installOutgoingControl(
  nodeElement: HTMLElement,
  port: HTMLButtonElement,
  sourceNodeId: string,
  sourcePortId: string,
  kind: LinkKind,
  count: number,
): void {
  const selector = `.node-output-link-control[data-source-node-id="${cssEscape(sourceNodeId)}"][data-source-port-id="${cssEscape(sourcePortId)}"][data-link-kind="${kind}"]`;
  if (nodeElement.querySelector(selector)) return;

  const control = document.createElement('button');
  control.type = 'button';
  control.className = `node-output-link-control ${kind}-link`;
  control.dataset.sourceNodeId = sourceNodeId;
  control.dataset.sourcePortId = sourcePortId;
  control.dataset.linkKind = kind;
  control.textContent = '×';
  control.title = document.documentElement.lang === 'en'
    ? `Remove outgoing link${count > 1 ? 's' : ''}`
    : `Удалить исходящ${count > 1 ? 'ие связи' : 'ую связь'}`;
  control.setAttribute('aria-label', control.title);
  if (kind === 'data' && port.style.top) control.style.top = port.style.top;

  control.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  control.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (count === 1) {
      removeSingleOutgoingLink(sourceNodeId, sourcePortId, kind);
      return;
    }
    outgoingMenuState = { sourceNodeId, sourcePortId, kind };
    document.querySelectorAll('.outgoing-link-menu').forEach((menu) => menu.remove());
    renderOutgoingMenu(nodeElement, readGraph().nodes?.find((node) => node.id === sourceNodeId) ?? { id: sourceNodeId }, new Map((readGraph().nodes ?? []).map((node) => [node.id, node])));
  });
  nodeElement.appendChild(control);
}

function removeSingleOutgoingLink(sourceNodeId: string, sourcePortId: string, kind: LinkKind): void {
  const graph = readGraph();
  const source = graph.nodes?.find((node) => node.id === sourceNodeId);
  if (!source) return;
  outgoingMenuState = null;
  if (kind === 'flow') {
    const childId = source.children?.[0];
    if (childId) removeIncomingFlowLink(sourceNodeId, childId);
    return;
  }
  const consumer = getOutgoingDataConsumers(sourceNodeId, sourcePortId)[0];
  if (consumer) removeOutgoingDataLink(sourceNodeId, sourcePortId, consumer.node.id, consumer.inputPortId);
}

function renderOutgoingMenu(nodeElement: HTMLElement, sourceNode: StoredNode, byId: ReadonlyMap<string, StoredNode>): void {
  const state = outgoingMenuState;
  if (!state || state.sourceNodeId !== sourceNode.id || nodeElement.querySelector('.outgoing-link-menu')) return;

  const menu = document.createElement('div');
  menu.className = 'outgoing-link-menu';
  menu.dataset.outgoingMenu = `${state.sourceNodeId}:${state.sourcePortId}:${state.kind}`;
  const title = document.createElement('strong');
  title.textContent = document.documentElement.lang === 'en' ? 'Remove outgoing link' : 'Удалить исходящую связь';
  menu.appendChild(title);

  if (state.kind === 'flow') {
    const children = (sourceNode.children ?? []).filter((childId) => byId.has(childId));
    for (const childId of children) {
      const child = byId.get(childId);
      menu.appendChild(makeMenuButton(`${nodeLabel(child)} · ${childId}`, () => {
        outgoingMenuState = null;
        removeIncomingFlowLink(sourceNode.id, childId);
      }));
    }
  } else {
    for (const consumer of getOutgoingDataConsumers(sourceNode.id, state.sourcePortId)) {
      menu.appendChild(makeMenuButton(`${nodeLabel(consumer.node)} · ${consumer.inputPortId}`, () => {
        outgoingMenuState = null;
        removeOutgoingDataLink(sourceNode.id, state.sourcePortId, consumer.node.id, consumer.inputPortId);
      }));
    }
  }

  const removeAll = makeMenuButton(
    document.documentElement.lang === 'en' ? 'Remove all from this output' : 'Удалить все связи этого выхода',
    () => {
      outgoingMenuState = null;
      removeAllOutgoingLinks(sourceNode.id, state.sourcePortId, state.kind);
    },
  );
  removeAll.classList.add('danger');
  menu.appendChild(removeAll);

  const port = nodeElement.querySelector<HTMLElement>(`[data-port-id="${cssEscape(state.sourcePortId)}"][data-port-kind="${state.kind === 'flow' ? 'flow-out' : 'data-out'}"]`);
  const portTop = Number.parseFloat(port?.style.top || '39');
  menu.style.setProperty('--outgoing-menu-top', `${state.kind === 'flow' ? 52 : Math.max(52, portTop + 15)}px`);
  nodeElement.appendChild(menu);
}

function makeMenuButton(label: string, action: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    action();
  });
  return button;
}

export function getOutgoingDataConsumers(sourceNodeId: string, sourcePortId: string): OutgoingDataConsumer[] {
  const graph = readGraph();
  const consumers: OutgoingDataConsumer[] = [];
  for (const node of graph.nodes ?? []) {
    for (const [inputPortId, binding] of Object.entries(node.inputBindings ?? {})) {
      if (binding.source === 'node' && binding.nodeId === sourceNodeId && binding.port === sourcePortId) {
        consumers.push({ node, inputPortId });
      }
    }
  }
  return consumers;
}

export function removeOutgoingDataLink(
  sourceNodeId: string,
  sourcePortId: string,
  targetNodeId: string,
  targetPortId: string,
): void {
  const graph = readGraph();
  const target = graph.nodes?.find((node) => node.id === targetNodeId);
  const binding = target?.inputBindings?.[targetPortId];
  if (binding?.source !== 'node' || binding.nodeId !== sourceNodeId || binding.port !== sourcePortId) return;
  removeTypedInputBinding(targetNodeId, targetPortId);
}

export function removeAllOutgoingLinks(sourceNodeId: string, sourcePortId?: string, kind?: LinkKind): void {
  const graph = readGraph();
  const source = graph.nodes?.find((node) => node.id === sourceNodeId);
  if (!source) return;
  const removeFlow = !kind || kind === 'flow';
  const removeData = !kind || kind === 'data';

  if (removeFlow) {
    for (const childId of [...(source.children ?? [])]) removeIncomingFlowLink(sourceNodeId, childId);
  }
  if (removeData) {
    const consumers = sourcePortId
      ? getOutgoingDataConsumers(sourceNodeId, sourcePortId)
      : getAllOutgoingDataConsumers(sourceNodeId);
    for (const consumer of consumers) removeTypedInputBinding(consumer.node.id, consumer.inputPortId);
  }
}

function getAllOutgoingDataConsumers(sourceNodeId: string): OutgoingDataConsumer[] {
  const graph = readGraph();
  const consumers: OutgoingDataConsumer[] = [];
  for (const node of graph.nodes ?? []) {
    for (const [inputPortId, binding] of Object.entries(node.inputBindings ?? {})) {
      if (binding.source === 'node' && binding.nodeId === sourceNodeId) consumers.push({ node, inputPortId });
    }
  }
  return consumers;
}

function installPanelResizers(): void {
  installPanelResizer('palette', document.querySelector<HTMLElement>('.palette-panel'));
  installPanelResizer('inspector', document.querySelector<HTMLElement>('.inspector-panel'));
}

function installPanelResizer(panel: PanelKind, container: HTMLElement | null): void {
  if (!container || container.querySelector(`[data-resize-panel="${panel}"]`)) return;
  const resizer = document.createElement('div');
  resizer.className = `panel-resizer ${panel}-resizer`;
  resizer.dataset.resizePanel = panel;
  resizer.setAttribute('role', 'separator');
  resizer.setAttribute('aria-orientation', 'vertical');
  resizer.setAttribute('aria-label', panel === 'palette' ? 'Изменить ширину палитры' : 'Изменить ширину инспектора');
  resizer.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    resizeState = {
      panel,
      startX: event.clientX,
      startWidth: panel === 'palette' ? panelWidths.paletteWidth : panelWidths.inspectorWidth,
    };
    document.body.classList.add('panel-resizing');
    resizer.classList.add('active');
    resizer.setPointerCapture?.(event.pointerId);
  });
  container.appendChild(resizer);
}

function finishPanelResize(): void {
  if (!resizeState) return;
  resizeState = null;
  document.body.classList.remove('panel-resizing');
  document.querySelectorAll('.panel-resizer.active').forEach((resizer) => resizer.classList.remove('active'));
  savePanelWidths();
  applyPanelWidths();
}

function applyPanelWidths(): void {
  const main = document.querySelector<HTMLElement>('.compact-main');
  if (!main) return;
  main.style.setProperty('--palette-width', `${panelWidths.paletteWidth}px`);
  main.style.setProperty('--inspector-width', `${panelWidths.inspectorWidth}px`);
}

function clampPanelWidth(panel: PanelKind, requested: number): number {
  const shell = document.querySelector<HTMLElement>('.ai-editor-shell');
  const paletteOpen = shell?.classList.contains('palette-open') ?? true;
  const inspectorOpen = shell?.classList.contains('inspector-open') ?? true;
  const viewportWidth = Math.max(1180, window.innerWidth);

  if (panel === 'palette') {
    const otherWidth = inspectorOpen ? panelWidths.inspectorWidth : CLOSED_RAIL_WIDTH;
    const dynamicMax = paletteOpen ? viewportWidth - otherWidth - MIN_GRAPH_WIDTH : PALETTE_MAX_WIDTH;
    return Math.round(clamp(requested, PALETTE_MIN_WIDTH, Math.max(PALETTE_MIN_WIDTH, Math.min(PALETTE_MAX_WIDTH, dynamicMax))));
  }

  const otherWidth = paletteOpen ? panelWidths.paletteWidth : CLOSED_RAIL_WIDTH;
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
    localStorage.setItem(PANEL_WIDTHS_STORAGE_KEY, JSON.stringify(panelWidths));
  } catch {
    // Layout preferences must not block graph editing.
  }
}

function readGraph(): StoredGraph {
  try {
    const parsed = JSON.parse(localStorage.getItem(GRAPH_STORAGE_KEY) ?? '{}') as StoredGraph;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function nodeLabel(node: StoredNode | undefined): string {
  if (!node) return document.documentElement.lang === 'en' ? 'Unknown node' : 'Неизвестная нода';
  return document.documentElement.lang === 'en'
    ? node.displayName || node.displayNameRu || node.id
    : node.displayNameRu || node.displayName || node.id;
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(clamp(value, min, max)) : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function cssEscape(value: string): string {
  return value.replace(/(["\\])/g, '\\$1');
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll('\n', ' ');
}
