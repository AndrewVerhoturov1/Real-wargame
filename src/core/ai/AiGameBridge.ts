import { clampPercent, type UnitPosture } from '../behavior/BehaviorModel';
import { distance, type GridPosition } from '../geometry';
import { clampGridPositionToMap, type MapObject, type TacticalMap } from '../map/MapModel';
import { createMoveOrder } from '../orders/MoveOrder';
import { getPressureReportAtPosition } from '../pressure/PressureZone';
import type { SimulationState } from '../simulation/SimulationState';
import type { UnitModel } from '../units/UnitModel';
import bundledGraph from '../../data/ai/soldier_default_survival_graph.json';

const GRAPH_STORAGE_KEY = 'real-wargame.ai-node-editor.graph.v6';
const AI_GRAPH_TICK_INTERVAL_MS = 600;
const DEFAULT_SPEECH_DURATION_SECONDS = 2;
const COVER_SEARCH_RADIUS_CELLS = 5;

export interface AiGameBridgeHandle {
  destroy(): void;
  tickNow(): void;
}

type JsonPrimitive = string | number | boolean | null;
type JsonPosition = { x: number; y: number };
type JsonValue = JsonPrimitive | JsonPosition;
type JsonObject = Record<string, JsonValue>;

interface RuntimeAiNode {
  id: string;
  type: string;
  children?: string[];
  parameters?: JsonObject;
  displayName?: string;
  displayNameRu?: string;
}

interface RuntimeAiGraph {
  id: string;
  rootNodeId: string;
  blackboardDefaults?: JsonObject;
  nodes: RuntimeAiNode[];
}

interface NodeExecutionContext {
  state: SimulationState;
  unit: UnitModel;
  graph: RuntimeAiGraph;
  nodesById: Map<string, RuntimeAiNode>;
  blackboard: JsonObject;
  nowMs: number;
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

  const graph = readRuntimeGraph();
  const root = graph.nodes.find((node) => node.id === graph.rootNodeId);
  if (!root) {
    unit.behaviorRuntime.aiGraphReason = 'AI graph root is missing.';
    unit.behaviorRuntime.reason = 'AI graph root is missing.';
    return;
  }

  unit.behaviorRuntime.aiGraphLastTickMs = nowMs;
  const context: NodeExecutionContext = {
    state,
    unit,
    graph,
    nodesById: new Map(graph.nodes.map((node) => [node.id, node])),
    blackboard: buildBlackboardForUnit(state, unit),
    nowMs,
  };

  const passed = tickAiGraphForUnit(context, root);
  unit.behaviorRuntime.aiGraphReason = passed
    ? `AI graph ${graph.id} passed for ${unit.id}.`
    : `AI graph ${graph.id} did not produce an action for ${unit.id}.`;
}

export function tickAiGraphForUnit(context: NodeExecutionContext, node: RuntimeAiNode): boolean {
  const visited = new Set<string>();
  return executeNode(context, node, visited);
}

export function buildBlackboardForUnit(state: SimulationState, unit: UnitModel): JsonObject {
  const pressure = getPressureReportAtPosition(unit.position, state.pressureZones);
  const nearestCover = findNearestCover(state.map, unit.position);
  const distanceToCover = nearestCover.distanceCells * state.map.metersPerCell;
  const hasOrder = Boolean(unit.order);
  const enemyVisible = Boolean(pressure && pressure.rawPressure > 0);
  const underFire = unit.behaviorRuntime.danger > 0 || Boolean(pressure);

  return {
    ...(isRecord(bundledGraph.blackboardDefaults) ? bundledGraph.blackboardDefaults : {}),
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
    best_cover_position: nearestCover.position,
    current_target: null,
    remembered_enemy_position: null,
  };
}

function executeNode(context: NodeExecutionContext, node: RuntimeAiNode, visited: Set<string>): boolean {
  if (visited.has(node.id)) {
    context.unit.behaviorRuntime.reason = `AI graph loop stopped at ${node.id}.`;
    return false;
  }

  visited.add(node.id);

  if (!cooldownAllowsNode(context, node)) {
    return false;
  }

  const result = executeNodeOwnLogic(context, node);
  if (!result) {
    return false;
  }

  armAfterCooldown(context, node);

  const children = node.children ?? [];
  if (children.length === 0) {
    return true;
  }

  if (node.type === 'Selector' || node.type === 'UtilitySelector') {
    return children.some((childId) => {
      const child = context.nodesById.get(childId);
      return child ? executeNode(context, child, new Set(visited)) : false;
    });
  }

  for (const childId of children) {
    const child = context.nodesById.get(childId);
    if (!child || !executeNode(context, child, new Set(visited))) {
      return false;
    }
  }

  return true;
}

function executeNodeOwnLogic(context: NodeExecutionContext, node: RuntimeAiNode): boolean {
  const parameters = node.parameters ?? {};

  switch (node.type) {
    case 'Root':
    case 'Sequence':
    case 'Selector':
    case 'UtilitySelector':
    case 'ActionBranch':
      return true;
    case 'FlagCheck':
      return readBoolean(context.blackboard[readString(parameters.flagKey, '')]) === readBoolean(parameters.expected, true);
    case 'BlackboardValueAbove':
      return compareNumber(
        readNumber(context.blackboard[readString(parameters.sourceKey, 'danger')], 0),
        readNumber(parameters.threshold, 50),
        readString(parameters.comparison, 'above'),
      );
    case 'DistanceCheck': {
      const meters = resolveDistanceMeters(context, readString(parameters.from, 'self'), readString(parameters.to, 'cover'));
      const threshold = readNumber(parameters.thresholdMeters, 30);
      return readString(parameters.comparison, 'closer') === 'farther' ? meters > threshold : meters < threshold;
    }
    case 'TacticalCheck':
      return evaluateTacticalCheck(context, parameters) === readBoolean(parameters.expected, true);
    case 'FindBestObject':
      applyFindBestObject(context, parameters);
      return true;
    case 'WriteMemory':
      context.blackboard[readString(parameters.writeTo, 'current_goal')] = normalizeJsonValue(parameters.value ?? null);
      return true;
    case 'CopyMemory': {
      const fromKey = readString(parameters.fromKey, '');
      const toKey = readString(parameters.toKey, '');
      if (!fromKey || !toKey) return false;
      context.blackboard[toKey] = normalizeJsonValue(context.blackboard[fromKey] ?? null);
      return true;
    }
    case 'SetPosture':
      applyPosture(context.unit, readString(parameters.posture, 'prone'));
      return true;
    case 'SetAction':
      applyAction(context, parameters);
      return true;
    case 'SetMovementMode':
      context.unit.behaviorRuntime.currentAction = `movement_mode:${readString(parameters.mode, 'careful')}`;
      context.unit.behaviorRuntime.reason = `AI graph movement mode: ${readString(parameters.mode, 'careful')}`;
      return true;
    case 'SayMessage':
      applySayMessage(context, parameters);
      return true;
    case 'WriteReason':
      context.unit.behaviorRuntime.reason = readString(parameters.reasonRu, readString(parameters.reason, 'AI graph explanation.'));
      return true;
    case 'ParameterScore':
    case 'DistanceScore':
    case 'DecisionInertia':
    case 'RandomChance':
    case 'SelectTarget':
    case 'ForbidAction':
    case 'StableThreshold':
      context.unit.behaviorRuntime.aiGraphReason = `${node.type} is accepted by the game bridge but not used as a live action yet.`;
      return true;
    default:
      context.unit.behaviorRuntime.reason = `Unsupported AI node in game bridge: ${node.type}`;
      return false;
  }
}

function cooldownAllowsNode(context: NodeExecutionContext, node: RuntimeAiNode): boolean {
  const parameters = node.parameters ?? {};
  const seconds = readNumber(parameters.cooldownSeconds, 0);
  if (seconds <= 0) {
    return true;
  }

  const readyAt = context.unit.behaviorRuntime.aiNodeCooldowns[node.id] ?? 0;
  if (context.nowMs < readyAt) {
    return false;
  }

  if (readString(parameters.cooldownTiming, 'after') === 'before' && readyAt === 0) {
    context.unit.behaviorRuntime.aiNodeCooldowns[node.id] = context.nowMs + seconds * 1000;
    return false;
  }

  return true;
}

function armAfterCooldown(context: NodeExecutionContext, node: RuntimeAiNode): void {
  const parameters = node.parameters ?? {};
  const seconds = readNumber(parameters.cooldownSeconds, 0);
  if (seconds <= 0 || readString(parameters.cooldownTiming, 'after') !== 'after') {
    return;
  }

  context.unit.behaviorRuntime.aiNodeCooldowns[node.id] = context.nowMs + seconds * 1000;
}

function applyAction(context: NodeExecutionContext, parameters: JsonObject): void {
  const action = readString(parameters.action, 'wait');
  const unit = context.unit;

  if (action === 'move_to') {
    const target = readPosition(context.blackboard[readString(parameters.targetKey, 'best_cover_position')]);
    if (target) {
      unit.order = createMoveOrder(clampGridPositionToMap(context.state.map, target));
      unit.behaviorRuntime.currentAction = 'move_to';
      unit.behaviorRuntime.reason = 'AI graph action: move_to.';
      unit.behaviorRuntime.lastEvent = 'ai_graph_move_to';
    }
    return;
  }

  if (action === 'continue_order') {
    unit.behaviorRuntime.currentAction = 'continue_order';
    unit.behaviorRuntime.reason = 'AI graph action: continue order.';
    unit.behaviorRuntime.lastEvent = 'ai_graph_continue_order';
    return;
  }

  if (action === 'wait') {
    unit.order = null;
  }

  unit.behaviorRuntime.currentAction = action;
  unit.behaviorRuntime.reason = `AI graph action: ${action}.`;
  unit.behaviorRuntime.lastEvent = `ai_graph_${action}`;
}

function applyPosture(unit: UnitModel, value: string): void {
  const nextPosture: UnitPosture = value === 'stand' ? 'standing' : value === 'crouch' ? 'crouched' : 'prone';
  if (unit.behaviorRuntime.posture !== nextPosture) {
    unit.behaviorRuntime.previousPosture = unit.behaviorRuntime.posture;
    unit.behaviorRuntime.posture = nextPosture;
    unit.behaviorRuntime.postureChangedBecause = `AI graph posture: ${value}`;
  }

  unit.behaviorRuntime.currentAction = `posture:${nextPosture}`;
  unit.behaviorRuntime.reason = `AI graph set posture: ${nextPosture}.`;
  unit.behaviorRuntime.lastEvent = 'ai_graph_set_posture';
}

function applySayMessage(context: NodeExecutionContext, parameters: JsonObject): void {
  const durationSeconds = Math.max(0.2, readNumber(parameters.durationSeconds, DEFAULT_SPEECH_DURATION_SECONDS));
  context.unit.behaviorRuntime.aiSpeech = readString(parameters.message, readString(parameters.messageRu, ''));
  context.unit.behaviorRuntime.aiSpeechRu = readString(parameters.messageRu, context.unit.behaviorRuntime.aiSpeech ?? '');
  context.unit.behaviorRuntime.aiSpeechUntilMs = context.nowMs + durationSeconds * 1000;
  context.unit.behaviorRuntime.currentAction = 'say_message';
  context.unit.behaviorRuntime.reason = context.unit.behaviorRuntime.aiSpeechRu ?? 'AI graph speech.';
  context.unit.behaviorRuntime.lastEvent = 'ai_graph_say_message';
}

function applyFindBestObject(context: NodeExecutionContext, parameters: JsonObject): void {
  const objectKind = readString(parameters.objectKind, 'cover');
  if (objectKind === 'cover') {
    const found = findNearestCover(context.state.map, context.unit.position, readNumber(parameters.searchRadiusMeters, COVER_SEARCH_RADIUS_CELLS * context.state.map.metersPerCell) / context.state.map.metersPerCell);
    if (found.position) {
      context.blackboard[readString(parameters.writeTo, 'best_object')] = found.position;
      context.blackboard.best_cover_position = found.position;
      context.blackboard.distanceToCover = Math.round(found.distanceCells * context.state.map.metersPerCell);
    }
  }
}

function evaluateTacticalCheck(context: NodeExecutionContext, parameters: JsonObject): boolean {
  const checkKind = readString(parameters.checkKind, 'cover_exists');
  if (checkKind === 'cover_exists') {
    return Boolean(findNearestCover(context.state.map, context.unit.position).position);
  }

  if (checkKind === 'ammo_available') {
    return readNumber(context.blackboard.ammo, 0) > 0;
  }

  if (checkKind === 'can_execute_order') {
    return Boolean(context.unit.order);
  }

  if (checkKind === 'line_of_sight' || checkKind === 'line_of_fire') {
    return readBoolean(context.blackboard.enemyVisible, false);
  }

  if (checkKind === 'path_exists') {
    return true;
  }

  return false;
}

function resolveDistanceMeters(context: NodeExecutionContext, fromKey: string, toKey: string): number {
  const from = resolvePoint(context, fromKey);
  const to = resolvePoint(context, toKey);
  if (!from || !to) {
    return 9999;
  }

  return distance(from, to) * context.state.map.metersPerCell;
}

function resolvePoint(context: NodeExecutionContext, key: string): GridPosition | null {
  if (key === 'self') return context.unit.position;
  if (key === 'cover') return findNearestCover(context.state.map, context.unit.position).position;
  if (key === 'orderPoint' || key === 'orderTarget') return context.unit.order?.target ?? null;
  if (key === 'currentTarget') return readPosition(context.blackboard.current_target);
  if (key === 'retreatPoint') return makeRetreatPoint(context.state.map, context.unit.position);
  return null;
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

function readRuntimeGraph(): RuntimeAiGraph {
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

function normalizeRuntimeGraph(value: unknown): RuntimeAiGraph {
  if (!isRecord(value) || !Array.isArray(value.nodes)) {
    return normalizeRuntimeGraph(bundledGraph);
  }

  const nodes = value.nodes
    .filter(isRecord)
    .map((node, index): RuntimeAiNode => ({
      id: readString(node.id, `node_${index + 1}`),
      type: readString(node.type, 'Root'),
      displayName: typeof node.displayName === 'string' ? node.displayName : undefined,
      displayNameRu: typeof node.displayNameRu === 'string' ? node.displayNameRu : undefined,
      children: Array.isArray(node.children) ? node.children.filter((child): child is string => typeof child === 'string') : [],
      parameters: isRecord(node.parameters) ? normalizeJsonObject(node.parameters) : {},
    }));

  return {
    id: readString(value.id, 'soldier_runtime_graph'),
    rootNodeId: readString(value.rootNodeId, nodes[0]?.id ?? 'root'),
    blackboardDefaults: isRecord(value.blackboardDefaults) ? normalizeJsonObject(value.blackboardDefaults) : {},
    nodes,
  };
}

function normalizeJsonObject(value: Record<string, unknown>): JsonObject {
  const result: JsonObject = {};
  for (const [key, item] of Object.entries(value)) {
    if (isJsonValue(item)) {
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

function compareNumber(value: number, threshold: number, comparison: string): boolean {
  return comparison === 'below' ? value < threshold : value > threshold;
}

function readPosition(value: unknown): GridPosition | null {
  if (!isRecord(value) || typeof value.x !== 'number' || typeof value.y !== 'number') {
    return null;
  }

  return { x: value.x, y: value.y };
}

function normalizeJsonValue(value: unknown): JsonValue {
  return isJsonValue(value) ? value : null;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function isJsonValue(value: unknown): value is JsonValue {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value) || readPosition(value) !== null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
