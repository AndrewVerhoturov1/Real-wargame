import {
  SOLDIER_BLACKBOARD_SCHEMA,
  type AiBlackboardDefaults,
  type AiBlackboardSchemaEntry,
  type AiBlackboardValue,
} from '../AiBlackboard';
import type {
  AiGraphV2,
  AiNodeParameters,
  AiNodeV2,
} from '../AiGraph';
import { DEFAULT_AI_NODE_CONTRACT_REGISTRY } from './AiNodeContractRegistry';

export interface AiGraphMigrationIssue {
  readonly severity: 'error' | 'warning' | 'info';
  readonly code: string;
  readonly message: string;
  readonly messageRu: string;
  readonly nodeId?: string;
  readonly parameterName?: string;
  readonly fixRu?: string;
}

export type AiGraphMigrationResult =
  | {
      readonly ok: true;
      readonly migrated: boolean;
      readonly graph: AiGraphV2;
      readonly issues: readonly AiGraphMigrationIssue[];
    }
  | {
      readonly ok: false;
      readonly migrated: false;
      readonly original: unknown;
      readonly issues: readonly AiGraphMigrationIssue[];
    };

const GRAPH_KNOWN_FIELDS = new Set([
  'version', 'id', 'name', 'nameRu', 'description', 'descriptionRu',
  'rootNodeId', 'blackboardSchema', 'blackboardDefaults', 'nodes',
  'subgraphRefs', 'legacyMetadata',
]);
const NODE_KNOWN_FIELDS = new Set([
  'id', 'type', 'displayName', 'displayNameRu', 'description', 'descriptionRu',
  'children', 'parameters', 'inputBindings', 'outputBindings', 'legacyMetadata',
]);

export function migrateAiGraphToV2(value: unknown): AiGraphMigrationResult {
  if (!isRecord(value)) return failed(value, 'GRAPH_NOT_OBJECT', 'AI graph must be an object.', 'AI-граф должен быть объектом.');
  if (value.version === 2) {
    const normalized = normalizeV2Graph(value);
    return normalized
      ? { ok: true, migrated: false, graph: normalized, issues: [] }
      : failed(value, 'GRAPH_V2_MALFORMED', 'Graph v2 is malformed.', 'Graph v2 имеет повреждённую структуру.', undefined, 'Исправьте ошибки проверки; исходный граф не будет перезаписан.');
  }
  if (value.version !== 1) return failed(value, 'UNSUPPORTED_GRAPH_VERSION', 'Only graph v1 or v2 can be loaded.', 'Можно загрузить только graph v1 или v2.');

  const issues: AiGraphMigrationIssue[] = [];
  if (!isNonEmptyString(value.id)) issues.push(error('MISSING_GRAPH_ID', 'Graph id is missing.', 'У графа отсутствует id.'));
  if (!isNonEmptyString(value.rootNodeId)) issues.push(error('MISSING_ROOT_NODE_ID', 'Root node id is missing.', 'У графа отсутствует rootNodeId.'));
  if (!Array.isArray(value.nodes)) issues.push(error('NODES_NOT_ARRAY', 'Graph nodes must be an array.', 'Ноды графа должны быть массивом.'));
  if (!isRecord(value.blackboardDefaults)) issues.push(error('BLACKBOARD_DEFAULTS_NOT_OBJECT', 'Blackboard defaults must be an object.', 'Значения Blackboard по умолчанию должны быть объектом.'));
  if (issues.some((issue) => issue.severity === 'error')) return { ok: false, migrated: false, original: value, issues };

  const nodes: AiNodeV2[] = [];
  for (const [index, rawNode] of (value.nodes as unknown[]).entries()) {
    if (!isRecord(rawNode) || !isNonEmptyString(rawNode.id) || !isNonEmptyString(rawNode.type)) {
      issues.push(error('NODE_MIGRATION_FAILED', `Node #${index + 1} cannot be migrated.`, `Ноду #${index + 1} невозможно перенести.`));
      continue;
    }
    const parameters = normalizeParameters(rawNode.parameters, rawNode.id, issues);
    if (!parameters) continue;
    const legacyMetadata = mergeLegacyMetadata(
      isRecord(rawNode.legacyMetadata) ? rawNode.legacyMetadata : undefined,
      collectUnknown(rawNode, NODE_KNOWN_FIELDS),
    );
    if (Object.keys(legacyMetadata).length > 0) {
      issues.push(warning(
        'LEGACY_NODE_FIELDS_PRESERVED',
        `Unknown fields of node ${rawNode.id} were preserved in legacyMetadata.`,
        `Неизвестные поля ноды ${rawNode.id} сохранены в legacyMetadata.`,
        rawNode.id,
      ));
    }
    nodes.push({
      id: rawNode.id,
      type: rawNode.type,
      displayName: stringOptional(rawNode.displayName),
      displayNameRu: stringOptional(rawNode.displayNameRu),
      description: stringOptional(rawNode.description),
      descriptionRu: stringOptional(rawNode.descriptionRu),
      children: Array.isArray(rawNode.children) ? rawNode.children.filter(isNonEmptyString) : [],
      parameters,
      inputBindings: migrateInputBindings(rawNode, parameters),
      outputBindings: isRecord(rawNode.outputBindings) ? cloneRecord(rawNode.outputBindings) as AiNodeV2['outputBindings'] : undefined,
      legacyMetadata: Object.keys(legacyMetadata).length > 0 ? legacyMetadata : undefined,
    });
  }
  if (issues.some((issue) => issue.severity === 'error')) return { ok: false, migrated: false, original: value, issues };

  const defaults = cloneBlackboardDefaults(value.blackboardDefaults as Record<string, unknown>);
  if (!defaults) return failed(value, 'BLACKBOARD_VALUE_UNSUPPORTED', 'A Blackboard default cannot be migrated.', 'Одно из значений Blackboard невозможно перенести.');
  const graphLegacyMetadata = mergeLegacyMetadata(
    isRecord(value.legacyMetadata) ? value.legacyMetadata : undefined,
    collectUnknown(value, GRAPH_KNOWN_FIELDS),
  );
  if (Object.keys(graphLegacyMetadata).length > 0) {
    issues.push(warning(
      'LEGACY_GRAPH_FIELDS_PRESERVED',
      'Unknown graph fields were preserved in legacyMetadata.',
      'Неизвестные поля графа сохранены в legacyMetadata.',
    ));
  }
  const subgraphRefs = unique(nodes
    .filter((node) => node.type === 'Subgraph')
    .map((node) => node.parameters?.subgraphId)
    .filter(isNonEmptyString));

  return {
    ok: true,
    migrated: true,
    graph: {
      version: 2,
      id: value.id as string,
      name: isNonEmptyString(value.name) ? value.name : value.id as string,
      nameRu: stringOptional(value.nameRu),
      description: stringOptional(value.description),
      descriptionRu: stringOptional(value.descriptionRu),
      rootNodeId: value.rootNodeId as string,
      blackboardSchema: buildBlackboardSchema(defaults),
      blackboardDefaults: defaults,
      nodes,
      subgraphRefs,
      legacyMetadata: Object.keys(graphLegacyMetadata).length > 0 ? graphLegacyMetadata : undefined,
    },
    issues: [
      ...issues,
      info('GRAPH_V1_MIGRATED', 'Graph v1 was migrated to graph v2 in memory.', 'Graph v1 преобразован в graph v2 в памяти.'),
    ],
  };
}

function normalizeV2Graph(value: Record<string, unknown>): AiGraphV2 | undefined {
  if (!isNonEmptyString(value.id)
    || !isNonEmptyString(value.rootNodeId)
    || !Array.isArray(value.nodes)
    || !isRecord(value.blackboardDefaults)
    || !Array.isArray(value.blackboardSchema)
    || !Array.isArray(value.subgraphRefs)) return undefined;
  const nodes: AiNodeV2[] = [];
  for (const node of value.nodes) {
    if (!isRecord(node) || !isNonEmptyString(node.id) || !isNonEmptyString(node.type)) return undefined;
    const parameters = normalizeParameters(node.parameters, node.id, []);
    if (!parameters) return undefined;
    nodes.push({
      id: node.id,
      type: node.type,
      displayName: stringOptional(node.displayName),
      displayNameRu: stringOptional(node.displayNameRu),
      description: stringOptional(node.description),
      descriptionRu: stringOptional(node.descriptionRu),
      children: Array.isArray(node.children) ? node.children.filter(isNonEmptyString) : [],
      parameters,
      inputBindings: isRecord(node.inputBindings) ? cloneRecord(node.inputBindings) as AiNodeV2['inputBindings'] : undefined,
      outputBindings: isRecord(node.outputBindings) ? cloneRecord(node.outputBindings) as AiNodeV2['outputBindings'] : undefined,
      legacyMetadata: isRecord(node.legacyMetadata) ? cloneRecord(node.legacyMetadata) : undefined,
    });
  }
  const defaults = cloneBlackboardDefaults(value.blackboardDefaults);
  if (!defaults) return undefined;
  return {
    version: 2,
    id: value.id,
    name: isNonEmptyString(value.name) ? value.name : value.id,
    nameRu: stringOptional(value.nameRu),
    description: stringOptional(value.description),
    descriptionRu: stringOptional(value.descriptionRu),
    rootNodeId: value.rootNodeId,
    blackboardSchema: cloneSerializable(value.blackboardSchema) as unknown as readonly AiBlackboardSchemaEntry[],
    blackboardDefaults: defaults,
    nodes,
    subgraphRefs: unique(value.subgraphRefs.filter(isNonEmptyString)),
    legacyMetadata: isRecord(value.legacyMetadata) ? cloneRecord(value.legacyMetadata) : undefined,
  };
}


function migrateInputBindings(
  node: Record<string, unknown>,
  parameters: AiNodeParameters,
): AiNodeV2['inputBindings'] | undefined {
  if (isRecord(node.inputBindings)) return cloneRecord(node.inputBindings) as AiNodeV2['inputBindings'];
  if (node.type === 'MoveToBlackboardPosition' && isNonEmptyString(parameters.targetKey)) {
    return { target: { source: 'blackboard', key: parameters.targetKey } };
  }
  return undefined;
}

function normalizeParameters(
  value: unknown,
  nodeId: string,
  issues: AiGraphMigrationIssue[],
): AiNodeParameters | undefined {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    issues.push(error('PARAMETERS_NOT_OBJECT', `Node ${nodeId} parameters are not an object.`, `Параметры ноды ${nodeId} не являются объектом.`, nodeId));
    return undefined;
  }
  const result: AiNodeParameters = {};
  for (const [key, item] of Object.entries(value)) {
    if (!isBlackboardValue(item)) {
      issues.push(error(
        'PARAMETER_VALUE_UNSUPPORTED',
        `Node ${nodeId} parameter ${key} cannot be migrated.`,
        `Параметр ${key} ноды ${nodeId} невозможно перенести.`,
        nodeId,
        'Замените значение на строку, число, да/нет, null или позицию {x,y}.',
        key,
      ));
      continue;
    }
    result[key] = cloneBlackboardValue(item);
  }
  return issues.some((issue) => issue.severity === 'error' && issue.nodeId === nodeId) ? undefined : result;
}

function buildBlackboardSchema(defaults: AiBlackboardDefaults): AiBlackboardSchemaEntry[] {
  const known = new Map<string, AiBlackboardSchemaEntry>(SOLDIER_BLACKBOARD_SCHEMA.map((entry) => [entry.key, entry]));
  return Object.entries(defaults).map(([key, defaultValue]) => {
    const existing = known.get(key);
    if (existing) return { ...existing, defaultValue: cloneBlackboardValue(defaultValue) };
    const valueKind = defaultValue === null
      ? 'string'
      : typeof defaultValue === 'number'
        ? 'number'
        : typeof defaultValue === 'boolean'
          ? 'boolean'
          : typeof defaultValue === 'object'
            ? 'position'
            : 'string';
    return {
      key,
      valueKind,
      label: key,
      description: `Migrated Blackboard key ${key}.`,
      labelRu: key,
      descriptionRu: `Перенесённый ключ Blackboard ${key}.`,
      defaultValue: cloneBlackboardValue(defaultValue),
    } satisfies AiBlackboardSchemaEntry;
  });
}

function collectUnknown(value: Record<string, unknown>, known: ReadonlySet<string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!known.has(key)) result[key] = cloneSerializable(item);
  }
  return result;
}

function mergeLegacyMetadata(...items: Array<Record<string, unknown> | undefined>): Record<string, unknown> {
  return Object.assign({}, ...items.filter(Boolean).map((item) => cloneRecord(item!)));
}

function cloneBlackboardDefaults(value: Record<string, unknown>): AiBlackboardDefaults | undefined {
  const result: AiBlackboardDefaults = {};
  for (const [key, item] of Object.entries(value)) {
    if (!isBlackboardValue(item)) return undefined;
    result[key] = cloneBlackboardValue(item);
  }
  return result;
}

function cloneBlackboardValue(value: AiBlackboardValue): AiBlackboardValue {
  return typeof value === 'object' && value !== null ? { x: value.x, y: value.y } : value;
}

function isBlackboardValue(value: unknown): value is AiBlackboardValue {
  return value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
    || (isRecord(value)
      && typeof value.x === 'number' && Number.isFinite(value.x)
      && typeof value.y === 'number' && Number.isFinite(value.y));
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return cloneSerializable(value) as Record<string, unknown>;
}

function cloneSerializable<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => cloneSerializable(item)) as T;
  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) result[key] = cloneSerializable(item);
    return result as T;
  }
  return value;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function failed(
  original: unknown,
  code: string,
  message: string,
  messageRu: string,
  nodeId?: string,
  fixRu?: string,
): AiGraphMigrationResult {
  return { ok: false, migrated: false, original, issues: [error(code, message, messageRu, nodeId, fixRu)] };
}

function error(
  code: string,
  message: string,
  messageRu: string,
  nodeId?: string,
  fixRu?: string,
  parameterName?: string,
): AiGraphMigrationIssue {
  return { severity: 'error', code, message, messageRu, nodeId, fixRu, parameterName };
}
function warning(code: string, message: string, messageRu: string, nodeId?: string): AiGraphMigrationIssue {
  return { severity: 'warning', code, message, messageRu, nodeId };
}
function info(code: string, message: string, messageRu: string): AiGraphMigrationIssue {
  return { severity: 'info', code, message, messageRu };
}
function stringOptional(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getRegisteredContractTypes(): readonly string[] {
  return DEFAULT_AI_NODE_CONTRACT_REGISTRY.list().map((entry) => entry.type);
}
