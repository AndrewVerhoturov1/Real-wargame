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
  createStableDetectionVariance,
  decayUnobservedContact,
  type PerceptionContactMemory,
  upsertPerceptionContact,
} from './PerceptionContact';
import {
  getMutablePerceptionDiagnostics,
  getPerceptionDiagnostics,
  publishPerceptionDiagnostics,
} from './PerceptionDiagnostics';
import { getActivePerceptionSounds, soundBaseRangeMeters } from './PerceptionSound';
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
  const broadPhaseCells = Math.max(
    1,
    unit.attentionSettings.vision.maximumVisualRangeMeters / Math.max(0.001, state.map.metersPerCell),
  );
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
      nominalRangeMeters: unit.attentionSettings.vision.maximumVisualRangeMeters,
    });
    if (visualSignal.evidencePerSecond <= 0) continue;

    const contactId = contactIdForStimulus(stimulus.id);
    const previous = unit.perceptionKnowledge.contacts.find((item) => item.id === contactId) ?? null;
    const detectionVariance = previous?.detectionVariance ?? createStableDetectionVariance(
      unit.id,
      stimulus.id,
      unit.attentionSettings.vision.detectionVariancePercent,
    );
    const contact = advanceVisualContact(previous, {
      id: contactId,
      stimulusId: stimulus.id,
      labelRu: stimulus.labelRu,
      position: stimulus.position,
      evidencePerSecond: visualSignal.evidencePerSecond,
      detectionVariance,
      deltaSeconds: intervalForZone(profile, attention.zone),
      nowSeconds: now,
      explanationRu: [
        ...visualSignal.explanationRu,
        `Небольшая стабильная вариативность обнаружения: ×${detectionVariance.toFixed(2).replace('.', ',')}.`,
      ],
    });
    upsertPerceptionContact(unit.perceptionKnowledge, contact);
    updatedContacts.add(contactId);
    diagnostics.contactUpdateCount += 1;
  }

  processSoundEvents(state, unit, updatedContacts);
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

function processSoundEvents(
  state: SimulationState,
  unit: UnitModel,
  updatedContacts: Set<string>,
): void {
  const now = state.simulationTimeSeconds;
  const modeFactor = unit.attentionRuntime.mode === 'march'
    ? 1
    : unit.attentionRuntime.mode === 'observe'
      ? 0.9
      : unit.attentionRuntime.mode === 'search'
        ? 0.65
        : 0.45;
  const intuitionFactor = 0.55 + unit.soldier.condition.intuition / 180;
  const suppressionLocalizationPenalty = 1 + unit.behaviorRuntime.suppression / 80;

  for (const event of getActivePerceptionSounds(state)) {
    if (event.sourceId === unit.id) continue;
    const distanceMeters = distance(unit.position, event.position) * state.map.metersPerCell;
    const baseRange = soundBaseRangeMeters(event.kind) * Math.max(0.1, event.loudness);
    if (distanceMeters > baseRange) continue;
    const rangeFactor = Math.max(0, 1 - distanceMeters / baseRange);
    const confidence = Math.min(70, 18 + 58 * rangeFactor * modeFactor * intuitionFactor);
    if (confidence < 10) continue;

    const uncertaintyMeters = Math.max(8, (12 + distanceMeters * 0.18) * suppressionLocalizationPenalty);
    const uncertaintyCells = uncertaintyMeters / Math.max(0.001, state.map.metersPerCell);
    const position = estimateSoundPosition(unit, event.id, event.position, uncertaintyCells);
    const stimulusId = event.sourceId ?? `sound:${event.id}`;
    const contactId = event.sourceId ? contactIdForStimulus(stimulusId) : `perception:sound:${event.id}`;
    const previous = unit.perceptionKnowledge.contacts.find((item) => item.id === contactId) ?? null;
    const contact = advanceReportedContact(previous, {
      id: contactId,
      stimulusId,
      labelRu: event.labelRu ?? soundLabelRu(event.kind),
      position,
      confidence,
      uncertaintyCells,
      nowSeconds: now,
      source: 'sound',
      explanationRu: [
        `Звук услышан на расстоянии около ${Math.round(distanceMeters)} м.`,
        `Направление приблизительное, неточность не меньше ${Math.round(uncertaintyMeters)} м.`,
      ],
    });
    upsertPerceptionContact(unit.perceptionKnowledge, contact);
    updatedContacts.add(contactId);
  }
}

function estimateSoundPosition(
  unit: UnitModel,
  eventId: string,
  source: { x: number; y: number },
  uncertaintyCells: number,
): { x: number; y: number } {
  const dx = source.x - unit.position.x;
  const dy = source.y - unit.position.y;
  const length = Math.max(0.001, Math.hypot(dx, dy));
  const seed = hashString(`${unit.id}:${eventId}`);
  const side = ((seed % 2001) / 1000 - 1) * uncertaintyCells * 0.55;
  const radial = (((Math.floor(seed / 2001) % 2001) / 1000) - 1) * uncertaintyCells * 0.35;
  return {
    x: source.x + (-dy / length) * side + (dx / length) * radial,
    y: source.y + (dx / length) * side + (dy / length) * radial,
  };
}

function soundLabelRu(kind: 'rifle_shot' | 'automatic_fire' | 'explosion' | 'movement'): string {
  if (kind === 'automatic_fire') return 'Слышна автоматическая стрельба';
  if (kind === 'explosion') return 'Слышен взрыв';
  if (kind === 'movement') return 'Слышно движение';
  return 'Слышен выстрел';
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

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
