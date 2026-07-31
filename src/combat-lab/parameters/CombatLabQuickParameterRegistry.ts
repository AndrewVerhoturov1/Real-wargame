import { resolveProductionAimFactors } from '../../core/infantry-combat/runtime';
import type { CombatLabAccuracyOverridesV1 } from '../../core/testing/combat-lab';
import type { CombatLabParticipantEditContextV1 } from '../editor/CombatLabParticipantEditContext';
import {
  COMBAT_LAB_QUICK_PARAMETER_IDS,
  normalizeQuickParameterValue,
  scalarToWeaponProficiency,
  weaponProficiencyToScalar,
  type CombatLabQuickParameterDescriptorV1,
  type CombatLabQuickParameterIdV1,
  type CombatLabQuickParameterResolvedValueV1,
  type CombatLabResolvedAccuracyBundleV1,
} from './CombatLabQuickParameterTypes';

const descriptors: readonly CombatLabQuickParameterDescriptorV1[] = Object.freeze([
  descriptor({
    id: 'accuracy.dispersion_multiplier',
    labelRu: 'Уровень разброса',
    categoryRu: 'Точность',
    descriptionRu: 'Множитель базового разброса оружия. Меньше — кучнее.',
    unitRu: '×',
    minimum: 0.25,
    maximum: 4,
    step: 0.05,
    readValue: (value) => value.dispersionMultiplier,
    writeValue: (value, scalar) => ({ ...value, dispersionMultiplier: scalar }),
    formatValueRu: (value) => `×${value.toFixed(2)}`,
  }),
  descriptor({
    id: 'accuracy.aim_time_seconds',
    labelRu: 'Время прицеливания',
    categoryRu: 'Точность',
    descriptionRu: 'Время, за которое достигается полное качество физического прицеливания.',
    unitRu: 'с',
    minimum: 0.1,
    maximum: 10,
    step: 0.1,
    readValue: (value) => value.aimTimeSeconds,
    writeValue: (value, scalar) => ({ ...value, aimTimeSeconds: scalar }),
    formatValueRu: (value) => `${value.toFixed(1)} с`,
  }),
  descriptor({
    id: 'accuracy.physical_aim_threshold',
    labelRu: 'Порог прицеливания',
    categoryRu: 'Точность',
    descriptionRu: 'Минимальное качество физического прицеливания для разрешения выстрела.',
    unitRu: '%',
    minimum: 0,
    maximum: 100,
    step: 1,
    readValue: (value) => (value.physicalAimThreshold ?? 0.5) * 100,
    writeValue: (value, scalar) => ({ ...value, physicalAimThreshold: scalar / 100 }),
    formatValueRu: (value) => `${Math.round(value)}%`,
  }),
  descriptor({
    id: 'accuracy.shooting_skill',
    labelRu: 'Навык стрельбы',
    categoryRu: 'Точность',
    descriptionRu: 'Индивидуальный навык стрелка, влияющий на производственную модель точности.',
    unitRu: '/ 100',
    minimum: 0,
    maximum: 100,
    step: 1,
    readValue: (value) => value.shootingSkill * 100,
    writeValue: (value, scalar) => ({ ...value, shootingSkill: scalar / 100 }),
    formatValueRu: (value) => `${Math.round(value)} / 100`,
  }),
  descriptor({
    id: 'accuracy.weapon_proficiency',
    labelRu: 'Владение классом оружия',
    categoryRu: 'Точность',
    descriptionRu: 'Уровень подготовки именно для текущего класса оружия.',
    unitRu: 'уровень',
    minimum: 0,
    maximum: 2,
    step: 1,
    readValue: (value) => weaponProficiencyToScalar(value.weaponProficiency),
    writeValue: (value, scalar) => ({ ...value, weaponProficiency: scalarToWeaponProficiency(scalar) }),
    formatValueRu: (value) => proficiencyLabel(value),
  }),
  descriptor({
    id: 'accuracy.randomness_multiplier',
    labelRu: 'Уровень случайности',
    categoryRu: 'Точность',
    descriptionRu: 'Множитель случайной составляющей производственного выстрела.',
    unitRu: '×',
    minimum: 0,
    maximum: 2,
    step: 0.05,
    readValue: (value) => value.randomnessMultiplier,
    writeValue: (value, scalar) => ({ ...value, randomnessMultiplier: scalar }),
    formatValueRu: (value) => `×${value.toFixed(2)}`,
  }),
]);

const descriptorById = new Map<CombatLabQuickParameterIdV1, CombatLabQuickParameterDescriptorV1>(
  descriptors.map((item) => [item.id, item]),
);

export function listCombatLabQuickParameterDescriptors(): readonly CombatLabQuickParameterDescriptorV1[] {
  return descriptors;
}

export function getCombatLabQuickParameterDescriptor(
  id: CombatLabQuickParameterIdV1,
): CombatLabQuickParameterDescriptorV1 {
  const result = descriptorById.get(id);
  if (!result) throw new Error(`Неизвестный быстрый параметр: ${id}`);
  return result;
}

export function isCombatLabQuickParameterId(value: string): value is CombatLabQuickParameterIdV1 {
  return (COMBAT_LAB_QUICK_PARAMETER_IDS as readonly string[]).includes(value);
}

export function listAvailableCombatLabQuickParameterDescriptors(
  context: CombatLabParticipantEditContextV1,
): readonly CombatLabQuickParameterDescriptorV1[] {
  return Object.freeze(descriptors.filter((item) => item.isAvailable?.(context) ?? true));
}

export function resolveCombatLabAccuracyBundle(
  context: CombatLabParticipantEditContextV1,
): CombatLabResolvedAccuracyBundleV1 {
  const production = buildProductionAccuracy(context);
  const experiment = context.experiment.defaults.accuracyOverrides;
  const inheritedAccuracy = experiment ? cloneAccuracy(experiment) : production;
  const inheritedSource = experiment ? 'experiment' as const : 'production' as const;
  const participant = context.role.parameters.accuracy;
  return Object.freeze({
    accuracy: participant ? cloneAccuracy(participant) : inheritedAccuracy,
    effectiveSource: participant ? 'participant' : inheritedSource,
    inheritedAccuracy,
    inheritedSource,
    savedSource: participant ? 'participant' : 'inherited',
  });
}

function descriptor(input: {
  readonly id: CombatLabQuickParameterIdV1;
  readonly labelRu: string;
  readonly categoryRu: string;
  readonly descriptionRu: string;
  readonly unitRu: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
  readonly readValue: (accuracy: CombatLabAccuracyOverridesV1) => number;
  readonly writeValue: (accuracy: CombatLabAccuracyOverridesV1, value: number) => CombatLabAccuracyOverridesV1;
  readonly formatValueRu: (value: number) => string;
}): CombatLabQuickParameterDescriptorV1 {
  const base = {
    id: input.id,
    labelRu: input.labelRu,
    categoryRu: input.categoryRu,
    descriptionRu: input.descriptionRu,
    unitRu: input.unitRu,
    minimum: input.minimum,
    maximum: input.maximum,
    step: input.step,
    isAvailable: hasPrimaryWeapon,
    unavailableReasonRu: () => 'У выбранного бойца нет основного оружия с производственными параметрами точности.',
    reader(context: CombatLabParticipantEditContextV1): CombatLabQuickParameterResolvedValueV1 {
      const resolved = resolveCombatLabAccuracyBundle(context);
      return Object.freeze({
        value: normalizeQuickParameterValue(base, input.readValue(resolved.accuracy)),
        inheritedValue: normalizeQuickParameterValue(base, input.readValue(resolved.inheritedAccuracy)),
        effectiveSource: resolved.effectiveSource,
        inheritedSource: resolved.inheritedSource,
        savedSource: resolved.savedSource,
      });
    },
    writer(accuracy: CombatLabAccuracyOverridesV1, value: number): CombatLabAccuracyOverridesV1 {
      const normalized = normalizeQuickParameterValue(base, value);
      return Object.freeze(input.writeValue(accuracy, normalized));
    },
    formatValueRu: input.formatValueRu,
  } satisfies CombatLabQuickParameterDescriptorV1;
  return Object.freeze(base);
}

function buildProductionAccuracy(context: CombatLabParticipantEditContextV1): CombatLabAccuracyOverridesV1 {
  const weapon = context.unit.infantryCombatRuntime.primaryWeapon;
  const weaponClass = weapon?.resolved.weapon.weaponClass;
  const factors = weapon ? resolveProductionAimFactors(context.state, context.unit, weapon) : null;
  const proficiency = weaponClass
    ? weapon?.operatorProfile.proficiencyByWeaponClass[weaponClass] ?? 'trained'
    : 'trained';
  return Object.freeze({
    schemaVersion: 1,
    dispersionMultiplier: 1,
    aimTimeSeconds: clamp(1 / Math.max(0.001, factors?.aimQualityPerSecond ?? 1 / 1.8), 0.1, 10),
    physicalAimThreshold: 0.5,
    shootingSkill: clamp(weapon?.operatorProfile.shootingSkill ?? 0.5, 0, 1),
    weaponProficiency: proficiency,
    randomnessMultiplier: 1,
    randomSeed: normalizeSeed(context.experiment.defaults.seed),
    usePhysicalAimThreshold: true,
  });
}

function hasPrimaryWeapon(context: CombatLabParticipantEditContextV1): boolean {
  return context.unit.infantryCombatRuntime.primaryWeapon != null;
}

function cloneAccuracy(value: CombatLabAccuracyOverridesV1): CombatLabAccuracyOverridesV1 {
  return Object.freeze({ ...value });
}

function proficiencyLabel(value: number): string {
  const proficiency = scalarToWeaponProficiency(value);
  return proficiency === 'untrained' ? 'Не обучен' : proficiency === 'specialist' ? 'Специалист' : 'Обучен';
}

function normalizeSeed(value: number): number {
  if (!Number.isFinite(value)) return 1;
  const normalized = Math.trunc(value) >>> 0;
  return normalized === 0 ? 1 : normalized;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
