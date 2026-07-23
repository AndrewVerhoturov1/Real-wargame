import {
  PHYSICAL_ACTION_CHANNELS,
  PHYSICAL_ACTION_COORDINATOR_SCHEMA_VERSION,
  type PhysicalActionChannel,
  type PhysicalActionCoordinatorStateV1,
  type PhysicalActionHandleV1,
  type PhysicalActionLeaseV1,
  type PhysicalActionOwner,
  type PhysicalActionOwnerSource,
  type PhysicalActionTerminalResultV1,
  type PhysicalActionTerminalStatus,
} from './PhysicalActionCoordinatorTypes';

const OWNER_SOURCES: readonly PhysicalActionOwnerSource[] = [
  'player',
  'player_command',
  'movement',
  'tactical_position',
  'test',
  'system',
  'graph_v2',
  'future_ai',
];

export function normalizePhysicalActionCoordinatorState(value: unknown): PhysicalActionCoordinatorStateV1 {
  const record = isRecord(value) && value.schemaVersion === PHYSICAL_ACTION_COORDINATOR_SCHEMA_VERSION
    ? value
    : {};
  const candidates = Array.isArray(record.activeLeases)
    ? record.activeLeases.map(normalizePhysicalActionLease).filter((lease): lease is PhysicalActionLeaseV1 => lease !== null)
    : [];
  candidates.sort(compareLeases);

  const activeLeases: PhysicalActionLeaseV1[] = [];
  const occupied = new Set<PhysicalActionChannel>();
  for (const lease of candidates) {
    if (activeLeases.length >= PHYSICAL_ACTION_CHANNELS.length) break;
    if (lease.channels.some((channel) => occupied.has(channel))) continue;
    activeLeases.push(lease);
    for (const channel of lease.channels) occupied.add(channel);
  }

  const lastResult = normalizePhysicalActionTerminalResult(record.lastResult);
  let maximumSequence = lastResult?.handle.sequence ?? 0;
  let maximumRevision = integer(record.revision, 0, 0, Number.MAX_SAFE_INTEGER);
  for (const lease of activeLeases) {
    maximumSequence = Math.max(maximumSequence, lease.handle.sequence);
    maximumRevision = Math.max(maximumRevision, lease.handle.revision);
  }
  if (lastResult) maximumRevision = Math.max(maximumRevision, lastResult.handle.revision);

  return {
    schemaVersion: PHYSICAL_ACTION_COORDINATOR_SCHEMA_VERSION,
    revision: maximumRevision,
    nextSequence: Math.max(
      maximumSequence + 1,
      integer(record.nextSequence, 1, 1, Number.MAX_SAFE_INTEGER),
    ),
    activeLeases,
    lastResult,
    lastDiagnosticCode: nullableText(record.lastDiagnosticCode),
    lastDiagnosticRu: nullableText(record.lastDiagnosticRu),
  };
}

export function serializePhysicalActionCoordinatorState(
  state: PhysicalActionCoordinatorStateV1,
): PhysicalActionCoordinatorStateV1 {
  return {
    schemaVersion: PHYSICAL_ACTION_COORDINATOR_SCHEMA_VERSION,
    revision: state.revision,
    nextSequence: state.nextSequence,
    activeLeases: state.activeLeases.map(clonePhysicalActionLease),
    lastResult: state.lastResult ? clonePhysicalActionTerminalResult(state.lastResult) : null,
    lastDiagnosticCode: state.lastDiagnosticCode,
    lastDiagnosticRu: state.lastDiagnosticRu,
  };
}

export function normalizePhysicalActionChannels(value: unknown): PhysicalActionChannel[] {
  const source = Array.isArray(value) ? value : [];
  return PHYSICAL_ACTION_CHANNELS.filter((channel) => source.includes(channel));
}

export function normalizePhysicalActionOwner(value: unknown, fallbackId = 'system'): PhysicalActionOwner {
  const record = isRecord(value) ? value : {};
  const source = OWNER_SOURCES.includes(record.source as PhysicalActionOwnerSource)
    ? record.source as PhysicalActionOwnerSource
    : 'system';
  return {
    source,
    id: cleanText(record.id, fallbackId || source),
  };
}

export function normalizePhysicalActionHandle(value: unknown): PhysicalActionHandleV1 | null {
  if (!isRecord(value)) return null;
  const actionId = cleanText(value.actionId, '');
  const ownerToken = cleanText(value.ownerToken, '');
  if (!actionId || !ownerToken) return null;
  return {
    actionId,
    sequence: integer(value.sequence, 0, 1, Number.MAX_SAFE_INTEGER),
    revision: integer(value.revision, 0, 1, Number.MAX_SAFE_INTEGER),
    ownerToken,
  };
}

export function clonePhysicalActionHandle(handle: PhysicalActionHandleV1): PhysicalActionHandleV1 {
  return { ...handle };
}

export function clonePhysicalActionLease(lease: PhysicalActionLeaseV1): PhysicalActionLeaseV1 {
  return {
    ...lease,
    handle: clonePhysicalActionHandle(lease.handle),
    owner: { ...lease.owner },
    channels: [...lease.channels],
  };
}

export function clonePhysicalActionTerminalResult(
  result: PhysicalActionTerminalResultV1,
): PhysicalActionTerminalResultV1 {
  return {
    ...result,
    handle: clonePhysicalActionHandle(result.handle),
    owner: { ...result.owner },
    channels: [...result.channels],
  };
}

export function physicalActionHandlesEqual(
  left: PhysicalActionHandleV1 | null | undefined,
  right: PhysicalActionHandleV1 | null | undefined,
): boolean {
  return Boolean(left && right
    && left.actionId === right.actionId
    && left.sequence === right.sequence
    && left.revision === right.revision
    && left.ownerToken === right.ownerToken);
}

function normalizePhysicalActionLease(value: unknown): PhysicalActionLeaseV1 | null {
  if (!isRecord(value) || value.schemaVersion !== PHYSICAL_ACTION_COORDINATOR_SCHEMA_VERSION) return null;
  const handle = normalizePhysicalActionHandle(value.handle);
  const actionType = cleanText(value.actionType, '');
  const channels = normalizePhysicalActionChannels(value.channels);
  if (!handle || !actionType || channels.length === 0) return null;
  return {
    schemaVersion: PHYSICAL_ACTION_COORDINATOR_SCHEMA_VERSION,
    handle,
    actionType,
    owner: normalizePhysicalActionOwner(value.owner, handle.actionId),
    channels,
    startedSeconds: finiteNonNegative(value.startedSeconds, 0),
    reasonCode: cleanText(value.reasonCode, 'physical_action_restored'),
    reasonRu: cleanText(value.reasonRu, 'Физическое действие восстановлено.'),
  };
}

function normalizePhysicalActionTerminalResult(value: unknown): PhysicalActionTerminalResultV1 | null {
  if (!isRecord(value)) return null;
  const handle = normalizePhysicalActionHandle(value.handle);
  const actionType = cleanText(value.actionType, '');
  const channels = normalizePhysicalActionChannels(value.channels);
  const status = terminalStatus(value.status);
  if (!handle || !actionType || channels.length === 0 || !status) return null;
  return {
    handle,
    actionType,
    owner: normalizePhysicalActionOwner(value.owner, handle.actionId),
    channels,
    status,
    resultCode: cleanText(value.resultCode, `physical_action_${status}`),
    resultRu: cleanText(value.resultRu, terminalFallbackRu(status)),
    endedSeconds: finiteNonNegative(value.endedSeconds, 0),
  };
}

function terminalStatus(value: unknown): PhysicalActionTerminalStatus | null {
  return value === 'completed' || value === 'cancelled' || value === 'failed' ? value : null;
}

function terminalFallbackRu(status: PhysicalActionTerminalStatus): string {
  if (status === 'completed') return 'Физическое действие завершено.';
  if (status === 'cancelled') return 'Физическое действие отменено.';
  return 'Физическое действие завершилось ошибкой.';
}

function compareLeases(left: PhysicalActionLeaseV1, right: PhysicalActionLeaseV1): number {
  return left.handle.sequence - right.handle.sequence
    || left.handle.revision - right.handle.revision
    || left.handle.actionId.localeCompare(right.handle.actionId)
    || left.handle.ownerToken.localeCompare(right.handle.ownerToken);
}

function cleanText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function finiteNonNegative(value: unknown, fallback: number): number {
  return Math.max(0, typeof value === 'number' && Number.isFinite(value) ? value : fallback);
}

function integer(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.max(minimum, Math.min(maximum, numeric));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
