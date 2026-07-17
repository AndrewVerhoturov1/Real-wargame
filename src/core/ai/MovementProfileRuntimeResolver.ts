import type { AiBlackboardValue } from './AiBlackboard';
import {
  DEFAULT_MOVEMENT_PROFILE_ID,
  MOVEMENT_PROFILE_MEMORY_KEYS,
  normalizeMovementProfileSource,
  resolveMovementProfileAuthority,
  type MovementProfileRegistryEntry,
  type MovementProfileSource,
  type ResolvedMovementProfileAuthority,
} from '../movement/MovementProfiles';
import { isPlayerCommandOutstanding } from '../orders/PlayerCommand';
import type { UnitModel } from '../units/UnitModel';

export interface MovementPhysicalSafetyIntent {
  readonly profileId: string | null;
  readonly reason?: string | null;
}

export interface MovementProfileRuntimeResolution {
  readonly resolved: ResolvedMovementProfileAuthority;
  readonly definitionRevision?: number;
  readonly selectionRevision: number;
}

export interface MovementProfileRuntimeReconcileOptions {
  /** Preflight resolves the current authority for physics without publishing revisions or rewriting MoveOrder. */
  readonly commit?: boolean;
  /** Previous committed physical authority captured before a non-committing preflight. */
  readonly previousProfileId?: string;
  readonly previousProfileSource?: MovementProfileSource;
}

type MovementRuntime = UnitModel['behaviorRuntime'] & {
  aiGraphMemory?: Record<string, AiBlackboardValue>;
};

interface PreparedMovementRegistryIndex {
  readonly profileIds: ReadonlySet<string>;
  readonly definitionRevisionById: ReadonlyMap<string, number>;
}

const preparedMovementRegistryIndexByEntries = new WeakMap<
  readonly MovementProfileRegistryEntry[],
  PreparedMovementRegistryIndex
>();

/**
 * Canonical finalizer for physical movement-profile selection.
 *
 * AI nodes and move actions publish only source intent. This function is the
 * sole owner of requested/active/forced fields, both revisions and the
 * effective MoveOrder movement snapshot. It never reads browser APIs.
 */
export function reconcileMovementProfileRuntime(
  unit: UnitModel,
  registryEntries?: readonly MovementProfileRegistryEntry[],
  physicalSafety?: MovementPhysicalSafetyIntent,
  options: MovementProfileRuntimeReconcileOptions = {},
): MovementProfileRuntimeResolution {
  const runtime = unit.behaviorRuntime as MovementRuntime;
  const memory = getRuntimeMemory(runtime);
  const commit = options.commit !== false;
  let hardSafetyProfileId: AiBlackboardValue | undefined = memory[MOVEMENT_PROFILE_MEMORY_KEYS.hardSafetyProfileId];
  let hardSafetyReason: AiBlackboardValue | undefined = memory[MOVEMENT_PROFILE_MEMORY_KEYS.hardSafetyReason];
  if (physicalSafety !== undefined) {
    const nextSafetyProfileId = cleanOptionalText(physicalSafety.profileId);
    hardSafetyProfileId = nextSafetyProfileId;
    hardSafetyReason = nextSafetyProfileId
      ? cleanOptionalText(physicalSafety.reason) ?? 'physical_runtime'
      : undefined;
    if (commit) {
      if (nextSafetyProfileId) {
        memory[MOVEMENT_PROFILE_MEMORY_KEYS.hardSafetyProfileId] = nextSafetyProfileId;
        memory[MOVEMENT_PROFILE_MEMORY_KEYS.hardSafetyReason] = hardSafetyReason ?? 'physical_runtime';
      } else {
        delete memory[MOVEMENT_PROFILE_MEMORY_KEYS.hardSafetyProfileId];
        delete memory[MOVEMENT_PROFILE_MEMORY_KEYS.hardSafetyReason];
      }
    }
  }
  const order = unit.order;
  const orderProfileId = cleanOptionalText(order?.movementProfileId);
  const orderSource = orderProfileId
    ? normalizeOptionalSource(order?.movementProfileSource)
    : undefined;
  const registryIndex = prepareMovementRegistryIndex(registryEntries);
  const activePlayerCommand = isPlayerCommandOutstanding(unit.playerCommand)
    ? unit.playerCommand
    : null;
  const memoryPlayerOrderActive = memory.player_command_active === true;
  const legacyOrderRuntimeProfileId = order
    && !activePlayerCommand
    && unit.movementRuntime.requestedProfileSource === 'player_order'
      ? cleanOptionalText(unit.movementRuntime.requestedProfileId)
      : undefined;
  const playerOrderProfileId = activePlayerCommand?.intent.movementProfileId
    ?? (memoryPlayerOrderActive ? cleanOptionalText(memory.player_order_movement_profile) : undefined)
    ?? (orderSource === 'player_order' ? orderProfileId : undefined)
    ?? legacyOrderRuntimeProfileId;
  const unitRoleProfileId = cleanOptionalText(unit.unitRoleMovementProfileId)
    ?? (orderSource === 'unit_role' ? orderProfileId : undefined)
    ?? (unit.movementRuntime.requestedProfileSource === 'unit_role'
      ? cleanOptionalText(unit.movementRuntime.requestedProfileId)
      : undefined);

  const resolved = resolveMovementProfileAuthority({
    hardSafetyProfileId,
    hardSafetyReason,
    aiOverrideProfileId: readMemoryCandidate(
      memory,
      MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideProfileId,
      orderSource === 'ai_override'
        ? orderProfileId
        : order && unit.movementRuntime.requestedProfileSource === 'ai_override'
          ? cleanOptionalText(unit.movementRuntime.requestedProfileId)
          : undefined,
    ),
    aiOverrideOwnerToken: readMemoryCandidate(
      memory,
      MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideOwnerToken,
      orderSource === 'ai_override' ? order?.movementProfileOwnerToken : undefined,
    ),
    aiOverrideReason: memory[MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideReason],
    playerOrderProfileId,
    unitRoleProfileId,
    defaultProfileId: DEFAULT_MOVEMENT_PROFILE_ID,
    knownProfileIds: registryIndex?.profileIds,
  });

  const ownerToken = resolved.source === 'player_order'
    ? activePlayerCommand?.id
    : resolved.ownerToken;
  const previousId = cleanOptionalText(options.previousProfileId)
    ?? cleanOptionalText(unit.movementRuntime.effectiveProfileId)
    ?? cleanOptionalText(memory[MOVEMENT_PROFILE_MEMORY_KEYS.activeProfileId])
    ?? cleanOptionalText(order?.movementProfileId);
  const previousSource = normalizeOptionalSource(
    options.previousProfileSource
      ?? unit.movementRuntime.effectiveProfileSource
      ?? memory[MOVEMENT_PROFILE_MEMORY_KEYS.activeProfileSource]
      ?? order?.movementProfileSource,
  );
  const selectionChanged = previousId !== undefined && (
    previousId !== resolved.profileId
    || previousSource !== resolved.source
  );
  const previousSelectionRevision = finiteRevision(unit.movementRuntime.profileSelectionRevision)
    ?? finiteRevision(memory[MOVEMENT_PROFILE_MEMORY_KEYS.profileSelectionRevision])
    ?? finiteRevision(order?.movementProfileSelectionRevision);
  const initialSelectionRevision = resolved.requestedSource === 'player_order'
    ? finiteRevision(activePlayerCommand?.revision) ?? 1
    : 1;
  const selectionRevision = selectionChanged
    ? Math.max(1, (previousSelectionRevision ?? initialSelectionRevision) + 1)
    : previousSelectionRevision ?? initialSelectionRevision;
  const definitionRevision = registryIndex?.definitionRevisionById.get(resolved.profileId)
    ?? finiteRevision(unit.movementRuntime.profileDefinitionRevision)
    ?? finiteRevision(memory[MOVEMENT_PROFILE_MEMORY_KEYS.profileDefinitionRevision])
    ?? finiteRevision(order?.movementProfileDefinitionRevision);

  if (commit) {
    unit.movementRuntime.profileDefinitionRevision = definitionRevision ?? null;
    unit.movementRuntime.profileSelectionRevision = selectionRevision;
    memory[MOVEMENT_PROFILE_MEMORY_KEYS.requestedProfileId] = resolved.requestedProfileId;
    memory[MOVEMENT_PROFILE_MEMORY_KEYS.activeProfileId] = resolved.profileId;
    memory[MOVEMENT_PROFILE_MEMORY_KEYS.activeProfileSource] = resolved.source;
    memory[MOVEMENT_PROFILE_MEMORY_KEYS.forcedFallback] = resolved.forcedFallback;
    memory[MOVEMENT_PROFILE_MEMORY_KEYS.forcedReason] = resolved.forcedReason ?? '';
    memory[MOVEMENT_PROFILE_MEMORY_KEYS.profileDefinitionRevision] = definitionRevision ?? null;
    memory[MOVEMENT_PROFILE_MEMORY_KEYS.profileSelectionRevision] = selectionRevision;
  }

  unit.movementRuntime.requestedProfileId = resolved.requestedProfileId;
  unit.movementRuntime.requestedProfileSource = resolved.requestedSource;
  unit.movementRuntime.effectiveProfileId = resolved.profileId;
  unit.movementRuntime.effectiveProfileSource = resolved.source;

  // MoveOrder is the route/request snapshot. A transient physical fallback is
  // effective runtime state only and must never rewrite player/AI intent or route revisions.
  if (order && commit && !resolved.forcedFallback) {
    const orderSelectionChanged = cleanOptionalText(order.movementProfileId) !== resolved.profileId
      || normalizeOptionalSource(order.movementProfileSource) !== resolved.source;
    const orderSelectionRevision = orderSelectionChanged
      ? Math.max(1, (finiteRevision(order.movementProfileSelectionRevision) ?? 0) + 1)
      : finiteRevision(order.movementProfileSelectionRevision) ?? selectionRevision;
    order.movementProfileId = resolved.profileId;
    order.movementProfileSource = resolved.source;
    order.movementProfileOwnerToken = ownerToken;
    order.movementProfileDefinitionRevision = definitionRevision;
    order.movementProfileSelectionRevision = orderSelectionRevision;
  }

  return { resolved, definitionRevision, selectionRevision };
}

function getRuntimeMemory(runtime: MovementRuntime): Record<string, AiBlackboardValue> {
  if (runtime.aiRuntimeSession) return runtime.aiRuntimeSession.blackboardMemory;
  const memory = runtime.aiGraphMemory ?? {};
  runtime.aiGraphMemory = memory;
  return memory;
}

function readMemoryCandidate(
  memory: Readonly<Record<string, AiBlackboardValue>>,
  key: string,
  fallback: AiBlackboardValue | undefined,
): AiBlackboardValue | undefined {
  return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : fallback;
}

function normalizeOptionalSource(value: unknown): MovementProfileSource | undefined {
  return typeof value === 'string'
    ? normalizeMovementProfileSource(value)
    : undefined;
}

function finiteRevision(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : undefined;
}

function cleanOptionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function prepareMovementRegistryIndex(
  entries: readonly MovementProfileRegistryEntry[] | undefined,
): PreparedMovementRegistryIndex | undefined {
  if (!entries) return undefined;
  const cached = preparedMovementRegistryIndexByEntries.get(entries);
  if (cached) return cached;
  const profileIds = new Set<string>();
  const definitionRevisionById = new Map<string, number>();
  for (const entry of entries) {
    const id = cleanOptionalText(entry.id);
    if (!id) continue;
    profileIds.add(id);
    const revision = finiteRevision(entry.revision);
    if (revision !== undefined) definitionRevisionById.set(id, revision);
  }
  const prepared: PreparedMovementRegistryIndex = Object.freeze({
    profileIds,
    definitionRevisionById,
  });
  preparedMovementRegistryIndexByEntries.set(entries, prepared);
  return prepared;
}
