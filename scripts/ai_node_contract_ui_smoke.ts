import { readFileSync } from 'node:fs';
import { getPortKind, renderContractParameters, renderNodePorts } from '../src/ai-node-editor/node-contract-ui';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const escape = (value: string): string => value;
const takeCoverNode = {
  id: 'take_cover_node',
  type: 'Subgraph',
  parameters: { subgraphId: 'take_cover', cancelPolicy: 'cancel_child' },
};
const ports = renderNodePorts(takeCoverNode, escape);
assert(ports.includes('cover_position'), 'selected subgraph input port must be visible');
assert(ports.includes('reached_position'), 'selected subgraph output port must be visible');
assert(!ports.includes('data-port-id="unit"'), 'generic unused subgraph unit port must not be shown');
assert(getPortKind('Subgraph', 'input', 'cover_position', takeCoverNode.parameters) === 'position', 'dynamic subgraph input kind must resolve');

const parameters = renderContractParameters(takeCoverNode, escape);
assert(!parameters.includes('data-contract-param="subgraphId"'), 'dedicated subgraph selector must not be duplicated by a text parameter');
assert(parameters.includes('data-contract-param="cancelPolicy"'), 'remaining contract parameters must still render');

const editorSource = readFileSync(new URL('../src/ai-node-editor/main.ts', import.meta.url), 'utf8');
assert(
  editorSource.includes("button.addEventListener('mousedown', beginTypedConnection)"),
  'typed output ports must keep a mouse-event fallback so real Chrome always enters drag-highlight mode',
);
assert(
  editorSource.includes("if (connectionState || event.button !== 0) return"),
  'typed connection fallback must guard duplicate pointerdown/mousedown delivery and non-primary buttons',
);

console.log('AI node contract UI smoke passed: dynamic subgraph ports and non-duplicated parameters.');
