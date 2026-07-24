import type { SimulationState } from '../simulation/SimulationState';
import type { KnownThreatMemory, UnitModel } from '../units/UnitModel';
import type { PerceptionContactMemory } from '../perception/PerceptionContact';
import type { AiInvestigationContactSnapshot } from './ContactInvestigation';

const MAX_INVESTIGATION_CONTACTS = 24;
const FRESH_FIRE_SECONDS = 2;

export function listSubjectiveInvestigationContacts(
  state: SimulationState,
  unit: UnitModel,
): readonly AiInvestigationContactSnapshot[] {
  const nowSeconds = Math.max(0, state.simulationTimeSeconds);
  const threats = new Map(unit.tacticalKnowledge.threats.map((threat) => [threat.id, threat]));
  return unit.perceptionKnowledge.contacts
    .slice()
    .sort(compareContacts)
    .slice(0, MAX_INVESTIGATION_CONTACTS)
    .map((contact) => buildSnapshot(state, unit, contact, findThreat(contact, threats), nowSeconds));
}

function buildSnapshot(
  state: SimulationState,
  unit: UnitModel,
  contact: PerceptionContactMemory,
  threat: KnownThreatMemory | undefined,
  nowSeconds: number,
): AiInvestigationContactSnapshot {
  const deltaX = contact.lastKnownPosition.x - unit.position.x;
  const deltaY = contact.lastKnownPosition.y - unit.position.y;
  const distanceMeters = Math.hypot(deltaX, deltaY) * state.map.metersPerCell;
  const recentEvidence = threat?.lastEvidenceSeconds;
  const recentFireEvidence = Boolean(
    contact.source === 'fire_pressure'
    || threat?.source === 'fire_pressure'
    || (typeof recentEvidence === 'number' && recentEvidence >= 0 && nowSeconds - recentEvidence <= FRESH_FIRE_SECONDS),
  );
  return Object.freeze({
    id: contact.id,
    stage: contact.stage,
    source: contact.source,
    confidence: clamp(contact.confidence, 0, 100),
    evidence: Math.max(0, contact.evidence),
    uncertaintyCells: Math.max(0, contact.uncertaintyCells),
    lastKnownPosition: Object.freeze({ ...contact.lastKnownPosition }),
    visibleNow: contact.visibleNow,
    observedNow: contact.observedNow,
    lastObservedSeconds: contact.lastObservedSeconds,
    lastUpdatedSeconds: contact.lastUpdatedSeconds,
    distanceMeters,
    recentFireEvidence,
    threatUrgency: resolveThreatUrgency(contact, threat, recentFireEvidence),
  });
}

function findThreat(
  contact: PerceptionContactMemory,
  threats: ReadonlyMap<string, KnownThreatMemory>,
): KnownThreatMemory | undefined {
  if (contact.sourceUnitId) {
    const known = threats.get(`unit:${contact.sourceUnitId}`);
    if (known) return known;
  }
  if (contact.stimulusId.startsWith('unit:')) {
    const known = threats.get(contact.stimulusId);
    if (known) return known;
  }
  if (contact.stimulusId.startsWith('threat:')) {
    const known = threats.get(contact.stimulusId.slice('threat:'.length));
    if (known) return known;
  }
  return threats.get(contact.id);
}

function resolveThreatUrgency(
  contact: PerceptionContactMemory,
  threat: KnownThreatMemory | undefined,
  recentFireEvidence: boolean,
): number {
  if (!threat) {
    const sourceBonus = contact.source === 'fire_pressure' ? 30 : contact.source === 'sound' ? 10 : 0;
    return clamp(contact.confidence * 0.55 + sourceBonus, 0, 100);
  }
  const stress = clamp(threat.stressPerSecond * 8, 0, 100);
  const evidence = clamp((threat.evidenceCount ?? 0) * 10, 0, 100);
  const urgency = threat.confidence * 0.2
    + threat.strength * 0.2
    + threat.suppression * 0.25
    + stress * 0.15
    + evidence * 0.1
    + (recentFireEvidence ? 10 : 0);
  return clamp(urgency, 0, 100);
}

function compareContacts(left: PerceptionContactMemory, right: PerceptionContactMemory): number {
  return right.lastUpdatedSeconds - left.lastUpdatedSeconds
    || right.confidence - left.confidence
    || left.id.localeCompare(right.id);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}
