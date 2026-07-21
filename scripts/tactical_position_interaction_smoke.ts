import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isPostureTransitionRunning,
  postureTransitionDurationSeconds,
} from '../src/core/actions/PostureTransition';
import type { TacticalMapData } from '../src/core/map/MapModel';
import { createPlayerMoveCommand, updatePlayerCommandStatus } from '../src/core/orders/PlayerCommand';
import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';
import { tickSimulation } from '../src/core/simulation/SimulationTick';
import type { TacticalPositionCandidateSeedV2 } from '../src/core/tactical/TacticalPositionSearch';
import {
  findVisibleTacticalPositionAt,
  getTacticalPositionPresentation,
  publishVisibleTacticalPositions,
  selectVisibleTacticalPositionAt,
  syncHoveredTacticalPosition,
} from '../src/core/tactical/SimulationTacticalPositionSelection';
import { reconcileCompletedTacticalPositionArrivals } from '../src/core/tactical/TacticalPositionArrival';

verifyBoundedMarkerSelection();
verifyArrivalPostureAppliesOnceAfterPhysicalTransition();
verifyOrdinaryCommandDoesNotChangePosture();
verifyB2SourceContracts();

console.log('Tactical position interaction smoke passed: bounded marker selection, B2 glyphs and one-time timed arrival posture.');

function verifyBoundedMarkerSelection(): void {
  const state = {
    map: { cellSize: 20 },
    selectedUnitId: 'unit-1',
    mouseGridPosition: { x: 4.55, y: 5.45 },
  } as unknown as SimulationState;
  const candidates = [
    candidate('standing', 2.5, 2.5),
    candidate('crouched', 4.5, 5.5),
    candidate('prone', 8.5, 6.5),
  ];

  publishVisibleTacticalPositions(state, 'unit-1', candidates);
  const hit = findVisibleTacticalPositionAt(state, { x: 4.55, y: 5.45 });
  assert.equal(hit?.id, candidates[1]!.id);

  syncHoveredTacticalPosition(state);
  assert.equal(getTacticalPositionPresentation(state).hovered?.id, candidates[1]!.id);

  const selected = selectVisibleTacticalPositionAt(state, { x: 8.45, y: 6.55 });
  assert.equal(selected?.metrics.recommendedPosture, 'prone');
  assert.equal(getTacticalPositionPresentation(state).selected?.id, selected?.id);

  publishVisibleTacticalPositions(state, 'unit-2', [candidate('standing', 1.5, 1.5)]);
  assert.equal(getTacticalPositionPresentation(state).selected, null, 'changing the owning soldier must clear stale selection');
}

function verifyArrivalPostureAppliesOnceAfterPhysicalTransition(): void {
  const state = createInitialState(mapData(), [
    { id: 'unit-1', type: 'infantry_squad', side: 'blue', aiControl: 'manual', x: 0, y: 0 },
  ]);
  const unit = state.units[0]!;
  const command = createPlayerMoveCommand(
    unit.id,
    { x: 4.5, y: 5.5 },
    null,
    1000,
    'normal',
    null,
    null,
    'prone',
  );
  unit.playerCommand = updatePlayerCommandStatus(command, 'completed', 'done', 'готово');
  unit.order = null;

  reconcileCompletedTacticalPositionArrivals(state);
  assert.equal(unit.behaviorRuntime.posture, 'standing');
  assert.equal(isPostureTransitionRunning(unit), true);
  assert.equal(unit.playerCommand?.arrivalPostureApplied, false);

  tickSimulation(state, postureTransitionDurationSeconds('standing', 'prone'));
  assert.equal(unit.behaviorRuntime.posture, 'prone');
  assert.equal(unit.behaviorRuntime.previousPosture, 'crouched');
  assert.equal(unit.playerCommand?.arrivalPostureApplied, true);
  assert.equal(unit.behaviorRuntime.lastEvent, 'tactical_position_posture_applied');

  const appliedRevision = unit.playerCommand!.revision;
  reconcileCompletedTacticalPositionArrivals(state);
  assert.equal(unit.playerCommand!.revision, appliedRevision, 'arrival posture must be applied exactly once');
}

function verifyOrdinaryCommandDoesNotChangePosture(): void {
  const state = createInitialState(mapData(), [
    { id: 'unit-2', type: 'infantry_squad', side: 'blue', aiControl: 'manual', x: 0, y: 0 },
  ]);
  const unit = state.units[0]!;
  unit.playerCommand = updatePlayerCommandStatus(
    createPlayerMoveCommand(unit.id, { x: 2.5, y: 2.5 }, null, 2000),
    'completed',
    'done',
    'готово',
  );
  unit.order = null;

  reconcileCompletedTacticalPositionArrivals(state);
  assert.equal(unit.behaviorRuntime.posture, 'standing');
  assert.equal(unit.playerCommand?.arrivalPosture, undefined);
  assert.equal(isPostureTransitionRunning(unit), false);
}

function verifyB2SourceContracts(): void {
  const renderer = readFileSync('src/rendering/PixiAwarenessHeatmapRenderer.ts', 'utf8');
  const input = readFileSync('src/input/TacticalPositionInputController.ts', 'utf8');
  assert.ok(renderer.includes('drawB2PostureGlyph'));
  assert.ok(renderer.includes("posture === 'standing'"), 'standing glyph must be a distinct vertical mark');
  assert.ok(renderer.includes("posture === 'crouched'"), 'crouched glyph must be a distinct angled mark');
  assert.ok(
    renderer.includes('graphics.moveTo(x - 4, y).lineTo(x + 4, y)'),
    'prone glyph must be a distinct horizontal mark',
  );
  assert.ok(renderer.includes('overlayText'), 'one reusable text object must label hovered or selected positions');
  assert.ok(input.includes("addEventListener('pointerdown'"));
  assert.ok(input.includes("addEventListener('pointerup'"));
  assert.ok(input.includes('capture: true'));
  assert.ok(input.includes('issueTacticalPositionMoveOrderToSelectedUnit'));
}

function candidate(posture: 'standing' | 'crouched' | 'prone', x: number, y: number): TacticalPositionCandidateSeedV2 {
  return {
    id: `tactical:${x}:${y}:${posture}`,
    position: { x, y },
    source: { kind: 'terrain', id: `field:${x}:${y}`, label: 'Field', labelRu: 'Поле' },
    metrics: {
      onMap: true,
      routeExists: true,
      distanceMeters: 10,
      blocksThreat: true,
      protection: 70,
      concealment: 40,
      routeDanger: 20,
      slopeType: 'flat',
      orderAlignment: 50,
      danger: 20,
      suppression: 10,
      safety: 80,
      safetyGain: 30,
      uncertainty: 5,
      recommendedPosture: posture,
      routeCost: 12,
    },
  };
}

function mapData(): TacticalMapData {
  return {
    width: 16,
    height: 16,
    cellSize: 20,
    metersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: [],
  };
}
