import type { GridPosition } from '../geometry';
import type { PerceptionContactMemory } from '../perception/PerceptionContact';
import type { SimulationState } from '../simulation/SimulationState';
import type { KnownThreatMemory } from '../units/UnitModel';
import { estimateSubjectiveFront, type SubjectiveFrontEvidence } from './EstimatedFront';
import { readCurrentContactInformationTime, readUnitKnowledgeAt } from './UnitKnowledgeHistory';

export type UnitMemoryKnowledgeType =
  | 'confirmed_contact'
  | 'last_known'
  | 'supposition'
  | 'intelligence'
  | 'estimated_front';

export type UnitMemoryGeometry =
  | { readonly kind: 'point'; readonly position: GridPosition }
  | { readonly kind: 'uncertainty-circle'; readonly center: GridPosition; readonly radiusCells: number }
  | {
      readonly kind: 'area';
      readonly center: GridPosition;
      readonly radiusCells: number;
      readonly widthCells: number;
      readonly heightCells: number;
      readonly rotationDegrees: number;
    }
  | {
      readonly kind: 'directional-area';
      readonly origin: GridPosition;
      readonly directionDegrees: number;
      readonly arcDegrees: number;
      readonly minRangeCells: number;
      readonly rangeCells: number;
      readonly uncertaintyCells: number;
    }
  | {
      readonly kind: 'front-band';
      readonly start: GridPosition;
      readonly end: GridPosition;
      readonly halfWidthCells: number;
    };

export interface UnitMemoryEntryReadModel {
  readonly id: string;
  readonly knowledgeType: UnitMemoryKnowledgeType;
  readonly labelRu: string;
  readonly geometry: UnitMemoryGeometry;
  readonly confidence: number;
  readonly uncertaintyCells: number;
  readonly source: string;
  readonly sourceUnitId: string | null;
  readonly informationAtSeconds: number;
  readonly lastConfirmedAtSeconds: number | null;
  readonly ageSeconds: number;
  readonly current: boolean;
  readonly explanationRu: readonly string[];
  readonly evidenceIds: readonly string[];
}

export interface UnitMemoryReadModel {
  readonly unitId: string;
  readonly mode: 'live' | 'history';
  readonly viewTimeSeconds: number;
  readonly recordedAtSeconds: number;
  readonly entries: readonly UnitMemoryEntryReadModel[];
  readonly knowledgeRevisionKey: string;
}

export interface UnitMemoryReadOptions {
  readonly viewTimeSeconds?: number;
  readonly includeEstimatedFront?: boolean;
}

/**
 * Unifies perception, tactical memory, received reports and derived subjective
 * front into the five accepted Polygon memory classes. It never reads
 * objective hostile-unit positions to invent knowledge.
 */
export function buildUnitMemoryReadModel(
  state: SimulationState,
  unitId: string,
  options: UnitMemoryReadOptions = {},
): UnitMemoryReadModel | null {
  const liveUnit = state.units.find((unit) => unit.id === unitId) ?? null;
  const historyMode = options.viewTimeSeconds !== undefined;
  const requestedTime = Math.max(0, options.viewTimeSeconds ?? state.simulationTimeSeconds);
  const historical = historyMode ? readUnitKnowledgeAt(state, unitId, requestedTime) : null;
  if (historyMode && !historical) return null;
  if (!historyMode && !liveUnit) return null;

  const perception = historical?.perceptionKnowledge ?? liveUnit!.perceptionKnowledge;
  const tactical = historical?.tacticalKnowledge ?? liveUnit!.tacticalKnowledge;
  const recordedAtSeconds = historical?.recordedAtSeconds ?? state.simulationTimeSeconds;
  const viewTimeSeconds = historyMode ? requestedTime : state.simulationTimeSeconds;
  const entriesByKey = new Map<string, UnitMemoryEntryReadModel>();

  for (const contact of perception.contacts) {
    const key = contactIdentity(contact);
    const informationAtSeconds = historical?.informationAtSecondsByContactId[contact.id]
      ?? readCurrentContactInformationTime(state, unitId, contact.id)
      ?? fallbackContactInformationTime(contact);
    entriesByKey.set(key, contactEntry(contact, viewTimeSeconds, informationAtSeconds));
  }

  for (const threat of tactical.threats) {
    const key = threat.id;
    if (entriesByKey.has(key)) continue;
    entriesByKey.set(key, threatEntry(threat, viewTimeSeconds));
  }

  const entries = [...entriesByKey.values()];
  if (options.includeEstimatedFront !== false) {
    const front = estimateSubjectiveFront(entries.flatMap(frontEvidence));
    if (front) {
      entries.push({
        id: `estimated-front:${unitId}`,
        knowledgeType: 'estimated_front',
        labelRu: 'Предполагаемая линия фронта',
        geometry: {
          kind: 'front-band',
          start: front.start,
          end: front.end,
          halfWidthCells: front.halfWidthCells,
        },
        confidence: front.confidence,
        uncertaintyCells: front.halfWidthCells,
        source: 'derived_from_subjective_knowledge',
        sourceUnitId: null,
        informationAtSeconds: front.informationAtSeconds,
        lastConfirmedAtSeconds: null,
        ageSeconds: Math.max(0, viewTimeSeconds - front.informationAtSeconds),
        current: false,
        explanationRu: ['Оценка построена только по сведениям, которыми располагает этот боец.'],
        evidenceIds: [...front.evidenceIds],
      });
    }
  }

  entries.sort((left, right) => (
    Number(right.current) - Number(left.current)
    || right.informationAtSeconds - left.informationAtSeconds
    || right.confidence - left.confidence
    || left.id.localeCompare(right.id)
  ));

  return {
    unitId,
    mode: historyMode ? 'history' : 'live',
    viewTimeSeconds,
    recordedAtSeconds,
    entries,
    knowledgeRevisionKey: [
      unitId,
      historyMode ? `history:${recordedAtSeconds.toFixed(3)}` : 'live',
      perception.revision,
      tactical.revision,
      entries.length,
    ].join(':'),
  };
}

function contactEntry(
  contact: PerceptionContactMemory,
  viewTimeSeconds: number,
  informationAtSeconds: number,
): UnitMemoryEntryReadModel {
  const current = contact.visibleNow || contact.observedNow;
  const knowledgeType = classifyContact(contact, current);
  const exactCurrent = current && (contact.stage === 'identified' || contact.stage === 'confirmed');
  return {
    id: contact.id,
    knowledgeType,
    labelRu: contact.labelRu,
    geometry: exactCurrent
      ? { kind: 'point', position: { ...contact.lastKnownPosition } }
      : {
          kind: 'uncertainty-circle',
          center: { ...contact.lastKnownPosition },
          radiusCells: Math.max(0, contact.uncertaintyCells),
        },
    confidence: contact.confidence,
    uncertaintyCells: contact.uncertaintyCells,
    source: contact.source,
    sourceUnitId: contact.sourceUnitId,
    informationAtSeconds,
    lastConfirmedAtSeconds: contact.lastObservedSeconds >= 0 ? contact.lastObservedSeconds : null,
    ageSeconds: Math.max(0, viewTimeSeconds - informationAtSeconds),
    current,
    explanationRu: [...contact.explanationRu],
    evidenceIds: [contact.stimulusId],
  };
}

function threatEntry(threat: KnownThreatMemory, viewTimeSeconds: number): UnitMemoryEntryReadModel {
  const informationAtSeconds = threatInformationTime(threat);
  return {
    id: threat.id,
    knowledgeType: classifyThreat(threat),
    labelRu: threat.labelRu,
    geometry: threatGeometry(threat),
    confidence: threat.confidence,
    uncertaintyCells: threat.uncertaintyCells,
    source: threat.source,
    sourceUnitId: threat.id.startsWith('unit:') ? threat.id.slice('unit:'.length) : null,
    informationAtSeconds,
    lastConfirmedAtSeconds: threat.lastSeenSeconds >= 0 ? threat.lastSeenSeconds : null,
    ageSeconds: Math.max(0, viewTimeSeconds - informationAtSeconds),
    current: threat.visibleNow,
    explanationRu: [threat.visibleNow ? 'Источник угрозы сейчас подтверждён.' : 'Показана субъективная оценка угрозы.'],
    evidenceIds: [threat.id],
  };
}

function classifyContact(contact: PerceptionContactMemory, current: boolean): UnitMemoryKnowledgeType {
  if (contact.source === 'reported') return 'intelligence';
  if (current && (contact.stage === 'identified' || contact.stage === 'confirmed')) return 'confirmed_contact';
  if (!current && contact.source === 'visual' && (contact.stage === 'identified' || contact.stage === 'confirmed')) return 'last_known';
  if (contact.source === 'sound' || contact.source === 'fire_pressure' || contact.stage === 'cue' || contact.stage === 'suspicion') {
    return 'supposition';
  }
  return current ? 'confirmed_contact' : 'last_known';
}

function classifyThreat(threat: KnownThreatMemory): UnitMemoryKnowledgeType {
  if (threat.source === 'reported') return 'intelligence';
  if (threat.visibleNow) return 'confirmed_contact';
  if (threat.source === 'heard' || threat.source === 'fire_pressure') return 'supposition';
  return 'last_known';
}

function threatGeometry(threat: KnownThreatMemory): UnitMemoryGeometry {
  if (threat.mode === 'area') {
    return {
      kind: 'area',
      center: { x: threat.x, y: threat.y },
      radiusCells: Math.max(0, threat.radiusCells),
      widthCells: Math.max(0, threat.widthCells),
      heightCells: Math.max(0, threat.heightCells),
      rotationDegrees: threat.rotationDegrees,
    };
  }
  return {
    kind: 'directional-area',
    origin: { x: threat.x, y: threat.y },
    directionDegrees: threat.directionDegrees,
    arcDegrees: threat.arcDegrees,
    minRangeCells: threat.minRangeCells,
    rangeCells: threat.rangeCells,
    uncertaintyCells: threat.uncertaintyCells,
  };
}

function fallbackContactInformationTime(contact: PerceptionContactMemory): number {
  if (contact.lastObservedSeconds >= 0) return contact.lastObservedSeconds;
  return Math.max(0, contact.lastUpdatedSeconds);
}

function threatInformationTime(threat: KnownThreatMemory): number {
  if (typeof threat.lastEvidenceSeconds === 'number' && threat.lastEvidenceSeconds >= 0) return threat.lastEvidenceSeconds;
  if (threat.lastSeenSeconds >= 0) return threat.lastSeenSeconds;
  return Math.max(0, threat.lastUpdatedSeconds);
}

function contactIdentity(contact: PerceptionContactMemory): string {
  if (contact.sourceUnitId) return `unit:${contact.sourceUnitId}`;
  if (contact.stimulusId.startsWith('threat:')) return contact.stimulusId.slice('threat:'.length);
  return contact.id;
}

function frontEvidence(entry: UnitMemoryEntryReadModel): SubjectiveFrontEvidence[] {
  if (entry.knowledgeType === 'estimated_front' || entry.confidence < 10) return [];
  const position = geometryCenter(entry.geometry);
  if (!position) return [];
  return [{
    id: entry.id,
    position,
    confidence: entry.confidence,
    uncertaintyCells: entry.uncertaintyCells,
    informationAtSeconds: entry.informationAtSeconds,
  }];
}

function geometryCenter(geometry: UnitMemoryGeometry): GridPosition | null {
  if (geometry.kind === 'point') return geometry.position;
  if (geometry.kind === 'uncertainty-circle' || geometry.kind === 'area') return geometry.center;
  if (geometry.kind === 'directional-area') return geometry.origin;
  return null;
}
