import { isUnitCombatCapable } from '../combat/CombatDamage';
import { distance } from '../geometry';
import { getSelectedUnit, type SimulationState } from '../simulation/SimulationState';
import { areUnitsHostile } from '../units/SideRelations';
import type { UnitModel } from '../units/UnitModel';
import { evaluatePointVisibility } from '../visibility/PointVisibility';
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
  type MutablePerceptionDiagnostics,
} from './PerceptionDiagnostics';
import { getActivePerceptionSounds, soundBaseRangeMeters } from './PerceptionSound';
import { buildPerceptionStimuli } from './PerceptionStimulus';
import { evaluateVisualSignal } from './VisualSignal';

export { getPerceptionDiagnostics } from './PerceptionDiagnostics';

const REAR_SECTOR_START_DEGREES = 135;
const BACKGROUND_INITIAL_PHASE_STEP_SECONDS = 1 / 60;
const BACKGROUND_INITIAL_PHASE_MAX_SECONDS = 0.1;

interface DueAttentionChecks extends Record<AttentionZone, boolean> {
  rear: boolean;
}

export function tickSelectedSoldierPerception(state: SimulationState, deltaSeconds: number): void {
  const unit = getSelectedUnit(state);
  const diagnostics = getMutablePerceptionDiagnostics(state);
  diagnostics.tickCount += 1;
  diagnostics.lastObserverId = unit?.id ?? null;
  if (!unit || deltaSeconds <= 0 || !isUnitCombatCapable(unit)) {
    publishPerceptionDiagnostics(state);
    return;
  }
  tickUnitPerception(state, unit, deltaSeconds, diagnostics);
  diagnostics.bestContactId = getBestPerceptionContact(unit)?.id ?? null;
  publishPerceptionDiagnostics(state);
}

export function tickAllUnitPerception(state: SimulationState, deltaSeconds: number): void {
  if (deltaSeconds <= 0) return;
  const selected = getSelectedUnit(state);
  const diagnostics = selected ? getMutablePerceptionDiagnostics(state) : null;
  if (diagnostics) {
    diagnostics.tickCount += 1;
    diagnostics.lastObserverId = selected?.id ?? null;
  }

  let backgroundPhaseSlot = 0;
  for (const unit of state.units) {
    if (!isUnitCombatCapable(unit)) continue;
    if (unit.id !== selected?.id) {
      initializeBackgroundAttentionPhase(unit, backgroundPhaseSlot);
      backgroundPhaseSlot += 1;
    }
    tickUnitPerception(state, unit, deltaSeconds, unit.id === selected?.id ? diagnostics : null);
  }

  if (diagnostics) {
    diagnostics.bestContactId = selected ? getBestPerceptionContact(selected)?.id ?? null : null;
    publishPerceptionDiagnostics(state);
  }
}

export function tickUnitPerception(
  state: SimulationState,
  unit: UnitModel,
  deltaSeconds: number,
  diagnostics: MutablePerceptionDiagnostics | null = null,
): void {
  if (deltaSeconds <= 0 || !isUnitCombatCapable(unit)) return;
  updateAttentionController(unit, deltaSeconds);
  const now = state.simulationTimeSeconds;
  const due = resolveDueZones(unit, now);
  const updatedContacts = new Set<string>();
  const stimuli = buildPerceptionStimuli(state, unit);
  const broadPhaseCells = Math.max(
    1,
    unit.attentionSettings.vision.maximumVisualRangeMeters / Math.max(0.001, state.map.metersPerCell),
  );
  const profile = effectiveProfile(unit);

  for (const stimulus of stimuli) {
    const distanceCells = distance(unit.position, stimulus.position);
    if (distanceCells > broadPhaseCells) continue;
    if (diagnostics) diagnostics.candidateCount += 1;

    if (stimulus.knownSource) {
      const contactId = contactIdForStimulus(stimulus.id);
      const previous = unit.perceptionKnowledge.contacts.find((item) => item.id === contactId) ?? null;
      const reported = advanceReportedContact(previous, {
        id: contactId,
        stimulusId: stimulus.id,
        sourceUnitId: stimulus.sourceUnitId,
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
    const rearSector = Math.abs(angleDifferenceDegrees) >= REAR_SECTOR_START_DEGREES;
    const checkDue = rearSector ? due.rear : due[attention.zone];
    if (!checkDue) {
      if (diagnostics) diagnostics.skippedNotDueCount += 1;
      const existingContactId = contactIdForStimulus(stimulus.id);
      if (unit.perceptionKnowledge.contacts.some((item) => item.id === existingContactId)) {
        updatedContacts.add(existingContactId);
      }
      continue;
    }

    if (attention.zone === 'peripheral') {
      attention.weight *= 1 + Math.min(0.25, unit.soldier.condition.intuition / 400);
    }
    const visibility = evaluatePointVisibility(
      state,
      unit,
      stimulus.position,
      stimulus.targetHeightMeters,
      attention,
    );
    if (diagnostics) diagnostics.losCalculationCount += 1;
    const visualSignal = evaluateVisualSignal({
      observer: unit,
      stimulus,
      attention,
      visibility,
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
      sourceUnitId: stimulus.sourceUnitId,
      labelRu: stimulus.labelRu,
      position: stimulus.position,
      evidencePerSecond: visualSignal.evidencePerSecond,
      detectionVariance,
      deltaSeconds: rearSector ? profile.rearCheckIntervalSeconds : intervalForZone(profile, attention.zone),
      nowSeconds: now,
      explanationRu: [
        ...visualSignal.explanationRu,
        rearSector ? `Тыл проверяется раз в ${profile.rearCheckIntervalSeconds.toFixed(1).replace('.', ',')} с.` : '',
        `Небольшая стабильная вариативность обнаружения: ×${detectionVariance.toFixed(2).replace('.', ',')}.`,
      ].filter(Boolean),
    });
    upsertPerceptionContact(unit.perceptionKnowledge, contact);
    updatedContacts.add(contactId);
    if (diagnostics) diagnostics.contactUpdateCount += 1;
  }

  processSoundEvents(state, unit, updatedContacts);
  decayContacts(state, unit, updatedContacts, deltaSeconds);
  scheduleNextChecks(unit, now, due);
  unit.perceptionKnowledge.lastUpdatedSeconds = now;
}

export function getBestPerceptionContact(unit: UnitModel): PerceptionContactMemory | null {
  return [...unit.perceptionKnowledge.contacts].sort((left, right) => (
    contactStageRank(right.stage) - contactStageRank(left.stage)
    || right.confidence - left.confidence
    || right.lastUpdatedSeconds - left.lastUpdatedSeconds
  ))[0] ?? null;
}

function initializeBackgroundAttentionPhase(unit: UnitModel, phaseSlot: number): void {
  const runtime = unit.attentionRuntime;
  if (
    runtime.nextFocusCheckSeconds !== 0
    || runtime.nextDirectCheckSeconds !== 0
    || runtime.nextPeripheralCheckSeconds !== 0
  ) return;
  const phaseSeconds = Math.min(
    BACKGROUND_INITIAL_PHASE_MAX_SECONDS,
    (phaseSlot + 1) * BACKGROUND_INITIAL_PHASE_STEP_SECONDS,
  );
  runtime.nextFocusCheckSeconds = phaseSeconds;
  runtime.nextDirectCheckSeconds = phaseSeconds;
  runtime.nextPeripheralCheckSeconds = phaseSeconds;
  runtime.nextRearCheckSeconds = Math.max(runtime.nextRearCheckSeconds, phaseSeconds);
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
    const sourceUnit = event.sourceId ? state.units.find((candidate) => candidate.id === event.sourceId) : null;
    if (sourceUnit && !areUnitsHostile(unit, sourceUnit)) continue;
    const distanceMeters = distance(unit.position, event.position) * state.map.metersPerCell;
    const baseRange = soundBaseRangeMeters(event.kind) * Math.max(0.1, event.loudness);
    if (distanceMeters > baseRange) continue;
    const rangeFactor = Math.max(0, 1 - distanceMeters / baseRange);
    const confidence = Math.min(70, 18 + 58 * rangeFactor * modeFactor * intuitionFactor);
    if (confidence < 10) continue;

    const uncertaintyMeters = Math.max(8, (12 + distanceMeters * 0.18) * suppressionLocalizationPenalty);
    const uncertaintyCells = uncertaintyMeters / Math.max(0.001, state.map.metersPerCell);
    const position = estimateSoundPosition(unit, event.id, event.position, uncertaintyCells);
    const stimulusId = event.sourceId ? `unit:${event.sourceId}` : `sound:${event.id}`;
    const contactId = event.sourceId ? contactIdForStimulus(stimulusId) : `perception:sound:${event.id}`;
    const previous = unit.perceptionKnowledge.contacts.find((item) => item.id === contactId) ?? null;
    const contact = advanceReportedContact(previous, {
      id: contactId,
      stimulusId,
      sourceUnitId: event.sourceId,
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

function resolveDueZones(unit: UnitModel, now: number): DueAttentionChecks {
  return {
    focus: now >= unit.attentionRuntime.nextFocusCheckSeconds,
    direct: now >= unit.attentionRuntime.nextDirectCheckSeconds,
    peripheral: now >= unit.attentionRuntime.nextPeripheralCheckSeconds,
    rear: now >= unit.attentionRuntime.nextRearCheckSeconds,
  };
}

function scheduleNextChecks(
  unit: UnitModel,
  now: number,
  due: DueAttentionChecks,
): void {
  const profile = unit.attentionSettings.profiles[unit.attentionRuntime.mode];
  if (due.focus) unit.attentionRuntime.nextFocusCheckSeconds = now + profile.focusCheckIntervalSeconds;
  if (due.direct) unit.attentionRuntime.nextDirectCheckSeconds = now + profile.directCheckIntervalSeconds;
  if (due.peripheral) unit.attentionRuntime.nextPeripheralCheckSeconds = now + profile.peripheralCheckIntervalSeconds;
  if (due.rear) unit.attentionRuntime.nextRearCheckSeconds = now + profile.rearCheckIntervalSeconds;
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
