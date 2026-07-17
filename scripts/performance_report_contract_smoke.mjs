import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const phases = readFileSync('src/core/debug/PerformancePhases.ts', 'utf8');
const monitor = readFileSync('src/core/debug/PerformanceMonitor.ts', 'utf8');
const pixi = readFileSync('src/rendering/PixiApp.ts', 'utf8');

for (const token of [
  'getPerformancePhaseRuntimeDiagnostics',
  'MAX_DURATION_SAMPLES_PER_PHASE',
  'p50Ms',
  'p95Ms',
  'p99Ms',
]) assert.ok(phases.includes(token), `PerformancePhases missing ${token}`);

for (const token of [
  'simulationUpdateMs',
  'applicationUpdateMs',
  'performancePhaseAggregates',
  'longTaskOverlapCount',
  'longTaskOverlapDurationMs',
  'buildApplicationIntervalAttribution',
  'applicationAttributedLongTaskCount',
  'unattributedLongTaskCount',
]) assert.ok(monitor.includes(token), `PerformanceMonitor missing ${token}`);

assert.ok(pixi.includes('recordSimulationUpdate(simulationUpdateMs)'), 'Pixi ticker must publish SimulationTick wall time');
assert.ok(!monitor.includes("sceneUpdateMs/renderMs measure JavaScript scene updates only"), 'legacy misleading timing note must be removed');
console.log('Performance report contract smoke passed: simulation timing, phase aggregates and nested application attribution are present.');
