import type { GridPosition } from '../geometry';

export type AiBlackboardPrimitive = string | number | boolean | null;
export type AiBlackboardValue = AiBlackboardPrimitive | GridPosition;
export type AiBlackboardValueKind = 'string' | 'number' | 'boolean' | 'unitId' | 'action' | 'position' | 'nullableUnitId' | 'nullablePosition';

export interface AiBlackboardSchemaEntry {
  readonly key: string;
  readonly valueKind: AiBlackboardValueKind;
  readonly labelRu: string;
  readonly descriptionRu: string;
  readonly defaultValue: AiBlackboardValue;
}

export type AiBlackboardDefaults = Record<string, AiBlackboardValue>;

export const SOLDIER_BLACKBOARD_SCHEMA = [
  {
    key: 'danger',
    valueKind: 'number',
    labelRu: 'Опасность',
    descriptionRu: 'Текущая оценка опасности для солдата от 0 до 100.',
    defaultValue: 0,
  },
  {
    key: 'stress',
    valueKind: 'number',
    labelRu: 'Стресс',
    descriptionRu: 'Текущий стресс солдата от 0 до 100.',
    defaultValue: 0,
  },
  {
    key: 'visible_enemy_id',
    valueKind: 'nullableUnitId',
    labelRu: 'Видимый враг',
    descriptionRu: 'Id врага, которого солдат прямо видит сейчас.',
    defaultValue: null,
  },
  {
    key: 'known_enemy_position',
    valueKind: 'nullablePosition',
    labelRu: 'Известная позиция врага',
    descriptionRu: 'Последняя известная или предполагаемая позиция врага в личной памяти солдата.',
    defaultValue: null,
  },
  {
    key: 'best_cover_position',
    valueKind: 'nullablePosition',
    labelRu: 'Лучшая точка укрытия',
    descriptionRu: 'Точка укрытия, выбранная локальным движком через tactical query.',
    defaultValue: null,
  },
  {
    key: 'current_action',
    valueKind: 'action',
    labelRu: 'Текущее действие',
    descriptionRu: 'Последнее выбранное действие для инерции решений.',
    defaultValue: 'observe',
  },
  {
    key: 'is_in_cover',
    valueKind: 'boolean',
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
