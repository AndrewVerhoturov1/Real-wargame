import assert from 'node:assert/strict';
import type { AiGraph } from '../src/core/ai/AiGraph';
import { runAiGraph } from '../src/core/ai/AiGraphRunner';
import { validateAiGraph } from '../src/core/ai/AiGraphValidation';
import { setSearchSector } from '../src/core/perception/AttentionController';
import { degreesToRadians } from '../src/core/perception/AttentionModel';
import type { UnitModel } from '../src/core/units/UnitModel';

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

const dynamicGraph = graphWithDynamicSearch();
const dynamicValidation = validateAiGraph(dynamicGraph);
assert.equal(dynamicValidation.valid, true, JSON.stringify(dynamicValidation.issues));
const dynamicResult = runAiGraph({
  graph: dynamicGraph,
  unitId: 'soldier',
  blackboard: {
    self_position: { x: 10, y: 10 },
    suspected_enemy_position: { x: 10, y: 20 },
  },
  nowMs: 0,
});
assert.deepEqual(dynamicResult.effects, [{
  type: 'set_search_sector',
  centerDegrees: 90,
  arcDegrees: 120,
  reason: 'Inspect the suspected contact.',
  reasonRu: 'Проверить предполагаемую позицию противника.',
}], 'dynamic search must face from the soldier position toward the subjective contact position');

const dynamicWestResult = runAiGraph({
  graph: dynamicGraph,
  unitId: 'soldier',
  blackboard: {
    self_position: { x: 10, y: 10 },
    suspected_enemy_position: { x: 0, y: 10 },
  },
  nowMs: 0,
});
assert.equal(dynamicWestResult.effects[0]?.type, 'set_search_sector');
assert.equal(dynamicWestResult.effects[0]?.type === 'set_search_sector' ? dynamicWestResult.effects[0].centerDegrees : null, 180);

const missingTargetResult = runAiGraph({
  graph: dynamicGraph,
  unitId: 'soldier',
  blackboard: { self_position: { x: 10, y: 10 } },
  nowMs: 0,
});
assert.deepEqual(missingTargetResult.effects, [{
  type: 'clear_attention_override',
  reason: 'Return to automatic attention.',
  reasonRu: 'Вернуть автоматическое внимание.',
}], 'a missing subjective position must let the selector use the safe automatic-attention fallback');

const stationaryUnit = attentionUnit(false, 0);
setSearchSector(stationaryUnit, degreesToRadians(90), degreesToRadians(120), 'ai');
assert.equal(stationaryUnit.facingRadians, degreesToRadians(90), 'a stationary AI soldier must turn its body toward the investigated sector');

const movingUnit = attentionUnit(true, 0);
setSearchSector(movingUnit, degreesToRadians(90), degreesToRadians(120), 'ai');
assert.equal(movingUnit.facingRadians, 0, 'a moving soldier must keep body facing under movement control');
assert.equal(movingUnit.attentionRuntime.focusDirectionRadians, degreesToRadians(90), 'a moving soldier must still direct attention toward the suspected contact');

const playerSectorUnit = attentionUnit(false, 0);
setSearchSector(playerSectorUnit, degreesToRadians(90), degreesToRadians(120), 'player');
assert.equal(playerSectorUnit.facingRadians, 0, 'a player attention-sector override must not rotate the body implicitly');

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

console.log('Attention AI node smoke passed: modes, fixed and subjective search sectors, body-facing ownership, fallback and validation.');

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

function graphWithDynamicSearch(): AiGraph {
  return {
    version: 1,
    id: 'attention_dynamic_suspected_contact',
    name: 'Dynamic suspected contact attention',
    nameRu: 'Внимание к предполагаемому контакту',
    rootNodeId: 'root',
    blackboardDefaults: {},
    nodes: [
      { id: 'root', type: 'Root', children: ['choice'] },
      { id: 'choice', type: 'Selector', children: ['dynamic_sector', 'automatic'] },
      {
        id: 'dynamic_sector',
        type: 'SetSearchSector',
        children: [],
        parameters: {
          centerSource: 'blackboard_position',
          centerDegrees: 0,
          originPositionKey: 'self_position',
          targetPositionKey: 'suspected_enemy_position',
          arcDegrees: 120,
          reason: 'Inspect the suspected contact.',
          reasonRu: 'Проверить предполагаемую позицию противника.',
        },
      },
      {
        id: 'automatic',
        type: 'ClearAttentionOverride',
        children: [],
        parameters: {
          reason: 'Return to automatic attention.',
          reasonRu: 'Вернуть автоматическое внимание.',
        },
      },
    ],
  };
}

function attentionUnit(isMoving: boolean, facingRadians: number): UnitModel {
  return {
    facingRadians,
    movementRuntime: { isMoving },
    attentionRuntime: {
      mode: 'observe',
      modeSource: 'automatic',
      focusDirectionRadians: facingRadians,
      focusTargetId: null,
      searchCenterRadians: facingRadians,
      searchArcRadians: degreesToRadians(120),
      scanDirection: 1,
      scanProgress01: 0.5,
      nextFocusCheckSeconds: 0,
      nextDirectCheckSeconds: 0,
      nextPeripheralCheckSeconds: 0,
      nextRearCheckSeconds: 0,
    },
  } as unknown as UnitModel;
}