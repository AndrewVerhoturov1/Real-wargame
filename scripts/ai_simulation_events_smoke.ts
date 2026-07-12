import assert from 'node:assert/strict';
import { createAiRouteStatusState } from '../src/core/ai/AiRouteStatus';
import {
  captureSimulationAiFacts,
  collectSimulationAiEvents,
  initializeSimulationAiEventFacts,
  publishSimulationAiEvents,
  type SimulationAiFacts,
} from '../src/core/ai/events/SimulationAiEvents';
import { createAiRuntimeSession } from '../src/core/ai/runtime/AiRuntimeSession';
import { createMoveOrder } from '../src/core/orders/MoveOrder';
import { createPlayerMoveCommand, updatePlayerCommandStatus } from '../src/core/orders/PlayerCommand';
import { normalizeUnits, type UnitData } from '../src/core/units/UnitModel';

verifyPureTransitions();
verifyStableStateProducesNoRepeats();
verifyPublisherQueuesPendingTransition();

console.log('AI simulation events smoke passed: transition-only publication, payloads, stable ticks, pending session and queue integration.');

function verifyPureTransitions(): void {
  const baseline = facts();
  assert.deepEqual(collectSimulationAiEvents(undefined, baseline, 0), []);

  const commandActive: SimulationAiFacts = {
    ...baseline,
    command: {
      id: 'order-1',
      status: 'active',
      revision: 1,
      target: { x: 8, y: 4 },
      reason: 'Order issued.',
      reasonRu: 'Приказ отдан.',
    },
  };
  const received = collectSimulationAiEvents(baseline, commandActive, 100);
  assert.deepEqual(received.map((event) => event.type), ['order_received']);
  assert.deepEqual((received[0]?.payload as { target?: unknown }).target, { x: 8, y: 4 });
  assert.equal(received[0]?.priority, 100);

  const cancelled: SimulationAiFacts = {
    ...commandActive,
    command: { ...commandActive.command!, status: 'cancelled', revision: 2, reasonRu: 'Приказ отменён.' },
  };
  assert.deepEqual(collectSimulationAiEvents(commandActive, cancelled, 200).map((event) => event.type), ['order_cancelled']);

  const moving: SimulationAiFacts = {
    ...commandActive,
    move: {
      source: 'ai',
      ownerToken: 'move-token',
      target: { x: 8, y: 4 },
      routeRevision: 1,
    },
  };
  const arrived: SimulationAiFacts = { ...moving, move: undefined, lastEvent: 'move_done' };
  const moveComplete = collectSimulationAiEvents(moving, arrived, 300);
  assert.deepEqual(moveComplete.map((event) => event.type), ['move_completed']);
  assert.equal((moveComplete[0]?.payload as { ownerToken?: string }).ownerToken, 'move-token');

  const routeBlocked: SimulationAiFacts = {
    ...moving,
    routeOwnerToken: 'move-token',
    routeAbortCode: 'route_blocked',
    routeAbortReason: 'Route blocked.',
    routeAbortReasonRu: 'Маршрут заблокирован.',
    routeRevision: 400,
  };
  assert.deepEqual(collectSimulationAiEvents(moving, routeBlocked, 400).map((event) => event.type), ['route_blocked']);

  const targetLost: SimulationAiFacts = {
    ...routeBlocked,
    routeAbortCode: 'target_lost',
    routeAbortReason: 'Target lost.',
    routeAbortReasonRu: 'Цель потеряна.',
    routeRevision: 500,
  };
  assert.deepEqual(collectSimulationAiEvents(routeBlocked, targetLost, 500).map((event) => event.type), ['target_lost']);

  const combatChanged: SimulationAiFacts = {
    ...baseline,
    ammo: 0,
    weaponReady: false,
    suppression: 70,
    suppressionHigh: true,
  };
  assert.deepEqual(
    collectSimulationAiEvents(baseline, combatChanged, 600).map((event) => event.type),
    ['ammo_empty', 'weapon_ready_changed', 'suppression_threshold_crossed'],
  );
}

function verifyStableStateProducesNoRepeats(): void {
  const stable = facts({
    command: {
      id: 'stable-order',
      status: 'active',
      revision: 1,
      target: { x: 4, y: 3 },
      reason: 'Stable.',
      reasonRu: 'Без изменений.',
    },
    suppression: 75,
    suppressionHigh: true,
  });
  for (let index = 0; index < 100; index += 1) {
    assert.equal(collectSimulationAiEvents(stable, stable, 1000 + index).length, 0);
  }
}

function verifyPublisherQueuesPendingTransition(): void {
  const data: UnitData = {
    id: 'event_soldier',
    label: 'Event soldier',
    labelRu: 'Боец событий',
    type: 'infantry_squad',
    side: 'player',
    x: 1,
    y: 1,
  };
  const [unit] = normalizeUnits([data]);
  assert.ok(unit);
  initializeSimulationAiEventFacts(unit);
  unit.playerCommand = createPlayerMoveCommand(unit.id, { x: 7, y: 4 }, null, 100);

  const withoutSession = publishSimulationAiEvents(unit, 100);
  assert.deepEqual(withoutSession.generated.map((event) => event.type), ['order_received']);
  assert.equal(withoutSession.published.length, 0);
  assert.equal(unit.behaviorRuntime.aiSimulationEventFacts?.command, undefined, 'pending transition must remain detectable');

  unit.behaviorRuntime.aiRuntimeSession = createAiRuntimeSession({ graphId: 'event_graph', unitId: unit.id });
  const withSession = publishSimulationAiEvents(unit, 100);
  assert.deepEqual(withSession.published.map((event) => event.type), ['order_received']);
  assert.equal(unit.behaviorRuntime.aiRuntimeSession.eventQueue.events[0]?.type, 'order_received');
  assert.equal(unit.behaviorRuntime.aiRuntimeSession.eventQueue.events[0]?.sequence, 0);

  for (let index = 0; index < 100; index += 1) {
    const stable = publishSimulationAiEvents(unit, 100);
    assert.equal(stable.generated.length, 0);
  }
  assert.equal(unit.behaviorRuntime.aiRuntimeSession.eventQueue.events.length, 1);

  unit.order = createMoveOrder({ x: 7, y: 4 }, { source: 'ai', ownerToken: 'route-token' });
  publishSimulationAiEvents(unit, 200);
  unit.behaviorRuntime.aiRouteStatusState = {
    ...createAiRouteStatusState({ nowMs: 200, position: unit.position, target: { x: 7, y: 4 }, ownerToken: 'route-token' }),
    status: 'blocked',
    abortCode: 'route_blocked',
    abortReason: 'Route blocked.',
    abortReasonRu: 'Маршрут заблокирован.',
  };
  const blocked = publishSimulationAiEvents(unit, 200);
  assert.deepEqual(blocked.published.map((event) => event.type), ['route_blocked']);

  unit.behaviorRuntime.ammo = 0;
  unit.behaviorRuntime.weaponReady = false;
  unit.behaviorRuntime.suppression = 80;
  const combat = publishSimulationAiEvents(unit, 300);
  assert.deepEqual(combat.published.map((event) => event.type), [
    'ammo_empty',
    'weapon_ready_changed',
    'suppression_threshold_crossed',
  ]);

  unit.playerCommand = updatePlayerCommandStatus(
    unit.playerCommand!,
    'cancelled',
    'Player cancelled order.',
    'Игрок отменил приказ.',
  );
  const cancellation = publishSimulationAiEvents(unit, 400);
  assert.deepEqual(cancellation.published.map((event) => event.type), ['order_cancelled']);
}

function facts(overrides: Partial<SimulationAiFacts> = {}): SimulationAiFacts {
  return {
    version: 1,
    unitId: 'soldier',
    ammo: 3,
    weaponReady: true,
    suppression: 0,
    suppressionHigh: false,
    routeRevision: 0,
    lastEvent: null,
    ...overrides,
  };
}
