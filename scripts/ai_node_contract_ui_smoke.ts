import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getNodeContractUiModel, explainPortIncompatibilityRu, renderContractParameterFields } from '../src/ai-node-editor/node-contract-ui';
import { getSubgraphChoice, listSubgraphChoices } from '../src/ai-node-editor/subgraph-ui';

const choices = listSubgraphChoices();
assert.equal(choices.length, 4);
assert.equal(getSubgraphChoice('take_cover')?.labelRu, 'Занять укрытие');

const subgraphModel = getNodeContractUiModel({ id: 'call', type: 'Subgraph', parameters: { subgraphId: 'take_cover' } });
assert.deepEqual(subgraphModel.inputs.map((port) => port.id), ['cover_position']);
assert.deepEqual(subgraphModel.outputs.map((port) => port.id), ['reached_position']);
assert.match(explainPortIncompatibilityRu('unitId', 'position', 'Боец', 'Позиция'), /Нельзя передать «Боец» во вход «Позиция»/);

const timeoutFields = renderContractParameterFields({ id: 'timeout', type: 'Timeout', parameters: { timeoutSeconds: 5 } });
assert.match(timeoutFields, /Максимальное время/);
assert.match(timeoutFields, /required/);
assert.match(timeoutFields, /min="0"/);

const searchSectorFields = renderContractParameterFields({
  id: 'suspected-sector',
  type: 'SetSearchSector',
  parameters: {
    centerSource: 'blackboard_position',
    centerDegrees: 0,
    arcDegrees: 120,
    originPositionKey: 'self_position',
    targetPositionKey: 'suspected_enemy_position',
  },
});
for (const expected of [
  'Источник направления',
  'Фиксированный угол',
  'Позиция из памяти',
  'Ключ позиции бойца',
  'Ключ позиции цели',
  'self_position',
  'suspected_enemy_position',
]) assert.match(searchSectorFields, new RegExp(expected), `Missing visible suspected-contact search setting: ${expected}`);
assert.match(searchSectorFields, /data-param-id="centerSource"/);
assert.match(searchSectorFields, /data-param-id="originPositionKey"/);
assert.match(searchSectorFields, /data-param-id="targetPositionKey"/);

const statefulSource = readFileSync('src/ai-node-editor/stateful-node-ui.ts', 'utf8');
for (const expected of [
  "node.type === 'Subgraph'",
  'Переиспользуемый подграф',
  'stateful-subgraph-id',
  'Шаблон поведения',
  'Входы подграфа',
  'Выходы подграфа',
  'stateful-subgraph-cancel-policy',
  'installSubgraphParameterSync',
]) assert.ok(statefulSource.includes(expected), `Missing visible Subgraph UI marker: ${expected}`);

const mainSource = readFileSync('src/ai-node-editor/main.ts', 'utf8');
assert.ok(!mainSource.includes('Проверить и обновить формат графа'));
assert.ok(!mainSource.includes('graph-v1-warning'));
assert.ok(mainSource.includes('graph-validation-issue'));
assert.ok(mainSource.includes('data-port-id'));
assert.ok(mainSource.includes('Главный граф'));
assert.ok(mainSource.includes("document.querySelector<HTMLSelectElement>('#stateful-subgraph-id')?.value"));
assert.ok(!mainSource.includes("...(graphNavigation.length ? [editorGraph.nameRu ?? editorGraph.name] : [])"));

console.log('AI node contract UI smoke passed: typed ports, contract parameters, suspected-contact direction controls, Graph v2-only editor, errors, and visible Russian subgraph controls.');