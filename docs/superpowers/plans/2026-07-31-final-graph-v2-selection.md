# Final Graph v2 Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the shared production fighter editor support explicit two-step Graph v2 selection without fallback and make the normal scene editor consume the current `SimulationState` installed graph catalog.

**Architecture:** Keep `ProductionUnitEditor` as the only DOM implementation. Treat the brain mode select as temporary UI state: switching to Graph v2 only enables the graph select, while only an exact graph option publishes a binding mutation. The normal workbench adapter will merge `getInstalledAiGraphCatalog(state)` with browser options through the existing exact-ID merge helper, preserving scene definitions as authoritative.

**Tech Stack:** TypeScript, DOM APIs, Vite SSR test runners, Node.js assertions, GitHub Actions.

## Global Constraints

- Continue only `worker/20260731-combat-lab-unified-editor` from verified HEAD `496489bf9c71395d5267cf29334d33f424fe1b6b`.
- Do not merge acceptance again; do not rebase, squash, force-push, or rewrite history.
- Do not modify `main`, `real-wargame-preview`, acceptance, or other worker branches.
- Do not create a deployment or merge PR #217.
- Preserve meter coordinates, technical details, map action bar, ×0.1 speed, 2×2 m grid, 120-second limit, seed modes, and batch diagnostics.
- No silent `graphs[0]` fallback and no temporary Graph mode persisted to experiment state.

---

### Task 1: Add the failing shared-editor and normal-scene DOM regression

**Files:**
- Create: `scripts/production_unit_editor_graph_selection_behavior_smoke.ts`
- Create: `scripts/production_unit_editor_graph_selection_behavior_smoke.mjs`
- Modify: `.github/workflows/combat-lab-program-editor-verify.yml`

**Interfaces:**
- Consumes: `createProductionUnitEditorSection(adapter)`, `installGameEditorWorkbench(debugPanel, state, onChanged)`, `createInitialState(map, units)`, `installAiGraphCatalog(state, catalog)`, `installUnitAiBrainBinding(unit, binding)`, `buildExportedScene(state)`.
- Produces: an exact-SHA workflow regression covering all Graph v2 selection transitions and normal-scene import/export.

- [ ] **Step 1: Write a real DOM test for manual → Graph v2**

Create a mutable snapshot adapter starting in manual mode with two graph options. Render the real shared editor, locate controls by labels `Управление` and `Граф Graph v2`, and assert:

```ts
assert.equal(graph.disabled, true);
mode.value = 'graph';
mode.dispatchEvent(new Event('change'));
assert.equal(mode.value, 'graph');
assert.equal(graph.disabled, false);
assert.equal(graph.value, '');
assert.equal(patches.length, 0);

graph.value = exactGraph.id;
graph.dispatchEvent(new Event('change'));
assert.equal(patches.length, 1);
assert.deepEqual(patches[0], {
  aiBrain: { schemaVersion: 1, kind: 'graph', graphId: exactGraph.id },
  aiGraphDefinition: exactGraph,
});
```

- [ ] **Step 2: Extend the test with graph → manual → graph**

Render from a valid graph binding, assert the exact option is selected, then:

```ts
mode.value = 'manual';
mode.dispatchEvent(new Event('change'));
assert.equal(patches.length, 1);
assert.deepEqual(patches[0], { aiBrain: { schemaVersion: 1, kind: 'manual' } });
assert.equal(graph.disabled, true);

mode.value = 'graph';
mode.dispatchEvent(new Event('change'));
assert.equal(graph.disabled, false);
assert.equal(patches.length, 1);

graph.value = secondGraph.id;
graph.dispatchEvent(new Event('change'));
assert.equal(patches.length, 2);
assert.equal(patches[1].aiBrain.graphId, secondGraph.id);
assert.equal(patches[1].aiGraphDefinition, secondGraph);
```

- [ ] **Step 3: Extend the test with a missing binding**

Render a graph binding whose ID is absent from available options. Assert the disabled diagnostic option contains the exact missing ID, no available graph is selected automatically, and explicit selection of a valid option publishes exactly one mutation.

- [ ] **Step 4: Extend the test with a normal imported scene and empty storage**

Install the fake DOM and an empty `MemoryStorage`, create a real `SimulationState` with one selected unit, install a custom scene catalog and exact graph binding, install the real `GameEditorWorkbench`, select the `Боец` tab, and assert the real shared editor contains `human title · exact graphId` selected. Change another field, then call `buildExportedScene(state)` and assert the custom graph definition and unit binding remain exact.

- [ ] **Step 5: Add the Vite runner and exact-SHA workflow step**

Bundle the TypeScript test through Vite SSR into a temporary directory, import it, and remove the directory in `finally`. Add:

```yaml
- name: Production Graph v2 selection behavior
  run: node scripts/production_unit_editor_graph_selection_behavior_smoke.mjs
```

before the existing unified fighter editor contracts.

- [ ] **Step 6: Verify RED**

Push the test-only exact SHA and require `Combat Lab Program Editor Verify` to fail in the new test because manual → graph leaves the graph select disabled or the normal workbench lacks the installed scene graph.

- [ ] **Step 7: Commit the regression files and workflow wiring**

Commit messages may be split logically, but the final test-only SHA must run the new test in Actions.

---

### Task 2: Fix the shared Graph v2 state machine

**Files:**
- Modify: `src/ui/ProductionUnitEditor.ts`
- Test: `scripts/production_unit_editor_graph_selection_behavior_smoke.ts`

**Interfaces:**
- Consumes: `ProductionUnitEditorAdapterV1.update(patch)` and `listGraphOptions()`.
- Produces: a two-step DOM state transition where mode selection is local and exact graph selection is the only graph mutation.

- [ ] **Step 1: Keep Graph v2 mode selected without mutating**

In the mode change handler, when `mode.value === 'graph'`:

```ts
graph.disabled = false;
if (snapshot.aiBrain.kind !== 'graph') graph.value = '';
adapter.onError?.('Выберите точный граф Graph v2.');
return;
```

Do not call `apply`, do not inspect `graphs[0]`, and do not revert the mode.

- [ ] **Step 2: Preserve exact current and missing graph diagnostics**

For valid graph bindings select the exact option. For missing bindings keep the disabled diagnostic option selected. When switching graph → manual, publish one manual patch and disable the graph select. When switching back to graph, enable the select without publishing a patch; explicit graph `change` publishes one exact graph patch.

- [ ] **Step 3: Verify GREEN for the focused DOM test**

Require the new exact-SHA workflow test to pass all manual/graph/missing assertions.

- [ ] **Step 4: Commit the minimal state-machine fix**

Commit only the shared editor production change required by the failing test.

---

### Task 3: Merge the installed normal-scene graph catalog and run the full gate

**Files:**
- Modify: `src/ui/GameEditorWorkbench.ts`
- Test: `scripts/production_unit_editor_graph_selection_behavior_smoke.ts`

**Interfaces:**
- Consumes: `getInstalledAiGraphCatalog(state)` and `listMergedAiGraphCatalogEntries(sceneCatalog)`.
- Produces: normal-editor graph options with scene-first exact-ID deduplication and browser options appended only for missing IDs.

- [ ] **Step 1: Replace the normal adapter catalog source**

Change imports and `listGraphOptions` to:

```ts
listGraphOptions: () => listMergedAiGraphCatalogEntries(
  getInstalledAiGraphCatalog(state),
).map((entry) => ({
  graphId: entry.graphId,
  titleRu: entry.titleRu,
  graph: entry.graph,
})),
```

Keep `addGraphToInstalledCatalog` for explicit graph mutations.

- [ ] **Step 2: Verify the normal-scene DOM and export round-trip**

Run the new test with empty storage and require the custom scene title/ID, selected exact binding, unrelated edit preservation, and exported catalog/binding to pass.

- [ ] **Step 3: Run the complete continuation gate**

Run every command listed in `COMBAT_LAB_EXECUTOR_1_FINAL_GRAPH_SELECTION_CONTINUATION_2026-07-31.md`, including the new test, all previous continuation regressions, runtime checks, TypeScript, build, and `git diff --check`.

- [ ] **Step 4: Verify exact-SHA Actions**

Require both `Combat Lab Program Editor Verify` and `Preview Policy` to complete with `SUCCESS` on the final exact HEAD.

- [ ] **Step 5: Verify repository safety and report**

Confirm acceptance remains the merge base, worker is behind by zero, PR #217 is open and unmerged, protected branches were not changed, and no deployment was created.