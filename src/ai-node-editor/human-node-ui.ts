type UiLanguage = 'ru' | 'en';

type JsonPrimitive = string | number | boolean | null;
type JsonPosition = { x: number; y: number };
type JsonValue = JsonPrimitive | JsonPosition;
type JsonObject = Record<string, JsonValue>;

interface HumanNode {
  id: string;
  type: string;
  displayName?: string;
  displayNameRu?: string;
  description?: string;
  descriptionRu?: string;
  children?: string[];
  parameters?: JsonObject;
}

interface HumanGraph {
  nodes?: HumanNode[];
}

const GRAPH_STORAGE_KEY = 'real-wargame.ai-node-editor.graph.v5';
const HUMAN_LANGUAGE_KEY = 'real-wargame.ai-node-editor.human-language.v1';
const DANGER_PREVIEW_KEY = 'real-wargame.ai-node-editor.preview-danger.v1';
const TOOLTIP_DELAY_MS = 2000;

let currentLanguage: UiLanguage = readLanguage();
let tooltipTimer: number | null = null;
let tooltipElement: HTMLDivElement | null = null;
let lastPointer = { x: 0, y: 0 };
let enhanceScheduled = false;

const observer = new MutationObserver(() => scheduleEnhance());
observer.observe(document.body, { childList: true, subtree: true });

document.addEventListener('pointermove', (event) => {
  lastPointer = { x: event.clientX, y: event.clientY };
  if (tooltipElement) {
    positionTooltip(tooltipElement, event.clientX, event.clientY);
  }
});

document.addEventListener('pointerover', (event) => {
  const target = (event.target as Element | null)?.closest('[data-help]');
  if (!target) {
    return;
  }
  const text = target.getAttribute('data-help');
  if (!text) {
    return;
  }
  clearTooltipTimer();
  hideTooltip();
  tooltipTimer = window.setTimeout(() => {
    showTooltip(text, lastPointer.x, lastPointer.y);
  }, TOOLTIP_DELAY_MS);
});

document.addEventListener('pointerout', (event) => {
  const target = event.target as Element | null;
  if (target?.closest('[data-help]')) {
    clearTooltipTimer();
    hideTooltip();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    clearTooltipTimer();
    hideTooltip();
  }
});

scheduleEnhance();

function scheduleEnhance(): void {
  if (enhanceScheduled) {
    return;
  }
  enhanceScheduled = true;
  window.requestAnimationFrame(() => {
    enhanceScheduled = false;
    enhanceEditor();
  });
}

function enhanceEditor(): void {
  installLanguageToggle();
  applySingleLanguageView();
  annotateCommonControls();
  annotateGraphObjects();
  renderHumanInspectorForSelectedNode();
}

function installLanguageToggle(): void {
  const button = document.querySelector<HTMLButtonElement>('#language-toggle-editor');
  if (!button || button.dataset.humanLanguageInstalled === 'yes') {
    return;
  }
  button.dataset.humanLanguageInstalled = 'yes';
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    currentLanguage = currentLanguage === 'ru' ? 'en' : 'ru';
    localStorage.setItem(HUMAN_LANGUAGE_KEY, currentLanguage);
    applySingleLanguageView();
    renderHumanInspectorForSelectedNode();
  }, { capture: true });
}

function applySingleLanguageView(): void {
  document.documentElement.lang = currentLanguage;

  const heading = document.querySelector<HTMLElement>('.compact-title h1');
  if (heading) {
    heading.textContent = t('Редактор ИИ солдата', 'Soldier AI Node Editor');
  }

  const languageButton = document.querySelector<HTMLButtonElement>('#language-toggle-editor');
  if (languageButton) {
    languageButton.textContent = currentLanguage.toUpperCase();
    setHelp(languageButton, t('Переключить язык интерфейса. Показывается только выбранный язык, второй язык остаётся в данных.', 'Switch interface language. Only the selected language is shown; the other language stays in data.'));
  }

  const addNodeButton = document.querySelector<HTMLButtonElement>('#toggle-palette');
  if (addNodeButton) {
    addNodeButton.textContent = t('+ Добавить ноду', '+ Add node');
  }

  document.querySelectorAll<HTMLElement>('.node-secondary').forEach((element) => {
    element.hidden = true;
  });
}

function annotateCommonControls(): void {
  setHelp('#toggle-palette', t('Открывает список типов нод. Нода добавится в центр текущего вида.', 'Opens the node type list. The new node appears in the current view center.'));
  setHelp('#toggle-inspector', t('Показывает или скрывает панель выбранной ноды.', 'Shows or hides the selected node panel.'));
  setHelp('#run-check-45', t('Проверяет, что local engine подключён и граф проходит тестовое решение.', 'Checks that the local engine is connected and the graph can be evaluated.'));
  setHelp('#validate-graph', t('Отправляет текущий изменённый граф в local engine на проверку.', 'Sends the current edited graph to the local engine for validation.'));
  setHelp('#evaluate-once', t('Просит local engine один раз рассчитать решение тестового солдата.', 'Asks the local engine to calculate one decision for a test soldier.'));
  setHelp('#export-graph', t('Скачивает текущий граф в JSON-файл. Репозиторий напрямую не меняется.', 'Downloads the current graph as JSON. It does not directly change the repository.'));
  setHelp('#fit-graph', t('Подгоняет масштаб и положение так, чтобы граф было удобнее видеть.', 'Fits scale and pan so the graph is easier to see.'));
  setHelp('#zoom-in', t('Увеличить canvas.', 'Zoom in.'));
  setHelp('#zoom-out', t('Уменьшить canvas.', 'Zoom out.'));
}

function annotateGraphObjects(): void {
  document.querySelectorAll<HTMLElement>('.graph-node[data-node-id]').forEach((nodeElement) => {
    const nodeId = nodeElement.dataset.nodeId ?? '';
    const node = findNode(nodeId);
    const title = labelForNode(node);
    const text = node?.type === 'DangerAbove'
      ? t('Условие: сравнивает danger из памяти солдата с порогом. Кликни, чтобы увидеть человеческий интерфейс настройки.', 'Condition: compares soldier memory danger with a threshold. Click to open the human control panel.')
      : t(`Нода ${title}. Клик — выбрать. Правая кнопка — меню. Жёлтая точка справа — протянуть связь.`, `Node ${title}. Click to select. Right click for menu. Yellow right dot creates a link.`);
    setHelp(nodeElement, text);
  });

  document.querySelectorAll<HTMLElement>('.node-port.in').forEach((port) => {
    setHelp(port, t('Вход ноды. Сюда приходят связи от предыдущих шагов графа.', 'Node input. Links from previous graph steps arrive here.'));
  });
  document.querySelectorAll<HTMLElement>('.node-port.out').forEach((port) => {
    setHelp(port, t('Выход ноды. Зажми и протяни линию к другой ноде, чтобы создать связь.', 'Node output. Drag from here to another node to create a link.'));
  });
  document.querySelectorAll<SVGPathElement>('.edge-path:not(.preview)').forEach((path, index) => {
    setHelp(path, t(`Связь графа #${index + 1}. Если предыдущая нода пропускает выполнение, граф идёт дальше по этой линии.`, `Graph link #${index + 1}. If the previous node passes, the graph continues through this line.`));
  });
}

function renderHumanInspectorForSelectedNode(): void {
  const selectedElement = document.querySelector<HTMLElement>('.graph-node.selected[data-node-id]');
  const selectedNodeId = selectedElement?.dataset.nodeId;
  const node = selectedNodeId ? findNode(selectedNodeId) : null;
  const inspector = document.querySelector<HTMLElement>('.inspector-panel');
  if (!inspector) {
    return;
  }

  inspector.querySelector('.human-node-panel')?.remove();
  inspector.querySelectorAll<HTMLElement>('.human-hidden-original').forEach((element) => element.classList.remove('human-hidden-original'));

  if (!node || node.type !== 'DangerAbove') {
    return;
  }

  const originalCards = Array.from(inspector.querySelectorAll<HTMLElement>('.inspector-card'));
  const editCard = originalCards.find((card) => card.textContent?.includes('parameters JSON') || card.textContent?.includes('Edit'));
  editCard?.classList.add('human-hidden-original');

  const summaryCard = originalCards[0];
  const panel = document.createElement('section');
  panel.className = 'human-node-panel danger-above';
  panel.innerHTML = renderDangerAbovePanel(node);
  if (summaryCard) {
    summaryCard.insertAdjacentElement('afterend', panel);
  } else {
    inspector.prepend(panel);
  }

  installDangerPanelHandlers(panel, node);
  annotateDangerPanel(panel);
}

function renderDangerAbovePanel(node: HumanNode): string {
  const threshold = readNumber(node.parameters?.threshold, 60);
  const previewDanger = readPreviewDanger();
  const passed = previewDanger > threshold;
  const childList = Array.isArray(node.children) && node.children.length > 0
    ? node.children.map((childId) => `<li><code>${escapeHtml(childId)}</code> — ${escapeHtml(t('следующая нода, если условие прошло', 'next node if the condition passes'))}</li>`).join('')
    : `<li>${escapeHtml(t('Связей пока нет. Протяни линию из правой точки ноды к другой ноде.', 'No links yet. Drag from the right dot to another node.'))}</li>`;

  return `
    <header class="human-panel-header">
      <div>
        <span class="human-kicker">${escapeHtml(t('Человеческий интерфейс ноды', 'Human node interface'))}</span>
        <h3>${escapeHtml(t('Опасность выше порога', 'Danger above threshold'))}</h3>
      </div>
      <span class="danger-result ${passed ? 'pass' : 'fail'}">${passed ? 'PASS' : 'FAIL'}</span>
    </header>

    <p class="human-description">${escapeHtml(t(
      'Проверяет: стала ли опасность для солдата выше выбранного порога. Если да, граф может идти дальше по этой ветке.',
      'Checks whether soldier danger is above the selected threshold. If yes, the graph can continue through this branch.',
    ))}</p>

    <div class="human-info-grid">
      <div><b>${escapeHtml(t('Источник', 'Source'))}</b><span>danger</span></div>
      <div><b>${escapeHtml(t('Память солдата', 'Soldier memory'))}</b><span>blackboard.danger</span></div>
      <div><b>${escapeHtml(t('Формула', 'Formula'))}</b><span>${escapeHtml(`${previewDanger} > ${threshold}`)}</span></div>
      <div><b>${escapeHtml(t('Результат', 'Result'))}</b><span>${escapeHtml(passed ? t('условие прошло', 'condition passed') : t('условие не прошло', 'condition failed'))}</span></div>
    </div>

    <label class="human-control" data-help="${escapeAttribute(t('Порог опасности. Чем ниже порог, тем раньше солдат считает ситуацию опасной.', 'Danger threshold. Lower values make the soldier react sooner.'))}">
      <span>${escapeHtml(t('Порог опасности', 'Danger threshold'))}: <output class="human-threshold-value">${threshold}</output></span>
      <input class="human-threshold-slider" type="range" min="0" max="100" step="1" value="${threshold}" />
      <input class="human-threshold-number" type="number" min="0" max="100" step="1" value="${threshold}" />
    </label>

    <label class="human-control" data-help="${escapeAttribute(t('Тестовое значение danger. Оно не меняет солдата на карте, а только показывает, как эта нода принимает решение.', 'Preview danger value. It does not change the map soldier; it only shows how this node decides.'))}">
      <span>${escapeHtml(t('Тестовая текущая опасность', 'Preview current danger'))}: <output class="human-preview-value">${previewDanger}</output></span>
      <input class="human-danger-preview-slider" type="range" min="0" max="100" step="1" value="${previewDanger}" />
    </label>

    <div class="human-result-explain ${passed ? 'pass' : 'fail'}">
      ${escapeHtml(passed
        ? t(`${previewDanger} больше ${threshold}: ветка может продолжиться.`, `${previewDanger} is greater than ${threshold}: the branch can continue.`)
        : t(`${previewDanger} не больше ${threshold}: ветка остановится на этом условии.`, `${previewDanger} is not greater than ${threshold}: the branch stops at this condition.`))}
    </div>

    <section class="human-links">
      <h4>${escapeHtml(t('Куда идёт дальше', 'Where it goes next'))}</h4>
      <ul>${childList}</ul>
    </section>

    <div class="human-actions">
      <button class="ai-editor-button primary human-save-threshold" type="button">${escapeHtml(t('Сохранить порог', 'Save threshold'))}</button>
      <button class="ai-editor-button human-open-json" type="button">${escapeHtml(t('Показать JSON', 'Show JSON'))}</button>
    </div>

    <details class="developer-json-details">
      <summary>${escapeHtml(t('Дополнительно: JSON для разработчика', 'Advanced: developer JSON'))}</summary>
      <pre>${escapeHtml(JSON.stringify(node.parameters ?? {}, null, 2))}</pre>
    </details>
  `;
}

function installDangerPanelHandlers(panel: HTMLElement, node: HumanNode): void {
  const thresholdSlider = panel.querySelector<HTMLInputElement>('.human-threshold-slider');
  const thresholdNumber = panel.querySelector<HTMLInputElement>('.human-threshold-number');
  const previewSlider = panel.querySelector<HTMLInputElement>('.human-danger-preview-slider');
  const saveButton = panel.querySelector<HTMLButtonElement>('.human-save-threshold');
  const jsonButton = panel.querySelector<HTMLButtonElement>('.human-open-json');

  const updatePreview = (): void => {
    const threshold = clampNumber(Number(thresholdSlider?.value ?? thresholdNumber?.value ?? 60), 0, 100);
    const previewDanger = clampNumber(Number(previewSlider?.value ?? readPreviewDanger()), 0, 100);
    if (thresholdSlider) thresholdSlider.value = String(threshold);
    if (thresholdNumber) thresholdNumber.value = String(threshold);
    localStorage.setItem(DANGER_PREVIEW_KEY, String(previewDanger));
    node.parameters = { ...(node.parameters ?? {}), threshold };
    panel.innerHTML = renderDangerAbovePanel(node);
    installDangerPanelHandlers(panel, node);
    annotateDangerPanel(panel);
  };

  thresholdSlider?.addEventListener('input', updatePreview);
  thresholdNumber?.addEventListener('input', updatePreview);
  previewSlider?.addEventListener('input', updatePreview);

  saveButton?.addEventListener('click', () => {
    const threshold = clampNumber(Number(panel.querySelector<HTMLInputElement>('.human-threshold-slider')?.value ?? 60), 0, 100);
    const parametersTextArea = document.querySelector<HTMLTextAreaElement>('#node-parameters');
    const saveNodeButton = document.querySelector<HTMLButtonElement>('#save-node');
    const existing = safeParseJsonObject(parametersTextArea?.value ?? '{}');
    existing.threshold = threshold;
    if (parametersTextArea) {
      parametersTextArea.value = JSON.stringify(existing, null, 2);
    }
    saveNodeButton?.click();
  });

  jsonButton?.addEventListener('click', () => {
    const details = panel.querySelector<HTMLDetailsElement>('.developer-json-details');
    if (details) {
      details.open = !details.open;
    }
  });
}

function annotateDangerPanel(panel: HTMLElement): void {
  setHelp(panel, t('Это первый пример ноды с человеческим интерфейсом: без кода на первом уровне, с понятными полями и тестовым результатом.', 'This is the first human node interface: no code on the first level, clear fields and a live preview result.'));
  panel.querySelectorAll<HTMLElement>('button, input, details, .human-info-grid div, .human-result-explain, .human-links').forEach((element) => {
    if (!element.getAttribute('data-help')) {
      setHelp(element, t('Наведи и подожди 2 секунды: такие подсказки объясняют элементы редактора человеческим языком.', 'Hover and wait 2 seconds: these tooltips explain editor objects in human language.'));
    }
  });
}

function findNode(nodeId: string): HumanNode | null {
  const graph = readGraph();
  return graph.nodes?.find((node) => node.id === nodeId) ?? null;
}

function readGraph(): HumanGraph {
  try {
    const raw = localStorage.getItem(GRAPH_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as HumanGraph;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function labelForNode(node: HumanNode | null): string {
  if (!node) {
    return t('неизвестная нода', 'unknown node');
  }
  return currentLanguage === 'ru'
    ? node.displayNameRu || node.displayName || node.id
    : node.displayName || node.displayNameRu || node.id;
}

function readLanguage(): UiLanguage {
  return localStorage.getItem(HUMAN_LANGUAGE_KEY) === 'en' ? 'en' : 'ru';
}

function readPreviewDanger(): number {
  return clampNumber(Number(localStorage.getItem(DANGER_PREVIEW_KEY) ?? 85), 0, 100);
}

function readNumber(value: JsonValue | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function safeParseJsonObject(value: string): JsonObject {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as JsonObject;
    }
  } catch {
    return {};
  }
  return {};
}

function setHelp(target: string | Element, text: string): void {
  const elements = typeof target === 'string'
    ? Array.from(document.querySelectorAll<Element>(target))
    : [target];
  for (const element of elements) {
    element.setAttribute('data-help', text);
  }
}

function showTooltip(text: string, x: number, y: number): void {
  hideTooltip();
  const tooltip = document.createElement('div');
  tooltip.className = 'human-tooltip';
  tooltip.textContent = text;
  document.body.appendChild(tooltip);
  tooltipElement = tooltip;
  positionTooltip(tooltip, x, y);
}

function positionTooltip(tooltip: HTMLElement, x: number, y: number): void {
  const margin = 14;
  const maxX = window.innerWidth - tooltip.offsetWidth - margin;
  const maxY = window.innerHeight - tooltip.offsetHeight - margin;
  tooltip.style.left = `${Math.max(margin, Math.min(maxX, x + 16))}px`;
  tooltip.style.top = `${Math.max(margin, Math.min(maxY, y + 16))}px`;
}

function clearTooltipTimer(): void {
  if (tooltipTimer !== null) {
    window.clearTimeout(tooltipTimer);
    tooltipTimer = null;
  }
}

function hideTooltip(): void {
  tooltipElement?.remove();
  tooltipElement = null;
}

function t(ru: string, en: string): string {
  return currentLanguage === 'ru' ? ru : en;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.round(value)));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/\n/g, ' ');
}
