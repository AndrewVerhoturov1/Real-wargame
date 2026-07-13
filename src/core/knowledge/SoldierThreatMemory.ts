import { resolvePressureZoneSettings } from '../pressure/PressureZone';
import type { SimulationState } from '../simulation/SimulationState';
import type { KnownThreatMemory, UnitModel, UnitTacticalKnowledge } from '../units/UnitModel';

const CONFIDENCE_DECAY_PER_SECOND = 0.55;
const UNCERTAINTY_GROWTH_METERS_PER_SECOND = 0.12;
const MAX_UNCERTAINTY_METERS = 120;
const MIN_MEMORY_CONFIDENCE = 4;

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
  const existing = new Map(unit.tacticalKnowledge.threats.map((memory) => [memory.id, memory]));
  let changed = false;

  for (const contact of unit.perceptionKnowledge.contacts) {
    const zoneId = contact.stimulusId.startsWith('threat:') ? contact.stimulusId.slice('threat:'.length) : null;
    if (!zoneId) continue;
    const zone = state.pressureZones.find((candidate) => candidate.id === zoneId);
    if (!zone) continue;

    const confidenceCap = contact.stage === 'cue' || contact.stage === 'suspicion'
      ? 49
      : contact.stage === 'contact'
        ? 69
        : 100;
    const confidence = Math.min(confidenceCap, Math.max(4, contact.confidence));
    const visibleNow = (contact.stage === 'identified' || contact.stage === 'confirmed') && contact.visibleNow;
    const source: KnownThreatMemory['source'] = contact.source === 'visual'
      ? 'seen'
      : contact.source === 'sound'
        ? 'heard'
        : contact.source;
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
    const previous = existing.get(zone.id);
    if (!previous || threatChanged(previous, next)) changed = true;
    existing.set(zone.id, next);
  }

  for (const zone of state.pressureZones) {
    const settings = resolvePressureZoneSettings(zone);
    if (!settings.enabled || !isUnitAffectedByZone(unit, zone)) continue;
    if (existing.has(zone.id)) continue;

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
    changed = true;
  }

  const nextThreats: KnownThreatMemory[] = [];
  const uncertaintyGrowthCells = metersToCells(state, UNCERTAINTY_GROWTH_METERS_PER_SECOND) * deltaSeconds;
  const maxUncertaintyCells = metersToCells(state, MAX_UNCERTAINTY_METERS);
  for (const memory of existing.values()) {
    if (memory.lastSeenSeconds === now || memory.lastUpdatedSeconds === now) {
      nextThreats.push(memory);
      continue;
    }

    const confidence = Math.max(0, memory.confidence - CONFIDENCE_DECAY_PER_SECOND * deltaSeconds);
    const uncertaintyCells = Math.min(maxUncertaintyCells, memory.uncertaintyCells + uncertaintyGrowthCells);
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
  return {
    id: String(value.id ?? 'unknown-threat'),
    labelRu: String(value.labelRu ?? 'Неизвестная угроза'),
    mode: value.mode === 'directional_fire' ? 'directional_fire' : 'area',
    x: number(value.x, 0) * scale,
    y: number(value.y, 0) * scale,
    radiusCells: Math.max(0, number(value.radiusCells, 0) * scale),
    widthCells: Math.max(0, number(value.widthCells, 0) * scale),
    heightCells: Math.max(0, number(value.heightCells, 0) * scale),
    rotationDegrees: number(value.rotationDegrees, 0),
    strength: percent(value.strength),
    suppression: percent(value.suppression),
    stressPerSecond: Math.max(0, number(value.stressPerSecond, 0)),
    directionDegrees: normalizeDegrees(number(value.directionDegrees, 0)),
    arcDegrees: Math.max(1, Math.min(360, number(value.arcDegrees, 45))),
    rangeCells: Math.max(0.5 * scale, number(value.rangeCells, 8) * scale),
    minRangeCells: Math.max(0, number(value.minRangeCells, 0) * scale),
    falloffPercent: percent(value.falloffPercent),
    confidence: percent(value.confidence),
    uncertaintyCells: Math.max(0, number(value.uncertaintyCells, 1.5) * scale),
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
    x: Math.round(memory.x * 10) / 10,
    y: Math.round(memory.y * 10) / 10,
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
  };
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

function normalizeScale(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function percent(value: unknown): number {
  return Math.max(0, Math.min(100, Math.round(number(value, 0))));
}

function number(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
