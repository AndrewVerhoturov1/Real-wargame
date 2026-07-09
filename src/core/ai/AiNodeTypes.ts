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
    label: 'Root',
    description: 'Entry point for a single soldier behavior graph.',
    labelRu: 'Корень',
    descriptionRu: 'Точка входа в граф поведения одиночного солдата.',
    canHaveChildren: true,
  },
  UtilitySelector: {
    type: 'UtilitySelector',
    category: 'flow',
    label: 'Utility Selector',
    description: 'Scores child branches and chooses the best action option.',
    labelRu: 'Выбор по баллам',
    descriptionRu: 'Оценивает дочерние ветки и выбирает лучший вариант действия.',
    canHaveChildren: true,
  },
  Sequence: {
    type: 'Sequence',
    category: 'flow',
    label: 'Sequence',
    description: 'Runs child nodes in order until one fails.',
    labelRu: 'Последовательность',
    descriptionRu: 'Выполняет дочерние ноды по порядку, пока одна из них не провалится.',
    canHaveChildren: true,
  },
  Selector: {
    type: 'Selector',
    category: 'flow',
    label: 'Selector',
    description: 'Tries child nodes in order and takes the first successful one.',
    labelRu: 'Выбор первого подходящего',
    descriptionRu: 'Пробует дочерние ноды по порядку и берёт первую успешную.',
    canHaveChildren: true,
  },
  ActionBranch: {
    type: 'ActionBranch',
    category: 'flow',
    label: 'Action Branch',
    description: 'Groups conditions, scores, queries, and execution for one behavior option.',
    labelRu: 'Ветка действия',
    descriptionRu: 'Группирует условия, оценки и исполнение одного варианта поведения.',
    canHaveChildren: true,
  },
  HasOrder: {
    type: 'HasOrder',
    category: 'condition',
    label: 'Has Order',
    description: 'Checks whether the soldier has a current order.',
    labelRu: 'Есть приказ',
    descriptionRu: 'Проверяет, есть ли у солдата текущий приказ.',
    canHaveChildren: false,
  },
  EnemyVisible: {
    type: 'EnemyVisible',
    category: 'condition',
    label: 'Enemy Visible',
    description: 'Checks whether the soldier currently sees an enemy through sensors.',
    labelRu: 'Враг виден',
    descriptionRu: 'Проверяет, видит ли солдат врага через свои сенсоры.',
    canHaveChildren: false,
  },
  EnemyKnown: {
    type: 'EnemyKnown',
    category: 'condition',
    label: 'Enemy Known',
    description: 'Checks whether the soldier remembers a known or last-seen enemy.',
    labelRu: 'Враг известен',
    descriptionRu: 'Проверяет, есть ли в памяти солдата известный или последний замеченный враг.',
    canHaveChildren: false,
  },
  UnderFire: {
    type: 'UnderFire',
    category: 'condition',
    label: 'Under Fire',
    description: 'Checks whether the soldier is under current fire pressure.',
    labelRu: 'Под огнём',
    descriptionRu: 'Проверяет, находится ли солдат под текущим огневым давлением.',
    canHaveChildren: false,
  },
  DangerAbove: {
    type: 'DangerAbove',
    category: 'condition',
    label: 'Danger Above Threshold',
    description: 'Compares current danger with a threshold.',
    labelRu: 'Опасность выше порога',
    descriptionRu: 'Сравнивает текущую опасность с порогом.',
    canHaveChildren: false,
  },
  StressAbove: {
    type: 'StressAbove',
    category: 'condition',
    label: 'Stress Above Threshold',
    description: 'Compares current stress with a threshold.',
    labelRu: 'Стресс выше порога',
    descriptionRu: 'Сравнивает стресс солдата с порогом.',
    canHaveChildren: false,
  },
  CoverNearby: {
    type: 'CoverNearby',
    category: 'condition',
    label: 'Cover Nearby',
    description: 'Checks whether a usable cover position is available near the soldier.',
    labelRu: 'Рядом есть укрытие',
    descriptionRu: 'Проверяет, найдено ли доступное укрытие рядом с солдатом.',
    canHaveChildren: false,
  },
  ScoreDanger: {
    type: 'ScoreDanger',
    category: 'score',
    label: 'Score Danger',
    description: 'Adds or subtracts score based on current danger.',
    labelRu: 'Оценка опасности',
    descriptionRu: 'Добавляет или вычитает баллы на основе текущей опасности.',
    canHaveChildren: false,
  },
  ScoreStress: {
    type: 'ScoreStress',
    category: 'score',
    label: 'Score Stress',
    description: 'Adds or subtracts score based on current stress.',
    labelRu: 'Оценка стресса',
    descriptionRu: 'Добавляет или вычитает баллы на основе стресса.',
    canHaveChildren: false,
  },
  ScoreObedience: {
    type: 'ScoreObedience',
    category: 'score',
    label: 'Score Obedience',
    description: 'Adds score to the option that continues the current order.',
    labelRu: 'Оценка послушания приказу',
    descriptionRu: 'Добавляет баллы варианту, который продолжает выполнять приказ.',
    canHaveChildren: false,
  },
  ScoreCoverNeed: {
    type: 'ScoreCoverNeed',
    category: 'score',
    label: 'Score Cover Need',
    description: 'Increases the value of moving to cover when threatened.',
    labelRu: 'Оценка потребности в укрытии',
    descriptionRu: 'Повышает ценность ухода в укрытие при угрозе.',
    canHaveChildren: false,
  },
  ScoreCurrentActionInertia: {
    type: 'ScoreCurrentActionInertia',
    category: 'score',
    label: 'Score Current Action Inertia',
    description: 'Adds a bonus to the current action so the soldier does not switch too often.',
    labelRu: 'Инерция текущего действия',
    descriptionRu: 'Даёт бонус текущему действию, чтобы солдат не дёргался каждую проверку.',
    canHaveChildren: false,
  },
  FindBestCover: {
    type: 'FindBestCover',
    category: 'query',
    label: 'Find Best Cover',
    description: 'Asks the local engine to choose the best cover point around the soldier.',
    labelRu: 'Найти лучшее укрытие',
    descriptionRu: 'Просит локальный движок выбрать лучшую точку укрытия вокруг солдата.',
    canHaveChildren: false,
  },
  SetPosture: {
    type: 'SetPosture',
    category: 'action',
    label: 'Set Posture',
    description: 'Commands the soldier to stand, crouch, or go prone.',
    labelRu: 'Сменить позу',
    descriptionRu: 'Команда солдату встать, пригнуться или лечь.',
    canHaveChildren: false,
  },
  MoveToCover: {
    type: 'MoveToCover',
    category: 'action',
    label: 'Move To Cover',
    description: 'Commands the soldier to move to the cover point from the blackboard.',
    labelRu: 'Двигаться к укрытию',
    descriptionRu: 'Команда двигаться к точке укрытия из blackboard.',
    canHaveChildren: false,
  },
  ContinueOrder: {
    type: 'ContinueOrder',
    category: 'action',
    label: 'Continue Order',
    description: 'Commands the soldier to continue the current order if the risk is acceptable.',
    labelRu: 'Продолжать приказ',
    descriptionRu: 'Команда продолжить текущий приказ, если риск допустим.',
    canHaveChildren: false,
  },
  Observe: {
    type: 'Observe',
    category: 'action',
    label: 'Observe',
    description: 'Commands the soldier to stop and observe the sector.',
    labelRu: 'Наблюдать',
    descriptionRu: 'Команда остановиться и наблюдать сектор.',
    canHaveChildren: false,
  },
  WriteReason: {
    type: 'WriteReason',
    category: 'debug',
    label: 'Write Reason',
    description: 'Adds a human-readable explanation to the latest decision.',
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
