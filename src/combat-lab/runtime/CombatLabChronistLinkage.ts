import type {
  CombatLabMeasurementSnapshotRefV1,
  CombatLabTelemetryDatasetV1,
  CombatLabTelemetryRecordV1,
} from '../../core/testing/combat-lab';
import type { CombatLabProgramStepRefV1 } from './CombatLabExperimentRunState';
import {
  mergeCombatLabLiveJournalEvents,
  type CombatLabJournalEntityRefV1,
  type CombatLabJournalMetricRefV1,
  type CombatLabLiveJournalEventV1,
} from './CombatLabLiveJournal';

export interface CombatLabProgramJournalLinkV1 {
  readonly programStepRef: CombatLabProgramStepRefV1;
  readonly journalEventIds: readonly string[];
}

export interface CombatLabSeriesMeasurementLinkV1 {
  readonly measurementDefinitionId: string;
  readonly measurementDefinitionRevision: number;
  readonly measurementDefinitionFingerprint: string;
  readonly titleRu: string;
  readonly streamId: string;
}

/**
 * Adds frozen measurement provenance to existing LIVE core events when the
 * telemetry record references the same canonical shot/impact entity.
 * Unmatched telemetry remains visible as a metrics-only T3 event.
 */
export function linkCombatLabTelemetryIntoLiveJournal(
  coreEvents: readonly CombatLabLiveJournalEventV1[],
  dataset: CombatLabTelemetryDatasetV1,
): readonly CombatLabLiveJournalEventV1[] {
  if (coreEvents.some((event) => event.runId !== dataset.runId)) {
    throw new Error(`LIVE Journal RunId does not match telemetry dataset ${dataset.runId}.`);
  }

  const mutable = new Map<string, CombatLabLiveJournalEventV1>();
  for (const event of coreEvents) {
    if (mutable.has(event.eventId)) throw new Error(`Duplicate LIVE Journal eventId: ${event.eventId}.`);
    mutable.set(event.eventId, event);
  }

  const metricsOnly: CombatLabLiveJournalEventV1[] = [];
  for (const record of dataset.records) {
    const matchingEvent = findCanonicalCoreEvent([...mutable.values()], record);
    if (matchingEvent) {
      mutable.set(matchingEvent.eventId, attachMetricRef(matchingEvent, record));
      continue;
    }
    metricsOnly.push(metricsOnlyEvent(dataset, record));
  }

  return mergeCombatLabLiveJournalEvents([...mutable.values()], metricsOnly);
}

export function buildCombatLabProgramJournalLink(
  programStepRef: CombatLabProgramStepRefV1,
  events: readonly CombatLabLiveJournalEventV1[],
): CombatLabProgramJournalLinkV1 {
  const ids = events
    .filter((event) => sameProgramStepRef(event.programStepRef, programStepRef))
    .map((event) => event.eventId);
  return Object.freeze({
    programStepRef: Object.freeze({ ...programStepRef }),
    journalEventIds: Object.freeze(ids),
  });
}

export function buildCombatLabSeriesMeasurementLink(
  measurement: CombatLabMeasurementSnapshotRefV1,
): CombatLabSeriesMeasurementLinkV1 {
  return Object.freeze({
    measurementDefinitionId: nonEmpty(measurement.measurementDefinitionId, 'MeasurementDefinitionId'),
    measurementDefinitionRevision: positiveInteger(measurement.revision, 'Measurement revision'),
    measurementDefinitionFingerprint: nonEmpty(measurement.fingerprint, 'Measurement fingerprint'),
    titleRu: nonEmpty(measurement.titleRu, 'Measurement titleRu'),
    streamId: nonEmpty(measurement.streamId, 'Measurement streamId'),
  });
}

function findCanonicalCoreEvent(
  events: readonly CombatLabLiveJournalEventV1[],
  record: CombatLabTelemetryRecordV1,
): CombatLabLiveJournalEventV1 | null {
  const impactId = entityId(record, 'impact');
  if (impactId) {
    return events.find((event) => event.source === 'core' && hasEntity(event, 'impact', impactId)) ?? null;
  }
  const shotId = entityId(record, 'shot');
  if (shotId) {
    return events.find((event) => event.source === 'core' && hasEntity(event, 'shot', shotId)) ?? null;
  }
  return null;
}

function attachMetricRef(
  event: CombatLabLiveJournalEventV1,
  record: CombatLabTelemetryRecordV1,
): CombatLabLiveJournalEventV1 {
  const existing = event.metricRefs.find((item) => (
    item.measurementDefinitionId === record.measurementDefinitionId
    && item.measurementDefinitionRevision === record.measurementDefinitionRevision
    && item.measurementDefinitionFingerprint === record.measurementDefinitionFingerprint
  ));
  const metricRefs: CombatLabJournalMetricRefV1[] = event.metricRefs.map((item) => Object.freeze({
    ...item,
    telemetryRecordIds: Object.freeze([...item.telemetryRecordIds]),
  }));
  if (existing) {
    const index = metricRefs.findIndex((item) => item === existing || (
      item.measurementDefinitionId === existing.measurementDefinitionId
      && item.measurementDefinitionRevision === existing.measurementDefinitionRevision
      && item.measurementDefinitionFingerprint === existing.measurementDefinitionFingerprint
    ));
    const recordIds = metricRefs[index]!.telemetryRecordIds.includes(record.recordId)
      ? metricRefs[index]!.telemetryRecordIds
      : Object.freeze([...metricRefs[index]!.telemetryRecordIds, record.recordId]);
    metricRefs[index] = Object.freeze({ ...metricRefs[index]!, telemetryRecordIds: recordIds });
  } else {
    metricRefs.push(Object.freeze({
      measurementDefinitionId: record.measurementDefinitionId,
      measurementDefinitionRevision: record.measurementDefinitionRevision,
      measurementDefinitionFingerprint: record.measurementDefinitionFingerprint,
      telemetryRecordIds: Object.freeze([record.recordId]),
    }));
  }
  return Object.freeze({ ...event, metricRefs: Object.freeze(metricRefs) });
}

function metricsOnlyEvent(
  dataset: CombatLabTelemetryDatasetV1,
  record: CombatLabTelemetryRecordV1,
): CombatLabLiveJournalEventV1 {
  const definition = dataset.measurementDefinitions.find((item) => (
    item.measurementDefinitionId === record.measurementDefinitionId
    && item.revision === record.measurementDefinitionRevision
    && item.fingerprint === record.measurementDefinitionFingerprint
  ));
  if (!definition) {
    throw new Error(`Telemetry record ${record.recordId} has no frozen MeasurementDefinition.`);
  }
  return Object.freeze({
    schemaVersion: 1,
    eventId: `${record.runId}:metric:${record.recordId}`,
    runId: record.runId,
    simulatedSeconds: record.simulatedSeconds,
    tier: 'T3',
    source: 'metrics',
    category: `metrics.${record.streamId}`,
    titleRu: definition.titleRu,
    detailsRu: `Измерение «${definition.titleRu}» получило новую запись.`,
    mandatoryCore: false,
    programStepRef: null,
    entityRefs: Object.freeze(record.sourceEntityRefs.map(toJournalEntityRef)),
    metricRefs: Object.freeze([Object.freeze({
      measurementDefinitionId: record.measurementDefinitionId,
      measurementDefinitionRevision: record.measurementDefinitionRevision,
      measurementDefinitionFingerprint: record.measurementDefinitionFingerprint,
      telemetryRecordIds: Object.freeze([record.recordId]),
    })]),
  });
}

function toJournalEntityRef(ref: CombatLabTelemetryRecordV1['sourceEntityRefs'][number]): CombatLabJournalEntityRefV1 {
  const supportedKinds = new Set<CombatLabJournalEntityRefV1['kind']>([
    'unit',
    'shot',
    'impact',
    'projectile',
    'weapon',
    'weapon_definition',
    'ammo_definition',
  ]);
  if (!supportedKinds.has(ref.kind as CombatLabJournalEntityRefV1['kind'])) {
    throw new Error(`Telemetry entity kind ${ref.kind} cannot be linked into LIVE Journal.`);
  }
  return Object.freeze({
    kind: ref.kind as CombatLabJournalEntityRefV1['kind'],
    id: ref.id,
    role: 'related',
  });
}

function entityId(record: CombatLabTelemetryRecordV1, kind: string): string | null {
  return record.sourceEntityRefs.find((ref) => ref.kind === kind)?.id ?? null;
}

function hasEntity(event: CombatLabLiveJournalEventV1, kind: string, id: string): boolean {
  return event.entityRefs.some((ref) => ref.kind === kind && ref.id === id);
}

function sameProgramStepRef(
  left: CombatLabProgramStepRefV1 | null,
  right: CombatLabProgramStepRefV1,
): boolean {
  return left !== null
    && left.experimentId === right.experimentId
    && left.experimentRevision === right.experimentRevision
    && left.trackId === right.trackId
    && left.stepId === right.stepId;
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} must be a non-empty string.`);
  return value.trim();
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer.`);
  return value;
}
