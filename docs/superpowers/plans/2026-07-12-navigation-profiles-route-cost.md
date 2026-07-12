# Navigation Profiles and Tactical Route Cost Implementation Plan

> Execute on `tmp/navigation-profiles-route-cost-20260712` only. Base SHA: `dc46706ade1af4c60ab6e2ca82f8b83c95f1da27`.

## Task 1 — TDD contracts and registry

- Add `navigation-profiles:smoke` wrapper and test first.
- Verify RED because profile modules do not exist.
- Implement profile types, built-ins, registry CRUD, migration, JSON import/export and browser storage adapter.
- Verify built-in creation, custom persistence, migration, reset and revision invalidation.

## Task 2 — Static and subjective dynamic cost fields

- Add route-cost cache tests first.
- Verify RED for absent cache/cost APIs.
- Extend navigation cells with forest/passable-object classification while keeping passability independent.
- Implement revision-keyed static typed arrays.
- Implement knowledge-revision-keyed dynamic typed arrays using only known threat memory.
- Keep exposure, territory and exact enemy-distance factors explicitly unavailable.
- Verify pointer reads do not rebuild fields and hidden layers retain resources.

## Task 3 — Profile-aware A* and detour bound

- Extend pathfinding smoke tests first for fast, stealth, retreat, direct, impassability, cost breakdown and maximum detour.
- Verify RED against current fixed-cost A*.
- Inject profile and tactical context into `findGridPath`.
- Preserve deterministic tie breaking and no corner cutting.
- Add cached shortest-passable baseline and deterministic baseline fallback when tactical detour exceeds the profile limit.
- Return route summary diagnostics while preserving legacy `cost`.

## Task 4 — Active profile resolver and MoveOrder integration

- Add resolver and movement integration tests first.
- Implement one priority resolver for debug, player mode, behavior mode, unit role and default.
- Add active profile/source fields to units.
- Pass resolved profiles and tactical context through player and AI order creation.
- Store route summary/profile/replan metadata on `MoveOrder` without per-cell reports.
- Preserve `PlayerCommand`, `UnitPlanState` and AI ownership rules.

## Task 5 — Controlled replanning

- Add pure replan-policy tests for blocked, profile revision, danger revision, cooldown, hysteresis and minimum improvement.
- Integrate blocked replan with profile metadata preservation.
- Add profile/danger replan checks that run only after revision/cooldown gates.
- Record replan count and bilingual reason.
- Verify stale AI cleanup cannot remove player routes.

## Task 6 — Profile editor

- Add persistent top-level editor tabs.
- Create a separate movement-profile editor module and CSS.
- Implement built-in/custom list actions, draft form, explicit save/cancel/reset and JSON import/export.
- Provide complete Russian labels/help by default and English canonical data.
- Ensure live trace updates do not recreate controls unnecessarily.

## Task 7 — Route-cost overlay

- Add runtime UI state and toggle controls independently from command/plan/route overlay.
- Implement `PixiRouteCostOverlayRenderer` with persistent canvas textures/sprites and typed-array hover reads.
- Add stable semantic legend and cross-hatched impassable cells.
- Render under command/plan/route and units.
- Add selected-unit route summary and detailed hover reasons.
- Ensure renderer imports no pathfinder and never starts A*.

## Task 8 — Performance and regression tests

- Add diagnostics assertions for static/dynamic build counts, texture uploads, hover reads and full-map scans.
- Prove mouse movement changes only `hoverReadCount`.
- Prove hiding/showing does not destroy/recreate resources.
- Run existing pathfinding, routed movement, AI bridge, route status, runtime, command-plan-route and optimization smokes.
- Run production build and docs checks.

## Task 9 — Documentation

- Add `NAVIGATION_PROFILES_V1.md`, `TACTICAL_ROUTE_COST_V1.md`, `ROUTE_COST_OVERLAY_V1.md`.
- Update `subproject.json` as source of truth, then regenerate generated status/handoff/journal files through `npm run docs:sync`.
- Document implemented and unavailable factors honestly.

## Task 10 — Visual QA preparation only

- Add/update a focused Playwright scenario for normal, fast, stealth and retreat.
- Define PNG evidence for overlay off/on, selected profile, command/plan/route colors, legend, tooltip, route summary, zoom, pan and pointer diagnostics.
- Do not execute the browser workflow without explicit user approval.
- After all non-browser checks, ask exactly: `Визуальная проверка подготовлена. Запустить её сейчас?`

## Final report

Report branch, base SHA, head SHA, isolated transfer path, implemented vs prepared-only behavior, changed files, exact checks, cache-counter evidence, visual QA state, unverified items, manual checks, known limits, and confirm `main` and `real-wargame-preview` were not touched.