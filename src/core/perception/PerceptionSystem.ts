import { distance } from '../geometry';
import { getSelectedUnit, type SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';
import { computeLineOfSight } from '../visibility/LineOfSight';
import { updateAttentionController } from './AttentionController';
import {
  normalizeSignedDegrees,
  radiansToDegrees,
  sampleAttentionWeight,
  type AttentionModeProfile,
  type AttentionZone,
} from './AttentionModel';
import {
  advanceReportedContact,
  advanceVisualContact,
  contactStageRank,
  decayUnobservedContact,
  type PerceptionContactMemory,
  upsertPerceptionContact,
} from './PerceptionContact';
import {
  getMutablePerceptionDiagnostics,
  getPerceptionDiagnostics,
  publishPerceptionDiagnostics,
} from './PerceptionDiagnostics';
import { buildPerceptionStimuli } from './PerceptionStimulus';
import { evaluateVisualSignal } from './VisualSignal';

export { getPerceptionDiagnostics } from './PerceptionDiagnostics';

export function tickSelectedSoldierPerception(state: SimulationState, deltaSeconds: number): void {
  const unit = getSelectedUnit(state);
  const diagnostics = getMutablePerceptionDiagnostics(state);
  diagnostics.tickCount += 1;
  diagnostics.lastObserverId = unit?.id ?? null;
  if (!unit || deltaSeconds <= 0) {
    publishPerceptionDiagnostics(state);
    return;
  }

  updateAttentionController(unit, deltaSeconds);
  const now = state.simulationTimeSeconds;
  const due = resolveDueZones(unit, now);
  const updatedContacts = new Set<string>();
  const stimuli = buildPerceptionStimuli(state);
  const broadPhaseCells = Math.max(1, unit.viewRangeCells * 1.75);
  const profile = effectiveProfile(unit);

  for (const stimulus of stimuli) {
    const distanceCells = distance(unit.position, stimulus.position);
    if (distanceCells > broadPhaseCells) continue;
    diagnostics.candidateCount += 1;

    if (stimulus.knownSource) {
      const contactId = contactIdForStimulus(stimulus.id);
      const previous = unit.perceptionKnowledge.contacts.find((item) => item.id === contactId) ?? null;
      const reported = advanceReportedContact(previous, {
        id: contactId,
        stimulusId: stimulus.id,
        labelRu: stimulus.labelRu,
        position: stimulus.position,
        confidence: 75,
        uncertaintyCells: 15 / Math.max(0.001, state.map.metersPerCell),
        nowSeconds: now,
        source: 'reported',
        explanationRu: ['Положение известно по сценарию или докладу, но визуально не подтверждено.'],
      });
      upsertPerceptionContact(unit.perceptionKnowledge, reported);
      updatedContacts.add(contactId);
    }

    if (!stimulus.visibleSource) continue;
    const bearingRadians = Math.atan2(
      stimulus.position.y - unit.position.y,
      stimulus.position.x - unit.position.x,
    );
    const angleDifferenceDegrees = normalizeSignedDegrees(
      radiansToDegrees(bearingRadians - unit.attentionRuntime.focusDirectionRadians),
    );
    const attention = sampleAttentionWeight(profile, angleDifferenceDegrees);
    if (!due[attention.zone]) {
      diagnostics.skippedNotDueCount += 1;
      continue;
    }

    const lineOfSight = computeLineOfSight(state.map, unit, stimulus.position);
    diagnostics.losCalculationCount += 1;
    if (lineOfSight.blocked) continue;

    if (attention.zone === 'peripheral') {
      attention.weight *= 1 + Math.min(0.25, unit.soldier.condition.intuition / 400);
    }
    const visualSignal = evaluateVisualSignal({
      observer: unit,
      stimulus,
      attention,
      lineOfSight,
      distanceMeters: distanceCells * state.map.metersPerCell,
      nominalRangeMeters: Math.max(1, unit.viewRangeCells * state.map.metersPerCell),
    });
    if (visualSignal.evidencePerSecond <= 0) continue;

    const contactId = contactIdForStimulus(stimulus.id);
    const previous = unit.perceptionKnowledge.contacts.find((item) => item.id === contactId) ?? null;
    const contact = advanceVisualContact(previous, {
      id: contactId,
      stimulusId: stimulus.id,
      labelRu: stimulus.labelRu,
      position: stimulus.position,
      evidencePerSecond: visualSignal.evidencePerSecond,
      deltaSeconds: intervalForZone(profile, attention.zone),
      nowSeconds: now,
      explanationRu: visualSignal.explanationRu,
    });
    upsertPerceptionContact(unit.perceptionKnowledge, contact);
    updatedContacts.add(contactId);
    diagnostics.contactUpdateCount += 1;
  }

  decayContacts(state, unit, updatedContacts, deltaSeconds);
  scheduleNextChecks(unit, now, due);
  const best = getBestPerceptionContact(unit);
  diagnostics.bestContactId = best?.id ?? null;
  unit.perceptionKnowledge.lastUpdatedSeconds = now;
  publishPerceptionDiagnostics(state);
}

export function getBestPerceptionContact(unit: UnitModel): PerceptionContactMemory | null {
  return [...unit.perceptionKnowledge.contacts].sort((left, right) => (
    contactStageRank(right.stage) - contactStageRank(left.stage)
    || right.confidence - left.confidence
    || right.lastUpdatedSeconds - left.lastUpdatedSeconds
  ))[0] ?? null;
}

function resolveDueZones(unit: UnitModel, now: number): Record<AttentionZone, boolean> {
  return {
    focus: now >= unit.attentionRuntime.nextFocusCheckSeconds,
    direct: now >= unit.attentionRuntime.nextDirectCheckSeconds,
    peripheral: now >= unit.attentionRuntime.nextPeripheralCheckSeconds,
  };
}

function scheduleNextChecks(
  unit: UnitModel,
  now: number,
  due: Record<AttentionZone, boolean>,
): void {
  const profile = unit.attentionSettings.profiles[unit.attentionRuntime.mode];
  if (due.focus) unit.attentionRuntime.nextFocusCheckSeconds = now + profile.focusCheckIntervalSeconds;
  if (due.direct) unit.attentionRuntime.nextDirectCheckSeconds = now + profile.directCheckIntervalSeconds;
  if (due.peripheral) unit.attentionRuntime.nextPeripheralCheckSeconds = now + profile.peripheralCheckIntervalSeconds;
}

function intervalForZone(profile: AttentionModeProfile, zone: AttentionZone): number {
  if (zone === 'focus') return profile.focusCheckIntervalSeconds;
  if (zone === 'direct') return profile.directCheckIntervalSeconds;
  return profile.peripheralCheckIntervalSeconds;
}

function effectiveProfile(unit: UnitModel): AttentionModeProfile {
  const base = unit.attentionSettings.profiles[unit.attentionRuntime.mode];
  const narrowing = 1 - Math.min(0.35, unit.behaviorRuntime.suppression * 0.0035);
  return {
    ...base,
    focusAngleDegrees: Math.max(4, base.focusAngleDegrees * narrowing),
    directAngleDegrees: Math.max(base.focusAngleDegrees * narrowing, base.directAngleDegrees * narrowing),
  };
}

function decayContacts(
  state: SimulationState,
  unit: UnitModel,
  updatedContacts: Set<string>,
  deltaSeconds: number,
): void {
  const next: PerceptionContactMemory[] = [];
  let changed = false;
  for (const contact of unit.perceptionKnowledge.contacts) {
    if (updatedContacts.has(contact.id)) {
      next.push(contact);
      continue;
    }
    const decayed = decayUnobservedContact(contact, {
      deltaSeconds,
      nowSeconds: state.simulationTimeSeconds,
      metersPerCell: state.map.metersPerCell,
    });
    if (decayed) next.push(decayed);
    if (!decayed || decayed.confidence !== contact.confidence || decayed.uncertaintyCells !== contact.uncertaintyCells) changed = true;
  }
  unit.perceptionKnowledge.contacts = next;
  if (changed) unit.perceptionKnowledge.revision += 1;
}

function contactIdForStimulus(stimulusId: string): string {
  return `perception:${stimulusId}`;
}
