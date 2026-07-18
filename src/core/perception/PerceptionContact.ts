import type { GridPosition } from '../geometry';

export type PerceptionContactStage = 'cue' | 'suspicion' | 'contact' | 'identified' | 'confirmed';
export type PerceptionContactSource = 'visual' | 'sound' | 'reported' | 'fire_pressure';

export interface PerceptionContactMemory {
  id: string;
  stimulusId: string;
  sourceUnitId: string | null;
  labelRu: string;
  stage: PerceptionContactStage;
  source: PerceptionContactSource;
  evidence: number;
  confidence: number;
  uncertaintyCells: number;
  lastKnownPosition: GridPosition;
  visibleNow: boolean;
  observedNow: boolean;
  lastObservedSeconds: number;
  lastUpdatedSeconds: number;
  evidencePerSecond: number;
  detectionVariance: number;
  explanationRu: string[];
}

export interface UnitPerceptionKnowledge {
  contacts: PerceptionContactMemory[];
  revision: number;
  lastUpdatedSeconds: number;
}

export interface VisualContactInput {
  id: string;
  stimulusId: string;
  sourceUnitId?: string | null;
  labelRu: string;
  position: GridPosition;
  evidencePerSecond: number;
  detectionVariance?: number;
  deltaSeconds: number;
  nowSeconds: number;
  source?: PerceptionContactSource;
  explanationRu?: string[];
}

export interface ReportedContactInput {
  id: string;
  stimulusId: string;
  sourceUnitId?: string | null;
  labelRu: string;
  position: GridPosition;
  confidence: number;
  uncertaintyCells: number;
  nowSeconds: number;
  source?: Extract<PerceptionContactSource, 'reported' | 'fire_pressure' | 'sound'>;
  explanationRu?: string[];
}

export interface ContactDecayInput {
  deltaSeconds: number;
  nowSeconds: number;
  metersPerCell: number;
}

export const CONTACT_STAGE_THRESHOLDS = {
  cue: 25,
  suspicion: 50,
  contact: 80,
  identified: 120,
  confirmed: 150,
} as const;

export function createEmptyPerceptionKnowledge(): UnitPerceptionKnowledge {
  return {
    contacts: [],
    revision: 0,
    lastUpdatedSeconds: 0,
  };
}

export function normalizePerceptionKnowledge(value?: Partial<UnitPerceptionKnowledge>): UnitPerceptionKnowledge {
  return {
    contacts: Array.isArray(value?.contacts) ? value.contacts.map(normalizeContact) : [],
    revision: finiteNonNegative(value?.revision, 0),
    lastUpdatedSeconds: finiteNonNegative(value?.lastUpdatedSeconds, 0),
  };
}

export function createStableDetectionVariance(
  observerId: string,
  stimulusId: string,
  variancePercent: number,
  episode = 0,
): number {
  const percent = clamp(number(variancePercent, 0), 0, 25) / 100;
  if (percent <= 0) return 1;
  const hash = hashString(`${observerId}:${stimulusId}:${episode}`);
  const signed01 = (hash % 20001) / 10000 - 1;
  return clamp(1 + signed01 * percent, 1 - percent, 1 + percent);
}

export function getContactStageForEvidence(evidence: number): PerceptionContactStage {
  if (evidence >= CONTACT_STAGE_THRESHOLDS.confirmed) return 'confirmed';
  if (evidence >= CONTACT_STAGE_THRESHOLDS.identified) return 'identified';
  if (evidence >= CONTACT_STAGE_THRESHOLDS.contact) return 'contact';
  if (evidence >= CONTACT_STAGE_THRESHOLDS.suspicion) return 'suspicion';
  return 'cue';
}

export function contactStageRank(stage: PerceptionContactStage): number {
  switch (stage) {
    case 'confirmed': return 5;
    case 'identified': return 4;
    case 'contact': return 3;
    case 'suspicion': return 2;
    case 'cue':
    default: return 1;
  }
}

export function advanceVisualContact(
  previous: PerceptionContactMemory | null,
  input: VisualContactInput,
): PerceptionContactMemory {
  const detectionVariance = previous?.detectionVariance
    ?? clamp(number(input.detectionVariance, 1), 0.5, 1.5);
  const evidencePerSecond = Math.max(0, input.evidencePerSecond) * detectionVariance;
  const evidence = clamp((previous?.evidence ?? 0) + evidencePerSecond * Math.max(0, input.deltaSeconds), 0, 200);
  const stage = getContactStageForEvidence(evidence);
  const confidence = clamp(evidence / 1.5, 0, 100);
  const uncertaintyCells = Math.max(0.25, 6 - evidence / 35);

  return {
    id: input.id,
    stimulusId: input.stimulusId,
    sourceUnitId: input.sourceUnitId ?? previous?.sourceUnitId ?? null,
    labelRu: input.labelRu,
    stage,
    source: input.source ?? 'visual',
    evidence,
    confidence,
    uncertaintyCells,
    lastKnownPosition: { ...input.position },
    visibleNow: contactStageRank(stage) >= contactStageRank('identified'),
    observedNow: contactStageRank(stage) >= contactStageRank('contact'),
    lastObservedSeconds: input.nowSeconds,
    lastUpdatedSeconds: input.nowSeconds,
    evidencePerSecond,
    detectionVariance,
    explanationRu: [...(input.explanationRu ?? [])],
  };
}

export function advanceReportedContact(
  previous: PerceptionContactMemory | null,
  input: ReportedContactInput,
): PerceptionContactMemory {
  const confidence = clamp(input.confidence, 0, 100);
  const reportedEvidence = input.source === 'sound'
    ? Math.min(CONTACT_STAGE_THRESHOLDS.suspicion + 10, confidence * 0.85)
    : Math.min(CONTACT_STAGE_THRESHOLDS.identified - 1, confidence * 1.1);
  const evidence = Math.max(previous?.evidence ?? 0, reportedEvidence);
  const stage = getContactStageForEvidence(evidence);

  return {
    id: input.id,
    stimulusId: input.stimulusId,
    sourceUnitId: input.sourceUnitId ?? previous?.sourceUnitId ?? null,
    labelRu: input.labelRu,
    stage,
    source: input.source ?? 'reported',
    evidence,
    confidence: Math.max(previous?.confidence ?? 0, confidence),
    uncertaintyCells: Math.max(0.25, input.uncertaintyCells),
    lastKnownPosition: { ...input.position },
    visibleNow: false,
    observedNow: false,
    lastObservedSeconds: previous?.lastObservedSeconds ?? -1,
    lastUpdatedSeconds: input.nowSeconds,
    evidencePerSecond: 0,
    detectionVariance: previous?.detectionVariance ?? 1,
    explanationRu: [...(input.explanationRu ?? [])],
  };
}

export function decayUnobservedContact(
  contact: PerceptionContactMemory,
  input: ContactDecayInput,
): PerceptionContactMemory | null {
  const delta = Math.max(0, input.deltaSeconds);
  const evidence = Math.max(0, contact.evidence - 1.15 * delta);
  const confidence = Math.max(0, contact.confidence - 0.55 * delta);
  const uncertaintyGrowthCells = (0.12 / Math.max(0.001, input.metersPerCell)) * delta;
  const uncertaintyCells = contact.uncertaintyCells + uncertaintyGrowthCells;

  if (evidence < 4 && confidence < 4) return null;

  return {
    ...contact,
    stage: getContactStageForEvidence(Math.max(CONTACT_STAGE_THRESHOLDS.cue, evidence)),
    evidence,
    confidence,
    uncertaintyCells,
    visibleNow: false,
    observedNow: false,
    lastUpdatedSeconds: input.nowSeconds,
    evidencePerSecond: 0,
  };
}

export function upsertPerceptionContact(
  knowledge: UnitPerceptionKnowledge,
  contact: PerceptionContactMemory,
): void {
  const index = knowledge.contacts.findIndex((item) => item.id === contact.id);
  const previous = index >= 0 ? knowledge.contacts[index] : null;
  if (index >= 0) knowledge.contacts[index] = contact;
  else knowledge.contacts.push(contact);

  knowledge.contacts.sort((left, right) => (
    contactStageRank(right.stage) - contactStageRank(left.stage)
    || right.confidence - left.confidence
    || right.lastUpdatedSeconds - left.lastUpdatedSeconds
  ));
  knowledge.lastUpdatedSeconds = Math.max(knowledge.lastUpdatedSeconds, contact.lastUpdatedSeconds);
  if (!previous || contactFingerprint(previous) !== contactFingerprint(contact)) knowledge.revision += 1;
}

function normalizeContact(value: Partial<PerceptionContactMemory>): PerceptionContactMemory {
  const evidence = clamp(number(value.evidence, CONTACT_STAGE_THRESHOLDS.cue), 0, 200);
  const stage = isContactStage(value.stage) ? value.stage : getContactStageForEvidence(evidence);
  return {
    id: String(value.id ?? value.stimulusId ?? 'unknown-contact'),
    stimulusId: String(value.stimulusId ?? value.id ?? 'unknown-stimulus'),
    sourceUnitId: typeof value.sourceUnitId === 'string' ? value.sourceUnitId : null,
    labelRu: String(value.labelRu ?? 'Неизвестный контакт'),
    stage,
    source: isContactSource(value.source) ? value.source : 'reported',
    evidence,
    confidence: clamp(number(value.confidence, evidence / 1.5), 0, 100),
    uncertaintyCells: Math.max(0.25, number(value.uncertaintyCells, 6)),
    lastKnownPosition: normalizePosition(value.lastKnownPosition),
    visibleNow: Boolean(value.visibleNow),
    observedNow: Boolean(value.observedNow),
    lastObservedSeconds: number(value.lastObservedSeconds, -1),
    lastUpdatedSeconds: Math.max(0, number(value.lastUpdatedSeconds, 0)),
    evidencePerSecond: Math.max(0, number(value.evidencePerSecond, 0)),
    detectionVariance: clamp(number(value.detectionVariance, 1), 0.5, 1.5),
    explanationRu: Array.isArray(value.explanationRu) ? value.explanationRu.map(String) : [],
  };
}

function isContactStage(value: unknown): value is PerceptionContactStage {
  return value === 'cue' || value === 'suspicion' || value === 'contact' || value === 'identified' || value === 'confirmed';
}

function isContactSource(value: unknown): value is PerceptionContactSource {
  return value === 'visual' || value === 'sound' || value === 'reported' || value === 'fire_pressure';
}

function normalizePosition(value: unknown): GridPosition {
  if (typeof value === 'object' && value !== null && 'x' in value && 'y' in value) {
    const position = value as { x?: unknown; y?: unknown };
    return { x: number(position.x, 0), y: number(position.y, 0) };
  }
  return { x: 0, y: 0 };
}

function contactFingerprint(contact: PerceptionContactMemory): string {
  return JSON.stringify({
    sourceUnitId: contact.sourceUnitId,
    stage: contact.stage,
    source: contact.source,
    evidence: Math.round(contact.evidence * 10),
    confidence: Math.round(contact.confidence),
    uncertainty: Math.round(contact.uncertaintyCells * 10),
    x: Math.round(contact.lastKnownPosition.x * 10),
    y: Math.round(contact.lastKnownPosition.y * 10),
    visibleNow: contact.visibleNow,
    observedNow: contact.observedNow,
    detectionVariance: Math.round(contact.detectionVariance * 1000),
  });
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function finiteNonNegative(value: unknown, fallback: number): number {
  return Math.max(0, Math.round(number(value, fallback)));
}

function number(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
