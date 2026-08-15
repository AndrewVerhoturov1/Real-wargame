import {
  digestCombatLabExperiment,
  type CombatLabCommandResultV1,
  type CombatLabExperimentV1,
  type CombatLabScenarioRuntimeSnapshotV1,
  type CombatLabStepRuntimeSnapshotV1,
} from '../../core/testing/combat-lab';

export const COMBAT_LAB_EXPERIMENT_JOURNAL_LIMIT = 256;

export type CombatLabExperimentVisualStatusV1 =
  | 'ready'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'stopped';

export type CombatLabExperimentJournalKindV1 =
  | 'step_started'
  | 'command_accepted'
  | 'command_rejected'
  | 'step_completed'
  | 'step_retry'
  | 'step_skipped'
  | 'step_failed'
  | 'experiment_completed'
  | 'experiment_failed'
  | 'experiment_stopped'
  | 'breakpoint_reached';

export interface CombatLabRunIdentityV1 {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly experimentId: string;
  readonly experimentRevision: number;
  readonly sourceDigest: string;
  readonly seed: number;
}

export interface CombatLabProgramStepRefV1 {
  readonly experimentId: string;
  readonly experimentRevision: number;
  readonly trackId: string;
  readonly stepId: string;
}

export interface CombatLabExperimentJournalEntryV1 {
  readonly runId: string;
  readonly eventId: string;
  readonly sequence: number;
  readonly simulatedSeconds: number;
  readonly kind: CombatLabExperimentJournalKindV1;
  readonly messageRu: string;
  readonly programStepRef: CombatLabProgramStepRefV1 | null;
  readonly trackId: string | null;
  readonly stepId: string | null;
  readonly attempt: number;
}

export interface CombatLabRepresentativeReplayContextV1 {
  readonly runIndex: number;
  readonly stopReason: string;
}

export interface CombatLabExperimentVisualRuntimeSnapshotV1 extends CombatLabScenarioRuntimeSnapshotV1 {
  readonly experimentTitleRu: string;
  readonly seed: number;
  readonly runIdentity: CombatLabRunIdentityV1;
  readonly visualRevision: number;
  readonly visualStatus: CombatLabExperimentVisualStatusV1;
  readonly speed: number;
  readonly activeStepTitleRu: string | null;
  readonly activeTrackId: string | null;
  readonly activeStepId: string | null;
  readonly attemptCount: number;
  readonly failureReasonRu: string | null;
  readonly successConditionStatus: 'pending' | 'satisfied' | 'failed';
  readonly representativeRunIndex: number | null;
  readonly representativeStopReason: string | null;
  readonly journal: readonly CombatLabExperimentJournalEntryV1[];
}

export function createCombatLabRunIdentity(
  experiment: CombatLabExperimentV1,
  seed: number,
  runId: string = createCombatLabRunId(),
): CombatLabRunIdentityV1 {
  const normalizedRunId = runId.trim();
  if (!normalizedRunId) throw new Error('Combat Lab runId must be a non-empty string.');
  if (!Number.isInteger(seed) || seed < 1 || seed > 0xffff_ffff) {
    throw new Error('Combat Lab run seed must be an integer in 1..4294967295.');
  }
  return Object.freeze({
    schemaVersion: 1,
    runId: normalizedRunId,
    experimentId: experiment.experimentId,
    experimentRevision: experiment.revision,
    sourceDigest: digestCombatLabExperiment(experiment),
    seed,
  });
}

export function createCombatLabRunId(): string {
  const cryptoOwner = globalThis.crypto;
  const uuid = cryptoOwner?.randomUUID?.();
  if (uuid) return `combat-lab-run:${uuid}`;
  if (!cryptoOwner?.getRandomValues) {
    throw new Error('Secure randomness is required to create a Combat Lab runId.');
  }
  const bytes = new Uint8Array(16);
  cryptoOwner.getRandomValues(bytes);
  const token = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `combat-lab-run:${token}`;
}

export class CombatLabExperimentRunJournal {
  private readonly entries: CombatLabExperimentJournalEntryV1[] = [];
  private sequence = 0;

  constructor(private readonly runIdentity: CombatLabRunIdentityV1) {}

  clear(): void {
    this.entries.length = 0;
    this.sequence = 0;
  }

  recordTransitions(
    experiment: CombatLabExperimentV1,
    previous: CombatLabScenarioRuntimeSnapshotV1,
    next: CombatLabScenarioRuntimeSnapshotV1,
    commandResults: readonly CombatLabCommandResultV1[] = [],
  ): readonly CombatLabExperimentJournalEntryV1[] {
    assertRunExperiment(this.runIdentity, experiment);
    const appended: CombatLabExperimentJournalEntryV1[] = [];
    const previousByKey = new Map<string, CombatLabStepRuntimeSnapshotV1>(
      previous.steps.map((step) => [stepKey(step), step] as const),
    );

    for (const step of next.steps) {
      const before = previousByKey.get(stepKey(step));
      if (!before || sameRuntimeStep(before, step)) continue;
      const title = stepTitle(experiment, step);
      if (step.state === 'paused_at_breakpoint' && before.state !== 'paused_at_breakpoint') {
        appended.push(this.append(next.simulatedSeconds, 'breakpoint_reached', `Breakpoint перед шагом «${title}».`, step));
      } else if (step.state === 'running' && before.state !== 'running') {
        appended.push(this.append(next.simulatedSeconds, 'step_started', `Начат шаг «${title}», попытка ${step.attempt}.`, step));
      } else if (step.state === 'completed' && before.state !== 'completed') {
        appended.push(this.append(next.simulatedSeconds, 'step_completed', `Шаг «${title}» завершён.`, step));
      } else if (step.state === 'skipped' && before.state !== 'skipped') {
        appended.push(this.append(next.simulatedSeconds, 'step_skipped', `Шаг «${title}» пропущен: ${step.reasonRu ?? 'без уточнения'}.`, step));
      } else if (step.state === 'failed' && before.state !== 'failed') {
        appended.push(this.append(next.simulatedSeconds, 'step_failed', `Шаг «${title}» завершился ошибкой: ${step.reasonRu ?? 'без уточнения'}.`, step));
      } else if (
        step.state === 'waiting'
        && before.state !== 'waiting'
        && step.attempt > 0
        && step.nextRetrySeconds !== null
      ) {
        appended.push(this.append(next.simulatedSeconds, 'step_retry', `Шаг «${title}» ожидает повтор, следующая попытка ${step.attempt + 1}.`, step));
      }
    }

    for (const result of commandResults) {
      const step = result.ownerToken
        ? next.steps.find((candidate) => candidate.ownerToken === result.ownerToken) ?? null
        : activeStep(next);
      const title = step ? stepTitle(experiment, step) : 'текущий шаг';
      const kind = result.accepted ? 'command_accepted' : 'command_rejected';
      const message = result.accepted
        ? `Команда шага «${title}» принята: ${result.reasonRu}`
        : `Команда шага «${title}» отклонена: ${result.reasonRu}`;
      appended.push(this.append(next.simulatedSeconds, kind, message, step));
    }

    if (previous.status !== next.status) {
      if (next.status === 'completed') {
        appended.push(this.append(next.simulatedSeconds, 'experiment_completed', 'Эксперимент завершён.', null));
      } else if (next.status === 'failed') {
        appended.push(this.append(next.simulatedSeconds, 'experiment_failed', `Эксперимент завершился ошибкой: ${next.stopReasonRu ?? 'без уточнения'}.`, null));
      } else if (next.status === 'stopped') {
        appended.push(this.append(next.simulatedSeconds, 'experiment_stopped', `Эксперимент остановлен: ${next.stopReasonRu ?? 'пользователем'}.`, null));
      }
    }
    return Object.freeze(appended);
  }

  snapshot(): readonly CombatLabExperimentJournalEntryV1[] {
    return Object.freeze(this.entries.map((entry) => Object.freeze({
      ...entry,
      programStepRef: entry.programStepRef ? Object.freeze({ ...entry.programStepRef }) : null,
    })));
  }

  private append(
    simulatedSeconds: number,
    kind: CombatLabExperimentJournalKindV1,
    messageRu: string,
    step: CombatLabStepRuntimeSnapshotV1 | null,
  ): CombatLabExperimentJournalEntryV1 {
    this.sequence += 1;
    const programStepRef = step
      ? Object.freeze({
          experimentId: this.runIdentity.experimentId,
          experimentRevision: this.runIdentity.experimentRevision,
          trackId: step.trackId,
          stepId: step.stepId,
        })
      : null;
    const entry = Object.freeze({
      runId: this.runIdentity.runId,
      eventId: `${this.runIdentity.runId}:event:${this.sequence}`,
      sequence: this.sequence,
      simulatedSeconds: canonicalSeconds(simulatedSeconds),
      kind,
      messageRu,
      programStepRef,
      trackId: step?.trackId ?? null,
      stepId: step?.stepId ?? null,
      attempt: step?.attempt ?? 0,
    });
    this.entries.push(entry);
    if (this.entries.length > COMBAT_LAB_EXPERIMENT_JOURNAL_LIMIT) {
      this.entries.splice(0, this.entries.length - COMBAT_LAB_EXPERIMENT_JOURNAL_LIMIT);
    }
    return entry;
  }
}

export function buildCombatLabExperimentVisualSnapshot(input: {
  readonly core: CombatLabScenarioRuntimeSnapshotV1;
  readonly experiment: CombatLabExperimentV1;
  readonly seed: number;
  readonly runIdentity: CombatLabRunIdentityV1;
  readonly visualRevision: number;
  readonly visualStatus: CombatLabExperimentVisualStatusV1;
  readonly speed: number;
  readonly journal: readonly CombatLabExperimentJournalEntryV1[];
  readonly representative: CombatLabRepresentativeReplayContextV1 | null;
}): CombatLabExperimentVisualRuntimeSnapshotV1 {
  const active = activeStep(input.core);
  const failure = input.core.steps.find((step) => step.state === 'failed') ?? null;
  const successConditionStatus = input.core.success === true
    ? 'satisfied'
    : input.core.status === 'failed' || input.core.success === false
      ? 'failed'
      : 'pending';
  return Object.freeze({
    ...input.core,
    steps: Object.freeze(input.core.steps.map((step) => Object.freeze({ ...step }))),
    experimentTitleRu: input.experiment.titleRu,
    seed: input.seed,
    runIdentity: Object.freeze({ ...input.runIdentity }),
    visualRevision: input.visualRevision,
    visualStatus: input.visualStatus,
    speed: input.speed,
    activeStepTitleRu: active ? stepTitle(input.experiment, active) : null,
    activeTrackId: active?.trackId ?? null,
    activeStepId: active?.stepId ?? null,
    attemptCount: active?.attempt ?? Math.max(0, ...input.core.steps.map((step) => step.attempt)),
    failureReasonRu: failure?.reasonRu ?? input.core.stopReasonRu,
    successConditionStatus,
    representativeRunIndex: input.representative?.runIndex ?? null,
    representativeStopReason: input.representative?.stopReason ?? null,
    journal: Object.freeze(input.journal.map((entry) => Object.freeze({
      ...entry,
      programStepRef: entry.programStepRef ? Object.freeze({ ...entry.programStepRef }) : null,
    }))),
  });
}

export function asCombatLabExperimentVisualSnapshot(
  snapshot: CombatLabScenarioRuntimeSnapshotV1,
): CombatLabExperimentVisualRuntimeSnapshotV1 | null {
  const candidate = snapshot as Partial<CombatLabExperimentVisualRuntimeSnapshotV1>;
  return typeof candidate.experimentTitleRu === 'string'
    && typeof candidate.seed === 'number'
    && typeof candidate.runIdentity?.runId === 'string'
    && typeof candidate.visualStatus === 'string'
    && Array.isArray(candidate.journal)
    ? candidate as CombatLabExperimentVisualRuntimeSnapshotV1
    : null;
}

function assertRunExperiment(runIdentity: CombatLabRunIdentityV1, experiment: CombatLabExperimentV1): void {
  if (runIdentity.experimentId !== experiment.experimentId
    || runIdentity.experimentRevision !== experiment.revision
    || runIdentity.sourceDigest !== digestCombatLabExperiment(experiment)) {
    throw new Error('Combat Lab journal run identity does not match the experiment.');
  }
}

function activeStep(snapshot: CombatLabScenarioRuntimeSnapshotV1): CombatLabStepRuntimeSnapshotV1 | null {
  return snapshot.steps.find((step) => step.state === 'paused_at_breakpoint')
    ?? snapshot.steps.find((step) => step.state === 'running')
    ?? snapshot.steps.find((step) => step.state === 'waiting')
    ?? snapshot.steps.find((step) => step.state === 'pending')
    ?? null;
}

function stepTitle(experiment: CombatLabExperimentV1, runtime: CombatLabStepRuntimeSnapshotV1): string {
  return experiment.tracks
    .find((track) => track.trackId === runtime.trackId)
    ?.steps.find((step) => step.stepId === runtime.stepId)
    ?.titleRu ?? runtime.stepId;
}

function stepKey(step: Pick<CombatLabStepRuntimeSnapshotV1, 'trackId' | 'stepId'>): string {
  return `${step.trackId}\u0000${step.stepId}`;
}

function sameRuntimeStep(left: CombatLabStepRuntimeSnapshotV1, right: CombatLabStepRuntimeSnapshotV1): boolean {
  return left.state === right.state
    && left.attempt === right.attempt
    && left.ownerToken === right.ownerToken
    && left.reasonCode === right.reasonCode
    && left.reasonRu === right.reasonRu;
}

function canonicalSeconds(value: number): number {
  return Math.round(Math.max(0, Number.isFinite(value) ? value : 0) * 1_000_000_000) / 1_000_000_000;
}
