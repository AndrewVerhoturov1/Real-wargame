import assert from 'node:assert/strict';
import type { AiGraph } from '../src/core/ai/AiGraph';
import { runAiGraphRuntime, type AiGraphExecutionState } from '../src/core/ai/AiGraphRuntime';
import { validateAiGraph } from '../src/core/ai/AiGraphValidation';
import { readAiGraphRuntimeReloadEffect } from '../src/core/ai/runtime/actions/ReloadAction';

const reloadGraph: AiGraph = {
  version: 1,
  id: 'reload_runtime_graph',
  name: 'Reload runtime graph',
  nameRu: 'Граф длительной перезарядки',
  rootNodeId: 'root',
  blackboardDefaults: { ammo: 3, weaponReady: true },
  nodes: [
    { id: 'root', type: 'Root', children: ['sequence'] },
    { id: 'sequence', type: 'SequenceWithMemory', children: ['reload', 'continue'] },
    {
      id: 'reload',
      type: 'Reload',
      displayName: 'Reload weapon',
      displayNameRu: 'Перезарядить оружие',
      children: [],
      parameters: {
        durationSeconds: 3,
        targetAmmo: 30,
        failIfNoWeapon: true,
      },
    },
    {
      id: 'continue',
      type: 'SetAction',
      displayName: 'Continue order',
      displayNameRu: 'Продолжить приказ',
      children: [],
      parameters: { action: 'continue_order' },
    },
  ],
};

const validation = validateAiGraph(reloadGraph);
assert.equal(validation.valid, true, JSON.stringify(validation.issues));

const base = {
  graph: reloadGraph,
  unitId: 'soldier_reload',
  blackboard: { ammo: 3, weaponReady: true },
  cooldowns: {},
};

const started = runAiGraphRuntime({ ...base, nowMs: 0 });
assert.equal(started.status, 'running');
assert.equal(started.activeNodeId, 'reload');
assert.equal(started.elapsedMs, 0);
assert.ok(started.executionState);
assert.deepEqual(reloadEffectTypes(started.effects), ['begin_reload']);
const beginEffect = readReloadEffect(started.effects[0]);
assert.equal(beginEffect?.type, 'begin_reload');
assert.equal(beginEffect?.initialAmmo, 3);
assert.equal(beginEffect?.targetAmmo, 3, 'legacy targetAmmo parameter must not create or prescribe ammunition');
assert.equal(started.executionState.activeData?.kind, 'reload');
assert.equal(
  Object.prototype.hasOwnProperty.call(started.executionState.activeData ?? {}, 'targetAmmo'),
  false,
  'stateful reload action must not own an arbitrary targetAmmo value',
);
assert.equal((started.executionState.activeData as { observedAmmo?: number } | undefined)?.observedAmmo, 3);

const midway = runAiGraphRuntime({
  ...base,
  nowMs: 1500,
  executionState: started.executionState,
});
assert.equal(midway.status, 'running');
assert.equal(midway.activeNodeId, 'reload');
assert.equal(midway.elapsedMs, 1500);
assert.deepEqual(reloadEffectTypes(midway.effects), []);
assert.ok(midway.executionState);
assert.equal(midway.executionState.activeNodeStartedAtMs, 0);

const cancelled = runAiGraphRuntime({
  ...base,
  nowMs: 1500,
  executionState: started.executionState,
  cancel: {
    reason: 'Commander interrupted reload.',
    reasonRu: 'Командир прервал перезарядку.',
  },
});
assert.equal(cancelled.status, 'cancelled');
assert.equal(cancelled.executionState, undefined);
assert.deepEqual(reloadEffectTypes(cancelled.effects), ['cancel_reload']);
const cancelEffect = readReloadEffect(cancelled.effects[0]);
assert.equal(cancelEffect?.type, 'cancel_reload');
assert.equal(cancelEffect?.initialAmmo, 3, 'cancel effect may report only the observed compatibility total');
assert.equal(cancelled.lifecycle.filter((event) => event.phase === 'cancel').length, 1);

const completed = runAiGraphRuntime({
  ...base,
  nowMs: 3000,
  executionState: started.executionState,
});
assert.equal(completed.status, 'success');
assert.equal(completed.executionState, undefined);
assert.deepEqual(completed.effects.map((effect) => effect.type), ['complete_reload', 'set_action']);
const completeEffect = readReloadEffect(completed.effects[0]);
assert.equal(completeEffect?.type, 'complete_reload');
assert.equal(
  completeEffect?.targetAmmo,
  3,
  'legacy completion effect must not restore a configured refill amount; physical WeaponRuntime owns completion',
);
assert.equal(completed.lifecycle.filter((event) => event.phase === 'complete').length, 1);

const legacyGraph: AiGraph = {
  version: 1,
  id: 'legacy_instant_reload_graph',
  name: 'Legacy instant reload graph',
  nameRu: 'Старый граф мгновенной перезарядки',
  rootNodeId: 'root',
  blackboardDefaults: {},
  nodes: [
    { id: 'root', type: 'Root', children: ['reload'] },
    { id: 'reload', type: 'SetAction', children: [], parameters: { action: 'reload' } },
  ],
};
const legacy = runAiGraphRuntime({
  graph: legacyGraph,
  unitId: 'soldier_legacy_reload',
  blackboard: { ammo: 3, weaponReady: true },
  cooldowns: {},
  nowMs: 0,
});
assert.equal(legacy.status, 'success');
assert.equal(legacy.executionState, undefined);
assert.deepEqual(legacy.effects.map((effect) => effect.type), ['set_action']);
assert.deepEqual(reloadEffectTypes(legacy.effects), []);
assert.equal(
  Object.prototype.hasOwnProperty.call(legacy.effects[0] ?? {}, 'targetAmmo'),
  false,
  'legacy SetAction reload cannot carry an ammunition target',
);

console.log('AI reload runtime smoke passed: physical-action request, exact cancellation, no arbitrary targetAmmo and no instant refill.');

function reloadEffectTypes(effects: readonly { readonly type: string }[]): string[] {
  return effects
    .map((effect) => readReloadEffect(effect))
    .filter((effect): effect is NonNullable<ReturnType<typeof readReloadEffect>> => effect !== null)
    .map((effect) => effect.type);
}

function readReloadEffect(effect: { readonly type: string } | undefined) {
  return effect ? readAiGraphRuntimeReloadEffect(effect as never) : null;
}

void (undefined as unknown as AiGraphExecutionState | undefined);
