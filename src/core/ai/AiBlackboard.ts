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
