import assert from 'node:assert/strict';
import { cancelFireAction, getFireAction, requestFireAction } from '../src/core/combat/FireAction';
import { setFireAllowed } from '../src/core/combat/CombatRules';
import type { GridPosition } from '../src/core/geometry';
import type { TacticalMapData } from '../src/core/map/MapModel';
import {
  resolveMovementProfile,
  upsertMovementProfile,
  createMovementProfileRegistry,
  type MovementGait,
} from '../src/core/movement/MovementProfiles';
import { setMovementProfileRequest, setMovementRequest } from '../src/core/movement/MovementRuntime';
import { createMoveOrder } from '../src/core/orders/MoveOrder';
import { planMoveOrder } from '../src/core/orders/MoveOrderPlanning';
import { buildPerceptionStimuli } from '../src/core/perception/PerceptionStimulus';
import { evaluateVisualSignal } from '../src/core/perception/VisualSignal';
import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';
import { tickSimulation } from '../src/core/simulation/SimulationTick';
import type { UnitData, UnitModel } from '../src/core/units/UnitModel';
import { buildExportedScene, normalizeImportedScene } from '../src/ui/SceneExport';

verifyGaitSpeedOrder();
verifyPartitionInvariantMovementAndSound();
verifyStaminaDrainRecoveryAndFallback();
verifyPerceptionMovementAndSignature();
verifySprintWeaponPreparation();
verifyLegacyAndCustomProfileSerialization();
verifySelectionIndependence();
verifyRouteReplanKeepsMovementProfile();

console.log('Physical movement runtime smoke passed: gait speed, partition invariance, stamina, perception, sound, weapon preparation, migration, UI independence and route replan persistence.');

function verifyGaitSpeedOrder(): void {
  const crawl = movedDistance('low', 'crawl', 2);
  const crouch = movedDistance('stealth', 'crouch_walk', 2);
  const walk = movedDistance('normal', 'walk', 2);
  const run = movedDistance('rapid', 'run', 2);
  const sprint = movedDistance('assault', 'sprint', 2);

  assert.ok(run > walk, `run must be faster than walk (${run} > ${walk})`);
  assert.ok(sprint > run, `sprint must be faster than run (${sprint} > ${run})`);
  assert.ok(crouch < walk, `stealth crouch walk must be slower than walk (${crouch} < ${walk})`);
  assert.ok(crawl < crouch, `crawl must be slower than crouch walk (${crawl} < ${crouch})`);
}

function verifyPartitionInvariantMovementAndSound(): void {
  const coarse = movementScenario('rapid', 'run', [1]);
  const fine = movementScenario('rapid', 'run', Array.from({ length: 10 }, () => 0.1));
  assert.ok(Math.abs(coarse.distance - fine.distance) < 1e-6, `1x1s and 10x0.1s movement must match (${coarse.distance} vs ${fine.distance})`);
  assert.ok(Math.abs(coarse.stamina - fine.stamina) < 1e-6, 'stamina must be partition invariant');
  assert.equal(coarse.soundCount, fine.soundCount, 'movement sound count must be distance-based, not FPS-based');

  const thresholdCoarse = movementScenario('assault', 'sprint', [1], 30);
  const thresholdFine = movementScenario('assault', 'sprint', Array.from({ length: 10 }, () => 0.1), 30);
  assert.ok(Math.abs(thresholdCoarse.distance - thresholdFine.distance) < 1e-6, 'stamina threshold crossing must also be partition invariant');
  assert.ok(Math.abs(thresholdCoarse.stamina - thresholdFine.stamina) < 1e-6, 'fallback stamina integration must be partition invariant');

  const quiet = movementScenario('stealth', 'crouch_walk', Array.from({ length: 30 }, () => 0.1));
  const loud = movementScenario('rapid', 'run', Array.from({ length: 30 }, () => 0.1));
  assert.ok(loud.noise > quiet.noise, 'run must expose a stronger movement sound diagnostic than stealth movement');
  assert.ok(loud.soundCount >= quiet.soundCount, 'run must not emit fewer movement cues over the same time than stealth movement');
}

function verifyStaminaDrainRecoveryAndFallback(): void {
  const state = makeState();
  const unit = state.units[0];
  setMovementRequest(unit, 'assault', 'player', 'sprint');
  unit.order = createMoveOrder({ x: 100.5, y: 2.5 }, { source: 'player' });
  const initial = unit.movementRuntime.stamina;
  for (let index = 0; index < 20; index += 1) tickSimulation(state, 0.1);
  assert.ok(unit.movementRuntime.stamina < initial, 'sprint must drain stamina deterministically');
  const drained = unit.movementRuntime.stamina;
  unit.order = null;
  for (let index = 0; index < 20; index += 1) tickSimulation(state, 0.1);
  assert.ok(unit.movementRuntime.stamina > drained, 'stopped movement must recover stamina');

  const fallbackState = makeState();
  const fallbackUnit = fallbackState.units[0];
  setMovementRequest(fallbackUnit, 'assault', 'player', 'sprint');
  fallbackUnit.movementRuntime.stamina = 5;
  const order = createMoveOrder({ x: 100.5, y: 2.5 }, { source: 'player', ownerToken: 'persistent-order' });
  fallbackUnit.order = order;
  tickSimulation(fallbackState, 0.2);
  assert.equal(fallbackUnit.movementRuntime.requestedGait, 'sprint', 'stamina fallback must preserve requested intent');
  assert.notEqual(fallbackUnit.movementRuntime.actualGait, 'sprint', 'low stamina must select a safe effective gait');
  assert.equal(fallbackUnit.order, order, 'temporary stamina fallback must not delete or replace the order');
  assert.equal(fallbackUnit.movementRuntime.effectiveProfileSource, 'fallback');
}

function verifyPerceptionMovementAndSignature(): void {
  const runningState = makeState();
  const runner = runningState.units[0];
  setMovementRequest(runner, 'rapid', 'player', 'run');
  runner.order = createMoveOrder({ x: 100.5, y: 2.5 }, { source: 'player' });
  tickSimulation(runningState, 0.5);
  const runningStimulus = buildPerceptionStimuli(runningState).find((item) => item.sourceUnitId === runner.id);
  assert.ok(runningStimulus);
  assert.equal(runningStimulus.movement, 'running', 'run must reach perception as running');

  const sprintState = makeState();
  const sprinter = sprintState.units[0];
  setMovementRequest(sprinter, 'assault', 'player', 'sprint');
  sprinter.order = createMoveOrder({ x: 100.5, y: 2.5 }, { source: 'player' });
  tickSimulation(sprintState, 0.5);
  const sprintStimulus = buildPerceptionStimuli(sprintState).find((item) => item.sourceUnitId === sprinter.id);
  assert.ok(sprintStimulus);
  assert.equal(sprintStimulus.movement, 'running', 'sprint must reach perception as running');

  const stealthState = makeState();
  const stealth = stealthState.units[0];
  setMovementRequest(stealth, 'stealth', 'player', 'crouch_walk');
  stealth.order = createMoveOrder({ x: 100.5, y: 2.5 }, { source: 'player' });
  tickSimulation(stealthState, 0.5);
  const stealthStimulus = buildPerceptionStimuli(stealthState).find((item) => item.sourceUnitId === stealth.id);
  assert.ok(stealthStimulus);

  const fakeVisibility = {
    lineOfSight: {
      origin: { x: 0, y: 0 }, target: { x: 10, y: 0 }, totalDistanceMeters: 20, visibleDistanceMeters: 20,
      blocked: false, blockedAt: null, blockerReasonRu: 'нет', visualTransmission: 1,
      partialObscuration: false, accumulatedForestMeters: 0, obscurationReasonRu: 'нет',
    },
    quality: { quality01: 1, distanceFactor: 1, transmissionFactor: 1, attentionFactor: 1, observerConditionFactor: 1, blocked: false },
    distanceMeters: 20,
    explanationRu: [],
  };
  const attention = { zone: 'focus' as const, weight: 1, normalizedAngle01: 0 };
  const runningSignal = evaluateVisualSignal({ observer: runner, stimulus: runningStimulus, attention, visibility: fakeVisibility });
  const stealthSignal = evaluateVisualSignal({ observer: stealth, stimulus: stealthStimulus, attention, visibility: fakeVisibility });
  assert.ok(stealthSignal.evidencePerSecond < runningSignal.evidencePerSecond, 'stealth movement must create less visual evidence than running under equal visibility');
  assert.ok(stealth.movementRuntime.diagnostics.observationFocusMultiplier > sprinter.movementRuntime.diagnostics.observationFocusMultiplier, 'sprint must degrade self-observation more than stealth movement');
}

function verifySprintWeaponPreparation(): void {
  const state = makeCombatState();
  const shooter = state.units[0];
  const target = state.units[1];
  setMovementRequest(shooter, 'assault', 'player', 'sprint');
  shooter.order = createMoveOrder({ x: 100.5, y: 2.5 }, { source: 'player' });
  tickSimulation(state, 0.5);
  assert.equal(shooter.movementRuntime.isMoving, true);
  installIdentifiedContact(shooter, target, state.simulationTimeSeconds);
  setFireAllowed(state, true);
  assert.equal(requestFireAction(state, shooter, shooter.perceptionKnowledge.contacts[0].id), false, 'sprint must block immediate fire');
  assert.equal(shooter.movementRuntime.weaponStopRequested, true);
  assert.ok(shooter.order, 'weapon preparation must pause, not destroy, the active movement order');

  setFireAllowed(state, false);
  tickSimulation(state, 1.1);
  assert.equal(shooter.movementRuntime.isMoving, false, 'weapon preparation must physically stop the soldier');
  setFireAllowed(state, true);
  assert.equal(requestFireAction(state, shooter, shooter.perceptionKnowledge.contacts[0].id), true, 'fire must become available after the correct stop delay');
  assert.ok(getFireAction(shooter));
  assert.ok(shooter.order, 'starting fire must retain the paused order for later continuation');
  cancelFireAction(shooter, 'smoke complete');
}

function verifyLegacyAndCustomProfileSerialization(): void {
  const legacy = createInitialState(mapData(), [unitData()]);
  const legacyUnit = legacy.units[0];
  assert.equal(legacyUnit.movementRuntime.requestedProfileId, 'normal');
  assert.equal(legacyUnit.movementRuntime.requestedGait, 'walk');
  assert.equal(legacyUnit.movementRuntime.stamina, 100);

  const custom = {
    ...resolveMovementProfile(legacy.movementProfiles, 'normal'),
    id: 'custom_patrol',
    label: 'Custom patrol',
    labelRu: 'Пользовательский патруль',
    builtIn: false,
    revision: 7,
    movement: { ...resolveMovementProfile(legacy.movementProfiles, 'normal').movement, speedMultiplier: 0.77 },
  };
  assert.ok(upsertMovementProfile(legacy.movementProfiles, custom));
  setMovementProfileRequest(legacy, legacyUnit, 'rapid', 'unit');
  assert.equal(legacyUnit.movementRuntime.requestedGait, 'run', 'profile adapter must use the profile default gait');
  setMovementProfileRequest(legacy, legacyUnit, 'custom_patrol', 'unit');
  legacyUnit.movementRuntime.stamina = 63;
  const exported = buildExportedScene(legacy);
  const parsed = normalizeImportedScene(JSON.parse(JSON.stringify(exported)));
  const restored = createInitialState(parsed.map, parsed.units, parsed.pressureZones);
  restored.movementProfiles = createMovementProfileRegistry(parsed.movementProfiles);
  assert.equal(restored.units[0].movementRuntime.requestedProfileId, 'custom_patrol');
  assert.equal(restored.units[0].movementRuntime.stamina, 63);
  assert.equal(resolveMovementProfile(restored.movementProfiles, 'custom_patrol').movement.speedMultiplier, 0.77, 'custom profile must not be silently reset');
}

function verifySelectionIndependence(): void {
  const left = makeCombatState();
  const right = makeCombatState();
  left.selectedUnitId = left.units[0].id;
  left.selectedUnitIds = [left.units[0].id];
  right.selectedUnitId = null;
  right.selectedUnitIds = [];
  for (const state of [left, right]) {
    setMovementRequest(state.units[0], 'rapid', 'player', 'run');
    state.units[0].order = createMoveOrder({ x: 100.5, y: 2.5 }, { source: 'player' });
    for (let index = 0; index < 10; index += 1) tickSimulation(state, 0.1);
  }
  assert.deepEqual(left.units[0].position, right.units[0].position, 'UI selection must not affect physical movement');
  assert.equal(left.units[0].movementRuntime.stamina, right.units[0].movementRuntime.stamina);
  assert.deepEqual(
    left.units[1].perceptionKnowledge,
    right.units[1].perceptionKnowledge,
    'UI selection must not affect another soldier perception result',
  );
}

function verifyRouteReplanKeepsMovementProfile(): void {
  const state = makeState();
  const unit = state.units[0];
  setMovementRequest(unit, 'stealth', 'player', 'crouch_walk');
  const planned = planMoveOrder(state.map, unit.position, { x: 30.5, y: 2.5 }, { source: 'player' });
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  unit.order = planned.order;
  state.map.objects.push({
    id: 'new-blocker', kind: 'structure', x: 4, y: 2, rotationRadians: 0,
    widthCells: 0.9, heightCells: 0.9, labels: null,
  });
  tickSimulation(state, 0.1);
  assert.equal(unit.movementRuntime.requestedProfileId, 'stealth', 'route replan must not lose the physical movement profile');
  assert.equal(unit.movementRuntime.requestedGait, 'crouch_walk');
  assert.ok(unit.order, 'an alternate route must remain active');
  assert.ok((unit.order.replanCount ?? 0) >= 1 || unit.order.routeStatus === 'replanned', 'test must exercise the route replan path');
}

function movedDistance(profileId: string, gait: MovementGait, seconds: number): number {
  return movementScenario(profileId, gait, Array.from({ length: Math.round(seconds * 10) }, () => 0.1)).distance;
}

function movementScenario(profileId: string, gait: MovementGait, deltas: number[], initialStamina = 100) {
  const state = makeState();
  const unit = state.units[0];
  const start = { ...unit.position };
  setMovementRequest(unit, profileId, 'player', gait);
  unit.movementRuntime.stamina = initialStamina;
  unit.order = createMoveOrder({ x: 110.5, y: 2.5 }, { source: 'player' });
  for (const delta of deltas) tickSimulation(state, delta);
  return {
    distance: Math.hypot(unit.position.x - start.x, unit.position.y - start.y),
    stamina: unit.movementRuntime.stamina,
    soundCount: unit.movementRuntime.emittedSoundCount,
    noise: unit.movementRuntime.diagnostics.noiseLoudness,
  };
}

function makeState(): SimulationState {
  return createInitialState(mapData(), [unitData()]);
}

function makeCombatState(): SimulationState {
  return createInitialState(mapData(), [unitData(), {
    ...unitData(), id: 'target', side: 'red', x: 20, y: 2, facingDegrees: 180,
  }]);
}

function unitData(): UnitData {
  return {
    id: 'mover', label: 'Mover', labelRu: 'Боец', type: 'infantry_squad', side: 'player', aiControl: 'manual',
    x: 1, y: 2, speedCellsPerSecond: 4, facingDegrees: 0,
  };
}

function mapData(): TacticalMapData {
  return {
    width: 120, height: 8, cellSize: 16, metersPerCell: 2,
    defaultTerrain: 'field', defaultHeight: 0, objects: [],
  };
}

function installIdentifiedContact(observer: UnitModel, target: UnitModel, nowSeconds: number): void {
  observer.perceptionKnowledge.contacts = [{
    id: `perception:unit:${target.id}`, stimulusId: `unit:${target.id}`, sourceUnitId: target.id,
    labelRu: target.labels.ru, stage: 'confirmed', source: 'visual', evidence: 180, confidence: 100,
    uncertaintyCells: 0.25, lastKnownPosition: { ...target.position }, visibleNow: true, observedNow: true,
    lastObservedSeconds: nowSeconds, lastUpdatedSeconds: nowSeconds, evidencePerSecond: 100,
    detectionVariance: 1, explanationRu: ['Проверочный подтверждённый контакт.'],
  }];
  observer.perceptionKnowledge.revision += 1;
}
