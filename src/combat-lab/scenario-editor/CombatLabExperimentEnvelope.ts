import {
  digestStableValue,
  getCombatLabTelemetryStreamCapability,
  parseCombatLabExperiment,
  serializeCombatLabExperiment,
  stableStringify,
  type CombatLabExperimentV1,
  type CombatLabMeasurementBoundaryV1,
  type CombatLabMeasurementCollectionPeriodV1,
  type CombatLabMeasurementDefinitionV1,
  type CombatLabMeasurementStateConstraintV1,
  type CombatLabTelemetryStreamIdV1,
} from '../../core/testing/combat-lab';
import {
  normalizeCombatLabLaboratoryState,
  type CombatLabLaboratoryStateV1,
} from '../parameters/CombatLabLaboratoryRuntime';

export interface CombatLabExperimentEnvelopeV1 {
  readonly schemaVersion: 1;
  readonly experiment: CombatLabExperimentV1;
  readonly laboratory: CombatLabLaboratoryStateV1;
  readonly measurementDefinitions: readonly CombatLabMeasurementDefinitionV1[];
  readonly envelopeFingerprint: string;
}

export function createCombatLabExperimentEnvelope(input: {
  readonly experiment: CombatLabExperimentV1;
  readonly laboratory: CombatLabLaboratoryStateV1;
  readonly measurementDefinitions: readonly CombatLabMeasurementDefinitionV1[];
}): CombatLabExperimentEnvelopeV1 {
  const experiment = parseCombatLabExperiment(serializeCombatLabExperiment(input.experiment));
  const laboratory = normalizeLaboratoryStrict(input.laboratory);
  const measurementDefinitions = normalizeMeasurementSet(input.measurementDefinitions);
  const payload = Object.freeze({
    schemaVersion: 1 as const,
    experiment,
    laboratory,
    measurementDefinitions,
  });
  return Object.freeze({ ...payload, envelopeFingerprint: digestStableValue(payload) });
}

export function serializeCombatLabExperimentEnvelope(envelope: CombatLabExperimentEnvelopeV1): string {
  const canonical = createCombatLabExperimentEnvelope(envelope);
  if (canonical.envelopeFingerprint !== envelope.envelopeFingerprint) {
    throw new Error(
      `Combat Lab ExperimentEnvelope fingerprint mismatch: expected ${canonical.envelopeFingerprint}, got ${envelope.envelopeFingerprint}.`,
    );
  }
  return stableStringify(canonical);
}

export function parseCombatLabExperimentEnvelope(text: string): CombatLabExperimentEnvelopeV1 {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`Combat Lab ExperimentEnvelope is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error('Unsupported Combat Lab ExperimentEnvelope schemaVersion.');
  }
  if (!isRecord(value.experiment)) throw new Error('ExperimentEnvelope.experiment is required.');
  if (!isRecord(value.laboratory)) throw new Error('ExperimentEnvelope.laboratory is required.');
  if (!Array.isArray(value.measurementDefinitions)) throw new Error('ExperimentEnvelope.measurementDefinitions must be an array.');

  const experiment = parseCombatLabExperiment(stableStringify(value.experiment));
  const laboratory = normalizeLaboratoryStrict(value.laboratory);
  const measurementDefinitions = normalizeMeasurementSet(
    value.measurementDefinitions.map(parseMeasurementDefinition),
  );
  const payload = Object.freeze({ schemaVersion: 1 as const, experiment, laboratory, measurementDefinitions });
  const expectedFingerprint = digestStableValue(payload);
  const suppliedFingerprint = nonEmpty(value.envelopeFingerprint, 'ExperimentEnvelope.envelopeFingerprint');
  if (suppliedFingerprint !== expectedFingerprint) {
    throw new Error(
      `Combat Lab ExperimentEnvelope fingerprint mismatch: expected ${expectedFingerprint}, got ${suppliedFingerprint}.`,
    );
  }
  return Object.freeze({ ...payload, envelopeFingerprint: expectedFingerprint });
}

/**
 * Full validation gate for Open Experiment. Callers should replace their current
 * experiment only after this function returns successfully, which keeps Open atomic.
 */
export function prepareCombatLabExperimentEnvelopeOpen(text: string): CombatLabExperimentEnvelopeV1 {
  return parseCombatLabExperimentEnvelope(text);
}

function normalizeLaboratoryStrict(value: unknown): CombatLabLaboratoryStateV1 {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.areas) || !Array.isArray(value.overrides)) {
    throw new Error('ExperimentEnvelope.laboratory must be a complete Laboratory schemaVersion 1 object.');
  }
  return normalizeCombatLabLaboratoryState(value);
}

function normalizeMeasurementSet(
  definitions: readonly CombatLabMeasurementDefinitionV1[],
): readonly CombatLabMeasurementDefinitionV1[] {
  const ids = new Set<string>();
  const normalized = definitions.map((definition) => {
    const item = normalizeMeasurementDefinition(definition);
    if (ids.has(item.measurementDefinitionId)) {
      throw new Error(`Duplicate ExperimentEnvelope MeasurementDefinitionId: ${item.measurementDefinitionId}.`);
    }
    ids.add(item.measurementDefinitionId);
    return item;
  });
  return Object.freeze(normalized);
}

function normalizeMeasurementDefinition(value: CombatLabMeasurementDefinitionV1): CombatLabMeasurementDefinitionV1 {
  if (value.schemaVersion !== 1) throw new Error('Unsupported MeasurementDefinition schemaVersion in ExperimentEnvelope.');
  const measurementDefinitionId = nonEmpty(value.measurementDefinitionId, 'MeasurementDefinitionId');
  const revision = positiveInteger(value.revision, `Measurement ${measurementDefinitionId} revision`);
  const titleRu = nonEmpty(value.titleRu, `Measurement ${measurementDefinitionId} titleRu`);
  const streamId = normalizeStreamId(value.streamId);
  getCombatLabTelemetryStreamCapability(streamId);
  const participantUnitIds = value.participantUnitIds.map((id) => nonEmpty(id, `Measurement ${measurementDefinitionId} participant unitId`));
  assertUnique(participantUnitIds, `Measurement ${measurementDefinitionId} participant unitId`);
  const stateConstraints = value.stateConstraints.map(normalizeConstraint);
  const collectionPeriod = normalizeCollectionPeriod(value.collectionPeriod);
  const base = Object.freeze({
    schemaVersion: 1 as const,
    measurementDefinitionId,
    revision,
    titleRu,
    streamId,
    participantUnitIds: Object.freeze(participantUnitIds),
    stateConstraints: Object.freeze(stateConstraints),
    collectionPeriod,
    enabled: strictBoolean(value.enabled, `Measurement ${measurementDefinitionId} enabled`),
  });
  const expectedFingerprint = digestStableValue(base);
  if (value.fingerprint !== expectedFingerprint) {
    throw new Error(
      `Measurement ${measurementDefinitionId} fingerprint mismatch: expected ${expectedFingerprint}, got ${value.fingerprint}.`,
    );
  }
  return Object.freeze({ ...base, fingerprint: expectedFingerprint });
}

function parseMeasurementDefinition(value: unknown): CombatLabMeasurementDefinitionV1 {
  if (!isRecord(value)) throw new Error('Invalid MeasurementDefinition in ExperimentEnvelope.');
  if (!Array.isArray(value.participantUnitIds)) throw new Error('MeasurementDefinition.participantUnitIds must be an array.');
  if (!Array.isArray(value.stateConstraints)) throw new Error('MeasurementDefinition.stateConstraints must be an array.');
  if (!isRecord(value.collectionPeriod)) throw new Error('MeasurementDefinition.collectionPeriod is required.');
  return {
    schemaVersion: value.schemaVersion as 1,
    measurementDefinitionId: value.measurementDefinitionId as string,
    revision: value.revision as number,
    fingerprint: value.fingerprint as string,
    titleRu: value.titleRu as string,
    streamId: value.streamId as CombatLabTelemetryStreamIdV1,
    participantUnitIds: value.participantUnitIds.map((item) => String(item)),
    stateConstraints: value.stateConstraints.map(parseConstraint),
    collectionPeriod: parseCollectionPeriod(value.collectionPeriod),
    enabled: value.enabled as boolean,
  };
}

function normalizeCollectionPeriod(value: CombatLabMeasurementCollectionPeriodV1): CombatLabMeasurementCollectionPeriodV1 {
  return Object.freeze({
    start: normalizeBoundary(value.start),
    end: normalizeBoundary(value.end),
  });
}

function parseCollectionPeriod(value: Record<string, unknown>): CombatLabMeasurementCollectionPeriodV1 {
  if (!isRecord(value.start) || !isRecord(value.end)) {
    throw new Error('MeasurementDefinition collection period requires start and end boundaries.');
  }
  return { start: parseBoundary(value.start), end: parseBoundary(value.end) };
}

function normalizeBoundary(value: CombatLabMeasurementBoundaryV1): CombatLabMeasurementBoundaryV1 {
  if (value.kind === 'run_start' || value.kind === 'run_end') return Object.freeze({ kind: value.kind });
  if (value.kind === 'simulation_time') {
    return Object.freeze({ kind: 'simulation_time', seconds: finiteNonNegative(value.seconds, 'Measurement boundary seconds') });
  }
  return Object.freeze({
    kind: 'program_step',
    experimentId: nonEmpty(value.experimentId, 'Measurement Program anchor experimentId'),
    experimentRevision: nonNegativeInteger(value.experimentRevision, 'Measurement Program anchor revision'),
    trackId: nonEmpty(value.trackId, 'Measurement Program anchor trackId'),
    stepId: nonEmpty(value.stepId, 'Measurement Program anchor stepId'),
    edge: normalizeEdge(value.edge),
  });
}

function parseBoundary(value: Record<string, unknown>): CombatLabMeasurementBoundaryV1 {
  if (value.kind === 'run_start' || value.kind === 'run_end') return { kind: value.kind };
  if (value.kind === 'simulation_time') return { kind: 'simulation_time', seconds: value.seconds as number };
  if (value.kind === 'program_step') {
    return {
      kind: 'program_step',
      experimentId: value.experimentId as string,
      experimentRevision: value.experimentRevision as number,
      trackId: value.trackId as string,
      stepId: value.stepId as string,
      edge: value.edge as 'enter' | 'exit',
    };
  }
  throw new Error(`Unsupported MeasurementDefinition boundary kind: ${String(value.kind)}.`);
}

function normalizeConstraint(value: CombatLabMeasurementStateConstraintV1): CombatLabMeasurementStateConstraintV1 {
  return Object.freeze({
    field: nonEmpty(value.field, 'Measurement constraint field'),
    operator: normalizeOperator(value.operator),
    value: normalizeConstraintValue(value.value),
  });
}

function parseConstraint(value: unknown): CombatLabMeasurementStateConstraintV1 {
  if (!isRecord(value)) throw new Error('Invalid MeasurementDefinition state constraint.');
  return {
    field: value.field as string,
    operator: value.operator as CombatLabMeasurementStateConstraintV1['operator'],
    value: value.value as string | number | boolean,
  };
}

function normalizeStreamId(value: string): CombatLabTelemetryStreamIdV1 {
  return value as CombatLabTelemetryStreamIdV1;
}

function normalizeOperator(value: CombatLabMeasurementStateConstraintV1['operator']): CombatLabMeasurementStateConstraintV1['operator'] {
  if (value === 'eq' || value === 'neq' || value === 'gt' || value === 'gte' || value === 'lt' || value === 'lte') return value;
  throw new Error(`Unsupported MeasurementDefinition constraint operator: ${String(value)}.`);
}

function normalizeEdge(value: 'enter' | 'exit'): 'enter' | 'exit' {
  if (value === 'enter' || value === 'exit') return value;
  throw new Error(`Unsupported MeasurementDefinition Program edge: ${String(value)}.`);
}

function normalizeConstraintValue(value: string | number | boolean): string | number | boolean {
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  throw new Error('MeasurementDefinition constraint value must be string, boolean or finite number.');
}

function strictBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be boolean.`);
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer.`);
  return value;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer.`);
  return value;
}

function finiteNonNegative(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`${label} must be finite and non-negative.`);
  return value;
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} must be a non-empty string.`);
  return value.trim();
}

function assertUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`${label} must be unique: ${value}.`);
    seen.add(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
