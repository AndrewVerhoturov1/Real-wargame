import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KNOWN_NODE_TYPES = new Set([
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

const LEAF_NODE_TYPES = new Set([
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const defaultGraphPath = path.join(repoRoot, 'src', 'data', 'ai', 'soldier_default_survival_graph.json');
const graphPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultGraphPath;

const graph = JSON.parse(readFileSync(graphPath, 'utf8'));
const issues = validateGraph(graph);
const errors = issues.filter((issue) => issue.severity === 'error');

if (issues.length > 0) {
  for (const issue of issues) {
    const location = issue.nodeId ? ` node=${issue.nodeId}` : '';
    console.log(`[${issue.severity}] ${issue.code}${location}: ${issue.messageRu}`);
  }
}

if (errors.length > 0) {
  console.error(`AI graph validation failed: ${errors.length} error(s).`);
  process.exit(1);
}

console.log(`AI graph validation OK: ${graphPath}`);

function validateGraph(value) {
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

    if (node.parameters !== undefined && !isRecord(node.parameters)) {
      result.push(errorIssue('PARAMETERS_NOT_OBJECT', `У ноды ${node.id} поле parameters должно быть объектом.`, node.id));
    }
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

  return result;
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

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}
