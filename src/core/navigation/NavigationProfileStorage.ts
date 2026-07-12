import {
  NavigationProfileRegistry,
  createDefaultNavigationProfileRegistry,
} from './NavigationProfiles';

export const NAVIGATION_PROFILE_STORAGE_KEY = 'real-wargame.navigation-profiles.v1';
export const NAVIGATION_PROFILE_DEBUG_OVERRIDE_KEY = 'real-wargame.navigation-profile.debug.v1';

let currentRegistry: NavigationProfileRegistry | null = null;
let storageListenerInstalled = false;
const listeners = new Set<(registry: NavigationProfileRegistry) => void>();

export function getNavigationProfileRegistry(): NavigationProfileRegistry {
  if (!currentRegistry) currentRegistry = loadNavigationProfileRegistry();
  installStorageListener();
  return currentRegistry;
}

export function loadNavigationProfileRegistry(storage: Pick<Storage, 'getItem'> | null = browserStorage()): NavigationProfileRegistry {
  if (!storage) return createDefaultNavigationProfileRegistry();
  try {
    const raw = storage.getItem(NAVIGATION_PROFILE_STORAGE_KEY);
    return raw ? NavigationProfileRegistry.importJson(raw) : createDefaultNavigationProfileRegistry();
  } catch {
    return createDefaultNavigationProfileRegistry();
  }
}

export function saveNavigationProfileRegistry(
  registry: NavigationProfileRegistry,
  storage: Pick<Storage, 'setItem'> | null = browserStorage(),
): void {
  currentRegistry = registry;
  if (storage) {
    try {
      storage.setItem(NAVIGATION_PROFILE_STORAGE_KEY, registry.exportJson());
    } catch {
      // The in-memory registry remains usable when browser storage is unavailable.
    }
  }
  publish(registry);
}

export function replaceNavigationProfileRegistry(value: unknown): NavigationProfileRegistry {
  const registry = NavigationProfileRegistry.fromUnknown(value);
  saveNavigationProfileRegistry(registry);
  return registry;
}

export function subscribeNavigationProfileRegistry(
  listener: (registry: NavigationProfileRegistry) => void,
): () => void {
  listeners.add(listener);
  installStorageListener();
  return () => listeners.delete(listener);
}

export function readNavigationProfileDebugOverride(
  storage: Pick<Storage, 'getItem'> | null = browserStorage(),
): string | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(NAVIGATION_PROFILE_DEBUG_OVERRIDE_KEY)?.trim();
    return value || null;
  } catch {
    return null;
  }
}

export function writeNavigationProfileDebugOverride(
  profileId: string | null,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    if (profileId) storage.setItem(NAVIGATION_PROFILE_DEBUG_OVERRIDE_KEY, profileId);
    else storage.removeItem(NAVIGATION_PROFILE_DEBUG_OVERRIDE_KEY);
  } catch {
    // Debug override is optional.
  }
}

function installStorageListener(): void {
  if (storageListenerInstalled || typeof window === 'undefined') return;
  storageListenerInstalled = true;
  window.addEventListener('storage', (event) => {
    if (event.key !== NAVIGATION_PROFILE_STORAGE_KEY) return;
    currentRegistry = event.newValue
      ? NavigationProfileRegistry.importJson(event.newValue)
      : createDefaultNavigationProfileRegistry();
    publish(currentRegistry);
  });
}

function publish(registry: NavigationProfileRegistry): void {
  for (const listener of listeners) listener(registry);
}

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}
