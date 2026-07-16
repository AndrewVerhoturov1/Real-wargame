export const DEFAULT_MOVEMENT_PROFILE_ID = 'normal' as const;

export const BUILTIN_MOVEMENT_PROFILE_IDS = ['normal', 'stealth', 'fast'] as const;
export type BuiltinMovementProfileId = typeof BUILTIN_MOVEMENT_PROFILE_IDS[number];

export const MOVEMENT_PROFILE_SOURCES = [
  'hard_safety',
  'ai_override',
  'player_order',
  'unit_role',
  'default',
] as const;
export type MovementProfileSource = typeof MOVEMENT_PROFILE_SOURCES[number];

export const MOVEMENT_PROFILE_SELECTION_MODES = [
  'from_order',
  'current_active',
  'automatic',
  'specific',
] as const;
export type MovementProfileSelectionMode = typeof MOVEMENT_PROFILE_SELECTION_MODES[number];

export const MOVEMENT_PROFILE_MEMORY_KEYS = Object.freeze({
  requestedProfileId: 'requested_movement_profile_id',
  activeProfileId: 'active_movement_profile_id',
  activeProfileSource: 'active_movement_profile_source',
  activeGait: 'active_movement_gait',
  speed: 'movement_speed',
  stamina: 'movement_stamina',
  noise: 'movement_noise',
  visualSignature: 'movement_visual_signature',
  canFire: 'movement_can_fire',
  forcedFallback: 'movement_forced_fallback',
  forcedReason: 'movement_forced_reason',
  aiOverrideProfileId: 'movement_profile_override_id',
  aiOverrideOwnerToken: 'movement_profile_override_owner_token',
  hardSafetyProfileId: 'movement_hard_safety_profile_id',
  hardSafetyReason: 'movement_hard_safety_reason',
} as const);

export interface ResolveMovementProfileInput {
  readonly hardSafetyProfileId?: unknown;
  readonly hardSafetyReason?: unknown;
  readonly aiOverrideProfileId?: unknown;
  readonly aiOverrideOwnerToken?: unknown;
  readonly playerOrderProfileId?: unknown;
  readonly unitRoleProfileId?: unknown;
  readonly defaultProfileId?: unknown;
  /**
   * Optional registry view supplied by the profile-registry integration.
   * When omitted, non-empty custom ids are preserved instead of guessed.
   */
  readonly knownProfileIds?: readonly string[];
}

export interface ResolvedMovementProfile {
  readonly profileId: string;
  readonly source: MovementProfileSource;
  readonly ownerToken?: string;
  readonly forcedFallback: boolean;
  readonly forcedReason?: string;
}

export interface ResolveMovementProfileSelectionInput {
  readonly mode?: unknown;
  readonly specificProfileId?: unknown;
  readonly requestedProfileId?: unknown;
  readonly activeProfileId?: unknown;
  readonly activeProfileSource?: unknown;
}

export interface ResolvedMovementProfileSelection {
  readonly mode: MovementProfileSelectionMode;
  readonly profileId?: string;
  readonly source?: MovementProfileSource;
}

export function normalizeMovementProfileId(
  value: unknown,
  fallback: string = DEFAULT_MOVEMENT_PROFILE_ID,
): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function normalizeMovementProfileSource(
  value: unknown,
  fallback: MovementProfileSource = 'default',
): MovementProfileSource {
  return typeof value === 'string' && (MOVEMENT_PROFILE_SOURCES as readonly string[]).includes(value)
    ? value as MovementProfileSource
    : fallback;
}

export function normalizeMovementProfileSelectionMode(
  value: unknown,
  fallback: MovementProfileSelectionMode = 'automatic',
): MovementProfileSelectionMode {
  return typeof value === 'string' && (MOVEMENT_PROFILE_SELECTION_MODES as readonly string[]).includes(value)
    ? value as MovementProfileSelectionMode
    : fallback;
}

export function resolveMovementProfile(input: ResolveMovementProfileInput): ResolvedMovementProfile {
  const candidates: readonly {
    readonly value: unknown;
    readonly source: MovementProfileSource;
    readonly ownerToken?: unknown;
    readonly reason?: unknown;
  }[] = [
    {
      value: input.hardSafetyProfileId,
      source: 'hard_safety',
      reason: input.hardSafetyReason,
    },
    {
      value: input.aiOverrideProfileId,
      source: 'ai_override',
      ownerToken: input.aiOverrideOwnerToken,
    },
    { value: input.playerOrderProfileId, source: 'player_order' },
    { value: input.unitRoleProfileId, source: 'unit_role' },
    { value: input.defaultProfileId, source: 'default' },
  ];

  const selected = candidates.find((candidate) => isNonEmptyText(candidate.value)) ?? {
    value: DEFAULT_MOVEMENT_PROFILE_ID,
    source: 'default' as const,
  };
  const requestedId = normalizeMovementProfileId(selected.value);
  const registry = normalizeKnownIds(input.knownProfileIds);
  if (!registry || registry.has(requestedId)) {
    return Object.freeze({
      profileId: requestedId,
      source: selected.source,
      ownerToken: cleanOptionalText(selected.ownerToken),
      forcedFallback: false,
      forcedReason: cleanOptionalText(selected.reason),
    });
  }

  const fallbackId = resolveRegisteredFallback(registry, input.defaultProfileId);
  return Object.freeze({
    profileId: fallbackId,
    source: selected.source,
    ownerToken: cleanOptionalText(selected.ownerToken),
    forcedFallback: true,
    forcedReason: cleanOptionalText(selected.reason)
      ?? `Movement profile "${requestedId}" is unavailable; fallback "${fallbackId}" is active.`,
  });
}

export function resolveMovementProfileSelection(
  input: ResolveMovementProfileSelectionInput,
): ResolvedMovementProfileSelection {
  const mode = normalizeMovementProfileSelectionMode(input.mode);
  if (mode === 'specific') {
    return Object.freeze({
      mode,
      profileId: normalizeMovementProfileId(input.specificProfileId),
      source: 'ai_override',
    });
  }
  if (mode === 'from_order') {
    return Object.freeze({
      mode,
      profileId: normalizeMovementProfileId(input.requestedProfileId),
      source: 'player_order',
    });
  }
  if (mode === 'current_active') {
    return Object.freeze({
      mode,
      profileId: normalizeMovementProfileId(input.activeProfileId),
      source: normalizeMovementProfileSource(input.activeProfileSource),
    });
  }
  return Object.freeze({ mode });
}

export function movementProfileLabelRu(profileId: string): string {
  if (profileId === 'normal') return 'Обычное движение';
  if (profileId === 'stealth') return 'Скрытное движение';
  if (profileId === 'fast') return 'Быстрое движение';
  return profileId;
}

export function movementProfileSourceLabelRu(source: MovementProfileSource): string {
  if (source === 'hard_safety') return 'ограничение безопасности';
  if (source === 'ai_override') return 'временное решение ИИ';
  if (source === 'player_order') return 'приказ игрока';
  if (source === 'unit_role') return 'данные бойца';
  return 'профиль по умолчанию';
}

function resolveRegisteredFallback(registry: ReadonlySet<string>, value: unknown): string {
  const preferred = normalizeMovementProfileId(value);
  if (registry.has(preferred)) return preferred;
  if (registry.has(DEFAULT_MOVEMENT_PROFILE_ID)) return DEFAULT_MOVEMENT_PROFILE_ID;
  return registry.values().next().value ?? DEFAULT_MOVEMENT_PROFILE_ID;
}

function normalizeKnownIds(values: readonly string[] | undefined): ReadonlySet<string> | undefined {
  if (!values) return undefined;
  const normalized = new Set(values.map((value) => value.trim()).filter(Boolean));
  return normalized.size > 0 ? normalized : undefined;
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function cleanOptionalText(value: unknown): string | undefined {
  return isNonEmptyText(value) ? value.trim() : undefined;
}
