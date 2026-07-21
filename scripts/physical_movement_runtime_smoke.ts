import assert from 'node:assert/strict';
import {
  cancelPendingFireIntent,
  getFireAction,
  reconcilePendingFireIntent,
  requestFireAction,
} from '../src/core/combat/FireAction';
import { setFireAllowed } from '../src/core/combat/CombatRules';
import type { TacticalMapData } from '../src/core/map/MapModel';
import {
  BUILT_IN_MOVEMENT_PROFILE_IDS,
  MOVEMENT_PROFILE_ID_ALIASES,
  createMovementProfileRegistry,
  resolveMovementProfile,
  upsertMovementProfile,
  type MovementGait,
} from '../src/core/movement/MovementProfiles';
import {
  cancelMovementWeaponPreparation,
  createMovementRuntime,
  getMovementWeaponPreparation,
  preparePhysicalMovementStep,
  setMovementProfileRequest,
  setMovementRequest,
} from '../src/core/movement/MovementRuntime';
import { createMoveOrder } from '../src/core/orders/MoveOrder';
import { planMoveOrder } from '../src/core/orders/MoveOrderPlanning';
import { buildPerceptionStimuli } from '../src/core/perception/PerceptionStimulus';
import { evaluateVisualSignal } from '../src/core/perception/VisualSignal';
import { createInitialState as createInitialStateBase, type SimulationState } from '../src/core/simulation/SimulationState';
import { tickSimulation } from '../src/core/simulation/SimulationTick';
import { clearStaticTacticalPositionService } from '../src/core/tactical/static/StaticTacticalPositionService';
import type { UnitData, UnitModel } from '../src/core/units/UnitModel';
import { buildExportedScene, normalizeImportedScene } from '../src/ui/SceneExport';

const createdStates = new Set<SimulationState>();

function createInitialState(...args: Parameters<typeof createInitialStateBase>): SimulationState {
  const state = createInitialStateBase(...args);
  createdStates.add(state);
  return state;
}

verifyCanonicalIdsAndAliases();
verifyProfileOwnedSpeedOrder();
verifyPartitionInvariantMovementAndSound();
verifyStaminaDrainRecoveryAndFallback();
verifyProfileOwnedObservation();
verifyPerceptionMovementAndSignature();
verifyMovementSoundDoesNotDowngradeVisualContact();
verifyWeaponPreparationLifecycle();
verifyWeaponPreparationRemainingSerialization();
verifyLegacyAndCustomProfileSerialization();
verifyMaterialProviderBoundary();
verifySelectionIndependence();
verifyRouteReplanKeepsMovementProfile();

for (const state of createdStates) clearStaticTacticalPositionService(state);

console.log('Physical movement runtime smoke passed: canonical profile IDs and aliases, unified editable settings, deterministic stamina, gait-aware perception, sensor precedence, intent-owned weapon preparation, remaining-duration serialization, material adapter boundary, UI independence and route replan persistence.');

function verifyCanonicalIdsAndAliases(): void {
  assert.deepEqual([...BUILT_IN_MOVEMENT_PROFILE_IDS], [
    'normal_walk', 'stealth_move', 'crouched_move', 'run', 'sprint', 'crawl',
  ]);
  assert.deepEqual(MOVEMENT_PROFILE_ID_ALIASES, {
    normal: 'normal_walk',
    stealth: 'stealth_move',
    rapid: 'run',
    fast: 'run',
    assault: 'run',
    low: 'crawl',
  });
  for (const [legacy, canonical] of Object.entries(MOVEMENT_PROFILE_ID_ALIASES)) {
    const state = makeState();
    setMovementProfileRequest(state, state.units[0], legacy, 'unit_role');
    assert.equal(state.units[0].movementRuntime.requestedProfileId, canonical, `${legacy} must migrate to ${canonical}`);
    assert.equal(state.units[0].movementRuntime.migrationInfo?.reason, 'legacy_alias');
  }
}

function verifyProfileOwnedSpeedOrder(): void {
  const crawl = movedDistance('crawl', 'crawl', 2);
  const crouch = movedDistance('crouched_move', 'crouch_walk', 2);
  const stealth = movedDistance('stealth_move', 'walk', 2);
  const walk = movedDistance('normal_walk', 'walk', 2);
  const run = movedDistance('run', 'run', 2);
  const sprint = movedDistance('sprint', 'sprint', 2);
  assert.ok(run > walk, `run must be faster than walk (${run} > ${walk})`);
  assert.ok(sprint > run, `sprint must be faster than run (${sprint} > ${run})`);
  assert.ok(crouch < walk, `crouched movement must be slower than walk (${crouch} < ${walk})`);
  assert.ok(stealth < walk, `stealth movement must be slower than walk (${stealth} < ${walk})`);
  assert.ok(crawl < crouch, `crawl must be slower than crouched movement (${crawl} < ${crouch})`);

  const customState = makeState();
  const normal = resolveMovementProfile(customState.movementProfiles, 'normal_walk');
  assert.ok(upsertMovementProfile(customState.movementProfiles, {
    ...normal,
    id: 'editable_speed_probe',
    nameEn: 'Editable speed probe',
    nameRu: 'Проверка редактируемой скорости',
    builtIn: false,
    settings: {
      ...normal.settings,
      speed: { ...normal.settings.speed, speedMultiplier: 0.33 },
    },
  }));
  const unit = customState.units[0];
  setMovementProfileRequest(customState, unit, 'editable_speed_probe', 'unit_role');
  unit.order = createMoveOrder({ x: 100.5, y: 2.5 }, { source: 'player' });
  tickSimulation(customState, 0.5);
  assert.equal(unit.movementRuntime.diagnostics.profileMultiplier, 0.33, 'runtime speed must come from the editable profile');
  assert.equal(unit.movementRuntime.diagnostics.gaitMultiplier, 1, 'runtime must not retain a hidden numeric gait speed system');
}

function verifyPartitionInvariantMovementAndSound(): void {
  const coarse = movementScenario('run', 'run', [1]);
  const fine = movementScenario('run', 'run', Array.from({ length: 10 }, () => 0.1));
  assert.ok(Math.abs(coarse.distance - fine.distance) < 1e-6, `1x1s and 10x0.1s movement must match (${coarse.distance} vs ${fine.distance})`);
  assert.ok(Math.abs(coarse.stamina - fine.stamina) < 1e-6, 'stamina must be partition invariant');
  assert.equal(coarse.soundCount, fine.soundCount, 'movement sound count must be distance-based, not FPS-based');

  const thresholdCoarse = movementScenario('sprint', 'sprint', [1], 30);
  const thresholdFine = movementScenario('sprint', 'sprint', Array.from({ length: 10 }, () => 0.1), 30);
  assert.ok(Math.abs(thresholdCoarse.distance - thresholdFine.distance) < 1e-6, `stamina threshold crossing must be partition invariant (${thresholdCoarse.distance} vs ${thresholdFine.distance})`);
  assert.ok(Math.abs(thresholdCoarse.stamina - thresholdFine.stamina) < 1e-6, 'fallback stamina integration must be partition invariant');

  const quiet = movementScenario('stealth_move', 'walk', Array.from({ length: 30 }, () => 0.1));
  const loud = movementScenario('run', 'run', Array.from({ length: 30 }, () => 0.1));
  assert.ok(loud.noise > quiet.noise, 'run must expose a stronger movement sound diagnostic than stealth movement');
  assert.ok(loud.soundCount >= quiet.soundCount, 'run must not emit fewer movement cues over the same time than stealth movement');
}

function verifyStaminaDrainRecoveryAndFallback(): void {
  const state = makeState();
  const unit = state.units[0];
  setMovementRequest(unit, 'sprint', 'player_order', 'sprint');
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
  setMovementRequest(fallbackUnit, 'sprint', 'player_order', 'sprint');
  fallbackUnit.movementRuntime.stamina = 5;
  const order = createMoveOrder({ x: 100.5, y: 2.5 }, { source: 'player', ownerToken: 'persistent-order' });
  fallbackUnit.order = order;
  tickSimulation(fallbackState, 0.2);
  assert.equal(fallbackUnit.movementRuntime.requestedProfileId, 'sprint');
  assert.equal(fallbackUnit.movementRuntime.requestedProfileSource, 'player_order');
  assert.notEqual(fallbackUnit.movementRuntime.actualGait, 'sprint', 'low stamina must select a safe effective profile/gait');
  assert.equal(fallbackUnit.movementRuntime.effectiveProfileSource, 'hard_safety');
  assert.ok(fallbackUnit.movementRuntime.forcedFallbackReason?.includes('stamina'));
  assert.equal(fallbackUnit.order, order, 'temporary stamina fallback must not delete or replace the order');
}

function verifyProfileOwnedObservation(): void {
  const walkingState = makeState();
  const walker = walkingState.units[0];
  setMovementRequest(walker, 'normal_walk', 'player_order', 'walk');
  walker.order = createMoveOrder({ x: 100.5, y: 2.5 }, { source: 'player' });
  tickSimulation(walkingState, 0.5);
  assert.equal(walker.movementRuntime.diagnostics.observationFocusMultiplier, 1);
  assert.equal(walker.movementRuntime.diagnostics.observationDirectMultiplier, 1);
  assert.equal(walker.movementRuntime.diagnostics.observationPeripheralMultiplier, 1);
  assert.equal(walker.movementRuntime.diagnostics.observationRearMultiplier, 1);

  const runningState = makeState();
  const runner = runningState.units[0];
  setMovementRequest(runner, 'run', 'player_order', 'run');
  runner.order = createMoveOrder({ x: 100.5, y: 2.5 }, { source: 'player' });
  tickSimulation(runningState, 0.5);
  assert.ok(runner.movementRuntime.diagnostics.observationFocusMultiplier < 1);
  assert.ok(runner.movementRuntime.diagnostics.observationPeripheralMultiplier < runner.movementRuntime.diagnostics.observationFocusMultiplier);
  assert.ok(runner.movementRuntime.diagnostics.observationScanSpeedMultiplier < 1);

  const sprintState = makeState();
  const sprinter = sprintState.units[0];
  setMovementRequest(sprinter, 'sprint', 'ai_override', 'sprint');
  sprinter.order = createMoveOrder({ x: 100.5, y: 2.5 }, { source: 'ai' });
  tickSimulation(sprintState, 0.5);
  assert.ok(sprinter.movementRuntime.diagnostics.observationFocusMultiplier < runner.movementRuntime.diagnostics.observationFocusMultiplier);
}

function verifyPerceptionMovementAndSignature(): void {
  const runningState = makeState();
  const runner = runningState.units[0];
  setMovementRequest(runner, 'run', 'player_order', 'run');
  runner.order = createMoveOrder({ x: 100.5, y: 2.5 }, { source: 'player' });
  tickSimulation(runningState, 0.5);
  const runningStimulus = buildPerceptionStimuli(runningState).find((item) => item.sourceUnitId === runner.id);
  assert.ok(runningStimulus);
  assert.equal(runningStimulus.movement, 'running');

  const sprintState = makeState();
  const sprinter = sprintState.units[0];
  setMovementRequest(sprinter, 'sprint', 'ai_override', 'sprint');
  sprinter.order = createMoveOrder({ x: 100.5, y: 2.5 }, { source: 'ai' });
  tickSimulation(sprintState, 0.5);
  const sprintStimulus = buildPerceptionStimuli(sprintState).find((item) => item.sourceUnitId === sprinter.id);
  assert.ok(sprintStimulus);
  assert.equal(sprintStimulus.movement, 'running');

  const stealthState = makeState();
  const stealth = stealthState.units[0];
  setMovementRequest(stealth, 'stealth_move', 'player_order', 'walk');
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
  assert.ok(stealthSignal.evidencePerSecond < runningSignal.evidencePerSecond);
}

function verifyMovementSoundDoesNotDowngradeVisualContact(): void {
  const state = makeCombatState();
  const observer = state.units[0];
  const target = state.units[1];
  target.position = { x: 8.5, y: 2.5 };
  observer.viewRangeCells = 100;
  observer.attentionSettings.vision.maximumVisualRangeMeters = 100;
  for (const profile of Object.values(observer.attentionSettings.profiles)) {
    profile.focusAngleDegrees = 180;
    profile.directAngleDegrees = 360;
    profile.focusWeight = 1;
    profile.directWeight = 1;
    profile.peripheralWeight = 1;
    profile.focusCheckIntervalSeconds = 0.05;
    profile.directCheckIntervalSeconds = 0.05;
    profile.peripheralCheckIntervalSeconds = 0.05;
    profile.rearCheckIntervalSeconds = 0.05;
  }
  observer.attentionRuntime.nextFocusCheckSeconds = 0;
  observer.attentionRuntime.nextDirectCheckSeconds = 0;
  observer.attentionRuntime.nextPeripheralCheckSeconds = 0;
  observer.attentionRuntime.nextRearCheckSeconds = 0;
  installIdentifiedContact(observer, target, state.simulationTimeSeconds);
  setMovementRequest(target, 'normal_walk', 'player_order', 'walk');
  target.order = createMoveOrder({ x: 3.5, y: 2.5 }, { source: 'player' });
  for (let index = 0; index < 30; index += 1) tickSimulation(state, 0.1);
  assert.ok(target.movementRuntime.emittedSoundCount > 0);
  const contact = observer.perceptionKnowledge.contacts.find((item) => item.sourceUnitId === target.id);
  assert.ok(contact);
  assert.equal(contact.source, 'visual');
  assert.equal(contact.visibleNow, true);
  assert.ok(Math.hypot(contact.lastKnownPosition.x - target.position.x, contact.lastKnownPosition.y - target.position.y) < 0.001);
}

function verifyWeaponPreparationLifecycle(): void {
  const state = armedMovingState();
  const shooter = state.units[0];
  const target = state.units[1];
  const contactId = shooter.perceptionKnowledge.contacts[0].id;
  assert.equal(requestFireAction(state, shooter, contactId), false, 'sprint must create pending preparation');
  const first = getMovementWeaponPreparation(shooter);
  assert.ok(first);
  assert.equal(first.contactId, contactId);
  assert.ok(shooter.order, 'preparation must preserve active order');

  shooter.perceptionKnowledge.contacts = [];
  reconcilePendingFireIntent(state, shooter);
  assert.equal(getMovementWeaponPreparation(shooter), null, 'target disappearance must cancel pending preparation');

  installIdentifiedContact(shooter, target, state.simulationTimeSeconds);
  assert.equal(requestFireAction(state, shooter, contactId), false);
  assert.equal(cancelPendingFireIntent(shooter, contactId), true, 'explicit intent cancellation must clear pending preparation');
  const stepAfterCancel = preparePhysicalMovementStep(state, shooter, 0.1, true, 1, 1);
  assert.ok(stepAfterCancel.maxDistanceCells > 0, 'cancelled fire intent must not block the existing movement order');

  assert.equal(requestFireAction(state, shooter, contactId), false);
  const stale = getMovementWeaponPreparation(shooter);
  assert.ok(stale);
  shooter.movementRuntime.weaponPreparationRevision += 1;
  shooter.movementRuntime.weaponPreparation = {
    ownerToken: 'fire-intent:newer-contact',
    contactId: 'newer-contact',
    orderIssuedAtMs: shooter.order?.issuedAtMs ?? null,
    remainingSeconds: 1,
    revision: shooter.movementRuntime.weaponPreparationRevision,
  };
  assert.equal(cancelMovementWeaponPreparation(shooter, { ownerToken: stale.ownerToken, revision: stale.revision }), false, 'stale cleanup must not cancel newer preparation');
  assert.equal(getMovementWeaponPreparation(shooter)?.contactId, 'newer-contact');

  shooter.movementRuntime.weaponPreparation = null;
  installIdentifiedContact(shooter, target, state.simulationTimeSeconds);
  assert.equal(requestFireAction(state, shooter, contactId), false);
  const unattended = getMovementWeaponPreparation(shooter);
  assert.ok(unattended);
  const resumedWithoutRepeat = preparePhysicalMovementStep(
    state, shooter, unattended.remainingSeconds + 0.2, true, 1, 1,
  );
  assert.equal(getMovementWeaponPreparation(shooter), null, 'preparation must clear deterministically without a repeated fire request');
  assert.ok(resumedWithoutRepeat.maxDistanceCells > 0, 'movement must resume during time remaining after preparation completes');

  installIdentifiedContact(shooter, target, state.simulationTimeSeconds);
  assert.equal(requestFireAction(state, shooter, contactId), false);
  shooter.order = createMoveOrder({ x: 30.5, y: 2.5 }, { source: 'player' });
  reconcilePendingFireIntent(state, shooter);
  assert.equal(getMovementWeaponPreparation(shooter), null, 'a newer movement order must invalidate stale fire preparation');
}

function verifyWeaponPreparationRemainingSerialization(): void {
  const state = armedMovingState();
  const shooter = state.units[0];
  const contactId = shooter.perceptionKnowledge.contacts[0].id;
  assert.equal(requestFireAction(state, shooter, contactId), false);
  const initial = getMovementWeaponPreparation(shooter);
  assert.ok(initial && initial.remainingSeconds > 0);
  preparePhysicalMovementStep(state, shooter, 0.25, true, 1, 1);
  const partiallyElapsed = getMovementWeaponPreparation(shooter);
  assert.ok(partiallyElapsed && partiallyElapsed.remainingSeconds < initial.remainingSeconds);

  const exported = buildExportedScene(state);
  const rawRuntime = (exported.units[0].runtime as { movement: Record<string, unknown> }).movement;
  assert.equal('weaponReadyAtSeconds' in rawRuntime, false, 'absolute simulation timestamp must not be serialized');
  const parsed = normalizeImportedScene(JSON.parse(JSON.stringify(exported)));
  const restored = createInitialState(parsed.map, parsed.units, parsed.pressureZones);
  restored.movementProfiles = createMovementProfileRegistry(parsed.movementProfiles);
  const restoredShooter = restored.units[0];
  setFireAllowed(restored, true);
  const restoredPending = getMovementWeaponPreparation(restoredShooter);
  assert.ok(restoredPending);
  assert.ok(Math.abs(restoredPending.remainingSeconds - partiallyElapsed.remainingSeconds) < 1e-9, 'load must preserve only remaining preparation duration');
  assert.equal(requestFireAction(restored, restoredShooter, contactId), false, 'remaining wait must continue after load');
  preparePhysicalMovementStep(restored, restoredShooter, restoredPending.remainingSeconds + 0.01, true, 1, 1);
  assert.equal(requestFireAction(restored, restoredShooter, contactId), true, 'fire must resume after only the remaining duration');
  assert.ok(getFireAction(restoredShooter));

  const legacyAbsolute = createMovementRuntime('sprint', 'sprint', {
    requestedProfileId: 'sprint',
    requestedGait: 'sprint',
    weaponStopRequested: true,
    weaponReadyAtSeconds: 9999,
  });
  assert.equal(legacyAbsolute.weaponPreparation, null, 'legacy absolute readiness timestamps must not survive normalization');
  assert.equal(legacyAbsolute.migrationInfo?.reason, 'runtime_normalization');
}

function verifyLegacyAndCustomProfileSerialization(): void {
  const legacy = createInitialState(mapData(), [{ ...unitData(), movementProfileId: 'assault', movementProfileSource: 'unit' }]);
  const legacyUnit = legacy.units[0];
  assert.equal(legacyUnit.movementRuntime.requestedProfileId, 'run');
  assert.equal(legacyUnit.movementRuntime.requestedProfileSource, 'unit_role');
  assert.equal(legacyUnit.movementRuntime.migrationInfo?.reason, 'legacy_alias');

  const normal = resolveMovementProfile(legacy.movementProfiles, 'normal_walk');
  const custom = {
    ...normal,
    id: 'custom_patrol',
    nameEn: 'Custom patrol',
    nameRu: 'Пользовательский патруль',
    builtIn: false,
    revision: 7,
    settings: {
      ...normal.settings,
      speed: { ...normal.settings.speed, speedMultiplier: 0.77 },
      stamina: { ...normal.settings.stamina, recoveryPerSecond: 9 },
      visibility: { ...normal.settings.visibility, stealthSkillShare: 0.61 },
      noise: { ...normal.settings.noise, eventSpacingMeters: 2.7 },
      attention: { ...normal.settings.attention, scanSpeedMultiplier: 1.2 },
      weapon: { ...normal.settings.weapon, readyDelayAfterStopSeconds: 0.42 },
      restrictions: { ...normal.settings.restrictions, maximumSuppressionPercent: 72 },
      surface: { ...normal.settings.surface, materialSpeedMultiplier: 0.91 },
    },
  };
  assert.ok(upsertMovementProfile(legacy.movementProfiles, custom));
  setMovementProfileRequest(legacy, legacyUnit, 'custom_patrol', 'unit_role');
  legacyUnit.movementRuntime.stamina = 63;
  const exported = buildExportedScene(legacy);
  const parsed = normalizeImportedScene(JSON.parse(JSON.stringify(exported)));
  const restored = createInitialState(parsed.map, parsed.units, parsed.pressureZones);
  restored.movementProfiles = createMovementProfileRegistry(parsed.movementProfiles);
  assert.equal(restored.units[0].movementRuntime.requestedProfileId, 'custom_patrol');
  assert.equal(restored.units[0].movementRuntime.stamina, 63);
  const restoredProfile = resolveMovementProfile(restored.movementProfiles, 'custom_patrol');
  assert.equal(restoredProfile.settings.speed.speedMultiplier, 0.77);
  assert.equal(restoredProfile.settings.weapon.readyDelayAfterStopSeconds, 0.42);
  assert.equal(restoredProfile.settings.surface.materialSpeedMultiplier, 0.91);
}

function verifyMaterialProviderBoundary(): void {
  const legacyState = makeState();
  const legacyUnit = legacyState.units[0];
  setMovementProfileRequest(legacyState, legacyUnit, 'normal_walk', 'default');
  legacyUnit.order = createMoveOrder({ x: 100.5, y: 2.5 }, { source: 'player' });
  tickSimulation(legacyState, 0.2);
  assert.equal(legacyUnit.movementRuntime.diagnostics.materialSource, 'legacy_fallback');

  const providerState = makeState();
  const providerUnit = providerState.units[0];
  providerState.movementMaterialProfileProvider = () => ({
    passable: true,
    speedMultiplier: 0.5,
    noiseMultiplier: 1.4,
    visibilityMultiplier: 1.2,
  });
  setMovementProfileRequest(providerState, providerUnit, 'normal_walk', 'default');
  providerUnit.order = createMoveOrder({ x: 100.5, y: 2.5 }, { source: 'player' });
  tickSimulation(providerState, 0.2);
  assert.equal(providerUnit.movementRuntime.diagnostics.materialSource, 'material_profile_provider');
  assert.equal(providerUnit.movementRuntime.diagnostics.surfaceMultiplier, 0.5);
  assert.ok(providerUnit.movementRuntime.diagnostics.noiseLoudness > resolveMovementProfile(providerState.movementProfiles, 'normal_walk').settings.noise.loudness);
}

function verifySelectionIndependence(): void {
  const left = makeCombatState();
  const right = makeCombatState();
  left.selectedUnitId = left.units[0].id;
  left.selectedUnitIds = [left.units[0].id];
  right.selectedUnitId = null;
  right.selectedUnitIds = [];
  for (const state of [left, right]) {
    setMovementRequest(state.units[0], 'run', 'player_order', 'run');
    state.units[0].order = createMoveOrder({ x: 100.5, y: 2.5 }, { source: 'player' });
    for (let index = 0; index < 10; index += 1) tickSimulation(state, 0.1);
  }
  assert.deepEqual(left.units[0].position, right.units[0].position);
  assert.equal(left.units[0].movementRuntime.stamina, right.units[0].movementRuntime.stamina);
  assert.deepEqual(left.units[1].perceptionKnowledge, right.units[1].perceptionKnowledge);
}

function verifyRouteReplanKeepsMovementProfile(): void {
  const state = makeState();
  const unit = state.units[0];
  setMovementRequest(unit, 'stealth_move', 'player_order', 'walk');
  const planned = planMoveOrder(state.map, unit.position, { x: 30.5, y: 2.5 }, { source: 'player' });
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  unit.order = planned.order;
  state.map.objects.push({
    id: 'new-blocker', kind: 'structure', x: 4, y: 2, rotationRadians: 0,
    widthCells: 0.9, heightCells: 0.9, labels: null,
  });
  tickSimulation(state, 0.1);
  assert.equal(unit.movementRuntime.requestedProfileId, 'stealth_move');
  assert.equal(unit.movementRuntime.requestedGait, 'walk');
  assert.ok(unit.order);
  assert.ok((unit.order.replanCount ?? 0) >= 1 || unit.order.routeStatus === 'replanned');
}

function armedMovingState(): SimulationState {
  const state = makeCombatState();
  const shooter = state.units[0];
  const target = state.units[1];
  setMovementRequest(shooter, 'sprint', 'player_order', 'sprint');
  shooter.order = createMoveOrder({ x: 100.5, y: 2.5 }, { source: 'player' });
  tickSimulation(state, 0.5);
  installIdentifiedContact(shooter, target, state.simulationTimeSeconds);
  setFireAllowed(state, true);
  return state;
}

function movedDistance(profileId: string, gait: MovementGait, seconds: number): number {
  return movementScenario(profileId, gait, Array.from({ length: Math.round(seconds * 10) }, () => 0.1)).distance;
}

function movementScenario(profileId: string, gait: MovementGait, deltas: number[], initialStamina = 100) {
  const state = makeState();
  const unit = state.units[0];
  const start = { ...unit.position };
  setMovementRequest(unit, profileId, 'player_order', gait);
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
