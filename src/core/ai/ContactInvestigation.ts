import type { GridPosition } from '../geometry';

export type InvestigationContactStage = 'cue' | 'suspicion' | 'contact' | 'identified' | 'confirmed';
export type InvestigationContactSource = 'visual' | 'sound' | 'reported' | 'fire_pressure';

export interface AiInvestigationContactSnapshot {
  readonly id: string;
  readonly stage: InvestigationContactStage;
  readonly source: InvestigationContactSource;
  readonly confidence: number;
  readonly evidence: number;
  readonly uncertaintyCells: number;
  readonly lastKnownPosition: GridPosition;
  readonly visibleNow: boolean;
  readonly observedNow: boolean;
  readonly lastObservedSeconds: number;
  readonly lastUpdatedSeconds: number;
  readonly distanceMeters: number;
  readonly recentFireEvidence: boolean;
  readonly threatUrgency: number;
}

export interface ContactInvestigationSettings {
  readonly minimumStage: InvestigationContactStage;
  readonly minimumConfidence: number;
  readonly completionStage: InvestigationContactStage;
  readonly searchArcDegrees: number;
  readonly maximumContactAgeSeconds: number;
  readonly minimumHoldSeconds: number;
  readonly preferredInvestigationSeconds: number;
  readonly maximumInvestigationSeconds: number;
  readonly revisitDelaySeconds: number;
  readonly switchAdvantagePercent: number;
  readonly urgentCloserMeters: number;
  readonly urgentCloserRatio: number;
  readonly reactToFreshFire: boolean;
  readonly confidenceWeight: number;
  readonly proximityWeight: number;
  readonly freshnessWeight: number;
  readonly urgencyWeight: number;
  readonly uncertaintyPenaltyWeight: number;
  readonly currentContactBonus: number;
}

export interface RecentlyInvestigatedContact {
  readonly id: string;
  readonly eligibleAfterSeconds: number;
}

export interface ContactInvestigationState {
  readonly currentContactId: string | null;
  readonly selectedAtSeconds: number;
  readonly lastEvaluatedSeconds: number;
  readonly recentlyInvestigated: readonly RecentlyInvestigatedContact[];
}

export type ContactInvestigationReason =
  | 'selected_first'
  | 'held_minimum_time'
  | 'held_best_candidate'
  | 'switched_score_advantage'
  | 'switched_urgent_closer'
  | 'switched_fresh_fire'
  | 'current_completed'
  | 'current_expired'
  | 'current_timed_out'
  | 'no_candidate';

export interface ContactInvestigationSelection {
  readonly contact: AiInvestigationContactSnapshot;
  readonly score: number;
  readonly changed: boolean;
  readonly reason: ContactInvestigationReason;
  readonly reasonRu: string;
}

export interface ContactInvestigationResult {
  readonly selection: ContactInvestigationSelection | null;
  readonly state: ContactInvestigationState;
  readonly candidateCount: number;
  readonly excludedCount: number;
}

interface ScoredContact {
  readonly contact: AiInvestigationContactSnapshot;
  readonly score: number;
}

const STAGE_RANK: Readonly<Record<InvestigationContactStage, number>> = {
  cue: 1,
  suspicion: 2,
  contact: 3,
  identified: 4,
  confirmed: 5,
};

export const DEFAULT_CONTACT_INVESTIGATION_SETTINGS: ContactInvestigationSettings = {
  minimumStage: 'cue',
  minimumConfidence: 15,
  completionStage: 'identified',
  searchArcDegrees: 120,
  maximumContactAgeSeconds: 10,
  minimumHoldSeconds: 1.2,
  preferredInvestigationSeconds: 3,
  maximumInvestigationSeconds: 5,
  revisitDelaySeconds: 4,
  switchAdvantagePercent: 25,
  urgentCloserMeters: 12,
  urgentCloserRatio: 0.6,
  reactToFreshFire: true,
  confidenceWeight: 0.3,
  proximityWeight: 0.25,
  freshnessWeight: 0.2,
  urgencyWeight: 0.2,
  uncertaintyPenaltyWeight: 0.15,
  currentContactBonus: 10,
};

export function createEmptyContactInvestigationState(nowSeconds = 0): ContactInvestigationState {
  return {
    currentContactId: null,
    selectedAtSeconds: Math.max(0, finite(nowSeconds, 0)),
    lastEvaluatedSeconds: Math.max(0, finite(nowSeconds, 0)),
    recentlyInvestigated: [],
  };
}

export function normalizeContactInvestigationSettings(
  value: Partial<ContactInvestigationSettings> = {},
): ContactInvestigationSettings {
  const minimumStage = isStage(value.minimumStage) ? value.minimumStage : DEFAULT_CONTACT_INVESTIGATION_SETTINGS.minimumStage;
  const completionStage = isStage(value.completionStage) ? value.completionStage : DEFAULT_CONTACT_INVESTIGATION_SETTINGS.completionStage;
  return {
    minimumStage,
    minimumConfidence: clamp(finite(value.minimumConfidence, 15), 0, 100),
    completionStage: STAGE_RANK[completionStage] > STAGE_RANK[minimumStage] ? completionStage : 'identified',
    searchArcDegrees: clamp(finite(value.searchArcDegrees, 120), 1, 360),
    maximumContactAgeSeconds: Math.max(0.1, finite(value.maximumContactAgeSeconds, 10)),
    minimumHoldSeconds: Math.max(0, finite(value.minimumHoldSeconds, 1.2)),
    preferredInvestigationSeconds: Math.max(0, finite(value.preferredInvestigationSeconds, 3)),
    maximumInvestigationSeconds: Math.max(0.1, finite(value.maximumInvestigationSeconds, 5)),
    revisitDelaySeconds: Math.max(0, finite(value.revisitDelaySeconds, 4)),
    switchAdvantagePercent: clamp(finite(value.switchAdvantagePercent, 25), 0, 500),
    urgentCloserMeters: Math.max(0, finite(value.urgentCloserMeters, 12)),
    urgentCloserRatio: clamp(finite(value.urgentCloserRatio, 0.6), 0, 1),
    reactToFreshFire: value.reactToFreshFire ?? true,
    confidenceWeight: Math.max(0, finite(value.confidenceWeight, 0.3)),
    proximityWeight: Math.max(0, finite(value.proximityWeight, 0.25)),
    freshnessWeight: Math.max(0, finite(value.freshnessWeight, 0.2)),
    urgencyWeight: Math.max(0, finite(value.urgencyWeight, 0.2)),
    uncertaintyPenaltyWeight: Math.max(0, finite(value.uncertaintyPenaltyWeight, 0.15)),
    currentContactBonus: Math.max(0, finite(value.currentContactBonus, 10)),
  };
}

export function resolveContactInvestigation(
  settingsInput: Partial<ContactInvestigationSettings>,
  contactsInput: readonly AiInvestigationContactSnapshot[],
  previousInput: ContactInvestigationState | null | undefined,
  nowSecondsInput: number,
): ContactInvestigationResult {
  const settings = normalizeContactInvestigationSettings(settingsInput);
  const nowSeconds = Math.max(0, finite(nowSecondsInput, 0));
  let previous = normalizeState(previousInput, nowSeconds);
  const recent = previous.recentlyInvestigated
    .filter((item) => item.eligibleAfterSeconds > nowSeconds)
    .slice(-8);
  previous = { ...previous, recentlyInvestigated: recent };

  const contacts = contactsInput
    .filter(isFiniteContact)
    .slice()
    .sort(compareContactRecency)
    .slice(0, 24);
  const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
  const currentRaw = previous.currentContactId ? contactsById.get(previous.currentContactId) ?? null : null;
  const currentCompletion = currentRaw && stageAtLeast(currentRaw.stage, settings.completionStage);
  const currentEligible = currentRaw && isEligible(currentRaw, settings, nowSeconds, recent, true);
  const heldSeconds = Math.max(0, nowSeconds - previous.selectedAtSeconds);

  let workingState = previous;
  let completionReason: ContactInvestigationReason | null = null;
  if (currentRaw && currentCompletion) {
    workingState = finishCurrent(previous, currentRaw.id, nowSeconds, settings.revisitDelaySeconds);
    completionReason = 'current_completed';
  } else if (currentRaw && !currentEligible) {
    workingState = finishCurrent(previous, currentRaw.id, nowSeconds, settings.revisitDelaySeconds);
    completionReason = 'current_expired';
  } else if (currentRaw && heldSeconds >= settings.maximumInvestigationSeconds) {
    workingState = finishCurrent(previous, currentRaw.id, nowSeconds, settings.revisitDelaySeconds);
    completionReason = 'current_timed_out';
  }

  const activeCurrent = workingState.currentContactId
    ? contactsById.get(workingState.currentContactId) ?? null
    : null;
  const scored = contacts
    .filter((contact) => isEligible(contact, settings, nowSeconds, workingState.recentlyInvestigated, contact.id === activeCurrent?.id))
    .map((contact) => ({
      contact,
      score: scoreContact(contact, settings, nowSeconds, contact.id === activeCurrent?.id
        ? Math.max(0, nowSeconds - workingState.selectedAtSeconds)
        : null),
    }))
    .sort(compareScoredContacts);
  const excludedCount = contacts.length - scored.length;

  if (scored.length === 0) {
    return {
      selection: null,
      state: {
        ...workingState,
        currentContactId: null,
        lastEvaluatedSeconds: nowSeconds,
      },
      candidateCount: 0,
      excludedCount,
    };
  }

  const best = scored[0]!;
  if (!activeCurrent) {
    const reason = completionReason ?? 'selected_first';
    return select(best, workingState, nowSeconds, true, reason, reasonText(reason, null, best.contact));
  }

  const currentScore = scored.find((item) => item.contact.id === activeCurrent.id)
    ?? { contact: activeCurrent, score: scoreContact(activeCurrent, settings, nowSeconds, Math.max(0, nowSeconds - workingState.selectedAtSeconds)) };
  const alternatives = scored.filter((item) => item.contact.id !== activeCurrent.id);
  const urgentFireCandidate = settings.reactToFreshFire
    ? alternatives.find((item) => (
        item.contact.recentFireEvidence
        && item.contact.threatUrgency > activeCurrent.threatUrgency
      ))
    : undefined;
  if (urgentFireCandidate) {
    return select(
      urgentFireCandidate,
      workingState,
      nowSeconds,
      true,
      'switched_fresh_fire',
      reasonText('switched_fresh_fire', activeCurrent, urgentFireCandidate.contact),
    );
  }

  const urgentCloserCandidate = alternatives
    .filter((item) => isUrgentlyCloser(item.contact, activeCurrent, settings))
    .sort((left, right) => (
      left.contact.distanceMeters - right.contact.distanceMeters
      || compareScoredContacts(left, right)
    ))[0];
  if (urgentCloserCandidate) {
    return select(
      urgentCloserCandidate,
      workingState,
      nowSeconds,
      true,
      'switched_urgent_closer',
      reasonText('switched_urgent_closer', activeCurrent, urgentCloserCandidate.contact),
    );
  }

  if (best.contact.id === activeCurrent.id) {
    const reason: ContactInvestigationReason = heldSeconds < settings.minimumHoldSeconds
      ? 'held_minimum_time'
      : 'held_best_candidate';
    return select(currentScore, workingState, nowSeconds, false, reason, reasonText(reason, activeCurrent, activeCurrent));
  }
  if (heldSeconds < settings.minimumHoldSeconds) {
    return select(currentScore, workingState, nowSeconds, false, 'held_minimum_time', reasonText('held_minimum_time', activeCurrent, activeCurrent));
  }

  const requiredScore = currentScore.score * (1 + settings.switchAdvantagePercent / 100);
  if (best.score >= requiredScore) {
    return select(best, workingState, nowSeconds, true, 'switched_score_advantage', reasonText('switched_score_advantage', activeCurrent, best.contact));
  }
  return select(currentScore, workingState, nowSeconds, false, 'held_best_candidate', reasonText('held_best_candidate', activeCurrent, activeCurrent));
}

export function serializeContactInvestigationState(state: ContactInvestigationState): string {
  return JSON.stringify(normalizeState(state, state.lastEvaluatedSeconds));
}

export function deserializeContactInvestigationState(value: unknown, nowSeconds = 0): ContactInvestigationState {
  if (typeof value !== 'string' || value.length === 0) return createEmptyContactInvestigationState(nowSeconds);
  try {
    return normalizeState(JSON.parse(value) as Partial<ContactInvestigationState>, nowSeconds);
  } catch {
    return createEmptyContactInvestigationState(nowSeconds);
  }
}

export function contactInvestigationStateKey(nodeId: string): string {
  return `__real_wargame_investigate_contact_state__:${nodeId}`;
}

function select(
  scored: ScoredContact,
  previous: ContactInvestigationState,
  nowSeconds: number,
  changed: boolean,
  reason: ContactInvestigationReason,
  reasonRu: string,
): ContactInvestigationResult {
  const actuallyChanged = previous.currentContactId !== scored.contact.id;
  return {
    selection: {
      contact: scored.contact,
      score: roundTwo(scored.score),
      changed: changed && actuallyChanged,
      reason,
      reasonRu,
    },
    state: {
      ...previous,
      currentContactId: scored.contact.id,
      selectedAtSeconds: actuallyChanged ? nowSeconds : previous.selectedAtSeconds,
      lastEvaluatedSeconds: nowSeconds,
    },
    candidateCount: 1,
    excludedCount: 0,
  };
}

function finishCurrent(
  previous: ContactInvestigationState,
  id: string,
  nowSeconds: number,
  delaySeconds: number,
): ContactInvestigationState {
  const remaining = previous.recentlyInvestigated.filter((item) => item.id !== id && item.eligibleAfterSeconds > nowSeconds);
  return {
    ...previous,
    currentContactId: null,
    selectedAtSeconds: nowSeconds,
    lastEvaluatedSeconds: nowSeconds,
    recentlyInvestigated: [...remaining, { id, eligibleAfterSeconds: nowSeconds + delaySeconds }].slice(-8),
  };
}

function scoreContact(
  contact: AiInvestigationContactSnapshot,
  settings: ContactInvestigationSettings,
  nowSeconds: number,
  heldSeconds: number | null,
): number {
  const confidence = clamp(contact.confidence, 0, 100);
  const proximity = 100 * (1 - clamp(contact.distanceMeters / 200, 0, 1));
  const ageSeconds = Math.max(0, nowSeconds - contact.lastUpdatedSeconds);
  const freshness = 100 * (1 - clamp(ageSeconds / settings.maximumContactAgeSeconds, 0, 1));
  const urgency = clamp(contact.threatUrgency, 0, 100);
  const positiveWeight = Math.max(0.0001,
    settings.confidenceWeight
    + settings.proximityWeight
    + settings.freshnessWeight
    + settings.urgencyWeight);
  const positive = (
    confidence * settings.confidenceWeight
    + proximity * settings.proximityWeight
    + freshness * settings.freshnessWeight
    + urgency * settings.urgencyWeight
  ) / positiveWeight;
  const uncertaintyPenalty = clamp(contact.uncertaintyCells * 8, 0, 100) * settings.uncertaintyPenaltyWeight;
  const holdBonus = heldSeconds === null
    ? 0
    : heldSeconds <= settings.preferredInvestigationSeconds
      ? settings.currentContactBonus
      : settings.currentContactBonus * (1 - clamp(
        (heldSeconds - settings.preferredInvestigationSeconds)
        / Math.max(0.001, settings.maximumInvestigationSeconds - settings.preferredInvestigationSeconds),
        0,
        1,
      ));
  return clamp(positive - uncertaintyPenalty + holdBonus, 0, 120);
}

function isEligible(
  contact: AiInvestigationContactSnapshot,
  settings: ContactInvestigationSettings,
  nowSeconds: number,
  recent: readonly RecentlyInvestigatedContact[],
  allowCurrent: boolean,
): boolean {
  if (!stageAtLeast(contact.stage, settings.minimumStage)) return false;
  if (stageAtLeast(contact.stage, settings.completionStage)) return false;
  if (contact.confidence < settings.minimumConfidence) return false;
  if (nowSeconds - contact.lastUpdatedSeconds > settings.maximumContactAgeSeconds) return false;
  if (!Number.isFinite(contact.distanceMeters) || contact.distanceMeters <= 1e-6) return false;
  if (!allowCurrent && recent.some((item) => item.id === contact.id && item.eligibleAfterSeconds > nowSeconds)) return false;
  return true;
}

function isUrgentlyCloser(
  candidate: AiInvestigationContactSnapshot,
  current: AiInvestigationContactSnapshot,
  settings: ContactInvestigationSettings,
): boolean {
  if (candidate.distanceMeters >= current.distanceMeters) return false;
  return current.distanceMeters - candidate.distanceMeters >= settings.urgentCloserMeters
    || candidate.distanceMeters <= current.distanceMeters * settings.urgentCloserRatio;
}

function compareScoredContacts(left: ScoredContact, right: ScoredContact): number {
  return right.score - left.score
    || STAGE_RANK[right.contact.stage] - STAGE_RANK[left.contact.stage]
    || right.contact.confidence - left.contact.confidence
    || left.contact.distanceMeters - right.contact.distanceMeters
    || right.contact.lastUpdatedSeconds - left.contact.lastUpdatedSeconds
    || left.contact.id.localeCompare(right.contact.id);
}

function compareContactRecency(left: AiInvestigationContactSnapshot, right: AiInvestigationContactSnapshot): number {
  return right.lastUpdatedSeconds - left.lastUpdatedSeconds
    || STAGE_RANK[right.stage] - STAGE_RANK[left.stage]
    || right.confidence - left.confidence
    || left.id.localeCompare(right.id);
}

function normalizeState(
  value: Partial<ContactInvestigationState> | null | undefined,
  nowSeconds: number,
): ContactInvestigationState {
  const recent = Array.isArray(value?.recentlyInvestigated)
    ? value.recentlyInvestigated
      .filter((item): item is RecentlyInvestigatedContact => (
        typeof item?.id === 'string'
        && Number.isFinite(item.eligibleAfterSeconds)
      ))
      .map((item) => ({ id: item.id, eligibleAfterSeconds: Math.max(0, item.eligibleAfterSeconds) }))
      .slice(-8)
    : [];
  return {
    currentContactId: typeof value?.currentContactId === 'string' ? value.currentContactId : null,
    selectedAtSeconds: Math.max(0, finite(value?.selectedAtSeconds, nowSeconds)),
    lastEvaluatedSeconds: Math.max(0, finite(value?.lastEvaluatedSeconds, nowSeconds)),
    recentlyInvestigated: recent,
  };
}

function isFiniteContact(contact: AiInvestigationContactSnapshot): boolean {
  return typeof contact.id === 'string'
    && contact.id.length > 0
    && isStage(contact.stage)
    && Number.isFinite(contact.confidence)
    && Number.isFinite(contact.evidence)
    && Number.isFinite(contact.uncertaintyCells)
    && Number.isFinite(contact.lastKnownPosition.x)
    && Number.isFinite(contact.lastKnownPosition.y)
    && Number.isFinite(contact.lastUpdatedSeconds)
    && Number.isFinite(contact.distanceMeters);
}

function stageAtLeast(actual: InvestigationContactStage, threshold: InvestigationContactStage): boolean {
  return STAGE_RANK[actual] >= STAGE_RANK[threshold];
}

function isStage(value: unknown): value is InvestigationContactStage {
  return value === 'cue' || value === 'suspicion' || value === 'contact' || value === 'identified' || value === 'confirmed';
}

function reasonText(
  reason: ContactInvestigationReason,
  current: AiInvestigationContactSnapshot | null,
  next: AiInvestigationContactSnapshot,
): string {
  switch (reason) {
    case 'selected_first': return `Выбран контакт «${next.id}» для доразведки.`;
    case 'held_minimum_time': return `Контакт «${next.id}» удерживается до истечения минимального времени наблюдения.`;
    case 'held_best_candidate': return `Контакт «${next.id}» остаётся наиболее полезным для доразведки.`;
    case 'switched_score_advantage': return `Внимание переключено с «${current?.id ?? 'нет'}» на «${next.id}»: новый контакт заметно приоритетнее.`;
    case 'switched_urgent_closer': return `Внимание срочно переключено с «${current?.id ?? 'нет'}» на значительно более близкий контакт «${next.id}».`;
    case 'switched_fresh_fire': return `Внимание срочно переключено на «${next.id}» из-за свежих признаков огня.`;
    case 'current_completed': return `Предыдущий контакт доразведан; выбран следующий контакт «${next.id}».`;
    case 'current_expired': return `Предыдущий контакт потерял актуальность; выбран «${next.id}».`;
    case 'current_timed_out': return `Истекло максимальное время проверки; выбран следующий контакт «${next.id}».`;
    case 'no_candidate': return 'Подходящих контактов для доразведки нет.';
  }
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}
