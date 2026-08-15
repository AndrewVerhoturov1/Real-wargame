import type { SimulationState } from '../../../simulation/SimulationState';
import { digestStableValue } from '../CombatLabDigest';

export const COMBAT_LAB_TELEMETRY_STREAM_IDS = [
  'fire.shot_committed',
  'fire.impact',
  'suppression.level',
  'detection.contact',
  'wounds.changed',
  'soldier.state',
  'movement.position',
  'orders.state',
  'position.cover',
  'actions.result',
  'machine_gun.state',
  'developer.projectile_diagnostics',
] as const;

export type CombatLabTelemetryStreamIdV1 = (typeof COMBAT_LAB_TELEMETRY_STREAM_IDS)[number];
export type CombatLabTelemetryStreamGroupV1 =
  | 'fire'
  | 'suppression'
  | 'detection'
  | 'wounds'
  | 'soldier_state'
  | 'movement'
  | 'orders'
  | 'position_cover'
  | 'actions'
  | 'machine_gun'
  | 'developer';

export type CombatLabMeasurementBoundaryV1 =
  | Readonly<{ kind: 'run_start' }>
  | Readonly<{ kind: 'run_end' }>
  | Readonly<{ kind: 'simulation_time'; seconds: number }>
  | Readonly<{
      kind: 'program_step';
      experimentId: string;
      experimentRevision: number;
      trackId: string;
      stepId: string;
      edge: 'enter' | 'exit';
    }>;

export interface CombatLabMeasurementCollectionPeriodV1 {
  readonly start: CombatLabMeasurementBoundaryV1;
  readonly end: CombatLabMeasurementBoundaryV1;
}

export interface CombatLabMeasurementStateConstraintV1 {
  readonly field: string;
  readonly operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
  readonly value: string | number | boolean;
}

export interface CombatLabMeasurementDefinitionV1 {
  readonly schemaVersion: 1;
  readonly measurementDefinitionId: string;
  readonly revision: number;
  readonly fingerprint: string;
  readonly titleRu: string;
  readonly streamId: CombatLabTelemetryStreamIdV1;
  readonly participantUnitIds: readonly string[];
  readonly stateConstraints: readonly CombatLabMeasurementStateConstraintV1[];
  readonly collectionPeriod: CombatLabMeasurementCollectionPeriodV1;
  readonly enabled: boolean;
}

export interface CombatLabTelemetryStreamCapabilityV1 {
  readonly streamId: CombatLabTelemetryStreamIdV1;
  readonly group: CombatLabTelemetryStreamGroupV1;
  readonly titleRu: string;
  readonly supported: boolean;
  readonly supportsParticipants: boolean;
  readonly supportsStateConstraints: boolean;
  readonly reasonRu: string | null;
}

export type CombatLabTelemetryEntityKindV1 =
  | 'unit'
  | 'shot'
  | 'impact'
  | 'projectile'
  | 'weapon'
  | 'weapon_definition'
  | 'ammo_definition';

export interface CombatLabTelemetryEntityRefV1 {
  readonly kind: CombatLabTelemetryEntityKindV1;
  readonly id: string;
}

export interface CombatLabTelemetryRecordV1 {
  readonly schemaVersion: 1;
  readonly recordId: string;
  readonly runId: string;
  readonly measurementDefinitionId: string;
  readonly measurementDefinitionRevision: number;
  readonly measurementDefinitionFingerprint: string;
  readonly streamId: CombatLabTelemetryStreamIdV1;
  readonly simulatedSeconds: number;
  readonly sourceEntityRefs: readonly CombatLabTelemetryEntityRefV1[];
  readonly payload: Readonly<Record<string, string | number | boolean | null>>;
}

export interface CombatLabResolvedMeasurementPeriodV1 {
  readonly measurementDefinitionId: string;
  readonly measurementDefinitionRevision: number;
  readonly startSeconds: number;
  readonly endSeconds: number | null;
}

export interface CombatLabTelemetryCursorV1 {
  readonly committedShotIndex: number;
  readonly impactIndex: number;
}

export interface CombatLabTelemetryCollectionResultV1 {
  readonly records: readonly CombatLabTelemetryRecordV1[];
  readonly cursor: CombatLabTelemetryCursorV1;
}

export interface CreateCombatLabMeasurementDefinitionInputV1 {
  readonly measurementDefinitionId: string;
  readonly titleRu: string;
  readonly streamId: CombatLabTelemetryStreamIdV1;
  readonly participantUnitIds?: readonly string[];
  readonly stateConstraints?: readonly CombatLabMeasurementStateConstraintV1[];
  readonly collectionPeriod?: CombatLabMeasurementCollectionPeriodV1;
  readonly enabled?: boolean;
}

export interface CollectCombatLabTelemetryInputV1 {
  readonly state: SimulationState;
  readonly runId: string;
  readonly definitions: readonly CombatLabMeasurementDefinitionV1[];
  readonly cursor?: CombatLabTelemetryCursorV1;
  readonly resolvedPeriods?: readonly CombatLabResolvedMeasurementPeriodV1[];
}

const STREAM_CAPABILITIES: readonly CombatLabTelemetryStreamCapabilityV1[] = Object.freeze([
  capability('fire.shot_committed', 'fire', 'Совершённый выстрел', true, true, false, null),
  capability('fire.impact', 'fire', 'Попадание / воздействие снаряда', true, true, false, null),
  capability('suppression.level', 'suppression', 'Подавление', false, true, true, 'Нужен отдельный событийный/семплируемый поток suppression, а не итоговый агрегат.'),
  capability('detection.contact', 'detection', 'Обнаружение', false, true, true, 'Нужен канонический telemetry adapter perception/contact events.'),
  capability('wounds.changed', 'wounds', 'Ранения и поражение', false, true, true, 'Нужен канонический wound-event adapter с устойчивой идентичностью изменения.'),
  capability('soldier.state', 'soldier_state', 'Состояние бойца', false, true, true, 'Нужен versioned state-sampling contract и политика частоты сбора.'),
  capability('movement.position', 'movement', 'Движение', false, true, true, 'Нужен versioned movement sampling/event contract.'),
  capability('orders.state', 'orders', 'Маршрут и приказы', false, true, true, 'Нужен structured orders/route telemetry adapter.'),
  capability('position.cover', 'position_cover', 'Позиция и укрытие', false, true, true, 'Нужен simulation-owned cover/position query stream; UI не вычисляет cover.'),
  capability('actions.result', 'actions', 'Действия', false, true, true, 'Нужен общий action-result adapter поверх product action owners.'),
  capability('machine_gun.state', 'machine_gun', 'Пулемётный расчёт', false, true, true, 'Нужен отдельный machine-gun-team telemetry contract.'),
  capability('developer.projectile_diagnostics', 'developer', 'Диагностика снарядов', false, false, false, 'Текущие diagnostics являются агрегатами; raw developer stream ещё не определён.'),
]);

const CAPABILITY_BY_ID = new Map(STREAM_CAPABILITIES.map((item) => [item.streamId, item] as const));

export function listCombatLabTelemetryStreamCapabilities(): readonly CombatLabTelemetryStreamCapabilityV1[] {
  return STREAM_CAPABILITIES;
}

export function getCombatLabTelemetryStreamCapability(
  streamId: CombatLabTelemetryStreamIdV1,
): CombatLabTelemetryStreamCapabilityV1 {
  const capability = CAPABILITY_BY_ID.get(streamId);
  if (!capability) throw new Error(`Unknown Combat Lab telemetry stream: ${streamId}.`);
  return capability;
}

export function createCombatLabMeasurementDefinition(
  input: CreateCombatLabMeasurementDefinitionInputV1,
): CombatLabMeasurementDefinitionV1 {
  const base = normalizeDefinitionFields({
    measurementDefinitionId: input.measurementDefinitionId,
    revision: 1,
    titleRu: input.titleRu,
    streamId: input.streamId,
    participantUnitIds: input.participantUnitIds ?? [],
    stateConstraints: input.stateConstraints ?? [],
    collectionPeriod: input.collectionPeriod ?? defaultCollectionPeriod(),
    enabled: input.enabled !== false,
  });
  assertDefinitionSupported(base);
  return freezeDefinition({ ...base, fingerprint: fingerprintDefinition(base) });
}

export function reviseCombatLabMeasurementDefinition(
  current: CombatLabMeasurementDefinitionV1,
  patch: Readonly<Partial<Omit<CreateCombatLabMeasurementDefinitionInputV1, 'measurementDefinitionId'>>>,
): CombatLabMeasurementDefinitionV1 {
  const base = normalizeDefinitionFields({
    measurementDefinitionId: current.measurementDefinitionId,
    revision: current.revision + 1,
    titleRu: patch.titleRu ?? current.titleRu,
    streamId: patch.streamId ?? current.streamId,
    participantUnitIds: patch.participantUnitIds ?? current.participantUnitIds,
    stateConstraints: patch.stateConstraints ?? current.stateConstraints,
    collectionPeriod: patch.collectionPeriod ?? current.collectionPeriod,
    enabled: patch.enabled ?? current.enabled,
  });
  assertDefinitionSupported(base);
  return freezeDefinition({ ...base, fingerprint: fingerprintDefinition(base) });
}

export function duplicateCombatLabMeasurementDefinition(
  current: CombatLabMeasurementDefinitionV1,
  measurementDefinitionId: string,
  titleRu: string = `${current.titleRu} — копия`,
): CombatLabMeasurementDefinitionV1 {
  return createCombatLabMeasurementDefinition({
    measurementDefinitionId,
    titleRu,
    streamId: current.streamId,
    participantUnitIds: current.participantUnitIds,
    stateConstraints: current.stateConstraints,
    collectionPeriod: current.collectionPeriod,
    enabled: current.enabled,
  });
}

export function setCombatLabMeasurementDefinitionEnabled(
  current: CombatLabMeasurementDefinitionV1,
  enabled: boolean,
): CombatLabMeasurementDefinitionV1 {
  if (current.enabled === enabled) return current;
  return reviseCombatLabMeasurementDefinition(current, { enabled });
}

export function collectCombatLabTelemetry(
  input: CollectCombatLabTelemetryInputV1,
): CombatLabTelemetryCollectionResultV1 {
  const runId = nonEmpty(input.runId, 'Telemetry runId');
  assertUniqueDefinitions(input.definitions);
  const cursor = normalizeCursor(input.cursor, input.state);
  const resolvedPeriodById = buildResolvedPeriodMap(input.resolvedPeriods ?? []);
  const activeDefinitions = input.definitions.filter((definition) => {
    if (!definition.enabled) return false;
    assertDefinitionSupported(definition);
    return true;
  });
  const shotDefinitions = activeDefinitions.filter((definition) => definition.streamId === 'fire.shot_committed');
  const impactDefinitions = activeDefinitions.filter((definition) => definition.streamId === 'fire.impact');
  const records: CombatLabTelemetryRecordV1[] = [];

  const committedShots = input.state.infantryCombatProjectiles.committedShots;
  for (let index = cursor.committedShotIndex; index < committedShots.length; index += 1) {
    const shot = committedShots[index]!;
    for (const definition of shotDefinitions) {
      if (!participantMatches(definition, shot.shooterId)) continue;
      if (!periodMatches(definition, shot.committedSimulationSeconds, resolvedPeriodById)) continue;
      records.push(buildShotRecord(runId, definition, shot));
    }
  }

  const impacts = input.state.infantryCombatProjectiles.impacts;
  for (let index = cursor.impactIndex; index < impacts.length; index += 1) {
    const impact = impacts[index]!;
    for (const definition of impactDefinitions) {
      if (!participantMatches(definition, impact.shooterId, impact.hitUnitId)) continue;
      if (!periodMatches(definition, impact.impactSeconds, resolvedPeriodById)) continue;
      records.push(buildImpactRecord(runId, definition, impact));
    }
  }

  return Object.freeze({
    records: Object.freeze(records),
    cursor: Object.freeze({
      committedShotIndex: committedShots.length,
      impactIndex: impacts.length,
    }),
  });
}

function buildShotRecord(
  runId: string,
  definition: CombatLabMeasurementDefinitionV1,
  shot: SimulationState['infantryCombatProjectiles']['committedShots'][number],
): CombatLabTelemetryRecordV1 {
  const sourceEntityRefs: CombatLabTelemetryEntityRefV1[] = [
    entityRef('unit', shot.shooterId),
    entityRef('shot', shot.shotId),
    entityRef('weapon', shot.weaponInstanceId),
    entityRef('weapon_definition', definitionRefId(shot.weaponDefinitionRef)),
    entityRef('ammo_definition', definitionRefId(shot.ammoDefinitionRef)),
  ];
  return freezeRecord({
    schemaVersion: 1,
    recordId: `${runId}:${definition.measurementDefinitionId}:shot:${shot.shotId}`,
    runId,
    measurementDefinitionId: definition.measurementDefinitionId,
    measurementDefinitionRevision: definition.revision,
    measurementDefinitionFingerprint: definition.fingerprint,
    streamId: definition.streamId,
    simulatedSeconds: canonicalSeconds(shot.committedSimulationSeconds),
    sourceEntityRefs,
    payload: {
      shotId: shot.shotId,
      shooterId: shot.shooterId,
      fireTaskId: shot.fireTaskId,
      weaponInstanceId: shot.weaponInstanceId,
      roundsConsumed: Math.max(0, shot.roundsBefore - shot.roundsAfter),
      roundsBefore: shot.roundsBefore,
      roundsAfter: shot.roundsAfter,
      predictedHitProbability: finiteOrNull(shot.predictedHitProbability),
      effectiveDispersionRadians: finiteOrNull(shot.effectiveDispersionRadians),
      fireTaskShotOrdinal: finiteOrNull(shot.fireTaskShotOrdinal),
    },
  });
}

function buildImpactRecord(
  runId: string,
  definition: CombatLabMeasurementDefinitionV1,
  impact: SimulationState['infantryCombatProjectiles']['impacts'][number],
): CombatLabTelemetryRecordV1 {
  const sourceEntityRefs: CombatLabTelemetryEntityRefV1[] = [
    entityRef('unit', impact.shooterId),
    entityRef('shot', impact.shotId),
    entityRef('projectile', impact.projectileId),
    entityRef('impact', impact.impactId),
  ];
  if (impact.hitUnitId) sourceEntityRefs.push(entityRef('unit', impact.hitUnitId));
  return freezeRecord({
    schemaVersion: 1,
    recordId: `${runId}:${definition.measurementDefinitionId}:impact:${impact.impactId}`,
    runId,
    measurementDefinitionId: definition.measurementDefinitionId,
    measurementDefinitionRevision: definition.revision,
    measurementDefinitionFingerprint: definition.fingerprint,
    streamId: definition.streamId,
    simulatedSeconds: canonicalSeconds(impact.impactSeconds),
    sourceEntityRefs,
    payload: {
      impactId: impact.impactId,
      shotId: impact.shotId,
      shooterId: impact.shooterId,
      hitType: impact.hitType,
      hitUnitId: impact.hitUnitId,
      hitObjectId: impact.hitObjectId,
      hitZone: impact.hitZone,
      materialId: impact.materialId,
      xMetres: impact.point.x,
      yMetres: impact.point.y,
      zMetres: impact.point.z,
    },
  });
}

function periodMatches(
  definition: CombatLabMeasurementDefinitionV1,
  simulatedSeconds: number,
  resolvedPeriodById: ReadonlyMap<string, CombatLabResolvedMeasurementPeriodV1>,
): boolean {
  const resolved = resolvePeriod(definition, resolvedPeriodById);
  if (simulatedSeconds < resolved.startSeconds) return false;
  return resolved.endSeconds === null || simulatedSeconds <= resolved.endSeconds;
}

function resolvePeriod(
  definition: CombatLabMeasurementDefinitionV1,
  resolvedPeriodById: ReadonlyMap<string, CombatLabResolvedMeasurementPeriodV1>,
): { startSeconds: number; endSeconds: number | null } {
  const start = boundarySeconds(definition.collectionPeriod.start, true);
  const end = boundarySeconds(definition.collectionPeriod.end, false);
  if (start !== undefined && end !== undefined) {
    if (end !== null && end < start) throw new Error(`Measurement ${definition.measurementDefinitionId} has an inverted collection period.`);
    return { startSeconds: start, endSeconds: end };
  }
  const resolved = resolvedPeriodById.get(definition.measurementDefinitionId);
  if (!resolved || resolved.measurementDefinitionRevision !== definition.revision) {
    throw new Error(`Measurement ${definition.measurementDefinitionId} requires resolved Program-anchor collection bounds.`);
  }
  if (resolved.endSeconds !== null && resolved.endSeconds < resolved.startSeconds) {
    throw new Error(`Measurement ${definition.measurementDefinitionId} resolved period is inverted.`);
  }
  return { startSeconds: resolved.startSeconds, endSeconds: resolved.endSeconds };
}

function boundarySeconds(boundary: CombatLabMeasurementBoundaryV1, start: boolean): number | null | undefined {
  if (boundary.kind === 'run_start') return 0;
  if (boundary.kind === 'run_end') return start ? undefined : null;
  if (boundary.kind === 'simulation_time') return boundary.seconds;
  return undefined;
}

function participantMatches(
  definition: CombatLabMeasurementDefinitionV1,
  primaryUnitId: string,
  secondaryUnitId: string | null = null,
): boolean {
  if (definition.participantUnitIds.length === 0) return true;
  return definition.participantUnitIds.includes(primaryUnitId)
    || (secondaryUnitId !== null && definition.participantUnitIds.includes(secondaryUnitId));
}

function normalizeDefinitionFields(input: {
  readonly measurementDefinitionId: string;
  readonly revision: number;
  readonly titleRu: string;
  readonly streamId: CombatLabTelemetryStreamIdV1;
  readonly participantUnitIds: readonly string[];
  readonly stateConstraints: readonly CombatLabMeasurementStateConstraintV1[];
  readonly collectionPeriod: CombatLabMeasurementCollectionPeriodV1;
  readonly enabled: boolean;
}) {
  if (!Number.isInteger(input.revision) || input.revision < 1) throw new Error('Measurement revision must be a positive integer.');
  const measurementDefinitionId = nonEmpty(input.measurementDefinitionId, 'MeasurementDefinitionId');
  const titleRu = nonEmpty(input.titleRu, 'Measurement title');
  getCombatLabTelemetryStreamCapability(input.streamId);
  const participantUnitIds = input.participantUnitIds.map((id) => nonEmpty(id, 'Measurement participant unitId'));
  assertUnique(participantUnitIds, `Measurement ${measurementDefinitionId} participant unitId`);
  const stateConstraints = input.stateConstraints.map(normalizeConstraint);
  const collectionPeriod = normalizeCollectionPeriod(input.collectionPeriod);
  return {
    schemaVersion: 1 as const,
    measurementDefinitionId,
    revision: input.revision,
    titleRu,
    streamId: input.streamId,
    participantUnitIds: Object.freeze(participantUnitIds),
    stateConstraints: Object.freeze(stateConstraints),
    collectionPeriod,
    enabled: Boolean(input.enabled),
  };
}

function assertDefinitionSupported(definition: {
  readonly measurementDefinitionId: string;
  readonly streamId: CombatLabTelemetryStreamIdV1;
  readonly participantUnitIds: readonly string[];
  readonly stateConstraints: readonly CombatLabMeasurementStateConstraintV1[];
}): void {
  const capability = getCombatLabTelemetryStreamCapability(definition.streamId);
  if (!capability.supported) {
    throw new Error(`Measurement ${definition.measurementDefinitionId} uses unavailable stream ${definition.streamId}: ${capability.reasonRu ?? 'unsupported'}`);
  }
  if (definition.participantUnitIds.length > 0 && !capability.supportsParticipants) {
    throw new Error(`Measurement ${definition.measurementDefinitionId} stream ${definition.streamId} does not support participant filters.`);
  }
  if (definition.stateConstraints.length > 0 && !capability.supportsStateConstraints) {
    throw new Error(`Measurement ${definition.measurementDefinitionId} stream ${definition.streamId} does not support state constraints yet.`);
  }
}

function normalizeConstraint(value: CombatLabMeasurementStateConstraintV1): CombatLabMeasurementStateConstraintV1 {
  return Object.freeze({
    field: nonEmpty(value.field, 'Measurement state constraint field'),
    operator: value.operator,
    value: value.value,
  });
}

function normalizeCollectionPeriod(period: CombatLabMeasurementCollectionPeriodV1): CombatLabMeasurementCollectionPeriodV1 {
  return Object.freeze({
    start: normalizeBoundary(period.start),
    end: normalizeBoundary(period.end),
  });
}

function normalizeBoundary(boundary: CombatLabMeasurementBoundaryV1): CombatLabMeasurementBoundaryV1 {
  if (boundary.kind === 'run_start' || boundary.kind === 'run_end') return Object.freeze({ kind: boundary.kind });
  if (boundary.kind === 'simulation_time') {
    if (!Number.isFinite(boundary.seconds) || boundary.seconds < 0) throw new Error('Measurement time boundary must be finite and non-negative.');
    return Object.freeze({ kind: 'simulation_time', seconds: canonicalSeconds(boundary.seconds) });
  }
  if (!Number.isInteger(boundary.experimentRevision) || boundary.experimentRevision < 0) {
    throw new Error('Measurement Program anchor experimentRevision must be a non-negative integer.');
  }
  return Object.freeze({
    kind: 'program_step',
    experimentId: nonEmpty(boundary.experimentId, 'Measurement Program anchor experimentId'),
    experimentRevision: boundary.experimentRevision,
    trackId: nonEmpty(boundary.trackId, 'Measurement Program anchor trackId'),
    stepId: nonEmpty(boundary.stepId, 'Measurement Program anchor stepId'),
    edge: boundary.edge,
  });
}

function defaultCollectionPeriod(): CombatLabMeasurementCollectionPeriodV1 {
  return Object.freeze({
    start: Object.freeze({ kind: 'run_start' as const }),
    end: Object.freeze({ kind: 'run_end' as const }),
  });
}

function fingerprintDefinition(definition: unknown): string {
  return digestStableValue(definition);
}

function freezeDefinition(
  definition: Omit<CombatLabMeasurementDefinitionV1, 'fingerprint'> & { readonly fingerprint: string },
): CombatLabMeasurementDefinitionV1 {
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

function buildResolvedPeriodMap(
  periods: readonly CombatLabResolvedMeasurementPeriodV1[],
): ReadonlyMap<string, CombatLabResolvedMeasurementPeriodV1> {
  const map = new Map<string, CombatLabResolvedMeasurementPeriodV1>();
  for (const item of periods) {
    const id = nonEmpty(item.measurementDefinitionId, 'Resolved measurementDefinitionId');
    if (map.has(id)) throw new Error(`Duplicate resolved measurement period for ${id}.`);
    if (!Number.isInteger(item.measurementDefinitionRevision) || item.measurementDefinitionRevision < 1) {
      throw new Error(`Resolved measurement ${id} revision must be positive.`);
    }
    if (!Number.isFinite(item.startSeconds) || item.startSeconds < 0) throw new Error(`Resolved measurement ${id} startSeconds is invalid.`);
    if (item.endSeconds !== null && (!Number.isFinite(item.endSeconds) || item.endSeconds < 0)) {
      throw new Error(`Resolved measurement ${id} endSeconds is invalid.`);
    }
    map.set(id, Object.freeze({
      ...item,
      startSeconds: canonicalSeconds(item.startSeconds),
      endSeconds: item.endSeconds === null ? null : canonicalSeconds(item.endSeconds),
    }));
  }
  return map;
}

function normalizeCursor(
  cursor: CombatLabTelemetryCursorV1 | undefined,
  state: SimulationState,
): CombatLabTelemetryCursorV1 {
  const committedShotIndex = cursor?.committedShotIndex ?? 0;
  const impactIndex = cursor?.impactIndex ?? 0;
  if (!Number.isInteger(committedShotIndex) || committedShotIndex < 0 || committedShotIndex > state.infantryCombatProjectiles.committedShots.length) {
    throw new Error('Telemetry committedShotIndex is invalid for current state.');
  }
  if (!Number.isInteger(impactIndex) || impactIndex < 0 || impactIndex > state.infantryCombatProjectiles.impacts.length) {
    throw new Error('Telemetry impactIndex is invalid for current state.');
  }
  return Object.freeze({ committedShotIndex, impactIndex });
}

function assertUniqueDefinitions(definitions: readonly CombatLabMeasurementDefinitionV1[]): void {
  const ids = new Set<string>();
  for (const definition of definitions) {
    if (ids.has(definition.measurementDefinitionId)) {
      throw new Error(`Duplicate MeasurementDefinitionId: ${definition.measurementDefinitionId}.`);
    }
    ids.add(definition.measurementDefinitionId);
  }
}

function freezeRecord(record: CombatLabTelemetryRecordV1): CombatLabTelemetryRecordV1 {
  return Object.freeze({
    ...record,
    sourceEntityRefs: Object.freeze(record.sourceEntityRefs.map((item) => Object.freeze({ ...item }))),
    payload: Object.freeze({ ...record.payload }),
  });
}

function entityRef(kind: CombatLabTelemetryEntityKindV1, id: string): CombatLabTelemetryEntityRefV1 {
  return Object.freeze({ kind, id: nonEmpty(id, `Telemetry ${kind} id`) });
}

function definitionRefId(value: { readonly id: string; readonly revision?: number }): string {
  return value.revision === undefined ? value.id : `${value.id}@${value.revision}`;
}

function capability(
  streamId: CombatLabTelemetryStreamIdV1,
  group: CombatLabTelemetryStreamGroupV1,
  titleRu: string,
  supported: boolean,
  supportsParticipants: boolean,
  supportsStateConstraints: boolean,
  reasonRu: string | null,
): CombatLabTelemetryStreamCapabilityV1 {
  return Object.freeze({ streamId, group, titleRu, supported, supportsParticipants, supportsStateConstraints, reasonRu });
}

function assertUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`${label} must be unique: ${value}.`);
    seen.add(value);
  }
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} must be a non-empty string.`);
  return value.trim();
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function canonicalSeconds(value: number): number {
  return Math.round(Math.max(0, Number.isFinite(value) ? value : 0) * 1_000_000_000) / 1_000_000_000;
}
