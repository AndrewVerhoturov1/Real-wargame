import type { WeaponProficiency } from '../../core/infantry-combat/catalogs/CombatCatalogTypes';
import { resolveProductionAimFactors } from '../../core/infantry-combat/runtime';
import type { SimulationState } from '../../core/simulation/SimulationState';
import type { UnitModel } from '../../core/units/UnitModel';
import type { CombatLabAccuracyOverridesV1 } from '../../core/testing/combat-lab';
import '../combat-lab-accuracy-controls.css';

export interface CombatLabAccuracyCommandValuesV1 {
  readonly minimumSolutionQuality: number;
  readonly minimumPerceptionQuality: number;
  readonly accuracyOverrides: CombatLabAccuracyOverridesV1;
}

interface SliderControlV1 {
  readonly root: HTMLLabelElement;
  readonly range: HTMLInputElement;
  readonly number: HTMLInputElement;
  readonly output: HTMLOutputElement;
  readonly read: () => number;
  readonly write: (value: number) => void;
  readonly refresh: () => void;
}

export class CombatLabAccuracyControls {
  readonly root = element('div', 'combat-lab-accuracy-controls');

  private baseDispersionRadians = 0;
  private readonly dispersion = createSlider('Уровень разброса', 0.25, 4, 0.05, 1, (value) => {
    const mrad = this.baseDispersionRadians * value * 1000;
    const moa = this.baseDispersionRadians * value * (180 / Math.PI) * 60;
    return `×${value.toFixed(2)} · ${mrad.toFixed(2)} mrad · ${moa.toFixed(2)} MOA`;
  }, () => this.changed());
  private readonly aimTime = createSlider('Время прицеливания', 0.1, 10, 0.1, 1.8, (value) => `${value.toFixed(1)} с до 100%`, () => this.changed());
  private readonly aimThreshold = createSlider('Порог прицеливания', 0, 100, 1, 50, (value) => `${value.toFixed(0)}% физического прицеливания`, () => this.changed());
  private readonly shootingSkill = createSlider('Навык стрельбы', 0, 100, 1, 50, (value) => `${value.toFixed(0)} / 100`, () => this.changed());
  private readonly proficiency = createSlider('Владение классом оружия', 0, 100, 1, 50, (value) => `${value.toFixed(0)} / 100 · ${proficiencyLabel(proficiencyFromSlider(value))}`, () => this.changed());
  private readonly perceptionThreshold = createSlider('Порог восприятия', 0, 100, 1, 50, (value) => `${value.toFixed(0)}% качества контакта`, () => this.changed());
  private readonly randomness = createSlider('Уровень случайности', 0, 200, 1, 100, (value) => `${value.toFixed(0)}% · ×${(value / 100).toFixed(2)}`, () => this.changed());

  constructor(
    private readonly onReset: () => void,
    private readonly onChange: () => void,
  ) {
    const heading = element('div', 'combat-lab-accuracy-heading');
    heading.append(
      element('strong', '', 'Лабораторные параметры точности'),
      element('span', '', 'Одна производственная баллистика; меняются только явные test-overrides.'),
    );
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = 'Сбросить параметры';
    reset.addEventListener('click', () => this.onReset());
    this.root.append(
      heading,
      this.dispersion.root,
      this.aimTime.root,
      this.aimThreshold.root,
      this.shootingSkill.root,
      this.proficiency.root,
      this.perceptionThreshold.root,
      this.randomness.root,
      reset,
    );
    this.refreshOutputs();
  }

  resetForUnit(state: Pick<SimulationState, 'map'>, unit: UnitModel | null): void {
    const weapon = unit?.infantryCombatRuntime.primaryWeapon ?? null;
    this.baseDispersionRadians = weapon?.resolved.weapon.baseDispersionRadians ?? 0;
    if (!unit || !weapon) {
      this.dispersion.write(1);
      this.aimTime.write(1.8);
      this.aimThreshold.write(50);
      this.shootingSkill.write(50);
      this.proficiency.write(50);
      this.perceptionThreshold.write(50);
      this.randomness.write(100);
      this.refreshOutputs();
      return;
    }

    const factors = resolveProductionAimFactors(state, unit, weapon);
    const proficiency = weapon.operatorProfile.proficiencyByWeaponClass[weapon.resolved.weapon.weaponClass];
    this.dispersion.write(1);
    this.aimTime.write(clamp(1 / Math.max(0.001, factors.aimQualityPerSecond), 0.1, 10));
    this.aimThreshold.write(50);
    this.shootingSkill.write(weapon.operatorProfile.shootingSkill * 100);
    this.proficiency.write(sliderFromProficiency(proficiency));
    this.perceptionThreshold.write(50);
    this.randomness.write(100);
    this.refreshOutputs();
  }

  read(randomSeed: number): CombatLabAccuracyCommandValuesV1 {
    return {
      minimumSolutionQuality: clamp(this.aimThreshold.read() / 100, 0, 1),
      minimumPerceptionQuality: clamp(this.perceptionThreshold.read() / 100, 0, 1),
      accuracyOverrides: {
        schemaVersion: 1,
        dispersionMultiplier: clamp(this.dispersion.read(), 0.25, 4),
        aimTimeSeconds: clamp(this.aimTime.read(), 0.1, 10),
        shootingSkill: clamp(this.shootingSkill.read() / 100, 0, 1),
        weaponProficiency: proficiencyFromSlider(this.proficiency.read()),
        randomnessMultiplier: clamp(this.randomness.read() / 100, 0, 2),
        randomSeed: normalizeSeed(randomSeed),
        usePhysicalAimThreshold: true,
      },
    };
  }

  diagnostics(randomSeed: number): Record<string, unknown> {
    const values = this.read(randomSeed);
    return {
      dispersionMultiplier: values.accuracyOverrides.dispersionMultiplier,
      baseWeaponDispersionRadians: this.baseDispersionRadians,
      selectedBaseDispersionRadians: this.baseDispersionRadians * values.accuracyOverrides.dispersionMultiplier,
      aimTimeSeconds: values.accuracyOverrides.aimTimeSeconds,
      physicalAimThreshold: values.minimumSolutionQuality,
      shootingSkill: values.accuracyOverrides.shootingSkill,
      weaponProficiency: values.accuracyOverrides.weaponProficiency,
      perceptionThreshold: values.minimumPerceptionQuality,
      randomnessMultiplier: values.accuracyOverrides.randomnessMultiplier,
      randomSeed: values.accuracyOverrides.randomSeed,
    };
  }

  private changed(): void {
    this.refreshOutputs();
    this.onChange();
  }

  private refreshOutputs(): void {
    for (const control of [
      this.dispersion,
      this.aimTime,
      this.aimThreshold,
      this.shootingSkill,
      this.proficiency,
      this.perceptionThreshold,
      this.randomness,
    ]) control.refresh();
  }
}

function createSlider(
  labelText: string,
  min: number,
  max: number,
  step: number,
  initialValue: number,
  format: (value: number) => string,
  changed: () => void,
): SliderControlV1 {
  const root = document.createElement('label');
  root.className = 'combat-lab-slider';
  const label = element('span', 'combat-lab-slider-label', labelText);
  const controls = element('div', 'combat-lab-slider-controls');
  const range = document.createElement('input');
  range.type = 'range';
  range.min = String(min);
  range.max = String(max);
  range.step = String(step);
  const number = document.createElement('input');
  number.type = 'number';
  number.min = String(min);
  number.max = String(max);
  number.step = String(step);
  const output = document.createElement('output');
  output.className = 'combat-lab-slider-output';

  const write = (rawValue: number): void => {
    const value = clamp(Number.isFinite(rawValue) ? rawValue : initialValue, min, max);
    const serialized = String(roundToStep(value, step));
    range.value = serialized;
    number.value = serialized;
  };
  const read = (): number => clamp(finite(number.value, initialValue), min, max);
  const refresh = (): void => { output.textContent = format(read()); };
  const syncFrom = (source: HTMLInputElement, target: HTMLInputElement): void => {
    const value = clamp(finite(source.value, initialValue), min, max);
    source.value = String(roundToStep(value, step));
    target.value = source.value;
    refresh();
    changed();
  };

  range.addEventListener('input', () => syncFrom(range, number));
  number.addEventListener('input', () => syncFrom(number, range));
  write(initialValue);
  controls.append(range, number);
  root.append(label, controls, output);
  return { root, range, number, output, read, write, refresh };
}

function proficiencyFromSlider(value: number): WeaponProficiency {
  if (value < 33) return 'untrained';
  if (value < 75) return 'trained';
  return 'specialist';
}

function sliderFromProficiency(value: WeaponProficiency): number {
  return value === 'untrained' ? 0 : value === 'specialist' ? 100 : 50;
}

function proficiencyLabel(value: WeaponProficiency): string {
  return value === 'untrained' ? 'не обучен' : value === 'specialist' ? 'специалист' : 'обучен';
}

function normalizeSeed(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 0xffff_ffff) return 1;
  return value;
}

function roundToStep(value: number, step: number): number {
  const decimals = Math.max(0, (String(step).split('.')[1] ?? '').length);
  return Number((Math.round(value / step) * step).toFixed(decimals));
}

function finite(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  result.className = className;
  result.textContent = text;
  return result;
}
