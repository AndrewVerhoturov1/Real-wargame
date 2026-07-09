export type AiNodeCategory = 'flow' | 'condition' | 'score' | 'query' | 'action' | 'memory' | 'debug';

export interface AiNodeTypeDefinition {
  readonly type: string;
  readonly category: AiNodeCategory;
  readonly labelRu: string;
  readonly descriptionRu: string;
  readonly canHaveChildren: boolean;
}

export const AI_NODE_TYPE_DEFINITIONS = {
  Root: {
    type: 'Root',
    category: 'flow',
    labelRu: 'Корень',
    descriptionRu: 'Точка входа в граф поведения одиночного солдата.',
    canHaveChildren: true,
  },
  UtilitySelector: {
    type: 'UtilitySelector',
    category: 'flow',
    labelRu: 'Выбор по баллам',
    descriptionRu: 'Оценивает дочерние ветки и выбирает лучший вариант действия.',
    canHaveChildren: true,
  },
  Sequence: {
    type: 'Sequence',
    category: 'flow',
    labelRu: 'Последовательность',
    descriptionRu: 'Выполняет дочерние ноды по порядку, пока одна из них не провалится.',
    canHaveChildren: true,
  },
  Selector: {
    type: 'Selector',
    category: 'flow',
    labelRu: 'Выбор первого подходящего',
    descriptionRu: 'Пробует дочерние ноды по порядку и берёт первую успешную.',
    canHaveChildren: true,
  },
  ActionBranch: {
    type: 'ActionBranch',
    category: 'flow',
    labelRu: 'Ветка действия',
    descriptionRu: 'Группирует условия, оценки и исполнение одного варианта поведения.',
    canHaveChildren: true,
  },
  HasOrder: {
    type: 'HasOrder',
    category: 'condition',
    labelRu: 'Есть приказ',
    descriptionRu: 'Проверяет, есть ли у солдата текущий приказ.',
    canHaveChildren: false,
  },
  EnemyVisible: {
    type: 'EnemyVisible',
    category: 'condition',
    labelRu: 'Враг виден',
    descriptionRu: 'Проверяет, видит ли солдат врага через свои сенсоры.',
    canHaveChildren: false,
  },
  EnemyKnown: {
    type: 'EnemyKnown',
    category: 'condition',
    labelRu: 'Враг известен',
    descriptionRu: 'Проверяет, есть ли в памяти солдата известный или последний замеченный враг.',
    canHaveChildren: false,
  },
  UnderFire: {
    type: 'UnderFire',
    category: 'condition',
    labelRu: 'Под огнём',
    descriptionRu: 'Проверяет, находится ли солдат под текущим огневым давлением.',
    canHaveChildren: false,
  },
  DangerAbove: {
    type: 'DangerAbove',
    category: 'condition',
    labelRu: 'Опасность выше порога',
    descriptionRu: 'Сравнивает текущую опасность с порогом.',
    canHaveChildren: false,
  },
  StressAbove: {
    type: 'StressAbove',
    category: 'condition',
    labelRu: 'Стресс выше порога',
    descriptionRu: 'Сравнивает стресс солдата с порогом.',
    canHaveChildren: false,
  },
  CoverNearby: {
    type: 'CoverNearby',
    category: 'condition',
    labelRu: 'Рядом есть укрытие',
    descriptionRu: 'Проверяет, найдено ли доступное укрытие рядом с солдатом.',
    canHaveChildren: false,
  },
  ScoreDanger: {
    type: 'ScoreDanger',
    category: 'score',
    labelRu: 'Оценка опасности',
    descriptionRu: 'Добавляет или вычитает баллы на основе текущей опасности.',
    canHaveChildren: false,
  },
  ScoreStress: {
    type: 'ScoreStress',
    category: 'score',
    labelRu: 'Оценка стресса',
    descriptionRu: 'Добавляет или вычитает баллы на основе стресса.',
    canHaveChildren: false,
  },
  ScoreObedience: {
    type: 'ScoreObedience',
    category: 'score',
    labelRu: 'Оценка послушания приказу',
    descriptionRu: 'Добавляет баллы варианту, который продолжает выполнять приказ.',
    canHaveChildren: false,
  },
  ScoreCoverNeed: {
    type: 'ScoreCoverNeed',
    category: 'score',
    labelRu: 'Оценка потребности в укрытии',
    descriptionRu: 'Повышает ценность ухода в укрытие при угрозе.',
    canHaveChildren: false,
  },
  ScoreCurrentActionInertia: {
    type: 'ScoreCurrentActionInertia',
    category: 'score',
    labelRu: 'Инерция текущего действия',
    descriptionRu: 'Даёт бонус текущему действию, чтобы солдат не дёргался каждую проверку.',
    canHaveChildren: false,
  },
  FindBestCover: {
    type: 'FindBestCover',
    category: 'query',
    labelRu: 'Найти лучшее укрытие',
    descriptionRu: 'Просит локальный движок выбрать лучшую точку укрытия вокруг солдата.',
    canHaveChildren: false,
  },
  SetPosture: {
    type: 'SetPosture',
    category: 'action',
    labelRu: 'Сменить позу',
    descriptionRu: 'Команда солдату встать, пригнуться или лечь.',
    canHaveChildren: false,
  },
  MoveToCover: {
    type: 'MoveToCover',
    category: 'action',
    labelRu: 'Двигаться к укрытию',
    descriptionRu: 'Команда двигаться к точке укрытия из blackboard.',
    canHaveChildren: false,
  },
  ContinueOrder: {
    type: 'ContinueOrder',
    category: 'action',
    labelRu: 'Продолжать приказ',
    descriptionRu: 'Команда продолжить текущий приказ, если риск допустим.',
    canHaveChildren: false,
  },
  Observe: {
    type: 'Observe',
    category: 'action',
    labelRu: 'Наблюдать',
    descriptionRu: 'Команда остановиться и наблюдать сектор.',
    canHaveChildren: false,
  },
  WriteReason: {
    type: 'WriteReason',
    category: 'debug',
    labelRu: 'Записать причину',
    descriptionRu: 'Добавляет понятное объяснение к последнему решению.',
    canHaveChildren: false,
  },
} as const satisfies Record<string, AiNodeTypeDefinition>;

export type AiNodeType = keyof typeof AI_NODE_TYPE_DEFINITIONS;

export function isAiNodeType(value: string): value is AiNodeType {
  return Object.prototype.hasOwnProperty.call(AI_NODE_TYPE_DEFINITIONS, value);
}

export function getAiNodeTypeDefinition(type: AiNodeType): AiNodeTypeDefinition {
  return AI_NODE_TYPE_DEFINITIONS[type];
}
