import './ai-node-editor.css';
import './ai-node-editor-stage4.css';
import graphData from '../data/ai/soldier_default_survival_graph.json';
import { AI_NODE_TYPE_DEFINITIONS, type AiNodeCategory, type AiNodeType } from '../core/ai/AiNodeTypes';

const ENGINE_BASE_URL = 'http://127.0.0.1:8787';
const GRAPH_STORAGE_KEY = 'real-wargame.ai-node-editor.graph.v4';
const POSITION_STORAGE_KEY = 'real-wargame.ai-node-editor.positions.v4';
const root = document.querySelector<HTMLElement>('#ai-node-editor-root');

if (!root) {
  throw new Error('AI node editor root is missing.');
}

type JsonPrimitive = string | number | boolean | null;
type JsonPosition = { x: number; y: number };
type JsonValue = JsonPrimitive | JsonPosition;
type JsonObject = Record<string, JsonValue>;

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

interface NodePosition {
  x: number;
  y: number;
}

interface DragState {
  nodeId: string;
  element: HTMLElement;
  offsetX: number;
  offsetY: number;
}

const initialNodePositions: Record<string, NodePosition> = {
  root: { x: 70, y: 70 },
  soldier_decision: { x: 340, y: 70 },
  critical_survival: { x: 640, y: 30 },
  continue_order: { x: 640, y: 230 },
  observe_area: { x: 640, y: 430 },
  critical_danger_condition: { x: 940, y: 20 },
  critical_stress_condition: { x: 940, y: 125 },
  score_danger_for_cover: { x: 940, y: 230 },
  score_stress_for_cover: { x: 940, y: 335 },
  score_cover_need: { x: 940, y: 440 },
  find_best_cover: { x: 1240, y: 80 },
  move_to_cover: { x: 1240, y: 220 },
  fallback_prone: { x: 1240, y: 360 },
  reason_survival: { x: 1240, y: 500 },
  has_order: { x: 940, y: 650 },
  score_obedience: { x: 940, y: 755 },
  continue_order_action: { x: 1240, y: 720 },
  observe_action: { x: 940, y: 920 },
  reason_observe: { x: 1240, y: 920 },
};

let editorGraph = loadStoredGraph() ?? normalizeGraph(graphData as unknown);
let nodePositions = loadStoredPositions();
let selectedNodeId = ensureSelectedNodeId(editorGraph.rootNodeId);
let engineOnline = false;
let lastHealthText = 'Local engine not checked yet / Движок ещё не проверялся.';
let validationText = 'Press “Auto check 4–5” / Нажми «Автопроверка 4–5». Изменённый граф проверяется через local engine.';
let evaluationText = 'Press “Evaluate once” / Нажми «Evaluate once» для тестового солдата.';
let dragState: DragState | null = null;

ensurePositionsForGraph();
render();
void refreshEngineStatus();

function render(): void {
  ensurePositionsForGraph();
  const selectedNode = findSelectedNode();
  root.innerHTML = `
    <section class="ai-editor-shell">
      <header class="ai-editor-topbar">
        <div class="ai-editor-title">
          <h1>Soldier AI Node Editor <span>Редактор ИИ солдата</span></h1>
          <p>English data contract + Russian overlay. Browser edits the graph; local engine validates and evaluates.</p>
        </div>
        <div class="ai-editor-actions">
          <div id="engine-status" class="engine-status ${engineOnline ? 'online' : 'offline'}">
            <i class="engine-status-dot" aria-hidden="true"></i>
            <span>${escapeHtml(lastHealthText)}</span>
          </div>
          <button id="refresh-engine" class="ai-editor-button" type="button">Check engine</button>
          <button id="run-check-45" class="ai-editor-button primary" type="button">Auto check 4–5</button>
          <button id="validate-graph" class="ai-editor-button" type="button">Validate graph</button>
          <button id="evaluate-once" class="ai-editor-button" type="button">Evaluate once</button>
          <button id="export-graph" class="ai-editor-button" type="button">Export JSON</button>
          <button id="import-graph" class="ai-editor-button" type="button">Import JSON</button>
          <button id="reset-graph" class="ai-editor-button danger" type="button">Reset</button>
          <input id="import-graph-file" type="file" accept="application/json,.json" hidden />
        </div>
      </header>
      <main class="ai-editor-main">
        <aside class="ai-editor-panel" aria-label="Node palette">
          ${renderPalette()}
        </aside>
        <section class="graph-workspace" aria-label="Soldier behavior graph">
          ${renderEdges()}
          ${renderGraphNodes()}
        </section>
        <aside class="ai-editor-panel right" aria-label="Node inspector">
          ${renderInspector(selectedNode)}
          ${renderEngineResultCard()}
        </aside>
      </main>
      <footer class="ai-editor-bottom">
        <section class="bottom-box">
          <h2>Validation / Engine result</h2>
          <pre>${escapeHtml(validationText)}</pre>
        </section>
        <section class="bottom-box">
          <h2>Graph JSON preview</h2>
          <pre>${escapeHtml(JSON.stringify(editorGraph, null, 2))}</pre>
        </section>
      </footer>
    </section>
  `;

  installEventHandlers();
}

function renderPalette(): string {
  const definitions = Object.values(AI_NODE_TYPE_DEFINITIONS);
  const categories: AiNodeCategory[] = ['flow', 'condition', 'score', 'query', 'action', 'memory', 'debug'];
  return `
    <div class="panel-title">
      <h2>Palette</h2>
      <span>Палитра · ${definitions.length}</span>
    </div>
    <p class="toolbar-note">Click a node type to add it. Нажми тип ноды, чтобы добавить её в граф.</p>
    ${categories.map((category) => {
      const items = definitions.filter((definition) => definition.category === category);
      if (items.length === 0) {
        return '';
      }
      return `
        <section class="node-group">
          <h3>${category.toUpperCase()}</h3>
          ${items.map((definition) => `
            <button class="palette-node" type="button" data-palette-type="${definition.type}">
              <strong>${escapeHtml(definition.label)}</strong>
              <em>${escapeHtml(definition.labelRu)}</em>
              <span>${escapeHtml(definition.description)}</span>
            </button>
          `).join('')}
        </section>
      `;
    }).join('')}
  `;
}

function renderGraphNodes(): string {
  return editorGraph.nodes
    .map((node) => {
      const position = getNodePosition(node.id);
      const category = getNodeCategory(node);
      const selected = node.id === selectedNodeId ? 'selected' : '';
      return `
        <article class="graph-node ${category} ${selected}" data-node-id="${node.id}" style="left:${position.x}px; top:${position.y}px;">
          <span class="node-type-chip">${escapeHtml(category)} / ${escapeHtml(node.type)}</span>
          <h3>${escapeHtml(node.displayNameRu || node.displayName)}</h3>
          <p class="node-secondary">EN: ${escapeHtml(node.displayName)}</p>
          <p>${escapeHtml(node.descriptionRu || node.description || getNodeDescription(node, 'ru'))}</p>
          <div class="node-port-row"><span>id</span><b>${escapeHtml(node.id)}</b></div>
        </article>
      `;
    })
    .join('');
}

function renderEdges(): string {
  return `<svg class="graph-svg" role="img" aria-label="AI graph links">${renderEdgePaths()}</svg>`;
}

function renderEdgePaths(): string {
  const paths: string[] = [];
  for (const node of editorGraph.nodes) {
    const from = getNodePosition(node.id);
    for (const childId of node.children) {
      const child = editorGraph.nodes.find((candidate) => candidate.id === childId);
      if (!child) {
        continue;
      }
      const to = getNodePosition(child.id);
      const startX = from.x + 220;
      const startY = from.y + 50;
      const endX = to.x;
      const endY = to.y + 50;
      const midX = Math.round((startX + endX) / 2);
      paths.push(`<path d="M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}" />`);
    }
  }
  return paths.join('');
}

function renderInspector(node: EditableAiNode): string {
  const childRows = node.children.length > 0
    ? node.children.map((childId) => `
      <div class="child-link-row">
        <code>${escapeHtml(childId)}</code>
        <button class="mini-button" type="button" data-unlink-child="${escapeHtml(childId)}">Remove</button>
      </div>
    `).join('')
    : '<p class="toolbar-note">No children / детей нет.</p>';
  const linkOptions = editorGraph.nodes
    .filter((candidate) => candidate.id !== node.id)
    .map((candidate) => `<option value="${escapeHtml(candidate.id)}">${escapeHtml(candidate.id)} · ${escapeHtml(candidate.displayName)}</option>`)
    .join('');
  const deleteDisabled = node.id === editorGraph.rootNodeId ? 'disabled' : '';
  return `
    <div class="panel-title">
      <h2>Inspector</h2>
      <span>Инспектор · ${escapeHtml(node.id)}</span>
    </div>
    <section class="inspector-card">
      <h3>${escapeHtml(node.displayNameRu || node.displayName)}</h3>
      <div class="inspector-row"><span>id</span><code>${escapeHtml(node.id)}</code></div>
      <div class="inspector-row"><span>type</span><code>${escapeHtml(node.type)}</code></div>
      <div class="inspector-row"><span>category</span><b>${escapeHtml(getNodeCategory(node))}</b></div>
    </section>
    <section class="inspector-card">
      <h3>Edit text / Текст</h3>
      <label class="inspector-field">EN displayName<input id="node-display-name" value="${escapeAttribute(node.displayName)}" /></label>
      <label class="inspector-field">RU displayNameRu<input id="node-display-name-ru" value="${escapeAttribute(node.displayNameRu)}" /></label>
      <label class="inspector-field">EN description<textarea id="node-description" rows="3">${escapeHtml(node.description ?? '')}</textarea></label>
      <label class="inspector-field">RU descriptionRu<textarea id="node-description-ru" rows="3">${escapeHtml(node.descriptionRu ?? '')}</textarea></label>
      <label class="inspector-field">parameters JSON<textarea id="node-parameters" rows="7">${escapeHtml(JSON.stringify(node.parameters, null, 2))}</textarea></label>
      <button id="save-node" class="ai-editor-button primary" type="button">Save node</button>
    </section>
    <section class="inspector-card">
      <h3>Links / Связи</h3>
      <label class="inspector-field">Child node<select id="link-target-select">${linkOptions}</select></label>
      <button id="link-selected-node" class="ai-editor-button" type="button">Link selected → child</button>
      <div class="child-link-list">${childRows}</div>
    </section>
    <section class="inspector-card danger-zone">
      <h3>Danger zone</h3>
      <button id="delete-selected-node" class="ai-editor-button danger" type="button" ${deleteDisabled}>Delete selected node</button>
      <p class="toolbar-note">Root cannot be deleted. Корень удалить нельзя.</p>
    </section>
  `;
}

function renderEngineResultCard(): string {
  return `
    <section class="result-card">
      <h3>Evaluate once</h3>
      <pre>${escapeHtml(evaluationText)}</pre>
    </section>
    <section class="result-card">
      <h3>Stage 4 checks</h3>
      <pre>1. Add a node from Palette.
2. Drag any node and drop it.
3. Select parent + child and press Link.
4. Edit node text/parameters and Save.
5. Validate graph through local engine.
6. Export JSON, reload page, Import JSON back.</pre>
    </section>
  `;
}

function installEventHandlers(): void {
  document.querySelectorAll<HTMLElement>('[data-node-id]').forEach((element) => {
    element.addEventListener('pointerdown', (event) => {
      const nodeId = element.dataset.nodeId;
      if (nodeId) {
        startDrag(event, nodeId, element);
      }
    });
    element.addEventListener('click', () => {
      const nodeId = element.dataset.nodeId;
      if (nodeId) {
        selectedNodeId = nodeId;
        render();
      }
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-palette-type]').forEach((button) => {
    button.addEventListener('click', () => {
      const type = button.dataset.paletteType;
      if (type) {
        addNodeFromPalette(type);
      }
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-unlink-child]').forEach((button) => {
    button.addEventListener('click', () => {
      const childId = button.dataset.unlinkChild;
      if (childId) {
        unlinkChild(selectedNodeId, childId);
      }
    });
  });

  document.querySelector<HTMLButtonElement>('#refresh-engine')?.addEventListener('click', () => {
    void refreshEngineStatus();
  });

  document.querySelector<HTMLButtonElement>('#run-check-45')?.addEventListener('click', () => {
    void runSimpleCheck45();
  });

  document.querySelector<HTMLButtonElement>('#validate-graph')?.addEventListener('click', () => {
    void validateGraphThroughEngine();
  });

  document.querySelector<HTMLButtonElement>('#evaluate-once')?.addEventListener('click', () => {
    void evaluateOnceThroughEngine();
  });

  document.querySelector<HTMLButtonElement>('#save-node')?.addEventListener('click', saveSelectedNodeFromInspector);
  document.querySelector<HTMLButtonElement>('#link-selected-node')?.addEventListener('click', linkSelectedNodeToChosenChild);
  document.querySelector<HTMLButtonElement>('#delete-selected-node')?.addEventListener('click', deleteSelectedNode);
  document.querySelector<HTMLButtonElement>('#export-graph')?.addEventListener('click', exportGraphJson);
  document.querySelector<HTMLButtonElement>('#import-graph')?.addEventListener('click', () => {
    document.querySelector<HTMLInputElement>('#import-graph-file')?.click();
  });
  document.querySelector<HTMLInputElement>('#import-graph-file')?.addEventListener('change', importGraphFromFileInput);
  document.querySelector<HTMLButtonElement>('#reset-graph')?.addEventListener('click', resetGraphToBundled);
}

function startDrag(event: PointerEvent, nodeId: string, element: HTMLElement): void {
  if (event.button !== 0) {
    return;
  }
  selectedNodeId = nodeId;
  const workspace = document.querySelector<HTMLElement>('.graph-workspace');
  if (!workspace) {
    return;
  }
  const workspaceRect = workspace.getBoundingClientRect();
  const position = getNodePosition(nodeId);
  dragState = {
    nodeId,
    element,
    offsetX: event.clientX - workspaceRect.left - position.x + workspace.scrollLeft,
    offsetY: event.clientY - workspaceRect.top - position.y + workspace.scrollTop,
  };
  element.setPointerCapture(event.pointerId);
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragEnd, { once: true });
}

function onDragMove(event: PointerEvent): void {
  if (!dragState) {
    return;
  }
  const workspace = document.querySelector<HTMLElement>('.graph-workspace');
  if (!workspace) {
    return;
  }
  const workspaceRect = workspace.getBoundingClientRect();
  const x = Math.max(12, Math.round(event.clientX - workspaceRect.left - dragState.offsetX + workspace.scrollLeft));
  const y = Math.max(12, Math.round(event.clientY - workspaceRect.top - dragState.offsetY + workspace.scrollTop));
  nodePositions[dragState.nodeId] = { x, y };
  dragState.element.style.left = `${x}px`;
  dragState.element.style.top = `${y}px`;
  const svg = document.querySelector<SVGSVGElement>('.graph-svg');
  if (svg) {
    svg.innerHTML = renderEdgePaths();
  }
}

function onDragEnd(): void {
  window.removeEventListener('pointermove', onDragMove);
  if (dragState) {
    savePositions();
  }
  dragState = null;
  render();
}

function addNodeFromPalette(type: string): void {
  const definition = getNodeTypeDefinition(type);
  if (!definition) {
    validationText = `Cannot add unknown node type: ${type}.`;
    render();
    return;
  }
  const id = makeUniqueNodeId(type);
  const node: EditableAiNode = {
    id,
    type,
    displayName: definition.label,
    displayNameRu: definition.labelRu,
    description: definition.description,
    descriptionRu: definition.descriptionRu,
    children: [],
    parameters: createDefaultParameters(type),
  };
  editorGraph.nodes.push(node);
  nodePositions[id] = createNewNodePosition();
  selectedNodeId = id;
  validationText = `Added node ${id}. Добавлена нода ${id}.`;
  saveEditorState();
  render();
}

function saveSelectedNodeFromInspector(): void {
  const node = findSelectedNode();
  const displayName = getInputValue('node-display-name').trim();
  const displayNameRu = getInputValue('node-display-name-ru').trim();
  const description = getTextAreaValue('node-description').trim();
  const descriptionRu = getTextAreaValue('node-description-ru').trim();
  const parametersText = getTextAreaValue('node-parameters');

  try {
    node.displayName = displayName || node.displayName;
    node.displayNameRu = displayNameRu || node.displayNameRu;
    node.description = description || undefined;
    node.descriptionRu = descriptionRu || undefined;
    node.parameters = parseParametersText(parametersText);
    validationText = `Saved node ${node.id}. Нода сохранена.`;
    saveEditorState();
    render();
  } catch (error) {
    validationText = `Parameter JSON error / ошибка параметров: ${formatError(error)}`;
    render();
  }
}

function linkSelectedNodeToChosenChild(): void {
  const parent = findSelectedNode();
  const select = document.querySelector<HTMLSelectElement>('#link-target-select');
  const childId = select?.value ?? '';
  if (!childId) {
    validationText = 'Choose a child node first. Сначала выбери дочернюю ноду.';
    render();
    return;
  }
  if (parent.id === childId) {
    validationText = 'Cannot link a node to itself. Нельзя связать ноду саму с собой.';
    render();
    return;
  }
  if (parent.children.includes(childId)) {
    validationText = `Link already exists: ${parent.id} → ${childId}.`;
    render();
    return;
  }
  parent.children.push(childId);
  validationText = `Linked ${parent.id} → ${childId}. Связь добавлена.`;
  saveEditorState();
  render();
}

function unlinkChild(parentId: string, childId: string): void {
  const parent = editorGraph.nodes.find((node) => node.id === parentId);
  if (!parent) {
    return;
  }
  parent.children = parent.children.filter((id) => id !== childId);
  validationText = `Removed link ${parentId} → ${childId}. Связь удалена.`;
  saveEditorState();
  render();
}

function deleteSelectedNode(): void {
  if (selectedNodeId === editorGraph.rootNodeId) {
    validationText = 'Root cannot be deleted. Корень удалить нельзя.';
    render();
    return;
  }
  const deletedId = selectedNodeId;
  editorGraph.nodes = editorGraph.nodes.filter((node) => node.id !== deletedId);
  for (const node of editorGraph.nodes) {
    node.children = node.children.filter((childId) => childId !== deletedId);
  }
  delete nodePositions[deletedId];
  selectedNodeId = ensureSelectedNodeId(editorGraph.rootNodeId);
  validationText = `Deleted node ${deletedId}. Нода удалена.`;
  saveEditorState();
  render();
}

function exportGraphJson(): void {
  const blob = new Blob([`${JSON.stringify(editorGraph, null, 2)}\n`], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${editorGraph.id || 'soldier_custom_graph'}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  validationText = 'Exported JSON. JSON экспортирован.';
  render();
}

function importGraphFromFileInput(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) {
    return;
  }
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    try {
      const imported = normalizeGraph(JSON.parse(String(reader.result ?? '{}')));
      editorGraph = imported;
      selectedNodeId = ensureSelectedNodeId(editorGraph.rootNodeId);
      ensurePositionsForGraph();
      saveEditorState();
      validationText = `Imported ${file.name}. JSON импортирован.`;
      render();
    } catch (error) {
      validationText = `Import error / ошибка импорта: ${formatError(error)}`;
      render();
    }
  });
  reader.readAsText(file, 'utf-8');
}

function resetGraphToBundled(): void {
  editorGraph = normalizeGraph(graphData as unknown);
  nodePositions = { ...initialNodePositions };
  selectedNodeId = ensureSelectedNodeId(editorGraph.rootNodeId);
  validationText = 'Reset to bundled graph. Граф сброшен к базовому.';
  evaluationText = 'Press “Evaluate once” / Нажми «Evaluate once» для тестового солдата.';
  saveEditorState();
  render();
}

async function refreshEngineStatus(): Promise<void> {
  try {
    const payload = await requestEngine<EngineHealthPayload>('/engine/health');
    engineOnline = payload.ok === true;
    lastHealthText = engineOnline
      ? `engine online · textBase=${payload.textBase ?? 'en'} · overlay=${payload.overlayLanguage ?? 'ru'} · browserDoesHeavyAi=${String(payload.browserDoesHeavyAi)}`
      : 'engine responded with error / движок ответил ошибкой';
  } catch {
    engineOnline = false;
    lastHealthText = 'engine offline: run Run-AI-Node-Editor.bat / движок не подключён';
  }
  render();
}

async function runSimpleCheck45(): Promise<void> {
  validationText = 'Running auto check 4–5... / Идёт автопроверка пунктов 4–5...';
  evaluationText = 'Waiting for local engine... / Жду ответ local engine...';
  render();

  const lines: string[] = [];

  try {
    const health = await requestEngine<EngineHealthPayload>('/engine/health');
    const point4Ok = health.ok === true && health.browserDoesHeavyAi === false && health.textBase === 'en';
    engineOnline = point4Ok;
    lastHealthText = point4Ok
      ? 'engine online: point 4 OK / пункт 4 OK'
      : 'engine responded, but point 4 failed / пункт 4 не прошёл';
    lines.push(point4Ok
      ? 'Point 4 OK / Пункт 4 OK — local engine connected, textBase=en, browserDoesHeavyAi=false.'
      : 'Point 4 ERROR / Пункт 4 ОШИБКА — engine responded, but expected textBase=en and browserDoesHeavyAi=false.');
  } catch (error) {
    engineOnline = false;
    lastHealthText = 'engine offline: point 4 failed / пункт 4 не прошёл';
    lines.push(`Point 4 ERROR / Пункт 4 ОШИБКА — local engine does not answer: ${formatError(error)}.`);
  }

  try {
    const validation = await requestEngine<EngineValidationPayload>('/ai/graph/validate', { graph: editorGraph });
    const evaluation = await requestEngine<EngineEvaluationPayload>('/ai/graph/evaluate-once', createEvaluatePayload());
    const validateOk = validation.ok === true && validation.validation?.valid === true;
    const evaluateOk = evaluation.ok === true
      && evaluation.selectedBranchNodeId === 'critical_survival'
      && evaluation.command?.type === 'move_to'
      && typeof evaluation.explanation === 'string'
      && typeof evaluation.explanationRu === 'string';
    const point5Ok = validateOk && evaluateOk;
    lines.push(point5Ok
      ? 'Point 5 OK / Пункт 5 OK — graph validated through engine, evaluate-once returned EN+RU explanation and move_to.'
      : `Point 5 ERROR / Пункт 5 ОШИБКА — validateOk=${String(validateOk)}, evaluateOk=${String(evaluateOk)}.`);
    evaluationText = JSON.stringify(evaluation, null, 2);
  } catch (error) {
    lines.push(`Point 5 ERROR / Пункт 5 ОШИБКА — validation/evaluate-once failed: ${formatError(error)}.`);
    evaluationText = `Evaluate-once error: ${formatError(error)}`;
  }

  validationText = lines.join('\n');
  render();
}

async function validateGraphThroughEngine(): Promise<void> {
  try {
    const payload = await requestEngine<EngineValidationPayload>('/ai/graph/validate', { graph: editorGraph });
    validationText = JSON.stringify(payload, null, 2);
    engineOnline = payload.ok === true;
    lastHealthText = payload.ok ? 'engine online: graph validation OK' : 'engine online: graph validation returned errors';
  } catch (error) {
    engineOnline = false;
    validationText = `Local engine error / ошибка связи: ${formatError(error)}`;
    lastHealthText = 'engine offline: validation impossible';
  }
  render();
}

async function evaluateOnceThroughEngine(): Promise<void> {
  try {
    const payload = await requestEngine<EngineEvaluationPayload>('/ai/graph/evaluate-once', createEvaluatePayload());
    evaluationText = JSON.stringify(payload, null, 2);
    engineOnline = payload.ok === true;
    lastHealthText = payload.ok ? 'engine online: evaluate-once OK' : 'engine online: evaluate-once returned error';
  } catch (error) {
    engineOnline = false;
    evaluationText = `Local engine error / ошибка связи: ${formatError(error)}`;
    lastHealthText = 'engine offline: evaluate-once impossible';
  }
  render();
}

function createEvaluatePayload(): EngineEvaluateRequest {
  return {
    graph: editorGraph,
    unitId: 'editor_preview_soldier',
    hasOrder: true,
    blackboard: {
      danger: 85,
      stress: 70,
      current_action: 'continue_order',
      best_cover_position: { x: 18.5, y: 12.5 },
    },
  };
}

async function requestEngine<TPayload>(pathname: string, body?: unknown): Promise<TPayload> {
  const response = await fetch(`${ENGINE_BASE_URL}${pathname}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json() as TPayload;
  if (!response.ok) {
    throw new Error(JSON.stringify(payload));
  }
  return payload;
}

function loadStoredGraph(): EditableAiGraph | null {
  try {
    const raw = localStorage.getItem(GRAPH_STORAGE_KEY);
    return raw ? normalizeGraph(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function loadStoredPositions(): Record<string, NodePosition> {
  try {
    const raw = localStorage.getItem(POSITION_STORAGE_KEY);
    return raw ? normalizePositions(JSON.parse(raw)) : { ...initialNodePositions };
  } catch {
    return { ...initialNodePositions };
  }
}

function saveEditorState(): void {
  localStorage.setItem(GRAPH_STORAGE_KEY, JSON.stringify(editorGraph));
  savePositions();
}

function savePositions(): void {
  localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(nodePositions));
}

function normalizeGraph(value: unknown): EditableAiGraph {
  if (!isRecord(value)) {
    throw new Error('Graph JSON must be an object.');
  }
  const nodesValue = Array.isArray(value.nodes) ? value.nodes : [];
  const nodes = nodesValue.map(normalizeNode);
  if (nodes.length === 0) {
    throw new Error('Graph must contain at least one node.');
  }
  const rootNodeId = readString(value, 'rootNodeId', nodes[0].id);
  return {
    version: 1,
    id: readString(value, 'id', 'soldier_custom_graph'),
    name: readString(value, 'name', 'Soldier Custom Graph'),
    nameRu: readOptionalString(value, 'nameRu'),
    description: readOptionalString(value, 'description'),
    descriptionRu: readOptionalString(value, 'descriptionRu'),
    rootNodeId,
    blackboardDefaults: normalizeJsonObject(value.blackboardDefaults),
    nodes,
  };
}

function normalizeNode(value: unknown, index: number): EditableAiNode {
  if (!isRecord(value)) {
    throw new Error(`Node #${index + 1} must be an object.`);
  }
  const type = readString(value, 'type', 'Observe');
  const definition = getNodeTypeDefinition(type);
  const id = readString(value, 'id', `${toSnakeCase(type)}_${index + 1}`);
  return {
    id,
    type,
    displayName: readString(value, 'displayName', definition?.label ?? type),
    displayNameRu: readString(value, 'displayNameRu', definition?.labelRu ?? type),
    description: readOptionalString(value, 'description') ?? definition?.description,
    descriptionRu: readOptionalString(value, 'descriptionRu') ?? definition?.descriptionRu,
    children: Array.isArray(value.children) ? value.children.filter((child): child is string => typeof child === 'string' && child.length > 0) : [],
    parameters: normalizeJsonObject(value.parameters),
  };
}

function normalizeJsonObject(value: unknown): JsonObject {
  if (!isRecord(value)) {
    return {};
  }
  const result: JsonObject = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (isJsonValue(rawValue)) {
      result[key] = rawValue;
    }
  }
  return result;
}

function normalizePositions(value: unknown): Record<string, NodePosition> {
  if (!isRecord(value)) {
    return { ...initialNodePositions };
  }
  const result: Record<string, NodePosition> = { ...initialNodePositions };
  for (const [nodeId, position] of Object.entries(value)) {
    if (isRecord(position) && typeof position.x === 'number' && typeof position.y === 'number') {
      result[nodeId] = { x: position.x, y: position.y };
    }
  }
  return result;
}

function parseParametersText(text: string): JsonObject {
  const parsed = JSON.parse(text.trim() || '{}') as unknown;
  if (!isRecord(parsed)) {
    throw new Error('parameters must be a JSON object.');
  }
  for (const [key, value] of Object.entries(parsed)) {
    if (!isJsonValue(value)) {
      throw new Error(`parameter ${key} has unsupported value; allowed: string, number, boolean, null, {x,y}.`);
    }
  }
  return parsed as JsonObject;
}

function createDefaultParameters(type: string): JsonObject {
  if (type === 'DangerAbove' || type === 'StressAbove') {
    return { threshold: 50 };
  }
  if (type === 'ScoreDanger' || type === 'ScoreStress') {
    return { weight: 1, direction: 'positive' };
  }
  if (type === 'ScoreObedience' || type === 'ScoreCoverNeed') {
    return { baseScore: 10 };
  }
  if (type === 'ScoreCurrentActionInertia') {
    return { action: 'observe', bonus: 8 };
  }
  if (type === 'FindBestCover') {
    return { searchRadiusMeters: 35, writeTo: 'best_cover_position' };
  }
  if (type === 'MoveToCover') {
    return { targetBlackboardKey: 'best_cover_position' };
  }
  if (type === 'SetPosture') {
    return { posture: 'prone' };
  }
  if (type === 'WriteReason') {
    return {
      reason: 'Explain why this branch was selected.',
      reasonRu: 'Объяснить, почему выбрана эта ветка.',
    };
  }
  return {};
}

function ensurePositionsForGraph(): void {
  editorGraph.nodes.forEach((node, index) => {
    if (!nodePositions[node.id]) {
      nodePositions[node.id] = initialNodePositions[node.id] ?? createFallbackPosition(index);
    }
  });
}

function getNodePosition(nodeId: string): NodePosition {
  if (!nodePositions[nodeId]) {
    nodePositions[nodeId] = createFallbackPosition(editorGraph.nodes.findIndex((node) => node.id === nodeId));
  }
  return nodePositions[nodeId];
}

function createFallbackPosition(index: number): NodePosition {
  const safeIndex = Math.max(0, index);
  return {
    x: 80 + (safeIndex % 5) * 280,
    y: 80 + Math.floor(safeIndex / 5) * 150,
  };
}

function createNewNodePosition(): NodePosition {
  const index = editorGraph.nodes.length;
  return {
    x: 130 + (index % 4) * 270,
    y: 160 + Math.floor(index / 4) * 150,
  };
}

function makeUniqueNodeId(type: string): string {
  const base = toSnakeCase(type);
  let suffix = editorGraph.nodes.length + 1;
  let id = `${base}_${suffix}`;
  while (editorGraph.nodes.some((node) => node.id === id)) {
    suffix += 1;
    id = `${base}_${suffix}`;
  }
  return id;
}

function findSelectedNode(): EditableAiNode {
  const node = editorGraph.nodes.find((candidate) => candidate.id === selectedNodeId);
  if (node) {
    return node;
  }
  selectedNodeId = ensureSelectedNodeId(editorGraph.rootNodeId);
  return editorGraph.nodes.find((candidate) => candidate.id === selectedNodeId) ?? editorGraph.nodes[0];
}

function ensureSelectedNodeId(preferredId: string): string {
  if (editorGraph.nodes.some((node) => node.id === preferredId)) {
    return preferredId;
  }
  return editorGraph.nodes[0]?.id ?? 'root';
}

function getNodeCategory(node: EditableAiNode): AiNodeCategory {
  const definition = getNodeTypeDefinition(node.type);
  return definition?.category ?? 'debug';
}

function getNodeDescription(node: EditableAiNode, language: 'en' | 'ru'): string {
  const definition = getNodeTypeDefinition(node.type);
  if (language === 'ru') {
    return definition?.descriptionRu ?? 'Нода графа поведения.';
  }
  return definition?.description ?? 'Behavior graph node.';
}

function getNodeTypeDefinition(type: string) {
  if (type in AI_NODE_TYPE_DEFINITIONS) {
    return AI_NODE_TYPE_DEFINITIONS[type as AiNodeType];
  }
  return undefined;
}

function getInputValue(id: string): string {
  return document.querySelector<HTMLInputElement>(`#${id}`)?.value ?? '';
}

function getTextAreaValue(id: string): string {
  return document.querySelector<HTMLTextAreaElement>(`#${id}`)?.value ?? '';
}

function readString(record: Record<string, unknown>, key: string, fallback: string): string {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function toSnakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase() || 'node';
}

function isJsonValue(value: unknown): value is JsonValue {
  return value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
    || isJsonPosition(value);
}

function isJsonPosition(value: unknown): value is JsonPosition {
  return isRecord(value)
    && typeof value.x === 'number'
    && typeof value.y === 'number';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface EngineHealthPayload {
  ok?: boolean;
  service?: string;
  textBase?: string;
  overlayLanguage?: string;
  browserDoesHeavyAi?: boolean;
}

interface EngineValidationPayload {
  ok?: boolean;
  validation?: {
    valid?: boolean;
  };
}

interface EngineEvaluationPayload {
  ok?: boolean;
  selectedBranchNodeId?: string;
  command?: {
    type?: string;
  };
  explanation?: string;
  explanationRu?: string;
}

interface EngineEvaluateRequest {
  graph: EditableAiGraph;
  unitId: string;
  hasOrder: boolean;
  blackboard: {
    danger: number;
    stress: number;
    current_action: string;
    best_cover_position: { x: number; y: number };
  };
}
