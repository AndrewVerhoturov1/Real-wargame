import type { CombatLabExperimentV1 } from '../../core/testing/combat-lab';
import type { CombatLabParticipantMutationPortV1 } from '../editor/CombatLabParticipantMutationPort';
import {
  getCombatLabQuickParameterDescriptor,
  resolveCombatLabAccuracyBundle,
} from './CombatLabQuickParameterRegistry';
import type {
  CombatLabQuickParameterIdV1,
  CombatLabQuickParameterValuesV1,
} from './CombatLabQuickParameterTypes';

export function applyCombatLabParticipantQuickParameterValues(
  port: CombatLabParticipantMutationPortV1,
  roleId: string,
  values: CombatLabQuickParameterValuesV1,
): CombatLabExperimentV1 {
  return port.update(roleId, (context) => {
    const entries = Object.entries(values) as readonly [CombatLabQuickParameterIdV1, number][];
    if (entries.length === 0) return undefined;
    let nextAccuracy = resolveCombatLabAccuracyBundle(context).accuracy;
    for (const [id, value] of entries) {
      const descriptor = getCombatLabQuickParameterDescriptor(id);
      if (!(descriptor.isAvailable?.(context) ?? true)) continue;
      nextAccuracy = descriptor.writer(nextAccuracy, value);
    }
    if (accuracyEqual(context.role.parameters.accuracy, nextAccuracy)) return undefined;
    return {
      rolePatch: {
        parameters: Object.freeze({ schemaVersion: 1, accuracy: Object.freeze({ ...nextAccuracy }) }),
      },
    };
  });
}

export function clearCombatLabParticipantQuickParameterValues(
  port: CombatLabParticipantMutationPortV1,
  roleId: string,
): CombatLabExperimentV1 {
  return port.update(roleId, (context) => {
    if (context.role.parameters.accuracy === null) return undefined;
    return {
      rolePatch: {
        parameters: Object.freeze({ schemaVersion: 1, accuracy: null }),
      },
    };
  });
}

function accuracyEqual(
  left: ReturnType<typeof resolveCombatLabAccuracyBundle>['accuracy'] | null,
  right: ReturnType<typeof resolveCombatLabAccuracyBundle>['accuracy'],
): boolean {
  if (!left) return false;
  return left.dispersionMultiplier === right.dispersionMultiplier
    && left.aimTimeSeconds === right.aimTimeSeconds
    && (left.physicalAimThreshold ?? 0.5) === (right.physicalAimThreshold ?? 0.5)
    && left.shootingSkill === right.shootingSkill
    && left.weaponProficiency === right.weaponProficiency
    && left.randomnessMultiplier === right.randomnessMultiplier
    && left.randomSeed === right.randomSeed
    && left.usePhysicalAimThreshold === right.usePhysicalAimThreshold;
}
