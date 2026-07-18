import assert from 'node:assert/strict';
import type { TacticalMapData } from '../src/core/map/MapModel';
import {
  createRouteCostFieldCache,
  getRouteCostFields,
} from '../src/core/navigation/RouteCostField';
import { getBuiltInNavigationProfile } from '../src/core/navigation/NavigationProfiles';
import { buildRouteCostWorkerMapRevisionKey } from '../src/core/navigation/RouteCostWorkerClient';
import { createInitialState } from '../src/core/simulation/SimulationState';

const mapData: TacticalMapData = {
  width: 6,
  height: 4,
  cellSize: 24,
  metersPerCell: 5,
  runtimeMetersPerCell: 5,
  defaultTerrain: 'field',
  defaultHeight: 0,
  objects: [],
};

const state = createInitialState(mapData, [{
  id: 'route-cost-worker-contract-unit',
  label: 'Route cost worker contract unit',
  labelRu: 'Проверка worker карты стоимости',
  type: 'infantry_squad',
  side: 'blue',
  x: 1,
  y: 1,
}]);
const profile = getBuiltInNavigationProfile('normal');
const fields = getRouteCostFields(
  state.map,
  profile,
  undefined,
  createRouteCostFieldCache(),
);
const workerRevisionKey = buildRouteCostWorkerMapRevisionKey(state.map);

assert.equal(
  workerRevisionKey,
  fields.mapRevisionKey,
  'route-cost worker and main-thread fields must use the same terrain/height/forest/environment/objects revision key',
);
assert.match(
  workerRevisionKey,
  /^\d+:\d+:\d+:[^:]+:\d+:[0-9a-f]{8}:\d+$/,
  'route-cost revision key must include the active environment movement-domain identity',
);

console.log(JSON.stringify({
  smoke: 'route-cost-worker-revision-contract',
  mapRevisionKey: fields.mapRevisionKey,
  workerRevisionKey,
  equal: workerRevisionKey === fields.mapRevisionKey,
}, null, 2));
console.log('Route-cost worker revision contract smoke passed.');
