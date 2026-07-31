import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const [summarySource, managerSource] = await Promise.all([
  readFile('src/combat-lab/scenario-editor/CombatLabMarkerReferenceSummary.ts', 'utf8'),
  readFile('src/combat-lab/scenario-editor/CombatLabMarkerManager.ts', 'utf8'),
]);
const source = `${stripImports(summarySource)}\n${stripImports(managerSource)}`;
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const module = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const { buildCombatLabMarkerReferenceSummary, createCombatLabMarkerCascadeResult, CombatLabMarkerEditTransaction } = module;

verifyReferenceSummary();
verifyCompleteMarkerCascade();
verifyTopLevelTransitiveDependencies();
verifyMarkerEditTransactions();

console.log('Combat Lab marker authoring behavior smoke passed.');

function verifyReferenceSummary() {
  const experiment = sampleReferenceExperiment();
  const summary = buildCombatLabMarkerReferenceSummary(experiment, 'marker-a');
  assert.equal(summary.references.length, 2);
  assert.deepEqual(summary.references.map((item) => item.location), ['action_target', 'action_target']);
  assert.match(summary.messageRu, /Дорожка огня/);
  assert.match(summary.messageRu, /Дорожка движения/);
}

function verifyCompleteMarkerCascade() {
  const experiment = sampleCascadeExperiment();
  const unrelatedTrackBefore = structuredClone(experiment.tracks.find((track) => track.trackId === 'track-unrelated'));
  const unrelatedMarkerBefore = structuredClone(experiment.markers.find((marker) => marker.markerId === 'marker-b'));
  const defaultsBefore = structuredClone(experiment.defaults);
  const batchDefaultsBefore = structuredClone(experiment.batchDefaults);
  const rolesBefore = structuredClone(experiment.roles);
  const sceneSnapshotBefore = structuredClone(experiment.sceneSnapshot);

  const cascade = createCombatLabMarkerCascadeResult(experiment, 'marker-a');
  const remainingStepIds = cascade.tracks.flatMap((track) => track.steps.map((step) => step.stepId));

  for (const removedStepId of [
    'action-reference',
    'start-reference',
    'completion-reference',
    'repeat-reference',
    'dependent-b',
    'dependent-c',
  ]) {
    assert.equal(remainingStepIds.includes(removedStepId), false, `${removedStepId} must be removed by cascade.`);
  }

  assert.deepEqual(cascade.successCondition, { kind: 'always' }, 'Direct success marker reference must reset to always.');
  assert.deepEqual(cascade.stopCondition, {
    kind: 'program_complete',
    maximumSimulationSeconds: 117,
  }, 'Direct stop marker reference must reset while preserving maximum duration.');

  assert.deepEqual(
    cascade.tracks.find((track) => track.trackId === 'track-unrelated'),
    unrelatedTrackBefore,
    'Unrelated track and conditions must remain deep-equal.',
  );
  assert.deepEqual(cascade.markers, [unrelatedMarkerBefore], 'Only the requested marker must be removed.');
  assert.deepEqual(cascade.defaults, defaultsBefore);
  assert.deepEqual(cascade.batchDefaults, batchDefaultsBefore);
  assert.deepEqual(cascade.roles, rolesBefore);
  assert.deepEqual(cascade.sceneSnapshot, sceneSnapshotBefore);
  assert.equal(cascade.revision, experiment.revision + 1, 'One cascade command increments revision exactly once.');
  assertMarkerReferenceAbsent(cascade, 'marker-a');
}

function verifyTopLevelTransitiveDependencies() {
  const experiment = sampleTopLevelTransitiveExperiment();
  const cascade = createCombatLabMarkerCascadeResult(experiment, 'marker-a');

  assert.deepEqual(cascade.tracks.map((track) => track.steps.length), [0, 0, 0]);
  assert.deepEqual(cascade.successCondition, { kind: 'always' }, 'Success depending on transitively removed step must reset.');
  assert.deepEqual(cascade.stopCondition, {
    kind: 'program_complete',
    maximumSimulationSeconds: 93,
  }, 'Stop depending on removed step must reset and preserve maximum duration.');
  assert.equal(cascade.revision, experiment.revision + 1);
  assertMarkerReferenceAbsent(cascade, 'marker-a');
}

function verifyMarkerEditTransactions() {
  const experiment = sampleReferenceExperiment();
  let committed = null;
  let preview = null;
  const original = experiment.markers[0];
  const cancelled = new CombatLabMarkerEditTransaction(original, {
    onPreview: (marker) => { preview = marker; },
    onCommit: (marker) => { committed = marker; },
    onClearPreview: () => { preview = null; },
  });
  cancelled.preview({ xMetres: 20, yMetres: 30 });
  assert.equal(preview.xMetres, 20);
  assert.equal(original.xMetres, 10, 'Preview must not mutate canonical marker.');
  cancelled.cancel();
  assert.equal(committed, null);
  assert.equal(preview, null);

  const confirmed = new CombatLabMarkerEditTransaction(original, {
    onPreview: (marker) => { preview = marker; },
    onCommit: (marker) => { committed = marker; },
    onClearPreview: () => { preview = null; },
  });
  confirmed.preview({ xMetres: 25, yMetres: 35 });
  confirmed.confirm();
  assert.equal(committed.markerId, original.markerId, 'Move keeps stable markerId.');
  assert.equal(committed.xMetres, 25);
  assert.equal(preview, null);
  confirmed.confirm();
  assert.equal(committed.xMetres, 25, 'Confirm is idempotent.');
}

function stripImports(value) {
  return value.replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/mg, '');
}

function assertMarkerReferenceAbsent(experiment, markerId) {
  for (const track of experiment.tracks) {
    for (const step of track.steps) {
      assert.equal(objectReferencesMarker(step.action, markerId), false, `${track.trackId}/${step.stepId} action has dangling markerId.`);
      assert.equal(objectReferencesMarker(step.startCondition, markerId), false, `${track.trackId}/${step.stepId} start has dangling markerId.`);
      if (step.completion.kind === 'condition') {
        assert.equal(objectReferencesMarker(step.completion.condition, markerId), false, `${track.trackId}/${step.stepId} completion has dangling markerId.`);
      }
      if (step.repeat.kind === 'until_condition') {
        assert.equal(objectReferencesMarker(step.repeat.condition, markerId), false, `${track.trackId}/${step.stepId} repeat has dangling markerId.`);
      }
    }
  }
  assert.equal(objectReferencesMarker(experiment.successCondition, markerId), false, 'Success condition has dangling markerId.');
  if (experiment.stopCondition.kind === 'condition') {
    assert.equal(objectReferencesMarker(experiment.stopCondition.condition, markerId), false, 'Stop condition has dangling markerId.');
  }
}

function objectReferencesMarker(value, markerId) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((item) => objectReferencesMarker(item, markerId));
  const record = value;
  if (record.markerId === markerId || record.finalFacingMarkerId === markerId) return true;
  return Object.values(record).some((item) => objectReferencesMarker(item, markerId));
}

function markerCondition(markerId) {
  return { kind: 'marker_reference_test', markerId };
}

function stepState(trackId, stepId) {
  return { kind: 'step_state', trackId, stepId, state: 'completed' };
}

function once() {
  return { kind: 'once', maximumAttempts: 1, retryDelaySeconds: 0 };
}

function waitStep(stepId, overrides = {}) {
  return {
    stepId,
    titleRu: stepId,
    enabled: true,
    breakpointBefore: false,
    startCondition: { kind: 'always' },
    action: { kind: 'wait', durationSeconds: 0.1 },
    completion: { kind: 'production_action' },
    repeat: once(),
    timeoutSeconds: 10,
    failurePolicy: 'stop_experiment',
    accuracyOverrides: null,
    ...overrides,
  };
}

function commonExperimentFields() {
  return {
    schemaVersion: 1,
    experimentId: 'cascade-test',
    titleRu: 'Проверка каскада',
    descriptionRu: 'Поведенческий тест',
    baseScenarioId: null,
    sceneSnapshot: {
      schemaVersion: 1,
      map: { width: 4, height: 4, cellSize: 16, metersPerCell: 2, cells: [] },
      units: [],
    },
    roles: [{
      roleId: 'shooter',
      unitId: 'unit-1',
      titleRu: 'Стрелок',
      parameters: { schemaVersion: 1, accuracy: null },
    }],
    defaults: {
      seed: 41,
      stepTimeoutSeconds: 12,
      failurePolicy: 'stop_experiment',
      repeat: once(),
      accuracyOverrides: null,
    },
    batchDefaults: {
      runCount: 5,
      seedStrategy: { kind: 'fixed', seed: 41 },
      maximumSimulationSeconds: 117,
      workerCount: 1,
      representativeRunCount: 1,
      metricIds: [],
    },
  };
}

function sampleReferenceExperiment() {
  return {
    revision: 7,
    markers: [{ markerId: 'marker-a', kind: 'point', titleRu: 'Точка А', xMetres: 10, yMetres: 12, zMetres: 0 }],
    tracks: [
      { trackId: 'track-fire', titleRu: 'Дорожка огня', actorRoleId: 'shooter', enabled: true, steps: [{ stepId: 'fire-a', titleRu: 'Огонь по точке', startCondition: { kind: 'always' }, completion: { kind: 'shot_resolved' }, repeat: { kind: 'once' }, action: { kind: 'fire', actorRoleId: 'shooter', target: { kind: 'marker', markerId: 'marker-a' } } }] },
      { trackId: 'track-move', titleRu: 'Дорожка движения', actorRoleId: 'target', enabled: true, steps: [{ stepId: 'move-a', titleRu: 'Идти к точке', startCondition: { kind: 'always' }, completion: { kind: 'production_action' }, repeat: { kind: 'once' }, action: { kind: 'move', actorRoleId: 'target', markerId: 'marker-a' } }] },
    ],
    successCondition: { kind: 'always' },
    stopCondition: { kind: 'program_complete', maximumSimulationSeconds: 60 },
  };
}

function sampleCascadeExperiment() {
  const common = commonExperimentFields();
  return {
    ...common,
    revision: 17,
    markers: [
      { markerId: 'marker-a', kind: 'point', titleRu: 'Удаляемая', xMetres: 10, yMetres: 12, zMetres: 0 },
      { markerId: 'marker-b', kind: 'circle', titleRu: 'Независимая', xMetres: 30, yMetres: 32, zMetres: 0, radiusMetres: 4 },
    ],
    tracks: [
      {
        trackId: 'track-direct',
        titleRu: 'Прямые ссылки',
        actorRoleId: 'shooter',
        enabled: true,
        steps: [
          waitStep('action-reference', { action: { kind: 'face', actorRoleId: 'shooter', markerId: 'marker-a' } }),
          waitStep('start-reference', { startCondition: markerCondition('marker-a') }),
          waitStep('completion-reference', { completion: { kind: 'condition', condition: markerCondition('marker-a') } }),
          waitStep('repeat-reference', {
            repeat: {
              kind: 'until_condition',
              condition: markerCondition('marker-a'),
              maximumAttempts: 3,
              retryDelaySeconds: 0.5,
            },
          }),
          waitStep('dependent-b', { startCondition: stepState('track-direct', 'action-reference') }),
        ],
      },
      {
        trackId: 'track-transitive',
        titleRu: 'Транзитивная ссылка',
        actorRoleId: 'shooter',
        enabled: true,
        steps: [waitStep('dependent-c', {
          completion: { kind: 'condition', condition: stepState('track-direct', 'dependent-b') },
        })],
      },
      {
        trackId: 'track-unrelated',
        titleRu: 'Независимая дорожка',
        actorRoleId: 'shooter',
        enabled: true,
        steps: [waitStep('unrelated-step', {
          action: { kind: 'face', actorRoleId: 'shooter', markerId: 'marker-b' },
          startCondition: { kind: 'elapsed', anchor: 'experiment_start', seconds: 2 },
          completion: { kind: 'condition', condition: { kind: 'role_state', roleId: 'shooter', state: 'capable' } },
        })],
      },
    ],
    successCondition: markerCondition('marker-a'),
    stopCondition: {
      kind: 'condition',
      maximumSimulationSeconds: 117,
      condition: markerCondition('marker-a'),
    },
  };
}

function sampleTopLevelTransitiveExperiment() {
  const common = commonExperimentFields();
  return {
    ...common,
    revision: 29,
    markers: [
      { markerId: 'marker-a', kind: 'point', titleRu: 'Удаляемая', xMetres: 10, yMetres: 12, zMetres: 0 },
      { markerId: 'marker-b', kind: 'point', titleRu: 'Независимая', xMetres: 20, yMetres: 22, zMetres: 0 },
    ],
    tracks: [
      {
        trackId: 'track-a', titleRu: 'A', actorRoleId: 'shooter', enabled: true,
        steps: [waitStep('step-a', { action: { kind: 'move', actorRoleId: 'shooter', markerId: 'marker-a' } })],
      },
      {
        trackId: 'track-b', titleRu: 'B', actorRoleId: 'shooter', enabled: true,
        steps: [waitStep('step-b', { startCondition: stepState('track-a', 'step-a') })],
      },
      {
        trackId: 'track-c', titleRu: 'C', actorRoleId: 'shooter', enabled: true,
        steps: [waitStep('step-c', { startCondition: stepState('track-b', 'step-b') })],
      },
    ],
    successCondition: stepState('track-c', 'step-c'),
    stopCondition: {
      kind: 'condition',
      maximumSimulationSeconds: 93,
      condition: stepState('track-b', 'step-b'),
    },
  };
}
