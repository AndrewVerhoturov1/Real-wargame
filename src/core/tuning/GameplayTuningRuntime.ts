import {
  DEFAULT_CONDITION_PROFILE_ID,
  getGameplayTuningRegistry,
  type ConditionProfileDefinition,
} from './GameplayTuningProfiles';

let activeConditionProfileId = DEFAULT_CONDITION_PROFILE_ID;

export function getActiveConditionProfileId(): string {
  return activeConditionProfileId;
}

export function setActiveConditionProfileId(profileId: string): boolean {
  const registry = getGameplayTuningRegistry();
  const resolved = registry.requireConditionProfile(profileId);
  if (resolved.id !== profileId || activeConditionProfileId === profileId) return false;
  activeConditionProfileId = profileId;
  return true;
}

export function restoreActiveConditionProfileId(profileId: unknown): void {
  const requested = typeof profileId === 'string' ? profileId : DEFAULT_CONDITION_PROFILE_ID;
  const registry = getGameplayTuningRegistry();
  const resolved = registry.requireConditionProfile(requested);
  activeConditionProfileId = resolved.id === requested
    ? requested
    : DEFAULT_CONDITION_PROFILE_ID;
}

export function getActiveConditionProfileSnapshot(): ConditionProfileDefinition {
  return getGameplayTuningRegistry().requireConditionProfile(activeConditionProfileId);
}
