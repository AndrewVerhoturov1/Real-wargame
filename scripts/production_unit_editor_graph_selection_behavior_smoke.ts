import assert from 'node:assert/strict';
import {
  AI_GRAPH_CATALOG_STORAGE_KEY,
  createAiGraphCatalog,
  getInstalledAiGraphCatalog,
  installAiGraphCatalog,
  readAiGraphCatalogFromScene,
  resolveAiGraphCatalogEntry,
} from '../src/core/ai/AiGraphCatalog';
import type { AiGraph } from '../src/core/ai/AiGraph';
import { createInitialState } from '../src/core/simulation/SimulationState';
import {
  installUnitAiBrainBinding,
  readUnitAiBrainBinding,
  type UnitAiBrainBindingV1,
} from '../src/core/units/UnitAiBrainBinding';
import { installGameEditorWorkbench } from '../src/ui/GameEditorWorkbench';
import {
  createProductionUnitEditorPositionScale,
  createProductionUnitEditorSection,
  type ProductionUnitEditorAdapterV1,
  type ProductionUnitEditorGraphOptionV1,
  type ProductionUnitEditorPatchV1,
  type ProductionUnitEditorSnapshotV1,
} from '../src/ui/ProductionUnitEditor';
import { buildExportedScene } from '../src/ui/SceneExport';
import {
  findButton,
  findControlByLabel,
  installCombatLabBehaviorDom,
  walkElements,
} from './combat_lab_dom_behavior_test_support.mjs';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const graphA = graph('graph-alpha', 'Граф Альфа');
const graphB = graph('graph-bravo', 'Граф Браво');
const graphOptions = [option(graphA), option(graphB)] as const;

const { document, window } = installCombatLabBehaviorDom();
Object.assign(window, { setInterval: () => 0, clearInterval: () => undefined });
const storage = new MemoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

verifyManualToGraphSelection();
verifyGraphToManualToGraphSelection();
verifyMissingGraphSelection();
verifyNormalSceneInstalledCatalogAndExport();

console.log('Production unit editor Graph v2 selection behavior smoke passed.');

function verifyManualToGraphSelection(): void {
  const harness = renderSharedEditor({ schemaVersion: 1, kind: 'manual' });
  assert.equal(harness.graph.disabled, true, 'Manual binding must start with the graph select disabled.');
  assert.equal(harness.graph.value, '', 'Manual binding must start on the placeholder, not the first graph.');

  changeSelect(harness.mode, 'graph');
  assert.equal(harness.mode.value, 'graph', 'Graph v2 mode must remain selected while awaiting an exact graph.');
  assert.equal(harness.graph.disabled, false, 'Graph v2 mode must enable the graph select.');
  assert.equal(harness.graph.value, '', 'Switching mode must not silently select the first graph.');
  assert.equal(harness.patches.length, 0, 'Mode-only transition must not publish a binding mutation.');
  assert.match(harness.errors.at(-1) ?? '', /точный граф Graph v2/i, 'The editor must explain that an exact graph is required.');

  changeSelect(harness.graph, graphB.id);
  assert.equal(harness.patches.length, 1, 'Explicit exact graph selection must publish exactly one mutation.');
  assert.deepEqual(harness.patches[0], {
    aiBrain: { schemaVersion: 1, kind: 'graph', graphId: graphB.id },
    aiGraphDefinition: graphB,
  });
}

function verifyGraphToManualToGraphSelection(): void {
  const harness = renderSharedEditor({ schemaVersion: 1, kind: 'graph', graphId: graphA.id });
  assert.equal(harness.mode.value, 'graph');
  assert.equal(harness.graph.disabled, false);
  assert.equal(harness.graph.value, graphA.id, 'A valid exact graph binding must be selected initially.');

  changeSelect(harness.mode, 'manual');
  assert.equal(harness.patches.length, 1, 'Graph v2 → manual must publish exactly one mutation.');
  assert.deepEqual(harness.patches[0], { aiBrain: { schemaVersion: 1, kind: 'manual' } });
  assert.equal(harness.graph.disabled, true);
  assert.equal(harness.graph.value, '', 'Manual mode must clear the pending graph choice for a future explicit selection.');

  changeSelect(harness.mode, 'graph');
  assert.equal(harness.mode.value, 'graph');
  assert.equal(harness.graph.disabled, false, 'A second manual → Graph v2 transition must enable graph selection.');
  assert.equal(harness.graph.value, '', 'The second transition must still require an explicit graph choice.');
  assert.equal(harness.patches.length, 1, 'The second mode-only transition must not publish a mutation.');

  changeSelect(harness.graph, graphA.id);
  assert.equal(harness.patches.length, 2, 'The explicit second graph selection must publish one additional mutation.');
  assert.deepEqual(harness.patches[1], {
    aiBrain: { schemaVersion: 1, kind: 'graph', graphId: graphA.id },
    aiGraphDefinition: graphA,
  });
}

function verifyMissingGraphSelection(): void {
  const missingGraphId = 'missing-scene-graph';
  const harness = renderSharedEditor({ schemaVersion: 1, kind: 'graph', graphId: missingGraphId });
  const missingOption = harness.graph.children.find((child) => child.tagName === 'OPTION' && child.value === missingGraphId);
  assert.ok(missingOption, 'The exact missing graphId must remain visible as a diagnostic option.');
  assert.equal(missingOption.disabled, true);
  assert.match(missingOption.textContent, new RegExp(missingGraphId));
  assert.equal(harness.graph.value, missingGraphId, 'A missing binding must not fall back to another graph.');
  assert.notEqual(harness.graph.value, graphA.id);
  assert.equal(harness.patches.length, 0);

  changeSelect(harness.graph, graphA.id);
  assert.equal(harness.patches.length, 1, 'Explicit recovery from a missing graph must publish one mutation.');
  assert.deepEqual(harness.patches[0], {
    aiBrain: { schemaVersion: 1, kind: 'graph', graphId: graphA.id },
    aiGraphDefinition: graphA,
  });
}

function verifyNormalSceneInstalledCatalogAndExport(): void {
  storage.clear();
  const sceneGraph = graph('imported-normal-scene-graph', 'Импортированный граф обычной сцены');
  const state = createInitialState(
    { width: 12, height: 10, cellSize: 20, metersPerCell: 2, objects: [] },
    [{
      id: 'normal-scene-unit',
      label: 'Normal scene unit',
      labelRu: 'Боец импортированной сцены',
      type: 'infantry_squad',
      side: 'blue',
      x: 2,
      y: 3,
      aiControl: 'graph',
    }],
  );
  const unit = state.units[0];
  assert.ok(unit);
  state.selectedUnitId = unit.id;
  state.selectedUnitIds = [unit.id];
  installAiGraphCatalog(state, createAiGraphCatalog([sceneGraph]));
  installUnitAiBrainBinding(unit, { schemaVersion: 1, kind: 'graph', graphId: sceneGraph.id });

  let changedCount = 0;
  const first = installNormalWorkbench(state, () => { changedCount += 1; });
  const firstGraph = findControlByLabel(first.hud, 'Граф Graph v2') as HTMLSelectElement;
  const firstMode = findControlByLabel(first.hud, 'Управление') as HTMLSelectElement;
  const sceneOptions = optionElements(firstGraph).filter((entry) => entry.value === sceneGraph.id);
  assert.equal(sceneOptions.length, 1, 'The installed scene graph must appear exactly once with empty storage.');
  assert.equal(sceneOptions[0]?.textContent, `${sceneGraph.nameRu} · ${sceneGraph.id}`);
  assert.equal(firstMode.value, 'graph');
  assert.equal(firstGraph.value, sceneGraph.id, 'The exact imported normal-scene binding must be selected.');

  const name = findControlByLabel(first.hud, 'Имя') as HTMLInputElement;
  name.value = 'Боец после несвязанного изменения';
  name.dispatchEvent(new Event('change'));
  assert.equal(changedCount, 1);
  assert.equal(resolveAiGraphCatalogEntry(getInstalledAiGraphCatalog(state), sceneGraph.id).nameRu, sceneGraph.nameRu);
  assert.deepEqual(readUnitAiBrainBinding(unit), { schemaVersion: 1, kind: 'graph', graphId: sceneGraph.id });

  const exported = buildExportedScene(state);
  const exportedCatalog = readAiGraphCatalogFromScene(exported);
  assert.deepEqual(resolveAiGraphCatalogEntry(exportedCatalog, sceneGraph.id), sceneGraph);
  const exportedUnit = exported.units.find((entry) => entry.id === unit.id) as Record<string, unknown> | undefined;
  assert.ok(exportedUnit);
  assert.deepEqual(exportedUnit.aiBrain, { schemaVersion: 1, kind: 'graph', graphId: sceneGraph.id });

  const browserOnly = graph('browser-only-graph', 'Граф только браузера');
  const browserDuplicate = { ...sceneGraph, nameRu: 'Неверное имя из browser storage' };
  storage.setItem(AI_GRAPH_CATALOG_STORAGE_KEY, JSON.stringify({
    schemaVersion: 1,
    graphs: [browserDuplicate, browserOnly],
  }));
  const second = installNormalWorkbench(state, () => undefined);
  const secondGraph = findControlByLabel(second.hud, 'Граф Graph v2') as HTMLSelectElement;
  const mergedSceneOptions = optionElements(secondGraph).filter((entry) => entry.value === sceneGraph.id);
  assert.equal(mergedSceneOptions.length, 1, 'Scene and browser catalogs must deduplicate by exact graphId.');
  assert.equal(mergedSceneOptions[0]?.textContent, `${sceneGraph.nameRu} · ${sceneGraph.id}`, 'The installed scene definition must have priority.');
  assert.equal(optionElements(secondGraph).some((entry) => entry.value === browserOnly.id
    && entry.textContent === `${browserOnly.nameRu} · ${browserOnly.id}`), true, 'Browser-only graphs must remain merged into the normal editor.');
}

function renderSharedEditor(binding: UnitAiBrainBindingV1): {
  readonly root: HTMLElement;
  readonly mode: HTMLSelectElement;
  readonly graph: HTMLSelectElement;
  readonly patches: ProductionUnitEditorPatchV1[];
  readonly errors: string[];
} {
  const patches: ProductionUnitEditorPatchV1[] = [];
  const errors: string[] = [];
  const adapter: ProductionUnitEditorAdapterV1 = {
    mode: 'experiment_draft',
    positionScale: createProductionUnitEditorPositionScale(2),
    read: () => snapshot(binding),
    update: (patch) => { patches.push(patch); },
    listGraphOptions: () => graphOptions,
    onError: (messageRu) => { errors.push(messageRu); },
  };
  const root = createProductionUnitEditorSection(adapter, { showTitle: false, placementButtons: false });
  return {
    root,
    mode: findControlByLabel(root, 'Управление') as HTMLSelectElement,
    graph: findControlByLabel(root, 'Граф Graph v2') as HTMLSelectElement,
    patches,
    errors,
  };
}

function installNormalWorkbench(state: ReturnType<typeof createInitialState>, onChanged: () => void): {
  readonly hud: HTMLElement;
  readonly debugPanel: HTMLElement;
} {
  const hud = document.createElement('div');
  hud.setAttribute('id', 'hud');
  const debugPanel = document.createElement('div');
  hud.append(debugPanel);
  document.body.append(hud);
  installGameEditorWorkbench(debugPanel, state, onChanged);
  findButton(hud, 'Боец').click();
  return { hud, debugPanel };
}

function changeSelect(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event('change'));
}

function optionElements(select: HTMLSelectElement): Array<HTMLOptionElement & { readonly children: never[] }> {
  return walkElements(select).filter((element) => element.tagName === 'OPTION') as Array<HTMLOptionElement & { readonly children: never[] }>;
}

function option(value: AiGraph): ProductionUnitEditorGraphOptionV1 {
  return Object.freeze({ graphId: value.id, titleRu: value.nameRu ?? value.name, graph: value });
}

function graph(id: string, nameRu: string): AiGraph {
  return {
    version: 2,
    id,
    name: id,
    nameRu,
    rootNodeId: 'root',
    nodes: [{ id: 'root', type: 'sequence', title: 'Root', children: [] }],
  };
}

function snapshot(aiBrain: UnitAiBrainBindingV1): ProductionUnitEditorSnapshotV1 {
  return {
    roleId: 'role-graph-test',
    unitId: 'unit-graph-test',
    titleRu: 'Тестовый боец',
    side: 'blue',
    unitType: 'infantry_squad',
    x: 0,
    y: 0,
    facingDegrees: 0,
    posture: 'standing',
    behaviorProfile: 'regular',
    speedCellsPerSecond: 0.45,
    viewAngleDegrees: 110,
    viewRangeCells: 16,
    soldierTraits: {
      resilience: 50,
      caution: 50,
      decisiveness: 50,
      discipline: 50,
      initiative: 50,
      tactics: 50,
      weaponSkill: 50,
    },
    soldierCondition: {
      fatigue: 0,
      morale: 50,
      confusion: 0,
      health: 100,
      attention: 50,
      view: 50,
      intuition: 50,
      speed: 50,
      stealth: 50,
    },
    stress: 0,
    suppression: 0,
    loadoutRef: null,
    loadedRounds: 0,
    reserveRoundsByAmmoDefinitionId: {},
    firstAidCharges: 0,
    bloodLoss: 0,
    aiBrain,
  };
}
