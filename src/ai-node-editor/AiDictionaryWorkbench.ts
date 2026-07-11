import { getAiConcept, resolveAiConceptKey, type AiConceptNodeTemplate } from '../core/ai/AiConceptCatalog';
import type { AiBlackboardValue } from '../core/ai/AiBlackboard';
import { AI_NODE_TYPE_DEFINITIONS } from '../core/ai/AiNodeTypes';

const GRAPH_STORAGE_KEY = 'real-wargame.ai-node-editor.graph.v6';
const POSITION_STORAGE_KEY = 'real-wargame.ai-node-editor.positions.v6';
const CUSTOM_MEMORY_KEY = 'real-wargame.ai-dictionary.custom-memory.v1';
const HISTORY_KEY = 'real-wargame.ai-dictionary.decision-history.v1';
const DEBUG_STORAGE_KEY = 'real-wargame.ai-node-editor.debug.v1';
const LANGUAGE_KEY = 'real-wargame.ai-dictionary.language.v1';
const MAX_HISTORY = 20;

type Language = 'ru' | 'en';
type WorkbenchTab = 'memory' | 'diagnostics' | 'history';
type CustomMemoryType = 'boolean' | 'number' | 'text';
type DiagnosticSeverity = 'error' | 'warning' | 'info';

interface CustomMemoryDefinition {
  key: string;
  label: string;
  labelRu: string;
  valueType: CustomMemoryType;
  defaultValue: AiBlackboardValue;
  createdAtMs: number;
}

interface StoredNode {
  id: string;
  type: string;
  displayName?: string;
  displayNameRu?: string;
  children?: string[];
  parameters?: Record<string, AiBlackboardValue>;
}

interface StoredGraph {
  rootNodeId: string;
  blackboardDefaults?: Record<string, AiBlackboardValue>;
  nodes: StoredNode[];
  [key: string]: unknown;
}

interface RuntimeScore {
  branchNodeId?: string;
  branchName?: string;
  branchNameRu?: string;
  score?: number;
  vetoed?: boolean;
}

interface RuntimeDebugPayload {
  kind?: string;
  unitId?: string;
  unitLabel?: string;
  selectedBranchNodeId?: string;
  selectedBranchName?: string;
  selectedBranchNameRu?: string;
  explanation?: string;
  explanationRu?: string;
  nowMs?: number;
  scores?: RuntimeScore[];
  blackboard?: Record<string, AiBlackboardValue>;
}

interface DecisionHistoryEntry extends RuntimeDebugPayload {
  id: string;
  recordedAtMs: number;
}

interface GraphDiagnostic {
  severity: DiagnosticSeverity;
  nodeId: string | null;
  message: string;
  messageRu: string;
}

let language: Language = readLanguage();
let activeTab: WorkbenchTab = 'memory';
let scheduled = false;
let lastHistorySignature = '';

const root = document.createElement('section');
root.className = 'ai-dictionary-workbench-root';
root.hidden = true;
root.innerHTML = `
  <div class="ai-dictionary-workbench-backdrop" data-workbench-close></div>
  <div class="ai-dictionary-workbench-dialog" role="dialog" aria-modal="true">
    <header>
      <div>
        <span data-workbench-kicker></span>
        <h2 data-workbench-title></h2>
      </div>
      <div class="ai-dictionary-workbench-header-actions">
        <button type="button" data-workbench-language></button>
        <button type="button" data-workbench-close aria-label="Close">×</button>
      </div>
    </header>
    <nav data-workbench-tabs></nav>
    <main data-workbench-content></main>
  </div>
`;
document.body.append(root);

const observer = new MutationObserver(scheduleEnhance);
observer.observe(document.body, { childList: true, subtree: true });
window.addEventListener('storage', (event) => {
  if (event.key === DEBUG_STORAGE_KEY) captureDecisionHistory();
  if (event.key === CUSTOM_MEMORY_KEY) scheduleEnhance();
});
window.setInterval(captureDecisionHistory, 700);
window.setInterval(enhanceCustomMemorySelectors, 900);
root.querySelectorAll<HTMLElement>('[data-workbench-close]').forEach((element) => element.addEventListener('click', closeWorkbench));
root.querySelector<HTMLButtonElement>('[data-workbench-language]')?.addEventListener('click', () => {
  language = language === 'ru' ? 'en' : 'ru';
  localStorage.setItem(LANGUAGE_KEY, language);
  renderWorkbench();
});
root.querySelector<HTMLElement>('[data-workbench-tabs]')?.addEventListener('click', (event) => {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-workbench-tab]');
  if (!button) return;
  activeTab = (button.dataset.workbenchTab as WorkbenchTab) ?? 'memory';
  renderWorkbench();
});
root.querySelector<HTMLElement>('[data-workbench-content]')?.addEventListener('click', handleContentClick);
root.querySelector<HTMLElement>('[data-workbench-content]')?.addEventListener('submit', handleContentSubmit);
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !root.hidden) closeWorkbench();
});
scheduleEnhance();
captureDecisionHistory();

function scheduleEnhance(): void {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(() => {
    scheduled = false;
    installWorkbenchButton();
    enhanceCustomMemorySelectors();
  });
}

function installWorkbenchButton(): void {
  const actions = document.querySelector('.ai-editor-actions');
  if (!actions || actions.querySelector('[data-action="ai-dictionary-workbench"]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ai-editor-button';
  button.dataset.action = 'ai-dictionary-workbench';
  button.textContent = 'Инструменты ИИ';
  button.title = 'Пользовательская память, проверка графа и история решений';
  button.addEventListener('click', () => openWorkbench('memory'));
  const dictionaryButton = actions.querySelector('[data-action="ai-dictionary"]');
  actions.insertBefore(button, dictionaryButton?.nextSibling ?? actions.firstChild);
}

function openWorkbench(tab: WorkbenchTab): void {
  activeTab = tab;
  root.hidden = false;
  document.body.classList.add('ai-dictionary-workbench-open');
  captureDecisionHistory();
  renderWorkbench();
}

function closeWorkbench(): void {
  root.hidden = true;
  document.body.classList.remove('ai-dictionary-workbench-open');
}

function renderWorkbench(): void {
  const kicker = root.querySelector<HTMLElement>('[data-workbench-kicker]');
  const title = root.querySelector<HTMLElement>('[data-workbench-title]');
  const languageButton = root.querySelector<HTMLButtonElement>('[data-workbench-language]');
  const tabs = root.querySelector<HTMLElement>('[data-workbench-tabs]');
  const content = root.querySelector<HTMLElement>('[data-workbench-content]');
  if (!kicker || !title || !languageButton || !tabs || !content) return;
  kicker.textContent = t('Human tools for AI authoring', 'Инструменты без ручного JSON');
  title.textContent = t('AI Authoring Workbench', 'Инструменты ИИ');
  languageButton.textContent = language === 'ru' ? 'EN' : 'RU';
  tabs.innerHTML = [
    ['memory', t('Custom memory', 'Своя память')],
    ['diagnostics', t('Graph check', 'Проверка графа')],
    ['history', t('Decision history', 'История решений')],
  ].map(([key, label]) => `<button type="button" data-workbench-tab="${key}" class="${activeTab === key ? 'active' : ''}">${escapeHtml(label)}</button>`).join('');
  if (activeTab === 'memory') content.innerHTML = renderMemoryTab();
  else if (activeTab === 'diagnostics') content.innerHTML = renderDiagnosticsTab();
  else content.innerHTML = renderHistoryTab();
}

function renderMemoryTab(): string {
  const memories = readCustomMemories();
  const cards = memories.length > 0
    ? memories.map((memory) => {
        const used = memoryUsage(memory.key);
        const nodeActions = memory.valueType === 'boolean'
          ? `<button type="button" data-memory-node="flag" data-memory-key="${escapeHtml(memory.key)}">${t('Create flag check', 'Создать проверку флага')}</button>`
          : memory.valueType === 'number'
            ? `<button type="button" data-memory-node="threshold" data-memory-key="${escapeHtml(memory.key)}">${t('Create threshold', 'Создать порог')}</button><button type="button" data-memory-node="score" data-memory-key="${escapeHtml(memory.key)}">${t('Use in score', 'Использовать в оценке')}</button>`
            : '';
        return `<article class="ai-custom-memory-card"><header><div><strong>${escapeHtml(language === 'ru' ? memory.labelRu : memory.label)}</strong><code>${escapeHtml(memory.key)}</code></div><span>${escapeHtml(memory.valueType)}</span></header><p>${t('Default value', 'Начальное значение')}: <b>${escapeHtml(String(memory.defaultValue))}</b></p><p>${used ? t(`Used by ${used} node(s).`, `Используется нодами: ${used}.`) : t('Not used by graph nodes yet.', 'Пока не используется нодами графа.')}</p><div>${nodeActions}<button type="button" data-memory-delete="${escapeHtml(memory.key)}" ${used ? 'disabled' : ''}>${t('Delete', 'Удалить')}</button></div></article>`;
      }).join('')
    : `<p class="ai-workbench-empty">${t('No custom memory yet. Create it with the form; no technical key or JSON is required.', 'Своей памяти пока нет. Создайте её формой — технический ключ и JSON вводить не нужно.')}</p>`;
  return `
    <section class="ai-workbench-intro"><h3>${t('Custom soldier memory', 'Своя память бойца')}</h3><p>${t('Creates safe user_ memory slots and immediately adds them to compatible node selectors.', 'Создаёт безопасные ячейки user_ и сразу добавляет их в подходящие списки нод.')}</p></section>
    <form class="ai-custom-memory-form" data-custom-memory-form>
      <label><span>${t('Russian name', 'Название по-русски')}</span><input name="labelRu" required placeholder="${t('Attack intent', 'Настрой на атаку')}" /></label>
      <label><span>${t('English name (optional)', 'Название по-английски (необязательно)')}</span><input name="label" placeholder="Attack intent" /></label>
      <label><span>${t('Value type', 'Тип значения')}</span><select name="valueType"><option value="number">${t('Number', 'Число')}</option><option value="boolean">${t('Yes / No', 'Да / Нет')}</option><option value="text">${t('Text', 'Текст')}</option></select></label>
      <label><span>${t('Default value', 'Начальное значение')}</span><input name="defaultValue" value="0" /></label>
      <button type="submit">${t('Create memory', 'Создать память')}</button>
    </form>
    <div class="ai-custom-memory-list">${cards}</div>
  `;
}

function renderDiagnosticsTab(): string {
  const diagnostics = analyzeGraph();
  const counts = {
    error: diagnostics.filter((item) => item.severity === 'error').length,
    warning: diagnostics.filter((item) => item.severity === 'warning').length,
    info: diagnostics.filter((item) => item.severity === 'info').length,
  };
  const rows = diagnostics.length > 0
    ? diagnostics.map((item) => `<button type="button" class="ai-graph-diagnostic severity-${item.severity}" data-diagnostic-node="${escapeHtml(item.nodeId ?? '')}"><span>${item.severity === 'error' ? '×' : item.severity === 'warning' ? '!' : 'i'}</span><div><strong>${escapeHtml(item.nodeId ?? t('Graph', 'Граф'))}</strong><p>${escapeHtml(language === 'ru' ? item.messageRu : item.message)}</p></div></button>`).join('')
    : `<p class="ai-workbench-success">${t('No dictionary or readiness problems found.', 'Проблем словаря и готовности не найдено.')}</p>`;
  return `
    <section class="ai-workbench-intro"><h3>${t('Human graph check', 'Понятная проверка графа')}</h3><p>${t('Finds unknown keys, old aliases and mechanics that are simplified or only planned.', 'Находит неизвестные ключи, старые имена и механики, которые упрощены или только запланированы.')}</p></section>
    <div class="ai-diagnostic-summary"><b>${t('Errors', 'Ошибки')}: ${counts.error}</b><b>${t('Warnings', 'Предупреждения')}: ${counts.warning}</b><b>${t('Notes', 'Подсказки')}: ${counts.info}</b><button type="button" data-diagnostics-refresh>${t('Check again', 'Проверить снова')}</button></div>
    <div class="ai-diagnostic-list">${rows}</div>
  `;
}

function renderHistoryTab(): string {
  const history = readHistory();
  const rows = history.length > 0
    ? history.map((entry) => {
        const branch = language === 'ru' ? (entry.selectedBranchNameRu ?? entry.selectedBranchName ?? entry.selectedBranchNodeId ?? '—') : (entry.selectedBranchName ?? entry.selectedBranchNameRu ?? entry.selectedBranchNodeId ?? '—');
        const explanation = language === 'ru' ? (entry.explanationRu ?? entry.explanation ?? '') : (entry.explanation ?? entry.explanationRu ?? '');
        const topScores = [...(entry.scores ?? [])].sort((left, right) => Number(right.score ?? 0) - Number(left.score ?? 0)).slice(0, 3);
        const values = Object.entries(entry.blackboard ?? {}).slice(0, 18).map(([key, value]) => {
          const concept = getAiConcept(key);
          const label = concept ? (language === 'ru' ? concept.labelRu : concept.label) : key;
          return `<li><span>${escapeHtml(label)}</span><b>${escapeHtml(formatHistoryValue(value))}</b></li>`;
        }).join('');
        return `<article class="ai-history-entry"><header><div><strong>${escapeHtml(entry.unitLabel ?? entry.unitId ?? t('Soldier', 'Боец'))}</strong><span>${escapeHtml(new Date(entry.recordedAtMs).toLocaleTimeString(language === 'ru' ? 'ru-RU' : 'en-GB'))}</span></div><b>${escapeHtml(branch)}</b></header><p>${escapeHtml(explanation)}</p><div class="ai-history-scores">${topScores.map((score) => `<span>${escapeHtml(language === 'ru' ? (score.branchNameRu ?? score.branchName ?? 'ветка') : (score.branchName ?? score.branchNameRu ?? 'branch'))}: ${Math.round(Number(score.score ?? 0) * 10) / 10}${score.vetoed ? ' · VETO' : ''}</span>`).join('')}</div><details><summary>${t('Values used in this decision', 'Значения этого решения')}</summary><ul>${values}</ul></details></article>`;
      }).join('')
    : `<p class="ai-workbench-empty">${t('No decisions recorded yet. Open the game and run one AI evaluation.', 'Решений пока нет. Откройте игру и выполните один расчёт ИИ.')}</p>`;
  return `
    <section class="ai-workbench-intro"><h3>${t('Last AI decisions', 'Последние решения ИИ')}</h3><p>${t(`Stores up to ${MAX_HISTORY} human-readable decisions in this browser.`, `Хранит до ${MAX_HISTORY} понятных решений в этом браузере.`)}</p></section>
    <div class="ai-history-toolbar"><span>${t('Recorded', 'Записано')}: ${history.length}</span><button type="button" data-history-clear ${history.length ? '' : 'disabled'}>${t('Clear history', 'Очистить историю')}</button></div>
    <div class="ai-history-list">${rows}</div>
  `;
}

function handleContentSubmit(event: Event): void {
  const form = (event.target as Element | null)?.closest<HTMLFormElement>('[data-custom-memory-form]');
  if (!form) return;
  event.preventDefault();
  const data = new FormData(form);
  const memories = readCustomMemories();
  const ordinal = nextMemoryOrdinal(memories);
  const valueType = readMemoryType(data.get('valueType'));
  const definition: CustomMemoryDefinition = {
    key: `user_memory_${ordinal}`,
    label: String(data.get('label') || `Custom memory ${ordinal}`).trim() || `Custom memory ${ordinal}`,
    labelRu: String(data.get('labelRu') || `Память ${ordinal}`).trim() || `Память ${ordinal}`,
    valueType,
    defaultValue: parseDefaultValue(valueType, String(data.get('defaultValue') ?? '')),
    createdAtMs: Date.now(),
  };
  memories.push(definition);
  writeJson(CUSTOM_MEMORY_KEY, memories);
  const graph = readGraph();
  if (graph) {
    graph.blackboardDefaults = { ...(graph.blackboardDefaults ?? {}), [definition.key]: definition.defaultValue };
    writeGraph(graph);
  }
  form.reset();
  const defaultInput = form.elements.namedItem('defaultValue') as HTMLInputElement | null;
  if (defaultInput) defaultInput.value = '0';
  enhanceCustomMemorySelectors();
  renderWorkbench();
}

function handleContentClick(event: Event): void {
  const target = event.target as Element | null;
  const createButton = target?.closest<HTMLButtonElement>('[data-memory-node]');
  if (createButton) {
    const key = createButton.dataset.memoryKey ?? '';
    const kind = createButton.dataset.memoryNode ?? '';
    const memory = readCustomMemories().find((item) => item.key === key);
    if (!memory) return;
    const template = customMemoryTemplate(memory, kind);
    if (template) addNodeToGraph(template, memory);
    return;
  }
  const deleteButton = target?.closest<HTMLButtonElement>('[data-memory-delete]');
  if (deleteButton) {
    const key = deleteButton.dataset.memoryDelete ?? '';
    if (!key || memoryUsage(key) > 0) return;
    writeJson(CUSTOM_MEMORY_KEY, readCustomMemories().filter((item) => item.key !== key));
    const graph = readGraph();
    if (graph?.blackboardDefaults) {
      delete graph.blackboardDefaults[key];
      writeGraph(graph);
    }
    renderWorkbench();
    return;
  }
  if (target?.closest('[data-diagnostics-refresh]')) {
    renderWorkbench();
    return;
  }
  const diagnosticButton = target?.closest<HTMLButtonElement>('[data-diagnostic-node]');
  if (diagnosticButton?.dataset.diagnosticNode) {
    const node = document.querySelector<HTMLElement>(`.graph-node[data-node-id="${cssEscape(diagnosticButton.dataset.diagnosticNode)}"]`);
    closeWorkbench();
    node?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    node?.click();
    return;
  }
  if (target?.closest('[data-history-clear]')) {
    writeJson(HISTORY_KEY, []);
    lastHistorySignature = '';
    renderWorkbench();
  }
}

function enhanceCustomMemorySelectors(): void {
  const memories = readCustomMemories();
  if (!memories.length) return;
  const graph = readGraph();
  const selectedNodeId = document.querySelector<HTMLElement>('.graph-node.selected[data-node-id]')?.dataset.nodeId;
  const selectedNode = graph?.nodes.find((node) => node.id === selectedNodeId);
  document.querySelectorAll<HTMLSelectElement>('.human-node-panel select[data-param-key]').forEach((select) => {
    const parameterKey = select.dataset.paramKey ?? '';
    const expectedValue = selectedNode?.parameters?.[parameterKey];
    const compatible = memories.filter((memory) => parameterKey === 'flagKey' ? memory.valueType === 'boolean' : ['sourceKey', 'modifierKey'].includes(parameterKey) ? memory.valueType === 'number' : false);
    for (const memory of compatible) {
      if (!select.querySelector(`option[value="${cssEscape(memory.key)}"]`)) {
        const option = document.createElement('option');
        option.value = memory.key;
        option.textContent = `${memory.labelRu} · ${memory.key}`;
        select.append(option);
      }
    }
    if (typeof expectedValue === 'string' && select.querySelector(`option[value="${cssEscape(expectedValue)}"]`)) select.value = expectedValue;
  });
}

function analyzeGraph(): GraphDiagnostic[] {
  const graph = readGraph();
  if (!graph) return [{ severity: 'error', nodeId: null, message: 'The graph could not be read.', messageRu: 'Не удалось прочитать граф.' }];
  const customKeys = new Set(readCustomMemories().map((item) => item.key));
  const diagnostics: GraphDiagnostic[] = [];
  for (const node of graph.nodes) {
    const parameters = node.parameters ?? {};
    for (const parameterName of ['sourceKey', 'modifierKey', 'flagKey', 'fromKey', 'toKey', 'targetKey']) {
      const value = parameters[parameterName];
      if (typeof value !== 'string' || !value) continue;
      if (['self', 'cover', 'enemy', 'orderPoint', 'orderTarget', 'currentTarget', 'retreatPoint', 'ally', 'commander', 'squad'].includes(value)) continue;
      const resolved = resolveAiConceptKey(value);
      if (resolved !== value) diagnostics.push({ severity: 'info', nodeId: node.id, message: `Old alias “${value}” resolves to “${resolved}”.`, messageRu: `Старое имя «${value}» распознаётся как «${resolved}».` });
      else if (!getAiConcept(value) && !customKeys.has(value) && !value.startsWith('user_')) diagnostics.push({ severity: 'error', nodeId: node.id, message: `Unknown AI Dictionary key: ${value}.`, messageRu: `Неизвестный ключ Словаря ИИ: ${value}.` });
    }
    if (node.type === 'TacticalCheck') {
      const check = String(parameters.checkKind ?? '');
      if (check === 'path_exists') diagnostics.push({ severity: 'warning', nodeId: node.id, message: 'Path exists is still a placeholder and always returns true.', messageRu: 'Проверка «Есть путь» пока является заготовкой и всегда возвращает «Да».' });
      if (check === 'line_of_sight' || check === 'line_of_fire') diagnostics.push({ severity: 'warning', nodeId: node.id, message: `${check} currently follows enemyVisible.`, messageRu: `Проверка «${check === 'line_of_fire' ? 'Линия огня' : 'Линия видимости'}» сейчас повторяет «Враг виден».` });
      if (check === 'can_execute_order') diagnostics.push({ severity: 'warning', nodeId: node.id, message: 'Can execute order only checks that an order exists.', messageRu: '«Можно выполнить приказ» сейчас проверяет только наличие приказа.' });
    }
    if (node.type === 'SetAction') {
      const action = String(parameters.action ?? '');
      if (['fire', 'suppress', 'reload', 'retreat', 'continue_order'].includes(action)) diagnostics.push({ severity: 'warning', nodeId: node.id, message: `Action “${action}” uses the current simplified executor.`, messageRu: `Действие «${action}» использует текущий упрощённый исполнитель.` });
    }
    if (node.type === 'SetMovementMode') diagnostics.push({ severity: 'warning', nodeId: node.id, message: 'Movement mode is recorded but not yet a complete multi-step executor.', messageRu: 'Режим движения записывается, но пока не является полноценным многошаговым исполнителем.' });
    if (node.type === 'FindBestObject' && String(parameters.objectKind ?? 'cover') !== 'cover') diagnostics.push({ severity: 'warning', nodeId: node.id, message: 'Only cover object search is currently connected to the tactical host.', messageRu: 'Сейчас к тактическому движку подключён только поиск укрытия.' });
    if (node.type === 'SelectTarget') diagnostics.push({ severity: 'warning', nodeId: node.id, message: 'Target-rule labels do not yet perform full multi-target ranking.', messageRu: 'Правила выбора цели пока не выполняют полный перебор и оценку нескольких целей.' });
    const writeTo = parameters.writeTo;
    if (typeof writeTo === 'string' && writeTo && !getAiConcept(writeTo) && !customKeys.has(writeTo) && !writeTo.startsWith('user_')) diagnostics.push({ severity: 'info', nodeId: node.id, message: `Memory “${writeTo}” was entered manually. The custom-memory wizard is safer.`, messageRu: `Память «${writeTo}» введена вручную. Безопаснее создать её через мастер своей памяти.` });
  }
  return diagnostics;
}

function captureDecisionHistory(): void {
  const payload = readJson<RuntimeDebugPayload>(DEBUG_STORAGE_KEY);
  if (!payload || payload.kind !== 'ai-graph-runtime-debug' || !payload.unitId || !payload.nowMs) return;
  const signature = `${payload.unitId}:${payload.nowMs}:${payload.selectedBranchNodeId ?? ''}`;
  if (signature === lastHistorySignature) return;
  const history = readHistory();
  if (history.some((entry) => entry.id === signature)) {
    lastHistorySignature = signature;
    return;
  }
  history.unshift({ ...payload, id: signature, recordedAtMs: Date.now() });
  writeJson(HISTORY_KEY, history.slice(0, MAX_HISTORY));
  lastHistorySignature = signature;
  if (!root.hidden && activeTab === 'history') renderWorkbench();
}

function customMemoryTemplate(memory: CustomMemoryDefinition, kind: string): AiConceptNodeTemplate | null {
  if (kind === 'flag' && memory.valueType === 'boolean') return { nodeType: 'FlagCheck', label: 'Custom memory flag', labelRu: 'Проверка своей памяти', parameters: { flagKey: memory.key, expected: true, cooldownSeconds: 0, cooldownTiming: 'after' } };
  if (kind === 'threshold' && memory.valueType === 'number') return { nodeType: 'BlackboardValueAbove', label: 'Custom memory threshold', labelRu: 'Порог своей памяти', parameters: { sourceKey: memory.key, comparison: 'above', threshold: 50, cooldownSeconds: 0, cooldownTiming: 'after' } };
  if (kind === 'score' && memory.valueType === 'number') return { nodeType: 'ParameterScore', label: 'Custom memory score', labelRu: 'Оценка своей памяти', parameters: { sourceKey: memory.key, direction: 'positive', weight: 1, cooldownSeconds: 0, cooldownTiming: 'after' } };
  return null;
}

function addNodeToGraph(template: AiConceptNodeTemplate, memory: CustomMemoryDefinition): void {
  const graph = readGraph();
  if (!graph) return;
  const selectedNodeId = document.querySelector<HTMLElement>('.graph-node.selected[data-node-id]')?.dataset.nodeId ?? graph.rootNodeId;
  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId);
  const nodeId = makeUniqueNodeId(graph, template.nodeType);
  const definition = AI_NODE_TYPE_DEFINITIONS[template.nodeType as keyof typeof AI_NODE_TYPE_DEFINITIONS];
  graph.nodes.push({ id: nodeId, type: template.nodeType, displayName: definition?.label ?? template.label, displayNameRu: definition?.labelRu ?? template.labelRu, children: [], parameters: { ...template.parameters } });
  if (selectedNode) selectedNode.children = Array.from(new Set([...(selectedNode.children ?? []), nodeId]));
  graph.blackboardDefaults = { ...(graph.blackboardDefaults ?? {}), [memory.key]: memory.defaultValue };
  writeGraph(graph);
  const positions = readJson<Record<string, { x: number; y: number }>>(POSITION_STORAGE_KEY) ?? {};
  const selectedPosition = positions[selectedNodeId] ?? { x: 90, y: 140 };
  positions[nodeId] = { x: selectedPosition.x + 270, y: selectedPosition.y + 120 };
  writeJson(POSITION_STORAGE_KEY, positions);
  window.location.reload();
}

function readCustomMemories(): CustomMemoryDefinition[] {
  const raw = readJson<unknown>(CUSTOM_MEMORY_KEY);
  if (!Array.isArray(raw)) return [];
  return raw.filter(isCustomMemoryDefinition);
}

function readHistory(): DecisionHistoryEntry[] {
  const raw = readJson<unknown>(HISTORY_KEY);
  return Array.isArray(raw) ? raw.filter((item): item is DecisionHistoryEntry => typeof item === 'object' && item !== null && typeof (item as DecisionHistoryEntry).id === 'string') : [];
}

function readGraph(): StoredGraph | null {
  const graph = readJson<StoredGraph>(GRAPH_STORAGE_KEY);
  return graph && Array.isArray(graph.nodes) && typeof graph.rootNodeId === 'string' ? graph : null;
}

function writeGraph(graph: StoredGraph): void {
  writeJson(GRAPH_STORAGE_KEY, graph);
}

function memoryUsage(key: string): number {
  const graph = readGraph();
  if (!graph) return 0;
  return graph.nodes.filter((node) => Object.values(node.parameters ?? {}).some((value) => value === key)).length;
}

function nextMemoryOrdinal(memories: readonly CustomMemoryDefinition[]): number {
  const used = new Set(memories.map((memory) => Number(memory.key.match(/user_memory_(\d+)/)?.[1] ?? 0)));
  let ordinal = 1;
  while (used.has(ordinal)) ordinal += 1;
  return ordinal;
}

function readMemoryType(value: FormDataEntryValue | null): CustomMemoryType {
  return value === 'boolean' || value === 'text' ? value : 'number';
}

function parseDefaultValue(type: CustomMemoryType, raw: string): AiBlackboardValue {
  if (type === 'boolean') return ['true', '1', 'yes', 'да'].includes(raw.trim().toLocaleLowerCase());
  if (type === 'number') {
    const number = Number(raw.replace(',', '.'));
    return Number.isFinite(number) ? number : 0;
  }
  return raw;
}

function isCustomMemoryDefinition(value: unknown): value is CustomMemoryDefinition {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<CustomMemoryDefinition>;
  return typeof item.key === 'string' && item.key.startsWith('user_memory_') && typeof item.label === 'string' && typeof item.labelRu === 'string' && ['boolean', 'number', 'text'].includes(String(item.valueType));
}

function makeUniqueNodeId(graph: StoredGraph, type: string): string {
  const base = type.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
  let index = 1;
  while (graph.nodes.some((node) => node.id === `${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}

function formatHistoryValue(value: AiBlackboardValue): string {
  if (value === null) return t('none', 'нет');
  if (typeof value === 'boolean') return value ? t('Yes', 'Да') : t('No', 'Нет');
  if (typeof value === 'object') return `${Math.round(value.x * 10) / 10}, ${Math.round(value.y * 10) / 10}`;
  return String(value);
}

function readLanguage(): Language {
  try { return localStorage.getItem(LANGUAGE_KEY) === 'en' ? 'en' : 'ru'; } catch { return 'ru'; }
}

function readJson<T>(key: string): T | null {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : null; } catch { return null; }
}

function writeJson(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* optional browser persistence */ }
}

function t(en: string, ru: string): string {
  return language === 'ru' ? ru : en;
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(value) : value.replaceAll('"', '\\"');
}
