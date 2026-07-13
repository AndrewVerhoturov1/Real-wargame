import type { AiBlackboardValue } from '../AiBlackboard';
import type {
  AiNodeCategory,
  AiNodeChildPolicy,
  AiNodeContract,
  AiNodeLifecycleKind,
  AiParameterDefinition,
  AiParameterOption,
} from './AiNodeContract';
import type { AiPortDefinition, AiPortValueKind } from './AiPortTypes';

export class AiNodeContractRegistry {
  private readonly contracts = new Map<string, AiNodeContract>();

  register(contract: AiNodeContract): this {
    if (this.contracts.has(contract.type)) {
      throw new Error(`AI node contract already registered: ${contract.type}`);
    }
    this.contracts.set(contract.type, freezeContract(contract));
    return this;
  }

  get(type: string): AiNodeContract | undefined {
    return this.contracts.get(type);
  }

  require(type: string): AiNodeContract {
    const contract = this.get(type);
    if (!contract) throw new Error(`AI node contract is not registered: ${type}`);
    return contract;
  }

  has(type: string): boolean {
    return this.contracts.has(type);
  }

  list(): readonly AiNodeContract[] {
    return [...this.contracts.values()];
  }
}

const option = (value: string, label: string, labelRu: string): AiParameterOption => ({ value, label, labelRu });
const port = (
  id: string,
  kind: AiPortValueKind,
  label: string,
  labelRu: string,
  required = false,
  nullable = false,
): AiPortDefinition => ({ id, kind, label, labelRu, required, nullable });
const parameter = (
  id: string,
  kind: AiParameterDefinition['kind'],
  label: string,
  labelRu: string,
  defaultValue?: AiBlackboardValue,
  extra: Partial<AiParameterDefinition> = {},
): AiParameterDefinition => ({ id, kind, label, labelRu, defaultValue, ...extra });
const requiredParameter = (
  id: string,
  kind: AiParameterDefinition['kind'],
  label: string,
  labelRu: string,
  defaultValue?: AiBlackboardValue,
  extra: Partial<AiParameterDefinition> = {},
): AiParameterDefinition => parameter(id, kind, label, labelRu, defaultValue, { ...extra, required: true });
const enumParameter = (
  id: string,
  label: string,
  labelRu: string,
  defaultValue: string,
  options: readonly AiParameterOption[],
  required = true,
): AiParameterDefinition => parameter(id, 'enum', label, labelRu, defaultValue, { required, options });

const COMMON_COOLDOWN_PARAMETERS: readonly AiParameterDefinition[] = [
  parameter('cooldownSeconds', 'number', 'Cooldown', 'Задержка повторения', 0, { minimum: 0 }),
  enumParameter('cooldownTiming', 'Cooldown timing', 'Момент задержки', 'after', [
    option('before', 'Before execution', 'Перед выполнением'),
    option('after', 'After success', 'После успеха'),
  ], false),
];

interface ContractInput {
  readonly type: string;
  readonly category: AiNodeCategory;
  readonly label: string;
  readonly labelRu: string;
  readonly description: string;
  readonly descriptionRu: string;
  readonly childPolicy?: AiNodeChildPolicy;
  readonly lifecycle?: AiNodeLifecycleKind;
  readonly inputs?: readonly AiPortDefinition[];
  readonly outputs?: readonly AiPortDefinition[];
  readonly parameters?: readonly AiParameterDefinition[];
  readonly cooldown?: boolean;
}

function contract(input: ContractInput): AiNodeContract {
  return {
    type: input.type,
    category: input.category,
    label: input.label,
    labelRu: input.labelRu,
    description: input.description,
    descriptionRu: input.descriptionRu,
    childPolicy: input.childPolicy ?? 'many',
    lifecycle: input.lifecycle ?? 'instant',
    inputs: input.inputs ?? [],
    outputs: input.outputs ?? [],
    parameters: input.cooldown === false
      ? input.parameters ?? []
      : [...COMMON_COOLDOWN_PARAMETERS, ...(input.parameters ?? [])],
  };
}

const definitions: readonly AiNodeContract[] = [
  contract({ type: 'Root', category: 'flow', label: 'Start', labelRu: 'Старт', description: 'Entry point for a single soldier behavior graph.', descriptionRu: 'Точка входа в граф поведения одиночного солдата.', childPolicy: 'many', lifecycle: 'composite', cooldown: false }),
  contract({ type: 'UtilitySelector', category: 'flow', label: 'Best Choice', labelRu: 'Лучший выбор', description: 'Scores child branches and chooses the best available option.', descriptionRu: 'Оценивает дочерние ветки и выбирает лучший доступный вариант.', childPolicy: 'many', lifecycle: 'composite', cooldown: false }),
  contract({ type: 'Sequence', category: 'flow', label: 'Step Chain', labelRu: 'Цепочка шагов', description: 'Runs child nodes in order until one fails.', descriptionRu: 'Выполняет дочерние ноды по порядку, пока одна из них не провалится.', childPolicy: 'many', lifecycle: 'composite', cooldown: false }),
  contract({ type: 'SequenceWithMemory', category: 'flow', label: 'Step Chain with Memory', labelRu: 'Последовательность с памятью', description: 'Runs child nodes in order and remembers the active step between AI ticks.', descriptionRu: 'Выполняет дочерние ноды по порядку и помнит активный шаг между тиками ИИ.', childPolicy: 'many', lifecycle: 'composite', cooldown: false }),
  contract({ type: 'ReactiveSequence', category: 'flow', label: 'Reactive Sequence', labelRu: 'Реактивная последовательность', description: 'Interrupts the active branch when an observed preceding condition changes.', descriptionRu: 'Прерывает активную ветвь, если наблюдаемое предыдущее условие изменилось.', childPolicy: 'many', lifecycle: 'composite', cooldown: false, parameters: [
    requiredParameter('observePrecedingConditions', 'boolean', 'Observe preceding conditions', 'Наблюдать предыдущие условия', true),
    enumParameter('abortPolicy', 'Abort policy', 'Политика прерывания', 'abort_self', [option('abort_self', 'Abort active branch', 'Прервать текущую ветвь')]),
    parameter('abortReason', 'string', 'Abort reason', 'Причина прерывания', 'Condition changed.'),
    parameter('abortReasonRu', 'string', 'Abort reason (RU)', 'Причина прерывания по-русски', 'Условие изменилось.'),
  ] }),
  contract({ type: 'Selector', category: 'flow', label: 'First Working Choice', labelRu: 'Первый рабочий выбор', description: 'Tries child nodes in order and takes the first successful one.', descriptionRu: 'Пробует дочерние ноды по порядку и берёт первую успешную.', childPolicy: 'many', lifecycle: 'composite', cooldown: false }),
  contract({ type: 'ActionBranch', category: 'flow', label: 'Action Option', labelRu: 'Вариант действия', description: 'Groups conditions, scores, queries, and execution for one behavior option.', descriptionRu: 'Группирует условия, оценки и исполнение одного варианта поведения.', childPolicy: 'many', lifecycle: 'composite', cooldown: false }),

  contract({ type: 'BlackboardValueAbove', category: 'condition', label: 'Numeric Threshold', labelRu: 'Числовой порог', description: 'Compares a numeric memory value with a threshold.', descriptionRu: 'Сравнивает числовое значение памяти с порогом.', outputs: [port('result', 'boolean', 'Result', 'Результат')], parameters: [
    requiredParameter('sourceKey', 'string', 'Memory key', 'Ключ памяти', 'danger'),
    enumParameter('comparison', 'Comparison', 'Сравнение', 'above', [option('above', 'Above', 'Выше'), option('below', 'Below', 'Ниже')]),
    requiredParameter('threshold', 'number', 'Threshold', 'Порог', 60),
  ] }),
  contract({ type: 'FlagCheck', category: 'condition', label: 'Flag Check', labelRu: 'Проверка флага', description: 'Checks a true/false memory flag.', descriptionRu: 'Проверяет значение да/нет в памяти.', outputs: [port('result', 'boolean', 'Result', 'Результат')], parameters: [
    requiredParameter('flagKey', 'string', 'Flag key', 'Ключ флага', 'underFire'),
    requiredParameter('expected', 'boolean', 'Expected', 'Ожидаемое значение', true),
  ] }),
  contract({ type: 'DistanceCheck', category: 'condition', label: 'Distance Threshold', labelRu: 'Порог расстояния', description: 'Checks whether a selected distance is closer or farther than a threshold.', descriptionRu: 'Проверяет выбранную дистанцию относительно порога.', outputs: [port('result', 'boolean', 'Result', 'Результат')], parameters: [
    enumParameter('from', 'From', 'Откуда', 'self', ['self', 'currentTarget', 'orderTarget', 'cover', 'ally', 'enemy'].map((value) => option(value, value, value))),
    enumParameter('to', 'To', 'Куда', 'cover', ['enemy', 'cover', 'orderPoint', 'commander', 'squad', 'retreatPoint'].map((value) => option(value, value, value))),
    enumParameter('comparison', 'Comparison', 'Сравнение', 'closer', [option('closer', 'Closer', 'Ближе'), option('farther', 'Farther', 'Дальше')]),
    requiredParameter('thresholdMeters', 'number', 'Distance', 'Расстояние', 30, { minimum: 0 }),
  ] }),
  contract({ type: 'StableThreshold', category: 'condition', label: 'Stable Threshold', labelRu: 'Стабильный порог', description: 'Uses separate enter and exit thresholds to avoid flicker.', descriptionRu: 'Использует отдельные пороги включения и выключения.', outputs: [port('result', 'boolean', 'Result', 'Результат')], parameters: [
    requiredParameter('sourceKey', 'string', 'Memory key', 'Ключ памяти', 'danger'),
    requiredParameter('enterThreshold', 'number', 'Enter threshold', 'Порог включения', 70),
    requiredParameter('exitThreshold', 'number', 'Exit threshold', 'Порог выключения', 45),
    requiredParameter('stateKey', 'string', 'State key', 'Ключ состояния', 'danger_stable'),
  ] }),
  contract({ type: 'TacticalCheck', category: 'condition', label: 'Tactical Check', labelRu: 'Тактическая проверка', description: 'Checks a selected tactical possibility.', descriptionRu: 'Проверяет выбранную тактическую возможность.', outputs: [port('result', 'boolean', 'Result', 'Результат')], parameters: [
    enumParameter('checkKind', 'Check', 'Проверка', 'cover_exists', ['line_of_sight', 'line_of_fire', 'path_exists', 'cover_exists', 'ammo_available', 'can_execute_order'].map((value) => option(value, value, value))),
    requiredParameter('expected', 'boolean', 'Expected', 'Ожидаемое значение', true),
  ] }),

  contract({ type: 'ParameterScore', category: 'score', label: 'Parameter Score', labelRu: 'Оценка параметра', description: 'Adds score based on a numeric memory parameter.', descriptionRu: 'Добавляет баллы на основе числового параметра памяти.', outputs: [port('score', 'number', 'Score', 'Оценка')], parameters: [
    requiredParameter('sourceKey', 'string', 'Memory key', 'Ключ памяти', 'danger'),
    enumParameter('direction', 'Direction', 'Направление', 'positive', [option('positive', 'Positive', 'Положительное'), option('negative', 'Negative', 'Отрицательное')]),
    requiredParameter('weight', 'number', 'Weight', 'Вес', 1),
  ] }),
  contract({ type: 'DistanceScore', category: 'score', label: 'Distance Score', labelRu: 'Оценка расстояния', description: 'Adds score based on distance to a target kind.', descriptionRu: 'Добавляет баллы на основе расстояния до цели.', outputs: [port('score', 'number', 'Score', 'Оценка')], parameters: [
    enumParameter('targetKind', 'Target', 'Цель', 'cover', ['cover', 'enemy', 'ally', 'orderPoint', 'commander', 'squad'].map((value) => option(value, value, value))),
    enumParameter('preference', 'Preference', 'Предпочтение', 'closer', [option('closer', 'Closer', 'Ближе'), option('farther', 'Farther', 'Дальше')]),
    requiredParameter('idealMeters', 'number', 'Ideal distance', 'Желаемое расстояние', 25, { minimum: 0 }),
    requiredParameter('weight', 'number', 'Weight', 'Вес', 1),
  ] }),
  contract({ type: 'DecisionInertia', category: 'score', label: 'Decision Inertia', labelRu: 'Инерция решения', description: 'Adds score to keep a recent decision.', descriptionRu: 'Добавляет баллы для удержания недавнего решения.', outputs: [port('score', 'number', 'Score', 'Оценка')], parameters: [
    requiredParameter('action', 'string', 'Action', 'Действие', 'move_to'),
    requiredParameter('bonus', 'number', 'Bonus', 'Бонус', 20),
    requiredParameter('minimumSeconds', 'number', 'Minimum time', 'Минимальное время', 3, { minimum: 0 }),
  ] }),
  contract({ type: 'RandomChance', category: 'score', label: 'Chance', labelRu: 'Шанс', description: 'Adds controlled randomness or passes by probability.', descriptionRu: 'Добавляет управляемую случайность или проверяет вероятность.', outputs: [port('score', 'number', 'Оценка', 'Оценка')], parameters: [
    requiredParameter('probabilityPercent', 'number', 'Probability', 'Вероятность', 50, { minimum: 0, maximum: 100 }),
    parameter('sourceKey', 'string', 'Modifier key', 'Ключ модификатора', 'morale'),
  ] }),

  contract({ type: 'FindBestObject', category: 'query', label: 'Find Object', labelRu: 'Поиск объекта', description: 'Finds the best tactical object.', descriptionRu: 'Ищет лучший тактический объект.', outputs: [port('object', 'objectId', 'Object', 'Объект', false, true), port('position', 'position', 'Position', 'Позиция', false, true)], parameters: [
    enumParameter('objectKind', 'Object kind', 'Тип объекта', 'cover', ['cover', 'enemy', 'ally', 'firing_position', 'retreat_point', 'route_point'].map((value) => option(value, value, value))),
    enumParameter('criteria', 'Criterion', 'Критерий', 'safer', ['closer', 'safer', 'has_line_of_fire', 'farther_from_enemy'].map((value) => option(value, value, value))),
    requiredParameter('searchRadiusMeters', 'number', 'Search radius', 'Радиус поиска', 50, { minimum: 0 }),
    requiredParameter('writeTo', 'string', 'Write position to', 'Записать позицию в', 'best_cover_position'),
  ] }),
  contract({ type: 'SelectTarget', category: 'query', label: 'Target Choice', labelRu: 'Выбор цели', description: 'Chooses a target by a rule.', descriptionRu: 'Выбирает цель по заданному правилу.', outputs: [port('unit', 'unitId', 'Target unit', 'Целевой боец', false, true)], parameters: [
    enumParameter('rule', 'Rule', 'Правило', 'nearest', ['nearest', 'most_dangerous', 'shooting_at_us', 'order_target', 'best_line_of_fire'].map((value) => option(value, value, value))),
    requiredParameter('writeTo', 'string', 'Write target to', 'Записать цель в', 'current_target'),
  ] }),

  contract({ type: 'WriteMemory', category: 'memory', label: 'Write Memory', labelRu: 'Запись памяти', description: 'Writes a selected value into soldier memory.', descriptionRu: 'Записывает выбранное значение в память бойца.', inputs: [port('value', 'string', 'Value', 'Значение')], outputs: [port('value', 'string', 'Written value', 'Записанное значение')], parameters: [
    requiredParameter('writeTo', 'string', 'Memory key', 'Ключ памяти', 'current_goal'),
    parameter('value', 'string', 'Value', 'Значение', 'take_cover'),
    enumParameter('scope', 'Memory scope', 'Область памяти', 'runtimeSessionMemory', [
      option('persistentSoldierMemory', 'Persistent soldier memory', 'Постоянная память бойца'),
      option('runtimeSessionMemory', 'Runtime session memory', 'Память runtime session'),
      option('activeStateMemory', 'Active state memory', 'Память активного состояния'),
      option('subgraphLocalMemory', 'Subgraph local memory', 'Локальная память подграфа'),
      option('nodeLocalState', 'Node local state', 'Локальное состояние ноды'),
    ], false),
  ] }),
  contract({ type: 'CopyMemory', category: 'memory', label: 'Copy Memory', labelRu: 'Копия памяти', description: 'Copies one memory value into another key.', descriptionRu: 'Копирует одно значение памяти в другой ключ.', parameters: [
    requiredParameter('fromKey', 'string', 'From key', 'Исходный ключ', 'best_cover_position'),
    requiredParameter('toKey', 'string', 'To key', 'Целевой ключ', 'move_target'),
  ] }),
  contract({ type: 'ForbidAction', category: 'memory', label: 'Forbid Action', labelRu: 'Запрет действия', description: 'Writes a temporary action ban.', descriptionRu: 'Записывает временный запрет действия.', parameters: [
    requiredParameter('action', 'string', 'Action', 'Действие', 'fire'),
    requiredParameter('durationSeconds', 'number', 'Duration', 'Длительность', 5, { minimum: 0 }),
    parameter('reasonRu', 'string', 'Reason (RU)', 'Причина', 'Нельзя выполнить действие сейчас.'),
  ] }),

  contract({ type: 'SetPosture', category: 'action', label: 'Posture', labelRu: 'Поза', description: 'Commands a soldier posture.', descriptionRu: 'Задаёт позу бойца.', parameters: [enumParameter('posture', 'Posture', 'Поза', 'prone', [option('stand', 'Stand', 'Стоять'), option('crouch', 'Crouch', 'Пригнуться'), option('prone', 'Prone', 'Лечь')])] }),
  contract({ type: 'SetAction', category: 'action', label: 'Action', labelRu: 'Действие', description: 'Issues a selected action.', descriptionRu: 'Выдаёт выбранное действие.', inputs: [port('target', 'position', 'Target position', 'Позиция цели', false, true)], parameters: [
    enumParameter('action', 'Action', 'Действие', 'move_to', ['move_to', 'fire', 'reload', 'retreat', 'wait', 'suppress', 'continue_order'].map((value) => option(value, value, value))),
    parameter('targetKey', 'string', 'Target memory key', 'Ключ цели в памяти', 'best_cover_position'),
  ] }),
  contract({ type: 'Wait', category: 'action', label: 'Wait', labelRu: 'Ждать', description: 'Waits for a configured duration.', descriptionRu: 'Ждёт заданное время.', childPolicy: 'none', lifecycle: 'stateful', parameters: [
    requiredParameter('durationSeconds', 'number', 'Duration', 'Длительность', 2, { minimum: 0 }),
    parameter('timeoutSeconds', 'number', 'Timeout', 'Тайм-аут', 0, { minimum: 0 }),
  ] }),
  contract({ type: 'Reload', category: 'action', label: 'Reload', labelRu: 'Перезарядить', description: 'Reloads over simulation time.', descriptionRu: 'Перезаряжается во времени симуляции.', childPolicy: 'none', lifecycle: 'stateful', parameters: [
    requiredParameter('durationSeconds', 'number', 'Duration', 'Длительность', 3, { minimum: 0 }),
    requiredParameter('targetAmmo', 'number', 'Target ammo', 'Патронов после завершения', 30, { minimum: 0, integer: true }),
    requiredParameter('failIfNoWeapon', 'boolean', 'Fail without weapon', 'Провалить без оружия', true),
  ] }),
  contract({ type: 'MoveToBlackboardPosition', category: 'action', label: 'Move to Memory Position', labelRu: 'Двигаться к позиции из памяти', description: 'Moves toward a saved Blackboard position.', descriptionRu: 'Движется к сохранённой позиции Blackboard.', childPolicy: 'none', lifecycle: 'stateful', inputs: [port('target', 'position', 'Target', 'Цель', true)], outputs: [port('route', 'route', 'Route', 'Маршрут')], parameters: [
    requiredParameter('targetKey', 'string', 'Target memory key', 'Цель из памяти', 'best_cover_position'),
    requiredParameter('acceptanceRadiusCells', 'number', 'Acceptance radius', 'Радиус достижения', 0.2, { minimum: 0 }),
    parameter('timeoutSeconds', 'number', 'Timeout', 'Максимальное время', 15, { minimum: 0 }),
    parameter('stuckTimeoutSeconds', 'number', 'Stuck timeout', 'Тайм-аут застревания', 2.5, { minimum: 0 }),
    parameter('minimumProgressCells', 'number', 'Minimum progress', 'Минимальный прогресс', 0.05, { minimum: 0 }),
    parameter('abortOnTargetLost', 'boolean', 'Abort when target is lost', 'Отменять при исчезновении цели', true),
  ] }),
  contract({ type: 'SetMovementMode', category: 'action', label: 'Movement Mode', labelRu: 'Режим движения', description: 'Selects a movement profile.', descriptionRu: 'Выбирает профиль движения.', parameters: [enumParameter('mode', 'Mode', 'Режим', 'careful', ['fast', 'careful', 'crawl', 'bounds', 'formation', 'follow_tank'].map((value) => option(value, value, value))) ] }),
  contract({ type: 'SetAttentionMode', category: 'action', label: 'Attention Mode', labelRu: 'Режим внимания', description: 'Selects an attention mode.', descriptionRu: 'Выбирает режим внимания.', parameters: [
    enumParameter('mode', 'Mode', 'Режим', 'observe', ['march', 'observe', 'search', 'engage'].map((value) => option(value, value, value))),
    parameter('reasonRu', 'string', 'Reason (RU)', 'Причина', 'Переключить режим внимания.'),
  ] }),
  contract({ type: 'SetSearchSector', category: 'action', label: 'Search Sector', labelRu: 'Сектор поиска', description: 'Starts deliberate search in a direction and angular width.', descriptionRu: 'Запускает поиск в заданном направлении и секторе.', parameters: [
    requiredParameter('centerDegrees', 'number', 'Center direction', 'Центральное направление', 0),
    requiredParameter('arcDegrees', 'number', 'Arc width', 'Ширина сектора', 120, { minimum: 1, maximum: 360 }),
    parameter('reasonRu', 'string', 'Reason (RU)', 'Причина', 'Осмотреть указанный сектор.'),
  ] }),
  contract({ type: 'ClearAttentionOverride', category: 'action', label: 'Automatic Attention', labelRu: 'Автоматическое внимание', description: 'Returns attention to automatic simulation rules.', descriptionRu: 'Возвращает внимание автоматическим правилам.', parameters: [] }),
  contract({ type: 'SayMessage', category: 'action', label: 'Say Message', labelRu: 'Реплика бойца', description: 'Shows a short speech message.', descriptionRu: 'Показывает короткую реплику бойца.', parameters: [
    requiredParameter('message', 'string', 'Message', 'Сообщение', 'Under fire!'),
    requiredParameter('messageRu', 'string', 'Message (RU)', 'Сообщение по-русски', 'Под огнём!'),
    requiredParameter('durationSeconds', 'number', 'Duration', 'Длительность', 2, { minimum: 0 }),
  ] }),
  contract({ type: 'WriteReason', category: 'debug', label: 'Explain', labelRu: 'Объяснение', description: 'Adds a human-readable explanation.', descriptionRu: 'Добавляет понятное объяснение.', parameters: [
    requiredParameter('reason', 'string', 'Reason', 'Причина', 'Chosen by graph.'),
    requiredParameter('reasonRu', 'string', 'Reason (RU)', 'Причина по-русски', 'Выбрано графом.'),
  ] }),

  contract({ type: 'WaitForEvent', category: 'action', label: 'Wait for Event', labelRu: 'Ждать событие', description: 'Waits until a matching runtime event arrives.', descriptionRu: 'Ждёт появления подходящего события runtime.', childPolicy: 'none', lifecycle: 'stateful', outputs: [port('event', 'event', 'Event', 'Событие')], parameters: [
    requiredParameter('eventType', 'string', 'Event type', 'Тип события', 'shot_nearby'),
    parameter('timeoutSeconds', 'number', 'Timeout', 'Тайм-аут', 0, { minimum: 0 }),
    parameter('consumeEvent', 'boolean', 'Consume event', 'Поглотить событие', true),
  ] }),
  contract({ type: 'Timeout', category: 'flow', label: 'Timeout', labelRu: 'Ограничение времени', description: 'Fails and cancels its child after a time limit.', descriptionRu: 'Проваливается и отменяет дочернюю ветвь после ограничения времени.', childPolicy: 'one', lifecycle: 'modifier', cooldown: false, parameters: [
    requiredParameter('timeoutSeconds', 'number', 'Timeout', 'Максимальное время', 5, { minimum: 0 }),
  ] }),
  contract({ type: 'Retry', category: 'flow', label: 'Retry', labelRu: 'Повторить попытку', description: 'Retries a failed child a limited number of times.', descriptionRu: 'Повторяет провалившуюся дочернюю ветвь ограниченное число раз.', childPolicy: 'one', lifecycle: 'modifier', cooldown: false, parameters: [
    requiredParameter('maxAttempts', 'number', 'Maximum attempts', 'Максимум попыток', 3, { minimum: 1, maximum: 100, integer: true }),
  ] }),
  contract({ type: 'Subgraph', category: 'subgraph', label: 'Behavior Subgraph', labelRu: 'Подграф поведения', description: 'Executes a reusable typed behavior graph.', descriptionRu: 'Выполняет переиспользуемый типизированный граф поведения.', childPolicy: 'none', lifecycle: 'stateful', inputs: [
    port('position', 'position', 'Position', 'Позиция'),
    port('unit', 'unitId', 'Unit', 'Боец'),
    port('event', 'event', 'Event', 'Событие'),
  ], outputs: [
    port('position', 'position', 'Result position', 'Результирующая позиция'),
    port('route', 'route', 'Result route', 'Результирующий маршрут'),
    port('success', 'boolean', 'Success', 'Успех'),
  ], parameters: [
    requiredParameter('subgraphId', 'string', 'Subgraph', 'Подграф', 'take_cover'),
    enumParameter('cancelPolicy', 'Cancel policy', 'Политика отмены', 'cancel_child', [option('cancel_child', 'Cancel active child', 'Отменить активный дочерний граф')]),
  ] }),
];

export const DEFAULT_AI_NODE_CONTRACT_REGISTRY = new AiNodeContractRegistry();
for (const definition of definitions) DEFAULT_AI_NODE_CONTRACT_REGISTRY.register(definition);

function freezeContract(value: AiNodeContract): AiNodeContract {
  return Object.freeze({
    ...value,
    inputs: Object.freeze(value.inputs.map((item) => Object.freeze({ ...item }))),
    outputs: Object.freeze(value.outputs.map((item) => Object.freeze({ ...item }))),
    parameters: Object.freeze(value.parameters.map((item) => Object.freeze({
      ...item,
      options: item.options ? Object.freeze(item.options.map((entry) => Object.freeze({ ...entry }))) : undefined,
    }))),
  });
}
