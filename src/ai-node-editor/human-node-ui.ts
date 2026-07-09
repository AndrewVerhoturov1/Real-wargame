export {};

type UiLanguage = 'ru' | 'en';
type ThresholdComparison = 'above' | 'below';

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
  blackboardDefaults?: JsonObject;
  nodes?: HumanNode[];
}

interface NumericSourceOption {
  key: string;
  label: string;
  labelRu: string;
  description: string;
  descriptionRu: string;
  defaultPreview: number;
}

const GRAPH_STORAGE_KEY = 'real-wargame.ai-node-editor.graph.v5';
const HUMAN_LANGUAGE_KEY = 'real-wargame.ai-node-editor.human-language.v1';
const TOOLTIP_DELAY_MS = 2000;
const PREVIEW_STORAGE_PREFIX = 'real-wargame.ai-node-editor.preview-value.v1.';

const BUILTIN_NUMERIC_SOURCES: readonly NumericSourceOption[] = [
  {
    key: 'danger',
    label: 'Danger',
    labelRu: 'Опасность',
    description: 'Current danger score from fire, enemy visibility, cover, and other threats.',
    descriptionRu: 'Текущая опасность от огня, видимости врага, укрытий и других угроз.',
    defaultPreview: 85,
  },
  {
    key: 'stress',
    label: 'Stress',
    labelRu: 'Стресс',
    description: 'Internal combat pressure: suppression, fatigue, nearby losses, and fear.',
    descriptionRu: 'Внутреннее боевое напряжение: подавление, усталость, потери рядом и страх.',
    defaultPreview: 70,
  },
  {
    key: 'suppression',
    label: 'Suppression',
    labelRu: 'Подавление',
    description: 'How strongly incoming fire prevents normal action.',
    descriptionRu: 'Насколько входящий огонь мешает нормально действовать.',
    defaultPreview: 50,
  },
  {
    key: 'fatigue',
    label: 'Fatigue',
    labelRu: 'Усталость',
    description: 'Physical tiredness from movement, stress, and combat load.',
    descriptionRu: 'Физическая усталость от движения, стресса и боевой нагрузки.',
    defaultPreview: 35,
  },
  {
    key: 'morale',
    label: 'Morale',
    labelRu: 'Боевой дух',
    description: 'Current morale or willingness to keep acting under pressure.',
    descriptionRu: 'Текущий боевой дух или готовность продолжать действовать под давлением.',
    defaultPreview: 65,
  },
  {
    key: 'health',
    label: 'Health',
    labelRu: 'Здоровье',
    description: 'Physical condition from 0 to 100 if the simulation writes it to blackboard.',
    descriptionRu: 'Физическое состояние от 0 до 100, если симуляция записывает его в blackboard.',
    defaultPreview: 80,
  },
];

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
  const text = target?.getAttribute('data-help');
  if (!text) return;

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
  if (enhanceScheduled) return;
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
  if (!button || button.dataset.humanLanguageInstalled === 'yes') return;

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
  if (heading) heading.textContent = t('Редактор ИИ солдата', 'Soldier AI Node Editor');

  const languageButton = document.querySelector<HTMLButtonElement>('#language-toggle-editor');
  if (languageButton) {
    languageButton.textContent = currentLanguage.toUpperCase();
    setHelp(languageButton, t('Переключает язык интерфейса. На экране остаётся только выбранный язык; второй язык хранится в данных как запасной слой.', 'Switches the interface language. The screen shows only the selected language; the other language stays in data as an overlay.'));
  }

  const addNodeButton = document.querySelector<HTMLButtonElement>('#toggle-palette');
  if (addNodeButton) addNodeButton.textContent = t('+ Добавить ноду', '+ Add node');

  document.querySelectorAll<HTMLElement>('.graph-node[data-node-id]').forEach((nodeElement) => {
    const node = findNode(nodeElement.dataset.nodeId ?? '');
    const title = nodeElement.querySelector<HTMLElement>('h3');
    if (title && node) title.textContent = labelForNode(node);
  });

  document.querySelectorAll<HTMLElement>('.node-secondary').forEach((element) => {
    element.hidden = true;
  });
}

function annotateCommonControls(): void {
  setHelp('#toggle-palette', t('Открывает список типов нод. Для проверок вида danger > 60 или morale < 30 используй одну универсальную ноду «Параметр выше/ниже порога».', 'Opens the node type list. For checks like danger > 60 or morale < 30, use one universal threshold node.'));
  setHelp('#toggle-inspector', t('Показывает или скрывает правую панель выбранной ноды. Скрывай её, когда нужно больше места для графа.', 'Shows or hides the selected-node panel. Hide it when you need more graph space.'));
  setHelp('#run-check-45', t('Запускает быструю проверку: local engine отвечает, граф проходит validation, тестовый солдат получает решение.', 'Runs a quick check: local engine responds, graph validates, and the test soldier gets a decision.'));
  setHelp('#validate-graph', t('Отправляет текущий изменённый граф в local engine. Если sourceKey, comparison или threshold сломаны, ошибка появится в консоли.', 'Sends the current edited graph to the local engine. If sourceKey, comparison, or threshold is broken, the error appears in the console.'));
  setHelp('#evaluate-once', t('Просит local engine один раз рассчитать решение тестового солдата по текущему графу.', 'Asks the local engine to calculate one test-soldier decision from the current graph.'));
  setHelp('#export-graph', t('Скачивает текущий граф в JSON-файл. Это безопасно: исходники репозитория напрямую не меняются.', 'Downloads the current graph as a JSON file. This is safe: repository source files are not changed directly.'));
  setHelp('#fit-graph', t('Подгоняет масштаб и положение canvas так, чтобы ноды было удобнее видеть.', 'Fits canvas scale and pan so nodes are easier to see.'));
  setHelp('#zoom-in', t('Увеличить canvas. Ноды и связи станут крупнее.', 'Zoom in. Nodes and links become larger.'));
  setHelp('#zoom-out', t('Уменьшить canvas. Удобно, когда граф не помещается на экране.', 'Zoom out. Useful when the graph does not fit on screen.'));
}

function annotateGraphObjects(): void {
  document.querySelectorAll<HTMLElement>('.graph-node[data-node-id]').forEach((nodeElement) => {
    const node = findNode(nodeElement.dataset.nodeId ?? '');
    const source = node ? getNodeSourceOption(node) : null;
    const comparison = node ? getComparison(node) : 'above';
    const symbol = comparisonSymbol(comparison);
    const title = labelForNode(node);
    const text = isUniversalThresholdNode(node)
      ? t(`Универсальная проверка: берёт ${source?.key ?? 'sourceKey'} из blackboard и проверяет ${symbol} порога. Кликни, чтобы выбрать параметр и режим выше/ниже.`, `Universal check: reads ${source?.key ?? 'sourceKey'} from blackboard and checks ${symbol} threshold. Click to choose parameter and above/below mode.`)
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

  const existingPanel = inspector.querySelector<HTMLElement>('.human-node-panel');
  const sourceKey = node ? getSourceKey(node) : '';
  const comparison = node ? getComparison(node) : 'above';
  const panelKey = node && isUniversalThresholdNode(node) ? `${node.id}:${node.type}:${sourceKey}:${comparison}:${currentLanguage}` : null;

  if (!node || !isUniversalThresholdNode(node) || !panelKey) {
    existingPanel?.remove();
    renderedPanelKey = null;
    inspector.querySelectorAll<HTMLElement>('.human-hidden-original').forEach((element) => element.classList.remove('human-hidden-original'));
    return;
  }

  if (existingPanel?.dataset.panelKey === panelKey && renderedPanelKey === panelKey) return;

  existingPanel?.remove();
  inspector.querySelectorAll<HTMLElement>('.human-hidden-original').forEach((element) => element.classList.remove('human-hidden-original'));

  const originalCards = Array.from(inspector.querySelectorAll<HTMLElement>('.inspector-card'));
  const editCard = originalCards.find((card) => card.textContent?.includes('parameters JSON') || card.textContent?.includes('Edit'));
  editCard?.classList.add('human-hidden-original');

  const summaryCard = originalCards[0];
  const panel = document.createElement('section');
  panel.className = 'human-node-panel threshold-node blackboard-value-above';
  panel.dataset.panelKey = panelKey;
  panel.innerHTML = renderUniversalThresholdPanel(node);
  if (summaryCard) summaryCard.insertAdjacentElement('afterend', panel);
  else inspector.prepend(panel);

  installUniversalThresholdPanelHandlers(panel, node);
  renderedPanelKey = panelKey;
}

function renderUniversalThresholdPanel(node: HumanNode): string {
  const source = getSourceOption(getSourceKey(node));
  const comparison = getComparison(node);
  const threshold = getThreshold(node);
  const previewValue = readPreviewValue(source);
  const passed = compareThreshold(previewValue, threshold, comparison);
  const symbol = comparisonSymbol(comparison);
  const sourceOptions = getNumericSourceOptions().map((option) => `
    <option value="${escapeAttribute(option.key)}" ${option.key === source.key ? 'selected' : ''}>${escapeHtml(labelForSource(option))} · ${escapeHtml(option.key)}</option>
  `).join('');
  const childList = Array.isArray(node.children) && node.children.length > 0
    ? node.children.map((childId) => `<li data-help="${escapeAttribute(t('Дочерняя нода. Если условие PASS, выполнение сможет перейти сюда.', 'Child node. If the condition is PASS, execution can continue here.'))}"><code>${escapeHtml(childId)}</code> — ${escapeHtml(t('следующая нода, если условие прошло', 'next node if the condition passes'))}</li>`).join('')
    : `<li data-help="${escapeAttribute(t('У этой проверки пока нет продолжения. Чтобы добавить его, протяни связь из правой точки ноды к другой ноде.', 'This check has no continuation yet. To add one, drag a link from the right dot to another node.'))}">${escapeHtml(t('Связей пока нет. Протяни линию из правой точки ноды к другой ноде.', 'No links yet. Drag from the right dot to another node.'))}</li>`;

  return `
    <header class="human-panel-header" data-help="${escapeAttribute(t('Это одна универсальная нода для проверок вида параметр выше порога или параметр ниже порога.', 'This is one universal node for checks where a value is above or below a threshold.'))}">
      <div>
        <span class="human-kicker">${escapeHtml(t('Универсальная нода условия', 'Universal condition node'))}</span>
        <h3>${escapeHtml(t('Параметр выше/ниже порога', 'Blackboard threshold condition'))}</h3>
      </div>
      <span class="danger-result threshold-result ${passed ? 'pass' : 'fail'}" data-help="${escapeAttribute(makeResultHelp(source, comparison))}">${passed ? 'PASS' : 'FAIL'}</span>
    </header>

    <p class="human-description" data-help="${escapeAttribute(t('Одна нода заменяет варианты danger выше порога, stress выше порога, morale ниже порога и другие похожие проверки.', 'One node replaces checks like danger above threshold, stress above threshold, morale below threshold, and similar variants.'))}">${escapeHtml(t('Выбери числовой параметр памяти солдата, режим сравнения и порог. Нода пропускает ветку, если условие выполнено.', 'Choose a numeric soldier-memory parameter, comparison mode, and threshold. The node passes when the condition is true.'))}</p>

    <label class="human-control wide" data-help="${escapeAttribute(makeSourceHelp(source))}">
      <span>${escapeHtml(t('Слушать параметр', 'Listen to parameter'))}</span>
      <select class="human-source-select" data-help="${escapeAttribute(makeSourceHelp(source))}">
        ${sourceOptions}
      </select>
    </label>

    <div class="human-mode-toggle" data-help="${escapeAttribute(t('Выбери направление проверки: значение должно быть выше порога или ниже порога.', 'Choose comparison direction: value must be above threshold or below threshold.'))}">
      <button class="ai-editor-button human-comparison-button ${comparison === 'above' ? 'primary' : ''}" type="button" data-comparison="above" data-help="${escapeAttribute(t('Режим выше: PASS, когда параметр строго больше порога.', 'Above mode: PASS when the value is strictly greater than the threshold.'))}">${escapeHtml(t('Параметр выше порога', 'Value above threshold'))}</button>
      <button class="ai-editor-button human-comparison-button ${comparison === 'below' ? 'primary' : ''}" type="button" data-comparison="below" data-help="${escapeAttribute(t('Режим ниже: PASS, когда параметр строго меньше порога.', 'Below mode: PASS when the value is strictly lower than the threshold.'))}">${escapeHtml(t('Параметр ниже порога', 'Value below threshold'))}</button>
    </div>

    <div class="human-info-grid">
      <div data-help="${escapeAttribute(makeSourceHelp(source))}"><b>${escapeHtml(t('Источник', 'Source'))}</b><span class="human-source-key">${escapeHtml(source.key)}</span></div>
      <div data-help="${escapeAttribute(t(`blackboard.${source.key} — место в памяти солдата, откуда нода читает текущее значение.`, `blackboard.${source.key} is the soldier memory slot read by this node.`))}"><b>${escapeHtml(t('Память солдата', 'Soldier memory'))}</b><span>blackboard.${escapeHtml(source.key)}</span></div>
      <div data-help="${escapeAttribute(makeFormulaHelp(comparison))}"><b>${escapeHtml(t('Формула', 'Formula'))}</b><span class="human-formula-value">${escapeHtml(`${previewValue} ${symbol} ${threshold}`)}</span></div>
      <div data-help="${escapeAttribute(makeResultHelp(source, comparison))}"><b>${escapeHtml(t('Результат', 'Result'))}</b><span class="human-result-label">${escapeHtml(passed ? t('условие прошло', 'condition passed') : t('условие не прошло', 'condition failed'))}</span></div>
    </div>

    <label class="human-control" data-help="${escapeAttribute(makeThresholdHelp(comparison))}">
      <span>${escapeHtml(t('Порог', 'Threshold'))}: <output class="human-threshold-value">${threshold}</output></span>
      <input class="human-threshold-slider" type="range" min="0" max="100" step="1" value="${threshold}" data-help="${escapeAttribute(t('Двигай порог и смотри, когда PASS меняется на FAIL. Это значение сохранится в parameters.threshold.', 'Move the threshold and see when PASS changes to FAIL. This value is saved to parameters.threshold.'))}" />
      <input class="human-threshold-number" type="number" min="0" max="100" step="1" value="${threshold}" data-help="${escapeAttribute(t('То же значение порога, но числом. Удобно ввести точное значение руками.', 'The same threshold value as a number. Useful when you need an exact value.'))}" />
    </label>

    <label class="human-control" data-help="${escapeAttribute(t('Тестовое значение нужно только для понимания работы ноды в редакторе. Оно не меняет настоящего солдата на карте.', 'Preview value only explains the node behavior in the editor. It does not change the real map soldier.'))}">
      <span>${escapeHtml(t('Текущее тестовое значение', 'Preview current value'))}: <output class="human-preview-value">${previewValue}</output></span>
      <input class="human-preview-slider" type="range" min="0" max="100" step="1" value="${previewValue}" data-help="${escapeAttribute(t(`Пробное значение ${source.key}. Двигай его, чтобы увидеть, когда условие станет PASS или FAIL.`, `Preview value for ${source.key}. Move it to see when the condition becomes PASS or FAIL.`))}" />
    </label>

    <div class="human-result-explain ${passed ? 'pass' : 'fail'}" data-help="${escapeAttribute(makeResultHelp(source, comparison))}">
      ${escapeHtml(makeResultText(source, comparison, previewValue, threshold, passed))}
    </div>

    <section class="human-links" data-help="${escapeAttribute(t('Список дочерних нод. Если проверка PASS, граф может продолжить работу по этим связям.', 'List of child nodes. If the check is PASS, the graph can continue through these links.'))}">
      <h4>${escapeHtml(t('Куда идёт дальше', 'Where it goes next'))}</h4>
      <ul>${childList}</ul>
    </section>

    <div class="human-actions">
      <button class="ai-editor-button primary human-save-threshold" type="button" data-help="${escapeAttribute(t('Записывает выбранные sourceKey, comparison и threshold в параметры этой универсальной ноды.', 'Writes selected sourceKey, comparison, and threshold into this universal node parameters.'))}">${escapeHtml(t('Сохранить условие', 'Save condition'))}</button>
      <button class="ai-editor-button human-open-json" type="button" data-help="${escapeAttribute(t('Открывает технический JSON этой ноды. Это запасной режим для отладки, не основной интерфейс.', 'Opens this node technical JSON. This is a fallback debug view, not the main interface.'))}">${escapeHtml(t('Показать JSON', 'Show JSON'))}</button>
    </div>

    <details class="developer-json-details" data-help="${escapeAttribute(t('Скрытый технический слой. Обычная настройка должна делаться выбором параметра, режима выше/ниже и ползунком выше.', 'Hidden technical layer. Normal tuning should use the parameter selector, above/below mode, and slider above.'))}">
      <summary>${escapeHtml(t('Дополнительно: JSON для разработчика', 'Advanced: developer JSON'))}</summary>
      <pre>${escapeHtml(JSON.stringify(node.parameters ?? {}, null, 2))}</pre>
    </details>
  `;
}

function installUniversalThresholdPanelHandlers(panel: HTMLElement, node: HumanNode): void {
  const sourceSelect = panel.querySelector<HTMLSelectElement>('.human-source-select');
  const comparisonButtons = Array.from(panel.querySelectorAll<HTMLButtonElement>('.human-comparison-button'));
  const thresholdSlider = panel.querySelector<HTMLInputElement>('.human-threshold-slider');
  const thresholdNumber = panel.querySelector<HTMLInputElement>('.human-threshold-number');
  const previewSlider = panel.querySelector<HTMLInputElement>('.human-preview-slider');
  const saveButton = panel.querySelector<HTMLButtonElement>('.human-save-threshold');
  const jsonButton = panel.querySelector<HTMLButtonElement>('.human-open-json');
  let comparison = getComparison(node);

  const updateLivePreview = (): void => {
    const source = getSourceOption(sourceSelect?.value ?? getSourceKey(node));
    const threshold = clampNumber(Number(thresholdSlider?.value ?? thresholdNumber?.value ?? 50), 0, 100);
    const previewValue = clampNumber(Number(previewSlider?.value ?? readPreviewValue(source)), 0, 100);
    const passed = compareThreshold(previewValue, threshold, comparison);
    const symbol = comparisonSymbol(comparison);

    if (thresholdSlider && thresholdSlider.value !== String(threshold)) thresholdSlider.value = String(threshold);
    if (thresholdNumber && thresholdNumber.value !== String(threshold)) thresholdNumber.value = String(threshold);
    if (previewSlider && previewSlider.value !== String(previewValue)) previewSlider.value = String(previewValue);

    comparisonButtons.forEach((button) => {
      const active = button.dataset.comparison === comparison;
      button.classList.toggle('primary', active);
    });

    localStorage.setItem(`${PREVIEW_STORAGE_PREFIX}${source.key}`, String(previewValue));
    panel.querySelector<HTMLElement>('.human-source-key')!.textContent = source.key;
    panel.querySelector<HTMLOutputElement>('.human-threshold-value')!.textContent = String(threshold);
    panel.querySelector<HTMLOutputElement>('.human-preview-value')!.textContent = String(previewValue);
    panel.querySelector<HTMLElement>('.human-formula-value')!.textContent = `${previewValue} ${symbol} ${threshold}`;
    panel.querySelector<HTMLElement>('.human-result-label')!.textContent = passed ? t('условие прошло', 'condition passed') : t('условие не прошло', 'condition failed');

    const badge = panel.querySelector<HTMLElement>('.threshold-result');
    const explain = panel.querySelector<HTMLElement>('.human-result-explain');
    badge?.classList.toggle('pass', passed);
    badge?.classList.toggle('fail', !passed);
    if (badge) badge.textContent = passed ? 'PASS' : 'FAIL';
    explain?.classList.toggle('pass', passed);
    explain?.classList.toggle('fail', !passed);
    if (explain) explain.textContent = makeResultText(source, comparison, previewValue, threshold, passed);
  };

  sourceSelect?.addEventListener('change', () => {
    const source = getSourceOption(sourceSelect.value);
    const preview = readPreviewValue(source);
    if (previewSlider) previewSlider.value = String(preview);
    updateLivePreview();
  });
  comparisonButtons.forEach((button) => {
    button.addEventListener('click', () => {
      comparison = normalizeComparison(button.dataset.comparison);
      updateLivePreview();
    });
  });
  thresholdSlider?.addEventListener('input', updateLivePreview);
  thresholdNumber?.addEventListener('input', updateLivePreview);
  previewSlider?.addEventListener('input', updateLivePreview);

  saveButton?.addEventListener('click', () => {
    const sourceKey = sourceSelect?.value ?? 'danger';
    const threshold = clampNumber(Number(panel.querySelector<HTMLInputElement>('.human-threshold-slider')?.value ?? 50), 0, 100);
    const parametersTextArea = document.querySelector<HTMLTextAreaElement>('#node-parameters');
    const saveNodeButton = document.querySelector<HTMLButtonElement>('#save-node');
    const existing = safeParseJsonObject(parametersTextArea?.value ?? '{}');
    existing.sourceKey = sourceKey;
    existing.comparison = comparison;
    existing.threshold = threshold;
    node.parameters = { ...(node.parameters ?? {}), sourceKey, comparison, threshold };
    if (parametersTextArea) {
      parametersTextArea.value = JSON.stringify(existing, null, 2);
    }
    renderedPanelKey = null;
    saveNodeButton?.click();
  });

  jsonButton?.addEventListener('click', () => {
    const details = panel.querySelector<HTMLDetailsElement>('.developer-json-details');
    if (details) details.open = !details.open;
  });
}

function isUniversalThresholdNode(node: HumanNode | null): node is HumanNode {
  return node?.type === 'BlackboardValueAbove';
}

function getSourceKey(node: HumanNode): string {
  const sourceKey = node.parameters?.sourceKey;
  return typeof sourceKey === 'string' && sourceKey.length > 0 ? sourceKey : 'danger';
}

function getComparison(node: HumanNode): ThresholdComparison {
  return normalizeComparison(node.parameters?.comparison);
}

function normalizeComparison(value: unknown): ThresholdComparison {
  return value === 'below' ? 'below' : 'above';
}

function getThreshold(node: HumanNode): number {
  return readNumber(node.parameters?.threshold, 50);
}

function compareThreshold(value: number, threshold: number, comparison: ThresholdComparison): boolean {
  return comparison === 'below' ? value < threshold : value > threshold;
}

function comparisonSymbol(comparison: ThresholdComparison): string {
  return comparison === 'below' ? '<' : '>';
}

function getSourceOption(sourceKey: string): NumericSourceOption {
  return getNumericSourceOptions().find((option) => option.key === sourceKey) ?? {
    key: sourceKey || 'danger',
    label: sourceKey || 'Danger',
    labelRu: sourceKey || 'Опасность',
    description: `Numeric blackboard value ${sourceKey}.`,
    descriptionRu: `Числовой параметр blackboard ${sourceKey}.`,
    defaultPreview: 50,
  };
}

function getNodeSourceOption(node: HumanNode): NumericSourceOption {
  return getSourceOption(getSourceKey(node));
}

function getNumericSourceOptions(): NumericSourceOption[] {
  const graph = readGraph();
  const options = [...BUILTIN_NUMERIC_SOURCES];
  const defaults = graph.blackboardDefaults;
  if (defaults) {
    for (const [key, value] of Object.entries(defaults)) {
      if (typeof value === 'number' && !options.some((option) => option.key === key)) {
        options.push({
          key,
          label: key,
          labelRu: key,
          description: `Numeric blackboard value ${key}.`,
          descriptionRu: `Числовой параметр blackboard ${key}.`,
          defaultPreview: clampNumber(value, 0, 100),
        });
      }
    }
  }
  return options;
}

function labelForSource(source: NumericSourceOption): string {
  return currentLanguage === 'ru' ? source.labelRu : source.label;
}

function makeSourceHelp(source: NumericSourceOption): string {
  return currentLanguage === 'ru'
    ? `${source.labelRu}: ${source.descriptionRu} Нода будет читать blackboard.${source.key}.`
    : `${source.label}: ${source.description} The node reads blackboard.${source.key}.`;
}

function makeFormulaHelp(comparison: ThresholdComparison): string {
  return comparison === 'below'
    ? t('Формула: текущее значение должно быть строго меньше порога. Равное значение не проходит.', 'Formula: current value must be strictly lower than threshold. Equal value does not pass.')
    : t('Формула: текущее значение должно быть строго больше порога. Равное значение не проходит.', 'Formula: current value must be strictly greater than threshold. Equal value does not pass.');
}

function makeThresholdHelp(comparison: ThresholdComparison): string {
  return comparison === 'below'
    ? t('Порог для режима ниже. Например 30 означает: 29 и ниже — PASS, 30 и выше — FAIL.', 'Threshold for below mode. For example, 30 means 29 and lower is PASS, 30 and higher is FAIL.')
    : t('Порог для режима выше. Например 60 означает: 60 или ниже — FAIL, 61 и выше — PASS.', 'Threshold for above mode. For example, 60 means 60 or lower is FAIL, 61 and higher is PASS.');
}

function makeResultHelp(source: NumericSourceOption, comparison: ThresholdComparison): string {
  return comparison === 'below'
    ? t(`PASS значит: ${source.key} ниже порога и ветка может продолжиться. FAIL значит: значение слишком высокое для этой проверки.`, `PASS means ${source.key} is below threshold and the branch can continue. FAIL means the value is too high for this check.`)
    : t(`PASS значит: ${source.key} выше порога и ветка может продолжиться. FAIL значит: значение слишком низкое для этой проверки.`, `PASS means ${source.key} is above threshold and the branch can continue. FAIL means the value is too low for this check.`);
}

function makeResultText(source: NumericSourceOption, comparison: ThresholdComparison, previewValue: number, threshold: number, passed: boolean): string {
  const symbol = comparisonSymbol(comparison);
  if (passed) {
    return t(
      `${source.key}=${previewValue} ${symbol} ${threshold}: ветка может продолжиться.`,
      `${source.key}=${previewValue} ${symbol} ${threshold}: the branch can continue.`,
    );
  }
  return t(
    `${source.key}=${previewValue} не выполняет ${symbol} ${threshold}: ветка остановится на этом условии.`,
    `${source.key}=${previewValue} does not satisfy ${symbol} ${threshold}: the branch stops at this condition.`,
  );
}

function findNode(nodeId: string): HumanNode | null {
  const graph = readGraph();
  return graph.nodes?.find((node) => node.id === nodeId) ?? null;
}

function readGraph(): HumanGraph {
  try {
    const raw = localStorage.getItem(GRAPH_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as HumanGraph;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function labelForNode(node: HumanNode | null): string {
  if (!node) return t('неизвестная нода', 'unknown node');
  return currentLanguage === 'ru'
    ? node.displayNameRu || node.displayName || node.id
    : node.displayName || node.displayNameRu || node.id;
}

function readLanguage(): UiLanguage {
  return localStorage.getItem(HUMAN_LANGUAGE_KEY) === 'en' ? 'en' : 'ru';
}

function readPreviewValue(source: NumericSourceOption): number {
  return clampNumber(Number(localStorage.getItem(`${PREVIEW_STORAGE_PREFIX}${source.key}`) ?? source.defaultPreview), 0, 100);
}

function readNumber(value: JsonValue | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function safeParseJsonObject(value: string): JsonObject {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as JsonObject;
  } catch {
    return {};
  }
  return {};
}

function setHelp(target: string | Element, text: string): void {
  const elements = typeof target === 'string'
    ? Array.from(document.querySelectorAll<Element>(target))
    : [target];
  for (const element of elements) element.setAttribute('data-help', text);
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
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/\n/g, ' ');
}
