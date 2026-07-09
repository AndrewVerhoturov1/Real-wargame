import './ai-node-editor.css';
import './ai-node-editor-authoring.css';
import graphData from '../data/ai/soldier_default_survival_graph.json';
import { AI_NODE_TYPE_DEFINITIONS, type AiNodeCategory } from '../core/ai/AiNodeTypes';

const ENGINE_BASE_URL = 'http://127.0.0.1:8787';
const GRAPH_STORAGE_KEY = 'real-wargame.ai-node-editor.graph.v6';
const POSITION_STORAGE_KEY = 'real-wargame.ai-node-editor.positions.v6';
const UI_STORAGE_KEY = 'real-wargame.ai-node-editor.ui.v6';
const CANVAS_WIDTH = 2600;
const CANVAS_HEIGHT = 1700;
const NODE_WIDTH = 210;
const NODE_HEIGHT = 88;

const root = document.querySelector<HTMLElement>('#ai-node-editor-root');
if (!root) throw new Error('AI node editor root is missing.');

type JsonPrimitive = string | number | boolean | null;
type JsonPosition = { x: number; y: number };
type JsonValue = JsonPrimitive | JsonPosition;
type JsonObject = Record<string, JsonValue>;
type BottomTab = 'console' | 'json';
type LanguageMode = 'ru' | 'en' | 'both';
type NodeDetailMode = 'compact' | 'detailed';

interface EditableAiNode {
  id: string;
  type: string;
  displayName: string;
  displayNameRu: string;
  description?: string;
  descriptionRu?: string;
  children: string[];
  parameters: JsonObject;
}

interface EditableAiGraph {
  version: 1;
  id: string;
  name: string;
  nameRu?: string;
  description?: string;
  descriptionRu?: string;
  rootNodeId: string;
  blackboardDefaults: JsonObject;
  nodes: EditableAiNode[];
}

interface NodePosition { x: number; y: number }
interface DragState { nodeId: string; offsetX: number; offsetY: number; moved: boolean }
interface PanState { startClientX: number; startClientY: number; startPanX: number; startPanY: number }
interface ConnectionState { sourceNodeId: string; currentX: number; currentY: number }
interface ContextMenuState { nodeId: string; x: number; y: number }
interface EditorUiState {
  paletteOpen: boolean;
  inspectorOpen: boolean;
  bottomOpen: boolean;
  bottomTab: BottomTab;
  zoom: number;
  panX: number;
  panY: number;
  languageMode: LanguageMode;
  nodeDetailMode: NodeDetailMode;
  linkSourceNodeId: string | null;
}

interface EngineHealthPayload { ok: boolean; textBase?: string; overlayLanguage?: string; browserDoesHeavyAi?: boolean }
interface EngineValidationPayload { ok: boolean; validation?: { valid?: boolean } }
interface EngineEvaluationPayload { ok: boolean; command?: { type?: string }; explanation?: string; explanationRu?: string }
interface EngineEvaluateRequest { graph: EditableAiGraph; unitId: string; blackboard: JsonObject; hasOrder: boolean }

const initialNodePositions: Record<string, NodePosition> = {
  root: { x: 90, y: 140 },
};

let editorGraph = loadStoredGraph() ?? normalizeGraph(graphData as unknown);
let nodePositions = loadStoredPositions();
let uiState = loadStoredUiState();
let selectedNodeId = ensureSelectedNodeId(editorGraph.rootNodeId);
let engineOnline = false;
let lastHealthText = 'engine not checked';
let validationText = 'Чистый canvas готов. Добавь универсальные ноды и нажми Validate.';
let evaluationText = 'Evaluate пока проверяет структуру графа и возвращает первое найденное действие, если оно есть.';
let dragState: DragState | null = null;
let panState: PanState | null = null;
let connectionState: ConnectionState | null = null;
let contextMenuState: ContextMenuState | null = null;

ensurePositionsForGraph();
render();
void refreshEngineStatus();

function render(): void {
  ensurePositionsForGraph();
  const selectedNode = findSelectedNode();
  const shellClasses = [
    'ai-editor-shell',
    uiState.paletteOpen ? 'palette-open' : 'palette-closed',
    uiState.inspectorOpen ? 'inspector-open' : 'inspector-closed',
    uiState.bottomOpen ? 'bottom-open' : 'bottom-closed',
  ].join(' ');

  root.innerHTML = `
    <section class="${shellClasses}">
      <header class="ai-editor-topbar compact-topbar">
        <div class="ai-editor-title compact-title"><h1>Soldier AI Node Editor <span>Редактор ИИ</span></h1></div>
        <div class="ai-editor-actions compact-actions">
          <div id="engine-status" class="engine-status compact-status ${engineOnline ? 'online' : 'offline'}"><i class="engine-status-dot" aria-hidden="true"></i><span>${escapeHtml(lastHealthText)}</span></div>
          <button id="toggle-palette" class="ai-editor-button" type="button">+ Add node</button>
          <button id="toggle-inspector" class="ai-editor-button" type="button">Inspector</button>
          <button id="run-check-45" class="ai-editor-button primary" type="button">Auto 4–5</button>
          <button id="validate-graph" class="ai-editor-button" type="button">Validate</button>
          <button id="evaluate-once" class="ai-editor-button" type="button">Evaluate</button>
          <button id="export-graph" class="ai-editor-button" type="button">Export</button>
          <button id="import-graph" class="ai-editor-button" type="button">Import</button>
          <button id="reset-graph" class="ai-editor-button danger" type="button">Reset</button>
          <input id="import-graph-file" type="file" accept="application/json,.json" hidden />
        </div>
      </header>
      <main class="ai-editor-main compact-main">
        ${renderPalettePanel()}
        ${renderWorkspace()}
        ${renderInspectorPanel(selectedNode)}
      </main>
      ${renderBottomPanel()}
      ${renderContextMenu()}
    </section>
  `;

  installEventHandlers();
}

function renderPalettePanel(): string {
  if (!uiState.paletteOpen) {
    return '<aside class="ai-editor-rail left-rail"><button id="open-palette-rail" class="rail-button" type="button">+ Node</button></aside>';
  }

  const definitions = Object.values(AI_NODE_TYPE_DEFINITIONS);
  const categories: AiNodeCategory[] = ['flow', 'condition', 'score', 'query', 'action', 'memory', 'debug'];
  return `
    <aside class="ai-editor-panel palette-panel" aria-label="Node palette">
      <div class="panel-title compact-panel-title"><h2>Palette</h2><button id="close-palette" class="mini-button" type="button">Hide</button></div>
      <p class="toolbar-note">Чистая палитра: только универсальные ноды, старые точечные проверки убраны.</p>
      ${categories.map((category) => {
        const items = definitions.filter((definition) => definition.category === category);
        if (items.length === 0) return '';
        return `<section class="node-group compact-node-group"><h3>${category.toUpperCase()}</h3>${items.map((definition) => `
          <button class="palette-node compact-palette-node" type="button" data-palette-type="${definition.type}">
            <strong>${escapeHtml(definition.label)}</strong><em>${escapeHtml(definition.labelRu)}</em>
          </button>`).join('')}</section>`;
      }).join('')}
    </aside>
  `;
}

function renderWorkspace(): string {
  return `
    <section id="graph-workspace" class="graph-workspace graph-viewport" aria-label="Soldier behavior graph">
      <div class="graph-toolbar">
        <button id="zoom-out" class="graph-tool-button" type="button">−</button>
        <button id="zoom-reset" class="graph-tool-button" type="button">${Math.round(uiState.zoom * 100)}%</button>
        <button id="zoom-in" class="graph-tool-button" type="button">+</button>
        <button id="fit-graph" class="graph-tool-button" type="button">Fit</button>
        <button id="detail-toggle" class="graph-tool-button" type="button">${uiState.nodeDetailMode === 'compact' ? 'Compact' : 'Detailed'}</button>
        <button id="language-toggle-editor" class="graph-tool-button" type="button">${uiState.languageMode.toUpperCase()}</button>
        <span class="graph-help">Wheel = zoom · drag empty field = pan · drag right port → node = link</span>
      </div>
      <div class="graph-canvas" style="width:${CANVAS_WIDTH}px; height:${CANVAS_HEIGHT}px; transform: translate(${uiState.panX}px, ${uiState.panY}px) scale(${uiState.zoom});">
        ${renderEdges()}${renderGraphNodes()}
      </div>
    </section>
  `;
}

function renderGraphNodes(): string {
  return editorGraph.nodes.map((node) => {
    const position = getNodePosition(node.id);
    const category = getNodeCategory(node);
    const selected = node.id === selectedNodeId ? 'selected' : '';
    const detailHtml = uiState.nodeDetailMode === 'detailed' ? `<p class="node-description">${escapeHtml(getNodeVisibleDescription(node))}</p>` : '';
    return `
      <article class="graph-node ${category} ${selected} ${uiState.nodeDetailMode}" data-node-id="${escapeHtml(node.id)}" style="left:${position.x}px; top:${position.y}px;">
        <button class="node-port in" data-port-kind="in" data-node-id="${escapeHtml(node.id)}" title="Input"></button>
        <button class="node-port out" data-port-kind="out" data-node-id="${escapeHtml(node.id)}" title="Drag to another node"></button>
        <span class="node-type-chip">${escapeHtml(category)} / ${escapeHtml(node.type)}</span>
        <h3>${escapeHtml(getNodeTitle(node))}</h3>
        <p class="node-secondary">${escapeHtml(getNodeSubtitle(node))}</p>
        ${detailHtml}
        <div class="node-port-row"><span>id</span><b>${escapeHtml(node.id)}</b></div>
      </article>
    `;
  }).join('');
}

function renderEdges(): string {
  return `<svg class="graph-svg" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" role="img" aria-label="AI graph links">${renderEdgePaths()}${renderConnectionPreview()}</svg>`;
}

function renderEdgePaths(): string {
  const paths: string[] = [];
  for (const node of editorGraph.nodes) {
    const from = getNodePosition(node.id);
    for (const childId of node.children) {
      const child = editorGraph.nodes.find((candidate) => candidate.id === childId);
      if (!child) continue;
      const to = getNodePosition(child.id);
      paths.push(`<path class="edge-path" d="${makeEdgePath(from.x + NODE_WIDTH, from.y + NODE_HEIGHT / 2, to.x, to.y + NODE_HEIGHT / 2)}" />`);
    }
  }
  return paths.join('');
}

function renderConnectionPreview(): string {
  if (!connectionState) return '';
  const from = getNodePosition(connectionState.sourceNodeId);
  return `<path class="edge-path preview" d="${makeEdgePath(from.x + NODE_WIDTH, from.y + NODE_HEIGHT / 2, connectionState.currentX, connectionState.currentY)}" />`;
}

function renderInspectorPanel(node: EditableAiNode): string {
  if (!uiState.inspectorOpen) return '<aside class="ai-editor-rail right-rail"><button id="open-inspector-rail" class="rail-button" type="button">Inspector</button></aside>';
  return `<aside class="ai-editor-panel right inspector-panel" aria-label="Node inspector">${renderInspector(node)}${renderEngineResultCard()}</aside>`;
}

function renderInspector(node: EditableAiNode): string {
  const childRows = node.children.length > 0
    ? node.children.map((childId) => `<div class="child-link-row"><code>${escapeHtml(childId)}</code><button class="mini-button" type="button" data-unlink-child="${escapeHtml(childId)}">Remove</button></div>`).join('')
    : '<p class="toolbar-note">No children / детей нет.</p>';
  const linkOptions = editorGraph.nodes.filter((candidate) => candidate.id !== node.id).map((candidate) => `<option value="${escapeHtml(candidate.id)}">${escapeHtml(candidate.id)} · ${escapeHtml(candidate.displayNameRu || candidate.displayName)}</option>`).join('');
  const deleteDisabled = node.id === editorGraph.rootNodeId ? 'disabled' : '';
  return `
    <div class="panel-title compact-panel-title"><h2>Inspector</h2><button id="close-inspector" class="mini-button" type="button">Hide</button></div>
    <section class="inspector-card compact-inspector-card"><h3>${escapeHtml(getNodeTitle(node))}</h3><div class="inspector-row"><span>id</span><code>${escapeHtml(node.id)}</code></div><div class="inspector-row"><span>type</span><code>${escapeHtml(node.type)}</code></div><div class="inspector-row"><span>category</span><b>${escapeHtml(getNodeCategory(node))}</b></div></section>
    <section class="inspector-card compact-inspector-card">
      <h3>Edit</h3>
      <label class="inspector-field">EN displayName<input id="node-display-name" value="${escapeAttribute(node.displayName)}" /></label>
      <label class="inspector-field">RU displayNameRu<input id="node-display-name-ru" value="${escapeAttribute(node.displayNameRu)}" /></label>
      <details><summary>Descriptions</summary><label class="inspector-field">EN description<textarea id="node-description" rows="3">${escapeHtml(node.description ?? '')}</textarea></label><label class="inspector-field">RU descriptionRu<textarea id="node-description-ru" rows="3">${escapeHtml(node.descriptionRu ?? '')}</textarea></label></details>
      <details open><summary>parameters JSON</summary><label class="inspector-field">parameters<textarea id="node-parameters" rows="6">${escapeHtml(JSON.stringify(node.parameters, null, 2))}</textarea></label></details>
      <button id="save-node" class="ai-editor-button primary" type="button">Save node</button>
    </section>
    <section class="inspector-card compact-inspector-card"><h3>Links</h3><p class="toolbar-note">Main way: drag the small right dot of a node to another node.</p><label class="inspector-field">Fallback child<select id="link-target-select">${linkOptions}</select></label><button id="link-selected-node" class="ai-editor-button" type="button">Link selected → child</button><div class="child-link-list">${childRows}</div></section>
    <section class="inspector-card compact-inspector-card danger-zone"><h3>Danger zone</h3><button id="delete-selected-node" class="ai-editor-button danger" type="button" ${deleteDisabled}>Delete selected node</button></section>
  `;
}

function renderEngineResultCard(): string { return `<section class="result-card compact-result-card"><h3>Evaluate once</h3><pre>${escapeHtml(evaluationText)}</pre></section>`; }

function renderBottomPanel(): string {
  if (!uiState.bottomOpen) return `<footer class="ai-editor-bottom collapsed-bottom"><button id="toggle-bottom" class="bottom-toggle" type="button">▲ Console / JSON</button><span>${escapeHtml(shorten(validationText, 160))}</span></footer>`;
  const consoleActive = uiState.bottomTab === 'console' ? 'active' : '';
  const jsonActive = uiState.bottomTab === 'json' ? 'active' : '';
  return `<footer class="ai-editor-bottom expanded-bottom"><div class="bottom-tabs"><button id="bottom-tab-console" class="bottom-tab ${consoleActive}" type="button">Console</button><button id="bottom-tab-json" class="bottom-tab ${jsonActive}" type="button">Graph JSON</button><button id="toggle-bottom" class="bottom-tab" type="button">▼ Hide</button></div><section class="bottom-box ${uiState.bottomTab === 'console' ? '' : 'hidden'}"><h2>Validation / Engine result</h2><pre>${escapeHtml(validationText)}</pre></section><section class="bottom-box ${uiState.bottomTab === 'json' ? '' : 'hidden'}"><h2>Graph JSON preview</h2><pre>${escapeHtml(JSON.stringify(editorGraph, null, 2))}</pre></section></footer>`;
}

function renderContextMenu(): string {
  if (!contextMenuState) return '';
  const node = editorGraph.nodes.find((candidate) => candidate.id === contextMenuState?.nodeId);
  if (!node) return '';
  const canDelete = node.id !== editorGraph.rootNodeId;
  const hasLinkSource = uiState.linkSourceNodeId && uiState.linkSourceNodeId !== node.id;
  return `<div class="node-context-menu" style="left:${contextMenuState.x}px; top:${contextMenuState.y}px;"><strong>${escapeHtml(node.displayNameRu || node.displayName)}</strong><button data-menu-action="select" type="button">Select / выбрать</button><button data-menu-action="add-child" type="button">Add child Action</button><button data-menu-action="duplicate" type="button">Duplicate</button><button data-menu-action="set-link-source" type="button">Set as link source</button><button data-menu-action="link-source-to-this" type="button" ${hasLinkSource ? '' : 'disabled'}>Link source → this</button><button data-menu-action="center" type="button">Center view</button><button data-menu-action="unlink-all" type="button">Unlink all children</button><button data-menu-action="delete" type="button" ${canDelete ? '' : 'disabled'}>Delete</button></div>`;
}

function installEventHandlers(): void {
  document.querySelector<HTMLButtonElement>('#toggle-palette')?.addEventListener('click', togglePalette);
  document.querySelector<HTMLButtonElement>('#open-palette-rail')?.addEventListener('click', togglePalette);
  document.querySelector<HTMLButtonElement>('#close-palette')?.addEventListener('click', togglePalette);
  document.querySelector<HTMLButtonElement>('#toggle-inspector')?.addEventListener('click', toggleInspector);
  document.querySelector<HTMLButtonElement>('#open-inspector-rail')?.addEventListener('click', toggleInspector);
  document.querySelector<HTMLButtonElement>('#close-inspector')?.addEventListener('click', toggleInspector);
  document.querySelector<HTMLButtonElement>('#toggle-bottom')?.addEventListener('click', toggleBottomPanel);
  document.querySelector<HTMLButtonElement>('#bottom-tab-console')?.addEventListener('click', () => setBottomTab('console'));
  document.querySelector<HTMLButtonElement>('#bottom-tab-json')?.addEventListener('click', () => setBottomTab('json'));
  document.querySelector<HTMLButtonElement>('#run-check-45')?.addEventListener('click', () => { void runSimpleCheck45(); });
  document.querySelector<HTMLButtonElement>('#validate-graph')?.addEventListener('click', () => { void validateGraphThroughEngine(); });
  document.querySelector<HTMLButtonElement>('#evaluate-once')?.addEventListener('click', () => { void evaluateOnceThroughEngine(); });
  document.querySelector<HTMLButtonElement>('#save-node')?.addEventListener('click', saveSelectedNodeFromInspector);
  document.querySelector<HTMLButtonElement>('#link-selected-node')?.addEventListener('click', linkSelectedNodeToChosenChild);
  document.querySelector<HTMLButtonElement>('#delete-selected-node')?.addEventListener('click', deleteSelectedNode);
  document.querySelector<HTMLButtonElement>('#export-graph')?.addEventListener('click', exportGraphJson);
  document.querySelector<HTMLButtonElement>('#import-graph')?.addEventListener('click', () => document.querySelector<HTMLInputElement>('#import-graph-file')?.click());
  document.querySelector<HTMLInputElement>('#import-graph-file')?.addEventListener('change', importGraphFromFileInput);
  document.querySelector<HTMLButtonElement>('#reset-graph')?.addEventListener('click', resetGraphToBundled);
  document.querySelector<HTMLButtonElement>('#zoom-out')?.addEventListener('click', () => zoomBy(0.88));
  document.querySelector<HTMLButtonElement>('#zoom-in')?.addEventListener('click', () => zoomBy(1.14));
  document.querySelector<HTMLButtonElement>('#zoom-reset')?.addEventListener('click', resetZoom);
  document.querySelector<HTMLButtonElement>('#fit-graph')?.addEventListener('click', fitGraphToView);
  document.querySelector<HTMLButtonElement>('#detail-toggle')?.addEventListener('click', toggleDetailMode);
  document.querySelector<HTMLButtonElement>('#language-toggle-editor')?.addEventListener('click', cycleLanguageMode);

  document.querySelectorAll<HTMLElement>('[data-node-id].graph-node').forEach((element) => {
    element.addEventListener('pointerdown', (event) => { if (!isPortEvent(event)) startDrag(event, element.dataset.nodeId ?? ''); });
    element.addEventListener('click', () => { if (!dragState?.moved && element.dataset.nodeId) selectNode(element.dataset.nodeId); });
    element.addEventListener('contextmenu', (event) => { event.preventDefault(); if (element.dataset.nodeId) { selectedNodeId = element.dataset.nodeId; contextMenuState = { nodeId: element.dataset.nodeId, x: event.clientX, y: event.clientY }; render(); } });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-port-kind="out"]').forEach((button) => button.addEventListener('pointerdown', (event) => { if (button.dataset.nodeId) startConnectionDrag(event, button.dataset.nodeId); }));
  document.querySelectorAll<HTMLButtonElement>('[data-palette-type]').forEach((button) => button.addEventListener('click', () => { if (button.dataset.paletteType) addNodeFromPalette(button.dataset.paletteType); }));
  document.querySelectorAll<HTMLButtonElement>('[data-unlink-child]').forEach((button) => button.addEventListener('click', () => { if (button.dataset.unlinkChild) unlinkChild(selectedNodeId, button.dataset.unlinkChild); }));
  document.querySelectorAll<HTMLButtonElement>('[data-menu-action]').forEach((button) => button.addEventListener('click', () => handleContextMenuAction(button.dataset.menuAction ?? '')));
  document.querySelector<HTMLElement>('#graph-workspace')?.addEventListener('wheel', onWorkspaceWheel, { passive: false });
  document.querySelector<HTMLElement>('#graph-workspace')?.addEventListener('pointerdown', startPanIfEmpty);
  document.addEventListener('click', closeContextMenuIfNeeded, { once: true });
}

function selectNode(nodeId: string): void { selectedNodeId = nodeId; uiState.inspectorOpen = true; contextMenuState = null; saveUiState(); render(); }

function startDrag(event: PointerEvent, nodeId: string): void {
  if (event.button !== 0 || !nodeId) return;
  event.preventDefault();
  event.stopPropagation();
  selectedNodeId = nodeId;
  const world = screenToWorld(event.clientX, event.clientY);
  const position = getNodePosition(nodeId);
  dragState = { nodeId, offsetX: world.x - position.x, offsetY: world.y - position.y, moved: false };
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragEnd, { once: true });
}

function onDragMove(event: PointerEvent): void {
  if (!dragState) return;
  const world = screenToWorld(event.clientX, event.clientY);
  nodePositions[dragState.nodeId] = { x: clamp(Math.round(world.x - dragState.offsetX), 20, CANVAS_WIDTH - NODE_WIDTH - 20), y: clamp(Math.round(world.y - dragState.offsetY), 20, CANVAS_HEIGHT - NODE_HEIGHT - 20) };
  dragState.moved = true;
  updateNodePosition(dragState.nodeId);
  updateSvgPaths();
}

function onDragEnd(): void { window.removeEventListener('pointermove', onDragMove); savePositions(); saveUiState(); dragState = null; }

function updateNodePosition(nodeId: string): void {
  const element = document.querySelector<HTMLElement>(`.graph-node[data-node-id="${cssEscape(nodeId)}"]`);
  const position = getNodePosition(nodeId);
  if (element) { element.style.left = `${position.x}px`; element.style.top = `${position.y}px`; }
}

function startConnectionDrag(event: PointerEvent, sourceNodeId: string): void {
  event.preventDefault();
  event.stopPropagation();
  const world = screenToWorld(event.clientX, event.clientY);
  connectionState = { sourceNodeId, currentX: world.x, currentY: world.y };
  window.addEventListener('pointermove', onConnectionMove);
  window.addEventListener('pointerup', onConnectionEnd, { once: true });
}

function onConnectionMove(event: PointerEvent): void { if (connectionState) { const world = screenToWorld(event.clientX, event.clientY); connectionState.currentX = world.x; connectionState.currentY = world.y; updateSvgPaths(); } }
function onConnectionEnd(event: PointerEvent): void { window.removeEventListener('pointermove', onConnectionMove); const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null; const targetNodeId = target?.closest<HTMLElement>('.graph-node')?.dataset.nodeId; const sourceNodeId = connectionState?.sourceNodeId; connectionState = null; if (sourceNodeId && targetNodeId) addLink(sourceNodeId, targetNodeId); else render(); }

function startPanIfEmpty(event: PointerEvent): void { if (event.button !== 0 && event.button !== 1) return; const target = event.target as HTMLElement; if (target.closest('.graph-node') || target.closest('button') || target.closest('.graph-toolbar')) return; event.preventDefault(); panState = { startClientX: event.clientX, startClientY: event.clientY, startPanX: uiState.panX, startPanY: uiState.panY }; window.addEventListener('pointermove', onPanMove); window.addEventListener('pointerup', onPanEnd, { once: true }); }
function onPanMove(event: PointerEvent): void { if (!panState) return; uiState.panX = panState.startPanX + event.clientX - panState.startClientX; uiState.panY = panState.startPanY + event.clientY - panState.startClientY; applyCanvasTransform(); }
function onPanEnd(): void { window.removeEventListener('pointermove', onPanMove); panState = null; saveUiState(); }
function onWorkspaceWheel(event: WheelEvent): void { event.preventDefault(); zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.1 : 0.9); }
function zoomBy(factor: number): void { const rect = document.querySelector<HTMLElement>('#graph-workspace')?.getBoundingClientRect(); zoomAt((rect?.left ?? 0) + (rect?.width ?? 800) / 2, (rect?.top ?? 0) + (rect?.height ?? 600) / 2, factor); }
function zoomAt(clientX: number, clientY: number, factor: number): void { const before = screenToWorld(clientX, clientY); uiState.zoom = clamp(round2(uiState.zoom * factor), 0.35, 2.2); const rect = document.querySelector<HTMLElement>('#graph-workspace')?.getBoundingClientRect(); if (rect) { uiState.panX = clientX - rect.left - before.x * uiState.zoom; uiState.panY = clientY - rect.top - before.y * uiState.zoom; } saveUiState(); render(); }
function resetZoom(): void { uiState.zoom = 1; uiState.panX = 0; uiState.panY = 0; saveUiState(); render(); }
function fitGraphToView(): void { const rect = document.querySelector<HTMLElement>('#graph-workspace')?.getBoundingClientRect(); if (!rect || editorGraph.nodes.length === 0) return; const bounds = getGraphBounds(); const width = Math.max(1, bounds.maxX - bounds.minX + NODE_WIDTH); const height = Math.max(1, bounds.maxY - bounds.minY + NODE_HEIGHT); uiState.zoom = clamp(round2(Math.min((rect.width - 80) / width, (rect.height - 80) / height)), 0.35, 1.4); uiState.panX = Math.round((rect.width - width * uiState.zoom) / 2 - bounds.minX * uiState.zoom); uiState.panY = Math.round((rect.height - height * uiState.zoom) / 2 - bounds.minY * uiState.zoom); saveUiState(); render(); }

function addNodeFromPalette(type: string): void {
  const definition = getNodeTypeDefinition(type);
  if (!definition) { validationText = `Cannot add unknown node type: ${type}.`; openBottom('console'); render(); return; }
  const id = makeUniqueNodeId(type);
  const position = viewportCenterToWorld();
  editorGraph.nodes.push({ id, type, displayName: definition.label, displayNameRu: definition.labelRu, description: definition.description, descriptionRu: definition.descriptionRu, children: [], parameters: createDefaultParameters(type) });
  nodePositions[id] = position;
  selectedNodeId = id;
  uiState.inspectorOpen = true;
  validationText = `Added node ${id}. Добавлена нода ${id}.`;
  saveEditorState();
  openBottom('console');
  render();
}

function saveSelectedNodeFromInspector(): void {
  const node = findSelectedNode();
  try {
    node.displayName = getInputValue('node-display-name').trim() || node.displayName;
    node.displayNameRu = getInputValue('node-display-name-ru').trim() || node.displayNameRu;
    node.description = getTextAreaValue('node-description').trim() || undefined;
    node.descriptionRu = getTextAreaValue('node-description-ru').trim() || undefined;
    node.parameters = parseParametersText(getTextAreaValue('node-parameters'));
    validationText = `Saved node ${node.id}. Нода сохранена.`;
    saveEditorState();
    openBottom('console');
    render();
  } catch (error) {
    validationText = `Parameter JSON error / ошибка параметров: ${formatError(error)}`;
    openBottom('console');
    render();
  }
}

function linkSelectedNodeToChosenChild(): void { addLink(findSelectedNode().id, document.querySelector<HTMLSelectElement>('#link-target-select')?.value ?? ''); }
function addLink(parentId: string, childId: string): void { const parent = editorGraph.nodes.find((node) => node.id === parentId); if (!parent || !childId || parent.id === childId || !editorGraph.nodes.some((node) => node.id === childId)) { validationText = 'Cannot create link. Нельзя создать связь.'; openBottom('console'); render(); return; } if (!parent.children.includes(childId)) parent.children.push(childId); selectedNodeId = parent.id; validationText = `Linked ${parent.id} → ${childId}. Связь добавлена.`; saveEditorState(); openBottom('console'); render(); }
function unlinkChild(parentId: string, childId: string): void { const parent = editorGraph.nodes.find((node) => node.id === parentId); if (!parent) return; parent.children = parent.children.filter((id) => id !== childId); validationText = `Removed link ${parentId} → ${childId}.`; saveEditorState(); openBottom('console'); render(); }
function deleteSelectedNode(): void { deleteNode(selectedNodeId); }
function deleteNode(nodeId: string): void { if (nodeId === editorGraph.rootNodeId) { validationText = 'Root cannot be deleted. Корень удалить нельзя.'; openBottom('console'); render(); return; } editorGraph.nodes = editorGraph.nodes.filter((node) => node.id !== nodeId); for (const node of editorGraph.nodes) node.children = node.children.filter((childId) => childId !== nodeId); delete nodePositions[nodeId]; selectedNodeId = ensureSelectedNodeId(editorGraph.rootNodeId); validationText = `Deleted node ${nodeId}. Нода удалена.`; saveEditorState(); openBottom('console'); render(); }
function duplicateNode(nodeId: string): void { const source = editorGraph.nodes.find((node) => node.id === nodeId); if (!source) return; const id = makeUniqueNodeId(source.type); const sourcePosition = getNodePosition(source.id); editorGraph.nodes.push({ ...source, id, displayName: `${source.displayName} Copy`, displayNameRu: `${source.displayNameRu} копия`, children: [], parameters: { ...source.parameters } }); nodePositions[id] = { x: sourcePosition.x + 34, y: sourcePosition.y + 34 }; selectedNodeId = id; validationText = `Duplicated ${source.id} → ${id}.`; saveEditorState(); openBottom('console'); render(); }
function addChildAction(parentId: string): void { const definition = getNodeTypeDefinition('SetAction'); if (!definition) return; const parentPosition = getNodePosition(parentId); const id = makeUniqueNodeId('SetAction'); editorGraph.nodes.push({ id, type: 'SetAction', displayName: definition.label, displayNameRu: definition.labelRu, description: definition.description, descriptionRu: definition.descriptionRu, children: [], parameters: createDefaultParameters('SetAction') }); nodePositions[id] = { x: parentPosition.x + 290, y: parentPosition.y + 30 }; addLink(parentId, id); }

function exportGraphJson(): void { const blob = new Blob([`${JSON.stringify(editorGraph, null, 2)}\n`], { type: 'application/json;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${editorGraph.id || 'soldier_custom_graph'}.json`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url); validationText = 'Exported JSON. JSON экспортирован.'; openBottom('console'); render(); }
function importGraphFromFileInput(event: Event): void { const input = event.target as HTMLInputElement; const file = input.files?.[0]; input.value = ''; if (!file) return; const reader = new FileReader(); reader.addEventListener('load', () => { try { editorGraph = normalizeGraph(JSON.parse(String(reader.result ?? '{}'))); selectedNodeId = ensureSelectedNodeId(editorGraph.rootNodeId); nodePositions = {}; ensurePositionsForGraph(); saveEditorState(); validationText = `Imported ${file.name}. JSON импортирован.`; openBottom('console'); render(); } catch (error) { validationText = `Import error / ошибка импорта: ${formatError(error)}`; openBottom('console'); render(); } }); reader.readAsText(file, 'utf-8'); }
function resetGraphToBundled(): void { editorGraph = normalizeGraph(graphData as unknown); nodePositions = { ...initialNodePositions }; selectedNodeId = ensureSelectedNodeId(editorGraph.rootNodeId); uiState.zoom = 0.9; uiState.panX = 24; uiState.panY = 18; validationText = 'Reset to clean canvas. Граф сброшен к чистому canvas.'; evaluationText = 'Evaluate пока проверяет структуру графа и возвращает первое найденное действие, если оно есть.'; saveEditorState(); openBottom('console'); render(); }

async function refreshEngineStatus(): Promise<void> { try { const payload = await requestEngine<EngineHealthPayload>('/engine/health'); engineOnline = payload.ok === true; lastHealthText = engineOnline ? `engine online · ${payload.textBase ?? 'en'}/${payload.overlayLanguage ?? 'ru'} · browserAI=${String(payload.browserDoesHeavyAi)}` : 'engine error'; } catch { engineOnline = false; lastHealthText = 'engine offline'; } render(); }
async function runSimpleCheck45(): Promise<void> { validationText = 'Running auto check 4–5... / Идёт автопроверка пунктов 4–5...'; evaluationText = 'Waiting for local engine... / Жду ответ local engine...'; openBottom('console'); render(); const lines: string[] = []; try { const health = await requestEngine<EngineHealthPayload>('/engine/health'); const point4Ok = health.ok === true && health.browserDoesHeavyAi === false && health.textBase === 'en'; engineOnline = point4Ok; lastHealthText = point4Ok ? 'point 4 OK' : 'point 4 failed'; lines.push(point4Ok ? 'Point 4 OK / Пункт 4 OK — local engine connected.' : 'Point 4 ERROR / Пункт 4 ОШИБКА — unexpected engine health payload.'); } catch (error) { engineOnline = false; lastHealthText = 'engine offline'; lines.push(`Point 4 ERROR / Пункт 4 ОШИБКА — local engine does not answer: ${formatError(error)}.`); }
  try { const validation = await requestEngine<EngineValidationPayload>('/ai/graph/validate', { graph: editorGraph }); const evaluation = await requestEngine<EngineEvaluationPayload>('/ai/graph/evaluate-once', createEvaluatePayload()); const point5Ok = validation.ok === true && validation.validation?.valid === true && evaluation.ok === true && typeof evaluation.explanation === 'string' && typeof evaluation.explanationRu === 'string'; lines.push(point5Ok ? 'Point 5 OK / Пункт 5 OK — graph validated and evaluate-once returned EN+RU explanation.' : 'Point 5 ERROR / Пункт 5 ОШИБКА — validation or evaluation failed.'); evaluationText = JSON.stringify(evaluation, null, 2); } catch (error) { lines.push(`Point 5 ERROR / Пункт 5 ОШИБКА — validation/evaluate-once failed: ${formatError(error)}.`); evaluationText = `Evaluate-once error: ${formatError(error)}`; }
  validationText = lines.join('\n'); render(); }
async function validateGraphThroughEngine(): Promise<void> { try { const payload = await requestEngine<EngineValidationPayload>('/ai/graph/validate', { graph: editorGraph }); validationText = JSON.stringify(payload, null, 2); engineOnline = payload.ok === true; lastHealthText = payload.ok ? 'validation OK' : 'validation errors'; openBottom('console'); } catch (error) { engineOnline = false; validationText = `Local engine error / ошибка связи: ${formatError(error)}`; lastHealthText = 'validation impossible'; openBottom('console'); } render(); }
async function evaluateOnceThroughEngine(): Promise<void> { try { const payload = await requestEngine<EngineEvaluationPayload>('/ai/graph/evaluate-once', createEvaluatePayload()); evaluationText = JSON.stringify(payload, null, 2); validationText = 'Evaluate once finished. See inspector result card / результат справа.'; engineOnline = payload.ok === true; lastHealthText = payload.ok ? 'evaluate OK' : 'evaluate error'; } catch (error) { engineOnline = false; evaluationText = `Local engine error / ошибка связи: ${formatError(error)}`; lastHealthText = 'evaluate impossible'; } render(); }
function createEvaluatePayload(): EngineEvaluateRequest { return { graph: editorGraph, unitId: 'editor_preview_soldier', hasOrder: true, blackboard: { danger: 85, stress: 70, suppression: 35, morale: 60, health: 100, ammo: 30, hasOrder: true, enemyVisible: true, underFire: true, current_action: 'wait', best_cover_position: { x: 18.5, y: 12.5 } } }; }
async function requestEngine<TPayload>(pathname: string, body?: unknown): Promise<TPayload> { const response = await fetch(`${ENGINE_BASE_URL}${pathname}`, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); const payload = await response.json() as TPayload; if (!response.ok) throw new Error(JSON.stringify(payload)); return payload; }

function handleContextMenuAction(action: string): void { const nodeId = contextMenuState?.nodeId; contextMenuState = null; if (!nodeId) { render(); return; } if (action === 'select') return selectNode(nodeId); if (action === 'add-child') return addChildAction(nodeId); if (action === 'duplicate') return duplicateNode(nodeId); if (action === 'set-link-source') { uiState.linkSourceNodeId = nodeId; validationText = `Link source set: ${nodeId}.`; saveUiState(); openBottom('console'); render(); return; } if (action === 'link-source-to-this') { if (uiState.linkSourceNodeId) { addLink(uiState.linkSourceNodeId, nodeId); uiState.linkSourceNodeId = null; saveUiState(); } return; } if (action === 'center') return centerViewOnNode(nodeId); if (action === 'unlink-all') { const node = editorGraph.nodes.find((candidate) => candidate.id === nodeId); if (node) { node.children = []; validationText = `Removed all children from ${nodeId}.`; saveEditorState(); openBottom('console'); } render(); return; } if (action === 'delete') return deleteNode(nodeId); render(); }
function closeContextMenuIfNeeded(event: MouseEvent): void { if ((event.target as HTMLElement).closest('.node-context-menu')) return; if (contextMenuState) { contextMenuState = null; render(); } }
function togglePalette(): void { uiState.paletteOpen = !uiState.paletteOpen; saveUiState(); render(); }
function toggleInspector(): void { uiState.inspectorOpen = !uiState.inspectorOpen; saveUiState(); render(); }
function toggleBottomPanel(): void { uiState.bottomOpen = !uiState.bottomOpen; saveUiState(); render(); }
function setBottomTab(tab: BottomTab): void { uiState.bottomTab = tab; uiState.bottomOpen = true; saveUiState(); render(); }
function openBottom(tab: BottomTab): void { uiState.bottomOpen = true; uiState.bottomTab = tab; saveUiState(); }
function toggleDetailMode(): void { uiState.nodeDetailMode = uiState.nodeDetailMode === 'compact' ? 'detailed' : 'compact'; saveUiState(); render(); }
function cycleLanguageMode(): void { uiState.languageMode = uiState.languageMode === 'ru' ? 'en' : uiState.languageMode === 'en' ? 'both' : 'ru'; saveUiState(); render(); }
function applyCanvasTransform(): void { const canvas = document.querySelector<HTMLElement>('.graph-canvas'); if (canvas) canvas.style.transform = `translate(${uiState.panX}px, ${uiState.panY}px) scale(${uiState.zoom})`; }
function updateSvgPaths(): void { const svg = document.querySelector<SVGSVGElement>('.graph-svg'); if (svg) svg.innerHTML = `${renderEdgePaths()}${renderConnectionPreview()}`; }
function makeEdgePath(startX: number, startY: number, endX: number, endY: number): string { const midX = Math.round((startX + endX) / 2); return `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`; }
function screenToWorld(clientX: number, clientY: number): NodePosition { const rect = document.querySelector<HTMLElement>('#graph-workspace')?.getBoundingClientRect(); return { x: ((clientX - (rect?.left ?? 0)) - uiState.panX) / uiState.zoom, y: ((clientY - (rect?.top ?? 0)) - uiState.panY) / uiState.zoom }; }
function viewportCenterToWorld(): NodePosition { const rect = document.querySelector<HTMLElement>('#graph-workspace')?.getBoundingClientRect(); return { x: clamp(Math.round((((rect?.width ?? 900) / 2) - uiState.panX) / uiState.zoom - NODE_WIDTH / 2), 20, CANVAS_WIDTH - NODE_WIDTH - 20), y: clamp(Math.round((((rect?.height ?? 600) / 2) - uiState.panY) / uiState.zoom - NODE_HEIGHT / 2), 20, CANVAS_HEIGHT - NODE_HEIGHT - 20) }; }
function centerViewOnNode(nodeId: string): void { const rect = document.querySelector<HTMLElement>('#graph-workspace')?.getBoundingClientRect(); const position = getNodePosition(nodeId); uiState.panX = Math.round((rect?.width ?? 900) / 2 - (position.x + NODE_WIDTH / 2) * uiState.zoom); uiState.panY = Math.round((rect?.height ?? 600) / 2 - (position.y + NODE_HEIGHT / 2) * uiState.zoom); saveUiState(); render(); }
function getGraphBounds(): { minX: number; minY: number; maxX: number; maxY: number } { const positions = editorGraph.nodes.map((node) => getNodePosition(node.id)); return { minX: Math.min(...positions.map((position) => position.x)), minY: Math.min(...positions.map((position) => position.y)), maxX: Math.max(...positions.map((position) => position.x)), maxY: Math.max(...positions.map((position) => position.y)) }; }
function getNodeTitle(node: EditableAiNode): string { if (uiState.languageMode === 'en') return node.displayName; if (uiState.languageMode === 'both') return `${node.displayNameRu} · ${node.displayName}`; return node.displayNameRu || node.displayName; }
function getNodeSubtitle(node: EditableAiNode): string { if (uiState.languageMode === 'en') return `RU: ${node.displayNameRu || node.displayName}`; return `EN: ${node.displayName}`; }
function getNodeVisibleDescription(node: EditableAiNode): string { if (uiState.languageMode === 'en') return node.description || getNodeDescription(node, 'en'); if (uiState.languageMode === 'both') return `${node.descriptionRu || getNodeDescription(node, 'ru')} / ${node.description || getNodeDescription(node, 'en')}`; return node.descriptionRu || getNodeDescription(node, 'ru'); }
function isPortEvent(event: Event): boolean { return Boolean((event.target as HTMLElement).closest('.node-port')); }

function loadStoredGraph(): EditableAiGraph | null { try { const raw = localStorage.getItem(GRAPH_STORAGE_KEY); return raw ? normalizeGraph(JSON.parse(raw)) : null; } catch { return null; } }
function loadStoredPositions(): Record<string, NodePosition> { try { const raw = localStorage.getItem(POSITION_STORAGE_KEY); return raw ? normalizePositions(JSON.parse(raw)) : { ...initialNodePositions }; } catch { return { ...initialNodePositions }; } }
function loadStoredUiState(): EditorUiState { const defaults: EditorUiState = { paletteOpen: false, inspectorOpen: true, bottomOpen: false, bottomTab: 'console', zoom: 0.9, panX: 24, panY: 18, languageMode: 'ru', nodeDetailMode: 'compact', linkSourceNodeId: null }; try { const raw = localStorage.getItem(UI_STORAGE_KEY); if (!raw) return defaults; const parsed = JSON.parse(raw) as Partial<EditorUiState>; return { ...defaults, ...parsed, zoom: typeof parsed.zoom === 'number' ? clamp(parsed.zoom, 0.35, 2.2) : defaults.zoom, panX: typeof parsed.panX === 'number' ? parsed.panX : defaults.panX, panY: typeof parsed.panY === 'number' ? parsed.panY : defaults.panY }; } catch { return defaults; } }
function saveEditorState(): void { localStorage.setItem(GRAPH_STORAGE_KEY, JSON.stringify(editorGraph)); savePositions(); saveUiState(); }
function savePositions(): void { localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(nodePositions)); }
function saveUiState(): void { localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(uiState)); }

function normalizeGraph(value: unknown): EditableAiGraph { if (!isRecord(value)) throw new Error('Graph JSON must be an object.'); const nodes = (Array.isArray(value.nodes) ? value.nodes : []).map(normalizeNode); if (nodes.length === 0) throw new Error('Graph must contain at least one node.'); const rootNodeId = readString(value, 'rootNodeId', nodes[0].id); return { version: 1, id: readString(value, 'id', 'soldier_custom_graph'), name: readString(value, 'name', 'Soldier Custom Graph'), nameRu: readOptionalString(value, 'nameRu'), description: readOptionalString(value, 'description'), descriptionRu: readOptionalString(value, 'descriptionRu'), rootNodeId, blackboardDefaults: normalizeJsonObject(value.blackboardDefaults), nodes }; }
function normalizeNode(value: unknown, index: number): EditableAiNode { if (!isRecord(value)) throw new Error(`Node #${index + 1} must be an object.`); const type = readString(value, 'type', 'SetAction'); const definition = getNodeTypeDefinition(type); const id = readString(value, 'id', `${toSnakeCase(type)}_${index + 1}`); return { id, type, displayName: readString(value, 'displayName', definition?.label ?? type), displayNameRu: readString(value, 'displayNameRu', definition?.labelRu ?? type), description: readOptionalString(value, 'description') ?? definition?.description, descriptionRu: readOptionalString(value, 'descriptionRu') ?? definition?.descriptionRu, children: Array.isArray(value.children) ? value.children.filter((child): child is string => typeof child === 'string' && child.length > 0) : [], parameters: normalizeJsonObject(value.parameters) }; }
function normalizeJsonObject(value: unknown): JsonObject { if (!isRecord(value)) return {}; const result: JsonObject = {}; for (const [key, rawValue] of Object.entries(value)) if (isJsonValue(rawValue)) result[key] = rawValue; return result; }
function normalizePositions(value: unknown): Record<string, NodePosition> { if (!isRecord(value)) return { ...initialNodePositions }; const result: Record<string, NodePosition> = { ...initialNodePositions }; for (const [nodeId, position] of Object.entries(value)) if (isRecord(position) && typeof position.x === 'number' && typeof position.y === 'number') result[nodeId] = { x: position.x, y: position.y }; return result; }
function parseParametersText(text: string): JsonObject { const parsed = JSON.parse(text.trim() || '{}') as unknown; if (!isRecord(parsed)) throw new Error('parameters must be a JSON object.'); for (const [key, value] of Object.entries(parsed)) if (!isJsonValue(value)) throw new Error(`parameter ${key} has unsupported value; allowed: string, number, boolean, null, {x,y}.`); return parsed as JsonObject; }

function createDefaultParameters(type: string): JsonObject {
  const cooldown = { cooldownSeconds: 0, cooldownTiming: 'after' };
  if (type === 'BlackboardValueAbove') return { sourceKey: 'danger', comparison: 'above', threshold: 50, ...cooldown };
  if (type === 'FlagCheck') return { flagKey: 'enemyVisible', expected: true, ...cooldown };
  if (type === 'DistanceCheck') return { from: 'self', to: 'cover', comparison: 'closer', thresholdMeters: 30, ...cooldown };
  if (type === 'StableThreshold') return { sourceKey: 'danger', enterThreshold: 65, exitThreshold: 45, stateKey: 'danger_state', ...cooldown };
  if (type === 'TacticalCheck') return { checkKind: 'line_of_sight', expected: true, ...cooldown };
  if (type === 'ParameterScore') return { sourceKey: 'danger', weight: 1, direction: 'positive', ...cooldown };
  if (type === 'DistanceScore') return { targetKind: 'cover', preference: 'closer', idealMeters: 20, weight: 1, ...cooldown };
  if (type === 'DecisionInertia') return { action: 'move_to_cover', bonus: 12, minimumSeconds: 2, ...cooldown };
  if (type === 'RandomChance') return { probabilityPercent: 30, modifierKey: 'morale', ...cooldown };
  if (type === 'FindBestObject') return { objectKind: 'cover', searchRadiusMeters: 35, writeTo: 'best_object', criteria: 'safer', ...cooldown };
  if (type === 'SelectTarget') return { rule: 'most_dangerous', writeTo: 'current_target', ...cooldown };
  if (type === 'WriteMemory') return { writeTo: 'current_goal', value: 'move_to_cover', ...cooldown };
  if (type === 'CopyMemory') return { fromKey: 'visible_enemy_position', toKey: 'remembered_enemy_position', ...cooldown };
  if (type === 'ForbidAction') return { action: 'continue_order', reason: 'danger too high', durationSeconds: 3, ...cooldown };
  if (type === 'SetPosture') return { posture: 'prone', ...cooldown };
  if (type === 'SetAction') return { action: 'move_to', targetKey: 'best_cover_position', ...cooldown };
  if (type === 'SetMovementMode') return { mode: 'careful', ...cooldown };
  if (type === 'SayMessage') return { messageRu: 'Под огнём!', message: 'Under fire!', durationSeconds: 2, ...cooldown };
  if (type === 'WriteReason') return { reasonRu: 'Объяснить, почему выбрана эта ветка.', reason: 'Explain why this branch was selected.', ...cooldown };
  return { ...cooldown };
}

function ensurePositionsForGraph(): void { editorGraph.nodes.forEach((node, index) => { if (!nodePositions[node.id]) nodePositions[node.id] = initialNodePositions[node.id] ?? createFallbackPosition(index); }); }
function getNodePosition(nodeId: string): NodePosition { if (!nodePositions[nodeId]) nodePositions[nodeId] = createFallbackPosition(editorGraph.nodes.findIndex((node) => node.id === nodeId)); return nodePositions[nodeId]; }
function createFallbackPosition(index: number): NodePosition { const safeIndex = Math.max(0, index); return { x: 80 + (safeIndex % 5) * 260, y: 80 + Math.floor(safeIndex / 5) * 130 }; }
function ensureSelectedNodeId(preferredId: string): string { if (editorGraph.nodes.some((node) => node.id === preferredId)) return preferredId; return editorGraph.nodes[0]?.id ?? 'root'; }
function findSelectedNode(): EditableAiNode { return editorGraph.nodes.find((node) => node.id === selectedNodeId) ?? editorGraph.nodes[0]; }
function getNodeTypeDefinition(type: string) { return Object.values(AI_NODE_TYPE_DEFINITIONS).find((definition) => definition.type === type); }
function getNodeCategory(node: EditableAiNode): AiNodeCategory { return getNodeTypeDefinition(node.type)?.category ?? 'debug'; }
function getNodeDescription(node: EditableAiNode, language: 'ru' | 'en'): string { const definition = getNodeTypeDefinition(node.type); return language === 'ru' ? definition?.descriptionRu ?? 'Описание отсутствует.' : definition?.description ?? 'No description.'; }
function makeUniqueNodeId(type: string): string { const base = toSnakeCase(type); let index = 1; let id = `${base}_${index}`; while (editorGraph.nodes.some((node) => node.id === id)) { index += 1; id = `${base}_${index}`; } return id; }

function getInputValue(id: string): string { return document.querySelector<HTMLInputElement>(`#${id}`)?.value ?? ''; }
function getTextAreaValue(id: string): string { return document.querySelector<HTMLTextAreaElement>(`#${id}`)?.value ?? ''; }
function readString(record: Record<string, unknown>, key: string, fallback: string): string { const value = record[key]; return typeof value === 'string' && value.trim().length > 0 ? value : fallback; }
function readOptionalString(record: Record<string, unknown>, key: string): string | undefined { const value = record[key]; return typeof value === 'string' && value.trim().length > 0 ? value : undefined; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function isJsonValue(value: unknown): value is JsonValue { return value === null || ['string', 'number', 'boolean'].includes(typeof value) || (isRecord(value) && typeof value.x === 'number' && typeof value.y === 'number'); }
function toSnakeCase(value: string): string { return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'node'; }
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
function round2(value: number): number { return Math.round(value * 100) / 100; }
function shorten(value: string, maxLength: number): string { return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value; }
function formatError(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function cssEscape(value: string): string { return typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(value) : value.replace(/"/g, '\\"'); }
function escapeHtml(value: string): string { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
function escapeAttribute(value: string): string { return escapeHtml(value).replace(/\n/g, ' '); }
