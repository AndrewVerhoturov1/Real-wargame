import type { SimulationState } from '../../core/simulation/SimulationState';
import type {
  CombatLabExperimentJournalEntryV1,
  CombatLabProgramStepRefV1,
  CombatLabRunIdentityV1,
} from './CombatLabExperimentRunState';

export type CombatLabJournalTierV1 = 'T1' | 'T2' | 'T3';
export type CombatLabJournalSourceV1 = 'core' | 'metrics';
export type CombatLabJournalEntityKindV1 =
  | 'unit'
  | 'shot'
  | 'impact'
  | 'projectile'
  | 'weapon'
  | 'weapon_definition'
  | 'ammo_definition'
  | 'measurement';

export interface CombatLabJournalEntityRefV1 {
  readonly kind: CombatLabJournalEntityKindV1;
  readonly id: string;
  readonly role: 'participant' | 'target' | 'subject' | 'instrument' | 'source' | 'related';
}

export interface CombatLabJournalMetricRefV1 {
  readonly measurementDefinitionId: string;
  readonly measurementDefinitionRevision: number;
  readonly measurementDefinitionFingerprint: string;
  readonly telemetryRecordIds: readonly string[];
}

export interface CombatLabLiveJournalEventV1 {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly runId: string;
  readonly simulatedSeconds: number;
  readonly tier: CombatLabJournalTierV1;
  readonly source: 'core' | 'metrics';
  readonly category: string;
  readonly titleRu: string;
  readonly detailsRu: string;
  readonly mandatoryCore: boolean;
  readonly programStepRef: CombatLabProgramStepRefV1 | null;
  readonly entityRefs: readonly CombatLabJournalEntityRefV1[];
  readonly metricRefs: readonly CombatLabJournalMetricRefV1[];
}

export interface CombatLabLiveJournalCursorV1 {
  readonly lastProgramSequence: number;
  readonly lastCommittedShotId: string | null;
  readonly lastImpactId: string | null;
  readonly sourceEventOverflowCount: number;
}

export interface CombatLabLiveJournalCollectionV1 {
  readonly events: readonly CombatLabLiveJournalEventV1[];
  readonly cursor: CombatLabLiveJournalCursorV1;
}

export interface CombatLabLiveJournalFilterV1 {
  readonly source?: 'all' | CombatLabJournalSourceV1;
  readonly tiers?: readonly CombatLabJournalTierV1[];
  readonly participantUnitId?: string;
  readonly programStepRef?: CombatLabProgramStepRefV1;
  readonly searchText?: string;
}

export function collectCombatLabLiveJournalEvents(input: {
  readonly runIdentity: CombatLabRunIdentityV1;
  readonly programJournal: readonly CombatLabExperimentJournalEntryV1[];
  readonly state: SimulationState;
  readonly cursor?: CombatLabLiveJournalCursorV1;
}): CombatLabLiveJournalCollectionV1 {
  const cursor = normalizeCursor(input.cursor);
  assertRunProgramCoverage(input.runIdentity, input.programJournal, cursor.lastProgramSequence);
  assertProjectileCoverage(input.state, cursor);
  const events: CombatLabLiveJournalEventV1[] = [];

  for (const entry of input.programJournal) {
    if (entry.sequence <= cursor.lastProgramSequence) continue;
    if (entry.runId !== input.runIdentity.runId) {
      throw new Error(`Program journal event ${entry.eventId} belongs to different RunId.`);
    }
    events.push(programJournalEvent(entry));
  }

  const shots = input.state.infantryCombatProjectiles.committedShots;
  for (const shot of recordsAfterId(shots, cursor.lastCommittedShotId, (item) => item.shotId, 'committed shot')) {
    events.push(Object.freeze({
      schemaVersion: 1,
      eventId: `${input.runIdentity.runId}:shot:${shot.shotId}`,
      runId: input.runIdentity.runId,
      simulatedSeconds: canonicalSeconds(shot.committedSimulationSeconds),
      tier: 'T2',
      source: 'core',
      category: 'fire.shot_committed',
      titleRu: 'Выстрел',
      detailsRu: `Боец ${shot.shooterId} совершил выстрел из ${shot.weaponInstanceId}.`,
      mandatoryCore: true,
      programStepRef: null,
      entityRefs: Object.freeze([
        entity('unit', shot.shooterId, 'participant'),
        entity('shot', shot.shotId, 'subject'),
        entity('weapon', shot.weaponInstanceId, 'instrument'),
        entity('weapon_definition', definitionRefId(shot.weaponDefinitionRef), 'source'),
        entity('ammo_definition', definitionRefId(shot.ammoDefinitionRef), 'related'),
      ]),
      metricRefs: Object.freeze([]),
    }));
  }

  const impacts = input.state.infantryCombatProjectiles.impacts;
  for (const impact of recordsAfterId(impacts, cursor.lastImpactId, (item) => item.impactId, 'impact')) {
    const refs: CombatLabJournalEntityRefV1[] = [
      entity('unit', impact.shooterId, 'participant'),
      entity('shot', impact.shotId, 'source'),
      entity('projectile', impact.projectileId, 'related'),
      entity('impact', impact.impactId, 'subject'),
    ];
    if (impact.hitUnitId) refs.push(entity('unit', impact.hitUnitId, 'target'));
    events.push(Object.freeze({
      schemaVersion: 1,
      eventId: `${input.runIdentity.runId}:impact:${impact.impactId}`,
      runId: input.runIdentity.runId,
      simulatedSeconds: canonicalSeconds(impact.impactSeconds),
      tier: impact.hitUnitId ? 'T2' : 'T3',
      source: 'core',
      category: `fire.impact.${impact.hitType}`,
      titleRu: impact.hitUnitId ? 'Попадание по бойцу' : impact.hitType === 'terrain' ? 'Попадание в местность' : 'Воздействие снаряда',
      detailsRu: impact.hitUnitId
        ? `Выстрел ${impact.shotId} бойца ${impact.shooterId} воздействовал на ${impact.hitUnitId}${impact.hitZone ? `, зона ${impact.hitZone}` : ''}.`
        : `Выстрел ${impact.shotId} завершился воздействием типа «${impact.hitType}».`,
      mandatoryCore: true,
      programStepRef: null,
      entityRefs: Object.freeze(refs),
      metricRefs: Object.freeze([]),
    }));
  }

  const deduplicated = new Map<string, CombatLabLiveJournalEventV1>();
  for (const event of events) {
    if (deduplicated.has(event.eventId)) throw new Error(`Duplicate LIVE Journal eventId: ${event.eventId}.`);
    deduplicated.set(event.eventId, event);
  }
  const sorted = [...deduplicated.values()].sort(compareJournalEvents);
  return Object.freeze({
    events: Object.freeze(sorted),
    cursor: Object.freeze({
      lastProgramSequence: Math.max(cursor.lastProgramSequence, input.programJournal.at(-1)?.sequence ?? 0),
      lastCommittedShotId: shots.at(-1)?.shotId ?? cursor.lastCommittedShotId,
      lastImpactId: impacts.at(-1)?.impactId ?? cursor.lastImpactId,
      sourceEventOverflowCount: sourceOverflowCount(input.state),
    }),
  });
}

export function filterCombatLabLiveJournalEvents(
  events: readonly CombatLabLiveJournalEventV1[],
  filter: CombatLabLiveJournalFilterV1,
): readonly CombatLabLiveJournalEventV1[] {
  const source = filter.source ?? 'all';
  const tiers = filter.tiers ? new Set(filter.tiers) : null;
  const participantUnitId = filter.participantUnitId?.trim() || null;
  const searchText = filter.searchText?.trim().toLocaleLowerCase('ru-RU') || null;
  return Object.freeze(events.filter((event) => {
    if (source !== 'all' && event.source !== source) return false;
    if (tiers && !tiers.has(event.tier)) return false;
    if (participantUnitId && !event.entityRefs.some((ref) => ref.kind === 'unit' && ref.id === participantUnitId)) return false;
    if (filter.programStepRef && !sameProgramStepRef(event.programStepRef, filter.programStepRef)) return false;
    if (searchText && !journalSearchText(event).includes(searchText)) return false;
    return true;
  }));
}

export function mergeCombatLabLiveJournalEvents(
  coreEvents: readonly CombatLabLiveJournalEventV1[],
  metricEvents: readonly CombatLabLiveJournalEventV1[],
): readonly CombatLabLiveJournalEventV1[] {
  const byId = new Map<string, CombatLabLiveJournalEventV1>();
  for (const event of [...coreEvents, ...metricEvents]) {
    if (event.source === 'metrics' && event.mandatoryCore) {
      throw new Error(`Metrics Journal event ${event.eventId} cannot be marked mandatoryCore.`);
    }
    if (byId.has(event.eventId)) throw new Error(`Duplicate LIVE Journal eventId: ${event.eventId}.`);
    byId.set(event.eventId, event);
  }
  return Object.freeze([...byId.values()].sort(compareJournalEvents));
}

export function getCombatLabJournalEventsForProgramStep(
  events: readonly CombatLabLiveJournalEventV1[],
  programStepRef: CombatLabProgramStepRefV1,
): readonly CombatLabLiveJournalEventV1[] {
  return filterCombatLabLiveJournalEvents(events, { programStepRef });
}

function programJournalEvent(entry: CombatLabExperimentJournalEntryV1): CombatLabLiveJournalEventV1 {
  return Object.freeze({
    schemaVersion: 1,
    eventId: entry.eventId,
    runId: entry.runId,
    simulatedSeconds: entry.simulatedSeconds,
    tier: programTier(entry.kind),
    source: 'core',
    category: `program.${entry.kind}`,
    titleRu: programTitle(entry.kind),
    detailsRu: entry.messageRu,
    mandatoryCore: true,
    programStepRef: entry.programStepRef ? Object.freeze({ ...entry.programStepRef }) : null,
    entityRefs: Object.freeze([]),
    metricRefs: Object.freeze([]),
  });
}

function programTier(kind: CombatLabExperimentJournalEntryV1['kind']): CombatLabJournalTierV1 {
  if (kind === 'experiment_completed' || kind === 'experiment_failed' || kind === 'experiment_stopped' || kind === 'step_failed') return 'T1';
  if (kind === 'command_accepted') return 'T3';
  return 'T2';
}

function programTitle(kind: CombatLabExperimentJournalEntryV1['kind']): string {
  if (kind === 'step_started') return 'Шаг программы начат';
  if (kind === 'step_completed') return 'Шаг программы завершён';
  if (kind === 'step_failed') return 'Ошибка шага программы';
  if (kind === 'step_retry') return 'Повтор шага программы';
  if (kind === 'step_skipped') return 'Шаг программы пропущен';
  if (kind === 'command_accepted') return 'Команда программы принята';
  if (kind === 'command_rejected') return 'Команда программы отклонена';
  if (kind === 'breakpoint_reached') return 'Точка остановки программы';
  if (kind === 'experiment_completed') return 'Эксперимент завершён';
  if (kind === 'experiment_failed') return 'Эксперимент завершился ошибкой';
  return 'Эксперимент остановлен';
}

function assertRunProgramCoverage(
  runIdentity: CombatLabRunIdentityV1,
  entries: readonly CombatLabExperimentJournalEntryV1[],
  lastSequence: number,
): void {
  for (const entry of entries) {
    if (entry.runId !== runIdentity.runId) throw new Error(`Program journal contains event from different RunId: ${entry.eventId}.`);
  }
  if (lastSequence > 0 && entries.length > 0 && entries[0]!.sequence > lastSequence + 1) {
    throw new Error(`LIVE Journal lost Program event coverage after sequence ${lastSequence}.`);
  }
}

function assertProjectileCoverage(state: SimulationState, cursor: CombatLabLiveJournalCursorV1): void {
  const overflow = sourceOverflowCount(state);
  if (overflow > cursor.sourceEventOverflowCount) {
    throw new Error(`LIVE Journal projectile event source overflowed (${cursor.sourceEventOverflowCount} -> ${overflow}).`);
  }
}

function recordsAfterId<T>(values: readonly T[], lastId: string | null, idOf: (item: T) => string, label: string): readonly T[] {
  if (lastId === null) return values;
  const index = values.findIndex((item) => idOf(item) === lastId);
  if (index < 0) throw new Error(`LIVE Journal lost ${label} cursor ${lastId}.`);
  return values.slice(index + 1);
}

function normalizeCursor(cursor: CombatLabLiveJournalCursorV1 | undefined): CombatLabLiveJournalCursorV1 {
  if (!cursor) return Object.freeze({ lastProgramSequence: 0, lastCommittedShotId: null, lastImpactId: null, sourceEventOverflowCount: 0 });
  if (!Number.isInteger(cursor.lastProgramSequence) || cursor.lastProgramSequence < 0) throw new Error('LIVE Journal lastProgramSequence is invalid.');
  if (!Number.isInteger(cursor.sourceEventOverflowCount) || cursor.sourceEventOverflowCount < 0) throw new Error('LIVE Journal sourceEventOverflowCount is invalid.');
  return Object.freeze({ ...cursor });
}

function sourceOverflowCount(state: SimulationState): number {
  const value = state.infantryCombatProjectiles.diagnostics.eventOverflowCount;
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function sameProgramStepRef(left: CombatLabProgramStepRefV1 | null, right: CombatLabProgramStepRefV1): boolean {
  return left !== null
    && left.experimentId === right.experimentId
    && left.experimentRevision === right.experimentRevision
    && left.trackId === right.trackId
    && left.stepId === right.stepId;
}

function journalSearchText(event: CombatLabLiveJournalEventV1): string {
  return [
    event.titleRu,
    event.detailsRu,
    event.category,
    ...event.entityRefs.flatMap((ref) => [ref.kind, ref.id]),
    event.programStepRef?.trackId ?? '',
    event.programStepRef?.stepId ?? '',
  ].join(' ').toLocaleLowerCase('ru-RU');
}

function entity(
  kind: CombatLabJournalEntityKindV1,
  id: string,
  role: CombatLabJournalEntityRefV1['role'],
): CombatLabJournalEntityRefV1 {
  return Object.freeze({ kind, id: nonEmpty(id, `Journal ${kind} id`), role });
}

function definitionRefId(value: { readonly definitionId: string; readonly revision: number }): string {
  return `${value.definitionId}@${value.revision}`;
}

function compareJournalEvents(left: CombatLabLiveJournalEventV1, right: CombatLabLiveJournalEventV1): number {
  return left.simulatedSeconds - right.simulatedSeconds || compareText(left.eventId, right.eventId);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalSeconds(value: number): number {
  return Math.round(Math.max(0, Number.isFinite(value) ? value : 0) * 1_000_000_000) / 1_000_000_000;
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} must be a non-empty string.`);
  return value.trim();
}
