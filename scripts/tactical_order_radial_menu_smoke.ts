import assert from 'node:assert/strict';
import { buildBlackboardForUnit } from '../src/core/ai/AiGameBridge';
import type { TacticalMapData } from '../src/core/map/MapModel';
import {
  createTacticalOrderIntent,
  normalizeTacticalOrderIntent,
  type TacticalOrderPresetId,
} from '../src/core/orders/TacticalOrderIntent';
import {
  createPlayerMoveCommand,
  normalizePlayerCommand,
} from '../src/core/orders/PlayerCommand';
import {
  issueTacticalOrderToSelectedUnits,
} from '../src/core/orders/RoutedMoveOrders';
import { createInitialState } from '../src/core/simulation/SimulationState';
import type { UnitData } from '../src/core/units/UnitModel';
import {
  beginTacticalOrderGesture,
  cancelTacticalOrderGesture,
  releaseTacticalOrderGesture,
  updateTacticalOrderGesture,
} from '../src/input/TacticalOrderRadialGesture';
import { buildExportedScene, normalizeImportedScene } from '../src/ui/SceneExport';

verifyIntentContract();
verifyCommandIssueAndAiVisibility();
verifySceneRoundTrip();
verifyGestureContract();

console.log('Tactical order radial menu smoke passed: intent, command issue, Blackboard, serialization and gesture contract.');

function verifyIntentContract(): void {
  const expected = {
    move: ['normal', 'automatic', 'continue_if_possible', 'self_defense'],
    recon: ['cautious', 'search', 'pause_and_observe', 'self_defense'],
    assault: ['attack', 'engage', 'press_attack', 'fire_at_will'],
  } as const;

  for (const presetId of Object.keys(expected) as TacticalOrderPresetId[]) {
    const intent = createTacticalOrderIntent(presetId);
    assert.equal(intent.presetId, presetId);
    assert.deepEqual(
      [intent.navigationProfileId, intent.attentionPolicy, intent.contactPolicy, intent.firePolicy],
      expected[presetId],
    );
    assert.equal(intent.resumeAfterTemporaryInterruption, true);
    assert.equal(Object.isFrozen(intent), true, 'intent snapshot must be immutable');
  }

  const legacy = normalizeTacticalOrderIntent(undefined);
  assert.equal(legacy.presetId, 'move');
  assert.equal(legacy.navigationProfileId, 'normal');

  const unknown = normalizeTacticalOrderIntent({ presetId: 'unknown', navigationProfileId: 'broken' });
  assert.equal(unknown.presetId, 'move');
  assert.equal(unknown.navigationProfileId, 'normal');

  const command = createPlayerMoveCommand('unit-a', { x: 3.5, y: 4.5 }, null, 1000, createTacticalOrderIntent('recon'));
  const normalized = normalizePlayerCommand({ ...command, intent: undefined }, 'unit-a');
  assert.equal(normalized?.intent.presetId, 'move', 'legacy command without intent must migrate to ordinary movement');
}

function verifyCommandIssueAndAiVisibility(): void {
  const state = createState();
  const unit = state.units[0];
  const other = state.units[1];
  let previousRevision = 0;

  for (const presetId of ['move', 'recon', 'assault'] as const) {
    issueTacticalOrderToSelectedUnits(state, { x: 7.5, y: 4.5 }, presetId, Math.PI / 3);
    assert.ok(unit.playerCommand);
    assert.equal(unit.playerCommand?.revision, previousRevision + 1);
    previousRevision = unit.playerCommand?.revision ?? previousRevision;
    assert.equal(unit.playerCommand?.intent.presetId, presetId);
    assert.equal(unit.order?.playerCommandId, unit.playerCommand?.id);
    assert.equal(unit.order?.navigationProfileId, unit.playerCommand?.intent.navigationProfileId);
    assert.equal(unit.order?.finalFacingRadians, Math.PI / 3);

    state.selectedUnitId = other.id;
    state.selectedUnitIds = [other.id];
    const blackboard = buildBlackboardForUnit(state, unit);
    assert.equal(blackboard.player_order_preset, presetId);
    assert.equal(blackboard.player_order_contact_policy, unit.playerCommand?.intent.contactPolicy);
    assert.equal(blackboard.player_order_fire_policy, unit.playerCommand?.intent.firePolicy);
    assert.equal(blackboard.player_order_attention_policy, unit.playerCommand?.intent.attentionPolicy);
    assert.equal(blackboard.player_order_resume_after_interruption, true);
    assert.equal(blackboard.player_order_navigation_profile, unit.playerCommand?.intent.navigationProfileId);

    state.selectedUnitId = unit.id;
    state.selectedUnitIds = [unit.id];
  }
}

function verifySceneRoundTrip(): void {
  const state = createState();
  issueTacticalOrderToSelectedUnits(state, { x: 6.5, y: 2.5 }, 'assault');
  const exported = buildExportedScene(state);
  const normalized = normalizeImportedScene(exported);
  const restored = createInitialState(normalized.map, normalized.units, normalized.pressureZones);
  const restoredUnit = restored.units[0];
  assert.equal(restoredUnit.playerCommand?.intent.presetId, 'assault');
  assert.equal(restoredUnit.playerCommand?.intent.navigationProfileId, 'attack');
  assert.deepEqual(restoredUnit.playerCommand?.target, { x: 6.5, y: 2.5 });
}

function verifyGestureContract(): void {
  const start = beginTacticalOrderGesture({ x: 120, y: 90 }, { x: 4.5, y: 3.5 }, 0);
  assert.equal(releaseTacticalOrderGesture(start, { x: 120, y: 90 }, 120).kind, 'quick_move');

  const open = updateTacticalOrderGesture(start, { x: 120, y: 90 }, 280);
  assert.equal(open.phase, 'open');
  const recon = updateTacticalOrderGesture(open, { x: 120, y: 10 }, 300);
  assert.equal(recon.highlightedPresetId, 'recon');
  assert.deepEqual(releaseTacticalOrderGesture(recon, { x: 120, y: 10 }, 320), {
    kind: 'issue',
    presetId: 'recon',
  });

  const center = updateTacticalOrderGesture(open, { x: 121, y: 91 }, 310);
  assert.equal(releaseTacticalOrderGesture(center, { x: 121, y: 91 }, 320).kind, 'cancel');
  assert.equal(cancelTacticalOrderGesture(open, 'escape').phase, 'cancelled');
  assert.equal(cancelTacticalOrderGesture(open, 'pointer_capture_lost').phase, 'cancelled');
}

function createState() {
  const state = createInitialState(makeMap(), [unitData('unit-a', 1, 4), unitData('unit-b', 2, 5)], []);
  state.selectedUnitId = 'unit-a';
  state.selectedUnitIds = ['unit-a'];
  return state;
}

function unitData(id: string, x: number, y: number): UnitData {
  return {
    id,
    label: id,
    labelRu: id,
    type: 'infantry_squad',
    side: 'player',
    aiControl: 'graph',
    x,
    y,
    speedCellsPerSecond: 3,
  };
}

function makeMap(): TacticalMapData {
  return {
    width: 10,
    height: 8,
    cellSize: 24,
    metersPerCell: 2,
    defaultTerrain: 'field',
    defaultHeight: 0,
    cells: [],
    objects: [],
  };
}
