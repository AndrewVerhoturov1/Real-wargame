# Cell Inspector Danger Explanation and Unit Magnet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Explain the selected soldier's Danger score at the hovered cell and briefly snap Ctrl-hover inspection to nearby visible soldiers.

**Architecture:** Add a focused O(unit count) hover-target resolver with hysteresis, integrate it into the existing cell-inspector controller, and expand Danger content using only the already prepared awareness field. Keep all hover work read-only and bounded.

**Tech Stack:** TypeScript, browser DOM events, existing simulation models, Node smoke-contract tests, Vite.

## Global Constraints

- Do not move the operating-system cursor.
- Do not reveal hidden enemy soldiers.
- Do not trigger field construction, pathfinding, workers, or full-map scans from hover.
- Acquire at 2.5 grid cells and release at 3.25 grid cells.
- Keep hover target selection allocation-free per unit.

---

### Task 1: Add regression contracts

**Files:**
- Modify: `scripts/cell_inspector_smoke.mjs`

**Interfaces:**
- Consumes: source text for the controller, content builder, and new target resolver.
- Produces: smoke assertions for magnetic hover and danger explanations.

- [ ] **Step 1: Write failing assertions**

Require a new `CellInspectorTarget.ts`, acquire/release constants, previous snap hysteresis, nearest eligible unit selection, selected-unit exclusion, visible-contact guard, danger contributor labels, and protected-threat lookup.

- [ ] **Step 2: Run the smoke test**

Run: `npm run cell-inspector:smoke`
Expected: FAIL because target resolver and expanded Danger explanation do not exist.

### Task 2: Implement magnetic hover target

**Files:**
- Create: `src/ui/CellInspectorTarget.ts`
- Modify: `src/ui/CellInspector.ts`

**Interfaces:**
- Produces: `resolveCellInspectorTarget(state, pointer, previousSnappedUnitId): CellInspectorTarget`.
- `CellInspectorTarget` contains `cellX`, `cellY`, `snappedUnitId`, and `snappedUnitLabel`.

- [ ] **Step 1: Implement eligibility**

Friendly non-selected soldiers are eligible. Enemy soldiers require a matching selected-unit perception contact with `sourceUnitId === unit.id`, `source === 'visual'`, and `visibleNow === true`.

- [ ] **Step 2: Implement nearest target with hysteresis**

Keep the previous snapped unit while inside the 3.25-cell release radius. Otherwise acquire the nearest eligible unit inside 2.5 cells. Fall back to the pointer cell.

- [ ] **Step 3: Integrate controller state**

Resolve the target before content construction, add/remove `data-snapped-unit-id`, and clear the snap on hide, pointer leave, Ctrl release, blur, editor mode, and teardown.

- [ ] **Step 4: Run smoke test**

Run: `npm run cell-inspector:smoke`
Expected: remaining failures only concern Danger explanation.

### Task 3: Expand Danger explanation

**Files:**
- Modify: `src/ui/CellInspectorContent.ts`

**Interfaces:**
- Consumes: `AwarenessWorkerFieldPayload`, selected unit tactical threats, and cell index.
- Produces: ranked plain-language reasons and contributor metrics without calculating a new field.

- [ ] **Step 1: Resolve the protected threat**

Use `protectedThreatIndex[index]` and `field.threatIds` to find the known threat metadata. Do not expose coordinates.

- [ ] **Step 2: Rank dominant causes**

Rank low protection, suppression, forward-slope exposure, uncertainty, and multiple-threat pressure. Include reverse-slope protection as a mitigating reason when significant.

- [ ] **Step 3: Add explanatory metrics**

Show danger, suppression, protection from known fire, exposure from slope, estimate reliability, and known-threat count.

- [ ] **Step 4: Run smoke test**

Run: `npm run cell-inspector:smoke`
Expected: PASS.

### Task 4: Verify and deploy

**Files:**
- No additional source files.

- [ ] **Step 1: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 2: Build focused production output**

Run: `npm run cell-inspector:smoke && npx vite build && npm run deployment-pages:smoke`
Expected: all commands pass and both HTML entry points exist.

- [ ] **Step 3: Deploy exact branch head to Vercel Preview**

Verify the deployment source SHA matches the branch head, wait for `READY`, and generate temporary shared URLs for `/` and `/ai-node-editor.html`.
