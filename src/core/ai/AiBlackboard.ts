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
