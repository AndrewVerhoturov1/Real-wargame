import {
  MovementProfileRegistry,
  createDefaultMovementProfileRegistry,
} from '../core/movement/MovementProfiles';

export const MOVEMENT_PROFILE_STORAGE_KEY = 'real-wargame.movement-profiles.v1';

let currentRegistry: MovementProfileRegistry | null = null;
let storageListenerInstalled = false;
const listeners = new Set<(registry: MovementProfileRegistry) => void>();

export function getMovementProfileRegistry(): MovementProfileRegistry {
  if (!currentRegistry) currentRegistry = loadMovementProfileRegistry();
  installStorageListener();
  return currentRegistry;
}

export function loadMovementProfileRegistry(
  storage: Pick<Storage, 'getItem'> | null = browserStorage(),
): MovementProfileRegistry {
  if (!storage) return createDefaultMovementProfileRegistry();
  try {
    const raw = storage.getItem(MOVEMENT_PROFILE_STORAGE_KEY);
    return raw ? MovementProfileRegistry.importJson(raw) : createDefaultMovementProfileRegistry();
  } catch {
    return createDefaultMovementProfileRegistry();
  }
}

export function saveMovementProfileRegistry(
  registry: MovementProfileRegistry,
  storage: Pick<Storage, 'setItem'> | null = browserStorage(),
): void {
  currentRegistry = registry;
  if (storage) {
    try {
      storage.setItem(MOVEMENT_PROFILE_STORAGE_KEY, registry.exportJson());
    } catch {
      // The in-memory registry remains authoritative for this browser session.
    }
  }
  publish(registry);
}

export function replaceMovementProfileRegistry(value: unknown): MovementProfileRegistry {
  const candidate = MovementProfileRegistry.fromUnknown(value);
  saveMovementProfileRegistry(candidate);
  return candidate;
}

export function subscribeMovementProfileRegistry(
  listener: (registry: MovementProfileRegistry) => void,
): () => void {
  listeners.add(listener);
  installStorageListener();
  return () => listeners.delete(listener);
}

function installStorageListener(): void {
  if (storageListenerInstalled || typeof window === 'undefined') return;
  storageListenerInstalled = true;
  window.addEventListener('storage', handleStorageEvent);
}

function handleStorageEvent(event: StorageEvent): void {
  if (event.key !== MOVEMENT_PROFILE_STORAGE_KEY) return;
  try {
    const candidate = event.newValue
      ? MovementProfileRegistry.importJson(event.newValue)
      : createDefaultMovementProfileRegistry();
    currentRegistry = candidate;
    publish(candidate);
  } catch {
    // Invalid external data is rejected transactionally; the current registry is retained.
  }
}

function publish(registry: MovementProfileRegistry): void {
  for (const listener of listeners) listener(registry);
}

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}
