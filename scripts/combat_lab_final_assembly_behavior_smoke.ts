import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import {
  buildCombatLabBuiltInExperiment,
  digestCombatLabExperiment,
  listCombatLabScenarioDefinitions,
  parseCombatLabExperiment,
  readCombatLabParticipantInitialDraft,
  serializeCombatLabExperiment,
  updateCombatLabParticipantInitialState,
  type CombatLabExperimentV1,
  type CombatLabMarkerV1,
} from '../src/core/testing/combat-lab';
import { CombatLabMapToolCoordinator } from '../src/combat-lab/map-tools/CombatLabMapToolCoordinator';
import type {
  CombatLabMapToolPointerV1,
  CombatLabTemporaryMapToolModeV1,
} from '../src/combat-lab/map-tools/CombatLabMapToolTypes';
import { CombatLabRenderer } from '../src/combat-lab/rendering/CombatLabRenderer';

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  await verifyCompositionSourceContracts();
  verifyRealComponentRegressions();
  verifyMapToolOwnership();
  verifyRendererCoexistence();
  verifyJsonRoundTripAndMutationIndependence();
  console.log('Combat Lab final assembly behavior smoke passed.');
}

async function verifyCompositionSourceContracts(): Promise<void> {
  const [extension, renderer, mapAuthoring, panel, scenePanel, roleEditor, quickPanel] = await Promise.all([
    readFile('src/combat-lab/CombatLabExtension.ts', 'utf8'),
    readFile('src/combat-lab/rendering/CombatLabRenderer.ts', 'utf8'),
    readFile('src/combat-lab/scenario-editor/CombatLabMapAuthoringController.ts', 'utf8'),
    readFile('src/combat-lab/scenario-editor/CombatLabScenarioEditorPanel.ts', 'utf8'),
    readFile('src/combat-lab/scenario-editor/CombatLabScenePanel.ts', 'utf8'),
    readFile('src/combat-lab/scenario-editor/CombatLabRoleEditor.ts', 'utf8'),
    readFile('src/combat-lab/ui/CombatLabQuickParametersPanel.ts', 'utf8'),
  ]);

  assert.match(extension, /mapTools:\s*this\.workspaceServices\.mapTools/,
    'Extension must pass the one shared map-tool coordinator to program authoring.');
  assert.match(extension, /selection:\s*this\.workspaceServices\.selection/,
    'Extension must pass canonical selection to program authoring.');
  assert.match(extension, /markerHost:\s*this\.editorPanel\.getMarkerHost\(\)/,
    'Extension must pass the marker host through a typed panel accessor.');
  assert.match(extension, /onMarkerPreviewChanged:\s*\(marker\)\s*=>\s*this\.renderer\.setMarkerPreview\(marker\)/,
    'Extension must wire marker preview directly to Renderer.');
  assert.match(extension, /selection\.subscribe\(\(selection\)\s*=>\s*\{[\s\S]*setMarkerSelection/,
    'Extension must relay canonical marker selection to Renderer.');
  assert.match(panel, /getMarkerHost\(\):\s*HTMLElement/,
    'Scenario panel must expose the marker host through a typed accessor.');

  assert.doesNotMatch(mapAuthoring, /getCombatLabWorkspaceServices/,
    'Map authoring must not discover services through the DOM registry.');
  assert.doesNotMatch(mapAuthoring, /document\.querySelector<HTMLElement>\('\.combat-lab-workspace'\)/,
    'Map authoring must not locate the workspace by CSS.');
  assert.doesNotMatch(mapAuthoring, /combat-lab:marker-preview/,
    'Marker preview must not use a custom DOM event bridge.');
  for (const dependency of ['mapTools', 'selection', 'markerHost', 'onMarkerPreviewChanged']) {
    assert.match(mapAuthoring, new RegExp(`readonly ${dependency}:`),
      `Map authoring dependency ${dependency} must be explicit and required.`);
  }

  assert.doesNotMatch(renderer, /document\.querySelector\('\.combat-lab-workspace'\)/);
  assert.doesNotMatch(renderer, /getCombatLabWorkspaceServices/);
  assert.doesNotMatch(renderer, /combat-lab:marker-preview/);
  assert.match(renderer, /CombatLabDiagnosticOverlayRenderer/);
  assert.match(renderer, /CombatLabScenarioAuthoringOverlayRenderer/);
  assert.match(renderer, /CombatLabParticipantMapPreviewRenderer/);

  assert.match(scenePanel, /CombatLabRoleEditor/,
    'Scene tab must delegate participant UI to the role editor.');
  assert.match(roleEditor, /CombatLabUnifiedInspectorHost/,
    'Role editor must use the one shared production inspector.');
  assert.doesNotMatch(roleEditor, /createProductionUnitEditorSection/,
    'Role list must not mount a second full production editor.');
  assert.match(quickPanel, /titleRu/,
    'Quick parameters header must use a human-readable participant title.');
}


function verifyRealComponentRegressions(): void {
  for (const script of [
    'scripts/combat_lab_selection_controller_behavior_smoke.mjs',
    'scripts/combat_lab_map_tool_transaction_behavior_smoke.mjs',
    'scripts/combat_lab_marker_authoring_behavior_smoke.mjs',
    'scripts/combat_lab_participant_mutation_port_behavior_smoke.mjs',
    'scripts/combat_lab_quick_parameters_rerun_behavior_smoke.mjs',
  ]) {
    execFileSync(process.execPath, [script], { cwd: process.cwd(), stdio: 'pipe' });
  }
}

function verifyMapToolOwnership(): void {
  const coordinator = CombatLabMapToolCoordinator.create({
    initialPersistentMode: 'program_authoring',
    eventTarget: nullEventTarget(),
  });
  const mutations: string[] = [];
  const previews: string[] = [];
  const cancels: string[] = [];
  const unregister = (['place_participant', 'move_marker', 'rotate_participant', 'resize_circle_marker'] as const)
    .map((mode) => coordinator.registerContributor({
      mode,
      createTransaction: () => ({
        mode,
        preview: (pointer: CombatLabMapToolPointerV1) => previews.push(`${mode}:${pointer.xMetres}`),
        confirm: () => mutations.push(mode),
        cancel: () => cancels.push(mode),
      }),
    }));

  assert.equal(coordinator.getMode(), 'program_authoring');
  coordinator.begin('place_participant', {});
  coordinator.preview({ xMetres: 1, yMetres: 1 });
  assert.equal(mutations.length, 0, 'Participant preview must not mutate the experiment.');
  coordinator.cancel();
  assert.equal(coordinator.getMode(), 'program_authoring');

  coordinator.begin('move_marker', {});
  coordinator.preview({ xMetres: 2, yMetres: 2 });
  coordinator.confirm();
  assert.deepEqual(mutations, ['move_marker']);
  assert.equal(coordinator.getMode(), 'program_authoring');

  coordinator.begin('rotate_participant', {});
  coordinator.preview({ xMetres: 3, yMetres: 3 });
  coordinator.confirm();
  assert.deepEqual(mutations, ['move_marker', 'rotate_participant']);
  assert.equal(coordinator.getMode(), 'program_authoring');

  coordinator.begin('resize_circle_marker', {});
  coordinator.preview({ xMetres: 4, yMetres: 4 });
  coordinator.cancel();
  assert.equal(coordinator.getMode(), 'program_authoring');
  assert.deepEqual(cancels, ['place_participant', 'resize_circle_marker']);
  assert.equal(previews.length, 4);
  assert.equal(mutations.length, 2, 'Only the two confirmed tools may commit.');

  unregister.forEach((remove) => remove());
  coordinator.destroy();
}

function verifyRendererCoexistence(): void {
  const calls: string[] = [];
  const renderer = Object.create(CombatLabRenderer.prototype) as CombatLabRenderer & Record<string, unknown>;
  Object.assign(renderer, {
    destroyed: false,
    context: { forceRender: () => calls.push('render') },
    authoringOverlay: {
      setExperiment: () => calls.push('authoring:experiment'),
      setSelection: () => calls.push('authoring:step-selection'),
      setMarkerSelection: (markerId: string | null) => calls.push(`authoring:marker-selection:${markerId}`),
      setMarkerPreview: (marker: CombatLabMarkerV1 | null) => calls.push(`authoring:marker-preview:${marker?.markerId ?? 'none'}`),
      clear: () => calls.push('authoring:clear'),
      destroy: () => calls.push('authoring:destroy'),
    },
    participantPreviewOverlay: {
      setExperiment: () => calls.push('participant:experiment'),
      clear: () => calls.push('participant:clear'),
      destroy: () => calls.push('participant:destroy'),
    },
    overlay: { destroy: () => calls.push('diagnostic:destroy') },
    removeViewportStabilizer: () => calls.push('viewport:destroy'),
    removeLabTicker: () => calls.push('ticker:destroy'),
  });

  const scenario = listCombatLabScenarioDefinitions()[0];
  assert.ok(scenario);
  const experiment = buildCombatLabBuiltInExperiment(scenario.scenarioId, 12);
  renderer.setAuthoredExperiment(experiment);
  renderer.setMarkerSelection('marker-selected');
  renderer.setMarkerPreview({
    markerId: 'marker-preview', kind: 'point', titleRu: 'Предпросмотр', xMetres: 4, yMetres: 5, zMetres: 0,
  });
  assert.ok(calls.includes('participant:experiment'), 'Authored experiment must update participant preview.');
  assert.ok(calls.includes('authoring:marker-selection:marker-selected'));
  assert.ok(calls.includes('authoring:marker-preview:marker-preview'));
  assert.equal(calls.filter((value) => value === 'participant:experiment').length, 1,
    'Marker operations must not clear or replace participant preview.');

  renderer.clearAuthoringOverlay();
  assert.ok(calls.includes('authoring:clear'));
  assert.ok(calls.includes('participant:clear'));
  renderer.destroy();
  assert.ok(calls.includes('authoring:destroy'));
  assert.ok(calls.includes('participant:destroy'));
  assert.ok(calls.includes('diagnostic:destroy'));
}

function verifyJsonRoundTripAndMutationIndependence(): void {
  const scenario = listCombatLabScenarioDefinitions()[0];
  assert.ok(scenario);
  const base = buildCombatLabBuiltInExperiment(scenario.scenarioId, 41);
  const role = base.roles[0];
  assert.ok(role);
  const initial = readCombatLabParticipantInitialDraft(base, role.roleId);
  const graph = {
    version: 2 as const,
    id: 'final-assembly-graph',
    name: 'Final assembly graph',
    nameRu: 'Финальный граф',
    rootNodeId: 'root',
    nodes: [{ id: 'root', type: 'sequence' as const, title: 'Root', children: [] }],
  };
  const withParticipant = updateCombatLabParticipantInitialState(base, role.roleId, {
    x: initial.x + 2,
    y: initial.y + 4,
    facingDegrees: 225,
    aiBrain: { schemaVersion: 1, kind: 'graph', graphId: graph.id },
    aiGraphDefinition: graph,
  });
  const sceneSnapshot = {
    ...withParticipant.sceneSnapshot,
    map: { ...withParticipant.sceneSnapshot.map, metersPerCell: 2 },
  } as CombatLabExperimentV1['sceneSnapshot'] & { aiGraphCatalog?: unknown };
  const custom: CombatLabExperimentV1 = {
    ...withParticipant,
    revision: withParticipant.revision + 1,
    sceneSnapshot,
    roles: withParticipant.roles.map((candidate) => candidate.roleId === role.roleId ? {
      ...candidate,
      parameters: {
        schemaVersion: 1,
        accuracy: {
          dispersionMultiplier: 0.8,
          aimTimeSeconds: 1.2,
          physicalAimThreshold: 0.55,
          shootingSkill: 0.77,
          weaponProficiency: 'trained',
          randomnessMultiplier: 1,
          randomSeed: 123,
          usePhysicalAimThreshold: true,
        },
      },
    } : candidate),
    markers: [
      { markerId: 'point-exact', kind: 'point', titleRu: 'Точка', xMetres: 12, yMetres: 14, zMetres: 0 },
      { markerId: 'circle-exact', kind: 'circle', titleRu: 'Область', xMetres: 18, yMetres: 20, zMetres: 0, radiusMetres: 6 },
    ],
    tracks: [{
      trackId: 'track-exact', titleRu: 'Дорожка', actorRoleId: role.roleId, enabled: true,
      steps: [{
        stepId: 'step-exact', titleRu: 'Двигаться', enabled: true, breakpointBefore: false,
        startCondition: { kind: 'always' },
        action: { kind: 'move', actorRoleId: role.roleId, markerId: 'point-exact' },
        completion: { kind: 'production_action' },
        repeat: { kind: 'once', maximumAttempts: 1, retryDelaySeconds: 0 },
        timeoutSeconds: 30,
        failurePolicy: 'stop_experiment',
        accuracyOverrides: null,
      }],
    }],
    stopCondition: { kind: 'program_complete', maximumSimulationSeconds: 120 },
    batchDefaults: {
      ...withParticipant.batchDefaults,
      maximumSimulationSeconds: 120,
      seedStrategy: { kind: 'sequential', firstSeed: 41 },
    },
  };

  const digestBefore = digestCombatLabExperiment(custom);
  const parsed = parseCombatLabExperiment(serializeCombatLabExperiment(custom));
  assert.ok(parsed.experiment, parsed.issues.map((issue) => issue.messageRu).join('\n'));
  const restored = parsed.experiment!;
  const restoredParticipant = readCombatLabParticipantInitialDraft(restored, role.roleId);
  assert.equal(restored.sceneSnapshot.map.metersPerCell, 2);
  assert.equal(restored.stopCondition.maximumSimulationSeconds, 120);
  assert.deepEqual(restored.batchDefaults.seedStrategy, { kind: 'sequential', firstSeed: 41 });
  assert.deepEqual(restored.markers.map((marker) => marker.markerId), ['point-exact', 'circle-exact']);
  assert.equal(restored.tracks[0]?.steps[0]?.stepId, 'step-exact');
  assert.equal(restoredParticipant.aiBrain.kind, 'graph');
  assert.equal(restoredParticipant.aiBrain.graphId, graph.id);
  const restoredCatalog = (restored.sceneSnapshot as CombatLabExperimentV1['sceneSnapshot'] & { aiGraphCatalog?: { graphs?: readonly { id?: string }[] } }).aiGraphCatalog;
  assert.ok(restoredCatalog?.graphs?.some((candidate) => candidate.id === graph.id),
    'The exact custom Graph v2 definition must survive JSON round-trip.');
  assert.equal(restored.roles[0]?.parameters.accuracy?.shootingSkill, 0.77);
  assert.equal(digestCombatLabExperiment(restored), digestBefore,
    'Serialization must preserve the deterministic product digest.');

  const preferencesAndSnapshots = {
    quickParameterPreferences: { pinned: ['accuracy.shooting_skill'] },
    abSnapshots: [{ label: 'A', digest: 'not-product-state' }],
  };
  assert.equal(serializeCombatLabExperiment(custom).includes('quickParameterPreferences'), false);
  assert.equal(serializeCombatLabExperiment(custom).includes('abSnapshots'), false);
  assert.equal(digestCombatLabExperiment(custom), digestBefore);
  assert.ok(preferencesAndSnapshots.abSnapshots.length === 1,
    'UI-only state remains separate from experiment serialization and digest.');
}

function nullEventTarget(): {
  addEventListener(type: 'keydown', listener: EventListener): void;
  removeEventListener(type: 'keydown', listener: EventListener): void;
} {
  return { addEventListener: () => undefined, removeEventListener: () => undefined };
}

void (null as CombatLabTemporaryMapToolModeV1 | null);
