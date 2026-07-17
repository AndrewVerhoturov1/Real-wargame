import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const report = readFileSync('src/core/debug/PerformanceReportV6.ts', 'utf8');
const capture = readFileSync('src/core/debug/PerformanceCaptureV6.ts', 'utf8');
const analysis = readFileSync('src/core/debug/PerformanceCaptureAnalysisV6.ts', 'utf8');
const checkpoint = readFileSync('src/core/debug/PerformanceCheckpointStore.ts', 'utf8');
const phases = readFileSync('src/core/debug/PerformancePhases.ts', 'utf8');
const monitor = readFileSync('src/core/debug/PerformanceMonitor.ts', 'utf8');
const controls = readFileSync('src/ui/PerformanceReportControls.ts', 'utf8');
const pixi = readFileSync('src/rendering/PixiApp.ts', 'utf8');
const scheduler = readFileSync('src/core/ai/AiSimulationScheduler.ts', 'utf8');
const schedulerDiagnostics = readFileSync('src/core/ai/AiSchedulerPerformanceDiagnostics.ts', 'utf8');
const principles = readFileSync('docs/performance/PERFORMANCE_PRINCIPLES.md', 'utf8');
const documentation = readFileSync('docs/performance/PERFORMANCE_REPORT_V6.md', 'utf8');
const vite = readFileSync('vite.config.ts', 'utf8');

for (const token of [
  "PERFORMANCE_REPORT_VERSION = 'performance-report-v6'", 'PERFORMANCE_REPORT_SCHEMA_VERSION = 6',
  'validatePerformanceReportV6', 'normalizeLegacyPerformanceReport', 'ScenePopulationSeriesV6',
  'ReportHealthV6', 'SemanticHealthV6',
]) assert.ok(report.includes(token), `PerformanceReportV6 missing ${token}`);

for (const token of [
  'traceRetentionMs: 30_000', 'sceneSampleIntervalMs: 750', 'editor.units-created',
  'route.request-created', 'route.search-completed', 'user.marker', 'worstWindows',
  'recordQueueTransition', 'recordOperation',
]) assert.ok(capture.includes(token), `PerformanceCaptureV6 missing ${token}`);
for (const token of ['ROUTE_QUEUE_OVERLOAD', 'TELEMETRY_OVERHEAD', 'SEMANTIC_FAILURE', 'worstWindows']) {
  assert.ok(analysis.includes(token), `PerformanceCaptureAnalysisV6 missing ${token}`);
}
for (const token of ['indexedDB', 'latest-incomplete', 'savePerformanceCheckpoint', 'recoverCheckpoint']) {
  assert.ok(checkpoint.includes(token), `PerformanceCheckpointStore missing ${token}`);
}
for (const token of ['getPerformancePhaseRuntimeDiagnostics', 'MAX_DURATION_SAMPLES_PER_PHASE', 'p50Ms', 'p95Ms', 'p99Ms', 'withPerformancePhaseContext', 'operationId', 'routeRequestId']) {
  assert.ok(phases.includes(token), `PerformancePhases missing ${token}`);
}
for (const token of ['PerformanceCaptureV6', 'recordFrame', 'scheduleCheckpoint', 'longTaskClassification', 'buildApplicationIntervalAttribution', 'getAiSchedulerPerformanceDiagnostics', 'getPerceptionGeometryPreparationDiagnostics']) {
  assert.ok(monitor.includes(token), `PerformanceMonitor missing ${token}`);
}
for (const token of ['Добавить метку производительности', 'Экспортировать аварийный отчёт', 'dropped samples']) {
  assert.ok(controls.includes(token), `Performance report UI missing ${token}`);
}
for (const token of ['recordAiSchedulerUnitPass', 'recordAiSchedulerCycle', 'simulation.ai-scheduler.unit-bridge']) {
  assert.ok(scheduler.includes(token), `AiSimulationScheduler missing ${token}`);
}
for (const token of ['slowestUnitPasses', 'slowestCycles', 'p95Ms', 'MAX_DURATION_SAMPLES']) {
  assert.ok(schedulerDiagnostics.includes(token), `AiSchedulerPerformanceDiagnostics missing ${token}`);
}
assert.ok(pixi.includes('recordSimulationUpdate(simulationUpdateMs)'), 'Pixi ticker must publish SimulationTick wall time');
assert.ok(vite.includes('performance-report-v6'), 'Vite build identity must publish performance-report-v6.');
assert.ok(principles.includes('cause of launch'), 'Performance principles must require causal observability.');
assert.ok(documentation.includes('Worst windows'), 'Performance Report v6 documentation must explain worst windows.');

await import('./performance_report_v6_smoke.mjs');
console.log('Performance report contract smoke passed: v6 schema, dynamic population, bounded trace/events, causal route diagnostics, checkpoint recovery, UI markers and explicit legacy handling are present.');
