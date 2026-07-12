import type { GridPosition } from '../geometry';

export type AiBlackboardPrimitive = string | number | boolean | null;
export type AiBlackboardValue = AiBlackboardPrimitive | GridPosition;
export type AiBlackboardValueKind = 'string' | 'number' | 'boolean' | 'unitId' | 'action' | 'position' | 'nullableUnitId' | 'nullablePosition';

export interface AiBlackboardSchemaEntry {
  readonly key: string;
  readonly valueKind: AiBlackboardValueKind;
  readonly label: string;
  readonly description: string;
  readonly labelRu: string;
  readonly descriptionRu: string;
  readonly defaultValue: AiBlackboardValue;
}

export type AiBlackboardDefaults = Record<string, AiBlackboardValue>;

export const SOLDIER_BLACKBOARD_SCHEMA = [
  {
    key: 'danger',
    valueKind: 'number',
    label: 'Danger',
    description: 'Current danger score for the soldier from 0 to 100.',
    labelRu: 'Опасность',
    descriptionRu: 'Текущая оценка опасности для солдата от 0 до 100.',
    defaultValue: 0,
  },
  {
    key: 'stress',
    valueKind: 'number',
    label: 'Stress',
    description: 'Current stress score for the soldier from 0 to 100.',
    labelRu: 'Стресс',
    descriptionRu: 'Текущий стресс солдата от 0 до 100.',
    defaultValue: 0,
  },
  {
    key: 'visible_enemy_id',
    valueKind: 'nullableUnitId',
    label: 'Visible Enemy',
    description: 'Id of the enemy currently visible to the soldier.',
    labelRu: 'Видимый враг',
    descriptionRu: 'Id врага, которого солдат прямо видит сейчас.',
    defaultValue: null,
  },
  {
    key: 'known_enemy_position',
    valueKind: 'nullablePosition',
    label: 'Known Enemy Position',
    description: 'Last known or estimated enemy position in the soldier personal memory.',
    labelRu: 'Известная позиция врага',
    descriptionRu: 'Последняя известная или предполагаемая позиция врага в личной памяти солдата.',
    defaultValue: null,
  },
  {
    key: 'best_cover_position',
    valueKind: 'nullablePosition',
    label: 'Best Cover Position',
    description: 'Cover point selected by the local engine through a tactical query.',
    labelRu: 'Лучшая точка укрытия',
    descriptionRu: 'Точка укрытия, выбранная локальным движком через tactical query.',
    defaultValue: null,
  },
  {
    key: 'attention_mode',
    valueKind: 'string',
    label: 'Attention Mode',
    description: 'Current attention mode selected by automatic behavior, AI or player.',
    labelRu: 'Режим внимания',
    descriptionRu: 'Текущий режим внимания, выбранный автоматически, ИИ или игроком.',
    defaultValue: 'observe',
  },
  {
    key: 'attention_focus_direction',
    valueKind: 'number',
    label: 'Attention Focus Direction',
    description: 'Current focus direction in degrees.',
    labelRu: 'Направление фокуса',
    descriptionRu: 'Текущее направление фокуса внимания в градусах.',
    defaultValue: 0,
  },
  {
    key: 'best_contact_stage',
    valueKind: 'string',
    label: 'Best Contact Stage',
    description: 'Strongest subjective perception contact stage.',
    labelRu: 'Стадия лучшего контакта',
    descriptionRu: 'Самая высокая стадия субъективного контакта бойца.',
    defaultValue: 'none',
  },
  {
    key: 'best_contact_confidence',
    valueKind: 'number',
    label: 'Best Contact Confidence',
    description: 'Confidence of the strongest subjective contact from 0 to 100.',
    labelRu: 'Уверенность лучшего контакта',
    descriptionRu: 'Уверенность в самом сильном субъективном контакте от 0 до 100.',
    defaultValue: 0,
  },
  {
    key: 'best_contact_uncertainty',
    valueKind: 'number',
    label: 'Best Contact Uncertainty',
    description: 'Position uncertainty of the strongest contact in cells.',
    labelRu: 'Неточность лучшего контакта',
    descriptionRu: 'Неточность позиции самого сильного контакта в клетках.',
    defaultValue: 0,
  },
  {
    key: 'contact_visible_now',
    valueKind: 'boolean',
    label: 'Contact Visible Now',
    description: 'Whether the strongest subjective contact is visually confirmed now.',
    labelRu: 'Контакт виден сейчас',
    descriptionRu: 'Подтверждён ли лучший субъективный контакт зрением прямо сейчас.',
    defaultValue: false,
  },
  {
    key: 'suspected_enemy_position',
    valueKind: 'nullablePosition',
    label: 'Suspected Enemy Position',
    description: 'Estimated position of the strongest subjective contact.',
    labelRu: 'Предполагаемая позиция врага',
    descriptionRu: 'Предполагаемая позиция самого сильного субъективного контакта.',
    defaultValue: null,
  },
  {
    key: 'player_command_active',
    valueKind: 'boolean',
    label: 'Player Command Active',
    description: 'Whether a player command is still an outstanding goal for this soldier.',
    labelRu: 'Приказ игрока активен',
    descriptionRu: 'Есть ли у бойца ещё не завершённая цель, заданная игроком.',
    defaultValue: false,
  },
  {
    key: 'player_command_type',
    valueKind: 'string',
    label: 'Player Command Type',
    description: 'Canonical type of the current player command.',
    labelRu: 'Тип приказа игрока',
    descriptionRu: 'Канонический тип текущего приказа игрока.',
    defaultValue: 'none',
  },
  {
    key: 'player_command_status',
    valueKind: 'string',
    label: 'Player Command Status',
    description: 'Current lifecycle status of the player command.',
    labelRu: 'Состояние приказа игрока',
    descriptionRu: 'Текущее состояние выполнения приказа игрока.',
    defaultValue: 'none',
  },
  {
    key: 'player_command_target_position',
    valueKind: 'nullablePosition',
    label: 'Player Command Target',
    description: 'Requested target position of the player command, independent of the technical route.',
    labelRu: 'Цель приказа игрока',
    descriptionRu: 'Запрошенная игроком позиция цели, отдельная от технического маршрута.',
    defaultValue: null,
  },
  {
    key: 'player_command_revision',
    valueKind: 'number',
    label: 'Player Command Revision',
    description: 'Monotonic revision used to detect a changed player command.',
    labelRu: 'Версия приказа игрока',
    descriptionRu: 'Возрастающая версия для определения изменения приказа игрока.',
    defaultValue: 0,
  },
  {
    key: 'current_action',
    valueKind: 'action',
    label: 'Current Action',
    description: 'Last selected action used for decision inertia.',
    labelRu: 'Текущее действие',
    descriptionRu: 'Последнее выбранное действие для инерции решений.',
    defaultValue: 'observe',
  },
  {
    key: 'is_in_cover',
    valueKind: 'boolean',
    label: 'In Cover',
    description: 'Whether the soldier is currently considered in cover by sensors.',
    labelRu: 'В укрытии',
    descriptionRu: 'Флаг, что солдат сейчас находится в укрытии по оценке сенсоров.',
    defaultValue: false,
  },
] as const satisfies readonly AiBlackboardSchemaEntry[];

export function createDefaultSoldierBlackboard(): AiBlackboardDefaults {
  return Object.fromEntries(
    SOLDIER_BLACKBOARD_SCHEMA.map((entry) => [entry.key, entry.defaultValue]),
  );
}

export function isGridPositionValue(value: AiBlackboardValue): value is GridPosition {
  return typeof value === 'object'
    && value !== null
    && 'x' in value
    && 'y' in value
    && typeof value.x === 'number'
    && typeof value.y === 'number';
}
