import {
  PHYSICAL_ACTION_COORDINATOR_SCHEMA_VERSION,
  type PhysicalActionChannel,
  type PhysicalActionCoordinatorUnitLike,
  type PhysicalActionHandleV1,
  type PhysicalActionLeaseV1,
  type PhysicalActionOwner,
  type PhysicalActionTerminalResultV1,
} from './PhysicalActionCoordinatorTypes';
import {
  normalizePhysicalActionChannels,
  normalizePhysicalActionCoordinatorState,
  physicalActionHandlesEqual,
} from './PhysicalActionCoordinatorSerialization';

export interface ReconciledPhysicalActionPayloadV1 {
  actionHandle?: PhysicalActionHandleV1 | null;
}

export interface PhysicalActionReconciliationActionV1 {
  readonly payload: ReconciledPhysicalActionPayloadV1;
  readonly actionId: string;
  readonly sequence: number;
  readonly actionType: string;
  readonly owner: PhysicalActionOwner;
  readonly ownerToken: string;
  readonly channels: readonly PhysicalActionChannel[];
  readonly startedSeconds: number;
  readonly reasonCode: string;
  readonly reasonRu: string;
}

export interface PhysicalActionReconciliationInputV1 {
  readonly actions: readonly PhysicalActionReconciliationActionV1[];
  readonly knownActionTypes?: readonly string[];
  readonly reconciledSeconds?: number;
}

export interface PhysicalActionReconciliationResultV1 {
  readonly changed: boolean;
  readonly restoredLeaseCount: number;
  readonly removedOrphanCount: number;
  readonly blockedActionIds: string[];
  readonly reasonCode: string | null;
  readonly reasonRu: string | null;
}

export function reconcilePhysicalActionCoordinatorState(
  unit: PhysicalActionCoordinatorUnitLike,
  input: PhysicalActionReconciliationInputV1,
): PhysicalActionReconciliationResultV1 {
  const state = unit.behaviorRuntime.physicalActionCoordinator;
  const normalized = normalizePhysicalActionCoordinatorState(state);
  let changed = !coordinatorStatesEqual(state, normalized);
  if (changed) replaceCoordinatorState(state, normalized);

  const actions = input.actions
    .filter(isUsableAction)
    .map((action) => ({ ...action, channels: normalizePhysicalActionChannels(action.channels) }))
    .sort(compareActions);
  const knownActionTypes = canonicalStrings(input.knownActionTypes ?? actions.map((action) => action.actionType));
  const expectedByHandle = new Map<string, PhysicalActionReconciliationActionV1>();
  for (const action of actions) {
    const handle = action.payload.actionHandle;
    if (handle) expectedByHandle.set(handleKey(handle), action);
  }

  let removedOrphanCount = 0;
  for (let index = state.activeLeases.length - 1; index >= 0; index -= 1) {
    const lease = state.activeLeases[index];
    if (!knownActionTypes.includes(lease.actionType)) continue;
    const exact = expectedByHandle.has(handleKey(lease.handle));
    const compatible = actions.some((action) => (
      action.actionType === lease.actionType
      && action.ownerToken === lease.handle.ownerToken
      && channelsEqual(action.channels, lease.channels)
    ));
    if (exact || compatible) continue;
    state.activeLeases.splice(index, 1);
    state.revision += 1;
    state.lastResult = orphanResult(lease, finiteNonNegative(input.reconciledSeconds, lease.startedSeconds));
    state.lastDiagnosticCode = 'physical_action_orphan_lease_removed';
    state.lastDiagnosticRu = 'При восстановлении удалён захват канала без работающего действия.';
    removedOrphanCount += 1;
    changed = true;
  }

  let restoredLeaseCount = 0;
  const blockedActionIds: string[] = [];
  for (const action of actions) {
    const exact = action.payload.actionHandle
      ? state.activeLeases.find((lease) => physicalActionHandlesEqual(lease.handle, action.payload.actionHandle))
      : null;
    if (exact) continue;

    const compatible = state.activeLeases.find((lease) => (
      lease.actionType === action.actionType
      && lease.handle.ownerToken === action.ownerToken
      && channelsEqual(lease.channels, action.channels)
    ));
    if (compatible) {
      action.payload.actionHandle = compatible.handle;
      continue;
    }

    if (state.activeLeases.some((lease) => lease.channels.some((channel) => action.channels.includes(channel)))) {
      blockedActionIds.push(action.actionId);
      action.payload.actionHandle = null;
      continue;
    }

    const sequence = Math.max(1, Math.round(action.sequence));
    const revision = state.revision + 1;
    const handle: PhysicalActionHandleV1 = {
      actionId: cleanText(action.actionId, `${unit.id}:physical-action:${sequence}`),
      sequence,
      revision,
      ownerToken: cleanText(action.ownerToken, `${action.owner.source}:${action.owner.id}`),
    };
    const lease: PhysicalActionLeaseV1 = {
      schemaVersion: PHYSICAL_ACTION_COORDINATOR_SCHEMA_VERSION,
      handle,
      actionType: action.actionType,
      owner: { ...action.owner },
      channels: [...action.channels],
      startedSeconds: finiteNonNegative(action.startedSeconds, 0),
      reasonCode: cleanText(action.reasonCode, 'physical_action_reconciled'),
      reasonRu: cleanText(action.reasonRu, 'Физическое действие восстановлено.'),
    };
    state.activeLeases.push(lease);
    state.activeLeases.sort(compareLeases);
    state.revision = revision;
    state.nextSequence = Math.max(state.nextSequence, sequence + 1);
    state.lastDiagnosticCode = 'physical_action_lease_reconstructed';
    state.lastDiagnosticRu = 'При восстановлении создан отсутствующий захват каналов.';
    action.payload.actionHandle = handle;
    restoredLeaseCount += 1;
    changed = true;
  }

  const knownPayloadSequence = readKnownPayloadSequence(unit);
  if (knownPayloadSequence >= state.nextSequence) {
    state.nextSequence = Math.min(Number.MAX_SAFE_INTEGER, knownPayloadSequence + 1);
    state.revision += 1;
    state.lastDiagnosticCode = 'physical_action_terminal_sequence_restored';
    state.lastDiagnosticRu = 'При восстановлении учтён номер завершённого физического действия.';
    changed = true;
  }

  if (blockedActionIds.length > 0) {
    state.lastDiagnosticCode = 'physical_action_reconciliation_blocked';
    state.lastDiagnosticRu = `Не удалось восстановить действия из-за конфликта каналов: ${blockedActionIds.join(', ')}.`;
  }

  return {
    changed,
    restoredLeaseCount,
    removedOrphanCount,
    blockedActionIds,
    reasonCode: state.lastDiagnosticCode,
    reasonRu: state.lastDiagnosticRu,
  };
}

function orphanResult(lease: PhysicalActionLeaseV1, endedSeconds: number): PhysicalActionTerminalResultV1 {
  return {
    handle: { ...lease.handle },
    actionType: lease.actionType,
    owner: { ...lease.owner },
    channels: [...lease.channels],
    status: 'failed',
    resultCode: 'physical_action_orphan_lease_removed',
    resultRu: 'Захват каналов удалён: соответствующее действие не восстановлено.',
    endedSeconds,
  };
}

function isUsableAction(action: PhysicalActionReconciliationActionV1): boolean {
  return Boolean(
    cleanText(action.actionId, '')
    && cleanText(action.actionType, '')
    && cleanText(action.ownerToken, '')
    && normalizePhysicalActionChannels(action.channels).length > 0,
  );
}

function readKnownPayloadSequence(unit: PhysicalActionCoordinatorUnitLike): number {
  const sequence = unit.behaviorRuntime.physicalAction?.sequence;
  if (typeof sequence !== 'number' || !Number.isFinite(sequence)) return 0;
  return Math.max(0, Math.min(Number.MAX_SAFE_INTEGER - 1, Math.round(sequence)));
}

function replaceCoordinatorState(
  target: ReturnType<typeof normalizePhysicalActionCoordinatorState>,
  source: ReturnType<typeof normalizePhysicalActionCoordinatorState>,
): void {
  target.revision = source.revision;
  target.nextSequence = source.nextSequence;
  target.activeLeases = source.activeLeases;
  target.lastResult = source.lastResult;
  target.lastDiagnosticCode = source.lastDiagnosticCode;
  target.lastDiagnosticRu = source.lastDiagnosticRu;
}

function coordinatorStatesEqual(
  left: ReturnType<typeof normalizePhysicalActionCoordinatorState>,
  right: ReturnType<typeof normalizePhysicalActionCoordinatorState>,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function canonicalStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => cleanText(value, '')).filter(Boolean))].sort();
}

function handleKey(handle: PhysicalActionHandleV1): string {
  return `${handle.actionId}\n${handle.sequence}\n${handle.revision}\n${handle.ownerToken}`;
}

function channelsEqual(left: readonly PhysicalActionChannel[], right: readonly PhysicalActionChannel[]): boolean {
  return left.length === right.length && left.every((channel, index) => channel === right[index]);
}

function compareActions(left: PhysicalActionReconciliationActionV1, right: PhysicalActionReconciliationActionV1): number {
  return left.sequence - right.sequence
    || left.actionType.localeCompare(right.actionType)
    || left.actionId.localeCompare(right.actionId)
    || left.ownerToken.localeCompare(right.ownerToken);
}

function compareLeases(left: PhysicalActionLeaseV1, right: PhysicalActionLeaseV1): number {
  return left.handle.sequence - right.handle.sequence
    || left.handle.actionId.localeCompare(right.handle.actionId);
}

function cleanText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function finiteNonNegative(value: unknown, fallback: number): number {
  return Math.max(0, typeof value === 'number' && Number.isFinite(value) ? value : fallback);
}
