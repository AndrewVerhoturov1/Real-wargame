export const DEFAULT_MOVEMENT_PROFILE_ID = 'normal_walk' as const;

export const BUILTIN_MOVEMENT_PROFILE_IDS = [
  'normal_walk',
  'stealth_move',
  'crouched_move',
  'run',
  'sprint',
  'crawl',
] as const;
export type BuiltinMovementProfileId = typeof BUILTIN_MOVEMENT_PROFILE_IDS[number];

export const MOVEMENT_PROFILE_SOURCES = [
  'hard_safety',
  'ai_override',
  'player_order',
  'unit_role',
  'default',
] as const;
export type MovementProfileSource = typeof MOVEMENT_PROFILE_SOURCES[number];
export type MovementProfileBaselineSource = Exclude<MovementProfileSource, 'hard_safety' | 'ai_override'>;

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
  profileDefinitionRevision: 'movement_profile_definition_revision',
  profileSelectionRevision: 'movement_profile_selection_revision',
  aiOverrideProfileId: 'movement_profile_override_id',
  aiOverrideOwnerToken: 'movement_profile_override_owner_token',
  aiOverrideReason: 'movement_profile_override_reason',
  hardSafetyProfileId: 'movement_hard_safety_profile_id',
  hardSafetyReason: 'movement_hard_safety_reason',
} as const);

export interface MovementProfileRegistryEntry {
  readonly id: string;
  readonly revision?: number;
  readonly nameRu?: string;
}

export interface ResolveMovementProfileInput {
  readonly hardSafetyProfileId?: unknown;
  readonly hardSafetyReason?: unknown;
  readonly aiOverrideProfileId?: unknown;
  readonly aiOverrideOwnerToken?: unknown;
  readonly aiOverrideReason?: unknown;
  readonly playerOrderProfileId?: unknown;
  readonly unitRoleProfileId?: unknown;
  readonly defaultProfileId?: unknown;
  /**
   * Optional registry view supplied by the movement-profile registry integration.
   * When omitted, non-empty custom ids are preserved instead of guessed.
   */
  readonly knownProfileIds?: readonly string[];
}

export interface ResolvedMovementProfile {
  /** Baseline intent before hard-safety or AI override selection. */
  readonly requestedProfileId: string;
  readonly requestedSource: MovementProfileBaselineSource;
  /** Effective profile consumed by the physical runtime. */
  readonly profileId: string;
  readonly source: MovementProfileSource;
  readonly ownerToken?: string;
  readonly forcedFallback: boolean;
  readonly forcedReason?: string;
}

export interface ResolveMovementProfileSelectionInput {
  readonly mode?: unknown;
  readonly specificProfileId?: unknown;
  readonly playerOrderActive?: unknown;
  readonly playerOrderProfileId?: unknown;
  readonly activeProfileId?: unknown;
  readonly activeProfileSource?: unknown;
}

export interface ResolvedMovementProfileSelection {
  readonly mode: MovementProfileSelectionMode;
  readonly profileId?: string;
  readonly source?: MovementProfileSource;
  readonly diagnosticReason?: string;
  readonly diagnosticReasonRu?: string;
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
  const baseline = selectRequestedBaseline(input);
  const effective = selectEffectiveCandidate(input, baseline);
  const requestedProfileId = normalizeMovementProfileId(baseline.value);
  const selectedProfileId = normalizeMovementProfileId(effective.value);
  const registry = normalizeKnownIds(input.knownProfileIds);
  const registryFallback = Boolean(registry && !registry.has(selectedProfileId));
  const profileId = registryFallback
    ? resolveRegisteredFallback(registry as ReadonlySet<string>, input.defaultProfileId)
    : selectedProfileId;
  const hardSafetyApplied = effective.source === 'hard_safety';
  const forcedFallback = hardSafetyApplied || registryFallback;
  const forcedReason = hardSafetyApplied
    ? cleanOptionalText(input.hardSafetyReason)
      ?? `Hard safety replaced requested movement profile "${requestedProfileId}" with "${profileId}".`
    : registryFallback
      ? `Movement profile "${selectedProfileId}" is unavailable; fallback "${profileId}" is active.`
      : undefined;

  return Object.freeze({
    requestedProfileId,
    requestedSource: baseline.source,
    profileId,
    source: effective.source,
    ownerToken: effective.source === 'ai_override'
      ? cleanOptionalText(input.aiOverrideOwnerToken)
      : undefined,
    forcedFallback,
    forcedReason,
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
    const playerOrderProfileId = input.playerOrderActive === true
      ? cleanOptionalText(input.playerOrderProfileId)
      : undefined;
    if (playerOrderProfileId) {
      return Object.freeze({
        mode,
        profileId: playerOrderProfileId,
        source: 'player_order',
      });
    }
    return Object.freeze({
      mode,
      diagnosticReason: 'No active player order profile is available; automatic movement-profile resolution is used.',
      diagnosticReasonRu: 'Активный профиль приказа игрока отсутствует; используется автоматический выбор профиля движения.',
    });
  }
  if (mode === 'current_active') {
    const activeProfileId = cleanOptionalText(input.activeProfileId);
    if (activeProfileId) {
      return Object.freeze({
        mode,
        profileId: activeProfileId,
        source: normalizeMovementProfileSource(input.activeProfileSource),
      });
    }
    return Object.freeze({
      mode,
      diagnosticReason: 'No active movement profile is available; automatic movement-profile resolution is used.',
      diagnosticReasonRu: 'Активный профиль движения отсутствует; используется автоматический выбор профиля движения.',
    });
  }
  return Object.freeze({ mode });
}

export function movementProfileLabelRu(profileId: string): string {
  if (profileId === 'normal_walk') return 'Обычный шаг';
  if (profileId === 'stealth_move') return 'Скрытное движение';
  if (profileId === 'crouched_move') return 'Движение пригнувшись';
  if (profileId === 'run') return 'Бег';
  if (profileId === 'sprint') return 'Спринт';
  if (profileId === 'crawl') return 'Ползком';
  return profileId;
}

export function movementProfileSourceLabelRu(source: MovementProfileSource): string {
  if (source === 'hard_safety') return 'ограничение безопасности';
  if (source === 'ai_override') return 'временное решение ИИ';
  if (source === 'player_order') return 'приказ игрока';
  if (source === 'unit_role') return 'данные бойца';
  return 'профиль по умолчанию';
}

export function resolveMovementProfileDefinitionRevision(
  profileId: string,
  registryEntries?: readonly MovementProfileRegistryEntry[],
): number | undefined {
  const revision = registryEntries?.find((entry) => entry.id === profileId)?.revision;
  return typeof revision === 'number' && Number.isFinite(revision)
    ? Math.max(0, Math.floor(revision))
    : undefined;
}

function selectRequestedBaseline(input: ResolveMovementProfileInput): {
  readonly value: unknown;
  readonly source: MovementProfileBaselineSource;
} {
  if (isNonEmptyText(input.playerOrderProfileId)) {
    return { value: input.playerOrderProfileId, source: 'player_order' };
  }
  if (isNonEmptyText(input.unitRoleProfileId)) {
    return { value: input.unitRoleProfileId, source: 'unit_role' };
  }
  return {
    value: isNonEmptyText(input.defaultProfileId) ? input.defaultProfileId : DEFAULT_MOVEMENT_PROFILE_ID,
    source: 'default',
  };
}

function selectEffectiveCandidate(
  input: ResolveMovementProfileInput,
  baseline: { readonly value: unknown; readonly source: MovementProfileBaselineSource },
): { readonly value: unknown; readonly source: MovementProfileSource } {
  if (isNonEmptyText(input.hardSafetyProfileId)) {
    return { value: input.hardSafetyProfileId, source: 'hard_safety' };
  }
  if (isNonEmptyText(input.aiOverrideProfileId)) {
    return { value: input.aiOverrideProfileId, source: 'ai_override' };
  }
  return baseline;
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
