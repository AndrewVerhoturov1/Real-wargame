import assert from 'node:assert/strict';
import { SOLDIER_BLACKBOARD_SCHEMA, type AiBlackboardValue } from '../src/core/ai/AiBlackboard';
import type { AiGraph } from '../src/core/ai/AiGraph';
import { runAiGraph } from '../src/core/ai/AiGraphRunner';
import { syncMoveOrderMemoryForUnit } from '../src/core/ai/AiStatefulMoveGameBridge';
import { DEFAULT_AI_NODE_CONTRACT_REGISTRY } from '../src/core/ai/contracts/AiNodeContractRegistry';
import {
  buildClearAiMovementProfileUpdates,
  buildSetAiMovementProfileUpdates,
} from '../src/core/ai/MovementProfileAiMemory';
import { restoreMoveOrder, serializeMoveOrder } from '../src/core/ai/runtime/AiRuntimeSnapshot';
import { isMoveToBlackboardPositionActionState } from '../src/core/ai/runtime/actions/MoveToBlackboardPositionAction';
import {
  DEFAULT_MOVEMENT_PROFILE_ID,
  MOVEMENT_PROFILE_MEMORY_KEYS,
  resolveMovementProfile,
  resolveMovementProfileSelection,
} from '../src/core/movement/MovementProfileContract';
import { createMoveOrder } from '../src/core/orders/MoveOrder';
import {
  createPlayerMoveCommand,
  normalizePlayerCommand,
  updatePlayerCommandStatus,
} from '../src/core/orders/PlayerCommand';
import {
  createTacticalOrderIntent,
  normalizeTacticalOrderIntent,
  withTacticalOrderMovementProfile,
} from '../src/core/orders/TacticalOrderIntent';
import { normalizeUnits } from '../src/core/units/UnitModel';

verifyTacticalIntentV2();
verifyPlayerCommandAndMoveOrderSnapshots();
verifyProfileSourcePriorityAndFallback();
verifyAiOverrideOwnership();
verifyTypedAiNodes();
verifyLiveOrderPriority();
verifyStatefulMoveMigration();
verifyNodeEditorContracts();
verifyBlackboardDictionary();

console.log(
  'Movement intent and AI integration smoke passed: intent v2, order snapshots, live source priority, owned overrides, legacy migration, node-editor dropdowns and Blackboard dictionary.',
);

function verifyTacticalIntentV2(): void {
  const expected = {
    move: ['normal', 'normal'],
    recon: ['cautious', 'stealth'],
    assault: ['attack', 'fast'],
  } as const;

  for (const [presetId, [navigationProfileId, movementProfileId]] of Object.entries(expected)) {
    const intent = createTacticalOrderIntent(presetId as keyof typeof expected);
    assert.equal(intent.formatVersion, 2);
    assert.equal(intent.navigationProfileId, navigationProfileId);
    assert.equal(intent.movementProfileId, movementProfileId);
    assert.equal(Object.isFrozen(intent), true);
  }

  const migratedRecon = normalizeTacticalOrderIntent({
    formatVersion: 1,
    presetId: 'recon',
    navigationProfileId: 'cautious',
  });
  assert.equal(migratedRecon.formatVersion, 2);
  assert.equal(migratedRecon.movementProfileId, 'stealth');
  assert.equal(Object.isFrozen(migratedRecon), true);

  const custom = withTacticalOrderMovementProfile(
    createTacticalOrderIntent('move'),
    'custom_low_silhouette',
  );
  assert.equal(custom.movementProfileId, 'custom_low_silhouette');
  assert.equal(Object.isFrozen(custom), true);
}

function verifyPlayerCommandAndMoveOrderSnapshots(): void {
  const intent = withTacticalOrderMovementProfile(
    createTacticalOrderIntent('recon'),
    'custom_recon_walk',
  );
  const command = createPlayerMoveCommand(
    'unit-a',
    { x: 6.5, y: 4.5 },
    null,
    1000,
    intent,
  );
  assert.equal(command.movementProfileId, 'custom_recon_walk');
  assert.equal(command.intent.movementProfileId, 'custom_recon_walk');

  const blocked = updatePlayerCommandStatus(command, 'blocked', 'blocked', 'заблокирован');
  assert.equal(blocked.movementProfileId, 'custom_recon_walk');
  assert.equal(blocked.intent.movementProfileId, 'custom_recon_walk');

  const normalizedLegacy = normalizePlayerCommand({
    ...command,
    intent: {
      formatVersion: 1,
      presetId: 'assault',
      navigationProfileId: 'attack',
      attentionPolicy: 'engage',
      contactPolicy: 'press_attack',
      firePolicy: 'fire_at_will',
      resumeAfterTemporaryInterruption: true,
    },
    movementProfileId: undefined,
  }, 'unit-a');
  assert.equal(normalizedLegacy?.movementProfileId, 'fast');
  assert.equal(normalizedLegacy?.intent.movementProfileId, 'fast');

  const order = createMoveOrder({ x: 6.5, y: 4.5 }, {
    source: 'player',
    ownerToken: command.id,
    playerCommandId: command.id,
    movementProfileId: command.intent.movementProfileId,
    movementProfileSource: 'player_order',
    movementProfileOwnerToken: command.id,
    movementProfileRevision: command.revision,
  });
  const restored = restoreMoveOrder(serializeMoveOrder(order));
  assert.equal(restored.movementProfileId, 'custom_recon_walk');
  assert.equal(restored.movementProfileSource, 'player_order');
  assert.equal(restored.movementProfileOwnerToken, command.id);
  assert.equal(restored.movementProfileRevision, command.revision);
}

function verifyProfileSourcePriorityAndFallback(): void {
  assert.deepEqual(resolveMovementProfile({}), {
    profileId: DEFAULT_MOVEMENT_PROFILE_ID,
    source: 'default',
    ownerToken: undefined,
    forcedFallback: false,
    forcedReason: undefined,
  });

  const role = resolveMovementProfile({ unitRoleProfileId: 'role_profile' });
  assert.equal(role.profileId, 'role_profile');
  assert.equal(role.source, 'unit_role');

  const player = resolveMovementProfile({
    unitRoleProfileId: 'role_profile',
    playerOrderProfileId: 'player_profile',
  });
  assert.equal(player.profileId, 'player_profile');
  assert.equal(player.source, 'player_order');

  const ai = resolveMovementProfile({
    unitRoleProfileId: 'role_profile',
    playerOrderProfileId: 'player_profile',
    aiOverrideProfileId: 'ai_profile',
    aiOverrideOwnerToken: 'ai-owner',
  });
  assert.equal(ai.profileId, 'ai_profile');
  assert.equal(ai.source, 'ai_override');
  assert.equal(ai.ownerToken, 'ai-owner');

  const safety = resolveMovementProfile({
    unitRoleProfileId: 'role_profile',
    playerOrderProfileId: 'player_profile',
    aiOverrideProfileId: 'ai_profile',
    hardSafetyProfileId: 'safe_profile',
    hardSafetyReason: 'injury',
  });
  assert.equal(safety.profileId, 'safe_profile');
  assert.equal(safety.source, 'hard_safety');
  assert.equal(safety.forcedReason, 'injury');

  const custom = resolveMovementProfile({ playerOrderProfileId: 'downloaded_custom_profile' });
  assert.equal(custom.profileId, 'downloaded_custom_profile');
  assert.equal(custom.forcedFallback, false);

  const missing = resolveMovementProfile({
    playerOrderProfileId: 'missing_custom_profile',
    knownProfileIds: ['normal', 'stealth', 'fast'],
  });
  assert.equal(missing.profileId, 'normal');
  assert.equal(missing.source, 'player_order');
  assert.equal(missing.forcedFallback, true);
  assert.match(missing.forcedReason ?? '', /missing_custom_profile/);

  assert.deepEqual(resolveMovementProfileSelection({
    mode: 'from_order',
    requestedProfileId: 'stealth',
  }), {
    mode: 'from_order',
    profileId: 'stealth',
    source: 'player_order',
  });
  assert.deepEqual(resolveMovementProfileSelection({
    mode: 'specific',
    specificProfileId: 'fast',
  }), {
    mode: 'specific',
    profileId: 'fast',
    source: 'ai_override',
  });
}

function verifyAiOverrideOwnership(): void {
  const setUpdates = Object.fromEntries(
    buildSetAiMovementProfileUpdates({
      profileId: 'fast',
      ownerToken: 'action-new',
      reason: 'dash to cover',
    }).map((entry) => [entry.key, entry.value]),
  );
  assert.equal(setUpdates[MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideProfileId], 'fast');
  assert.equal(setUpdates[MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideOwnerToken], 'action-new');
  assert.equal(setUpdates[MOVEMENT_PROFILE_MEMORY_KEYS.activeProfileSource], 'ai_override');

  const staleClear = buildClearAiMovementProfileUpdates({
    expectedOwnerToken: 'action-old',
    activeOwnerToken: 'action-new',
    requestedProfileId: 'stealth',
  });
  assert.equal(staleClear.cleared, false);
  assert.equal(staleClear.updates.length, 0);

  const ownedClear = buildClearAiMovementProfileUpdates({
    expectedOwnerToken: 'action-new',
    activeOwnerToken: 'action-new',
    requestedProfileId: 'stealth',
    fallbackSource: 'player_order',
  });
  assert.equal(ownedClear.cleared, true);
  const clearUpdates = Object.fromEntries(
    ownedClear.updates.map((entry) => [entry.key, entry.value]),
  );
  assert.equal(clearUpdates[MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideProfileId], null);
  assert.equal(clearUpdates[MOVEMENT_PROFILE_MEMORY_KEYS.activeProfileId], 'stealth');
  assert.equal(clearUpdates[MOVEMENT_PROFILE_MEMORY_KEYS.activeProfileSource], 'player_order');
}

function verifyTypedAiNodes(): void {
  const setResult = runAiGraph({
    graph: graphWithAction('SetMovementProfile', {
      profileId: 'fast',
      ownerToken: 'dash-action',
    }),
    unitId: 'unit-a',
    blackboard: {
      player_order_movement_profile: 'stealth',
      requested_movement_profile_id: 'stealth',
      active_movement_profile_id: 'stealth',
      active_movement_profile_source: 'player_order',
    },
    nowMs: 1000,
  });
  assert.equal(setResult.ok, true);
  assert.equal(setResult.blackboard.movement_profile_override_id, 'fast');
  assert.equal(setResult.blackboard.movement_profile_override_owner_token, 'dash-action');
  assert.equal(setResult.blackboard.active_movement_profile_id, 'fast');
  assert.equal(setResult.blackboard.active_movement_profile_source, 'ai_override');

  const clearResult = runAiGraph({
    graph: graphWithAction('ClearMovementProfileOverride', {
      ownerToken: 'dash-action',
    }),
    unitId: 'unit-a',
    blackboard: setResult.blackboard,
    nowMs: 1100,
  });
  assert.equal(clearResult.ok, true);
  assert.equal(clearResult.blackboard.movement_profile_override_id, null);
  assert.equal(clearResult.blackboard.active_movement_profile_id, 'stealth');
  assert.equal(clearResult.blackboard.active_movement_profile_source, 'player_order');

  const legacyResult = runAiGraph({
    graph: graphWithAction('SetMovementMode', { mode: 'crawl' }),
    unitId: 'unit-a',
    blackboard: {},
    nowMs: 1200,
  });
  assert.equal(legacyResult.ok, true);
  assert.equal(legacyResult.blackboard.movement_profile_override_id, 'stealth');
  assert.equal(legacyResult.blackboard.movement_profile_legacy_migrated_from, 'crawl');
  assert.equal(
    legacyResult.effects.some((effect) => effect.type === 'set_movement_mode'),
    false,
    'legacy node must not emit the old decorative currentAction effect',
  );
}

function verifyLiveOrderPriority(): void {
  const [unit] = normalizeUnits([{
    id: 'unit-live-priority',
    type: 'infantry_squad',
    side: 'blue',
    x: 1,
    y: 1,
    movementProfileId: 'role_profile',
  }]);
  const command = createPlayerMoveCommand(
    unit.id,
    { x: 5.5, y: 5.5 },
    null,
    2000,
    createTacticalOrderIntent('recon'),
  );
  unit.playerCommand = command;
  unit.order = createMoveOrder(command.target, {
    source: 'player',
    playerCommandId: command.id,
    movementProfileId: command.intent.movementProfileId,
    movementProfileSource: 'player_order',
    movementProfileOwnerToken: command.id,
    movementProfileRevision: command.revision,
  });

  const runtime = unit.behaviorRuntime as typeof unit.behaviorRuntime & {
    aiGraphMemory?: Record<string, AiBlackboardValue>;
  };
  const memory = runtime.aiGraphMemory ?? {};
  runtime.aiGraphMemory = memory;

  memory[MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideProfileId] = 'fast';
  memory[MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideOwnerToken] = 'dash-action';
  syncMoveOrderMemoryForUnit(unit);
  assert.equal(memory[MOVEMENT_PROFILE_MEMORY_KEYS.activeProfileId], 'fast');
  assert.equal(memory[MOVEMENT_PROFILE_MEMORY_KEYS.activeProfileSource], 'ai_override');
  assert.ok(unit.order);
  assert.equal(unit.order.movementProfileId, 'fast');
  assert.equal(unit.order.movementProfileSource, 'ai_override');
  assert.equal(unit.order.movementProfileOwnerToken, 'dash-action');

  memory[MOVEMENT_PROFILE_MEMORY_KEYS.hardSafetyProfileId] = 'normal';
  memory[MOVEMENT_PROFILE_MEMORY_KEYS.hardSafetyReason] = 'exhausted';
  syncMoveOrderMemoryForUnit(unit);
  assert.equal(memory[MOVEMENT_PROFILE_MEMORY_KEYS.activeProfileId], 'normal');
  assert.equal(memory[MOVEMENT_PROFILE_MEMORY_KEYS.activeProfileSource], 'hard_safety');
  assert.equal(unit.order.movementProfileId, 'normal');
  assert.equal(unit.order.movementProfileSource, 'hard_safety');

  memory[MOVEMENT_PROFILE_MEMORY_KEYS.hardSafetyProfileId] = null;
  memory[MOVEMENT_PROFILE_MEMORY_KEYS.hardSafetyReason] = null;
  memory[MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideProfileId] = null;
  memory[MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideOwnerToken] = null;
  syncMoveOrderMemoryForUnit(unit);
  assert.equal(memory[MOVEMENT_PROFILE_MEMORY_KEYS.activeProfileId], 'stealth');
  assert.equal(memory[MOVEMENT_PROFILE_MEMORY_KEYS.activeProfileSource], 'player_order');
  assert.equal(unit.order.movementProfileId, 'stealth');
  assert.equal(unit.order.movementProfileSource, 'player_order');
  assert.equal(unit.order.movementProfileOwnerToken, command.id);
}

function verifyStatefulMoveMigration(): void {
  const legacyState = {
    kind: 'move_to_blackboard_position',
    targetKey: 'best_cover_position',
    target: { x: 3.5, y: 4.5 },
    acceptanceRadiusCells: 0.2,
    timeoutMs: 15000,
    actionToken: 'unit-a:move:1000',
  };
  assert.equal(isMoveToBlackboardPositionActionState(legacyState), true);
  assert.equal(isMoveToBlackboardPositionActionState({
    ...legacyState,
    movementProfileSelection: 'specific',
    movementProfileId: 'fast',
    movementProfileSource: 'ai_override',
  }), true);
}

function verifyNodeEditorContracts(): void {
  const moveContract = DEFAULT_AI_NODE_CONTRACT_REGISTRY.require('MoveToBlackboardPosition');
  const sourceParameter = moveContract.parameters.find(
    (entry) => entry.id === 'movementProfileSource',
  );
  assert.equal(sourceParameter?.kind, 'enum');
  assert.deepEqual(
    sourceParameter?.options?.map((entry) => entry.value),
    ['from_order', 'current_active', 'automatic', 'specific'],
  );
  assert.deepEqual(
    sourceParameter?.options?.map((entry) => entry.labelRu),
    ['Из приказа', 'Текущий активный', 'Автоматически', 'Конкретный профиль'],
  );

  const profileParameter = moveContract.parameters.find(
    (entry) => entry.id === 'movementProfileId',
  );
  assert.equal(profileParameter?.kind, 'enum');
  assert.deepEqual(
    profileParameter?.options?.map((entry) => entry.value),
    ['normal', 'stealth', 'fast'],
  );
  assert.deepEqual(
    profileParameter?.options?.map((entry) => entry.labelRu),
    ['Обычное движение', 'Скрытное движение', 'Быстрое движение'],
  );

  const setContract = DEFAULT_AI_NODE_CONTRACT_REGISTRY.require('SetMovementProfile');
  assert.equal(setContract.labelRu, 'Установить профиль движения');
  assert.equal(
    setContract.parameters.find((entry) => entry.id === 'ownerToken')?.kind,
    'string',
  );
  assert.equal(
    setContract.parameters.find((entry) => entry.id === 'reasonRu')?.defaultValue,
    'Временный профиль выбран AI-графом.',
  );

  const clearContract = DEFAULT_AI_NODE_CONTRACT_REGISTRY.require(
    'ClearMovementProfileOverride',
  );
  assert.equal(clearContract.labelRu, 'Вернуть профиль движения');
  assert.equal(
    clearContract.parameters.find((entry) => entry.id === 'ownerToken')?.kind,
    'string',
  );
}

function verifyBlackboardDictionary(): void {
  const schema = new Map(SOLDIER_BLACKBOARD_SCHEMA.map((entry) => [entry.key, entry]));
  for (const key of [
    'requested_movement_profile_id',
    'active_movement_profile_id',
    'active_movement_profile_source',
    'active_movement_gait',
    'movement_speed',
    'movement_stamina',
    'movement_noise',
    'movement_visual_signature',
    'movement_can_fire',
    'movement_forced_fallback',
    'movement_forced_reason',
  ]) {
    const entry = schema.get(key);
    assert.ok(entry, `Missing Blackboard schema entry: ${key}`);
    assert.ok(entry.labelRu, `Missing Russian Blackboard label: ${key}`);
    assert.ok(entry.descriptionRu, `Missing Russian Blackboard description: ${key}`);
  }
}

function graphWithAction(type: string, parameters: Record<string, string>): AiGraph {
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
