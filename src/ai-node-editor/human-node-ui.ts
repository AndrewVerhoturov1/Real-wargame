export {};

type UiLanguage = 'ru' | 'en';
type ThresholdComparison = 'above' | 'below';
type FieldKind = 'text' | 'number' | 'select' | 'boolean';

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

interface SelectOption {
  value: string;
  label: string;
  labelRu: string;
}

interface NumericSourceOption extends SelectOption {
  description: string;
  descriptionRu: string;
  defaultPreview: number;
}

interface HumanField {
  key: string;
  kind: FieldKind;
  label: string;
  labelRu: string;
  help: string;
  helpRu: string;
  defaultValue: JsonValue;
  options?: readonly SelectOption[];
}

interface HumanPanelConfig {
  title: string;
  titleRu: string;
  description: string;
  descriptionRu: string;
  fields: readonly HumanField[];
}

const GRAPH_STORAGE_KEY = 'real-wargame.ai-node-editor.graph.v6';
const HUMAN_LANGUAGE_KEY = 'real-wargame.ai-node-editor.human-language.v1';
const TOOLTIP_DELAY_MS = 2000;
const PREVIEW_STORAGE_PREFIX = 'real-wargame.ai-node-editor.preview-value.v1.';

const COMMON_COOLDOWN_FIELDS: readonly HumanField[] = [
  fieldNumber('cooldownSeconds', 'Delay, seconds', 'Задержка, секунд', 'How long this node must wait before it can be used again.', 'Сколько секунд эта нода ждёт, прежде чем снова сможет сработать.', 0),
  fieldSelect('cooldownTiming', 'When delay works', 'Когда работает задержка', 'Before means the node waits first, then runs. After means the node runs first, then starts waiting.', 'До ноды — сначала ждёт, потом работает. После ноды — сначала работает, потом уходит в задержку.', 'after', [option('before', 'Before node', 'До ноды'), option('after', 'After node', 'После ноды')]),
];

const NUMERIC_OPTIONS: readonly NumericSourceOption[] = [
  source('danger', 'Danger', 'Опасность', 'Current danger score from fire, enemy visibility, cover, and other threats.', 'Текущая опасность от огня, видимости врага, укрытий и других угроз.', 85),
  source('stress', 'Stress', 'Стресс', 'Internal combat pressure: suppression, fatigue, nearby losses, and fear.', 'Внутреннее боевое напряжение: подавление, усталость, потери рядом и страх.', 70),
  source('suppression', 'Suppression', 'Подавление', 'How strongly incoming fire prevents normal action.', 'Насколько входящий огонь мешает нормально действовать.', 50),
  source('fatigue', 'Fatigue', 'Усталость', 'Physical tiredness from movement, stress, and combat load.', 'Физическая усталость от движения, стресса и боевой нагрузки.', 35),
  source('morale', 'Morale', 'Боевой дух', 'Current morale or willingness to keep acting under pressure.', 'Текущий боевой дух или готовность продолжать действовать под давлением.', 65),
  source('health', 'Health', 'Здоровье', 'Physical condition from 0 to 100.', 'Физическое состояние от 0 до 100.', 80),
  source('ammo', 'Ammo', 'Патроны', 'Useful ammunition count or percent.', 'Полезные боеприпасы: количество или процент.', 30),
  source('distanceToCover', 'Distance to cover', 'Расстояние до укрытия', 'Distance from soldier to the selected cover point.', 'Расстояние от солдата до выбранной точки укрытия.', 20),
];

const FLAG_OPTIONS: readonly SelectOption[] = [
  option('enemyVisible', 'Enemy visible', 'Враг виден'),
  option('enemyKnown', 'Enemy known', 'Враг известен'),
  option('underFire', 'Under fire', 'Под огнём'),
  option('hasOrder', 'Has order', 'Есть приказ'),
  option('isInCover', 'In cover', 'В укрытии'),
  option('weaponReady', 'Weapon ready', 'Оружие готово'),
];

const DISTANCE_FROM_OPTIONS: readonly SelectOption[] = [
  option('self', 'Self', 'Сам боец'),
  option('currentTarget', 'Current target', 'Текущая цель'),
  option('orderTarget', 'Order target', 'Цель приказа'),
  option('cover', 'Cover', 'Укрытие'),
  option('ally', 'Ally', 'Союзник'),
  option('enemy', 'Enemy', 'Враг'),
];

const DISTANCE_TO_OPTIONS: readonly SelectOption[] = [
  option('enemy', 'Enemy', 'Враг'),
  option('cover', 'Cover', 'Укрытие'),
  option('orderPoint', 'Order point', 'Точка приказа'),
  option('commander', 'Commander', 'Командир'),
  option('squad', 'Squad', 'Отряд'),
  option('retreatPoint', 'Retreat point', 'Точка отхода'),
];

const TARGET_KIND_OPTIONS: readonly SelectOption[] = [
  option('cover', 'Cover', 'Укрытие'),
  option('enemy', 'Enemy', 'Враг'),
  option('ally', 'Ally', 'Союзник'),
  option('orderPoint', 'Order point', 'Точка приказа'),
  option('commander', 'Commander', 'Командир'),
  option('squad', 'Squad', 'Отряд'),
];

const ACTION_OPTIONS: readonly SelectOption[] = [
  option('move_to', 'Move', 'Двигаться'),
  option('fire', 'Fire', 'Стрелять'),
  option('reload', 'Reload', 'Перезарядиться'),
  option('retreat', 'Retreat', 'Отступить'),
  option('wait', 'Wait', 'Ждать'),
  option('suppress', 'Suppress', 'Подавлять'),
  option('continue_order', 'Continue order', 'Продолжать приказ'),
];

const PANEL_CONFIGS: Record<string, HumanPanelConfig> = {
  FlagCheck: panel('Flag Check', 'Проверка флага', 'Checks a yes/no value from soldier memory.', 'Проверяет да/нет значение из памяти солдата.', [
    fieldSelect('flagKey', 'Flag', 'Флаг', 'Choose a true/false memory flag. No manual code words here.', 'Выбери флаг из списка. Никакого ручного ввода псевдокода.', 'enemyVisible', FLAG_OPTIONS),
    fieldBoolean('expected', 'Expected value', 'Ожидаемое значение', 'Choose whether the flag must be true or false.', 'Выбери, должен ли флаг быть true или false.', true),
  ]),
  DistanceCheck: panel('Distance Threshold', 'Порог расстояния', 'Checks whether a selected distance is closer or farther than the threshold.', 'Проверяет, ближе или дальше выбранная дистанция порога.', [
    fieldSelect('from', 'From', 'Откуда', 'Choose the first object. self is a fixed menu choice, not free text.', 'Выбери первый объект. self теперь пункт списка, а не ввод руками.', 'self', DISTANCE_FROM_OPTIONS),
    fieldSelect('to', 'To', 'Куда', 'Choose the second object.', 'Выбери второй объект.', 'cover', DISTANCE_TO_OPTIONS),
    fieldSelect('comparison', 'Mode', 'Режим', 'Closer passes when distance is lower. Farther passes when distance is higher.', 'Ближе проходит, когда дистанция меньше. Дальше проходит, когда дистанция больше.', 'closer', [option('closer', 'Closer than', 'Ближе чем'), option('farther', 'Farther than', 'Дальше чем')]),
    fieldNumber('thresholdMeters', 'Threshold, meters', 'Порог, метров', 'Distance threshold in meters.', 'Порог расстояния в метрах.', 30),
  ]),
  TacticalCheck: panel('Tactical Check', 'Тактическая проверка', 'Checks whether a tactical possibility exists.', 'Проверяет, есть ли тактическая возможность.', [
    fieldSelect('checkKind', 'What to check', 'Что проверить', 'Choose a tactical condition from a fixed list.', 'Выбери тактическое условие из готового списка.', 'line_of_sight', [option('line_of_sight', 'Line of sight', 'Линия видимости'), option('line_of_fire', 'Line of fire', 'Линия огня'), option('path_exists', 'Path exists', 'Есть путь'), option('cover_exists', 'Cover exists', 'Есть укрытие'), option('ammo_available', 'Ammo available', 'Есть боеприпасы'), option('can_execute_order', 'Can execute order', 'Можно выполнить приказ')]),
    fieldBoolean('expected', 'Expected result', 'Ожидаемый результат', 'Should this tactical possibility exist or be absent?', 'Эта тактическая возможность должна быть или отсутствовать?', true),
  ]),
  ParameterScore: panel('Parameter Score', 'Оценка параметра', 'Adds or subtracts score based on a numeric parameter.', 'Добавляет или вычитает баллы на основе числового параметра.', [
    fieldSelect('sourceKey', 'Parameter', 'Параметр', 'Choose a numeric parameter from the list.', 'Выбери числовой параметр из списка.', 'danger', NUMERIC_OPTIONS),
    fieldNumber('weight', 'Weight', 'Вес', 'How strongly this parameter changes branch score.', 'Насколько сильно параметр меняет баллы ветки.', 1),
    fieldSelect('direction', 'Direction', 'Направление', 'Add score or subtract score.', 'Добавлять или вычитать баллы.', 'positive', [option('positive', 'Add', 'Добавить'), option('negative', 'Subtract', 'Вычесть')]),
  ]),
  DistanceScore: panel('Distance Score', 'Оценка расстояния', 'Gives score from distance to a selected object.', 'Даёт баллы от расстояния до выбранного объекта.', [
    fieldSelect('targetKind', 'Object', 'Объект', 'Choose what distance is scored.', 'Выбери, какое расстояние оценивается.', 'cover', TARGET_KIND_OPTIONS),
    fieldSelect('preference', 'Better when', 'Лучше когда', 'Choose whether closer or farther is better.', 'Выбери, лучше ближе или дальше.', 'closer', [option('closer', 'Closer', 'Ближе'), option('farther', 'Farther', 'Дальше')]),
    fieldNumber('idealMeters', 'Ideal distance', 'Идеальная дистанция', 'Useful target distance in meters.', 'Полезная целевая дистанция в метрах.', 20),
    fieldNumber('weight', 'Weight', 'Вес', 'How strongly distance changes branch score.', 'Насколько сильно дистанция меняет баллы ветки.', 1),
  ]),
  DecisionInertia: panel('Decision Inertia', 'Инерция решения', 'Keeps a decision for a while so the soldier does not twitch every tick.', 'Удерживает решение некоторое время, чтобы солдат не дёргался каждый тик.', [
    fieldSelect('action', 'Action to keep', 'Что удерживать', 'Choose the action that receives inertia.', 'Выбери действие, которое получает инерцию.', 'move_to', ACTION_OPTIONS),
    fieldNumber('bonus', 'Bonus score', 'Бонус баллов', 'Score added while inertia is active.', 'Баллы, которые добавляются, пока инерция активна.', 12),
    fieldNumber('minimumSeconds', 'Minimum time', 'Минимальное время', 'Minimum seconds before the decision can freely change.', 'Минимум секунд до свободной смены решения.', 2),
  ]),
  RandomChance: panel('Chance', 'Шанс', 'Adds controlled randomness.', 'Добавляет управляемую случайность.', [
    fieldNumber('probabilityPercent', 'Chance, %', 'Шанс, %', 'Base probability from 0 to 100.', 'Базовая вероятность от 0 до 100.', 30),
    fieldSelect('modifierKey', 'Modifier', 'Модификатор', 'Optional numeric parameter that changes chance.', 'Необязательный числовой параметр, который меняет шанс.', 'morale', NUMERIC_OPTIONS),
  ]),
  FindBestObject: panel('Find Object', 'Поиск объекта', 'Finds the best object of the selected kind and writes it to memory.', 'Ищет лучший объект выбранного типа и записывает его в память.', [
    fieldSelect('objectKind', 'Object kind', 'Тип объекта', 'What to search for.', 'Что искать.', 'cover', [option('cover', 'Cover', 'Укрытие'), option('enemy', 'Enemy', 'Враг'), option('ally', 'Ally', 'Союзник'), option('firing_position', 'Firing position', 'Позиция стрельбы'), option('retreat_point', 'Retreat point', 'Точка отхода'), option('route_point', 'Route point', 'Маршрутная точка')]),
    fieldNumber('searchRadiusMeters', 'Search radius', 'Радиус поиска', 'Search radius in meters.', 'Радиус поиска в метрах.', 35),
    fieldText('writeTo', 'Write to memory', 'Записать в память', 'Name of memory slot where the found object is written.', 'Имя ячейки памяти, куда записать найденный объект.', 'best_object'),
    fieldSelect('criteria', 'Criteria', 'Критерий', 'Choose the main search criterion from a fixed list.', 'Выбери главный критерий поиска из списка.', 'safer', [option('closer', 'Closer', 'Ближе'), option('safer', 'Safer', 'Безопаснее'), option('has_line_of_fire', 'Has line of fire', 'Есть линия огня'), option('farther_from_enemy', 'Farther from enemy', 'Дальше от врага')]),
  ]),
  SelectTarget: panel('Target Choice', 'Выбор цели', 'Chooses a target and writes it to memory.', 'Выбирает цель и записывает её в память.', [
    fieldSelect('rule', 'Rule', 'Правило', 'How to choose the target.', 'Как выбирать цель.', 'most_dangerous', [option('nearest', 'Nearest', 'Ближайшая'), option('most_dangerous', 'Most dangerous', 'Самая опасная'), option('shooting_at_us', 'Shooting at us', 'Стреляет по нам'), option('order_target', 'Order target', 'Цель приказа'), option('best_line_of_fire', 'Best line of fire', 'Лучшая линия огня')]),
    fieldText('writeTo', 'Write to memory', 'Записать в память', 'Memory slot that receives the selected target.', 'Ячейка памяти, куда записать выбранную цель.', 'current_target'),
  ]),
  WriteMemory: panel('Write Memory', 'Запись памяти', 'Writes a value into soldier memory.', 'Записывает значение в память солдата.', [fieldText('writeTo', 'Write to', 'Куда записать', 'Memory key to write.', 'Ключ памяти для записи.', 'current_goal'), fieldText('value', 'Value', 'Значение', 'Value written as text, number, or keyword.', 'Значение текстом, числом или ключевым словом.', 'move_to_cover')]),
  CopyMemory: panel('Copy Memory', 'Копия памяти', 'Copies one memory value into another memory key.', 'Копирует одно значение памяти в другой ключ.', [fieldText('fromKey', 'From', 'Откуда', 'Source memory key.', 'Исходный ключ памяти.', 'visible_enemy_position'), fieldText('toKey', 'To', 'Куда', 'Target memory key.', 'Целевой ключ памяти.', 'remembered_enemy_position')]),
  ForbidAction: panel('Forbid Action', 'Запрет действия', 'Temporarily blocks an action.', 'Временно запрещает действие.', [fieldSelect('action', 'Action', 'Действие', 'Action to forbid.', 'Какое действие запретить.', 'continue_order', ACTION_OPTIONS), fieldText('reason', 'Reason', 'Причина', 'Human-readable reason.', 'Понятная причина.', 'danger too high'), fieldNumber('durationSeconds', 'Duration', 'Длительность', 'How long the ban lasts.', 'Сколько длится запрет.', 3)]),
  SetAction: panel('Action', 'Действие', 'Issues an action command.', 'Выдаёт команду действия.', [fieldSelect('action', 'Action', 'Действие', 'What the soldier should do.', 'Что должен сделать солдат.', 'move_to', ACTION_OPTIONS), fieldText('targetKey', 'Target', 'Цель', 'Memory key with target point or object.', 'Ключ памяти с целью или точкой.', 'best_cover_position')]),
  SetMovementMode: panel('Movement Mode', 'Режим движения', 'Sets how the soldier moves.', 'Задаёт, как солдат двигается.', [fieldSelect('mode', 'Mode', 'Режим', 'Movement style.', 'Стиль движения.', 'careful', [option('fast', 'Fast', 'Быстро'), option('careful', 'Careful', 'Осторожно'), option('crawl', 'Crawl', 'Ползком'), option('bounds', 'Bounds', 'Перебежками'), option('formation', 'Formation', 'В строю'), option('follow_tank', 'Follow tank', 'За танком')])]),
  SetPosture: panel('Posture', 'Поза', 'Changes body posture.', 'Меняет позу бойца.', [fieldSelect('posture', 'Posture', 'Поза', 'Body posture.', 'Положение тела.', 'prone', [option('stand', 'Stand', 'Стоя'), option('crouch', 'Crouch', 'Пригнувшись'), option('prone', 'Prone', 'Лёжа')])]),
  SayMessage: panel('Say Message', 'Реплика бойца', 'Shows a short text above the soldier.', 'Показывает короткий текст над бойцом.', [fieldText('messageRu', 'Russian message', 'Русская фраза', 'Phrase shown in Russian UI.', 'Фраза, которую увидит игрок в русском интерфейсе.', 'Под огнём!'), fieldText('message', 'English message', 'Английская фраза', 'English overlay phrase.', 'Английская версия фразы.', 'Under fire!'), fieldNumber('durationSeconds', 'Duration', 'Длительность', 'How many seconds the message stays visible.', 'Сколько секунд фраза видна над бойцом.', 2)]),
  WriteReason: panel('Explain', 'Объяснение', 'Adds an explanation to the decision result.', 'Добавляет объяснение к результату решения.', [fieldText('reasonRu', 'Russian reason', 'Русская причина', 'Russian explanation text.', 'Русский текст объяснения.', 'Солдат выбрал укрытие из-за опасности.'), fieldText('reason', 'English reason', 'Английская причина', 'English explanation text.', 'Английский текст объяснения.', 'The soldier chose cover because danger is high.')]),
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
  if (tooltipElement) positionTooltip(tooltipElement, event.clientX, event.clientY);
});

document.addEventListener('pointerover', (event) => {
  const target = (event.target as Element | null)?.closest('[data-help]');
  const text = target?.getAttribute('data-help');
  if (!text) return;
  clearTooltipTimer();
  hideTooltip();
  tooltipTimer = window.setTimeout(() => showTooltip(text, lastPointer.x, lastPointer.y), TOOLTIP_DELAY_MS);
});

document.addEventListener('pointerout', (event) => {
  if ((event.target as Element | null)?.closest('[data-help]')) {
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
    setHelp(languageButton, t('Переключает язык интерфейса. На экране остаётся только выбранный язык.', 'Switches the interface language. Only the selected language stays on screen.'));
  }
  const addNodeButton = document.querySelector<HTMLButtonElement>('#toggle-palette');
  if (addNodeButton) addNodeButton.textContent = t('+ Добавить ноду', '+ Add node');
  document.querySelectorAll<HTMLElement>('.node-secondary').forEach((element) => {
    element.hidden = true;
  });
}

function annotateCommonControls(): void {
  setHelp('#toggle-palette', t('Открывает чистый список универсальных нод. Старые точечные ноды убраны.', 'Opens the clean universal node list. Old one-off nodes are removed.'));
  setHelp('#toggle-inspector', t('Показывает или скрывает правую панель выбранной ноды.', 'Shows or hides the selected-node panel.'));
  setHelp('#validate-graph', t('Проверяет граф через local engine. Проверяются также cooldownSeconds и cooldownTiming.', 'Validates the graph through local engine. cooldownSeconds and cooldownTiming are checked too.'));
}

function annotateGraphObjects(): void {
  document.querySelectorAll<HTMLElement>('.graph-node[data-node-id]').forEach((nodeElement) => {
    const node = findNode(nodeElement.dataset.nodeId ?? '');
    const title = labelForNode(node);
    const text = isUniversalThresholdNode(node)
      ? t('Числовой порог: выбери параметр, режим выше/ниже и порог. У каждой ноды есть задержка до или после срабатывания.', 'Numeric threshold: choose parameter, above/below mode, and threshold. Every node has delay before or after firing.')
      : t(`Нода «${title}». Клик — выбрать. Справа будет человеческая панель параметров и общая задержка.`, `Node “${title}”. Click to select. The right panel shows human parameters and common delay.`);
    setHelp(nodeElement, text);
  });
  document.querySelectorAll<HTMLElement>('.node-port.in').forEach((port) => setHelp(port, t('Вход ноды. Сюда приходят связи от предыдущих шагов графа.', 'Node input. Links from previous graph steps arrive here.')));
  document.querySelectorAll<HTMLElement>('.node-port.out').forEach((port) => setHelp(port, t('Выход ноды. Зажми и протяни к другой ноде, чтобы создать связь.', 'Node output. Drag to another node to create a link.')));
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
  const panelKey = node ? `${node.id}:${node.type}:${JSON.stringify(node.parameters ?? {})}:${currentLanguage}` : null;
  if (!node || !panelKey) {
    existingPanel?.remove();
    renderedPanelKey = null;
    return;
  }
  if (existingPanel?.dataset.panelKey === panelKey && renderedPanelKey === panelKey) return;

  existingPanel?.remove();
  inspector.querySelectorAll<HTMLElement>('.human-hidden-original').forEach((element) => element.classList.remove('human-hidden-original'));
  const originalCards = Array.from(inspector.querySelectorAll<HTMLElement>('.inspector-card'));
  const editCard = originalCards.find((card) => card.textContent?.includes('parameters JSON') || card.textContent?.includes('Edit'));
  editCard?.classList.add('human-hidden-original');

  const summaryCard = originalCards[0];
  const panelElement = document.createElement('section');
  panelElement.className = `human-node-panel ${isUniversalThresholdNode(node) ? 'threshold-node blackboard-value-above' : 'generic-node-panel'}`;
  panelElement.dataset.panelKey = panelKey;
  panelElement.innerHTML = isUniversalThresholdNode(node) ? renderUniversalThresholdPanel(node) : renderGenericPanel(node);
  if (summaryCard) summaryCard.insertAdjacentElement('afterend', panelElement);
  else inspector.prepend(panelElement);
  installPanelHandlers(panelElement, node);
  renderedPanelKey = panelKey;
}

function renderUniversalThresholdPanel(node: HumanNode): string {
  const sourceOption = getSourceOption(getSourceKey(node));
  const comparison = getComparison(node);
  const threshold = getThreshold(node);
  const previewValue = readPreviewValue(sourceOption);
  const passed = compareThreshold(previewValue, threshold, comparison);
  const symbol = comparisonSymbol(comparison);
  return `
    ${renderPanelHeader(t('Числовой порог', 'Numeric Threshold'), t('Выбери числовой параметр, режим выше/ниже и порог. Нода пропускает ветку, если условие выполнено.', 'Choose a numeric parameter, above/below mode, and threshold. The node passes when the condition is true.'), passed)}
    <label class="human-control wide" data-help="${escapeAttribute(makeSourceHelp(sourceOption))}">
      <span>${escapeHtml(t('Слушать параметр', 'Listen to parameter'))}</span>
      <select class="human-field human-source-select" data-param-key="sourceKey" data-kind="text">${getNumericSourceOptions().map((item) => `<option value="${escapeAttribute(item.value)}" ${item.value === sourceOption.value ? 'selected' : ''}>${escapeHtml(t(item.labelRu, item.label))} · ${escapeHtml(item.value)}</option>`).join('')}</select>
    </label>
    <div class="human-mode-toggle" data-help="${escapeAttribute(t('Выбери направление проверки: значение должно быть выше порога или ниже порога.', 'Choose comparison direction: value must be above threshold or below threshold.'))}">
      <button class="ai-editor-button human-comparison-button ${comparison === 'above' ? 'primary' : ''}" type="button" data-comparison="above">${escapeHtml(t('Параметр выше порога', 'Value above threshold'))}</button>
      <button class="ai-editor-button human-comparison-button ${comparison === 'below' ? 'primary' : ''}" type="button" data-comparison="below">${escapeHtml(t('Параметр ниже порога', 'Value below threshold'))}</button>
    </div>
    <div class="human-info-grid"><div><b>${escapeHtml(t('Формула', 'Formula'))}</b><span class="human-formula-value">${escapeHtml(`${previewValue} ${symbol} ${threshold}`)}</span></div><div><b>${escapeHtml(t('Результат', 'Result'))}</b><span class="human-result-label">${escapeHtml(passed ? t('условие прошло', 'condition passed') : t('условие не прошло', 'condition failed'))}</span></div></div>
    <label class="human-control" data-help="${escapeAttribute(makeThresholdHelp(comparison))}"><span>${escapeHtml(t('Порог', 'Threshold'))}: <output class="human-threshold-value">${threshold}</output></span><input class="human-field human-threshold-slider" data-param-key="threshold" data-kind="number" type="range" min="0" max="100" step="1" value="${threshold}" /><input class="human-threshold-number" type="number" min="0" max="100" step="1" value="${threshold}" /></label>
    <label class="human-control"><span>${escapeHtml(t('Текущее тестовое значение', 'Preview current value'))}: <output class="human-preview-value">${previewValue}</output></span><input class="human-preview-slider" type="range" min="0" max="100" step="1" value="${previewValue}" /></label>
    <div class="human-result-explain ${passed ? 'pass' : 'fail'}">${escapeHtml(makeResultText(sourceOption, comparison, previewValue, threshold, passed))}</div>
    ${renderCommonCooldown(node)}${renderPanelActions(node)}
  `;
}

function renderGenericPanel(node: HumanNode): string {
  const config = PANEL_CONFIGS[node.type] ?? fallbackPanelConfig(node);
  return `${renderPanelHeader(t(config.titleRu, config.title), t(config.descriptionRu, config.description), null)}${config.fields.map((field) => renderField(field, node.parameters?.[field.key] ?? field.defaultValue)).join('')}${renderCommonCooldown(node)}${renderPanelActions(node)}`;
}

function renderPanelHeader(title: string, description: string, passed: boolean | null): string {
  return `<header class="human-panel-header"><div><span class="human-kicker">${escapeHtml(t('Человеческий интерфейс ноды', 'Human node interface'))}</span><h3>${escapeHtml(title)}</h3></div>${passed === null ? '' : `<span class="danger-result threshold-result ${passed ? 'pass' : 'fail'}">${passed ? 'PASS' : 'FAIL'}</span>`}</header><p class="human-description">${escapeHtml(description)}</p>`;
}

function renderField(field: HumanField, value: JsonValue): string {
  const help = t(field.helpRu, field.help);
  const label = t(field.labelRu, field.label);
  if (field.kind === 'select') {
    return `<label class="human-control wide" data-help="${escapeAttribute(help)}"><span>${escapeHtml(label)}</span><select class="human-field" data-param-key="${escapeAttribute(field.key)}" data-kind="text">${(field.options ?? []).map((item) => `<option value="${escapeAttribute(item.value)}" ${String(value) === item.value ? 'selected' : ''}>${escapeHtml(t(item.labelRu, item.label))}</option>`).join('')}</select></label>`;
  }
  if (field.kind === 'boolean') {
    return `<label class="human-control wide" data-help="${escapeAttribute(help)}"><span>${escapeHtml(label)}</span><select class="human-field" data-param-key="${escapeAttribute(field.key)}" data-kind="boolean"><option value="true" ${value === true ? 'selected' : ''}>true / да</option><option value="false" ${value === false ? 'selected' : ''}>false / нет</option></select></label>`;
  }
  const inputType = field.kind === 'number' ? 'number' : 'text';
  return `<label class="human-control wide" data-help="${escapeAttribute(help)}"><span>${escapeHtml(label)}</span><input class="human-field" data-param-key="${escapeAttribute(field.key)}" data-kind="${field.kind}" type="${inputType}" value="${escapeAttribute(String(value ?? ''))}" /></label>`;
}

function renderCommonCooldown(node: HumanNode): string {
  return `<section class="human-links" data-help="${escapeAttribute(t('Общая задержка есть у каждой ноды. Она помогает не запускать одно и то же действие слишком часто.', 'Every node has a common delay. It prevents the same step from firing too often.'))}"><h4>${escapeHtml(t('Задержка ноды', 'Node delay'))}</h4>${COMMON_COOLDOWN_FIELDS.map((field) => renderField(field, node.parameters?.[field.key] ?? field.defaultValue)).join('')}</section>`;
}

function renderPanelActions(node: HumanNode): string {
  return `<div class="human-actions"><button class="ai-editor-button primary human-save-node" type="button">${escapeHtml(t('Сохранить параметры', 'Save parameters'))}</button><button class="ai-editor-button human-open-json" type="button">${escapeHtml(t('Показать JSON', 'Show JSON'))}</button></div><details class="developer-json-details"><summary>${escapeHtml(t('Дополнительно: JSON для разработчика', 'Advanced: developer JSON'))}</summary><pre>${escapeHtml(JSON.stringify(node.parameters ?? {}, null, 2))}</pre></details>`;
}

function installPanelHandlers(panelElement: HTMLElement, node: HumanNode): void {
  let comparison = getComparison(node);
  const updateThresholdPreview = (): void => {
    if (!isUniversalThresholdNode(node)) return;
    const sourceOption = getSourceOption(panelElement.querySelector<HTMLSelectElement>('.human-source-select')?.value ?? getSourceKey(node));
    const thresholdSlider = panelElement.querySelector<HTMLInputElement>('.human-threshold-slider');
    const thresholdNumber = panelElement.querySelector<HTMLInputElement>('.human-threshold-number');
    const previewSlider = panelElement.querySelector<HTMLInputElement>('.human-preview-slider');
    const threshold = clampNumber(Number(thresholdSlider?.value ?? thresholdNumber?.value ?? 50), 0, 100);
    const previewValue = clampNumber(Number(previewSlider?.value ?? readPreviewValue(sourceOption)), 0, 100);
    const passed = compareThreshold(previewValue, threshold, comparison);
    const symbol = comparisonSymbol(comparison);
    if (thresholdSlider && thresholdSlider.value !== String(threshold)) thresholdSlider.value = String(threshold);
    if (thresholdNumber && thresholdNumber.value !== String(threshold)) thresholdNumber.value = String(threshold);
    if (previewSlider && previewSlider.value !== String(previewValue)) previewSlider.value = String(previewValue);
    localStorage.setItem(`${PREVIEW_STORAGE_PREFIX}${sourceOption.value}`, String(previewValue));
    panelElement.querySelector<HTMLOutputElement>('.human-threshold-value')!.textContent = String(threshold);
    panelElement.querySelector<HTMLOutputElement>('.human-preview-value')!.textContent = String(previewValue);
    panelElement.querySelector<HTMLElement>('.human-formula-value')!.textContent = `${previewValue} ${symbol} ${threshold}`;
    panelElement.querySelector<HTMLElement>('.human-result-label')!.textContent = passed ? t('условие прошло', 'condition passed') : t('условие не прошло', 'condition failed');
    const badge = panelElement.querySelector<HTMLElement>('.threshold-result');
    const explain = panelElement.querySelector<HTMLElement>('.human-result-explain');
    badge?.classList.toggle('pass', passed);
    badge?.classList.toggle('fail', !passed);
    if (badge) badge.textContent = passed ? 'PASS' : 'FAIL';
    explain?.classList.toggle('pass', passed);
    explain?.classList.toggle('fail', !passed);
    if (explain) explain.textContent = makeResultText(sourceOption, comparison, previewValue, threshold, passed);
  };

  panelElement.querySelectorAll<HTMLElement>('.human-comparison-button').forEach((button) => button.addEventListener('click', () => {
    comparison = normalizeComparison(button.dataset.comparison);
    panelElement.querySelectorAll<HTMLElement>('.human-comparison-button').forEach((candidate) => candidate.classList.toggle('primary', candidate.dataset.comparison === comparison));
    updateThresholdPreview();
  }));
  panelElement.querySelectorAll<HTMLInputElement | HTMLSelectElement>('.human-source-select, .human-threshold-slider, .human-threshold-number, .human-preview-slider').forEach((element) => element.addEventListener('input', updateThresholdPreview));
  panelElement.querySelector<HTMLButtonElement>('.human-save-node')?.addEventListener('click', () => savePanelParameters(panelElement, node, comparison));
  panelElement.querySelector<HTMLButtonElement>('.human-open-json')?.addEventListener('click', () => {
    const details = panelElement.querySelector<HTMLDetailsElement>('.developer-json-details');
    if (details) details.open = !details.open;
  });
}

function savePanelParameters(panelElement: HTMLElement, node: HumanNode, comparison: ThresholdComparison): void {
  const parametersTextArea = document.querySelector<HTMLTextAreaElement>('#node-parameters');
  const saveNodeButton = document.querySelector<HTMLButtonElement>('#save-node');
  const existing = safeParseJsonObject(parametersTextArea?.value ?? '{}');
  for (const field of Array.from(panelElement.querySelectorAll<HTMLInputElement | HTMLSelectElement>('.human-field'))) {
    const key = field.dataset.paramKey;
    if (!key) continue;
    const kind = field.dataset.kind;
    existing[key] = kind === 'number' ? clampNumber(Number(field.value), 0, 9999) : kind === 'boolean' ? field.value === 'true' : field.value;
  }
  if (isUniversalThresholdNode(node)) existing.comparison = comparison;
  node.parameters = existing;
  if (parametersTextArea) parametersTextArea.value = JSON.stringify(existing, null, 2);
  renderedPanelKey = null;
  saveNodeButton?.click();
}

function isUniversalThresholdNode(node: HumanNode | null): node is HumanNode { return node?.type === 'BlackboardValueAbove'; }
function fallbackPanelConfig(node: HumanNode): HumanPanelConfig { return panel(node.displayName || node.type, node.displayNameRu || node.type, node.description || 'Generic node parameters.', node.descriptionRu || 'Общие параметры ноды.', []); }
function getSourceKey(node: HumanNode): string { const sourceKey = node.parameters?.sourceKey; return typeof sourceKey === 'string' && sourceKey.length > 0 ? sourceKey : 'danger'; }
function getComparison(node: HumanNode): ThresholdComparison { return normalizeComparison(node.parameters?.comparison); }
function normalizeComparison(value: unknown): ThresholdComparison { return value === 'below' ? 'below' : 'above'; }
function getThreshold(node: HumanNode): number { return readNumber(node.parameters?.threshold, 50); }
function compareThreshold(value: number, threshold: number, comparison: ThresholdComparison): boolean { return comparison === 'below' ? value < threshold : value > threshold; }
function comparisonSymbol(comparison: ThresholdComparison): string { return comparison === 'below' ? '<' : '>'; }
function getSourceOption(sourceKey: string): NumericSourceOption { return getNumericSourceOptions().find((item) => item.value === sourceKey) ?? source(sourceKey || 'danger', sourceKey || 'Danger', sourceKey || 'Опасность', `Numeric blackboard value ${sourceKey}.`, `Числовой параметр blackboard ${sourceKey}.`, 50); }
function getNumericSourceOptions(): NumericSourceOption[] { const graph = readGraph(); const options = [...NUMERIC_OPTIONS]; const defaults = graph.blackboardDefaults; if (defaults) { for (const [key, value] of Object.entries(defaults)) { if (typeof value === 'number' && !options.some((item) => item.value === key)) options.push(source(key, key, key, `Numeric blackboard value ${key}.`, `Числовой параметр blackboard ${key}.`, clampNumber(value, 0, 100))); } } return options; }
function makeSourceHelp(sourceOption: NumericSourceOption): string { return currentLanguage === 'ru' ? `${sourceOption.labelRu}: ${sourceOption.descriptionRu} Нода читает blackboard.${sourceOption.value}.` : `${sourceOption.label}: ${sourceOption.description} The node reads blackboard.${sourceOption.value}.`; }
function makeThresholdHelp(comparison: ThresholdComparison): string { return comparison === 'below' ? t('Порог для режима ниже. Например 30 означает: 29 и ниже — PASS, 30 и выше — FAIL.', 'Threshold for below mode. For example, 30 means 29 and lower is PASS, 30 and higher is FAIL.') : t('Порог для режима выше. Например 60 означает: 60 или ниже — FAIL, 61 и выше — PASS.', 'Threshold for above mode. For example, 60 means 60 or lower is FAIL, 61 and higher is PASS.'); }
function makeResultText(sourceOption: NumericSourceOption, comparison: ThresholdComparison, previewValue: number, threshold: number, passed: boolean): string { const symbol = comparisonSymbol(comparison); if (passed) return t(`${sourceOption.value}=${previewValue} ${symbol} ${threshold}: ветка может продолжиться.`, `${sourceOption.value}=${previewValue} ${symbol} ${threshold}: the branch can continue.`); return t(`${sourceOption.value}=${previewValue} не выполняет ${symbol} ${threshold}: ветка остановится.`, `${sourceOption.value}=${previewValue} does not satisfy ${symbol} ${threshold}: the branch stops.`); }
function findNode(nodeId: string): HumanNode | null { const graph = readGraph(); return graph.nodes?.find((node) => node.id === nodeId) ?? null; }
function readGraph(): HumanGraph { try { const raw = localStorage.getItem(GRAPH_STORAGE_KEY); if (!raw) return {}; const parsed = JSON.parse(raw) as HumanGraph; return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; } }
function labelForNode(node: HumanNode | null): string { if (!node) return t('неизвестная нода', 'unknown node'); return currentLanguage === 'ru' ? node.displayNameRu || node.displayName || node.id : node.displayName || node.displayNameRu || node.id; }
function readLanguage(): UiLanguage { return localStorage.getItem(HUMAN_LANGUAGE_KEY) === 'en' ? 'en' : 'ru'; }
function readPreviewValue(sourceOption: NumericSourceOption): number { return clampNumber(Number(localStorage.getItem(`${PREVIEW_STORAGE_PREFIX}${sourceOption.value}`) ?? sourceOption.defaultPreview), 0, 100); }
function readNumber(value: JsonValue | undefined, fallback: number): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }
function safeParseJsonObject(value: string): JsonObject { try { const parsed = JSON.parse(value) as unknown; if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as JsonObject; } catch { return {}; } return {}; }
function panel(title: string, titleRu: string, description: string, descriptionRu: string, fields: readonly HumanField[]): HumanPanelConfig { return { title, titleRu, description, descriptionRu, fields }; }
function fieldText(key: string, label: string, labelRu: string, help: string, helpRu: string, defaultValue: string): HumanField { return { key, kind: 'text', label, labelRu, help, helpRu, defaultValue }; }
function fieldNumber(key: string, label: string, labelRu: string, help: string, helpRu: string, defaultValue: number): HumanField { return { key, kind: 'number', label, labelRu, help, helpRu, defaultValue }; }
function fieldBoolean(key: string, label: string, labelRu: string, help: string, helpRu: string, defaultValue: boolean): HumanField { return { key, kind: 'boolean', label, labelRu, help, helpRu, defaultValue }; }
function fieldSelect(key: string, label: string, labelRu: string, help: string, helpRu: string, defaultValue: string, options: readonly SelectOption[]): HumanField { return { key, kind: 'select', label, labelRu, help, helpRu, defaultValue, options }; }
function option(value: string, label: string, labelRu: string): SelectOption { return { value, label, labelRu }; }
function source(value: string, label: string, labelRu: string, description: string, descriptionRu: string, defaultPreview: number): NumericSourceOption { return { value, label, labelRu, description, descriptionRu, defaultPreview }; }
function setHelp(target: string | Element, text: string): void { const elements = typeof target === 'string' ? Array.from(document.querySelectorAll<Element>(target)) : [target]; for (const element of elements) element.setAttribute('data-help', text); }
function showTooltip(text: string, x: number, y: number): void { hideTooltip(); const tooltip = document.createElement('div'); tooltip.className = 'human-tooltip'; tooltip.textContent = text; document.body.appendChild(tooltip); tooltipElement = tooltip; positionTooltip(tooltip, x, y); }
function positionTooltip(tooltip: HTMLElement, x: number, y: number): void { const margin = 14; const maxX = window.innerWidth - tooltip.offsetWidth - margin; const maxY = window.innerHeight - tooltip.offsetHeight - margin; tooltip.style.left = `${Math.max(margin, Math.min(maxX, x + 16))}px`; tooltip.style.top = `${Math.max(margin, Math.min(maxY, y + 16))}px`; }
function clearTooltipTimer(): void { if (tooltipTimer !== null) { window.clearTimeout(tooltipTimer); tooltipTimer = null; } }
function hideTooltip(): void { tooltipElement?.remove(); tooltipElement = null; }
function t(ru: string, en: string): string { return currentLanguage === 'ru' ? ru : en; }
function clampNumber(value: number, min: number, max: number): number { if (!Number.isFinite(value)) return min; return Math.max(min, Math.min(max, Math.round(value))); }
function escapeHtml(value: string): string { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
function escapeAttribute(value: string): string { return escapeHtml(value).replace(/\n/g, ' '); }
