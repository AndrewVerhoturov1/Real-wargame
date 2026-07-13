import type { AiBlackboardSchemaEntry } from './AiBlackboard';
import type { AiGraphV2 } from './AiGraph';
import { DEFAULT_AI_NODE_CONTRACT_REGISTRY } from './contracts/AiNodeContractRegistry';
import { DEFAULT_AI_SUBGRAPH_REGISTRY } from './contracts/AiSubgraphRegistry';
import type { AiNodeContract, AiParameterDefinition } from './contracts/AiNodeContract';
import {
  areAiPortKindsCompatible,
  inferAiPortValueKind,
  isAiInputBinding,
  isAiOutputBinding,
  type AiPortDefinition,
  type AiPortValueKind,
} from './contracts/AiPortTypes';

export type AiGraphValidationSeverity = 'error' | 'warning' | 'info';

export interface AiGraphValidationIssue {
  readonly severity: AiGraphValidationSeverity;
  readonly code: string;
  readonly message: string;
  readonly messageRu: string;
  readonly nodeId?: string;
  readonly parameterName?: string;
  readonly portName?: string;
  readonly fix?: string;
  readonly fixRu?: string;
}

export interface AiGraphValidationResult {
  readonly valid: boolean;
  readonly issues: readonly AiGraphValidationIssue[];
}

export interface AiGraphValidationContext {
  readonly subgraphs?: ReadonlyMap<string, AiGraphV2> | Readonly<Record<string, AiGraphV2>>;
}

type UnknownRecord = Record<string, unknown>;

export function validateAiGraph(
  graph: unknown,
  context: AiGraphValidationContext = {},
): AiGraphValidationResult {
  const issues: AiGraphValidationIssue[] = [];
  if (!isRecord(graph)) {
    return invalidResult('GRAPH_NOT_OBJECT', 'AI graph must be a JSON object.', 'AI-граф должен быть JSON-объектом.');
  }

  const version = graph.version;
  if (version !== 1 && version !== 2) {
    issues.push(errorIssue(
      'UNSUPPORTED_VERSION',
      'Only AI graph version 1 or 2 is supported.',
      'Поддерживается только версия AI-графа 1 или 2.',
      undefined,
      undefined,
      undefined,
      'Open the graph in the editor and choose “Check and update graph format”.',
      'Откройте граф в редакторе и нажмите «Проверить и обновить формат графа».',
    ));
  }
  validateGraphHeader(graph, issues);
  const nodeById = collectNodes(graph.nodes, version === 2, issues);
  validateRoot(graph.rootNodeId, nodeById, issues);
  validateNodeLinks(nodeById, issues);
  validateChildPolicies(nodeById, issues);
  validateReactiveSequences(nodeById, issues);
  validateReachability(graph.rootNodeId, nodeById, issues);
  validateForbiddenCycles(graph.rootNodeId, nodeById, issues);
  validateBlackboardDefaults(graph.blackboardDefaults, issues);
  if (version === 2) {
    const schema = validateBlackboardSchema(graph.blackboardSchema, graph.blackboardDefaults, issues);
    validateTypedBindings(nodeById, schema, issues);
    validateUnusedOutputs(nodeById, issues);
    validateSubgraphReferences(graph, nodeById, context, issues);
  } else {
    issues.push(infoIssue(
      'GRAPH_V1_LEGACY_FORMAT',
      'Graph v1 is supported through compatibility migration.',
      'Graph v1 поддерживается через совместимую миграцию.',
      undefined,
      'Use the editor action to inspect and update the format.',
      'Используйте действие редактора для проверки и обновления формата.',
    ));
  }

  return {
    valid: !issues.some((issue) => issue.severity === 'error'),
    issues,
  };
}

function validateGraphHeader(graph: UnknownRecord, issues: AiGraphValidationIssue[]): void {
  if (!isNonEmptyString(graph.id)) {
    issues.push(errorIssue('MISSING_GRAPH_ID', 'AI graph must have a non-empty string id.', 'У AI-графа должен быть непустой строковый id.'));
  }
  if (!isNonEmptyString(graph.rootNodeId)) {
    issues.push(errorIssue('MISSING_ROOT_NODE_ID', 'AI graph must have rootNodeId.', 'У AI-графа должен быть rootNodeId.'));
  }
  if (!Array.isArray(graph.nodes)) {
    issues.push(errorIssue('NODES_NOT_ARRAY', 'nodes must be an array.', 'Поле nodes должно быть массивом нод.'));
  }
  if (graph.version === 2 && !Array.isArray(graph.subgraphRefs)) {
    issues.push(errorIssue('SUBGRAPH_REFS_NOT_ARRAY', 'Graph v2 subgraphRefs must be an array.', 'У graph v2 поле subgraphRefs должно быть массивом.'));
  }
}

function collectNodes(
  nodesValue: unknown,
  strictContracts: boolean,
  issues: AiGraphValidationIssue[],
): Map<string, UnknownRecord> {
  const nodeById = new Map<string, UnknownRecord>();
  const rootNodeIds: string[] = [];
  if (!Array.isArray(nodesValue)) return nodeById;

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
    const contract = validateNodeType(nodeValue, issues, id);
    validateNodeChildrenShape(nodeValue, contract, issues, id);
    validateNodeParameters(nodeValue.type, nodeValue.parameters, contract, strictContracts, issues, id);
    validateKnownNodeParameters(nodeValue, issues, id);
    if (nodeValue.type === 'Root') rootNodeIds.push(id);
  }

  if (rootNodeIds.length === 0) {
    issues.push(errorIssue('ROOT_NODE_MISSING', 'Graph must contain one Root node.', 'В графе должна быть одна нода Root.'));
  }
  if (rootNodeIds.length > 1) {
    issues.push(warningIssue('MULTIPLE_ROOT_NODES', `Graph has multiple Root nodes: ${rootNodeIds.join(', ')}. rootNodeId is used.`, `В графе несколько нод Root: ${rootNodeIds.join(', ')}. Используется rootNodeId.`));
  }
  return nodeById;
}

function validateNodeType(
  node: UnknownRecord,
  issues: AiGraphValidationIssue[],
  nodeId: string,
): AiNodeContract | undefined {
  if (!isNonEmptyString(node.type)) {
    issues.push(errorIssue('NODE_WITHOUT_TYPE', `Node ${nodeId} must have a string type.`, `У ноды ${nodeId} должен быть строковый type.`, nodeId));
    return undefined;
  }
  const contract = DEFAULT_AI_NODE_CONTRACT_REGISTRY.get(node.type);
  if (!contract) {
    issues.push(errorIssue(
      'UNKNOWN_NODE_TYPE',
      `Node ${nodeId} has unknown type: ${node.type}.`,
      `У ноды ${nodeId} неизвестный type: ${node.type}.`,
      nodeId,
      undefined,
      undefined,
      'Replace the node with a registered type or install the extension that owns it.',
      'Замените ноду зарегистрированным типом или установите расширение, которому она принадлежит.',
    ));
  }
  return contract;
}

function validateNodeChildrenShape(
  node: UnknownRecord,
  contract: AiNodeContract | undefined,
  issues: AiGraphValidationIssue[],
  nodeId: string,
): void {
  const children = node.children;
  if (children === undefined) return;
  if (!Array.isArray(children)) {
    issues.push(errorIssue('CHILDREN_NOT_ARRAY', `Node ${nodeId} children must be an array of string ids.`, `У ноды ${nodeId} поле children должно быть массивом строковых id.`, nodeId));
    return;
  }
  for (const childId of children) {
    if (!isNonEmptyString(childId)) {
      issues.push(errorIssue('CHILD_ID_NOT_STRING', `All children of node ${nodeId} must be non-empty strings.`, `У ноды ${nodeId} все children должны быть непустыми строками.`, nodeId));
    }
  }
  if (contract?.childPolicy === 'none' && children.length > 0) {
    issues.push(errorIssue('LEAF_NODE_HAS_CHILDREN', `Node ${nodeId} of type ${contract.type} must not have children.`, `Нода ${nodeId} типа ${contract.type} не должна иметь children.`, nodeId));
  }
}

function validateChildPolicies(
  nodeById: Map<string, UnknownRecord>,
  issues: AiGraphValidationIssue[],
): void {
  for (const [nodeId, node] of nodeById) {
    if (!isNonEmptyString(node.type)) continue;
    const contract = DEFAULT_AI_NODE_CONTRACT_REGISTRY.get(node.type);
    if (!contract) continue;
    const count = Array.isArray(node.children) ? node.children.filter(isNonEmptyString).length : 0;
    if (contract.childPolicy === 'one' && count !== 1) {
      issues.push(errorIssue(
        'CHILD_COUNT_INVALID',
        `Node ${nodeId} requires exactly one child, current count: ${count}.`,
        `Ноде ${nodeId} нужен ровно один дочерний шаг, сейчас: ${count}.`,
        nodeId,
        undefined,
        undefined,
        'Connect exactly one child node.',
        'Подключите ровно одну дочернюю ноду.',
      ));
    }
  }
}

function validateRoot(rootNodeIdValue: unknown, nodeById: Map<string, UnknownRecord>, issues: AiGraphValidationIssue[]): void {
  if (!isNonEmptyString(rootNodeIdValue)) return;
  const rootNode = nodeById.get(rootNodeIdValue);
  if (!rootNode) {
    issues.push(errorIssue('ROOT_NODE_NOT_FOUND', `rootNodeId points to a missing node: ${rootNodeIdValue}.`, `rootNodeId указывает на несуществующую ноду: ${rootNodeIdValue}.`));
    return;
  }
  if (rootNode.type !== 'Root') {
    issues.push(errorIssue('ROOT_NODE_WRONG_TYPE', `rootNodeId must point to a Root node, current type: ${String(rootNode.type)}.`, `rootNodeId должен указывать на ноду типа Root, сейчас: ${String(rootNode.type)}.`, rootNodeIdValue));
  }
}

function validateNodeLinks(nodeById: Map<string, UnknownRecord>, issues: AiGraphValidationIssue[]): void {
  for (const [nodeId, node] of nodeById) {
    if (!Array.isArray(node.children)) continue;
    for (const childId of node.children) {
      if (isNonEmptyString(childId) && !nodeById.has(childId)) {
        issues.push(errorIssue('BROKEN_CHILD_LINK', `Node ${nodeId} references a missing child: ${childId}.`, `Нода ${nodeId} ссылается на несуществующего ребёнка: ${childId}.`, nodeId));
      }
    }
  }
}

function validateNodeParameters(
  nodeType: unknown,
  parametersValue: unknown,
  contract: AiNodeContract | undefined,
  strictContracts: boolean,
  issues: AiGraphValidationIssue[],
  nodeId: string,
): void {
  if (parametersValue === undefined) {
    if (nodeType === 'ReactiveSequence') {
      issues.push(errorIssue('REACTIVE_PARAMETERS_MISSING', 'ReactiveSequence must define its observer and abort policy parameters.', 'У ноды «Реактивная последовательность» должны быть параметры наблюдателя и политики прерывания.', nodeId));
    }
    if (strictContracts && contract) validateRequiredParameters({}, contract, issues, nodeId);
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
      issues.push(errorIssue('PARAMETER_VALUE_UNSUPPORTED', `Node ${nodeId} parameter ${key} has an unsupported value.`, `У ноды ${nodeId} параметр ${key} имеет неподдерживаемое значение.`, nodeId, key));
    }
  }
  if (strictContracts && contract) validateContractParameters(parametersValue, contract, issues, nodeId);
  if (nodeType === 'Reload') validateReloadParameters(parametersValue, issues, nodeId);
  if (nodeType === 'ReactiveSequence') validateReactiveSequenceParameters(parametersValue, issues, nodeId);
}

function validateRequiredParameters(
  parameters: UnknownRecord,
  contract: AiNodeContract,
  issues: AiGraphValidationIssue[],
  nodeId: string,
): void {
  for (const definition of contract.parameters) {
    if (definition.required && parameters[definition.id] === undefined) {
      issues.push(errorIssue(
        'REQUIRED_PARAMETER_MISSING',
        `Node ${nodeId} is missing required parameter ${definition.id}.`,
        `У ноды ${nodeId} отсутствует обязательный параметр «${definition.labelRu}».`,
        nodeId,
        definition.id,
        undefined,
        'Set the required value in the node inspector.',
        'Укажите обязательное значение в инспекторе ноды.',
      ));
    }
  }
}

function validateContractParameters(
  parameters: UnknownRecord,
  contract: AiNodeContract,
  issues: AiGraphValidationIssue[],
  nodeId: string,
): void {
  validateRequiredParameters(parameters, contract, issues, nodeId);
  const definitions = new Map(contract.parameters.map((definition) => [definition.id, definition]));
  for (const [key, value] of Object.entries(parameters)) {
    const definition = definitions.get(key);
    if (!definition) {
      issues.push(infoIssue(
        'UNKNOWN_PARAMETER_PRESERVED',
        `Node ${nodeId} contains unregistered parameter ${key}; it is preserved.`,
        `Нода ${nodeId} содержит незарегистрированный параметр ${key}; он сохранён.`,
        nodeId,
      ));
      continue;
    }
    validateParameterValue(value, definition, issues, nodeId);
  }
}

function validateParameterValue(
  value: unknown,
  definition: AiParameterDefinition,
  issues: AiGraphValidationIssue[],
  nodeId: string,
): void {
  if (value === null) {
    if (!definition.nullable) {
      issues.push(errorIssue('PARAMETER_NULL_NOT_ALLOWED', `Parameter ${definition.id} cannot be null.`, `Параметр «${definition.labelRu}» не может быть пустым.`, nodeId, definition.id));
    }
    return;
  }
  let validType = true;
  if (definition.kind === 'number') validType = typeof value === 'number' && Number.isFinite(value);
  else if (definition.kind === 'boolean') validType = typeof value === 'boolean';
  else if (definition.kind === 'position') validType = isPositionRecord(value);
  else if (definition.kind === 'enum') validType = typeof value === 'string';
  else validType = typeof value === 'string';

  if (!validType) {
    issues.push(errorIssue(
      'PARAMETER_TYPE_INVALID',
      `Parameter ${definition.id} has the wrong type; expected ${definition.kind}.`,
      `Параметр «${definition.labelRu}» имеет неправильный тип; ожидается ${definition.kind}.`,
      nodeId,
      definition.id,
      undefined,
      'Choose a value using the node inspector control.',
      'Выберите значение через элемент управления в инспекторе ноды.',
    ));
    return;
  }
  if (definition.kind === 'number' && typeof value === 'number') {
    if ((definition.minimum !== undefined && value < definition.minimum)
      || (definition.maximum !== undefined && value > definition.maximum)
      || (definition.integer && !Number.isInteger(value))) {
      const range = [definition.minimum, definition.maximum]
        .map((item) => item === undefined ? '—' : String(item)).join('…');
      issues.push(errorIssue(
        'PARAMETER_OUT_OF_RANGE',
        `Parameter ${definition.id} is outside the allowed range ${range}.`,
        `Параметр «${definition.labelRu}» выходит за допустимый диапазон ${range}.`,
        nodeId,
        definition.id,
        undefined,
        'Enter a value inside the shown range.',
        'Введите значение внутри указанного диапазона.',
      ));
    }
  }
  if (definition.kind === 'enum' && typeof value === 'string'
    && !definition.options?.some((entry) => entry.value === value)) {
    issues.push(errorIssue(
      'ENUM_VALUE_UNKNOWN',
      `Parameter ${definition.id} has unknown option ${value}.`,
      `Параметр «${definition.labelRu}» содержит неизвестный вариант ${value}.`,
      nodeId,
      definition.id,
      undefined,
      'Choose one of the values offered by the editor.',
      'Выберите один из вариантов, предложенных редактором.',
    ));
  }
}

function validateReachability(
  rootNodeId: unknown,
  nodeById: Map<string, UnknownRecord>,
  issues: AiGraphValidationIssue[],
): void {
  if (!isNonEmptyString(rootNodeId) || !nodeById.has(rootNodeId)) return;
  const reachable = new Set<string>();
  const visit = (nodeId: string): void => {
    if (reachable.has(nodeId)) return;
    reachable.add(nodeId);
    const node = nodeById.get(nodeId);
    if (!node || !Array.isArray(node.children)) return;
    for (const childId of node.children) if (isNonEmptyString(childId)) visit(childId);
  };
  visit(rootNodeId);
  for (const nodeId of nodeById.keys()) {
    if (!reachable.has(nodeId)) {
      issues.push(warningIssue(
        'UNREACHABLE_NODE',
        `Node ${nodeId} cannot be reached from the graph root.`,
        `Нода ${nodeId} недостижима от корня графа.`,
        nodeId,
        'Connect the node to a reachable branch or delete it.',
        'Подключите ноду к рабочей ветви или удалите её.',
      ));
    }
  }
}

function validateForbiddenCycles(
  rootNodeId: unknown,
  nodeById: Map<string, UnknownRecord>,
  issues: AiGraphValidationIssue[],
): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const reported = new Set<string>();
  const visit = (nodeId: string): void => {
    if (visiting.has(nodeId)) {
      if (!reported.has(nodeId)) {
        reported.add(nodeId);
        issues.push(errorIssue(
          'FORBIDDEN_GRAPH_CYCLE',
          `Graph contains a forbidden cycle through node ${nodeId}.`,
          `Граф содержит запрещённый цикл через ноду ${nodeId}.`,
          nodeId,
          undefined,
          undefined,
          'Break the connection. Retry is the supported bounded repetition node.',
          'Разорвите соединение. Для ограниченного повторения используйте ноду «Повторить попытку».',
        ));
      }
      return;
    }
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    const node = nodeById.get(nodeId);
    if (node && Array.isArray(node.children)) {
      for (const childId of node.children) if (isNonEmptyString(childId)) visit(childId);
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  if (isNonEmptyString(rootNodeId)) visit(rootNodeId);
  for (const nodeId of nodeById.keys()) visit(nodeId);
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
    if (!isNonEmptyString(key)) issues.push(errorIssue('BLACKBOARD_KEY_EMPTY', 'blackboardDefaults contains an empty key.', 'В blackboardDefaults найден пустой ключ.'));
    if (!isSupportedValue(value)) issues.push(errorIssue('BLACKBOARD_VALUE_UNSUPPORTED', `Blackboard value ${key} has an unsupported format.`, `Blackboard-значение ${key} имеет неподдерживаемый формат.`));
  }
}

function validateBlackboardSchema(
  schemaValue: unknown,
  defaultsValue: unknown,
  issues: AiGraphValidationIssue[],
): Map<string, AiPortValueKind> {
  const result = new Map<string, AiPortValueKind>();
  if (!Array.isArray(schemaValue)) {
    issues.push(errorIssue('BLACKBOARD_SCHEMA_NOT_ARRAY', 'Graph v2 blackboardSchema must be an array.', 'У graph v2 поле blackboardSchema должно быть массивом.'));
    return result;
  }
  for (const [index, value] of schemaValue.entries()) {
    if (!isRecord(value) || !isNonEmptyString(value.key) || !isNonEmptyString(value.valueKind)) {
      issues.push(errorIssue('BLACKBOARD_SCHEMA_ENTRY_INVALID', `Blackboard schema entry #${index + 1} is invalid.`, `Запись схемы Blackboard #${index + 1} недействительна.`));
      continue;
    }
    result.set(value.key, blackboardKindToPortKind(value as unknown as AiBlackboardSchemaEntry));
  }
  if (isRecord(defaultsValue)) {
    for (const [key, value] of Object.entries(defaultsValue)) {
      if (!result.has(key)) {
        const inferred = inferAiPortValueKind(value);
        if (inferred) result.set(key, inferred);
        issues.push(warningIssue('BLACKBOARD_SCHEMA_KEY_MISSING', `Blackboard key ${key} has no schema entry.`, `Для ключа Blackboard ${key} нет записи в схеме.`));
      }
    }
  }
  return result;
}

function resolveNodePorts(node: UnknownRecord): { readonly inputs: readonly AiPortDefinition[]; readonly outputs: readonly AiPortDefinition[] } | undefined {
  if (!isNonEmptyString(node.type)) return undefined;
  if (node.type === 'Subgraph') {
    const parameters = isRecord(node.parameters) ? node.parameters : {};
    const subgraphId = parameters.subgraphId;
    if (isNonEmptyString(subgraphId)) {
      const definition = DEFAULT_AI_SUBGRAPH_REGISTRY.get(subgraphId);
      if (definition) return { inputs: definition.inputs, outputs: definition.outputs };
    }
  }
  const contract = DEFAULT_AI_NODE_CONTRACT_REGISTRY.get(node.type);
  return contract ? { inputs: contract.inputs, outputs: contract.outputs } : undefined;
}

function validateTypedBindings(
  nodeById: Map<string, UnknownRecord>,
  blackboardKinds: ReadonlyMap<string, AiPortValueKind>,
  issues: AiGraphValidationIssue[],
): void {
  for (const [nodeId, node] of nodeById) {
    if (!isNonEmptyString(node.type)) continue;
    const ports = resolveNodePorts(node);
    if (!ports) continue;
    const bindings = isRecord(node.inputBindings) ? node.inputBindings : {};
    for (const portDefinition of ports.inputs) {
      const binding = bindings[portDefinition.id];
      if (portDefinition.required && binding === undefined) {
        issues.push(errorIssue(
          'REQUIRED_INPUT_MISSING',
          `Node ${nodeId} has no value for required input ${portDefinition.id}.`,
          `У ноды ${nodeId} не задан обязательный вход «${portDefinition.labelRu}».`,
          nodeId,
          undefined,
          portDefinition.id,
          'Connect a compatible output or choose a Blackboard value.',
          'Подключите совместимый выход или выберите значение Blackboard.',
        ));
      }
    }
    for (const [portId, rawBinding] of Object.entries(bindings)) {
      const input = ports.inputs.find((portDefinition) => portDefinition.id === portId);
      if (!input) {
        issues.push(errorIssue('UNKNOWN_INPUT_PORT', `Node ${nodeId} has unknown input port ${portId}.`, `У ноды ${nodeId} неизвестный вход ${portId}.`, nodeId, undefined, portId));
        continue;
      }
      if (!isAiInputBinding(rawBinding)) {
        issues.push(errorIssue('INPUT_BINDING_INVALID', `Node ${nodeId} input ${portId} has an invalid binding.`, `У входа ${portId} ноды ${nodeId} неверная привязка.`, nodeId, undefined, portId));
        continue;
      }
      let sourceKind: AiPortValueKind | undefined;
      if (rawBinding.source === 'literal') sourceKind = inferAiPortValueKind(rawBinding.value);
      if (rawBinding.source === 'blackboard') {
        sourceKind = blackboardKinds.get(rawBinding.key);
        if (!sourceKind) {
          issues.push(errorIssue('BLACKBOARD_BINDING_UNKNOWN_KEY', `Input ${portId} uses unknown Blackboard key ${rawBinding.key}.`, `Вход ${portId} использует неизвестный ключ Blackboard ${rawBinding.key}.`, nodeId, undefined, portId));
          continue;
        }
      }
      if (rawBinding.source === 'node') {
        const sourceNode = nodeById.get(rawBinding.nodeId);
        const sourcePorts = sourceNode ? resolveNodePorts(sourceNode) : undefined;
        if (!sourceNode || !sourcePorts) {
          issues.push(errorIssue('PORT_SOURCE_NODE_MISSING', `Input ${portId} references missing source node ${rawBinding.nodeId}.`, `Вход ${portId} ссылается на отсутствующую ноду ${rawBinding.nodeId}.`, nodeId, undefined, portId));
          continue;
        }
        const output = sourcePorts.outputs.find((candidate) => candidate.id === rawBinding.port);
        if (!output) {
          issues.push(errorIssue('PORT_SOURCE_OUTPUT_MISSING', `Source node ${rawBinding.nodeId} has no output ${rawBinding.port}.`, `У исходной ноды ${rawBinding.nodeId} нет выхода ${rawBinding.port}.`, nodeId, undefined, portId));
          continue;
        }
        sourceKind = output.kind;
      }
      if (rawBinding.source === 'subgraphInput') sourceKind = input.kind;
      if (sourceKind && !areAiPortKindsCompatible(sourceKind, input.kind)) {
        issues.push(errorIssue(
          'INCOMPATIBLE_PORT_TYPES',
          `Cannot pass ${sourceKind} into ${input.kind} input ${portId}.`,
          `Нельзя передать «${portKindRu(sourceKind)}» во вход «${portKindRu(input.kind)}».`,
          nodeId,
          undefined,
          portId,
          'Connect an output of the same value type.',
          'Подключите выход того же типа значения.',
        ));
      }
      if (rawBinding.source === 'literal' && rawBinding.value === null && !input.nullable) {
        issues.push(errorIssue('PORT_NULL_NOT_ALLOWED', `Input ${portId} does not allow null.`, `Вход «${input.labelRu}» не допускает пустое значение.`, nodeId, undefined, portId));
      }
    }

    if (node.outputBindings !== undefined) {
      if (!isRecord(node.outputBindings)) {
        issues.push(errorIssue('OUTPUT_BINDINGS_NOT_OBJECT', `Node ${nodeId} outputBindings must be an object.`, `У ноды ${nodeId} outputBindings должно быть объектом.`, nodeId));
      } else {
        for (const [portId, binding] of Object.entries(node.outputBindings)) {
          if (!ports.outputs.some((output) => output.id === portId)) {
            issues.push(errorIssue('UNKNOWN_OUTPUT_PORT', `Node ${nodeId} has unknown output port ${portId}.`, `У ноды ${nodeId} неизвестный выход ${portId}.`, nodeId, undefined, portId));
          } else if (!isAiOutputBinding(binding)) {
            issues.push(errorIssue('OUTPUT_BINDING_INVALID', `Node ${nodeId} output ${portId} has an invalid binding.`, `У выхода ${portId} ноды ${nodeId} неверная привязка.`, nodeId, undefined, portId));
          }
        }
      }
    }
  }
}

function validateUnusedOutputs(nodeById: Map<string, UnknownRecord>, issues: AiGraphValidationIssue[]): void {
  const used = new Set<string>();
  for (const node of nodeById.values()) {
    if (!isRecord(node.inputBindings)) continue;
    for (const binding of Object.values(node.inputBindings)) {
      if (isAiInputBinding(binding) && binding.source === 'node') used.add(`${binding.nodeId}:${binding.port}`);
    }
  }
  for (const [nodeId, node] of nodeById) {
    if (!isNonEmptyString(node.type)) continue;
    const ports = resolveNodePorts(node);
    if (!ports) continue;
    const boundOutputs = isRecord(node.outputBindings) ? new Set(Object.keys(node.outputBindings)) : new Set<string>();
    for (const output of ports.outputs) {
      if (!used.has(`${nodeId}:${output.id}`) && !boundOutputs.has(output.id)) {
        issues.push(warningIssue(
          'UNUSED_OUTPUT',
          `Output ${output.id} of node ${nodeId} is not used.`,
          `Выход «${output.labelRu}» ноды ${nodeId} не используется.`,
          nodeId,
        ));
      }
    }
  }
}

function validateSubgraphReferences(
  graph: UnknownRecord,
  nodeById: Map<string, UnknownRecord>,
  context: AiGraphValidationContext,
  issues: AiGraphValidationIssue[],
): void {
  const refs = Array.isArray(graph.subgraphRefs) ? graph.subgraphRefs.filter(isNonEmptyString) : [];
  const registry = normalizeSubgraphMap(context.subgraphs);
  for (const [nodeId, node] of nodeById) {
    if (node.type !== 'Subgraph') continue;
    const parameters = isRecord(node.parameters) ? node.parameters : {};
    const subgraphId = parameters.subgraphId;
    if (!isNonEmptyString(subgraphId)) continue;
    if (subgraphId === graph.id) {
      issues.push(errorIssue('RECURSIVE_SUBGRAPH_REFERENCE', `Graph ${String(graph.id)} references itself.`, `Граф ${String(graph.id)} ссылается сам на себя.`, nodeId));
    }
    if (!refs.includes(subgraphId)) {
      issues.push(warningIssue('SUBGRAPH_REF_NOT_DECLARED', `Subgraph ${subgraphId} is used but missing from subgraphRefs.`, `Подграф ${subgraphId} используется, но не указан в subgraphRefs.`, nodeId));
    }
    if (registry.size > 0 && !registry.has(subgraphId)) {
      issues.push(errorIssue('SUBGRAPH_NOT_FOUND', `Subgraph ${subgraphId} is not registered.`, `Подграф ${subgraphId} не зарегистрирован.`, nodeId));
    }
  }
  if (registry.size === 0 || !isNonEmptyString(graph.id)) return;
  const stack = new Set<string>();
  const visited = new Set<string>();
  const visit = (graphId: string): boolean => {
    if (stack.has(graphId)) return true;
    if (visited.has(graphId)) return false;
    visited.add(graphId);
    stack.add(graphId);
    const candidate = graphId === graph.id ? graph as unknown as AiGraphV2 : registry.get(graphId);
    for (const ref of candidate?.subgraphRefs ?? []) {
      if (visit(ref)) return true;
    }
    stack.delete(graphId);
    return false;
  };
  if (visit(graph.id)) {
    issues.push(errorIssue(
      'RECURSIVE_SUBGRAPH_REFERENCE',
      `Graph ${graph.id} participates in a recursive subgraph chain.`,
      `Граф ${graph.id} участвует в рекурсивной цепочке подграфов.`,
      undefined,
      undefined,
      undefined,
      'Break the direct or indirect subgraph reference.',
      'Разорвите прямую или косвенную ссылку подграфов.',
    ));
  }
}

const REACTIVE_CONDITION_TYPES = new Set(['FlagCheck', 'BlackboardValueAbove', 'StableThreshold', 'DistanceCheck', 'TacticalCheck']);
function validateReactiveSequences(nodeById: Map<string, UnknownRecord>, issues: AiGraphValidationIssue[]): void {
  for (const [nodeId, node] of nodeById) {
    if (node.type !== 'ReactiveSequence') continue;
    const children = Array.isArray(node.children) ? node.children.filter(isNonEmptyString) : [];
    if (children.length < 2) {
      issues.push(errorIssue('REACTIVE_CHILDREN_TOO_FEW', 'ReactiveSequence needs at least one observed condition followed by an action or composite child.', 'У ноды «Реактивная последовательность» должно быть минимум одно наблюдаемое условие, а после него действие или составная нода.', nodeId));
      continue;
    }
    for (const conditionId of children.slice(0, -1)) {
      const condition = nodeById.get(conditionId);
      if (!condition || !REACTIVE_CONDITION_TYPES.has(String(condition.type))) {
        issues.push(errorIssue('REACTIVE_PRECEDING_CHILD_NOT_CONDITION', `ReactiveSequence child ${conditionId} before the active branch must be a supported condition.`, `Ребёнок ${conditionId} перед активной ветвью реактивной последовательности должен быть поддерживаемым условием.`, nodeId));
      }
    }
  }
}

function validateReactiveSequenceParameters(parameters: UnknownRecord, issues: AiGraphValidationIssue[], nodeId: string): void {
  if (typeof parameters.observePrecedingConditions !== 'boolean') {
    issues.push(errorIssue('REACTIVE_OBSERVER_FLAG_INVALID', 'ReactiveSequence observePrecedingConditions must be boolean.', 'У реактивной последовательности параметр «Наблюдать предыдущие условия» должен быть да/нет.', nodeId));
  }
  if (parameters.abortPolicy !== 'abort_self') {
    issues.push(errorIssue('REACTIVE_ABORT_POLICY_UNSUPPORTED', 'ReactiveSequence v1 supports only abortPolicy=abort_self.', 'Реактивная последовательность v1 поддерживает только политику «Прервать текущую ветвь».', nodeId));
  }
}

function validateReloadParameters(parameters: UnknownRecord, issues: AiGraphValidationIssue[], nodeId: string): void {
  validateNonNegativeNumberParameter(parameters, 'durationSeconds', false, 'RELOAD_DURATION_INVALID', 'Reload durationSeconds must be a non-negative number.', 'У ноды «Перезарядить» длительность должна быть неотрицательным числом.', issues, nodeId);
  validateNonNegativeNumberParameter(parameters, 'targetAmmo', true, 'RELOAD_TARGET_AMMO_INVALID', 'Reload targetAmmo must be a non-negative integer.', 'У ноды «Перезарядить» число патронов после завершения должно быть неотрицательным целым числом.', issues, nodeId);
  if (typeof parameters.failIfNoWeapon !== 'boolean') issues.push(errorIssue('RELOAD_WEAPON_FLAG_INVALID', 'Reload failIfNoWeapon must be boolean.', 'У ноды «Перезарядить» параметр «Провалить, если нет оружия» должен быть да/нет.', nodeId));
}

function validateKnownNodeParameters(node: UnknownRecord, issues: AiGraphValidationIssue[], nodeId: string): void {
  const parameters = isRecord(node.parameters) ? node.parameters : {};
  if (node.type === 'SetAttentionMode') {
    const mode = parameters.mode;
    if (mode !== 'march' && mode !== 'observe' && mode !== 'search' && mode !== 'engage') {
      issues.push(errorIssue('ATTENTION_MODE_INVALID', `Node ${nodeId} must use march, observe, search, or engage.`, `Нода ${nodeId} должна использовать режим march, observe, search или engage.`, nodeId));
    }
  }
  if (node.type === 'SetSearchSector') {
    if (typeof parameters.centerDegrees !== 'number' || !Number.isFinite(parameters.centerDegrees)) issues.push(errorIssue('SEARCH_CENTER_INVALID', `Node ${nodeId} must have numeric centerDegrees.`, `У ноды ${nodeId} должен быть числовой centerDegrees.`, nodeId));
    if (typeof parameters.arcDegrees !== 'number' || parameters.arcDegrees < 1 || parameters.arcDegrees > 360) issues.push(errorIssue('SEARCH_ARC_INVALID', `Node ${nodeId} arcDegrees must be from 1 to 360.`, `У ноды ${nodeId} arcDegrees должен быть от 1 до 360.`, nodeId));
  }
}

function validateNonNegativeNumberParameter(parameters: UnknownRecord, key: string, requireInteger: boolean, code: string, message: string, messageRu: string, issues: AiGraphValidationIssue[], nodeId: string): void {
  const value = parameters[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (requireInteger && !Number.isInteger(value))) issues.push(errorIssue(code, message, messageRu, nodeId, key));
}

function blackboardKindToPortKind(entry: AiBlackboardSchemaEntry): AiPortValueKind {
  if (entry.valueKind === 'number') return 'number';
  if (entry.valueKind === 'boolean') return 'boolean';
  if (entry.valueKind === 'position' || entry.valueKind === 'nullablePosition') return 'position';
  if (entry.valueKind === 'unitId' || entry.valueKind === 'nullableUnitId') return 'unitId';
  return 'string';
}

function portKindRu(kind: AiPortValueKind): string {
  const labels: Record<AiPortValueKind, string> = {
    number: 'Число', boolean: 'Да/нет', string: 'Текст', position: 'Позиция', unitId: 'Боец', objectId: 'Объект', slotId: 'Место', event: 'Событие', plan: 'План', route: 'Маршрут',
  };
  return labels[kind];
}

function normalizeSubgraphMap(value: AiGraphValidationContext['subgraphs']): Map<string, AiGraphV2> {
  if (!value) return new Map();
  if (value instanceof Map) return new Map(value);
  return new Map(Object.entries(value));
}

function isSupportedValue(value: unknown): boolean {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || isPositionRecord(value);
}
function isPositionRecord(value: unknown): boolean {
  return isRecord(value) && typeof value.x === 'number' && Number.isFinite(value.x) && typeof value.y === 'number' && Number.isFinite(value.y);
}
function invalidResult(code: string, message: string, messageRu: string): AiGraphValidationResult {
  return { valid: false, issues: [errorIssue(code, message, messageRu)] };
}
function errorIssue(code: string, message: string, messageRu: string, nodeId?: string, parameterName?: string, portName?: string, fix?: string, fixRu?: string): AiGraphValidationIssue {
  return { severity: 'error', code, message, messageRu, nodeId, parameterName, portName, fix, fixRu };
}
function warningIssue(code: string, message: string, messageRu: string, nodeId?: string, fix?: string, fixRu?: string): AiGraphValidationIssue {
  return { severity: 'warning', code, message, messageRu, nodeId, fix, fixRu };
}
function infoIssue(code: string, message: string, messageRu: string, nodeId?: string, fix?: string, fixRu?: string): AiGraphValidationIssue {
  return { severity: 'info', code, message, messageRu, nodeId, fix, fixRu };
}
function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
