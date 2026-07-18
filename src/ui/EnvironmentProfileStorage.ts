import { EnvironmentProfileRegistry, createDefaultEnvironmentProfileRegistry } from '../core/map/EnvironmentMaterialProfile';
import { installEnvironmentProfileRegistry } from '../core/map/EnvironmentProfileRuntime';

export const ENVIRONMENT_PROFILE_STORAGE_KEY = 'real-wargame.environment-profiles.v1';
let currentRegistry: EnvironmentProfileRegistry | null = null;
let storageListenerInstalled = false;
const listeners = new Set<(registry: EnvironmentProfileRegistry) => void>();

export function getEnvironmentProfileRegistry(): EnvironmentProfileRegistry {
  if (!currentRegistry) currentRegistry = loadEnvironmentProfileRegistry();
  installStorageListener();
  installEnvironmentProfileRegistry(currentRegistry);
  return currentRegistry;
}

export function loadEnvironmentProfileRegistry(storage: Pick<Storage, 'getItem'> | null = browserStorage()): EnvironmentProfileRegistry {
  if (!storage) return createDefaultEnvironmentProfileRegistry();
  try { const raw = storage.getItem(ENVIRONMENT_PROFILE_STORAGE_KEY); return raw ? EnvironmentProfileRegistry.importJson(raw) : createDefaultEnvironmentProfileRegistry(); }
  catch { return createDefaultEnvironmentProfileRegistry(); }
}

export function saveEnvironmentProfileRegistry(registry: EnvironmentProfileRegistry, storage: Pick<Storage, 'setItem'> | null = browserStorage()): void {
  currentRegistry = registry;
  if (storage) { try { storage.setItem(ENVIRONMENT_PROFILE_STORAGE_KEY, registry.exportJson()); } catch { /* in-memory remains authoritative */ } }
  installEnvironmentProfileRegistry(registry);
  publish(registry);
}

export function replaceEnvironmentProfileRegistry(value: unknown): EnvironmentProfileRegistry { const registry = EnvironmentProfileRegistry.fromUnknown(value); saveEnvironmentProfileRegistry(registry); return registry; }
export function subscribeEnvironmentProfileRegistry(listener: (registry: EnvironmentProfileRegistry) => void): () => void { listeners.add(listener); installStorageListener(); return () => listeners.delete(listener); }

function installStorageListener(): void {
  if (storageListenerInstalled || typeof window === 'undefined') return;
  storageListenerInstalled = true;
  window.addEventListener('storage', (event) => {
    if (event.key !== ENVIRONMENT_PROFILE_STORAGE_KEY) return;
    try {
      currentRegistry = event.newValue
        ? EnvironmentProfileRegistry.importJson(event.newValue)
        : createDefaultEnvironmentProfileRegistry();
    } catch {
      currentRegistry = createDefaultEnvironmentProfileRegistry();
    }
    installEnvironmentProfileRegistry(currentRegistry);
    publish(currentRegistry);
  });
}
function publish(registry: EnvironmentProfileRegistry): void { for (const listener of listeners) listener(registry); }
function browserStorage(): Storage | null { return typeof window === 'undefined' ? null : window.localStorage; }
