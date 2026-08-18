# Polygon Editors Visual Parity Wave 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the Polygon «Редакторы» surface materially closer to the accepted Interface Linkage v1 prototype while preserving authoritative product owners, data, commands, and persistence.

**Architecture:** Keep `CombatLabGameEditors` and each existing editor owner authoritative. `PolygonGlobalEditorParity` and the Polygon editor CSS are a presentation adapter only: they may regroup live DOM, build read-only summaries from live fields, and present existing commands differently, but they must not invent gameplay values, registries, persistence, or write paths.

**Tech Stack:** Vite 5, TypeScript 5, DOM/CSS, existing Combat Lab editor owners.

**Spec:** `docs/subprojects/polygon-html-to-product/ELEMENT_MIGRATION_WORKFLOW.md`; accepted prototype contract in `docs/subprojects/polygon-prototype/ACCEPTED_INTERFACE_LINKAGE_V1.md`.

## Global Constraints

- Base product branch remains `real-wargame-preview`; implementation stays on the existing feature branch.
- Do not transfer into `real-wargame-preview` or `main` without explicit user GO.
- Do not fabricate editor data, runtime state, reset behavior, CRUD, persistence, or owner APIs.
- `surfaceTypes` remains unavailable until a real product owner exists.
- «Данные бойца» and «Граф поведения» remain outside the Polygon global editor navigation; their product code is not deleted.
- Visual QA must use the real application and fresh screenshots for the exact tested SHA.

---

### Task 1: Shared shell and navigation geometry

**Files:**
- Modify: `src/combat-lab/game-editors/polygon-global-editor-feature-grid.css`
- Read-only dependency: `src/combat-lab/game-editors/combat-lab-game-editor-shell.css`

**Interfaces:**
- Consumes: existing `.polygon-shell-editors-portal`, `.combat-lab-game-editor-workspace`, nav and stage classes.
- Produces: prototype-matching desktop geometry without changing editor ownership.

- [ ] Add a failing source-contract assertion for stage-body inset, nav secondary mode text, and shared 238px inner profile column.
- [ ] Verify the assertion fails against commit `13a70b76bd5087b87c0767970eb378ba192a1b49`.
- [ ] Add presentation-only CSS overrides: remove the stage-body inset, hide `.combat-lab-game-editor-item-mode`, preserve 214px outer nav, and use 238px inner profile columns on desktop.
- [ ] Verify the source contract passes.

### Task 2: Shared editor chrome

**Files:**
- Modify: `src/combat-lab/game-editors/polygon-global-editor-feature-grid.css`

**Interfaces:**
- Consumes: parity classes already emitted by `PolygonGlobalEditorParity.ts`.
- Produces: common prototype-style header, tabs, summary, fields, metadata, savebar, management menu, and responsive behavior.

- [ ] Add failing assertions for common header/tabs/summary/savebar styling.
- [ ] Verify they fail on the old stylesheet.
- [ ] Implement shared CSS for `.polygon-editor-main-header`, `.polygon-editor-tabs`, `.polygon-editor-summary`, `.polygon-editor-summary-grid`, `.polygon-editor-summary-card`, `.polygon-editor-field-grid`, `.polygon-editor-savebar`, `.polygon-editor-management`.
- [ ] Verify assertions pass.

### Task 3: Route, tactical, attention, movement and condition presentation

**Files:**
- Modify: `src/combat-lab/game-editors/polygon-global-editor-feature-grid.css`
- Keep product owners and `PolygonGlobalEditorParity.ts` behavior unchanged unless a verified presentation-only DOM change is necessary.

**Interfaces:**
- Consumes: live summary and tab DOM already produced by parity adapter.
- Produces: accepted spacing, cards, two-column control grids, restrained service metadata, and fixed footer.

- [ ] Add failing per-editor presentation assertions.
- [ ] Implement per-editor CSS using live owner DOM only.
- [ ] Verify assertions pass.

### Task 4: Soldier archetype, perception and weapons presentation

**Files:**
- Modify: `src/combat-lab/game-editors/polygon-global-editor-feature-grid.css`
- Potential follow-up only if required: `src/combat-lab/game-editors/PolygonGlobalEditorParity.ts`

**Interfaces:**
- Consumes: existing live summary/tabs/catalogue DOM.
- Produces: compact overview hierarchy without hiding or replacing authoritative edit controls permanently.

- [ ] Improve archetype overview/cards and field sections.
- [ ] Compress perception flow and field cards to prototype proportions.
- [ ] Present weapon catalogue and technical metadata with prototype hierarchy where possible without creating a second owner state.

### Task 5: Environment and directional terrain

**Files:**
- Modify: `src/combat-lab/game-editors/polygon-global-editor-feature-grid.css`
- Potential future logic task: authoritative aggregate environment read model and live directional diagrams.

**Interfaces:**
- Consumes: current environment/directional owner DOM.
- Produces: best-effort prototype hierarchy from authoritative values only.

- [ ] Improve existing environment overview/list presentation.
- [ ] Style directional cards and existing controls; do not present placeholder text as if it were a live diagram.
- [ ] Record unresolved owner/read-model dependencies.

### Task 6: Verification and visual QA

**Files:**
- No product changes unless a verification failure identifies a regression caused by this branch.

**Interfaces:**
- Consumes: exact feature SHA after Tasks 1–5.
- Produces: readiness evidence separated from deployment and transfer state.

- [ ] Run focused TypeScript/editor smoke/build checks using the repository-supported remote-only route.
- [ ] Review the full base-to-head diff for fake data, owner duplication, and prohibited navigation entries.
- [ ] Capture fresh real-browser screenshots for all 11 prototype editor states and the exact product SHA when a suitable exact-SHA target is available.
- [ ] Keep `surfaceTypes` explicitly blocked/unavailable if no owner exists.
- [ ] Report exact branch, SHA, checks, visual evidence, blockers, and deployment/transfer status separately.
