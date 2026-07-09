import './ai-node-editor.css';
import graphData from '../data/ai/soldier_default_survival_graph.json';
import { AI_NODE_TYPE_DEFINITIONS, type AiNodeCategory, type AiNodeType } from '../core/ai/AiNodeTypes';
import type { AiGraph, AiNode } from '../core/ai/AiGraph';

const ENGINE_BASE_URL = 'http://127.0.0.1:8787';
const graph = graphData as AiGraph;
const root = document.querySelector<HTMLElement>('#ai-node-editor-root');

if (!root) {
  throw new Error('AI node editor root is missing.');
}

const nodeLayouts: Record<string, { x: number; y: number }> = {
  root: { x: 70, y: 70 },
  soldier_decision: { x: 340, y: 70 },
  critical_survival: { x: 640, y: 30 },
  continue_order: { x: 640, y: 210 },
  observe_area: { x: 640, y: 390 },
  critical_danger_condition: { x: 930, y: 20 },
  critical_stress_condition: { x: 930, y: 125 },
  score_danger_for_cover: { x: 930, y: 230 },
  find_best_cover: { x: 930, y: 335 },
  move_to_cover: { x: 930, y: 440 },
  continue_order_action: { x: 930, y: 545 },
};

let selectedNodeId = graph.rootNodeId;
let engineOnline = false;
let lastHealthText = 'Проверка local engine ещё не выполнялась.';
let validationText = 'Нажми «Автопроверка 4–5», чтобы не читать JSON руками.';
let evaluationText = 'Нажми «Evaluate once» для тестового солдата.';
const graphJsonText = JSON.stringify(graph, null, 2);

render();
void refreshEngineStatus();

function render(): void {
  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId) ?? graph.nodes[0];
  root.innerHTML = `
    <section class="ai-editor-shell">
      <header class="ai-editor-topbar">
        <div class="ai-editor-title">
          <h1>Редактор ИИ одиночного солдата</h1>
          <p>Видимый граф нод. Браузер редактирует и показывает, local engine считает и валидирует.</p>
        </div>
        <div class="ai-editor-actions">
          <div id="engine-status" class="engine-status ${engineOnline ? 'online' : 'offline'}">
            <i class="engine-status-dot" aria-hidden="true"></i>
            <span>${escapeHtml(lastHealthText)}</span>
          </div>
          <button id="refresh-engine" class="ai-editor-button" type="button">Проверить engine</button>
          <button id="run-check-45" class="ai-editor-button primary" type="button">Автопроверка 4–5</button>
          <button id="validate-graph" class="ai-editor-button" type="button">Проверить граф через engine</button>
          <button id="evaluate-once" class="ai-editor-button" type="button">Evaluate once</button>
        </div>
      </header>
      <main class="ai-editor-main">
        <aside class="ai-editor-panel" aria-label="Палитра нод">
          ${renderPalette()}
        </aside>
        <section class="graph-workspace" aria-label="Граф поведения солдата">
          ${renderEdges()}
          ${renderGraphNodes()}
        </section>
        <aside class="ai-editor-panel right" aria-label="Инспектор ноды">
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
          <pre>${escapeHtml(graphJsonText)}</pre>
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
      <h2>Палитра</h2>
      <span>${definitions.length} типов</span>
    </div>
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
              <strong>${escapeHtml(definition.labelRu)}</strong>
              <span>${escapeHtml(definition.descriptionRu)}</span>
            </button>
          `).join('')}
        </section>
      `;
    }).join('')}
  `;
}

function renderGraphNodes(): string {
  const visibleNodeIds = new Set<string>([
    'root',
    'soldier_decision',
    'critical_survival',
    'continue_order',
    'observe_area',
    'critical_danger_condition',
    'critical_stress_condition',
    'score_danger_for_cover',
    'find_best_cover',
    'move_to_cover',
    'continue_order_action',
  ]);
  return graph.nodes
    .filter((node) => visibleNodeIds.has(node.id))
    .map((node) => {
      const layout = nodeLayouts[node.id] ?? { x: 80, y: 80 };
      const category = getNodeCategory(node);
      const selected = node.id === selectedNodeId ? 'selected' : '';
      const typeLabel = getNodeLabel(node);
      const description = node.descriptionRu ?? getNodeDescription(node) ?? 'Нода графа поведения.';
      return `
        <article class="graph-node ${category} ${selected}" data-node-id="${node.id}" style="left:${layout.x}px; top:${layout.y}px;">
          <span class="node-type-chip">${escapeHtml(category)} / ${escapeHtml(String(node.type))}</span>
          <h3>${escapeHtml(typeLabel)}</h3>
          <p>${escapeHtml(description)}</p>
          <div class="node-port-row"><span>id</span><b>${escapeHtml(node.id)}</b></div>
        </article>
      `;
    })
    .join('');
}

function renderEdges(): string {
  const paths: string[] = [];
  for (const node of graph.nodes) {
    const from = nodeLayouts[node.id];
    if (!from || !node.children) {
      continue;
    }
    for (const childId of node.children) {
      const to = nodeLayouts[childId];
      if (!to) {
        continue;
      }
      const startX = from.x + 210;
      const startY = from.y + 44;
      const endX = to.x;
      const endY = to.y + 44;
      const midX = Math.round((startX + endX) / 2);
      paths.push(`<path d="M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}" />`);
    }
  }
  return `<svg class="graph-svg" role="img" aria-label="Связи AI-графа">${paths.join('')}</svg>`;
}

function renderInspector(node: AiNode): string {
  const childText = node.children && node.children.length > 0 ? node.children.join(', ') : 'нет';
  const paramsText = node.parameters ? JSON.stringify(node.parameters, null, 2) : 'нет';
  return `
    <div class="panel-title">
      <h2>Инспектор</h2>
      <span>${escapeHtml(node.id)}</span>
    </div>
    <section class="inspector-card">
      <h3>${escapeHtml(getNodeLabel(node))}</h3>
      <div class="inspector-row"><span>type</span><code>${escapeHtml(String(node.type))}</code></div>
      <div class="inspector-row"><span>category</span><b>${escapeHtml(getNodeCategory(node))}</b></div>
      <div class="inspector-row"><span>children</span><code>${escapeHtml(childText)}</code></div>
      <div class="inspector-row"><span>params</span><code>${escapeHtml(paramsText)}</code></div>
    </section>
    <section class="inspector-card">
      <h3>Пояснение</h3>
      <p>${escapeHtml(node.descriptionRu ?? getNodeDescription(node) ?? 'Описание появится в библиотеке нод.')}</p>
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
      <h3>Что сейчас можно проверить</h3>
      <pre>1. Видна палитра нод слева.
2. Виден граф в центре.
3. Выбор ноды меняет инспектор справа.
4. Нажми «Автопроверка 4–5»: должно быть «Пункт 4 OK».
5. В той же автопроверке должно быть «Пункт 5 OK».</pre>
    </section>
  `;
}

function installEventHandlers(): void {
  document.querySelectorAll<HTMLElement>('[data-node-id]').forEach((element) => {
    element.addEventListener('click', () => {
      selectedNodeId = element.dataset.nodeId ?? selectedNodeId;
      render();
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-palette-type]').forEach((button) => {
    button.addEventListener('click', () => {
      const type = button.dataset.paletteType ?? 'unknown';
      validationText = `Палитра: выбран тип ${type}. На этом этапе редактор видимый, но создание новых нод ещё не сохраняет граф. Следующий шаг — authoring.`;
      render();
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
}

async function refreshEngineStatus(): Promise<void> {
  try {
    const response = await fetch(`${ENGINE_BASE_URL}/engine/health`);
    const payload = await response.json() as EngineHealthPayload;
    engineOnline = response.ok && payload.ok === true;
    lastHealthText = engineOnline
      ? `engine online: ${payload.service ?? 'local-ai-engine'} / browserDoesHeavyAi=${String(payload.browserDoesHeavyAi)}`
      : 'engine ответил, но вернул ошибку';
  } catch {
    engineOnline = false;
    lastHealthText = `engine offline: запусти Run-AI-Engine.bat или Run-AI-Node-Editor.bat`;
  }
  render();
}

async function runSimpleCheck45(): Promise<void> {
  validationText = 'Идёт автопроверка пунктов 4–5...';
  evaluationText = 'Жду ответ local engine...';
  render();

  const lines: string[] = [];

  try {
    const health = await requestEngine<EngineHealthPayload>('/engine/health');
    const point4Ok = health.ok === true && health.browserDoesHeavyAi === false;
    engineOnline = point4Ok;
    lastHealthText = point4Ok
      ? 'engine online: пункт 4 OK'
      : 'engine ответил, но пункт 4 не прошёл';
    lines.push(point4Ok
      ? 'Пункт 4 OK — local engine подключён, browserDoesHeavyAi=false.'
      : 'Пункт 4 ОШИБКА — engine ответил, но browserDoesHeavyAi не false.');
  } catch (error) {
    engineOnline = false;
    lastHealthText = 'engine offline: пункт 4 не прошёл';
    lines.push(`Пункт 4 ОШИБКА — local engine не отвечает: ${formatError(error)}.`);
  }

  try {
    const validation = await requestEngine<EngineValidationPayload>('/ai/graph/validate', { graph });
    const evaluation = await requestEngine<EngineEvaluationPayload>('/ai/graph/evaluate-once', createEvaluatePayload());
    const validateOk = validation.ok === true && validation.validation?.valid === true;
    const evaluateOk = evaluation.ok === true
      && evaluation.selectedBranchNodeId === 'critical_survival'
      && evaluation.command?.type === 'move_to';
    const point5Ok = validateOk && evaluateOk;
    lines.push(point5Ok
      ? 'Пункт 5 OK — граф проверен через engine, evaluate-once выбрал critical_survival и command.type=move_to.'
      : `Пункт 5 ОШИБКА — validateOk=${String(validateOk)}, evaluateOk=${String(evaluateOk)}.`);
    evaluationText = JSON.stringify(evaluation, null, 2);
  } catch (error) {
    lines.push(`Пункт 5 ОШИБКА — validation/evaluate-once не прошли: ${formatError(error)}.`);
    evaluationText = `Ошибка evaluate-once: ${formatError(error)}`;
  }

  validationText = lines.join('\n');
  render();
}

async function validateGraphThroughEngine(): Promise<void> {
  try {
    const payload = await requestEngine<EngineValidationPayload>('/ai/graph/validate', { graph });
    validationText = JSON.stringify(payload, null, 2);
    engineOnline = payload.ok === true;
    lastHealthText = payload.ok ? 'engine online: graph validation OK' : 'engine online: graph validation вернула ошибки';
  } catch (error) {
    engineOnline = false;
    validationText = `Ошибка связи с local engine: ${formatError(error)}`;
    lastHealthText = 'engine offline: validation невозможна';
  }
  render();
}

async function evaluateOnceThroughEngine(): Promise<void> {
  try {
    const payload = await requestEngine<EngineEvaluationPayload>('/ai/graph/evaluate-once', createEvaluatePayload());
    evaluationText = JSON.stringify(payload, null, 2);
    engineOnline = payload.ok === true;
    lastHealthText = payload.ok ? 'engine online: evaluate-once OK' : 'engine online: evaluate-once вернул ошибку';
  } catch (error) {
    engineOnline = false;
    evaluationText = `Ошибка связи с local engine: ${formatError(error)}`;
    lastHealthText = 'engine offline: evaluate-once невозможен';
  }
  render();
}

function createEvaluatePayload(): EngineEvaluateRequest {
  return {
    graph,
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

function getNodeCategory(node: AiNode): AiNodeCategory {
  if (typeof node.type === 'string' && node.type in AI_NODE_TYPE_DEFINITIONS) {
    return AI_NODE_TYPE_DEFINITIONS[node.type as AiNodeType].category;
  }
  return 'debug';
}

function getNodeLabel(node: AiNode): string {
  if (node.displayNameRu) {
    return node.displayNameRu;
  }
  if (typeof node.type === 'string' && node.type in AI_NODE_TYPE_DEFINITIONS) {
    return AI_NODE_TYPE_DEFINITIONS[node.type as AiNodeType].labelRu;
  }
  return node.id;
}

function getNodeDescription(node: AiNode): string | undefined {
  if (typeof node.type === 'string' && node.type in AI_NODE_TYPE_DEFINITIONS) {
    return AI_NODE_TYPE_DEFINITIONS[node.type as AiNodeType].descriptionRu;
  }
  return undefined;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface EngineHealthPayload {
  ok?: boolean;
  service?: string;
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
}

interface EngineEvaluateRequest {
  graph: AiGraph;
  unitId: string;
  hasOrder: boolean;
  blackboard: {
    danger: number;
    stress: number;
    current_action: string;
    best_cover_position: { x: number; y: number };
  };
}
