import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AiGraphV2 } from '../src/core/ai/AiGraph';
import { validateAiGraph } from '../src/core/ai/AiGraphValidation';
import { getAiNodeTypeDefinition } from '../src/core/ai/AiNodeTypes';

const path = 'public/ai-examples/contact-investigation.json';
const graph = JSON.parse(readFileSync(path, 'utf8')) as AiGraphV2;
const validation = validateAiGraph(graph);
assert.equal(
  validation.valid,
  true,
  `contact investigation example must be a valid Graph v2: ${validation.issues.map((issue) => issue.messageRu).join(' | ')}`,
);
assert.equal(graph.version, 2);
assert.equal(graph.blackboardSchema.length, 0, 'the ready node must not require users to create internal Blackboard keys');
const selector = graph.nodes.find((node) => node.id === 'attention-selector');
assert.deepEqual(selector?.children, ['investigate-contact', 'automatic-attention']);
assert.equal(graph.nodes.find((node) => node.id === 'investigate-contact')?.type, 'InvestigateContact');
assert.equal(graph.nodes.find((node) => node.id === 'automatic-attention')?.type, 'ClearAttentionOverride');
assert.equal(getAiNodeTypeDefinition('InvestigateContact').labelRu, 'Доразведать контакт');

console.log('Contact investigation example smoke passed: strict Graph v2 validation, ready node and automatic-attention fallback.');
