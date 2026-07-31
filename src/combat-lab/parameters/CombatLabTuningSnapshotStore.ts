import type {
  CombatLabExperimentV1,
  CombatLabScenarioRuntimeSnapshotV1,
} from '../../core/testing/combat-lab';
import type { CombatLabVisualSnapshotV1 } from '../runtime/CombatLabVisualSession';
import type {
  CombatLabQuickParameterIdV1,
  CombatLabQuickParameterValuesV1,
} from './CombatLabQuickParameterTypes';

export type CombatLabTuningSnapshotSlotV1 = 'A' | 'B';

export interface CombatLabTuningSnapshotV1 {
  readonly schemaVersion: 1;
  readonly experimentId: string;
  readonly experimentRevision: number;
  readonly roleId: string;
  readonly roleStructureSignature: string;
  readonly participantParameterValues: CombatLabQuickParameterValuesV1;
  readonly seed: number;
  readonly visualMetrics: Readonly<Record<string, number>>;
  readonly finalDigest: string | null;
  readonly stopReasonRu: string | null;
  readonly timestampMs: number;
}

export interface CombatLabTuningSnapshotCaptureV1 {
  readonly experiment: CombatLabExperimentV1;
  readonly roleId: string;
  readonly participantParameterValues: CombatLabQuickParameterValuesV1;
  readonly runtimeSnapshot: CombatLabScenarioRuntimeSnapshotV1 | null;
  readonly visualSnapshot: CombatLabVisualSnapshotV1 | null;
  readonly timestampMs?: number;
}

export interface CombatLabTuningComparisonRowV1 {
  readonly id: string;
  readonly valueA: number | null;
  readonly valueB: number | null;
  readonly delta: number | null;
}

export interface CombatLabTuningComparisonV1 {
  readonly snapshotA: CombatLabTuningSnapshotV1;
  readonly snapshotB: CombatLabTuningSnapshotV1;
  readonly valueRows: readonly CombatLabTuningComparisonRowV1[];
  readonly metricRows: readonly CombatLabTuningComparisonRowV1[];
  readonly differentSeeds: boolean;
  readonly invalidReasonRu: string | null;
}

export class CombatLabTuningSnapshotStore {
  private snapshotA: CombatLabTuningSnapshotV1 | null = null;
  private snapshotB: CombatLabTuningSnapshotV1 | null = null;

  save(slot: CombatLabTuningSnapshotSlotV1, input: CombatLabTuningSnapshotCaptureV1): CombatLabTuningSnapshotV1 {
    const visual = input.visualSnapshot;
    const snapshot = Object.freeze({
      schemaVersion: 1 as const,
      experimentId: input.experiment.experimentId,
      experimentRevision: input.experiment.revision,
      roleId: input.roleId,
      roleStructureSignature: buildCombatLabRoleStructureSignature(input.experiment),
      participantParameterValues: freezeValues(input.participantParameterValues),
      seed: normalizeSeed(visual?.seed ?? input.experiment.defaults.seed),
      visualMetrics: Object.freeze({ ...(visual?.metrics ?? {}) }),
      finalDigest: visual?.finalStateDigest ?? null,
      stopReasonRu: input.runtimeSnapshot?.stopReasonRu ?? null,
      timestampMs: input.timestampMs ?? Date.now(),
    });
    if (slot === 'A') this.snapshotA = snapshot;
    else this.snapshotB = snapshot;
    return snapshot;
  }

  get(slot: CombatLabTuningSnapshotSlotV1): CombatLabTuningSnapshotV1 | null {
    return slot === 'A' ? this.snapshotA : this.snapshotB;
  }

  clear(slot?: CombatLabTuningSnapshotSlotV1): void {
    if (slot === undefined || slot === 'A') this.snapshotA = null;
    if (slot === undefined || slot === 'B') this.snapshotB = null;
  }

  compare(experiment: CombatLabExperimentV1, roleId: string): CombatLabTuningComparisonV1 | null {
    const snapshotA = this.snapshotA;
    const snapshotB = this.snapshotB;
    if (!snapshotA || !snapshotB) return null;
    const invalidReasonRu = validatePair(snapshotA, snapshotB, experiment, roleId);
    return Object.freeze({
      snapshotA,
      snapshotB,
      valueRows: compareRecords(snapshotA.participantParameterValues, snapshotB.participantParameterValues),
      metricRows: compareRecords(snapshotA.visualMetrics, snapshotB.visualMetrics),
      differentSeeds: snapshotA.seed !== snapshotB.seed,
      invalidReasonRu,
    });
  }
}

export function buildCombatLabRoleStructureSignature(experiment: CombatLabExperimentV1): string {
  return experiment.roles
    .map((role) => `${role.roleId}\u0000${role.unitId}`)
    .sort()
    .join('\u0001');
}

function validatePair(
  snapshotA: CombatLabTuningSnapshotV1,
  snapshotB: CombatLabTuningSnapshotV1,
  experiment: CombatLabExperimentV1,
  roleId: string,
): string | null {
  if (snapshotA.experimentId !== snapshotB.experimentId || snapshotA.experimentId !== experiment.experimentId) {
    return 'Снимки относятся к разным экспериментам.';
  }
  if (snapshotA.roleId !== snapshotB.roleId || snapshotA.roleId !== roleId) {
    return 'Снимки относятся к разным бойцам.';
  }
  const signature = buildCombatLabRoleStructureSignature(experiment);
  if (snapshotA.roleStructureSignature !== signature || snapshotB.roleStructureSignature !== signature) {
    return 'Состав ролей изменился после сохранения снимка; сравнение недействительно.';
  }
  return null;
}

function compareRecords(
  left: Readonly<Record<string, number | undefined>>,
  right: Readonly<Record<string, number | undefined>>,
): readonly CombatLabTuningComparisonRowV1[] {
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  return Object.freeze(keys.map((id) => {
    const valueA = finiteOrNull(left[id]);
    const valueB = finiteOrNull(right[id]);
    return Object.freeze({
      id,
      valueA,
      valueB,
      delta: valueA === null || valueB === null ? null : valueB - valueA,
    });
  }));
}

function freezeValues(values: CombatLabQuickParameterValuesV1): CombatLabQuickParameterValuesV1 {
  const result: Partial<Record<CombatLabQuickParameterIdV1, number>> = {};
  for (const [id, value] of Object.entries(values) as readonly [CombatLabQuickParameterIdV1, number][]) {
    if (Number.isFinite(value)) result[id] = value;
  }
  return Object.freeze(result);
}

function finiteOrNull(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeSeed(value: number): number {
  if (!Number.isFinite(value)) return 1;
  const normalized = Math.trunc(value) >>> 0;
  return normalized === 0 ? 1 : normalized;
}
