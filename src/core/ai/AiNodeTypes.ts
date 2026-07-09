export type AiNodeCategory = 'flow' | 'condition' | 'score' | 'query' | 'action' | 'memory' | 'debug';

export interface AiNodeTypeDefinition {
  readonly type: string;
  readonly category: AiNodeCategory;
  readonly label: string;
  readonly description: string;
  readonly labelRu: string;
  readonly descriptionRu: string;
  readonly canHaveChildren: boolean;
}

export const AI_NODE_TYPE_DEFINITIONS = {
  Root: {
    type: 'Root',
    category: 'flow',
    label: 'Start',
    description: 'Entry point for a single soldier behavior graph.',
    labelRu: 'Старт',
    descriptionRu: 'Точка входа в граф поведения одиночного солдата.',
    canHaveChildren: true,
  },
  UtilitySelector: {
    type: 'UtilitySelector',
    category: 'flow',
    label: 'Best Choice',
    description: 'Scores child branches and chooses the best available option.',
    labelRu: 'Лучший выбор',
    descriptionRu: 'Оценивает дочерние ветки и выбирает лучший доступный вариант.',
    canHaveChildren: true,
  },
  Sequence: {
    type: 'Sequence',
    category: 'flow',
    label: 'Step Chain',
    description: 'Runs child nodes in order until one fails.',
    labelRu: 'Цепочка шагов',
    descriptionRu: 'Выполняет дочерние ноды по порядку, пока одна из них не провалится.',
    canHaveChildren: true,
  },
  Selector: {
    type: 'Selector',
    category: 'flow',
    label: 'First Working Choice',
    description: 'Tries child nodes in order and takes the first successful one.',
    labelRu: 'Первый рабочий выбор',
    descriptionRu: 'Пробует дочерние ноды по порядку и берёт первую успешную.',
    canHaveChildren: true,
  },
  ActionBranch: {
    type: 'ActionBranch',
    category: 'flow',
    label: 'Action Option',
    description: 'Groups conditions, scores, queries, and execution for one behavior option.',
    labelRu: 'Вариант действия',
    descriptionRu: 'Группирует условия, оценки и исполнение одного варианта поведения.',
    canHaveChildren: true,
  },
  BlackboardValueAbove: {
    type: 'BlackboardValueAbove',
    category: 'condition',
    label: 'Numeric Threshold',
    description: 'Compares one selected numeric soldier-memory value with a threshold using above or below mode.',
    labelRu: 'Числовой порог',
    descriptionRu: 'Сравнивает выбранный числовой параметр памяти солдата с порогом в режиме выше или ниже.',
    canHaveChildren: true,
  },
  FlagCheck: {
    type: 'FlagCheck',
    category: 'condition',
    label: 'Flag Check',
    description: 'Checks whether a selected true/false soldier-memory flag has the expected value.',
    labelRu: 'Проверка флага',
    descriptionRu: 'Проверяет, равно ли выбранное да/нет значение памяти солдата ожидаемому значению.',
    canHaveChildren: true,
  },
  DistanceCheck: {
    type: 'DistanceCheck',
    category: 'condition',
    label: 'Distance Threshold',
    description: 'Checks whether a selected distance is closer or farther than a threshold.',
    labelRu: 'Порог расстояния',
    descriptionRu: 'Проверяет, ближе или дальше выбранная дистанция заданного порога.',
    canHaveChildren: true,
  },
  StableThreshold: {
    type: 'StableThreshold',
    category: 'condition',
    label: 'Stable Threshold',
    description: 'Uses two thresholds to avoid flickering decisions: one to turn on and one to turn off.',
    labelRu: 'Стабильный порог',
    descriptionRu: 'Использует два порога, чтобы решение не мигало: один для включения, второй для выключения.',
    canHaveChildren: true,
  },
  TacticalCheck: {
    type: 'TacticalCheck',
    category: 'condition',
    label: 'Tactical Check',
    description: 'Checks a selected tactical possibility such as line of sight, line of fire, path, cover, or ammo.',
    labelRu: 'Тактическая проверка',
    descriptionRu: 'Проверяет выбранную тактическую возможность: видимость, линию огня, путь, укрытие или боеприпасы.',
    canHaveChildren: true,
  },
  ParameterScore: {
    type: 'ParameterScore',
    category: 'score',
    label: 'Parameter Score',
    description: 'Adds or subtracts score based on any selected numeric soldier-memory parameter.',
    labelRu: 'Оценка параметра',
    descriptionRu: 'Добавляет или вычитает баллы на основе любого выбранного числового параметра памяти солдата.',
    canHaveChildren: true,
  },
  DistanceScore: {
    type: 'DistanceScore',
    category: 'score',
    label: 'Distance Score',
    description: 'Adds score based on distance to a selected object, point, or target.',
    labelRu: 'Оценка расстояния',
    descriptionRu: 'Добавляет баллы на основе расстояния до выбранного объекта, точки или цели.',
    canHaveChildren: true,
  },
  DecisionInertia: {
    type: 'DecisionInertia',
    category: 'score',
    label: 'Decision Inertia',
    description: 'Adds score to keep the current or recent decision for a short time.',
    labelRu: 'Инерция решения',
    descriptionRu: 'Добавляет баллы, чтобы удержать текущее или недавнее решение на короткое время.',
    canHaveChildren: true,
  },
  RandomChance: {
    type: 'RandomChance',
    category: 'score',
    label: 'Chance',
    description: 'Adds controlled randomness or passes by probability, optionally modified by a parameter.',
    labelRu: 'Шанс',
    descriptionRu: 'Добавляет управляемую случайность или пропускает проверку по вероятности с возможным модификатором.',
    canHaveChildren: true,
  },
  FindBestObject: {
    type: 'FindBestObject',
    category: 'query',
    label: 'Find Object',
    description: 'Finds the best object of a selected kind: cover, enemy, ally, firing position, retreat point, or route point.',
    labelRu: 'Поиск объекта',
    descriptionRu: 'Ищет лучший объект выбранного типа: укрытие, врага, союзника, позицию для стрельбы, точку отхода или маршрутную точку.',
    canHaveChildren: true,
  },
  SelectTarget: {
    type: 'SelectTarget',
    category: 'query',
    label: 'Target Choice',
    description: 'Chooses a target by a simple rule and writes it to soldier memory.',
    labelRu: 'Выбор цели',
    descriptionRu: 'Выбирает цель по простому правилу и записывает её в память солдата.',
    canHaveChildren: true,
  },
  WriteMemory: {
    type: 'WriteMemory',
    category: 'memory',
    label: 'Write Memory',
    description: 'Writes a selected value into soldier memory.',
    labelRu: 'Запись памяти',
    descriptionRu: 'Записывает выбранное значение в память солдата.',
    canHaveChildren: true,
  },
  CopyMemory: {
    type: 'CopyMemory',
    category: 'memory',
    label: 'Copy Memory',
    description: 'Copies one soldier-memory value into another memory key.',
    labelRu: 'Копия памяти',
    descriptionRu: 'Копирует одно значение памяти солдата в другой ключ памяти.',
    canHaveChildren: true,
  },
  ForbidAction: {
    type: 'ForbidAction',
    category: 'memory',
    label: 'Forbid Action',
    description: 'Writes a temporary ban for a selected action, with a human-readable reason.',
    labelRu: 'Запрет действия',
    descriptionRu: 'Записывает временный запрет выбранного действия с понятной причиной.',
    canHaveChildren: true,
  },
  SetPosture: {
    type: 'SetPosture',
    category: 'action',
    label: 'Posture',
    description: 'Commands the soldier to stand, crouch, or go prone.',
    labelRu: 'Поза',
    descriptionRu: 'Команда солдату встать, пригнуться или лечь.',
    canHaveChildren: true,
  },
  SetAction: {
    type: 'SetAction',
    category: 'action',
    label: 'Action',
    description: 'Issues a selected action such as move, fire, reload, retreat, wait, suppress, or continue order.',
    labelRu: 'Действие',
    descriptionRu: 'Выдаёт выбранное действие: двигаться, стрелять, перезарядиться, отступить, ждать, подавлять или продолжать приказ.',
    canHaveChildren: true,
  },
  SetMovementMode: {
    type: 'SetMovementMode',
    category: 'action',
    label: 'Movement Mode',
    description: 'Sets how the soldier moves: fast, careful, crawl, bounds, follow formation, or follow tank.',
    labelRu: 'Режим движения',
    descriptionRu: 'Задаёт как двигаться: быстро, осторожно, ползком, перебежками, в строю или за танком.',
    canHaveChildren: true,
  },
  SayMessage: {
    type: 'SayMessage',
    category: 'action',
    label: 'Say Message',
    description: 'Shows a short speech bubble or text message above the soldier.',
    labelRu: 'Реплика бойца',
    descriptionRu: 'Показывает короткую фразу или сообщение над бойцом.',
    canHaveChildren: true,
  },
  WriteReason: {
    type: 'WriteReason',
    category: 'debug',
    label: 'Explain',
    description: 'Adds a human-readable explanation to the latest decision.',
    labelRu: 'Объяснение',
    descriptionRu: 'Добавляет понятное объяснение к последнему решению.',
    canHaveChildren: true,
  },
} as const satisfies Record<string, AiNodeTypeDefinition>;

export type AiNodeType = keyof typeof AI_NODE_TYPE_DEFINITIONS;

export function isAiNodeType(value: string): value is AiNodeType {
  return Object.prototype.hasOwnProperty.call(AI_NODE_TYPE_DEFINITIONS, value);
}

export function getAiNodeTypeDefinition(type: AiNodeType): AiNodeTypeDefinition {
  return AI_NODE_TYPE_DEFINITIONS[type];
}
