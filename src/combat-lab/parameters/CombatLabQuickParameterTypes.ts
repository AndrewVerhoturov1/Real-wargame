import type { WeaponProficiency } from '../../core/infantry-combat/catalogs/CombatCatalogTypes';
import type {
  CombatLabAccuracyOverridesV1,
  CombatLabAccuracyValueSourceV1,
} from '../../core/testing/combat-lab';
import type { CombatLabParticipantEditContextV1 } from '../editor/CombatLabParticipantEditContext';

export const COMBAT_LAB_QUICK_PARAMETER_IDS = [
  'accuracy.dispersion_multiplier',
  'accuracy.aim_time_seconds',
  'accuracy.physical_aim_threshold',
  'accuracy.shooting_skill',
  'accuracy.weapon_proficiency',
  'accuracy.randomness_multiplier',
] as const;

export type CombatLabQuickParameterIdV1 = (typeof COMBAT_LAB_QUICK_PARAMETER_IDS)[number];
export type CombatLabQuickParameterScalarV1 = number;
export type CombatLabQuickParameterValuesV1 = Readonly<Partial<Record<CombatLabQuickParameterIdV1, number>>>;
export type CombatLabQuickParameterSavedSourceV1 = 'participant' | 'inherited';

export interface CombatLabQuickParameterResolvedValueV1 {
  readonly value: number;
  readonly inheritedValue: number;
  readonly effectiveSource: CombatLabAccuracyValueSourceV1;
  readonly inheritedSource: Exclude<CombatLabAccuracyValueSourceV1, 'participant' | 'step'>;
  readonly savedSource: CombatLabQuickParameterSavedSourceV1;
}

export interface CombatLabQuickParameterDescriptorV1 {
  readonly id: CombatLabQuickParameterIdV1;
  readonly labelRu: string;
  readonly categoryRu: string;
  readonly descriptionRu: string;
  readonly unitRu: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
  readonly reader: (context: CombatLabParticipantEditContextV1) => CombatLabQuickParameterResolvedValueV1;
  readonly writer: (
    accuracy: CombatLabAccuracyOverridesV1,
    value: number,
  ) => CombatLabAccuracyOverridesV1;
  readonly formatValueRu: (value: number) => string;
  readonly isAvailable?: (context: CombatLabParticipantEditContextV1) => boolean;
  readonly unavailableReasonRu?: (context: CombatLabParticipantEditContextV1) => string;
}

export interface CombatLabResolvedAccuracyBundleV1 {
  readonly accuracy: CombatLabAccuracyOverridesV1;
  readonly effectiveSource: Exclude<CombatLabAccuracyValueSourceV1, 'step'>;
  readonly inheritedAccuracy: CombatLabAccuracyOverridesV1;
  readonly inheritedSource: Exclude<CombatLabAccuracyValueSourceV1, 'participant' | 'step'>;
  readonly savedSource: CombatLabQuickParameterSavedSourceV1;
}

export interface CombatLabQuickParameterBufferSnapshotV1 {
  readonly values: CombatLabQuickParameterValuesV1;
  readonly dirtyIds: readonly CombatLabQuickParameterIdV1[];
}

export class CombatLabQuickParameterEditBuffer {
  private readonly saved = new Map<CombatLabQuickParameterIdV1, number>();
  private readonly values = new Map<CombatLabQuickParameterIdV1, number>();

  load(entries: ReadonlyMap<CombatLabQuickParameterIdV1, number>): void {
    this.saved.clear();
    this.values.clear();
    for (const [id, value] of entries) {
      this.saved.set(id, value);
      this.values.set(id, value);
    }
  }

  get(id: CombatLabQuickParameterIdV1): number | null {
    return this.values.get(id) ?? null;
  }

  set(id: CombatLabQuickParameterIdV1, value: number): void {
    this.values.set(id, value);
  }

  reset(id: CombatLabQuickParameterIdV1): void {
    const saved = this.saved.get(id);
    if (saved === undefined) this.values.delete(id);
    else this.values.set(id, saved);
  }

  resetAll(): void {
    this.values.clear();
    for (const [id, value] of this.saved) this.values.set(id, value);
  }

  dirtyIds(): readonly CombatLabQuickParameterIdV1[] {
    return Object.freeze([...this.values].flatMap(([id, value]) => (
      approximatelyEqual(value, this.saved.get(id)) ? [] : [id]
    )));
  }

  dirtyValues(): CombatLabQuickParameterValuesV1 {
    const result: Partial<Record<CombatLabQuickParameterIdV1, number>> = {};
    for (const id of this.dirtyIds()) result[id] = this.values.get(id);
    return Object.freeze(result);
  }

  snapshot(): CombatLabQuickParameterBufferSnapshotV1 {
    const values: Partial<Record<CombatLabQuickParameterIdV1, number>> = {};
    for (const [id, value] of this.values) values[id] = value;
    return Object.freeze({ values: Object.freeze(values), dirtyIds: this.dirtyIds() });
  }
}

export function weaponProficiencyToScalar(value: WeaponProficiency): number {
  return value === 'untrained' ? 0 : value === 'specialist' ? 2 : 1;
}

export function scalarToWeaponProficiency(value: number): WeaponProficiency {
  const rounded = Math.round(value);
  return rounded <= 0 ? 'untrained' : rounded >= 2 ? 'specialist' : 'trained';
}

export function normalizeQuickParameterValue(
  descriptor: Pick<CombatLabQuickParameterDescriptorV1, 'minimum' | 'maximum' | 'step'>,
  value: number,
): number {
  const finite = Number.isFinite(value) ? value : descriptor.minimum;
  const clamped = Math.max(descriptor.minimum, Math.min(descriptor.maximum, finite));
  const decimals = Math.max(0, (String(descriptor.step).split('.')[1] ?? '').length);
  return Number((Math.round(clamped / descriptor.step) * descriptor.step).toFixed(decimals));
}

function approximatelyEqual(left: number, right: number | undefined): boolean {
  return right !== undefined && Math.abs(left - right) <= 1e-9;
}
