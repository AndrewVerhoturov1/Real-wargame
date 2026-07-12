import { readFile, writeFile } from 'node:fs/promises';

const path = 'scripts/ai_blackboard_observer_smoke.ts';
let source = await readFile(path, 'utf8');
source = insertOnce(
  source,
  "import assert from 'node:assert/strict';\n",
  "import assert from 'node:assert/strict';\nimport mapData from '../src/data/maps/test_map.json';\nimport unitsData from '../src/data/units/test_units.json';\n",
  'add bridge fixture imports',
);
source = insertOnce(
  source,
  "import type { AiGraphRunnerBlackboard } from '../src/core/ai/AiGraphRunner';\n",
  "import type { AiGraphRunnerBlackboard } from '../src/core/ai/AiGraphRunner';\nimport { buildObservedBlackboardForUnit, pollAiBlackboardObservers } from '../src/core/ai/AiGameBridge';\nimport { createAiRuntimeSession } from '../src/core/ai/runtime/AiRuntimeSession';\nimport type { TacticalMapData } from '../src/core/map/MapModel';\nimport { createInitialState } from '../src/core/simulation/SimulationState';\nimport type { UnitData } from '../src/core/units/UnitModel';\n",
  'import bridge polling APIs',
);
source = replaceOnce(
  source,
  "verifyScopeAndSnapshotRoundTrip();\n\nconsole.log",
  "verifyScopeAndSnapshotRoundTrip();\nverifyCompactBridgePolling();\n\nconsole.log",
  'run compact bridge polling contract',
);
source = replaceOnce(
  source,
  "function verifyScopeAndSnapshotRoundTrip(): void {",
  `function verifyCompactBridgePolling(): void {
  const state = createInitialState(
    mapData as TacticalMapData,
    unitsData as UnitData[],
    [],
  );
  const unit = state.units[0];
  assert.ok(unit);
  state.selectedUnitId = unit.id;
  state.selectedUnitIds = [unit.id];

  let session = createAiRuntimeSession({ graphId: 'observer_bridge_graph', unitId: unit.id });
  const compactBaseline = buildObservedBlackboardForUnit(state, unit, ['danger'], session.blackboardMemory);
  assert.deepEqual(Object.keys(compactBaseline), ['danger']);
  const registration = registerAiBlackboardObserver(session.observerRegistry, {
    observerId: 'bridge-danger',
    key: 'danger',
    kind: 'key_changed',
    scopeNodeId: 'reactive-branch',
  }, compactBaseline);
  session = { ...session, observerRegistry: registration.registry };
  unit.behaviorRuntime.aiRuntimeSession = session;

  unit.behaviorRuntime.danger = 80;
  const changed = pollAiBlackboardObservers(state, unit);
  assert.equal(changed.events, 1);
  assert.equal(changed.checks, 1);
  assert.equal(unit.behaviorRuntime.aiRuntimeSession?.eventQueue.events.length, 1);
  assert.equal(unit.behaviorRuntime.aiRuntimeSession?.eventQueue.events[0]?.type, 'blackboard_observer_changed');
  assert.equal(unit.behaviorRuntime.aiRuntimeSession?.observerRegistry.wakeRevision, 1);

  for (let index = 0; index < 100; index += 1) {
    const quiet = pollAiBlackboardObservers(state, unit);
    assert.equal(quiet.events, 0);
    assert.equal(quiet.checks, 1);
  }
  assert.equal(unit.behaviorRuntime.aiRuntimeSession?.eventQueue.events.length, 1);
  assert.equal(unit.behaviorRuntime.aiRuntimeSession?.observerRegistry.observerChecks, 102);
  assert.equal(unit.behaviorRuntime.aiRuntimeSession?.observerRegistry.observerEvents, 1);
}

function verifyScopeAndSnapshotRoundTrip(): void {`,
  'add compact bridge polling contract',
);
await writeFile(path, source);
console.log('Blackboard observer bridge smoke patch applied.');

function insertOnce(source, marker, replacement, label) {
  if (source.includes(replacement)) return source;
  return replaceOnce(source, marker, replacement, label);
}

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`${label}: expected source fragment not found`);
  if (source.indexOf(search, first + search.length) >= 0) throw new Error(`${label}: source fragment is not unique`);
  return `${source.slice(0, first)}${replacement}${source.slice(first + search.length)}`;
}
