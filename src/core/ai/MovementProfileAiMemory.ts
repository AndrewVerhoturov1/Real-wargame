import type { AiBlackboardValue } from './AiBlackboard';
import {
  MOVEMENT_PROFILE_MEMORY_KEYS,
  normalizeMovementProfileId,
  type MovementProfileSource,
} from '../movement/MovementProfileContract';

export interface AiMemoryUpdate {
  readonly key: string;
  readonly value: AiBlackboardValue;
}

export interface SetAiMovementProfileInput {
  readonly profileId: unknown;
  readonly ownerToken: unknown;
  readonly reason?: unknown;
}

export interface ClearAiMovementProfileInput {
  readonly expectedOwnerToken?: unknown;
  readonly activeOwnerToken?: unknown;
  readonly requestedProfileId?: unknown;
  readonly fallbackSource?: MovementProfileSource;
  readonly reason?: unknown;
}

export interface ClearAiMovementProfileResult {
  readonly cleared: boolean;
  readonly updates: readonly AiMemoryUpdate[];
}

export function buildSetAiMovementProfileUpdates(input: SetAiMovementProfileInput): readonly AiMemoryUpdate[] {
  const profileId = normalizeMovementProfileId(input.profileId);
  const ownerToken = cleanOptionalText(input.ownerToken) ?? 'ai-graph';
  const reason = cleanOptionalText(input.reason) ?? 'Movement profile overridden by AI graph.';
  return Object.freeze([
    update(MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideProfileId, profileId),
    update(MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideOwnerToken, ownerToken),
    update(MOVEMENT_PROFILE_MEMORY_KEYS.activeProfileId, profileId),
    update(MOVEMENT_PROFILE_MEMORY_KEYS.activeProfileSource, 'ai_override'),
    update(MOVEMENT_PROFILE_MEMORY_KEYS.forcedFallback, false),
    update(MOVEMENT_PROFILE_MEMORY_KEYS.forcedReason, reason),
  ]);
}

export function buildClearAiMovementProfileUpdates(
  input: ClearAiMovementProfileInput,
): ClearAiMovementProfileResult {
  const expectedOwnerToken = cleanOptionalText(input.expectedOwnerToken);
  const activeOwnerToken = cleanOptionalText(input.activeOwnerToken);
  if (expectedOwnerToken && activeOwnerToken && expectedOwnerToken !== activeOwnerToken) {
    return Object.freeze({ cleared: false, updates: Object.freeze([]) });
  }

  const requestedProfileId = normalizeMovementProfileId(input.requestedProfileId);
  const fallbackSource = input.fallbackSource ?? 'player_order';
  const reason = cleanOptionalText(input.reason) ?? 'Movement profile override cleared.';
  return Object.freeze({
    cleared: true,
    updates: Object.freeze([
      update(MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideProfileId, null),
      update(MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideOwnerToken, null),
      update(MOVEMENT_PROFILE_MEMORY_KEYS.activeProfileId, requestedProfileId),
      update(MOVEMENT_PROFILE_MEMORY_KEYS.activeProfileSource, fallbackSource),
      update(MOVEMENT_PROFILE_MEMORY_KEYS.forcedFallback, false),
      update(MOVEMENT_PROFILE_MEMORY_KEYS.forcedReason, reason),
    ]),
  });
}

export function legacyMovementModeToProfileId(value: unknown): string {
  if (value === 'fast') return 'fast';
  if (value === 'careful' || value === 'crawl') return 'stealth';
  return 'normal';
}

function update(key: string, value: AiBlackboardValue): AiMemoryUpdate {
  return Object.freeze({ key, value });
}

function cleanOptionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
