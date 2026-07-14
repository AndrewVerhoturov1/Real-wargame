import { drainCombatThreatEvidence, type CombatThreatEvidence } from '../combat/CombatThreatEvidence';
import type { PerceptionContactMemory } from '../perception/PerceptionContact';
import { resolvePressureZoneSettings } from '../pressure/PressureZone';
import type { SimulationState } from '../simulation/SimulationState';
import { areUnitsHostile } from '../units/SideRelations';
import type { KnownThreatMemory, UnitModel, UnitTacticalKnowledge } from '../units/UnitModel';

const CONFIDENCE_DECAY_PER_SECOND = 0.55;
const UNCERTAINTY_GROWTH_METERS_PER_SECOND = 0.12;
const MAX_UNCERTAINTY_METERS = 120;
const MIN_MEMORY_CONFIDENCE = 4;
const EVIDENCE_SUPPRESSION_DECAY_PER_SECOND = 8;
const EVIDENCE_STRESS_DECAY_PER_SECOND = 1.5;
const UNKNOWN_MERGE_DIRECTION_DEGREES = 30;
const UNKNOWN_MERGE_SECONDS = 12;
const UNKNOWN_RECONCILE_DEGREES = 35;
const UNKNOWN_RECONCILE_SECONDS = 12;

export function createEmptyTacticalKnowledge(): UnitTacticalKnowledge {
  return {
    threats: [],
    revision: 0,
    lastUpdatedSeconds: 0,
  };
}

export function normalizeTacticalKnowledge(
  value?: Partial<UnitTacticalKnowledge>,
  sourceToRuntimeCellScale = 1,
): UnitTacticalKnowledge {
  const scale = normalizeScale(sourceToRuntimeCellScale);
  return {
    threats: Array.isArray(value?.threats)
      ? value.threats.map((item) => normalizeKnownThreat(item, scale))
      : [],
    revision: Number.isFinite(value?.revision) ? Math.max(0, Math.round(value?.revision ?? 0)) : 0,
    lastUpdatedSeconds: Number.isFinite(value?.lastUpdatedSeconds) ? Math.max(0, value?.lastUpdatedSeconds ?? 0) : 0,
  };
}

export function syncSoldierThreatMemory(
  state: SimulationState,
  unit: UnitModel,
  deltaSeconds: number,
): void {
  const now = state.simulationTimeSeconds;
  const previousFingerprint = tacticalKnowledgeFingerprint(unit.tacticalKnowledge.threats);
  const existing = new Map<string, KnownThreatMemory>(unit.tacticalKnowledge.threats.map((memory) => [memory.id, memory]));
  const refreshed = new Set<string>();

  for (const contact of unit.perceptionKnowledge.contacts) {
    const zoneId = contact.stimulusId.startsWith('threat:') ? contact.stimulusId.slice('threat:'.length) : null;
    if (zoneId) {
      const zone = state.pressureZones.find((candidate) => candidate.id === zoneId);
      if (!zone) continue;
      const next = buildPressureZoneThreat(state, zone, contact, existing.get(zone.id), now);
      existing.set(zone.id, next);
      refreshed.add(zone.id);
      continue;
    }

    const sourceUnitId = contact.sourceUnitId
      ?? (contact.stimulusId.startsWith('unit:') ? contact.stimulusId.slice('unit:'.length) : null);
    if (!sourceUnitId) continue;
    const sourceUnit = state.units.find((candidate) => candidate.id === sourceUnitId);
    if (!sourceUnit || !areUnitsHostile(unit, sourceUnit)) continue;
    const threatId = `unit:${sourceUnitId}`;
    const next = buildRealUnitThreat(state, unit, contact, threatId, existing.get(threatId), now);
    existing.set(threatId, next);
    refreshed.add(threatId);
  }

  for (const zone of state.pressureZones) {
    const settings = resolvePressureZoneSettings(zone);
    if (!settings.enabled || !isUnitAffectedByZone(unit, zone) || existing.has(zone.id)) continue;

    const uncertaintyCells = Math.max(metersToCells(state, 15), zone.uncertaintyCells ?? 0);
    const confidence = Math.max(15, Math.min(45, Math.max(zone.strength, settings.suppression) * 0.55));
    const estimatedPosition = estimatePressureSource(unit, zone, uncertaintyCells);
    existing.set(zone.id, buildKnownThreat(
      zone,
      confidence,
      uncertaintyCells,
      'fire_pressure',
      now,
      false,
      estimatedPosition.x,
      estimatedPosition.y,
    ));
    refreshed.add(zone.id);
  }

  for (const evidence of drainCombatThreatEvidence(unit, now)) {
    mergeCombatEvidence(existing, refreshed, evidence, now);
  }
  reconcileUnknownThreats(unit, existing, refreshed, now);

  const nextThreats: KnownThreatMemory[] = [];
  const uncertaintyGrowthCells = metersToCells(state, UNCERTAINTY_GROWTH_METERS_PER_SECOND) * Math.max(0, deltaSeconds);
  const maxUncertaintyCells = metersToCells(state, MAX_UNCERTAINTY_METERS);
  for (const memory of existing.values()) {
    if (refreshed.has(memory.id)) {
      nextThreats.push(memory);
      continue;
    }

    const decayed = decayEvidenceState(memory, now);
    const confidence = Math.max(0, decayed.confidence - CONFIDENCE_DECAY_PER_SECOND * Math.max(0, deltaSeconds));
    const uncertaintyCells = Math.min(maxUncertaintyCells, decayed.uncertaintyCells + uncertaintyGrowthCells);
    if (confidence < MIN_MEMORY_CONFIDENCE) continue;
    nextThreats.push({
      ...decayed,
      confidence,
      uncertaintyCells,
      lastUpdatedSeconds: now,
      visibleNow: false,
    });
  }

  nextThreats.sort((left, right) => right.confidence - left.confidence || right.suppression - left.suppression || left.id.localeCompare(right.id));
  unit.tacticalKnowledge.threats = nextThreats;
  unit.tacticalKnowledge.lastUpdatedSeconds = now;
  if (previousFingerprint !== tacticalKnowledgeFingerprint(nextThreats)) unit.tacticalKnowledge.revision += 1;
}

function buildPressureZoneThreat(
  state: SimulationState,
  zone: SimulationState['pressureZones'][number],
  contact: PerceptionContactMemory,
  previous: KnownThreatMemory | undefined,
  now: number,
): KnownThreatMemory {
  const confidenceCap = confidenceCapForStage(contact.stage);
  const confidence = Math.min(confidenceCap, Math.max(4, contact.confidence));
  const visibleNow = (contact.stage === 'identified' || contact.stage === 'confirmed') && contact.visibleNow;
  const source = sourceForContact(contact);
  const next = buildKnownThreat(
    zone,
    confidence,
    Math.max(contact.uncertaintyCells, visibleNow ? metersToCells(state, 1.5) : metersToCells(state, 4)),
    source,
    now,
    visibleNow,
    contact.lastKnownPosition.x,
    contact.lastKnownPosition.y,
  );
  if (!visibleNow && previous) next.lastSeenSeconds = previous.lastSeenSeconds;
  return next;
}

function buildRealUnitThreat(
  state: SimulationState,
  observer: UnitModel,
  contact: PerceptionContactMemory,
  threatId: string,
  previous: KnownThreatMemory | undefined,
  now: number,
): KnownThreatMemory {
  const previousEvidence = previous ? decayEvidenceState(previous, now) : undefined;
  const confidence = Math.min(confidenceCapForStage(contact.stage), Math.max(4, contact.confidence));
  const visibleNow = (contact.stage === 'identified' || contact.stage === 'confirmed') && contact.visibleNow;
  const uncertaintyCells = Math.max(
    contact.uncertaintyCells,
    visibleNow ? metersToCells(state, 1.5) : contact.source === 'sound' ? metersToCells(state, 10) : metersToCells(state, 4),
  );
  const source = sourceForContact(contact);
  const distanceCells = Math.hypot(
    observer.position.x - contact.lastKnownPosition.x,
    observer.position.y - contact.lastKnownPosition.y,
  );
  const directionDegrees = normalizeDegrees(Math.atan2(
    observer.position.y - contact.lastKnownPosition.y,
    observer.position.x - contact.lastKnownPosition.x,
  ) * 180 / Math.PI);
  const precisionArc = visibleNow ? 52 : contact.source === 'sound' ? 125 : contact.stage === 'contact' ? 86 : 105;
  return {
    id: threatId,
    labelRu: contact.labelRu,
    mode: 'directional_fire',
    x: contact.lastKnownPosition.x,
    y: contact.lastKnownPosition.y,
    radiusCells: 0,
    widthCells: 0,
    heightCells: 0,
    rotationDegrees: 0,
    strength: Math.min(88, 42 + confidence * 0.46),
    suppression: previousEvidence?.suppression ?? 0,
    stressPerSecond: previousEvidence?.stressPerSecond ?? 0,
    directionDegrees,
    arcDegrees: Math.min(180, precisionArc + uncertaintyCells * state.map.metersPerCell * 0.7),
    rangeCells: Math.max(distanceCells + uncertaintyCells, metersToCells(state, 250)),
    minRangeCells: 0,
    falloffPercent: 62,
    confidence,
    uncertaintyCells,
    source,
    visibleNow,
    lastSeenSeconds: visibleNow ? now : previous?.lastSeenSeconds ?? contact.lastObservedSeconds,
    lastUpdatedSeconds: now,
    evidenceCount: previousEvidence?.evidenceCount ?? 0,
    lastEvidenceSeconds: previousEvidence?.lastEvidenceSeconds ?? -1,
  };
}

function mergeCombatEvidence(
  existing: Map<string, KnownThreatMemory>,
  refreshed: Set<string>,
  evidence: CombatThreatEvidence,
  now: number,
): void {
  const knownThreatId = evidence.sourceUnitId ? `unit:${evidence.sourceUnitId}` : null;
  const known = knownThreatId ? existing.get(knownThreatId) : undefined;
  if (known && evidence.sourceUnitId) {
    const decayed = decayEvidenceState(known, now);
    const positionConflict = Math.hypot(
      decayed.x - evidence.estimatedSourcePosition.x,
      decayed.y - evidence.estimatedSourcePosition.y,
    );
    const compatiblePosition = positionConflict <= Math.max(decayed.uncertaintyCells, evidence.uncertaintyCells) * 1.5;
    const evidencePositionWeight = decayed.visibleNow
      ? 0
      : Math.max(0.08, Math.min(0.35, evidence.confidence / Math.max(1, decayed.confidence + evidence.confidence) * 0.5));
    const uncertaintyCells = decayed.visibleNow
      ? Math.max(0.5, Math.min(decayed.uncertaintyCells, evidence.uncertaintyCells))
      : compatiblePosition
        ? Math.max(0.5, Math.min(decayed.uncertaintyCells, evidence.uncertaintyCells) * 0.95)
        : Math.max(decayed.uncertaintyCells, evidence.uncertaintyCells, positionConflict * 0.6);
    existing.set(decayed.id, {
      ...decayed,
      x: decayed.x + (evidence.estimatedSourcePosition.x - decayed.x) * evidencePositionWeight,
      y: decayed.y + (evidence.estimatedSourcePosition.y - decayed.y) * evidencePositionWeight,
      suppression: Math.max(decayed.suppression, evidence.suppression),
      stressPerSecond: Math.max(decayed.stressPerSecond, evidence.stressPerSecond),
      directionDegrees: blendDirections(decayed.directionDegrees, decayed.confidence, evidence.directionDegrees, evidence.confidence),
      arcDegrees: Math.max(28, Math.min(decayed.arcDegrees, evidence.arcDegrees)),
      rangeCells: Math.max(decayed.rangeCells, evidence.rangeCells),
      confidence: Math.min(96, Math.max(decayed.confidence, evidence.confidence) + Math.min(12, evidence.evidenceCount * 3)),
      uncertaintyCells,
      source: decayed.visibleNow ? decayed.source : 'fire_pressure',
      lastUpdatedSeconds: now,
      evidenceCount: Math.min(9999, (decayed.evidenceCount ?? 0) + evidence.evidenceCount),
      lastEvidenceSeconds: Math.max(decayed.lastEvidenceSeconds ?? -1, evidence.lastUpdatedSeconds),
    });
    refreshed.add(decayed.id);
    return;
  }

  const previous = findCompatibleUnknownThreat(existing, evidence, now);
  const threatId = previous?.id ?? createUnknownThreatId(existing, evidence);
  if (!previous) {
    existing.set(threatId, {
      id: threatId,
      labelRu: evidence.kind === 'wounded'
        ? 'Неизвестный источник ранившего огня'
        : evidence.kind === 'near_miss'
          ? 'Неизвестный источник близкого огня'
          : 'Неизвестный источник попаданий',
      mode: 'directional_fire',
      x: evidence.estimatedSourcePosition.x,
      y: evidence.estimatedSourcePosition.y,
      radiusCells: 0,
      widthCells: 0,
      heightCells: 0,
      rotationDegrees: 0,
      strength: evidence.strength,
      suppression: evidence.suppression,
      stressPerSecond: evidence.stressPerSecond,
      directionDegrees: evidence.directionDegrees,
      arcDegrees: evidence.arcDegrees,
      rangeCells: evidence.rangeCells,
      minRangeCells: 0,
      falloffPercent: 70,
      confidence: evidence.confidence,
      uncertaintyCells: evidence.uncertaintyCells,
      source: 'fire_pressure',
      visibleNow: false,
      lastSeenSeconds: -1,
      lastUpdatedSeconds: now,
      evidenceCount: evidence.evidenceCount,
      lastEvidenceSeconds: evidence.lastUpdatedSeconds,
    });
  } else {
    const decayed = decayEvidenceState(previous, now);
    const previousWeight = Math.max(1, decayed.evidenceCount ?? 1);
    const evidenceWeight = Math.max(1, evidence.evidenceCount);
    const totalWeight = previousWeight + evidenceWeight;
    existing.set(threatId, {
      ...decayed,
      x: (decayed.x * previousWeight + evidence.estimatedSourcePosition.x * evidenceWeight) / totalWeight,
      y: (decayed.y * previousWeight + evidence.estimatedSourcePosition.y * evidenceWeight) / totalWeight,
      strength: Math.min(100, Math.max(decayed.strength, evidence.strength)),
      suppression: Math.min(100, Math.max(decayed.suppression, evidence.suppression) + Math.min(8, evidence.evidenceCount * 2)),
      stressPerSecond: Math.max(decayed.stressPerSecond, evidence.stressPerSecond),
      directionDegrees: blendDirections(decayed.directionDegrees, previousWeight, evidence.directionDegrees, evidenceWeight),
      arcDegrees: Math.max(26, Math.min(decayed.arcDegrees, evidence.arcDegrees) * 0.96),
      rangeCells: Math.max(decayed.rangeCells, evidence.rangeCells),
      confidence: Math.min(90, Math.max(decayed.confidence, evidence.confidence) + Math.min(16, evidence.evidenceCount * 3)),
      uncertaintyCells: Math.max(0.5, Math.min(decayed.uncertaintyCells, evidence.uncertaintyCells) * 0.95),
      lastUpdatedSeconds: now,
      evidenceCount: Math.min(9999, previousWeight + evidence.evidenceCount),
      lastEvidenceSeconds: Math.max(decayed.lastEvidenceSeconds ?? -1, evidence.lastUpdatedSeconds),
    });
  }
  refreshed.add(threatId);
}

function findCompatibleUnknownThreat(
  existing: Map<string, KnownThreatMemory>,
  evidence: CombatThreatEvidence,
  now: number,
): KnownThreatMemory | undefined {
  return [...existing.values()]
    .filter((candidate) => candidate.id.startsWith('unknown-fire:'))
    .filter((candidate) => {
      const lastEvidenceSeconds = candidate.lastEvidenceSeconds ?? candidate.lastUpdatedSeconds;
      if (now - lastEvidenceSeconds > UNKNOWN_MERGE_SECONDS) return false;
      if (angularDifference(candidate.directionDegrees, evidence.directionDegrees) > UNKNOWN_MERGE_DIRECTION_DEGREES) return false;
      const distance = Math.hypot(
        candidate.x - evidence.estimatedSourcePosition.x,
        candidate.y - evidence.estimatedSourcePosition.y,
      );
      return distance <= candidate.uncertaintyCells + evidence.uncertaintyCells;
    })
    .sort((left, right) => unknownCompatibilityScore(left, evidence) - unknownCompatibilityScore(right, evidence))[0];
}

function unknownCompatibilityScore(memory: KnownThreatMemory, evidence: CombatThreatEvidence): number {
  const directionScore = angularDifference(memory.directionDegrees, evidence.directionDegrees) / UNKNOWN_MERGE_DIRECTION_DEGREES;
  const distance = Math.hypot(memory.x - evidence.estimatedSourcePosition.x, memory.y - evidence.estimatedSourcePosition.y);
  const regionScore = distance / Math.max(0.5, memory.uncertaintyCells + evidence.uncertaintyCells);
  return directionScore + regionScore;
}

function createUnknownThreatId(
  existing: Map<string, KnownThreatMemory>,
  evidence: CombatThreatEvidence,
): string {
  const signature = [
    Math.round(normalizeDegrees(evidence.directionDegrees) * 10),
    Math.round(evidence.estimatedSourcePosition.x * 4),
    Math.round(evidence.estimatedSourcePosition.y * 4),
    Math.round(evidence.createdSeconds * 10),
  ].join(':');
  const base = `unknown-fire:${hashString(signature).toString(36)}`;
  return existing.has(base) ? `${base}:${hashString(evidence.id).toString(36)}` : base;
}

function reconcileUnknownThreats(
  observer: UnitModel,
  existing: Map<string, KnownThreatMemory>,
  refreshed: Set<string>,
  now: number,
): void {
  const knownUnitIds = [...existing.keys()].filter((id) => id.startsWith('unit:'));
  if (knownUnitIds.length === 0) return;
  for (const unknown of [...existing.values()]) {
    if (!unknown.id.startsWith('unknown-fire:')) continue;
    const unknownEvidenceSeconds = unknown.lastEvidenceSeconds ?? unknown.lastUpdatedSeconds;
    if (now - unknownEvidenceSeconds > UNKNOWN_RECONCILE_SECONDS) continue;
    const knownId = knownUnitIds
      .map((id) => existing.get(id))
      .filter((candidate): candidate is KnownThreatMemory => candidate !== undefined)
      .filter((known) => unknownMatchesKnownThreat(observer, known, unknown))
      .sort((left, right) => Math.hypot(left.x - unknown.x, left.y - unknown.y) - Math.hypot(right.x - unknown.x, right.y - unknown.y))[0]?.id;
    if (!knownId) continue;
    const known = existing.get(knownId);
    if (!known) continue;
    const decayedKnown = decayEvidenceState(known, now);
    const decayedUnknown = decayEvidenceState(unknown, now);
    existing.set(knownId, {
      ...decayedKnown,
      suppression: Math.max(decayedKnown.suppression, decayedUnknown.suppression),
      stressPerSecond: Math.max(decayedKnown.stressPerSecond, decayedUnknown.stressPerSecond),
      confidence: Math.min(100, Math.max(decayedKnown.confidence, decayedUnknown.confidence) + Math.min(8, (decayedUnknown.evidenceCount ?? 0) * 2)),
      evidenceCount: Math.min(9999, (decayedKnown.evidenceCount ?? 0) + (decayedUnknown.evidenceCount ?? 0)),
      lastEvidenceSeconds: Math.max(decayedKnown.lastEvidenceSeconds ?? -1, decayedUnknown.lastEvidenceSeconds ?? -1),
      lastUpdatedSeconds: now,
    });
    refreshed.add(knownId);
    existing.delete(unknown.id);
    refreshed.delete(unknown.id);
  }
}

function unknownMatchesKnownThreat(
  observer: UnitModel,
  known: KnownThreatMemory,
  unknown: KnownThreatMemory,
): boolean {
  const directionCompatible = angularDifference(known.directionDegrees, unknown.directionDegrees) <= UNKNOWN_RECONCILE_DEGREES
    || angularDifference(
      bearingFromObserver(observer, known),
      bearingFromObserver(observer, unknown),
    ) <= UNKNOWN_RECONCILE_DEGREES;
  if (!directionCompatible) return false;
  const distance = Math.hypot(known.x - unknown.x, known.y - unknown.y);
  return distance <= (known.uncertaintyCells + unknown.uncertaintyCells) * 1.5;
}

function decayEvidenceState(memory: KnownThreatMemory, now: number): KnownThreatMemory {
  if ((memory.lastEvidenceSeconds ?? -1) < 0) return memory;
  const elapsed = Math.max(0, now - memory.lastUpdatedSeconds);
  if (elapsed <= 0) return memory;
  return {
    ...memory,
    suppression: Math.max(0, memory.suppression - EVIDENCE_SUPPRESSION_DECAY_PER_SECOND * elapsed),
    stressPerSecond: Math.max(0, memory.stressPerSecond - EVIDENCE_STRESS_DECAY_PER_SECOND * elapsed),
  };
}

function buildKnownThreat(
  zone: SimulationState['pressureZones'][number],
  confidence: number,
  uncertaintyCells: number,
  source: KnownThreatMemory['source'],
  now: number,
  visibleNow: boolean,
  x = zone.x,
  y = zone.y,
): KnownThreatMemory {
  const settings = resolvePressureZoneSettings(zone);
  return {
    id: zone.id,
    labelRu: zone.labels.ru,
    mode: settings.mode,
    x,
    y,
    radiusCells: zone.radiusCells,
    widthCells: zone.widthCells,
    heightCells: zone.heightCells,
    rotationDegrees: zone.rotationDegrees ?? 0,
    strength: zone.strength,
    suppression: settings.suppression,
    stressPerSecond: zone.stressPerSecond,
    directionDegrees: settings.directionDegrees,
    arcDegrees: settings.arcDegrees,
    rangeCells: settings.rangeCells,
    minRangeCells: settings.minRangeCells,
    falloffPercent: settings.falloffPercent,
    confidence,
    uncertaintyCells,
    source,
    visibleNow,
    lastSeenSeconds: visibleNow ? now : -1,
    lastUpdatedSeconds: now,
    evidenceCount: 0,
    lastEvidenceSeconds: -1,
  };
}

function estimatePressureSource(
  unit: UnitModel,
  zone: SimulationState['pressureZones'][number],
  uncertaintyCells: number,
): { x: number; y: number } {
  const dx = zone.x - unit.position.x;
  const dy = zone.y - unit.position.y;
  const length = Math.max(0.001, Math.hypot(dx, dy));
  const deterministicOffset = ((hashString(`${unit.id}:${zone.id}`) % 2001) / 1000 - 1) * uncertaintyCells * 0.45;
  const perpendicularX = -dy / length;
  const perpendicularY = dx / length;
  return {
    x: zone.x + perpendicularX * deterministicOffset,
    y: zone.y + perpendicularY * deterministicOffset,
  };
}

function normalizeKnownThreat(value: Partial<KnownThreatMemory>, scale: number): KnownThreatMemory {
  const id = String(value.id ?? 'unknown-threat');
  const source = value.source === 'seen' || value.source === 'reported' || value.source === 'heard' || value.source === 'fire_pressure'
    ? value.source
    : 'reported';
  const lastUpdatedSeconds = Math.max(0, number(value.lastUpdatedSeconds, 0));
  const explicitEvidenceCount = Number.isFinite(value.evidenceCount) ? Math.max(0, Math.round(value.evidenceCount ?? 0)) : null;
  const explicitEvidenceSeconds = Number.isFinite(value.lastEvidenceSeconds) ? Math.max(-1, value.lastEvidenceSeconds ?? -1) : null;
  const legacyUnknownEvidence = id.startsWith('unknown-fire:') && percent(value.suppression) > 0;
  const evidenceCount = explicitEvidenceCount ?? (legacyUnknownEvidence ? 1 : 0);
  const lastEvidenceSeconds = explicitEvidenceSeconds ?? (legacyUnknownEvidence ? lastUpdatedSeconds : -1);
  const legacyUnitWithoutEvidenceFields = id.startsWith('unit:')
    && explicitEvidenceCount === null
    && explicitEvidenceSeconds === null;
  return {
    id,
    labelRu: String(value.labelRu ?? 'Неизвестная угроза'),
    mode: value.mode === 'directional_fire' ? 'directional_fire' : 'area',
    x: number(value.x, 0) * scale,
    y: number(value.y, 0) * scale,
    radiusCells: Math.max(0, number(value.radiusCells, 0) * scale),
    widthCells: Math.max(0, number(value.widthCells, 0) * scale),
    heightCells: Math.max(0, number(value.heightCells, 0) * scale),
    rotationDegrees: number(value.rotationDegrees, 0),
    strength: percent(value.strength),
    suppression: legacyUnitWithoutEvidenceFields ? 0 : percent(value.suppression),
    stressPerSecond: legacyUnitWithoutEvidenceFields ? 0 : Math.max(0, number(value.stressPerSecond, 0)),
    directionDegrees: normalizeDegrees(number(value.directionDegrees, 0)),
    arcDegrees: Math.max(1, Math.min(360, number(value.arcDegrees, 45))),
    rangeCells: Math.max(0.5 * scale, number(value.rangeCells, 8) * scale),
    minRangeCells: Math.max(0, number(value.minRangeCells, 0) * scale),
    falloffPercent: percent(value.falloffPercent),
    confidence: percent(value.confidence),
    uncertaintyCells: Math.max(0, number(value.uncertaintyCells, 1.5) * scale),
    source,
    visibleNow: Boolean(value.visibleNow),
    lastSeenSeconds: number(value.lastSeenSeconds, -1),
    lastUpdatedSeconds,
    evidenceCount,
    lastEvidenceSeconds,
  };
}

function isUnitAffectedByZone(unit: UnitModel, zone: SimulationState['pressureZones'][number]): boolean {
  if (unit.behaviorRuntime.danger <= 0 && unit.behaviorRuntime.suppression <= 0) return false;
  const settings = resolvePressureZoneSettings(zone);
  const dx = unit.position.x - zone.x;
  const dy = unit.position.y - zone.y;
  const range = Math.hypot(dx, dy);
  if (settings.mode === 'directional_fire') {
    if (range < settings.minRangeCells || range > settings.rangeCells) return false;
    const bearing = normalizeDegrees(Math.atan2(dy, dx) * 180 / Math.PI);
    return angularDifference(bearing, settings.directionDegrees) <= settings.arcDegrees / 2;
  }
  if (zone.shape === 'circle') return range <= zone.radiusCells;
  return Math.abs(dx) <= zone.widthCells / 2 && Math.abs(dy) <= zone.heightCells / 2;
}

function tacticalKnowledgeFingerprint(threats: readonly KnownThreatMemory[]): string {
  return threats
    .map(threatRevisionFingerprint)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))
    .map((value) => JSON.stringify(value))
    .join('|');
}

function threatRevisionFingerprint(memory: KnownThreatMemory): Record<string, unknown> {
  return {
    id: memory.id,
    labelRu: memory.labelRu,
    mode: memory.mode,
    x: quantize(memory.x, 0.25),
    y: quantize(memory.y, 0.25),
    radiusCells: quantize(memory.radiusCells, 0.5),
    widthCells: quantize(memory.widthCells, 0.5),
    heightCells: quantize(memory.heightCells, 0.5),
    rotationDegrees: quantize(memory.rotationDegrees, 5),
    strength: quantize(memory.strength, 5),
    suppression: quantize(memory.suppression, 5),
    stressPerSecond: quantize(memory.stressPerSecond, 2),
    directionDegrees: quantize(memory.directionDegrees, 10),
    arcDegrees: quantize(memory.arcDegrees, 10),
    rangeCells: quantize(memory.rangeCells, 1),
    minRangeCells: quantize(memory.minRangeCells, 1),
    falloffPercent: quantize(memory.falloffPercent, 5),
    confidence: quantize(memory.confidence, 10),
    uncertaintyCells: quantize(memory.uncertaintyCells, 1),
    source: memory.source,
    visibleNow: memory.visibleNow,
    evidenceCount: memory.evidenceCount ?? 0,
    lastEvidenceSeconds: quantize(memory.lastEvidenceSeconds ?? -1, 1),
  };
}

function sourceForContact(contact: PerceptionContactMemory): KnownThreatMemory['source'] {
  if (contact.source === 'visual') return 'seen';
  if (contact.source === 'sound') return 'heard';
  if (contact.source === 'fire_pressure') return 'fire_pressure';
  return 'reported';
}

function confidenceCapForStage(stage: PerceptionContactMemory['stage']): number {
  if (stage === 'cue' || stage === 'suspicion') return 49;
  if (stage === 'contact') return 69;
  return 100;
}

function bearingFromObserver(observer: UnitModel, threat: KnownThreatMemory): number {
  return normalizeDegrees(Math.atan2(threat.y - observer.position.y, threat.x - observer.position.x) * 180 / Math.PI);
}

function blendDirections(left: number, leftWeight: number, right: number, rightWeight: number): number {
  const leftRadians = left * Math.PI / 180;
  const rightRadians = right * Math.PI / 180;
  return normalizeDegrees(Math.atan2(
    Math.sin(leftRadians) * leftWeight + Math.sin(rightRadians) * rightWeight,
    Math.cos(leftRadians) * leftWeight + Math.cos(rightRadians) * rightWeight,
  ) * 180 / Math.PI);
}

function metersToCells(state: SimulationState, meters: number): number {
  return meters / Math.max(0.001, state.map.metersPerCell);
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function angularDifference(left: number, right: number): number {
  const difference = Math.abs(normalizeDegrees(left) - normalizeDegrees(right));
  return Math.min(difference, 360 - difference);
}

function normalizeDegrees(value: number): number {
  const result = value % 360;
  return result < 0 ? result + 360 : result;
}

function quantize(value: number, bucket: number): number {
  return Math.round(value / bucket) * bucket;
}

function normalizeScale(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function percent(value: unknown): number {
  return Math.max(0, Math.min(100, Math.round(number(value, 0))));
}

function number(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
