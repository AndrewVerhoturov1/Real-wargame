import {
  type NavigationMovementMode,
  type NavigationProfile,
  type NavigationProfileRegistry,
} from './NavigationProfiles';

export type NavigationProfileSource =
  | 'debugOverride'
  | 'playerCommand'
  | 'behaviorMode'
  | 'unitRole'
  | 'default';

export interface NavigationProfileResolutionInput {
  readonly debugOverrideProfileId?: string | null;
  readonly playerCommandProfileId?: string | null;
  readonly playerCommandMode?: NavigationMovementMode | string | null;
  readonly behaviorMovementMode?: NavigationMovementMode | string | null;
  readonly unitRoleProfileId?: string | null;
}

export interface ResolvedNavigationProfile {
  readonly profileId: string;
  readonly source: NavigationProfileSource;
  readonly profile: NavigationProfile;
}

export function resolveActiveNavigationProfile(
  registry: NavigationProfileRegistry,
  input: NavigationProfileResolutionInput,
): ResolvedNavigationProfile {
  const candidates: ReadonlyArray<readonly [string | null | undefined, NavigationProfileSource]> = [
    [input.debugOverrideProfileId, 'debugOverride'],
    [input.playerCommandProfileId, 'playerCommand'],
    [input.playerCommandMode, 'playerCommand'],
    [input.behaviorMovementMode, 'behaviorMode'],
    [input.unitRoleProfileId, 'unitRole'],
    ['normal', 'default'],
  ];

  for (const [profileId, source] of candidates) {
    if (!profileId || !registry.hasProfile(profileId)) continue;
    return {
      profileId,
      source,
      profile: registry.getProfile(profileId),
    };
  }

  return {
    profileId: 'normal',
    source: 'default',
    profile: registry.getProfile('normal'),
  };
}
