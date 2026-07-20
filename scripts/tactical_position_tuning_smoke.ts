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
import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';
import { preparePhysicalMovementStep } from '../src/core/movement/MovementRuntime';
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

verifyComparativePostureSelection();
verifyCommandOwnedApproachAndOccupation();
verifyOccupiedPostureSurvivesStaleMovementOwnership();
verifyMarkerPublicationIsRateLimitedAndKeepsOldResult();
verifySettingsChangeRefreshesMarkersImmediately();
verifySettingsNormalizeFromSceneData();
verifySceneExportIncludesSettings();
verifyOccupationAndEditorContracts();

console.log('Tactical position tuning smoke passed: comparative posture, stable markers, exact arrival posture, shared editor schema and scene persistence.');

function verifyComparativePostureSelection(): void {
  const settings = createDefaultTacticalPositionSettings();
  assert.equal(selectHighestSafePosture([
    { posture: 'standing', danger: 18, safety: 72, protection: 20 },
    { posture: 'crouched', danger: 14, safety: 76, protection: 32 },
    { posture: 'prone', danger: 10, safety: 79, protection: 44 },
  ], settings).posture, 'standing', 'standing stays when lower postures do not clear advantage thresholds');

  assert.equal(selectHighestSafePosture([
    { posture: 'standing', danger: 18, safety: 72, protection: 20 },
    { posture: 'crouched', danger: 10, safety: 80, protection: 38 },
    { posture: 'prone', danger: 8, safety: 85, protection: 50 },
  ], settings).posture, 'crouched', 'crouched wins when it is materially safer than standing');

  assert.equal(selectHighestSafePosture([
    { posture: 'standing', danger: 18, safety: 72, protection: 20 },
    { posture: 'crouched', danger: 10, safety: 80, protection: 38 },
    { posture: 'prone', danger: 4, safety: 90, protection: 62 },
  ], settings).posture, 'prone', 'prone wins when it is materially safer than crouched');

  assert.equal(selectHighestSafePosture([
    { posture: 'standing', danger: 76, safety: 20, protection: 8 },
    { posture: 'crouched', danger: 61, safety: 34, protection: 24 },
    { posture: 'prone', danger: 34, safety: 58, protection: 48 },
  ], settings).posture, 'prone', 'prone remains the safe fallback when higher postures fail hard gates');
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
    type: 'move', target: { x: 2.5, y: 2.5 }, issuedAtMs: 1,
    source: 'player', playerCommandId: command.id,
  };
  unit.behaviorRuntime.posture = 'standing';
  reconcileTacticalPositionOccupation(unit);
  assert.equal(unit.behaviorRuntime.posture, 'crouched');

  unit.order = null;
  unit.playerCommand = updatePlayerCommandStatus(command, 'completed', 'done', 'готово');
  assert.equal(applyCompletedTacticalPositionOccupation(unit), true);
  unit.playerCommand = markPlayerCommandArrivalPostureApplied(unit.playerCommand);
  assert.equal(unit.behaviorRuntime.posture, 'prone', 'exact selected arrival posture must replace approach posture');
  assert.ok(Math.abs(unit.facingRadians - Math.PI / 2) < 0.0001);
  assert.equal(isTacticalPositionOccupationActive(unit), true);

  const restored = normalizePlayerCommand(JSON.parse(JSON.stringify(unit.playerCommand)), unit.id);
  assert.equal(restored?.arrivalPosture, 'prone');
  assert.equal(restored?.approachPosture, 'crouched');
  assert.equal(restored?.tacticalPositionOccupationStatus, 'occupied');

  const state = { units: [unit], map: { metersPerCell: 2 } } as unknown as SimulationState;
  const graphResult = withAiSimulationExecutionContext(state, unit, () => runAiGraphRuntime({
    graph: postureGraph('stand'), unitId: unit.id, blackboard: {}, nowMs: 2000,
  }));
  assert.equal(
    graphResult.effects.some((effect) => effect.type === 'set_posture' && effect.posture === 'stand'),
    false,
  );

  unit.order = {
    type: 'move', target: { x: 6.5, y: 4.5 }, issuedAtMs: 2,
    source: 'ai', ownerToken: 'ai-route-1',
  };
  reconcileTacticalPositionOccupation(unit);
  assert.equal(unit.playerCommand?.tacticalPositionOccupationStatus, 'released');
  unit.order = null;
  assert.equal(isTacticalPositionOccupationActive(unit), false);
}

function verifyOccupiedPostureSurvivesStaleMovementOwnership(): void {
  const state = createInitialState({
    width: 12,
    height: 8,
    cellSize: 8,
    metersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    cellRuns: [],
    cellRects: [],
    cells: [],
    objects: [],
  }, [{ id: 'occupied-prone', type: 'infantry_squad', side: 'blue', x: 2, y: 2 }], []);
  const unit = state.units[0]!;
  const command = createPlayerMoveCommand(
    unit.id,
    { x: 3.5, y: 2.5 },
    null,
    1000,
    'normal',
    null,
    null,
    'prone',
    'crouched',
  );
  unit.playerCommand = updatePlayerCommandStatus(command, 'completed', 'done', 'готово');
  assert.equal(applyCompletedTacticalPositionOccupation(unit), true);
  unit.playerCommand = markPlayerCommandArrivalPostureApplied(unit.playerCommand);
  unit.movementRuntime.requestedGait = 'sprint';
  unit.movementRuntime.actualGait = 'sprint';
  unit.movementRuntime.isMoving = true;
  unit.movementRuntime.lastMovementPosture = 'standing';

  preparePhysicalMovementStep(state, unit, 0.1, false, 1, 1);

  assert.equal(
    unit.behaviorRuntime.posture,
    'prone',
    'stale movement gait must not replace an occupied prone tactical posture',
  );
}

function verifyMarkerPublicationIsRateLimitedAndKeepsOldResult(): void {
  const unit = normalizeUnits([{ id: 'unit-1', type: 'infantry_squad', side: 'blue', x: 0, y: 0 }])[0]!;
  const state = {
    units: [unit], simulationTimeSeconds: 0, map: { cellSize: 20 },
  } as unknown as SimulationState;
  const settings = createDefaultTacticalPositionSettings();
  settings.markerRefreshIntervalSeconds = 1;
  settings.emptyResultHoldSeconds = 1.5;
  setTacticalPositionSettings(unit, settings);

  publishVisibleTacticalPositions(state, unit.id, [candidate('first', 2.5, 2.5)]);
  state.simulationTimeSeconds = 0.25;
  publishVisibleTacticalPositions(state, unit.id, [candidate('second', 5.5, 5.5)]);
  assert.equal(getTacticalPositionPresentation(state).candidates[0]?.id, 'first');

  state.simulationTimeSeconds = 1.1;
  publishVisibleTacticalPositions(state, unit.id, [candidate('second', 5.5, 5.5)]);
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
    units: [unit], simulationTimeSeconds: 0, map: { cellSize: 20 },
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
    id: 'unit-persisted', type: 'infantry_squad', side: 'blue', x: 0, y: 0,
    tacticalPositionSettings: {
      version: 1, revision: 7,
      values: { standingMaximumDanger: 11, markerRefreshIntervalSeconds: 2.5 },
    },
  }])[0]!;
  const settings = getTacticalPositionSettings(unit);
  const defaults = createDefaultTacticalPositionSettings();
  assert.equal(settings.standingMaximumDanger, 11);
  assert.equal(settings.markerRefreshIntervalSeconds, 2.5);
  assert.equal(unit.tacticalPositionSettingsRevision, 7);
  assert.equal(settings.crouchedSafetyAdvantageThreshold, defaults.crouchedSafetyAdvantageThreshold);
  assert.equal(settings.proneSafetyAdvantageThreshold, defaults.proneSafetyAdvantageThreshold);
  assert.equal(settings.advanceToThreatWeight, defaults.advanceToThreatWeight);
}

function verifySceneExportIncludesSettings(): void {
  const source = readFileSync('src/ui/SceneExport.ts', 'utf8');
  assert.ok(source.includes('tacticalPositionSettings: serializeTacticalPositionSettings(unit)'));
  assert.ok(source.includes('getTacticalPositionSearchService(state)'));
  assert.ok(source.includes('tacticalPositionSearchService?.clearUnit(unit.id)'));
}

function verifyOccupationAndEditorContracts(): void {
  const occupation = readFileSync('src/core/tactical/TacticalPositionOccupation.ts', 'utf8');
  const orders = readFileSync('src/core/tactical/TacticalPositionOrders.ts', 'utf8');
  const controls = readFileSync('src/ui/TacticalPositionSettingsControls.ts', 'utf8');
  const schema = readFileSync('src/core/tactical/TacticalPositionSettingsSchema.ts', 'utf8');
  const aiEditor = readFileSync('src/ai-node-editor/TacticalPositionProfileEditor.ts', 'utf8');
  const html = readFileSync('ai-node-editor.html', 'utf8');
  const searchControls = readFileSync('src/ui/TacticalPositionSearchControls.ts', 'utf8');
  const workspaceBase = readFileSync('src/ui/TacticalWorkspaceBase.ts', 'utf8');
  const workspaceTab = readFileSync('src/ui/TacticalPositionWorkspaceTab.ts', 'utf8');
  const runtimeUi = readFileSync('src/core/ui/RuntimeUiState.ts', 'utf8');
  assert.equal(occupation.includes('WeakMap'), false);
  assert.equal(orders.includes('behaviorRuntime.danger = 0'), false);
  assert.ok(orders.includes('finalFacingRadians'));
  assert.ok(orders.includes('approachPosture'));
  assert.ok(controls.includes('TACTICAL_POSITION_SETTINGS_GROUPS'));
  assert.ok(schema.includes('crouchedSafetyAdvantageThreshold'));
  assert.ok(schema.includes('proneSafetyAdvantageThreshold'));
  assert.ok(schema.includes('advanceToThreatWeight'));
  assert.ok(aiEditor.includes('TACTICAL_POSITION_SETTINGS_GROUPS'));
  assert.ok(aiEditor.includes('Тактические позиции'));
  assert.ok(html.includes('TacticalPositionProfileEditor.ts'));
  assert.ok(searchControls.includes('objectiveDraftByUnit'));
  assert.ok(searchControls.includes('{ forceRefresh: true }'));
  assert.equal(searchControls.includes('selectedObjective = request.objective'), false);
  assert.ok(workspaceBase.includes("type SimulationTab = 'info' | 'danger' | 'positions' | 'stealth' | 'memory'"));
  assert.ok(workspaceBase.includes("['positions', 'Позиции']"));
  assert.ok(workspaceBase.includes("tab === 'positions'"));
  assert.ok(workspaceBase.includes("if (tab === 'info' || tab === 'positions') return `${tab}|${unit.id}`;"), "positions panel structure must remain stable while the unit moves");
  assert.equal(workspaceTab.includes("document.createElement('button')"), false);
  assert.ok(workspaceTab.includes("getSimulationLayerState(state).mode === 'positions'"));
  assert.ok(runtimeUi.includes("runtime.attentionOverlay.active = mode === 'memory'"));
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
      onMap: true, routeExists: true, distanceMeters: 10, blocksThreat: true,
      protection: 50, concealment: 30, routeDanger: 20, slopeType: 'flat',
      orderAlignment: 50, danger: 25, suppression: 12, safety: 70,
      safetyGain: 20, uncertainty: 5, recommendedPosture: 'crouched', routeCost: 10,
    },
  };
}
