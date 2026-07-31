import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent extends Event {
    constructor(type, init = {}) {
      super(type, init);
      this.detail = init.detail;
    }
  };
}

const paths = [
  'src/combat-lab/parameters/CombatLabQuickParameterTypes.ts',
  'src/combat-lab/parameters/CombatLabQuickParameterRegistry.ts',
  'src/combat-lab/parameters/CombatLabParticipantParameterMutations.ts',
  'src/combat-lab/parameters/CombatLabQuickParameterPreferencesStore.ts',
  'src/combat-lab/parameters/CombatLabQuickParameterPresets.ts',
  'src/combat-lab/ui/CombatLabQuickParametersPanel.ts',
  'src/combat-lab/runtime/CombatLabResetAndStart.ts',
];
const sources = await Promise.all(paths.map((path) => readFile(path, 'utf8')));
const resetSource = stripImports(sources.at(-1)).replace(/\bisRecord\b/g, 'isResetAndStartRecord');
const source = `function resolveProductionAimFactors(){return {aimQualityPerSecond:0.5};}\n${sources.slice(0, -1).map(stripImports).join('\n')}\n${resetSource}`;
const module = await compile(source);

class MemoryStorage {
  map = new Map();
  getItem(key) { return this.map.get(key) ?? null; }
  setItem(key, value) { this.map.set(key, value); }
  removeItem(key) { this.map.delete(key); }
}

for (const status of ['completed', 'failed', 'stopped', 'ready']) {
  const harness = createHarness({ status, portMode: 'mutate' });
  const revisionBefore = harness.experiment().revision;
  const defaultsBefore = structuredClone(harness.experiment().defaults);
  const batchBefore = structuredClone(harness.experiment().batchDefaults);
  const result = module.applyCombatLabQuickParametersAndRerun({
    model: harness.model,
    runtimeSnapshot: null,
    visualSnapshot: { seed: 99 },
    onResetAndStart: harness.requestResetAndStart,
  });
  assert.equal(result.changed, false, `${status}: no-dirty Apply must report no experiment mutation.`);
  assert.equal(harness.experiment().revision, revisionBefore, `${status}: reset must not create an experiment revision.`);
  assert.deepEqual(harness.controller.resetSeeds, [99], `${status}: explicit reset must preserve the visual seed.`);
  assert.equal(harness.controller.startCount, 1, `${status}: one clean run must start.`);
  assert.equal(harness.controller.status, 'running', `${status}: terminal/ready state must become a running clean run.`);
  assert.deepEqual(harness.experiment().defaults, defaultsBefore, `${status}: experiment defaults must remain unchanged.`);
  assert.deepEqual(harness.experiment().batchDefaults, batchBefore, `${status}: batch seed policy must remain unchanged.`);
}

{
  const harness = createHarness({ status: 'completed', portMode: 'mutate' });
  harness.model.setValue('accuracy.shooting_skill', 80);
  const revisionBefore = harness.experiment().revision;
  const defaultsBefore = structuredClone(harness.experiment().defaults);
  const batchBefore = structuredClone(harness.experiment().batchDefaults);
  const result = module.applyCombatLabQuickParametersAndRerun({
    model: harness.model,
    runtimeSnapshot: null,
    visualSnapshot: { seed: 99 },
    onResetAndStart: harness.requestResetAndStart,
  });
  assert.equal(result.changed, true, 'Dirty Apply must report a real participant mutation.');
  assert.equal(harness.experiment().revision, revisionBefore + 1, 'Dirty Apply must create exactly one experiment revision.');
  assert.deepEqual(
    harness.controller.resetSeeds,
    [21, 99],
    'Experiment-change reset may prepare the default seed, but the explicit clean rerun must restore the current visual seed.',
  );
  assert.equal(harness.controller.startCount, 1, 'Dirty Apply must start exactly one run.');
  assert.equal(harness.controller.status, 'running');
  assert.equal(harness.controller.seed, 99);
  assert.deepEqual(harness.experiment().defaults, defaultsBefore);
  assert.deepEqual(harness.experiment().batchDefaults, batchBefore);
}

{
  const harness = createHarness({ status: 'failed', portMode: 'same' });
  harness.model.setValue('accuracy.shooting_skill', 80);
  const revisionBefore = harness.experiment().revision;
  const result = module.applyCombatLabQuickParametersAndRerun({
    model: harness.model,
    runtimeSnapshot: null,
    visualSnapshot: { seed: 77 },
    onResetAndStart: harness.requestResetAndStart,
  });
  assert.equal(result.changed, false, 'Dirty input whose effective experiment is unchanged must report changed=false.');
  assert.equal(harness.experiment().revision, revisionBefore);
  assert.deepEqual(harness.controller.resetSeeds, [77], 'Same-effective Apply must still perform an explicit reset.');
  assert.equal(harness.controller.startCount, 1, 'Same-effective Apply must not become a no-op.');
  assert.equal(harness.controller.status, 'running');
}

{
  const harness = createHarness({ status: 'paused', portMode: 'mutate' });
  harness.model.setLocked(true);
  harness.model.setValue('accuracy.shooting_skill', 80);
  const result = module.applyCombatLabQuickParametersAndRerun({
    model: harness.model,
    runtimeSnapshot: null,
    visualSnapshot: { seed: 99 },
    onResetAndStart: harness.requestResetAndStart,
  });
  assert.equal(result, null, 'Structural lock must reject Apply and rerun.');
  assert.deepEqual(harness.controller.resetSeeds, []);
  assert.equal(harness.controller.startCount, 0);
}

{
  const controller = createController('completed');
  const executed = module.executeCombatLabResetAndStart(controller, { seed: 55 }, () => false);
  assert.equal(executed, false, 'Extension guard must reject reset-and-start while locked or invalid.');
  assert.deepEqual(controller.resetSeeds, []);
  assert.equal(controller.startCount, 0);
}

console.log('Combat Lab quick parameters rerun behavior smoke passed.');

function createHarness({ status, portMode }) {
  let experiment = {
    experimentId: 'exp-rerun',
    revision: 8,
    defaults: {
      seed: 21,
      accuracyOverrides: null,
      stepTimeoutSeconds: 30,
      failurePolicy: 'stop_experiment',
      repeat: { kind: 'once', maximumAttempts: 1, retryDelaySeconds: 0 },
    },
    batchDefaults: {
      runCount: 100,
      seedStrategy: { kind: 'sequential', firstSeed: 501 },
      maximumSimulationSeconds: 120,
      workerCount: 1,
      representativeRunCount: 5,
      metricIds: ['hits'],
    },
    roles: [
      { roleId: 'fighter', unitId: 'unit-fighter', titleRu: 'Стрелок', parameters: { schemaVersion: 1, accuracy: null } },
    ],
  };
  const unit = {
    side: 'blue',
    infantryCombatRuntime: {
      primaryWeapon: {
        resolved: { weapon: { weaponClass: 'rifle' } },
        operatorProfile: {
          shootingSkill: 0.5,
          proficiencyByWeaponClass: { rifle: 'trained' },
        },
      },
    },
  };
  const controller = createController(status);
  const contextFor = (roleId) => ({
    experiment,
    role: experiment.roles.find((role) => role.roleId === roleId),
    state: {},
    unit,
  });
  const port = {
    get: contextFor,
    update(roleId, mutation) {
      const requested = mutation(contextFor(roleId));
      if (!requested || portMode === 'same') return experiment;
      experiment = {
        ...experiment,
        revision: experiment.revision + 1,
        roles: experiment.roles.map((role) => role.roleId === roleId ? { ...role, ...requested.rolePatch } : role),
      };
      controller.reset(experiment.defaults.seed);
      return experiment;
    },
  };
  const services = {
    participantMutations: port,
    selection: { get: () => ({ kind: 'participant', roleId: 'fighter', unitId: 'unit-fighter' }), subscribe: () => () => {} },
    draft: { subscribe: () => () => {} },
  };
  const preferences = new module.CombatLabQuickParameterPreferencesStore({ storage: new MemoryStorage() });
  const model = new module.CombatLabQuickParametersPanelModel(services, preferences);
  model.select(services.selection.get());
  const eventTarget = new EventTarget();
  eventTarget.addEventListener(module.COMBAT_LAB_RESET_AND_START_EVENT, (event) => {
    const request = module.readCombatLabResetAndStartRequest(event);
    assert.ok(request, 'Typed reset-and-start event must carry a valid request.');
    module.executeCombatLabResetAndStart(controller, request, () => true);
  });
  return {
    model,
    controller,
    experiment: () => experiment,
    requestResetAndStart: (seed) => module.requestCombatLabResetAndStart(eventTarget, seed),
  };
}

function createController(status) {
  return {
    status,
    seed: null,
    visualRevision: 0,
    resetSeeds: [],
    startCount: 0,
    reset(seed) {
      this.seed = seed;
      this.resetSeeds.push(seed);
      this.visualRevision += 1;
      this.status = 'ready';
    },
    start() {
      if (['completed', 'failed', 'stopped'].includes(this.status)) return;
      this.startCount += 1;
      this.status = 'running';
    },
  };
}

function stripImports(value) {
  return value
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\n/mg, '')
    .replace(/^import ['"][^'"]+['"];?\n/mg, '');
}

async function compile(source) {
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}
