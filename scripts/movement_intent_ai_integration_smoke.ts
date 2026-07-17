import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { AiBlackboardValue } from '../src/core/ai/AiBlackboard';
import type { AiGraph } from '../src/core/ai/AiGraph';
import { runAiGraph } from '../src/core/ai/AiGraphRunner';
import { runAiGraphRuntime } from '../src/core/ai/AiGraphRuntime';
import { syncMoveOrderMemoryForUnit } from '../src/core/ai/AiStatefulMoveGameBridge';
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
  resolveMovementProfileAuthority,
} from '../src/core/movement/MovementProfiles';
import { createMoveOrder } from '../src/core/orders/MoveOrder';
import { createPlayerMoveCommand } from '../src/core/orders/PlayerCommand';
import {
  createTacticalOrderIntent,
  normalizeTacticalOrderIntent,
  withTacticalOrderMovementProfile,
} from '../src/core/orders/TacticalOrderIntent';
import { normalizeUnits, type UnitModel } from '../src/core/units/UnitModel';
import {
  BUILTIN_MOVEMENT_PROFILE_SELECTOR_PROVIDER,
  listMovementProfileSelectorEntries,
  setMovementProfileSelectorProvider,
} from '../src/ai-node-editor/MovementProfileSelectorProvider';

const REGISTRY = BUILTIN_MOVEMENT_PROFILE_IDS.map((id, index) => ({ id, revision: index + 10 }));

verifyCanonicalIds();
verifyIntentOnlyMemory();
verifySingleFinalizer();
verifyFromOrderBehavior();
verifyHardSafetyDiagnostics();
verifyCurrentActiveSnapshot();
verifyNodeSelectors();
verifySelectorProvider();
verifySplitRevisions();

console.log('Movement intent and AI integration smoke passed.');

function verifyCanonicalIds(): void {
  assert.deepEqual(BUILTIN_MOVEMENT_PROFILE_IDS, [
    'normal_walk', 'stealth_move', 'crouched_move', 'run', 'sprint', 'crawl',
  ]);
  assert.equal(DEFAULT_MOVEMENT_PROFILE_ID, 'normal_walk');
  assert.equal(createTacticalOrderIntent('move').movementProfileId, 'normal_walk');
  assert.equal(createTacticalOrderIntent('recon').movementProfileId, 'stealth_move');
  assert.equal(createTacticalOrderIntent('assault').movementProfileId, 'run');
  assert.equal(normalizeTacticalOrderIntent({
    formatVersion: 1,
    presetId: 'recon',
    navigationProfileId: 'cautious',
  }).movementProfileId, 'stealth_move');
  assert.equal(
    withTacticalOrderMovementProfile(createTacticalOrderIntent('move'), 'custom_low_silhouette').movementProfileId,
    'custom_low_silhouette',
  );
  assert.equal(legacyMovementModeToProfileId('fast'), 'run');
  assert.equal(legacyMovementModeToProfileId('careful'), 'stealth_move');
  assert.equal(legacyMovementModeToProfileId('crawl'), 'crawl');
}

function verifyIntentOnlyMemory(): void {
  const set = Object.fromEntries(buildSetAiMovementProfileUpdates({
    profileId: 'sprint', ownerToken: 'dash-owner', reason: 'Short dash.',
  }).map((entry) => [entry.key, entry.value]));
  assert.deepEqual(Object.keys(set).sort(), [
    MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideProfileId,
    MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideOwnerToken,
    MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideReason,
  ].sort());
  assert.equal(set[MOVEMENT_PROFILE_MEMORY_KEYS.activeProfileId], undefined);
  assert.equal(set[MOVEMENT_PROFILE_MEMORY_KEYS.forcedFallback], undefined);

  assert.equal(buildClearAiMovementProfileUpdates({
    expectedOwnerToken: 'old', activeOwnerToken: 'new',
  }).cleared, false);
  const cleared = buildClearAiMovementProfileUpdates({
    expectedOwnerToken: 'new', activeOwnerToken: 'new',
  });
  assert.equal(cleared.cleared, true);
  assert.deepEqual(cleared.updates.map((entry) => entry.key).sort(), [
    MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideProfileId,
    MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideOwnerToken,
    MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideReason,
  ].sort());
}

function verifySingleFinalizer(): void {
  const unit = createUnit('single-finalizer-unit');
  const command = createPlayerMoveCommand(
    unit.id,
    { x: 5.5, y: 5.5 },
    null,
    1000,
    withTacticalOrderMovementProfile(createTacticalOrderIntent('move'), 'missing_profile'),
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

  const memory = movementMemory(unit);
  const resolution = reconcileMovementProfileRuntime(unit, REGISTRY);
  assert.equal(resolution.resolved.requestedProfileId, 'missing_profile');
  assert.equal(resolution.resolved.profileId, 'normal_walk');
  assert.equal(resolution.resolved.source, 'player_order');
  assert.equal(resolution.resolved.forcedFallback, true);
  assert.match(resolution.resolved.forcedReason ?? '', /missing_profile/);

  const beforeSync = movementSnapshot(unit, memory);
  syncMoveOrderMemoryForUnit(unit);
  assert.deepEqual(movementSnapshot(unit, memory), beforeSync);

  const effect = runMoveAction('single-finalizer-current', 'current_active', {
    ...memory,
    self_position: { x: 1, y: 1 },
    best_cover_position: { x: 5, y: 5 },
  });
  assert.equal(effect.movementProfileId, 'normal_walk');
  assert.equal(effect.movementProfileSource, 'player_order');
  assert.equal(effect.movementProfileOwnerToken, undefined);

  const bridgeSource = fs.readFileSync(
    path.join(process.cwd(), 'src/core/ai/AiStatefulMoveGameBridge.ts'),
    'utf8',
  );
  assert.equal(bridgeSource.includes('function publishMovementProfileMemory'), false);
  assert.equal(bridgeSource.includes('function syncMoveOrderMovementProfileSnapshot'), false);
  assert.equal(bridgeSource.includes('resolveMovementProfile('), false);
  assert.equal(bridgeSource.includes('movementProfileRevision:'), false);
}

function verifyFromOrderBehavior(): void {
  const withOrder = runMoveAction('from-order-present', 'from_order', {
    self_position: { x: 1, y: 1 },
    best_cover_position: { x: 5, y: 5 },
    player_command_active: true,
    player_order_movement_profile: 'stealth_move',
    requested_movement_profile_id: 'run',
  });
  assert.equal(withOrder.movementProfileId, 'stealth_move');
  assert.equal(withOrder.movementProfileSource, 'player_order');
  assert.equal(withOrder.movementProfileOwnerToken, undefined);

  const withoutOrderRole = runMoveAction('from-order-role', 'from_order', {
    self_position: { x: 1, y: 1 },
    best_cover_position: { x: 5, y: 5 },
    player_command_active: false,
    requested_movement_profile_id: 'run',
  });
  assert.equal(withoutOrderRole.movementProfileId, undefined);
  assert.equal(withoutOrderRole.movementProfileSource, undefined);
  assert.equal(withoutOrderRole.movementProfileOwnerToken, undefined);
  const roleUnit = createUnit('role-fallback-unit', 'crouched_move');
  const roleResolution = reconcileMovementProfileRuntime(roleUnit, REGISTRY);
  assert.equal(roleResolution.resolved.profileId, 'crouched_move');
  assert.equal(roleResolution.resolved.source, 'unit_role');

  const withoutOrderDefault = runMoveAction('from-order-default', 'from_order', {
    self_position: { x: 1, y: 1 },
    best_cover_position: { x: 5, y: 5 },
    player_command_active: false,
  });
  assert.equal(withoutOrderDefault.movementProfileId, undefined);
  assert.equal(withoutOrderDefault.movementProfileSource, undefined);
  const defaultResolution = reconcileMovementProfileRuntime(createUnit('default-fallback-unit'), REGISTRY);
  assert.equal(defaultResolution.resolved.profileId, 'normal_walk');
  assert.equal(defaultResolution.resolved.source, 'default');

  const custom = runMoveAction('from-order-custom', 'from_order', {
    self_position: { x: 1, y: 1 },
    best_cover_position: { x: 5, y: 5 },
    player_command_active: true,
    player_order_movement_profile: 'custom_order_profile',
  });
  assert.equal(custom.movementProfileId, 'custom_order_profile');
  assert.equal(custom.movementProfileSource, 'player_order');
}

function verifyHardSafetyDiagnostics(): void {
  const orderSafety = createPlayerUnit('order-safety', 'stealth_move');
  const orderSafetyMemory = movementMemory(orderSafety);
  orderSafetyMemory[MOVEMENT_PROFILE_MEMORY_KEYS.hardSafetyProfileId] = 'crawl';
  orderSafetyMemory[MOVEMENT_PROFILE_MEMORY_KEYS.hardSafetyReason] = 'Leg injury requires crawling.';
  const orderSafetyResolution = reconcileMovementProfileRuntime(orderSafety, REGISTRY);
  assert.equal(orderSafetyResolution.resolved.requestedProfileId, 'stealth_move');
  assert.equal(orderSafetyResolution.resolved.profileId, 'crawl');
  assert.equal(orderSafetyResolution.resolved.source, 'hard_safety');
  assert.equal(orderSafetyResolution.resolved.forcedFallback, true);
  assert.equal(orderSafetyResolution.resolved.forcedReason, 'Leg injury requires crawling.');

  const overrideSafety = createPlayerUnit('override-safety', 'normal_walk');
  const overrideSafetyMemory = movementMemory(overrideSafety);
  overrideSafetyMemory[MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideProfileId] = 'sprint';
  overrideSafetyMemory[MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideOwnerToken] = 'dash-owner';
  overrideSafetyMemory[MOVEMENT_PROFILE_MEMORY_KEYS.hardSafetyProfileId] = 'crawl';
  overrideSafetyMemory[MOVEMENT_PROFILE_MEMORY_KEYS.hardSafetyReason] = 'Suppression forces crawl.';
  const overrideSafetyResolution = reconcileMovementProfileRuntime(overrideSafety, REGISTRY);
  assert.equal(overrideSafetyResolution.resolved.requestedProfileId, 'normal_walk');
  assert.equal(overrideSafetyResolution.resolved.profileId, 'crawl');
  assert.equal(overrideSafetyResolution.resolved.source, 'hard_safety');
  assert.equal(overrideSafetyResolution.resolved.forcedFallback, true);
  assert.equal(overrideSafetyResolution.resolved.forcedReason, 'Suppression forces crawl.');

  const orderOverride = createPlayerUnit('order-override', 'stealth_move');
  const orderOverrideMemory = movementMemory(orderOverride);
  orderOverrideMemory[MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideProfileId] = 'sprint';
  orderOverrideMemory[MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideOwnerToken] = 'dash-owner';
  orderOverrideMemory[MOVEMENT_PROFILE_MEMORY_KEYS.aiOverrideReason] = 'AI dash.';
  const orderOverrideResolution = reconcileMovementProfileRuntime(orderOverride, REGISTRY);
  assert.equal(orderOverrideResolution.resolved.requestedProfileId, 'stealth_move');
  assert.equal(orderOverrideResolution.resolved.profileId, 'sprint');
  assert.equal(orderOverrideResolution.resolved.source, 'ai_override');
  assert.equal(orderOverrideResolution.resolved.ownerToken, 'dash-owner');
  assert.equal(orderOverrideResolution.resolved.forcedFallback, false);
  assert.equal(orderOverrideResolution.resolved.forcedReason, undefined);

  const missingOrder = createPlayerUnit('missing-order', 'missing_player_profile');
  const missingResolution = reconcileMovementProfileRuntime(missingOrder, REGISTRY);
  assert.equal(missingResolution.resolved.requestedProfileId, 'missing_player_profile');
  assert.equal(missingResolution.resolved.profileId, 'normal_walk');
  assert.equal(missingResolution.resolved.source, 'player_order');
  assert.equal(missingResolution.resolved.forcedFallback, true);
  assert.match(missingResolution.resolved.forcedReason ?? '', /missing_player_profile/);

  const directOverride = resolveMovementProfileAuthority({
    playerOrderProfileId: 'normal_walk',
    aiOverrideProfileId: 'run',
    knownProfileIds: [...BUILTIN_MOVEMENT_PROFILE_IDS],
  });
  assert.equal(directOverride.forcedFallback, false);
}

function verifyCurrentActiveSnapshot(): void {
  const effect = runMoveAction('current-active-unit', 'current_active', {
    self_position: { x: 1, y: 1 },
    best_cover_position: { x: 5, y: 5 },
    active_movement_profile_id: 'crawl',
    active_movement_profile_source: 'ai_override',
    movement_profile_override_id: 'crawl',
    movement_profile_override_owner_token: 'existing-owner',
  });
  assert.equal(effect.movementProfileId, 'crawl');
  assert.equal(effect.movementProfileSource, 'ai_override');
  assert.equal(effect.movementProfileOwnerToken, undefined);
}

function verifyNodeSelectors(): void {
  for (const [type, id] of [
    ['SetMovementProfile', 'profileId'],
    ['MoveToBlackboardPosition', 'movementProfileId'],
  ] as const) {
    const parameter = DEFAULT_AI_NODE_CONTRACT_REGISTRY
      .require(type)
      .parameters.find((entry) => entry.id === id);
    assert.equal(parameter?.kind, 'string');
    assert.equal(parameter?.selector, 'movement_profile_registry');
    assert.equal(parameter?.options, undefined);
  }
}

function verifySelectorProvider(): void {
  setMovementProfileSelectorProvider(BUILTIN_MOVEMENT_PROFILE_SELECTOR_PROVIDER);
  assert.deepEqual(
    listMovementProfileSelectorEntries().map((entry) => entry.id),
    [...BUILTIN_MOVEMENT_PROFILE_IDS],
  );
  setMovementProfileSelectorProvider({
    listProfiles: () => [{ id: 'custom_selector_profile', nameRu: 'Пользовательский', revision: 7 }],
  });
  assert.deepEqual(listMovementProfileSelectorEntries(), [{
    id: 'custom_selector_profile', nameRu: 'Пользовательский', revision: 7,
  }]);
  setMovementProfileSelectorProvider(null);
}

function verifySplitRevisions(): void {
  const serialized = serializeMoveOrder(createMoveOrder({ x: 3, y: 4 }, {
    source: 'ai',
    ownerToken: 'move-owner',
    movementProfileId: 'run',
    movementProfileSource: 'ai_override',
    movementProfileOwnerToken: 'profile-owner',
    movementProfileDefinitionRevision: 7,
    movementProfileSelectionRevision: 11,
  }));
  assert.equal(serialized.movementProfileDefinitionRevision, 7);
  assert.equal(serialized.movementProfileSelectionRevision, 11);
  assert.equal(serialized.movementProfileRevision, undefined);
  assert.equal(restoreMoveOrder(serialized).movementProfileSelectionRevision, 11);
  assert.equal(restoreMoveOrder({
    ...serialized,
    movementProfileSelectionRevision: undefined,
    movementProfileRevision: 5,
  }).movementProfileSelectionRevision, 5);
}

function runMoveAction(
  unitId: string,
  movementProfileSource: 'from_order' | 'current_active' | 'automatic' | 'specific',
  blackboard: Record<string, AiBlackboardValue>,
): {
  readonly movementProfileId?: string;
  readonly movementProfileSource?: string;
  readonly movementProfileOwnerToken?: string;
} {
  const result = runAiGraphRuntime({
    graph: graphWithAction('MoveToBlackboardPosition', {
      targetKey: 'best_cover_position',
      movementProfileSource,
      movementProfileId: 'normal_walk',
      acceptanceRadiusCells: 0.2,
      timeoutSeconds: 15,
      stuckTimeoutSeconds: 2.5,
      minimumProgressCells: 0.05,
      abortOnTargetLost: true,
    }),
    unitId,
    blackboard,
    cooldowns: {},
    nowMs: 2000,
  });
  const effect = result.effects.find((candidate) => candidate.type === 'begin_move') as (
    typeof result.effects[number] & {
      movementProfileId?: string;
      movementProfileSource?: string;
      movementProfileOwnerToken?: string;
    }
  ) | undefined;
  assert.ok(effect);
  return effect;
}

function createUnit(id: string, movementProfileId?: string): UnitModel {
  const [unit] = normalizeUnits([{
    id,
    type: 'infantry_squad',
    side: 'blue',
    x: 1,
    y: 1,
    movementProfileId,
  }]);
  return unit;
}

function createPlayerUnit(id: string, movementProfileId: string): UnitModel {
  const unit = createUnit(id);
  const command = createPlayerMoveCommand(
    unit.id,
    { x: 5.5, y: 5.5 },
    null,
    1000,
    withTacticalOrderMovementProfile(createTacticalOrderIntent('move'), movementProfileId),
  );
  unit.playerCommand = command;
  unit.order = createMoveOrder(command.target, {
    source: 'player',
    playerCommandId: command.id,
    movementProfileId,
    movementProfileSource: 'player_order',
    movementProfileOwnerToken: command.id,
    movementProfileSelectionRevision: command.revision,
  });
  return unit;
}

function movementMemory(unit: UnitModel): Record<string, AiBlackboardValue> {
  const runtime = unit.behaviorRuntime as typeof unit.behaviorRuntime & {
    aiGraphMemory?: Record<string, AiBlackboardValue>;
  };
  const memory = runtime.aiRuntimeSession?.blackboardMemory ?? runtime.aiGraphMemory ?? {};
  if (!runtime.aiRuntimeSession) runtime.aiGraphMemory = memory;
  return memory;
}

function movementSnapshot(unit: UnitModel, memory: Record<string, AiBlackboardValue>): unknown {
  return {
    requested: memory[MOVEMENT_PROFILE_MEMORY_KEYS.requestedProfileId],
    active: memory[MOVEMENT_PROFILE_MEMORY_KEYS.activeProfileId],
    source: memory[MOVEMENT_PROFILE_MEMORY_KEYS.activeProfileSource],
    forced: memory[MOVEMENT_PROFILE_MEMORY_KEYS.forcedFallback],
    reason: memory[MOVEMENT_PROFILE_MEMORY_KEYS.forcedReason],
    definitionRevision: memory[MOVEMENT_PROFILE_MEMORY_KEYS.profileDefinitionRevision],
    selectionRevision: memory[MOVEMENT_PROFILE_MEMORY_KEYS.profileSelectionRevision],
    order: unit.order ? {
      id: unit.order.movementProfileId,
      source: unit.order.movementProfileSource,
      owner: unit.order.movementProfileOwnerToken,
      definitionRevision: unit.order.movementProfileDefinitionRevision,
      selectionRevision: unit.order.movementProfileSelectionRevision,
    } : null,
  };
}

function graphWithAction(type: string, parameters: Record<string, AiBlackboardValue>): AiGraph {
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
