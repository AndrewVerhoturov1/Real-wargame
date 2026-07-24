import {
  cancelPhysicalAction,
  completePhysicalAction,
  getPhysicalActionLease,
  requestPhysicalActionChannels,
} from '../../actions/PhysicalActionCoordinator';
import {
  normalizePhysicalActionHandle,
  normalizePhysicalActionOwner,
} from '../../actions/PhysicalActionCoordinatorSerialization';
import type { PhysicalActionOwner } from '../../actions/PhysicalActionCoordinatorTypes';
import { getCombatUnitSpatialIndex } from '../../combat/CombatUnitSpatialIndex';
import type { HitZone } from '../../combat/UnitHitShapes';
import type { SimulationState } from '../../simulation/SimulationState';
import type { UnitModel } from '../../units/UnitModel';
import type { DefinitionRef } from '../catalogs/CombatCatalogTypes';
import { advanceBloodRuntimeTo, refreshUnitBleedingRateAt } from './BloodLossRuntime';
import { getEffectiveCombatCapabilities } from './EffectiveCombatCapabilities';
import { compareHitZones, isHitZone, isWoundBleedingState, woundSeverityIndex } from './InfantryBodyTypes';
import {
  APPLY_FIRST_AID_ACTION_SCHEMA_VERSION,
  FIRST_AID_ACTION_TYPE,
  FIRST_AID_MAX_DISTANCE_METRES,
  FIRST_AID_REQUIRED_WORK_TICKS,
  FIRST_AID_TERMINAL_RESULT_SCHEMA_VERSION,
  MAX_APPLIED_FIRST_AID_ACTION_IDS,
  UNIT_MEDICAL_RUNTIME_SCHEMA_VERSION,
  type ApplyFirstAidActionV1,
  type FirstAidTerminalResultV1,
  type UnitMedicalRuntimeV1,
} from './PhysiologyTypes';
import {
  applyPreparedFirstAidTreatment,
  prepareFirstAidTreatment,
  type PreparedFirstAidTreatmentV1,
} from './WoundRuntime';

const FIRST_AID_CHANNELS = ['locomotion', 'weapon'] as const;
const EPSILON = 1e-9;

export interface RequestFirstAidInput {
  readonly owner: PhysicalActionOwner;
  readonly ownerToken: string;
  readonly targetUnitId: string;
  readonly zone: HitZone | null;
  readonly requestedSeconds: number;
}

export interface RequestFirstAidResult {
  readonly accepted: boolean;
  readonly status: 'started' | 'already_running' | 'blocked' | 'denied';
  readonly action: ApplyFirstAidActionV1 | null;
  readonly reasonCode: string;
  readonly reasonRu: string;
}

export function createUnitMedicalRuntime(): UnitMedicalRuntimeV1 {
  return {
    schemaVersion: UNIT_MEDICAL_RUNTIME_SCHEMA_VERSION,
    loadoutRef: null,
    firstAidCharges: 0,
    maximumFirstAidCharges: 0,
    nextFirstAidSequence: 1,
    activeFirstAidAction: null,
    lastFirstAidResult: null,
    appliedFirstAidActionIds: [],
  };
}

export function normalizeUnitMedicalRuntime(value: unknown): UnitMedicalRuntimeV1 {
  if (!isRecord(value) || value.schemaVersion !== UNIT_MEDICAL_RUNTIME_SCHEMA_VERSION) {
    return createUnitMedicalRuntime();
  }
  const maximum = integer(value.maximumFirstAidCharges, 0, 0, Number.MAX_SAFE_INTEGER);
  return {
    schemaVersion: UNIT_MEDICAL_RUNTIME_SCHEMA_VERSION,
    loadoutRef: normalizeDefinitionRef(value.loadoutRef),
    firstAidCharges: integer(value.firstAidCharges, 0, 0, maximum),
    maximumFirstAidCharges: maximum,
    nextFirstAidSequence: integer(value.nextFirstAidSequence, 1, 1, Number.MAX_SAFE_INTEGER),
    activeFirstAidAction: normalizeFirstAidAction(value.activeFirstAidAction),
    lastFirstAidResult: normalizeFirstAidTerminalResult(value.lastFirstAidResult),
    appliedFirstAidActionIds: uniqueTexts(value.appliedFirstAidActionIds).slice(-MAX_APPLIED_FIRST_AID_ACTION_IDS),
  };
}

export function serializeUnitMedicalRuntime(value: UnitMedicalRuntimeV1): UnitMedicalRuntimeV1 {
  return normalizeUnitMedicalRuntime(structuredClone(value));
}

/** Exact same loadout is idempotent; only a different explicit refit replenishes charges. */
export function initializeUnitMedicalInventory(
  unit: UnitModel,
  loadoutRef: DefinitionRef,
  firstAidCharges: number,
): void {
  const ref = normalizeDefinitionRef(loadoutRef);
  if (!ref) return;
  const medical = unit.infantryCombatRuntime.medical;
  if (medical.loadoutRef && refsEqual(medical.loadoutRef, ref)) return;
  const charges = integer(firstAidCharges, 0, 0, Number.MAX_SAFE_INTEGER);
  medical.loadoutRef = ref;
  medical.firstAidCharges = charges;
  medical.maximumFirstAidCharges = charges;
  medical.activeFirstAidAction = null;
  medical.lastFirstAidResult = null;
  medical.appliedFirstAidActionIds = [];
}

export function requestApplyFirstAidAction(
  state: SimulationState,
  actor: UnitModel,
  input: RequestFirstAidInput,
): RequestFirstAidResult {
  const ownerToken = cleanText(input.ownerToken);
  const targetUnitId = cleanText(input.targetUnitId);
  if (!ownerToken || !targetUnitId || !Number.isFinite(input.requestedSeconds) || input.requestedSeconds < 0) {
    return denied('infantry_first_aid_invalid_request', 'Запрос первой помощи заполнен неверно.');
  }
  const actorCapabilities = getEffectiveCombatCapabilities(actor);
  if (!actorCapabilities.alive || !actorCapabilities.conscious || !actorCapabilities.canUseHands) {
    return denied('infantry_first_aid_actor_incapable', 'Боец физически не способен оказывать первую помощь.');
  }
  const medical = actor.infantryCombatRuntime.medical;
  if (medical.firstAidCharges <= 0) {
    return denied('infantry_first_aid_no_charges', 'У бойца нет зарядов первой помощи.');
  }
  const target = getCombatUnitSpatialIndex(state).unitsById.get(targetUnitId) ?? null;
  if (!target) return denied('infantry_first_aid_target_missing', 'Цель первой помощи не найдена.');
  if (actor.id !== target.id && actor.side !== target.side) {
    return denied('infantry_first_aid_enemy_target', 'Нельзя оказывать первую помощь противнику.');
  }
  if (!getEffectiveCombatCapabilities(target).alive) {
    return denied('infantry_first_aid_target_dead', 'Погибшему бойцу первая помощь не применяется.');
  }
  if (!withinFirstAidRange(state, actor, target)) {
    return denied('infantry_first_aid_out_of_range', 'Цель находится слишком далеко для первой помощи.');
  }
  const resolvedZone = resolveFirstAidZone(target, input.zone);
  if (!resolvedZone) {
    return denied('infantry_first_aid_no_treatable_bleeding', 'У цели нет кровотечения, требующего первой помощи.');
  }

  const running = medical.activeFirstAidAction;
  if (running) {
    if (running.ownerToken === ownerToken && running.targetUnitId === target.id && running.resolvedZone === resolvedZone) {
      return accepted('already_running', running, 'infantry_first_aid_already_running', 'Такая первая помощь уже выполняется.');
    }
    return blocked(running, 'infantry_first_aid_owned_by_other', 'Другое действие первой помощи уже принадлежит владельцу.');
  }

  const sequence = medical.nextFirstAidSequence;
  const acquisition = requestPhysicalActionChannels(actor, {
    actionType: FIRST_AID_ACTION_TYPE,
    owner: input.owner,
    ownerToken,
    channels: FIRST_AID_CHANNELS,
    startedSeconds: input.requestedSeconds,
    reasonCode: 'infantry_first_aid_requested',
    reasonRu: 'Начато оказание первой помощи.',
  });
  if (!acquisition.accepted || !acquisition.handle) {
    return blocked(null, 'infantry_first_aid_channels_blocked', acquisition.reasonRu);
  }

  const action: ApplyFirstAidActionV1 = {
    schemaVersion: APPLY_FIRST_AID_ACTION_SCHEMA_VERSION,
    actionId: `${actor.id}:first-aid:${sequence}`,
    sequence,
    actionHandle: { ...acquisition.handle },
    owner: normalizePhysicalActionOwner(input.owner, ownerToken),
    ownerToken,
    targetUnitId: target.id,
    requestedZone: input.zone,
    resolvedZone,
    startedSeconds: canonicalSeconds(input.requestedSeconds),
    completedWorkTicks: 0,
    phase: 'working',
    resultCode: null,
    resultRu: null,
  };
  medical.activeFirstAidAction = action;
  medical.nextFirstAidSequence = Math.min(Number.MAX_SAFE_INTEGER, sequence + 1);
  actor.movementRuntime.isMoving = false;
  actor.movementRuntime.velocityCellsPerSecond = { x: 0, y: 0 };
  return accepted('started', action, 'infantry_first_aid_started', 'Начато оказание первой помощи.');
}

/** Processes one shared 0.25 second boundary in stable action-ID order. */
export function tickFirstAidActionsAtBoundary(state: SimulationState, boundarySeconds: number): void {
  const entries: Array<{ actor: UnitModel; action: ApplyFirstAidActionV1; valid: boolean }> = [];
  for (const actor of state.units) {
    const action = actor.infantryCombatRuntime.medical.activeFirstAidAction;
    if (action) entries.push({ actor, action, valid: false });
  }
  if (entries.length === 0) return;
  entries.sort((left, right) => compareText(left.action.actionId, right.action.actionId));
  const unitIndex = getCombatUnitSpatialIndex(state);

  for (const entry of entries) {
    const failure = validateRunningFirstAid(state, entry.actor, entry.action, unitIndex.unitsById);
    if (failure) {
      finishFirstAidWithoutCharge(entry.actor, entry.action, boundarySeconds, 'cancelled', failure.code, failure.reasonRu);
      continue;
    }
    entry.valid = true;
    entry.action.completedWorkTicks = Math.min(
      FIRST_AID_REQUIRED_WORK_TICKS,
      entry.action.completedWorkTicks + 1,
    );
  }

  for (const entry of entries) {
    if (!entry.valid || entry.action.completedWorkTicks < FIRST_AID_REQUIRED_WORK_TICKS) continue;
    completeFirstAidAction(state, entry.actor, entry.action, boundarySeconds, unitIndex.unitsById);
  }
}

export function cancelActiveFirstAidAction(
  actor: UnitModel,
  endedSeconds: number,
  resultCode: string,
  resultRu: string,
): boolean {
  const action = actor.infantryCombatRuntime.medical.activeFirstAidAction;
  if (!action) return false;
  finishFirstAidWithoutCharge(actor, action, endedSeconds, 'cancelled', resultCode, resultRu);
  return true;
}

export function resolveFirstAidZone(target: UnitModel, requestedZone: HitZone | null): HitZone | null {
  if (requestedZone !== null) {
    if (!isHitZone(requestedZone)) return null;
    const slot = target.infantryCombatRuntime.wounds.slots.find((entry) => entry.zone === requestedZone);
    return slot && needsFirstAid(slot.bleedingState) ? requestedZone : null;
  }
  const candidates = target.infantryCombatRuntime.wounds.slots.filter((slot) => needsFirstAid(slot.bleedingState));
  candidates.sort((left, right) => {
    const bleedingPriority = bleedingStatePriority(left.bleedingState) - bleedingStatePriority(right.bleedingState);
    if (bleedingPriority !== 0) return bleedingPriority;
    const rate = right.bleedingRatePerSecond - left.bleedingRatePerSecond;
    if (Math.abs(rate) > EPSILON) return rate;
    const severity = woundSeverityIndex(right.severity) - woundSeverityIndex(left.severity);
    return severity || compareHitZones(left.zone, right.zone);
  });
  return candidates[0]?.zone ?? null;
}

function completeFirstAidAction(
  state: SimulationState,
  actor: UnitModel,
  action: ApplyFirstAidActionV1,
  boundarySeconds: number,
  unitsById: ReadonlyMap<string, UnitModel>,
): void {
  const medical = actor.infantryCombatRuntime.medical;
  if (medical.appliedFirstAidActionIds.includes(action.actionId)) {
    finishFirstAidWithoutCharge(actor, action, boundarySeconds, 'completed', 'infantry_first_aid_already_applied', 'Результат первой помощи уже был применён.');
    return;
  }
  const target = unitsById.get(action.targetUnitId) ?? null;
  if (!target || medical.firstAidCharges <= 0 || !hasExactLease(actor, action)) {
    finishFirstAidWithoutCharge(actor, action, boundarySeconds, 'failed', 'infantry_first_aid_completion_invalid', 'Первая помощь не завершена: условия изменились.');
    return;
  }
  const prepared = prepareFirstAidTreatment(
    target.infantryCombatRuntime.wounds,
    action.resolvedZone,
    action.actionId,
    boundarySeconds,
  );
  if (!prepared.applied) {
    finishFirstAidWithoutCharge(actor, action, boundarySeconds, 'completed', 'target_no_longer_needs_aid', 'Цель больше не нуждается в этой стадии первой помощи.');
    return;
  }
  applyFirstAidCompletionCandidate(actor, target, action, prepared, boundarySeconds);
}

function applyFirstAidCompletionCandidate(
  actor: UnitModel,
  target: UnitModel,
  action: ApplyFirstAidActionV1,
  prepared: PreparedFirstAidTreatmentV1,
  boundarySeconds: number,
): void {
  const medical = actor.infantryCombatRuntime.medical;
  advanceBloodRuntimeTo(target.infantryCombatRuntime.physiology.blood, boundarySeconds);
  if (!applyPreparedFirstAidTreatment(target.infantryCombatRuntime.wounds, prepared)) {
    finishFirstAidWithoutCharge(actor, action, boundarySeconds, 'failed', 'infantry_first_aid_candidate_rejected', 'Подготовленный результат первой помощи не применён.');
    return;
  }
  medical.firstAidCharges -= 1;
  insertSortedUniqueBounded(medical.appliedFirstAidActionIds, action.actionId, MAX_APPLIED_FIRST_AID_ACTION_IDS);
  refreshUnitBleedingRateAt(target, boundarySeconds);
  const result = terminalResult(actor, action, boundarySeconds, 'completed', true, 'infantry_first_aid_completed', 'Первая помощь успешно завершена.');
  medical.lastFirstAidResult = result;
  if (action.actionHandle) {
    completePhysicalAction(actor, action.actionHandle, {
      endedSeconds: boundarySeconds,
      resultCode: result.resultCode,
      resultRu: result.resultRu,
    });
  }
  medical.activeFirstAidAction = null;
}

function validateRunningFirstAid(
  state: SimulationState,
  actor: UnitModel,
  action: ApplyFirstAidActionV1,
  unitsById: ReadonlyMap<string, UnitModel>,
): { code: string; reasonRu: string } | null {
  const capabilities = getEffectiveCombatCapabilities(actor);
  if (!capabilities.alive || !capabilities.conscious || !capabilities.canUseHands) {
    return { code: 'infantry_first_aid_actor_incapable', reasonRu: 'Первая помощь отменена: боец потерял способность лечить.' };
  }
  if (!hasExactLease(actor, action)) {
    return { code: 'infantry_first_aid_lease_lost', reasonRu: 'Первая помощь отменена: захват физических каналов потерян.' };
  }
  const target = unitsById.get(action.targetUnitId) ?? null;
  if (!target) return { code: 'infantry_first_aid_target_missing', reasonRu: 'Первая помощь отменена: цель исчезла.' };
  if (actor.id !== target.id && actor.side !== target.side) {
    return { code: 'infantry_first_aid_enemy_target', reasonRu: 'Первая помощь отменена: цель больше не является союзником.' };
  }
  if (!getEffectiveCombatCapabilities(target).alive) {
    return { code: 'infantry_first_aid_target_dead', reasonRu: 'Первая помощь отменена: цель погибла.' };
  }
  if (!withinFirstAidRange(state, actor, target)) {
    return { code: 'infantry_first_aid_out_of_range', reasonRu: 'Первая помощь отменена: цель вышла из допустимой дальности.' };
  }
  const slot = target.infantryCombatRuntime.wounds.slots.find((entry) => entry.zone === action.resolvedZone);
  if (!slot || !needsFirstAid(slot.bleedingState)) {
    return { code: 'target_no_longer_needs_aid', reasonRu: 'Первая помощь отменена: выбранная зона больше не требует лечения.' };
  }
  return null;
}

function finishFirstAidWithoutCharge(
  actor: UnitModel,
  action: ApplyFirstAidActionV1,
  endedSeconds: number,
  status: FirstAidTerminalResultV1['status'],
  resultCode: string,
  resultRu: string,
): void {
  const medical = actor.infantryCombatRuntime.medical;
  const result = terminalResult(actor, action, endedSeconds, status, false, resultCode, resultRu);
  medical.lastFirstAidResult = result;
  if (action.actionHandle) {
    cancelPhysicalAction(actor, action.actionHandle, {
      endedSeconds,
      resultCode,
      resultRu,
    });
  }
  if (medical.activeFirstAidAction?.actionId === action.actionId) medical.activeFirstAidAction = null;
}

function terminalResult(
  actor: UnitModel,
  action: ApplyFirstAidActionV1,
  endedSeconds: number,
  status: FirstAidTerminalResultV1['status'],
  chargeSpent: boolean,
  resultCode: string,
  resultRu: string,
): FirstAidTerminalResultV1 {
  return {
    schemaVersion: FIRST_AID_TERMINAL_RESULT_SCHEMA_VERSION,
    actionId: action.actionId,
    status,
    actorUnitId: actor.id,
    targetUnitId: action.targetUnitId,
    zone: action.resolvedZone,
    endedSeconds: canonicalSeconds(endedSeconds),
    chargeSpent,
    resultCode,
    resultRu,
  };
}

function normalizeFirstAidAction(value: unknown): ApplyFirstAidActionV1 | null {
  if (!isRecord(value) || value.schemaVersion !== APPLY_FIRST_AID_ACTION_SCHEMA_VERSION) return null;
  const actionId = cleanText(value.actionId);
  const ownerToken = cleanText(value.ownerToken);
  const targetUnitId = cleanText(value.targetUnitId);
  if (!actionId || !ownerToken || !targetUnitId || !isHitZone(value.resolvedZone)) return null;
  return {
    schemaVersion: APPLY_FIRST_AID_ACTION_SCHEMA_VERSION,
    actionId,
    sequence: integer(value.sequence, 1, 1, Number.MAX_SAFE_INTEGER),
    actionHandle: normalizePhysicalActionHandle(value.actionHandle),
    owner: normalizePhysicalActionOwner(value.owner, ownerToken),
    ownerToken,
    targetUnitId,
    requestedZone: isHitZone(value.requestedZone) ? value.requestedZone : null,
    resolvedZone: value.resolvedZone,
    startedSeconds: canonicalSeconds(finiteNonNegative(value.startedSeconds, 0)),
    completedWorkTicks: integer(value.completedWorkTicks, 0, 0, FIRST_AID_REQUIRED_WORK_TICKS),
    phase: 'working',
    resultCode: nullableText(value.resultCode),
    resultRu: nullableText(value.resultRu),
  };
}

function normalizeFirstAidTerminalResult(value: unknown): FirstAidTerminalResultV1 | null {
  if (!isRecord(value) || value.schemaVersion !== FIRST_AID_TERMINAL_RESULT_SCHEMA_VERSION
    || !isHitZone(value.zone)) return null;
  const status = value.status;
  if (status !== 'completed' && status !== 'cancelled' && status !== 'denied' && status !== 'failed') return null;
  const actionId = cleanText(value.actionId);
  const actorUnitId = cleanText(value.actorUnitId);
  const targetUnitId = cleanText(value.targetUnitId);
  const resultCode = cleanText(value.resultCode);
  const resultRu = cleanText(value.resultRu);
  if (!actionId || !actorUnitId || !targetUnitId || !resultCode || !resultRu) return null;
  return {
    schemaVersion: FIRST_AID_TERMINAL_RESULT_SCHEMA_VERSION,
    actionId,
    status,
    actorUnitId,
    targetUnitId,
    zone: value.zone,
    endedSeconds: canonicalSeconds(finiteNonNegative(value.endedSeconds, 0)),
    chargeSpent: value.chargeSpent === true,
    resultCode,
    resultRu,
  };
}

function hasExactLease(actor: UnitModel, action: ApplyFirstAidActionV1): boolean {
  return Boolean(action.actionHandle && getPhysicalActionLease(actor, action.actionHandle));
}
function withinFirstAidRange(state: Pick<SimulationState, 'map'>, actor: UnitModel, target: UnitModel): boolean {
  const distanceMetres = Math.hypot(
    actor.position.x - target.position.x,
    actor.position.y - target.position.y,
  ) * state.map.metersPerCell;
  return distanceMetres <= FIRST_AID_MAX_DISTANCE_METRES + EPSILON;
}
function needsFirstAid(value: unknown): boolean { return value === 'severe' || value === 'critical'; }
function bleedingStatePriority(value: unknown): number { return value === 'critical' ? 0 : value === 'severe' ? 1 : 2; }
function normalizeDefinitionRef(value: unknown): DefinitionRef | null {
  if (!isRecord(value)) return null;
  const definitionId = cleanText(value.definitionId);
  const revision = integer(value.revision, 0, 0, Number.MAX_SAFE_INTEGER);
  return definitionId && revision > 0 ? { definitionId, revision } : null;
}
function refsEqual(left: DefinitionRef, right: DefinitionRef): boolean {
  return left.definitionId === right.definitionId && left.revision === right.revision;
}
function uniqueTexts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanText).filter(Boolean))].sort(compareText);
}
function insertSortedUniqueBounded(target: string[], value: string, capacity: number): void {
  if (target.includes(value)) return;
  target.push(value);
  target.sort(compareText);
  if (target.length > capacity) target.splice(0, target.length - capacity);
}
function accepted(status: 'started' | 'already_running', action: ApplyFirstAidActionV1, reasonCode: string, reasonRu: string): RequestFirstAidResult {
  return { accepted: true, status, action, reasonCode, reasonRu };
}
function blocked(action: ApplyFirstAidActionV1 | null, reasonCode: string, reasonRu: string): RequestFirstAidResult {
  return { accepted: false, status: 'blocked', action, reasonCode, reasonRu };
}
function denied(reasonCode: string, reasonRu: string): RequestFirstAidResult {
  return { accepted: false, status: 'denied', action: null, reasonCode, reasonRu };
}
function cleanText(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function nullableText(value: unknown): string | null { return cleanText(value) || null; }
function finite(value: unknown, fallback: number): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }
function finiteNonNegative(value: unknown, fallback: number): number { return Math.max(0, finite(value, fallback)); }
function integer(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.round(finite(value, fallback))));
}
function canonicalSeconds(value: number): number { return Math.round(Math.max(0, value) * 1_000_000_000_000) / 1_000_000_000_000; }
function compareText(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
