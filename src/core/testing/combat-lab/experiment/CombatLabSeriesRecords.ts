import { digestStableValue, stableStringify } from '../CombatLabDigest';

const MINIMUM_SIMULATION_SECONDS = 0.1;
const MAXIMUM_SIMULATION_SECONDS = 600;

export interface CombatLabExperimentIdentityRefV1 {
  readonly experimentId: string;
  readonly experimentRevision: number;
  readonly sourceDigest: string;
}

export interface CombatLabFrozenArtifactRefV1 {
  readonly artifactId: string;
  readonly schemaId: string;
  readonly schemaVersion: number;
  readonly contentDigest: string;
}

export interface CombatLabMeasurementSnapshotRefV1 {
  readonly measurementDefinitionId: string;
  readonly revision: number;
  readonly fingerprint: string;
  readonly titleRu: string;
  readonly streamId: string;
}

export interface CombatLabRunMeasurementValueV1 {
  readonly measurementDefinitionId: string;
  readonly measurementDefinitionRevision: number;
  readonly measurementDefinitionFingerprint: string;
  readonly value: number;
  readonly sampleCount: number;
}

export type CombatLabSeriesRecordStatusV1 = 'setup' | 'running' | 'completed' | 'stopped' | 'failed';
export type CombatLabRunRecordStatusV1 = 'completed' | 'failed' | 'stopped';

export interface CombatLabSeriesRecordV1 {
  readonly schemaVersion: 1;
  readonly seriesId: string;
  readonly experimentRef: CombatLabExperimentIdentityRefV1;
  readonly frozenInputRef: CombatLabFrozenArtifactRefV1;
  readonly runtimeVersionId: string;
  readonly measurementSetSnapshot: readonly CombatLabMeasurementSnapshotRefV1[];
  readonly requestedRunCount: number;
  readonly seedPolicy: 'random_per_run' | 'explicit';
  readonly maximumSimulationSeconds: number;
  readonly status: CombatLabSeriesRecordStatusV1;
  readonly runIds: readonly string[];
  readonly createdAtIso: string;
  readonly completedAtIso: string | null;
}

export interface CombatLabRunRecordV1 {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly seriesId: string;
  readonly runIndex: number;
  readonly experimentRef: CombatLabExperimentIdentityRefV1;
  readonly frozenInputRef: CombatLabFrozenArtifactRefV1;
  readonly runtimeVersionId: string;
  readonly seed: number;
  readonly maximumSimulationSeconds: number;
  readonly status: CombatLabRunRecordStatusV1;
  readonly success: boolean | null;
  readonly stopReason: string;
  readonly simulatedSeconds: number;
  readonly measurementValues: readonly CombatLabRunMeasurementValueV1[];
  readonly telemetryRef: CombatLabFrozenArtifactRefV1 | null;
  readonly journalRef: CombatLabFrozenArtifactRefV1 | null;
  readonly eventDigest: string;
  readonly finalStateDigest: string;
}

export interface CombatLabSeriesArchiveV1 {
  readonly schemaVersion: 1;
  readonly archiveDigest: string;
  readonly series: CombatLabSeriesRecordV1;
  readonly runs: readonly CombatLabRunRecordV1[];
}

export function createCombatLabSeriesArchive(
  series: CombatLabSeriesRecordV1,
  runs: readonly CombatLabRunRecordV1[],
): CombatLabSeriesArchiveV1 {
  const normalizedSeries = normalizeSeriesRecord(series);
  const normalizedRuns = runs.map(normalizeRunRecord).sort((left, right) => left.runIndex - right.runIndex || compareText(left.runId, right.runId));
  validateSeriesRunLinkage(normalizedSeries, normalizedRuns);
  const payload = Object.freeze({
    schemaVersion: 1 as const,
    series: normalizedSeries,
    runs: Object.freeze(normalizedRuns),
  });
  return Object.freeze({
    ...payload,
    archiveDigest: digestStableValue(payload),
  });
}

export function serializeCombatLabSeriesArchive(archive: CombatLabSeriesArchiveV1): string {
  const canonical = createCombatLabSeriesArchive(archive.series, archive.runs);
  if (archive.archiveDigest !== canonical.archiveDigest) {
    throw new Error(`Combat Lab Series archive digest mismatch: expected ${canonical.archiveDigest}, got ${archive.archiveDigest}.`);
  }
  return stableStringify(canonical);
}

export function parseCombatLabSeriesArchive(text: string): CombatLabSeriesArchiveV1 {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`Combat Lab Series archive is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(value) || value.schemaVersion !== 1) throw new Error('Unsupported Combat Lab Series archive schemaVersion.');
  const series = parseSeriesRecord(value.series);
  const runs = readRequiredArray(value.runs, 'Series archive runs').map(parseRunRecord);
  const archive = createCombatLabSeriesArchive(series, runs);
  const suppliedDigest = nonEmpty(value.archiveDigest, 'Series archiveDigest');
  if (suppliedDigest !== archive.archiveDigest) {
    throw new Error(`Combat Lab Series archive digest mismatch: expected ${archive.archiveDigest}, got ${suppliedDigest}.`);
  }
  return archive;
}

export function normalizeCombatLabSeriesRecord(record: CombatLabSeriesRecordV1): CombatLabSeriesRecordV1 {
  return normalizeSeriesRecord(record);
}

export function normalizeCombatLabRunRecord(record: CombatLabRunRecordV1): CombatLabRunRecordV1 {
  return normalizeRunRecord(record);
}

function normalizeSeriesRecord(value: CombatLabSeriesRecordV1): CombatLabSeriesRecordV1 {
  if (value.schemaVersion !== 1) throw new Error('Unsupported CombatLabSeriesRecord schemaVersion.');
  const seriesId = nonEmpty(value.seriesId, 'SeriesId');
  const requestedRunCount = positiveInteger(value.requestedRunCount, 'requestedRunCount');
  const runIds = value.runIds.map((runId) => nonEmpty(runId, 'RunId'));
  assertUnique(runIds, `Series ${seriesId} runId`);
  const measurementSetSnapshot = value.measurementSetSnapshot.map(normalizeMeasurementSnapshotRef);
  assertUnique(
    measurementSetSnapshot.map((item) => item.measurementDefinitionId),
    `Series ${seriesId} measurementDefinitionId`,
  );
  if (runIds.length > requestedRunCount) throw new Error(`Series ${seriesId} contains more runs than requested.`);
  if (value.status === 'completed' && runIds.length !== requestedRunCount) {
    throw new Error(`Completed Series ${seriesId} must contain exactly ${requestedRunCount} RunIds.`);
  }
  if (value.status === 'completed' && value.completedAtIso === null) {
    throw new Error(`Completed Series ${seriesId} requires completedAtIso.`);
  }
  return Object.freeze({
    schemaVersion: 1,
    seriesId,
    experimentRef: normalizeExperimentRef(value.experimentRef),
    frozenInputRef: normalizeArtifactRef(value.frozenInputRef, 'Series frozenInputRef'),
    runtimeVersionId: nonEmpty(value.runtimeVersionId, 'Series runtimeVersionId'),
    measurementSetSnapshot: Object.freeze(measurementSetSnapshot),
    requestedRunCount,
    seedPolicy: normalizeSeedPolicy(value.seedPolicy),
    maximumSimulationSeconds: simulationSecondsLimit(value.maximumSimulationSeconds, 'Series maximumSimulationSeconds'),
    status: normalizeSeriesStatus(value.status),
    runIds: Object.freeze(runIds),
    createdAtIso: isoString(value.createdAtIso, 'Series createdAtIso'),
    completedAtIso: value.completedAtIso === null ? null : isoString(value.completedAtIso, 'Series completedAtIso'),
  });
}

function normalizeRunRecord(value: CombatLabRunRecordV1): CombatLabRunRecordV1 {
  if (value.schemaVersion !== 1) throw new Error('Unsupported CombatLabRunRecord schemaVersion.');
  const runId = nonEmpty(value.runId, 'RunId');
  const measurementValues = value.measurementValues.map(normalizeMeasurementValue);
  assertUnique(measurementValues.map((item) => item.measurementDefinitionId), `Run ${runId} measurementDefinitionId`);
  return Object.freeze({
    schemaVersion: 1,
    runId,
    seriesId: nonEmpty(value.seriesId, 'Run seriesId'),
    runIndex: nonNegativeInteger(value.runIndex, 'Run runIndex'),
    experimentRef: normalizeExperimentRef(value.experimentRef),
    frozenInputRef: normalizeArtifactRef(value.frozenInputRef, 'Run frozenInputRef'),
    runtimeVersionId: nonEmpty(value.runtimeVersionId, 'Run runtimeVersionId'),
    seed: positiveUint32(value.seed, 'Run seed'),
    maximumSimulationSeconds: simulationSecondsLimit(value.maximumSimulationSeconds, 'Run maximumSimulationSeconds'),
    status: normalizeRunStatus(value.status),
    success: nullableBoolean(value.success, 'Run success'),
    stopReason: requireString(value.stopReason, 'Run stopReason'),
    simulatedSeconds: finiteNonNegative(value.simulatedSeconds, 'Run simulatedSeconds'),
    measurementValues: Object.freeze(measurementValues),
    telemetryRef: value.telemetryRef === null ? null : normalizeArtifactRef(value.telemetryRef, 'Run telemetryRef'),
    journalRef: value.journalRef === null ? null : normalizeArtifactRef(value.journalRef, 'Run journalRef'),
    eventDigest: nonEmpty(value.eventDigest, 'Run eventDigest'),
    finalStateDigest: nonEmpty(value.finalStateDigest, 'Run finalStateDigest'),
  });
}

function parseSeriesRecord(value: unknown): CombatLabSeriesRecordV1 {
  if (!isRecord(value)) throw new Error('Invalid Series record.');
  return normalizeSeriesRecord({
    schemaVersion: value.schemaVersion as 1,
    seriesId: value.seriesId as string,
    experimentRef: parseExperimentRef(value.experimentRef),
    frozenInputRef: parseArtifactRef(value.frozenInputRef),
    runtimeVersionId: value.runtimeVersionId as string,
    measurementSetSnapshot: readRequiredArray(value.measurementSetSnapshot, 'Series measurementSetSnapshot').map(parseMeasurementSnapshotRef),
    requestedRunCount: value.requestedRunCount as number,
    seedPolicy: value.seedPolicy as CombatLabSeriesRecordV1['seedPolicy'],
    maximumSimulationSeconds: value.maximumSimulationSeconds as number,
    status: value.status as CombatLabSeriesRecordStatusV1,
    runIds: readRequiredArray(value.runIds, 'Series runIds').map((item) => {
      if (typeof item !== 'string') throw new Error('Series runId must be a string.');
      return item;
    }),
    createdAtIso: value.createdAtIso as string,
    completedAtIso: value.completedAtIso === null ? null : value.completedAtIso as string,
  });
}

function parseRunRecord(value: unknown): CombatLabRunRecordV1 {
  if (!isRecord(value)) throw new Error('Invalid Run record.');
  return normalizeRunRecord({
    schemaVersion: value.schemaVersion as 1,
    runId: value.runId as string,
    seriesId: value.seriesId as string,
    runIndex: value.runIndex as number,
    experimentRef: parseExperimentRef(value.experimentRef),
    frozenInputRef: parseArtifactRef(value.frozenInputRef),
    runtimeVersionId: value.runtimeVersionId as string,
    seed: value.seed as number,
    maximumSimulationSeconds: value.maximumSimulationSeconds as number,
    status: value.status as CombatLabRunRecordStatusV1,
    success: value.success as boolean | null,
    stopReason: value.stopReason as string,
    simulatedSeconds: value.simulatedSeconds as number,
    measurementValues: readRequiredArray(value.measurementValues, 'Run measurementValues').map(parseMeasurementValue),
    telemetryRef: value.telemetryRef === null ? null : parseArtifactRef(value.telemetryRef),
    journalRef: value.journalRef === null ? null : parseArtifactRef(value.journalRef),
    eventDigest: value.eventDigest as string,
    finalStateDigest: value.finalStateDigest as string,
  });
}

function validateSeriesRunLinkage(series: CombatLabSeriesRecordV1, runs: readonly CombatLabRunRecordV1[]): void {
  assertUnique(runs.map((run) => run.runId), `Series ${series.seriesId} RunId`);
  assertUnique(runs.map((run) => String(run.runIndex)), `Series ${series.seriesId} runIndex`);
  const recordById = new Map(runs.map((run) => [run.runId, run] as const));
  if (recordById.size !== series.runIds.length) {
    throw new Error(`Series ${series.seriesId} runIds do not match archive RunRecords.`);
  }
  for (let index = 0; index < series.runIds.length; index += 1) {
    const runId = series.runIds[index]!;
    const run = recordById.get(runId);
    if (!run) throw new Error(`Series ${series.seriesId} references missing RunRecord ${runId}.`);
    if (run.seriesId !== series.seriesId) throw new Error(`Run ${run.runId} belongs to different Series ${run.seriesId}.`);
    if (run.runIndex !== index) throw new Error(`Run ${run.runId} runIndex ${run.runIndex} does not match Series order ${index}.`);
    if (!sameExperimentRef(run.experimentRef, series.experimentRef)) throw new Error(`Run ${run.runId} experimentRef differs from Series.`);
    if (!sameArtifactRef(run.frozenInputRef, series.frozenInputRef)) throw new Error(`Run ${run.runId} frozenInputRef differs from Series.`);
    if (run.runtimeVersionId !== series.runtimeVersionId) throw new Error(`Run ${run.runId} runtimeVersionId differs from Series.`);
    if (run.maximumSimulationSeconds !== series.maximumSimulationSeconds) {
      throw new Error(`Run ${run.runId} maximumSimulationSeconds differs from Series.`);
    }
    validateRunMeasurementSet(run, series.measurementSetSnapshot);
  }
}

function validateRunMeasurementSet(
  run: CombatLabRunRecordV1,
  measurementSet: readonly CombatLabMeasurementSnapshotRefV1[],
): void {
  const definitionById = new Map(measurementSet.map((item) => [item.measurementDefinitionId, item] as const));
  for (const value of run.measurementValues) {
    const definition = definitionById.get(value.measurementDefinitionId);
    if (!definition) throw new Error(`Run ${run.runId} contains value for measurement outside frozen Series set: ${value.measurementDefinitionId}.`);
    if (definition.revision !== value.measurementDefinitionRevision
      || definition.fingerprint !== value.measurementDefinitionFingerprint) {
      throw new Error(`Run ${run.runId} measurement value does not match frozen Series measurement ${value.measurementDefinitionId}.`);
    }
  }
}

function normalizeExperimentRef(value: CombatLabExperimentIdentityRefV1): CombatLabExperimentIdentityRefV1 {
  return Object.freeze({
    experimentId: nonEmpty(value.experimentId, 'experimentId'),
    experimentRevision: nonNegativeInteger(value.experimentRevision, 'experimentRevision'),
    sourceDigest: nonEmpty(value.sourceDigest, 'sourceDigest'),
  });
}

function normalizeArtifactRef(value: CombatLabFrozenArtifactRefV1, label: string): CombatLabFrozenArtifactRefV1 {
  return Object.freeze({
    artifactId: nonEmpty(value.artifactId, `${label}.artifactId`),
    schemaId: nonEmpty(value.schemaId, `${label}.schemaId`),
    schemaVersion: positiveInteger(value.schemaVersion, `${label}.schemaVersion`),
    contentDigest: nonEmpty(value.contentDigest, `${label}.contentDigest`),
  });
}

function normalizeMeasurementSnapshotRef(value: CombatLabMeasurementSnapshotRefV1): CombatLabMeasurementSnapshotRefV1 {
  return Object.freeze({
    measurementDefinitionId: nonEmpty(value.measurementDefinitionId, 'measurementDefinitionId'),
    revision: positiveInteger(value.revision, 'measurement revision'),
    fingerprint: nonEmpty(value.fingerprint, 'measurement fingerprint'),
    titleRu: nonEmpty(value.titleRu, 'measurement titleRu'),
    streamId: nonEmpty(value.streamId, 'measurement streamId'),
  });
}

function normalizeMeasurementValue(value: CombatLabRunMeasurementValueV1): CombatLabRunMeasurementValueV1 {
  return Object.freeze({
    measurementDefinitionId: nonEmpty(value.measurementDefinitionId, 'measurement value id'),
    measurementDefinitionRevision: positiveInteger(value.measurementDefinitionRevision, 'measurement value revision'),
    measurementDefinitionFingerprint: nonEmpty(value.measurementDefinitionFingerprint, 'measurement value fingerprint'),
    value: finite(value.value, 'measurement value'),
    sampleCount: nonNegativeInteger(value.sampleCount, 'measurement sampleCount'),
  });
}

function parseExperimentRef(value: unknown): CombatLabExperimentIdentityRefV1 {
  if (!isRecord(value)) throw new Error('Invalid experimentRef.');
  return {
    experimentId: value.experimentId as string,
    experimentRevision: value.experimentRevision as number,
    sourceDigest: value.sourceDigest as string,
  };
}

function parseArtifactRef(value: unknown): CombatLabFrozenArtifactRefV1 {
  if (!isRecord(value)) throw new Error('Invalid artifact ref.');
  return {
    artifactId: value.artifactId as string,
    schemaId: value.schemaId as string,
    schemaVersion: value.schemaVersion as number,
    contentDigest: value.contentDigest as string,
  };
}

function parseMeasurementSnapshotRef(value: unknown): CombatLabMeasurementSnapshotRefV1 {
  if (!isRecord(value)) throw new Error('Invalid measurement snapshot ref.');
  return {
    measurementDefinitionId: value.measurementDefinitionId as string,
    revision: value.revision as number,
    fingerprint: value.fingerprint as string,
    titleRu: value.titleRu as string,
    streamId: value.streamId as string,
  };
}

function parseMeasurementValue(value: unknown): CombatLabRunMeasurementValueV1 {
  if (!isRecord(value)) throw new Error('Invalid measurement value.');
  return {
    measurementDefinitionId: value.measurementDefinitionId as string,
    measurementDefinitionRevision: value.measurementDefinitionRevision as number,
    measurementDefinitionFingerprint: value.measurementDefinitionFingerprint as string,
    value: value.value as number,
    sampleCount: value.sampleCount as number,
  };
}

function sameExperimentRef(left: CombatLabExperimentIdentityRefV1, right: CombatLabExperimentIdentityRefV1): boolean {
  return left.experimentId === right.experimentId
    && left.experimentRevision === right.experimentRevision
    && left.sourceDigest === right.sourceDigest;
}

function sameArtifactRef(left: CombatLabFrozenArtifactRefV1, right: CombatLabFrozenArtifactRefV1): boolean {
  return left.artifactId === right.artifactId
    && left.schemaId === right.schemaId
    && left.schemaVersion === right.schemaVersion
    && left.contentDigest === right.contentDigest;
}

function normalizeSeriesStatus(value: CombatLabSeriesRecordStatusV1): CombatLabSeriesRecordStatusV1 {
  if (value === 'setup' || value === 'running' || value === 'completed' || value === 'stopped' || value === 'failed') return value;
  throw new Error(`Invalid Series status: ${String(value)}.`);
}

function normalizeRunStatus(value: CombatLabRunRecordStatusV1): CombatLabRunRecordStatusV1 {
  if (value === 'completed' || value === 'failed' || value === 'stopped') return value;
  throw new Error(`Invalid Run status: ${String(value)}.`);
}

function normalizeSeedPolicy(value: CombatLabSeriesRecordV1['seedPolicy']): CombatLabSeriesRecordV1['seedPolicy'] {
  if (value === 'random_per_run' || value === 'explicit') return value;
  throw new Error(`Invalid Series seedPolicy: ${String(value)}.`);
}

function isoString(value: unknown, label: string): string {
  const text = nonEmpty(value, label);
  const milliseconds = Date.parse(text);
  if (!Number.isFinite(milliseconds)) throw new Error(`${label} must be an ISO date-time string.`);
  return new Date(milliseconds).toISOString();
}

function simulationSecondsLimit(value: unknown, label: string): number {
  if (typeof value !== 'number'
    || !Number.isFinite(value)
    || value < MINIMUM_SIMULATION_SECONDS
    || value > MAXIMUM_SIMULATION_SECONDS) {
    throw new Error(`${label} must be in ${MINIMUM_SIMULATION_SECONDS}..${MAXIMUM_SIMULATION_SECONDS}.`);
  }
  return value;
}

function positiveUint32(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 0xffff_ffff) {
    throw new Error(`${label} must be an integer in 1..4294967295.`);
  }
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

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be finite.`);
  return value;
}

function nullableBoolean(value: unknown, label: string): boolean | null {
  if (value === null) return null;
  if (typeof value !== 'boolean') throw new Error(`${label} must be boolean or null.`);
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string.`);
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

function readRequiredArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
