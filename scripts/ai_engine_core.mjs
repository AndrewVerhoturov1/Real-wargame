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
  'DangerAbove',
  'StressAbove',
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
  'DangerAbove',
  'StressAbove',
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
export const ENGINE_VERSION = '0.2.0-stage-2';

export function resolveBundledGraphPath(repoRoot) {
  return path.join(repoRoot, 'src', 'data', 'ai', 'soldier_default_survival_graph.json');
}

export function loadJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function validateGraph(value) {
  const result = [];

  if (!isRecord(value)) {
    return [errorIssue('GRAPH_NOT_OBJECT', 'AI-граф должен быть JSON-объектом.')];
  }

  if (value.version !== 1) {
    result.push(errorIssue('UNSUPPORTED_VERSION', 'Поддерживается только версия AI-графа 1.'));
  }

  if (!isNonEmptyString(value.id)) {
    result.push(errorIssue('MISSING_GRAPH_ID', 'У AI-графа должен быть непустой строковый id.'));
  }

  if (!isNonEmptyString(value.rootNodeId)) {
    result.push(errorIssue('MISSING_ROOT_NODE_ID', 'У AI-графа должен быть rootNodeId.'));
  }

  if (!isRecord(value.blackboardDefaults)) {
    result.push(errorIssue('BLACKBOARD_DEFAULTS_NOT_OBJECT', 'Поле blackboardDefaults должно быть JSON-объектом.'));
  }

  if (!Array.isArray(value.nodes)) {
    result.push(errorIssue('NODES_NOT_ARRAY', 'Поле nodes должно быть массивом нод.'));
    return result;
  }

  const nodeById = new Map();
  const rootNodeIds = [];

  for (const [index, node] of value.nodes.entries()) {
    if (!isRecord(node)) {
      result.push(errorIssue('NODE_NOT_OBJECT', `Нода #${index + 1} должна быть JSON-объектом.`));
      continue;
    }

    if (!isNonEmptyString(node.id)) {
      result.push(errorIssue('NODE_WITHOUT_ID', `Нода #${index + 1} должна иметь непустой строковый id.`));
      continue;
    }

    if (nodeById.has(node.id)) {
      result.push(errorIssue('DUPLICATE_NODE_ID', `Дублируется id ноды: ${node.id}.`, node.id));
      continue;
    }

    nodeById.set(node.id, node);

    if (!isNonEmptyString(node.type)) {
      result.push(errorIssue('NODE_WITHOUT_TYPE', `У ноды ${node.id} должен быть строковый type.`, node.id));
      continue;
    }

    if (!KNOWN_NODE_TYPES.has(node.type)) {
      result.push(errorIssue('UNKNOWN_NODE_TYPE', `У ноды ${node.id} неизвестный type: ${node.type}.`, node.id));
    }

    if (node.type === 'Root') {
      rootNodeIds.push(node.id);
    }

    if (node.children !== undefined) {
      validateChildrenShape(node, result);
    }

    validateNodeParameters(node.parameters, result, node.id);
  }

  if (rootNodeIds.length > 1) {
    result.push(warningIssue('MULTIPLE_ROOT_NODES', `В графе несколько нод Root: ${rootNodeIds.join(', ')}. Используется rootNodeId.`));
  }

  const rootNode = nodeById.get(value.rootNodeId);
  if (isNonEmptyString(value.rootNodeId) && !rootNode) {
    result.push(errorIssue('ROOT_NODE_NOT_FOUND', `rootNodeId указывает на несуществующую ноду: ${value.rootNodeId}.`));
  }

  if (rootNode && rootNode.type !== 'Root') {
    result.push(errorIssue('ROOT_NODE_WRONG_TYPE', `rootNodeId должен указывать на ноду типа Root, сейчас: ${String(rootNode.type)}.`, value.rootNodeId));
  }

  for (const [nodeId, node] of nodeById) {
    if (!Array.isArray(node.children)) {
      continue;
    }

    for (const childId of node.children) {
      if (isNonEmptyString(childId) && !nodeById.has(childId)) {
        result.push(errorIssue('BROKEN_CHILD_LINK', `Нода ${nodeId} ссылается на несуществующего ребёнка: ${childId}.`, nodeId));
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

  const survivalVeto = danger < 60 && stress < 55;
  const survivalScore = survivalVeto ? -999 : danger * 0.8 + stress * 0.45 + 20 + (coverPosition ? 15 : 0);
  const continueVeto = !hasOrder;
  const continueScore = continueVeto ? -999 : 35 - danger * 0.7 + (currentAction === 'continue_order' ? 12 : 0);
  const observeScore = 5 - danger * 0.1 + (currentAction === 'observe' ? 8 : 0);

  const scores = [
    {
      branchNodeId: 'critical_survival',
      branchNameRu: 'Критическое выживание',
      score: roundScore(survivalScore),
      vetoed: survivalVeto,
      ...(survivalVeto ? { vetoReasonRu: 'Опасность и стресс ниже порога реакции выживания.' } : {}),
      breakdown: [
        scoreItem('score_danger_for_cover', 'Опасность', danger * 0.8, `danger ${danger} * 0.8`),
        scoreItem('score_stress_for_cover', 'Стресс', stress * 0.45, `stress ${stress} * 0.45`),
        scoreItem('score_cover_need', 'Нужда в укрытии', 20, 'базовая ценность укрытия'),
        scoreItem('find_best_cover', 'Найденное укрытие', coverPosition ? 15 : 0, coverPosition ? 'best_cover_position есть' : 'best_cover_position нет'),
      ],
    },
    {
      branchNodeId: 'continue_order',
      branchNameRu: 'Продолжать приказ',
      score: roundScore(continueScore),
      vetoed: continueVeto,
      ...(continueVeto ? { vetoReasonRu: 'У солдата нет активного приказа.' } : {}),
      breakdown: [
        scoreItem('score_obedience', 'Послушание приказу', hasOrder ? 35 : 0, hasOrder ? 'активный приказ есть' : 'активного приказа нет'),
        scoreItem('score_danger_against_order', 'Опасность против приказа', -danger * 0.7, `danger ${danger} * -0.7`),
        scoreItem('score_inertia_continue', 'Инерция действия', currentAction === 'continue_order' ? 12 : 0, currentAction === 'continue_order' ? 'уже продолжает приказ' : 'инерции продолжения нет'),
      ],
    },
    {
      branchNodeId: 'observe_area',
      branchNameRu: 'Наблюдать',
      score: roundScore(observeScore),
      vetoed: false,
      breakdown: [
        scoreItem('observe_action', 'Базовое наблюдение', 5, 'действие по умолчанию'),
        scoreItem('score_danger_against_observe', 'Опасность мешает наблюдению', -danger * 0.1, `danger ${danger} * -0.1`),
        scoreItem('score_inertia_observe', 'Инерция наблюдения', currentAction === 'observe' ? 8 : 0, currentAction === 'observe' ? 'уже наблюдает' : 'инерции наблюдения нет'),
      ],
    },
  ];

  const selectableScores = scores.filter((score) => !score.vetoed);
  const selected = selectableScores.reduce((best, candidate) => candidate.score > best.score ? candidate : best, selectableScores[0]);
  const command = commandForSelectedBranch(selected.branchNodeId, coverPosition);

  return {
    ok: true,
    validation,
    unitId,
    graphId: String(graph.id),
    selectedBranchNodeId: selected.branchNodeId,
    selectedBranchNameRu: selected.branchNameRu,
    command,
    scores,
    explanationRu: buildExplanation(selected.branchNodeId, command, danger, stress, coverPosition),
  };
}

export function createHealthPayload(port) {
  return {
    ok: true,
    service: ENGINE_NAME,
    version: ENGINE_VERSION,
    port,
    mode: 'headless-local-engine',
    scopeRu: 'Этап 2: локальный headless engine для проверки AI-графа одиночного солдата.',
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
        reasonRu: 'Опасность высока, найдено укрытие: двигаться к укрытию.',
      };
    }

    return {
      type: 'set_posture',
      posture: 'prone',
      reasonRu: 'Опасность высока, укрытие не найдено: лечь на землю.',
    };
  }

  if (branchNodeId === 'continue_order') {
    return {
      type: 'continue_order',
      reasonRu: 'Приказ есть, риск не перебил послушание приказу.',
    };
  }

  return {
    type: 'observe',
    reasonRu: 'Нет более срочного действия: наблюдать сектор.',
  };
}

function buildExplanation(branchNodeId, command, danger, stress, coverPosition) {
  if (branchNodeId === 'critical_survival') {
    return coverPosition
      ? `Солдат выбрал укрытие: danger=${danger}, stress=${stress}, точка укрытия есть (${coverPosition.x}, ${coverPosition.y}).`
      : `Солдат лёг: danger=${danger}, stress=${stress}, подходящего укрытия в blackboard нет.`;
  }

  if (branchNodeId === 'continue_order') {
    return `Солдат продолжает приказ: danger=${danger}, stress=${stress}, ветка приказа получила лучший балл.`;
  }

  return `Солдат наблюдает: danger=${danger}, stress=${stress}, срочная реакция не требуется.`;
}

function validateChildrenShape(node, result) {
  if (!Array.isArray(node.children)) {
    result.push(errorIssue('CHILDREN_NOT_ARRAY', `У ноды ${node.id} поле children должно быть массивом строковых id.`, node.id));
    return;
  }

  if (LEAF_NODE_TYPES.has(node.type) && node.children.length > 0) {
    result.push(errorIssue('LEAF_NODE_HAS_CHILDREN', `Нода ${node.id} типа ${node.type} не должна иметь children.`, node.id));
  }

  for (const childId of node.children) {
    if (!isNonEmptyString(childId)) {
      result.push(errorIssue('CHILD_ID_NOT_STRING', `У ноды ${node.id} все children должны быть непустыми строками.`, node.id));
    }
  }
}

function validateNodeParameters(parameters, result, nodeId) {
  if (parameters === undefined) {
    return;
  }

  if (!isRecord(parameters)) {
    result.push(errorIssue('PARAMETERS_NOT_OBJECT', `У ноды ${nodeId} поле parameters должно быть объектом.`, nodeId));
    return;
  }

  for (const [key, value] of Object.entries(parameters)) {
    if (!isNonEmptyString(key)) {
      result.push(errorIssue('PARAMETER_KEY_EMPTY', `У ноды ${nodeId} найден пустой ключ параметра.`, nodeId));
    }

    if (!isSupportedValue(value)) {
      result.push(errorIssue('PARAMETER_VALUE_UNSUPPORTED', `У ноды ${nodeId} параметр ${key} имеет неподдерживаемое значение. Разрешены строки, числа, boolean, null и позиция {x,y}.`, nodeId));
    }
  }
}

function validateBlackboardDefaults(defaults, result) {
  if (defaults === undefined) {
    result.push(errorIssue('BLACKBOARD_DEFAULTS_MISSING', 'У AI-графа должно быть поле blackboardDefaults.'));
    return;
  }

  if (!isRecord(defaults)) {
    result.push(errorIssue('BLACKBOARD_DEFAULTS_NOT_OBJECT', 'Поле blackboardDefaults должно быть JSON-объектом.'));
    return;
  }

  for (const [key, value] of Object.entries(defaults)) {
    if (!isNonEmptyString(key)) {
      result.push(errorIssue('BLACKBOARD_KEY_EMPTY', 'В blackboardDefaults найден пустой ключ.'));
    }

    if (!isSupportedValue(value)) {
      result.push(errorIssue('BLACKBOARD_VALUE_UNSUPPORTED', `Blackboard-значение ${key} имеет неподдерживаемый формат.`));
    }
  }
}

function scoreItem(sourceNodeId, labelRu, value, reasonRu) {
  return {
    sourceNodeId,
    labelRu,
    value: roundScore(value),
    reasonRu,
  };
}

function errorIssue(code, messageRu, nodeId) {
  return {
    severity: 'error',
    code,
    messageRu,
    ...(nodeId ? { nodeId } : {}),
  };
}

function warningIssue(code, messageRu, nodeId) {
  return {
    severity: 'warning',
    code,
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
