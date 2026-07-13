import { DEFAULT_AI_NODE_CONTRACT_REGISTRY, AiNodeContractRegistry } from '../src/core/ai/contracts/AiNodeContractRegistry';
import { areAiPortKindsCompatible } from '../src/core/ai/contracts/AiPortTypes';
import { migrateAiGraphToV2 } from '../src/core/ai/contracts/AiGraphMigration';
import { validateAiGraph } from '../src/core/ai/AiGraphValidation';
import { createAiMemoryScopes, writeAiMemoryValue, readAiMemoryValue, resetAiMemoryScope } from '../src/core/ai/contracts/AiMemoryScopes';
import { createAiRuntimeSession, normalizeAiRuntimeSession } from '../src/core/ai/runtime/AiRuntimeSession';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const contracts = DEFAULT_AI_NODE_CONTRACT_REGISTRY.list();
assert(contracts.length >= 35, `expected at least 35 node contracts, got ${contracts.length}`);
assert(DEFAULT_AI_NODE_CONTRACT_REGISTRY.get('MoveToBlackboardPosition')?.lifecycle === 'stateful', 'MoveTo must be stateful');
assert(DEFAULT_AI_NODE_CONTRACT_REGISTRY.get('Retry')?.childPolicy === 'one', 'Retry must accept one child');
assert(DEFAULT_AI_NODE_CONTRACT_REGISTRY.get('Subgraph')?.inputs.some((port) => port.kind === 'position'), 'Subgraph must expose typed inputs');
assert(areAiPortKindsCompatible('position', 'position'), 'position must be compatible with position');
assert(!areAiPortKindsCompatible('unitId', 'position'), 'unitId must not be compatible with position');

const duplicateRegistry = new AiNodeContractRegistry();
const rootContract = DEFAULT_AI_NODE_CONTRACT_REGISTRY.require('Root');
duplicateRegistry.register(rootContract);
let duplicateRejected = false;
try { duplicateRegistry.register(rootContract); } catch { duplicateRejected = true; }
assert(duplicateRejected, 'duplicate registration must throw');

const graphV1 = {
  version: 1,
  id: 'legacy_graph',
  name: 'Legacy',
  rootNodeId: 'root',
  blackboardDefaults: { danger: 10, best_cover_position: null },
  customLegacyField: { keep: true },
  nodes: [
    { id: 'root', type: 'Root', children: ['wait'], parameters: {}, customNodeField: 'keep-node' },
    { id: 'wait', type: 'Wait', children: [], parameters: { durationSeconds: 2, timeoutSeconds: 0 } },
  ],
} as const;
const migrated = migrateAiGraphToV2(graphV1);
assert(migrated.ok && migrated.graph.version === 2, 'v1 graph must migrate to v2');
assert(migrated.graph.nodes[0]?.children?.[0] === 'wait', 'child order must be preserved');
assert((migrated.graph.legacyMetadata?.customLegacyField as { keep?: boolean })?.keep === true, 'unknown graph field must be preserved');
assert((migrated.graph.nodes[0]?.legacyMetadata?.customNodeField) === 'keep-node', 'unknown node field must be preserved');
const second = migrateAiGraphToV2(migrated.graph);
assert(second.ok && JSON.stringify(second.graph) === JSON.stringify(migrated.graph), 'migration must be idempotent');

const validation = validateAiGraph(migrated.graph);
assert(validation.valid, `migrated graph must validate: ${validation.issues.map((issue) => issue.code).join(', ')}`);
const invalidGraph = {
  ...migrated.graph,
  nodes: migrated.graph.nodes.map((node) => node.id === 'wait'
    ? { ...node, parameters: { durationSeconds: -1, timeoutSeconds: 0 }, inputBindings: { target: { source: 'node', nodeId: 'root', port: 'unit' } } }
    : node),
};
const invalid = validateAiGraph(invalidGraph);
assert(invalid.issues.some((issue) => issue.code === 'PARAMETER_OUT_OF_RANGE' && issue.nodeId === 'wait'), 'negative duration must be rejected');

let memory = createAiMemoryScopes({ persistentSoldierMemory: { rank: 'private' }, runtimeSessionMemory: { danger: 5 } });
memory = writeAiMemoryValue(memory, 'subgraphLocalMemory', 'take_cover', 'candidate', { x: 3, y: 4 });
assert(readAiMemoryValue(memory, 'subgraphLocalMemory', 'candidate', 'take_cover') !== undefined, 'subgraph local value must be readable');
assert(readAiMemoryValue(memory, 'runtimeSessionMemory', 'candidate') === undefined, 'subgraph local value must not leak to parent');
memory = resetAiMemoryScope(memory, 'activeStateMemory');
assert(readAiMemoryValue(memory, 'persistentSoldierMemory', 'rank') === 'private', 'state reset must preserve persistent memory');


const scopedSession = createAiRuntimeSession({
  graphId: 'scoped_graph',
  unitId: 'soldier_scoped',
  blackboardMemory: { danger: 5 },
  memoryScopes: memory,
});
const restoredScopedSession = normalizeAiRuntimeSession(JSON.parse(JSON.stringify(scopedSession)), {
  graphId: 'scoped_graph',
  unitId: 'soldier_scoped',
}).session;
assert(restoredScopedSession.memoryScopes.persistentSoldierMemory.rank === 'private', 'persistent scope must survive session snapshot');
assert(restoredScopedSession.memoryScopes.subgraphLocalMemory.take_cover?.candidate !== undefined, 'subgraph local scope must survive active session snapshot');

console.log(`AI Graph v2 contracts smoke passed: ${contracts.length} contracts, migration, validation and memory scopes.`);
