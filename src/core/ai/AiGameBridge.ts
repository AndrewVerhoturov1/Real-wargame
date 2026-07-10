import { clampPercent, type UnitPosture } from '../behavior/BehaviorModel';
import { findBestCoverForThreat } from '../cover/CoverEvaluation';
import { distance, type GridPosition } from '../geometry';
import { buildSoldierAwarenessReport } from '../knowledge/SoldierAwarenessGrid';
import { clampGridPositionToMap, type TacticalMap } from '../map/MapModel';
import { createMoveOrder } from '../orders/MoveOrder';
import { evaluateThreatsAtPosition } from '../pressure/ThreatEvaluation';
import type { SimulationState } from '../simulation/SimulationState';
import { getAiTestTimeScale } from '../testing/AiTestLabRuntime';
import type { UnitModel } from '../units/UnitModel';
import type { AiBlackboardValue } from './AiBlackboard';
import type { AiGraph, AiNode } from './AiGraph';
import {
  runAiGraph,
  type AiGraphEffect,
  type AiGraphRunnerBlackboard,
  type AiGraphRunnerResult,
  type AiGraphTacticalHost,
} from './AiGraphRunner';
import bundledGraph from '../../data/ai/soldier_default_survival_graph.json';

const GRAPH_STORAGE_KEY = 'real-wargame.ai-node-editor.graph.v6';
const DEBUG_STORAGE_KEY = 'real-wargame.ai-node-editor.debug.v1';
const AI_GRAPH_TICK_INTERVAL_MS = 600;
const AI_GRAPH_POLL_INTERVAL_MS = 60;
const COVER_SEARCH_RADIUS_CELLS = 5;

type PausableSimulationState = SimulationState & { paused?: boolean };
type AiGraphRuntime = UnitModel['behaviorRuntime'] & {
  aiGraphMemory?: AiGraphRunnerBlackboard;
  aiGraphSimulationTimeMs?: number;
};

export interface AiGameBridgeHandle {
  destroy(): void;
  tickNow(): AiGraphRunnerResult | null;
  evaluateNow(): AiGraphRunnerResult | null;
}

interface TickOptions {
  force: boolean;
  applyEffects: boolean;
}

export function installAiGameBridge(state: SimulationState): AiGameBridgeHandle {
  const handle = window.setInterval(() => {
    tickAiGameBridge(state);
  }, AI_GRAPH_POLL_INTERVAL_MS);

  return {
    destroy: () => window.clearInterval(handle),
    tickNow: () => tickAiGameBridge(state, Date.now(), { force: true, applyEffects: true }),
    evaluateNow: () => tickAiGameBridge(state, Date.now(), { force: true, applyEffects: false }),
  };
}

export function tickAiGameBridge(
  state: SimulationState,
  nowMs = Date.now(),
  options: TickOptions = { force: false, applyEffects: true },
): AiGraphRunnerResult | null {
  const unit = state.selectedUnitId
    ? state.units.find((candidate) => candidate.id === state.selectedUnitId)
    : undefined;

  if (!unit) return null;
  if (!options.force && (state.editor.enabled || isPaused(state))) return null;

  const scaledInterval = AI_GRAPH_TICK_INTERVAL_MS / getAiTestTimeScale(state);
  if (!options.force && nowMs - unit.behaviorRuntime.aiGraphLastTickMs < scaledInterval) return null;

  const runtime = unit.behaviorRuntime as AiGraphRuntime;
  const simulationNowMs = options.applyEffects
    ? (runtime.aiGraphSimulationTimeMs ?? 0) + AI_GRAPH_TICK_INTERVAL_MS
    : runtime.aiGraphSimulationTimeMs ?? 0;
  const graph = readRuntimeGraph();
  const result = runAiGraph({
    graph,
    unitId: unit.id,
    blackboard: buildBlackboardForUnit(state, unit),
    cooldowns: unit.behaviorRuntime.aiNodeCooldowns,
    nowMs: simulationNowMs,
    tacticalHost: createTacticalHost(state, unit),
  });

  publishRuntimeDebugTrace(state, unit, graph, result, nowMs, simulationNowMs, !options.applyEffects);

  if (!options.applyEffects) return result;

  runtime.aiGraphSimulationTimeMs = simulationNowMs;
  unit.behaviorRuntime.aiGraphLastTickMs = nowMs;
  unit.behaviorRuntime.aiNodeCooldowns = { ...result.cooldowns };
  applyGraphEffects(state, unit, result.effects, result.blackboard, nowMs);
  unit.behaviorRuntime.aiGraphReason = result.explanationRu ?? result.explanation;
  unit.behaviorRuntime.reason = result.explanationRu ?? result.explanation;
  unit.behaviorRuntime.lastEvent = result.ok ? 'ai_graph_runner_tick' : 'ai_graph_runner_no_branch';
  return result;
}

export function buildBlackboardForUnit(state: SimulationState, unit: UnitModel): AiGraphRunnerBlackboard {
  const threats = evaluateThreatsAtPosition(state.map, unit, state.pressureZones);
  const threatPosition = threats.targetPosition;
  const bestCover = findBestCoverForThreat(
    state.map,
    unit.position,
    threatPosition,
    unit.behaviorRuntime.posture,
    COVER_SEARCH_RADIUS_CELLS,
  );
  const distanceToCover = bestCover.distanceCells * state.map.metersPerCell;
  const strongest = threats.strongest;
  const threatDistance = strongest ? strongest.distanceCells * state.map.metersPerCell : 9999;
  const underFire = threats.danger > 0 || threats.suppression > 0;
  const awareness = buildSoldierAwarenessReport(state, unit);
  const bestSafe = awareness.bestSafePositions[0];

  return {
    ...(isRecord(bundledGraph.blackboardDefaults) ? normalizeBlackboard(bundledGraph.blackboardDefaults) : {}),
    ...getAiGraphMemory(unit),
    danger: clampPercent(threats.danger),
    stress: clampPercent(Math.round(unit.behaviorRuntime.stress)),
    suppression: clampPercent(threats.suppression),
    fatigue: clampPercent(Math.round(unit.soldier.condition.fatigue)),
    morale: clampPercent(Math.round(unit.soldier.condition.morale)),
    health: clampPercent(Math.round(unit.soldier.condition.health)),
    ammo: Math.max(0, Math.round(unit.behaviorRuntime.ammo)),
    distanceToCover: Number.isFinite(distanceToCover) ? Math.round(distanceToCover) : 9999,
    enemyVisible: threats.enemyVisible,
    enemyKnown: threats.enemyKnown,
    underFire,
    hasOrder: Boolean(unit.order),
    isInCover: (strongest?.coverProtection ?? 0) > 0,
    weaponReady: unit.behaviorRuntime.weaponReady && unit.behaviorRuntime.ammo > 0,
    directionToThreat: strongest?.directionFromUnitDegrees ?? -1,
    threatDistance: Math.round(threatDistance),
    threatAngle: strongest?.zone.arcDegrees ?? 0,
    coverProtection: strongest?.coverProtection ?? 0,
    bestCoverQuality: Math.max(0, Math.round(bestCover.score)),
    currentPositionDanger: awareness.currentPosition.danger,
    currentExpectedProtection: awareness.currentPosition.expectedProtection,
    bestSafePositionScore: Math.max(0, Math.round(bestSafe?.score ?? 0)),
    distanceToBestSafePosition: Math.round((bestSafe?.distanceCells ?? 9999) * state.map.metersPerCell),
    routeDanger: awareness.routeDanger,
    threatConfidence: awareness.threatConfidence,
    current_action: unit.behaviorRuntime.currentAction,
    self_position: unit.position,
    order_target_position: unit.order?.target ?? null,
    retreat_position: makeRetreatPoint(state.map, unit.position, threatPosition),
    best_cover_position: bestSafe?.position ?? bestCover.position,
    current_target: threats.enemyVisible ? threatPosition : null,
    remembered_enemy_position: threats.enemyKnown ? threatPosition : null,
  };
}

function getAiGraphMemory(unit: UnitModel): AiGraphRunnerBlackboard {
  const runtime = unit.behaviorRuntime as AiGraphRuntime;
  if (!runtime.aiGraphMemory) runtime.aiGraphMemory = {};
  return runtime.aiGraphMemory;
}

function createTacticalHost(state: SimulationState, unit: UnitModel): AiGraphTacticalHost {
  return {
    resolveDistanceMeters: (fromKey, toKey, blackboard) => resolveDistanceMeters(state, unit, blackboard, fromKey, toKey),
    findBestObject: (objectKind, _criteria, searchRadiusMeters) => {
      if (objectKind !== 'cover') return null;
      const threats = evaluateThreatsAtPosition(state.map, unit, state.pressureZones);
      return findBestCoverForThreat(
        state.map,
        unit.position,
        threats.targetPosition,
        unit.behaviorRuntime.posture,
        searchRadiusMeters / state.map.metersPerCell,
      ).position;
    },
    tacticalCheck: (checkKind, blackboard) => evaluateTacticalCheck(state, unit, blackboard, checkKind),
  };
}

function applyGraphEffects(
  state: SimulationState,
  unit: UnitModel,
  effects: readonly AiGraphEffect[],
  blackboard: AiGraphRunnerBlackboard,
  nowMs: number,
): void {
  for (const effect of effects) {
    if (effect.type === 'write_memory') {
      getAiGraphMemory(unit)[effect.key] = effect.value;
      continue;
    }

    if (effect.type === 'set_posture') {
      applyPosture(unit, effect.posture);
      unit.behaviorRuntime.reason = effect.reasonRu ?? effect.reason;
      continue;
    }

    if (effect.type === 'set_action') {
      applyAction(state, unit, effect, blackboard);
      continue;
    }

    if (effect.type === 'set_movement_mode') {
      unit.behaviorRuntime.currentAction = `movement_mode:${effect.mode}`;
      unit.behaviorRuntime.reason = effect.reasonRu ?? effect.reason;
      unit.behaviorRuntime.lastEvent = 'ai_graph_set_movement_mode';
      continue;
    }

    if (effect.type === 'say_message') {
      unit.behaviorRuntime.aiSpeech = effect.message;
      unit.behaviorRuntime.aiSpeechRu = effect.messageRu ?? effect.message;
      unit.behaviorRuntime.aiSpeechUntilMs = nowMs + effect.durationSeconds * 1000;
      unit.behaviorRuntime.currentAction = 'say_message';
      unit.behaviorRuntime.reason = effect.messageRu ?? effect.message;
      unit.behaviorRuntime.lastEvent = 'ai_graph_say_message';
      continue;
    }

    unit.behaviorRuntime.reason = effect.reasonRu ?? effect.reason;
    unit.behaviorRuntime.lastEvent = 'ai_graph_write_reason';
  }
}

function applyAction(
  state: SimulationState,
  unit: UnitModel,
  effect: Extract<AiGraphEffect, { type: 'set_action' }>,
  blackboard: AiGraphRunnerBlackboard,
): void {
  if (effect.action === 'move_to') {
    const target = readPosition(blackboard[effect.targetKey ?? 'best_cover_position']);
    if (target) unit.order = createMoveOrder(clampGridPositionToMap(state.map, target));
  } else if (effect.action === 'retreat') {
    const target = readPosition(blackboard.retreat_position);
    if (target) unit.order = createMoveOrder(clampGridPositionToMap(state.map, target));
  } else if (effect.action === 'wait') {
    unit.order = null;
  } else if (effect.action === 'reload') {
    unit.behaviorRuntime.ammo = 30;
    unit.behaviorRuntime.weaponReady = true;
  } else if (effect.action === 'fire' || effect.action === 'suppress') {
    unit.behaviorRuntime.ammo = Math.max(0, unit.behaviorRuntime.ammo - 1);
    unit.behaviorRuntime.weaponReady = unit.behaviorRuntime.ammo > 0;
  }

  unit.behaviorRuntime.currentAction = effect.action;
  unit.behaviorRuntime.reason = effect.reasonRu ?? effect.reason;
  unit.behaviorRuntime.lastEvent = `ai_graph_${effect.action}`;
}

function applyPosture(unit: UnitModel, value: string): void {
  const nextPosture: UnitPosture = value === 'stand' ? 'standing' : value === 'crouch' ? 'crouched' : 'prone';
  if (unit.behaviorRuntime.posture !== nextPosture) {
    unit.behaviorRuntime.previousPosture = unit.behaviorRuntime.posture;
    unit.behaviorRuntime.posture = nextPosture;
    unit.behaviorRuntime.postureChangedBecause = `AI graph posture: ${value}`;
  }

  unit.behaviorRuntime.currentAction = `posture:${nextPosture}`;
  unit.behaviorRuntime.lastEvent = 'ai_graph_set_posture';
}

function publishRuntimeDebugTrace(
  state: SimulationState,
  unit: UnitModel,
  graph: AiGraph,
  result: AiGraphRunnerResult,
  nowMs: number,
  simulationNowMs: number,
  previewOnly: boolean,
): void {
  try {
    const payload = {
      version: 1,
      kind: 'ai-graph-runtime-debug',
      graphId: graph.id,
      graphName: graph.name,
      graphNameRu: graph.nameRu,
      graphNodeCount: graph.nodes.length,
      unitId: unit.id,
      unitLabel: unit.labels.ru ?? unit.labels.en,
      selectedBranchNodeId: result.selectedBranchNodeId,
      selectedBranchName: result.selectedBranchName,
      selectedBranchNameRu: result.selectedBranchNameRu,
      ok: result.ok,
      paused: isPaused(state),
      previewOnly,
      nowMs,
      simulationNowMs,
      explanation: result.explanation,
      explanationRu: result.explanationRu,
      trace: result.trace,
      scores: result.scores,
      effects: result.effects,
      blackboard: result.blackboard,
    };
    window.localStorage.setItem(DEBUG_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Debug overlay is optional. If localStorage is blocked or full, gameplay must continue.
  }
}

function evaluateTacticalCheck(
  state: SimulationState,
  unit: UnitModel,
  blackboard: AiGraphRunnerBlackboard,
  checkKind: string,
): boolean {
  if (checkKind === 'cover_exists') {
    const threats = evaluateThreatsAtPosition(state.map, unit, state.pressureZones);
    return Boolean(findBestCoverForThreat(state.map, unit.position, threats.targetPosition, unit.behaviorRuntime.posture).position);
  }
  if (checkKind === 'ammo_available') return readNumber(blackboard.ammo, 0) > 0;
  if (checkKind === 'can_execute_order') return Boolean(unit.order);
  if (checkKind === 'line_of_sight' || checkKind === 'line_of_fire') return readBoolean(blackboard.enemyVisible, false);
  if (checkKind === 'path_exists') return true;
  return false;
}

function resolveDistanceMeters(
  state: SimulationState,
  unit: UnitModel,
  blackboard: AiGraphRunnerBlackboard,
  fromKey: string,
  toKey: string,
): number {
  const from = resolvePoint(state, unit, blackboard, fromKey);
  const to = resolvePoint(state, unit, blackboard, toKey);
  if (!from || !to) return 9999;
  return distance(from, to) * state.map.metersPerCell;
}

function resolvePoint(
  state: SimulationState,
  unit: UnitModel,
  blackboard: AiGraphRunnerBlackboard,
  key: string,
): GridPosition | null {
  const threats = evaluateThreatsAtPosition(state.map, unit, state.pressureZones);
  if (key === 'self') return unit.position;
  if (key === 'cover') return findBestCoverForThreat(state.map, unit.position, threats.targetPosition, unit.behaviorRuntime.posture).position;
  if (key === 'orderPoint' || key === 'orderTarget') return unit.order?.target ?? null;
  if (key === 'currentTarget') return readPosition(blackboard.current_target);
  if (key === 'enemy') return readPosition(blackboard.remembered_enemy_position) ?? readPosition(blackboard.current_target);
  if (key === 'retreatPoint') return makeRetreatPoint(state.map, unit.position, threats.targetPosition);
  return readPosition(blackboard[key]);
}

function makeRetreatPoint(map: TacticalMap, position: GridPosition, threatPosition: GridPosition | null): GridPosition {
  if (!threatPosition) return clampGridPositionToMap(map, { x: position.x - 2, y: position.y });

  const dx = position.x - threatPosition.x;
  const dy = position.y - threatPosition.y;
  const length = Math.hypot(dx, dy) || 1;
  return clampGridPositionToMap(map, {
    x: position.x + (dx / length) * 2,
    y: position.y + (dy / length) * 2,
  });
}

function readRuntimeGraph(): AiGraph {
  const raw = readLocalStorageGraph();
  const parsed = raw ? safeJsonParse(raw) : null;
  return normalizeRuntimeGraph(parsed ?? bundledGraph);
}

function readLocalStorageGraph(): string | null {
  try {
    return window.localStorage.getItem(GRAPH_STORAGE_KEY);
  } catch {
    return null;
  }
}

function normalizeRuntimeGraph(value: unknown): AiGraph {
  if (!isRecord(value) || !Array.isArray(value.nodes)) return normalizeRuntimeGraph(bundledGraph);

  const nodes: AiNode[] = value.nodes
    .filter(isRecord)
    .map((node, index): AiNode => ({
      id: readString(node.id, `node_${index + 1}`),
      type: readString(node.type, 'Root'),
      displayName: typeof node.displayName === 'string' ? node.displayName : undefined,
      displayNameRu: typeof node.displayNameRu === 'string' ? node.displayNameRu : undefined,
      description: typeof node.description === 'string' ? node.description : undefined,
      descriptionRu: typeof node.descriptionRu === 'string' ? node.descriptionRu : undefined,
      children: Array.isArray(node.children) ? node.children.filter((child): child is string => typeof child === 'string') : [],
      parameters: isRecord(node.parameters) ? normalizeBlackboard(node.parameters) : {},
    }));

  return {
    version: 1,
    id: readString(value.id, 'soldier_runtime_graph'),
    name: readString(value.name, 'Soldier Runtime Graph'),
    nameRu: typeof value.nameRu === 'string' ? value.nameRu : undefined,
    description: typeof value.description === 'string' ? value.description : undefined,
    descriptionRu: typeof value.descriptionRu === 'string' ? value.descriptionRu : undefined,
    rootNodeId: readString(value.rootNodeId, nodes[0]?.id ?? 'root'),
    blackboardDefaults: isRecord(value.blackboardDefaults) ? normalizeBlackboard(value.blackboardDefaults) : {},
    nodes,
  };
}

function normalizeBlackboard(value: Record<string, unknown>): AiGraphRunnerBlackboard {
  const result: AiGraphRunnerBlackboard = {};
  for (const [key, item] of Object.entries(value)) {
    if (isGraphValue(item)) result[key] = item;
  }
  return result;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function readPosition(value: AiBlackboardValue | undefined): GridPosition | null {
  if (!isRecord(value) || typeof value.x !== 'number' || typeof value.y !== 'number') return null;
  return { x: value.x, y: value.y };
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function readNumber(value: AiBlackboardValue | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readBoolean(value: AiBlackboardValue | undefined, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function isGraphValue(value: unknown): value is AiBlackboardValue {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value) || readPosition(value as AiBlackboardValue) !== null;
}

function isPaused(state: SimulationState): boolean {
  return Boolean((state as PausableSimulationState).paused);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
