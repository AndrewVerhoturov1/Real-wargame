import './ai-node-editor.css';
import './ai-node-editor-authoring.css';
import graphData from '../data/ai/soldier_default_survival_graph.json';
import { AI_NODE_TYPE_DEFINITIONS, type AiNodeCategory } from '../core/ai/AiNodeTypes';
import { createContractDefaultParameters } from '../core/ai/contracts/AiNodeContractRegistry';
import { migrateAiGraphToV2 } from '../core/ai/contracts/AiGraphMigration';
import { validateAiGraph, type AiGraphValidationIssue } from '../core/ai/AiGraphValidation';
import type { AiInputBinding, AiOutputBinding } from '../core/ai/contracts/AiPortTypes';
import { getNodeContractUiModel, canConnectPorts, explainPortIncompatibilityRu, renderContractParameterFields, readContractParameterFields } from './node-contract-ui';
import { getSubgraphChoice, getSubgraphGraph, listSubgraphChoices } from './subgraph-ui';

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
const editorRoot = root;


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
  inputBindings: Record<string, AiInputBinding>;
  outputBindings: Record<string, AiOutputBinding>;
}

interface EditableAiGraph {
  version: 1 | 2;
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
let lastValidationIssues: AiGraphValidationIssue[] = [];
const graphNavigation: GraphNavigationEntry[] = [];

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
          <span class="graph-version-badge ${editorGraph.version === 2 ? 'v2' : 'v1'}">Graph v${editorGraph.version}</span>
          <button id="migrate-graph" class="ai-editor-button primary" type="button">Проверить и обновить формат графа</button>
          <button id="validate-graph" class="ai-editor-button" type="button">Проверить</button>
          <button id="evaluate-once" class="ai-editor-button" type="button">Evaluate</button>
          <button id="export-graph" class="ai-editor-button" type="button">Export</button>
          <button id="import-graph" class="ai-editor-button" type="button">Import</button>
          <button id="reset-graph" class="ai-editor-button danger" type="button">Reset</button>
          <input id="import-graph-file" type="file" accept="application/json,.json" hidden />
        </div>
      </header>
      ${editorGraph.version === 1 ? '<div class="graph-v1-warning">Этот граф использует старый формат Graph v1. Нажмите «Проверить и обновить формат графа» — исходные данные будут сохранены.</div>' : ''}
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
      <div class="graph-breadcrumb">${renderGraphBreadcrumb()}</div>
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
    const model = getNodeContractUiModel(node);
    const inputPorts = model.inputs.map((port, index) => `<button class="node-data-port in" data-port-kind="data-in" data-node-id="${escapeHtml(node.id)}" data-port-id="${escapeHtml(port.id)}" data-port-value-kind="${port.kind}" style="top:${58 + index * 22}px" title="${escapeAttribute(port.labelRu)} · ${port.kind}"><span>${escapeHtml(port.labelRu)}</span></button>`).join('');
    const outputPorts = model.outputs.map((port, index) => `<button class="node-data-port out" data-port-kind="data-out" data-node-id="${escapeHtml(node.id)}" data-port-id="${escapeHtml(port.id)}" data-port-value-kind="${port.kind}" style="top:${58 + index * 22}px" title="${escapeAttribute(port.labelRu)} · ${port.kind}"><span>${escapeHtml(port.labelRu)}</span></button>`).join('');
    const height = Math.max(NODE_HEIGHT, 88 + Math.max(model.inputs.length, model.outputs.length) * 22);
    return `
      <article class="graph-node ${category} ${selected} ${uiState.nodeDetailMode}" data-node-id="${escapeHtml(node.id)}" style="left:${position.x}px; top:${position.y}px; min-height:${height}px;">
        <button class="node-port in" data-port-kind="flow-in" data-port-id="flow" data-node-id="${escapeHtml(node.id)}" title="Вход управления"></button>
        <button class="node-port out" data-port-kind="flow-out" data-port-id="flow" data-node-id="${escapeHtml(node.id)}" title="Перетащите к дочерней ноде"></button>
        ${inputPorts}${outputPorts}
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
  const parts = ['Главный граф', ...graphNavigation.map((entry) => entry.labelRu)];
  return `${graphNavigation.length ? '<button type="button" data-breadcrumb-back="true" class="mini-button">← К родительскому графу</button>' : ''}<span>${parts.map(escapeHtml).join(' → ')}</span>`;
}

function renderSubgraphInspector(node: EditableAiNode): string {
  if (node.type !== 'Subgraph') return '';
  const selectedId = typeof node.parameters.subgraphId === 'string' ? node.parameters.subgraphId : 'take_cover';
  const selected = getSubgraphChoice(selectedId) ?? listSubgraphChoices()[0];
  return `<section class="subgraph-inspector-summary">
    <label class="inspector-field"><span>Подграф</span><select id="inspector-subgraph-id">${listSubgraphChoices().map((choice) => `<option value="${escapeAttribute(choice.id)}" ${choice.id === selected?.id ? 'selected' : ''}>${escapeHtml(choice.labelRu)} · ${escapeHtml(choice.id)}</option>`).join('')}</select></label>
    <p>${escapeHtml(selected?.descriptionRu ?? '')}</p>
    <strong>Входы</strong><ul>${(selected?.inputs ?? []).map((port) => `<li>${escapeHtml(port.labelRu)} · ${port.kind}${port.required ? ' · обязательно' : ''}</li>`).join('') || '<li>Нет</li>'}</ul>
    <strong>Выходы</strong><ul>${(selected?.outputs ?? []).map((port) => `<li>${escapeHtml(port.labelRu)} · ${port.kind}</li>`).join('') || '<li>Нет</li>'}</ul>
    <p class="toolbar-note">Двойной клик по карточке открывает содержимое подграфа.</p>
  </section>`;
}

function renderValidationIssues(): string {
  if (lastValidationIssues.length === 0) return '<p class="toolbar-note">Ошибок проверки пока нет.</p>';
  return `<div class="graph-validation-list">${lastValidationIssues.map((issue) => `<button type="button" class="graph-validation-issue ${issue.severity}" data-validation-node-id="${escapeAttribute(issue.nodeId ?? '')}" ${issue.nodeId ? '' : 'disabled'}><b>${issue.severity.toUpperCase()} · ${escapeHtml(issue.code)}</b><span>${escapeHtml(issue.messageRu)}</span>${issue.fixRu ? `<small>${escapeHtml(issue.fixRu)}</small>` : ''}</button>`).join('')}</div>`;
}

function validateGraphLocally(): void {
  const result = validateAiGraph(editorGraph);
  lastValidationIssues = [...result.issues];
  validationText = result.valid
    ? `Граф прошёл проверку. Ошибок: 0, предупреждений: ${result.issues.filter((issue) => issue.severity === 'warning').length}.`
    : `Граф нельзя безопасно запустить или сохранить без предупреждения. Ошибок: ${result.issues.filter((issue) => issue.severity === 'error').length}.`;
  uiState.bottomOpen = true;
  uiState.bottomTab = 'console';
  render();
}

function migrateGraphFromUi(): void {
  const migration = migrateAiGraphToV2(editorGraph);
  if (!migration.ok) {
    lastValidationIssues = migration.issues.map((issue) => ({ ...issue }));
    validationText = migration.issues.map((issue) => issue.messageRu).join('\n');
    uiState.bottomOpen = true;
    render();
    return;
  }
  const migrated = normalizeGraph(migration.graph);
  const validation = validateAiGraph(migration.graph);
  lastValidationIssues = [...validation.issues];
  if (!validation.valid) {
    validationText = 'Миграция подготовлена, но Graph v2 содержит ошибки. Старый граф не перезаписан.';
    uiState.bottomOpen = true;
    render();
    return;
  }
  editorGraph = migrated;
  selectedNodeId = ensureSelectedNodeId(editorGraph.rootNodeId);
  saveGraph();
  validationText = migration.migrated ? 'Graph v1 успешно обновлён до Graph v2. Неизвестные старые данные сохранены в legacyMetadata.' : 'Graph v2 уже актуален и прошёл проверку.';
  uiState.bottomOpen = true;
  render();
}

function openSelectedSubgraph(nodeId: string): void {
  const node = editorGraph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node || node.type !== 'Subgraph') return;
  const subgraphId = typeof node.parameters.subgraphId === 'string' ? node.parameters.subgraphId : 'take_cover';
  const graph = getSubgraphGraph(subgraphId);
  const choice = getSubgraphChoice(subgraphId);
  if (!graph || !choice) return;
  graphNavigation.push({ graph: normalizeGraph(JSON.parse(JSON.stringify(editorGraph))), positions: JSON.parse(JSON.stringify(nodePositions)) as Record<string, NodePosition>, selectedNodeId, labelRu: choice.labelRu });
  editorGraph = normalizeGraph(graph);
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
      ${renderSubgraphInspector(node)}
      <details open><summary>Параметры ноды</summary><div id="contract-parameter-fields">${renderContractParameterFields(node)}</div></details>
      <details><summary>Технический JSON · резервный режим</summary><label class="inspector-field">parameters<textarea id="node-parameters" rows="6">${escapeHtml(JSON.stringify(node.parameters, null, 2))}</textarea></label></details>
      <button id="save-node" class="ai-editor-button primary" type="button">Сохранить ноду</button>
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
  return `<footer class="ai-editor-bottom expanded-bottom"><div class="bottom-tabs"><button id="bottom-tab-console" class="bottom-tab ${consoleActive}" type="button">Console</button><button id="bottom-tab-json" class="bottom-tab ${jsonActive}" type="button">Graph JSON</button><button id="toggle-bottom" class="bottom-tab" type="button">▼ Hide</button></div><section class="bottom-box ${uiState.bottomTab === 'console' ? '' : 'hidden'}"><h2>Проверка графа</h2>${renderValidationIssues()}<pre>${escapeHtml(validationText)}</pre></section><section class="bottom-box ${uiState.bottomTab === 'json' ? '' : 'hidden'}"><h2>Graph JSON preview</h2><pre>${escapeHtml(JSON.stringify(editorGraph, null, 2))}</pre></section></footer>`;
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
  document.querySelector<HTMLButtonElement>('#migrate-graph')?.addEventListener('click', migrateGraphFromUi);
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

  document.querySelectorAll<HTMLElement>('[data-node-id].graph-node').forEach((element) => {
    element.addEventListener('pointerdown', (event) => { if (!isPortEvent(event)) startDrag(event, element.dataset.nodeId ?? ''); });
    element.addEventListener('click', () => { if (!dragState?.moved && element.dataset.nodeId) selectNode(element.dataset.nodeId); });
    element.addEventListener('contextmenu', (event) => { event.preventDefault(); if (element.dataset.nodeId) { selectedNodeId = element.dataset.nodeId; contextMenuState = { nodeId: element.dataset.nodeId, x: event.clientX, y: event.clientY }; render(); } });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-port-kind="flow-out"], [data-port-kind="data-out"]').forEach((button) => button.addEventListener('pointerdown', (event) => { if (button.dataset.nodeId && button.dataset.portId) startConnectionDrag(event, button.dataset.nodeId, button.dataset.portId, button.dataset.portKind === 'data-out' ? 'data' : 'flow'); }));
  document.querySelectorAll<HTMLButtonElement>('[data-palette-type]').forEach((button) => button.addEventListener('click', () => { if (button.dataset.paletteType) addNodeFromPalette(button.dataset.paletteType); }));
  document.querySelectorAll<HTMLButtonElement>('[data-unlink-child]').forEach((button) => button.addEventListener('click', () => { if (button.dataset.unlinkChild) unlinkChild(selectedNodeId, button.dataset.unlinkChild); }));
  document.querySelectorAll<HTMLButtonElement>('[data-validation-node-id]').forEach((button) => button.addEventListener('click', () => { const id=button.dataset.validationNodeId; if(id) selectNode(id); }));
  document.querySelectorAll<HTMLButtonElement>('[data-breadcrumb-back]').forEach((button) => button.addEventListener('click', returnToParentGraph));
  document.querySelectorAll<HTMLElement>('.graph-node[data-node-id]').forEach((element) => element.addEventListener('dblclick', () => { if(element.dataset.nodeId) openSelectedSubgraph(element.dataset.nodeId); }));
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

function startConnectionDrag(event: PointerEvent, sourceNodeId: string, sourcePortId: string, kind: 'flow' | 'data'): void {
  event.preventDefault();
  event.stopPropagation();
  const world = screenToWorld(event.clientX, event.clientY);
  connectionState = { sourceNodeId, sourcePortId, kind, currentX: world.x, currentY: world.y };
  window.addEventListener('pointermove', onConnectionMove);
  window.addEventListener('pointerup', onConnectionEnd, { once: true });
}

function onConnectionMove(event: PointerEvent): void { if (connectionState) { const world = screenToWorld(event.clientX, event.clientY); connectionState.currentX = world.x; connectionState.currentY = world.y; updateSvgPaths(); } }
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
  if (!targetPortId) { validationText = 'Перетащите типизированное значение точно на совместимый вход.'; uiState.bottomOpen=true; render(); return; }
  connectTypedPorts(state.sourceNodeId, state.sourcePortId, targetNodeId, targetPortId);
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
  editorGraph.nodes.push({ id, type, displayName: definition.label, displayNameRu: definition.labelRu, description: definition.description, descriptionRu: definition.descriptionRu, children: [], parameters: createDefaultParameters(type), inputBindings: {}, outputBindings: {} });
  nodePositions[id] = { x: selectedPosition.x + 270, y: selectedPosition.y + Math.max(0, editorGraph.nodes.length % 5) * 118 };
  selectedNodeId = id;
  uiState.inspectorOpen = true;
  saveGraph(); savePositions(); render();
}

function createDefaultParameters(type: string): JsonObject { return createContractDefaultParameters(type) as JsonObject; }

function makeUniqueNodeId(type: string): string { const base = type.replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase(); let index = 1; let id = `${base}_${index}`; const used = new Set(editorGraph.nodes.map((node) => node.id)); while (used.has(id)) { index += 1; id = `${base}_${index}`; } return id; }
function addLink(parentId: string, childId: string): void { if (parentId === childId) { render(); return; } const parent = editorGraph.nodes.find((node) => node.id === parentId); if (!parent) return; if (!parent.children.includes(childId)) parent.children.push(childId); selectedNodeId = childId; uiState.inspectorOpen = true; saveGraph(); render(); }
function connectTypedPorts(sourceNodeId:string,sourcePortId:string,targetNodeId:string,targetPortId:string):void{const source=editorGraph.nodes.find(n=>n.id===sourceNodeId),target=editorGraph.nodes.find(n=>n.id===targetNodeId);if(!source||!target)return;const output=getNodeContractUiModel(source).outputs.find(p=>p.id===sourcePortId),input=getNodeContractUiModel(target).inputs.find(p=>p.id===targetPortId);if(!output||!input)return;if(!canConnectPorts(output,input)){validationText=explainPortIncompatibilityRu(output.kind,input.kind,output.labelRu,input.labelRu);uiState.bottomOpen=true;uiState.bottomTab='console';render();return;}target.inputBindings[targetPortId]={source:'node',nodeId:sourceNodeId,port:sourcePortId};validationText=`Соединено: ${output.labelRu} → ${input.labelRu}.`;selectedNodeId=targetNodeId;saveGraph();render();}
function unlinkChild(parentId: string, childId: string): void { const parent = editorGraph.nodes.find((node) => node.id === parentId); if (!parent) return; parent.children = parent.children.filter((id) => id !== childId); saveGraph(); render(); }
function linkSelectedNodeToChosenChild(): void { const targetId = document.querySelector<HTMLSelectElement>('#link-target-select')?.value; if (targetId) addLink(selectedNodeId, targetId); }

function handleContextMenuAction(action: string): void {
  const node = findSelectedNode();
  contextMenuState = null;
  switch (action) {
    case 'select': selectNode(node.id); return;
    case 'add-child': { const id = makeUniqueNodeId('SetAction'); const position = getNodePosition(node.id); const definition = AI_NODE_TYPE_DEFINITIONS.SetAction; editorGraph.nodes.push({ id, type: 'SetAction', displayName: definition.label, displayNameRu: definition.labelRu, description: definition.description, descriptionRu: definition.descriptionRu, children: [], parameters: createDefaultParameters('SetAction'), inputBindings: {}, outputBindings: {} }); node.children.push(id); nodePositions[id] = { x: position.x + 270, y: position.y + 40 }; selectedNodeId = id; break; }
    case 'duplicate': duplicateSelectedNode(); return;
    case 'set-link-source': uiState.linkSourceNodeId = node.id; saveUiState(); break;
    case 'link-source-to-this': if (uiState.linkSourceNodeId) addLink(uiState.linkSourceNodeId, node.id); uiState.linkSourceNodeId = null; break;
    case 'center': centerNode(node.id); return;
    case 'unlink-all': node.children = []; break;
    case 'delete': deleteSelectedNode(); return;
  }
  saveGraph(); savePositions(); render();
}

function duplicateSelectedNode(): void { const node = findSelectedNode(); const id = makeUniqueNodeId(node.type); const position = getNodePosition(node.id); editorGraph.nodes.push({ ...node, id, children: [...node.children], parameters: { ...node.parameters }, inputBindings: { ...node.inputBindings }, outputBindings: { ...node.outputBindings }, displayName: `${node.displayName} Copy`, displayNameRu: `${node.displayNameRu} копия` }); nodePositions[id] = { x: position.x + 240, y: position.y + 36 }; selectedNodeId = id; saveGraph(); savePositions(); render(); }
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
    const contractContainer=document.querySelector<HTMLElement>('#contract-parameter-fields');
    const contractParameters=contractContainer?readContractParameterFields(contractContainer,parsed):parsed;
    const selectedSubgraph = document.querySelector<HTMLSelectElement>('#stateful-subgraph-id')?.value
      ?? document.querySelector<HTMLSelectElement>('#inspector-subgraph-id')?.value;
    if (node.type === 'Subgraph' && selectedSubgraph) {
      contractParameters.subgraphId = selectedSubgraph;
      contractParameters.cancelPolicy = 'cancel_child';
    }
    node.parameters = contractParameters as JsonObject;
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
async function validateGraphThroughEngine(): Promise<void> { validateGraphLocally(); }
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
function saveGraph(): void { if(graphNavigation.length===0)localStorage.setItem(GRAPH_STORAGE_KEY, JSON.stringify(editorGraph)); }
function savePositions(): void { localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(nodePositions)); }
function saveUiState(): void { localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(uiState)); }
function ensurePositionsForGraph(): void { for (const node of editorGraph.nodes) if (!nodePositions[node.id]) nodePositions[node.id] = initialNodePositions[node.id] ?? { x: 140 + editorGraph.nodes.indexOf(node) * 240, y: 140 }; }

function normalizeGraph(value: unknown): EditableAiGraph { const raw=value as Partial<EditableAiGraph>;const nodes=Array.isArray(raw.nodes)?raw.nodes.map(normalizeNode):[];if(nodes.length===0)nodes.push({id:'root',type:'Root',displayName:'Start',displayNameRu:'Старт',description:'',descriptionRu:'',children:[],parameters:{},inputBindings:{},outputBindings:{}});return{version:raw.version===2?2:1,id:String(raw.id??'soldier_graph'),name:String(raw.name??'Soldier Graph'),nameRu:typeof raw.nameRu==='string'?raw.nameRu:'Граф солдата',description:typeof raw.description==='string'?raw.description:'',descriptionRu:typeof raw.descriptionRu==='string'?raw.descriptionRu:'',rootNodeId:String(raw.rootNodeId??nodes[0].id),blackboardDefaults:isRecord(raw.blackboardDefaults)?raw.blackboardDefaults as JsonObject:{},blackboardSchema:Array.isArray(raw.blackboardSchema)?raw.blackboardSchema:[],subgraphRefs:Array.isArray(raw.subgraphRefs)?raw.subgraphRefs.filter((item):item is string=>typeof item==='string'):[],legacyMetadata:isRecord(raw.legacyMetadata)?raw.legacyMetadata:undefined,nodes};}
function normalizeNode(value:unknown):EditableAiNode{const raw=value as Partial<EditableAiNode>;const definition=AI_NODE_TYPE_DEFINITIONS[String(raw.type??'Root') as keyof typeof AI_NODE_TYPE_DEFINITIONS];return{id:String(raw.id??makeUniqueNodeId(String(raw.type??'Root'))),type:String(raw.type??'Root'),displayName:String(raw.displayName??definition?.label??raw.type??'Node'),displayNameRu:String(raw.displayNameRu??definition?.labelRu??raw.type??'Нода'),description:typeof raw.description==='string'?raw.description:definition?.description??'',descriptionRu:typeof raw.descriptionRu==='string'?raw.descriptionRu:definition?.descriptionRu??'',children:Array.isArray(raw.children)?raw.children.filter((child):child is string=>typeof child==='string'):[],parameters:isRecord(raw.parameters)?raw.parameters as JsonObject:{},inputBindings:isRecord(raw.inputBindings)?raw.inputBindings as Record<string,AiInputBinding>:{},outputBindings:isRecord(raw.outputBindings)?raw.outputBindings as Record<string,AiOutputBinding>:{}};}

function escapeHtml(value: string): string { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;'); }
function escapeAttribute(value: string): string { return escapeHtml(value); }
function cssEscape(value: string): string { return value.replace(/(["\\])/g, '\\$1'); }
function shorten(value: string, max: number): string { return value.length > max ? `${value.slice(0, max)}…` : value; }
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
function round2(value: number): number { return Math.round(value * 100) / 100; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
