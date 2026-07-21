import assert from 'node:assert/strict';
import {
  cancelWeaponReload,
  getWeaponReloadDiagnostics,
  isWeaponReloadRunning,
  requestWeaponReload,
} from '../src/core/actions/WeaponReload';
import { requestPostureTransition } from '../src/core/actions/PostureTransition';
import { replaceCombatRuntime } from '../src/core/combat/CombatDamage';
import { getFireAction, requestFireAction } from '../src/core/combat/FireAction';
import {
  DEFAULT_RIFLE_ID,
  getWeaponDefinition,
  getWeaponRuntime,
  reloadWeapon,
  replaceWeaponRuntime,
} from '../src/core/combat/WeaponModel';
import type { TacticalMapData } from '../src/core/map/MapModel';
import { createMoveOrder } from '../src/core/orders/MoveOrder';
import { tickAllUnitPerception } from '../src/core/perception/PerceptionSystem';
import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';
import { tickSimulation } from '../src/core/simulation/SimulationTick';
import type { UnitData, UnitModel } from '../src/core/units/UnitModel';
import { buildExportedScene, normalizeImportedScene } from '../src/ui/SceneExport';

verifyTimedTransferAndCapacity();
verifyStartRejectionsAndOwnership();
verifyCancellationAndCapabilityLoss();
verifyPostureConflict();
verifyFireConflict();
verifyMovementBudgetAndStepPartition();
verifySaveRestoreAndExactlyOnceCompletion();
verifyLegacyApiAndDerivedFields();
verifyDamagedStateNormalization();

console.log('Physical reload smoke passed: timed transfer, canonical ammo, ownership, conflicts, movement budget, deterministic stepping, save/restore and damaged-state normalization.');

function verifyTimedTransferAndCapacity(): void {
  const definition = getWeaponDefinition(DEFAULT_RIFLE_ID);
  const state = makeState(0, 20);
  const unit = state.units[0];
  const before = totalRounds(unit);
  const start = startReload(state, unit, 'timed-owner');
  assert.equal(start.accepted, true);
  assert.equal(start.reasonCode, 'reload_started');
  assert.equal(unit.behaviorRuntime.physicalAction?.type, 'weapon_reload');
  assert.equal(getWeaponRuntime(unit).roundsLoaded, 0, 'reload start must not transfer rounds');
  assert.equal(getWeaponRuntime(unit).roundsReserve, 20);
  assert.equal(getWeaponRuntime(unit).ready, false);

  tickSimulation(state, definition.reloadTimeSeconds - 0.01);
  assert.equal(getWeaponRuntime(unit).roundsLoaded, 0, 'rounds must stay in reserve before completion');
  assert.equal(getWeaponRuntime(unit).roundsReserve, 20);
  assert.equal(isWeaponReloadRunning(unit), true);

  tickSimulation(state, 0.01);
  assert.equal(unit.behaviorRuntime.physicalAction?.status, 'completed');
  assert.equal(getWeaponRuntime(unit).roundsLoaded, definition.magazineCapacity);
  assert.equal(getWeaponRuntime(unit).roundsReserve, 20 - definition.magazineCapacity);
  assert.equal(totalRounds(unit), before);
  assert.equal(getWeaponRuntime(unit).ready, true);
  assert.equal((unit.behaviorRuntime.physicalAction as { transferredRounds?: number }).transferredRounds, definition.magazineCapacity);

  const partial = makeState(definition.magazineCapacity - 2, 50);
  const partialUnit = partial.units[0];
  const partialBefore = totalRounds(partialUnit);
  startReload(partial, partialUnit, 'capacity-owner');
  tickSimulation(partial, definition.reloadTimeSeconds);
  assert.equal(getWeaponRuntime(partialUnit).roundsLoaded, definition.magazineCapacity);
  assert.equal(getWeaponRuntime(partialUnit).roundsReserve, 48);
  assert.equal(totalRounds(partialUnit), partialBefore);
  assert.ok(getWeaponRuntime(partialUnit).roundsReserve >= 0);

  const noReserve = makeState(1, 0);
  assert.equal(startReload(noReserve, noReserve.units[0], 'no-reserve').reasonCode, 'reload_no_reserve');
  assert.equal(isWeaponReloadRunning(noReserve.units[0]), false);

  const full = makeState(definition.magazineCapacity, 10);
  assert.equal(startReload(full, full.units[0], 'full-magazine').reasonCode, 'reload_not_required');
  assert.equal(isWeaponReloadRunning(full.units[0]), false);
}

function verifyStartRejectionsAndOwnership(): void {
  const state = makeState(2, 18);
  const unit = state.units[0];
  const first = startReload(state, unit, 'same-owner');
  const firstId = unit.behaviorRuntime.physicalAction?.id;
  const duplicate = startReload(state, unit, 'same-owner');
  assert.equal(first.accepted, true);
  assert.equal(duplicate.accepted, true);
  assert.equal(duplicate.reasonCode, 'reload_already_running');
  assert.equal(unit.behaviorRuntime.physicalAction?.id, firstId);

  const foreignStart = startReload(state, unit, 'foreign-owner');
  assert.equal(foreignStart.accepted, false);
  assert.equal(foreignStart.reasonCode, 'reload_owned_by_other');
  assert.equal(unit.behaviorRuntime.physicalAction?.ownerToken, 'same-owner');

  const foreignCancel = cancelWeaponReload(unit, 'foreign-owner');
  assert.equal(foreignCancel.accepted, false);
  assert.equal(foreignCancel.reasonCode, 'reload_cancel_denied_owner');
  assert.equal(isWeaponReloadRunning(unit), true);
}

function verifyCancellationAndCapabilityLoss(): void {
  const cancelledState = makeState(1, 9);
  const cancelledUnit = cancelledState.units[0];
  const cancelledBefore = snapshotAmmo(cancelledUnit);
  startReload(cancelledState, cancelledUnit, 'cancel-owner');
  tickSimulation(cancelledState, 0.5);
  const cancellation = cancelWeaponReload(
    cancelledUnit,
    'cancel-owner',
    'reload_cancelled',
    'Владелец отменил физическую перезарядку.',
  );
  assert.equal(cancellation.accepted, true);
  assert.equal(cancelledUnit.behaviorRuntime.physicalAction?.status, 'cancelled');
  assert.deepEqual(snapshotAmmo(cancelledUnit), cancelledBefore);
  assert.equal((cancelledUnit.behaviorRuntime.physicalAction as { transferredRounds?: number }).transferredRounds, 0);

  const capabilityState = makeState(1, 9);
  const capabilityUnit = capabilityState.units[0];
  const capabilityBefore = snapshotAmmo(capabilityUnit);
  startReload(capabilityState, capabilityUnit, 'capability-owner');
  replaceCombatRuntime(capabilityUnit, { capability: 'incapacitated', lastHit: null });
  tickSimulation(capabilityState, 0.1);
  assert.equal(capabilityUnit.behaviorRuntime.physicalAction?.status, 'cancelled');
  assert.equal(capabilityUnit.behaviorRuntime.physicalAction?.resultCode, 'reload_combat_capability_lost');
  assert.deepEqual(snapshotAmmo(capabilityUnit), capabilityBefore);
}

function verifyPostureConflict(): void {
  const postureFirst = makeState(1, 9);
  const postureUnit = postureFirst.units[0];
  const posture = requestPostureTransition(postureUnit, {
    targetPosture: 'crouched',
    owner: { source: 'test', id: 'posture-owner' },
    ownerToken: 'posture-owner',
    startedSeconds: postureFirst.simulationTimeSeconds,
    reasonCode: 'test_posture',
    reasonRu: 'Тестовая смена позы.',
  });
  assert.equal(posture.accepted, true);
  assert.equal(startReload(postureFirst, postureUnit, 'reload-owner').reasonCode, 'reload_physical_action_conflict');

  const reloadFirst = makeState(1, 9);
  const reloadUnit = reloadFirst.units[0];
  startReload(reloadFirst, reloadUnit, 'reload-owner');
  const blockedPosture = requestPostureTransition(reloadUnit, {
    targetPosture: 'crouched',
    owner: { source: 'test', id: 'posture-owner' },
    ownerToken: 'posture-owner',
    startedSeconds: reloadFirst.simulationTimeSeconds,
    reasonCode: 'test_posture',
    reasonRu: 'Тестовая смена позы.',
  });
  assert.equal(blockedPosture.accepted, false);
  assert.equal(blockedPosture.reasonCode, 'posture_transition_physical_action_conflict');
}

function verifyFireConflict(): void {
  const fireFirst = makeState(1, 9);
  const fireUnit = fireFirst.units[0];
  const contactId = revealEnemy(fireFirst, fireUnit);
  assert.equal(requestFireAction(fireFirst, fireUnit, contactId), true);
  assert.ok(getFireAction(fireUnit));
  const blockedReload = startReload(fireFirst, fireUnit, 'reload-owner');
  assert.equal(blockedReload.accepted, false);
  assert.equal(blockedReload.reasonCode, 'reload_fire_action_conflict');

  const reloadFirst = makeState(1, 9);
  const reloadUnit = reloadFirst.units[0];
  const reloadContactId = revealEnemy(reloadFirst, reloadUnit);
  startReload(reloadFirst, reloadUnit, 'reload-owner');
  assert.equal(requestFireAction(reloadFirst, reloadUnit, reloadContactId), false);
  assert.equal(getFireAction(reloadUnit), null);
  assert.match(reloadUnit.behaviorRuntime.reason, /перезарядк/i);
}

function verifyMovementBudgetAndStepPartition(): void {
  const definition = getWeaponDefinition(DEFAULT_RIFLE_ID);
  const state = makeState(1, 9);
  const unit = state.units[0];
  unit.order = createMoveOrder({ x: 20.5, y: 3.5 }, { source: 'player', ownerToken: 'move-owner' });
  const startPosition = { ...unit.position };
  startReload(state, unit, 'move-reload-owner');
  tickSimulation(state, definition.reloadTimeSeconds / 2);
  assert.deepEqual(unit.position, startPosition);
  assert.ok(unit.order, 'route is retained while reload owns the body');
  tickSimulation(state, definition.reloadTimeSeconds / 2 + 0.5);
  assert.equal(unit.behaviorRuntime.physicalAction?.status, 'completed');
  assert.ok(unit.position.x > startPosition.x, 'only post-reload remainder may move');

  const coarse = runReloadWithRoute([definition.reloadTimeSeconds + 0.8]);
  const fineDeltas = Array.from(
    { length: Math.round((definition.reloadTimeSeconds + 0.8) / 0.05) },
    () => 0.05,
  );
  const fine = runReloadWithRoute(fineDeltas);
  assert.deepEqual(coarse.ammo, fine.ammo);
  assert.equal(coarse.status, fine.status);
  assert.ok(approximately(coarse.position.x, fine.position.x, 1e-6));
  assert.ok(approximately(coarse.position.y, fine.position.y, 1e-6));
}

function verifySaveRestoreAndExactlyOnceCompletion(): void {
  const duration = getWeaponDefinition(DEFAULT_RIFLE_ID).reloadTimeSeconds;
  for (const elapsed of [0, duration / 2, duration - 0.01]) {
    const state = makeState(1, 9);
    const unit = state.units[0];
    startReload(state, unit, 'save-owner');
    if (elapsed > 0) tickSimulation(state, elapsed);
    const beforeAction = JSON.parse(JSON.stringify(unit.behaviorRuntime.physicalAction));
    const beforeAmmo = snapshotAmmo(unit);
    const restored = restoreScene(state);
    const restoredUnit = restored.units[0];
    assert.deepEqual(restoredUnit.behaviorRuntime.physicalAction, beforeAction);
    assert.deepEqual(snapshotAmmo(restoredUnit), beforeAmmo);
    assert.equal(restoredUnit.behaviorRuntime.physicalAction?.ownerToken, 'save-owner');
  }

  const state = makeState(1, 9);
  const unit = state.units[0];
  startReload(state, unit, 'save-owner');
  tickSimulation(state, duration / 2);
  const restored = restoreScene(state);
  const restoredUnit = restored.units[0];
  const action = restoredUnit.behaviorRuntime.physicalAction;
  assert.ok(action?.type === 'weapon_reload');
  tickSimulation(restored, (1 - action.progress) * action.durationSeconds);
  const completedAmmo = snapshotAmmo(restoredUnit);
  const completedEvent = restoredUnit.behaviorRuntime.lastEvent;
  tickSimulation(restored, 1);
  assert.deepEqual(snapshotAmmo(restoredUnit), completedAmmo);
  assert.equal(restoredUnit.behaviorRuntime.lastEvent, completedEvent);

  const cancelled = makeState(1, 9);
  const cancelledUnit = cancelled.units[0];
  startReload(cancelled, cancelledUnit, 'save-owner');
  tickSimulation(cancelled, duration / 2);
  cancelWeaponReload(cancelledUnit, 'save-owner');
  const restoredCancelled = restoreScene(cancelled);
  assert.equal(restoredCancelled.units[0].behaviorRuntime.physicalAction?.status, 'cancelled');
  assert.deepEqual(snapshotAmmo(restoredCancelled.units[0]), snapshotAmmo(cancelledUnit));
}

function verifyLegacyApiAndDerivedFields(): void {
  const state = makeState(0, 7);
  const unit = state.units[0];
  const before = totalRounds(unit);
  const result = reloadWeapon(unit, {
    owner: { source: 'system', id: 'legacy-reload-api' },
    ownerToken: 'legacy-reload-api',
    startedSeconds: state.simulationTimeSeconds,
    reasonCode: 'legacy_reload_requested',
    reasonRu: 'Старый API запросил физическую перезарядку.',
  });
  assert.equal(result.accepted, true);
  assert.equal(getWeaponRuntime(unit).roundsLoaded, 0);
  assert.equal(totalRounds(unit), before);
  assertLegacyFields(unit);
  tickSimulation(state, getWeaponDefinition(DEFAULT_RIFLE_ID).reloadTimeSeconds);
  assert.equal(totalRounds(unit), before);
  assert.equal(getWeaponRuntime(unit).roundsLoaded, 5);
  assert.equal(getWeaponRuntime(unit).roundsReserve, 2);
  assertLegacyFields(unit);
}

function verifyDamagedStateNormalization(): void {
  const definition = getWeaponDefinition(DEFAULT_RIFLE_ID);
  const corrupted = createInitialState(mapData(), [{
    ...unitData('blue-reload', 'blue', 1, 3),
    runtime: {
      ammo: 999,
      weaponReady: true,
      weapon: {
        weaponId: DEFAULT_RIFLE_ID,
        roundsLoaded: definition.magazineCapacity + 20,
        roundsReserve: -50,
        ready: true,
        currentRecoil: -2,
        nextAllowedShotSeconds: -10,
      },
      physicalAction: {
        schemaVersion: 1,
        id: 'corrupted-reload',
        sequence: 7,
        type: 'weapon_reload',
        owner: { source: 'test', id: 'corrupt-owner' },
        ownerToken: 'corrupt-owner',
        weaponId: 'unknown-weapon',
        startedSeconds: -4,
        durationSeconds: -8,
        progress: 1,
        status: 'running',
        roundsLoadedAtStart: -3,
        roundsReserveAtStart: -4,
        maximumTransferRounds: 999,
        transferredRounds: 999,
        reasonCode: 'corrupted',
        reasonRu: 'Повреждённое действие.',
        resultCode: null,
        resultRu: null,
      },
    },
  } as UnitData]);
  const unit = corrupted.units[0];
  const weapon = getWeaponRuntime(unit);
  assert.ok(weapon.roundsLoaded >= 0 && weapon.roundsLoaded <= definition.magazineCapacity);
  assert.ok(weapon.roundsReserve >= 0);
  assertLegacyFields(unit);
  assert.equal(unit.behaviorRuntime.physicalAction?.type, 'weapon_reload');
  assert.equal(unit.behaviorRuntime.physicalAction?.status, 'failed');
  assert.equal(unit.behaviorRuntime.physicalAction?.resultCode, 'reload_weapon_mismatch_normalized');
  const diagnostics = getWeaponReloadDiagnostics(unit);
  assert.equal(diagnostics.running, false);
  assert.equal(diagnostics.normalizationCode, 'reload_weapon_mismatch_normalized');
}

function runReloadWithRoute(deltas: readonly number[]) {
  const state = makeState(1, 9);
  const unit = state.units[0];
  unit.order = createMoveOrder({ x: 20.5, y: 3.5 }, { source: 'player', ownerToken: 'move-owner' });
  startReload(state, unit, 'partition-owner');
  for (const delta of deltas) tickSimulation(state, delta);
  return {
    ammo: snapshotAmmo(unit),
    status: unit.behaviorRuntime.physicalAction?.status,
    position: { ...unit.position },
  };
}

function startReload(state: SimulationState, unit: UnitModel, ownerToken: string) {
  return requestWeaponReload(unit, {
    owner: { source: 'test', id: ownerToken },
    ownerToken,
    startedSeconds: state.simulationTimeSeconds,
    reasonCode: 'test_reload_requested',
    reasonRu: 'Тестовая физическая перезарядка.',
  });
}

function revealEnemy(state: SimulationState, unit: UnitModel): string {
  for (let index = 0; index < 80; index += 1) {
    state.simulationTimeSeconds += 0.1;
    tickAllUnitPerception(state, 0.1);
  }
  const contact = unit.perceptionKnowledge.contacts.find((candidate) => candidate.sourceUnitId === 'red-reload');
  assert.ok(contact, 'fire conflict fixture requires a visible hostile contact');
  return contact.id;
}

function restoreScene(state: SimulationState): SimulationState {
  const exported = buildExportedScene(state);
  const normalized = normalizeImportedScene(exported);
  return createInitialState(normalized.map, normalized.units, normalized.pressureZones);
}

function makeState(roundsLoaded: number, roundsReserve: number): SimulationState {
  const state = createInitialState(mapData(), [
    unitData('blue-reload', 'blue', 1, 3),
    unitData('red-reload', 'red', 8, 3),
  ]);
  replaceWeaponRuntime(state.units[0], {
    weaponId: DEFAULT_RIFLE_ID,
    roundsLoaded,
    roundsReserve,
    ready: roundsLoaded > 0,
    currentRecoil: 0,
    nextAllowedShotSeconds: 0,
  });
  return state;
}

function unitData(id: string, side: UnitData['side'], x: number, y: number): UnitData {
  return {
    id,
    label: id,
    labelRu: id,
    type: 'infantry_squad',
    side,
    aiControl: 'manual',
    x,
    y,
    speedCellsPerSecond: 4,
    facingDegrees: side === 'red' ? 180 : 0,
    viewRangeCells: 20,
    initialState: { posture: 'standing' },
  };
}

function mapData(): TacticalMapData {
  return {
    width: 32,
    height: 8,
    cellSize: 16,
    metersPerCell: 2,
    runtimeMetersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: [],
  };
}

function snapshotAmmo(unit: UnitModel) {
  const weapon = getWeaponRuntime(unit);
  return { roundsLoaded: weapon.roundsLoaded, roundsReserve: weapon.roundsReserve };
}

function totalRounds(unit: UnitModel): number {
  const weapon = getWeaponRuntime(unit);
  return weapon.roundsLoaded + weapon.roundsReserve;
}

function assertLegacyFields(unit: UnitModel): void {
  const weapon = getWeaponRuntime(unit);
  assert.equal(unit.behaviorRuntime.ammo, weapon.roundsLoaded + weapon.roundsReserve);
  assert.equal(unit.behaviorRuntime.weaponReady, weapon.ready && weapon.roundsLoaded > 0);
}

function approximately(left: number, right: number, epsilon = 1e-9): boolean {
  return Math.abs(left - right) <= epsilon;
}
