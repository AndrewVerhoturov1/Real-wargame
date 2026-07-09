export {};

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

interface ThresholdNodeConfig {
  type: 'DangerAbove' | 'StressAbove';
  className: string;
  sourceKey: 'danger' | 'stress';
  previewStorageKey: string;
  previewSliderClass: string;
  defaultThreshold: number;
  defaultPreview: number;
  titleRu: string;
  titleEn: string;
  descriptionRu: string;
  descriptionEn: string;
  thresholdHelpRu: string;
  thresholdHelpEn: string;
  previewHelpRu: string;
  previewHelpEn: string;
  sourceHelpRu: string;
  sourceHelpEn: string;
  memoryHelpRu: string;
  memoryHelpEn: string;
  formulaHelpRu: string;
  formulaHelpEn: string;
  resultHelpRu: string;
  resultHelpEn: string;
}

const GRAPH_STORAGE_KEY = 'real-wargame.ai-node-editor.graph.v5';
const HUMAN_LANGUAGE_KEY = 'real-wargame.ai-node-editor.human-language.v1';
const TOOLTIP_DELAY_MS = 2000;

const THRESHOLD_NODE_CONFIGS: Record<ThresholdNodeConfig['type'], ThresholdNodeConfig> = {
  DangerAbove: {
    type: 'DangerAbove',
    className: 'danger-above',
    sourceKey: 'danger',
    previewStorageKey: 'real-wargame.ai-node-editor.preview-danger.v2',
    previewSliderClass: 'human-danger-preview-slider',
    defaultThreshold: 60,
    defaultPreview: 85,
    titleRu: 'Опасность выше порога',
    titleEn: 'Danger above threshold',
    descriptionRu: 'Проверяет: стала ли опасность для солдата выше выбранного порога. Если да, граф может идти дальше по этой ветке.',
    descriptionEn: 'Checks whether soldier danger is above the selected threshold. If yes, the graph can continue through this branch.',
    thresholdHelpRu: 'Порог опасности. Например 60 означает: пока danger 60 или ниже — условие не проходит; danger 61 и выше — проходит. Чем ниже порог, тем раньше солдат считает ситуацию опасной.',
    thresholdHelpEn: 'Danger threshold. For example, 60 means: danger 60 or lower fails; danger 61 and higher passes. Lower values make the soldier react sooner.',
    previewHelpRu: 'Тестовое значение danger. Это учебная проверка прямо в редакторе: двигай ползунок и смотри, когда нода меняет FAIL на PASS. Настоящего солдата на карте это не меняет.',
    previewHelpEn: 'Preview danger value. This is an editor-only test: move the slider and see when the node changes from FAIL to PASS. It does not change the real map soldier.',
    sourceHelpRu: 'Источник — числовая оценка danger. Её должен рассчитать сенсор/движок по огню, видимости врага, укрытиям и другим угрозам.',
    sourceHelpEn: 'Source is the numeric danger score. Sensors/engine should calculate it from fire, enemy visibility, cover, and other threats.',
    memoryHelpRu: 'blackboard.danger — место в памяти солдата, где хранится текущая опасность. Эта нода только читает значение, не создаёт его сама.',
    memoryHelpEn: 'blackboard.danger is the soldier memory slot with current danger. This node only reads it; it does not create the value.',
    formulaHelpRu: 'Формула этой ноды простая: текущее значение danger должно быть строго больше порога. Равное значение не проходит.',
    formulaHelpEn: 'The node formula is simple: current danger must be strictly greater than the threshold. Equal value does not pass.',
    resultHelpRu: 'PASS значит: условие прошло и граф может идти к дочерним нодам. FAIL значит: эта ветка останавливается на проверке опасности.',
    resultHelpEn: 'PASS means the condition passed and the graph can continue to child nodes. FAIL means this branch stops at the danger check.',
  },
  StressAbove: {
    type: 'StressAbove',
    className: 'stress-above',
    sourceKey: 'stress',
    previewStorageKey: 'real-wargame.ai-node-editor.preview-stress.v2',
    previewSliderClass: 'human-stress-preview-slider',
    defaultThreshold: 55,
    defaultPreview: 70,
    titleRu: 'Стресс выше порога',
    titleEn: 'Stress above threshold',
    descriptionRu: 'Проверяет: стал ли стресс солдата выше выбранного порога. Если да, солдат может перейти к осторожному или защитному поведению.',
    descriptionEn: 'Checks whether soldier stress is above the selected threshold. If yes, the soldier can switch to cautious or defensive behavior.',
    thresholdHelpRu: 'Порог стресса. Например 55 означает: stress 55 или ниже — условие не проходит; stress 56 и выше — проходит. Низкий порог делает солдата более нервным.',
    thresholdHelpEn: 'Stress threshold. For example, 55 means: stress 55 or lower fails; stress 56 and higher passes. Lower threshold makes the soldier more nervous.',
    previewHelpRu: 'Тестовое значение stress. Оно показывает, как нода реагирует на боевое напряжение: потери рядом, огонь, усталость, подавление. Настоящую карту не меняет.',
    previewHelpEn: 'Preview stress value. It shows how the node reacts to combat pressure: nearby losses, fire, fatigue, suppression. It does not change the real map.',
    sourceHelpRu: 'Источник — числовая оценка stress. Это не сама опасность, а внутреннее напряжение солдата от боя и давления.',
    sourceHelpEn: 'Source is the numeric stress score. It is not danger itself, but the soldier internal pressure from combat.',
    memoryHelpRu: 'blackboard.stress — место в памяти солдата, где хранится текущий стресс. Другие системы должны обновлять его перед работой графа.',
    memoryHelpEn: 'blackboard.stress is the soldier memory slot with current stress. Other systems should update it before the graph runs.',
    formulaHelpRu: 'Формула этой ноды: текущее значение stress должно быть строго больше порога. Это отделяет спокойное состояние от напряжённого.',
    formulaHelpEn: 'The node formula: current stress must be strictly greater than the threshold. This separates calm state from pressured state.',
    resultHelpRu: 'PASS значит: стресс уже достаточно высок, можно включать осторожность, поиск укрытия или отказ от рискованного действия. FAIL значит: стресс ещё терпимый.',
    resultHelpEn: 'PASS means stress is high enough to enable caution, cover seeking, or refusing risky behavior. FAIL means stress is still tolerable.',
  },
};

let currentLanguage: UiLanguage = readLanguage();
let tooltipTimer: number | null = null;
let tooltipElement: HTMLDivElement | null = null;
let lastPointer = { x: 0, y: 0 };
let enhanceScheduled = false;
let renderedPanelKey: string | null = null;

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
    renderedPanelKey = null;
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
    setHelp(languageButton, t('Переключает язык интерфейса. На экране остаётся только выбранный язык; второй язык хранится в данных как запасной слой.', 'Switches the interface language. The screen shows only the selected language; the other language stays in data as an overlay.'));
  }

  const addNodeButton = document.querySelector<HTMLButtonElement>('#toggle-palette');
  if (addNodeButton) {
    addNodeButton.textContent = t('+ Добавить ноду', '+ Add node');
  }

  document.querySelectorAll<HTMLElement>('.graph-node[data-node-id]').forEach((nodeElement) => {
    const nodeId = nodeElement.dataset.nodeId ?? '';
    const node = findNode(nodeId);
    const title = nodeElement.querySelector<HTMLElement>('h3');
    if (title && node) {
      title.textContent = labelForNode(node);
    }
  });

  document.querySelectorAll<HTMLElement>('.node-secondary').forEach((element) => {
    element.hidden = true;
  });
}

function annotateCommonControls(): void {
  setHelp('#toggle-palette', t('Открывает список типов нод. После выбора нода появится в центре текущего вида и сразу станет выбранной.', 'Opens the node type list. After choosing a type, the node appears in the current view center and becomes selected.'));
  setHelp('#toggle-inspector', t('Показывает или скрывает правую панель выбранной ноды. Скрывай её, когда нужно больше места для графа.', 'Shows or hides the selected-node panel. Hide it when you need more graph space.'));
  setHelp('#run-check-45', t('Запускает быструю проверку: local engine отвечает, граф проходит validation, тестовый солдат получает решение.', 'Runs a quick check: local engine responds, graph validates, and the test soldier gets a decision.'));
  setHelp('#validate-graph', t('Отправляет текущий изменённый граф в local engine. Если связи или типы нод сломаны, ошибка появится в консоли.', 'Sends the current edited graph to the local engine. If links or node types are broken, the error appears in the console.'));
  setHelp('#evaluate-once', t('Просит local engine один раз рассчитать решение тестового солдата по текущему графу.', 'Asks the local engine to calculate one test-soldier decision from the current graph.'));
  setHelp('#export-graph', t('Скачивает текущий граф в JSON-файл. Это безопасно: исходники репозитория напрямую не меняются.', 'Downloads the current graph as a JSON file. This is safe: repository source files are not changed directly.'));
  setHelp('#fit-graph', t('Подгоняет масштаб и положение canvas так, чтобы ноды было удобнее видеть.', 'Fits canvas scale and pan so nodes are easier to see.'));
  setHelp('#zoom-in', t('Увеличить canvas. Ноды и связи станут крупнее.', 'Zoom in. Nodes and links become larger.'));
  setHelp('#zoom-out', t('Уменьшить canvas. Удобно, когда граф не помещается на экране.', 'Zoom out. Useful when the graph does not fit on screen.'));
}

function annotateGraphObjects(): void {
  document.querySelectorAll<HTMLElement>('.graph-node[data-node-id]').forEach((nodeElement) => {
    const nodeId = nodeElement.dataset.nodeId ?? '';
    const node = findNode(nodeId);
    const config = getThresholdConfig(node?.type ?? '');
    const title = labelForNode(node);
    const text = config
      ? t(`Эта нода проверяет ${config.sourceKey}: если значение выше порога, результат PASS и граф может идти дальше по связям. Кликни ноду, чтобы настроить порог без JSON.`, `This node checks ${config.sourceKey}: if the value is above threshold, result is PASS and the graph can continue through links. Click it to edit the threshold without JSON.`)
      : t(`Нода «${title}». Клик — выбрать. Правая кнопка — меню. Жёлтая точка справа — протянуть связь к следующей ноде.`, `Node “${title}”. Click to select. Right click for menu. Yellow right dot creates a link to the next node.`);
    setHelp(nodeElement, text);
  });

  document.querySelectorAll<HTMLElement>('.node-port.in').forEach((port) => {
    setHelp(port, t('Вход ноды. Сюда приходят связи от предыдущих шагов графа. Если входов нет, нода может быть недостижимой.', 'Node input. Links from previous graph steps arrive here. If there are no inputs, the node may be unreachable.'));
  });
  document.querySelectorAll<HTMLElement>('.node-port.out').forEach((port) => {
    setHelp(port, t('Выход ноды. Зажми эту точку и протяни линию к другой ноде, чтобы создать связь parent → child.', 'Node output. Drag from this dot to another node to create a parent → child link.'));
  });
  document.querySelectorAll<SVGPathElement>('.edge-path:not(.preview)').forEach((path, index) => {
    setHelp(path, t(`Связь графа #${index + 1}. По этой линии выполнение переходит от родительской ноды к дочерней.`, `Graph link #${index + 1}. Execution moves along this line from parent node to child node.`));
  });
}

function renderHumanInspectorForSelectedNode(): void {
  const selectedElement = document.querySelector<HTMLElement>('.graph-node.selected[data-node-id]');
  const selectedNodeId = selectedElement?.dataset.nodeId;
  const node = selectedNodeId ? findNode(selectedNodeId) : null;
  const inspector = document.querySelector<HTMLElement>('.inspector-panel');
  if (!inspector) {
    renderedPanelKey = null;
    return;
  }

  const config = getThresholdConfig(node?.type ?? '');
  const existingPanel = inspector.querySelector<HTMLElement>('.human-node-panel');
  const panelKey = node && config ? `${node.id}:${node.type}:${currentLanguage}` : null;

  if (!node || !config || !panelKey) {
    existingPanel?.remove();
    renderedPanelKey = null;
    inspector.querySelectorAll<HTMLElement>('.human-hidden-original').forEach((element) => element.classList.remove('human-hidden-original'));
    return;
  }

  if (existingPanel?.dataset.panelKey === panelKey && renderedPanelKey === panelKey) {
    return;
  }

  existingPanel?.remove();
  inspector.querySelectorAll<HTMLElement>('.human-hidden-original').forEach((element) => element.classList.remove('human-hidden-original'));

  const originalCards = Array.from(inspector.querySelectorAll<HTMLElement>('.inspector-card'));
  const editCard = originalCards.find((card) => card.textContent?.includes('parameters JSON') || card.textContent?.includes('Edit'));
  editCard?.classList.add('human-hidden-original');

  const summaryCard = originalCards[0];
  const panel = document.createElement('section');
  panel.className = `human-node-panel threshold-node ${config.className}`;
  panel.dataset.panelKey = panelKey;
  panel.innerHTML = renderThresholdPanel(node, config);
  if (summaryCard) {
    summaryCard.insertAdjacentElement('afterend', panel);
  } else {
    inspector.prepend(panel);
  }

  installThresholdPanelHandlers(panel, node, config);
  renderedPanelKey = panelKey;
}

function renderThresholdPanel(node: HumanNode, config: ThresholdNodeConfig): string {
  const threshold = readNumber(node.parameters?.threshold, config.defaultThreshold);
  const previewValue = readPreviewValue(config);
  const passed = previewValue > threshold;
  const childList = Array.isArray(node.children) && node.children.length > 0
    ? node.children.map((childId) => `<li data-help="${escapeAttribute(t('Дочерняя нода. Если условие PASS, выполнение сможет перейти сюда.', 'Child node. If the condition is PASS, execution can continue here.'))}"><code>${escapeHtml(childId)}</code> — ${escapeHtml(t('следующая нода, если условие прошло', 'next node if the condition passes'))}</li>`).join('')
    : `<li data-help="${escapeAttribute(t('У этой проверки пока нет продолжения. Чтобы добавить его, протяни связь из правой точки ноды к другой ноде.', 'This check has no continuation yet. To add one, drag a link from the right dot to another node.'))}">${escapeHtml(t('Связей пока нет. Протяни линию из правой точки ноды к другой ноде.', 'No links yet. Drag from the right dot to another node.'))}</li>`;

  return `
    <header class="human-panel-header" data-help="${escapeAttribute(t('Заголовок показывает тип выбранной ноды и текущий итог проверки: PASS или FAIL.', 'Header shows the selected node type and current check result: PASS or FAIL.'))}">
      <div>
        <span class="human-kicker">${escapeHtml(t('Человеческий интерфейс ноды', 'Human node interface'))}</span>
        <h3>${escapeHtml(t(config.titleRu, config.titleEn))}</h3>
      </div>
      <span class="danger-result threshold-result ${passed ? 'pass' : 'fail'}" data-help="${escapeAttribute(t(config.resultHelpRu, config.resultHelpEn))}">${passed ? 'PASS' : 'FAIL'}</span>
    </header>

    <p class="human-description" data-help="${escapeAttribute(t('Короткое описание смысла ноды. Здесь должно быть понятно, зачем она нужна, без чтения кода.', 'Short explanation of what the node does. It should be understandable without reading code.'))}">${escapeHtml(t(config.descriptionRu, config.descriptionEn))}</p>

    <div class="human-info-grid">
      <div data-help="${escapeAttribute(t(config.sourceHelpRu, config.sourceHelpEn))}"><b>${escapeHtml(t('Источник', 'Source'))}</b><span>${escapeHtml(config.sourceKey)}</span></div>
      <div data-help="${escapeAttribute(t(config.memoryHelpRu, config.memoryHelpEn))}"><b>${escapeHtml(t('Память солдата', 'Soldier memory'))}</b><span>blackboard.${escapeHtml(config.sourceKey)}</span></div>
      <div data-help="${escapeAttribute(t(config.formulaHelpRu, config.formulaHelpEn))}"><b>${escapeHtml(t('Формула', 'Formula'))}</b><span class="human-formula-value">${escapeHtml(`${previewValue} > ${threshold}`)}</span></div>
      <div data-help="${escapeAttribute(t(config.resultHelpRu, config.resultHelpEn))}"><b>${escapeHtml(t('Результат', 'Result'))}</b><span class="human-result-label">${escapeHtml(passed ? t('условие прошло', 'condition passed') : t('условие не прошло', 'condition failed'))}</span></div>
    </div>

    <label class="human-control" data-help="${escapeAttribute(t(config.thresholdHelpRu, config.thresholdHelpEn))}">
      <span>${escapeHtml(t('Порог', 'Threshold'))}: <output class="human-threshold-value">${threshold}</output></span>
      <input class="human-threshold-slider" type="range" min="0" max="100" step="1" value="${threshold}" data-help="${escapeAttribute(t(config.thresholdHelpRu, config.thresholdHelpEn))}" />
      <input class="human-threshold-number" type="number" min="0" max="100" step="1" value="${threshold}" data-help="${escapeAttribute(t('То же значение порога, но числом. Удобно ввести точное значение руками.', 'The same threshold value as a number. Useful when you need an exact value.'))}" />
    </label>

    <label class="human-control" data-help="${escapeAttribute(t(config.previewHelpRu, config.previewHelpEn))}">
      <span>${escapeHtml(t('Текущее тестовое значение', 'Preview current value'))}: <output class="human-preview-value">${previewValue}</output></span>
      <input class="${config.previewSliderClass} human-preview-slider" type="range" min="0" max="100" step="1" value="${previewValue}" data-help="${escapeAttribute(t(config.previewHelpRu, config.previewHelpEn))}" />
    </label>

    <div class="human-result-explain ${passed ? 'pass' : 'fail'}" data-help="${escapeAttribute(t(config.resultHelpRu, config.resultHelpEn))}">
      ${escapeHtml(makeResultText(config, previewValue, threshold, passed))}
    </div>

    <section class="human-links" data-help="${escapeAttribute(t('Список дочерних нод. Если проверка PASS, граф может продолжить работу по этим связям.', 'List of child nodes. If the check is PASS, the graph can continue through these links.'))}">
      <h4>${escapeHtml(t('Куда идёт дальше', 'Where it goes next'))}</h4>
      <ul>${childList}</ul>
    </section>

    <div class="human-actions">
      <button class="ai-editor-button primary human-save-threshold" type="button" data-help="${escapeAttribute(t('Записывает выбранный порог в параметры этой ноды. После этого Validate/Evaluate будут использовать новое значение.', 'Writes the selected threshold into this node parameters. Validate/Evaluate will use the new value after saving.'))}">${escapeHtml(t('Сохранить порог', 'Save threshold'))}</button>
      <button class="ai-editor-button human-open-json" type="button" data-help="${escapeAttribute(t('Открывает технический JSON этой ноды. Это запасной режим для отладки, не основной интерфейс.', 'Opens this node technical JSON. This is a fallback debug view, not the main interface.'))}">${escapeHtml(t('Показать JSON', 'Show JSON'))}</button>
    </div>

    <details class="developer-json-details" data-help="${escapeAttribute(t('Скрытый технический слой. Нужен разработчику или агенту, но обычная настройка ноды должна делаться полями выше.', 'Hidden technical layer. Useful for a developer or agent, but normal node tuning should use the fields above.'))}">
      <summary>${escapeHtml(t('Дополнительно: JSON для разработчика', 'Advanced: developer JSON'))}</summary>
      <pre>${escapeHtml(JSON.stringify(node.parameters ?? {}, null, 2))}</pre>
    </details>
  `;
}

function installThresholdPanelHandlers(panel: HTMLElement, node: HumanNode, config: ThresholdNodeConfig): void {
  const thresholdSlider = panel.querySelector<HTMLInputElement>('.human-threshold-slider');
  const thresholdNumber = panel.querySelector<HTMLInputElement>('.human-threshold-number');
  const previewSlider = panel.querySelector<HTMLInputElement>('.human-preview-slider');
  const saveButton = panel.querySelector<HTMLButtonElement>('.human-save-threshold');
  const jsonButton = panel.querySelector<HTMLButtonElement>('.human-open-json');

  const updateLivePreview = (): void => {
    const threshold = clampNumber(Number(thresholdSlider?.value ?? thresholdNumber?.value ?? config.defaultThreshold), 0, 100);
    const previewValue = clampNumber(Number(previewSlider?.value ?? readPreviewValue(config)), 0, 100);
    const passed = previewValue > threshold;

    if (thresholdSlider && thresholdSlider.value !== String(threshold)) thresholdSlider.value = String(threshold);
    if (thresholdNumber && thresholdNumber.value !== String(threshold)) thresholdNumber.value = String(threshold);
    if (previewSlider && previewSlider.value !== String(previewValue)) previewSlider.value = String(previewValue);

    localStorage.setItem(config.previewStorageKey, String(previewValue));
    panel.querySelector<HTMLOutputElement>('.human-threshold-value')!.textContent = String(threshold);
    panel.querySelector<HTMLOutputElement>('.human-preview-value')!.textContent = String(previewValue);
    panel.querySelector<HTMLElement>('.human-formula-value')!.textContent = `${previewValue} > ${threshold}`;
    panel.querySelector<HTMLElement>('.human-result-label')!.textContent = passed ? t('условие прошло', 'condition passed') : t('условие не прошло', 'condition failed');

    const badge = panel.querySelector<HTMLElement>('.threshold-result');
    const explain = panel.querySelector<HTMLElement>('.human-result-explain');
    badge?.classList.toggle('pass', passed);
    badge?.classList.toggle('fail', !passed);
    if (badge) badge.textContent = passed ? 'PASS' : 'FAIL';
    explain?.classList.toggle('pass', passed);
    explain?.classList.toggle('fail', !passed);
    if (explain) explain.textContent = makeResultText(config, previewValue, threshold, passed);
  };

  thresholdSlider?.addEventListener('input', updateLivePreview);
  thresholdNumber?.addEventListener('input', updateLivePreview);
  previewSlider?.addEventListener('input', updateLivePreview);

  saveButton?.addEventListener('click', () => {
    const threshold = clampNumber(Number(panel.querySelector<HTMLInputElement>('.human-threshold-slider')?.value ?? config.defaultThreshold), 0, 100);
    const parametersTextArea = document.querySelector<HTMLTextAreaElement>('#node-parameters');
    const saveNodeButton = document.querySelector<HTMLButtonElement>('#save-node');
    const existing = safeParseJsonObject(parametersTextArea?.value ?? '{}');
    existing.threshold = threshold;
    node.parameters = { ...(node.parameters ?? {}), threshold };
    if (parametersTextArea) {
      parametersTextArea.value = JSON.stringify(existing, null, 2);
    }
    renderedPanelKey = null;
    saveNodeButton?.click();
  });

  jsonButton?.addEventListener('click', () => {
    const details = panel.querySelector<HTMLDetailsElement>('.developer-json-details');
    if (details) {
      details.open = !details.open;
    }
  });
}

function makeResultText(config: ThresholdNodeConfig, previewValue: number, threshold: number, passed: boolean): string {
  if (passed) {
    return t(
      `${previewValue} больше ${threshold}: ветка может продолжиться.`,
      `${previewValue} is greater than ${threshold}: the branch can continue.`,
    );
  }
  return t(
    `${previewValue} не больше ${threshold}: ветка остановится на этом условии.`,
    `${previewValue} is not greater than ${threshold}: the branch stops at this condition.`,
  );
}

function getThresholdConfig(type: string): ThresholdNodeConfig | null {
  return type === 'DangerAbove' || type === 'StressAbove' ? THRESHOLD_NODE_CONFIGS[type] : null;
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

function readPreviewValue(config: ThresholdNodeConfig): number {
  return clampNumber(Number(localStorage.getItem(config.previewStorageKey) ?? config.defaultPreview), 0, 100);
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
