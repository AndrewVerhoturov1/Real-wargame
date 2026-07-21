import { isPostureTransitionRunning } from '../actions/PostureTransition';
import { tickAiSimulationScheduler, type AiSimulationSchedulerResult } from '../ai/AiSimulationScheduler';
import { reconcileMovementProfileRuntime } from '../ai/MovementProfileRuntimeResolver';
import { measurePerformancePhase, withPerformancePhaseContext } from '../debug/PerformancePhases';
import { getThreatRelativeCoverFieldDiagnostics } from '../cover/ThreatRelativeCoverField';
import { getSoldierDangerFieldDiagnostics } from '../knowledge/SoldierDangerField';
import { getDirectionalTacticalFieldDiagnostics } from '../terrain/DirectionalTacticalField';
import { getVisibilityGeometryFieldDiagnostics } from '../visibility/VisibilityGeometryField';
import { getPerceptionGeometryPreparationDiagnostics } from '../visibility/PointVisibility';
import { recordSimulationStepPerformance, roundSimulationDuration, type SimulationStepPhaseDurations } from '../debug/SimulationStepPerformanceDiagnostics';
import { createDirectPlayerMovePlan } from '../ai/UnitPlan';
import { publishSimulationAiEvents } from '../ai/events/SimulationAiEvents';
import { clampPercent, POSTURE_MOVE_MULTIPLIER } from '../behavior/BehaviorModel';
import { getCombatMovementMultiplier, getCombatRuntime, isUnitCombatCapable } from '../combat/CombatDamage';
import { tickAutomaticCombatEngagements } from '../combat/CombatEngagement';
import { getFireAction, reconcileAllPendingFireIntents, tickAllFireActions } from '../combat/FireAction';
import { getCombatSuppressionSnapshot } from '../combat/CombatSuppression';
import type { GridPosition } from '../geometry';
import { syncSoldierThreatMemory } from '../knowledge/SoldierThreatMemory';
import { clampGridPositionToMap } from '../map/MapModel';
import { commitPhysicalMovementStep, preparePhysicalMovementStep } from '../movement/MovementRuntime';
import type { MovementProfileRegistryEntry } from '../movement/MovementProfileTypes';
import { ensureNavigationRouteCurrent, type NavigationReplanWorkBudget } from '../navigation/NavigationRouteReplanner';
import type { MoveOrder } from '../orders/MoveOrder';
import { updatePlayerCommandStatus } from '../orders/PlayerCommand';
import { updateAttentionController } from '../perception/AttentionController';
import { normalizeRadians } from '../perception/AttentionModel';
import { tickAllUnitPerception } from '../perception/PerceptionSystem';
import { createThreatRuntimeEvaluation, evaluateThreatRuntimeAtPosition } from '../pressure/ThreatEvaluation';
import { getAiTestTimeScale } from '../testing/AiTestLabRuntime';
import type { UnitModel } from '../units/UnitModel';
import type { SimulationState } from './SimulationState';

const ORDER_COMPLETION_EPSILON_CELLS = 0.02;
const UNIT_VISUAL_BODY_RADIUS_CELLS = 0.42;
const UNIT_COLLISION_RADIUS_CELLS = UNIT_VISUAL_BODY_RADIUS_CELLS / 3;
const UNIT_MIN_CENTER_DISTANCE_CELLS = UNIT_COLLISION_RADIUS_CELLS * 2;
const COLLISION_PASSES = 3;
const MAX_ROUTE_REPLAN_SEARCHES_PER_STEP = 1;
const threatRuntimeEvaluation = createThreatRuntimeEvaluation();

export interface SimulationTickLegacyOptions {
  readonly movementDeltaSecondsByUnitId?: ReadonlyMap<string, number>;
}

export function tickSimulation(
  state: SimulationState,
  deltaSeconds: number,
  options: SimulationTickLegacyOptions = {},
): void {
  const scaledDeltaSeconds = deltaSeconds * getAiTestTimeScale(state);
  const cycleStartMs = Math.max(0, Math.round(state.simulationTimeSeconds * 1000));
  state.simulationStep += 1;
  state.simulationTimeSeconds += scaledDeltaSeconds;
  const cycleEndMs = Math.max(cycleStartMs, Math.round(state.simulationTimeSeconds * 1000));
  const simulationStep = state.simulationStep;
  const startedAt = performance.now();
  const pointBefore = getPerceptionGeometryPreparationDiagnostics(state);
  const tacticalBefore = tacticalBuildCount(state);
  const schedulerAttribution: { result: AiSimulationSchedulerResult | null } = { result: null };
  const movementProfileRegistryEntries = state.movementProfiles.listProfileEntries();
  let routeNavigationDurationMs = 0;
  const phases: SimulationStepPhaseDurations = {
    metricsMs: 0,
    perceptionMs: 0,
    threatMemoryMs: 0,
    aiSchedulerMs: 0,
    combatMs: 0,
    movementEventsMs: 0,
    collisionsMs: 0,
  };

  withPerformancePhaseContext({ simulationStep }, () => {
    phases.metricsMs = measureTimedPhase('simulation.metrics', () => {
      for (const unit of state.units) {
        updateMetrics(unit, state, scaledDeltaSeconds);
        updateStateLabels(unit);
      }
    });

    // Perception and subjective threat memory must be current before AI reads
    // the blackboard. Graph effects can then affect combat and movement during
    // the same deterministic simulation step.
    phases.perceptionMs = measureTimedPhase('simulation.perception', () => {
      tickAllUnitPerception(state, scaledDeltaSeconds);
    });
    phases.threatMemoryMs = measureTimedPhase('simulation.threat-memory', () => {
      for (const unit of state.units) syncSoldierThreatMemory(state, unit, scaledDeltaSeconds);
    });

    phases.aiSchedulerMs = measureTimedPhase('simulation.ai-scheduler', () => {
      schedulerAttribution.result = tickAiSimulationScheduler(state, {
        cycleStartMs,
        cycleEndMs,
        movementProfileRegistryEntries,
      });
    });
    phases.combatMs = measureTimedPhase('simulation.combat', () => {
      reconcileAllPendingFireIntents(state);
      tickAutomaticCombatEngagements(state);
      tickAllFireActions(state, scaledDeltaSeconds);
    });

    const simulationTimeMs = Math.max(0, Math.round(state.simulationTimeSeconds * 1000));
    phases.movementEventsMs = measureTimedPhase('simulation.movement-events', () => {
      const routeReplanWorkBudget: NavigationReplanWorkBudget = {
        remainingSearches: MAX_ROUTE_REPLAN_SEARCHES_PER_STEP,
        claimedUnitIds: [],
        deferredUnitIds: [],
      };
      const unitCount = state.units.length;
      const movementStartIndex = unitCount > 0 ? state.simulationStep % unitCount : 0;
      for (let offset = 0; offset < unitCount; offset += 1) {
        const unit = state.units[(movementStartIndex + offset) % unitCount];
        const movementDeltaSeconds = options.movementDeltaSecondsByUnitId?.get(unit.id)
          ?? scaledDeltaSeconds;
        routeNavigationDurationMs += moveUnit(
          unit,
          state,
          movementDeltaSeconds,
          movementProfileRegistryEntries,
          routeReplanWorkBudget,
        );
        publishSimulationAiEvents(unit, simulationTimeMs);
      }
    });

    phases.collisionsMs = measureTimedPhase('simulation.collisions', () => {
      resolveUnitCollisions(state);
    });
  });

  const performanceEndMs = performance.now();
  const totalDurationMs = performanceEndMs - startedAt;
  const pointAfter = getPerceptionGeometryPreparationDiagnostics(state);
  const covered = Object.values(phases).reduce((sum, duration) => sum + duration, 0);
  recordSimulationStepPerformance({
    simulationStep,
    simulationTimeSeconds: roundSimulationDuration(state.simulationTimeSeconds),
    performanceStartMs: roundSimulationDuration(startedAt),
    performanceEndMs: roundSimulationDuration(performanceEndMs),
    totalDurationMs: roundSimulationDuration(totalDurationMs),
    phases: mapRoundedPhases(phases),
    aiSchedulerDurationMs: roundSimulationDuration(phases.aiSchedulerMs),
    perceptionDurationMs: roundSimulationDuration(phases.perceptionMs),
    movementEventsDurationMs: roundSimulationDuration(phases.movementEventsMs),
    routeNavigationDurationMs: roundSimulationDuration(routeNavigationDurationMs),
    tacticalFieldBuilds: Math.max(0, tacticalBuildCount(state) - tacticalBefore),
    pointLosCacheMisses: Math.max(0, pointAfter.preparationCount - pointBefore.preparationCount),
    pointLosCacheHits: Math.max(0, pointAfter.cacheHitCount - pointBefore.cacheHitCount),
    unitId: schedulerAttribution.result?.maxUnitId ?? null,
    activeGraphNode: schedulerAttribution.result?.maxUnitActiveNode ?? null,
    maxUnitPassDurationMs: roundSimulationDuration(schedulerAttribution.result?.maxUnitDurationMs ?? 0),
    uncoveredResidualDurationMs: roundSimulationDuration(Math.max(0, totalDurationMs - covered)),
  });
}

function measureTimedPhase(name: string, callback: () => void): number {
  const startedAt = performance.now();
  measurePerformancePhase(name, callback);
  return performance.now() - startedAt;
}

function mapRoundedPhases(phases: SimulationStepPhaseDurations): SimulationStepPhaseDurations {
  return {
    metricsMs: roundSimulationDuration(phases.metricsMs),
    perceptionMs: roundSimulationDuration(phases.perceptionMs),
    threatMemoryMs: roundSimulationDuration(phases.threatMemoryMs),
    aiSchedulerMs: roundSimulationDuration(phases.aiSchedulerMs),
    combatMs: roundSimulationDuration(phases.combatMs),
    movementEventsMs: roundSimulationDuration(phases.movementEventsMs),
    collisionsMs: roundSimulationDuration(phases.collisionsMs),
  };
}

function tacticalBuildCount(state: SimulationState): number {
  return getThreatRelativeCoverFieldDiagnostics(state.map).geometryBuildCount
    + getSoldierDangerFieldDiagnostics(state.map).fieldBuildCount
    + getDirectionalTacticalFieldDiagnostics(state.map).buildCount
    + getVisibilityGeometryFieldDiagnostics(state.map).geometryBuildCount;
}

function updateMetrics(unit: UnitModel, state: SimulationState, deltaSeconds: number): void {
  const report = evaluateThreatRuntimeAtPosition(state.map, unit, state.pressureZones, threatRuntimeEvaluation);
  const combatPressure = getCombatSuppressionSnapshot(unit, state.simulationTimeSeconds);

  unit.behaviorRuntime.rawDanger = report.danger;
  unit.behaviorRuntime.danger = clampPercent(report.danger + combatPressure.suppression * 0.45);
  unit.behaviorRuntime.suppression = combinePercent(report.suppression, combatPressure.suppression);

  const strongestId = report.strongestScenarioId ?? report.strongestKnownId;
  if (strongestId) {
    unit.behaviorRuntime.stress = clampPercent(
      unit.behaviorRuntime.stress + report.stressPerSecond * unit.behaviorSettings.fear * deltaSeconds,
    );
    unit.behaviorRuntime.lastEvent = report.strongestScenarioId
      ? `pressure:${strongestId}`
      : `known_threat:${strongestId}`;
    unit.behaviorRuntime.reason = `under threat from ${strongestId}`;
    return;
  }

  const recoveryFactor = combatPressure.suppression > 0 ? 0.25 : 1;
  unit.behaviorRuntime.stress = clampPercent(
    unit.behaviorRuntime.stress - unit.behaviorSettings.stressRecoveryPerSecond * recoveryFactor * deltaSeconds,
  );
  if (combatPressure.suppression > 0) {
    unit.behaviorRuntime.lastEvent = 'combat_suppression_active';
    unit.behaviorRuntime.reason = 'Боец ещё подавлен недавним огнём.';
    return;
  }
  if (!getFireAction(unit) && isUnitCombatCapable(unit)) {
    unit.behaviorRuntime.reason = unit.order ? 'moving outside pressure zone' : 'outside pressure zone';
  }
}

function updateStateLabels(unit: UnitModel): void {
  if (!isUnitCombatCapable(unit)) {
    unit.order = null;
    unit.behaviorRuntime.currentAction = getCombatRuntime(unit).capability;
    setState(unit, 'stressed', 'unit is out of combat');
    return;
  }
  if (isPostureTransitionRunning(unit)) {
    unit.behaviorRuntime.currentAction = 'change_posture';
    setState(unit, 'observing', 'active physical posture transition');
    return;
  }
  if (getFireAction(unit)) {
    setState(unit, 'observing', 'active fire action');
    return;
  }

  if (unit.order) unit.behaviorRuntime.currentAction = 'move';
  else if (!(unit.aiControl === 'graph' && unit.behaviorRuntime.aiRuntimeSession?.status === 'active')) {
    unit.behaviorRuntime.currentAction = 'observe';
  }

  if (unit.order) {
    setState(unit, 'moving', 'active move order');
    return;
  }

  setState(unit, unit.behaviorRuntime.state === 'idle' ? 'idle' : 'observing', 'no active move order');
}

function moveUnit(
  unit: UnitModel,
  state: SimulationState,
  deltaSeconds: number,
  movementProfileRegistryEntries: readonly MovementProfileRegistryEntry[],
  routeReplanWorkBudget: NavigationReplanWorkBudget,
): number {
  const previousMovementAuthority = {
    profileId: unit.movementRuntime.effectiveProfileId,
    source: unit.movementRuntime.effectiveProfileSource,
  } as const;
  reconcileMovementProfileRuntime(
    unit,
    movementProfileRegistryEntries,
    { profileId: null },
    { commit: false },
  );

  const combatCapable = isUnitCombatCapable(unit);
  const firing = Boolean(getFireAction(unit));
  const postureTransitionRunning = isPostureTransitionRunning(unit);
  if (postureTransitionRunning) {
    unit.movementRuntime.isMoving = false;
    unit.movementRuntime.velocityCellsPerSecond = { x: 0, y: 0 };
  }
  let routeNavigationDurationMs = 0;
  let routeReady = false;
  if (unit.order && combatCapable && !firing && !postureTransitionRunning && deltaSeconds > 0) {
    const routeStartedAt = performance.now();
    routeReady = ensureRoutePassable(unit, state, routeReplanWorkBudget);
    routeNavigationDurationMs = performance.now() - routeStartedAt;
  }

  const postureMultiplier = POSTURE_MOVE_MULTIPLIER[unit.behaviorRuntime.posture];
  const woundMultiplier = getCombatMovementMultiplier(unit);
  const step = preparePhysicalMovementStep(
    state,
    unit,
    deltaSeconds,
    routeReady && Boolean(unit.order) && !postureTransitionRunning,
    postureMultiplier,
    woundMultiplier,
  );
  reconcileMovementProfileRuntime(unit, movementProfileRegistryEntries, {
    profileId: unit.movementRuntime.forcedFallbackReason
      ? unit.movementRuntime.effectiveProfileId
      : null,
    reason: unit.movementRuntime.forcedFallbackReason,
  }, {
    previousProfileId: previousMovementAuthority.profileId,
    previousProfileSource: previousMovementAuthority.source,
  });

  const order = unit.order;
  if (!order) {
    commitPhysicalMovementStep(state, unit, step, unit.position, unit.position, deltaSeconds);
    return routeNavigationDurationMs;
  }

  const waypointIndex = order.waypointIndex ?? 0;
  const movementTarget = order.waypoints?.[waypointIndex] ?? order.target;
  updateFacingAlongRoute(unit, movementTarget);
  if (step.maxDistanceCells <= 0) {
    commitPhysicalMovementStep(state, unit, step, unit.position, unit.position, deltaSeconds);
    return routeNavigationDurationMs;
  }

  const remainingDistance = getDistance(unit.position, movementTarget);
  const startPosition = { ...unit.position };
  unit.position = moveToPoint(unit.position, movementTarget, step.maxDistanceCells);
  commitPhysicalMovementStep(state, unit, step, startPosition, unit.position, deltaSeconds);

  if (remainingDistance > step.maxDistanceCells + ORDER_COMPLETION_EPSILON_CELLS) {
    return routeNavigationDurationMs;
  }
  unit.position = { ...movementTarget };

  const waypoints = order.waypoints;
  if (waypoints && waypointIndex < waypoints.length - 1) {
    order.waypointIndex = waypointIndex + 1;
    if (order.routeStatus === 'planned') order.routeStatus = 'following';
    unit.behaviorRuntime.lastEvent = 'move_waypoint_reached';
    unit.behaviorRuntime.reason = `Точка маршрута ${order.waypointIndex + 1} из ${waypoints.length}.`;
    return routeNavigationDurationMs;
  }

  unit.position = { ...order.target };
  applyFinalFacing(unit, order);
  unit.order = null;
  completeLinkedPlayerCommand(unit, order);
  setState(unit, 'observing', 'target reached');
  unit.behaviorRuntime.currentAction = 'observe';
  unit.behaviorRuntime.reason = 'target reached';
  unit.behaviorRuntime.lastEvent = 'move_done';
  return routeNavigationDurationMs;
}

function updateFacingAlongRoute(unit: UnitModel, movementTarget: GridPosition): void {
  const dx = movementTarget.x - unit.position.x;
  const dy = movementTarget.y - unit.position.y;
  if (Math.hypot(dx, dy) < 0.0001) return;
  const heading = normalizeRadians(Math.atan2(dy, dx));
  const difference = Math.abs(Math.atan2(Math.sin(heading - unit.facingRadians), Math.cos(heading - unit.facingRadians)));
  if (difference < 0.0001) return;
  unit.facingRadians = heading;
  updateAttentionController(unit, 0);
}

function applyFinalFacing(unit: UnitModel, order: MoveOrder): void {
  if (typeof order.finalFacingRadians !== 'number' || !Number.isFinite(order.finalFacingRadians)) return;
  unit.facingRadians = order.finalFacingRadians;
  if (unit.attentionRuntime.mode === 'search') unit.attentionRuntime.searchCenterRadians = order.finalFacingRadians;
  updateAttentionController(unit, 0);
  unit.behaviorRuntime.lastEvent = 'move_final_facing_applied';
}

function ensureRoutePassable(
  unit: UnitModel,
  state: SimulationState,
  routeReplanWorkBudget: NavigationReplanWorkBudget,
): boolean {
  return ensureNavigationRouteCurrent(unit, state, routeReplanWorkBudget);
}

function completeLinkedPlayerCommand(unit: UnitModel, order: MoveOrder): void {
  const command = unit.playerCommand;
  if (!order.playerCommandId || command?.id !== order.playerCommandId) return;
  unit.playerCommand = updatePlayerCommandStatus(
    command,
    'completed',
    'Player movement command completed.',
    'Приказ движения выполнен.',
  );
  if (unit.plan?.source === 'player_fallback' && unit.plan.commandId === command.id) {
    unit.plan = createDirectPlayerMovePlan(unit.plan, unit.playerCommand, order.target);
  }
}

function blockLinkedPlayerCommand(
  unit: UnitModel,
  order: MoveOrder,
  reason: string,
  reasonRu: string,
): void {
  const command = unit.playerCommand;
  if (!order.playerCommandId || command?.id !== order.playerCommandId) return;
  unit.playerCommand = updatePlayerCommandStatus(
    command,
    'blocked',
    `Player movement command is blocked: ${reason}`,
    `Приказ движения заблокирован: ${reasonRu}`,
  );
  if (unit.plan?.source === 'player_fallback' && unit.plan.commandId === command.id) {
    unit.plan = createDirectPlayerMovePlan(unit.plan, unit.playerCommand, order.target);
  }
}

function resolveUnitCollisions(state: SimulationState): void {
  for (let pass = 0; pass < COLLISION_PASSES; pass += 1) {
    for (let leftIndex = 0; leftIndex < state.units.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < state.units.length; rightIndex += 1) {
        separateUnits(state, state.units[leftIndex], state.units[rightIndex], leftIndex, rightIndex);
      }
    }
  }
}

function separateUnits(
  state: SimulationState,
  left: UnitModel,
  right: UnitModel,
  leftIndex: number,
  rightIndex: number,
): void {
  const dx = right.position.x - left.position.x;
  const dy = right.position.y - left.position.y;
  const distance = Math.hypot(dx, dy);

  if (distance >= UNIT_MIN_CENTER_DISTANCE_CELLS) return;

  const safeDistance = distance > 0.0001 ? distance : 0.0001;
  const fallbackAngle = (leftIndex + rightIndex) * 2.399963229728653;
  const normalX = distance > 0.0001 ? dx / safeDistance : Math.cos(fallbackAngle);
  const normalY = distance > 0.0001 ? dy / safeDistance : Math.sin(fallbackAngle);
  const pushDistance = (UNIT_MIN_CENTER_DISTANCE_CELLS - safeDistance) / 2;

  left.position = clampGridPositionToMap(state.map, {
    x: left.position.x - normalX * pushDistance,
    y: left.position.y - normalY * pushDistance,
  });
  right.position = clampGridPositionToMap(state.map, {
    x: right.position.x + normalX * pushDistance,
    y: right.position.y + normalY * pushDistance,
  });
}

function setState(unit: UnitModel, nextState: UnitModel['behaviorRuntime']['state'], reason: string): void {
  if (unit.behaviorRuntime.state === nextState) return;

  unit.behaviorRuntime.previousState = unit.behaviorRuntime.state;
  unit.behaviorRuntime.state = nextState;
  unit.behaviorRuntime.stateChangedBecause = reason;
}

function combinePercent(left: number, right: number): number {
  const left01 = clampPercent(left) / 100;
  const right01 = clampPercent(right) / 100;
  return clampPercent((1 - (1 - left01) * (1 - right01)) * 100);
}

function getDistance(a: GridPosition, b: GridPosition): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function moveToPoint(current: GridPosition, target: GridPosition, maxDistance: number): GridPosition {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const length = Math.hypot(dx, dy);

  if (length === 0 || length <= maxDistance) return { ...target };

  return {
    x: current.x + (dx / length) * maxDistance,
    y: current.y + (dy / length) * maxDistance,
  };
}
