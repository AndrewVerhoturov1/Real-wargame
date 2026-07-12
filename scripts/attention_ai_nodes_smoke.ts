import assert from 'node:assert/strict';
import type { AiGraph } from '../src/core/ai/AiGraph';
import { runAiGraph } from '../src/core/ai/AiGraphRunner';
import { validateAiGraph } from '../src/core/ai/AiGraphValidation';

const modeGraph = graphWithNode('SetAttentionMode', {
  mode: 'search',
  reason: 'Search for the lost target.',
  reasonRu: 'Искать потерянную цель.',
});
const modeValidation = validateAiGraph(modeGraph);
assert.equal(modeValidation.valid, true, JSON.stringify(modeValidation.issues));
const modeResult = runAiGraph({ graph: modeGraph, unitId: 'soldier', blackboard: {}, nowMs: 0 });
assert.deepEqual(modeResult.effects, [{
  type: 'set_attention_mode',
  mode: 'search',
  reason: 'Search for the lost target.',
  reasonRu: 'Искать потерянную цель.',
}]);

const sectorGraph = graphWithNode('SetSearchSector', {
  centerDegrees: 90,
  arcDegrees: 120,
  reason: 'Inspect the eastern sector.',
  reasonRu: 'Осмотреть восточный сектор.',
});
const sectorValidation = validateAiGraph(sectorGraph);
assert.equal(sectorValidation.valid, true, JSON.stringify(sectorValidation.issues));
const sectorResult = runAiGraph({ graph: sectorGraph, unitId: 'soldier', blackboard: {}, nowMs: 0 });
assert.deepEqual(sectorResult.effects, [{
  type: 'set_search_sector',
  centerDegrees: 90,
  arcDegrees: 120,
  reason: 'Inspect the eastern sector.',
  reasonRu: 'Осмотреть восточный сектор.',
}]);

const clearGraph = graphWithNode('ClearAttentionOverride', {
  reason: 'Return to automatic attention.',
  reasonRu: 'Вернуть автоматическое внимание.',
});
const clearValidation = validateAiGraph(clearGraph);
assert.equal(clearValidation.valid, true, JSON.stringify(clearValidation.issues));
const clearResult = runAiGraph({ graph: clearGraph, unitId: 'soldier', blackboard: {}, nowMs: 0 });
assert.deepEqual(clearResult.effects, [{
  type: 'clear_attention_override',
  reason: 'Return to automatic attention.',
  reasonRu: 'Вернуть автоматическое внимание.',
}]);

const invalidMode = validateAiGraph(graphWithNode('SetAttentionMode', { mode: 'radar' }));
assert.equal(invalidMode.valid, false);
assert.ok(invalidMode.issues.some((issue) => issue.code === 'ATTENTION_MODE_INVALID'));

const invalidSector = validateAiGraph(graphWithNode('SetSearchSector', {
  centerDegrees: 90,
  arcDegrees: 0,
}));
assert.equal(invalidSector.valid, false);
assert.ok(invalidSector.issues.some((issue) => issue.code === 'SEARCH_ARC_INVALID'));

console.log('Attention AI node smoke passed: mode, search sector, automatic reset and validation.');

function graphWithNode(type: string, parameters: Record<string, string | number | boolean | null>): AiGraph {
  return {
    version: 1,
    id: `attention_${type}`,
    name: `Attention ${type}`,
    nameRu: `Внимание ${type}`,
    rootNodeId: 'root',
    blackboardDefaults: {},
    nodes: [
      { id: 'root', type: 'Root', children: ['attention'] },
      { id: 'attention', type, children: [], parameters },
    ],
  };
}
