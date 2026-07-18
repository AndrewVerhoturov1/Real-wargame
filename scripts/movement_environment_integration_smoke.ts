import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildClearAiMovementProfileUpdates,
  buildSetAiMovementProfileUpdates,
} from '../src/core/ai/MovementProfileAiMemory';
import { reconcileMovementProfileRuntime } from '../src/core/ai/MovementProfileRuntimeResolver';
import { publishTacticalOrderIntentToAiMemory } from '../src/core/ai/TacticalOrderBlackboard';
import type { AiBlackboardValue } from '../src/core/ai/AiBlackboard';
import {
  EnvironmentProfileRegistry,
  createDefaultEnvironmentProfileRegistry,
} from '../src/core/map/EnvironmentMaterialProfile';
import {
  getEnvironmentProfileRuntimeSnapshot,
  installEnvironmentProfileRegistry,
} from '../src/core/map/EnvironmentProfileRuntime';
import { getCell, setCellVegetationMaterialId, type TacticalMapData } from '../src/core/map/MapModel';
import { installEnvironmentMovementMaterialProvider } from '../src/core/movement/MovementMaterialAdapter';
import {
  createMovementProfileRegistry,
  type MovementProfileRegistry,
} from '../src/core/movement/MovementProfiles';
import { setMovementProfileRequest } from '../src/core/movement/MovementRuntime';
import { createEmptyPerceptionKnowledge } from '../src/core/perception/PerceptionContact';
import { tickUnitPerception } from '../src/core/perception/PerceptionSystem';
import { buildUnitTacticalRouteContext, resolveUnitNavigationProfile } from '../src/core/navigation/NavigationRuntime';
import { planMoveOrder } from '../src/core/orders/MoveOrderPlanning';
import { createPlayerMoveCommand } from '../src/core/orders/PlayerCommand';
import { issueTacticalOrderToSelectedUnits } from '../src/core/orders/RoutedMoveOrders';
import {
  createTacticalOrderIntent,
  withTacticalOrderMovementProfile,
} from '../src/core/orders/TacticalOrderIntent';
import { createInitialState, type SimulationState } from '../src/core/simulation/SimulationState';
import { tickSimulation } from '../src/core/simulation/SimulationTick';
import { computeLineOfSight } from '../src/core/visibility/LineOfSight';
import type { UnitData, UnitModel } from '../src/core/units/UnitModel';
import {
  BUILTIN_MOVEMENT_PROFILE_SELECTOR_PROVIDER,
  listMovementProfileSelectorEntries,
  setMovementProfileSelectorProvider,
} from '../src/ai-node-editor/MovementProfileSelectorProvider';
import { buildExportedScene, normalizeImportedScene } from '../src/ui/SceneExport';

verifyAssaultFallbackRecoveryAndReplan();
verifyAiOverrideHardSafetyAndStaleCleanup();
verifyCustomProfileSelectorOrderRuntimeAndRoundTrip();
verifyLiveEnvironmentMaterialInfluence();
verifyRearVisibilityCompositionAndUiIndependence();

console.log('Movement/environment integration smoke passed: immutable assault intent, single authority resolver, physical fallback/recovery, replan persistence, AI override safety, custom selector round-trip, live material influence and canonical rear-visibility composition.');

function verifyAssaultFallbackRecoveryAndReplan(): void {
  const state = makeState();
  const unit = state.units[0];
  state.selectedUnitId = unit.id;
  state.selectedUnitIds = [unit.id];
  issueTacticalOrderToSelectedUnits(state, { x: 180.5, y: 2.5 }, 'assault');

  assert.equal(unit.playerCommand?.intent.movementProfileId, 'run');
  assert.equal(unit.order?.movementProfileId, 'run');
  assert.equal(unit.order?.movementProfileSource, 'player_order');
  const immutableIntent = unit.playerCommand?.intent;
  const initialSelectionRevision = unit.order?.movementProfileSelectionRevision ?? 0;

  unit.movementRuntime.stamina = 14.2;
  tickSimulation(state, 0.1);
  assert.equal(unit.movementRuntime.requestedProfileId, 'run');
  assert.equal(unit.movementRuntime.effectiveProfileId, 'normal_walk');
  assert.equal(unit.movementRuntime.actualGait, 'walk');
  assert.equal(unit.movementRuntime.effectiveProfileSource, 'hard_safety');
  assert.equal(unit.playerCommand?.intent, immutableIntent, 'physical fallback must not replace immutable player intent');
  assert.equal(unit.playerCommand?.intent.movementProfileId, 'run');
  assert.equal(unit.order?.movementProfileId, 'run', 'physical fallback must not rewrite the MoveOrder request snapshot');
  assert.equal(unit.order?.movementProfileSource, 'player_order');
  assert.equal(unit.order?.movementProfileSelectionRevision, initialSelectionRevision,
    'physical fallback must not change route selection revisions');
  const fallbackSelectionRevision = unit.movementRuntime.profileSelectionRevision;
  for (let index = 0; index < 3; index += 1) tickSimulation(state, 0.1);
  assert.equal(unit.movementRuntime.profileSelectionRevision, fallbackSelectionRevision,
    'stable physical fallback must not churn active selection revisions every tick');

  let resumed = false;
  for (let index = 0; index < 80; index += 1) {
    tickSimulation(state, 0.1);
    if (unit.movementRuntime.effectiveProfileId === 'run'
      && unit.movementRuntime.effectiveProfileSource === 'player_order'
      && unit.movementRuntime.forcedFallbackReason === null) {
      resumed = true;
      break;
    }
  }
  assert.equal(resumed, true, 'run must resume after stamina recovery without replacing the order intent');
  assert.equal(unit.playerCommand?.intent, immutableIntent);
  assert.equal(unit.order?.movementProfileId, 'run');
  assert.equal(unit.order?.movementProfileSelectionRevision, initialSelectionRevision,
    'recovery from physical fallback must not rewrite the route snapshot revision');
  const beforeReplanRevision = unit.order?.movementProfileSelectionRevision ?? 0;
  const routeCell = unit.order?.routeCells?.find((cell) => cell.x > Math.floor(unit.position.x) + 1);
  assert.ok(routeCell, 'assault route must expose a future cell for replan proof');
  state.map.objects.push({
    id: 'integration-replan-blocker', kind: 'structure', x: routeCell.x, y: routeCell.y,
    widthCells: 0.9, heightCells: 0.9, rotationRadians: 0, labels: null,
  });
  tickSimulation(state, 0.1);
  assert.ok(unit.order, 'replan must preserve the active assault movement order');
  assert.ok((unit.order.replanCount ?? 0) >= 1 || unit.order.routeStatus === 'replanned');
  assert.equal(unit.playerCommand?.intent, immutableIntent);
  assert.equal(unit.playerCommand?.intent.movementProfileId, 'run');
  assert.equal(unit.order.movementProfileId, 'run');
  assert.ok((unit.order.movementProfileSelectionRevision ?? 0) >= beforeReplanRevision);
}

function verifyAiOverrideHardSafetyAndStaleCleanup(): void {
  const state = makeState();
  const unit = state.units[0];
  const memory = runtimeMemory(unit);
  applyUpdates(memory, buildSetAiMovementProfileUpdates({
    profileId: 'sprint', ownerToken: 'new-ai-owner', reason: 'integration sprint override',
  }));
  const entries = registryEntries(state.movementProfiles);
  const safety = reconcileMovementProfileRuntime(unit, entries, {
    profileId: 'crawl', reason: 'hard safety crawl integration proof',
  });
  assert.equal(safety.resolved.requestedProfileId, 'normal_walk');
  assert.equal(safety.resolved.profileId, 'crawl');
  assert.equal(safety.resolved.source, 'hard_safety');
  assert.equal(safety.resolved.forcedFallback, true);
  assert.match(safety.resolved.forcedReason ?? '', /hard safety crawl/i);

  const staleCleanup = buildClearAiMovementProfileUpdates({
    expectedOwnerToken: 'old-ai-owner',
    activeOwnerToken: 'new-ai-owner',
  });
  assert.equal(staleCleanup.cleared, false);
  applyUpdates(memory, staleCleanup.updates);
  const stillSafe = reconcileMovementProfileRuntime(unit, entries, {
    profileId: 'crawl', reason: 'hard safety crawl integration proof',
  });
  assert.equal(stillSafe.resolved.profileId, 'crawl');
  assert.equal(memory.movement_profile_override_id, 'sprint');
  assert.equal(memory.movement_profile_override_owner_token, 'new-ai-owner');

  const resumedAi = reconcileMovementProfileRuntime(unit, entries, { profileId: null });
  assert.equal(resumedAi.resolved.profileId, 'sprint');
  assert.equal(resumedAi.resolved.source, 'ai_override');
  assert.equal(resumedAi.resolved.forcedFallback, false);
}

function verifyCustomProfileSelectorOrderRuntimeAndRoundTrip(): void {
  const state = makeState();
  const unit = state.units[0];
  const registry = state.movementProfiles;
  const custom = registry.createCustomProfile('custom_editor_patrol', 'Custom editor patrol', 'Патруль редактора', 'stealth_move');
  const saved = registry.updateProfile(custom.id, {
    settings: {
      speed: { speedMultiplier: 0.57 },
      noise: { loudness: 0.19 },
    },
  });
  setMovementProfileSelectorProvider({
    listProfiles: () => registry.listProfiles().map((profile) => ({ id: profile.id, nameRu: profile.nameRu, revision: profile.revision })),
  });
  const selectorEntry = listMovementProfileSelectorEntries().find((entry) => entry.id === saved.id);
  assert.equal(selectorEntry?.revision, saved.revision, 'custom selector preserves definition revision');

  const intent = withTacticalOrderMovementProfile(createTacticalOrderIntent('move'), saved.id);
  const target = { x: 60.5, y: 2.5 };
  const command = createPlayerMoveCommand(unit.id, target, null, 1000, intent);
  unit.playerCommand = command;
  publishTacticalOrderIntentToAiMemory(unit, command.intent);
  const navigation = resolveUnitNavigationProfile(unit, command);
  const planned = planMoveOrder(state.map, unit.position, target, {
    source: 'player', playerCommandId: command.id,
    movementMode: command.movementMode,
    navigationProfile: navigation.profile,
    navigationProfileSource: navigation.source,
    movementProfileId: command.intent.movementProfileId,
    movementProfileSource: 'player_order',
    movementProfileOwnerToken: command.id,
    movementProfileSelectionRevision: command.revision,
    tacticalContext: buildUnitTacticalRouteContext(unit, {
      freshness: 'immediate',
      metersPerCell: state.map.metersPerCell,
    }),
  });
  assert.equal(planned.ok, true);
  if (!planned.ok) throw new Error(planned.reasonRu);
  unit.order = planned.order;
  tickSimulation(state, 0.2);
  assert.equal(unit.playerCommand.intent.movementProfileId, saved.id);
  assert.equal(unit.order?.movementProfileId, saved.id);
  assert.equal(unit.movementRuntime.effectiveProfileId, saved.id);
  assert.equal(unit.order?.movementProfileDefinitionRevision, saved.revision, 'move order snapshots custom definition revision');

  const memory = runtimeMemory(unit);
  applyUpdates(memory, buildSetAiMovementProfileUpdates({ profileId: saved.id, ownerToken: 'custom-ai-owner' }));
  const aiSelected = reconcileMovementProfileRuntime(unit, registryEntries(registry));
  assert.equal(aiSelected.resolved.profileId, saved.id);
  assert.equal(aiSelected.resolved.source, 'ai_override');
  const clear = buildClearAiMovementProfileUpdates({ expectedOwnerToken: 'custom-ai-owner', activeOwnerToken: 'custom-ai-owner' });
  assert.equal(clear.cleared, true);
  applyUpdates(memory, clear.updates);
  reconcileMovementProfileRuntime(unit, registryEntries(registry));

  const exported = buildExportedScene(state);
  const imported = normalizeImportedScene(JSON.parse(JSON.stringify(exported)));
  const restored = createInitialState(imported.map, imported.units, imported.pressureZones);
  restored.movementProfiles = createMovementProfileRegistry(imported.movementProfiles);
  const restoredProfile = restored.movementProfiles.requireProfile(saved.id);
  const restoredUnit = restored.units[0];
  assert.equal(restoredProfile.revision, saved.revision, 'custom profile revision survives scene round trip');
  assert.equal(restoredUnit.playerCommand?.intent.movementProfileId, saved.id);
  assert.equal(restoredUnit.movementRuntime.requestedProfileId, saved.id);
  reconcileMovementProfileRuntime(restoredUnit, registryEntries(restored.movementProfiles));
  assert.equal(restoredUnit.movementRuntime.effectiveProfileId, saved.id);
  assert.equal(restoredUnit.order?.movementProfileDefinitionRevision, saved.revision, 'restored move order preserves definition revision');
  setMovementProfileSelectorProvider(BUILTIN_MOVEMENT_PROFILE_SELECTOR_PROVIDER);
}

function verifyLiveEnvironmentMaterialInfluence(): void {
  const environment = createDefaultEnvironmentProfileRegistry();
  installEnvironmentProfileRegistry(environment);
  const state = makeState();
  installEnvironmentMovementMaterialProvider(state);
  const unit = state.units[0];
  setMovementProfileRequest(state, unit, 'normal_walk', 'unit_role');
  unit.order = planOrThrow(state, unit, { x: 80.5, y: 2.5 });
  tickSimulation(state, 0.2);
  const baselineSpeed = unit.movementRuntime.diagnostics.speedCellsPerSecond;
  const baselineNoise = unit.movementRuntime.diagnostics.noiseLoudness;
  const stateIdentity = state;
  const unitIdentity = unit;
  const beforeKey = getEnvironmentProfileRuntimeSnapshot().domainKeys.movement;

  const active = environment.getProfile();
  environment.updateSurfaceMaterial(active.id, 'field', {
    movement: { ...active.surfaces.field.movement, resistance: 2, physicalCost: 8 },
  });
  installEnvironmentProfileRegistry(environment);
  const afterKey = getEnvironmentProfileRuntimeSnapshot().domainKeys.movement;
  assert.notEqual(afterKey, beforeKey, 'movement-domain revision key must change after a live material edit');

  unit.order = planOrThrow(state, unit, { x: 120.5, y: 2.5 });
  tickSimulation(state, 0.2);
  assert.equal(state, stateIdentity, 'live environment edit must not recreate the simulation state');
  assert.equal(state.units[0], unitIdentity, 'live environment edit must not reload units');
  assert.ok(unit.movementRuntime.diagnostics.speedCellsPerSecond < baselineSpeed);
  assert.ok(unit.movementRuntime.diagnostics.noiseLoudness > baselineNoise);
  assert.equal(unit.movementRuntime.diagnostics.materialSource, 'material_profile_provider');

  const adapterSource = readFileSync('src/core/movement/MovementMaterialAdapter.ts', 'utf8');
  assert.match(adapterSource, /getSurfaceMaterial\(environment, cell\.surfaceMaterialId\)/);
  assert.match(adapterSource, /getVegetationMaterial\(environment, cell\.vegetationMaterialId\)/);
  const canonicalProviderBlock = adapterSource.slice(
    adapterSource.indexOf('export const environmentMovementMaterialProfileProvider'),
    adapterSource.indexOf('export function installEnvironmentMovementMaterialProvider'),
  );
  assert.doesNotMatch(canonicalProviderBlock, /terrain\s*===|switch\s*\(.*terrain/, 'canonical provider must not contain a second terrain coefficient table');
}

function verifyRearVisibilityCompositionAndUiIndependence(): void {
  const environment = createDefaultEnvironmentProfileRegistry();
  const active = environment.getProfile();
  const transmissionLossPerMeter = 0.045;
  environment.updateVegetationMaterial(active.id, 'sparse_forest', {
    visibility: {
      ...active.vegetation.sparse_forest.visibility,
      transmissionLossPerMeter,
      minimumTransmission: 0.01,
    },
  });
  installEnvironmentProfileRegistry(environment);

  const selectedObserver = runRearVisibilityScenario('rear-observer', transmissionLossPerMeter);
  const selectedTarget = runRearVisibilityScenario('rear-target', transmissionLossPerMeter);

  assert.ok(Math.abs(selectedObserver.visualTransmission - selectedTarget.visualTransmission) < 1e-12,
    'selected-unit UI state must not change machine line-of-sight transmission');
  assert.ok(Math.abs(selectedObserver.contactEvidence - selectedTarget.contactEvidence) < 1e-12,
    'selected-unit UI state must not change rear-contact evidence');
  assert.ok(Math.abs(selectedObserver.nextRearCheckSeconds - selectedTarget.nextRearCheckSeconds) < 1e-12,
    'selected-unit UI state must not change movement-adjusted rear cadence');

  const perceptionSource = readFileSync('src/core/perception/PerceptionSystem.ts', 'utf8');
  assert.equal((perceptionSource.match(/getMovementObservationTargetMultiplier\(/g) ?? []).length, 1,
    'movement target-observation multiplier must be composed exactly once in the canonical perception pipeline');
  const lineOfSightSource = readFileSync('src/core/visibility/LineOfSight.ts', 'utf8');
  assert.equal((lineOfSightSource.match(/resolveCellVegetationDefinition\(/g) ?? []).length, 1,
    'environment visibility must be sampled exactly once by the canonical line-of-sight pipeline');
  const movementRuntimeSource = readFileSync('src/core/movement/MovementRuntime.ts', 'utf8');
  assert.doesNotMatch(movementRuntimeSource, /sampleAttentionWeight|REAR_SECTOR_START|computeLineOfSight/,
    'movement runtime must not introduce a second rear-awareness or visibility model');
}

function runRearVisibilityScenario(
  selectedUnitId: 'rear-observer' | 'rear-target',
  transmissionLossPerMeter: number,
): { visualTransmission: number; contactEvidence: number; nextRearCheckSeconds: number } {
  const state = createInitialState({
    width: 80, height: 10, cellSize: 16, metersPerCell: 2,
    defaultTerrain: 'field', defaultHeight: 0, objects: [],
  }, [
    {
      id: 'rear-observer', label: 'Rear observer', labelRu: 'Наблюдатель в движении',
      type: 'infantry_squad', side: 'blue', aiControl: 'manual',
      x: 30, y: 4, speedCellsPerSecond: 4, facingDegrees: 0, viewRangeCells: 100,
    },
    {
      id: 'rear-target', label: 'Rear target', labelRu: 'Контакт сзади',
      type: 'infantry_squad', side: 'red', aiControl: 'manual',
      x: 8, y: 4, speedCellsPerSecond: 0, facingDegrees: 180, viewRangeCells: 100,
    },
  ]);
  state.movementProfiles = createMovementProfileRegistry();
  installEnvironmentMovementMaterialProvider(state);
  state.selectedUnitId = selectedUnitId;
  state.selectedUnitIds = [selectedUnitId];

  for (let x = 18; x <= 22; x += 1) {
    const cell = getCell(state.map, x, 4);
    assert.ok(cell);
    setCellVegetationMaterialId(cell, 'sparse_forest');
  }

  const observer = state.units.find((unit) => unit.id === 'rear-observer');
  const target = state.units.find((unit) => unit.id === 'rear-target');
  assert.ok(observer && target);
  setMovementProfileRequest(state, observer, 'run', 'unit_role');
  observer.order = planOrThrow(state, observer, { x: 55.5, y: 4.5 });
  tickSimulation(state, 0.1);
  assert.equal(observer.movementRuntime.isMoving, true);
  assert.equal(observer.movementRuntime.effectiveProfileId, 'run');

  const lineOfSight = computeLineOfSight(state.map, observer, target.position);
  assert.equal(lineOfSight.blocked, false);
  assert.ok(lineOfSight.accumulatedForestMeters > 0);
  const expectedTransmission = Math.exp(-transmissionLossPerMeter * lineOfSight.accumulatedForestMeters);
  assert.ok(Math.abs(lineOfSight.visualTransmission - expectedTransmission) < 1e-12,
    'environment visibility multiplier must be applied once, not squared or duplicated');

  observer.perceptionKnowledge = createEmptyPerceptionKnowledge();
  observer.attentionRuntime.nextFocusCheckSeconds = Number.POSITIVE_INFINITY;
  observer.attentionRuntime.nextDirectCheckSeconds = Number.POSITIVE_INFINITY;
  observer.attentionRuntime.nextPeripheralCheckSeconds = Number.POSITIVE_INFINITY;
  observer.attentionRuntime.nextRearCheckSeconds = 0;
  const now = state.simulationTimeSeconds;
  tickUnitPerception(state, observer, 0.1);

  const baseRearInterval = observer.attentionSettings.profiles[observer.attentionRuntime.mode].rearCheckIntervalSeconds;
  const diagnostics = observer.movementRuntime.diagnostics;
  const expectedRearInterval = baseRearInterval / Math.max(
    0.05,
    diagnostics.observationRearMultiplier * diagnostics.observationScanSpeedMultiplier,
  );
  assert.ok(Math.abs(observer.attentionRuntime.nextRearCheckSeconds - (now + expectedRearInterval)) < 1e-12,
    'movement rear-awareness and scan-speed modifiers must be applied exactly once');

  const contact = observer.perceptionKnowledge.contacts.find((candidate) => candidate.sourceUnitId === target.id);
  assert.ok(contact, 'a due rear check must reach the canonical visual-contact pipeline while moving');
  assert.equal(contact.source, 'visual');
  assert.ok(contact.explanationRu.some((line) => line.includes('Тыл проверяется')),
    'rear contact must retain canonical rear-cadence diagnostics');

  return {
    visualTransmission: lineOfSight.visualTransmission,
    contactEvidence: contact.evidence,
    nextRearCheckSeconds: observer.attentionRuntime.nextRearCheckSeconds,
  };
}

function planOrThrow(state: SimulationState, unit: UnitModel, target: { x: number; y: number }) {
  const planned = planMoveOrder(state.map, unit.position, target, {
    source: 'player', movementProfileId: unit.movementRuntime.requestedProfileId,
    movementProfileSource: unit.movementRuntime.requestedProfileSource,
  });
  assert.equal(planned.ok, true);
  if (!planned.ok) throw new Error(planned.reasonRu);
  return planned.order;
}

function runtimeMemory(unit: UnitModel): Record<string, AiBlackboardValue> {
  const runtime = unit.behaviorRuntime as UnitModel['behaviorRuntime'] & { aiGraphMemory?: Record<string, AiBlackboardValue> };
  if (runtime.aiRuntimeSession) return runtime.aiRuntimeSession.blackboardMemory;
  runtime.aiGraphMemory ??= {};
  return runtime.aiGraphMemory;
}

function applyUpdates(memory: Record<string, AiBlackboardValue>, updates: readonly { key: string; value: AiBlackboardValue }[]): void {
  for (const update of updates) memory[update.key] = update.value;
}

function registryEntries(registry: MovementProfileRegistry) {
  return registry.listProfiles().map((profile) => ({ id: profile.id, revision: profile.revision }));
}

function makeState(): SimulationState {
  const state = createInitialState(mapData(), [unitData()]);
  state.movementProfiles = createMovementProfileRegistry();
  return state;
}

function mapData(): TacticalMapData {
  return {
    width: 200, height: 8, cellSize: 16, metersPerCell: 2,
    defaultTerrain: 'field', defaultHeight: 0, objects: [],
  };
}

function unitData(): UnitData {
  return {
    id: 'integration-mover', label: 'Integration mover', labelRu: 'Интеграционный боец',
    type: 'infantry_squad', side: 'player', aiControl: 'manual',
    x: 1, y: 2, speedCellsPerSecond: 4, facingDegrees: 0,
  };
}
