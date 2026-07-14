import assert from 'node:assert/strict';
import { applyOwnedMoveEffects } from '../src/core/ai/AiStatefulMoveGameBridge';
import type { AiGraphRuntimeResult } from '../src/core/ai/AiGraphRuntime';
import { createDirectPlayerMovePlan } from '../src/core/ai/UnitPlan';
import { buildUnitTacticalRouteContext, resolveUnitNavigationProfile } from '../src/core/navigation/NavigationRuntime';
import { evaluateNavigationRouteCost } from '../src/core/navigation/NavigationRouteCost';
import {
  createDefaultNavigationProfileRegistry,
  type NavigationProfile,
} from '../src/core/navigation/NavigationProfiles';
import { saveNavigationProfileRegistry } from '../src/core/navigation/NavigationProfileStorage';
import { planMoveOrder } from '../src/core/orders/MoveOrderPlanning';
import { createPlayerMoveCommand } from '../src/core/orders/PlayerCommand';
import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';
import { tickSimulation } from '../src/core/simulation/SimulationTick';
import type { UnitModel } from '../src/core/units/UnitModel';

verifyAcceptedLiveReplanAndCompletion();
verifyHysteresisAndCooldownBoundSearches();

console.log('Live navigation replan smoke passed: real perception drives SimulationTick search, hysteresis, accepted replacement, bounded A*, final facing and strict ownership.');

function verifyAcceptedLiveReplanAndCompletion(): void {
  const registry = createReplanRegistry('live-accept', 10, 0.05, 1.5);
  saveNavigationProfileRegistry(registry, null);
  try {
    const state = makeCorridorState();
    const mover = unit(state, 'blue-mover');
    const hostile = unit(state, 'red-hostile');
    const target = { x: 21.5, y: 3.5 };
    const finalFacingRadians = 1.75;
    const ownerToken = 'live-route-owner:accepted';
    const { order: initialOrder, profile } = installPlannedPlayerLinkedOrder(
      state,
      mover,
      target,
      finalFacingRadians,
      ownerToken,
      'live-accept',
    );

    const initialRouteCells = cloneCells(initialOrder.routeCells);
    const initialRouteRevision = requiredNumber(initialOrder.routeRevision, 'initial routeRevision');
    const initialPathCost = requiredNumber(initialOrder.pathCost, 'initial pathCost');
    const evaluatedInitialPathCost = evaluateNavigationRouteCost(
      state.map,
      initialRouteCells,
      profile,
      buildUnitTacticalRouteContext(mover),
    );
    assert.ok(
      Math.abs(evaluatedInitialPathCost - initialPathCost) < 1e-6,
      'the current-route evaluator must match normal path planning before tactical knowledge changes',
    );
    const initialCommand = mover.playerCommand;
    assert.ok(initialCommand);
    assert.equal(initialOrder.replanSearchCount, 0);
    assert.equal(initialOrder.replanCount, 0);
    assert.ok(initialRouteCells.every((cell) => cell.y >= 2 && cell.y <= 4), 'initial route must use the narrow upper corridor');

    const knowledgeRevisionBeforeContact = mover.tacticalKnowledge.revision;
    tickSimulation(state, 0.1);

    assert.ok(mover.tacticalKnowledge.revision > knowledgeRevisionBeforeContact, 'real perception must change subjective tacticalKnowledge during SimulationTick');
    const perceptionContact = mover.perceptionKnowledge.contacts.find((contact) => contact.sourceUnitId === hostile.id);
    assert.ok(perceptionContact, 'ordinary perception must create a contact for the hostile');
    assert.equal(perceptionContact.source, 'visual', 'the contact must originate from real LOS evaluation');
    const perceivedThreat = threat(mover, hostile.id);
    assert.equal(perceivedThreat.source, 'seen', 'visual perception must become a subjective seen threat');
    assert.deepEqual(
      { x: perceivedThreat.x, y: perceivedThreat.y },
      hostile.position,
      'the subjective visual memory may use the currently observed position',
    );

    const replacement = mover.order;
    assert.ok(replacement, 'accepted replan must leave a live move order');
    assert.notEqual(replacement, initialOrder, 'accepted replan must replace the active order object');
    assert.equal(replacement.routeStatus, 'replanned');
    assert.equal(replacement.routeRevision, initialRouteRevision + 1);
    assert.equal(replacement.replanSearchCount, 1);
    assert.equal(replacement.replanCount, 1);
    assert.equal(replacement.lastReplanReason, 'danger_changed');
    assert.notDeepEqual(replacement.routeCells, initialRouteCells, 'accepted replan must replace routeCells');
    assert.ok((replacement.routeCells ?? []).some((cell) => cell.y >= 9), 'accepted route must leave the threatened upper corridor');

    assert.equal(replacement.ownerToken, ownerToken);
    assert.deepEqual(replacement.requestedTarget, target);
    assert.equal(replacement.movementMode, initialOrder.movementMode);
    assert.equal(replacement.navigationProfileId, initialOrder.navigationProfileId);
    assert.equal(replacement.navigationProfileRevision, initialOrder.navigationProfileRevision);
    assert.equal(replacement.navigationProfileSource, initialOrder.navigationProfileSource);
    assert.equal(replacement.playerCommandId, initialCommand.id);
    assert.equal(replacement.finalFacingRadians, finalFacingRadians);
    assert.equal(mover.playerCommand, initialCommand, 'replanning must preserve the linked player command object');

    const threatenedOldRouteCost = evaluateNavigationRouteCost(
      state.map,
      initialRouteCells,
      profile,
      buildUnitTacticalRouteContext(mover),
    );
    const replacementCost = requiredNumber(replacement.pathCost, 'replacement pathCost');
    assert.ok(threatenedOldRouteCost > replacementCost * 1.05, 'candidate must improve the active route under current tactical knowledge');
    assert.ok(replacementCost > initialPathCost, 'candidate may be costlier than the stale pre-threat route, so stale-baseline hysteresis would reject it');

    const rememberedPosition = { x: perceivedThreat.x, y: perceivedThreat.y };
    const acceptedSearchCount = replacement.replanSearchCount;
    const acceptedReplanAt = replacement.lastReplanAtSeconds;
    mover.viewRangeCells = 0;
    hostile.position = { x: 22.5, y: 10.5 };
    for (let index = 0; index < 4; index += 1) {
      tickSimulation(state, 0.1);
      assert.equal(mover.order?.replanSearchCount, acceptedSearchCount, 'cooldown must prevent a new candidate search on every tick');
      assert.equal(mover.order?.lastReplanAtSeconds, acceptedReplanAt, 'cooldown ticks must not masquerade as route searches');
    }
    const hiddenThreat = threat(mover, hostile.id);
    assert.equal(hiddenThreat.visibleNow, false);
    assert.deepEqual({ x: hiddenThreat.x, y: hiddenThreat.y }, rememberedPosition, 'hidden movement must retain the observer last-known position');
    assert.notDeepEqual({ x: hiddenThreat.x, y: hiddenThreat.y }, hostile.position, 'hidden objective movement must not leak into tacticalKnowledge');

    mover.speedCellsPerSecond = 1000;
    for (let index = 0; index < 16 && mover.order; index += 1) tickSimulation(state, 0.05);
    assert.equal(mover.order, null, 'the accepted replacement route must complete through ordinary SimulationTick movement');
    assert.equal(mover.playerCommand?.status, 'completed', 'route completion must complete the original linked player command');
    assert.ok(Math.abs(mover.facingRadians - finalFacingRadians) < 1e-9, 'route completion must apply the original final facing');

    const newerPlan = planMoveOrder(state.map, mover.position, { x: 21.5, y: 10.5 }, {
      source: 'ai',
      ownerToken: 'newer-foreign-owner',
      navigationProfile: registry.getProfile('direct'),
      tacticalContext: buildUnitTacticalRouteContext(mover),
    });
    if (!newerPlan.ok) assert.fail(newerPlan.reasonRu);
    mover.order = newerPlan.order;
    const newerForeignOrder = mover.order;
    applyOwnedMoveEffects(state, runtimeResult(mover.id, [{
      type: 'clear_move',
      ownerToken,
      reason: 'Stale lifecycle cleanup.',
      reasonRu: 'Устаревшая очистка lifecycle.',
    }]));
    assert.equal(mover.order, newerForeignOrder, 'stale lifecycle must not clear a newer foreign-owned order');
    assert.equal(mover.order?.ownerToken, 'newer-foreign-owner');
    assert.equal(mover.behaviorRuntime.lastEvent, 'ai_graph_owned_move_cleanup_skipped');
  } finally {
    saveNavigationProfileRegistry(createDefaultNavigationProfileRegistry(), null);
  }
}

function verifyHysteresisAndCooldownBoundSearches(): void {
  const registry = createReplanRegistry('live-reject', 0.5, 1, 1.5);
  saveNavigationProfileRegistry(registry, null);
  try {
    const state = makeCorridorState();
    const mover = unit(state, 'blue-mover');
    const hostile = unit(state, 'red-hostile');
    const { order } = installPlannedPlayerLinkedOrder(
      state,
      mover,
      { x: 21.5, y: 3.5 },
      0.75,
      'live-route-owner:rejected',
      'live-reject',
    );
    const routeCellsBefore = cloneCells(order.routeCells);
    const routeRevisionBefore = order.routeRevision;
    const replanCountBefore = order.replanCount;

    tickSimulation(state, 0.1);

    assert.equal(mover.order, order, 'hysteresis rejection must retain the same active order');
    assert.equal(order.replanSearchCount, 1, 'the first danger revision must perform exactly one candidate search');
    assert.equal(order.replanCount, replanCountBefore, 'rejected candidate must not increment accepted replanCount');
    assert.equal(order.routeRevision, routeRevisionBefore, 'rejected candidate must not change routeRevision');
    assert.deepEqual(order.routeCells, routeCellsBefore, 'rejected candidate must not replace routeCells');
    assert.equal(order.lastReplanReason, 'danger_changed');
    assert.equal(mover.behaviorRuntime.lastEvent, 'move_route_replan_hysteresis');
    const firstSearchAt = order.lastReplanAtSeconds;
    const processedKnowledgeRevision = requiredNumber(order.knowledgeRevision, 'processed knowledge revision');

    for (let index = 0; index < 5; index += 1) {
      hostile.position = { x: 18.45 - index * 0.05, y: 3.5 + (index % 2) * 0.05 };
      tickSimulation(state, 0.1);
      assert.ok(mover.tacticalKnowledge.revision > processedKnowledgeRevision, 'real observed movement must produce fresh knowledge revisions');
      assert.equal(order.replanSearchCount, 1, 'fresh danger revisions inside cooldown must not launch A* each tick');
      assert.equal(order.lastReplanAtSeconds, firstSearchAt);
      assert.equal(order.routeRevision, routeRevisionBefore);
      assert.equal(order.replanCount, replanCountBefore);
    }

    hostile.position = { x: 18.1, y: 3.6 };
    tickSimulation(state, 1.1);
    assert.equal(order.replanSearchCount, 2, 'a fresh danger revision may search again after cooldown expires');
    assert.equal(order.replanCount, replanCountBefore, 'the second insufficient candidate must still be rejected');
    assert.deepEqual(order.routeCells, routeCellsBefore);
  } finally {
    saveNavigationProfileRegistry(createDefaultNavigationProfileRegistry(), null);
  }
}

function createReplanRegistry(
  profileId: string,
  dangerWeight: number,
  minimumCostImprovement: number,
  replanCooldownSeconds: number,
) {
  const registry = createDefaultNavigationProfileRegistry();
  const created = registry.createCustomProfile(profileId, profileId, profileId, 'direct');
  registry.updateProfile(profileId, {
    dangerWeight,
    maximumDetourRatio: 2.5,
    replanRules: {
      ...created.replanRules,
      replanOnBlocked: true,
      replanOnProfileChange: true,
      replanOnDangerChange: true,
      minimumCostImprovement,
      minimumDangerRevisionInterval: 1,
      replanCooldownSeconds,
    },
  });
  return registry;
}

function installPlannedPlayerLinkedOrder(
  state: SimulationState,
  mover: UnitModel,
  target: { x: number; y: number },
  finalFacingRadians: number,
  ownerToken: string,
  profileId: string,
): { order: NonNullable<UnitModel['order']>; profile: NavigationProfile } {
  const command = createPlayerMoveCommand(
    mover.id,
    target,
    mover.playerCommand,
    1000,
    'cautious',
    profileId,
    finalFacingRadians,
  );
  mover.playerCommand = command;
  const resolved = resolveUnitNavigationProfile(mover, command);
  const planned = planMoveOrder(state.map, mover.position, target, {
    source: 'player',
    ownerToken,
    playerCommandId: command.id,
    movementMode: command.movementMode,
    navigationProfile: resolved.profile,
    navigationProfileSource: resolved.source,
    finalFacingRadians: command.finalFacingRadians,
    tacticalContext: buildUnitTacticalRouteContext(mover),
  });
  if (!planned.ok) assert.fail(planned.reasonRu);
  mover.order = planned.order;
  mover.plan = createDirectPlayerMovePlan(mover.plan, command, planned.order.target);
  mover.speedCellsPerSecond = 0;
  return { order: planned.order, profile: resolved.profile };
}

function makeCorridorState(): SimulationState {
  const state = createInitialState({
    width: 24,
    height: 12,
    cellSize: 16,
    metersPerCell: 2,
    runtimeMetersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: [
      ...blockerRectangle('upper-cap', 6, 17, 0, 1),
      ...blockerRectangle('middle-wall', 6, 17, 5, 8),
    ],
  }, [
    { id: 'blue-mover', label: 'Mover', labelRu: 'Двигающийся', type: 'infantry_squad', side: 'blue', x: 2, y: 3, facingDegrees: 0, viewAngleDegrees: 120, viewRangeCells: 30 },
    { id: 'red-hostile', label: 'Hostile', labelRu: 'Противник', type: 'infantry_squad', side: 'red', x: 18, y: 3, facingDegrees: 180, viewRangeCells: 0 },
  ]);
  const mover = unit(state, 'blue-mover');
  const hostile = unit(state, 'red-hostile');
  mover.position = { x: 2.5, y: 3.5 };
  hostile.position = { x: 18.5, y: 3.5 };
  mover.behaviorRuntime.weaponReady = false;
  hostile.behaviorRuntime.weaponReady = false;
  state.selectedUnitId = mover.id;
  state.selectedUnitIds = [mover.id];
  state.editor.enabled = false;
  return state;
}

function blockerRectangle(id: string, minX: number, maxX: number, minY: number, maxY: number) {
  const objects = [];
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const cellId = `${id}:${x}:${y}`;
      objects.push({
        id: cellId,
        kind: 'structure' as const,
        x,
        y,
        widthCells: 1,
        heightCells: 1,
        rotationRadians: 0,
        losHeightMeters: 3,
        coverProtection: 100,
        coverReliability: 100,
        concealment: 0,
        labels: { en: cellId, ru: cellId },
      });
    }
  }
  return objects;
}

function threat(observer: UnitModel, hostileId: string) {
  const found = observer.tacticalKnowledge.threats.find((item) => item.id === `unit:${hostileId}`);
  assert.ok(found, 'real perception must create a unit threat');
  return found;
}

function runtimeResult(unitId: string, effects: readonly unknown[]): AiGraphRuntimeResult {
  return {
    ok: true,
    status: 'running',
    unitId,
    graphId: 'live-navigation-replan-smoke',
    selectedBranchNodeId: 'branch',
    selectedBranchName: 'Live route branch',
    selectedBranchNameRu: 'Ветка живого маршрута',
    scores: [],
    effects,
    blackboard: {},
    cooldowns: {},
    trace: [],
    explanation: 'Live route lifecycle smoke.',
    explanationRu: 'Проверка lifecycle живого маршрута.',
    lifecycle: [],
  } as unknown as AiGraphRuntimeResult;
}

function cloneCells(cells: readonly { x: number; y: number }[] | undefined): Array<{ x: number; y: number }> {
  if (!cells || cells.length <= 1) assert.fail('planned order must contain routeCells');
  return cells.map((cell) => ({ ...cell }));
}

function requiredNumber(value: number | undefined, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) assert.fail(`${label} must be numeric`);
  return value;
}

function unit(state: SimulationState, id: string): UnitModel {
  const found = state.units.find((candidate) => candidate.id === id);
  assert.ok(found, `unit ${id} must exist`);
  return found;
}
