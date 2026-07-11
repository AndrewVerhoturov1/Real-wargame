# Simple Front Zones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal three-band front-control model for the single-soldier AI: friendly territory on the left, a neutral zone in the middle, and enemy territory on the right.

**Architecture:** Keep the feature isolated from the simulation core by storing its runtime configuration in a `WeakMap<SimulationState, FrontZoneRuntimeState>`. Render only five HTML elements over the Pixi canvas (three translucent bands and two boundary lines), positioned from existing camera diagnostics. A dedicated UI installer adds the visibility toggle to the main `Вид` menu, two horizontal boundary sliders to the scene editor, and synchronizes territory values into each unit's AI graph memory.

**Tech Stack:** TypeScript, HTML/CSS, existing Vite/PixiJS application, Playwright.

## Global Constraints

- Work only from `real-wargame-preview`; never change `main` without explicit user `GO`.
- Preserve exactly two gameplay modes: `simulation` and `editor`.
- Do not add control points, territory capture, curved front lines, supply, encirclement, or continuous influence-map calculations.
- The front layer must use a constant number of display elements and must not rebuild Pixi graphics during pointer movement.
- The front layer must be visible by default and toggleable from the main `Вид` menu.
- The two boundaries must be editable horizontally and must never cross.
- Expose `territorySafety`, `territoryFriendly`, `territoryNeutral`, `territoryEnemy`, and `territoryKind` to the AI blackboard through existing per-unit AI graph memory.

---

### Task 1: Browser contract

**Files:**
- Create: `tests/front-zones.spec.ts`
- Modify: `.github/workflows/preview-screenshots.yml`

**Interfaces:**
- Consumes: existing Tactical Workspace menus and editor mode switch.
- Produces: a failing Playwright contract for the front-zone overlay, toggle, sliders, debug state, and screenshot.

- [ ] Add a Playwright scenario that checks the default visible state, toggles the layer, edits both X boundaries, selects the existing test soldier, and verifies neutral territory safety.
- [ ] Add the new spec to the screenshot workflow.
- [ ] Run the PR workflow and confirm the test fails because the front-zone controls do not yet exist.

### Task 2: Territory model and AI parameters

**Files:**
- Create: `src/core/front/FrontZoneState.ts`

**Interfaces:**
- Produces: `getFrontZoneState`, `setFrontZoneBoundaries`, `setFrontZoneVisibility`, `toggleFrontZoneVisibility`, and `getTerritoryAtPosition`.

- [ ] Implement default boundaries at one-third and two-thirds of the map width.
- [ ] Clamp boundaries to the map and enforce at least one neutral cell between them.
- [ ] Return stable territory values: friendly `80`, neutral `50`, enemy `20` safety.

### Task 3: Overlay and editor controls

**Files:**
- Create: `src/ui/FrontZoneControls.ts`
- Create: `src/front-zones.css`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: front-zone model, `window.__realWargameCameraDebug`, Tactical Workspace `Вид` panel, Game Editor workbench, selected units.
- Produces: three fixed-count HTML territory bands, two boundary lines, two editor sliders, a visibility button, selected-unit status, AI graph memory values, and `window.__realWargameFrontZones` diagnostics.

- [ ] Install the feature after Tactical Workspace creation and destroy it during `beforeunload`.
- [ ] Render the bands using camera X/Y/zoom without creating elements per cell.
- [ ] Add the main-menu visibility button and editor sliders.
- [ ] Synchronize territory values to unit AI memory at a low fixed frequency.
- [ ] Run build, smoke checks, and Playwright.

### Task 4: Visual verification and delivery

**Files:**
- Update documentation only if implementation details differ from this plan.

- [ ] Inspect the generated screenshot for correct band order, readable boundaries, and absence of layout damage.
- [ ] Confirm all required GitHub checks pass.
- [ ] Merge only into `real-wargame-preview`, never `main`.
- [ ] Report branch, commit/PR, checks, manual checks, branch cleanup status, and risks.
