import type { AiBlackboardValue } from './AiBlackboard';
import {
  MOVEMENT_PROFILE_MEMORY_KEYS,
  normalizeMovementProfileSource,
  resolveMovementProfile,
  resolveMovementProfileDefinitionRevision,
  type MovementProfileRegistryEntry,
  type MovementProfileSource,
  type ResolvedMovementProfile,
} from '../movement/MovementProfileContract';
import type { MoveOrder } from '../orders/MoveOrder';
import type { UnitModel } from '../units/UnitModel';

export interface MovementProfileRuntimeResolution {
  readonly resolved: ResolvedMovementProfile;
  readonly definitionRevision?: number;
  readonly selectionRevision: number;
}

type MovementRuntime = UnitModel['behaviorRuntime'] & {
  aiGraphMemory?: Record<string, AiBlackboardValue>;
};

/**
 * Canonical finalizer for physical movement-profile selection.
 *
 * AI nodes publish only override intent. This resolver is the sole owner of
 * active/forced fields and of the effective MoveOrder snapshot. It is pure
 * with respect to browser APIs; a registry adapter may pass profile entries.
 */
export function reconcileMovementProfileRuntime(
  unit: UnitModel,
  registryEntries?: readonly MovementProfileRegistryEntry[],
): MovementProfileRuntimeResolution {
  const runtime = unit.behaviorRuntime as MovementRuntime;
  const memory = getRuntimeMemory(runtime);
  const order = unit.order;
  const orderProfileId = cleanOptionalText(order?.movementProfileId);
  const orderSource = orderProfileId
    ? normalizeMovementProfileSource(order?.movementProfileSource, 'default')
    : undefined;
  const knownProfileIds = registryEntries?.map((entry) => entry.id);

  const resolved = resolveMovementProfile({
    hardSafetyProfileId: readMemoryCandidate(
      memory,
      MOVEMENT_PROFILE_MEMORY_KEYS.hardSafetyProfileId,
      orderSource === 'hard_safety' ? orderProfileId : undefined,
    ),
    hardSafetyReason: memory[MOVEMENT_PROFILE_MEMORY_KEYS.hardSafetyReason],
    aiOverrideProfileId: readMemoryCandidate(
      memory,
      MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideProfileId,
      orderSource === 'ai_override' ? orderProfileId : undefined,
    ),
    aiOverrideOwnerToken: readMemoryCandidate(
      memory,
      MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideOwnerToken,
      orderSource === 'ai_override' ? order?.movementProfileOwnerToken : undefined,
    ),
    aiOverrideReason: memory[MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideReason],
    playerOrderProfileId: unit.playerCommand?.intent.movementProfileId
      ?? (orderSource === 'player_order' ? orderProfileId : undefined),
    unitRoleProfileId: unit.unitRoleMovementProfileId
      ?? (orderSource === 'unit_role' ? orderProfileId : undefined),
    defaultProfileId: orderSource === 'default' ? orderProfileId : undefined,
    knownProfileIds,
  });

  const ownerToken = resolved.ownerToken
    ?? (resolved.source === 'player_order' ? unit.playerCommand?.id : undefined);
  const previousId = cleanOptionalText(order?.movementProfileId)
    ?? cleanOptionalText(memory[MOVEMENT_PROFILE_MEMORY_KEYS.activeProfileId]);
  const previousSource = normalizeOptionalSource(
    order?.movementProfileSource ?? memory[MOVEMENT_PROFILE_MEMORY_KEYS.activeProfileSource],
  );
  const previousOwnerToken = cleanOptionalText(order?.movementProfileOwnerToken);
  const selectionChanged = previousId !== undefined && (
    previousId !== resolved.profileId
    || previousSource !== resolved.source
    || previousOwnerToken !== ownerToken
  );
  const previousSelectionRevision = finiteRevision(
    order?.movementProfileSelectionRevision
      ?? order?.movementProfileRevision
      ?? memory[MOVEMENT_PROFILE_MEMORY_KEYS.profileSelectionRevision],
  );
  const initialSelectionRevision = resolved.source === 'player_order'
    ? finiteRevision(unit.playerCommand?.revision) ?? 1
    : 1;
  const selectionRevision = selectionChanged
    ? Math.max(1, (previousSelectionRevision ?? initialSelectionRevision) + 1)
    : previousSelectionRevision ?? initialSelectionRevision;
  const definitionRevision = resolveMovementProfileDefinitionRevision(resolved.profileId, registryEntries)
    ?? finiteRevision(memory[MOVEMENT_PROFILE_MEMORY_KEYS.profileDefinitionRevision])
    ?? finiteRevision(order?.movementProfileDefinitionRevision);

  memory[MOVEMENT_PROFILE_MEMORY_KEYS.requestedProfileId] = unit.playerCommand?.intent.movementProfileId
    ?? unit.unitRoleMovementProfileId
    ?? resolved.profileId;
  memory[MOVEMENT_PROFILE_MEMORY_KEYS.activeProfileId] = resolved.profileId;
  memory[MOVEMENT_PROFILE_MEMORY_KEYS.activeProfileSource] = resolved.source;
  memory[MOVEMENT_PROFILE_MEMORY_KEYS.forcedFallback] = resolved.forcedFallback;
  memory[MOVEMENT_PROFILE_MEMORY_KEYS.forcedReason] = resolved.forcedReason ?? '';
  memory[MOVEMENT_PROFILE_MEMORY_KEYS.profileDefinitionRevision] = definitionRevision ?? null;
  memory[MOVEMENT_PROFILE_MEMORY_KEYS.profileSelectionRevision] = selectionRevision;

  if (order) {
    order.movementProfileId = resolved.profileId;
    order.movementProfileSource = resolved.source;
    order.movementProfileOwnerToken = ownerToken;
    order.movementProfileDefinitionRevision = definitionRevision;
    order.movementProfileSelectionRevision = selectionRevision;
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
