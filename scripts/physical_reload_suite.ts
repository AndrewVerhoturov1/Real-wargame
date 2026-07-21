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

verifyReloadIsTimedAndTransfersOnlyAtCompletion();
verifyTransferBoundsAndAmmoInvariant();
verifyStartRejectionsAndDuplicateOwnership();
verifyOwnerCancellationAndForeignDenial();
verifyCombatCapabilityLossCancelsWithoutTransfer();
verifyPostureAndReloadConflictSymmetrically();
verifyFireAndReloadConflictSymmetrically();
verifyMovementPausesAndUsesOnlyTickRemainder();
verifyStepPartitionInvariance();
verifySaveRestoreAndExactlyOnceCompletion();
verifyLegacyReloadCannotCreateRounds();
verifyLegacyFieldsAreDerived();
verifyCorruptedReloadNormalization();

console.log('Physical reload smoke passed: timed transfer, canonical ammo, ownership, conflicts, movement budget, deterministic stepping, save/restore and damaged-state normalization.');

function verifyReloadIsTimedAndTransfersOnlyAtCompletion(): void {
  const state = makeState(5, 20);
  const unit = state.units[0];
  const totalBefore = totalRounds(unit);
  const result = startReload(state, unit, 'reload-owner');
  assert.equal(result.accepted, true);
  assert.equal(result.reasonCode, 'reload_started');
  assert.equal(isWeaponReloadRunning(unit), true);
  assert.equal(unit.behaviorRuntime.physicalAction?.type, 'weapon_reload');
  assert.equal(getWeaponRuntime(unit).roundsLoaded, 5, 'reload start must not move ammunition');
  assert.equal(getWeaponRuntime(unit).roundsReserve, 20);
  assert.equal(totalRounds(unit), totalBefore);
  assert.equal(getWeaponRuntime(unit).ready, false);

  const duration = getWeaponDefinition(DEFAULT_RIFLE_ID).reloadTimeSeconds;
  tickSimulation(state, duration - 0.01);
  assert.equal(getWeaponRuntime(unit).roundsLoaded, 5, 'ammunition must not move before completion');
  assert.equal(getWeaponRuntime(unit).roundsReserve, 20);
  assert.equal(isWeaponReloadRunning(unit), true);

  tickSimulation(state, 0.01);
  assert.equal(unit.behaviorRuntime.physicalAction?.status, 'completed');
  assert.equal(getWeaponRuntime(unit).roundsLoaded, 25);
  assert.equal(getWeaponRuntime(unit).roundsReserve, 0);
  assert.equal(totalRounds(unit), totalBefore);
  assert.equal(getWeaponRuntime(unit).ready, true);
  assert.equal(unit.behaviorRuntime.physicalAction?.resultCode, 'reload_completed');
  assert.equal((unit.behaviorRuntime.physicalAction as { transferredRounds?: number }).transferredRounds, 20);
}

function verifyTransferBoundsAndAmmoInvariant(): void {
  const capacity = getWeaponDefinition(DEFAULT_RIFLE_ID).magazineCapacity;
  const state = makeState(capacity - 2, 50);
  const unit = state.units[0];
  const before = totalRounds(unit);
  startReload(state, unit, 'bounds-owner');
  tickSimulation(state, getWeaponDefinition(DEFAULT_RIFLE_ID).reloadTimeSeconds);
  const weapon = getWeaponRuntime(unit);
  assert.equal(weapon.roundsLoaded, capacity, 'magazine must not exceed capacity');
  assert.equal(weapon.roundsReserve, 48, 'only the available magazine space is transferred');
  assert.ok(weapon.roundsReserve >= 0);
  assert.equal(totalRounds(unit), before);

  const emptyReserve = makeState(1, 0);
  assert.equal(startReload(emptyReserve, emptyReserve.units[0], 'no-reserve').reasonCode, 'reload_no_reserve');
  assert.equal(isWeaponReloadRunning(emptyReserve.units[0]), false);

  const fullMagazine = makeState(capacity, 10);
  assert.equal(startReload(fullMagazine, fullMagazine.units[0], 'full-magazine').reasonCode, 'reload_not_required');
  assert.equal(isWeaponReloadRunning(fullMagazine.units[0]), false);
}

function verifyStartRejectionsAndDuplicateOwnership(): void {
  const state = makeState(2, 18);
  const unit = state.units[0];
  const first = startReload(state, unit, 'same-owner');
  const firstId = unit.behaviorRuntime.physicalAction?.id;
  const duplicate = startReload(state, unit, 'same-owner');
  assert.equal(first.accepted, true);
  assert.equal(duplicate.accepted, true);
  assert.equal(duplicate.reasonCode, 'reload_already_running');
  assert.equal(unit.behaviorRuntime.physicalAction?.id, firstId, 'duplicate request must not create a second action');

  const foreign = startReload(state, unit, 'foreign-owner');
  assert.equal(foreign.accepted, false);
  assert.equal(foreign.reasonCode, 'reload_owned_by_other');
  assert.equal(unit.behaviorRuntime.physicalAction?.ownerToken, 'same-owner');
}

function verifyOwnerCancellationAndForeignDenial(): void {
  const state = makeState(4, 16);
  const unit = state.units[0];
  const before = snapshotAmmo(unit);
  startReload(state, unit, 'owner-a');
  tickSimulation(state, 0.5);

  const foreign = cancelWeaponReload(unit, 'owner-b', 'reload_cancelled', 'Чужая отмена.');
  assert.equal(foreign.accepted, false);
  assert.equal(foreign.reasonCode, 'reload_cancel_denied_owner');
  assert.equal(isWeaponReloadRunning(unit), true);

  const own = cancelWeaponReload(unit, 'owner-a', 'reload_cancelled', 'Владелец отменил перезарядку.');
  assert.equal(own.accepted, true);
  assert.equal(unit.behaviorRuntime.physicalAction?.status, 'cancelled');
  assert.deepEqual(snapshotAmmo(unit), before, 'cancellation must not transfer ammunition');
  assert.equal((unit.behaviorRuntime.physicalAction as { transferredRounds?: number }).transferredRounds, 0);
}

function verifyCombatCapabilityLossCancelsWithoutTransfer(): void {
  const state = makeState(3, 12);
  const unit = state.units[0];
  const before = snapshotAmmo(unit);
  startReload(state, unit, 'capability-owner');
  replaceCombatRuntime(unit, { capability: 'incapacitated', lastHit: null });
  tickSimulation(state, 0.1);
  assert.equal(unit.behaviorRuntime.physicalAction?.status, 'cancelled');
  assert.equal(unit.behaviorRuntime.physicalAction?.resultCode, 'reload_combat_capability_lost');
  assert.deepEqual(snapshotAmmo(unit), before);
}

function verifyPostureAndReloadConflictSymmetrically(): void {
  const postureFirst = makeState(3, 12);
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
  const reload = startReload(postureFirst, postureUnit, 'reload-owner');
  assert.equal(reload.accepted, false);
  assert.equal(reload.reasonCode, 'reload_physical_action_conflict');

  const reloadFirst = makeState(3, 12);
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

function verifyFireAndReloadConflictSymmetrically(): void {
  const fireFirst = makeState(3, 12);
  const fireUnit = fireFirst.units[0];
  const contactId = revealEnemy(fireFirst, fireUnit);
  assert.equal(requestFireAction(fireFirst, fireUnit, contactId), true);
  assert.ok(getFireAction(fireUnit));
  const blockedReload = startReload(fireFirst, fireUnit, 'reload-owner');
  assert.equal(blockedReload.accepted, false);
  assert.equal(blockedReload.reasonCode, 'reload_fire_action_conflict');

  const reloadFirst = makeState(3, 12);
  const reloadUnit = reloadFirst.units[0];
  const reloadContactId = revealEnemy(reloadFirst, reloadUnit);
  startReload(reloadFirst, reloadUnit, 'reload-owner');
  assert.equal(requestFireAction(reloadFirst, reloadUnit, reloadContactId), false);
  assert.equal(getFireAction(reloadUnit), null);
  assert.equal(reloadUnit.behaviorRuntime.lastEvent, 'combat_fire_physical_action_conflict');
}

function verifyMovementPausesAndUsesOnlyTickRemainder(): void {
  const state = makeState(2, 20);
  const unit = state.units[0];
  unit.order = createMoveOrder({ x: 20.5, y: 3.5 }, { source: 'player', ownerToken: 'move-owner' });
  startReload(state, unit, 'reload-owner');
  const startPosition = { ...unit.position };
  const duration = getWeaponDefinition(DEFAULT_RIFLE_ID).reloadTimeSeconds;
  tickSimulation(state, duration / 2);
  assert.deepEqual(unit.position, startPosition, 'route must pause during physical reload');
  assert.ok(unit.order, 'route must be retained while reloading');

  tickSimulation(state, duration / 2 + 0.5);
  assert.equal(unit.behaviorRuntime.physicalAction?.status, 'completed');
  assert.ok(unit.position.x > startPosition.x, 'only the post-completion tick remainder may move the unit');
  assert.ok(unit.order, 'unfinished route remains active after reload');
}

function verifyStepPartitionInvariance(): void {
  const duration = getWeaponDefinition(DEFAULT_RIFLE_ID).reloadTimeSeconds;
  const coarse = runReloadWithRoute([duration + 0.8]);
  const fine = runReloadWithRoute(Array.from({ length: Math.round((duration + 0.8) * 20) }, () => 0.05));
  assert.deepEqual(coarse.ammo, fine.ammo);
  assert.equal(coarse.status, fine.status);
  assert.ok(approximately(coarse.position.x, fine.position.x, 1e-6));
  assert.ok(approximately(coarse.position.y, fine.position.y, 1e-6));
}

function verifySaveRestoreAndExactlyOnceCompletion(): void {
  const duration = getWeaponDefinition(DEFAULT_RIFLE_ID).reloadTimeSeconds;
  for (const elapsed of [0, duration / 2, duration - 0.01]) {
    const state = makeState(4, 16);
    const unit = state.units[0];
    startReload(state, unit, 'save-owner');
    if (elapsed > 0) tickSimulation(state, elapsed);
    const beforeAction = JSON.parse(JSON.stringify(unit.behaviorRuntime.physicalAction));
    const beforeAmmo = snapshotAmmo(unit);
    const restored = restoreScene(state);
    const restoredUnit = restored.units[0];
    assert.deepEqual(restoredUnit.behaviorRuntime.physicalAction, beforeAction);
    assert.deepEqual(snapshotAmmo(restoredUnit), beforeAmmo, 'load must not transfer ammunition');
  }

  const middle = makeState(4, 16);
  const middleUnit = middle.units[0];
  startReload(middle, middleUnit, 'save-owner');
  tickSimulation(middle, duration / 2);
  const restored = restoreScene(middle);
  const restoredUnit = restored.units[0];
  const progress = restoredUnit.behaviorRuntime.physicalAction?.progress ?? 0;
  tickSimulation(restored, (1 - progress) * duration);
  const completedAmmo = snapshotAmmo(restoredUnit);
  const completedEvent = restoredUnit.behaviorRuntime.lastEvent;
  tickSimulation(restored, 1);
  assert.deepEqual(snapshotAmmo(restoredUnit), completedAmmo, 'completed reload must not transfer twice');
  assert.equal(restoredUnit.behaviorRuntime.lastEvent, completedEvent, 'completed action must not emit completion twice');

  const cancelled = makeState(4, 16);
  const cancelledUnit = cancelled.units[0];
  startReload(cancelled, cancelledUnit, 'save-owner');
  tickSimulation(cancelled, duration / 2);
  cancelWeaponReload(cancelledUnit, 'save-owner', 'reload_cancelled', 'Отмена до сохранения.');
  const restoredCancelled = restoreScene(cancelled);
  assert.equal(restoredCancelled.units[0].behaviorRuntime.physicalAction?.status, 'cancelled');
  assert.equal(restoredCancelled.units[0].behaviorRuntime.physicalAction?.ownerToken, 'save-owner');
  assert.deepEqual(snapshotAmmo(restoredCancelled.units[0]), snapshotAmmo(cancelledUnit));
}

function verifyLegacyReloadCannotCreateRounds(): void {
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
  assert.equal(totalRounds(unit), before);
  assert.equal(getWeaponRuntime(unit).roundsLoaded, 0);
  tickSimulation(state, getWeaponDefinition(DEFAULT_RIFLE_ID).reloadTimeSeconds);
  assert.equal(totalRounds(unit), before);
  assert.equal(getWeaponRuntime(unit).roundsLoaded, 7);
}

function verifyLegacyFieldsAreDerived(): void {
  const state = makeState(6, 11);
  const unit = state.units[0];
  assertLegacyFields(unit);
  startReload(state, unit, 'derived-owner');
  assertLegacyFields(unit);
  tickSimulation(state, getWeaponDefinition(DEFAULT_RIFLE_ID).reloadTimeSeconds);
  assertLegacyFields(unit);
}

function verifyCorruptedReloadNormalization(): void {
  const capacity = getWeaponDefinition(DEFAULT_RIFLE_ID).magazineCapacity;
  const corrupted = createInitialState(mapData(), [{
    ...unitData('blue-reload', 'blue', 1, 3),
    runtime: {
      ammo: 999,
      weaponReady: true,
      weapon: {
        weaponId: DEFAULT_RIFLE_ID,
        roundsLoaded: capacity + 20,
        roundsReserve: -50,
        ready: true,
        recoil: -2,
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
  assert.ok(weapon.roundsLoaded >= 0 && weapon.roundsLoaded <= capacity);
  assert.ok(weapon.roundsReserve >= 0);
  assertLegacyFields(unit);
  assert.equal(unit.behaviorRuntime.physicalAction?.type, 'weapon_reload');
  assert.equal(unit.behaviorRuntime.physicalAction?.status, 'failed');
  assert.equal(unit.behaviorRuntime.physicalAction?.resultCode, 'reload_weapon_mismatch_normalized');
  const diagnostics = getWeaponReloadDiagnostics(unit);
  assert.equal(diagnostics.running, false);
  assert.ok(diagnostics.normalizationCode);
}

function runReloadWithRoute(deltas: readonly number[]) {
  const state = makeState(2, 20);
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
    recoil: 0,
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
