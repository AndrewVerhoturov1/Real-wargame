import assert from 'node:assert/strict';
import { reconcilePhysicalActionCoordinatorState } from '../src/core/actions/PhysicalActionCoordinatorReconciliation';
import {
  requestPostureTransition,
  tickPostureTransition,
} from '../src/core/actions/PostureTransition';
import type { TacticalMapData } from '../src/core/map/MapModel';
import { createInitialState } from '../src/core/simulation/SimulationState';
import type { UnitData } from '../src/core/units/UnitModel';
import { buildExportedScene, normalizeImportedScene } from '../src/ui/SceneExport';

const state = createInitialState(mapData(), [unitData()]);
const unit = state.units[0];
const requested = requestPostureTransition(unit, {
  targetPosture: 'crouched',
  owner: { source: 'test', id: 'terminal-migration-owner' },
  ownerToken: 'terminal-migration-token',
  startedSeconds: 2,
  reasonCode: 'terminal_migration_test_started',
  reasonRu: 'Проверочная смена позы для миграции.',
});
assert.equal(requested.accepted, true);
const running = unit.behaviorRuntime.physicalAction;
assert.ok(running);
tickPostureTransition(unit, running.durationSeconds, true);
const terminal = unit.behaviorRuntime.physicalAction;
assert.equal(terminal?.status, 'completed');
assert.equal(unit.behaviorRuntime.physicalActionCoordinator.activeLeases.length, 0);

const exported = buildExportedScene(state);
const runtime = exported.units[0].runtime as Record<string, unknown>;
delete runtime.physicalActionCoordinator;
delete (runtime.physicalAction as { actionHandle?: unknown }).actionHandle;
const imported = normalizeImportedScene(JSON.parse(JSON.stringify(exported)));
const restored = createInitialState(imported.map, imported.units, imported.pressureZones);
const restoredUnit = restored.units[0];

assert.equal(restoredUnit.behaviorRuntime.physicalAction?.status, 'completed');
assert.equal(restoredUnit.behaviorRuntime.physicalAction?.sequence, terminal?.sequence);
assert.equal(restoredUnit.behaviorRuntime.physicalActionCoordinator.activeLeases.length, 0);
assert.ok(
  restoredUnit.behaviorRuntime.physicalActionCoordinator.nextSequence > (terminal?.sequence ?? 0),
  'terminal legacy posture payload must advance nextSequence without restoring a lease',
);

const reconciledStateBeforeRepeat = JSON.stringify(restoredUnit.behaviorRuntime.physicalActionCoordinator);
const repeated = reconcilePhysicalActionCoordinatorState(restoredUnit, {
  actions: [],
  knownActionTypes: ['posture_transition', 'movement_weapon_preparation', 'legacy_fire_action'],
  reconciledSeconds: 0,
});
assert.equal(repeated.changed, false, 'terminal sequence migration must be idempotent');
assert.equal(
  JSON.stringify(restoredUnit.behaviorRuntime.physicalActionCoordinator),
  reconciledStateBeforeRepeat,
  'repeated reconciliation must not mutate the restored terminal state',
);

console.log('Physical action coordinator terminal migration smoke passed: terminal posture stays lease-free, advances nextSequence and reconciles idempotently.');

function unitData(): UnitData {
  return {
    id: 'terminal-migration-unit',
    label: 'Terminal migration unit',
    labelRu: 'Боец проверки терминальной миграции',
    type: 'infantry_squad',
    side: 'player',
    aiControl: 'manual',
    x: 1,
    y: 1,
    facingDegrees: 0,
    initialState: { posture: 'standing' },
  };
}

function mapData(): TacticalMapData {
  return {
    width: 8,
    height: 8,
    cellSize: 16,
    metersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: [],
  };
}
