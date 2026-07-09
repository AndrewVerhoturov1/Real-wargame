import { clampPercent, type UnitPosture } from '../behavior/BehaviorModel';
import { distance, type GridPosition } from '../geometry';
import { clampGridPositionToMap, type MapObject, type TacticalMap } from '../map/MapModel';
import { createMoveOrder } from '../orders/MoveOrder';
import { getPressureReportAtPosition } from '../pressure/PressureZone';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';
import type { AiBlackboardValue } from './AiBlackboard';
import type { AiGraph, AiNode } from './AiGraph';
import {
  runAiGraph,
  type AiGraphEffect,
  type AiGraphRunnerBlackboard,
  type AiGraphTacticalHost,
} from './AiGraphRunner';
import bundledGraph from '../../data/ai/soldier_default_survival_graph.json';

const GRAPH_STORAGE_KEY = 'real-wargame.ai-node-editor.graph.v6';
const AI_GRAPH_TICK_INTERVAL_MS = 600;
const COVER_SEARCH_RADIUS_CELLS = 5;

export interface AiGameBridgeHandle {
  destroy(): void;
  tickNow(): void;
}

interface NearestCoverResult {
  object: MapObject | null;
  position: GridPosition | null;
  distanceCells: number;
}

export function installAiGameBridge(state: SimulationState): AiGameBridgeHandle {
  const handle = window.setInterval(() => tickAiGameBridge(state), AI_GRAPH_TICK_INTERVAL_MS);

  return {
    destroy: () => window.clearInterval(handle),
    tickNow: () => tickAiGameBridge(state),
  };
}

export function tickAiGameBridge(state: SimulationState, nowMs = Date.now()): void {
  const unit = state.selectedUnitId
    ? state.units.find((candidate) => candidate.id === state.selectedUnitId)
    : undefined;

  if (!unit || state.editor.enabled) {
    return;
  }

  if (nowMs - unit.behaviorRuntime.aiGraphLastTickMs < AI_GRAPH_TICK_INTERVAL_MS) {
    return;
  }

  unit.behaviorRuntime.aiGraphLastTickMs = nowMs;
  const graph = readRuntimeGraph();
  const result = runAiGraph({
    graph,
    unitId: unit.id,
    blackboard: buildBlackboardForUnit(state, unit),
    cooldowns: unit.behaviorRuntime.aiNodeCooldowns,
    nowMs,
    tacticalHost: createTacticalHost(state, unit),
  });

  unit.behaviorRuntime.aiNodeCooldowns = { ...result.cooldowns };
  applyGraphEffects(state, unit, result.effects, result.blackboard, nowMs);
  unit.behaviorRuntime.aiGraphReason = result.explanationRu ?? result.explanation;
  unit.behaviorRuntime.reason = result.explanationRu ?? result.explanation;
  unit.behaviorRuntime.lastEvent = result.ok ? 'ai_graph_runner_tick' : 'ai_graph_runner_no_branch';
}

export function buildBlackboardForUnit(state: SimulationState, unit: UnitModel): AiGraphRunnerBlackboard {
  const pressure = getPressureReportAtPosition(unit.position, state.pressureZones);
  const nearestCover = findNearestCover(state.map, unit.position);
  const distanceToCover = nearestCover.distanceCells * state.map.metersPerCell;
  const hasOrder = Boolean(unit.order);
  const enemyVisible = Boolean(pressure && pressure.rawPressure > 0);
  const underFire = unit.behaviorRuntime.danger > 0 || Boolean(pressure);

  return {
    ...(isRecord(bundledGraph.blackboardDefaults) ? normalizeBlackboard(bundledGraph.blackboardDefaults) : {}),
    ...getAiGraphMemory(unit),
    danger: clampPercent(Math.round(unit.behaviorRuntime.danger)),
    stress: clampPercent(Math.round(unit.behaviorRuntime.stress)),
    suppression: clampPercent(Math.round(pressure?.rawPressure ?? unit.behaviorRuntime.rawDanger ?? 0)),
    fatigue: clampPercent(Math.round(unit.soldier.condition.fatigue)),
    morale: clampPercent(Math.round(unit.soldier.condition.morale)),
    health: clampPercent(Math.round(unit.soldier.condition.health)),
    ammo: 30,
    distanceToCover: Number.isFinite(distanceToCover) ? Math.round(distanceToCover) : 9999,
    enemyVisible,
    enemyKnown: enemyVisible,
    underFire,
    hasOrder,
    isInCover: nearestCover.distanceCells <= 0.9,
    weaponReady: true,
    current_action: unit.behaviorRuntime.currentAction,
    self_position: unit.position,
    order_target_position: unit.order?.target ?? null,
    retreat_position: makeRetreatPoint(state.map, unit.position),
    best_cover_position: nearestCover.position,
    current_target: null,
    remembered_enemy_position: null,
  };
}

function getAiGraphMemory(unit: UnitModel): AiGraphRunnerBlackboard {
  const runtime = unit.behaviorRuntime as typeof unit.behaviorRuntime & { aiGraphMemory?: AiGraphRunnerBlackboard };
  if (!runtime.aiGraphMemory) {
    runtime.aiGraphMemory = {};
  }
  return runtime.aiGraphMemory;
}

function createTacticalHost(state: SimulationState, unit: UnitModel): AiGraphTacticalHost {
  return {
    resolveDistanceMeters: (fromKey, toKey, blackboard) => resolveDistanceMeters(state, unit, blackboard, fromKey, toKey),
    findBestObject: (objectKind, _criteria, searchRadiusMeters) => {
      if (objectKind !== 'cover') return null;
      const radiusCells = searchRadiusMeters / state.map.metersPerCell;
      return findNearestCover(state.map, unit.position, radiusCells).position;
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
    if (target) {
      unit.order = createMoveOrder(clampGridPositionToMap(state.map, target));
      unit.behaviorRuntime.currentAction = 'move_to';
      unit.behaviorRuntime.reason = effect.reasonRu ?? effect.reason;
      unit.behaviorRuntime.lastEvent = 'ai_graph_move_to';
    }
    return;
  }

  if (effect.action === 'continue_order') {
    unit.behaviorRuntime.currentAction = 'continue_order';
    unit.behaviorRuntime.reason = effect.reasonRu ?? effect.reason;
    unit.behaviorRuntime.lastEvent = 'ai_graph_continue_order';
    return;
  }

  if (effect.action === 'wait') {
    unit.order = null;
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

function evaluateTacticalCheck(
  state: SimulationState,
  unit: UnitModel,
  blackboard: AiGraphRunnerBlackboard,
  checkKind: string,
): boolean {
  if (checkKind === 'cover_exists') {
    return Boolean(findNearestCover(state.map, unit.position).position);
  }

  if (checkKind === 'ammo_available') {
    return readNumber(blackboard.ammo, 0) > 0;
  }

  if (checkKind === 'can_execute_order') {
    return Boolean(unit.order);
  }

  if (checkKind === 'line_of_sight' || checkKind === 'line_of_fire') {
    return readBoolean(blackboard.enemyVisible, false);
  }

  if (checkKind === 'path_exists') {
    return true;
  }

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
  if (!from || !to) {
    return 9999;
  }

  return distance(from, to) * state.map.metersPerCell;
}

function resolvePoint(
  state: SimulationState,
  unit: UnitModel,
  blackboard: AiGraphRunnerBlackboard,
  key: string,
): GridPosition | null {
  if (key === 'self') return unit.position;
  if (key === 'cover') return findNearestCover(state.map, unit.position).position;
  if (key === 'orderPoint' || key === 'orderTarget') return unit.order?.target ?? null;
  if (key === 'currentTarget') return readPosition(blackboard.current_target);
  if (key === 'enemy') return readPosition(blackboard.remembered_enemy_position) ?? readPosition(blackboard.current_target);
  if (key === 'retreatPoint') return makeRetreatPoint(state.map, unit.position);
  return readPosition(blackboard[key]);
}

function findNearestCover(map: TacticalMap, position: GridPosition, radiusCells = COVER_SEARCH_RADIUS_CELLS): NearestCoverResult {
  let bestObject: MapObject | null = null;
  let bestPosition: GridPosition | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const object of map.objects) {
    if (!isCoverLikeObject(object)) {
      continue;
    }

    const objectPosition = {
      x: object.x + object.widthCells / 2,
      y: object.y + object.heightCells / 2,
    };
    const currentDistance = distance(position, objectPosition);
    if (currentDistance < bestDistance && currentDistance <= radiusCells) {
      bestDistance = currentDistance;
      bestObject = object;
      bestPosition = objectPosition;
    }
  }

  return {
    object: bestObject,
    position: bestPosition,
    distanceCells: Number.isFinite(bestDistance) ? bestDistance : 9999,
  };
}

function isCoverLikeObject(object: MapObject): boolean {
  return ['cover', 'rock', 'structure', 'ditch', 'crates', 'fence', 'logs', 'tree'].includes(object.kind);
}

function makeRetreatPoint(map: TacticalMap, position: GridPosition): GridPosition {
  return clampGridPositionToMap(map, { x: position.x - 2, y: position.y });
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
  if (!isRecord(value) || !Array.isArray(value.nodes)) {
    return normalizeRuntimeGraph(bundledGraph);
  }

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
    if (isGraphValue(item)) {
      result[key] = item;
    }
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
  if (!isRecord(value) || typeof value.x !== 'number' || typeof value.y !== 'number') {
    return null;
  }

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
