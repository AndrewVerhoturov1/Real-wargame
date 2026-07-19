import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPlayerMoveCommand, updatePlayerCommandStatus } from '../src/core/orders/PlayerCommand';
import { normalizeUnits } from '../src/core/units/UnitModel';
import type { SimulationState } from '../src/core/simulation/SimulationState';
import {
  createDefaultTacticalPositionSettings,
  getTacticalPositionSettings,
  selectHighestSafePosture,
  setTacticalPositionSettings,
} from '../src/core/tactical/TacticalPositionSettings';
import {
  activateTacticalPositionOccupation,
  reconcileTacticalPositionOccupation,
  registerTacticalPositionOccupation,
} from '../src/core/tactical/TacticalPositionOccupation';
import {
  getTacticalPositionPresentation,
  publishVisibleTacticalPositions,
} from '../src/core/tactical/SimulationTacticalPositionSelection';
import type { TacticalPositionCandidateSeedV2 } from '../src/core/tactical/TacticalPositionSearch';

verifyHighestSafePosture();
verifyApproachAndOccupationSurviveAiOverwrite();
verifyMarkerPublicationIsRateLimitedAndKeepsOldResult();
verifySettingsChangeRefreshesMarkersImmediately();
verifySettingsNormalizeFromSceneData();
verifySceneExportIncludesSettings();

console.log('Tactical position tuning smoke passed: highest-safe posture, stable markers, immediate tuning refresh, approach/occupation locks and scene settings persistence.');

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

function verifyApproachAndOccupationSurviveAiOverwrite(): void {
  const unit = normalizeUnits([{ id: 'unit-1', type: 'infantry_squad', side: 'blue', x: 0, y: 0 }])[0]!;
  unit.playerCommand = createPlayerMoveCommand(unit.id, { x: 2.5, y: 2.5 }, null, 1000);
  const commandId = unit.playerCommand.id;
  unit.order = {
    type: 'move',
    target: { x: 2.5, y: 2.5 },
    issuedAtMs: 1,
    source: 'player',
    playerCommandId: commandId,
  };
  registerTacticalPositionOccupation(unit, commandId, 'prone', Math.PI / 2, 'crouched');
  unit.behaviorRuntime.posture = 'standing';
  reconcileTacticalPositionOccupation(unit);
  assert.equal(unit.behaviorRuntime.posture, 'crouched', 'approach posture must survive an AI overwrite while the linked route is active');

  unit.order = null;
  unit.playerCommand = updatePlayerCommandStatus(unit.playerCommand, 'completed', 'done', 'готово');
  activateTacticalPositionOccupation(unit, commandId, 'prone', Math.PI / 2);
  unit.behaviorRuntime.posture = 'standing';
  unit.facingRadians = 0;
  reconcileTacticalPositionOccupation(unit);
  assert.equal(unit.behaviorRuntime.posture, 'prone');
  assert.ok(Math.abs(unit.facingRadians - Math.PI / 2) < 0.0001);

  unit.order = { type: 'move', target: { x: 3, y: 3 }, issuedAtMs: 2 };
  reconcileTacticalPositionOccupation(unit);
  unit.behaviorRuntime.posture = 'standing';
  reconcileTacticalPositionOccupation(unit);
  assert.equal(unit.behaviorRuntime.posture, 'standing', 'a new route must release occupied-position posture');
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
      standingMaximumDanger: 11,
      markerRefreshIntervalSeconds: 2.5,
    },
  }])[0]!;
  const settings = getTacticalPositionSettings(unit);
  assert.equal(settings.standingMaximumDanger, 11);
  assert.equal(settings.markerRefreshIntervalSeconds, 2.5);
  assert.equal(settings.crouchedMaximumDanger, createDefaultTacticalPositionSettings().crouchedMaximumDanger);
}

function verifySceneExportIncludesSettings(): void {
  const source = readFileSync('src/ui/SceneExport.ts', 'utf8');
  assert.ok(source.includes('tacticalPositionSettings: cloneTacticalPositionSettings(getTacticalPositionSettings(unit))'));
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
