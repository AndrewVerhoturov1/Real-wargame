import { readFileSync } from 'node:fs';
import path from 'node:path';

export const KNOWN_NODE_TYPES = new Set([
  'Root', 'UtilitySelector', 'Sequence', 'Selector', 'ActionBranch',
  'BlackboardValueAbove', 'FlagCheck', 'DistanceCheck', 'StableThreshold', 'TacticalCheck',
  'ParameterScore', 'DistanceScore', 'DecisionInertia', 'RandomChance',
  'FindBestObject', 'SelectTarget',
  'WriteMemory', 'CopyMemory', 'ForbidAction',
  'SetPosture', 'SetAction', 'SetMovementMode', 'SayMessage',
  'WriteReason',
]);

export const LEAF_NODE_TYPES = new Set([
  'BlackboardValueAbove', 'FlagCheck', 'DistanceCheck', 'StableThreshold', 'TacticalCheck',
  'ParameterScore', 'DistanceScore', 'DecisionInertia', 'RandomChance',
  'FindBestObject', 'SelectTarget',
  'WriteMemory', 'CopyMemory', 'ForbidAction',
  'SetPosture', 'SetAction', 'SetMovementMode', 'SayMessage',
  'WriteReason',
]);

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
export const ENGINE_VERSION = '0.7.0-clean-universal-node-catalog';

export function resolveBundledGraphPath(repoRoot) {
  return path.join(repoRoot, 'src', 'data', 'ai', 'soldier_default_survival_graph.json');
}

export function loadJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function validateGraph(value) {
  const result = [];
  if (!isRecord(value)) return [errorIssue('GRAPH_NOT_OBJECT', 'AI graph must be a JSON object.', 'AI-граф должен быть JSON-объектом.')];
  if (value.version !== 1) result.push(errorIssue('UNSUPPORTED_VERSION', 'Only AI graph version 1 is supported.', 'Поддерживается только версия AI-графа 1.'));
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

  const unitId = isNonEmptyString(input.unitId) ? input.unitId : 'soldier_1';
  const nodes = Array.isArray(graph.nodes) ? graph.nodes.filter(isRecord) : [];
  const actionNode = nodes.find((node) => ['SetAction', 'SetPosture', 'SetMovementMode', 'SayMessage'].includes(node.type));
  const explanation = actionNode
    ? `Clean universal graph is valid. First action-like node is ${actionNode.id} (${actionNode.type}).`
    : 'Clean universal graph is valid. No action node is connected yet, so no live command is produced.';
  const explanationRu = actionNode
    ? `Чистый универсальный граф валиден. Первая нода действия: ${actionNode.id} (${actionNode.type}).`
    : 'Чистый универсальный граф валиден. Нода действия ещё не добавлена, поэтому живой команды пока нет.';

  return {
    ok: true,
    validation,
    unitId,
    graphId: String(graph.id),
    selectedBranchNodeId: actionNode?.id ?? graph.rootNodeId,
    selectedBranchName: actionNode?.type ?? 'No Action',
    selectedBranchNameRu: actionNode ? String(actionNode.type) : 'Нет действия',
    command: buildPreviewCommand(actionNode),
    scores: [],
    explanation,
    explanationRu,
  };
}

export function createHealthPayload(port) {
  return {
    ok: true,
    service: ENGINE_NAME,
    version: ENGINE_VERSION,
    port,
    mode: 'headless-local-engine',
    scope: 'Stage 4: local headless engine with clean universal node catalog, blank starter canvas, and common before/after delay parameters.',
    scopeRu: 'Этап 4: локальный headless engine с чистым универсальным набором нод, пустым стартовым canvas и общей задержкой до/после ноды.',
    textBase: 'en',
    overlayLanguage: 'ru',
    browserDoesHeavyAi: false,
    endpoints: ['GET /engine/health', 'POST /ai/graph/validate', 'POST /ai/graph/evaluate-once'],
  };
}

function buildPreviewCommand(actionNode) {
  if (!isRecord(actionNode)) {
    return { type: 'none', reason: 'No action node has been added yet.', reasonRu: 'Нода действия ещё не добавлена.' };
  }
  const parameters = isRecord(actionNode.parameters) ? actionNode.parameters : {};
  if (actionNode.type === 'SetAction') return { type: String(parameters.action ?? 'wait'), targetKey: parameters.targetKey ?? null, reason: 'Preview command from Action node.', reasonRu: 'Предварительная команда из ноды Действие.' };
  if (actionNode.type === 'SetPosture') return { type: 'set_posture', posture: String(parameters.posture ?? 'prone'), reason: 'Preview command from Posture node.', reasonRu: 'Предварительная команда из ноды Поза.' };
  if (actionNode.type === 'SetMovementMode') return { type: 'set_movement_mode', mode: String(parameters.mode ?? 'careful'), reason: 'Preview command from Movement Mode node.', reasonRu: 'Предварительная команда из ноды Режим движения.' };
  if (actionNode.type === 'SayMessage') return { type: 'say_message', message: parameters.message ?? null, messageRu: parameters.messageRu ?? null, durationSeconds: parameters.durationSeconds ?? 2, reason: 'Preview command from Say Message node.', reasonRu: 'Предварительная команда из ноды Реплика бойца.' };
  return { type: 'none', reason: 'No supported preview action found.', reasonRu: 'Поддерживаемое preview-действие не найдено.' };
}

function validateChildrenShape(node, result) {
  if (!Array.isArray(node.children)) return result.push(errorIssue('CHILDREN_NOT_ARRAY', `Node ${node.id} children must be an array of string ids.`, `У ноды ${node.id} поле children должно быть массивом строковых id.`, node.id));
  if (LEAF_NODE_TYPES.has(node.type) && node.children.length > 0) result.push(errorIssue('LEAF_NODE_HAS_CHILDREN', `Node ${node.id} of type ${node.type} must not have children.`, `Нода ${node.id} типа ${node.type} не должна иметь children.`, node.id));
  for (const childId of node.children) if (!isNonEmptyString(childId)) result.push(errorIssue('CHILD_ID_NOT_STRING', `All children of node ${node.id} must be non-empty strings.`, `У ноды ${node.id} все children должны быть непустыми строками.`, node.id));
}

function validateNodeParameters(parameters, result, nodeId) {
  if (parameters === undefined) return;
  if (!isRecord(parameters)) return result.push(errorIssue('PARAMETERS_NOT_OBJECT', `Node ${nodeId} parameters must be an object.`, `У ноды ${nodeId} поле parameters должно быть объектом.`, nodeId));
  for (const [key, value] of Object.entries(parameters)) {
    if (!isNonEmptyString(key)) result.push(errorIssue('PARAMETER_KEY_EMPTY', `Node ${nodeId} has an empty parameter key.`, `У ноды ${nodeId} найден пустой ключ параметра.`, nodeId));
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
  if (node.type === 'BlackboardValueAbove') {
    validateNumericParameter(parameters.threshold, 'threshold', node.id, result);
    validateAllowed(parameters.comparison ?? 'above', ['above', 'below'], 'COMPARISON_INVALID', 'comparison', node.id, result);
  }
  if (node.type === 'FlagCheck') {
    validateString(parameters.flagKey, 'flagKey', node.id, result);
    if (typeof parameters.expected !== 'boolean') result.push(errorIssue('FLAG_EXPECTED_INVALID', `Node ${node.id} parameters.expected must be boolean.`, `У ноды ${node.id} parameters.expected должен быть boolean.`, node.id));
  }
  if (node.type === 'DistanceCheck') {
    validateAllowed(parameters.from, DISTANCE_FROM_VALUES, 'DISTANCE_FROM_INVALID', 'from', node.id, result);
    validateAllowed(parameters.to, DISTANCE_TO_VALUES, 'DISTANCE_TO_INVALID', 'to', node.id, result);
    validateAllowed(parameters.comparison, ['closer', 'farther'], 'DISTANCE_COMPARISON_INVALID', 'comparison', node.id, result);
    validateNumericParameter(parameters.thresholdMeters, 'thresholdMeters', node.id, result);
  }
  if (node.type === 'StableThreshold') {
    validateNumericParameter(parameters.enterThreshold, 'enterThreshold', node.id, result);
    validateNumericParameter(parameters.exitThreshold, 'exitThreshold', node.id, result);
  }
  if (node.type === 'TacticalCheck') {
    validateAllowed(parameters.checkKind, TACTICAL_CHECK_VALUES, 'TACTICAL_CHECK_KIND_INVALID', 'checkKind', node.id, result);
    if (typeof parameters.expected !== 'boolean') result.push(errorIssue('TACTICAL_EXPECTED_INVALID', `Node ${node.id} parameters.expected must be boolean.`, `У ноды ${node.id} parameters.expected должен быть boolean.`, node.id));
  }
  if (node.type === 'ParameterScore') {
    validateNumericParameter(parameters.weight, 'weight', node.id, result);
    validateAllowed(parameters.direction ?? 'positive', ['positive', 'negative'], 'SCORE_DIRECTION_INVALID', 'direction', node.id, result);
  }
  if (node.type === 'DistanceScore') {
    validateAllowed(parameters.targetKind, TARGET_KIND_VALUES, 'DISTANCE_SCORE_TARGET_INVALID', 'targetKind', node.id, result);
    validateAllowed(parameters.preference, ['closer', 'farther'], 'DISTANCE_SCORE_PREFERENCE_INVALID', 'preference', node.id, result);
    validateNumericParameter(parameters.idealMeters, 'idealMeters', node.id, result);
    validateNumericParameter(parameters.weight, 'weight', node.id, result);
  }
  if (node.type === 'DecisionInertia') {
    validateAllowed(parameters.action, ACTION_VALUES, 'INERTIA_ACTION_INVALID', 'action', node.id, result);
    validateNumericParameter(parameters.bonus, 'bonus', node.id, result);
    validateNumericParameter(parameters.minimumSeconds, 'minimumSeconds', node.id, result);
  }
  if (node.type === 'RandomChance') validateNumericParameter(parameters.probabilityPercent, 'probabilityPercent', node.id, result);
  if (node.type === 'FindBestObject') {
    validateAllowed(parameters.objectKind, FIND_OBJECT_KIND_VALUES, 'FIND_OBJECT_KIND_INVALID', 'objectKind', node.id, result);
    validateAllowed(parameters.criteria ?? 'safer', FIND_CRITERIA_VALUES, 'FIND_CRITERIA_INVALID', 'criteria', node.id, result);
    validateNumericParameter(parameters.searchRadiusMeters, 'searchRadiusMeters', node.id, result);
    validateString(parameters.writeTo, 'writeTo', node.id, result);
  }
  if (node.type === 'SelectTarget') {
    validateAllowed(parameters.rule, TARGET_RULE_VALUES, 'TARGET_RULE_INVALID', 'rule', node.id, result);
    validateString(parameters.writeTo, 'writeTo', node.id, result);
  }
  if (node.type === 'WriteMemory') validateString(parameters.writeTo, 'writeTo', node.id, result);
  if (node.type === 'CopyMemory') {
    validateString(parameters.fromKey, 'fromKey', node.id, result);
    validateString(parameters.toKey, 'toKey', node.id, result);
  }
  if (node.type === 'ForbidAction') {
    validateAllowed(parameters.action, ACTION_VALUES, 'FORBID_ACTION_INVALID', 'action', node.id, result);
    validateNumericParameter(parameters.durationSeconds, 'durationSeconds', node.id, result);
  }
  if (node.type === 'SetPosture') validateAllowed(parameters.posture, POSTURE_VALUES, 'POSTURE_INVALID', 'posture', node.id, result);
  if (node.type === 'SetAction') validateAllowed(parameters.action, ACTION_VALUES, 'ACTION_INVALID', 'action', node.id, result);
  if (node.type === 'SetMovementMode') validateAllowed(parameters.mode, MOVEMENT_MODE_VALUES, 'MOVEMENT_MODE_INVALID', 'mode', node.id, result);
  if (node.type === 'SayMessage') {
    if (!isNonEmptyString(parameters.message) && !isNonEmptyString(parameters.messageRu)) result.push(errorIssue('SAY_MESSAGE_TEXT_MISSING', `Node ${node.id} must have message or messageRu.`, `У ноды ${node.id} должен быть message или messageRu.`, node.id));
    if (parameters.durationSeconds !== undefined && (typeof parameters.durationSeconds !== 'number' || parameters.durationSeconds <= 0)) result.push(errorIssue('SAY_MESSAGE_DURATION_INVALID', `Node ${node.id} durationSeconds must be a positive number.`, `У ноды ${node.id} durationSeconds должен быть положительным числом.`, node.id));
  }
}

function validateSourceKey(parameters, blackboardDefaults, nodeId, result) {
  validateString(parameters.sourceKey, 'sourceKey', nodeId, result);
  if (isNonEmptyString(parameters.sourceKey) && isRecord(blackboardDefaults)) {
    const defaultValue = blackboardDefaults[parameters.sourceKey];
    if (defaultValue !== undefined && typeof defaultValue !== 'number') result.push(warningIssue('SOURCE_NOT_NUMERIC', `Node ${nodeId} sourceKey ${parameters.sourceKey} is not numeric in blackboardDefaults.`, `У ноды ${nodeId} sourceKey ${parameters.sourceKey} не является числом в blackboardDefaults.`, nodeId));
  }
}

function validateString(value, key, nodeId, result) {
  if (!isNonEmptyString(value)) result.push(errorIssue('STRING_PARAMETER_MISSING', `Node ${nodeId} must have string parameters.${key}.`, `У ноды ${nodeId} должен быть строковый parameters.${key}.`, nodeId));
}

function validateNumericParameter(value, key, nodeId, result) {
  if (typeof value !== 'number' || !Number.isFinite(value)) result.push(errorIssue('NUMERIC_PARAMETER_MISSING', `Node ${nodeId} must have numeric parameters.${key}.`, `У ноды ${nodeId} должен быть числовой parameters.${key}.`, nodeId));
}

function validateAllowed(value, allowed, code, key, nodeId, result) {
  const allowedSet = allowed instanceof Set ? allowed : new Set(allowed);
  if (!isNonEmptyString(value) || !allowedSet.has(value)) result.push(errorIssue(code, `Node ${nodeId} parameters.${key} must be one of: ${Array.from(allowedSet).join(', ')}.`, `У ноды ${nodeId} parameters.${key} должен быть одним из: ${Array.from(allowedSet).join(', ')}.`, nodeId));
}

function validateBlackboardDefaults(defaults, result) {
  if (defaults === undefined) return result.push(errorIssue('BLACKBOARD_DEFAULTS_MISSING', 'AI graph must have blackboardDefaults.', 'У AI-графа должно быть поле blackboardDefaults.'));
  if (!isRecord(defaults)) return result.push(errorIssue('BLACKBOARD_DEFAULTS_NOT_OBJECT', 'blackboardDefaults must be a JSON object.', 'Поле blackboardDefaults должно быть JSON-объектом.'));
  for (const [key, value] of Object.entries(defaults)) {
    if (!isNonEmptyString(key)) result.push(errorIssue('BLACKBOARD_KEY_EMPTY', 'blackboardDefaults contains an empty key.', 'В blackboardDefaults найден пустой ключ.'));
    if (!isSupportedValue(value)) result.push(errorIssue('BLACKBOARD_VALUE_UNSUPPORTED', `Blackboard value ${key} has an unsupported format.`, `Blackboard-значение ${key} имеет неподдерживаемый формат.`));
  }
}

function errorIssue(code, message, messageRu, nodeId) { return { severity: 'error', code, message, messageRu, ...(nodeId ? { nodeId } : {}) }; }
function warningIssue(code, message, messageRu, nodeId) { return { severity: 'warning', code, message, messageRu, ...(nodeId ? { nodeId } : {}) }; }
function isSupportedValue(value) { return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || isPositionRecord(value); }
function isPositionRecord(value) { return isRecord(value) && typeof value.x === 'number' && typeof value.y === 'number'; }
function isRecord(value) { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function isNonEmptyString(value) { return typeof value === 'string' && value.trim().length > 0; }
