import './ai-node-editor.css';
import './ai-node-editor-authoring.css';
import graphData from '../data/ai/soldier_default_survival_graph.json';
import { AI_NODE_TYPE_DEFINITIONS, type AiNodeCategory } from '../core/ai/AiNodeTypes';
import type { AiBlackboardSchemaEntry, AiBlackboardValue } from '../core/ai/AiBlackboard';
import type { AiInputBinding, AiOutputBinding, AiPortValueKind } from '../core/ai/contracts/AiPortTypes';
import { migrateAiGraphToV2 } from '../core/ai/contracts/AiGraphMigration';
import { validateAiGraph, type AiGraphValidationIssue } from '../core/ai/AiGraphValidation';
import {
  canConnectPorts, createContractDefaultParameters, describeNodeRu, explainPortConnectionRu,
  getPortKind, readContractParameters, renderContractParameters, renderNodePorts,
} from './node-contract-ui';
import { cloneSubgraphGraph, getSubgraphChoice, renderGraphBreadcrumb, renderSubgraphSelect } from './subgraph-ui';

const ENGINE_BASE_URL = 'http://127.0.0.1:8787';
const GRAPH_STORAGE_KEY = 'real-wargame.ai-node-editor.graph.v6';
const POSITION_STORAGE_KEY = 'real-wargame.ai-node-editor.positions.v6';
const UI_STORAGE_KEY = 'real-wargame.ai-node-editor.ui.v6';
const SUBGRAPH_STORAGE_KEY = 'real-wargame.ai-node-editor.subgraphs.v2';
const CANVAS_WIDTH = 2600;
const CANVAS_HEIGHT = 1700;
const NODE_WIDTH = 210;
const NODE_HEIGHT = 88;

const root = document.querySelector<HTMLElement>('#ai-node-editor-root');
if (!root) throw new Error('AI node editor root is missing.');
const editorRoot = root;


type JsonValue = AiBlackboardValue;
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
  inputBindings?: Record<string, AiInputBinding>;
  outputBindings?: Record<string, AiOutputBinding>;
  legacyMetadata?: Record<string, unknown>;
}

interface EditableAiGraph {
  version: 1 | 2;
  id: string;
  name: string;
  nameRu?: string;
  description?: string;
  descriptionRu?: string;
  rootNodeId: string;
  blackboardSchema?: AiBlackboardSchemaEntry[];
  blackboardDefaults: JsonObject;
  nodes: EditableAiNode[];
  subgraphRefs?: string[];
  legacyMetadata?: Record<string, unknown>;
}

interface NodePosition { x: number; y: number }
interface DragState { nodeId: string; offsetX: number; offsetY: number; moved: boolean }
interface PanState { startClientX: number; startClientY: number; startPanX: number; startPanY: number }
interface ConnectionState { sourceNodeId: string; sourcePortId?: string; sourceKind?: AiPortValueKind; mode: 'flow' | 'data'; currentX: number; currentY: number }
interface ContextMenuState { nodeId: string; x: number; y: number }
interface GraphNavigationEntry { graph: EditableAiGraph; positions: Record<string, NodePosition>; selectedNodeId: string; labelRu: string }
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
let validationIssues: AiGraphValidationIssue[] = [];
let graphNavigation: GraphNavigationEntry[] = [];

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

  editorRoot.innerHTML = `
    <section class="${shellClasses}">
      <header class="ai-editor-topbar compact-topbar">
        <div class="ai-editor-title compact-title"><h1>Soldier AI Node Editor <span>Редактор ИИ</span></h1></div>
        <div class="ai-editor-actions compact-actions">
          <div id="engine-status" class="engine-status compact-status ${engineOnline ? 'online' : 'offline'}"><i class="engine-status-dot" aria-hidden="true"></i><span>${escapeHtml(lastHealthText)}</span></div>
          <button id="toggle-palette" class="ai-editor-button" type="button">+ Add node</button>
          <button id="toggle-inspector" class="ai-editor-button" type="button">Inspector</button>
          <button id="validate-graph" class="ai-editor-button" type="button">Проверить граф</button>
          <button id="migrate-graph" class="ai-editor-button primary" type="button">Проверить и обновить формат графа</button>
          <button id="evaluate-once" class="ai-editor-button" type="button">Evaluate</button>
          <button id="export-graph" class="ai-editor-button" type="button">Export</button>
          <button id="import-graph" class="ai-editor-button" type="button">Import</button>
          <button id="reset-graph" class="ai-editor-button danger" type="button">Reset</button>
          <input id="import-graph-file" type="file" accept="application/json,.json" hidden />
        </div>
      </header>
      ${renderGraphVersionBanner()}
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
  const categories: AiNodeCategory[] = ['flow', 'condition', 'score', 'query', 'action', 'memory', 'subgraph', 'debug'];
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
        ${graphNavigation.length > 0 ? '<button id="back-to-parent-graph" class="graph-tool-button" type="button">← К родительскому графу</button>' : ''}
        ${renderGraphBreadcrumb(['Главный граф', ...graphNavigation.map((entry) => entry.labelRu), ...(graphNavigation.length > 0 ? [editorGraph.nameRu ?? editorGraph.name] : [])], escapeHtml)}
        <button id="zoom-out" class="graph-tool-button" type="button">−</button>
        <button id="zoom-reset" class="graph-tool-button" type="button">${Math.round(uiState.zoom * 100)}%</button>
        <button id="zoom-in" class="graph-tool-button" type="button">+</button>
        <button id="fit-graph" class="graph-tool-button" type="button">Fit</button>
        <button id="detail-toggle" class="graph-tool-button" type="button">${uiState.nodeDetailMode === 'compact' ? 'Compact' : 'Detailed'}</button>
        <button id="language-toggle-editor" class="graph-tool-button" type="button">${uiState.languageMode.toUpperCase()}</button>
        <span class="graph-help">Колесо — масштаб · пустое поле — перемещение · круглый порт — поток · подписанный порт — типизированные данные</span>
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
        <p class="node-secondary">${escapeHtml(describeNodeRu(node))}</p>
        ${detailHtml}
        ${renderNodePorts(node, escapeHtml)}
        ${node.type === 'Subgraph' ? '<p class="subgraph-open-hint">Двойной клик — открыть подграф</p>' : ''}
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
      paths.push(`<path class="edge-path flow-edge" d="${makeEdgePath(from.x + NODE_WIDTH, from.y + NODE_HEIGHT / 2, to.x, to.y + NODE_HEIGHT / 2)}" />`);
    }
    paths.push(...renderDataBindingPaths(node));
  }
  return paths.join('');
}

function renderDataBindingPaths(targetNode: EditableAiNode): string[] {
  const to = getNodePosition(targetNode.id);
  return Object.entries(targetNode.inputBindings ?? {}).flatMap(([targetPortId, binding], index) => {
    if (binding.source !== 'node') return [];
    const sourceNode = editorGraph.nodes.find((candidate) => candidate.id === binding.nodeId);
    if (!sourceNode) return [];
    const outputKind = getPortKind(sourceNode.type, 'output', binding.port, sourceNode.parameters);
    const inputKind = getPortKind(targetNode.type, 'input', targetPortId, targetNode.parameters);
    const from = getNodePosition(sourceNode.id);
    const offset = 58 + index * 10;
    return [`<path class="edge-path data-edge ${escapeHtml(outputKind ?? inputKind ?? 'unknown')}" data-edge-source="${escapeHtml(sourceNode.id)}" data-edge-target="${escapeHtml(targetNode.id)}" d="${makeEdgePath(from.x + NODE_WIDTH, from.y + offset, to.x, to.y + offset)}" />`];
  });
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
      <section class="contract-parameter-panel"><h4>Параметры по контракту</h4>${node.type === 'Subgraph' ? renderSubgraphSelect(String(node.parameters.subgraphId ?? 'take_cover'), escapeHtml) : ''}${renderContractParameters(node, escapeHtml)}</section>
      <details><summary>Технический JSON (для диагностики)</summary><label class="inspector-field">parameters<textarea id="node-parameters" rows="6">${escapeHtml(JSON.stringify(node.parameters, null, 2))}</textarea></label></details>
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
  return `<footer class="ai-editor-bottom expanded-bottom"><div class="bottom-tabs"><button id="bottom-tab-console" class="bottom-tab ${consoleActive}" type="button">Console</button><button id="bottom-tab-json" class="bottom-tab ${jsonActive}" type="button">Graph JSON</button><button id="toggle-bottom" class="bottom-tab" type="button">▼ Hide</button></div><section class="bottom-box ${uiState.bottomTab === 'console' ? '' : 'hidden'}"><h2>Ошибки и предупреждения графа</h2>${renderValidationIssues()}<pre>${escapeHtml(validationText)}</pre></section><section class="bottom-box ${uiState.bottomTab === 'json' ? '' : 'hidden'}"><h2>Graph JSON preview</h2><pre>${escapeHtml(JSON.stringify(editorGraph, null, 2))}</pre></section></footer>`;
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
  document.querySelector<HTMLButtonElement>('#validate-graph')?.addEventListener('click', validateGraphLocally);
  document.querySelector<HTMLButtonElement>('#migrate-graph')?.addEventListener('click', migrateCurrentGraph);
  document.querySelector<HTMLButtonElement>('#migrate-graph-banner')?.addEventListener('click', migrateCurrentGraph);
  document.querySelector<HTMLButtonElement>('#back-to-parent-graph')?.addEventListener('click', closeCurrentSubgraph);
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
    element.addEventListener('dblclick', () => { if (element.dataset.nodeId) openSubgraphNode(element.dataset.nodeId); });
    element.addEventListener('contextmenu', (event) => { event.preventDefault(); if (element.dataset.nodeId) { selectedNodeId = element.dataset.nodeId; contextMenuState = { nodeId: element.dataset.nodeId, x: event.clientX, y: event.clientY }; render(); } });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-port-kind="out"]').forEach((button) => button.addEventListener('pointerdown', (event) => { if (button.dataset.nodeId) startConnectionDrag(event, button.dataset.nodeId, 'flow'); }));
  document.querySelectorAll<HTMLButtonElement>('[data-typed-port-kind="output"]').forEach((button) => {
    const beginTypedConnection = (event: PointerEvent | MouseEvent): void => {
      if (connectionState || event.button !== 0) return;
      if (button.dataset.nodeId && button.dataset.portId && button.dataset.valueKind) {
        startConnectionDrag(event, button.dataset.nodeId, 'data', button.dataset.portId, button.dataset.valueKind as AiPortValueKind);
      }
    };
    button.addEventListener('pointerdown', beginTypedConnection);
    button.addEventListener('mousedown', beginTypedConnection);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-validation-node-id]').forEach((button) => button.addEventListener('click', () => { if (button.dataset.validationNodeId) selectNode(button.dataset.validationNodeId); }));
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

function startConnectionDrag(event: PointerEvent | MouseEvent, sourceNodeId: string, mode: 'flow' | 'data', sourcePortId?: string, sourceKind?: AiPortValueKind): void {
  event.preventDefault();
  event.stopPropagation();
  const world = screenToWorld(event.clientX, event.clientY);
  connectionState = { sourceNodeId, sourcePortId, sourceKind, mode, currentX: world.x, currentY: world.y };
  updateTypedPortHighlights();
  window.addEventListener('pointermove', onConnectionMove);
  window.addEventListener('pointerup', onConnectionEnd, { once: true });
}

function onConnectionMove(event: PointerEvent): void { if (connectionState) { const world = screenToWorld(event.clientX, event.clientY); connectionState.currentX = world.x; connectionState.currentY = world.y; updateSvgPaths(); } }
function onConnectionEnd(event: PointerEvent): void {
  window.removeEventListener('pointermove', onConnectionMove);
  const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
  const state = connectionState;
  connectionState = null;
  clearTypedPortHighlights();
  if (!state) return render();
  if (state.mode === 'flow') {
    const targetNodeId = target?.closest<HTMLElement>('.graph-node')?.dataset.nodeId;
    if (targetNodeId) addLink(state.sourceNodeId, targetNodeId); else render();
    return;
  }
  const input = target?.closest<HTMLButtonElement>('[data-typed-port-kind="input"]');
  const targetNodeId = input?.dataset.nodeId;
  const targetPortId = input?.dataset.portId;
  const inputKind = input?.dataset.valueKind as AiPortValueKind | undefined;
  if (!targetNodeId || !targetPortId || !state.sourcePortId || !state.sourceKind || !inputKind) return render();
  if (!canConnectPorts(state.sourceKind, inputKind)) {
    validationText = explainPortConnectionRu(state.sourceKind, inputKind);
    uiState.bottomOpen = true; uiState.bottomTab = 'console'; render(); return;
  }
  const targetNode = editorGraph.nodes.find((node) => node.id === targetNodeId);
  if (!targetNode) return render();
  targetNode.inputBindings = { ...(targetNode.inputBindings ?? {}), [targetPortId]: { source: 'node', nodeId: state.sourceNodeId, port: state.sourcePortId } };
  validationText = `Соединено: ${state.sourceKind} → ${inputKind}.`;
  saveGraph(); render();
}

function startPanIfEmpty(event: PointerEvent): void { if (event.button !== 0 && event.button !== 1) return; const target = event.target as HTMLElement; if (target.closest('.graph-node') || target.closest('button') || target.closest('.graph-toolbar')) return; event.preventDefault(); panState = { startClientX: event.clientX, startClientY: event.clientY, startPanX: uiState.panX, startPanY: uiState.panY }; window.addEventListener('pointermove', onPanMove); window.addEventListener('pointerup', onPanEnd, { once: true }); }
function onPanMove(event: PointerEvent): void { if (!panState) return; uiState.panX = panState.startPanX + event.clientX - panState.startClientX; uiState.panY = panState.startPanY + event.clientY - panState.startClientY; applyCanvasTransform(); }
function onPanEnd(): void { window.removeEventListener('pointermove', onPanMove); panState = null; saveUiState(); }
function onWorkspaceWheel(event: WheelEvent): void { event.preventDefault(); zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.1 : 0.9); }
function zoomBy(factor: number): void { const rect = document.querySelector<HTMLElement>('#graph-workspace')?.getBoundingClientRect(); zoomAt((rect?.left ?? 0) + (rect?.width ?? 800) / 2, (rect?.top ?? 0) + (rect?.height ?? 600) / 2, factor); }
function zoomAt(clientX: number, clientY: number, factor: number): void { const before = screenToWorld(clientX, clientY); uiState.zoom = clamp(round2(uiState.zoom * factor), 0.35, 2.2); const rect = document.querySelector<HTMLElement>('#graph-workspace')?.getBoundingClientRect(); if (rect) { uiState.panX = clientX - rect.left - before.x * uiState.zoom; uiState.panY = clientY - rect.top - before.y * uiState.zoom; } saveUiState(); render(); }
function resetZoom(): void { uiState.zoom = 1; uiState.panX = 0; uiState.panY = 0; saveUiState(); render(); }
function fitGraphToView(): void { const rect = document.querySelector<HTMLElement>('#graph-workspace')?.getBoundingClientRect(); if (!rect || editorGraph.nodes.length === 0) return; const bounds = getGraphBounds(); const width = Math.max(1, bounds.maxX - bounds.minX + NODE_WIDTH); const height = Math.max(1, bounds.maxY - bounds.minY + NODE_HEIGHT); uiState.zoom = clamp(round2(Math.min((rect.width - 80) / width, (rect.height - 80) / height)), 0.35, 1.25); uiState.panX = Math.round((rect.width - width * uiState.zoom) / 2 - bounds.minX * uiState.zoom); uiState.panY = Math.round((rect.height - height * uiState.zoom) / 2 - bounds.minY * uiState.zoom); saveUiState(); render(); }
function toggleDetailMode(): void { uiState.nodeDetailMode = uiState.nodeDetailMode === 'compact' ? 'detailed' : 'compact'; saveUiState(); render(); }
function cycleLanguageMode(): void { uiState.languageMode = uiState.languageMode === 'ru' ? 'en' : uiState.languageMode === 'en' ? 'both' : 'ru'; saveUiState(); render(); }
function applyCanvasTransform(): void { const canvas = document.querySelector<HTMLElement>('.graph-canvas'); if (canvas) canvas.style.transform = `translate(${uiState.panX}px, ${uiState.panY}px) scale(${uiState.zoom})`; }

function screenToWorld(clientX: number, clientY: number): NodePosition { const rect = document.querySelector<HTMLElement>('#graph-workspace')?.getBoundingClientRect(); return { x: (clientX - (rect?.left ?? 0) - uiState.panX) / uiState.zoom, y: (clientY - (rect?.top ?? 0) - uiState.panY) / uiState.zoom }; }
function getGraphBounds(): { minX: number; minY: number; maxX: number; maxY: number } { const positions = editorGraph.nodes.map((node) => getNodePosition(node.id)); return { minX: Math.min(...positions.map((p) => p.x)), minY: Math.min(...positions.map((p) => p.y)), maxX: Math.max(...positions.map((p) => p.x)), maxY: Math.max(...positions.map((p) => p.y)) }; }

function updateSvgPaths(): void { const svg = document.querySelector<SVGElement>('.graph-svg'); if (svg) svg.innerHTML = `${renderEdgePaths()}${renderConnectionPreview()}`; }
function makeEdgePath(x1: number, y1: number, x2: number, y2: number): string { const delta = Math.max(80, Math.abs(x2 - x1) * 0.5); return `M ${x1} ${y1} C ${x1 + delta} ${y1}, ${x2 - delta} ${y2}, ${x2} ${y2}`; }

function addNodeFromPalette(type: string): void {
  const definition = AI_NODE_TYPE_DEFINITIONS[type as keyof typeof AI_NODE_TYPE_DEFINITIONS];
  if (!definition) return;
  const id = makeUniqueNodeId(type);
  const selectedPosition = getNodePosition(selectedNodeId);
  editorGraph.nodes.push({ id, type, displayName: definition.label, displayNameRu: definition.labelRu, description: definition.description, descriptionRu: definition.descriptionRu, children: [], parameters: createDefaultParameters(type) });
  nodePositions[id] = { x: selectedPosition.x + 270, y: selectedPosition.y + Math.max(0, editorGraph.nodes.length % 5) * 118 };
  selectedNodeId = id;
  uiState.inspectorOpen = true;
  saveGraph(); savePositions(); render();
}

function createDefaultParameters(type: string): JsonObject { return createContractDefaultParameters(type); }

function makeUniqueNodeId(type: string): string { const base = type.replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase(); let index = 1; let id = `${base}_${index}`; const used = new Set(editorGraph.nodes.map((node) => node.id)); while (used.has(id)) { index += 1; id = `${base}_${index}`; } return id; }
function addLink(parentId: string, childId: string): void { if (parentId === childId) { render(); return; } const parent = editorGraph.nodes.find((node) => node.id === parentId); if (!parent) return; if (!parent.children.includes(childId)) parent.children.push(childId); selectedNodeId = childId; uiState.inspectorOpen = true; saveGraph(); render(); }
function unlinkChild(parentId: string, childId: string): void { const parent = editorGraph.nodes.find((node) => node.id === parentId); if (!parent) return; parent.children = parent.children.filter((id) => id !== childId); saveGraph(); render(); }
function linkSelectedNodeToChosenChild(): void { const targetId = document.querySelector<HTMLSelectElement>('#link-target-select')?.value; if (targetId) addLink(selectedNodeId, targetId); }

function handleContextMenuAction(action: string): void {
  const node = findSelectedNode();
  contextMenuState = null;
  switch (action) {
    case 'select': selectNode(node.id); return;
    case 'add-child': { const id = makeUniqueNodeId('SetAction'); const position = getNodePosition(node.id); const definition = AI_NODE_TYPE_DEFINITIONS.SetAction; editorGraph.nodes.push({ id, type: 'SetAction', displayName: definition.label, displayNameRu: definition.labelRu, description: definition.description, descriptionRu: definition.descriptionRu, children: [], parameters: createDefaultParameters('SetAction') }); node.children.push(id); nodePositions[id] = { x: position.x + 270, y: position.y + 40 }; selectedNodeId = id; break; }
    case 'duplicate': duplicateSelectedNode(); return;
    case 'set-link-source': uiState.linkSourceNodeId = node.id; saveUiState(); break;
    case 'link-source-to-this': if (uiState.linkSourceNodeId) addLink(uiState.linkSourceNodeId, node.id); uiState.linkSourceNodeId = null; break;
    case 'center': centerNode(node.id); return;
    case 'unlink-all': node.children = []; break;
    case 'delete': deleteSelectedNode(); return;
  }
  saveGraph(); savePositions(); render();
}

function duplicateSelectedNode(): void { const node = findSelectedNode(); const id = makeUniqueNodeId(node.type); const position = getNodePosition(node.id); editorGraph.nodes.push({ ...node, id, children: [...node.children], parameters: { ...node.parameters }, displayName: `${node.displayName} Copy`, displayNameRu: `${node.displayNameRu} копия` }); nodePositions[id] = { x: position.x + 240, y: position.y + 36 }; selectedNodeId = id; saveGraph(); savePositions(); render(); }
function centerNode(nodeId: string): void { const position = getNodePosition(nodeId); const rect = document.querySelector<HTMLElement>('#graph-workspace')?.getBoundingClientRect(); if (rect) { uiState.panX = Math.round(rect.width / 2 - (position.x + NODE_WIDTH / 2) * uiState.zoom); uiState.panY = Math.round(rect.height / 2 - (position.y + NODE_HEIGHT / 2) * uiState.zoom); saveUiState(); } render(); }

function saveSelectedNodeFromInspector(): void {
  const node = findSelectedNode();
  const nextDisplay = document.querySelector<HTMLInputElement>('#node-display-name')?.value.trim();
  const nextDisplayRu = document.querySelector<HTMLInputElement>('#node-display-name-ru')?.value.trim();
  const nextDescription = document.querySelector<HTMLTextAreaElement>('#node-description')?.value;
  const nextDescriptionRu = document.querySelector<HTMLTextAreaElement>('#node-description-ru')?.value;
  const paramsRaw = document.querySelector<HTMLTextAreaElement>('#node-parameters')?.value ?? '{}';
  try {
    const parsed = JSON.parse(paramsRaw);
    if (!isRecord(parsed)) throw new Error('parameters must be an object');
    node.displayName = nextDisplay || node.displayName;
    node.displayNameRu = nextDisplayRu || node.displayNameRu;
    node.description = nextDescription;
    node.descriptionRu = nextDescriptionRu;
    node.parameters = { ...(parsed as JsonObject), ...readContractParameters(document, node) };
    if (node.type === 'Subgraph') node.parameters.subgraphId = document.querySelector<HTMLSelectElement>('#subgraph-choice')?.value ?? node.parameters.subgraphId ?? 'take_cover';
    saveGraph(); validationText = `Node saved: ${node.id}`; render();
  } catch (error) {
    validationText = `Parameters JSON error: ${error instanceof Error ? error.message : String(error)}`;
    uiState.bottomOpen = true; uiState.bottomTab = 'console'; render();
  }
}

function deleteSelectedNode(): void { if (selectedNodeId === editorGraph.rootNodeId) return; const deleting = selectedNodeId; editorGraph.nodes = editorGraph.nodes.filter((node) => node.id !== deleting); for (const node of editorGraph.nodes) node.children = node.children.filter((child) => child !== deleting); delete nodePositions[deleting]; selectedNodeId = ensureSelectedNodeId(editorGraph.rootNodeId); saveGraph(); savePositions(); render(); }
function resetGraphToBundled(): void { editorGraph = normalizeGraph(graphData as unknown); nodePositions = { ...initialNodePositions }; selectedNodeId = editorGraph.rootNodeId; saveGraph(); savePositions(); validationText = 'Canvas очищен: только Старт.'; render(); }
function exportGraphJson(): void { const blob = new Blob([JSON.stringify(editorGraph, null, 2)], { type: 'application/json;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${editorGraph.id || 'ai-graph'}.json`; link.click(); URL.revokeObjectURL(url); }
function importGraphFromFileInput(event: Event): void { const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { editorGraph = normalizeGraph(JSON.parse(String(reader.result))); ensurePositionsForGraph(); selectedNodeId = ensureSelectedNodeId(editorGraph.rootNodeId); saveGraph(); savePositions(); validationText = `Imported ${file.name}`; render(); } catch (error) { validationText = `Import error: ${error instanceof Error ? error.message : String(error)}`; render(); } }; reader.readAsText(file, 'utf-8'); }

async function refreshEngineStatus(): Promise<void> { try { const health = await fetchJson<EngineHealthPayload>(`${ENGINE_BASE_URL}/engine/health`); engineOnline = Boolean(health.ok); lastHealthText = engineOnline ? `engine online · text=${health.textBase ?? 'en'} · overlay=${health.overlayLanguage ?? 'ru'}` : 'engine responded with error'; } catch { engineOnline = false; lastHealthText = 'engine offline: run Run-AI-Node-Editor.bat'; } render(); }
async function validateGraphThroughEngine(): Promise<void> { try { const payload = await fetchJson<EngineValidationPayload>(`${ENGINE_BASE_URL}/ai/graph/validate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editorGraph) }); validationText = JSON.stringify(payload, null, 2); } catch (error) { validationText = `Validate failed: ${error instanceof Error ? error.message : String(error)}`; } uiState.bottomOpen = true; uiState.bottomTab = 'console'; render(); }
async function evaluateOnceThroughEngine(): Promise<void> { const request: EngineEvaluateRequest = { graph: editorGraph, unitId: 'soldier_editor_preview', blackboard: editorGraph.blackboardDefaults, hasOrder: false }; try { const payload = await fetchJson<EngineEvaluationPayload>(`${ENGINE_BASE_URL}/ai/graph/evaluate-once`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) }); evaluationText = JSON.stringify(payload, null, 2); } catch (error) { evaluationText = `Evaluate failed: ${error instanceof Error ? error.message : String(error)}`; } render(); }
async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, init); if (!response.ok) throw new Error(`${response.status} ${response.statusText}`); return await response.json() as T; }

function togglePalette(): void { uiState.paletteOpen = !uiState.paletteOpen; saveUiState(); render(); }
function toggleInspector(): void { uiState.inspectorOpen = !uiState.inspectorOpen; saveUiState(); render(); }
function toggleBottomPanel(): void { uiState.bottomOpen = !uiState.bottomOpen; saveUiState(); render(); }
function setBottomTab(tab: BottomTab): void { uiState.bottomTab = tab; uiState.bottomOpen = true; saveUiState(); render(); }
function closeContextMenuIfNeeded(event: MouseEvent): void { if (!(event.target as HTMLElement).closest('.node-context-menu')) { contextMenuState = null; render(); } }

function findSelectedNode(): EditableAiNode { return editorGraph.nodes.find((node) => node.id === selectedNodeId) ?? editorGraph.nodes[0]; }
function ensureSelectedNodeId(preferred: string): string { return editorGraph.nodes.some((node) => node.id === preferred) ? preferred : editorGraph.nodes[0]?.id ?? 'root'; }
function getNodePosition(nodeId: string): NodePosition { return nodePositions[nodeId] ?? initialNodePositions[nodeId] ?? { x: 140, y: 140 }; }
function getNodeCategory(node: EditableAiNode): AiNodeCategory { return AI_NODE_TYPE_DEFINITIONS[node.type as keyof typeof AI_NODE_TYPE_DEFINITIONS]?.category ?? 'debug'; }
function getNodeTitle(node: EditableAiNode): string { if (uiState.languageMode === 'en') return node.displayName; if (uiState.languageMode === 'both') return `${node.displayNameRu} / ${node.displayName}`; return node.displayNameRu || node.displayName; }
function getNodeSubtitle(node: EditableAiNode): string { const definition = AI_NODE_TYPE_DEFINITIONS[node.type as keyof typeof AI_NODE_TYPE_DEFINITIONS]; return uiState.languageMode === 'en' ? definition?.description ?? node.type : definition?.descriptionRu ?? node.type; }
function getNodeVisibleDescription(node: EditableAiNode): string { if (uiState.languageMode === 'en') return node.description ?? ''; if (uiState.languageMode === 'both') return `${node.descriptionRu ?? ''}\n${node.description ?? ''}`.trim(); return node.descriptionRu ?? node.description ?? ''; }
function isPortEvent(event: PointerEvent): boolean { return Boolean((event.target as HTMLElement).closest('.node-port')); }

function loadStoredGraph(): EditableAiGraph | null { try { const raw = localStorage.getItem(GRAPH_STORAGE_KEY); return raw ? normalizeGraph(JSON.parse(raw)) : null; } catch { return null; } }
function loadStoredPositions(): Record<string, NodePosition> { try { const raw = localStorage.getItem(POSITION_STORAGE_KEY); const parsed = raw ? JSON.parse(raw) : {}; return isRecord(parsed) ? parsed as Record<string, NodePosition> : { ...initialNodePositions }; } catch { return { ...initialNodePositions }; } }
function loadStoredUiState(): EditorUiState { try { const parsed = JSON.parse(localStorage.getItem(UI_STORAGE_KEY) ?? '{}'); return { paletteOpen: parsed.paletteOpen ?? false, inspectorOpen: parsed.inspectorOpen ?? true, bottomOpen: parsed.bottomOpen ?? false, bottomTab: parsed.bottomTab === 'json' ? 'json' : 'console', zoom: typeof parsed.zoom === 'number' ? parsed.zoom : 1, panX: typeof parsed.panX === 'number' ? parsed.panX : 0, panY: typeof parsed.panY === 'number' ? parsed.panY : 0, languageMode: parsed.languageMode === 'en' || parsed.languageMode === 'both' ? parsed.languageMode : 'ru', nodeDetailMode: parsed.nodeDetailMode === 'detailed' ? 'detailed' : 'compact', linkSourceNodeId: typeof parsed.linkSourceNodeId === 'string' ? parsed.linkSourceNodeId : null }; } catch { return { paletteOpen: false, inspectorOpen: true, bottomOpen: false, bottomTab: 'console', zoom: 1, panX: 0, panY: 0, languageMode: 'ru', nodeDetailMode: 'compact', linkSourceNodeId: null }; } }
function saveGraph(): void {
  if (graphNavigation.length > 0) saveStoredSubgraph(editorGraph.id, editorGraph);
  else localStorage.setItem(GRAPH_STORAGE_KEY, JSON.stringify(editorGraph));
}
function savePositions(): void { localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(nodePositions)); }
function saveUiState(): void { localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(uiState)); }
function ensurePositionsForGraph(): void { for (const node of editorGraph.nodes) if (!nodePositions[node.id]) nodePositions[node.id] = initialNodePositions[node.id] ?? { x: 140 + editorGraph.nodes.indexOf(node) * 240, y: 140 }; }

function normalizeGraph(value: unknown): EditableAiGraph { const raw = value as Partial<EditableAiGraph>; const nodes = Array.isArray(raw.nodes) ? raw.nodes.map(normalizeNode) : []; if (nodes.length === 0) nodes.push({ id: 'root', type: 'Root', displayName: 'Start', displayNameRu: 'Старт', description: '', descriptionRu: '', children: [], parameters: {} }); return { version: raw.version === 2 ? 2 : 1, id: String(raw.id ?? 'soldier_graph'), name: String(raw.name ?? 'Soldier Graph'), nameRu: typeof raw.nameRu === 'string' ? raw.nameRu : 'Граф солдата', description: typeof raw.description === 'string' ? raw.description : '', descriptionRu: typeof raw.descriptionRu === 'string' ? raw.descriptionRu : '', rootNodeId: String(raw.rootNodeId ?? nodes[0].id), blackboardSchema: Array.isArray(raw.blackboardSchema) ? JSON.parse(JSON.stringify(raw.blackboardSchema)) as AiBlackboardSchemaEntry[] : undefined, blackboardDefaults: isRecord(raw.blackboardDefaults) ? raw.blackboardDefaults as JsonObject : {}, nodes, subgraphRefs: Array.isArray(raw.subgraphRefs) ? raw.subgraphRefs.filter((item): item is string => typeof item === 'string') : undefined, legacyMetadata: isRecord(raw.legacyMetadata) ? raw.legacyMetadata : undefined }; }
function normalizeNode(value: unknown): EditableAiNode { const raw = value as Partial<EditableAiNode>; const definition = AI_NODE_TYPE_DEFINITIONS[String(raw.type ?? 'Root') as keyof typeof AI_NODE_TYPE_DEFINITIONS]; return { id: String(raw.id ?? makeUniqueNodeId(String(raw.type ?? 'Root'))), type: String(raw.type ?? 'Root'), displayName: String(raw.displayName ?? definition?.label ?? raw.type ?? 'Node'), displayNameRu: String(raw.displayNameRu ?? definition?.labelRu ?? raw.type ?? 'Нода'), description: typeof raw.description === 'string' ? raw.description : definition?.description ?? '', descriptionRu: typeof raw.descriptionRu === 'string' ? raw.descriptionRu : definition?.descriptionRu ?? '', children: Array.isArray(raw.children) ? raw.children.filter((child): child is string => typeof child === 'string') : [], parameters: isRecord(raw.parameters) ? raw.parameters as JsonObject : createDefaultParameters(String(raw.type ?? 'Root')), inputBindings: isRecord(raw.inputBindings) ? raw.inputBindings as Record<string, AiInputBinding> : undefined, outputBindings: isRecord(raw.outputBindings) ? raw.outputBindings as Record<string, AiOutputBinding> : undefined, legacyMetadata: isRecord(raw.legacyMetadata) ? raw.legacyMetadata : undefined }; }

function renderGraphVersionBanner(): string {
  return editorGraph.version === 1
    ? '<aside class="graph-version-warning"><strong>Этот граф использует старый формат Graph v1.</strong><span>Он продолжит работать, но типизированные порты доступны после безопасной миграции.</span><button id="migrate-graph-banner" type="button">Проверить и обновить формат графа</button></aside>'
    : '<aside class="graph-version-ok"><strong>Graph v2</strong><span>Типы портов и параметры проверяются автоматически.</span></aside>';
}

function renderValidationIssues(): string {
  if (validationIssues.length === 0) return '<p class="validation-empty">Ошибок пока нет. Нажмите «Проверить граф».</p>';
  return `<div class="graph-validation-list">${validationIssues.map((issue) => `<button class="validation-issue ${issue.severity}" type="button" ${issue.nodeId ? `data-validation-node-id="${escapeHtml(issue.nodeId)}"` : 'disabled'}><b>${issue.severity.toUpperCase()} · ${escapeHtml(issue.code)}</b><span>${escapeHtml(issue.messageRu)}</span>${issue.fixRu ? `<em>${escapeHtml(issue.fixRu)}</em>` : ''}</button>`).join('')}</div>`;
}

function validateGraphLocally(): void {
  const result = validateAiGraph(editorGraph);
  validationIssues = [...result.issues];
  validationText = result.valid ? `Граф прошёл проверку. Сообщений: ${result.issues.length}.` : `Граф невалиден. Ошибок: ${result.issues.filter((issue) => issue.severity === 'error').length}.`;
  uiState.bottomOpen = true; uiState.bottomTab = 'console'; render();
}

function migrateCurrentGraph(): void {
  const migration = migrateAiGraphToV2(editorGraph);
  if (!migration.ok) {
    validationIssues = migration.issues.map((issue) => ({ ...issue, fix: undefined, parameterName: issue.parameterName })) as AiGraphValidationIssue[];
    validationText = migration.issues.map((issue) => issue.messageRu).join('\n');
    uiState.bottomOpen = true; uiState.bottomTab = 'console'; render(); return;
  }
  const validation = validateAiGraph(migration.graph);
  validationIssues = [...validation.issues];
  if (!validation.valid) {
    validationText = 'Миграция подготовлена, но Graph v2 не сохранён из-за ошибок проверки.';
    uiState.bottomOpen = true; uiState.bottomTab = 'console'; render(); return;
  }
  editorGraph = normalizeGraph(migration.graph);
  validationText = migration.migrated ? 'Graph v1 безопасно обновлён до Graph v2. Неизвестные старые поля сохранены в legacyMetadata.' : 'Graph v2 уже актуален.';
  saveGraph(); render();
}

function openSubgraphNode(nodeId: string): void {
  const node = editorGraph.nodes.find((candidate) => candidate.id === nodeId);
  if (node?.type !== 'Subgraph') return;
  const subgraphId = String(node.parameters.subgraphId ?? '');
  const stored = loadStoredSubgraphs()[subgraphId];
  const registered = cloneSubgraphGraph(subgraphId);
  const graph = stored ? normalizeGraph(stored) : registered ? normalizeGraph(registered) : undefined;
  if (!graph) { validationText = `Подграф ${subgraphId} не найден.`; render(); return; }
  graphNavigation.push({ graph: editorGraph, positions: { ...nodePositions }, selectedNodeId, labelRu: getSubgraphChoice(subgraphId)?.nameRu ?? subgraphId });
  editorGraph = graph; nodePositions = {}; selectedNodeId = graph.rootNodeId; ensurePositionsForGraph(); saveUiState(); render();
}

function closeCurrentSubgraph(): void {
  const parent = graphNavigation.pop();
  if (!parent) return;
  saveStoredSubgraph(editorGraph.id, editorGraph);
  editorGraph = parent.graph; nodePositions = parent.positions; selectedNodeId = parent.selectedNodeId; render();
}

function loadStoredSubgraphs(): Record<string, EditableAiGraph> {
  try { const value = JSON.parse(localStorage.getItem(SUBGRAPH_STORAGE_KEY) ?? '{}'); return isRecord(value) ? value as Record<string, EditableAiGraph> : {}; } catch { return {}; }
}
function saveStoredSubgraph(id: string, graph: EditableAiGraph): void { const all = loadStoredSubgraphs(); all[id] = graph; localStorage.setItem(SUBGRAPH_STORAGE_KEY, JSON.stringify(all)); }

function updateTypedPortHighlights(): void {
  if (connectionState?.mode !== 'data' || !connectionState.sourceKind) return;
  document.querySelectorAll<HTMLElement>('[data-typed-port-kind="input"]').forEach((port) => {
    const kind = port.dataset.valueKind as AiPortValueKind | undefined;
    port.classList.toggle('compatible', Boolean(kind && canConnectPorts(connectionState!.sourceKind!, kind)));
    port.classList.toggle('incompatible', Boolean(kind && !canConnectPorts(connectionState!.sourceKind!, kind)));
  });
}
function clearTypedPortHighlights(): void { document.querySelectorAll<HTMLElement>('.typed-port.compatible, .typed-port.incompatible').forEach((port) => port.classList.remove('compatible', 'incompatible')); }

function escapeHtml(value: string): string { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;'); }
function escapeAttribute(value: string): string { return escapeHtml(value); }
function cssEscape(value: string): string { return value.replace(/(["\\])/g, '\\$1'); }
function shorten(value: string, max: number): string { return value.length > max ? `${value.slice(0, max)}…` : value; }
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
function round2(value: number): number { return Math.round(value * 100) / 100; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
