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
  readonly minimum?: number;
  readonly maximum?: number;
  readonly integer?: boolean;
}

export type AiBlackboardDefaults = Record<string, AiBlackboardValue>;

export type AiBlackboardNormalizedValue =
  | { readonly state: 'missing' }
  | { readonly state: 'value'; readonly value: AiBlackboardValue };

export const SOLDIER_BLACKBOARD_SCHEMA = [
  {
    key: 'danger',
    valueKind: 'number',
    label: 'Danger',
    description: 'Current danger score for the soldier from 0 to 100.',
    labelRu: 'Опасность',
    descriptionRu: 'Текущая оценка опасности для солдата от 0 до 100.',
    defaultValue: 0,
    minimum: 0,
    maximum: 100,
  },
  {
    key: 'stress',
    valueKind: 'number',
    label: 'Stress',
    description: 'Current stress score for the soldier from 0 to 100.',
    labelRu: 'Стресс',
    descriptionRu: 'Текущий стресс солдата от 0 до 100.',
    defaultValue: 0,
    minimum: 0,
    maximum: 100,
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
    descriptionRu: 'Предполагаемая позиция самого сильного контакта.',
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
    minimum: 0,
    integer: true,
  },
  {
    key: 'player_order_preset',
    valueKind: 'string',
    label: 'Player Order Preset',
    description: 'Normalized tactical order preset stored in the player command.',
    labelRu: 'Пресет приказа игрока',
    descriptionRu: 'Нормализованный пресет тактического приказа в PlayerCommand.',
    defaultValue: 'move',
  },
  {
    key: 'player_order_navigation_profile',
    valueKind: 'string',
    label: 'Player Order Navigation Profile',
    description: 'Navigation profile snapshot requested by the tactical order.',
    labelRu: 'Профиль маршрута приказа',
    descriptionRu: 'Снимок профиля маршрута, заданный тактическим приказом.',
    defaultValue: 'normal',
  },
  {
    key: 'player_order_movement_profile',
    valueKind: 'string',
    label: 'Player Order Movement Profile',
    description: 'Physical movement profile requested by the immutable tactical order.',
    labelRu: 'Профиль физического движения приказа',
    descriptionRu: 'Физический профиль движения из неизменяемого тактического приказа.',
    defaultValue: 'normal',
  },
  {
    key: 'player_order_attention_policy',
    valueKind: 'string',
    label: 'Player Order Attention Policy',
    description: 'Attention policy requested by the tactical order.',
    labelRu: 'Политика внимания приказа',
    descriptionRu: 'Политика внимания, заданная тактическим приказом.',
    defaultValue: 'automatic',
  },
  {
    key: 'player_order_contact_policy',
    valueKind: 'string',
    label: 'Player Order Contact Policy',
    description: 'How the unit should treat ordinary contact while pursuing the order.',
    labelRu: 'Реакция приказа на контакт',
    descriptionRu: 'Как боец должен реагировать на обычный контакт при выполнении приказа.',
    defaultValue: 'continue_if_possible',
  },
  {
    key: 'player_order_fire_policy',
    valueKind: 'string',
    label: 'Player Order Fire Policy',
    description: 'Fire policy requested by the tactical order.',
    labelRu: 'Политика огня приказа',
    descriptionRu: 'Политика огня, заданная тактическим приказом.',
    defaultValue: 'self_defense',
  },
  {
    key: 'player_order_resume_after_interruption',
    valueKind: 'boolean',
    label: 'Resume Player Order',
    description: 'Whether execution should resume after a temporary interruption.',
    labelRu: 'Возобновить приказ',
    descriptionRu: 'Нужно ли возобновлять выполнение после временного прерывания.',
    defaultValue: true,
  },
  {
    key: 'requested_movement_profile_id',
    valueKind: 'string',
    label: 'Requested Movement Profile',
    description: 'Physical movement profile requested by the current order, role or default.',
    labelRu: 'Запрошенный профиль движения',
    descriptionRu: 'Физический профиль, запрошенный текущим приказом, ролью бойца или значением по умолчанию.',
    defaultValue: 'normal',
  },
  {
    key: 'active_movement_profile_id',
    valueKind: 'string',
    label: 'Active Movement Profile',
    description: 'Resolved physical movement profile after source priority and safety fallback.',
    labelRu: 'Активный профиль движения',
    descriptionRu: 'Итоговый физический профиль после приоритета источников и ограничений безопасности.',
    defaultValue: 'normal',
  },
  {
    key: 'active_movement_profile_source',
    valueKind: 'string',
    label: 'Movement Profile Source',
    description: 'Source that currently owns the resolved physical movement profile.',
    labelRu: 'Источник профиля движения',
    descriptionRu: 'Источник, который сейчас определяет итоговый физический профиль движения.',
    defaultValue: 'default',
  },
  {
    key: 'active_movement_gait',
    valueKind: 'string',
    label: 'Active Movement Gait',
    description: 'Actual gait reported by the physical movement runtime.',
    labelRu: 'Фактический способ движения',
    descriptionRu: 'Фактическая походка или способ движения, опубликованный физическим runtime.',
    defaultValue: 'unknown',
  },
  {
    key: 'movement_speed',
    valueKind: 'number',
    label: 'Movement Speed',
    description: 'Actual movement speed reported by the physical movement runtime.',
    labelRu: 'Скорость движения',
    descriptionRu: 'Фактическая скорость, опубликованная физическим runtime.',
    defaultValue: null,
    minimum: 0,
  },
  {
    key: 'movement_stamina',
    valueKind: 'number',
    label: 'Movement Stamina',
    description: 'Current movement stamina reported by the physical movement runtime.',
    labelRu: 'Выносливость движения',
    descriptionRu: 'Текущая выносливость, опубликованная физическим runtime.',
    defaultValue: null,
    minimum: 0,
    maximum: 100,
  },
  {
    key: 'movement_noise',
    valueKind: 'number',
    label: 'Movement Noise',
    description: 'Current movement noise reported by the physical movement runtime.',
    labelRu: 'Шум движения',
    descriptionRu: 'Текущий шум, опубликованный физическим runtime.',
    defaultValue: null,
    minimum: 0,
  },
  {
    key: 'movement_visual_signature',
    valueKind: 'number',
    label: 'Movement Visual Signature',
    description: 'Current visual signature reported by the physical movement runtime.',
    labelRu: 'Визуальная заметность движения',
    descriptionRu: 'Текущая визуальная заметность, опубликованная физическим runtime.',
    defaultValue: null,
    minimum: 0,
  },
  {
    key: 'movement_can_fire',
    valueKind: 'boolean',
    label: 'Can Fire While Moving',
    description: 'Whether the physical movement runtime currently permits firing.',
    labelRu: 'Можно стрелять в движении',
    descriptionRu: 'Разрешает ли текущий физический режим движения вести огонь.',
    defaultValue: null,
  },
  {
    key: 'movement_forced_fallback',
    valueKind: 'boolean',
    label: 'Movement Fallback Active',
    description: 'Whether the requested profile was replaced by an explicit safe fallback.',
    labelRu: 'Включена замена профиля движения',
    descriptionRu: 'Был ли запрошенный профиль явно заменён безопасным fallback.',
    defaultValue: false,
  },
  {
    key: 'movement_forced_reason',
    valueKind: 'string',
    label: 'Movement Fallback Reason',
    description: 'Reason for the current safety restriction or registry fallback.',
    labelRu: 'Причина ограничения движения',
    descriptionRu: 'Причина текущего ограничения безопасности или fallback реестра.',
    defaultValue: '',
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

const SOLDIER_BLACKBOARD_SCHEMA_BY_KEY = new Map<string, AiBlackboardSchemaEntry>(
  SOLDIER_BLACKBOARD_SCHEMA.map((entry) => [entry.key, entry]),
);

export function createDefaultSoldierBlackboard(): AiBlackboardDefaults {
  return Object.fromEntries(
    SOLDIER_BLACKBOARD_SCHEMA.map((entry) => [entry.key, cloneBlackboardValue(entry.defaultValue)]),
  );
}

export function getSoldierBlackboardSchemaEntry(key: string): AiBlackboardSchemaEntry | undefined {
  return SOLDIER_BLACKBOARD_SCHEMA_BY_KEY.get(key);
}

export function normalizeAiBlackboardValue(
  key: string,
  value: unknown,
  present = true,
): AiBlackboardNormalizedValue {
  if (!present) return { state: 'missing' };
  if (value === null) return { state: 'value', value: null };

  const schema = getSoldierBlackboardSchemaEntry(key);
  if (schema?.valueKind === 'number') {
    if (!isFiniteNumber(value)) return { state: 'missing' };
    let normalized = value;
    if (schema.minimum !== undefined) normalized = Math.max(schema.minimum, normalized);
    if (schema.maximum !== undefined) normalized = Math.min(schema.maximum, normalized);
    if (schema.integer) normalized = Math.round(normalized);
    return { state: 'value', value: normalized };
  }
  if (schema?.valueKind === 'boolean') {
    return typeof value === 'boolean'
      ? { state: 'value', value }
      : { state: 'missing' };
  }
  if (schema && ['position', 'nullablePosition'].includes(schema.valueKind)) {
    return isGridPositionValue(value)
      ? { state: 'value', value: { x: value.x, y: value.y } }
      : { state: 'missing' };
  }
  if (schema && ['string', 'unitId', 'nullableUnitId', 'action'].includes(schema.valueKind)) {
    return typeof value === 'string'
      ? { state: 'value', value }
      : { state: 'missing' };
  }

  if (typeof value === 'string' || typeof value === 'boolean') return { state: 'value', value };
  if (isFiniteNumber(value)) return { state: 'value', value };
  if (isGridPositionValue(value)) return { state: 'value', value: { x: value.x, y: value.y } };
  return { state: 'missing' };
}

export function isGridPositionValue(value: unknown): value is GridPosition {
  return typeof value === 'object'
    && value !== null
    && 'x' in value
    && 'y' in value
    && typeof value.x === 'number'
    && Number.isFinite(value.x)
    && typeof value.y === 'number'
    && Number.isFinite(value.y);
}

function cloneBlackboardValue(value: AiBlackboardValue): AiBlackboardValue {
  return isGridPositionValue(value) ? { ...value } : value;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
