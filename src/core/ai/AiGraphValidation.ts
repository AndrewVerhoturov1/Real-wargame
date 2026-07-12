import { AI_NODE_TYPE_DEFINITIONS, isAiNodeType } from './AiNodeTypes';

export type AiGraphValidationSeverity = 'error' | 'warning';

export interface AiGraphValidationIssue {
  readonly severity: AiGraphValidationSeverity;
  readonly code: string;
  readonly message: string;
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
    return invalidResult('GRAPH_NOT_OBJECT', 'AI graph must be a JSON object.', 'AI-граф должен быть JSON-объектом.');
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
    issues.push(errorIssue('UNSUPPORTED_VERSION', 'Only AI graph version 1 is supported.', 'Поддерживается только версия AI-графа 1.'));
  }

  if (!isNonEmptyString(graph.id)) {
    issues.push(errorIssue('MISSING_GRAPH_ID', 'AI graph must have a non-empty string id.', 'У AI-графа должен быть непустой строковый id.'));
  }

  if (!isNonEmptyString(graph.rootNodeId)) {
    issues.push(errorIssue('MISSING_ROOT_NODE_ID', 'AI graph must have rootNodeId.', 'У AI-графа должен быть rootNodeId.'));
  }

  if (!Array.isArray(graph.nodes)) {
    issues.push(errorIssue('NODES_NOT_ARRAY', 'nodes must be an array.', 'Поле nodes должно быть массивом нод.'));
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
      issues.push(errorIssue('NODE_NOT_OBJECT', `Node #${index + 1} must be a JSON object.`, `Нода #${index + 1} должна быть JSON-объектом.`));
      continue;
    }

    const id = nodeValue.id;
    if (!isNonEmptyString(id)) {
      issues.push(errorIssue('NODE_WITHOUT_ID', `Node #${index + 1} must have a non-empty string id.`, `Нода #${index + 1} должна иметь непустой строковый id.`));
      continue;
    }

    if (nodeById.has(id)) {
      issues.push(errorIssue('DUPLICATE_NODE_ID', `Duplicate node id: ${id}.`, `Дублируется id ноды: ${id}.`, id));
      continue;
    }

    nodeById.set(id, nodeValue);
    validateNodeType(nodeValue, issues, id);
    validateNodeChildrenShape(nodeValue, issues, id);
    validateNodeParameters(nodeValue.type, nodeValue.parameters, issues, id);

    if (nodeValue.type === 'Root') {
      rootNodeIds.push(id);
    }
  }

  if (rootNodeIds.length > 1) {
    issues.push(warningIssue('MULTIPLE_ROOT_NODES', `Graph has multiple Root nodes: ${rootNodeIds.join(', ')}. rootNodeId is used.`, `В графе несколько нод Root: ${rootNodeIds.join(', ')}. Используется rootNodeId.`));
  }

  return nodeById;
}

function validateRoot(rootNodeIdValue: unknown, nodeById: Map<string, UnknownRecord>, issues: AiGraphValidationIssue[]): void {
  if (!isNonEmptyString(rootNodeIdValue)) {
    return;
  }

  const rootNode = nodeById.get(rootNodeIdValue);
  if (!rootNode) {
    issues.push(errorIssue('ROOT_NODE_NOT_FOUND', `rootNodeId points to a missing node: ${rootNodeIdValue}.`, `rootNodeId указывает на несуществующую ноду: ${rootNodeIdValue}.`));
    return;
  }

  if (rootNode.type !== 'Root') {
    issues.push(errorIssue('ROOT_NODE_WRONG_TYPE', `rootNodeId must point to a Root node, current type: ${String(rootNode.type)}.`, `rootNodeId должен указывать на ноду типа Root, сейчас: ${String(rootNode.type)}.`, rootNodeIdValue));
  }
}

function validateNodeType(node: UnknownRecord, issues: AiGraphValidationIssue[], nodeId: string): void {
  if (!isNonEmptyString(node.type)) {
    issues.push(errorIssue('NODE_WITHOUT_TYPE', `Node ${nodeId} must have a string type.`, `У ноды ${nodeId} должен быть строковый type.`, nodeId));
    return;
  }

  if (!isAiNodeType(node.type)) {
    issues.push(errorIssue('UNKNOWN_NODE_TYPE', `Node ${nodeId} has unknown type: ${node.type}.`, `У ноды ${nodeId} неизвестный type: ${node.type}.`, nodeId));
  }
}

function validateNodeChildrenShape(node: UnknownRecord, issues: AiGraphValidationIssue[], nodeId: string): void {
  const children = node.children;

  if (children === undefined) {
    return;
  }

  if (!Array.isArray(children)) {
    issues.push(errorIssue('CHILDREN_NOT_ARRAY', `Node ${nodeId} children must be an array of string ids.`, `У ноды ${nodeId} поле children должно быть массивом строковых id.`, nodeId));
    return;
  }

  for (const childId of children) {
    if (!isNonEmptyString(childId)) {
      issues.push(errorIssue('CHILD_ID_NOT_STRING', `All children of node ${nodeId} must be non-empty strings.`, `У ноды ${nodeId} все children должны быть непустыми строками.`, nodeId));
    }
  }

  if (isNonEmptyString(node.type) && isAiNodeType(node.type) && !AI_NODE_TYPE_DEFINITIONS[node.type].canHaveChildren && children.length > 0) {
    issues.push(errorIssue('LEAF_NODE_HAS_CHILDREN', `Node ${nodeId} of type ${node.type} must not have children.`, `Нода ${nodeId} типа ${node.type} не должна иметь children.`, nodeId));
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
        issues.push(errorIssue('BROKEN_CHILD_LINK', `Node ${nodeId} references a missing child: ${childId}.`, `Нода ${nodeId} ссылается на несуществующего ребёнка: ${childId}.`, nodeId));
      }
    }
  }
}

function validateNodeParameters(nodeType: unknown, parametersValue: unknown, issues: AiGraphValidationIssue[], nodeId: string): void {
  if (parametersValue === undefined) {
    return;
  }

  if (!isRecord(parametersValue)) {
    issues.push(errorIssue('PARAMETERS_NOT_OBJECT', `Node ${nodeId} parameters must be an object.`, `У ноды ${nodeId} поле parameters должно быть объектом.`, nodeId));
    return;
  }

  for (const [key, value] of Object.entries(parametersValue)) {
    if (!isNonEmptyString(key)) {
      issues.push(errorIssue('PARAMETER_KEY_EMPTY', `Node ${nodeId} has an empty parameter key.`, `У ноды ${nodeId} найден пустой ключ параметра.`, nodeId));
    }

    if (!isSupportedValue(value)) {
      issues.push(errorIssue('PARAMETER_VALUE_UNSUPPORTED', `Node ${nodeId} parameter ${key} has an unsupported value. Allowed: string, number, boolean, null, and position {x,y}.`, `У ноды ${nodeId} параметр ${key} имеет неподдерживаемое значение. Разрешены строки, числа, boolean, null и позиция {x,y}.`, nodeId));
    }
  }

  if (nodeType === 'Reload') validateReloadParameters(parametersValue, issues, nodeId);
}

function validateReloadParameters(parameters: UnknownRecord, issues: AiGraphValidationIssue[], nodeId: string): void {
  validateNonNegativeNumberParameter(parameters, 'durationSeconds', false, 'RELOAD_DURATION_INVALID', 'Reload durationSeconds must be a non-negative number.', 'У ноды «Перезарядить» длительность должна быть неотрицательным числом.', issues, nodeId);
  validateNonNegativeNumberParameter(parameters, 'targetAmmo', true, 'RELOAD_TARGET_AMMO_INVALID', 'Reload targetAmmo must be a non-negative integer.', 'У ноды «Перезарядить» число патронов после завершения должно быть неотрицательным целым числом.', issues, nodeId);
  const failIfNoWeapon = parameters.failIfNoWeapon;
  if (typeof failIfNoWeapon !== 'boolean') {
    issues.push(errorIssue('RELOAD_WEAPON_FLAG_INVALID', 'Reload failIfNoWeapon must be boolean.', 'У ноды «Перезарядить» параметр «Провалить, если нет оружия» должен быть да/нет.', nodeId));
  }
}

function validateNonNegativeNumberParameter(
  parameters: UnknownRecord,
  key: string,
  requireInteger: boolean,
  code: string,
  message: string,
  messageRu: string,
  issues: AiGraphValidationIssue[],
  nodeId: string,
): void {
  const value = parameters[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (requireInteger && !Number.isInteger(value))) {
    issues.push(errorIssue(code, message, messageRu, nodeId));
  }
}

function validateBlackboardDefaults(defaultsValue: unknown, issues: AiGraphValidationIssue[]): void {
  if (defaultsValue === undefined) {
    issues.push(errorIssue('BLACKBOARD_DEFAULTS_MISSING', 'AI graph must have blackboardDefaults.', 'У AI-графа должно быть поле blackboardDefaults.'));
    return;
  }

  if (!isRecord(defaultsValue)) {
    issues.push(errorIssue('BLACKBOARD_DEFAULTS_NOT_OBJECT', 'blackboardDefaults must be a JSON object.', 'Поле blackboardDefaults должно быть JSON-объектом.'));
    return;
  }

  for (const [key, value] of Object.entries(defaultsValue)) {
    if (!isNonEmptyString(key)) {
      issues.push(errorIssue('BLACKBOARD_KEY_EMPTY', 'blackboardDefaults contains an empty key.', 'В blackboardDefaults найден пустой ключ.'));
    }

    if (!isSupportedValue(value)) {
      issues.push(errorIssue('BLACKBOARD_VALUE_UNSUPPORTED', `Blackboard value ${key} has an unsupported format.`, `Blackboard-значение ${key} имеет неподдерживаемый формат.`));
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

function invalidResult(code: string, message: string, messageRu: string): AiGraphValidationResult {
  return {
    valid: false,
    issues: [errorIssue(code, message, messageRu)],
  };
}

function errorIssue(code: string, message: string, messageRu: string, nodeId?: string): AiGraphValidationIssue {
  return {
    severity: 'error',
    code,
    message,
    messageRu,
    ...(nodeId ? { nodeId } : {}),
  };
}

function warningIssue(code: string, message: string, messageRu: string, nodeId?: string): AiGraphValidationIssue {
  return {
    severity: 'warning',
    code,
    message,
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
