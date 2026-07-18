import {
  DEFAULT_ENVIRONMENT_PROFILE_ID,
  type EnvironmentMaterialProfile,
  type EnvironmentProfileRegistry,
  getDefaultEnvironmentProfile,
  getEnvironmentProfileDomainKey,
  type EnvironmentRevisionDomain,
} from './EnvironmentMaterialProfile';

export interface EnvironmentProfileRuntimeSnapshot {
  readonly activeProfileId: string;
  readonly registryRevision: number;
  readonly activeProfile: EnvironmentMaterialProfile;
  readonly domainKeys: Readonly<Record<EnvironmentRevisionDomain, string>>;
}

const initialProfile = getDefaultEnvironmentProfile();
let snapshot: EnvironmentProfileRuntimeSnapshot = {
  activeProfileId: DEFAULT_ENVIRONMENT_PROFILE_ID,
  registryRevision: 1,
  activeProfile: initialProfile,
  domainKeys: buildDomainKeys(initialProfile),
};
const listeners = new Set<(next: EnvironmentProfileRuntimeSnapshot, previous: EnvironmentProfileRuntimeSnapshot) => void>();

export function installEnvironmentProfileRegistry(registry: EnvironmentProfileRegistry): EnvironmentProfileRuntimeSnapshot {
  const previous = snapshot;
  const activeProfile = deepFreeze(registry.getProfile());
  snapshot = Object.freeze({
    activeProfileId: registry.activeProfileId,
    registryRevision: registry.revision,
    activeProfile,
    domainKeys: Object.freeze(buildDomainKeys(activeProfile)),
  });
  if (previous.registryRevision !== snapshot.registryRevision
    || previous.activeProfileId !== snapshot.activeProfileId
    || hasDomainKeyChange(previous.domainKeys, snapshot.domainKeys)) {
    for (const listener of listeners) listener(snapshot, previous);
  }
  return snapshot;
}

export function getEnvironmentProfileRuntimeSnapshot(): EnvironmentProfileRuntimeSnapshot { return snapshot; }
export function getActiveEnvironmentProfile(): EnvironmentMaterialProfile { return snapshot.activeProfile; }
export function subscribeEnvironmentProfileRuntime(listener: (next: EnvironmentProfileRuntimeSnapshot, previous: EnvironmentProfileRuntimeSnapshot) => void): () => void { listeners.add(listener); return () => listeners.delete(listener); }

function deepFreeze<T>(value: T): T { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); } return value; }

function buildDomainKeys(profile: EnvironmentMaterialProfile): Record<EnvironmentRevisionDomain, string> {
  return {
    presentation: getEnvironmentProfileDomainKey(profile, 'presentation'),
    visibility: getEnvironmentProfileDomainKey(profile, 'visibility'),
    fire: getEnvironmentProfileDomainKey(profile, 'fire'),
    movement: getEnvironmentProfileDomainKey(profile, 'movement'),
  };
}

function hasDomainKeyChange(
  previous: Readonly<Record<EnvironmentRevisionDomain, string>>,
  next: Readonly<Record<EnvironmentRevisionDomain, string>>,
): boolean {
  return previous.presentation !== next.presentation
    || previous.visibility !== next.visibility
    || previous.fire !== next.fire
    || previous.movement !== next.movement;
}
