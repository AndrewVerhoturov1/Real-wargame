import assert from 'node:assert/strict';
import { normalizeUnits } from '../src/core/units/UnitModel';
import type { SimulationState } from '../src/core/simulation/SimulationState';
import {
  createDefaultTacticalPositionSettings,
  selectHighestSafePosture,
  setTacticalPositionSettings,
} from '../src/core/tactical/TacticalPositionSettings';
import {
  activateTacticalPositionOccupation,
  reconcileTacticalPositionOccupation,
} from '../src/core/tactical/TacticalPositionOccupation';
import {
  getTacticalPositionPresentation,
  publishVisibleTacticalPositions,
} from '../src/core/tactical/SimulationTacticalPositionSelection';
import type { TacticalPositionCandidateSeedV2 } from '../src/core/tactical/TacticalPositionSearch';

verifyHighestSafePosture();
verifyOccupationSurvivesAiOverwriteAndClearsOnNewMove();
verifyMarkerPublicationIsRateLimitedAndKeepsOldResult();

console.log('Tactical position tuning smoke passed: highest-safe posture, stable markers and occupied-position lock.');

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

function verifyOccupationSurvivesAiOverwriteAndClearsOnNewMove(): void {
  const unit = normalizeUnits([{ id: 'unit-1', type: 'infantry_squad', side: 'blue', x: 0, y: 0 }])[0]!;
  activateTacticalPositionOccupation(unit, 'command-1', 'crouched', Math.PI / 2);
  unit.behaviorRuntime.posture = 'standing';
  unit.facingRadians = 0;
  reconcileTacticalPositionOccupation(unit);
  assert.equal(unit.behaviorRuntime.posture, 'crouched');
  assert.ok(Math.abs(unit.facingRadians - Math.PI / 2) < 0.0001);

  unit.order = { type: 'move', target: { x: 3, y: 3 }, issuedAtMs: 1 };
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
