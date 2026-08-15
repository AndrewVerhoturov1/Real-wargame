import type { GridPosition } from '../geometry';
import type { PerceptionContactMemory, UnitPerceptionKnowledge } from '../perception/PerceptionContact';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitTacticalKnowledge } from '../units/UnitModel';

export interface UnitKnowledgeHistorySnapshot {
  readonly unitId: string;
  readonly recordedAtSeconds: number;
  readonly perceptionKnowledge: UnitPerceptionKnowledge;
  readonly tacticalKnowledge: UnitTacticalKnowledge;
  readonly informationAtSecondsByContactId: Readonly<Record<string, number>>;
}

interface UnitKnowledgeHistoryRuntime {
  lastRecordedTimeSeconds: number;
  readonly snapshotsByUnitId: Map<string, UnitKnowledgeHistorySnapshot[]>;
  readonly fingerprintByUnitId: Map<string, string>;
  readonly informationTimeByUnitId: Map<string, Map<string, number>>;
  readonly lastContactsByUnitId: Map<string, Map<string, PerceptionContactMemory>>;
}

const runtimeByState = new WeakMap<SimulationState, UnitKnowledgeHistoryRuntime>();

/**
 * Records subjective knowledge at the simulation boundary. Call before and
 * after a simulation tick so t=0/scenario knowledge and post-tick knowledge
 * are both available to HISTORY without reading future live state.
 */
export function recordSimulationKnowledgeHistory(state: SimulationState): void {
  const runtime = getRuntime(state);
  const now = Math.max(0, state.simulationTimeSeconds);
  if (now + 1e-9 < runtime.lastRecordedTimeSeconds) resetRuntime(runtime);

  for (const unit of state.units) {
    const informationTimes = updateInformationClock(runtime, unit.id, unit.perceptionKnowledge.contacts, now);
    const fingerprint = knowledgeFingerprint(unit.perceptionKnowledge, unit.tacticalKnowledge, informationTimes);
    if (runtime.fingerprintByUnitId.get(unit.id) === fingerprint) continue;
    const list = runtime.snapshotsByUnitId.get(unit.id) ?? [];
    list.push({
      unitId: unit.id,
      recordedAtSeconds: now,
      perceptionKnowledge: clonePerceptionKnowledge(unit.perceptionKnowledge),
      tacticalKnowledge: cloneTacticalKnowledge(unit.tacticalKnowledge),
      informationAtSecondsByContactId: Object.fromEntries(informationTimes),
    });
    runtime.snapshotsByUnitId.set(unit.id, list);
    runtime.fingerprintByUnitId.set(unit.id, fingerprint);
  }
  runtime.lastRecordedTimeSeconds = now;
}

export function readUnitKnowledgeAt(
  state: SimulationState,
  unitId: string,
  viewTimeSeconds: number,
): UnitKnowledgeHistorySnapshot | null {
  const runtime = runtimeByState.get(state);
  const snapshots = runtime?.snapshotsByUnitId.get(unitId);
  if (!snapshots?.length) return null;
  const target = Math.max(0, viewTimeSeconds);
  let left = 0;
  let right = snapshots.length - 1;
  let best = -1;
  while (left <= right) {
    const middle = Math.floor((left + right) / 2);
    if (snapshots[middle]!.recordedAtSeconds <= target + 1e-9) {
      best = middle;
      left = middle + 1;
    } else {
      right = middle - 1;
    }
  }
  return best >= 0 ? cloneSnapshot(snapshots[best]!) : null;
}

export function readCurrentContactInformationTime(
  state: SimulationState,
  unitId: string,
  contactId: string,
): number | null {
  return runtimeByState.get(state)?.informationTimeByUnitId.get(unitId)?.get(contactId) ?? null;
}

export function clearUnitKnowledgeHistory(state: SimulationState): void {
  runtimeByState.delete(state);
}

export function getUnitKnowledgeHistorySnapshotCount(state: SimulationState, unitId: string): number {
  return runtimeByState.get(state)?.snapshotsByUnitId.get(unitId)?.length ?? 0;
}

function getRuntime(state: SimulationState): UnitKnowledgeHistoryRuntime {
  let runtime = runtimeByState.get(state);
  if (!runtime) {
    runtime = {
      lastRecordedTimeSeconds: -1,
      snapshotsByUnitId: new Map(),
      fingerprintByUnitId: new Map(),
      informationTimeByUnitId: new Map(),
      lastContactsByUnitId: new Map(),
    };
    runtimeByState.set(state, runtime);
  }
  return runtime;
}

function resetRuntime(runtime: UnitKnowledgeHistoryRuntime): void {
  runtime.lastRecordedTimeSeconds = -1;
  runtime.snapshotsByUnitId.clear();
  runtime.fingerprintByUnitId.clear();
  runtime.informationTimeByUnitId.clear();
  runtime.lastContactsByUnitId.clear();
}

function updateInformationClock(
  runtime: UnitKnowledgeHistoryRuntime,
  unitId: string,
  contacts: readonly PerceptionContactMemory[],
  now: number,
): Map<string, number> {
  const informationTimes = runtime.informationTimeByUnitId.get(unitId) ?? new Map<string, number>();
  const previousContacts = runtime.lastContactsByUnitId.get(unitId) ?? new Map<string, PerceptionContactMemory>();
  const nextContacts = new Map<string, PerceptionContactMemory>();
  const currentIds = new Set(contacts.map((contact) => contact.id));

  for (const contact of contacts) {
    const previous = previousContacts.get(contact.id) ?? null;
    const observedAt = contact.lastObservedSeconds >= 0 ? contact.lastObservedSeconds : null;
    if (observedAt !== null && observedAt > (informationTimes.get(contact.id) ?? -1)) {
      informationTimes.set(contact.id, observedAt);
    } else if (!previous || receivedNewNonVisualInformation(previous, contact)) {
      informationTimes.set(contact.id, now);
    } else if (!informationTimes.has(contact.id)) {
      informationTimes.set(contact.id, fallbackContactInformationTime(contact));
    }
    nextContacts.set(contact.id, cloneContact(contact));
  }

  for (const contactId of [...informationTimes.keys()]) {
    if (!currentIds.has(contactId)) informationTimes.delete(contactId);
  }

  runtime.informationTimeByUnitId.set(unitId, informationTimes);
  runtime.lastContactsByUnitId.set(unitId, nextContacts);
  return informationTimes;
}

function receivedNewNonVisualInformation(
  previous: PerceptionContactMemory,
  current: PerceptionContactMemory,
): boolean {
  if (current.source === 'visual') return false;
  if (current.source !== previous.source || current.sourceUnitId !== previous.sourceUnitId || current.stimulusId !== previous.stimulusId) return true;
  if (distanceSquared(current.lastKnownPosition, previous.lastKnownPosition) > 1e-8) return true;
  if (current.confidence > previous.confidence + 1e-6) return true;
  if (current.evidence > previous.evidence + 1e-6) return true;
  if (current.uncertaintyCells + 1e-6 < previous.uncertaintyCells) return true;
  return false;
}

function fallbackContactInformationTime(contact: PerceptionContactMemory): number {
  if (contact.lastObservedSeconds >= 0) return contact.lastObservedSeconds;
  return Math.max(0, contact.lastUpdatedSeconds);
}

function knowledgeFingerprint(
  perception: UnitPerceptionKnowledge,
  tactical: UnitTacticalKnowledge,
  informationTimes: ReadonlyMap<string, number>,
): string {
  return [
    perception.revision,
    tactical.revision,
    ...[...informationTimes.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([id, time]) => `${id}@${time.toFixed(3)}`),
  ].join(':');
}

function clonePerceptionKnowledge(value: UnitPerceptionKnowledge): UnitPerceptionKnowledge {
  return {
    revision: value.revision,
    lastUpdatedSeconds: value.lastUpdatedSeconds,
    contacts: value.contacts.map(cloneContact),
  };
}

function cloneContact(contact: PerceptionContactMemory): PerceptionContactMemory {
  return {
    ...contact,
    lastKnownPosition: { ...contact.lastKnownPosition },
    explanationRu: [...contact.explanationRu],
  };
}

function cloneTacticalKnowledge(value: UnitTacticalKnowledge): UnitTacticalKnowledge {
  return {
    revision: value.revision,
    lastUpdatedSeconds: value.lastUpdatedSeconds,
    threats: value.threats.map((threat) => ({ ...threat })),
  };
}

function cloneSnapshot(value: UnitKnowledgeHistorySnapshot): UnitKnowledgeHistorySnapshot {
  return {
    unitId: value.unitId,
    recordedAtSeconds: value.recordedAtSeconds,
    perceptionKnowledge: clonePerceptionKnowledge(value.perceptionKnowledge),
    tacticalKnowledge: cloneTacticalKnowledge(value.tacticalKnowledge),
    informationAtSecondsByContactId: { ...value.informationAtSecondsByContactId },
  };
}

function distanceSquared(left: GridPosition, right: GridPosition): number {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  return dx * dx + dy * dy;
}
