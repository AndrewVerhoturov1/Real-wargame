import { distance } from '../geometry';
import { resolvePressureZoneSettings } from '../pressure/PressureZone';
import type { SimulationState } from '../simulation/SimulationState';
import type { KnownThreatMemory, UnitModel, UnitTacticalKnowledge } from '../units/UnitModel';
import { computeLineOfSight } from '../visibility/LineOfSight';

const CONFIDENCE_DECAY_PER_SECOND = 0.55;
const UNCERTAINTY_GROWTH_PER_SECOND = 0.012;
const MIN_MEMORY_CONFIDENCE = 4;

export function createEmptyTacticalKnowledge(): UnitTacticalKnowledge {
  return {
    threats: [],
    revision: 0,
    lastUpdatedSeconds: 0,
  };
}

export function normalizeTacticalKnowledge(value?: Partial<UnitTacticalKnowledge>): UnitTacticalKnowledge {
  return {
    threats: Array.isArray(value?.threats)
      ? value.threats.map((item) => normalizeKnownThreat(item))
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
  const existing = new Map(unit.tacticalKnowledge.threats.map((memory) => [memory.id, memory]));
  let changed = false;

  for (const zone of state.pressureZones) {
    const settings = resolvePressureZoneSettings(zone);
    if (!settings.enabled) continue;

    const source = { x: zone.x, y: zone.y };
    const distanceCells = distance(unit.position, source);
    const sight = computeLineOfSight(state.map, unit, source);
    const visibleNow = settings.sourceVisible
      && distanceCells <= unit.viewRangeCells
      && !sight.blocked;
    const sensedNow = visibleNow || settings.sourceKnown || isUnitAffectedByZone(unit, zone);
    if (!sensedNow) continue;

    const baseConfidence = visibleNow
      ? 100
      : Math.max(15, Math.min(95, zone.knowledgeConfidence ?? Math.max(zone.strength, settings.suppression)));
    const uncertaintyCells = visibleNow
      ? 0.15
      : Math.max(0.4, zone.uncertaintyCells ?? 1.5);
    const sourceKind: KnownThreatMemory['source'] = visibleNow
      ? 'seen'
      : settings.sourceKnown
        ? 'reported'
        : 'fire_pressure';
    const next = buildKnownThreat(zone, baseConfidence, uncertaintyCells, sourceKind, now, visibleNow);
    const previous = existing.get(zone.id);

    if (!previous || threatChanged(previous, next)) changed = true;
    existing.set(zone.id, next);
  }

  const nextThreats: KnownThreatMemory[] = [];
  for (const memory of existing.values()) {
    if (memory.lastSeenSeconds === now || memory.lastUpdatedSeconds === now) {
      nextThreats.push(memory);
      continue;
    }

    const confidence = Math.max(0, memory.confidence - CONFIDENCE_DECAY_PER_SECOND * deltaSeconds);
    const uncertaintyCells = Math.min(12, memory.uncertaintyCells + UNCERTAINTY_GROWTH_PER_SECOND * deltaSeconds);
    if (confidence < MIN_MEMORY_CONFIDENCE) {
      changed = true;
      continue;
    }

    if (
      Math.round(confidence) !== Math.round(memory.confidence)
      || Math.round(uncertaintyCells * 10) !== Math.round(memory.uncertaintyCells * 10)
    ) {
      changed = true;
    }
    nextThreats.push({
      ...memory,
      confidence,
      uncertaintyCells,
      lastUpdatedSeconds: now,
      visibleNow: false,
    });
  }

  unit.tacticalKnowledge.threats = nextThreats.sort((left, right) => right.confidence - left.confidence);
  unit.tacticalKnowledge.lastUpdatedSeconds = now;
  if (changed) unit.tacticalKnowledge.revision += 1;
}

function buildKnownThreat(
  zone: SimulationState['pressureZones'][number],
  confidence: number,
  uncertaintyCells: number,
  source: KnownThreatMemory['source'],
  now: number,
  visibleNow: boolean,
): KnownThreatMemory {
  const settings = resolvePressureZoneSettings(zone);
  return {
    id: zone.id,
    labelRu: zone.labels.ru,
    mode: settings.mode,
    x: zone.x,
    y: zone.y,
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
  };
}

function normalizeKnownThreat(value: Partial<KnownThreatMemory>): KnownThreatMemory {
  return {
    id: String(value.id ?? 'unknown-threat'),
    labelRu: String(value.labelRu ?? 'Неизвестная угроза'),
    mode: value.mode === 'directional_fire' ? 'directional_fire' : 'area',
    x: number(value.x, 0),
    y: number(value.y, 0),
    radiusCells: Math.max(0, number(value.radiusCells, 0)),
    widthCells: Math.max(0, number(value.widthCells, 0)),
    heightCells: Math.max(0, number(value.heightCells, 0)),
    rotationDegrees: number(value.rotationDegrees, 0),
    strength: percent(value.strength),
    suppression: percent(value.suppression),
    stressPerSecond: Math.max(0, number(value.stressPerSecond, 0)),
    directionDegrees: normalizeDegrees(number(value.directionDegrees, 0)),
    arcDegrees: Math.max(1, Math.min(360, number(value.arcDegrees, 45))),
    rangeCells: Math.max(0.5, number(value.rangeCells, 8)),
    minRangeCells: Math.max(0, number(value.minRangeCells, 0)),
    falloffPercent: percent(value.falloffPercent),
    confidence: percent(value.confidence),
    uncertaintyCells: Math.max(0, number(value.uncertaintyCells, 1.5)),
    source: value.source === 'seen' || value.source === 'reported' || value.source === 'heard' || value.source === 'fire_pressure'
      ? value.source
      : 'reported',
    visibleNow: Boolean(value.visibleNow),
    lastSeenSeconds: number(value.lastSeenSeconds, -1),
    lastUpdatedSeconds: Math.max(0, number(value.lastUpdatedSeconds, 0)),
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

function threatChanged(left: KnownThreatMemory, right: KnownThreatMemory): boolean {
  return JSON.stringify(threatRevisionFingerprint(left)) !== JSON.stringify(threatRevisionFingerprint(right));
}

function threatRevisionFingerprint(memory: KnownThreatMemory): Record<string, unknown> {
  return {
    id: memory.id,
    labelRu: memory.labelRu,
    mode: memory.mode,
    x: memory.x,
    y: memory.y,
    radiusCells: memory.radiusCells,
    widthCells: memory.widthCells,
    heightCells: memory.heightCells,
    rotationDegrees: memory.rotationDegrees,
    strength: memory.strength,
    suppression: memory.suppression,
    stressPerSecond: memory.stressPerSecond,
    directionDegrees: memory.directionDegrees,
    arcDegrees: memory.arcDegrees,
    rangeCells: memory.rangeCells,
    minRangeCells: memory.minRangeCells,
    falloffPercent: memory.falloffPercent,
    confidence: Math.round(memory.confidence),
    uncertaintyCells: Math.round(memory.uncertaintyCells * 10) / 10,
    source: memory.source,
    visibleNow: memory.visibleNow,
  };
}

function angularDifference(left: number, right: number): number {
  const difference = Math.abs(normalizeDegrees(left) - normalizeDegrees(right));
  return Math.min(difference, 360 - difference);
}

function normalizeDegrees(value: number): number {
  const result = value % 360;
  return result < 0 ? result + 360 : result;
}

function percent(value: unknown): number {
  return Math.max(0, Math.min(100, Math.round(number(value, 0))));
}

function number(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
