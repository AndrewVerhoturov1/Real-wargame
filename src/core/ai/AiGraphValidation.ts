import { AI_NODE_TYPE_DEFINITIONS, isAiNodeType } from './AiNodeTypes';

export type AiGraphValidationSeverity = 'error' | 'warning';

export interface AiGraphValidationIssue {
  readonly severity: AiGraphValidationSeverity;
  readonly code: string;
  readonly messageRu: string;
  readonly nodeId?: string;
}

export interface AiGraphValidationResult {
  readonly valid: boolean;
  readonly issues: readonly AiGraphValidationIssue[];
}

type UnknownRecord = Record<string, unknown>;

export function validateAiGraph(graph: unknown): AiGraphValidationResult {
  const issues: AiGraphValidationIssue[] = [];

  if (!isRecord(graph)) {
    return invalidResult('GRAPH_NOT_OBJECT', 'AI-граф должен быть JSON-объектом.');
  }

  validateGraphHeader(graph, issues);
  const nodeById = collectNodes(graph.nodes, issues);
  validateRoot(graph.rootNodeId, nodeById, issues);
  validateNodeLinks(nodeById, issues);
  validateBlackboardDefaults(graph.blackboardDefaults, issues);

  return {
    valid: !issues.some((issue) => issue.severity === 'error'),
    issues,
  };
}

function validateGraphHeader(graph: UnknownRecord, issues: AiGraphValidationIssue[]): void {
  if (graph.version !== 1) {
    issues.push(errorIssue('UNSUPPORTED_VERSION', 'Поддерживается только версия AI-графа 1.'));
  }

  if (!isNonEmptyString(graph.id)) {
    issues.push(errorIssue('MISSING_GRAPH_ID', 'У AI-графа должен быть непустой строковый id.'));
  }

  if (!isNonEmptyString(graph.rootNodeId)) {
    issues.push(errorIssue('MISSING_ROOT_NODE_ID', 'У AI-графа должен быть rootNodeId.'));
  }

  if (!Array.isArray(graph.nodes)) {
    issues.push(errorIssue('NODES_NOT_ARRAY', 'Поле nodes должно быть массивом нод.'));
  }
}

function collectNodes(nodesValue: unknown, issues: AiGraphValidationIssue[]): Map<string, UnknownRecord> {
  const nodeById = new Map<string, UnknownRecord>();
  const rootNodeIds: string[] = [];

  if (!Array.isArray(nodesValue)) {
    return nodeById;
  }

  for (const [index, nodeValue] of nodesValue.entries()) {
    if (!isRecord(nodeValue)) {
      issues.push(errorIssue('NODE_NOT_OBJECT', `Нода #${index + 1} должна быть JSON-объектом.`));
      continue;
    }

    const id = nodeValue.id;
    if (!isNonEmptyString(id)) {
      issues.push(errorIssue('NODE_WITHOUT_ID', `Нода #${index + 1} должна иметь непустой строковый id.`));
      continue;
    }

    if (nodeById.has(id)) {
      issues.push(errorIssue('DUPLICATE_NODE_ID', `Дублируется id ноды: ${id}.`, id));
      continue;
    }

    nodeById.set(id, nodeValue);
    validateNodeType(nodeValue, issues, id);
    validateNodeChildrenShape(nodeValue, issues, id);
    validateNodeParameters(nodeValue.parameters, issues, id);

    if (nodeValue.type === 'Root') {
      rootNodeIds.push(id);
    }
  }

  if (rootNodeIds.length > 1) {
    issues.push(warningIssue('MULTIPLE_ROOT_NODES', `В графе несколько нод Root: ${rootNodeIds.join(', ')}. Используется rootNodeId.`));
  }

  return nodeById;
}

function validateRoot(rootNodeIdValue: unknown, nodeById: Map<string, UnknownRecord>, issues: AiGraphValidationIssue[]): void {
  if (!isNonEmptyString(rootNodeIdValue)) {
    return;
  }

  const rootNode = nodeById.get(rootNodeIdValue);
  if (!rootNode) {
    issues.push(errorIssue('ROOT_NODE_NOT_FOUND', `rootNodeId указывает на несуществующую ноду: ${rootNodeIdValue}.`));
    return;
  }

  if (rootNode.type !== 'Root') {
    issues.push(errorIssue('ROOT_NODE_WRONG_TYPE', `rootNodeId должен указывать на ноду типа Root, сейчас: ${String(rootNode.type)}.`, rootNodeIdValue));
  }
}

function validateNodeType(node: UnknownRecord, issues: AiGraphValidationIssue[], nodeId: string): void {
  if (!isNonEmptyString(node.type)) {
    issues.push(errorIssue('NODE_WITHOUT_TYPE', `У ноды ${nodeId} должен быть строковый type.`, nodeId));
    return;
  }

  if (!isAiNodeType(node.type)) {
    issues.push(errorIssue('UNKNOWN_NODE_TYPE', `У ноды ${nodeId} неизвестный type: ${node.type}.`, nodeId));
  }
}

function validateNodeChildrenShape(node: UnknownRecord, issues: AiGraphValidationIssue[], nodeId: string): void {
  const children = node.children;

  if (children === undefined) {
    return;
  }

  if (!Array.isArray(children)) {
    issues.push(errorIssue('CHILDREN_NOT_ARRAY', `У ноды ${nodeId} поле children должно быть массивом строковых id.`, nodeId));
    return;
  }

  for (const childId of children) {
    if (!isNonEmptyString(childId)) {
      issues.push(errorIssue('CHILD_ID_NOT_STRING', `У ноды ${nodeId} все children должны быть непустыми строками.`, nodeId));
    }
  }

  if (isNonEmptyString(node.type) && isAiNodeType(node.type) && !AI_NODE_TYPE_DEFINITIONS[node.type].canHaveChildren && children.length > 0) {
    issues.push(errorIssue('LEAF_NODE_HAS_CHILDREN', `Нода ${nodeId} типа ${node.type} не должна иметь children.`, nodeId));
  }
}

function validateNodeLinks(nodeById: Map<string, UnknownRecord>, issues: AiGraphValidationIssue[]): void {
  for (const [nodeId, node] of nodeById) {
    const children = node.children;

    if (!Array.isArray(children)) {
      continue;
    }

    for (const childId of children) {
      if (isNonEmptyString(childId) && !nodeById.has(childId)) {
        issues.push(errorIssue('BROKEN_CHILD_LINK', `Нода ${nodeId} ссылается на несуществующего ребёнка: ${childId}.`, nodeId));
      }
    }
  }
}

function validateNodeParameters(parametersValue: unknown, issues: AiGraphValidationIssue[], nodeId: string): void {
  if (parametersValue === undefined) {
    return;
  }

  if (!isRecord(parametersValue)) {
    issues.push(errorIssue('PARAMETERS_NOT_OBJECT', `У ноды ${nodeId} поле parameters должно быть объектом.`, nodeId));
    return;
  }

  for (const [key, value] of Object.entries(parametersValue)) {
    if (!isNonEmptyString(key)) {
      issues.push(errorIssue('PARAMETER_KEY_EMPTY', `У ноды ${nodeId} найден пустой ключ параметра.`, nodeId));
    }

    if (!isSupportedValue(value)) {
      issues.push(errorIssue('PARAMETER_VALUE_UNSUPPORTED', `У ноды ${nodeId} параметр ${key} имеет неподдерживаемое значение. Разрешены строки, числа, boolean, null и позиция {x,y}.`, nodeId));
    }
  }
}

function validateBlackboardDefaults(defaultsValue: unknown, issues: AiGraphValidationIssue[]): void {
  if (defaultsValue === undefined) {
    issues.push(errorIssue('BLACKBOARD_DEFAULTS_MISSING', 'У AI-графа должно быть поле blackboardDefaults.'));
    return;
  }

  if (!isRecord(defaultsValue)) {
    issues.push(errorIssue('BLACKBOARD_DEFAULTS_NOT_OBJECT', 'Поле blackboardDefaults должно быть JSON-объектом.'));
    return;
  }

  for (const [key, value] of Object.entries(defaultsValue)) {
    if (!isNonEmptyString(key)) {
      issues.push(errorIssue('BLACKBOARD_KEY_EMPTY', 'В blackboardDefaults найден пустой ключ.'));
    }

    if (!isSupportedValue(value)) {
      issues.push(errorIssue('BLACKBOARD_VALUE_UNSUPPORTED', `Blackboard-значение ${key} имеет неподдерживаемый формат.`));
    }
  }
}

function isSupportedValue(value: unknown): boolean {
  return value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
    || isPositionRecord(value);
}

function isPositionRecord(value: unknown): boolean {
  return isRecord(value)
    && typeof value.x === 'number'
    && typeof value.y === 'number';
}

function invalidResult(code: string, messageRu: string): AiGraphValidationResult {
  return {
    valid: false,
    issues: [errorIssue(code, messageRu)],
  };
}

function errorIssue(code: string, messageRu: string, nodeId?: string): AiGraphValidationIssue {
  return {
    severity: 'error',
    code,
    messageRu,
    ...(nodeId ? { nodeId } : {}),
  };
}

function warningIssue(code: string, messageRu: string, nodeId?: string): AiGraphValidationIssue {
  return {
    severity: 'warning',
    code,
    messageRu,
    ...(nodeId ? { nodeId } : {}),
  };
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
