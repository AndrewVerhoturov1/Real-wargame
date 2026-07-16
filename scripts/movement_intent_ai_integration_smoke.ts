import assert from 'node:assert/strict';
import type { AiGraph } from '../src/core/ai/AiGraph';
import { runAiGraph } from '../src/core/ai/AiGraphRunner';
import { runAiGraphRuntime } from '../src/core/ai/AiGraphRuntime';
import { reconcileMovementProfileRuntime } from '../src/core/ai/MovementProfileRuntimeResolver';
import { DEFAULT_AI_NODE_CONTRACT_REGISTRY } from '../src/core/ai/contracts/AiNodeContractRegistry';
import {
  buildClearAiMovementProfileUpdates,
  buildSetAiMovementProfileUpdates,
  legacyMovementModeToProfileId,
} from '../src/core/ai/MovementProfileAiMemory';
import { restoreMoveOrder, serializeMoveOrder } from '../src/core/ai/runtime/AiRuntimeSnapshot';
import {
  BUILTIN_MOVEMENT_PROFILE_IDS,
  DEFAULT_MOVEMENT_PROFILE_ID,
  MOVEMENT_PROFILE_MEMORY_KEYS,
  resolveMovementProfile,
} from '../src/core/movement/MovementProfileContract';
import { createMoveOrder } from '../src/core/orders/MoveOrder';
import { createPlayerMoveCommand } from '../src/core/orders/PlayerCommand';
import {
  createTacticalOrderIntent,
  normalizeTacticalOrderIntent,
  withTacticalOrderMovementProfile,
} from '../src/core/orders/TacticalOrderIntent';
import { normalizeUnits } from '../src/core/units/UnitModel';

verifyCanonicalIdsAndPresets();
verifyRegistryFallbackAndCustomIds();
verifyIntentOnlyOverrideMemory();
verifyRuntimeSafetyPriority();
verifyCurrentActiveSnapshotWithoutOwnership();
verifyRegistryBackedNodeContracts();
verifySplitRevisionsAndLegacyMigration();

console.log('Movement intent and AI integration smoke passed: canonical registry ids, intent-only overrides, safety resolver priority, current-active snapshot ownership and split revisions.');

function verifyCanonicalIdsAndPresets(): void {
  assert.deepEqual(BUILTIN_MOVEMENT_PROFILE_IDS, [
    'normal_walk',
    'stealth_move',
    'crouched_move',
    'run',
    'sprint',
    'crawl',
  ]);
  assert.equal(DEFAULT_MOVEMENT_PROFILE_ID, 'normal_walk');
  assert.equal(createTacticalOrderIntent('move').movementProfileId, 'normal_walk');
  assert.equal(createTacticalOrderIntent('recon').movementProfileId, 'stealth_move');
  assert.equal(createTacticalOrderIntent('assault').movementProfileId, 'run');

  const migrated = normalizeTacticalOrderIntent({
    formatVersion: 1,
    presetId: 'recon',
    navigationProfileId: 'cautious',
  });
  assert.equal(migrated.movementProfileId, 'stealth_move');
  assert.equal(Object.isFrozen(migrated), true);

  const custom = withTacticalOrderMovementProfile(createTacticalOrderIntent('move'), 'custom_low_silhouette');
  assert.equal(custom.movementProfileId, 'custom_low_silhouette');
  assert.equal(Object.isFrozen(custom), true);

  assert.equal(legacyMovementModeToProfileId('fast'), 'run');
  assert.equal(legacyMovementModeToProfileId('careful'), 'stealth_move');
  assert.equal(legacyMovementModeToProfileId('crawl'), 'crawl');
}

function verifyRegistryFallbackAndCustomIds(): void {
  const custom = resolveMovementProfile({ playerOrderProfileId: 'downloaded_custom_profile' });
  assert.equal(custom.profileId, 'downloaded_custom_profile');
  assert.equal(custom.forcedFallback, false);

  const missing = resolveMovementProfile({
    playerOrderProfileId: 'missing_profile',
    knownProfileIds: [...BUILTIN_MOVEMENT_PROFILE_IDS],
  });
  assert.equal(missing.profileId, 'normal_walk');
  assert.equal(missing.source, 'player_order');
  assert.equal(missing.forcedFallback, true);
}

function verifyIntentOnlyOverrideMemory(): void {
  const setUpdates = Object.fromEntries(buildSetAiMovementProfileUpdates({
    profileId: 'sprint',
    ownerToken: 'dash-owner',
    reason: 'Short dash.',
  }).map((entry) => [entry.key, entry.value]));
  assert.deepEqual(Object.keys(setUpdates).sort(), [
    MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideOwnerToken,
    MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideProfileId,
    MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideReason,
  ].sort());
  assert.equal(setUpdates[MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideProfileId], 'sprint');
  assert.equal(setUpdates[MOVEMENT_PROFILE_MEMORY_KEYS.activeProfileId], undefined);
  assert.equal(setUpdates[MOVEMENT_PROFILE_MEMORY_KEYS.forcedFallback], undefined);

  const stale = buildClearAiMovementProfileUpdates({
    expectedOwnerToken: 'old-owner',
    activeOwnerToken: 'new-owner',
  });
  assert.equal(stale.cleared, false);
  assert.equal(stale.updates.length, 0);

  const cleared = buildClearAiMovementProfileUpdates({
    expectedOwnerToken: 'new-owner',
    activeOwnerToken: 'new-owner',
  });
  assert.equal(cleared.cleared, true);
  assert.deepEqual(
    cleared.updates.map((entry) => entry.key).sort(),
    [
      MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideOwnerToken,
      MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideProfileId,
      MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideReason,
    ].sort(),
  );
}

function verifyRuntimeSafetyPriority(): void {
  const [unit] = normalizeUnits([{
    id: 'movement-resolver-unit',
    type: 'infantry_squad',
    side: 'blue',
    x: 1,
    y: 1,
    movementProfileId: 'crouched_move',
  }]);
  const command = createPlayerMoveCommand(
    unit.id,
    { x: 5.5, y: 5.5 },
    null,
    1000,
    createTacticalOrderIntent('recon'),
  );
  unit.playerCommand = command;
  unit.order = createMoveOrder(command.target, {
    source: 'player',
    playerCommandId: command.id,
    movementProfileId: command.intent.movementProfileId,
    movementProfileSource: 'player_order',
    movementProfileOwnerToken: command.id,
    movementProfileSelectionRevision: command.revision,
  });
  const runtime = unit.behaviorRuntime as typeof unit.behaviorRuntime & {
    aiGraphMemory?: Record<string, string | number | boolean | null | { x: number; y: number }>;
  };
  const memory = runtime.aiGraphMemory ?? {};
  runtime.aiGraphMemory = memory;

  const graphResult = runAiGraph({
    graph: graphWithAction('SetMovementProfile', {
      profileId: 'sprint',
      ownerToken: 'dash-owner',
      reasonRu: 'Короткий рывок.',
    }),
    unitId: unit.id,
    blackboard: memory,
    nowMs: 1100,
  });
  assert.equal(graphResult.ok, true);
  Object.assign(memory, graphResult.blackboard);
  assert.equal(memory[MOVEMENT_PROFILE_MEMORY_KEYS.activeProfileId], undefined);

  memory[MOVEMENT_PROFILE_MEMORY_KEYS.hardSafetyProfileId] = 'crawl';
  memory[MOVEMENT_PROFILE_MEMORY_KEYS.hardSafetyReason] = 'injury';
  const reconciled = reconcileMovementProfileRuntime(unit, BUILTIN_MOVEMENT_PROFILE_IDS.map((id) => ({ id, revision: 3 })));
  assert.equal(reconciled.resolved.profileId, 'crawl');
  assert.equal(reconciled.resolved.source, 'hard_safety');
  assert.equal(memory[MOVEMENT_PROFILE_MEMORY_KEYS.activeProfileId], 'crawl');
  assert.equal(memory[MOVEMENT_PROFILE_MEMORY_KEYS.activeProfileSource], 'hard_safety');
  assert.equal(memory[MOVEMENT_PROFILE_MEMORY_KEYS.profileDefinitionRevision], 3);
  assert.equal(unit.order.movementProfileId, 'crawl');
  assert.equal(unit.order.movementProfileSource, 'hard_safety');
}

function verifyCurrentActiveSnapshotWithoutOwnership(): void {
  const result = runAiGraphRuntime({
    graph: graphWithAction('MoveToBlackboardPosition', {
      targetKey: 'best_cover_position',
      movementProfileSource: 'current_active',
      movementProfileId: 'normal_walk',
      acceptanceRadiusCells: 0.2,
      timeoutSeconds: 15,
      stuckTimeoutSeconds: 2.5,
      minimumProgressCells: 0.05,
      abortOnTargetLost: true,
    }),
    unitId: 'current-active-unit',
    blackboard: {
      self_position: { x: 1, y: 1 },
      best_cover_position: { x: 5, y: 5 },
      active_movement_profile_id: 'crawl',
      active_movement_profile_source: 'ai_override',
      movement_profile_override_id: 'crawl',
      movement_profile_override_owner_token: 'existing-owner',
    },
    cooldowns: {},
    nowMs: 2000,
  });
  const beginMove = result.effects.find((effect) => effect.type === 'begin_move') as (
    typeof result.effects[number] & {
      movementProfileId?: string;
      movementProfileSource?: string;
      movementProfileOwnerToken?: string;
    }
  ) | undefined;
  assert.ok(beginMove);
  assert.equal(beginMove.movementProfileId, 'crawl');
  assert.equal(beginMove.movementProfileSource, 'ai_override');
  assert.equal(beginMove.movementProfileOwnerToken, undefined, 'current_active must not claim override ownership');
}

function verifyRegistryBackedNodeContracts(): void {
  for (const [type, parameterId] of [
    ['SetMovementProfile', 'profileId'],
    ['MoveToBlackboardPosition', 'movementProfileId'],
  ] as const) {
    const contract = DEFAULT_AI_NODE_CONTRACT_REGISTRY.require(type);
    const parameter = contract.parameters.find((entry) => entry.id === parameterId);
    assert.equal(parameter?.kind, 'string');
    assert.equal(parameter?.selector, 'movement_profile_registry');
    assert.equal(parameter?.options, undefined);
  }
}

function verifySplitRevisionsAndLegacyMigration(): void {
  const order = createMoveOrder({ x: 3, y: 4 }, {
    source: 'ai',
    ownerToken: 'move-owner',
    movementProfileId: 'run',
    movementProfileSource: 'ai_override',
    movementProfileOwnerToken: 'profile-owner',
    movementProfileDefinitionRevision: 7,
    movementProfileSelectionRevision: 11,
  });
  const serialized = serializeMoveOrder(order);
  assert.equal(serialized.movementProfileDefinitionRevision, 7);
  assert.equal(serialized.movementProfileSelectionRevision, 11);
  assert.equal(serialized.movementProfileRevision, undefined);

  const restored = restoreMoveOrder(serialized);
  assert.equal(restored.movementProfileDefinitionRevision, 7);
  assert.equal(restored.movementProfileSelectionRevision, 11);

  const legacy = restoreMoveOrder({
    ...serialized,
    movementProfileSelectionRevision: undefined,
    movementProfileRevision: 5,
  });
  assert.equal(legacy.movementProfileSelectionRevision, 5);
}

function graphWithAction(type: string, parameters: Record<string, unknown>): AiGraph {
  return {
    version: 2,
    id: `movement-profile-${type}`,
    name: type,
    nameRu: type,
    description: type,
    descriptionRu: type,
    rootNodeId: 'root',
    blackboardDefaults: {},
    blackboardSchema: [],
    subgraphRefs: [],
    nodes: [
      { id: 'root', type: 'Root', children: ['action'] },
      { id: 'action', type, parameters },
    ],
  };
}
