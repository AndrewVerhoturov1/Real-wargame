import type { CombatLabAccuracyOverridesV1 } from '../CombatLabContracts';
import type {
  CombatLabExperimentV1,
  CombatLabParticipantParametersV1,
  CombatLabScenarioStepV1,
} from './CombatLabExperimentContracts';

export type CombatLabAccuracyValueSourceV1 = 'production' | 'experiment' | 'participant' | 'step';

export interface CombatLabResolvedParticipantAccuracyV1 {
  readonly source: CombatLabAccuracyValueSourceV1;
  readonly accuracyOverrides: CombatLabAccuracyOverridesV1 | null;
}

export function createDefaultCombatLabParticipantParameters(): CombatLabParticipantParametersV1 {
  return Object.freeze({ schemaVersion: 1, accuracy: null });
}

export function normalizeCombatLabParticipantParameters(value: unknown): CombatLabParticipantParametersV1 {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.accuracy === null || value.accuracy === undefined) {
    return createDefaultCombatLabParticipantParameters();
  }
  if (!isRecord(value.accuracy)) return createDefaultCombatLabParticipantParameters();
  return Object.freeze({
    schemaVersion: 1,
    accuracy: deepFreeze(structuredClone(value.accuracy)) as CombatLabAccuracyOverridesV1,
  });
}

export function updateCombatLabParticipantParameters(
  experiment: CombatLabExperimentV1,
  roleId: string,
  accuracy: CombatLabAccuracyOverridesV1 | null,
): CombatLabExperimentV1 {
  const index = experiment.roles.findIndex((role) => role.roleId === roleId);
  if (index < 0) throw new Error(`Участник «${roleId}» не найден.`);
  const roles = experiment.roles.map((role, roleIndex) => roleIndex === index
    ? Object.freeze({
        ...role,
        parameters: Object.freeze({
          schemaVersion: 1 as const,
          accuracy: accuracy ? deepFreeze(structuredClone(accuracy)) : null,
        }),
      })
    : role);
  return Object.freeze({
    ...experiment,
    revision: experiment.revision + 1,
    roles: Object.freeze(roles),
  });
}

export function resolveCombatLabParticipantAccuracy(
  experiment: CombatLabExperimentV1,
  actorRoleId: string,
  step: Pick<CombatLabScenarioStepV1, 'stepId' | 'accuracyOverrides'>,
): CombatLabResolvedParticipantAccuracyV1 {
  const participant = experiment.roles.find((role) => role.roleId === actorRoleId) ?? null;
  const selected = step.accuracyOverrides
    ? { source: 'step' as const, value: step.accuracyOverrides }
    : participant?.parameters?.accuracy
      ? { source: 'participant' as const, value: participant.parameters.accuracy }
      : experiment.defaults.accuracyOverrides
        ? { source: 'experiment' as const, value: experiment.defaults.accuracyOverrides }
        : null;
  if (!selected) return Object.freeze({ source: 'production', accuracyOverrides: null });
  return Object.freeze({
    source: selected.source,
    accuracyOverrides: Object.freeze({
      ...structuredClone(selected.value),
      randomSeed: deriveCombatLabParticipantStepSeed(
        experiment.defaults.seed,
        actorRoleId,
        step.stepId,
      ),
    }),
  });
}

export function deriveCombatLabParticipantStepSeed(
  runSeed: number,
  roleId: string,
  stepId: string,
): number {
  let value = normalizeSeed(runSeed);
  value = mix(value, stableTextHash(roleId));
  value = mix(value, stableTextHash(stepId));
  return value === 0 ? 1 : value;
}

function stableTextHash(value: string): number {
  let hash = 0x811c_9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x0100_0193) >>> 0;
  }
  return hash >>> 0;
}

function mix(seed: number, salt: number): number {
  let value = (seed ^ salt ^ 0x9e37_79b9) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x85eb_ca6b) >>> 0;
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2_ae35) >>> 0;
  value ^= value >>> 16;
  return value >>> 0;
}

function normalizeSeed(value: number): number {
  if (!Number.isFinite(value)) return 1;
  const normalized = Math.trunc(value) >>> 0;
  return normalized === 0 ? 1 : normalized;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
