import type {
  CombatLabMeasurementDefinitionV1,
  CombatLabTelemetryRecordV1,
} from './CombatLabMeasurementTelemetry';

export interface CombatLabTelemetryDatasetV1 {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly measurementDefinitions: readonly CombatLabMeasurementDefinitionV1[];
  readonly records: readonly CombatLabTelemetryRecordV1[];
  readonly recordCountByMeasurement: Readonly<Record<string, number>>;
}

export function createCombatLabTelemetryDataset(
  runId: string,
  measurementDefinitions: readonly CombatLabMeasurementDefinitionV1[],
  records: readonly CombatLabTelemetryRecordV1[],
): CombatLabTelemetryDatasetV1 {
  const normalizedRunId = nonEmpty(runId, 'Telemetry dataset runId');
  const definitionById = new Map<string, CombatLabMeasurementDefinitionV1>();
  const frozenDefinitions = measurementDefinitions.map((definition) => {
    if (definitionById.has(definition.measurementDefinitionId)) {
      throw new Error(`Duplicate MeasurementDefinitionId in telemetry dataset: ${definition.measurementDefinitionId}.`);
    }
    const frozen = freezeDefinition(definition);
    definitionById.set(frozen.measurementDefinitionId, frozen);
    return frozen;
  });

  const seenRecordIds = new Set<string>();
  const countByMeasurement: Record<string, number> = Object.fromEntries(
    frozenDefinitions.map((definition) => [definition.measurementDefinitionId, 0]),
  );
  const frozenRecords = [...records]
    .sort(compareRecords)
    .map((record) => {
      if (record.runId !== normalizedRunId) {
        throw new Error(`Telemetry record ${record.recordId} belongs to run ${record.runId}, expected ${normalizedRunId}.`);
      }
      if (seenRecordIds.has(record.recordId)) {
        throw new Error(`Duplicate telemetry recordId: ${record.recordId}.`);
      }
      seenRecordIds.add(record.recordId);
      const definition = definitionById.get(record.measurementDefinitionId);
      if (!definition) {
        throw new Error(`Telemetry record ${record.recordId} references missing measurement ${record.measurementDefinitionId}.`);
      }
      if (record.measurementDefinitionRevision !== definition.revision
        || record.measurementDefinitionFingerprint !== definition.fingerprint) {
        throw new Error(`Telemetry record ${record.recordId} does not match frozen measurement revision/fingerprint.`);
      }
      countByMeasurement[definition.measurementDefinitionId] = (countByMeasurement[definition.measurementDefinitionId] ?? 0) + 1;
      return freezeRecord(record);
    });

  return Object.freeze({
    schemaVersion: 1,
    runId: normalizedRunId,
    measurementDefinitions: Object.freeze(frozenDefinitions),
    records: Object.freeze(frozenRecords),
    recordCountByMeasurement: Object.freeze({ ...countByMeasurement }),
  });
}

export function getCombatLabTelemetryRecordsForMeasurement(
  dataset: CombatLabTelemetryDatasetV1,
  measurementDefinitionId: string,
): readonly CombatLabTelemetryRecordV1[] {
  const id = nonEmpty(measurementDefinitionId, 'MeasurementDefinitionId');
  return Object.freeze(dataset.records.filter((record) => record.measurementDefinitionId === id));
}

function freezeDefinition(definition: CombatLabMeasurementDefinitionV1): CombatLabMeasurementDefinitionV1 {
  return Object.freeze({
    ...definition,
    participantUnitIds: Object.freeze([...definition.participantUnitIds]),
    stateConstraints: Object.freeze(definition.stateConstraints.map((item) => Object.freeze({ ...item }))),
    collectionPeriod: Object.freeze({
      start: Object.freeze({ ...definition.collectionPeriod.start }),
      end: Object.freeze({ ...definition.collectionPeriod.end }),
    }),
  });
}

function freezeRecord(record: CombatLabTelemetryRecordV1): CombatLabTelemetryRecordV1 {
  return Object.freeze({
    ...record,
    sourceEntityRefs: Object.freeze(record.sourceEntityRefs.map((ref) => Object.freeze({ ...ref }))),
    payload: Object.freeze({ ...record.payload }),
  });
}

function compareRecords(left: CombatLabTelemetryRecordV1, right: CombatLabTelemetryRecordV1): number {
  return left.simulatedSeconds - right.simulatedSeconds
    || compareText(left.measurementDefinitionId, right.measurementDefinitionId)
    || compareText(left.recordId, right.recordId);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}
