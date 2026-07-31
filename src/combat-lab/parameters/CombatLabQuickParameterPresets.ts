import type { CombatLabParticipantEditContextV1 } from '../editor/CombatLabParticipantEditContext';
import { getCombatLabQuickParameterDescriptor } from './CombatLabQuickParameterRegistry';
import type { CombatLabQuickParameterIdV1 } from './CombatLabQuickParameterTypes';

export type CombatLabQuickParameterPresetIdV1 =
  | 'accuracy'
  | 'perception'
  | 'movement'
  | 'survivability'
  | 'machine_gun';

export interface CombatLabQuickParameterPresetV1 {
  readonly presetId: CombatLabQuickParameterPresetIdV1;
  readonly labelRu: string;
  readonly descriptionRu: string;
  readonly descriptorIds: readonly CombatLabQuickParameterIdV1[];
  readonly isAvailable: (context: CombatLabParticipantEditContextV1) => boolean;
  readonly unavailableReasonRu: string;
}

const ACCURACY_IDS = Object.freeze([
  'accuracy.dispersion_multiplier',
  'accuracy.aim_time_seconds',
  'accuracy.physical_aim_threshold',
  'accuracy.shooting_skill',
  'accuracy.weapon_proficiency',
  'accuracy.randomness_multiplier',
] satisfies readonly CombatLabQuickParameterIdV1[]);

const presets: readonly CombatLabQuickParameterPresetV1[] = Object.freeze([
  preset(
    'accuracy',
    'Точность',
    'Все канонические параметры точности выбранного стрелка.',
    ACCURACY_IDS,
    (context) => ACCURACY_IDS.some((id) => isDescriptorAvailable(id, context)),
    'У выбранного бойца нет оружия с настраиваемой производственной точностью.',
  ),
  preset(
    'perception',
    'Восприятие',
    'Параметры восприятия появятся здесь после появления постоянного источника данных у бойца.',
    [],
    () => false,
    'Порог восприятия сейчас хранится в действии программы, а не в параметрах бойца.',
  ),
  preset(
    'movement',
    'Движение',
    'Параметры движения появятся после появления канонических сохраняемых настроек физподготовки.',
    [],
    () => false,
    'В текущем контракте эксперимента нет постоянных параметров движения бойца.',
  ),
  preset(
    'survivability',
    'Выживаемость',
    'Параметры выживаемости появятся после появления канонических сохраняемых настроек бойца.',
    [],
    () => false,
    'Здоровье задаётся начальным состоянием сцены, а не быстрым числовым параметром бойца.',
  ),
  preset(
    'machine_gun',
    'Пулемёт',
    'Быстрый набор точности и владения оружием для пулемётчика.',
    ACCURACY_IDS,
    (context) => context.unit.infantryCombatRuntime.primaryWeapon?.resolved.weapon.weaponClass === 'machine_gun',
    'Набор доступен только бойцу с основным оружием класса «пулемёт».',
  ),
]);

export function listCombatLabQuickParameterPresets(): readonly CombatLabQuickParameterPresetV1[] {
  return presets;
}

export function getCombatLabQuickParameterPreset(
  presetId: CombatLabQuickParameterPresetIdV1,
): CombatLabQuickParameterPresetV1 {
  const result = presets.find((item) => item.presetId === presetId);
  if (!result) throw new Error(`Неизвестный набор быстрых параметров: ${presetId}`);
  return result;
}

export function resolveCombatLabQuickParameterPresetIds(
  presetId: CombatLabQuickParameterPresetIdV1,
  context: CombatLabParticipantEditContextV1,
): readonly CombatLabQuickParameterIdV1[] {
  const selected = getCombatLabQuickParameterPreset(presetId);
  if (!selected.isAvailable(context)) return Object.freeze([]);
  return Object.freeze(selected.descriptorIds.filter((id) => isDescriptorAvailable(id, context)));
}

function preset(
  presetId: CombatLabQuickParameterPresetIdV1,
  labelRu: string,
  descriptionRu: string,
  descriptorIds: readonly CombatLabQuickParameterIdV1[],
  isAvailable: (context: CombatLabParticipantEditContextV1) => boolean,
  unavailableReasonRu: string,
): CombatLabQuickParameterPresetV1 {
  return Object.freeze({
    presetId,
    labelRu,
    descriptionRu,
    descriptorIds: Object.freeze([...descriptorIds]),
    isAvailable,
    unavailableReasonRu,
  });
}

function isDescriptorAvailable(
  id: CombatLabQuickParameterIdV1,
  context: CombatLabParticipantEditContextV1,
): boolean {
  const descriptor = getCombatLabQuickParameterDescriptor(id);
  return descriptor.isAvailable?.(context) ?? true;
}
