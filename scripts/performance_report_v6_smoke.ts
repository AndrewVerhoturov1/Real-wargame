const assert = {
  equal(actual: unknown, expected: unknown, message = 'values differ'): void { if (!Object.is(actual, expected)) throw new Error(`${message}: ${String(actual)} !== ${String(expected)}`); },
  ok(value: unknown, message = 'expected truthy value'): void { if (!value) throw new Error(message); },
  deepEqual(actual: unknown, expected: unknown): void { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`objects differ: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`); },
  throws(callback: () => unknown): void { let threw = false; try { callback(); } catch { threw = true; } if (!threw) throw new Error('expected callback to throw'); },
};
import { PerformanceCaptureV6, type SceneStateLikeV6 } from '../src/core/debug/PerformanceCaptureV6';
import { normalizeLegacyPerformanceReport, validatePerformanceReportV6 } from '../src/core/debug/PerformanceReportV6';

class FakeClock {
  time = 0;
  epoch = 1_700_000_000_000;
  now = () => this.time;
  wallNow = () => this.epoch + this.time;
  random = () => 0.5;
  advance(ms: number): void { this.time += ms; }
}

function unit(id: string, side = 'blue') {
  return {
    id,
    side,
    aiControl: 'graph',
    position: { x: 1, y: 1 },
    order: null as any,
    behaviorRuntime: { health: 100 },
    tacticalKnowledge: { threats: [] },
    perceptionKnowledge: { contacts: [] },
  };
}

function stateWith(count: number): SceneStateLikeV6 {
  return {
    units: Array.from({ length: count }, (_, index) => unit(`unit_${index + 1}`, index % 2 ? 'red' : 'blue')),
    map: { width: 320, height: 200, objects: [] },
    pressureZones: [],
    editor: { enabled: true },
    simulationTimeSeconds: 0,
    simulationStep: 0,
    paused: true,
  };
}

function frame(capture: PerformanceCaptureV6, state: SceneStateLikeV6, clock: FakeClock, ms = 16): void {
  clock.advance(ms);
  capture.recordFrame(state, {
    frameMs: ms,
    simulationUpdateMs: 2,
    applicationUpdateMs: 4,
    sceneUpdateMs: 2,
    layerMode: 'info',
    editorEnabled: state.editor.enabled,
  });
}

function build(capture: PerformanceCaptureV6) {
  return capture.buildReport({
    identity: {
      branch: 'test',
      commitSha: 'abc123',
      buildId: 'test-build',
      generatedAt: new Date(0).toISOString(),
      launchSource: 'ci',
      mode: 'test',
      page: '/test',
      browser: {},
      platform: 'test',
      cpuConcurrency: 8,
      deviceMemoryGb: 16,
      viewport: { width: 1280, height: 720 },
      renderer: { kind: 'test' },
      featureFlags: {},
    },
    mainMetrics: {},
    phases: [],
    legacyDiagnostics: {},
  });
}

{
  const clock = new FakeClock();
  const capture = new PerformanceCaptureV6({}, clock);
  const state = stateWith(6);
  frame(capture, state, clock);
  const mutable = state.units as any[];
  for (let index = 7; index <= 100; index += 1) mutable.push(unit(`unit_${index}`, index % 2 ? 'red' : 'blue'));
  frame(capture, state, clock, 1000);
  capture.addUserMarker('Добавил 94 бойца и продолжил симуляцию');
  frame(capture, state, clock, 1000);
  const report = build(capture);
  assert.equal(report.summary.scenePopulation.initial.unitCount, 6);
  assert.equal(report.summary.scenePopulation.maximum.unitCount, 100);
  assert.equal(report.summary.scenePopulation.final.unitCount, 100);
  assert.ok(report.trace.sceneTimeline.some((entry) => entry.unitCount === 100));
  assert.ok(report.trace.events.some((event) => event.type === 'editor.units-created'));
  assert.ok(report.trace.userMarkers.some((event) => event.data.label === 'Добавил 94 бойца и продолжил симуляцию'));
  assert.deepEqual(validatePerformanceReportV6(report), { ok: true, errors: [] });

  mutable.splice(10, 20);
  frame(capture, state, clock, 1000);
  const afterDelete = build(capture);
  assert.equal(afterDelete.summary.scenePopulation.maximum.unitCount, 100);
  assert.equal(afterDelete.summary.scenePopulation.final.unitCount, 80);
  assert.ok(afterDelete.trace.events.some((event) => event.type === 'editor.units-removed'));
}

{
  const clock = new FakeClock();
  const capture = new PerformanceCaptureV6({}, clock);
  const state = stateWith(50);
  frame(capture, state, clock);
  for (let index = 0; index < 50; index += 1) {
    capture.recordQueueTransition({
      queue: 'routePlanning',
      transition: 'created',
      requestId: `route-${index}`,
      unitId: `unit_${index + 1}`,
      orderId: `order-${index}`,
      depth: index + 1,
    });
  }
  clock.advance(900);
  for (let index = 0; index < 50; index += 1) {
    capture.recordQueueTransition({
      queue: 'routePlanning',
      transition: 'completed',
      requestId: `route-${index}`,
      unitId: `unit_${index + 1}`,
      orderId: `order-${index}`,
      waitMs: 900 + index,
      depth: 49 - index,
    });
  }
  capture.recordOperation({
    phase: 'route.candidate-search',
    durationMs: 125,
    operationId: 'op-route-burst',
    cause: { eventType: 'order.created', unitId: 'unit_1', orderId: 'order-1', routeRequestId: 'route-1' },
    work: { visitedCells: 12000, expandedNodes: 4000 },
    result: 'found',
  });
  frame(capture, state, clock, 120);
  const report = build(capture);
  assert.equal(report.report.queues.routePlanning.maximumDepth, 50);
  assert.equal(report.report.queues.routePlanning.created, 50);
  assert.ok(report.report.queues.routePlanning.waitMs.p95 >= 900);
  assert.ok(report.summary.diagnoses.some((diagnosis) => diagnosis.code === 'ROUTE_QUEUE_OVERLOAD'));
  assert.ok(report.trace.slowOperations.some((operation) => operation.operationId === 'op-route-burst'));
  assert.ok(report.summary.worstWindows.length === 3);
  assert.ok(report.trace.events.some((event) => event.type === 'long-task.detected' && event.operationId === 'op-route-burst'));
}

{
  const clock = new FakeClock();
  const capture = new PerformanceCaptureV6({ maxFrames: 3, maxEvents: 2, maxSceneTimeline: 3 }, clock);
  const state = stateWith(6);
  for (let index = 0; index < 10; index += 1) {
    capture.recordEvent(`normal.${index}`, { index });
    frame(capture, state, clock, 1000);
  }
  capture.recordSemanticViolation('lostOrders', { unitId: 'unit_1' });
  const report = build(capture);
  assert.ok(report.summary.reportHealth.samplesDropped > 0);
  assert.ok(report.summary.reportHealth.eventsDropped > 0);
  assert.ok(report.summary.reportHealth.truncatedSections.includes('trace.frames'));
  assert.ok(report.trace.events.some((event) => event.type === 'semantic.violation'));
  assert.equal(report.summary.semanticHealth.lostOrders, 1);
  assert.equal(report.summary.verdict, 'fail');

  const checkpoint = capture.buildCheckpoint({
    identity: report.summary.identity,
    mainMetrics: {}, phases: [], legacyDiagnostics: {},
  });
  clock.advance(2400);
  const recovered = PerformanceCaptureV6.recoverCheckpoint(checkpoint, clock.wallNow());
  assert.equal(recovered.summary.reportHealth.recoveredFromCheckpoint, true);
  assert.equal(recovered.summary.reportHealth.exportCompleted, false);
  assert.equal(recovered.summary.reportHealth.possibleMissingTailMs, 2400);
  assert.equal(recovered.summary.verdict, 'incomplete');
}

{
  const legacy = normalizeLegacyPerformanceReport({ version: 'performance-report-v5', scene: { unitCount: 6 } });
  assert.equal(legacy.sourceVersion, 'performance-report-v5');
  assert.equal(legacy.finalUnitCount, 6);
  assert.equal(legacy.maximumUnitCount, null);
  assert.equal(legacy.dynamicPopulationAvailable, false);
  assert.throws(() => normalizeLegacyPerformanceReport({ version: 'performance-report-v6', schemaVersion: 6 }));
  const invalid = validatePerformanceReportV6({ version: 'performance-report-v6', schemaVersion: 6 });
  assert.equal(invalid.ok, false);
}

console.log('Performance Report v6 smoke passed: schema, 6→100 population, deletion, route burst, causal long task, truncation, semantic verdict, checkpoint recovery and explicit v5 compatibility.');
