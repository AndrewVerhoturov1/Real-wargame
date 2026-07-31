import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
const nativeRequire = createRequire(import.meta.url);
const ts = (() => {
  try { return nativeRequire('typescript'); }
  catch (error) {
    const globalCandidate = resolve(dirname(process.execPath), '../lib/node_modules/typescript/lib/typescript.js');
    if (existsSync(globalCandidate)) return nativeRequire(globalCandidate);
    throw error;
  }
})();

export function loadTypescriptModule(entryPath, stubs = {}) {
  const cache = new Map();
  const load = (filePath) => {
    const absolute = resolve(filePath);
    if (absolute.endsWith('.json')) return JSON.parse(readFileSync(absolute, 'utf8'));
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const source = readFileSync(absolute, 'utf8');
    const compiled = ts.transpileModule(source, {
      fileName: absolute,
      reportDiagnostics: true,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        resolveJsonModule: true,
        moduleResolution: ts.ModuleResolutionKind.Node10,
      },
    });
    const errors = (compiled.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
    assert.equal(errors.length, 0, errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')).join('\n'));
    const module = { exports: {} };
    cache.set(absolute, module);
    const localRequire = (specifier) => {
      if (Object.prototype.hasOwnProperty.call(stubs, specifier)) {
        const stub = stubs[specifier];
        return typeof stub === 'function' && stub.__stubFactory === true ? stub() : stub;
      }
      if (specifier.endsWith('.css')) return {};
      if (specifier.startsWith('.')) {
        const base = resolve(dirname(absolute), specifier);
        for (const candidate of [base, `${base}.ts`, `${base}.mjs`, resolve(base, 'index.ts')]) {
          if (!existsSync(candidate)) continue;
          if (candidate.endsWith('.json')) return JSON.parse(readFileSync(candidate, 'utf8'));
          return load(candidate);
        }
      }
      return nativeRequire(specifier);
    };
    const execute = new Function('require', 'module', 'exports', '__filename', '__dirname', compiled.outputText);
    execute(localRequire, module, module.exports, absolute, dirname(absolute));
    return module.exports;
  };
  return load(entryPath);
}

export function stableDigest(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}

export function accuracy(seed = 11, dispersionMultiplier = 1) {
  return {
    schemaVersion: 1,
    dispersionMultiplier,
    aimTimeSeconds: 1.5,
    physicalAimThreshold: 0.5,
    shootingSkill: 0.6,
    weaponProficiency: 'trained',
    randomnessMultiplier: 1,
    randomSeed: seed,
    usePhysicalAimThreshold: true,
  };
}

export function makeExperiment({ roles, tracks = [], defaultsAccuracy = null, revision = 1, units } = {}) {
  const selectedRoles = roles ?? [{ roleId: 'shooter', unitId: 'unit-shooter', titleRu: 'Стрелок', parameters: { schemaVersion: 1, accuracy: null } }];
  const selectedUnits = units ?? selectedRoles.map((role, index) => makeSceneUnit(role.unitId, index));
  return {
    schemaVersion: 1,
    experimentId: 'participant-behavior-test',
    revision,
    titleRu: 'Проверка',
    descriptionRu: '',
    baseScenarioId: null,
    sceneSnapshot: {
      version: 'test',
      exportedAt: '2026-01-01T00:00:00.000Z',
      noteRu: '',
      simulationTimeSeconds: 0,
      infantryCombatRuntime: {},
      map: {
        width: 64,
        height: 64,
        cellSize: 1,
        metersPerCell: 2,
        defaultTerrain: 'field',
        defaultHeight: 0,
        environmentProfileId: 'default',
        heightMap: [],
        forestMap: [],
        surfaceMaterialMap: [],
        vegetationMaterialMap: [],
        objects: [],
      },
      environmentProfiles: {},
      movementProfiles: {},
      units: selectedUnits,
      pressureZones: [],
    },
    roles: selectedRoles,
    markers: [],
    tracks,
    defaults: {
      seed: 17,
      stepTimeoutSeconds: 10,
      failurePolicy: 'stop_experiment',
      repeat: { kind: 'once', maximumAttempts: 1, retryDelaySeconds: 0 },
      accuracyOverrides: defaultsAccuracy,
    },
    successCondition: { kind: 'always' },
    stopCondition: { kind: 'program_complete', maximumSimulationSeconds: 30 },
    batchDefaults: {
      runCount: 1,
      seedStrategy: { kind: 'fixed', seed: 17 },
      maximumSimulationSeconds: 30,
      workerCount: 1,
      representativeRunCount: 1,
      metricIds: [],
    },
  };
}

export function makeFireStep(stepId, actorRoleId, overrides = null) {
  return {
    stepId,
    titleRu: stepId,
    enabled: true,
    breakpointBefore: false,
    startCondition: { kind: 'always' },
    action: {
      kind: 'fire',
      actorRoleId,
      target: { kind: 'marker', markerId: 'target' },
      mode: 'single',
      targetRadiusMetres: 0.3,
      minimumSolutionQuality: 0,
      minimumPerceptionQuality: 0,
      forceFire: true,
    },
    completion: { kind: 'production_action' },
    repeat: { kind: 'once', maximumAttempts: 1, retryDelaySeconds: 0 },
    timeoutSeconds: 5,
    failurePolicy: 'stop_experiment',
    accuracyOverrides: overrides,
  };
}

export function makeSceneUnit(id, index = 0) {
  return {
    id,
    label: id,
    labelRu: id,
    type: 'infantry_squad',
    side: 'blue',
    aiControl: 'manual',
    x: 2 + index,
    y: 3 + index,
    facingDegrees: 0,
    initialState: { posture: 'standing', health: 100 },
    runtime: {
      posture: 'standing',
      physicalAction: { status: 'running', id: `${id}:posture` },
      moveOrder: { id: `${id}:move` },
      infantryCombat: {
        activeFireTask: { taskId: `${id}:fire` },
        ammoInventory: { activeReload: { actionId: `${id}:reload` } },
        medical: { activeFirstAidAction: { actionId: `${id}:aid` } },
      },
    },
  };
}

export class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.className = '';
    this.textContent = '';
    this.value = '';
    this.disabled = false;
    this.type = '';
    this.listeners = new Map();
    this.classList = {
      add: (...names) => { for (const name of names) this.#setClass(name, true); },
      remove: (...names) => { for (const name of names) this.#setClass(name, false); },
      toggle: (name, force) => { this.#setClass(name, force ?? !this.className.split(/\s+/).includes(name)); },
    };
  }
  #setClass(name, enabled) {
    const names = new Set(this.className.split(/\s+/).filter(Boolean));
    if (enabled) names.add(name); else names.delete(name);
    this.className = [...names].join(' ');
  }
  append(...children) { for (const child of children) { if (!child) continue; child.parentNode = this; this.children.push(child); } }
  prepend(...children) { for (const child of [...children].reverse()) { child.parentNode = this; this.children.unshift(child); } }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  remove() { if (!this.parentNode) return; this.parentNode.children = this.parentNode.children.filter((child) => child !== this); this.parentNode = null; }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  closest(selector) { return selector === 'button' && this.tagName === 'BUTTON' ? this : null; }
  showModal() {}
  close() { this.listeners.get('close')?.({ target: this }); }
}

export function installFakeDom() {
  const body = new FakeElement('body');
  globalThis.document = {
    body,
    createElement: (tag) => new FakeElement(tag),
  };
  globalThis.window = { confirm: () => true };
  return { body };
}