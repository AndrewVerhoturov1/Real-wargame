import { installSoldierArchetypeResolver } from '../core/behavior/BehaviorModel';
import {
  createDefaultGameplayTuningRegistry,
  GAMEPLAY_TUNING_FORMAT_VERSION,
  getGameplayTuningRegistry,
  GameplayTuningRegistry,
  replaceGameplayTuningRegistry,
  type GameplayTuningBundleV1,
} from '../core/tuning/GameplayTuningProfiles';
import {
  getActiveConditionProfileId,
  restoreActiveConditionProfileId,
} from '../core/tuning/GameplayTuningRuntime';

export const GAMEPLAY_TUNING_STORAGE_KEY = 'real-wargame.gameplay-tuning-profiles.v1';
export const GAMEPLAY_TUNING_ACTIVE_CONDITION_KEY = 'real-wargame.gameplay-tuning-active-condition.v1';

type GameplayTuningListener = (registry: GameplayTuningRegistry) => void;
const listeners = new Set<GameplayTuningListener>();

const initialRegistry = loadGameplayTuningProfiles();
replaceGameplayTuningRegistry(initialRegistry);
restoreActiveConditionProfileId(readActiveConditionProfileId());
installSoldierArchetypeResolver((profileId) => {
  const profile = getGameplayTuningRegistry().requireSoldierArchetype(profileId);
  return Object.freeze({ traits: profile.traits, condition: profile.condition });
});

export function loadGameplayTuningProfiles(
  storage: Storage | null = resolveBrowserStorage(),
): GameplayTuningRegistry {
  const raw = storage?.getItem(GAMEPLAY_TUNING_STORAGE_KEY);
  if (!raw) return createDefaultGameplayTuningRegistry();
  try {
    const parsed = JSON.parse(raw) as Partial<GameplayTuningBundleV1>;
    if (parsed.formatVersion !== GAMEPLAY_TUNING_FORMAT_VERSION) {
      return createDefaultGameplayTuningRegistry();
    }
    return new GameplayTuningRegistry(parsed);
  } catch {
    return createDefaultGameplayTuningRegistry();
  }
}

export function saveGameplayTuningProfiles(
  registry: GameplayTuningRegistry = getGameplayTuningRegistry(),
  storage: Storage | null = resolveBrowserStorage(),
): void {
  replaceGameplayTuningRegistry(registry);
  storage?.setItem(GAMEPLAY_TUNING_STORAGE_KEY, JSON.stringify(registry.exportBundle()));
  storage?.setItem(GAMEPLAY_TUNING_ACTIVE_CONDITION_KEY, getActiveConditionProfileId());
  for (const listener of listeners) listener(registry);
}

export function replaceStoredGameplayTuningProfiles(
  bundle: Partial<GameplayTuningBundleV1>,
  storage: Storage | null = resolveBrowserStorage(),
): GameplayTuningRegistry {
  const registry = new GameplayTuningRegistry(bundle);
  saveGameplayTuningProfiles(registry, storage);
  return registry;
}

export function resetGameplayTuningProfiles(
  storage: Storage | null = resolveBrowserStorage(),
): GameplayTuningRegistry {
  const registry = createDefaultGameplayTuningRegistry();
  storage?.removeItem(GAMEPLAY_TUNING_STORAGE_KEY);
  storage?.removeItem(GAMEPLAY_TUNING_ACTIVE_CONDITION_KEY);
  replaceGameplayTuningRegistry(registry);
  restoreActiveConditionProfileId(null);
  for (const listener of listeners) listener(registry);
  return registry;
}

export function subscribeGameplayTuningProfiles(listener: GameplayTuningListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readActiveConditionProfileId(storage: Storage | null = resolveBrowserStorage()): string | null {
  return storage?.getItem(GAMEPLAY_TUNING_ACTIVE_CONDITION_KEY) ?? null;
}

function resolveBrowserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}
