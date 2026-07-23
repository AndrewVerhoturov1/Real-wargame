import assert from 'node:assert/strict';
import {
  POSTURE_TRANSITION_DURATIONS_SECONDS,
  requestPostureTransition,
} from '../src/core/actions/PostureTransition';
import {
  isPhysicalActionChannelAvailable,
} from '../src/core/actions/PhysicalActionCoordinator';
import { tickPostureTransitionWithTimeBudget } from '../src/core/actions/PostureTransitionClock';
import type { TacticalMapData } from '../src/core/map/MapModel';
import {
  getMovementWeaponPreparation,
  preparePhysicalMovementStep,
  requestMovementWeaponPreparation,
  setMovementRequest,
} from '../src/core/movement/MovementRuntime';
import { createMoveOrder } from '../src/core/orders/MoveOrder';
import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';
import { clearStaticTacticalPositionService } from '../src/core/tactical/static/StaticTacticalPositionService';
import type { UnitData, UnitModel } from '../src/core/units/UnitModel';
import { buildExportedScene, normalizeImportedScene } from '../src/ui/SceneExport';

const createdStates = new Set<SimulationState>();

verifyUnitOwnsDurableCoordinator();
verifyPostureLeaseBlocksMovementAndReleasesExactly();
verifyMovementPreparationLeaseBlocksPostureAndIsIdempotent();
verifyLegacyPostureLeaseReconstruction();
verifyLegacyPreparationLeaseReconstruction();
verifyOrphanKnownLeaseIsRemoved();

for (const state of createdStates) clearStaticTacticalPositionService(state);

console.log('Physical action coordinator integration smoke passed: unit storage, posture and movement-preparation leases, movement blocking, save migration and orphan reconciliation.');

function verifyUnitOwnsDurableCoordinator(): void {
  const state = makeState();
  const unit = state.units[0];
  assert.equal(unit.behaviorRuntime.physicalActionCoordinator.schemaVersion, 1);
  assert.equal(unit.behaviorRuntime.physicalActionCoordinator.revision, 0);
  assert.equal(unit.behaviorRuntime.physicalActionCoordinator.nextSequence, 1);
  assert.deepEqual(unit.behaviorRuntime.physicalActionCoordinator.activeLeases, []);

  const exported = buildExportedScene(state);
  const runtime = exported.units[0].runtime as Record<string, unknown>;
  assert.ok(runtime.physicalActionCoordinator, 'scene export must contain coordinator state');
  const restored = restoreExportedScene(exported);
  assert.deepEqual(
    restored.units[0].behaviorRuntime.physicalActionCoordinator,
    unit.behaviorRuntime.physicalActionCoordinator,
  );
}

function verifyPostureLeaseBlocksMovementAndReleasesExactly(): void {
  const state = makeState();
  const unit = state.units[0];
  setMovementRequest(unit, 'normal_walk', 'player_order', 'walk');
  unit.order = createMoveOrder({ x: 40.5, y: 2.5 }, { source: 'player', ownerToken: 'route-a' });
  const result = requestPostureTransition(unit, {
    targetPosture: 'crouched',
    owner: { source: 'test', id: 'posture-owner' },
    ownerToken: 'posture-token',
    startedSeconds: state.simulationTimeSeconds,
    reasonCode: 'integration_posture',
    reasonRu: 'Проверочная смена позы.',
  });
  assert.equal(result.accepted, true);
  const action = unit.behaviorRuntime.physicalAction;
  assert.ok(action?.actionHandle);
  assert.deepEqual(
    unit.behaviorRuntime.physicalActionCoordinator.activeLeases[0]?.channels,
    ['locomotion', 'posture', 'weapon'],
  );

  const blockedStep = preparePhysicalMovementStep(state, unit, 0.2, true, 1, 1);
  assert.equal(blockedStep.maxDistanceCells, 0);
  assert.equal(blockedStep.activeSeconds, 0);
  assert.deepEqual(unit.movementRuntime.velocityCellsPerSecond, { x: 0, y: 0 });

  const tick = tickPostureTransitionWithTimeBudget(
    unit,
    POSTURE_TRANSITION_DURATIONS_SECONDS.standingToCrouched + 0.25,
    true,
  );
  assert.equal(tick.completed, true);
  assert.ok(tick.remainingSeconds > 0.2);
  assert.equal(unit.behaviorRuntime.physicalAction?.status, 'completed');
  assert.equal(unit.behaviorRuntime.physicalActionCoordinator.activeLeases.length, 0);
  assert.equal(isPhysicalActionChannelAvailable(unit, 'locomotion'), true);
  assert.equal(isPhysicalActionChannelAvailable(unit, 'posture'), true);
  assert.equal(isPhysicalActionChannelAvailable(unit, 'weapon'), true);
  assert.equal(unit.behaviorRuntime.physicalActionCoordinator.lastResult?.status, 'completed');
}

function verifyMovementPreparationLeaseBlocksPostureAndIsIdempotent(): void {
  const state = makeState();
  const unit = state.units[0];
  setMovementRequest(unit, 'sprint', 'player_order', 'sprint');
  unit.movementRuntime.isMoving = true;
  unit.movementRuntime.velocityCellsPerSecond = { x: 3, y: 0 };
  unit.order = createMoveOrder({ x: 40.5, y: 2.5 }, { source: 'player', ownerToken: 'route-b' });

  const first = requestMovementWeaponPreparation(state, unit, {
    contactId: 'contact-a',
    ownerToken: 'fire-intent:contact-a',
  });
  assert.equal(first.allowed, false);
  const pending = getMovementWeaponPreparation(unit);
  assert.ok(pending?.actionHandle);
  const initialHandle = pending.actionHandle;
  const initialRemaining = pending.remainingSeconds;
  assert.deepEqual(
    unit.behaviorRuntime.physicalActionCoordinator.activeLeases[0]?.channels,
    ['locomotion', 'weapon'],
  );

  const repeated = requestMovementWeaponPreparation(state, unit, {
    contactId: 'contact-a',
    ownerToken: 'fire-intent:contact-a',
  });
  assert.equal(repeated.allowed, false);
  assert.deepEqual(getMovementWeaponPreparation(unit)?.actionHandle, initialHandle);
  assert.equal(getMovementWeaponPreparation(unit)?.remainingSeconds, initialRemaining);

  const posture = requestPostureTransition(unit, {
    targetPosture: 'crouched',
    owner: { source: 'test', id: 'posture-blocked' },
    ownerToken: 'posture-blocked-token',
    startedSeconds: state.simulationTimeSeconds,
    reasonCode: 'posture_during_preparation',
    reasonRu: 'Попытка смены позы во время подготовки оружия.',
  });
  assert.equal(posture.accepted, false);
  assert.equal(unit.behaviorRuntime.physicalAction, null, 'blocked request must not create posture payload');

  const finishedStep = preparePhysicalMovementStep(state, unit, initialRemaining + 0.2, true, 1, 1);
  assert.equal(getMovementWeaponPreparation(unit), null);
  assert.equal(unit.behaviorRuntime.physicalActionCoordinator.activeLeases.length, 0);
  assert.ok(finishedStep.maxDistanceCells > 0, 'time remaining after preparation must return to movement');
}

function verifyLegacyPostureLeaseReconstruction(): void {
  const state = makeState();
  const unit = state.units[0];
  const request = requestPostureTransition(unit, {
    targetPosture: 'prone',
    owner: { source: 'test', id: 'legacy-posture-owner' },
    ownerToken: 'legacy-posture-token',
    startedSeconds: 0,
    reasonCode: 'legacy_posture',
    reasonRu: 'Старая смена позы.',
  });
  assert.equal(request.accepted, true);
  tickPostureTransitionWithTimeBudget(unit, 0.3, true);
  const before = unit.behaviorRuntime.physicalAction;
  assert.ok(before);
  const exported = buildExportedScene(state);
  const runtime = exported.units[0].runtime as Record<string, unknown>;
  delete runtime.physicalActionCoordinator;
  delete (runtime.physicalAction as { actionHandle?: unknown }).actionHandle;

  const restored = restoreExportedScene(exported);
  const restoredUnit = restored.units[0];
  const after = restoredUnit.behaviorRuntime.physicalAction;
  assert.ok(after?.actionHandle);
  assert.equal(after.id, before.id);
  assert.equal(after.sequence, before.sequence);
  assert.equal(after.progress, before.progress);
  assert.equal(after.actionHandle.actionId, before.id);
  assert.equal(after.actionHandle.sequence, before.sequence);
  assert.deepEqual(
    restoredUnit.behaviorRuntime.physicalActionCoordinator.activeLeases[0]?.channels,
    ['locomotion', 'posture', 'weapon'],
  );
  assert.ok(restoredUnit.behaviorRuntime.physicalActionCoordinator.nextSequence > before.sequence);
}

function verifyLegacyPreparationLeaseReconstruction(): void {
  const state = makeState();
  const unit = state.units[0];
  setMovementRequest(unit, 'sprint', 'player_order', 'sprint');
  unit.movementRuntime.isMoving = true;
  unit.order = createMoveOrder({ x: 40.5, y: 2.5 }, { source: 'player', ownerToken: 'legacy-route' });
  requestMovementWeaponPreparation(state, unit, {
    contactId: 'legacy-contact',
    ownerToken: 'fire-intent:legacy-contact',
  });
  preparePhysicalMovementStep(state, unit, 0.15, true, 1, 1);
  const before = getMovementWeaponPreparation(unit);
  assert.ok(before);
  const exported = buildExportedScene(state);
  const runtime = exported.units[0].runtime as Record<string, unknown>;
  delete runtime.physicalActionCoordinator;
  const movement = runtime.movement as { weaponPreparation?: { actionHandle?: unknown } };
  delete movement.weaponPreparation?.actionHandle;

  const restored = restoreExportedScene(exported);
  const restoredPending = getMovementWeaponPreparation(restored.units[0]);
  assert.ok(restoredPending?.actionHandle);
  assert.equal(restoredPending.remainingSeconds, before.remainingSeconds);
  assert.equal(restoredPending.contactId, before.contactId);
  assert.equal(restoredPending.ownerToken, before.ownerToken);
  assert.deepEqual(
    restored.units[0].behaviorRuntime.physicalActionCoordinator.activeLeases[0]?.channels,
    ['locomotion', 'weapon'],
  );
}

function verifyOrphanKnownLeaseIsRemoved(): void {
  const state = makeState();
  const exported = buildExportedScene(state);
  const runtime = exported.units[0].runtime as Record<string, unknown>;
  runtime.physicalActionCoordinator = {
    schemaVersion: 1,
    revision: 2,
    nextSequence: 3,
    activeLeases: [{
      schemaVersion: 1,
      handle: {
        actionId: 'coordinator-unit:physical-action:2',
        sequence: 2,
        revision: 2,
        ownerToken: 'orphan-token',
      },
      actionType: 'posture_transition',
      owner: { source: 'test', id: 'orphan-owner' },
      channels: ['locomotion', 'posture', 'weapon'],
      startedSeconds: 0,
      reasonCode: 'orphan_saved',
      reasonRu: 'Сохранённый сиротский захват.',
    }],
    lastResult: null,
    lastDiagnosticCode: null,
    lastDiagnosticRu: null,
  };
  delete runtime.physicalAction;

  const restored = restoreExportedScene(exported);
  const coordinator = restored.units[0].behaviorRuntime.physicalActionCoordinator;
  assert.equal(coordinator.activeLeases.length, 0);
  assert.equal(coordinator.lastResult?.status, 'failed');
  assert.equal(coordinator.lastResult?.resultCode, 'physical_action_orphan_lease_removed');
}

function makeState(): SimulationState {
  const state = createInitialState(mapData(), [unitData()]);
  createdStates.add(state);
  return state;
}

function restoreExportedScene(exported: ReturnType<typeof buildExportedScene>): SimulationState {
  const normalized = normalizeImportedScene(JSON.parse(JSON.stringify(exported)));
  const state = createInitialState(normalized.map, normalized.units, normalized.pressureZones);
  state.movementProfiles = exported.movementProfiles
    ? state.movementProfiles.constructor.fromUnknown?.(exported.movementProfiles) ?? state.movementProfiles
    : state.movementProfiles;
  createdStates.add(state);
  return state;
}

function unitData(): UnitData {
  return {
    id: 'coordinator-unit',
    label: 'Coordinator unit',
    labelRu: 'Боец координатора',
    type: 'infantry_squad',
    side: 'player',
    aiControl: 'manual',
    x: 1,
    y: 2,
    speedCellsPerSecond: 4,
    facingDegrees: 0,
    initialState: { posture: 'standing' },
  };
}

function mapData(): TacticalMapData {
  return {
    width: 64,
    height: 8,
    cellSize: 16,
    metersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: [],
  };
}
