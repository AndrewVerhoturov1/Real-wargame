import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeMap } from '../src/core/map/MapModel';
import { markMapCellsDirty } from '../src/core/map/MapRuntimeState';
import type { SimulationState } from '../src/core/simulation/SimulationState';
import {
  TacticalPositionSearchService,
  type TacticalPositionFieldRuntime,
  type TacticalPositionSearchRequestSnapshotV1,
} from '../src/core/tactical/TacticalPositionSearchService';
import { setSimulationLayerMode } from '../src/core/ui/RuntimeUiState';
import { normalizeUnits } from '../src/core/units/UnitModel';
import {
  AwarenessLayerFieldController,
  type AwarenessWorldFieldRequester,
} from '../src/runtime/AwarenessLayerFieldController';
import type { PreparedAwarenessWorldSnapshot } from '../src/runtime/AwarenessWorldRuntime';

function verifyRendererDoesNotOwnTacticalSearch(): void {
  const renderer = readFileSync('src/rendering/PixiAwarenessHeatmapRenderer.ts', 'utf8');
  const legacyRenderer = readFileSync('src/rendering/PixiAwarenessHeatmapRendererLegacy.ts', 'utf8');
  const combined = `${renderer}\n${legacyRenderer}`;
  for (const forbidden of [
    'getTacticalPositionProvider', 'provider?.generate', 'provider.generate',
    'requestTacticalPositions(', 'requestWorldField(', 'ensureAwarenessTacticalPositionProvider',
  ]) {
    assert.equal(combined.includes(forbidden), false, `renderer source must not own tactical calculation: found ${forbidden}`);
  }
}

function verifyVisibleAwarenessLayersRequestLiveFields(): void {
  const units = normalizeUnits([
    { id: 'alpha', type: 'infantry_squad', side: 'blue', x: 1, y: 1 },
    { id: 'bravo', type: 'infantry_squad', side: 'blue', x: 3, y: 3 },
  ]);
  const state = {
    units,
    selectedUnitId: 'alpha',
    selectedUnitIds: ['alpha'],
    simulationStep: 10,
    simulationTimeSeconds: 1,
    map: normalizeMap({
      width: 12,
      height: 8,
      cellSize: 4,
      metersPerCell: 2,
      defaultTerrain: 'field',
      defaultHeight: 0,
    }),
    editor: { enabled: false },
  } as unknown as SimulationState;
  const requestedUnits: string[] = [];
  const requester: AwarenessWorldFieldRequester = {
    requestWorldField: (unit) => {
      requestedUnits.push(unit.id);
      return null;
    },
  };
  const controller = new AwarenessLayerFieldController(state, () => requester);

  controller.update();
  assert.deepEqual(requestedUnits, [], 'the default info layer must not prepare a danger field');

  setSimulationLayerMode(state, 'danger');
  controller.update();
  assert.deepEqual(requestedUnits, ['alpha'], 'opening danger must immediately request the selected-unit field');

  controller.update();
  assert.deepEqual(requestedUnits, ['alpha'], 'unchanged render frames must not duplicate the field request');

  units[0]!.tacticalKnowledge.revision += 1;
  controller.update();
  assert.deepEqual(requestedUnits, ['alpha', 'alpha'], 'new subjective knowledge must refresh the live danger field');

  units[0]!.behaviorRuntime.posture = 'crouched';
  controller.update();
  assert.deepEqual(requestedUnits, ['alpha', 'alpha', 'alpha'], 'posture changes must refresh danger geometry');

  markMapCellsDirty(state.map, 'terrain', { minX: 0, minY: 0, maxX: 0, maxY: 0 });
  controller.update();
  assert.deepEqual(requestedUnits, ['alpha', 'alpha', 'alpha', 'alpha'], 'map revisions must refresh the live field');

  state.selectedUnitId = 'bravo';
  state.selectedUnitIds = ['bravo'];
  controller.update();
  assert.deepEqual(requestedUnits.at(-1), 'bravo', 'changing the selected soldier must request that soldier field');

  state.editor.enabled = true;
  controller.update();
  const beforeHidden = requestedUnits.length;
  state.editor.enabled = false;
  setSimulationLayerMode(state, 'info');
  controller.update();
  assert.equal(requestedUnits.length, beforeHidden, 'editor and unrelated layers must not request awareness fields');

  setSimulationLayerMode(state, 'stealth');
  controller.update();
  assert.equal(requestedUnits.length, beforeHidden + 1, 'opening stealth must request the shared live field');

  setSimulationLayerMode(state, 'info');
  controller.update();
  setSimulationLayerMode(state, 'positions');
  controller.update();
  assert.equal(requestedUnits.length, beforeHidden + 2, 'positions must prepare the shared field without requiring Search');

  controller.destroy();
  units[1]!.tacticalKnowledge.revision += 1;
  controller.update();
  assert.equal(requestedUnits.length, beforeHidden + 2, 'destroyed controller must not request more work');
}

async function verifyRequestLifecycleAndMovingOrigin(): Promise<void> {
  const units = normalizeUnits([
    { id: 'alpha', type: 'infantry_squad', side: 'blue', x: 1, y: 1 },
    { id: 'bravo', type: 'infantry_squad', side: 'blue', x: 3, y: 3 },
  ]);
  for (const unit of units) {
    unit.tacticalKnowledge.threats.push({
      id: `threat-${unit.id}`,
      labelRu: 'Угроза', mode: 'circle', x: 8, y: 8, radiusCells: 2,
      widthCells: 2, heightCells: 2, rotationDegrees: 0, strength: 60,
      suppression: 20, stressPerSecond: 1, directionDegrees: 0, arcDegrees: 360,
      rangeCells: 20, minRangeCells: 0, falloffPercent: 0, confidence: 100,
      uncertaintyCells: 0, source: 'seen', visibleNow: true, lastSeenSeconds: 0,
      lastUpdatedSeconds: 0,
    });
    unit.tacticalKnowledge.revision += 1;
  }
  const state = {
    units,
    simulationStep: 10,
    simulationTimeSeconds: 1,
    map: normalizeMap({
      width: 12,
      height: 12,
      cellSize: 4,
      metersPerCell: 2,
      defaultTerrain: 'field',
      defaultHeight: 0,
    }),
  } as unknown as SimulationState;
  const scheduled: Array<() => void> = [];
  const runtime = new FakeFieldRuntime();
  const evaluatedRequests: TacticalPositionSearchRequestSnapshotV1[] = [];
  let searchCalls = 0;
  const service = new TacticalPositionSearchService(state, runtime, {
    schedule: (callback) => scheduled.push(callback),
    searchPrepared: (_prepared, request) => {
      searchCalls += 1;
      evaluatedRequests.push(request);
      runtime.afterSearch?.();
      runtime.afterSearch = null;
      return {
        candidates: [candidate(`${request.ownerUnitId}:${searchCalls}`)],
        diagnostics: {
          sampledCells: Math.min(20, request.maxSampledCells),
          routeExpandedCells: Math.min(12, request.maxRouteExpansions),
          provisionalCandidates: 1,
          sampleBudgetExhausted: false,
          routeBudgetExhausted: false,
        },
      };
    },
  });

  const first = service.enqueueCoverSearch(units[0]!, { searchRadiusMeters: 40 });
  const duplicate = service.enqueueCoverSearch(units[0]!, { searchRadiusMeters: 40 });
  assert.equal(duplicate.requestId, first.requestId);
  assert.equal(scheduled.length, 1);

  await settleScheduledUntil(
    () => (runtime.requestCallsByUnit.get('alpha') ?? 0) >= 1,
    scheduled,
  );
  assert.equal(runtime.requestCallsByUnit.get('alpha'), 1);
  assert.equal(searchCalls, 0);
  assert.equal(service.readRequest(first.requestId)?.status, 'calculating');

  const replacement = service.enqueueCoverSearch(units[0]!, { searchRadiusMeters: 55, objective: 'advance_to_threat' });
  assert.notEqual(replacement.requestId, first.requestId);
  assert.equal(service.readRequest(first.requestId)?.status, 'stale');

  // This is the regression: movement and approach-posture changes while the
  // shared field is prepared must not invalidate the pending request.
  units[0]!.position = { x: 2.25, y: 1.75 };
  units[0]!.behaviorRuntime.posture = 'crouched';

  const other = service.enqueueCoverSearch(units[1]!, { searchRadiusMeters: 35 });
  runtime.readyByUnit.set('alpha', prepared('alpha', 'field-alpha-new'));
  runtime.readyByUnit.set('bravo', prepared('bravo', 'field-bravo'));
  runtime.emit();
  runScheduled(scheduled);
  assert.equal(service.readRequest(replacement.requestId)?.status, 'ready');
  assert.equal(service.readRequest(other.requestId)?.status, 'ready');
  assert.equal(searchCalls, 2);

  const evaluatedAlpha = evaluatedRequests.find((request) => request.ownerUnitId === 'alpha');
  assert.deepEqual(evaluatedAlpha?.origin, { x: 2.25, y: 1.75 }, 'local search must use the latest moving origin');
  assert.equal(evaluatedAlpha?.currentPosture, 'crouched', 'local search must use the latest moving posture');
  assert.equal(evaluatedAlpha?.objective, 'advance_to_threat');
  assert.equal(evaluatedAlpha?.referenceThreatId, 'threat-alpha');

  const readyBefore = service.readRequest(replacement.requestId);
  runtime.emit();
  runScheduled(scheduled);
  assert.equal(searchCalls, 2);
  assert.deepEqual(service.readRequest(replacement.requestId), readyBefore);

  units[0]!.position = { x: 6.25, y: 5.75 };
  runtime.readyByUnit.set('alpha', prepared('alpha', 'field-alpha-refresh'));
  const refreshed = service.enqueueCoverSearch(
    units[0]!,
    { searchRadiusMeters: 55, objective: 'advance_to_threat' },
    { forceRefresh: true },
  );
  assert.notEqual(refreshed.requestId, replacement.requestId, 'explicit refresh must not reuse a ready request');
  assert.equal(service.readRequest(replacement.requestId)?.status, 'stale');
  runScheduled(scheduled);
  assert.equal(service.readRequest(refreshed.requestId)?.status, 'ready');
  assert.deepEqual(
    evaluatedRequests.at(-1)?.origin,
    { x: 6.25, y: 5.75 },
    'explicit refresh must search from the unit current position',
  );

  const stale = service.enqueueCoverSearch(units[0]!, { searchRadiusMeters: 65 });
  runtime.readyByUnit.set('alpha', prepared('alpha', 'field-alpha-stale'));
  runtime.afterSearch = () => runtime.readyByUnit.set('alpha', prepared('alpha', 'field-alpha-replaced'));
  runScheduled(scheduled);
  assert.equal(service.readRequest(stale.requestId)?.status, 'stale');

  service.destroy();
  assert.equal(runtime.destroyed, true);
  assert.equal(runtime.listenerCount, 0);
  assert.equal(service.getDiagnostics().requestCount, 0);
  assert.equal(service.getDiagnostics().listenerCount, 0);
}

function runScheduled(scheduled: Array<() => void>): void {
  while (scheduled.length > 0) scheduled.shift()!();
}

async function settleScheduledUntil(
  predicate: () => boolean,
  scheduled: Array<() => void>,
  maximumTurns = 20,
): Promise<void> {
  for (let turn = 0; turn < maximumTurns; turn += 1) {
    runScheduled(scheduled);
    if (predicate()) return;
    await nextTask();
  }
  runScheduled(scheduled);
}

function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

class FakeFieldRuntime implements TacticalPositionFieldRuntime {
  readonly readyByUnit = new Map<string, PreparedAwarenessWorldSnapshot>();
  readonly requestCallsByUnit = new Map<string, number>();
  private readonly listeners = new Set<() => void>();
  afterSearch: (() => void) | null = null;
  destroyed = false;

  get listenerCount(): number { return this.listeners.size; }

  requestWorldField(_state: SimulationState, unit: ReturnType<typeof normalizeUnits>[number]): PreparedAwarenessWorldSnapshot | null {
    this.requestCallsByUnit.set(unit.id, (this.requestCallsByUnit.get(unit.id) ?? 0) + 1);
    return this.readyByUnit.get(unit.id) ?? null;
  }

  readReadyWorldField(unitId: string): PreparedAwarenessWorldSnapshot | null {
    return this.readyByUnit.get(unitId) ?? null;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(): void { for (const listener of this.listeners) listener(); }
  destroy(): void { this.destroyed = true; this.listeners.clear(); this.readyByUnit.clear(); }
}

function prepared(unitId: string, fieldIdentity: string): PreparedAwarenessWorldSnapshot {
  return {
    unitId,
    worldKey: `world:${fieldIdentity}`,
    canonicalThreatKey: `threat:${fieldIdentity}`,
    mapKey: 'map:1',
    fieldIdentity,
    rasterDigest: `digest:${fieldIdentity}`,
    jobId: 1,
    field: {} as PreparedAwarenessWorldSnapshot['field'],
  };
}

function candidate(id: string) {
  return {
    id,
    position: { x: 5.5, y: 5.5 },
    source: { kind: 'terrain' as const, id: `field:${id}`, label: 'Field', labelRu: 'Поле' },
    metrics: {
      onMap: true, routeExists: true, distanceMeters: 10, blocksThreat: true,
      protection: 60, concealment: 30, routeDanger: 20, slopeType: 'flat' as const,
      orderAlignment: 50, danger: 20, suppression: 10, safety: 75, safetyGain: 20,
      uncertainty: 5, recommendedPosture: 'crouched' as const, routeCost: 10,
    },
  };
}

void runSmoke().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function runSmoke(): Promise<void> {
  verifyRendererDoesNotOwnTacticalSearch();
  verifyVisibleAwarenessLayersRequestLiveFields();
  await verifyRequestLifecycleAndMovingOrigin();
  console.log('Tactical position request service smoke passed: live danger/stealth preparation, renderer ownership, moving-origin search, dedupe, replacement, stale rejection, multi-unit isolation and teardown.');
}
