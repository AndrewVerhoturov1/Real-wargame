import { AttentionProfileRegistry, createDefaultAttentionProfileRegistry } from './AttentionProfiles';

export const ATTENTION_PROFILE_STORAGE_KEY = 'real-wargame.attention-profiles.v1';

let currentRegistry: AttentionProfileRegistry | null = null;
let storageListenerInstalled = false;
const listeners = new Set<(registry: AttentionProfileRegistry) => void>();

export function getAttentionProfileRegistry(): AttentionProfileRegistry {
  if (!currentRegistry) currentRegistry = loadAttentionProfileRegistry();
  installStorageListener();
  return currentRegistry;
}

export function loadAttentionProfileRegistry(storage: Pick<Storage, 'getItem'> | null = browserStorage()): AttentionProfileRegistry {
  if (!storage) return createDefaultAttentionProfileRegistry();
  try {
    const raw = storage.getItem(ATTENTION_PROFILE_STORAGE_KEY);
    return raw ? AttentionProfileRegistry.importJson(raw) : createDefaultAttentionProfileRegistry();
  } catch {
    return createDefaultAttentionProfileRegistry();
  }
}

export function saveAttentionProfileRegistry(registry: AttentionProfileRegistry, storage: Pick<Storage, 'setItem'> | null = browserStorage()): void {
  currentRegistry = registry;
  if (storage) {
    try { storage.setItem(ATTENTION_PROFILE_STORAGE_KEY, registry.exportJson()); } catch { /* in-memory registry remains usable */ }
  }
  publish(registry);
}

export function replaceAttentionProfileRegistry(value: unknown): AttentionProfileRegistry {
  const registry = AttentionProfileRegistry.fromUnknown(value);
  saveAttentionProfileRegistry(registry);
  return registry;
}

export function subscribeAttentionProfileRegistry(listener: (registry: AttentionProfileRegistry) => void): () => void {
  listeners.add(listener);
  installStorageListener();
  return () => listeners.delete(listener);
}

function installStorageListener(): void {
  if (storageListenerInstalled || typeof window === 'undefined') return;
  storageListenerInstalled = true;
  window.addEventListener('storage', (event) => {
    if (event.key !== ATTENTION_PROFILE_STORAGE_KEY) return;
    currentRegistry = event.newValue ? AttentionProfileRegistry.importJson(event.newValue) : createDefaultAttentionProfileRegistry();
    publish(currentRegistry);
  });
}
function publish(registry: AttentionProfileRegistry): void { for (const listener of listeners) listener(registry); }
function browserStorage(): Storage | null { return typeof window === 'undefined' ? null : window.localStorage; }
