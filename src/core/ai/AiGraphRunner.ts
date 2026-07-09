import { distance, type GridPosition } from '../geometry';
import type { AiBlackboardValue } from './AiBlackboard';
import type { AiBranchScore, AiGraph, AiNode, AiNodeId, ScoreBreakdownItem } from './AiGraph';

export type AiGraphRunnerBlackboard = Record<string, AiBlackboardValue>;

export type AiGraphEffect =
  | {
      readonly type: 'set_posture';
      readonly posture: 'stand' | 'crouch' | 'prone';
      readonly reason: string;
      readonly reasonRu?: string;
    }
  | {
      readonly type: 'set_action';
      readonly action: string;
      readonly targetKey?: string;
      readonly reason: string;
      readonly reasonRu?: string;
    }
  | {
      readonly type: 'set_movement_mode';
      readonly mode: string;
      readonly reason: string;
      readonly reasonRu?: string;
    }
  | {
      readonly type: 'say_message';
      readonly message: string;
      readonly messageRu?: string;
      readonly durationSeconds: number;
    }
  | {
      readonly type: 'write_reason';
      readonly reason: string;
      readonly reasonRu?: string;
    }
  | {
      readonly type: 'write_memory';
      readonly key: string;
      readonly value: AiBlackboardValue;
    };

export interface AiGraphTraceItem {
  readonly nodeId: AiNodeId;
  readonly nodeType: string;
  readonly status: 'pass' | 'fail' | 'skip' | 'select' | 'veto';
  readonly reason: string;
  readonly reasonRu?: string;
}

export interface AiGraphTacticalHost {
  readonly resolveDistanceMeters?: (fromKey: string, toKey: string, blackboard: AiGraphRunnerBlackboard) => number;
  readonly findBestObject?: (
    objectKind: string,
    criteria: string,
    searchRadiusMeters: number,
    blackboard: AiGraphRunnerBlackboard,
  ) => AiBlackboardValue | null;
  readonly tacticalCheck?: (checkKind: string, blackboard: AiGraphRunnerBlackboard) => boolean;
}

export interface AiGraphRunnerInput {
  readonly graph: AiGraph;
  readonly unitId: string;
  readonly blackboard: AiGraphRunnerBlackboard;
  readonly cooldowns?: Record<string, number>;
  readonly nowMs: number;
  readonly tacticalHost?: AiGraphTacticalHost;
}

export interface AiGraphRunnerResult {
  readonly ok: boolean;
  readonly unitId: string;
  readonly graphId: string;
  readonly selectedBranchNodeId: AiNodeId;
  readonly selectedBranchName: string;
  readonly selectedBranchNameRu?: string;
  readonly scores: readonly AiBranchScore[];
  readonly effects: readonly AiGraphEffect[];
  readonly blackboard: AiGraphRunnerBlackboard;
  readonly cooldowns: Record<string, number>;
  readonly trace: readonly AiGraphTraceItem[];
  readonly explanation: string;
  readonly explanationRu?: string;
}

interface ExecutionContext {
  graph: AiGraph;
  unitId: string;
  nodesById: Map<AiNodeId, AiNode>;
  blackboard: AiGraphRunnerBlackboard;
  cooldowns: Record<string, number>;
  nowMs: number;
  tacticalHost?: AiGraphTacticalHost;
  effects: AiGraphEffect[];
  scores: AiBranchScore[];
  trace: AiGraphTraceItem[];
  selectedBranch?: AiNode;
}

interface BranchContext extends ExecutionContext {
  score: number;
  breakdown: ScoreBreakdownItem[];
  vetoed: boolean;
  vetoReason?: string;
  vetoReasonRu?: string;
  forbiddenActions: Map<string, { reason: string; reasonRu?: string }>;
  candidateActions: string[];
}

interface BranchResult {
  readonly passed: boolean;
  readonly score: AiBranchScore;
  readonly effects: readonly AiGraphEffect[];
  readonly blackboard: AiGraphRunnerBlackboard;
  readonly cooldowns: Record<string, number>;
  readonly trace: readonly AiGraphTraceItem[];
  readonly selectedBranch: AiNode;
}

export function runAiGraph(input: AiGraphRunnerInput): AiGraphRunnerResult {
  const nodesById = new Map(input.graph.nodes.map((node) => [node.id, node]));
  const root = nodesById.get(input.graph.rootNodeId);
  const context: ExecutionContext = {
    graph: input.graph,
    unitId: input.unitId,
    nodesById,
    blackboard: cloneBlackboard(input.blackboard),
    cooldowns: { ...(input.cooldowns ?? {}) },
    nowMs: input.nowMs,
    tacticalHost: input.tacticalHost,
    effects: [],
    scores: [],
    trace: [],
  };

  if (!root) {
    return makeResult(context, false, input.graph.rootNodeId, 'AI graph root is missing.', 'Корневая нода AI-графа не найдена.');
  }

  const passed = executeNode(context, root, new Set<AiNodeId>());
  const selected = context.selectedBranch ?? root;
  const explanation = passed
    ? context.effects.length > 0
      ? `AI graph ${input.graph.id} passed and produced ${context.effects.length} effect(s).`
      : `AI graph ${input.graph.id} passed but produced no effects.`
    : `AI graph ${input.graph.id} did not produce a valid branch.`;
  const explanationRu = passed
    ? context.effects.length > 0
      ? `AI-граф ${input.graph.id} прошёл и выдал эффектов: ${context.effects.length}.`
      : `AI-граф ${input.graph.id} прошёл, но не выдал эффектов.`
    : `AI-граф ${input.graph.id} не нашёл рабочую ветку.`;

  return makeResult(context, passed, selected.id, explanation, explanationRu, selected);
}

function executeNode(context: ExecutionContext, node: AiNode, visited: Set<AiNodeId>): boolean {
  if (visited.has(node.id)) {
    pushTrace(context, node, 'fail', `Loop stopped at ${node.id}.`, `Цикл остановлен на ноде ${node.id}.`);
    return false;
  }

  visited.add(node.id);

  if (node.type === 'UtilitySelector') {
    return executeUtilitySelector(context, node, visited);
  }

  if (!cooldownAllowsNode(context, node)) {
    pushTrace(context, node, 'skip', 'Node cooldown is active.', 'Задержка ноды ещё активна.');
    return false;
  }

  if (node.type === 'Selector') {
    const selected = executeFirstPassingChild(context, node, visited);
    if (selected) armAfterCooldown(context, node);
    return selected;
  }

  const ownPassed = executeNodeOwnLogic(context, node);
  if (!ownPassed) {
    pushTrace(context, node, 'fail', `Node ${node.id} failed.`, `Нода ${node.id} не прошла.`);
    return false;
  }

  armAfterCooldown(context, node);
  pushTrace(context, node, 'pass', `Node ${node.id} passed.`, `Нода ${node.id} прошла.`);

  for (const childId of node.children ?? []) {
    const child = context.nodesById.get(childId);
    if (!child || !executeNode(context, child, new Set(visited))) {
      return false;
    }
  }

  return true;
}

function executeUtilitySelector(context: ExecutionContext, node: AiNode, visited: Set<AiNodeId>): boolean {
  if (!cooldownAllowsNode(context, node)) {
    pushTrace(context, node, 'skip', 'UtilitySelector cooldown is active.', 'Задержка UtilitySelector ещё активна.');
    return false;
  }

  const branchResults: BranchResult[] = [];
  for (const childId of node.children ?? []) {
    const child = context.nodesById.get(childId);
    if (!child) continue;
    branchResults.push(evaluateBranch(context, child, visited));
  }

  context.scores.push(...branchResults.map((result) => result.score));
  const winner = branchResults
    .filter((result) => result.passed && !result.score.vetoed)
    .sort((a, b) => b.score.score - a.score.score)[0];

  if (!winner) {
    pushTrace(context, node, 'fail', 'UtilitySelector found no passing branch.', 'UtilitySelector не нашёл подходящую ветку.');
    return false;
  }

  context.effects.push(...winner.effects);
  context.blackboard = cloneBlackboard(winner.blackboard);
  context.cooldowns = { ...winner.cooldowns };
  context.trace.push(...winner.trace);
  context.selectedBranch = winner.selectedBranch;
  armAfterCooldown(context, node);
  pushTrace(
    context,
    node,
    'select',
    `UtilitySelector selected ${winner.score.branchName} with score ${roundScore(winner.score.score)}.`,
    `UtilitySelector выбрал «${winner.score.branchNameRu ?? winner.score.branchName}» с оценкой ${roundScore(winner.score.score)}.`,
  );
  return true;
}

function executeFirstPassingChild(context: ExecutionContext, node: AiNode, visited: Set<AiNodeId>): boolean {
  for (const childId of node.children ?? []) {
    const child = context.nodesById.get(childId);
    if (child && executeNode(context, child, new Set(visited))) {
      context.selectedBranch = child;
      pushTrace(context, node, 'select', `Selector selected ${child.id}.`, `Selector выбрал ${child.id}.`);
      return true;
    }
  }

  pushTrace(context, node, 'fail', 'Selector found no passing child.', 'Selector не нашёл рабочий дочерний шаг.');
  return false;
}

function evaluateBranch(parent: ExecutionContext, branchNode: AiNode, visited: Set<AiNodeId>): BranchResult {
  const context: BranchContext = {
    ...parent,
    blackboard: cloneBlackboard(parent.blackboard),
    cooldowns: { ...parent.cooldowns },
    effects: [],
    scores: [],
    trace: [],
    score: 0,
    breakdown: [],
    vetoed: false,
    forbiddenActions: new Map<string, { reason: string; reasonRu?: string }>(),
    candidateActions: [],
  };

  const passed = evaluateBranchNode(context, branchNode, new Set(visited));
  applyLateForbidActionVeto(context);
  const branchScore: AiBranchScore = {
    branchNodeId: branchNode.id,
    branchName: nodeName(branchNode),
    branchNameRu: nodeNameRu(branchNode),
    score: roundScore(context.score),
    breakdown: context.breakdown,
    vetoed: context.vetoed,
    vetoReason: context.vetoReason,
    vetoReasonRu: context.vetoReasonRu,
  };

  return {
    passed: passed && !context.vetoed,
    score: branchScore,
    effects: context.effects,
    blackboard: context.blackboard,
    cooldowns: context.cooldowns,
    trace: context.trace,
    selectedBranch: branchNode,
  };
}

function evaluateBranchNode(context: BranchContext, node: AiNode, visited: Set<AiNodeId>): boolean {
  if (visited.has(node.id)) {
    pushTrace(context, node, 'fail', `Loop stopped at ${node.id}.`, `Цикл остановлен на ноде ${node.id}.`);
    return false;
  }

  visited.add(node.id);

  if (!cooldownAllowsNode(context, node)) {
    pushTrace(context, node, 'skip', 'Node cooldown is active.', 'Задержка ноды ещё активна.');
    return false;
  }

  if (node.type === 'Selector') {
    const selected = evaluateFirstPassingBranchChild(context, node, visited);
    if (selected) armAfterCooldown(context, node);
    return selected;
  }

  if (node.type === 'ParameterScore' || node.type === 'DistanceScore' || node.type === 'DecisionInertia' || node.type === 'RandomChance') {
    applyScoreNode(context, node);
    armAfterCooldown(context, node);
    pushTrace(context, node, 'pass', `Score node ${node.id} contributed.`, `Оценочная нода ${node.id} добавила баллы.`);
  } else if (node.type === 'ForbidAction') {
    applyForbidAction(context, node);
    armAfterCooldown(context, node);
    pushTrace(context, node, 'pass', `ForbidAction ${node.id} registered.`, `Запрет действия ${node.id} записан.`);
  } else {
    const ownPassed = executeNodeOwnLogic(context, node);
    if (!ownPassed) {
      pushTrace(context, node, 'fail', `Branch node ${node.id} failed.`, `Нода ветки ${node.id} не прошла.`);
      return false;
    }
    armAfterCooldown(context, node);
    pushTrace(context, node, 'pass', `Branch node ${node.id} passed.`, `Нода ветки ${node.id} прошла.`);
  }

  for (const childId of node.children ?? []) {
    const child = context.nodesById.get(childId);
    if (!child || !evaluateBranchNode(context, child, new Set(visited))) {
      return false;
    }
  }

  return true;
}

function evaluateFirstPassingBranchChild(context: BranchContext, node: AiNode, visited: Set<AiNodeId>): boolean {
  for (const childId of node.children ?? []) {
    const child = context.nodesById.get(childId);
    if (child && evaluateBranchNode(context, child, new Set(visited))) {
      pushTrace(context, node, 'select', `Selector selected ${child.id}.`, `Selector выбрал ${child.id}.`);
      return true;
    }
  }

  pushTrace(context, node, 'fail', 'Selector found no passing branch child.', 'Selector не нашёл рабочий дочерний шаг ветки.');
  return false;
}

function executeNodeOwnLogic(context: ExecutionContext, node: AiNode): boolean {
  const parameters = node.parameters ?? {};

  switch (node.type) {
    case 'Root':
    case 'Sequence':
    case 'Selector':
    case 'UtilitySelector':
    case 'ActionBranch':
    case 'ParameterScore':
    case 'DistanceScore':
    case 'DecisionInertia':
    case 'RandomChance':
    case 'ForbidAction':
      return true;
    case 'FlagCheck':
      return readBoolean(context.blackboard[readString(parameters.flagKey, '')]) === readBoolean(parameters.expected, true);
    case 'BlackboardValueAbove':
      return compareNumber(
        readNumber(context.blackboard[readString(parameters.sourceKey, 'danger')], 0),
        readNumber(parameters.threshold, 50),
        readString(parameters.comparison, 'above'),
      );
    case 'StableThreshold':
      return applyStableThreshold(context, node);
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
    case 'SelectTarget':
      applySelectTarget(context, parameters);
      return true;
    case 'WriteMemory':
      writeMemory(context, readString(parameters.writeTo, 'current_goal'), normalizeBlackboardValue(parameters.value ?? null));
      return true;
    case 'CopyMemory': {
      const fromKey = readString(parameters.fromKey, '');
      const toKey = readString(parameters.toKey, '');
      if (!fromKey || !toKey) return false;
      writeMemory(context, toKey, normalizeBlackboardValue(context.blackboard[fromKey] ?? null));
      return true;
    }
    case 'SetPosture':
      context.effects.push({
        type: 'set_posture',
        posture: readPosture(parameters.posture),
        reason: `AI graph posture: ${readString(parameters.posture, 'prone')}.`,
        reasonRu: `AI-граф выбрал позу: ${readString(parameters.posture, 'prone')}.`,
      });
      return true;
    case 'SetAction': {
      const action = readString(parameters.action, 'wait');
      maybeRegisterCandidateAction(context, action);
      context.effects.push({
        type: 'set_action',
        action,
        targetKey: readOptionalString(parameters.targetKey),
        reason: `AI graph action: ${action}.`,
        reasonRu: `AI-граф выбрал действие: ${action}.`,
      });
      return true;
    }
    case 'SetMovementMode':
      context.effects.push({
        type: 'set_movement_mode',
        mode: readString(parameters.mode, 'careful'),
        reason: `AI graph movement mode: ${readString(parameters.mode, 'careful')}.`,
        reasonRu: `AI-граф выбрал режим движения: ${readString(parameters.mode, 'careful')}.`,
      });
      return true;
    case 'SayMessage':
      context.effects.push({
        type: 'say_message',
        message: readString(parameters.message, readString(parameters.messageRu, '')),
        messageRu: readOptionalString(parameters.messageRu),
        durationSeconds: Math.max(0.2, readNumber(parameters.durationSeconds, 2)),
      });
      return true;
    case 'WriteReason':
      context.effects.push({
        type: 'write_reason',
        reason: readString(parameters.reason, 'AI graph explanation.'),
        reasonRu: readOptionalString(parameters.reasonRu),
      });
      return true;
    default:
      pushTrace(context, node, 'fail', `Unsupported AI node: ${node.type}.`, `Неподдержанная AI-нода: ${node.type}.`);
      return false;
  }
}

function applyScoreNode(context: BranchContext, node: AiNode): void {
  const parameters = node.parameters ?? {};
  if (node.type === 'ParameterScore') {
    const sourceKey = readString(parameters.sourceKey, 'danger');
    const sourceValue = readNumber(context.blackboard[sourceKey], 0);
    const direction = readString(parameters.direction, 'positive');
    const weight = readNumber(parameters.weight, 1);
    const value = (direction === 'negative' ? -sourceValue : sourceValue) * weight;
    addScore(context, node, value, `${sourceKey} ${direction} score`, `${sourceKey}: оценка ${direction}`);
    return;
  }

  if (node.type === 'DistanceScore') {
    const targetKind = readString(parameters.targetKind, 'cover');
    const preference = readString(parameters.preference, 'closer');
    const idealMeters = Math.max(1, readNumber(parameters.idealMeters, 20));
    const weight = readNumber(parameters.weight, 1);
    const meters = resolveDistanceMeters(context, 'self', targetKind === 'cover' ? 'cover' : targetKind);
    const normalized = preference === 'farther'
      ? Math.min(100, (meters / idealMeters) * 100)
      : Math.max(0, 100 - (meters / idealMeters) * 100);
    addScore(context, node, normalized * weight, `distance to ${targetKind}: ${roundScore(meters)}m`, `дистанция до ${targetKind}: ${roundScore(meters)} м`);
    return;
  }

  if (node.type === 'DecisionInertia') {
    const action = readString(parameters.action, 'move_to');
    const currentAction = readString(context.blackboard.current_action, '');
    const bonus = currentAction === action ? readNumber(parameters.bonus, 12) : 0;
    addScore(context, node, bonus, `inertia for ${action}`, `инерция решения для ${action}`);
    return;
  }

  if (node.type === 'RandomChance') {
    const probability = clampNumber(readNumber(parameters.probabilityPercent, 30), 0, 100);
    const roll = deterministicPercent(`${context.unitId}:${node.id}:${Math.floor(context.nowMs / 1000)}`);
    const value = probability - roll;
    addScore(context, node, value, `chance ${probability}% vs roll ${roll}`, `шанс ${probability}% против броска ${roll}`);
  }
}

function addScore(context: BranchContext, node: AiNode, value: number, reason: string, reasonRu: string): void {
  const rounded = roundScore(value);
  context.score += rounded;
  context.breakdown.push({
    sourceNodeId: node.id,
    label: nodeName(node),
    labelRu: nodeNameRu(node),
    value: rounded,
    reason,
    reasonRu,
  });
}

function applyForbidAction(context: BranchContext, node: AiNode): void {
  const parameters = node.parameters ?? {};
  const action = readString(parameters.action, 'continue_order');
  const reason = readString(parameters.reason, `Action ${action} is forbidden.`);
  context.forbiddenActions.set(action, {
    reason,
    reasonRu: readOptionalString(parameters.reasonRu) ?? `Действие ${action} запрещено.`,
  });
}

function applyLateForbidActionVeto(context: BranchContext): void {
  for (const action of context.candidateActions) {
    const forbid = context.forbiddenActions.get(action);
    if (forbid) {
      context.vetoed = true;
      context.vetoReason = forbid.reason;
      context.vetoReasonRu = forbid.reasonRu;
      return;
    }
  }
}

function maybeRegisterCandidateAction(context: ExecutionContext, action: string): void {
  if (!isBranchContext(context)) return;

  context.candidateActions.push(action);
  const forbid = context.forbiddenActions.get(action);
  if (forbid) {
    context.vetoed = true;
    context.vetoReason = forbid.reason;
    context.vetoReasonRu = forbid.reasonRu;
  }
}

function isBranchContext(context: ExecutionContext): context is BranchContext {
  return 'candidateActions' in context && 'forbiddenActions' in context;
}

function applyStableThreshold(context: ExecutionContext, node: AiNode): boolean {
  const parameters = node.parameters ?? {};
  const sourceKey = readString(parameters.sourceKey, 'danger');
  const value = readNumber(context.blackboard[sourceKey], 0);
  const enter = readNumber(parameters.enterThreshold, 70);
  const exit = readNumber(parameters.exitThreshold, 50);
  const memoryKey = `stable:${node.id}`;
  const wasActive = readBoolean(context.blackboard[memoryKey], false);
  const active = wasActive ? value > exit : value >= enter;
  writeMemory(context, memoryKey, active);
  return active;
}

function applyFindBestObject(context: ExecutionContext, parameters: Record<string, AiBlackboardValue>): void {
  const objectKind = readString(parameters.objectKind, 'cover');
  const criteria = readString(parameters.criteria, 'safer');
  const searchRadiusMeters = readNumber(parameters.searchRadiusMeters, 35);
  const writeTo = readString(parameters.writeTo, 'best_object');
  const found = context.tacticalHost?.findBestObject?.(objectKind, criteria, searchRadiusMeters, context.blackboard) ?? null;
  if (found !== null) {
    writeMemory(context, writeTo, normalizeBlackboardValue(found));
    if (objectKind === 'cover') writeMemory(context, 'best_cover_position', normalizeBlackboardValue(found));
  }
}

function applySelectTarget(context: ExecutionContext, parameters: Record<string, AiBlackboardValue>): void {
  const writeTo = readString(parameters.writeTo, 'current_target');
  const rule = readString(parameters.rule, 'most_dangerous');
  const fallback = context.blackboard.current_target ?? context.blackboard.remembered_enemy_position ?? null;
  writeMemory(context, writeTo, normalizeBlackboardValue(fallback));
  writeMemory(context, `${writeTo}_rule`, rule);
}

function evaluateTacticalCheck(context: ExecutionContext, parameters: Record<string, AiBlackboardValue>): boolean {
  const checkKind = readString(parameters.checkKind, 'cover_exists');
  const result = context.tacticalHost?.tacticalCheck?.(checkKind, context.blackboard);
  if (typeof result === 'boolean') return result;

  if (checkKind === 'cover_exists') return isPosition(context.blackboard.best_cover_position);
  if (checkKind === 'ammo_available') return readNumber(context.blackboard.ammo, 0) > 0;
  if (checkKind === 'can_execute_order') return readBoolean(context.blackboard.hasOrder, false);
  if (checkKind === 'line_of_sight' || checkKind === 'line_of_fire') return readBoolean(context.blackboard.enemyVisible, false);
  if (checkKind === 'path_exists') return true;
  return false;
}

function resolveDistanceMeters(context: ExecutionContext, fromKey: string, toKey: string): number {
  const hostResult = context.tacticalHost?.resolveDistanceMeters?.(fromKey, toKey, context.blackboard);
  if (typeof hostResult === 'number' && Number.isFinite(hostResult)) return hostResult;

  const from = resolvePoint(context.blackboard, fromKey);
  const to = resolvePoint(context.blackboard, toKey);
  if (!from || !to) return 9999;
  return distance(from, to);
}

function resolvePoint(blackboard: AiGraphRunnerBlackboard, key: string): GridPosition | null {
  if (key === 'self') return readPosition(blackboard.self_position);
  if (key === 'cover') return readPosition(blackboard.best_cover_position);
  if (key === 'enemy') return readPosition(blackboard.remembered_enemy_position) ?? readPosition(blackboard.current_target);
  if (key === 'orderPoint' || key === 'orderTarget') return readPosition(blackboard.order_target_position);
  if (key === 'currentTarget') return readPosition(blackboard.current_target);
  if (key === 'retreatPoint') return readPosition(blackboard.retreat_position);
  return readPosition(blackboard[key]);
}

function cooldownAllowsNode(context: ExecutionContext, node: AiNode): boolean {
  const parameters = node.parameters ?? {};
  const seconds = readNumber(parameters.cooldownSeconds, 0);
  if (seconds <= 0) return true;

  const readyAt = context.cooldowns[node.id] ?? 0;
  if (context.nowMs < readyAt) return false;

  if (readString(parameters.cooldownTiming, 'after') === 'before' && readyAt === 0) {
    context.cooldowns[node.id] = context.nowMs + seconds * 1000;
    return false;
  }

  return true;
}

function armAfterCooldown(context: ExecutionContext, node: AiNode): void {
  const parameters = node.parameters ?? {};
  const seconds = readNumber(parameters.cooldownSeconds, 0);
  if (seconds > 0 && readString(parameters.cooldownTiming, 'after') === 'after') {
    context.cooldowns[node.id] = context.nowMs + seconds * 1000;
  }
}

function writeMemory(context: ExecutionContext, key: string, value: AiBlackboardValue): void {
  if (!key) return;
  context.blackboard[key] = value;
  context.effects.push({ type: 'write_memory', key, value });
}

function makeResult(
  context: ExecutionContext,
  ok: boolean,
  selectedBranchNodeId: AiNodeId,
  explanation: string,
  explanationRu?: string,
  selectedNode?: AiNode,
): AiGraphRunnerResult {
  return {
    ok,
    unitId: context.unitId,
    graphId: context.graph.id,
    selectedBranchNodeId,
    selectedBranchName: selectedNode ? nodeName(selectedNode) : selectedBranchNodeId,
    selectedBranchNameRu: selectedNode ? nodeNameRu(selectedNode) : undefined,
    scores: context.scores,
    effects: context.effects,
    blackboard: context.blackboard,
    cooldowns: context.cooldowns,
    trace: context.trace,
    explanation,
    explanationRu,
  };
}

function pushTrace(context: ExecutionContext, node: AiNode, status: AiGraphTraceItem['status'], reason: string, reasonRu?: string): void {
  context.trace.push({ nodeId: node.id, nodeType: String(node.type), status, reason, reasonRu });
}

function nodeName(node: AiNode): string {
  return node.displayName ?? String(node.type);
}

function nodeNameRu(node: AiNode): string | undefined {
  return node.displayNameRu ?? node.displayName ?? String(node.type);
}

function compareNumber(value: number, threshold: number, comparison: string): boolean {
  return comparison === 'below' ? value < threshold : value > threshold;
}

function readPosture(value: AiBlackboardValue | undefined): 'stand' | 'crouch' | 'prone' {
  if (value === 'stand' || value === 'crouch' || value === 'prone') return value;
  return 'prone';
}

function readPosition(value: AiBlackboardValue | undefined): GridPosition | null {
  if (isPosition(value)) return { x: value.x, y: value.y };
  return null;
}

function isPosition(value: AiBlackboardValue | undefined): value is GridPosition {
  return typeof value === 'object'
    && value !== null
    && 'x' in value
    && 'y' in value
    && typeof value.x === 'number'
    && typeof value.y === 'number';
}

function normalizeBlackboardValue(value: unknown): AiBlackboardValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'object' && value !== null && 'x' in value && 'y' in value) {
    const position = value as { x?: unknown; y?: unknown };
    if (typeof position.x === 'number' && typeof position.y === 'number') return { x: position.x, y: position.y };
  }
  return null;
}

function cloneBlackboard(value: AiGraphRunnerBlackboard): AiGraphRunnerBlackboard {
  const cloned: AiGraphRunnerBlackboard = {};
  for (const [key, item] of Object.entries(value)) cloned[key] = normalizeBlackboardValue(item);
  return cloned;
}

function readString(value: AiBlackboardValue | undefined, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function readOptionalString(value: AiBlackboardValue | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readNumber(value: AiBlackboardValue | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readBoolean(value: AiBlackboardValue | undefined, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function deterministicPercent(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 101;
}
