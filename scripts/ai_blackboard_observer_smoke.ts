import assert from 'node:assert/strict';
import {
  createAiBlackboardObserverRegistry,
  evaluateAiBlackboardObservers,
  listObservedBlackboardKeys,
  normalizeAiBlackboardObserverRegistry,
  registerAiBlackboardObserver,
  unregisterAiBlackboardObserverScope,
  type AiBlackboardObserverRegistrySnapshotV1,
} from '../src/core/ai/events/AiBlackboardObserver';
import type { AiGraphRunnerBlackboard } from '../src/core/ai/AiGraphRunner';

verifySpecificKeyAndNoRepeat();
verifyPositionValueEquality();
verifyThresholdCrossingAndHysteresis();
verifyBooleanNullAndMissing();
verifyScopeAndSnapshotRoundTrip();

console.log('AI Blackboard observer smoke passed: subscriptions, quiet equality, positions, thresholds, hysteresis, missing/null, scopes, metrics and snapshots.');

function verifySpecificKeyAndNoRepeat(): void {
  let registry = createAiBlackboardObserverRegistry();
  registry = register(registry, {
    observerId: 'danger-change',
    key: 'danger',
    kind: 'key_changed',
    scopeNodeId: 'branch-cover',
  }, { danger: 20, stress: 10 });
  assert.deepEqual(listObservedBlackboardKeys(registry), ['danger']);

  const unrelated = evaluateAiBlackboardObservers(registry, { danger: 20, stress: 99 }, 100);
  assert.equal(unrelated.events.length, 0);
  assert.equal(unrelated.checks, 1);
  registry = unrelated.registry;

  const changed = evaluateAiBlackboardObservers(registry, { danger: 21, stress: 99 }, 200);
  assert.equal(changed.events.length, 1);
  assert.equal(changed.events[0]?.type, 'blackboard_observer_changed');
  assert.equal((changed.events[0]?.payload as { key?: string }).key, 'danger');
  assert.equal((changed.events[0]?.payload as { labelRu?: string }).labelRu, 'Изменение');
  assert.equal(changed.registry.observerEvents, 1);
  assert.equal(changed.registry.wakeRevision, 1);
  registry = changed.registry;

  const repeated = evaluateAiBlackboardObservers(registry, { danger: 21, stress: 0 }, 300);
  assert.equal(repeated.events.length, 0);
  assert.equal(repeated.registry.observerEvents, 1);
  assert.equal(repeated.registry.observerChecks, 3);
}

function verifyPositionValueEquality(): void {
  let registry = register(createAiBlackboardObserverRegistry(), {
    observerId: 'cover-position',
    key: 'best_cover_position',
    kind: 'position_changed',
  }, { best_cover_position: { x: 3, y: 4 } });

  const sameValue = evaluateAiBlackboardObservers(registry, {
    best_cover_position: { x: 3, y: 4 },
  }, 100);
  assert.equal(sameValue.events.length, 0, 'new object with the same coordinates must stay quiet');
  registry = sameValue.registry;

  const moved = evaluateAiBlackboardObservers(registry, {
    best_cover_position: { x: 3.25, y: 4 },
  }, 200);
  assert.equal(moved.events.length, 1);
  const payload = moved.events[0]?.payload as { current?: { value?: unknown } };
  assert.deepEqual(payload.current?.value, { x: 3.25, y: 4 });
}

function verifyThresholdCrossingAndHysteresis(): void {
  let registry = register(createAiBlackboardObserverRegistry(), {
    observerId: 'danger-threshold',
    key: 'danger',
    kind: 'number_threshold_crossed',
    comparison: 'above',
    threshold: 70,
    hysteresisEnter: 70,
    hysteresisExit: 50,
  }, { danger: 69 });

  const entered = evaluateAiBlackboardObservers(registry, { danger: 71 }, 100);
  assert.equal(entered.events.length, 1);
  assert.equal((entered.events[0]?.payload as { direction?: string }).direction, 'entered');
  assert.equal((entered.events[0]?.payload as { labelRu?: string }).labelRu, 'Порог пересечён');
  registry = entered.registry;

  for (const [timestampMs, danger] of [[200, 70], [300, 69]] as const) {
    const quiet = evaluateAiBlackboardObservers(registry, { danger }, timestampMs);
    assert.equal(quiet.events.length, 0, `hysteresis must stay active at danger=${danger}`);
    registry = quiet.registry;
  }

  const exited = evaluateAiBlackboardObservers(registry, { danger: 49 }, 400);
  assert.equal(exited.events.length, 1);
  assert.equal((exited.events[0]?.payload as { direction?: string }).direction, 'exited');

  let bothDirections = register(createAiBlackboardObserverRegistry(), {
    observerId: 'ammo-threshold',
    key: 'ammo',
    kind: 'number_threshold_crossed',
    comparison: 'below',
    threshold: 3,
  }, { ammo: 4 });
  const below = evaluateAiBlackboardObservers(bothDirections, { ammo: 3 }, 500);
  assert.equal((below.events[0]?.payload as { direction?: string }).direction, 'entered');
  bothDirections = below.registry;
  const aboveAgain = evaluateAiBlackboardObservers(bothDirections, { ammo: 4 }, 600);
  assert.equal((aboveAgain.events[0]?.payload as { direction?: string }).direction, 'exited');
}

function verifyBooleanNullAndMissing(): void {
  let boolRegistry = register(createAiBlackboardObserverRegistry(), {
    observerId: 'command-active',
    key: 'player_command_active',
    kind: 'bool_changed',
  }, { player_command_active: false });
  const boolChanged = evaluateAiBlackboardObservers(boolRegistry, { player_command_active: true }, 100);
  assert.equal(boolChanged.events.length, 1);

  let keyRegistry = register(createAiBlackboardObserverRegistry(), {
    observerId: 'visible-enemy',
    key: 'visible_enemy_id',
    kind: 'key_changed',
  }, {});
  const missingAgain = evaluateAiBlackboardObservers(keyRegistry, {}, 100);
  assert.equal(missingAgain.events.length, 0);
  keyRegistry = missingAgain.registry;

  const explicitNull = evaluateAiBlackboardObservers(keyRegistry, { visible_enemy_id: null }, 200);
  assert.equal(explicitNull.events.length, 1, 'null must be distinct from a missing key');
  keyRegistry = explicitNull.registry;

  const missingAfterNull = evaluateAiBlackboardObservers(keyRegistry, {}, 300);
  assert.equal(missingAfterNull.events.length, 1, 'missing must be distinct from explicit null');
}

function verifyScopeAndSnapshotRoundTrip(): void {
  let registry = createAiBlackboardObserverRegistry();
  registry = register(registry, {
    observerId: 'scope-a-danger',
    key: 'danger',
    kind: 'key_changed',
    scopeNodeId: 'scope-a',
  }, { danger: 10 });
  registry = register(registry, {
    observerId: 'scope-b-stress',
    key: 'stress',
    kind: 'key_changed',
    scopeNodeId: 'scope-b',
  }, { danger: 10, stress: 20 });

  const serialized = JSON.parse(JSON.stringify(registry)) as unknown;
  const restored = normalizeAiBlackboardObserverRegistry(serialized);
  assert.deepEqual(restored, registry);
  (serialized as { observers: { 'scope-a-danger': { definition: { key: string } } } })
    .observers['scope-a-danger'].definition.key = 'mutated';
  assert.equal(restored.observers['scope-a-danger']?.definition.key, 'danger');

  const withoutScopeA = unregisterAiBlackboardObserverScope(restored, 'scope-a');
  assert.equal(withoutScopeA.observers['scope-a-danger'], undefined);
  assert.ok(withoutScopeA.observers['scope-b-stress']);
  assert.deepEqual(listObservedBlackboardKeys(withoutScopeA), ['stress']);
}

function register(
  registry: AiBlackboardObserverRegistrySnapshotV1,
  definition: Parameters<typeof registerAiBlackboardObserver>[1],
  blackboard: AiGraphRunnerBlackboard,
): AiBlackboardObserverRegistrySnapshotV1 {
  const result = registerAiBlackboardObserver(registry, definition, blackboard);
  assert.equal(result.created, true);
  assert.equal(result.registry.observerEvents, 0, 'baseline registration must be silent');
  return result.registry;
}
