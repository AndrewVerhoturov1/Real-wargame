import assert from 'node:assert/strict';
import type { AiGraph } from '../src/core/ai/AiGraph';
import { tickAiGameBridgeForTrustedUnit } from '../src/core/ai/AiGameBridge';
import {
  DEFAULT_RIFLE_ID,
  getWeaponDefinition,
  getWeaponRuntime,
  replaceWeaponRuntime,
} from '../src/core/combat/WeaponModel';
import type { TacticalMapData } from '../src/core/map/MapModel';
import { createInitialState } from '../src/core/simulation/SimulationState';
import { tickSimulation } from '../src/core/simulation/SimulationTick';
import type { UnitData, UnitModel } from '../src/core/units/UnitModel';

verifyLegacySetActionCannotCreateAmmo();
verifyStatefulReloadStartsAndCancelsPhysicalAction();
verifyStatefulCompletionDoesNotCompletePhysicalReload();

console.log('Physical reload Graph bridge smoke passed: legacy and stateful paths preserve canonical ammunition and delegate to physicalAction.');

function verifyLegacySetActionCannotCreateAmmo(): void {
  const state = makeState(1, 9);
  const unit = state.units[0];
  const before = snapshot(unit);
  const graph: AiGraph = {
    version: 1,
    id: 'legacy_reload_bridge_graph',
    name: 'Legacy reload bridge',
    nameRu: 'Старый reload через bridge',
    rootNodeId: 'root',
    blackboardDefaults: {},
    nodes: [
      { id: 'root', type: 'Root', children: ['reload'] },
      { id: 'reload', type: 'SetAction', children: [], parameters: { action: 'reload' } },
    ],
  };

  const result = tickAiGameBridgeForTrustedUnit(state, unit, 0, {
    force: true,
    applyEffects: true,
    graphSnapshot: { graph, sourceRevision: 'test:legacy-reload' },
  });
  assert.equal(result?.status, 'success');
  assert.deepEqual(snapshot(unit), before, 'legacy bridge assignments must be overwritten from canonical WeaponRuntime');
  assert.equal(unit.behaviorRuntime.ammo, before.roundsLoaded + before.roundsReserve);
  assert.equal(unit.behaviorRuntime.currentAction, 'reload');

  tickSimulation(state, 0.1);
  assert.equal(unit.behaviorRuntime.physicalAction?.type, 'weapon_reload');
  assert.equal(unit.behaviorRuntime.physicalAction?.status, 'running');
  assert.deepEqual(snapshot(unit), before, 'starting physical reload must not transfer ammunition');
}

function verifyStatefulReloadStartsAndCancelsPhysicalAction(): void {
  const state = makeState(1, 9);
  const unit = state.units[0];
  const before = snapshot(unit);
  const graph = statefulReloadGraph('stateful_reload_cancel_graph');

  const started = tickAiGameBridgeForTrustedUnit(state, unit, 0, {
    force: true,
    applyEffects: true,
    graphSnapshot: { graph, sourceRevision: 'test:stateful-reload-cancel' },
  });
  assert.equal(started?.status, 'running');
  assert.deepEqual(snapshot(unit), before);
  tickSimulation(state, 0.1);
  assert.equal(unit.behaviorRuntime.physicalAction?.type, 'weapon_reload');
  assert.equal(unit.behaviorRuntime.physicalAction?.status, 'running');
  const progressBeforeCancel = unit.behaviorRuntime.physicalAction.progress;
  assert.ok(progressBeforeCancel > 0);

  const cancelled = tickAiGameBridgeForTrustedUnit(state, unit, 1000, {
    force: true,
    applyEffects: true,
    cancel: {
      reason: 'Test cancellation.',
      reasonRu: 'Тестовая отмена.',
    },
    graphSnapshot: { graph, sourceRevision: 'test:stateful-reload-cancel' },
  });
  assert.equal(cancelled?.status, 'cancelled');
  assert.equal(unit.behaviorRuntime.currentAction, 'reload_cancelled');
  tickSimulation(state, 0.1);
  assert.equal(unit.behaviorRuntime.physicalAction?.status, 'cancelled');
  assert.equal(unit.behaviorRuntime.physicalAction?.resultCode, 'reload_cancelled');
  assert.deepEqual(snapshot(unit), before, 'stateful cancellation must not transfer ammunition');
}

function verifyStatefulCompletionDoesNotCompletePhysicalReload(): void {
  const state = makeState(1, 9);
  const unit = state.units[0];
  const before = snapshot(unit);
  const graph = statefulReloadGraph('stateful_reload_completion_graph');

  const started = tickAiGameBridgeForTrustedUnit(state, unit, 0, {
    force: true,
    applyEffects: true,
    graphSnapshot: { graph, sourceRevision: 'test:stateful-reload-complete' },
  });
  assert.equal(started?.status, 'running');
  tickSimulation(state, 0.1);
  assert.equal(unit.behaviorRuntime.physicalAction?.status, 'running');

  const completedNode = tickAiGameBridgeForTrustedUnit(state, unit, 3000, {
    force: true,
    applyEffects: true,
    graphSnapshot: { graph, sourceRevision: 'test:stateful-reload-complete' },
  });
  assert.equal(completedNode?.status, 'success');
  assert.equal(unit.behaviorRuntime.physicalAction?.status, 'running', 'Graph node completion must not complete physical reload');
  assert.deepEqual(snapshot(unit), before);

  tickSimulation(state, getWeaponDefinition(DEFAULT_RIFLE_ID).reloadTimeSeconds);
  assert.equal(unit.behaviorRuntime.physicalAction?.status, 'completed');
  assert.equal(getWeaponRuntime(unit).roundsLoaded, getWeaponDefinition(DEFAULT_RIFLE_ID).magazineCapacity);
  assert.equal(totalRounds(unit), before.roundsLoaded + before.roundsReserve);
}

function statefulReloadGraph(id: string): AiGraph {
  return {
    version: 1,
    id,
    name: id,
    nameRu: id,
    rootNodeId: 'root',
    blackboardDefaults: {},
    nodes: [
      { id: 'root', type: 'Root', children: ['reload'] },
      {
        id: 'reload',
        type: 'Reload',
        children: [],
        parameters: { durationSeconds: 3, targetAmmo: 30, failIfNoWeapon: true },
      },
    ],
  };
}

function makeState(roundsLoaded: number, roundsReserve: number) {
  const state = createInitialState(mapData(), [unitData()]);
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

function unitData(): UnitData {
  return {
    id: 'blue-reload-bridge',
    label: 'Blue reload bridge',
    labelRu: 'Синий bridge reload',
    type: 'infantry_squad',
    side: 'blue',
    aiControl: 'graph',
    x: 2,
    y: 2,
    speedCellsPerSecond: 4,
    facingDegrees: 0,
    viewRangeCells: 12,
    initialState: { posture: 'standing' },
  };
}

function mapData(): TacticalMapData {
  return {
    width: 20,
    height: 8,
    cellSize: 16,
    metersPerCell: 2,
    runtimeMetersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    objects: [],
  };
}

function snapshot(unit: UnitModel) {
  const weapon = getWeaponRuntime(unit);
  return {
    roundsLoaded: weapon.roundsLoaded,
    roundsReserve: weapon.roundsReserve,
  };
}

function totalRounds(unit: UnitModel): number {
  const weapon = getWeaponRuntime(unit);
  return weapon.roundsLoaded + weapon.roundsReserve;
}
