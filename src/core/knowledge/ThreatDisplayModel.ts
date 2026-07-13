import type { PerceptionContactStage, PerceptionContactSource } from '../perception/PerceptionContact';
import type { KnownThreatMemory, ThreatMemorySource, UnitModel } from '../units/UnitModel';

export interface ThreatDisplayEntry {
  id: string;
  stimulusId: string;
  labelRu: string;
  stage: PerceptionContactStage;
  source: PerceptionContactSource | ThreatMemorySource;
  confidence: number;
  uncertaintyCells: number;
  x: number;
  y: number;
  current: boolean;
  explanationRu: string[];
}

export function buildThreatDisplayEntries(unit: UnitModel): ThreatDisplayEntry[] {
  const entries = new Map<string, ThreatDisplayEntry>();
  for (const contact of unit.perceptionKnowledge.contacts) {
    const threatId = threatIdFromStimulus(contact.stimulusId);
    const key = threatId ?? contact.id;
    entries.set(key, {
      id: key,
      stimulusId: contact.stimulusId,
      labelRu: contact.labelRu,
      stage: contact.stage,
      source: contact.source,
      confidence: contact.confidence,
      uncertaintyCells: contact.uncertaintyCells,
      x: contact.lastKnownPosition.x,
      y: contact.lastKnownPosition.y,
      current: contact.visibleNow || contact.observedNow,
      explanationRu: [...contact.explanationRu],
    });
  }
  for (const threat of unit.tacticalKnowledge.threats) {
    const existing = entries.get(threat.id);
    if (existing) {
      if (!existing.labelRu.trim()) existing.labelRu = threat.labelRu;
      continue;
    }
    entries.set(threat.id, {
      id: threat.id,
      stimulusId: `threat:${threat.id}`,
      labelRu: threat.labelRu,
      stage: threat.visibleNow ? 'identified' : threat.confidence >= 65 ? 'contact' : threat.confidence >= 35 ? 'suspicion' : 'cue',
      source: threat.source,
      confidence: threat.confidence,
      uncertaintyCells: threat.uncertaintyCells,
      x: threat.x,
      y: threat.y,
      current: threat.visibleNow,
      explanationRu: [threat.visibleNow ? 'Источник угрозы сейчас подтверждён.' : 'Показано последнее известное положение угрозы.'],
    });
  }
  return [...entries.values()].sort((a, b) => Number(b.current) - Number(a.current) || b.confidence - a.confidence || a.labelRu.localeCompare(b.labelRu));
}

export function buildThreatGeometryKey(threats: KnownThreatMemory[], cellSize: number): string {
  return [
    `cell:${cellSize}`,
    ...threats.map((threat) => [
      threat.id,
      threat.labelRu,
      threat.mode,
      round(threat.x, 2), round(threat.y, 2),
      round(threat.radiusCells, 2), round(threat.widthCells, 2), round(threat.heightCells, 2),
      round(threat.rotationDegrees, 1), round(threat.directionDegrees, 1), round(threat.arcDegrees, 1),
      round(threat.rangeCells, 2), round(threat.minRangeCells, 2),
      Math.floor(Math.max(0, threat.confidence) / 10),
      round(threat.uncertaintyCells, 1),
    ].join(':')),
  ].join('|');
}

export function buildThreatMarkerKey(threats: KnownThreatMemory[], cellSize: number): string {
  return [
    `cell:${cellSize}`,
    ...threats.map((threat) => `${threat.id}:${threat.visibleNow ? 1 : 0}:${round(threat.x, 2)}:${round(threat.y, 2)}`),
  ].join('|');
}

export function threatIdFromStimulus(stimulusId: string): string | null {
  return stimulusId.startsWith('threat:') ? stimulusId.slice('threat:'.length) : null;
}

function round(value: number, digits: number): string { return Number(value.toFixed(digits)).toString(); }
