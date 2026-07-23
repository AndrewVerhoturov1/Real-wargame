import {
  PHYSICAL_ACTION_CHANNELS,
  PHYSICAL_ACTION_COORDINATOR_SCHEMA_VERSION,
  type FinishPhysicalActionInput,
  type PhysicalActionChannel,
  type PhysicalActionConflictV1,
  type PhysicalActionCoordinatorDiagnosticsV1,
  type PhysicalActionCoordinatorStateV1,
  type PhysicalActionCoordinatorUnitLike,
  type PhysicalActionFinishResultV1,
  type PhysicalActionHandleV1,
  type PhysicalActionLeaseDiagnosticV1,
  type PhysicalActionLeaseV1,
  type PhysicalActionRequestResultV1,
  type PhysicalActionTerminalResultV1,
  type PhysicalActionTerminalStatus,
  type RequestPhysicalActionChannelsInput,
} from './PhysicalActionCoordinatorTypes';
import {
  clonePhysicalActionTerminalResult,
  normalizePhysicalActionChannels,
  normalizePhysicalActionCoordinatorState,
  normalizePhysicalActionOwner,
  physicalActionHandlesEqual,
  serializePhysicalActionCoordinatorState,
} from './PhysicalActionCoordinatorSerialization';

export {
  PHYSICAL_ACTION_CHANNELS,
  PHYSICAL_ACTION_COORDINATOR_SCHEMA_VERSION,
  normalizePhysicalActionCoordinatorState,
  serializePhysicalActionCoordinatorState,
};
export type * from './PhysicalActionCoordinatorTypes';

export function createPhysicalActionCoordinatorState(): PhysicalActionCoordinatorStateV1 {
  return {
    schemaVersion: PHYSICAL_ACTION_COORDINATOR_SCHEMA_VERSION,
    revision: 0,
    nextSequence: 1,
    activeLeases: [],
    lastResult: null,
    lastDiagnosticCode: null,
    lastDiagnosticRu: null,
  };
}

export function requestPhysicalActionChannels(
  unit: PhysicalActionCoordinatorUnitLike,
  input: RequestPhysicalActionChannelsInput,
): PhysicalActionRequestResultV1 {
  const state = unit.behaviorRuntime.physicalActionCoordinator;
  const actionType = cleanText(input.actionType, '');
  const ownerToken = cleanText(input.ownerToken, '');
  const channels = normalizePhysicalActionChannels(input.channels);
  if (!unit.id.trim() || !actionType || !ownerToken || channels.length === 0) {
    return requestRejected(
      'invalid_request',
      'physical_action_invalid_request',
      'Запрос физического действия заполнен неверно.',
    );
  }

  const existing = state.activeLeases.find((lease) => (
    lease.actionType === actionType
    && lease.handle.ownerToken === ownerToken
    && channelsEqual(lease.channels, channels)
  ));
  if (existing) {
    return {
      accepted: true,
      status: 'already_running',
      handle: existing.handle,
      lease: existing,
      conflicts: [],
      reasonCode: 'physical_action_already_running',
      reasonRu: 'Такое физическое действие уже выполняется этим владельцем.',
    };
  }

  const conflicts = collectConflicts(state.activeLeases, channels);
  if (conflicts.length > 0) {
    return {
      accepted: false,
      status: 'blocked',
      handle: null,
      lease: null,
      conflicts,
      reasonCode: 'physical_action_channels_blocked',
      reasonRu: `Физическое действие заблокировано занятыми каналами: ${conflicts.map((item) => item.channel).join(', ')}.`,
    };
  }

  const sequence = Math.max(1, state.nextSequence);
  const revision = state.revision + 1;
  const owner = normalizePhysicalActionOwner(input.owner, ownerToken);
  const handle: PhysicalActionHandleV1 = {
    actionId: `${unit.id}:physical-action:${sequence}`,
    sequence,
    revision,
    ownerToken,
  };
  const lease: PhysicalActionLeaseV1 = {
    schemaVersion: PHYSICAL_ACTION_COORDINATOR_SCHEMA_VERSION,
    handle,
    actionType,
    owner,
    channels,
    startedSeconds: finiteNonNegative(input.startedSeconds, 0),
    reasonCode: cleanText(input.reasonCode, 'physical_action_requested'),
    reasonRu: cleanText(input.reasonRu, 'Начато физическое действие.'),
  };
  state.activeLeases.push(lease);
  state.activeLeases.sort(compareLeases);
  state.revision = revision;
  state.nextSequence = Math.min(Number.MAX_SAFE_INTEGER, sequence + 1);
  state.lastDiagnosticCode = null;
  state.lastDiagnosticRu = null;
  return {
    accepted: true,
    status: 'started',
    handle,
    lease,
    conflicts: [],
    reasonCode: 'physical_action_started',
    reasonRu: lease.reasonRu,
  };
}

export function completePhysicalAction(
  unit: PhysicalActionCoordinatorUnitLike,
  handle: PhysicalActionHandleV1,
  input: FinishPhysicalActionInput,
): PhysicalActionFinishResultV1 {
  return finishPhysicalAction(unit, handle, input, 'completed');
}

export function cancelPhysicalAction(
  unit: PhysicalActionCoordinatorUnitLike,
  handle: PhysicalActionHandleV1,
  input: FinishPhysicalActionInput,
): PhysicalActionFinishResultV1 {
  return finishPhysicalAction(unit, handle, input, 'cancelled');
}

export function failPhysicalAction(
  unit: PhysicalActionCoordinatorUnitLike,
  handle: PhysicalActionHandleV1,
  input: FinishPhysicalActionInput,
): PhysicalActionFinishResultV1 {
  return finishPhysicalAction(unit, handle, input, 'failed');
}

export function cancelPhysicalActionBySystem(
  unit: PhysicalActionCoordinatorUnitLike,
  actionId: string,
  input: FinishPhysicalActionInput,
): PhysicalActionFinishResultV1 {
  const normalizedActionId = cleanText(actionId, '');
  const reasonCode = cleanText(input.resultCode, '');
  const reasonRu = cleanText(input.resultRu, '');
  if (!normalizedActionId || !reasonCode || !reasonRu) {
    return finishRejected(
      'invalid_request',
      'physical_action_system_cancel_invalid',
      'Системная отмена требует идентификатор действия и явную причину.',
    );
  }
  const lease = unit.behaviorRuntime.physicalActionCoordinator.activeLeases.find(
    (candidate) => candidate.handle.actionId === normalizedActionId,
  );
  if (!lease) {
    const last = unit.behaviorRuntime.physicalActionCoordinator.lastResult;
    if (last?.handle.actionId === normalizedActionId) {
      return {
        accepted: true,
        status: 'already_finished',
        result: last,
        reasonCode: last.resultCode,
        reasonRu: last.resultRu,
      };
    }
    return finishRejected('not_found', 'physical_action_not_found', 'Активное физическое действие не найдено.');
  }
  return finishLease(unit, lease, input, 'cancelled');
}

export function getPhysicalActionLease(
  unit: PhysicalActionCoordinatorUnitLike,
  handle: PhysicalActionHandleV1,
): PhysicalActionLeaseV1 | null {
  return unit.behaviorRuntime.physicalActionCoordinator.activeLeases.find(
    (lease) => physicalActionHandlesEqual(lease.handle, handle),
  ) ?? null;
}

export function isPhysicalActionChannelAvailable(
  unit: PhysicalActionCoordinatorUnitLike,
  channel: PhysicalActionChannel,
): boolean {
  return !unit.behaviorRuntime.physicalActionCoordinator.activeLeases.some(
    (lease) => lease.channels.includes(channel),
  );
}

export function getPhysicalActionCoordinatorDiagnostics(
  unit: PhysicalActionCoordinatorUnitLike,
): PhysicalActionCoordinatorDiagnosticsV1 {
  const state = unit.behaviorRuntime.physicalActionCoordinator;
  const activeLeases = state.activeLeases.map(toLeaseDiagnostic);
  const channels: Record<PhysicalActionChannel, PhysicalActionLeaseDiagnosticV1 | null> = {
    locomotion: null,
    posture: null,
    weapon: null,
  };
  for (const lease of activeLeases) {
    for (const channel of lease.channels) channels[channel] = lease;
  }
  return {
    schemaVersion: state.schemaVersion,
    revision: state.revision,
    nextSequence: state.nextSequence,
    activeLeases,
    channels,
    lastResult: state.lastResult ? clonePhysicalActionTerminalResult(state.lastResult) : null,
    lastDiagnosticCode: state.lastDiagnosticCode,
    lastDiagnosticRu: state.lastDiagnosticRu,
  };
}

export function setPhysicalActionCoordinatorDiagnostic(
  unit: PhysicalActionCoordinatorUnitLike,
  reasonCode: string,
  reasonRu: string,
): void {
  const state = unit.behaviorRuntime.physicalActionCoordinator;
  state.lastDiagnosticCode = cleanText(reasonCode, 'physical_action_diagnostic');
  state.lastDiagnosticRu = cleanText(reasonRu, 'Диагностика физического действия обновлена.');
}

function finishPhysicalAction(
  unit: PhysicalActionCoordinatorUnitLike,
  handle: PhysicalActionHandleV1,
  input: FinishPhysicalActionInput,
  status: PhysicalActionTerminalStatus,
): PhysicalActionFinishResultV1 {
  const state = unit.behaviorRuntime.physicalActionCoordinator;
  const newer = state.activeLeases.find((lease) => (
    lease.handle.ownerToken === handle.ownerToken
    && lease.handle.sequence > handle.sequence
  ));
  if (newer) {
    return finishRejected(
      'stale_handle',
      'physical_action_stale_handle',
      'Старая команда не может завершить более новое физическое действие.',
    );
  }
  const lease = getPhysicalActionLease(unit, handle);
  if (lease) return finishLease(unit, lease, input, status);
  const last = state.lastResult;
  if (last && physicalActionHandlesEqual(last.handle, handle)) {
    return {
      accepted: true,
      status: 'already_finished',
      result: last,
      reasonCode: last.resultCode,
      reasonRu: last.resultRu,
    };
  }
  const related = state.activeLeases.some((candidate) => (
    candidate.handle.actionId === handle.actionId
    || candidate.handle.sequence === handle.sequence
  )) || Boolean(last && (
    last.handle.actionId === handle.actionId
    || last.handle.sequence === handle.sequence
  ));
  return finishRejected(
    related ? 'stale_handle' : 'not_found',
    related ? 'physical_action_stale_handle' : 'physical_action_not_found',
    related
      ? 'Старая команда не соответствует текущему физическому действию.'
      : 'Активное физическое действие не найдено.',
  );
}

function finishLease(
  unit: PhysicalActionCoordinatorUnitLike,
  lease: PhysicalActionLeaseV1,
  input: FinishPhysicalActionInput,
  status: PhysicalActionTerminalStatus,
): PhysicalActionFinishResultV1 {
  const resultCode = cleanText(input.resultCode, `physical_action_${status}`);
  const resultRu = cleanText(input.resultRu, terminalFallbackRu(status));
  const state = unit.behaviorRuntime.physicalActionCoordinator;
  const index = state.activeLeases.indexOf(lease);
  if (index < 0) {
    return finishRejected('stale_handle', 'physical_action_stale_handle', 'Физическое действие уже было заменено.');
  }
  const result: PhysicalActionTerminalResultV1 = {
    handle: { ...lease.handle },
    actionType: lease.actionType,
    owner: { ...lease.owner },
    channels: [...lease.channels],
    status,
    resultCode,
    resultRu,
    endedSeconds: finiteNonNegative(input.endedSeconds, lease.startedSeconds),
  };
  state.activeLeases.splice(index, 1);
  state.revision += 1;
  state.lastResult = result;
  state.lastDiagnosticCode = null;
  state.lastDiagnosticRu = null;
  return {
    accepted: true,
    status,
    result,
    reasonCode: resultCode,
    reasonRu: resultRu,
  };
}

function collectConflicts(
  activeLeases: readonly PhysicalActionLeaseV1[],
  channels: readonly PhysicalActionChannel[],
): PhysicalActionConflictV1[] {
  const conflicts: PhysicalActionConflictV1[] = [];
  for (const channel of PHYSICAL_ACTION_CHANNELS) {
    if (!channels.includes(channel)) continue;
    const lease = activeLeases.find((candidate) => candidate.channels.includes(channel));
    if (!lease) continue;
    conflicts.push({
      channel,
      actionId: lease.handle.actionId,
      actionType: lease.actionType,
      owner: { ...lease.owner },
      ownerToken: lease.handle.ownerToken,
    });
  }
  return conflicts;
}

function requestRejected(
  status: 'blocked' | 'invalid_request',
  reasonCode: string,
  reasonRu: string,
): PhysicalActionRequestResultV1 {
  return {
    accepted: false,
    status,
    handle: null,
    lease: null,
    conflicts: [],
    reasonCode,
    reasonRu,
  };
}

function finishRejected(
  status: 'stale_handle' | 'not_found' | 'invalid_request',
  reasonCode: string,
  reasonRu: string,
): PhysicalActionFinishResultV1 {
  return { accepted: false, status, result: null, reasonCode, reasonRu };
}

function toLeaseDiagnostic(lease: PhysicalActionLeaseV1): PhysicalActionLeaseDiagnosticV1 {
  return {
    actionId: lease.handle.actionId,
    actionType: lease.actionType,
    sequence: lease.handle.sequence,
    revision: lease.handle.revision,
    owner: { ...lease.owner },
    ownerToken: lease.handle.ownerToken,
    channels: [...lease.channels],
    startedSeconds: lease.startedSeconds,
    reasonCode: lease.reasonCode,
    reasonRu: lease.reasonRu,
  };
}

function channelsEqual(left: readonly PhysicalActionChannel[], right: readonly PhysicalActionChannel[]): boolean {
  return left.length === right.length && left.every((channel, index) => channel === right[index]);
}

function compareLeases(left: PhysicalActionLeaseV1, right: PhysicalActionLeaseV1): number {
  return left.handle.sequence - right.handle.sequence
    || left.handle.actionId.localeCompare(right.handle.actionId);
}

function terminalFallbackRu(status: PhysicalActionTerminalStatus): string {
  if (status === 'completed') return 'Физическое действие завершено.';
  if (status === 'cancelled') return 'Физическое действие отменено.';
  return 'Физическое действие завершилось ошибкой.';
}

function cleanText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function finiteNonNegative(value: unknown, fallback: number): number {
  return Math.max(0, typeof value === 'number' && Number.isFinite(value) ? value : fallback);
}
