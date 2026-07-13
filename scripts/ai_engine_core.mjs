import { readFileSync } from 'node:fs';
import path from 'node:path';

export const KNOWN_NODE_TYPES = new Set([
  'Root', 'UtilitySelector', 'Sequence', 'SequenceWithMemory', 'ReactiveSequence', 'Selector', 'ActionBranch', 'Timeout', 'Retry',
  'BlackboardValueAbove', 'FlagCheck', 'DistanceCheck', 'StableThreshold', 'TacticalCheck',
  'ParameterScore', 'DistanceScore', 'DecisionInertia', 'RandomChance',
  'FindBestObject', 'SelectTarget',
  'WriteMemory', 'CopyMemory', 'ForbidAction',
  'SetPosture', 'SetAction', 'Wait', 'WaitForEvent', 'Reload', 'MoveToBlackboardPosition', 'SetMovementMode', 'SetAttentionMode', 'SetSearchSector', 'ClearAttentionOverride', 'SayMessage', 'Subgraph',
  'WriteReason',
]);

// Universal nodes are chainable: a condition can gate SayMessage, SetPosture, SetAction, etc.
export const LEAF_NODE_TYPES = new Set();

const DISTANCE_FROM_VALUES = new Set(['self', 'currentTarget', 'orderTarget', 'cover', 'ally', 'enemy']);
const DISTANCE_TO_VALUES = new Set(['enemy', 'cover', 'orderPoint', 'commander', 'squad', 'retreatPoint']);
const TACTICAL_CHECK_VALUES = new Set(['line_of_sight', 'line_of_fire', 'path_exists', 'cover_exists', 'ammo_available', 'can_execute_order']);
const TARGET_KIND_VALUES = new Set(['cover', 'enemy', 'ally', 'orderPoint', 'commander', 'squad']);
const FIND_OBJECT_KIND_VALUES = new Set(['cover', 'enemy', 'ally', 'firing_position', 'retreat_point', 'route_point']);
const FIND_CRITERIA_VALUES = new Set(['closer', 'safer', 'has_line_of_fire', 'farther_from_enemy']);
const ACTION_VALUES = new Set(['move_to', 'fire', 'reload', 'retreat', 'wait', 'suppress', 'continue_order']);
const POSTURE_VALUES = new Set(['stand', 'crouch', 'prone']);
const MOVEMENT_MODE_VALUES = new Set(['fast', 'careful', 'crawl', 'bounds', 'formation', 'follow_tank']);
const TARGET_RULE_VALUES = new Set(['nearest', 'most_dangerous', 'shooting_at_us', 'order_target', 'best_line_of_fire']);

export const ENGINE_NAME = 'real-wargame-local-ai-engine';
export const ENGINE_VERSION = '0.9.0-graph-runner-v2-preview';

export function resolveBundledGraphPath(repoRoot) {
  return path.join(repoRoot, 'src', 'data', 'ai', 'soldier_default_survival_graph.json');
}

export function loadJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function validateGraph(value) {
  const result = [];
  if (!isRecord(value)) return [errorIssue('GRAPH_NOT_OBJECT', 'AI graph must be a JSON object.', 'AI-граф должен быть JSON-объектом.')];
  if (value.version !== 1 && value.version !== 2) result.push(errorIssue('UNSUPPORTED_VERSION', 'Only AI graph versions 1 and 2 are supported.', 'Поддерживаются только версии AI-графа 1 и 2.'));
  if (!isNonEmptyString(value.id)) result.push(errorIssue('MISSING_GRAPH_ID', 'AI graph must have a non-empty string id.', 'У AI-графа должен быть непустой строковый id.'));
  if (!isNonEmptyString(value.rootNodeId)) result.push(errorIssue('MISSING_ROOT_NODE_ID', 'AI graph must have rootNodeId.', 'У AI-графа должен быть rootNodeId.'));
  if (!isRecord(value.blackboardDefaults)) result.push(errorIssue('BLACKBOARD_DEFAULTS_NOT_OBJECT', 'blackboardDefaults must be a JSON object.', 'Поле blackboardDefaults должно быть JSON-объектом.'));
  if (!Array.isArray(value.nodes)) {
    result.push(errorIssue('NODES_NOT_ARRAY', 'nodes must be an array.', 'Поле nodes должно быть массивом нод.'));
    return result;
  }

  const nodeById = new Map();
  const rootNodeIds = [];

  for (const [index, node] of value.nodes.entries()) {
    if (!isRecord(node)) {
      result.push(errorIssue('NODE_NOT_OBJECT', `Node #${index + 1} must be a JSON object.`, `Нода #${index + 1} должна быть JSON-объектом.`));
      continue;
    }
    if (!isNonEmptyString(node.id)) {
      result.push(errorIssue('NODE_WITHOUT_ID', `Node #${index + 1} must have a non-empty string id.`, `Нода #${index + 1} должна иметь непустой строковый id.`));
      continue;
    }
    if (nodeById.has(node.id)) {
      result.push(errorIssue('DUPLICATE_NODE_ID', `Duplicate node id: ${node.id}.`, `Дублируется id ноды: ${node.id}.`, node.id));
      continue;
    }
    nodeById.set(node.id, node);
    if (!isNonEmptyString(node.type)) {
      result.push(errorIssue('NODE_WITHOUT_TYPE', `Node ${node.id} must have a string type.`, `У ноды ${node.id} должен быть строковый type.`, node.id));
      continue;
    }
    if (!KNOWN_NODE_TYPES.has(node.type)) result.push(errorIssue('UNKNOWN_NODE_TYPE', `Node ${node.id} has unknown type: ${node.type}.`, `У ноды ${node.id} неизвестный type: ${node.type}.`, node.id));
    if (node.type === 'Root') rootNodeIds.push(node.id);
    if (node.children !== undefined) validateChildrenShape(node, result);
    validateNodeParameters(node.parameters, result, node.id);
    validateCommonCooldownParameters(node.parameters, result, node.id);
    validateSpecificNodeParameters(node, value.blackboardDefaults, result);
  }

  if (rootNodeIds.length === 0) result.push(errorIssue('ROOT_NODE_MISSING', 'Graph must contain one Root node.', 'В графе должна быть одна нода Root.'));
  if (rootNodeIds.length > 1) result.push(warningIssue('MULTIPLE_ROOT_NODES', `Graph has multiple Root nodes: ${rootNodeIds.join(', ')}. rootNodeId is used.`, `В графе несколько нод Root: ${rootNodeIds.join(', ')}. Используется rootNodeId.`));
  const rootNode = nodeById.get(value.rootNodeId);
  if (isNonEmptyString(value.rootNodeId) && !rootNode) result.push(errorIssue('ROOT_NODE_NOT_FOUND', `rootNodeId points to a missing node: ${value.rootNodeId}.`, `rootNodeId указывает на несуществующую ноду: ${value.rootNodeId}.`));
  if (rootNode && rootNode.type !== 'Root') result.push(errorIssue('ROOT_NODE_WRONG_TYPE', `rootNodeId must point to a Root node, current type: ${String(rootNode.type)}.`, `rootNodeId должен указывать на ноду типа Root, сейчас: ${String(rootNode.type)}.`, value.rootNodeId));

  for (const [nodeId, node] of nodeById) {
    if (!Array.isArray(node.children)) continue;
    for (const childId of node.children) {
      if (isNonEmptyString(childId) && !nodeById.has(childId)) result.push(errorIssue('BROKEN_CHILD_LINK', `Node ${nodeId} references a missing child: ${childId}.`, `Нода ${nodeId} ссылается на несуществующего ребёнка: ${childId}.`, nodeId));
    }
  }
  validateBlackboardDefaults(value.blackboardDefaults, result);
  return result;
}

export function makeValidationResult(graph) {
  const issues = validateGraph(graph);
  return { valid: !issues.some((issue) => issue.severity === 'error'), issues };
}

export function evaluateSoldierOnce(input) {
  const graph = isRecord(input.graph) ? input.graph : input.bundledGraph;
  const validation = makeValidationResult(graph);
  if (!validation.valid) {
    return { ok: false, validation, error: 'Graph validation failed, soldier decision was not calculated.', errorRu: 'Граф не прошёл проверку, решение солдата не рассчитано.' };
  }

  const blackboard = buildEngineBlackboard(graph, input);
  const runner = runGraphOnce(graph, {
    unitId: isNonEmptyString(input.unitId) ? input.unitId : 'soldier_1',
    blackboard,
    nowMs: typeof input.nowMs === 'number' ? input.nowMs : Date.now(),
  });

  return {
    ok: true,
    validation,
    unitId: runner.unitId,
    graphId: String(graph.id),
    selectedBranchNodeId: runner.selectedBranchNodeId,
    selectedBranchName: runner.selectedBranchName,
    selectedBranchNameRu: runner.selectedBranchNameRu,
    command: buildPreviewCommand(runner.effects, runner.blackboard),
    scores: runner.scores,
    effects: runner.effects,
    trace: runner.trace,
    explanation: runner.explanation,
    explanationRu: runner.explanationRu,
  };
}

export function createHealthPayload(port) {
  return {
    ok: true,
    service: ENGINE_NAME,
    version: ENGINE_VERSION,
    port,
    mode: 'headless-local-engine',
    scope: 'GraphRunner preview: validates Graph v1/v2 and evaluates instant UtilitySelector branches before live bridge execution.',
    scopeRu: 'GraphRunner preview: проверяет Graph v1/v2 и оценивает мгновенные ветки UtilitySelector перед живым исполнением в bridge.',
    textBase: 'en',
    overlayLanguage: 'ru',
    browserDoesHeavyAi: false,
    endpoints: ['GET /engine/health', 'POST /ai/graph/validate', 'POST /ai/graph/evaluate-once'],
  };
}

function runGraphOnce(graph, input) {
  const nodesById = new Map(graph.nodes.filter(isRecord).map((node) => [node.id, node]));
  const root = nodesById.get(graph.rootNodeId);
  const context = {
    graph,
    unitId: input.unitId,
    nodesById,
    blackboard: { ...input.blackboard },
    nowMs: input.nowMs,
    effects: [],
    scores: [],
    trace: [],
    selectedBranch: root ?? null,
  };

  if (!root) {
    return makeRunnerResult(context, false, graph.rootNodeId, 'AI graph root is missing.', 'Корневая нода AI-графа не найдена.');
  }

  const passed = executeNode(context, root, new Set());
  const explanation = passed
    ? context.effects.length > 0
      ? `GraphRunner produced ${context.effects.length} effect(s).`
      : 'GraphRunner passed, but no action/effect node is connected yet.'
    : 'GraphRunner found no passing branch.';
  const explanationRu = passed
    ? context.effects.length > 0
      ? `GraphRunner выдал эффектов: ${context.effects.length}.`
      : 'GraphRunner прошёл, но нода действия/эффекта ещё не подключена.'
    : 'GraphRunner не нашёл рабочую ветку.';

  return makeRunnerResult(context, passed, context.selectedBranch?.id ?? root.id, explanation, explanationRu);
}

function executeNode(context, node, visited) {
  if (visited.has(node.id)) {
    pushTrace(context, node, 'fail', `Loop stopped at ${node.id}.`, `Цикл остановлен на ноде ${node.id}.`);
    return false;
  }
  visited.add(node.id);

  if (node.type === 'UtilitySelector') return executeUtilitySelector(context, node, visited);

  if (node.type === 'Selector') {
    for (const childId of node.children ?? []) {
      const child = context.nodesById.get(childId);
      if (child && executeNode(context, child, new Set(visited))) {
        context.selectedBranch = child;
        pushTrace(context, node, 'select', `Selector selected ${child.id}.`, `Selector выбрал ${child.id}.`);
        return true;
      }
    }
    return false;
  }

  if (!executeOwnLogic(context, node)) return false;
  pushTrace(context, node, 'pass', `Node ${node.id} passed.`, `Нода ${node.id} прошла.`);
  for (const childId of node.children ?? []) {
    const child = context.nodesById.get(childId);
    if (!child || !executeNode(context, child, new Set(visited))) return false;
  }
  return true;
}

function executeUtilitySelector(context, node, visited) {
  const branchResults = [];
  for (const childId of node.children ?? []) {
    const child = context.nodesById.get(childId);
    if (child) branchResults.push(evaluateBranch(context, child, visited));
  }

  context.scores.push(...branchResults.map((result) => result.score));
  const winner = branchResults
    .filter((result) => result.passed && !result.score.vetoed)
    .sort((a, b) => b.score.score - a.score.score)[0];

  if (!winner) return false;
  context.effects.push(...winner.effects);
  context.blackboard = { ...winner.blackboard };
  context.trace.push(...winner.trace);
  context.selectedBranch = winner.selectedBranch;
  pushTrace(context, node, 'select', `UtilitySelector selected ${winner.score.branchName}.`, `UtilitySelector выбрал «${winner.score.branchNameRu ?? winner.score.branchName}».`);
  return true;
}

function evaluateBranch(parent, branchNode, visited) {
  const context = {
    ...parent,
    blackboard: { ...parent.blackboard },
    effects: [],
    trace: [],
    scoreValue: 0,
    breakdown: [],
    vetoed: false,
    vetoReason: undefined,
    vetoReasonRu: undefined,
    forbiddenActions: new Map(),
    candidateActions: [],
  };
  const passed = evaluateBranchNode(context, branchNode, new Set(visited));
  applyLateForbidActionVeto(context);
  return {
    passed: passed && !context.vetoed,
    selectedBranch: branchNode,
    effects: context.effects,
    blackboard: context.blackboard,
    trace: context.trace,
    score: {
      branchNodeId: branchNode.id,
      branchName: nodeName(branchNode),
      branchNameRu: nodeNameRu(branchNode),
      score: roundScore(context.scoreValue),
      breakdown: context.breakdown,
      vetoed: context.vetoed,
      vetoReason: context.vetoReason,
      vetoReasonRu: context.vetoReasonRu,
    },
  };
}

function evaluateBranchNode(context, node, visited) {
  if (visited.has(node.id)) return false;
  visited.add(node.id);

  if (['ParameterScore', 'DistanceScore', 'DecisionInertia', 'RandomChance'].includes(node.type)) {
    applyScoreNode(context, node);
  } else if (node.type === 'ForbidAction') {
    const action = readString(node.parameters?.action, 'continue_order');
    context.forbiddenActions.set(action, {
      reason: readString(node.parameters?.reason, `Action ${action} is forbidden.`),
      reasonRu: readString(node.parameters?.reasonRu, `Действие ${action} запрещено.`),
    });
  } else if (!executeOwnLogic(context, node)) {
    return false;
  }

  for (const childId of node.children ?? []) {
    const child = context.nodesById.get(childId);
    if (!child || !evaluateBranchNode(context, child, new Set(visited))) return false;
  }
  return true;
}

function executeOwnLogic(context, node) {
  const parameters = isRecord(node.parameters) ? node.parameters : {};
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
      return compareNumber(readNumber(context.blackboard[readString(parameters.sourceKey, 'danger')], 0), readNumber(parameters.threshold, 50), readString(parameters.comparison, 'above'));
    case 'StableThreshold':
      return applyStableThreshold(context, node);
    case 'DistanceCheck': {
      const meters = resolveDistanceMeters(context.blackboard, readString(parameters.from, 'self'), readString(parameters.to, 'cover'));
      const threshold = readNumber(parameters.thresholdMeters, 30);
      return readString(parameters.comparison, 'closer') === 'farther' ? meters > threshold : meters < threshold;
    }
    case 'TacticalCheck':
      return evaluateTacticalCheck(context.blackboard, readString(parameters.checkKind, 'cover_exists')) === readBoolean(parameters.expected, true);
    case 'FindBestObject':
      applyFindBestObject(context, parameters);
      return true;
    case 'SelectTarget':
      writeMemory(context, readString(parameters.writeTo, 'current_target'), context.blackboard.current_target ?? context.blackboard.remembered_enemy_position ?? null);
      return true;
    case 'WriteMemory':
      writeMemory(context, readString(parameters.writeTo, 'current_goal'), normalizeValue(parameters.value ?? null));
      return true;
    case 'CopyMemory':
      writeMemory(context, readString(parameters.toKey, ''), normalizeValue(context.blackboard[readString(parameters.fromKey, '')] ?? null));
      return true;
    case 'SetPosture':
      context.effects.push({ type: 'set_posture', posture: readString(parameters.posture, 'prone'), reason: 'Preview posture effect.', reasonRu: 'Preview-эффект позы.' });
      return true;
    case 'SetAction': {
      const action = readString(parameters.action, 'wait');
      context.candidateActions?.push(action);
      context.effects.push({ type: 'set_action', action, targetKey: readString(parameters.targetKey, 'best_cover_position'), reason: 'Preview action effect.', reasonRu: 'Preview-эффект действия.' });
      return true;
    }
    case 'SetMovementMode':
      context.effects.push({ type: 'set_movement_mode', mode: readString(parameters.mode, 'careful'), reason: 'Preview movement mode effect.', reasonRu: 'Preview-эффект режима движения.' });
      return true;
    case 'SayMessage':
      context.effects.push({ type: 'say_message', message: readString(parameters.message, readString(parameters.messageRu, '')), messageRu: readString(parameters.messageRu, ''), durationSeconds: Math.max(0.2, readNumber(parameters.durationSeconds, 2)) });
      return true;
    case 'WriteReason':
      context.effects.push({ type: 'write_reason', reason: readString(parameters.reason, 'AI graph explanation.'), reasonRu: readString(parameters.reasonRu, 'Объяснение AI-графа.') });
      return true;
    default:
      return true;
  }
}

function applyScoreNode(context, node) {
  const parameters = isRecord(node.parameters) ? node.parameters : {};
  if (node.type === 'ParameterScore') {
    const sourceKey = readString(parameters.sourceKey, 'danger');
    const sourceValue = readNumber(context.blackboard[sourceKey], 0);
    const direction = readString(parameters.direction, 'positive');
    const weight = readNumber(parameters.weight, 1);
    addScore(context, node, (direction === 'negative' ? -sourceValue : sourceValue) * weight, `${sourceKey} ${direction}`, `${sourceKey}: ${direction}`);
    return;
  }
  if (node.type === 'DistanceScore') {
    const targetKind = readString(parameters.targetKind, 'cover');
    const preference = readString(parameters.preference, 'closer');
    const idealMeters = Math.max(1, readNumber(parameters.idealMeters, 20));
    const meters = resolveDistanceMeters(context.blackboard, 'self', targetKind === 'cover' ? 'cover' : targetKind);
    const normalized = preference === 'farther' ? Math.min(100, (meters / idealMeters) * 100) : Math.max(0, 100 - (meters / idealMeters) * 100);
    addScore(context, node, normalized * readNumber(parameters.weight, 1), `distance ${roundScore(meters)}m`, `дистанция ${roundScore(meters)} м`);
    return;
  }
  if (node.type === 'DecisionInertia') {
    const action = readString(parameters.action, 'move_to');
    addScore(context, node, readString(context.blackboard.current_action, '') === action ? readNumber(parameters.bonus, 12) : 0, `inertia ${action}`, `инерция ${action}`);
    return;
  }
  if (node.type === 'RandomChance') {
    const probability = clampNumber(readNumber(parameters.probabilityPercent, 30), 0, 100);
    const roll = deterministicPercent(`${context.unitId}:${node.id}:${Math.floor(context.nowMs / 1000)}`);
    addScore(context, node, probability - roll, `chance ${probability}% vs ${roll}`, `шанс ${probability}% против ${roll}`);
  }
}

function addScore(context, node, value, reason, reasonRu) {
  const rounded = roundScore(value);
  context.scoreValue += rounded;
  context.breakdown.push({ sourceNodeId: node.id, label: nodeName(node), labelRu: nodeNameRu(node), value: rounded, reason, reasonRu });
}

function applyLateForbidActionVeto(context) {
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

function applyStableThreshold(context, node) {
  const parameters = isRecord(node.parameters) ? node.parameters : {};
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

function applyFindBestObject(context, parameters) {
  const objectKind = readString(parameters.objectKind, 'cover');
  if (objectKind !== 'cover') return;
  const writeTo = readString(parameters.writeTo, 'best_object');
  const found = context.blackboard.best_cover_position ?? { x: 18.5, y: 12.5 };
  writeMemory(context, writeTo, found);
  writeMemory(context, 'best_cover_position', found);
}

function buildEngineBlackboard(graph, input) {
  return {
    ...(isRecord(graph.blackboardDefaults) ? graph.blackboardDefaults : {}),
    ...(isRecord(input.blackboard) ? input.blackboard : {}),
    hasOrder: typeof input.hasOrder === 'boolean' ? input.hasOrder : input.blackboard?.hasOrder ?? false,
    self_position: input.blackboard?.self_position ?? { x: 0, y: 0 },
    order_target_position: input.blackboard?.order_target_position ?? null,
    retreat_position: input.blackboard?.retreat_position ?? { x: -2, y: 0 },
  };
}

function buildPreviewCommand(effects, blackboard) {
  const action = effects.find((effect) => effect.type === 'set_action');
  if (action) {
    if (action.action === 'move_to') return { type: 'move_to', target: readPosition(blackboard[action.targetKey ?? 'best_cover_position']), reason: action.reason, reasonRu: action.reasonRu };
    return { type: action.action, reason: action.reason, reasonRu: action.reasonRu };
  }
  const posture = effects.find((effect) => effect.type === 'set_posture');
  if (posture) return { type: 'set_posture', posture: posture.posture, reason: posture.reason, reasonRu: posture.reasonRu };
  const speech = effects.find((effect) => effect.type === 'say_message');
  if (speech) return { type: 'say_message', message: speech.message, messageRu: speech.messageRu, durationSeconds: speech.durationSeconds, reason: 'Preview speech effect.', reasonRu: 'Preview-эффект реплики.' };
  return { type: 'none', reason: 'No action node has been added yet.', reasonRu: 'Нода действия ещё не добавлена.' };
}

function makeRunnerResult(context, ok, selectedBranchNodeId, explanation, explanationRu) {
  const selectedNode = context.nodesById.get(selectedBranchNodeId) ?? context.selectedBranch;
  return {
    ok,
    unitId: context.unitId,
    selectedBranchNodeId,
    selectedBranchName: selectedNode ? nodeName(selectedNode) : selectedBranchNodeId,
    selectedBranchNameRu: selectedNode ? nodeNameRu(selectedNode) : undefined,
    scores: context.scores,
    effects: context.effects,
    blackboard: context.blackboard,
    trace: context.trace,
    explanation,
    explanationRu,
  };
}

function resolveDistanceMeters(blackboard, fromKey, toKey) {
  const from = resolvePoint(blackboard, fromKey);
  const to = resolvePoint(blackboard, toKey);
  if (!from || !to) return 9999;
  return Math.hypot(to.x - from.x, to.y - from.y);
}

function resolvePoint(blackboard, key) {
  if (key === 'self') return readPosition(blackboard.self_position);
  if (key === 'cover') return readPosition(blackboard.best_cover_position);
  if (key === 'enemy') return readPosition(blackboard.remembered_enemy_position) ?? readPosition(blackboard.current_target);
  if (key === 'orderPoint' || key === 'orderTarget') return readPosition(blackboard.order_target_position);
  if (key === 'currentTarget') return readPosition(blackboard.current_target);
  if (key === 'retreatPoint') return readPosition(blackboard.retreat_position);
  return readPosition(blackboard[key]);
}

function evaluateTacticalCheck(blackboard, checkKind) {
  if (checkKind === 'cover_exists') return isPositionRecord(blackboard.best_cover_position);
  if (checkKind === 'ammo_available') return readNumber(blackboard.ammo, 0) > 0;
  if (checkKind === 'can_execute_order') return readBoolean(blackboard.hasOrder, false);
  if (checkKind === 'line_of_sight' || checkKind === 'line_of_fire') return readBoolean(blackboard.enemyVisible, false);
  if (checkKind === 'path_exists') return true;
  return false;
}

function validateChildrenShape(node, result) {
  if (!Array.isArray(node.children)) return result.push(errorIssue('CHILDREN_NOT_ARRAY', `Node ${node.id} children must be an array of string ids.`, `У ноды ${node.id} поле children должно быть массивом строковых id.`, node.id));
  for (const childId of node.children) if (!isNonEmptyString(childId)) result.push(errorIssue('CHILD_ID_NOT_STRING', `All children of node ${node.id} must be non-empty strings.`, `У ноды ${node.id} все children должны быть непустыми строками.`, node.id));
}

function validateNodeParameters(parameters, result, nodeId) {
  if (parameters === undefined) return;
  if (!isRecord(parameters)) return result.push(errorIssue('PARAMETERS_NOT_OBJECT', `Node ${nodeId} parameters must be an object.`, `У ноды ${nodeId} поле parameters должно быть объектом.`, nodeId));
  for (const [key, value] of Object.entries(parameters)) {
    if (!isNonEmptyString(key)) result.push(errorIssue('PARAMETER_KEY_EMPTY', `Node ${nodeId} has an empty parameter key.`, `Нода ${nodeId} содержит пустой ключ параметра.`, nodeId));
    if (!isSupportedValue(value)) result.push(errorIssue('PARAMETER_VALUE_UNSUPPORTED', `Node ${nodeId} parameter ${key} has an unsupported value. Allowed: string, number, boolean, null, and position {x,y}.`, `У ноды ${nodeId} параметр ${key} имеет неподдерживаемое значение. Разрешены строки, числа, boolean, null и позиция {x,y}.`, nodeId));
  }
}

function validateCommonCooldownParameters(parameters, result, nodeId) {
  if (!isRecord(parameters)) return;
  if (parameters.cooldownSeconds !== undefined && (typeof parameters.cooldownSeconds !== 'number' || !Number.isFinite(parameters.cooldownSeconds) || parameters.cooldownSeconds < 0)) result.push(errorIssue('COOLDOWN_SECONDS_INVALID', `Node ${nodeId} cooldownSeconds must be a non-negative number.`, `У ноды ${nodeId} cooldownSeconds должен быть неотрицательным числом.`, nodeId));
  if (parameters.cooldownTiming !== undefined && parameters.cooldownTiming !== 'before' && parameters.cooldownTiming !== 'after') result.push(errorIssue('COOLDOWN_TIMING_INVALID', `Node ${nodeId} cooldownTiming must be "before" or "after".`, `У ноды ${nodeId} cooldownTiming должен быть "before" или "after".`, nodeId));
}

function validateSpecificNodeParameters(node, blackboardDefaults, result) {
  const parameters = isRecord(node.parameters) ? node.parameters : {};
  if (['BlackboardValueAbove', 'StableThreshold', 'ParameterScore'].includes(node.type)) validateSourceKey(parameters, blackboardDefaults, node.id, result);
  if (node.type === 'BlackboardValueAbove') { validateNumericParameter(parameters.threshold, 'threshold', node.id, result); validateAllowed(parameters.comparison ?? 'above', ['above', 'below'], 'COMPARISON_INVALID', 'comparison', node.id, result); }
  if (node.type === 'FlagCheck') { validateString(parameters.flagKey, 'flagKey', node.id, result); if (typeof parameters.expected !== 'boolean') result.push(errorIssue('FLAG_EXPECTED_INVALID', `Node ${node.id} parameters.expected must be boolean.`, `У ноды ${node.id} parameters.expected должен быть boolean.`, node.id)); }
  if (node.type === 'DistanceCheck') { validateAllowed(parameters.from, DISTANCE_FROM_VALUES, 'DISTANCE_FROM_INVALID', 'from', node.id, result); validateAllowed(parameters.to, DISTANCE_TO_VALUES, 'DISTANCE_TO_INVALID', 'to', node.id, result); validateAllowed(parameters.comparison, ['closer', 'farther'], 'DISTANCE_COMPARISON_INVALID', 'comparison', node.id, result); validateNumericParameter(parameters.thresholdMeters, 'thresholdMeters', node.id, result); }
  if (node.type === 'StableThreshold') { validateNumericParameter(parameters.enterThreshold, 'enterThreshold', node.id, result); validateNumericParameter(parameters.exitThreshold, 'exitThreshold', node.id, result); }
  if (node.type === 'TacticalCheck') { validateAllowed(parameters.checkKind, TACTICAL_CHECK_VALUES, 'TACTICAL_CHECK_KIND_INVALID', 'checkKind', node.id, result); if (typeof parameters.expected !== 'boolean') result.push(errorIssue('TACTICAL_EXPECTED_INVALID', `Node ${node.id} parameters.expected must be boolean.`, `У ноды ${node.id} parameters.expected должен быть boolean.`, node.id)); }
  if (node.type === 'ParameterScore') { validateNumericParameter(parameters.weight, 'weight', node.id, result); validateAllowed(parameters.direction ?? 'positive', ['positive', 'negative'], 'SCORE_DIRECTION_INVALID', 'direction', node.id, result); }
  if (node.type === 'DistanceScore') { validateAllowed(parameters.targetKind, TARGET_KIND_VALUES, 'DISTANCE_SCORE_TARGET_INVALID', 'targetKind', node.id, result); validateAllowed(parameters.preference, ['closer', 'farther'], 'DISTANCE_SCORE_PREFERENCE_INVALID', 'preference', node.id, result); validateNumericParameter(parameters.idealMeters, 'idealMeters', node.id, result); validateNumericParameter(parameters.weight, 'weight', node.id, result); }
  if (node.type === 'DecisionInertia') { validateAllowed(parameters.action, ACTION_VALUES, 'INERTIA_ACTION_INVALID', 'action', node.id, result); validateNumericParameter(parameters.bonus, 'bonus', node.id, result); validateNumericParameter(parameters.minimumSeconds, 'minimumSeconds', node.id, result); }
  if (node.type === 'RandomChance') validateNumericParameter(parameters.probabilityPercent, 'probabilityPercent', node.id, result);
  if (node.type === 'FindBestObject') { validateAllowed(parameters.objectKind, FIND_OBJECT_KIND_VALUES, 'FIND_OBJECT_KIND_INVALID', 'objectKind', node.id, result); validateAllowed(parameters.criteria ?? 'safer', FIND_CRITERIA_VALUES, 'FIND_CRITERIA_INVALID', 'criteria', node.id, result); validateNumericParameter(parameters.searchRadiusMeters, 'searchRadiusMeters', node.id, result); validateString(parameters.writeTo, 'writeTo', node.id, result); }
  if (node.type === 'SelectTarget') { validateAllowed(parameters.rule, TARGET_RULE_VALUES, 'TARGET_RULE_INVALID', 'rule', node.id, result); validateString(parameters.writeTo, 'writeTo', node.id, result); }
  if (node.type === 'WriteMemory') validateString(parameters.writeTo, 'writeTo', node.id, result);
  if (node.type === 'CopyMemory') { validateString(parameters.fromKey, 'fromKey', node.id, result); validateString(parameters.toKey, 'toKey', node.id, result); }
  if (node.type === 'ForbidAction') { validateAllowed(parameters.action, ACTION_VALUES, 'FORBID_ACTION_INVALID', 'action', node.id, result); validateNumericParameter(parameters.durationSeconds, 'durationSeconds', node.id, result); }
  if (node.type === 'SetPosture') validateAllowed(parameters.posture, POSTURE_VALUES, 'POSTURE_INVALID', 'posture', node.id, result);
  if (node.type === 'SetAction') validateAllowed(parameters.action, ACTION_VALUES, 'ACTION_INVALID', 'action', node.id, result);
  if (node.type === 'SetMovementMode') validateAllowed(parameters.mode, MOVEMENT_MODE_VALUES, 'MOVEMENT_MODE_INVALID', 'mode', node.id, result);
  if (node.type === 'SayMessage') { if (!isNonEmptyString(parameters.message) && !isNonEmptyString(parameters.messageRu)) result.push(errorIssue('SAY_MESSAGE_TEXT_MISSING', `Node ${node.id} must have message or messageRu.`, `У ноды ${node.id} должен быть message или messageRu.`, node.id)); if (parameters.durationSeconds !== undefined && (typeof parameters.durationSeconds !== 'number' || parameters.durationSeconds <= 0)) result.push(errorIssue('SAY_MESSAGE_DURATION_INVALID', `Node ${node.id} durationSeconds must be a positive number.`, `У ноды ${node.id} durationSeconds должен быть положительным числом.`, node.id)); }
}

function validateSourceKey(parameters, blackboardDefaults, nodeId, result) { validateString(parameters.sourceKey, 'sourceKey', nodeId, result); if (isNonEmptyString(parameters.sourceKey) && isRecord(blackboardDefaults)) { const defaultValue = blackboardDefaults[parameters.sourceKey]; if (defaultValue !== undefined && typeof defaultValue !== 'number') result.push(warningIssue('SOURCE_NOT_NUMERIC', `Node ${nodeId} sourceKey ${parameters.sourceKey} is not numeric in blackboardDefaults.`, `У ноды ${nodeId} sourceKey ${parameters.sourceKey} не является числом в blackboardDefaults.`, nodeId)); } }
function validateString(value, key, nodeId, result) { if (!isNonEmptyString(value)) result.push(errorIssue('STRING_PARAMETER_MISSING', `Node ${nodeId} must have string parameters.${key}.`, `У ноды ${nodeId} должен быть строковый parameters.${key}.`, nodeId)); }
function validateNumericParameter(value, key, nodeId, result) { if (typeof value !== 'number' || !Number.isFinite(value)) result.push(errorIssue('NUMERIC_PARAMETER_MISSING', `Node ${nodeId} must have numeric parameters.${key}.`, `У ноды ${nodeId} должен быть числовой parameters.${key}.`, nodeId)); }
function validateAllowed(value, allowed, code, key, nodeId, result) { const allowedSet = allowed instanceof Set ? allowed : new Set(allowed); if (!isNonEmptyString(value) || !allowedSet.has(value)) result.push(errorIssue(code, `Node ${nodeId} parameters.${key} must be one of: ${Array.from(allowedSet).join(', ')}.`, `У ноды ${nodeId} parameters.${key} должен быть одним из: ${Array.from(allowedSet).join(', ')}.`, nodeId)); }
function validateBlackboardDefaults(defaults, result) { if (defaults === undefined) return result.push(errorIssue('BLACKBOARD_DEFAULTS_MISSING', 'AI graph must have blackboardDefaults.', 'У AI-графа должно быть поле blackboardDefaults.')); if (!isRecord(defaults)) return result.push(errorIssue('BLACKBOARD_DEFAULTS_NOT_OBJECT', 'blackboardDefaults must be a JSON object.', 'Поле blackboardDefaults должно быть JSON-объектом.')); for (const [key, value] of Object.entries(defaults)) { if (!isNonEmptyString(key)) result.push(errorIssue('BLACKBOARD_KEY_EMPTY', 'blackboardDefaults contains an empty key.', 'В blackboardDefaults найден пустой ключ.')); if (!isSupportedValue(value)) result.push(errorIssue('BLACKBOARD_VALUE_UNSUPPORTED', `Blackboard value ${key} has an unsupported format.`, `Blackboard-значение ${key} имеет неподдерживаемый формат.`)); } }
function writeMemory(context, key, value) { if (!key) return; context.blackboard[key] = normalizeValue(value); context.effects.push({ type: 'write_memory', key, value: context.blackboard[key] }); }
function compareNumber(value, threshold, comparison) { return comparison === 'below' ? value < threshold : value > threshold; }
function nodeName(node) { return node.displayName ?? node.type; }
function nodeNameRu(node) { return node.displayNameRu ?? node.displayName ?? node.type; }
function pushTrace(context, node, status, reason, reasonRu) { context.trace.push({ nodeId: node.id, nodeType: String(node.type), status, reason, reasonRu }); }
function errorIssue(code, message, messageRu, nodeId) { return { severity: 'error', code, message, messageRu, ...(nodeId ? { nodeId } : {}) }; }
function warningIssue(code, message, messageRu, nodeId) { return { severity: 'warning', code, message, messageRu, ...(nodeId ? { nodeId } : {}) }; }
function isSupportedValue(value) { return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || isPositionRecord(value); }
function isPositionRecord(value) { return isRecord(value) && typeof value.x === 'number' && typeof value.y === 'number'; }
function isRecord(value) { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function isNonEmptyString(value) { return typeof value === 'string' && value.trim().length > 0; }
function readString(value, fallback) { return isNonEmptyString(value) ? value : fallback; }
function readNumber(value, fallback) { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }
function readBoolean(value, fallback = false) { return typeof value === 'boolean' ? value : fallback; }
function readPosition(value) { return isPositionRecord(value) ? { x: value.x, y: value.y } : null; }
function normalizeValue(value) { return isSupportedValue(value) ? value : null; }
function clampNumber(value, min, max) { return Math.max(min, Math.min(max, value)); }
function roundScore(value) { return Math.round(value * 100) / 100; }
function deterministicPercent(seed) { let hash = 2166136261; for (let index = 0; index < seed.length; index += 1) { hash ^= seed.charCodeAt(index); hash = Math.imul(hash, 16777619); } return Math.abs(hash) % 101; }
