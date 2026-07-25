import './ai-node-editor.css';
import './ai-node-editor-authoring.css';
import './ai-node-editor-ux.css';
import graphData from '../data/ai/soldier_default_survival_graph.json';
import { AI_NODE_TYPE_DEFINITIONS, type AiNodeCategory } from '../core/ai/AiNodeTypes';
import { createContractDefaultParameters } from '../core/ai/contracts/AiNodeContractRegistry';
import { migrateAiGraphToV2 } from '../core/ai/contracts/AiGraphMigration';
import { validateAiGraph, type AiGraphValidationIssue } from '../core/ai/AiGraphValidation';
import type { AiInputBinding, AiOutputBinding } from '../core/ai/contracts/AiPortTypes';
import {
  canConnectPorts,
  explainPortIncompatibilityRu,
  getNodeContractUiModel,
  readContractParameterFields,
  renderContractParameterFields,
} from './node-contract-ui';
import { getSubgraphChoice, getSubgraphGraph, listSubgraphChoices } from './subgraph-ui';
import {
  getCategoryLabel,
  getEditorText,
  loadFavoriteNodeTypes,
  saveFavoriteNodeTypes,
  type EditorLanguageMode,
} from './editor-ui-preferences';

const ENGINE_BASE_URL = 'http://127.0.0.1:8787';
const GRAPH_STORAGE_KEY = 'real-wargame.ai-node-editor.graph.v6';
const POSITION_STORAGE_KEY = 'real-wargame.ai-node-editor.positions.v6';
const UI_STORAGE_KEY = 'real-wargame.ai-node-editor.ui.v6';
const CANVAS_WIDTH = 2600;
const CANVAS_HEIGHT = 1700;
const NODE_WIDTH = 210;
const NODE_HEIGHT = 88;
const CATEGORIES: readonly AiNodeCategory[] = ['flow', 'condition', 'score', 'query', 'action', 'memory', 'subgraph', 'debug'];

const root = document.querySelector<HTMLElement>('#ai-node-editor-root');
if (!root) throw new Error('AI node editor root is missing.');
const editorRoot = root;

type JsonPrimitive = string | number | boolean | null;
type JsonPosition = { x: number; y: number };
type JsonValue = JsonPrimitive | JsonPosition;
type JsonObject = Record<string, JsonValue>;
type BottomTab = 'console' | 'json';
type LanguageMode = EditorLanguageMode;
type NodeDetailMode = 'compact' | 'detailed';
type PaletteFilter = 'all' | 'favorites' | AiNodeCategory;

interface EditableAiNode {
  id: string;
  type: string;
  displayName: string;
  displayNameRu: string;
  description?: string;
  descriptionRu?: string;
  children: string[];
  parameters: JsonObject;
  inputBindings: Record<string, AiInputBinding>;
  outputBindings: Record<string, AiOutputBinding>;
}

interface EditableAiGraph {
  version: 2;
  id: string;
  name: string;
  nameRu?: string;
  description?: string;
  descriptionRu?: string;
  rootNodeId: string;
  blackboardDefaults: JsonObject;
  blackboardSchema: unknown[];
  subgraphRefs: string[];
  legacyMetadata?: Record<string, unknown>;
  nodes: EditableAiNode[];
}

interface NodePosition { x: number; y: number }
interface DragState { nodeId: string; offsetX: number; offsetY: number; moved: boolean }
interface PanState { startClientX: number; startClientY: number; startPanX: number; startPanY: number }
interface ConnectionState { sourceNodeId: string; sourcePortId: string; kind: 'flow' | 'data'; currentX: number; currentY: number }
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
  paletteFilter: PaletteFilter;
}

interface EngineHealthPayload { ok: boolean; textBase?: string; overlayLanguage?: string; browserDoesHeavyAi?: boolean }
interface EngineEvaluationPayload { ok: boolean; command?: { type?: string }; explanation?: string; explanationRu?: string }
interface EngineEvaluateRequest { graph: EditableAiGraph; unitId: string; blackboard: JsonObject; hasOrder: boolean }

const initialNodePositions: Record<string, NodePosition> = { root: { x: 90, y: 140 } };
const validNodeTypes = new Set(Object.keys(AI_NODE_TYPE_DEFINITIONS));

let editorGraph = loadStoredGraph() ?? loadEditorGraphV2(graphData as unknown);
let nodePositions = loadStoredPositions();
let uiState = loadStoredUiState();
let selectedNodeId = ensureSelectedNodeId(editorGraph.rootNodeId);
let engineOnline = false;
let lastHealthText = 'Движок не проверен';
let validationText = 'Чистое поле готово. Добавьте универсальные ноды и нажмите «Проверить».';
let evaluationText = 'Вычисление проверяет структуру графа и возвращает первое найденное действие.';
let dragState: DragState | null = null;
let panState: PanState | null = null;
let connectionState: ConnectionState | null = null;
let contextMenuState: ContextMenuState | null = null;
let incomingMenuNodeId: string | null = null;
let paletteSearch = '';
let favoriteNodeTypes = loadFavoriteNodeTypes(validNodeTypes);
let lastValidationIssues: AiGraphValidationIssue[] = [];
const graphNavigation: GraphNavigationEntry[] = [];

ensurePositionsForGraph();
render();
void refreshEngineStatus();

window.addEventListener('real-wargame:open-ai-subgraph', (event) => {
  const subgraphId = (event as CustomEvent<{ subgraphId?: string }>).detail?.subgraphId;
  if (subgraphId) openSubgraphById(subgraphId);
});

document.addEventListener('pointerdown', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  let changed = false;
  if (contextMenuState && !target?.closest('.node-context-menu')) {
    contextMenuState = null;
    changed = true;
  }
  if (incomingMenuNodeId && !target?.closest('.incoming-link-menu, [data-toggle-incoming-menu]')) {
    incomingMenuNodeId = null;
    changed = true;
  }
  if (changed) render();
});

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
        <div class="ai-editor-title compact-title"><h1>${escapeHtml(getEditorText('editorTitle', uiState.languageMode))}</h1></div>
        <div class="ai-editor-actions compact-actions">
          <div id="engine-status" class="engine-status compact-status ${engineOnline ? 'online' : 'offline'}"><i class="engine-status-dot" aria-hidden="true"></i><span>${escapeHtml(lastHealthText)}</span></div>
          <button id="toggle-palette" class="ai-editor-button" type="button">${escapeHtml(getEditorText('addNode', uiState.languageMode))}</button>
          <button id="toggle-inspector" class="ai-editor-button" type="button">${escapeHtml(getEditorText('inspector', uiState.languageMode))}</button>
          <button id="validate-graph" class="ai-editor-button" type="button">${escapeHtml(getEditorText('validate', uiState.languageMode))}</button>
          <button id="evaluate-once" class="ai-editor-button" type="button">${escapeHtml(getEditorText('evaluate', uiState.languageMode))}</button>
          <button id="export-graph" class="ai-editor-button" type="button">${escapeHtml(getEditorText('export', uiState.languageMode))}</button>
          <button id="import-graph" class="ai-editor-button" type="button">${escapeHtml(getEditorText('import', uiState.languageMode))}</button>
          <button id="reset-graph" class="ai-editor-button danger" type="button">${escapeHtml(getEditorText('reset', uiState.languageMode))}</button>
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
    return `<aside class="ai-editor-rail left-rail"><button id="open-palette-rail" class="rail-button" type="button">${escapeHtml(getEditorText('addNode', uiState.languageMode))}</button></aside>`;
  }

  const definitions = Object.values(AI_NODE_TYPE_DEFINITIONS);
  const nonEmptyCategories = CATEGORIES.filter((category) => definitions.some((definition) => definition.category === category));
  const query = paletteSearch.trim().toLocaleLowerCase('ru-RU');
  const visibleDefinitions = definitions.filter((definition) => {
    const filterMatches = uiState.paletteFilter === 'all'
      || (uiState.paletteFilter === 'favorites' && favoriteNodeTypes.has(definition.type))
      || definition.category === uiState.paletteFilter;
    if (!filterMatches) return false;
    if (!query) return true;
    return [definition.type, definition.label, definition.labelRu, definition.description, definition.descriptionRu]
      .some((value) => value.toLocaleLowerCase('ru-RU').includes(query));
  });

  const filterButtons = [
    renderPaletteFilterButton('all', getEditorText('all', uiState.languageMode)),
    renderPaletteFilterButton('favorites', getEditorText('favorites', uiState.languageMode)),
    ...nonEmptyCategories.map((category) => renderPaletteFilterButton(category, getCategoryLabel(category, uiState.languageMode), category)),
  ].join('');

  const groups = nonEmptyCategories.map((category) => {
    const items = visibleDefinitions.filter((definition) => definition.category === category);
    if (items.length === 0) return '';
    return `<section class="node-group compact-node-group" style="--node-accent:var(--category-${category}, #d9b85c)">
      <h3>${escapeHtml(getCategoryLabel(category, uiState.languageMode))}</h3>
      ${items.map(renderPaletteNode).join('')}
    </section>`;
  }).join('');

  return `
    <aside class="ai-editor-panel palette-panel" aria-label="${escapeAttribute(getEditorText('palette', uiState.languageMode))}">
      <div class="panel-title compact-panel-title"><h2>${escapeHtml(getEditorText('palette', uiState.languageMode))}</h2><button id="close-palette" class="mini-button" type="button">${escapeHtml(getEditorText('hide', uiState.languageMode))}</button></div>
      <input id="palette-search" class="palette-search" type="search" value="${escapeAttribute(paletteSearch)}" placeholder="${escapeAttribute(getEditorText('searchNodes', uiState.languageMode))}" autocomplete="off" />
      <div class="palette-filter-row" role="toolbar" aria-label="${escapeAttribute(getEditorText('palette', uiState.languageMode))}">${filterButtons}</div>
      <p class="toolbar-note">${escapeHtml(getEditorText('paletteNote', uiState.languageMode))}</p>
      ${groups || `<p class="palette-empty">${escapeHtml(getEditorText('emptyPalette', uiState.languageMode))}</p>`}
    </aside>
  `;
}

function renderPaletteFilterButton(filter: PaletteFilter, label: string, category?: AiNodeCategory): string {
  const active = uiState.paletteFilter === filter ? 'active' : '';
  const categoryAttribute = category ? ` data-category="${category}"` : '';
  return `<button class="palette-filter ${active}" type="button" data-palette-filter="${filter}"${categoryAttribute}>${escapeHtml(label)}</button>`;
}

function renderPaletteNode(definition: (typeof AI_NODE_TYPE_DEFINITIONS)[string]): string {
  const favorite = favoriteNodeTypes.has(definition.type);
  return `<div class="palette-node-row" data-category="${definition.category}">
    <button class="palette-node compact-palette-node" type="button" data-palette-type="${escapeAttribute(definition.type)}">
      <strong>${escapeHtml(getDefinitionTitle(definition))}</strong>
      <em>${escapeHtml(getCategoryLabel(definition.category, uiState.languageMode))} · ${escapeHtml(definition.type)}</em>
    </button>
    <button class="palette-favorite ${favorite ? 'active' : ''}" type="button" data-palette-favorite="${escapeAttribute(definition.type)}" aria-pressed="${String(favorite)}" title="${escapeAttribute(getEditorText('favorites', uiState.languageMode))}">${favorite ? '★' : '☆'}</button>
  </div>`;
}

function renderWorkspace(): string {
  return `
    <section id="graph-workspace" class="graph-workspace graph-viewport" aria-label="Soldier behavior graph">
      <div class="graph-breadcrumb">${renderGraphBreadcrumb()}</div>
      <div class="graph-toolbar">
        <button id="zoom-out" class="graph-tool-button" type="button">−</button>
        <button id="zoom-reset" class="graph-tool-button" type="button">${Math.round(uiState.zoom * 100)}%</button>
        <button id="zoom-in" class="graph-tool-button" type="button">+</button>
        <button id="fit-graph" class="graph-tool-button" type="button">${escapeHtml(getEditorText('fit', uiState.languageMode))}</button>
        <button id="detail-toggle" class="graph-tool-button" type="button">${escapeHtml(getEditorText(uiState.nodeDetailMode === 'compact' ? 'compact' : 'detailed', uiState.languageMode))}</button>
        <button id="language-toggle-editor" class="graph-tool-button" type="button">${uiState.languageMode.toUpperCase()}</button>
        <span class="graph-help">${escapeHtml(getEditorText('graphHelp', uiState.languageMode))}</span>
      </div>
      <div class="graph-canvas" style="width:${CANVAS_WIDTH}px; height:${CANVAS_HEIGHT}px; transform:translate(${uiState.panX}px, ${uiState.panY}px) scale(${uiState.zoom});">
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
    const model = getNodeContractUiModel(node);
    const incomingParents = getIncomingFlowParents(node.id);
    const inputPorts = model.inputs.map((port, index) => renderDataInputPort(node, port.id, port.kind, port.labelRu, port.label, index)).join('');
    const outputPorts = model.outputs.map((port, index) => {
      const label = uiState.languageMode === 'en' ? port.label : port.labelRu;
      return `<button class="node-data-port out" data-port-kind="data-out" data-node-id="${escapeAttribute(node.id)}" data-port-id="${escapeAttribute(port.id)}" data-port-value-kind="${port.kind}" style="top:${58 + index * 22}px" title="${escapeAttribute(label)} · ${port.kind}"><span>${escapeHtml(label)}</span></button>`;
    }).join('');
    const height = Math.max(NODE_HEIGHT, 88 + Math.max(model.inputs.length, model.outputs.length) * 22);
    const incomingMenu = incomingMenuNodeId === node.id ? renderIncomingLinkMenu(node, incomingParents) : '';
    const flowConnected = incomingParents.length > 0 ? 'connected' : '';
    const flowRemove = incomingParents.length > 0
      ? `<button class="node-input-link-control flow-link" type="button" data-toggle-incoming-menu="${escapeAttribute(node.id)}" title="${escapeAttribute(getEditorText('removeLink', uiState.languageMode))}">×</button>`
      : '';

    return `
      <article class="graph-node ${category} ${selected} ${uiState.nodeDetailMode}" data-node-id="${escapeAttribute(node.id)}" style="left:${position.x}px; top:${position.y}px; min-height:${height}px;">
        <button class="node-port in ${flowConnected}" data-port-kind="flow-in" data-port-id="flow" data-node-id="${escapeAttribute(node.id)}" title="${escapeAttribute(getEditorText('flowInput', uiState.languageMode))}"></button>
        <button class="node-port out" data-port-kind="flow-out" data-port-id="flow" data-node-id="${escapeAttribute(node.id)}" title="${escapeAttribute(getEditorText('flowOutput', uiState.languageMode))}"></button>
        ${flowRemove}${incomingMenu}${inputPorts}${outputPorts}
        <span class="node-type-chip">${escapeHtml(getCategoryLabel(category, uiState.languageMode))} / ${escapeHtml(node.type)}</span>
        <h3>${escapeHtml(getNodeTitle(node))}</h3>
        <p class="node-secondary">${escapeHtml(getNodeSubtitle(node))}</p>
        ${detailHtml}
        <div class="node-port-row"><span>id</span><b>${escapeHtml(node.id)}</b></div>
      </article>
    `;
  }).join('');
}

function renderDataInputPort(node: EditableAiNode, inputPortId: string, kind: string, labelRu: string, labelEn: string, index: number): string {
  const binding = node.inputBindings[inputPortId];
  const connected = binding?.source === 'node';
  const label = uiState.languageMode === 'en' ? labelEn : labelRu;
  const sourceDescription = connected ? ` ← ${binding.nodeId}.${binding.port}` : '';
  const top = 58 + index * 22;
  return `<button class="node-data-port in ${connected ? 'connected' : ''}" data-port-kind="data-in" data-node-id="${escapeAttribute(node.id)}" data-port-id="${escapeAttribute(inputPortId)}" data-port-value-kind="${escapeAttribute(kind)}" style="top:${top}px" title="${escapeAttribute(`${label} · ${kind}${sourceDescription}`)}"><span>${escapeHtml(label)}</span></button>${connected ? `<button class="node-input-link-control data-link" type="button" data-unlink-data-input="${escapeAttribute(inputPortId)}" data-node-id="${escapeAttribute(node.id)}" style="top:${top}px" title="${escapeAttribute(getEditorText('removeLink', uiState.languageMode))}">×</button>` : ''}`;
}

function renderIncomingLinkMenu(node: EditableAiNode, parents: readonly EditableAiNode[]): string {
  if (parents.length === 0) return '';
  return `<div class="incoming-link-menu" data-incoming-menu-node="${escapeAttribute(node.id)}">
    <strong>${escapeHtml(getEditorText('unlinkIncoming', uiState.languageMode))}</strong>
    ${parents.map((parent) => `<button type="button" data-unlink-flow-parent="${escapeAttribute(parent.id)}" data-unlink-flow-child="${escapeAttribute(node.id)}">${escapeHtml(getNodeTitle(parent))} · ${escapeHtml(parent.id)}</button>`).join('')}
    <button class="danger" type="button" data-unlink-all-incoming="${escapeAttribute(node.id)}">${escapeHtml(getEditorText('unlinkAllIncoming', uiState.languageMode))}</button>
  </div>`;
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
    for (const [inputId, binding] of Object.entries(node.inputBindings)) {
      if (binding.source !== 'node') continue;
      const source = editorGraph.nodes.find((candidate) => candidate.id === binding.nodeId);
      if (!source) continue;
      const sourcePosition = getNodePosition(source.id);
      const inputIndex = Math.max(0, getNodeContractUiModel(node).inputs.findIndex((port) => port.id === inputId));
      const outputIndex = Math.max(0, getNodeContractUiModel(source).outputs.findIndex((port) => port.id === binding.port));
      paths.push(`<path class="edge-path data-edge" d="${makeEdgePath(sourcePosition.x + NODE_WIDTH, sourcePosition.y + 58 + outputIndex * 22, from.x, from.y + 58 + inputIndex * 22)}" />`);
    }
  }
  return paths.join('');
}

function renderConnectionPreview(): string {
  if (!connectionState) return '';
  const from = getNodePosition(connectionState.sourceNodeId);
  const sourceNode = editorGraph.nodes.find((node) => node.id === connectionState?.sourceNodeId);
  const outputIndex = sourceNode ? Math.max(0, getNodeContractUiModel(sourceNode).outputs.findIndex((port) => port.id === connectionState?.sourcePortId)) : 0;
  const startY = connectionState.kind === 'data' ? from.y + 58 + outputIndex * 22 : from.y + NODE_HEIGHT / 2;
  return `<path class="edge-path preview ${connectionState.kind === 'data' ? 'data-edge' : ''}" d="${makeEdgePath(from.x + NODE_WIDTH, startY, connectionState.currentX, connectionState.currentY)}" />`;
}

function renderGraphBreadcrumb(): string {
  const parts = [getEditorText('mainGraph', uiState.languageMode), ...graphNavigation.map((entry) => entry.labelRu)];
  return `${graphNavigation.length ? `<button type="button" data-breadcrumb-back="true" class="mini-button">${escapeHtml(getEditorText('backToParent', uiState.languageMode))}</button>` : ''}<span>${parts.map(escapeHtml).join(' → ')}</span>`;
}

function renderSubgraphInspector(node: EditableAiNode): string {
  if (node.type !== 'Subgraph') return '';
  const selectedId = typeof node.parameters.subgraphId === 'string' ? node.parameters.subgraphId : 'take_cover';
  const selected = getSubgraphChoice(selectedId) ?? listSubgraphChoices()[0];
  return `<section class="subgraph-inspector-summary">
    <label class="inspector-field"><span>${localized('Подграф', 'Subgraph')}</span><select id="inspector-subgraph-id">${listSubgraphChoices().map((choice) => `<option value="${escapeAttribute(choice.id)}" ${choice.id === selected?.id ? 'selected' : ''}>${escapeHtml(choice.labelRu)} · ${escapeHtml(choice.id)}</option>`).join('')}</select></label>
    <p>${escapeHtml(selected?.descriptionRu ?? '')}</p>
    <strong>${localized('Входы', 'Inputs')}</strong><ul>${(selected?.inputs ?? []).map((port) => `<li>${escapeHtml(port.labelRu)} · ${port.kind}${port.required ? ` · ${localized('обязательно', 'required')}` : ''}</li>`).join('') || `<li>${localized('Нет', 'None')}</li>`}</ul>
    <strong>${localized('Выходы', 'Outputs')}</strong><ul>${(selected?.outputs ?? []).map((port) => `<li>${escapeHtml(port.labelRu)} · ${port.kind}</li>`).join('') || `<li>${localized('Нет', 'None')}</li>`}</ul>
  </section>`;
}

function renderValidationIssues(): string {
  if (lastValidationIssues.length === 0) return `<p class="toolbar-note">${localized('Ошибок проверки пока нет.', 'No validation issues yet.')}</p>`;
  return `<div class="graph-validation-list">${lastValidationIssues.map((issue) => `<button type="button" class="graph-validation-issue ${issue.severity}" data-validation-node-id="${escapeAttribute(issue.nodeId ?? '')}" ${issue.nodeId ? '' : 'disabled'}><b>${issue.severity.toUpperCase()} · ${escapeHtml(issue.code)}</b><span>${escapeHtml(issue.messageRu)}</span>${issue.fixRu ? `<small>${escapeHtml(issue.fixRu)}</small>` : ''}</button>`).join('')}</div>`;
}

function validateGraphLocally(): void {
  const result = validateAiGraph(editorGraph);
  lastValidationIssues = [...result.issues];
  validationText = result.valid
    ? `Граф прошёл проверку. Ошибок: 0, предупреждений: ${result.issues.filter((issue) => issue.severity === 'warning').length}.`
    : `Граф нельзя безопасно запустить или сохранить. Ошибок: ${result.issues.filter((issue) => issue.severity === 'error').length}.`;
  uiState.bottomOpen = true;
  uiState.bottomTab = 'console';
  render();
}

function openSelectedSubgraph(nodeId: string): void {
  const node = editorGraph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node || node.type !== 'Subgraph') return;
  const subgraphId = typeof node.parameters.subgraphId === 'string' ? node.parameters.subgraphId : 'take_cover';
  openSubgraphById(subgraphId);
}

function openSubgraphById(subgraphId: string): void {
  const graph = getSubgraphGraph(subgraphId);
  const choice = getSubgraphChoice(subgraphId);
  if (!graph || !choice) return;
  graphNavigation.push({
    graph: normalizeGraph(JSON.parse(JSON.stringify(editorGraph))),
    positions: JSON.parse(JSON.stringify(nodePositions)) as Record<string, NodePosition>,
    selectedNodeId,
    labelRu: choice.labelRu,
  });
  editorGraph = loadEditorGraphV2(graph);
  nodePositions = {};
  selectedNodeId = editorGraph.rootNodeId;
  ensurePositionsForGraph();
  validationText = `Открыт подграф «${choice.labelRu}». Изменения не перезаписывают родительский граф.`;
  render();
}

function returnToParentGraph(): void {
  const parent = graphNavigation.pop();
  if (!parent) return;
  editorGraph = parent.graph;
  nodePositions = parent.positions;
  selectedNodeId = parent.selectedNodeId;
  render();
}

function renderInspectorPanel(node: EditableAiNode): string {
  if (!uiState.inspectorOpen) return `<aside class="ai-editor-rail right-rail"><button id="open-inspector-rail" class="rail-button" type="button">${escapeHtml(getEditorText('inspector', uiState.languageMode))}</button></aside>`;
  return `<aside class="ai-editor-panel right inspector-panel" aria-label="${escapeAttribute(getEditorText('inspector', uiState.languageMode))}">${renderInspector(node)}${renderEngineResultCard()}</aside>`;
}

function renderInspector(node: EditableAiNode): string {
  const childRows = node.children.length > 0
    ? node.children.map((childId) => `<div class="child-link-row"><code>${escapeHtml(childId)}</code><button class="mini-button" type="button" data-unlink-child="${escapeAttribute(childId)}">${escapeHtml(getEditorText('removeLink', uiState.languageMode))}</button></div>`).join('')
    : `<p class="toolbar-note">${localized('Исходящих связей нет.', 'No outgoing links.')}</p>`;
  const linkOptions = editorGraph.nodes.filter((candidate) => candidate.id !== node.id).map((candidate) => `<option value="${escapeAttribute(candidate.id)}">${escapeHtml(candidate.id)} · ${escapeHtml(candidate.displayNameRu || candidate.displayName)}</option>`).join('');
  const deleteDisabled = node.id === editorGraph.rootNodeId ? 'disabled' : '';
  return `
    <div class="panel-title compact-panel-title"><h2>${escapeHtml(getEditorText('inspector', uiState.languageMode))}</h2><button id="close-inspector" class="mini-button" type="button">${escapeHtml(getEditorText('hide', uiState.languageMode))}</button></div>
    <section class="inspector-card compact-inspector-card"><h3>${escapeHtml(getNodeTitle(node))}</h3><div class="inspector-row"><span>id</span><code>${escapeHtml(node.id)}</code></div><div class="inspector-row"><span>type</span><code>${escapeHtml(node.type)}</code></div><div class="inspector-row"><span>${localized('категория', 'category')}</span><b>${escapeHtml(getCategoryLabel(getNodeCategory(node), uiState.languageMode))}</b></div></section>
    <section class="inspector-card compact-inspector-card">
      <h3>${localized('Редактирование', 'Edit')}</h3>
      <label class="inspector-field">EN displayName<input id="node-display-name" value="${escapeAttribute(node.displayName)}" /></label>
      <label class="inspector-field">RU displayNameRu<input id="node-display-name-ru" value="${escapeAttribute(node.displayNameRu)}" /></label>
      <details><summary>${localized('Описания', 'Descriptions')}</summary><label class="inspector-field">EN description<textarea id="node-description" rows="3">${escapeHtml(node.description ?? '')}</textarea></label><label class="inspector-field">RU descriptionRu<textarea id="node-description-ru" rows="3">${escapeHtml(node.descriptionRu ?? '')}</textarea></label></details>
      ${renderSubgraphInspector(node)}
      <details open><summary>${localized('Параметры ноды', 'Node parameters')}</summary><div id="contract-parameter-fields">${renderContractParameterFields(node)}</div></details>
      <details><summary>${localized('Технический JSON', 'Technical JSON')}</summary><label class="inspector-field">parameters<textarea id="node-parameters" rows="6">${escapeHtml(JSON.stringify(node.parameters, null, 2))}</textarea></label></details>
      <button id="save-node" class="ai-editor-button primary" type="button">${escapeHtml(getEditorText('saveNode', uiState.languageMode))}</button>
    </section>
    <section class="inspector-card compact-inspector-card"><h3>${escapeHtml(getEditorText('links', uiState.languageMode))}</h3><p class="toolbar-note">${localized('Основной способ: протяните правый порт к другой ноде.', 'Main way: drag the right port to another node.')}</p><label class="inspector-field">${localized('Дочерняя нода', 'Child node')}<select id="link-target-select">${linkOptions}</select></label><button id="link-selected-node" class="ai-editor-button" type="button">${localized('Связать с выбранной дочерней нодой', 'Link to selected child')}</button><div class="child-link-list">${childRows}</div></section>
    <section class="inspector-card compact-inspector-card danger-zone"><h3>${escapeHtml(getEditorText('dangerZone', uiState.languageMode))}</h3><button id="delete-selected-node" class="ai-editor-button danger" type="button" ${deleteDisabled}>${escapeHtml(getEditorText('deleteSelectedNode', uiState.languageMode))}</button></section>
  `;
}

function renderEngineResultCard(): string {
  return `<section class="result-card compact-result-card"><h3>${escapeHtml(getEditorText('evaluate', uiState.languageMode))}</h3><pre>${escapeHtml(evaluationText)}</pre></section>`;
}

function renderBottomPanel(): string {
  if (!uiState.bottomOpen) return `<footer class="ai-editor-bottom collapsed-bottom"><button id="toggle-bottom" class="bottom-toggle" type="button">▲ ${escapeHtml(getEditorText('console', uiState.languageMode))} / JSON</button><span>${escapeHtml(shorten(validationText, 160))}</span></footer>`;
  const consoleActive = uiState.bottomTab === 'console' ? 'active' : '';
  const jsonActive = uiState.bottomTab === 'json' ? 'active' : '';
  return `<footer class="ai-editor-bottom expanded-bottom"><div class="bottom-tabs"><button id="bottom-tab-console" class="bottom-tab ${consoleActive}" type="button">${escapeHtml(getEditorText('console', uiState.languageMode))}</button><button id="bottom-tab-json" class="bottom-tab ${jsonActive}" type="button">${escapeHtml(getEditorText('graphJson', uiState.languageMode))}</button><button id="toggle-bottom" class="bottom-tab" type="button">▼ ${escapeHtml(getEditorText('hide', uiState.languageMode))}</button></div><section class="bottom-box ${uiState.bottomTab === 'console' ? '' : 'hidden'}"><h2>${escapeHtml(getEditorText('validate', uiState.languageMode))}</h2>${renderValidationIssues()}<pre>${escapeHtml(validationText)}</pre></section><section class="bottom-box ${uiState.bottomTab === 'json' ? '' : 'hidden'}"><h2>${escapeHtml(getEditorText('graphJson', uiState.languageMode))}</h2><pre>${escapeHtml(JSON.stringify(editorGraph, null, 2))}</pre></section></footer>`;
}

function renderContextMenu(): string {
  if (!contextMenuState) return '';
  const node = editorGraph.nodes.find((candidate) => candidate.id === contextMenuState?.nodeId);
  if (!node) return '';
  const canDelete = node.id !== editorGraph.rootNodeId;
  const hasLinkSource = Boolean(uiState.linkSourceNodeId && uiState.linkSourceNodeId !== node.id);
  const hasIncoming = getIncomingFlowParents(node.id).length > 0 || Object.values(node.inputBindings).some((binding) => binding.source === 'node');
  return `<div class="node-context-menu" style="left:${contextMenuState.x}px; top:${contextMenuState.y}px;"><strong>${escapeHtml(getNodeTitle(node))}</strong><button data-menu-action="select" type="button">${escapeHtml(getEditorText('select', uiState.languageMode))}</button><button data-menu-action="add-child" type="button">${escapeHtml(getEditorText('addChildAction', uiState.languageMode))}</button><button data-menu-action="duplicate" type="button">${escapeHtml(getEditorText('duplicate', uiState.languageMode))}</button><button data-menu-action="set-link-source" type="button">${escapeHtml(getEditorText('setLinkSource', uiState.languageMode))}</button><button data-menu-action="link-source-to-this" type="button" ${hasLinkSource ? '' : 'disabled'}>${escapeHtml(getEditorText('linkSourceToThis', uiState.languageMode))}</button><button data-menu-action="center" type="button">${escapeHtml(getEditorText('centerView', uiState.languageMode))}</button><button data-menu-action="unlink-outgoing" type="button">${escapeHtml(getEditorText('unlinkOutgoing', uiState.languageMode))}</button><button data-menu-action="unlink-incoming" type="button" ${hasIncoming ? '' : 'disabled'}>${escapeHtml(getEditorText('unlinkIncoming', uiState.languageMode))}</button><button data-menu-action="delete" type="button" ${canDelete ? '' : 'disabled'}>${escapeHtml(getEditorText('deleteNode', uiState.languageMode))}</button></div>`;
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
  document.querySelector<HTMLInputElement>('#palette-search')?.addEventListener('input', (event) => setPaletteSearch((event.target as HTMLInputElement).value));

  document.querySelectorAll<HTMLButtonElement>('[data-palette-filter]').forEach((button) => button.addEventListener('click', () => setPaletteFilter(button.dataset.paletteFilter as PaletteFilter)));
  document.querySelectorAll<HTMLButtonElement>('[data-palette-favorite]').forEach((button) => button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (button.dataset.paletteFavorite) toggleFavoriteNodeType(button.dataset.paletteFavorite);
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-palette-type]').forEach((button) => button.addEventListener('click', () => { if (button.dataset.paletteType) addNodeFromPalette(button.dataset.paletteType); }));

  document.querySelectorAll<HTMLElement>('[data-node-id].graph-node').forEach((element) => {
    element.addEventListener('pointerdown', (event) => { if (!isPortEvent(event)) startDrag(event, element.dataset.nodeId ?? ''); });
    element.addEventListener('click', () => { if (!dragState?.moved && element.dataset.nodeId) selectNode(element.dataset.nodeId); });
    element.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      if (!element.dataset.nodeId) return;
      selectedNodeId = element.dataset.nodeId;
      contextMenuState = { nodeId: element.dataset.nodeId, x: event.clientX, y: event.clientY };
      incomingMenuNodeId = null;
      render();
    });
    element.addEventListener('dblclick', () => { if (element.dataset.nodeId) openSelectedSubgraph(element.dataset.nodeId); });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-port-kind="flow-out"], [data-port-kind="data-out"]').forEach((button) => button.addEventListener('pointerdown', (event) => {
    if (button.dataset.nodeId && button.dataset.portId) startConnectionDrag(event, button.dataset.nodeId, button.dataset.portId, button.dataset.portKind === 'data-out' ? 'data' : 'flow');
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-unlink-data-input]').forEach((button) => installIsolatedClick(button, () => {
    if (button.dataset.nodeId && button.dataset.unlinkDataInput) removeTypedInputBinding(button.dataset.nodeId, button.dataset.unlinkDataInput);
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-toggle-incoming-menu]').forEach((button) => installIsolatedClick(button, () => {
    const nodeId = button.dataset.toggleIncomingMenu;
    if (!nodeId) return;
    const parents = getIncomingFlowParents(nodeId);
    if (parents.length === 1) removeIncomingFlowLink(parents[0].id, nodeId);
    else {
      incomingMenuNodeId = incomingMenuNodeId === nodeId ? null : nodeId;
      render();
    }
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-unlink-flow-parent]').forEach((button) => installIsolatedClick(button, () => {
    if (button.dataset.unlinkFlowParent && button.dataset.unlinkFlowChild) removeIncomingFlowLink(button.dataset.unlinkFlowParent, button.dataset.unlinkFlowChild);
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-unlink-all-incoming]').forEach((button) => installIsolatedClick(button, () => {
    if (button.dataset.unlinkAllIncoming) removeAllIncomingLinks(button.dataset.unlinkAllIncoming);
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-unlink-child]').forEach((button) => button.addEventListener('click', () => { if (button.dataset.unlinkChild) unlinkChild(selectedNodeId, button.dataset.unlinkChild); }));
  document.querySelectorAll<HTMLButtonElement>('[data-validation-node-id]').forEach((button) => button.addEventListener('click', () => { const id = button.dataset.validationNodeId; if (id) selectNode(id); }));
  document.querySelectorAll<HTMLButtonElement>('[data-breadcrumb-back]').forEach((button) => button.addEventListener('click', returnToParentGraph));
  document.querySelectorAll<HTMLButtonElement>('[data-menu-action]').forEach((button) => button.addEventListener('click', () => handleContextMenuAction(button.dataset.menuAction ?? '')));
  document.querySelector<HTMLElement>('#graph-workspace')?.addEventListener('wheel', onWorkspaceWheel, { passive: false });
  document.querySelector<HTMLElement>('#graph-workspace')?.addEventListener('pointerdown', startPanIfEmpty);
}

function installIsolatedClick(button: HTMLButtonElement, action: () => void): void {
  button.addEventListener('pointerdown', (event) => { event.preventDefault(); event.stopPropagation(); });
  button.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); action(); });
}

function selectNode(nodeId: string): void {
  selectedNodeId = nodeId;
  uiState.inspectorOpen = true;
  contextMenuState = null;
  incomingMenuNodeId = null;
  saveUiState();
  render();
}

export function startDrag(event: PointerEvent, nodeId: string): void {
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
  nodePositions[dragState.nodeId] = {
    x: clamp(Math.round(world.x - dragState.offsetX), 20, CANVAS_WIDTH - NODE_WIDTH - 20),
    y: clamp(Math.round(world.y - dragState.offsetY), 20, CANVAS_HEIGHT - NODE_HEIGHT - 20),
  };
  dragState.moved = true;
  updateNodePosition(dragState.nodeId);
  updateSvgPaths();
}

function onDragEnd(): void {
  window.removeEventListener('pointermove', onDragMove);
  savePositions();
  saveUiState();
  dragState = null;
}

function updateNodePosition(nodeId: string): void {
  const element = document.querySelector<HTMLElement>(`.graph-node[data-node-id="${cssEscape(nodeId)}"]`);
  const position = getNodePosition(nodeId);
  if (element) {
    element.style.left = `${position.x}px`;
    element.style.top = `${position.y}px`;
  }
}

export function startConnectionDrag(event: PointerEvent, sourceNodeId: string, sourcePortId: string, kind: 'flow' | 'data'): void {
  event.preventDefault();
  event.stopPropagation();
  const world = screenToWorld(event.clientX, event.clientY);
  connectionState = { sourceNodeId, sourcePortId, kind, currentX: world.x, currentY: world.y };
  window.addEventListener('pointermove', onConnectionMove);
  window.addEventListener('pointerup', onConnectionEnd, { once: true });
}

function onConnectionMove(event: PointerEvent): void {
  if (!connectionState) return;
  const world = screenToWorld(event.clientX, event.clientY);
  connectionState.currentX = world.x;
  connectionState.currentY = world.y;
  updateSvgPaths();
}

function onConnectionEnd(event: PointerEvent): void {
  window.removeEventListener('pointermove', onConnectionMove);
  const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
  const targetPort = target?.closest<HTMLElement>('[data-port-kind="data-in"]');
  const targetNodeId = target?.closest<HTMLElement>('.graph-node')?.dataset.nodeId;
  const state = connectionState;
  connectionState = null;
  if (!state || !targetNodeId) { render(); return; }
  if (state.kind === 'flow') { addLink(state.sourceNodeId, targetNodeId); return; }
  const targetPortId = targetPort?.dataset.portId;
  if (!targetPortId) {
    validationText = 'Перетащите типизированное значение точно на совместимый вход.';
    uiState.bottomOpen = true;
    render();
    return;
  }
  connectTypedPorts(state.sourceNodeId, state.sourcePortId, targetNodeId, targetPortId);
}

function startPanIfEmpty(event: PointerEvent): void {
  if (event.button !== 0 && event.button !== 1) return;
  const target = event.target as HTMLElement;
  if (target.closest('.graph-node, button, .graph-toolbar, .ai-debug-panel-dock, summary, input, select, textarea, a')) return;
  event.preventDefault();
  panState = { startClientX: event.clientX, startClientY: event.clientY, startPanX: uiState.panX, startPanY: uiState.panY };
  window.addEventListener('pointermove', onPanMove);
  window.addEventListener('pointerup', onPanEnd, { once: true });
}

function onPanMove(event: PointerEvent): void {
  if (!panState) return;
  uiState.panX = panState.startPanX + event.clientX - panState.startClientX;
  uiState.panY = panState.startPanY + event.clientY - panState.startClientY;
  applyCanvasTransform();
}

function onPanEnd(): void {
  window.removeEventListener('pointermove', onPanMove);
  panState = null;
  saveUiState();
}

function onWorkspaceWheel(event: WheelEvent): void {
  event.preventDefault();
  zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.1 : 0.9);
}

function zoomBy(factor: number): void {
  const rect = document.querySelector<HTMLElement>('#graph-workspace')?.getBoundingClientRect();
  zoomAt((rect?.left ?? 0) + (rect?.width ?? 800) / 2, (rect?.top ?? 0) + (rect?.height ?? 600) / 2, factor);
}

function zoomAt(clientX: number, clientY: number, factor: number): void {
  const before = screenToWorld(clientX, clientY);
  uiState.zoom = clamp(round2(uiState.zoom * factor), 0.35, 2.2);
  const rect = document.querySelector<HTMLElement>('#graph-workspace')?.getBoundingClientRect();
  if (rect) {
    uiState.panX = clientX - rect.left - before.x * uiState.zoom;
    uiState.panY = clientY - rect.top - before.y * uiState.zoom;
  }
  saveUiState();
  render();
}

function resetZoom(): void {
  uiState.zoom = 1;
  uiState.panX = 0;
  uiState.panY = 0;
  saveUiState();
  render();
}

function fitGraphToView(): void {
  const rect = document.querySelector<HTMLElement>('#graph-workspace')?.getBoundingClientRect();
  if (!rect || editorGraph.nodes.length === 0) return;
  const bounds = getGraphBounds();
  const width = Math.max(1, bounds.maxX - bounds.minX + NODE_WIDTH);
  const height = Math.max(1, bounds.maxY - bounds.minY + NODE_HEIGHT);
  uiState.zoom = clamp(round2(Math.min((rect.width - 80) / width, (rect.height - 80) / height)), 0.35, 1.25);
  uiState.panX = Math.round((rect.width - width * uiState.zoom) / 2 - bounds.minX * uiState.zoom);
  uiState.panY = Math.round((rect.height - height * uiState.zoom) / 2 - bounds.minY * uiState.zoom);
  saveUiState();
  render();
}

function toggleDetailMode(): void {
  uiState.nodeDetailMode = uiState.nodeDetailMode === 'compact' ? 'detailed' : 'compact';
  saveUiState();
  render();
}

function cycleLanguageMode(): void {
  uiState.languageMode = uiState.languageMode === 'ru' ? 'en' : uiState.languageMode === 'en' ? 'both' : 'ru';
  saveUiState();
  render();
}

function applyCanvasTransform(): void {
  const canvas = document.querySelector<HTMLElement>('.graph-canvas');
  if (canvas) canvas.style.transform = `translate(${uiState.panX}px, ${uiState.panY}px) scale(${uiState.zoom})`;
}

function screenToWorld(clientX: number, clientY: number): NodePosition {
  const rect = document.querySelector<HTMLElement>('#graph-workspace')?.getBoundingClientRect();
  return { x: (clientX - (rect?.left ?? 0) - uiState.panX) / uiState.zoom, y: (clientY - (rect?.top ?? 0) - uiState.panY) / uiState.zoom };
}

function getGraphBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
  const positions = editorGraph.nodes.map((node) => getNodePosition(node.id));
  return {
    minX: Math.min(...positions.map((position) => position.x)),
    minY: Math.min(...positions.map((position) => position.y)),
    maxX: Math.max(...positions.map((position) => position.x)),
    maxY: Math.max(...positions.map((position) => position.y)),
  };
}

function updateSvgPaths(): void {
  const svg = document.querySelector<SVGElement>('.graph-svg');
  if (svg) svg.innerHTML = `${renderEdgePaths()}${renderConnectionPreview()}`;
}

function makeEdgePath(x1: number, y1: number, x2: number, y2: number): string {
  const delta = Math.max(80, Math.abs(x2 - x1) * 0.5);
  return `M ${x1} ${y1} C ${x1 + delta} ${y1}, ${x2 - delta} ${y2}, ${x2} ${y2}`;
}

export function addNodeFromPalette(type: string): void {
  const definition = AI_NODE_TYPE_DEFINITIONS[type];
  if (!definition) return;
  const id = makeUniqueNodeId(type);
  const selectedPosition = getNodePosition(selectedNodeId);
  editorGraph.nodes.push({
    id,
    type,
    displayName: definition.label,
    displayNameRu: definition.labelRu,
    description: definition.description,
    descriptionRu: definition.descriptionRu,
    children: [],
    parameters: createDefaultParameters(type),
    inputBindings: {},
    outputBindings: {},
  });
  nodePositions[id] = { x: selectedPosition.x + 270, y: selectedPosition.y + Math.max(0, editorGraph.nodes.length % 5) * 118 };
  selectedNodeId = id;
  uiState.inspectorOpen = true;
  saveGraph();
  savePositions();
  render();
}

export function createDefaultParameters(type: string): JsonObject {
  return createContractDefaultParameters(type) as JsonObject;
}

function makeUniqueNodeId(type: string): string {
  const base = type.replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase();
  let index = 1;
  let id = `${base}_${index}`;
  const used = new Set(editorGraph.nodes.map((node) => node.id));
  while (used.has(id)) { index += 1; id = `${base}_${index}`; }
  return id;
}

function addLink(parentId: string, childId: string): void {
  if (parentId === childId) { render(); return; }
  const parent = editorGraph.nodes.find((node) => node.id === parentId);
  if (!parent) return;
  if (!parent.children.includes(childId)) parent.children.push(childId);
  selectedNodeId = childId;
  uiState.inspectorOpen = true;
  saveGraph();
  render();
}

function connectTypedPorts(sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string): void {
  const source = editorGraph.nodes.find((node) => node.id === sourceNodeId);
  const target = editorGraph.nodes.find((node) => node.id === targetNodeId);
  if (!source || !target) return;
  const output = getNodeContractUiModel(source).outputs.find((port) => port.id === sourcePortId);
  const input = getNodeContractUiModel(target).inputs.find((port) => port.id === targetPortId);
  if (!output || !input) return;
  if (!canConnectPorts(output, input)) {
    validationText = explainPortIncompatibilityRu(output.kind, input.kind, output.labelRu, input.labelRu);
    uiState.bottomOpen = true;
    uiState.bottomTab = 'console';
    render();
    return;
  }
  target.inputBindings[targetPortId] = { source: 'node', nodeId: sourceNodeId, port: sourcePortId };
  validationText = `Соединено: ${output.labelRu} → ${input.labelRu}.`;
  selectedNodeId = targetNodeId;
  saveGraph();
  render();
}

function unlinkChild(parentId: string, childId: string): void {
  const parent = editorGraph.nodes.find((node) => node.id === parentId);
  if (!parent) return;
  parent.children = parent.children.filter((id) => id !== childId);
  saveGraph();
  render();
}

export function getIncomingFlowParents(nodeId: string): EditableAiNode[] {
  return editorGraph.nodes.filter((node) => node.children.includes(nodeId));
}

export function removeTypedInputBinding(nodeId: string, inputPortId: string): void {
  const node = editorGraph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node || !node.inputBindings[inputPortId]) return;
  delete node.inputBindings[inputPortId];
  validationText = `${getEditorText('removeLink', uiState.languageMode)}: ${nodeId}.${inputPortId}`;
  saveGraph();
  render();
}

export function removeIncomingFlowLink(parentId: string, childId: string): void {
  const parent = editorGraph.nodes.find((node) => node.id === parentId);
  if (!parent) return;
  parent.children = parent.children.filter((id) => id !== childId);
  incomingMenuNodeId = null;
  saveGraph();
  render();
}

export function removeAllIncomingLinks(nodeId: string): void {
  for (const parent of editorGraph.nodes) parent.children = parent.children.filter((childId) => childId !== nodeId);
  const node = editorGraph.nodes.find((candidate) => candidate.id === nodeId);
  if (node) {
    node.inputBindings = Object.fromEntries(Object.entries(node.inputBindings).filter(([, binding]) => binding.source !== 'node'));
  }
  incomingMenuNodeId = null;
  saveGraph();
  render();
}

function linkSelectedNodeToChosenChild(): void {
  const targetId = document.querySelector<HTMLSelectElement>('#link-target-select')?.value;
  if (targetId) addLink(selectedNodeId, targetId);
}

function handleContextMenuAction(action: string): void {
  const node = findSelectedNode();
  contextMenuState = null;
  switch (action) {
    case 'select': selectNode(node.id); return;
    case 'add-child': {
      const id = makeUniqueNodeId('SetAction');
      const position = getNodePosition(node.id);
      const definition = AI_NODE_TYPE_DEFINITIONS.SetAction;
      editorGraph.nodes.push({ id, type: 'SetAction', displayName: definition.label, displayNameRu: definition.labelRu, description: definition.description, descriptionRu: definition.descriptionRu, children: [], parameters: createDefaultParameters('SetAction'), inputBindings: {}, outputBindings: {} });
      node.children.push(id);
      nodePositions[id] = { x: position.x + 270, y: position.y + 40 };
      selectedNodeId = id;
      break;
    }
    case 'duplicate': duplicateSelectedNode(); return;
    case 'set-link-source': uiState.linkSourceNodeId = node.id; saveUiState(); break;
    case 'link-source-to-this': if (uiState.linkSourceNodeId) addLink(uiState.linkSourceNodeId, node.id); uiState.linkSourceNodeId = null; break;
    case 'center': centerNode(node.id); return;
    case 'unlink-outgoing': node.children = []; break;
    case 'unlink-incoming': removeAllIncomingLinks(node.id); return;
    case 'delete': deleteSelectedNode(); return;
  }
  saveGraph();
  savePositions();
  render();
}

function duplicateSelectedNode(): void {
  const node = findSelectedNode();
  const id = makeUniqueNodeId(node.type);
  const position = getNodePosition(node.id);
  editorGraph.nodes.push({
    ...node,
    id,
    children: [...node.children],
    parameters: { ...node.parameters },
    inputBindings: { ...node.inputBindings },
    outputBindings: { ...node.outputBindings },
    displayName: `${node.displayName} Copy`,
    displayNameRu: `${node.displayNameRu} копия`,
  });
  nodePositions[id] = { x: position.x + 240, y: position.y + 36 };
  selectedNodeId = id;
  saveGraph();
  savePositions();
  render();
}

function centerNode(nodeId: string): void {
  const position = getNodePosition(nodeId);
  const rect = document.querySelector<HTMLElement>('#graph-workspace')?.getBoundingClientRect();
  if (rect) {
    uiState.panX = Math.round(rect.width / 2 - (position.x + NODE_WIDTH / 2) * uiState.zoom);
    uiState.panY = Math.round(rect.height / 2 - (position.y + NODE_HEIGHT / 2) * uiState.zoom);
    saveUiState();
  }
  render();
}

function saveSelectedNodeFromInspector(): void {
  const node = findSelectedNode();
  const nextDisplay = document.querySelector<HTMLInputElement>('#node-display-name')?.value.trim();
  const nextDisplayRu = document.querySelector<HTMLInputElement>('#node-display-name-ru')?.value.trim();
  const nextDescription = document.querySelector<HTMLTextAreaElement>('#node-description')?.value;
  const nextDescriptionRu = document.querySelector<HTMLTextAreaElement>('#node-description-ru')?.value;
  const paramsRaw = document.querySelector<HTMLTextAreaElement>('#node-parameters')?.value ?? '{}';
  try {
    const parsed: unknown = JSON.parse(paramsRaw);
    if (!isRecord(parsed)) throw new Error('parameters must be an object');
    node.displayName = nextDisplay || node.displayName;
    node.displayNameRu = nextDisplayRu || node.displayNameRu;
    node.description = nextDescription;
    node.descriptionRu = nextDescriptionRu;
    const contractContainer = document.querySelector<HTMLElement>('#contract-parameter-fields');
    const contractParameters = contractContainer ? readContractParameterFields(contractContainer, parsed) : parsed;
    const selectedSubgraph = document.querySelector<HTMLSelectElement>('#stateful-subgraph-id')?.value ?? document.querySelector<HTMLSelectElement>('#inspector-subgraph-id')?.value;
    if (node.type === 'Subgraph' && selectedSubgraph) {
      contractParameters.subgraphId = selectedSubgraph;
      contractParameters.cancelPolicy = 'cancel_child';
    }
    node.parameters = contractParameters as JsonObject;
    saveGraph();
    validationText = `Нода сохранена: ${node.id}`;
    render();
  } catch (error) {
    validationText = `Ошибка JSON параметров: ${error instanceof Error ? error.message : String(error)}`;
    uiState.bottomOpen = true;
    uiState.bottomTab = 'console';
    render();
  }
}

function deleteSelectedNode(): void {
  if (selectedNodeId === editorGraph.rootNodeId) return;
  const deleting = selectedNodeId;
  editorGraph.nodes = editorGraph.nodes.filter((node) => node.id !== deleting);
  for (const node of editorGraph.nodes) {
    node.children = node.children.filter((child) => child !== deleting);
    node.inputBindings = Object.fromEntries(Object.entries(node.inputBindings).filter(([, binding]) => binding.source !== 'node' || binding.nodeId !== deleting));
  }
  delete nodePositions[deleting];
  selectedNodeId = ensureSelectedNodeId(editorGraph.rootNodeId);
  saveGraph();
  savePositions();
  render();
}

function resetGraphToBundled(): void {
  editorGraph = loadEditorGraphV2(graphData as unknown);
  nodePositions = { ...initialNodePositions };
  selectedNodeId = editorGraph.rootNodeId;
  saveGraph();
  savePositions();
  validationText = 'Поле очищено: осталась только нода «Старт».';
  render();
}

function exportGraphJson(): void {
  const blob = new Blob([JSON.stringify(editorGraph, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${editorGraph.id || 'ai-graph'}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importGraphFromFileInput(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      editorGraph = loadEditorGraphV2(JSON.parse(String(reader.result)));
      ensurePositionsForGraph();
      selectedNodeId = ensureSelectedNodeId(editorGraph.rootNodeId);
      saveGraph();
      savePositions();
      validationText = `Импортирован ${file.name} · Graph v2`;
      render();
    } catch (error) {
      validationText = `Ошибка импорта: ${error instanceof Error ? error.message : String(error)}`;
      render();
    }
  };
  reader.readAsText(file, 'utf-8');
}

async function refreshEngineStatus(): Promise<void> {
  try {
    const health = await fetchJson<EngineHealthPayload>(`${ENGINE_BASE_URL}/engine/health`);
    engineOnline = Boolean(health.ok);
    lastHealthText = engineOnline ? `Движок подключён · text=${health.textBase ?? 'en'} · overlay=${health.overlayLanguage ?? 'ru'}` : 'Движок ответил ошибкой';
  } catch {
    engineOnline = false;
    lastHealthText = 'Движок не запущен · Run-AI-Node-Editor.bat';
  }
  render();
}

async function evaluateOnceThroughEngine(): Promise<void> {
  const request: EngineEvaluateRequest = { graph: editorGraph, unitId: 'soldier_editor_preview', blackboard: editorGraph.blackboardDefaults, hasOrder: false };
  try {
    const payload = await fetchJson<EngineEvaluationPayload>(`${ENGINE_BASE_URL}/ai/graph/evaluate-once`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
    evaluationText = JSON.stringify(payload, null, 2);
  } catch (error) {
    evaluationText = `Вычисление не выполнено: ${error instanceof Error ? error.message : String(error)}`;
  }
  render();
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return await response.json() as T;
}

function togglePalette(): void { uiState.paletteOpen = !uiState.paletteOpen; saveUiState(); render(); }
function toggleInspector(): void { uiState.inspectorOpen = !uiState.inspectorOpen; saveUiState(); render(); }
function toggleBottomPanel(): void { uiState.bottomOpen = !uiState.bottomOpen; saveUiState(); render(); }
function setBottomTab(tab: BottomTab): void { uiState.bottomTab = tab; uiState.bottomOpen = true; saveUiState(); render(); }

export function setPaletteFilter(filter: PaletteFilter): void {
  if (!isPaletteFilter(filter)) return;
  uiState.paletteFilter = filter;
  saveUiState();
  render();
}

export function setPaletteSearch(value: string): void {
  paletteSearch = value;
  render();
  queueMicrotask(() => {
    const input = document.querySelector<HTMLInputElement>('#palette-search');
    if (!input) return;
    input.focus();
    input.setSelectionRange(value.length, value.length);
  });
}

export function toggleFavoriteNodeType(type: string): void {
  if (!validNodeTypes.has(type)) return;
  if (favoriteNodeTypes.has(type)) favoriteNodeTypes.delete(type);
  else favoriteNodeTypes.add(type);
  saveFavoriteNodeTypes(favoriteNodeTypes);
  render();
}

function findSelectedNode(): EditableAiNode {
  return editorGraph.nodes.find((node) => node.id === selectedNodeId) ?? editorGraph.nodes[0];
}

function ensureSelectedNodeId(preferred: string): string {
  return editorGraph.nodes.some((node) => node.id === preferred) ? preferred : editorGraph.nodes[0]?.id ?? 'root';
}

function getNodePosition(nodeId: string): NodePosition {
  return nodePositions[nodeId] ?? initialNodePositions[nodeId] ?? { x: 140, y: 140 };
}

function getNodeCategory(node: EditableAiNode): AiNodeCategory {
  return AI_NODE_TYPE_DEFINITIONS[node.type]?.category ?? 'debug';
}

function getNodeTitle(node: EditableAiNode): string {
  if (uiState.languageMode === 'en') return node.displayName;
  if (uiState.languageMode === 'both') return `${node.displayNameRu} / ${node.displayName}`;
  return node.displayNameRu || node.displayName;
}

function getNodeSubtitle(node: EditableAiNode): string {
  const definition = AI_NODE_TYPE_DEFINITIONS[node.type];
  if (uiState.languageMode === 'en') return definition?.description ?? node.type;
  if (uiState.languageMode === 'both') return `${definition?.descriptionRu ?? node.type} / ${definition?.description ?? node.type}`;
  return definition?.descriptionRu ?? node.type;
}

function getNodeVisibleDescription(node: EditableAiNode): string {
  if (uiState.languageMode === 'en') return node.description ?? '';
  if (uiState.languageMode === 'both') return `${node.descriptionRu ?? ''}\n${node.description ?? ''}`.trim();
  return node.descriptionRu ?? node.description ?? '';
}

function getDefinitionTitle(definition: (typeof AI_NODE_TYPE_DEFINITIONS)[string]): string {
  if (uiState.languageMode === 'en') return definition.label;
  if (uiState.languageMode === 'both') return `${definition.labelRu} / ${definition.label}`;
  return definition.labelRu;
}

function localized(ru: string, en: string): string {
  if (uiState.languageMode === 'en') return en;
  if (uiState.languageMode === 'both') return `${ru} / ${en}`;
  return ru;
}

function isPortEvent(event: PointerEvent): boolean {
  return Boolean((event.target as HTMLElement).closest('.node-port, .node-data-port, .node-input-link-control, .incoming-link-menu'));
}

function loadStoredGraph(): EditableAiGraph | null {
  try {
    const raw = localStorage.getItem(GRAPH_STORAGE_KEY);
    if (!raw) return null;
    const graph = loadEditorGraphV2(JSON.parse(raw));
    localStorage.setItem(GRAPH_STORAGE_KEY, JSON.stringify(graph));
    return graph;
  } catch {
    return null;
  }
}

function loadEditorGraphV2(value: unknown): EditableAiGraph {
  const migration = migrateAiGraphToV2(value);
  if (!migration.ok) throw new Error(migration.issues.map((issue) => issue.messageRu).join(' '));
  return normalizeGraph(migration.graph);
}

function loadStoredPositions(): Record<string, NodePosition> {
  try {
    const raw = localStorage.getItem(POSITION_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return isRecord(parsed) ? parsed as Record<string, NodePosition> : { ...initialNodePositions };
  } catch {
    return { ...initialNodePositions };
  }
}

function loadStoredUiState(): EditorUiState {
  const defaults: EditorUiState = {
    paletteOpen: true,
    inspectorOpen: true,
    bottomOpen: false,
    bottomTab: 'console',
    zoom: 1,
    panX: 0,
    panY: 0,
    languageMode: 'ru',
    nodeDetailMode: 'compact',
    linkSourceNodeId: null,
    paletteFilter: 'all',
  };
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(UI_STORAGE_KEY) ?? '{}');
    if (!isRecord(parsed)) return defaults;
    return {
      paletteOpen: typeof parsed.paletteOpen === 'boolean' ? parsed.paletteOpen : defaults.paletteOpen,
      inspectorOpen: typeof parsed.inspectorOpen === 'boolean' ? parsed.inspectorOpen : defaults.inspectorOpen,
      bottomOpen: typeof parsed.bottomOpen === 'boolean' ? parsed.bottomOpen : defaults.bottomOpen,
      bottomTab: parsed.bottomTab === 'json' ? 'json' : 'console',
      zoom: typeof parsed.zoom === 'number' ? parsed.zoom : 1,
      panX: typeof parsed.panX === 'number' ? parsed.panX : 0,
      panY: typeof parsed.panY === 'number' ? parsed.panY : 0,
      languageMode: parsed.languageMode === 'en' || parsed.languageMode === 'both' ? parsed.languageMode : 'ru',
      nodeDetailMode: parsed.nodeDetailMode === 'detailed' ? 'detailed' : 'compact',
      linkSourceNodeId: typeof parsed.linkSourceNodeId === 'string' ? parsed.linkSourceNodeId : null,
      paletteFilter: typeof parsed.paletteFilter === 'string' && isPaletteFilter(parsed.paletteFilter) ? parsed.paletteFilter : 'all',
    };
  } catch {
    return defaults;
  }
}

function isPaletteFilter(value: string): value is PaletteFilter {
  return value === 'all' || value === 'favorites' || CATEGORIES.includes(value as AiNodeCategory);
}

function saveGraph(): void {
  if (graphNavigation.length === 0) localStorage.setItem(GRAPH_STORAGE_KEY, JSON.stringify(editorGraph));
}

function savePositions(): void { localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(nodePositions)); }
function saveUiState(): void { localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(uiState)); }

function ensurePositionsForGraph(): void {
  for (const node of editorGraph.nodes) {
    if (!nodePositions[node.id]) nodePositions[node.id] = initialNodePositions[node.id] ?? { x: 140 + editorGraph.nodes.indexOf(node) * 240, y: 140 };
  }
}

function normalizeGraph(value: unknown): EditableAiGraph {
  const raw = value as Partial<EditableAiGraph>;
  const nodes = Array.isArray(raw.nodes) ? raw.nodes.map(normalizeNode) : [];
  if (nodes.length === 0) nodes.push({ id: 'root', type: 'Root', displayName: 'Start', displayNameRu: 'Старт', description: '', descriptionRu: '', children: [], parameters: {}, inputBindings: {}, outputBindings: {} });
  return {
    version: 2,
    id: String(raw.id ?? 'soldier_graph'),
    name: String(raw.name ?? 'Soldier Graph'),
    nameRu: typeof raw.nameRu === 'string' ? raw.nameRu : 'Граф солдата',
    description: typeof raw.description === 'string' ? raw.description : '',
    descriptionRu: typeof raw.descriptionRu === 'string' ? raw.descriptionRu : '',
    rootNodeId: String(raw.rootNodeId ?? nodes[0].id),
    blackboardDefaults: isRecord(raw.blackboardDefaults) ? raw.blackboardDefaults as JsonObject : {},
    blackboardSchema: Array.isArray(raw.blackboardSchema) ? raw.blackboardSchema : [],
    subgraphRefs: Array.isArray(raw.subgraphRefs) ? raw.subgraphRefs.filter((item): item is string => typeof item === 'string') : [],
    legacyMetadata: isRecord(raw.legacyMetadata) ? raw.legacyMetadata : undefined,
    nodes,
  };
}

function normalizeNode(value: unknown): EditableAiNode {
  const raw = value as Partial<EditableAiNode>;
  const type = String(raw.type ?? 'Root');
  const definition = AI_NODE_TYPE_DEFINITIONS[type];
  return {
    id: String(raw.id ?? makeUniqueNodeId(type)),
    type,
    displayName: String(raw.displayName ?? definition?.label ?? raw.type ?? 'Node'),
    displayNameRu: String(raw.displayNameRu ?? definition?.labelRu ?? raw.type ?? 'Нода'),
    description: typeof raw.description === 'string' ? raw.description : definition?.description ?? '',
    descriptionRu: typeof raw.descriptionRu === 'string' ? raw.descriptionRu : definition?.descriptionRu ?? '',
    children: Array.isArray(raw.children) ? raw.children.filter((child): child is string => typeof child === 'string') : [],
    parameters: isRecord(raw.parameters) ? raw.parameters as JsonObject : {},
    inputBindings: isRecord(raw.inputBindings) ? raw.inputBindings as Record<string, AiInputBinding> : {},
    outputBindings: isRecord(raw.outputBindings) ? raw.outputBindings as Record<string, AiOutputBinding> : {},
  };
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function escapeAttribute(value: string): string { return escapeHtml(value); }
function cssEscape(value: string): string { return value.replace(/(["\\])/g, '\\$1'); }
function shorten(value: string, max: number): string { return value.length > max ? `${value.slice(0, max)}…` : value; }
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
function round2(value: number): number { return Math.round(value * 100) / 100; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
