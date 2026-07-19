import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AiGraph } from '../src/core/ai/AiGraph';
import { withAiSimulationExecutionContext } from '../src/core/ai/AiSimulationExecutionContext';
import { runAiGraphRuntime } from '../src/core/ai/AiGraphRuntime';
import {
  createPlayerMoveCommand,
  markPlayerCommandArrivalPostureApplied,
  normalizePlayerCommand,
  updatePlayerCommandStatus,
} from '../src/core/orders/PlayerCommand';
import { normalizeUnits } from '../src/core/units/UnitModel';
import type { SimulationState } from '../src/core/simulation/SimulationState';
import {
  createDefaultTacticalPositionSettings,
  getTacticalPositionSettings,
  selectHighestSafePosture,
  setTacticalPositionSettings,
} from '../src/core/tactical/TacticalPositionSettings';
import {
  applyCompletedTacticalPositionOccupation,
  isTacticalPositionOccupationActive,
  reconcileTacticalPositionOccupation,
} from '../src/core/tactical/TacticalPositionOccupation';
import {
  getTacticalPositionPresentation,
  publishVisibleTacticalPositions,
} from '../src/core/tactical/SimulationTacticalPositionSelection';
import type { TacticalPositionCandidateSeedV2 } from '../src/core/tactical/TacticalPositionSearch';

verifyHighestSafePosture();
verifyCommandOwnedApproachAndOccupation();
verifyMarkerPublicationIsRateLimitedAndKeepsOldResult();
verifySettingsChangeRefreshesMarkersImmediately();
verifySettingsNormalizeFromSceneData();
verifySceneExportIncludesSettings();
verifyOccupationAndDangerSourceContracts();

console.log('Tactical position tuning smoke passed: highest-safe posture, stable markers, command-owned occupation, graph posture guard and scene settings persistence.');

function verifyHighestSafePosture(): void {
  const settings = createDefaultTacticalPositionSettings();
  assert.equal(selectHighestSafePosture([
    { posture: 'standing', danger: 18, safety: 72, protection: 20 },
    { posture: 'crouched', danger: 10, safety: 80, protection: 36 },
    { posture: 'prone', danger: 4, safety: 90, protection: 52 },
  ], settings).posture, 'standing');
  assert.equal(selectHighestSafePosture([
    { posture: 'standing', danger: 42, safety: 52, protection: 20 },
    { posture: 'crouched', danger: 28, safety: 66, protection: 42 },
    { posture: 'prone', danger: 12, safety: 82, protection: 64 },
  ], settings).posture, 'crouched');
  assert.equal(selectHighestSafePosture([
    { posture: 'standing', danger: 76, safety: 20, protection: 8 },
    { posture: 'crouched', danger: 61, safety: 34, protection: 24 },
    { posture: 'prone', danger: 34, safety: 58, protection: 48 },
  ], settings).posture, 'prone');
}

function verifyCommandOwnedApproachAndOccupation(): void {
  const unit = normalizeUnits([{ id: 'unit-1', type: 'infantry_squad', side: 'blue', x: 0, y: 0 }])[0]!;
  const command = createPlayerMoveCommand(
    unit.id,
    { x: 2.5, y: 2.5 },
    null,
    1000,
    'normal',
    null,
    Math.PI / 2,
    'prone',
    'crouched',
  );
  unit.playerCommand = command;
  unit.order = {
    type: 'move',
    target: { x: 2.5, y: 2.5 },
    issuedAtMs: 1,
    source: 'player',
    playerCommandId: command.id,
  };
  unit.behaviorRuntime.posture = 'standing';
  reconcileTacticalPositionOccupation(unit);
  assert.equal(unit.behaviorRuntime.posture, 'crouched', 'linked tactical route must keep its command-owned approach posture');

  unit.order = null;
  unit.playerCommand = updatePlayerCommandStatus(command, 'completed', 'done', 'готово');
  assert.equal(applyCompletedTacticalPositionOccupation(unit), true);
  unit.playerCommand = markPlayerCommandArrivalPostureApplied(unit.playerCommand);
  assert.equal(unit.behaviorRuntime.posture, 'prone');
  assert.ok(Math.abs(unit.facingRadians - Math.PI / 2) < 0.0001);
  assert.equal(isTacticalPositionOccupationActive(unit), true);
  assert.equal(unit.playerCommand.tacticalPositionOccupationStatus, 'occupied');

  const restored = normalizePlayerCommand(JSON.parse(JSON.stringify(unit.playerCommand)), unit.id);
  assert.equal(restored?.arrivalPosture, 'prone');
  assert.equal(restored?.approachPosture, 'crouched');
  assert.equal(restored?.tacticalPositionOccupationStatus, 'occupied');
  assert.ok(Math.abs((restored?.finalFacingRadians ?? 0) - Math.PI / 2) < 0.0001);

  const state = { units: [unit], map: { metersPerCell: 2 } } as unknown as SimulationState;
  const graphResult = withAiSimulationExecutionContext(state, unit, () => runAiGraphRuntime({
    graph: postureGraph('stand'),
    unitId: unit.id,
    blackboard: {},
    nowMs: 2000,
  }));
  assert.equal(
    graphResult.effects.some((effect) => effect.type === 'set_posture' && effect.posture === 'stand'),
    false,
    'ordinary Graph v2 pass must not reset command-owned occupied posture',
  );

  unit.order = {
    type: 'move',
    target: { x: 6.5, y: 4.5 },
    issuedAtMs: 2,
    source: 'ai',
    ownerToken: 'ai-route-1',
  };
  reconcileTacticalPositionOccupation(unit);
  assert.equal(
    unit.playerCommand?.tacticalPositionOccupationStatus,
    'released',
    'an unrelated AI route must permanently release the old occupied position',
  );
  unit.order = null;
  assert.equal(isTacticalPositionOccupationActive(unit), false, 'released occupation must not reactivate after the AI route ends');

  unit.playerCommand = createPlayerMoveCommand(unit.id, { x: 3.5, y: 3.5 }, unit.playerCommand, 3000);
  unit.order = { type: 'move', target: { x: 3.5, y: 3.5 }, issuedAtMs: 3, source: 'player' };
  assert.equal(isTacticalPositionOccupationActive(unit), false, 'a new player command or route releases occupied-position ownership');
  unit.behaviorRuntime.posture = 'standing';
  reconcileTacticalPositionOccupation(unit);
  assert.equal(unit.behaviorRuntime.posture, 'standing');
}

function verifyMarkerPublicationIsRateLimitedAndKeepsOldResult(): void {
  const unit = normalizeUnits([{ id: 'unit-1', type: 'infantry_squad', side: 'blue', x: 0, y: 0 }])[0]!;
  const state = {
    units: [unit],
    simulationTimeSeconds: 0,
    map: { cellSize: 20 },
  } as unknown as SimulationState;
  const settings = createDefaultTacticalPositionSettings();
  settings.markerRefreshIntervalSeconds = 1;
  settings.emptyResultHoldSeconds = 1.5;
  setTacticalPositionSettings(unit, settings);

  const first = [candidate('first', 2.5, 2.5)];
  const second = [candidate('second', 5.5, 5.5)];
  publishVisibleTacticalPositions(state, unit.id, first);
  state.simulationTimeSeconds = 0.25;
  publishVisibleTacticalPositions(state, unit.id, second);
  assert.equal(getTacticalPositionPresentation(state).candidates[0]?.id, 'first');

  state.simulationTimeSeconds = 1.1;
  publishVisibleTacticalPositions(state, unit.id, second);
  assert.equal(getTacticalPositionPresentation(state).candidates[0]?.id, 'second');

  state.simulationTimeSeconds = 1.2;
  publishVisibleTacticalPositions(state, unit.id, []);
  assert.equal(getTacticalPositionPresentation(state).candidates[0]?.id, 'second');

  state.simulationTimeSeconds = 2.8;
  publishVisibleTacticalPositions(state, unit.id, []);
  assert.equal(getTacticalPositionPresentation(state).candidates.length, 0);
}

function verifySettingsChangeRefreshesMarkersImmediately(): void {
  const unit = normalizeUnits([{ id: 'unit-refresh', type: 'infantry_squad', side: 'blue', x: 0, y: 0 }])[0]!;
  const state = {
    units: [unit],
    simulationTimeSeconds: 0,
    map: { cellSize: 20 },
  } as unknown as SimulationState;
  const settings = createDefaultTacticalPositionSettings();
  settings.markerRefreshIntervalSeconds = 5;
  setTacticalPositionSettings(unit, settings);
  publishVisibleTacticalPositions(state, unit.id, [candidate('before', 1.5, 1.5)]);

  state.simulationTimeSeconds = 0.1;
  setTacticalPositionSettings(unit, { ...settings, standingMaximumDanger: 12 });
  publishVisibleTacticalPositions(state, unit.id, [candidate('after', 4.5, 4.5)]);
  assert.equal(getTacticalPositionPresentation(state).candidates[0]?.id, 'after');
}

function verifySettingsNormalizeFromSceneData(): void {
  const unit = normalizeUnits([{
    id: 'unit-persisted',
    type: 'infantry_squad',
    side: 'blue',
    x: 0,
    y: 0,
    tacticalPositionSettings: {
      version: 1,
      revision: 7,
      values: {
        standingMaximumDanger: 11,
        markerRefreshIntervalSeconds: 2.5,
      },
    },
  }])[0]!;
  const settings = getTacticalPositionSettings(unit);
  assert.equal(settings.standingMaximumDanger, 11);
  assert.equal(settings.markerRefreshIntervalSeconds, 2.5);
  assert.equal(unit.tacticalPositionSettingsRevision, 7);
  assert.equal(settings.crouchedMaximumDanger, createDefaultTacticalPositionSettings().crouchedMaximumDanger);
}

function verifySceneExportIncludesSettings(): void {
  const source = readFileSync('src/ui/SceneExport.ts', 'utf8');
  assert.ok(source.includes('tacticalPositionSettings: serializeTacticalPositionSettings(unit)'));
  assert.ok(source.includes('getTacticalPositionSearchService(state)'));
  assert.ok(source.includes('tacticalPositionSearchService?.clearUnit(unit.id)'));
}

function verifyOccupationAndDangerSourceContracts(): void {
  const occupation = readFileSync('src/core/tactical/TacticalPositionOccupation.ts', 'utf8');
  const orders = readFileSync('src/core/tactical/TacticalPositionOrders.ts', 'utf8');
  const controls = readFileSync('src/ui/TacticalPositionSettingsControls.ts', 'utf8');
  assert.equal(occupation.includes('WeakMap'), false, 'occupation state must live in PlayerCommand, not a hidden WeakMap');
  assert.equal(orders.includes('behaviorRuntime.danger = 0'), false, 'issuing a tactical move must not clear canonical danger');
  assert.ok(orders.includes('finalFacingRadians'));
  assert.ok(orders.includes('approachPosture'));
  assert.ok(controls.includes('getTacticalPositionSearchService(state)?.clearUnit(selected.id)'));
  assert.ok(controls.includes('Стоя: максимальная опасность'));
  assert.ok(controls.includes('Коэффициенты итоговой оценки'));
}

function postureGraph(posture: 'stand' | 'crouch' | 'prone'): AiGraph {
  return {
    version: 2,
    id: 'occupied-posture-guard',
    name: 'Occupied posture guard',
    rootNodeId: 'root',
    blackboardDefaults: {},
    blackboardSchema: [],
    subgraphRefs: [],
    nodes: [
      { id: 'root', type: 'Root', children: ['set-posture'], parameters: {} },
      { id: 'set-posture', type: 'SetPosture', children: [], parameters: { posture } },
    ],
  };
}

function candidate(id: string, x: number, y: number): TacticalPositionCandidateSeedV2 {
  return {
    id,
    position: { x, y },
    source: { kind: 'terrain', id: `field:${id}`, label: 'Field', labelRu: 'Поле' },
    metrics: {
      onMap: true,
      routeExists: true,
      distanceMeters: 10,
      blocksThreat: true,
      protection: 50,
      concealment: 30,
      routeDanger: 20,
      slopeType: 'flat',
      orderAlignment: 50,
      danger: 25,
      suppression: 12,
      safety: 70,
      safetyGain: 20,
      uncertainty: 5,
      recommendedPosture: 'crouched',
      routeCost: 10,
    },
  };
}
