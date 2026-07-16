import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
import { issueTacticalOrderToSelectedUnits } from '../src/core/orders/RoutedMoveOrders';
import { createInitialState } from '../src/core/simulation/SimulationState';
import type { UnitData } from '../src/core/units/UnitModel';
import {
  beginTacticalOrderGesture,
  cancelTacticalOrderGesture,
  clampTacticalOrderMenuCenter,
  openTacticalOrderGesture,
  releaseTacticalOrderGesture,
  TACTICAL_ORDER_CENTER_RADIUS_PX,
  TACTICAL_ORDER_INNER_RADIUS_PX,
  TACTICAL_ORDER_OUTER_RADIUS_PX,
  updateTacticalOrderGesture,
} from '../src/input/TacticalOrderRadialGesture';
import { buildExportedScene, normalizeImportedScene } from '../src/ui/SceneExport';

verifyIntentContract();
verifyCommandIssueAndAiVisibility();
verifySceneRoundTrip();
verifyGestureContract();
verifyListenerTeardownContract();

console.log('Tactical order radial menu smoke passed: intent, command issue, Blackboard, serialization, radial geometry and teardown contracts.');

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
  const restoredBlackboard = buildBlackboardForUnit(restored, restoredUnit);
  assert.equal(restoredBlackboard.player_order_preset, 'assault');
  assert.equal(restoredBlackboard.player_order_navigation_profile, 'attack');
  assert.equal(restoredBlackboard.player_order_contact_policy, 'press_attack');
  assert.equal(restoredBlackboard.player_order_fire_policy, 'fire_at_will');
}

function verifyGestureContract(): void {
  assert.ok(TACTICAL_ORDER_CENTER_RADIUS_PX < TACTICAL_ORDER_INNER_RADIUS_PX);
  assert.ok(TACTICAL_ORDER_INNER_RADIUS_PX < TACTICAL_ORDER_OUTER_RADIUS_PX);

  const anchor = { x: 18, y: 18 };
  const start = beginTacticalOrderGesture(anchor, { x: 4.5, y: 3.5 }, 0);
  assert.equal(releaseTacticalOrderGesture(start, anchor, 120).kind, 'quick_move');

  const menuCenter = clampTacticalOrderMenuCenter(anchor, 400, 300);
  assert.notDeepEqual(menuCenter, anchor, 'edge clamping must create a distinct interactive menu center');
  const open = openTacticalOrderGesture(start, menuCenter, menuCenter, 280);
  assert.equal(open.phase, 'open');
  assert.deepEqual(open.menuCenterScreen, menuCenter);

  const reconPoint = { x: menuCenter.x, y: menuCenter.y - 72 };
  const recon = updateTacticalOrderGesture(open, reconPoint, 300);
  assert.equal(recon.highlightedPresetId, 'recon');
  assert.deepEqual(releaseTacticalOrderGesture(recon, reconPoint, 320), {
    kind: 'issue',
    presetId: 'recon',
  });

  const centerPoint = { x: menuCenter.x + TACTICAL_ORDER_CENTER_RADIUS_PX - 1, y: menuCenter.y };
  assert.equal(releaseTacticalOrderGesture(open, centerPoint, 320).kind, 'cancel');

  const innerGapPoint = { x: menuCenter.x + TACTICAL_ORDER_INNER_RADIUS_PX - 1, y: menuCenter.y };
  assert.equal(releaseTacticalOrderGesture(open, innerGapPoint, 320).kind, 'cancel');

  const farPoint = { x: menuCenter.x + TACTICAL_ORDER_OUTER_RADIUS_PX + 30, y: menuCenter.y };
  assert.equal(releaseTacticalOrderGesture(open, farPoint, 320).kind, 'cancel');

  assert.equal(cancelTacticalOrderGesture(open, 'escape').phase, 'cancelled');
  assert.equal(cancelTacticalOrderGesture(open, 'pointer_capture_lost').phase, 'cancelled');
}

function verifyListenerTeardownContract(): void {
  const source = readFileSync('src/input/TacticalOrderRadialInput.ts', 'utf8');
  for (const eventName of [
    'contextmenu',
    'pointerdown',
    'pointermove',
    'pointerup',
    'pointercancel',
    'lostpointercapture',
    'pointerleave',
    'wheel',
  ]) {
    assert.match(source, new RegExp(`addEventListener\\('${eventName}'`));
    assert.match(source, new RegExp(`removeEventListener\\('${eventName}'`));
  }
  assert.match(source, /window\.addEventListener\('keydown', handleKeyDown, true\)/);
  assert.match(source, /window\.removeEventListener\('keydown', handleKeyDown, true\)/);
  assert.match(source, /window\.clearInterval\(statusInterval\)/);
  assert.match(source, /if \(destroyed\) return;/);
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
