import { readFileSync } from 'node:fs';
import path from 'node:path';

export const KNOWN_NODE_TYPES = new Set([
  'Root',
  'UtilitySelector',
  'Sequence',
  'Selector',
  'ActionBranch',
  'HasOrder',
  'EnemyVisible',
  'EnemyKnown',
  'UnderFire',
  'BlackboardValueAbove',
  'CoverNearby',
  'ScoreDanger',
  'ScoreStress',
  'ScoreObedience',
  'ScoreCoverNeed',
  'ScoreCurrentActionInertia',
  'FindBestCover',
  'SetPosture',
  'MoveToCover',
  'ContinueOrder',
  'Observe',
  'WriteReason',
]);

export const LEAF_NODE_TYPES = new Set([
  'HasOrder',
  'EnemyVisible',
  'EnemyKnown',
  'UnderFire',
  'BlackboardValueAbove',
  'CoverNearby',
  'ScoreDanger',
  'ScoreStress',
  'ScoreObedience',
  'ScoreCoverNeed',
  'ScoreCurrentActionInertia',
  'FindBestCover',
  'SetPosture',
  'MoveToCover',
  'ContinueOrder',
  'Observe',
  'WriteReason',
]);

export const ENGINE_NAME = 'real-wargame-local-ai-engine';
export const ENGINE_VERSION = '0.4.0-universal-blackboard-threshold';

export function resolveBundledGraphPath(repoRoot) {
  return path.join(repoRoot, 'src', 'data', 'ai', 'soldier_default_survival_graph.json');
}

export function loadJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function validateGraph(value) {
  const result = [];

  if (!isRecord(value)) {
    return [errorIssue('GRAPH_NOT_OBJECT', 'AI graph must be a JSON object.', 'AI-граф должен быть JSON-объектом.')];
  }

  if (value.version !== 1) {
    result.push(errorIssue('UNSUPPORTED_VERSION', 'Only AI graph version 1 is supported.', 'Поддерживается только версия AI-графа 1.'));
  }

  if (!isNonEmptyString(value.id)) {
    result.push(errorIssue('MISSING_GRAPH_ID', 'AI graph must have a non-empty string id.', 'У AI-графа должен быть непустой строковый id.'));
  }

  if (!isNonEmptyString(value.rootNodeId)) {
    result.push(errorIssue('MISSING_ROOT_NODE_ID', 'AI graph must have rootNodeId.', 'У AI-графа должен быть rootNodeId.'));
  }

  if (!isRecord(value.blackboardDefaults)) {
    result.push(errorIssue('BLACKBOARD_DEFAULTS_NOT_OBJECT', 'blackboardDefaults must be a JSON object.', 'Поле blackboardDefaults должно быть JSON-объектом.'));
  }

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

    if (!KNOWN_NODE_TYPES.has(node.type)) {
      result.push(errorIssue('UNKNOWN_NODE_TYPE', `Node ${node.id} has unknown type: ${node.type}.`, `У ноды ${node.id} неизвестный type: ${node.type}.`, node.id));
    }

    if (node.type === 'Root') {
      rootNodeIds.push(node.id);
    }

    if (node.children !== undefined) {
      validateChildrenShape(node, result);
    }

    validateNodeParameters(node.parameters, result, node.id);
    validateSpecificNodeParameters(node, value.blackboardDefaults, result);
  }

  if (rootNodeIds.length > 1) {
    result.push(warningIssue('MULTIPLE_ROOT_NODES', `Graph has multiple Root nodes: ${rootNodeIds.join(', ')}. rootNodeId is used.`, `В графе несколько нод Root: ${rootNodeIds.join(', ')}. Используется rootNodeId.`));
  }

  const rootNode = nodeById.get(value.rootNodeId);
  if (isNonEmptyString(value.rootNodeId) && !rootNode) {
    result.push(errorIssue('ROOT_NODE_NOT_FOUND', `rootNodeId points to a missing node: ${value.rootNodeId}.`, `rootNodeId указывает на несуществующую ноду: ${value.rootNodeId}.`));
  }

  if (rootNode && rootNode.type !== 'Root') {
    result.push(errorIssue('ROOT_NODE_WRONG_TYPE', `rootNodeId must point to a Root node, current type: ${String(rootNode.type)}.`, `rootNodeId должен указывать на ноду типа Root, сейчас: ${String(rootNode.type)}.`, value.rootNodeId));
  }

  for (const [nodeId, node] of nodeById) {
    if (!Array.isArray(node.children)) {
      continue;
    }

    for (const childId of node.children) {
      if (isNonEmptyString(childId) && !nodeById.has(childId)) {
        result.push(errorIssue('BROKEN_CHILD_LINK', `Node ${nodeId} references a missing child: ${childId}.`, `Нода ${nodeId} ссылается на несуществующего ребёнка: ${childId}.`, nodeId));
      }
    }
  }

  validateBlackboardDefaults(value.blackboardDefaults, result);

  return result;
}

export function makeValidationResult(graph) {
  const issues = validateGraph(graph);
  return {
    valid: !issues.some((issue) => issue.severity === 'error'),
    issues,
  };
}

export function evaluateSoldierOnce(input) {
  const graph = isRecord(input.graph) ? input.graph : input.bundledGraph;
  const validation = makeValidationResult(graph);
  if (!validation.valid) {
    return {
      ok: false,
      validation,
      error: 'Graph validation failed, soldier decision was not calculated.',
      errorRu: 'Граф не прошёл проверку, решение солдата не рассчитано.',
    };
  }

  const blackboard = {
    ...(isRecord(graph.blackboardDefaults) ? graph.blackboardDefaults : {}),
    ...(isRecord(input.blackboard) ? input.blackboard : {}),
  };
  const unitId = isNonEmptyString(input.unitId) ? input.unitId : 'soldier_1';
  const danger = clampPercent(toNumber(blackboard.danger, 0));
  const stress = clampPercent(toNumber(blackboard.stress, 0));
  const hasOrder = typeof input.hasOrder === 'boolean'
    ? input.hasOrder
    : Boolean(input.currentOrder ?? blackboard.current_order);
  const currentAction = isNonEmptyString(blackboard.current_action) ? blackboard.current_action : 'observe';
  const coverPosition = isPositionRecord(blackboard.best_cover_position) ? blackboard.best_cover_position : null;

  const dangerThreshold = readBranchThreshold(graph, 'critical_survival', 'danger', 60);
  const stressThreshold = readBranchThreshold(graph, 'critical_survival', 'stress', 55);
  const dangerConditionPassed = isBlackboardValueAbove(blackboard, 'danger', dangerThreshold);
  const stressConditionPassed = isBlackboardValueAbove(blackboard, 'stress', stressThreshold);
  const survivalVeto = !dangerConditionPassed && !stressConditionPassed;
  const survivalScore = survivalVeto ? -999 : danger * 0.8 + stress * 0.45 + 20 + (coverPosition ? 15 : 0);
  const continueVeto = !hasOrder;
  const continueScore = continueVeto ? -999 : 35 - danger * 0.7 + (currentAction === 'continue_order' ? 12 : 0);
  const observeScore = 5 - danger * 0.1 + (currentAction === 'observe' ? 8 : 0);

  const scores = [
    {
      branchNodeId: 'critical_survival',
      branchName: 'Critical Survival',
      branchNameRu: 'Критическое выживание',
      score: roundScore(survivalScore),
      vetoed: survivalVeto,
      ...(survivalVeto ? {
        vetoReason: `danger <= ${dangerThreshold} and stress <= ${stressThreshold}.`,
        vetoReasonRu: `Опасность <= ${dangerThreshold} и стресс <= ${stressThreshold}.`,
      } : {}),
      breakdown: [
        scoreItem('score_danger_for_cover', 'Danger', 'Опасность', danger * 0.8, `danger ${danger} * 0.8`, `danger ${danger} * 0.8`),
        scoreItem('score_stress_for_cover', 'Stress', 'Стресс', stress * 0.45, `stress ${stress} * 0.45`, `stress ${stress} * 0.45`),
        scoreItem('critical_danger_condition', 'Danger Threshold', 'Порог опасности', dangerConditionPassed ? 0 : -999, `danger ${danger} > ${dangerThreshold}`, `danger ${danger} > ${dangerThreshold}`),
        scoreItem('critical_stress_condition', 'Stress Threshold', 'Порог стресса', stressConditionPassed ? 0 : -999, `stress ${stress} > ${stressThreshold}`, `stress ${stress} > ${stressThreshold}`),
        scoreItem('score_cover_need', 'Cover Need', 'Нужда в укрытии', 20, 'base cover value', 'базовая ценность укрытия'),
        scoreItem('find_best_cover', 'Found Cover', 'Найденное укрытие', coverPosition ? 15 : 0, coverPosition ? 'best_cover_position is present' : 'best_cover_position is missing', coverPosition ? 'best_cover_position есть' : 'best_cover_position нет'),
      ],
    },
    {
      branchNodeId: 'continue_order',
      branchName: 'Continue Order',
      branchNameRu: 'Продолжать приказ',
      score: roundScore(continueScore),
      vetoed: continueVeto,
      ...(continueVeto ? {
        vetoReason: 'The soldier has no active order.',
        vetoReasonRu: 'У солдата нет активного приказа.',
      } : {}),
      breakdown: [
        scoreItem('score_obedience', 'Obedience To Order', 'Послушание приказу', hasOrder ? 35 : 0, hasOrder ? 'active order is present' : 'active order is missing', hasOrder ? 'активный приказ есть' : 'активного приказа нет'),
        scoreItem('score_danger_against_order', 'Danger Against Order', 'Опасность против приказа', -danger * 0.7, `danger ${danger} * -0.7`, `danger ${danger} * -0.7`),
        scoreItem('score_inertia_continue', 'Action Inertia', 'Инерция действия', currentAction === 'continue_order' ? 12 : 0, currentAction === 'continue_order' ? 'already continuing order' : 'no continue-order inertia', currentAction === 'continue_order' ? 'уже продолжает приказ' : 'инерции продолжения нет'),
      ],
    },
    {
      branchNodeId: 'observe_area',
      branchName: 'Observe',
      branchNameRu: 'Наблюдать',
      score: roundScore(observeScore),
      vetoed: false,
      breakdown: [
        scoreItem('observe_action', 'Base Observe', 'Базовое наблюдение', 5, 'default action', 'действие по умолчанию'),
        scoreItem('score_danger_against_observe', 'Danger Against Observe', 'Опасность мешает наблюдению', -danger * 0.1, `danger ${danger} * -0.1`, `danger ${danger} * -0.1`),
        scoreItem('score_inertia_observe', 'Observe Inertia', 'Инерция наблюдения', currentAction === 'observe' ? 8 : 0, currentAction === 'observe' ? 'already observing' : 'no observe inertia', currentAction === 'observe' ? 'уже наблюдает' : 'инерции наблюдения нет'),
      ],
    },
  ];

  const selectableScores = scores.filter((score) => !score.vetoed);
  const selected = selectableScores.reduce((best, candidate) => candidate.score > best.score ? candidate : best, selectableScores[0]);
  const command = commandForSelectedBranch(selected.branchNodeId, coverPosition);
  const explanation = buildExplanation(selected.branchNodeId, danger, stress, coverPosition, 'en');
  const explanationRu = buildExplanation(selected.branchNodeId, danger, stress, coverPosition, 'ru');

  return {
    ok: true,
    validation,
    unitId,
    graphId: String(graph.id),
    selectedBranchNodeId: selected.branchNodeId,
    selectedBranchName: selected.branchName,
    selectedBranchNameRu: selected.branchNameRu,
    command,
    scores,
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
    scope: 'Stage 4: local headless engine for single-soldier AI graph validation and evaluate-once with a universal threshold condition node.',
    scopeRu: 'Этап 4: локальный headless engine для проверки AI-графа одиночного солдата и evaluate-once с универсальной пороговой нодой.',
    textBase: 'en',
    overlayLanguage: 'ru',
    browserDoesHeavyAi: false,
    endpoints: [
      'GET /engine/health',
      'POST /ai/graph/validate',
      'POST /ai/graph/evaluate-once',
    ],
  };
}

function commandForSelectedBranch(branchNodeId, coverPosition) {
  if (branchNodeId === 'critical_survival') {
    if (coverPosition) {
      return {
        type: 'move_to',
        target: coverPosition,
        reason: 'Danger is high and cover is available: move to cover.',
        reasonRu: 'Опасность высока, найдено укрытие: двигаться к укрытию.',
      };
    }

    return {
      type: 'set_posture',
      posture: 'prone',
      reason: 'Danger is high and no cover is available: go prone.',
      reasonRu: 'Опасность высока, укрытие не найдено: лечь на землю.',
    };
  }

  if (branchNodeId === 'continue_order') {
    return {
      type: 'continue_order',
      reason: 'An order exists and risk did not overcome obedience.',
      reasonRu: 'Приказ есть, риск не перебил послушание приказу.',
    };
  }

  return {
    type: 'observe',
    reason: 'No more urgent action is needed: observe the sector.',
    reasonRu: 'Нет более срочного действия: наблюдать сектор.',
  };
}

function buildExplanation(branchNodeId, danger, stress, coverPosition, language) {
  if (branchNodeId === 'critical_survival') {
    if (coverPosition) {
      return language === 'ru'
        ? `Солдат выбрал укрытие: danger=${danger}, stress=${stress}, точка укрытия есть (${coverPosition.x}, ${coverPosition.y}).`
        : `Soldier chose cover: danger=${danger}, stress=${stress}, cover point is available (${coverPosition.x}, ${coverPosition.y}).`;
    }

    return language === 'ru'
      ? `Солдат лёг: danger=${danger}, stress=${stress}, подходящего укрытия в blackboard нет.`
      : `Soldier went prone: danger=${danger}, stress=${stress}, no suitable cover point is in the blackboard.`;
  }

  if (branchNodeId === 'continue_order') {
    return language === 'ru'
      ? `Солдат продолжает приказ: danger=${danger}, stress=${stress}, ветка приказа получила лучший балл.`
      : `Soldier continues the order: danger=${danger}, stress=${stress}, the order branch got the best score.`;
  }

  return language === 'ru'
    ? `Солдат наблюдает: danger=${danger}, stress=${stress}, срочная реакция не требуется.`
    : `Soldier observes: danger=${danger}, stress=${stress}, no urgent reaction is required.`;
}

function readBranchThreshold(graph, branchNodeId, sourceKey, fallback) {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const branch = nodes.find((node) => isRecord(node) && node.id === branchNodeId);
  const childIds = Array.isArray(branch?.children) ? branch.children : [];
  const thresholdNode = nodes.find((node) => isRecord(node)
    && node.type === 'BlackboardValueAbove'
    && isRecord(node.parameters)
    && node.parameters.sourceKey === sourceKey
    && childIds.includes(node.id));
  return clampPercent(toNumber(thresholdNode?.parameters?.threshold, fallback));
}

function isBlackboardValueAbove(blackboard, sourceKey, threshold) {
  return clampPercent(toNumber(blackboard[sourceKey], 0)) > clampPercent(threshold);
}

function validateChildrenShape(node, result) {
  if (!Array.isArray(node.children)) {
    result.push(errorIssue('CHILDREN_NOT_ARRAY', `Node ${node.id} children must be an array of string ids.`, `У ноды ${node.id} поле children должно быть массивом строковых id.`, node.id));
    return;
  }

  if (LEAF_NODE_TYPES.has(node.type) && node.children.length > 0) {
    result.push(errorIssue('LEAF_NODE_HAS_CHILDREN', `Node ${node.id} of type ${node.type} must not have children.`, `Нода ${node.id} типа ${node.type} не должна иметь children.`, node.id));
  }

  for (const childId of node.children) {
    if (!isNonEmptyString(childId)) {
      result.push(errorIssue('CHILD_ID_NOT_STRING', `All children of node ${node.id} must be non-empty strings.`, `У ноды ${node.id} все children должны быть непустыми строками.`, node.id));
    }
  }
}

function validateNodeParameters(parameters, result, nodeId) {
  if (parameters === undefined) {
    return;
  }

  if (!isRecord(parameters)) {
    result.push(errorIssue('PARAMETERS_NOT_OBJECT', `Node ${nodeId} parameters must be an object.`, `У ноды ${nodeId} поле parameters должно быть объектом.`, nodeId));
    return;
  }

  for (const [key, value] of Object.entries(parameters)) {
    if (!isNonEmptyString(key)) {
      result.push(errorIssue('PARAMETER_KEY_EMPTY', `Node ${nodeId} has an empty parameter key.`, `У ноды ${nodeId} найден пустой ключ параметра.`, nodeId));
    }

    if (!isSupportedValue(value)) {
      result.push(errorIssue('PARAMETER_VALUE_UNSUPPORTED', `Node ${nodeId} parameter ${key} has an unsupported value. Allowed: string, number, boolean, null, and position {x,y}.`, `У ноды ${nodeId} параметр ${key} имеет неподдерживаемое значение. Разрешены строки, числа, boolean, null и позиция {x,y}.`, nodeId));
    }
  }
}

function validateSpecificNodeParameters(node, blackboardDefaults, result) {
  if (node.type !== 'BlackboardValueAbove') {
    return;
  }

  const parameters = isRecord(node.parameters) ? node.parameters : {};
  if (!isNonEmptyString(parameters.sourceKey)) {
    result.push(errorIssue('BLACKBOARD_THRESHOLD_SOURCE_MISSING', `Node ${node.id} must have parameters.sourceKey.`, `У ноды ${node.id} должен быть parameters.sourceKey.`, node.id));
  }

  if (typeof parameters.threshold !== 'number' || !Number.isFinite(parameters.threshold)) {
    result.push(errorIssue('BLACKBOARD_THRESHOLD_VALUE_MISSING', `Node ${node.id} must have numeric parameters.threshold.`, `У ноды ${node.id} должен быть числовой parameters.threshold.`, node.id));
  } else if (parameters.threshold < 0 || parameters.threshold > 100) {
    result.push(warningIssue('BLACKBOARD_THRESHOLD_OUT_OF_RANGE', `Node ${node.id} threshold should normally be 0..100.`, `У ноды ${node.id} порог обычно должен быть 0..100.`, node.id));
  }

  if (isNonEmptyString(parameters.sourceKey) && isRecord(blackboardDefaults)) {
    const defaultValue = blackboardDefaults[parameters.sourceKey];
    if (defaultValue !== undefined && typeof defaultValue !== 'number') {
      result.push(warningIssue('BLACKBOARD_THRESHOLD_SOURCE_NOT_NUMERIC', `Node ${node.id} sourceKey ${parameters.sourceKey} is not numeric in blackboardDefaults.`, `У ноды ${node.id} sourceKey ${parameters.sourceKey} не является числом в blackboardDefaults.`, node.id));
    }
  }
}

function validateBlackboardDefaults(defaults, result) {
  if (defaults === undefined) {
    result.push(errorIssue('BLACKBOARD_DEFAULTS_MISSING', 'AI graph must have blackboardDefaults.', 'У AI-графа должно быть поле blackboardDefaults.'));
    return;
  }

  if (!isRecord(defaults)) {
    result.push(errorIssue('BLACKBOARD_DEFAULTS_NOT_OBJECT', 'blackboardDefaults must be a JSON object.', 'Поле blackboardDefaults должно быть JSON-объектом.'));
    return;
  }

  for (const [key, value] of Object.entries(defaults)) {
    if (!isNonEmptyString(key)) {
      result.push(errorIssue('BLACKBOARD_KEY_EMPTY', 'blackboardDefaults contains an empty key.', 'В blackboardDefaults найден пустой ключ.'));
    }

    if (!isSupportedValue(value)) {
      result.push(errorIssue('BLACKBOARD_VALUE_UNSUPPORTED', `Blackboard value ${key} has an unsupported format.`, `Blackboard-значение ${key} имеет неподдерживаемый формат.`));
    }
  }
}

function scoreItem(sourceNodeId, label, labelRu, value, reason, reasonRu) {
  return {
    sourceNodeId,
    label,
    labelRu,
    value: roundScore(value),
    reason,
    reasonRu,
  };
}

function errorIssue(code, message, messageRu, nodeId) {
  return {
    severity: 'error',
    code,
    message,
    messageRu,
    ...(nodeId ? { nodeId } : {}),
  };
}

function warningIssue(code, message, messageRu, nodeId) {
  return {
    severity: 'warning',
    code,
    message,
    messageRu,
    ...(nodeId ? { nodeId } : {}),
  };
}

function isSupportedValue(value) {
  return value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
    || isPositionRecord(value);
}

function isPositionRecord(value) {
  return isRecord(value)
    && typeof value.x === 'number'
    && typeof value.y === 'number';
}

function toNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, value));
}

function roundScore(value) {
  return Math.round(value * 10) / 10;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}
