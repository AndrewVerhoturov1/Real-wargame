# Grid Pathfinding v1 — Implementation Plan

Date: 2026-07-12

## 1. Pure RED contract

- Add pathfinding smoke runner.
- Require rotated occupancy, water/bridge behavior, terrain costs, wall gaps, no corner cutting, goal policy, determinism and 128×128 performance.
- Confirm only the new pathfinding context fails.

## 2. Pure GREEN modules

- Add `GridNavigation.ts`.
- Add deterministic binary-heap A* in `GridPathfinder.ts`.
- Keep both independent from simulation and AI.

## 3. Routed movement RED contract

- Require routed `MoveOrder` metadata.
- Require waypoint progression and final-only completion.
- Require shared player planning, legacy direct compatibility, successful replan and failed-replan stop.

## 4. Routed movement implementation

- Extend `MoveOrder`.
- Add `MoveOrderPlanning.ts` and `RoutedMoveOrders.ts`.
- Update `SimulationTick` to follow waypoints and check six upcoming cells.
- Preserve pressure preview and owner metadata.

## 5. AI integration

- Route `begin_move` through the shared planner.
- Require exact AI target cells.
- Publish path memory and unreachable reasons.
- Keep token-protected cleanup and reactive route status.

## 6. Russian diagnostics

- Restore route-status authoring controls.
- Show path state, waypoint count/index, requested/resolved target and reason.
- Add following, blocked and unreachable browser scenarios.

## 7. Review corrections

- Verify canonical object center convention.
- Verify no AI goal snapping.
- Verify player pressure preview.
- Verify no A* in frame-level or 60 ms reactive loops.

## 8. Documentation and generated context

- Add manual documents and journals.
- Update canonical `subproject.json`.
- Regenerate and commit generated status/index/current-state documents.
- Require Agent Docs Integrity success.

## 9. Exact-SHA verification

Require green core, policy, docs integrity and browser workflows. Download the Playwright log, confirm pass count and artifact SHA, and open PNG 27–30.

## 10. Preview integration

- Require feature ahead of preview and behind by zero.
- Fast-forward `real-wargame-preview` without force.
- Run and verify preview push workflows.
- Close temporary PRs as integrated.
- Do not modify `main`.
