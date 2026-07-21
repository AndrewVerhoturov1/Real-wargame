import assert from 'node:assert/strict';
import { normalizeMap } from '../src/core/map/MapModel';
import type { SimulationState } from '../src/core/simulation/SimulationState';
import {
  TacticalPositionSearchService,
  type TacticalPositionFieldRuntime,
} from '../src/core/tactical/TacticalPositionSearchService';
import { normalizeUnits } from '../src/core/units/UnitModel';
import type { PreparedAwarenessWorldSnapshot } from '../src/runtime/AwarenessWorldRuntime';

const unit = normalizeUnits([{ id: 'observer', type: 'infantry_squad', side: 'blue', x: 2, y: 2 }])[0]!;
unit.tacticalKnowledge.threats.push({
  id: 'known-target', labelRu: 'Известная цель', mode: 'circle', x: 8, y: 2,
  radiusCells: 1, widthCells: 1, heightCells: 1, rotationDegrees: 0,
  strength: 40, suppression: 10, stressPerSecond: 1, directionDegrees: 0,
  arcDegrees: 360, rangeCells: 20, minRangeCells: 0, falloffPercent: 0,
  confidence: 100, uncertaintyCells: 0, source: 'seen', visibleNow: true,
  lastSeenSeconds: 0, lastUpdatedSeconds: 0,
});
unit.tacticalKnowledge.revision += 1;
const state = {
  units: [unit],
  simulationStep: 1,
  simulationTimeSeconds: 0,
  map: normalizeMap({
    width: 12,
    height: 8,
    cellSize: 4,
    metersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
  }),
} as unknown as SimulationState;
const runtime: TacticalPositionFieldRuntime = {
  requestWorldField: () => null,
  readReadyWorldField: () => null,
  subscribe: () => () => undefined,
  destroy: () => undefined,
};
const service = new TacticalPositionSearchService(state, runtime, { schedule: () => undefined });
const request = service.enqueueTacticalSearch(unit, 'observation');
assert.equal(request.target?.mode, 'point');
assert.equal(
  request.target?.desiredDistanceMeters,
  unit.viewRangeCells * state.map.metersPerCell,
  'observation distance must be serialized in meters, not cells',
);
service.destroy();

console.log('tactical position target units smoke: ok');
