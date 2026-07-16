import {
  DEFAULT_ENVIRONMENT_PROFILE_ID,
  type EnvironmentMaterialProfile,
  type EnvironmentProfileRegistry,
  getDefaultEnvironmentProfile,
} from './EnvironmentMaterialProfile';

export interface EnvironmentProfileRuntimeSnapshot {
  readonly activeProfileId: string;
  readonly registryRevision: number;
  readonly activeProfile: EnvironmentMaterialProfile;
}

let snapshot: EnvironmentProfileRuntimeSnapshot = {
  activeProfileId: DEFAULT_ENVIRONMENT_PROFILE_ID,
  registryRevision: 1,
  activeProfile: getDefaultEnvironmentProfile(),
};
const listeners = new Set<(next: EnvironmentProfileRuntimeSnapshot, previous: EnvironmentProfileRuntimeSnapshot) => void>();

export function installEnvironmentProfileRegistry(registry: EnvironmentProfileRegistry): EnvironmentProfileRuntimeSnapshot {
  const previous = snapshot;
  snapshot = Object.freeze({ activeProfileId: registry.activeProfileId, registryRevision: registry.revision, activeProfile: deepFreeze(registry.getProfile()) });
  if (previous.registryRevision !== snapshot.registryRevision || previous.activeProfileId !== snapshot.activeProfileId) {
    for (const listener of listeners) listener(snapshot, previous);
  }
  return snapshot;
}

export function getEnvironmentProfileRuntimeSnapshot(): EnvironmentProfileRuntimeSnapshot { return snapshot; }
export function getActiveEnvironmentProfile(): EnvironmentMaterialProfile { return snapshot.activeProfile; }
export function subscribeEnvironmentProfileRuntime(listener: (next: EnvironmentProfileRuntimeSnapshot, previous: EnvironmentProfileRuntimeSnapshot) => void): () => void { listeners.add(listener); return () => listeners.delete(listener); }

function deepFreeze<T>(value: T): T { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); } return value; }
