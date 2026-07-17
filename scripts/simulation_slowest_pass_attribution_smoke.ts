import assert from 'node:assert/strict';
import {
  getSimulationStepPerformanceDiagnostics,
  resetSimulationStepPerformanceDiagnosticsForTests,
} from '../src/core/debug/SimulationStepPerformanceDiagnostics';
import { createInitialState } from '../src/core/simulation/SimulationState';
import { tickSimulation } from '../src/core/simulation/SimulationTick';

resetSimulationStepPerformanceDiagnosticsForTests();

const state = createInitialState({
  width: 12,
  height: 8,
  cellSize: 8,
  metersPerCell: 2,
  defaultTerrain: 'field',
  defaultHeight: 0,
  objects: [],
}, [{
  id: 'diagnostic-unit',
  label: 'Diagnostic unit',
  labelRu: 'Диагностический боец',
  type: 'infantry_squad',
  side: 'blue',
  aiControl: 'manual',
  x: 2,
  y: 2,
}]);

for (let index = 0; index < 4; index += 1) tickSimulation(state, 0.1);

const records = getSimulationStepPerformanceDiagnostics();
assert.equal(records.length, 4, 'every simulation update must publish an attributed record');
assert.deepEqual(
  [...records].map((record) => record.totalDurationMs),
  [...records].map((record) => record.totalDurationMs).sort((left, right) => right - left),
  'diagnostics must retain the slowest steps first',
);

for (const record of records) {
  assert.ok(record.simulationStep >= 1);
  assert.ok(record.simulationTimeSeconds > 0);
  assert.ok(record.performanceStartMs >= 0);
  assert.ok(record.performanceEndMs >= record.performanceStartMs);
  assert.ok(record.totalDurationMs >= 0);
  assert.ok(record.aiSchedulerDurationMs >= 0);
  assert.ok(record.perceptionDurationMs >= 0);
  assert.ok(record.movementEventsDurationMs >= 0);
  assert.ok(record.routeNavigationDurationMs >= 0);
  assert.ok(record.tacticalFieldBuilds >= 0);
  assert.ok(record.pointLosCacheMisses >= 0);
  assert.ok(record.pointLosCacheHits >= 0);
  assert.ok(record.maxUnitPassDurationMs >= 0);
  assert.ok(record.uncoveredResidualDurationMs >= 0);
  assert.ok(record.uncoveredResidualDurationMs <= record.totalDurationMs + 0.05);
  assert.equal(typeof record.phases.metricsMs, 'number');
  assert.equal(typeof record.phases.perceptionMs, 'number');
  assert.equal(typeof record.phases.threatMemoryMs, 'number');
  assert.equal(typeof record.phases.aiSchedulerMs, 'number');
  assert.equal(typeof record.phases.combatMs, 'number');
  assert.equal(typeof record.phases.movementEventsMs, 'number');
  assert.equal(typeof record.phases.collisionsMs, 'number');
}

const slowest = records[0];
assert.ok(
  'unitId' in slowest && 'activeGraphNode' in slowest,
  'slowest-pass evidence must preserve unit/node attribution even when null',
);

console.log(`Simulation slowest-pass attribution smoke passed: ${records.length} fully classified steps, slowest ${slowest.totalDurationMs.toFixed(2)} ms.`);
